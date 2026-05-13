import { ERROR_CODES } from "@pulse-board/shared";
import type { AnalyticsPollQuery } from "@pulse-board/shared";
import { DateTime } from "luxon";
import mongoose from "mongoose";
import type { PollDoc, PollOptionSub, PollQuestionSub } from "../domain/poll.model.js";
import type { AnswerSub } from "../domain/response.model.js";
import { AggregateModel } from "../domain/aggregate.model.js";
import { PollModel } from "../domain/poll.model.js";
import { ResponseModel } from "../domain/response.model.js";
import { runPollStatusCheck } from "../domain/pollStatus.js";
import { HttpError } from "../policies/httpError.js";

type PollAnalyticsSummary = {
  totalResponses: number;
  totalCompleteResponses: number;
  totalPartialResponses: number;
  completionRate: number;
  dropOffRate: number;
  questions: Array<{
    questionId: string;
    prompt: string;
    dropOffCount?: number;
    options: Array<{
      optionId: string;
      text: string;
      count: number;
      percentage: number;
    }>;
  }>;
};

type ResponseTimeSeriesPoint = {
  bucket: Date;
  totalResponses: number;
  totalCompleteResponses: number;
  totalPartialResponses: number;
};

export type AnalyticsSummary = PollAnalyticsSummary;

function percentage(numerator: number, denominator: number): number {
  if (denominator <= 0) {
    return 0;
  }
  return (numerator / denominator) * 100;
}

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addUtcDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

/** UTC instants for each bucket boundary from start through end (inclusive), aligned to Mongo $dateTrunc with the same unit and timezone. */
function eachBucketBetween(
  start: Date,
  end: Date,
  unit: "day" | "hour",
  timeZone: string,
): Date[] {
  if (timeZone === "UTC" && unit === "day") {
    const series: Date[] = [];
    for (let cursor = startOfUtcDay(start); cursor <= startOfUtcDay(end); cursor = addUtcDays(cursor, 1)) {
      series.push(cursor);
    }
    return series;
  }

  if (timeZone === "UTC" && unit === "hour") {
    const hourMs = 60 * 60 * 1000;
    const first = new Date(Math.floor(start.getTime() / hourMs) * hourMs);
    const last = new Date(Math.floor(end.getTime() / hourMs) * hourMs);
    const series: Date[] = [];
    for (let t = first.getTime(); t <= last.getTime(); t += hourMs) {
      series.push(new Date(t));
    }
    return series;
  }

  let cur = DateTime.fromJSDate(start, { zone: "utc" }).setZone(timeZone);
  cur = unit === "day" ? cur.startOf("day") : cur.startOf("hour");
  const endDt = DateTime.fromJSDate(end, { zone: "utc" }).setZone(timeZone);
  const endAligned = unit === "day" ? endDt.startOf("day") : endDt.startOf("hour");

  const out: Date[] = [];
  while (cur <= endAligned) {
    out.push(cur.toUTC().toJSDate());
    cur = cur.plus(unit === "day" ? { days: 1 } : { hours: 1 });
  }
  return out;
}

async function aggregateNowBucket(
  unit: "day" | "hour",
  timeZone: string,
): Promise<Date> {
  const trunc: Record<string, unknown> = {
    date: "$$NOW",
    unit,
    timezone: timeZone,
  };
  const [doc] = await ResponseModel.aggregate<{ b: Date | null }>([
    { $project: { b: { $dateTrunc: trunc } } },
    { $limit: 1 },
  ]);
  if (doc?.b) {
    return new Date(doc.b);
  }
  return new Date();
}

