import * as fc from "fast-check";
import { describe, it } from "vitest";
import { maskIpAddress } from "../lib/ipMasker.js";

describe("viewAnalytics properties", () => {
  // Feature: view-history-tracking, Property 3: API Response Privacy
  it("masked IP never equals full IPv4 when masking is applied", () => {
    fc.assert(
      fc.property(
        fc.tuple(
          fc.integer({ min: 0, max: 255 }),
          fc.integer({ min: 0, max: 255 }),
          fc.integer({ min: 0, max: 255 }),
          fc.integer({ min: 0, max: 255 }),
        ),
        ([a, b, c, d]) => {
          const ip = `${a}.${b}.${c}.${d}`;
          const masked = maskIpAddress(ip);
          return masked !== ip && masked.endsWith(".xxx");
        },
      ),
      { numRuns: 100 },
    );
  });
});
