import { z } from "zod";

/** 24-char hex MongoDB ObjectId as string (API wire format). */
export const objectIdStringSchema = z
  .string()
  .regex(/^[a-f0-9]{24}$/i, "Invalid id");

export const pollStatusSchema = z.enum([
  "draft",
  "active",
  "expired",
  "published",
]);

export type PollStatus = z.infer<typeof pollStatusSchema>;

export const responseModeSchema = z.enum(["anonymous", "authenticated"]);

export type ResponseMode = z.infer<typeof responseModeSchema>;

export const responseStatusSchema = z.enum(["partial", "complete"]);

export type ResponseStatus = z.infer<typeof responseStatusSchema>;
