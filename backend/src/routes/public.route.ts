import { pollIdParamsSchema, submitPublicResponseBodySchema } from "@pulse-board/shared";
import { Router } from "express";
import { validateBody } from "../policies/validateBody.js";
import { validateParams } from "../policies/validateParams.js";
import { getPublicPoll, submitPublicPollResponse } from "../services/publicPoll.service.js";

export const publicRouter = Router();

function getPollIdParam(value: string | string[]): string {
  return Array.isArray(value) ? value[0] ?? "" : value;
}

publicRouter.get(
  "/polls/:id",
  validateParams(pollIdParamsSchema),
  async (req, res, next) => {
    try {
      const poll = await getPublicPoll(getPollIdParam(req.params.id));
      res.status(200).json(poll);
    } catch (e) {
      next(e);
    }
  },
);

publicRouter.post(
  "/polls/:id/responses",
  validateParams(pollIdParamsSchema),
  validateBody(submitPublicResponseBodySchema),
  async (req, res, next) => {
    try {
      const result = await submitPublicPollResponse({
        pollId: getPollIdParam(req.params.id),
        body: req.body,
        ip: req.ip ?? "",
        userAgent: req.header("user-agent") ?? "",
        cookies: req.cookies as Record<string, unknown>,
      });
      res.status(201).json(result);
    } catch (e) {
      next(e);
    }
  },
);
