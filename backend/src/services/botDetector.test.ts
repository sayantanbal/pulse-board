import { describe, expect, it } from "vitest";
import { detectBot } from "./botDetector.service.js";

describe("detectBot", () => {
  it("detects Googlebot as legitimate crawler", () => {
    expect(detectBot("Mozilla/5.0 (compatible; Googlebot/2.1)")).toBe(
      "legitimate_crawler",
    );
  });

  it("detects curl as suspicious bot", () => {
    expect(detectBot("curl/8.0.0")).toBe("suspicious_bot");
  });

  it("classifies normal browser as human", () => {
    expect(
      detectBot(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0",
      ),
    ).toBe("human");
  });

  it("returns suspicious_bot for empty user-agent", () => {
    expect(detectBot("")).toBe("suspicious_bot");
    expect(detectBot(null)).toBe("suspicious_bot");
  });
});
