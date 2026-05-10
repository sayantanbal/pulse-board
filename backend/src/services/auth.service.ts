import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import type { Response } from "express";
import type { AuthUserWire, LoginBody, RegisterBody } from "@pulse-board/shared";
import { ERROR_CODES } from "@pulse-board/shared";
import type { Request } from "express";
import mongoose from "mongoose";

import {
  ACCESS_TOKEN_TTL_SEC,
  REFRESH_TOKEN_TTL_MS,
} from "../config/auth.constants.js";
import {
  baseCookieOptions,
  COOKIE_ACCESS,
  COOKIE_REFRESH,
} from "../config/cookies.js";
import { env } from "../config/env.js";
import { RefreshTokenModel } from "../domain/refreshToken.model.js";
import { HttpError } from "../policies/httpError.js";
import { signAccessToken } from "../lib/jwtAccess.js";
import { sha256Hex } from "../lib/tokenHash.js";
import {
  createUser,
  findUserByEmailNormalized,
} from "../repositories/user.repository.js";

const SALT_ROUNDS = 12;

function serializeUser(doc: {
  _id: mongoose.Types.ObjectId;
  email: string;
  createdAt?: Date;
}): AuthUserWire {
  const createdAt = doc.createdAt;
  if (!(createdAt instanceof Date)) {
    throw new HttpError(500, ERROR_CODES.INTERNAL, "Internal Server Error");
  }
  return {
    id: doc._id.toHexString(),
    email: doc.email,
    createdAt,
  };
}

function attachAuthCookies(
  res: Response,
  accessToken: string,
  refreshPlain: string,
): void {
  const base = baseCookieOptions(env);
  const accessMaxAgeMs = ACCESS_TOKEN_TTL_SEC * 1000;

  res.cookie(COOKIE_ACCESS, accessToken, {
    ...base,
    maxAge: accessMaxAgeMs,
  });
  res.cookie(COOKIE_REFRESH, refreshPlain, {
    ...base,
    maxAge: REFRESH_TOKEN_TTL_MS,
  });
}

function clearAuthCookies(res: Response): void {
  const base = { ...baseCookieOptions(env), maxAge: 0 };
  res.cookie(COOKIE_ACCESS, "", base);
  res.cookie(COOKIE_REFRESH, "", base);
}

async function issueSessionForUser(res: Response, userIdStr: string) {
  const userId = new mongoose.Types.ObjectId(userIdStr);
  const refreshPlain = crypto.randomBytes(32).toString("hex");
  const tokenHash = sha256Hex(refreshPlain);
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);

  await RefreshTokenModel.create({
    userId,
    tokenHash,
    replacedBy: null,
    revokedAt: null,
    expiresAt,
  });

  const accessJwt = signAccessToken(userIdStr);
  attachAuthCookies(res, accessJwt, refreshPlain);
}

export async function register(
  body: RegisterBody,
  res: Response,
): Promise<{ user: AuthUserWire }> {
  const passwordHash = await bcrypt.hash(body.password, SALT_ROUNDS);
  const doc = await createUser(body.email, passwordHash);
  const user = serializeUser(doc);
  await issueSessionForUser(res, user.id);

  return { user };
}

export async function login(
  body: LoginBody,
  res: Response,
): Promise<{ user: AuthUserWire }> {
  const existing = await findUserByEmailNormalized(body.email);
  if (!existing) {
    throw new HttpError(
      401,
      ERROR_CODES.UNAUTHORIZED,
      "Invalid email or password",
    );
  }

  const ok = await bcrypt.compare(body.password, existing.passwordHash);
  if (!ok) {
    throw new HttpError(
      401,
      ERROR_CODES.UNAUTHORIZED,
      "Invalid email or password",
    );
  }

  const user = serializeUser(existing);

  await issueSessionForUser(res, user.id);
  return { user };
}

export async function logout(req: Request, res: Response): Promise<void> {
  const plain = req.cookies[COOKIE_REFRESH];
  if (typeof plain === "string" && plain.length > 0) {
    await RefreshTokenModel.updateOne(
      {
        tokenHash: sha256Hex(plain),
        revokedAt: null,
      },
      { $set: { revokedAt: new Date() } },
    ).exec();
  }
  clearAuthCookies(res);
}

export async function refreshSession(req: Request, res: Response): Promise<void> {
  const plain = req.cookies[COOKIE_REFRESH];
  if (typeof plain !== "string" || !plain.length) {
    throw new HttpError(
      401,
      ERROR_CODES.UNAUTHORIZED,
      "Unauthorized",
    );
  }

  const oldHash = sha256Hex(plain);
  const now = new Date();
  let userIdHex!: string;
  let refreshPlainNew!: string;

  const dbSession = await mongoose.startSession();

  try {
    await dbSession.withTransaction(async () => {
      const doc = await RefreshTokenModel.findOne({
        tokenHash: oldHash,
        revokedAt: null,
        expiresAt: { $gt: now },
      }).session(dbSession);

      if (!doc) {
        throw new HttpError(
          401,
          ERROR_CODES.UNAUTHORIZED,
          "Unauthorized",
        );
      }

      refreshPlainNew = crypto.randomBytes(32).toString("hex");
      const newHash = sha256Hex(refreshPlainNew);
      const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);

      const created = await RefreshTokenModel.create(
        [
          {
            userId: doc.userId,
            tokenHash: newHash,
            replacedBy: null,
            revokedAt: null,
            expiresAt,
          },
        ],
        { session: dbSession },
      );

      const newDoc = created[0];
      if (!newDoc) {
        throw new HttpError(500, ERROR_CODES.INTERNAL, "Internal Server Error");
      }

      doc.replacedBy = newDoc._id as mongoose.Types.ObjectId;
      doc.revokedAt = now;
      await doc.save({ session: dbSession });

      userIdHex = doc.userId.toHexString();
    });
  } finally {
    await dbSession.endSession();
  }

  const accessJwt = signAccessToken(userIdHex);
  attachAuthCookies(res, accessJwt, refreshPlainNew);
}
