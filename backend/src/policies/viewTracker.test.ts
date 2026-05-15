import type { Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import * as viewTrackerService from "../services/viewTracker.service.js";
import { viewTrackerMiddleware } from "./viewTracker.js";

describe("viewTrackerMiddleware", () => {
  it("calls next immediately without awaiting recordView", async () => {
    const recordSpy = vi
      .spyOn(viewTrackerService, "recordView")
      .mockResolvedValue(undefined);

    let nextCalled = false;
    const req = {
      params: { id: "507f1f77bcf86cd799439011" },
      ip: "203.0.113.1",
      header: () => "Mozilla/5.0",
      cookies: {},
    } as unknown as Request;
    const res = {} as Response;

    viewTrackerMiddleware(req, res, () => {
      nextCalled = true;
    });

    expect(nextCalled).toBe(true);

    await vi.waitFor(() => {
      expect(recordSpy).toHaveBeenCalledWith(
        "507f1f77bcf86cd799439011",
        "203.0.113.1",
        "Mozilla/5.0",
        null,
      );
    });

    recordSpy.mockRestore();
  });
});