async function buildResponseTimeSeries(
  pollId: string,
  seriesQuery: Pick<AnalyticsPollQuery, "seriesBucket" | "seriesTimezone">,
): Promise<ResponseTimeSeriesPoint[]> {
  const pollObjectId = new mongoose.Types.ObjectId(pollId);
  const unit = seriesQuery.seriesBucket;
  const timeZone = seriesQuery.seriesTimezone;

  const trunc: Record<string, unknown> = {
    date: "$createdAt",
    unit,
    timezone: timeZone,
  };

  const rows = await ResponseModel.aggregate<{
    _id: { bucket: Date; status: "partial" | "complete" };
    count: number;
  }>([
    { $match: { pollId: pollObjectId } },
    {
      $group: {
        _id: {
          bucket: { $dateTrunc: trunc },
          status: "$status",
        },
        count: { $sum: 1 },
      },
    },
    { $sort: { "_id.bucket": 1 } },
  ]);

  if (!rows.length) {
    return [];
  }

  const bucketCounts = new Map<string, { complete: number; partial: number }>();

  for (const row of rows) {
    const bucket = new Date(row._id.bucket);
    const key = bucket.toISOString();
    const current = bucketCounts.get(key) ?? { complete: 0, partial: 0 };

    if (row._id.status === "complete") {
      current.complete += row.count;
    } else {
      current.partial += row.count;
    }

    bucketCounts.set(key, current);
  }

  const firstBucket = new Date(rows[0]._id.bucket);
  let lastDataBucket = firstBucket;
  for (const row of rows) {
    const b = new Date(row._id.bucket);
    if (b > lastDataBucket) {
      lastDataBucket = b;
    }
  }
  const nowBucket = await aggregateNowBucket(unit, timeZone);
  const lastBucket = lastDataBucket > nowBucket ? lastDataBucket : nowBucket;

  const fillBuckets = eachBucketBetween(firstBucket, lastBucket, unit, timeZone);

  const points: ResponseTimeSeriesPoint[] = [];
  for (const bucket of fillBuckets) {
    const key = bucket.toISOString();
    const current = bucketCounts.get(key) ?? { complete: 0, partial: 0 };
    const total = current.complete + current.partial;
    points.push({
      bucket,
      totalResponses: total,
      totalCompleteResponses: current.complete,
      totalPartialResponses: current.partial,
    });
  }

  return points;
}

async function applyLazyStatusUpdate(poll: PollDoc): Promise<void> {
  const next = runPollStatusCheck(poll);
  if (next !== poll.status) {
    poll.status = next;
    await poll.save();
  }
}

async function buildSummaryFromAggregates(
  poll: PollDoc,
  includeDropOff: boolean,
): Promise<PollAnalyticsSummary> {
  const [aggregateDocs, totalResponses, totalCompleteResponses, totalPartialResponses] =
    await Promise.all([
      AggregateModel.find({ pollId: poll._id }).select("questionId optionId count"),
      ResponseModel.countDocuments({ pollId: poll._id }),
      ResponseModel.countDocuments({ pollId: poll._id, status: "complete" }),
      ResponseModel.countDocuments({ pollId: poll._id, status: "partial" }),
    ]);

  const aggregateMap = new Map<string, number>();
  for (const a of aggregateDocs) {
    const key = `${a.questionId.toHexString()}:${a.optionId.toHexString()}`;
    aggregateMap.set(key, a.count);
  }

  const questionsSorted = [...poll.questions].sort((a, b) => a.order - b.order);
  let dropOffByQuestion = new Map<string, number>();

  if (includeDropOff) {
    const partialResponses = await ResponseModel.find({
      pollId: poll._id,
      status: "partial",
    }).select("answers");

    dropOffByQuestion = new Map(questionsSorted.map((q) => [q._id.toHexString(), 0]));

    for (const response of partialResponses) {
      if (!response.answers.length) {
        for (const q of questionsSorted) {
          dropOffByQuestion.set(
            q._id.toHexString(),
            (dropOffByQuestion.get(q._id.toHexString()) ?? 0) + 1,
          );
        }
        continue;
      }

      const answeredQuestionIds = new Set(
        (response.answers as Array<{ questionId: mongoose.Types.ObjectId }>).map(
          (a) => a.questionId.toHexString(),
        ),
      );

      for (const q of questionsSorted) {
        if (!answeredQuestionIds.has(q._id.toHexString())) {
          dropOffByQuestion.set(
            q._id.toHexString(),
            (dropOffByQuestion.get(q._id.toHexString()) ?? 0) + 1,
          );
        }
      }
    }
  }

  return {
    totalResponses,
    totalCompleteResponses,
    totalPartialResponses,
    completionRate: percentage(totalCompleteResponses, totalResponses),
    dropOffRate: percentage(totalPartialResponses, totalResponses),
    questions: questionsSorted.map((q) => ({
      questionId: q._id.toHexString(),
      prompt: q.prompt,
      dropOffCount: includeDropOff
        ? (dropOffByQuestion.get(q._id.toHexString()) ?? 0)
        : undefined,
      options: q.options
        .map((o) => {
          const key = `${q._id.toHexString()}:${o._id.toHexString()}`;
          const count = aggregateMap.get(key) ?? 0;
          return {
            optionId: o._id.toHexString(),
            text: o.text,
            count,
            percentage: percentage(count, totalCompleteResponses),
          };
        }),
    })),
  };
}

