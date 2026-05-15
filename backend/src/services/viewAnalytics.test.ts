import { describe, expect, it } from "vitest";
import { maskIpAddress } from "../lib/ipMasker.js";

describe("viewAnalytics maskIpAddress", () => {
  it("masks IPv4 for API responses", () => {
    expect(maskIpAddress("10.1.2.3")).toBe("10.1.2.xxx");
  });

  it("masks IPv6 for API responses", () => {
    const masked = maskIpAddress("2001:db8::1");
    expect(masked).toMatch(/:xxxx:xxxx:xxxx:xxxx:xxxx$/);
  });
});
