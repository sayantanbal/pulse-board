import { describe, expect, it } from "vitest";
import { isViewTrackingEnabled } from "./viewTracking.js";

describe("isViewTrackingEnabled", () => {
  it("is true for active and published polls", () => {
    expect(isViewTrackingEnabled("active")).toBe(true);
    expect(isViewTrackingEnabled("published")).toBe(true);
  });

  it("is false for draft and expired polls", () => {
    expect(isViewTrackingEnabled("draft")).toBe(false);
    expect(isViewTrackingEnabled("expired")).toBe(false);
  });
});
