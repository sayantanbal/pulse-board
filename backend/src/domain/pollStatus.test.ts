import { describe, expect, it } from "vitest";
import { runPollStatusCheck } from "./pollStatus.js";

describe("runPollStatusCheck", () => {
  it("keeps published and draft", () => {
    const now = new Date("2026-01-15T12:00:00Z");
    expect(
      runPollStatusCheck(
        { status: "published", expiresAt: new Date("2020-01-01") },
        now,
      ),
    ).toBe("published");
    expect(
      runPollStatusCheck(
        { status: "draft", expiresAt: new Date("2030-01-01") },
        now,
      ),
    ).toBe("draft");
  });

  it("expires active poll when expiresAt is past", () => {
    const now = new Date("2026-01-15T12:00:00Z");
    expect(
      runPollStatusCheck(
        { status: "active", expiresAt: new Date("2026-01-10T00:00:00Z") },
        now,
      ),
    ).toBe("expired");
  });

  it("keeps active when expiresAt is future", () => {
    const now = new Date("2026-01-15T12:00:00Z");
    expect(
      runPollStatusCheck(
        { status: "active", expiresAt: new Date("2030-01-01T00:00:00Z") },
        now,
      ),
    ).toBe("active");
  });
});
