import { loginBodySchema, registerBodySchema } from "@pulse-board/shared";
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { requireAuth } from "../policies/requireAuth.js";
import { validateBody } from "../policies/validateBody.js";
import * as authService from "../services/auth.service.js";

/** 10 attempts per 15 min per IP — covers login + register brute-force */
const authWriteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many attempts. Please try again in 15 minutes." },
});

/** 60 requests per 15 min — refresh tokens and profile reads */
const authReadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests. Please slow down." },
});

export const authRouter = Router();

authRouter.post(
  "/register",
  authWriteLimiter,
  validateBody(registerBodySchema),
  async (req, res, next) => {
    try {
      const out = await authService.register(req.body, res);
      res.status(201).json(out);
    } catch (e) {
      next(e);
    }
  },
);

authRouter.post(
  "/login",
  authWriteLimiter,
  validateBody(loginBodySchema),
  async (req, res, next) => {
    try {
      const out = await authService.login(req.body, res);
      res.status(200).json(out);
    } catch (e) {
      next(e);
    }
  },
);

authRouter.post("/logout", async (req, res, next) => {
  try {
    await authService.logout(req, res);
    res.status(204).end();
  } catch (e) {
    next(e);
  }
});

authRouter.post("/refresh", authReadLimiter, async (req, res, next) => {
  try {
    await authService.refreshSession(req, res);
    res.status(204).end();
  } catch (e) {
    next(e);
  }
});

authRouter.get("/me", authReadLimiter, requireAuth, (req, res) => {
  const user = req.user!;
  res.status(200).json({ user });
});

