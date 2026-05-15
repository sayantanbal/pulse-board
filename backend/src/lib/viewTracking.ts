import type { PollStatus } from "@pulse-board/shared";

export function isViewTrackingEnabled(status: PollStatus): boolean {
  return status === "active" || status === "published";
}
