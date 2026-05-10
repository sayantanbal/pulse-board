import { ERROR_CODES } from "@pulse-board/shared";
import mongoose from "mongoose";
import type { PollDoc } from "../domain/poll.model.js";
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

async function buildResponseTimeSeries(pollId: string): Promise<ResponseTimeSeriesPoint[]> {
  const pollObjectId = new mongoose.Types.ObjectId(pollId);

  const rows = await ResponseModel.aggregate<{
    _id: { bucket: Date; status: "partial" | "complete" };
    count: number;
  }>([
    { $match: { pollId: pollObjectId } },
    {
      $group: {
        _id: {
          bucket: { $dateTrunc: { date: "$createdAt", unit: "day" } },
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
    const bucket = startOfUtcDay(new Date(row._id.bucket));
    const key = bucket.toISOString();
    const current = bucketCounts.get(key) ?? { complete: 0, partial: 0 };

    if (row._id.status === "complete") {
      current.complete += row.count;
    } else {
      current.partial += row.count;
    }

    bucketCounts.set(key, current);
  }

  const firstBucket = startOfUtcDay(new Date(rows[0]._id.bucket));
  const lastBucket = startOfUtcDay(new Date());

  const series: ResponseTimeSeriesPoint[] = [];
  for (let cursor = firstBucket; cursor <= lastBucket; cursor = addUtcDays(cursor, 1)) {
    const key = cursor.toISOString();
    const current = bucketCounts.get(key) ?? { complete: 0, partial: 0 };
    const total = current.complete + current.partial;
    series.push({
      bucket: cursor,
      totalResponses: total,
      totalCompleteResponses: current.complete,
      totalPartialResponses: current.partial,
    });
  }

  return series;
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

export async function getOwnerPollAnalytics(ownerId: string, pollId: string) {
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
    timeSeries: await buildResponseTimeSeries(poll._id.toHexString()),
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
