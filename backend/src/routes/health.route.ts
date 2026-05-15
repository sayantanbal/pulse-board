import mongoose from "mongoose";
import { Router } from "express";

export const healthRouter = Router();

healthRouter.get("/health", (_req, res) => {
  res.json({ ok: true });
});

healthRouter.get("/ready", async (_req, res, next) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      res.status(503).json({ ok: false });
      return;
    }
    await mongoose.connection.db?.admin().command({ ping: 1 });
    res.status(200).json({ ok: true });
  } catch (e) {
    next(e);
  }
});
