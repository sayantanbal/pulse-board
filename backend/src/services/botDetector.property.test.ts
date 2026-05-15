import * as fc from "fast-check";
import { describe, it } from "vitest";
import { detectBot } from "./botDetector.service.js";

const BOT_TYPES = [
  "human",
  "legitimate_crawler",
  "suspicious_bot",
  "unknown",
] as const;

describe("botDetector properties", () => {
  // Feature: view-history-tracking, Property 9: Classification Returns Valid Enum
  it("always returns a valid bot classification", () => {
    fc.assert(
      fc.property(fc.option(fc.string(), { nil: null }), (ua) => {
        const result = detectBot(ua ?? undefined);
        return BOT_TYPES.includes(result);
      }),
      { numRuns: 100 },
    );
  });

  // Feature: view-history-tracking, Property 20: Empty User-Agent Bot Classification
  it("returns suspicious_bot for empty user-agents", () => {
    fc.assert(
      fc.property(fc.constantFrom("", "  ", null, undefined), (ua) => {
        return detectBot(ua as string | null | undefined) === "suspicious_bot";
      }),
      { numRuns: 4 },
    );
  });

  // Feature: view-history-tracking, Property 21: Bot Detection Case Insensitivity
  it("is case-insensitive for crawler patterns", () => {
    fc.assert(
      fc.property(
        fc.constantFrom("GOOGLEBOT", "GoogleBot", "googlebot"),
        (token) => {
          return detectBot(`compatible; ${token}/2.1`) === "legitimate_crawler";
        },
      ),
      { numRuns: 3 },
    );
  });
});
