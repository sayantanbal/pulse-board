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
    timerSeconds: doc.timerSeconds ?? 0,
    timerMode: doc.timerMode ?? "none",
    timerStartedAt: doc.timerStartedAt ?? undefined,
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
  const mode = body.timerMode ?? "none";
  const timerSecs = body.timerSeconds ?? 0;
  const isActive = (body.status ?? "active") === "active";

  // Set timerStartedAt when poll activates
  const timerStartedAt = isActive && timerSecs > 0 && mode !== "none"
    ? new Date()
    : undefined;

  // Attached: lock expiresAt = now + timerSeconds
  const expiresAt = isActive && mode === "attached" && timerStartedAt && timerSecs > 0
    ? new Date(timerStartedAt.getTime() + timerSecs * 1000)
    : body.expiresAt;

  const poll = await createPollDoc({
    ownerId,
    title: body.title,
    description: body.description,
    expiresAt,
    responseMode: body.responseMode,
    status: body.status ?? "active",
    allowCreatorResponses: body.allowCreatorResponses,
    allowResponseChanges: body.allowResponseChanges,
    timerSeconds: timerSecs,
    timerMode: mode,
    timerStartedAt,
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
  // ── timerSeconds/expiresAt are metadata-only — allow update even after responses ──
  const hasTimer = body.timerSeconds !== undefined;
  const hasLockedChanges = body.title !== undefined ||
    body.description !== undefined ||
    body.responseMode !== undefined ||
    body.status !== undefined ||
    body.allowCreatorResponses !== undefined ||
    body.allowResponseChanges !== undefined ||
    body.questions !== undefined;

  let poll: PollDoc;
  if (hasLockedChanges) {
    poll = await assertMutablePoll(ownerId, pollId);
  } else {
    // metadata-only update — just find the poll without the response guard
    const found = await findOwnerPollById(ownerId, pollId);
    if (!found) {
      throw new HttpError(404, ERROR_CODES.NOT_FOUND, "Poll not found");
    }
    await applyLazyStatusUpdate(found);
    if (found.status === "published") {
      throw new HttpError(
        409,
        ERROR_CODES.CONFLICT,
        "Published polls cannot be modified",
      );
    }
    poll = found;
  }

  if (body.title !== undefined) {
    poll.title = body.title;
  }
  if (body.description !== undefined) {
    poll.description = body.description ?? undefined;
  }
  if (body.responseMode !== undefined) {
    poll.responseMode = body.responseMode;
  }
  if (body.allowCreatorResponses !== undefined) {
    poll.allowCreatorResponses = body.allowCreatorResponses;
  }
  if (body.allowResponseChanges !== undefined) {
    poll.allowResponseChanges = body.allowResponseChanges;
  }
  if (hasTimer) {
    poll.timerSeconds = body.timerSeconds ?? 0;
  }
  if (body.timerMode !== undefined) {
    poll.timerMode = body.timerMode;
  }

  const shouldRecomputeAttachedExpiry =
    body.timerSeconds !== undefined || body.timerMode !== undefined;
  if (shouldRecomputeAttachedExpiry) {
    const mode = poll.timerMode ?? "none";
    const secs = poll.timerSeconds ?? 0;
    if (mode === "attached") {
      if (
        secs > 0 &&
        (poll.status === "expired" ||
          (poll.status === "active" && !poll.timerStartedAt))
      ) {
        poll.timerStartedAt = new Date();
      }
      if (poll.timerStartedAt && secs > 0) {
        poll.expiresAt = new Date(poll.timerStartedAt.getTime() + secs * 1000);
      }
    }
  }

  // ── status transition: draft → active ──────────────────────────────────
  if (body.status !== undefined) {
    if (body.status === "active" && poll.status === "draft") {
      poll.status = "active";
      // Start the timer clock on activation if a timer is configured
      const mode = poll.timerMode ?? "none";
      const secs = poll.timerSeconds ?? 0;
      if (secs > 0 && mode !== "none" && !poll.timerStartedAt) {
        poll.timerStartedAt = new Date();
        if (mode === "attached") {
          poll.expiresAt = new Date(poll.timerStartedAt.getTime() + secs * 1000);
        }
      }
    } else if (body.status === "draft" && poll.status !== "draft") {
      throw new HttpError(
        409,
        ERROR_CODES.CONFLICT,
        "Only draft polls can remain in draft status",
      );
    }
  }

  // ── expiresAt: only allow if NOT attached (attached is locked to timer) ─
  if (body.expiresAt !== undefined) {
    const mode = poll.timerMode ?? "none";
    if (mode !== "attached") {
      poll.expiresAt = body.expiresAt;
    }
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
