import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import { runtimeConfig } from "../config/runtime.js";

const ANALYTICS_NAMESPACE = "/analytics";

export type AnalyticsDeltaPayload = {
  pollId: string;
  questionId: string;
  optionId: string;
  newCount: number;
  totalResponses: number;
};

export type AnalyticsSnapshotPayload = {
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
};

let io: Server | null = null;

export function attachAnalyticsSocket(httpServer: HttpServer): Server {
  if (io) {
    return io;
  }

  io = new Server(httpServer, {
    cors: {
      origin: runtimeConfig.corsOrigin,
      credentials: true,
    },
  });

  const nsp = io.of(ANALYTICS_NAMESPACE);

  nsp.on("connection", (socket) => {
    socket.on("join", (pollId: string) => {
      if (typeof pollId !== "string" || !pollId.trim()) {
        return;
      }
      socket.join(pollId);
    });

    socket.on("leave", (pollId: string) => {
      if (typeof pollId !== "string" || !pollId.trim()) {
        return;
      }
      socket.leave(pollId);
    });
  });

  return io;
}

export function emitAnalyticsDelta(payload: AnalyticsDeltaPayload): void {
  if (!io) {
    return;
  }

  io.of(ANALYTICS_NAMESPACE).to(payload.pollId).emit("delta", {
    questionId: payload.questionId,
    optionId: payload.optionId,
    newCount: payload.newCount,
    totalResponses: payload.totalResponses,
  });
}

export function emitAnalyticsSnapshot(payload: AnalyticsSnapshotPayload): void {
  if (!io) {
    return;
  }

  io.of(ANALYTICS_NAMESPACE).to(payload.pollId).emit("snapshot", payload);
}
