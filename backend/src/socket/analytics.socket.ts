import type { Server as HttpServer } from "node:http";
import mongoose from "mongoose";
import { Server } from "socket.io";
import { PollModel } from "../domain/poll.model.js";
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
      const hex = pollId.trim();
      if (!/^[a-f0-9]{24}$/i.test(hex)) {
        return;
      }

      void (async () => {
        try {
          const poll = await PollModel.findOne({
            _id: new mongoose.Types.ObjectId(hex),
            deletedAt: null,
          }).select("status");

          if (!poll) {
            return;
          }
          if (poll.status === "draft") {
            return;
          }
          socket.join(hex);
        } catch {
          /* ignore invalid joins */
        }
      })();
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
