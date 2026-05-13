import { Router } from "express";
import { env } from "../config/env.js";
import { HttpError } from "../policies/httpError.js";
import { ERROR_CODES } from "@pulse-board/shared";
import { expireDuePolls } from "../services/poll.service.js";

export const internalRouter = Router();

internalRouter.post("/expire-polls", async (req, res, next) => {
  try {
    if (!env.INTERNAL_JOB_SECRET) {
      throw new HttpError(
        503,
        ERROR_CODES.INTERNAL,
        "INTERNAL_JOB_SECRET is not configured",
      );
    }
    const auth = req.header("authorization");
    const expected = `Bearer ${env.INTERNAL_JOB_SECRET}`;
    if (auth !== expected) {
      throw new HttpError(401, ERROR_CODES.UNAUTHORIZED, "Unauthorized");
    }
    const result = await expireDuePolls();
    res.status(200).json(result);
  } catch (e) {
    next(e);
  }
});
