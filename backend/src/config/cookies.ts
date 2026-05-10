import type { CookieOptions } from "express";
import type { Env } from "./env.js";

export const COOKIE_ACCESS = "access_token";
export const COOKIE_REFRESH = "refresh_token";

export function baseCookieOptions(env: Env): CookieOptions {
  return {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  };
}
