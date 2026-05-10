import { z } from "zod";
import {
  objectIdStringSchema,
  responseStatusSchema,
} from "./common.js";

export const publicAnswerInputSchema = z.object({
  questionId: objectIdStringSchema,
  optionId: objectIdStringSchema,
});

export const submitPublicResponseBodySchema = z.object({
  status: responseStatusSchema,
  answers: z.array(publicAnswerInputSchema),
});

export type SubmitPublicResponseBody = z.infer<
  typeof submitPublicResponseBodySchema
>;
