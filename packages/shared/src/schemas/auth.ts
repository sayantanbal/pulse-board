import { z } from "zod";
import { objectIdStringSchema } from "./common.js";

export const registerBodySchema = z.object({
  email: z.string().trim().email().max(320),
  password: z.string().min(8).max(128),
});

export type RegisterBody = z.infer<typeof registerBodySchema>;

export const loginBodySchema = z.object({
  email: z.string().trim().email().max(320),
  password: z.string().min(1).max(128),
});

export type LoginBody = z.infer<typeof loginBodySchema>;

export const authUserWireSchema = z.object({
  id: objectIdStringSchema,
  email: z.string().email(),
  createdAt: z.coerce.date(),
});

export type AuthUserWire = z.infer<typeof authUserWireSchema>;
