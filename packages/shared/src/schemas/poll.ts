import { z } from "zod";
import { MAX_OPTIONS_PER_QUESTION } from "../constants.js";
import {
  objectIdStringSchema,
  pollStatusSchema,
  responseModeSchema,
} from "./common.js";

export const pollLifecycleStatusSchema = z.enum(["draft", "active"]);

export type PollLifecycleStatus = z.infer<typeof pollLifecycleStatusSchema>;

export const pollOptionInputSchema = z.object({
  text: z.string().min(1).max(500),
  order: z.number().int().min(0),
});

export const pollQuestionInputSchema = z.object({
  prompt: z.string().min(1).max(2000),
  isRequired: z.boolean(),
  order: z.number().int().min(0),
  options: z
    .array(pollOptionInputSchema)
    .min(2, "At least two options are required")
    .max(MAX_OPTIONS_PER_QUESTION),
});

export const createPollBodySchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().max(5000).optional(),
  expiresAt: z.coerce.date(),
  responseMode: responseModeSchema,
  status: pollLifecycleStatusSchema.optional(),
  allowCreatorResponses: z.boolean().default(true).optional(),
  allowResponseChanges: z.boolean().default(false).optional(),
  timerSeconds: z.number().int().min(0).max(3600).optional(),
  timerMode: z.enum(["none", "attached", "detached"]).optional(),
  questions: z.array(pollQuestionInputSchema).min(1),
});

export type CreatePollBody = z.infer<typeof createPollBodySchema>;

/** IDs optional on embeds for create; required when updating existing embeds. */
export const pollOptionUpdateInputSchema = pollOptionInputSchema.extend({
  _id: objectIdStringSchema.optional(),
});

export const pollQuestionUpdateInputSchema = z.object({
  _id: objectIdStringSchema.optional(),
  prompt: z.string().min(1).max(2000),
  isRequired: z.boolean(),
  order: z.number().int().min(0),
  options: z
    .array(pollOptionUpdateInputSchema)
    .min(2)
    .max(MAX_OPTIONS_PER_QUESTION),
});

export const updatePollBodySchema = z
  .object({
    title: z.string().min(1).max(500).optional(),
    description: z.string().max(5000).nullable().optional(),
    expiresAt: z.coerce.date().optional(),
    responseMode: responseModeSchema.optional(),
    status: pollLifecycleStatusSchema.optional(),
    allowCreatorResponses: z.boolean().optional(),
    allowResponseChanges: z.boolean().optional(),
    timerSeconds: z.number().int().min(0).max(3600).optional(),
    timerMode: z.enum(["none", "attached", "detached"]).optional(),
    questions: z.array(pollQuestionUpdateInputSchema).min(1).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: "At least one field is required",
  });

export type UpdatePollBody = z.infer<typeof updatePollBodySchema>;

export const pollIdParamsSchema = z.object({
  id: objectIdStringSchema,
});

export const pollWireSchema = z.object({
  _id: objectIdStringSchema,
  ownerId: objectIdStringSchema,
  title: z.string(),
  description: z.string().optional(),
  expiresAt: z.coerce.date(),
  responseMode: responseModeSchema,
  status: pollStatusSchema,
  allowCreatorResponses: z.boolean(),
  allowResponseChanges: z.boolean(),
  timerSeconds: z.number().int().min(0).max(3600).optional(),
  timerMode: z.enum(["none", "attached", "detached"]).optional(),
  timerStartedAt: z.coerce.date().optional(),
  deletedAt: z.coerce.date().nullable().optional(),
  questions: z.array(
    z.object({
      _id: objectIdStringSchema,
      prompt: z.string(),
      isRequired: z.boolean(),
      order: z.number().int(),
      options: z.array(
        z.object({
          _id: objectIdStringSchema,
          text: z.string(),
          order: z.number().int(),
        }),
      ),
    }),
  ),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export type PollWire = z.infer<typeof pollWireSchema>;
