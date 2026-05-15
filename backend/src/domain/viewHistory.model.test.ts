import { describe, expect, it } from "vitest";
import { ViewHistoryModel } from "./viewHistory.model.js";

describe("ViewHistoryModel", () => {
  it("validates required fields", () => {
    const doc = new ViewHistoryModel({});
    const err = doc.validateSync();
    expect(err).toBeDefined();
    expect(err?.errors.pollId).toBeDefined();
    expect(err?.errors.ipAddress).toBeDefined();
    expect(err?.errors.deviceType).toBeDefined();
  });

  it("rejects invalid deviceType enum", () => {
    const doc = new ViewHistoryModel({
      pollId: "507f1f77bcf86cd799439011",
      ipAddress: "1.2.3.4",
      ipHash: "a".repeat(64),
      deviceType: "watch",
      botClassification: "human",
      userAgent: "test",
      viewedAt: new Date(),
    });
    const err = doc.validateSync();
    expect(err?.errors.deviceType).toBeDefined();
  });
});
