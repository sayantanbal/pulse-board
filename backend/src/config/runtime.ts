import { env } from "./env.js";

const isProd = env.NODE_ENV === "production";

const defaultDevOrigins = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
];

function splitOrigins(value?: string): string[] {
  if (!value) {
    return [];
  }
  return value
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

const configuredOrigins = [
  ...splitOrigins(env.FRONTEND_ORIGINS),
  ...(env.FRONTEND_ORIGIN ? [env.FRONTEND_ORIGIN] : []),
];

const corsOrigins = [
  ...configuredOrigins,
  ...(isProd ? [] : defaultDevOrigins),
];

// Allow any origin in non-prod to avoid LAN/dev mismatches.
const allowAnyOrigin = !isProd;

if (isProd && corsOrigins.length === 0) {
  throw new Error("Set FRONTEND_ORIGIN or FRONTEND_ORIGINS in production.");
}

type OriginCallback = (err: Error | null, allow?: boolean | string) => void;

function isAllowedOrigin(origin?: string): boolean {
  if (!origin) {
    return true;
  }
  if (allowAnyOrigin) {
    return true;
  }
  return corsOrigins.includes(origin);
}

function corsOrigin(origin: string | undefined, callback: OriginCallback): void {
  if (isAllowedOrigin(origin)) {
    callback(null, true);
    return;
  }
  callback(null, false);
}

export const runtimeConfig = {
  isProd,
  corsOrigins,
  corsOrigin,
};
