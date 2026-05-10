import type { CreatePollBody, PollWire, UpdatePollBody } from "@pulse-board/shared";
import { ERROR_CODES } from "@pulse-board/shared";
import type { PollDoc } from "../domain/poll.model.js";
import { runPollStatusCheck } from "../domain/pollStatus.js";
import { HttpError } from "../policies/httpError.js";
import {
  createPollDoc,
  findOwnerPollById,
  hasAnyResponse,
  listOwnerPolls,
} from "../repositories/poll.repository.js";

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

async function applyLazyStatusUpdate(doc: PollDoc): Promise<void> {
  const next = runPollStatusCheck(doc);
  if (next !== doc.status) {
    doc.status = next;
    await doc.save();
  }
}

async function assertMutablePoll(ownerId: string, pollId: string): Promise<PollDoc> {
  const poll = await findOwnerPollById(ownerId, pollId);
  if (!poll) {
    throw new HttpError(404, ERROR_CODES.NOT_FOUND, "Poll not found");
  }

  await applyLazyStatusUpdate(poll);

  if (poll.status === "published") {
    throw new HttpError(
      409,
      ERROR_CODES.CONFLICT,
      "Published polls cannot be modified",
    );
  }

  const hasResponses = await hasAnyResponse(pollId);
  if (hasResponses) {
    throw new HttpError(
      409,
      ERROR_CODES.CONFLICT,
      "Poll cannot be modified after first response",
    );
  }

  return poll;
}

export async function createPoll(ownerId: string, body: CreatePollBody) {
  const poll = await createPollDoc({
    ownerId,
    title: body.title,
    description: body.description,
    expiresAt: body.expiresAt,
    responseMode: body.responseMode,
    status: body.status ?? "active",
    allowCreatorResponses: body.allowCreatorResponses,
    allowResponseChanges: body.allowResponseChanges,
    questions: body.questions,
  });
  await applyLazyStatusUpdate(poll);
  return toPollWire(poll);
}

export async function getOwnerPolls(ownerId: string) {
  const polls = await listOwnerPolls(ownerId);
  for (const poll of polls) {
    await applyLazyStatusUpdate(poll);
  }
  return polls.map(toPollWire);
}

export async function getOwnerPollById(ownerId: string, pollId: string) {
  const poll = await findOwnerPollById(ownerId, pollId);
  if (!poll) {
    throw new HttpError(404, ERROR_CODES.NOT_FOUND, "Poll not found");
  }

  await applyLazyStatusUpdate(poll);
  return toPollWire(poll);
}

export async function updateOwnerPoll(
  ownerId: string,
  pollId: string,
  body: UpdatePollBody,
) {
  const poll = await assertMutablePoll(ownerId, pollId);

  if (body.title !== undefined) {
    poll.title = body.title;
  }
  if (body.description !== undefined) {
    poll.description = body.description ?? undefined;
  }
  if (body.expiresAt !== undefined) {
    poll.expiresAt = body.expiresAt;
  }
  if (body.responseMode !== undefined) {
    poll.responseMode = body.responseMode;
  }
  if (body.status !== undefined) {
    if (body.status === "active" && poll.status === "draft") {
      poll.status = "active";
    } else if (body.status === "draft" && poll.status !== "draft") {
      throw new HttpError(
        409,
        ERROR_CODES.CONFLICT,
        "Only draft polls can remain in draft status",
      );
    }
  }
  if (body.allowCreatorResponses !== undefined) {
    poll.allowCreatorResponses = body.allowCreatorResponses;
  }
  if (body.allowResponseChanges !== undefined) {
    poll.allowResponseChanges = body.allowResponseChanges;
  }
  if (body.questions !== undefined) {
    // Mongoose casts string IDs on embedded docs to ObjectId at save time.
    poll.questions = body.questions as unknown as PollDoc["questions"];
  }

  await poll.save();
  await applyLazyStatusUpdate(poll);
  return toPollWire(poll);
}

export async function deleteOwnerPoll(ownerId: string, pollId: string) {
  const poll = await findOwnerPollById(ownerId, pollId);
  if (!poll) {
    throw new HttpError(404, ERROR_CODES.NOT_FOUND, "Poll not found");
  }

  const hasResponses = await hasAnyResponse(pollId);
  if (hasResponses) {
    throw new HttpError(
      409,
      ERROR_CODES.CONFLICT,
      "Poll with responses cannot be deleted",
    );
  }

  poll.deletedAt = new Date();
  await poll.save();
}

export async function publishOwnerPoll(ownerId: string, pollId: string) {
  const poll = await findOwnerPollById(ownerId, pollId);
  if (!poll) {
    throw new HttpError(404, ERROR_CODES.NOT_FOUND, "Poll not found");
  }

  if (poll.status === "draft") {
    throw new HttpError(
      409,
      ERROR_CODES.CONFLICT,
      "Draft polls must be activated before publishing",
    );
  }

  if (poll.status === "published") {
    return toPollWire(poll);
  }

  poll.status = "published";
  await poll.save();
  return toPollWire(poll);
}
