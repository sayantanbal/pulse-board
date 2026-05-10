import {
  emitAnalyticsDelta,
  emitAnalyticsSnapshot,
} from "../socket/analytics.socket.js";

/**
 * Milestone 2b stub: call from response submission flow once implemented.
 */
export function emitResponseDeltaStub(input: {
  pollId: string;
  questionId: string;
  optionId: string;
  newCount: number;
  totalResponses: number;
}): void {
  emitAnalyticsDelta(input);
}

export function emitResponseSnapshot(input: {
  pollId: string;
  totalResponses: number;
  questions: Array<{
    questionId: string;
    options: Array<{
      optionId: string;
      count: number;
      percentage: number;
    }>;
  }>;
}): void {
  emitAnalyticsSnapshot(input);
}
