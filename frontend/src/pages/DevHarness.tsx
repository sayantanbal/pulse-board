import type { AuthUserWire } from "@pulse-board/shared";
import { MAX_OPTIONS_PER_QUESTION } from "@pulse-board/shared";
import axios from "axios";
import { useEffect, useMemo, useState } from "react";
import { apiClient } from "../data/api/client";
import {
  getAnalyticsSocket,
  type DeltaPayload,
  type SnapshotPayload,
} from "../data/socket/analyticsSocket";

type RealtimeSummary = {
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

export function DevHarness() {
  const [email, setEmail] = useState("dev@example.com");
  const [password, setPassword] = useState("password123");
  const [user, setUser] = useState<AuthUserWire | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pollId, setPollId] = useState("");
  const [roomJoined, setRoomJoined] = useState<string | null>(null);
  const [realtime, setRealtime] = useState<RealtimeSummary | null>(null);
  const [lastSocketEvent, setLastSocketEvent] = useState<string>("-");
  const socket = useMemo(() => getAnalyticsSocket(), []);

  async function run(label: string, fn: () => Promise<void>) {
    setMessage(null);
    try {
      await fn();
      setMessage(`${label} ok`);
    } catch (e: unknown) {
      const detail = axios.isAxiosError(e)
        ? e.response?.data
          ? JSON.stringify(e.response.data)
          : e.message
        : e instanceof Error
          ? e.message
          : "Request failed";
      setMessage(`${label} failed: ${detail}`);
    }
  }

  async function fetchOwnerAnalyticsForCurrentPoll() {
    if (!pollId.trim()) {
      throw new Error("Poll ID is required");
    }
    const { data } = await apiClient.get<{
      summary: RealtimeSummary;
    }>(`/analytics/polls/${pollId}`);
    setRealtime(data.summary);
  }

  async function fetchPublicSummaryForCurrentPoll() {
    if (!pollId.trim()) {
      throw new Error("Poll ID is required");
    }
    const { data } = await apiClient.get<{
      summary: RealtimeSummary;
    }>(`/analytics/polls/${pollId}/summary`);
    setRealtime(data.summary);
  }

  async function publishCurrentPoll() {
    if (!pollId.trim()) {
      throw new Error("Poll ID is required");
    }
    await apiClient.patch(`/polls/${pollId}/publish`);
  }

  function applyDelta(delta: DeltaPayload) {
    setRealtime((prev) => {
      if (!prev) {
        return prev;
      }
      return {
        totalResponses: delta.totalResponses,
        questions: prev.questions.map((q) => ({
          ...q,
          options: q.options.map((o) =>
            o.optionId === delta.optionId && q.questionId === delta.questionId
              ? { ...o, count: delta.newCount }
              : o,
          ),
        })),
      };
    });
  }

  useEffect(() => {
    const onDelta = (delta: DeltaPayload) => {
      setLastSocketEvent(`delta ${delta.questionId}/${delta.optionId}`);
      applyDelta(delta);
    };

    const onSnapshot = (snapshot: SnapshotPayload) => {
      setLastSocketEvent(`snapshot ${snapshot.pollId}`);
      setRealtime({
        totalResponses: snapshot.totalResponses,
        questions: snapshot.questions,
      });
    };

    const onConnect = () => {
      setLastSocketEvent("connected");
      if (roomJoined) {
        socket.emit("join", roomJoined);
      }
    };

    const onReconnect = async () => {
      setLastSocketEvent("reconnected, refetching");
      if (!pollId.trim()) {
        return;
      }
      try {
        await fetchOwnerAnalyticsForCurrentPoll();
      } catch {
        await fetchPublicSummaryForCurrentPoll();
      }
    };

    socket.on("connect", onConnect);
    socket.on("delta", onDelta);
    socket.on("snapshot", onSnapshot);
    socket.io.on("reconnect", onReconnect);

    return () => {
      socket.off("connect", onConnect);
      socket.off("delta", onDelta);
      socket.off("snapshot", onSnapshot);
      socket.io.off("reconnect", onReconnect);
    };
  }, [pollId, roomJoined, socket]);

  return (
    <main style={{ padding: "2rem", maxWidth: 640 }}>
      <h1>Pulse Board</h1>
      <p>
        Frontend dev uses the Vite proxy to <code>/api</code> so httpOnly
        cookies stay same-site on port 5173. Shared:{" "}
        <code>MAX_OPTIONS_PER_QUESTION = {MAX_OPTIONS_PER_QUESTION}</code>
      </p>

      <section
        style={{
          display: "grid",
          gap: "0.75rem",
          marginTop: "1.5rem",
          padding: "1rem",
          background: "#fff",
          borderRadius: 8,
          border: "1px solid #e2e8f0",
        }}
      >
        <label style={{ display: "grid", gap: "0.35rem" }}>
          <span>Email</span>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
        </label>
        <label style={{ display: "grid", gap: "0.35rem" }}>
          <span>Password</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
          <button
            type="button"
            onClick={() =>
              void run("Register", async () => {
                const { data } = await apiClient.post<{ user: AuthUserWire }>(
                  "/auth/register",
                  { email, password },
                );
                setUser(data.user);
              })
            }
          >
            Register
          </button>
          <button
            type="button"
            onClick={() =>
              void run("Login", async () => {
                const { data } = await apiClient.post<{ user: AuthUserWire }>(
                  "/auth/login",
                  { email, password },
                );
                setUser(data.user);
              })
            }
          >
            Login
          </button>
          <button
            type="button"
            onClick={() =>
              void run("/auth/me", async () => {
                const { data } = await apiClient.get<{ user: AuthUserWire }>(
                  "/auth/me",
                );
                setUser(data.user);
              })
            }
          >
            GET /auth/me
          </button>
          <button
            type="button"
            onClick={() =>
              void run("/auth/refresh", async () => {
                await apiClient.post("/auth/refresh");
              })
            }
          >
            Refresh
          </button>
          <button
            type="button"
            onClick={() =>
              void run("/auth/logout", async () => {
                await apiClient.post("/auth/logout");
                setUser(null);
              })
            }
          >
            Logout
          </button>
        </div>
        <p style={{ margin: 0 }}>
          <strong>Me:</strong>{" "}
          <code>{user ? JSON.stringify(user) : "null"}</code>
        </p>
        {message ? (
          <p style={{ margin: 0, color: "#0f172a" }}>{message}</p>
        ) : null}
      </section>

      <section
        style={{
          display: "grid",
          gap: "0.75rem",
          marginTop: "1rem",
          padding: "1rem",
          background: "#fff",
          borderRadius: 8,
          border: "1px solid #e2e8f0",
        }}
      >
        <h2 style={{ margin: 0 }}>Milestone 6 Realtime Harness</h2>
        <label style={{ display: "grid", gap: "0.35rem" }}>
          <span>Poll ID</span>
          <input
            value={pollId}
            onChange={(e) => setPollId(e.target.value)}
            placeholder="24-char poll id"
          />
        </label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
          <button
            type="button"
            onClick={() => {
              socket.connect();
              setLastSocketEvent("connecting");
            }}
          >
            Connect socket
          </button>
          <button
            type="button"
            onClick={() => {
              if (!pollId.trim()) return;
              socket.emit("join", pollId);
              setRoomJoined(pollId);
              setLastSocketEvent(`joined ${pollId}`);
            }}
          >
            Join room
          </button>
          <button
            type="button"
            onClick={() => {
              if (!roomJoined) return;
              socket.emit("leave", roomJoined);
              setLastSocketEvent(`left ${roomJoined}`);
              setRoomJoined(null);
            }}
          >
            Leave room
          </button>
          <button
            type="button"
            onClick={() => {
              socket.disconnect();
              setLastSocketEvent("disconnected");
            }}
          >
            Disconnect socket
          </button>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
          <button
            type="button"
            onClick={() =>
              void run(
                "Owner analytics fetch",
                fetchOwnerAnalyticsForCurrentPoll,
              )
            }
          >
            Fetch owner analytics
          </button>
          <button
            type="button"
            onClick={() =>
              void run("Public summary fetch", fetchPublicSummaryForCurrentPoll)
            }
          >
            Fetch public summary
          </button>
          <button
            type="button"
            onClick={() => void run("Publish poll", publishCurrentPoll)}
          >
            Publish poll
          </button>
        </div>
        <p style={{ margin: 0 }}>
          <strong>Socket:</strong>{" "}
          <code>{socket.connected ? "connected" : "disconnected"}</code>
        </p>
        <p style={{ margin: 0 }}>
          <strong>Room:</strong> <code>{roomJoined ?? "-"}</code>
        </p>
        <p style={{ margin: 0 }}>
          <strong>Last event:</strong> <code>{lastSocketEvent}</code>
        </p>
        <p style={{ margin: 0 }}>
          <strong>Realtime summary:</strong>{" "}
          <code>{realtime ? JSON.stringify(realtime) : "null"}</code>
        </p>
      </section>
    </main>
  );
}
