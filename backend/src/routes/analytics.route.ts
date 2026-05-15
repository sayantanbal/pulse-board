import {
  analyticsPollQuerySchema,
  pollIdParamsSchema,
  viewHistoryQuerySchema,
  viewSummaryQuerySchema,
} from "@pulse-board/shared";
import { Router } from "express";
import { requireAuth } from "../policies/requireAuth.js";
import { validateParams } from "../policies/validateParams.js";
import {
  getOwnerPollAnalytics,
  getPublishedPollSummary,
  getPollLeaderboard,
} from "../services/analytics.service.js";
import { getSummary, getViews } from "../services/viewAnalytics.service.js";

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
      const seriesQuery = analyticsPollQuerySchema.parse(req.query);
      const analytics = await getOwnerPollAnalytics(
        req.user!.id,
        getPollIdParam(req.params.id),
        seriesQuery,
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

analyticsRouter.get(
  "/polls/:id/views",
  requireAuth,
  validateParams(pollIdParamsSchema),
  async (req, res, next) => {
    try {
      const query = viewHistoryQuerySchema.parse(req.query);
      const result = await getViews({
        pollId: getPollIdParam(req.params.id),
        ownerId: req.user!.id,
        startDate: query.startDate,
        endDate: query.endDate,
        limit: query.limit,
        excludeOwner: query.excludeOwner,
      });
      res.status(200).json(result);
    } catch (e) {
      next(e);
    }
  },
);

analyticsRouter.get(
  "/polls/:id/views/summary",
  requireAuth,
  validateParams(pollIdParamsSchema),
  async (req, res, next) => {
    try {
      const query = viewSummaryQuerySchema.parse(req.query);
      const summary = await getSummary({
        pollId: getPollIdParam(req.params.id),
        ownerId: req.user!.id,
        startDate: query.startDate,
        endDate: query.endDate,
        excludeOwner: query.excludeOwner,
      });
      res.status(200).json(summary);
    } catch (e) {
      next(e);
    }
  },
);

analyticsRouter.get(
  "/polls/:id/leaderboard",
  requireAuth,
  validateParams(pollIdParamsSchema),
  async (req, res, next) => {
    try {
      const data = await getPollLeaderboard(
        req.user!.id,
        getPollIdParam(req.params.id),
      );
      res.status(200).json(data);
    } catch (e) {
      next(e);
    }
  },
);

