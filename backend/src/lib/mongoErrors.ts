/** MongoDB duplicate key error code */
const DUPLICATE_KEY_CODE = 11000;

export function isDuplicateKeyError(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    "code" in e &&
    (e as { code: number }).code === DUPLICATE_KEY_CODE
  );
}

/** Unique index on {@link ../domain/anonResponseClaim.model.ts AnonResponseClaim} (pollId + dedupKey). */
export function isAnonResponseClaimDuplicate(e: unknown): boolean {
  if (!isDuplicateKeyError(e)) {
    return false;
  }
  const keyPattern = (e as { keyPattern?: Record<string, number> }).keyPattern;
  return Boolean(keyPattern && "pollId" in keyPattern && "dedupKey" in keyPattern);
}
