import { z } from "zod";
import { objectIdStringSchema } from "./common.js";

const deviceTypeSchema = z.enum(["mobile", "tablet", "desktop", "unknown"]);
const botClassificationSchema = z.enum([
  "human",
  "legitimate_crawler",
  "suspicious_bot",
  "unknown",
]);

const excludeOwnerSchema = z
  .union([z.literal("true"), z.literal("false"), z.literal("1"), z.literal("0")])
  .optional()
  .transform((v) => (v === undefined ? false : v === "true" || v === "1"));

export const viewHistoryQuerySchema = z.object({
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(1000).optional().default(100),
  excludeOwner: excludeOwnerSchema,
});

export type ViewHistoryQuery = z.infer<typeof viewHistoryQuerySchema>;

export const viewSummaryQuerySchema = z.object({
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  excludeOwner: excludeOwnerSchema,
});

export type ViewSummaryQuery = z.infer<typeof viewSummaryQuerySchema>;

export const viewRecordWireSchema = z.object({
  viewedAt: z.coerce.date(),
  maskedIpAddress: z.string(),
  country: z.string().nullable(),
  region: z.string().nullable(),
  city: z.string().nullable(),
  deviceType: deviceTypeSchema,
  botClassification: botClassificationSchema,
  respondentId: objectIdStringSchema.nullable().optional(),
});

export type ViewRecordWire = z.infer<typeof viewRecordWireSchema>;

export const viewsListResponseSchema = z.object({
  views: z.array(viewRecordWireSchema),
  total: z.number().int().nonnegative(),
});

export type ViewsListResponse = z.infer<typeof viewsListResponseSchema>;

export const viewSummaryWireSchema = z.object({
  totalViews: z.number().int().nonnegative(),
  uniqueVisitors: z.number().int().nonnegative(),
  deviceBreakdown: z.object({
    mobile: z.number().int().nonnegative(),
    tablet: z.number().int().nonnegative(),
    desktop: z.number().int().nonnegative(),
    unknown: z.number().int().nonnegative(),
  }),
  botBreakdown: z.object({
    human: z.number().int().nonnegative(),
    legitimate_crawler: z.number().int().nonnegative(),
    suspicious_bot: z.number().int().nonnegative(),
    unknown: z.number().int().nonnegative(),
  }),
  topCountries: z.array(
    z.object({
      country: z.string(),
      count: z.number().int().nonnegative(),
    }),
  ),
});

export type ViewSummaryWire = z.infer<typeof viewSummaryWireSchema>;
