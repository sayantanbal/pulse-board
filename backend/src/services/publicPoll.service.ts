import type { PollWire, SubmitPublicResponseBody } from "@pulse-board/shared";
import { ERROR_CODES } from "@pulse-board/shared";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { COOKIE_ACCESS } from "../config/cookies.js";
import { env } from "../config/env.js";
import { AggregateModel } from "../domain/aggregate.model.js";
import type { PollDoc } from "../domain/poll.model.js";
import { PollModel } from "../domain/poll.model.js";
import { ResponseModel } from "../domain/response.model.js";
import { UserModel } from "../domain/user.model.js";
import { sha256Hex } from "../lib/tokenHash.js";
import { HttpError } from "../policies/httpError.js";
import { runPollStatusCheck } from "../domain/pollStatus.js";
import {
  emitResponseDeltaStub,
  emitResponseSnapshot,
} from "./analyticsRealtime.service.js";
import {
  getPollSnapshotForSocket,
  getPublishedPollSummary,
  recomputeAggregates,
} from "./analytics.service.js";

type AccessJwtPayload = { sub: string };

type PublicPollResult = {
  poll: PollWire;
  summary?: {
    totalCompleteResponses: number;
    questions: Array<{
      questionId: string;
      options: Array<{
        optionId: string;
        count: number;
        percentage: number;
      }>;
    }>;
  };
};

