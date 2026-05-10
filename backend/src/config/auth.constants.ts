/** Access JWT and cookie max-age (15 minutes). */
export const ACCESS_TOKEN_TTL_SEC = 15 * 60;

/** Refresh cookie max-age and DB record (7 days). */
export const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
