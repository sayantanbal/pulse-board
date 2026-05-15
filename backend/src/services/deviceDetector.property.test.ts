import * as fc from "fast-check";
import { describe, it } from "vitest";
import { detectDevice, truncateUserAgent } from "./deviceDetector.service.js";

const DEVICE_TYPES = ["mobile", "tablet", "desktop", "unknown"] as const;

describe("deviceDetector properties", () => {
  // Feature: view-history-tracking, Property 9: Classification Returns Valid Enum
  it("always returns a valid device type", () => {
    fc.assert(
      fc.property(fc.option(fc.string(), { nil: null }), (ua) => {
        const result = detectDevice(ua ?? undefined);
        return DEVICE_TYPES.includes(result);
      }),
      { numRuns: 100 },
    );
  });

  // Feature: view-history-tracking, Property 12: Empty User-Agent Device Classification
  it("returns unknown for empty or whitespace user-agents", () => {
    fc.assert(
      fc.property(
        fc.constantFrom("", "   ", "\t", "\n"),
        (ua) => detectDevice(ua) === "unknown",
      ),
      { numRuns: 4 },
    );
  });

  // Feature: view-history-tracking, Property 16: User-Agent Truncation
  it("truncates strings longer than 1000 characters", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1001 }), (ua) => {
        const truncated = truncateUserAgent(ua);
        return truncated.length === 1000 && ua.startsWith(truncated);
      }),
      { numRuns: 100 },
    );
  });
});