export async function recomputeAggregates(pollId: string): Promise<void> {
  const pollObjectId = new mongoose.Types.ObjectId(pollId);

  const grouped = await ResponseModel.aggregate<{
    _id: { questionId: mongoose.Types.ObjectId; optionId: mongoose.Types.ObjectId };
    count: number;
  }>([
    { $match: { pollId: pollObjectId, status: "complete" } },
    { $unwind: "$answers" },
    {
      $group: {
        _id: {
          questionId: "$answers.questionId",
          optionId: "$answers.optionId",
        },
        count: { $sum: 1 },
      },
    },
  ]);

  await AggregateModel.deleteMany({ pollId: pollObjectId });

  if (!grouped.length) {
    return;
  }

  await AggregateModel.insertMany(
    grouped.map((g) => ({
      pollId: pollObjectId,
      questionId: g._id.questionId,
      optionId: g._id.optionId,
      count: g.count,
    })),
  );
}

async function findPollByIdOrThrow(pollId: string): Promise<PollDoc> {
  const poll = await PollModel.findOne({
    _id: new mongoose.Types.ObjectId(pollId),
    deletedAt: null,
  });

  if (!poll) {
    throw new HttpError(404, ERROR_CODES.NOT_FOUND, "Poll not found");
  }
  await applyLazyStatusUpdate(poll);
  return poll;
}

export async function getOwnerPollAnalytics(
  ownerId: string,
  pollId: string,
  seriesQuery: Pick<AnalyticsPollQuery, "seriesBucket" | "seriesTimezone">,
) {
  const poll = await PollModel.findOne({
    _id: new mongoose.Types.ObjectId(pollId),
    ownerId: new mongoose.Types.ObjectId(ownerId),
    deletedAt: null,
  });

  if (!poll) {
    throw new HttpError(404, ERROR_CODES.NOT_FOUND, "Poll not found");
  }
  await applyLazyStatusUpdate(poll);

  return {
    pollId: poll._id.toHexString(),
    status: poll.status,
    summary: await buildSummaryFromAggregates(poll, true),
    timeSeries: await buildResponseTimeSeries(poll._id.toHexString(), seriesQuery),
    seriesBucket: seriesQuery.seriesBucket,
    seriesTimezone: seriesQuery.seriesTimezone,
  };
}

export async function getPublishedPollSummary(pollId: string) {
  const poll = await findPollByIdOrThrow(pollId);
  if (poll.status !== "published") {
    throw new HttpError(
      404,
      ERROR_CODES.NOT_FOUND,
      "Summary is available only after publishing",
    );
  }
  return {
    pollId: poll._id.toHexString(),
    status: poll.status,
    summary: await buildSummaryFromAggregates(poll, false),
  };
}

