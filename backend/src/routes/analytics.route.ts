import { pollIdParamsSchema } from "@pulse-board/shared";
import { Router } from "express";
import { requireAuth } from "../policies/requireAuth.js";
import { validateParams } from "../policies/validateParams.js";
import {
  getOwnerPollAnalytics,
  getPublishedPollSummary,
} from "../services/analytics.service.js";

export const analyticsRouter = Router();

function getPollIdParam(value: string | string[]): string {
  return Array.isArray(value) ? value[0] ?? "" : value;
}

analyticsRouter.get(
  "/polls/:id",
  requireAuth,
  validateParams(pollIdParamsSchema),
  async (req, res, next) => {
    try {
      const analytics = await getOwnerPollAnalytics(
        req.user!.id,
        getPollIdParam(req.params.id),
      );
      res.status(200).json(analytics);
    } catch (e) {
      next(e);
    }
  },
);

analyticsRouter.get(
  "/polls/:id/summary",
  validateParams(pollIdParamsSchema),
  async (req, res, next) => {
    try {
      const summary = await getPublishedPollSummary(getPollIdParam(req.params.id));
      res.status(200).json(summary);
    } catch (e) {
      next(e);
    }
  },
);
