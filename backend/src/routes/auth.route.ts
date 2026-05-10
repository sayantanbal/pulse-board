import { loginBodySchema, registerBodySchema } from "@pulse-board/shared";
import { Router } from "express";
import { requireAuth } from "../policies/requireAuth.js";
import { validateBody } from "../policies/validateBody.js";
import * as authService from "../services/auth.service.js";

export const authRouter = Router();

authRouter.post(
  "/register",
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

authRouter.post("/refresh", async (req, res, next) => {
  try {
    await authService.refreshSession(req, res);
    res.status(204).end();
  } catch (e) {
    next(e);
  }
});

authRouter.get("/me", requireAuth, (req, res) => {
  const user = req.user!;
  res.status(200).json({ user });
});

