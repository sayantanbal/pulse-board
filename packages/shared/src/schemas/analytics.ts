import { z } from "zod";

const timeZoneSchema = z.string().min(1).max(120).refine(
  (tz) => {
    try {
      Intl.DateTimeFormat(undefined, { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  },
  { message: "Invalid IANA time zone" },
);

/** Query string for GET /analytics/polls/:id (time series options). */
export const analyticsPollQuerySchema = z.object({
  seriesBucket: z.enum(["day", "hour"]).optional().default("day"),
  seriesTimezone: timeZoneSchema.optional().default("UTC"),
});

export type AnalyticsPollQuery = z.infer<typeof analyticsPollQuerySchema>;
