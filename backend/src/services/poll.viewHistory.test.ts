import mongoose from "mongoose";
import { describe, expect, it, vi } from "vitest";
import { PollModel } from "../domain/poll.model.js";
import { ViewHistoryModel } from "../domain/viewHistory.model.js";
import { hardDeleteOwnerPoll } from "./poll.service.js";
import { cascadeDeleteViewHistory } from "./viewTracker.service.js";

vi.mock("../domain/poll.model.js", () => ({
  PollModel: { deleteOne: vi.fn() },
}));

vi.mock("../repositories/poll.repository.js", () => ({
  findOwnerPollById: vi.fn(),
}));

describe("hardDeleteOwnerPoll", () => {
  it("cascades view history deletion on hard delete", async () => {
    const pollId = new mongoose.Types.ObjectId().toHexString();
    const ownerId = new mongoose.Types.ObjectId().toHexString();
    const deleteManySpy = vi
      .spyOn(ViewHistoryModel, "deleteMany")
      .mockResolvedValue({ deletedCount: 0 } as never);

    const { findOwnerPollById } = await import(
      "../repositories/poll.repository.js"
    );
    vi.mocked(findOwnerPollById).mockResolvedValue({
      _id: new mongoose.Types.ObjectId(pollId),
    } as never);

    await hardDeleteOwnerPoll(ownerId, pollId);

    expect(PollModel.deleteOne).toHaveBeenCalled();
    expect(deleteManySpy).toHaveBeenCalledWith({
      pollId: new mongoose.Types.ObjectId(pollId),
    });

    deleteManySpy.mockRestore();
  });
});

describe("cascadeDeleteViewHistory", () => {
  it("deletes all view records for a poll", async () => {
    const deleteManySpy = vi
      .spyOn(ViewHistoryModel, "deleteMany")
      .mockResolvedValue({ deletedCount: 2 } as never);

    await cascadeDeleteViewHistory("507f1f77bcf86cd799439011");

    expect(deleteManySpy).toHaveBeenCalledWith({
      pollId: new mongoose.Types.ObjectId("507f1f77bcf86cd799439011"),
    });

    deleteManySpy.mockRestore();
  });
});
