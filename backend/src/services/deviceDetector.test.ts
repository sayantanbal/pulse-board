import { describe, expect, it } from "vitest";
import { detectDevice, truncateUserAgent } from "./deviceDetector.service.js";

describe("detectDevice", () => {
  it("detects iPhone as mobile", () => {
    const ua =
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15";
    expect(detectDevice(ua)).toBe("mobile");
  });

  it("detects iPad as tablet", () => {
    const ua =
      "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15";
    expect(detectDevice(ua)).toBe("tablet");
  });

  it("detects desktop Chrome", () => {
    const ua =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0";
    expect(detectDevice(ua)).toBe("desktop");
  });

  it("returns unknown for empty user-agent", () => {
    expect(detectDevice("")).toBe("unknown");
    expect(detectDevice(null)).toBe("unknown");
    expect(detectDevice(undefined)).toBe("unknown");
  });
});

describe("truncateUserAgent", () => {
  it("truncates to 1000 characters", () => {
    const long = "a".repeat(1500);
    expect(truncateUserAgent(long)).toHaveLength(1000);
  });

  it("preserves strings at or under 1000 characters", () => {
    const ua = "a".repeat(1000);
    expect(truncateUserAgent(ua)).toBe(ua);
  });
});
