import { describe, expect, it } from "vitest";
import { isIPv4, isIPv6, maskIpAddress } from "./ipMasker.js";

describe("maskIpAddress", () => {
  it("masks IPv4 last octet", () => {
    expect(maskIpAddress("192.168.1.1")).toBe("192.168.1.xxx");
  });

  it("masks IPv6 last five groups", () => {
    expect(maskIpAddress("2001:0db8:85a3::8a2e:0370:7334")).toBe(
      "2001:0db8:85a3:xxxx:xxxx:xxxx:xxxx:xxxx",
    );
  });

  it("masks unknown format last 25%", () => {
    expect(maskIpAddress("abcdefgh")).toBe("abcdefxx");
  });

  it("handles empty string", () => {
    expect(maskIpAddress("")).toBe("");
  });
});

describe("isIPv4", () => {
  it("detects valid IPv4", () => {
    expect(isIPv4("192.168.1.1")).toBe(true);
    expect(isIPv4("999.1.1.1")).toBe(false);
  });
});

describe("isIPv6", () => {
  it("detects valid IPv6", () => {
    expect(isIPv6("2001:0db8::1")).toBe(true);
    expect(isIPv6("not-ip")).toBe(false);
  });
});
