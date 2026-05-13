import type { Express } from "express";
import { analyticsRouter } from "./analytics.route.js";
import { authRouter } from "./auth.route.js";
import { healthRouter } from "./health.route.js";
import { internalRouter } from "./internal.route.js";
import { pollRouter } from "./poll.route.js";
import { publicRouter } from "./public.route.js";

export function installRoutes(app: Express): void {
  app.use(healthRouter);
  app.use("/auth", authRouter);
  app.use("/polls", pollRouter);
  app.use("/public", publicRouter);
  app.use("/analytics", analyticsRouter);
  app.use("/internal", internalRouter);
}
