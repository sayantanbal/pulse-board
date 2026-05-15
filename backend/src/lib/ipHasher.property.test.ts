import * as fc from "fast-check";
import { describe, it } from "vitest";
import { hashIP } from "./ipHasher.js";

describe("ipHasher properties", () => {
  // Feature: view-history-tracking, Property 1: IP Hash Determinism
  it("same IP always produces the same hash", () => {
    fc.assert(
      fc.property(fc.string(), (ip) => {
        return hashIP(ip) === hashIP(ip);
      }),
      { numRuns: 100 },
    );
  });

  // Feature: view-history-tracking, Property 2: IP Hash Format
  it("hash is exactly 64 hex characters", () => {
    fc.assert(
      fc.property(fc.string(), (ip) => {
        const hash = hashIP(ip);
        return hash.length === 64 && /^[a-f0-9]{64}$/.test(hash);
      }),
      { numRuns: 100 },
    );
  });
});
