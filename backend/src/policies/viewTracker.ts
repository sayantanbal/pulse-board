import type { RequestHandler } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { COOKIE_ACCESS } from "../config/cookies.js";
import { UserModel } from "../domain/user.model.js";
import { recordView } from "../services/viewTracker.service.js";

type AccessJwtPayload = { sub: string };

function getPollIdParam(value: string | string[]): string {
  return Array.isArray(value) ? (value[0] ?? "") : value;
}

async function resolveOptionalRespondentId(
  accessToken: unknown,
): Promise<string | null> {
  if (typeof accessToken !== "string" || !accessToken.length) {
    return null;
  }

  try {
    const decoded = jwt.verify(accessToken, env.JWT_ACCESS_SECRET, {
      algorithms: ["HS256"],
    }) as AccessJwtPayload;

    const user = await UserModel.findById(decoded.sub).select("_id");
    return user ? user._id.toHexString() : null;
  } catch {
    return null;
  }
}

export const viewTrackerMiddleware: RequestHandler = (req, res, next) => {
  const pollId = getPollIdParam(req.params.id);
  const ipAddress = req.ip ?? "";
  const userAgent = req.header("user-agent") ?? "";

  void (async () => {
    try {
      const respondentId = await resolveOptionalRespondentId(
        req.cookies[COOKIE_ACCESS],
      );
      await recordView(pollId, ipAddress, userAgent, respondentId);
    } catch (err) {
      console.error("View tracker middleware error:", err);
    }
  })();

  next();
};
