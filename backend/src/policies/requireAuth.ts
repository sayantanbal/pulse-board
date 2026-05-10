import { ERROR_CODES } from "@pulse-board/shared";
import type { RequestHandler } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { COOKIE_ACCESS } from "../config/cookies.js";
import { UserModel } from "../domain/user.model.js";
import { HttpError } from "./httpError.js";

type AccessJwtPayload = { sub: string };

export const requireAuth: RequestHandler = async (req, _res, next) => {
  const token = req.cookies[COOKIE_ACCESS];
  if (typeof token !== "string" || !token.length) {
    next(new HttpError(401, ERROR_CODES.UNAUTHORIZED, "Unauthorized"));
    return;
  }

  let decoded: AccessJwtPayload;

  try {
    decoded = jwt.verify(token, env.JWT_ACCESS_SECRET, {
      algorithms: ["HS256"],
    }) as AccessJwtPayload;
  } catch {
    next(new HttpError(401, ERROR_CODES.UNAUTHORIZED, "Unauthorized"));
    return;
  }

  const userId = decoded.sub;

  try {
    const user = await UserModel.findById(userId).select("email createdAt");

    if (!user) {
      next(new HttpError(401, ERROR_CODES.UNAUTHORIZED, "Unauthorized"));
      return;
    }

    req.user = {
      id: user._id.toHexString(),
      email: user.email,
      createdAt: user.createdAt as Date,
    };

    next();
  } catch (e) {
    next(e);
  }
};