export async function getPollSnapshotForSocket(pollId: string) {
  const poll = await findPollByIdOrThrow(pollId);
  return getPollSnapshotForPollDoc(poll);
}

/** Aggregate counts for socket payloads and public live view (no drop-off). */
export async function getPollSnapshotForPollDoc(poll: PollDoc) {
  const summary = await buildSummaryFromAggregates(poll, false);
  return {
    pollId: poll._id.toHexString(),
    totalResponses: summary.totalCompleteResponses,
    questions: summary.questions.map((q) => ({
      questionId: q.questionId,
      options: q.options.map((o) => ({
        optionId: o.optionId,
        count: o.count,
        percentage: o.percentage,
      })),
    })),
  };
}

export async function getPollLeaderboard(ownerId: string, pollId: string) {
  const poll = await PollModel.findOne({
    _id: new mongoose.Types.ObjectId(pollId),
    ownerId: new mongoose.Types.ObjectId(ownerId),
    deletedAt: null,
  });

  if (!poll) {
    throw new HttpError(404, ERROR_CODES.NOT_FOUND, "Poll not found");
  }

  const isAuthenticated = poll.responseMode === "authenticated";
  const scoredQuestionHexIds = new Set(
    poll.questions
      .filter((q: PollQuestionSub) =>
        q.options.some((o: PollOptionSub) => o.isCorrect === true),
      )
      .map((q: PollQuestionSub) => q._id.toHexString()),
  );
  const useAccuracy = scoredQuestionHexIds.size > 0;

  const responses = await ResponseModel.find({
    pollId: poll._id,
    status: "complete",
  })
    .sort({ createdAt: 1 })
    .limit(300)
    .select("respondentId createdAt answers");

  if (!responses.length) {
    return { isAuthenticated, entries: [] };
  }

  function countCorrect(answers: AnswerSub[]): number {
    let c = 0;
    for (const qid of scoredQuestionHexIds) {
      const ans = answers.find((a) => a.questionId.toHexString() === qid);
      if (!ans) {
        continue;
      }
      const q = poll.questions.find((x: PollQuestionSub) => x._id.toHexString() === qid);
      const picked = q?.options.find((o: PollOptionSub) => o._id.equals(ans.optionId));
      if (picked?.isCorrect === true) {
        c += 1;
      }
    }
    return c;
  }

  const totalForSpeed = responses.length;

  const scoredRows = responses.map((r, i) => {
    const speedScore = Math.round(((totalForSpeed - i) / totalForSpeed) * 500);
    const denom = scoredQuestionHexIds.size;
    const correct = countCorrect(r.answers);
    const composite =
      useAccuracy && denom > 0
        ? Math.round((correct / denom) * 500 * 0.65 + speedScore * 0.35)
        : speedScore;
    return { response: r, composite };
  });

  scoredRows.sort((a, b) => {
    if (b.composite !== a.composite) {
      return b.composite - a.composite;
    }
    return a.response.createdAt.getTime() - b.response.createdAt.getTime();
  });

  const top = scoredRows.slice(0, 10);

  const nameMap = new Map<string, string>();
  if (isAuthenticated) {
    const { UserModel } = await import("../domain/user.model.js");
    const respondentIds = top
      .map((row) => row.response.respondentId)
      .filter((id): id is mongoose.Types.ObjectId => id != null);

    if (respondentIds.length) {
      const users = await UserModel.find({ _id: { $in: respondentIds } }).select("email");
      for (const u of users) {
        nameMap.set(u._id.toHexString(), u.email.split("@")[0] ?? u.email);
      }
    }
  }

  const entries = top.map((row, i) => {
    const rank = i + 1;
    const score = row.composite;
    let name: string;
    if (isAuthenticated && row.response.respondentId) {
      name =
        nameMap.get(row.response.respondentId.toHexString()) ?? `User #${rank}`;
    } else {
      name = `Anonymous #${rank}`;
    }
    return { rank, name, score };
  });

  return { isAuthenticated, entries };
}

