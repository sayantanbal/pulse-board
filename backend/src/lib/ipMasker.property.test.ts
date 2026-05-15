import * as fc from "fast-check";
import { describe, it } from "vitest";
import { isIPv4, isIPv6, maskIpAddress } from "./ipMasker.js";

const ipv4Arb = fc.tuple(
  fc.integer({ min: 0, max: 255 }),
  fc.integer({ min: 0, max: 255 }),
  fc.integer({ min: 0, max: 255 }),
  fc.integer({ min: 0, max: 255 }),
).map(([a, b, c, d]) => `${a}.${b}.${c}.${d}`);

describe("ipMasker properties", () => {
  // Feature: view-history-tracking, Property 4: IPv4 Masking Format
  it("IPv4 addresses end with .xxx", () => {
    fc.assert(
      fc.property(ipv4Arb, (ip) => {
        const masked = maskIpAddress(ip);
        const parts = ip.split(".");
        return masked === `${parts[0]}.${parts[1]}.${parts[2]}.xxx`;
      }),
      { numRuns: 100 },
    );
  });

  // Feature: view-history-tracking, Property 6: IPv4 Format Detection
  it("isIPv4 matches dotted-decimal with four octets", () => {
    fc.assert(
      fc.property(ipv4Arb, (ip) => isIPv4(ip)),
      { numRuns: 100 },
    );
  });

  // Feature: view-history-tracking, Property 8: Unknown Format Masking
  it("non-IP strings mask last 25% with x", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 4 }).filter((s) => !isIPv4(s) && !isIPv6(s)),
        (value) => {
          const maskLength = Math.ceil(value.length * 0.25);
          const expected =
            value.slice(0, -maskLength) + "x".repeat(maskLength);
          return maskIpAddress(value) === expected;
        },
      ),
      { numRuns: 100 },
    );
  });
});
