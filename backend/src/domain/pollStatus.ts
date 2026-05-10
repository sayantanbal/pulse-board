import type { PollStatus } from "@pulse-board/shared";

/**
 * Lazy status resolution on read (no background job).
 * `published` and `draft` are not overridden by expiry.
 */
export function runPollStatusCheck(
  poll: { status: PollStatus; expiresAt: Date },
  now: Date = new Date(),
): PollStatus {
  if (poll.status === "published" || poll.status === "draft") {
    return poll.status;
  }
  if (now.getTime() >= poll.expiresAt.getTime()) {
    return "expired";
  }
  return "active";
}
