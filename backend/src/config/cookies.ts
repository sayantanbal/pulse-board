import type { CookieOptions } from "express";
import type { Env } from "./env.js";

export const COOKIE_ACCESS = "access_token";
export const COOKIE_REFRESH = "refresh_token";
/** Set as httpOnly on first anonymous response — used for per-browser dedup (more accurate than IP+UA on shared networks) */
export const COOKIE_ANON_SESSION = "anon_session";

export function baseCookieOptions(env: Env): CookieOptions {
  const isProd = env.NODE_ENV === "production";
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? "none" : "lax",
    path: "/",
  };
}
