import mongoose from "mongoose";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PollModel } from "../domain/poll.model.js";
import { ViewHistoryModel } from "../domain/viewHistory.model.js";
import { recordView } from "./viewTracker.service.js";

vi.mock("../domain/poll.model.js", () => ({
  PollModel: { findById: vi.fn() },
}));

vi.mock("../domain/viewHistory.model.js", () => ({
  ViewHistoryModel: { create: vi.fn() },
}));

vi.mock("./ipGeolocator.service.js", () => ({
  lookup: vi.fn().mockResolvedValue({
    country: null,
    region: null,
    city: null,
  }),
}));

describe("recordView", () => {
  const pollId = new mongoose.Types.ObjectId().toHexString();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("skips recording for draft polls", async () => {
    vi.mocked(PollModel.findById).mockResolvedValue({
      _id: new mongoose.Types.ObjectId(pollId),
      status: "draft",
      deletedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      save: vi.fn(),
    } as never);

    await recordView(pollId, "203.0.113.1", "Mozilla/5.0", null);

    expect(ViewHistoryModel.create).not.toHaveBeenCalled();
  });

  it("records a view for active polls", async () => {
    vi.mocked(PollModel.findById).mockResolvedValue({
      _id: new mongoose.Types.ObjectId(pollId),
      status: "active",
      deletedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      save: vi.fn(),
    } as never);
    vi.mocked(ViewHistoryModel.create).mockResolvedValue({} as never);

    await recordView(pollId, "203.0.113.1", "Mozilla/5.0", null);

    expect(ViewHistoryModel.create).toHaveBeenCalledOnce();
  });

  it("skips invalid poll ids", async () => {
    await recordView("not-an-id", "203.0.113.1", "Mozilla/5.0", null);
    expect(PollModel.findById).not.toHaveBeenCalled();
  });
});
