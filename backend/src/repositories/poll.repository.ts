import mongoose from "mongoose";
import { PollModel } from "../domain/poll.model.js";
import { ResponseModel } from "../domain/response.model.js";

export function toObjectId(id: string): mongoose.Types.ObjectId {
  return new mongoose.Types.ObjectId(id);
}

export async function createPollDoc(input: {
  ownerId: string;
  title: string;
  description?: string;
  expiresAt: Date;
  responseMode: "anonymous" | "authenticated";
  status?: "draft" | "active";
  allowCreatorResponses?: boolean;
  allowResponseChanges?: boolean;
  timerSeconds?: number;
  timerMode?: "none" | "attached" | "detached";
  timerStartedAt?: Date;
  questions: Array<{
    _id?: string;
    prompt: string;
    isRequired: boolean;
    order: number;
    options: Array<{ _id?: string; text: string; order: number }>;
  }>;
}) {
  return PollModel.create({
    ownerId: toObjectId(input.ownerId),
    title: input.title,
    description: input.description,
    expiresAt: input.expiresAt,
    responseMode: input.responseMode,
    status: input.status ?? "active",
    allowCreatorResponses: input.allowCreatorResponses ?? true,
    allowResponseChanges: input.allowResponseChanges ?? false,
    timerSeconds: input.timerSeconds ?? 0,
    timerMode: input.timerMode ?? "none",
    timerStartedAt: input.timerStartedAt ?? null,
    questions: input.questions,
  });
}

export async function findOwnerPollById(ownerId: string, pollId: string) {
  return PollModel.findOne({
    _id: toObjectId(pollId),
    ownerId: toObjectId(ownerId),
    deletedAt: null,
  });
}

export async function listOwnerPolls(ownerId: string) {
  return PollModel.find({
    ownerId: toObjectId(ownerId),
    deletedAt: null,
  }).sort({ updatedAt: -1 });
}

export async function hasAnyResponse(pollId: string): Promise<boolean> {
  const count = await ResponseModel.countDocuments({ pollId: toObjectId(pollId) });
  return count > 0;
}

/** Poll ids (hex) that have at least one response document. */
export async function pollIdsWithResponses(pollIds: string[]): Promise<Set<string>> {
  if (pollIds.length === 0) {
    return new Set();
  }
  const oids = pollIds.map((id) => toObjectId(id));
  const rows = await ResponseModel.aggregate<{ _id: mongoose.Types.ObjectId }>([
    { $match: { pollId: { $in: oids } } },
    { $group: { _id: "$pollId" } },
  ]);
  return new Set(rows.map((r) => r._id.toHexString()));
}
