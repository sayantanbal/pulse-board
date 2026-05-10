import { io, type Socket } from "socket.io-client";

export type DeltaPayload = {
  questionId: string;
  optionId: string;
  newCount: number;
  totalResponses: number;
};

export type SnapshotPayload = {
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

let socket: Socket | null = null;

export function getAnalyticsSocket(): Socket {
  if (socket) {
    return socket;
  }

  const base =
    typeof import.meta.env.VITE_SOCKET_BASE === "string" &&
    import.meta.env.VITE_SOCKET_BASE.length > 0
      ? import.meta.env.VITE_SOCKET_BASE
      : undefined;

  socket = io(`${base ?? ""}/analytics`, {
    withCredentials: true,
    autoConnect: false,
  });

  return socket;
}
