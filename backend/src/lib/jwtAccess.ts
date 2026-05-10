import jwt from "jsonwebtoken";
import { ACCESS_TOKEN_TTL_SEC } from "../config/auth.constants.js";
import { env } from "../config/env.js";

export function signAccessToken(userId: string): string {
  return jwt.sign({ sub: userId }, env.JWT_ACCESS_SECRET, {
    algorithm: "HS256",
    expiresIn: ACCESS_TOKEN_TTL_SEC,
  });
}
