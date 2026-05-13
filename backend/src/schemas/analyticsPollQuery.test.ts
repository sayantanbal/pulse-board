import { analyticsPollQuerySchema } from "@pulse-board/shared";
import { describe, expect, it } from "vitest";

describe("analyticsPollQuerySchema", () => {
  it("applies defaults", () => {
    const q = analyticsPollQuerySchema.parse({});
    expect(q.seriesBucket).toBe("day");
    expect(q.seriesTimezone).toBe("UTC");
  });

  it("accepts valid timezone", () => {
    const q = analyticsPollQuerySchema.parse({
      seriesBucket: "hour",
      seriesTimezone: "America/New_York",
    });
    expect(q.seriesBucket).toBe("hour");
    expect(q.seriesTimezone).toBe("America/New_York");
  });

  it("rejects invalid timezone", () => {
    expect(() =>
      analyticsPollQuerySchema.parse({
        seriesTimezone: "Not/A/Zone",
      }),
    ).toThrow();
  });
});