function toPollWire(doc: PollDoc): PollWire {
  return {
    _id: doc._id.toHexString(),
    ownerId: doc.ownerId.toHexString(),
    title: doc.title,
    description: doc.description,
    expiresAt: doc.expiresAt,
    responseMode: doc.responseMode,
    status: doc.status,
    allowCreatorResponses: doc.allowCreatorResponses,
    allowResponseChanges: doc.allowResponseChanges,
    deletedAt: doc.deletedAt ?? null,
    questions: doc.questions.map((q) => ({
      _id: q._id.toHexString(),
      prompt: q.prompt,
      isRequired: q.isRequired,
      order: q.order,
      options: q.options.map((o) => ({
        _id: o._id.toHexString(),
        text: o.text,
        order: o.order,
      })),
    })),
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

async function findPublicPollOrThrow(pollId: string): Promise<PollDoc> {
  const poll = await PollModel.findOne({
    _id: new mongoose.Types.ObjectId(pollId),
    deletedAt: null,
  });

  if (!poll) {
    throw new HttpError(404, ERROR_CODES.NOT_FOUND, "Poll not found");
  }

  const nextStatus = runPollStatusCheck(poll);
  if (nextStatus !== poll.status) {
    poll.status = nextStatus;
    await poll.save();
  }

  return poll;
}

async function getPublishedSummary(poll: PollDoc): Promise<PublicPollResult["summary"]> {
  const published = await getPublishedPollSummary(poll._id.toHexString());
  return {
    totalCompleteResponses: published.summary.totalCompleteResponses,
    questions: published.summary.questions.map((q) => ({
      questionId: q.questionId,
      options: q.options.map((o) => ({
        optionId: o.optionId,
        count: o.count,
        percentage: o.percentage,
      })),
    })),
  };
}

function validateAnswersAgainstPoll(
  poll: PollDoc,
  body: SubmitPublicResponseBody,
): Array<{ questionId: mongoose.Types.ObjectId; optionId: mongoose.Types.ObjectId }> {
  const seenQuestionIds = new Set<string>();
  const questionMap = new Map(
    poll.questions.map((q) => [
      q._id.toHexString(),
      new Set(q.options.map((o) => o._id.toHexString())),
    ]),
  );

  const answers = body.answers.map((a) => {
    if (seenQuestionIds.has(a.questionId)) {
      throw new HttpError(
        400,
        ERROR_CODES.VALIDATION_FAILED,
        "Duplicate answers for the same question are not allowed",
      );
    }
    seenQuestionIds.add(a.questionId);

    const allowedOptions = questionMap.get(a.questionId);
    if (!allowedOptions || !allowedOptions.has(a.optionId)) {
      throw new HttpError(
        400,
        ERROR_CODES.VALIDATION_FAILED,
        "Answer contains unknown question or option",
      );
    }

    return {
      questionId: new mongoose.Types.ObjectId(a.questionId),
      optionId: new mongoose.Types.ObjectId(a.optionId),
    };
  });

  if (body.status === "complete") {
    for (const question of poll.questions) {
      if (!question.isRequired) {
        continue;
      }
      const hasAnswer = seenQuestionIds.has(question._id.toHexString());
      if (!hasAnswer) {
        throw new HttpError(
          400,
          ERROR_CODES.VALIDATION_FAILED,
          "Missing answer for required question",
        );
      }
    }
  }

  return answers;
}

async function resolveRespondentIdIfRequired(
  responseMode: PollDoc["responseMode"],
  accessToken: unknown,
): Promise<mongoose.Types.ObjectId | null> {
  if (responseMode === "anonymous") {
    return null;
  }

  if (typeof accessToken !== "string" || !accessToken.length) {
    throw new HttpError(401, ERROR_CODES.UNAUTHORIZED, "Unauthorized");
  }

  let decoded: AccessJwtPayload;
  try {
    decoded = jwt.verify(accessToken, env.JWT_ACCESS_SECRET, {
      algorithms: ["HS256"],
    }) as AccessJwtPayload;
  } catch {
    throw new HttpError(401, ERROR_CODES.UNAUTHORIZED, "Unauthorized");
  }

  const user = await UserModel.findById(decoded.sub).select("_id");
  if (!user) {
    throw new HttpError(401, ERROR_CODES.UNAUTHORIZED, "Unauthorized");
  }

  return user._id;
}

export async function getPublicPoll(pollId: string): Promise<PublicPollResult> {
  const poll = await findPublicPollOrThrow(pollId);

  if (poll.status === "draft") {
    throw new HttpError(404, ERROR_CODES.NOT_FOUND, "Poll not found");
  }

  if (poll.status === "expired") {
    throw new HttpError(410, ERROR_CODES.GONE, "Poll has expired");
  }

  if (poll.status === "published") {
    return {
      poll: toPollWire(poll),
      summary: await getPublishedSummary(poll),
    };
  }

  return { poll: toPollWire(poll) };
}

export async function submitPublicPollResponse(input: {
  pollId: string;
  body: SubmitPublicResponseBody;
  ip: string;
  userAgent: string;
  cookies: Record<string, unknown>;
}) {
  const poll = await findPublicPollOrThrow(input.pollId);

  if (poll.status === "draft") {
    throw new HttpError(404, ERROR_CODES.NOT_FOUND, "Poll not found");
  }

  if (poll.status === "published") {
    throw new HttpError(
      409,
      ERROR_CODES.CONFLICT,
      "Poll is already published; responses are closed",
    );
  }
  if (poll.status === "expired") {
    throw new HttpError(410, ERROR_CODES.GONE, "Poll has expired");
  }

  const answers = validateAnswersAgainstPoll(poll, input.body);
  const ipHash = sha256Hex(`${input.ip}:${input.userAgent}`);

  const respondentId = await resolveRespondentIdIfRequired(
    poll.responseMode,
    input.cookies[COOKIE_ACCESS],
  );

  if (respondentId && respondentId.equals(poll.ownerId) && !poll.allowCreatorResponses) {
    throw new HttpError(
      403,
      ERROR_CODES.FORBIDDEN,
      "Creator is not allowed to respond to this poll",
    );
  }

  let existingResponse = null;
  if (poll.responseMode === "anonymous") {
    const dedupWindowStart = new Date(Date.now() - 24 * 60 * 60 * 1000);
    existingResponse = await ResponseModel.findOne({
      pollId: poll._id,
      ipHash,
      createdAt: { $gte: dedupWindowStart },
    });
  } else if (respondentId) {
    existingResponse = await ResponseModel.findOne({
      pollId: poll._id,
      respondentId,
    });
  }

  if (existingResponse && !poll.allowResponseChanges) {
    throw new HttpError(
      409,
      ERROR_CODES.CONFLICT,
      "Duplicate response detected for this session",
    );
  }

  const deltas: Array<{
    questionId: string;
    optionId: string;
    newCount: number;
  }> = [];
  let totalResponses = 0;
  let createdId = "";
  const createdStatus = input.body.status;

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      if (existingResponse) {
        if (existingResponse.status === "complete") {
          for (const answer of existingResponse.answers) {
            await AggregateModel.findOneAndUpdate(
              {
                pollId: poll._id,
                questionId: answer.questionId,
                optionId: answer.optionId,
              },
              { $inc: { count: -1 } },
              { session },
            );
          }
        }
        await existingResponse.deleteOne({ session });
      }

      const created = await ResponseModel.create(
        [
          {
            pollId: poll._id,
            respondentId,
            status: input.body.status,
            ipHash,
            answers,
          },
        ],
        { session },
      );

      const createdDoc = created[0];
      if (!createdDoc) {
        throw new HttpError(500, ERROR_CODES.INTERNAL, "Internal Server Error");
      }
      createdId = createdDoc._id.toHexString();

      if (input.body.status === "complete") {
        for (const answer of answers) {
          const updated = await AggregateModel.findOneAndUpdate(
            {
              pollId: poll._id,
              questionId: answer.questionId,
              optionId: answer.optionId,
            },
            { $inc: { count: 1 } },
            {
              upsert: true,
              new: true,
              setDefaultsOnInsert: true,
              session,
            },
          );

          if (!updated) {
            throw new HttpError(500, ERROR_CODES.INTERNAL, "Internal Server Error");
          }

          deltas.push({
            questionId: answer.questionId.toHexString(),
            optionId: answer.optionId.toHexString(),
            newCount: updated.count,
          });
        }

        totalResponses = await ResponseModel.countDocuments({
          pollId: poll._id,
          status: "complete",
        }).session(session);
      }
    });
  } catch (e) {
    if (createdStatus === "complete") {
      await recomputeAggregates(poll._id.toHexString());
      const snapshot = await getPollSnapshotForSocket(poll._id.toHexString());
      emitResponseSnapshot(snapshot);
    }
    throw e;
  } finally {
    await session.endSession();
  }

  if (createdStatus === "complete") {
    if (existingResponse && existingResponse.status === "complete") {
      const snapshot = await getPollSnapshotForSocket(poll._id.toHexString());
      emitResponseSnapshot(snapshot);
    } else {
      for (const delta of deltas) {
        emitResponseDeltaStub({
          pollId: poll._id.toHexString(),
          questionId: delta.questionId,
          optionId: delta.optionId,
          newCount: delta.newCount,
          totalResponses,
        });
      }
    }
  }

  return {
    responseId: createdId,
    status: createdStatus,
  };
}
