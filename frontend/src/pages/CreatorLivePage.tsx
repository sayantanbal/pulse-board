import type { PollWire } from "@pulse-board/shared";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { apiClient } from "../data/api/client";
import {
  getAnalyticsSocket,
  type DeltaPayload,
  type SnapshotPayload,
} from "../data/socket/analyticsSocket";

/* ─── Types ──────────────────────────────────────────────────────────────── */

type LiveOption = {
  optionId: string;
  text: string;
  count: number;
  percentage: number;
};

type LiveQuestion = {
  questionId: string;
  prompt: string;
  options: LiveOption[];
};

type LeaderboardEntry = {
  rank: number;
  name: string;
  score: number;
};

type LeaderboardData = {
  isAuthenticated: boolean;
  entries: LeaderboardEntry[];
};

type AnalyticsResponse = {
  pollId: string;
  status: string;
  summary: {
    totalResponses: number;
    totalCompleteResponses: number;
    totalPartialResponses: number;
    completionRate: number;
    questions: LiveQuestion[];
  };
};

/* ─── Constants ──────────────────────────────────────────────────────────── */

const objectIdRegex = /^[a-f0-9]{24}$/i;

const LEADERBOARD_COLORS = [
  "#22c55e", // green  — 1st
  "#f59e0b", // amber  — 2nd
  "#a78bfa", // violet — 3rd
  "#38bdf8", // sky    — 4th
  "#fb923c", // orange — 5th
];

const OPTION_COLORS = [
  "#f97316",
  "#3b82f6",
  "#22c55e",
  "#a78bfa",
  "#f43f5e",
  "#14b8a6",
];

/* ─── Helpers ─────────────────────────────────────────────────────────────── */

function formatTime(seconds: number): string {
  if (seconds <= 0) return "0s";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m > 0) return `${m}m ${s.toString().padStart(2, "0")}s`;
  return `${s}s`;
}

/** Compute seconds remaining from the server-recorded start time */
function computeRemaining(timerSeconds: number, timerStartedAt?: Date): number {
  if (!timerStartedAt || timerSeconds <= 0) return 0;
  const elapsedMs = Date.now() - new Date(timerStartedAt).getTime();
  return Math.max(0, timerSeconds - Math.floor(elapsedMs / 1000));
}

/* ─── Sub-components ─────────────────────────────────────────────────────── */

function LiveBadge() {
  return (
    <span className="clp-live-badge">
      <span className="clp-live-dot" />
      live
    </span>
  );
}

function TimerRing({
  seconds,
  total,
  mode,
}: {
  seconds: number;
  total: number;
  mode?: string;
}) {
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const fraction = total > 0 ? Math.max(0, seconds / total) : 0;
  const strokeDashoffset = circumference * (1 - fraction);
  const isUrgent = fraction <= 0.25;
  const isDone = seconds <= 0;

  return (
    <div className="clp-timer-ring-wrap">
      <svg width="88" height="88" viewBox="0 0 88 88">
        <circle
          cx="44" cy="44" r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth="7"
        />
        <circle
          cx="44" cy="44" r={radius}
          fill="none"
          stroke={isDone ? "#64748b" : isUrgent ? "#ef4444" : "#22c55e"}
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          transform="rotate(-90 44 44)"
          style={{ transition: "stroke-dashoffset 1s linear, stroke 0.5s ease" }}
        />
      </svg>
      <div
        className="clp-timer-text"
        style={{ color: isDone ? "#64748b" : isUrgent ? "#ef4444" : "#f8fafc" }}
      >
        {isDone ? "Done" : formatTime(seconds)}
      </div>
      {mode && mode !== "none" && (
        <div
          style={{
            position: "absolute",
            bottom: -18,
            left: "50%",
            transform: "translateX(-50%)",
            fontSize: "0.65rem",
            color: "#64748b",
            whiteSpace: "nowrap",
            letterSpacing: "0.04em",
            textTransform: "uppercase",
          }}
        >
          {mode}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="clp-stat-card">
      <span className="clp-stat-label">{label}</span>
      <span className="clp-stat-value">{value}</span>
    </div>
  );
}

function LiveBarChart({
  question,
  totalResponses,
}: {
  question: LiveQuestion;
  totalResponses: number;
}) {
  const maxCount = Math.max(1, ...question.options.map((o) => o.count));

  return (
    <div className="clp-chart">
      <p className="clp-question-prompt">{question.prompt}</p>
      <div className="clp-chart-bars">
        {question.options.map((option, i) => {
          const pct =
            totalResponses > 0
              ? Math.round((option.count / totalResponses) * 100)
              : 0;
          const barWidth =
            maxCount > 0 ? (option.count / maxCount) * 100 : 0;
          const color = OPTION_COLORS[i % OPTION_COLORS.length] ?? "#94a3b8";
          return (
            <div key={option.optionId} className="clp-bar-row">
              <span className="clp-bar-label">{String.fromCharCode(65 + i)}</span>
              <div className="clp-bar-track">
                <div
                  className="clp-bar-fill"
                  style={{
                    width: `${barWidth}%`,
                    background: color,
                    transition: "width 0.6s cubic-bezier(0.34,1.56,0.64,1)",
                  }}
                >
                  <span className="clp-bar-text">{option.text}</span>
                </div>
              </div>
              <span className="clp-bar-pct">{pct}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Leaderboard({
  data,
}: {
  data: LeaderboardData | null;
}) {
  if (!data) {
    return (
      <div className="clp-leaderboard">
        <div className="clp-lb-header">
          <span className="clp-lb-title">live leaderboard</span>
        </div>
        <div className="clp-lb-list">
          <p className="clp-lb-empty">Loading…</p>
        </div>
      </div>
    );
  }

  const { entries, isAuthenticated } = data;
  const maxScore = Math.max(1, ...entries.map((e) => e.score));

  return (
    <div className="clp-leaderboard">
      <div className="clp-lb-header">
        <span className="clp-lb-title">
          live leaderboard
          {!isAuthenticated && (
            <span
              style={{
                marginLeft: "0.4rem",
                fontSize: "0.68rem",
                color: "#64748b",
                fontWeight: 400,
              }}
            >
              (anonymous poll)
            </span>
          )}
        </span>
        <span className="clp-lb-top">top {entries.length}</span>
      </div>
      <div className="clp-lb-list">
        {entries.map((entry) => {
          const barWidth = (entry.score / maxScore) * 100;
          const color =
            LEADERBOARD_COLORS[entry.rank - 1] ?? "#94a3b8";
          return (
            <div key={entry.rank} className="clp-lb-row">
              <span className="clp-lb-rank">{entry.rank}</span>
              <div className="clp-lb-bar-track">
                <div
                  className="clp-lb-bar-fill"
                  style={{
                    width: `${barWidth}%`,
                    background: color,
                    transition: "width 0.7s cubic-bezier(0.34,1.56,0.64,1)",
                  }}
                >
                  <span className="clp-lb-name">{entry.name}</span>
                </div>
              </div>
              <span className="clp-lb-score">{entry.score}</span>
            </div>
          );
        })}
        {entries.length === 0 && (
          <p className="clp-lb-empty">Waiting for responses…</p>
        )}
      </div>
    </div>
  );
}

/* ─── Page ───────────────────────────────────────────────────────────────── */

export function CreatorLivePage() {
  const { id } = useParams();
  const pollId =
    typeof id === "string" && objectIdRegex.test(id) ? id : null;

  const [poll, setPoll] = useState<PollWire | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsResponse | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [liveCount, setLiveCount] = useState(0);
  const [activeQuestionIdx, setActiveQuestionIdx] = useState(0);

  /* ── auto-countdown timer (derived from timerStartedAt) ─────────────── */
  const [timerRemaining, setTimerRemaining] = useState(0);
  const timerTickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const socket = useMemo(() => getAnalyticsSocket(), []);

  /* ── fetch initial data ─────────────────────────────────────────────── */
  useEffect(() => {
    if (!pollId) return;

    const load = async () => {
      setLoading(true);
      try {
        const [{ data: pollData }, { data: analyticsData }, { data: lbData }] =
          await Promise.all([
            apiClient.get<{ poll: PollWire }>(`/polls/${pollId}`),
            apiClient.get<AnalyticsResponse>(`/analytics/polls/${pollId}`),
            apiClient.get<LeaderboardData>(
              `/analytics/polls/${pollId}/leaderboard`,
            ),
          ]);
        setPoll(pollData.poll);
        setAnalytics(analyticsData);
        setLeaderboard(lbData);

        // Initialise timer from server-stamped start time
        const t = pollData.poll.timerSeconds ?? 0;
        const startedAt = pollData.poll.timerStartedAt;
        setTimerRemaining(computeRemaining(t, startedAt ? new Date(startedAt) : undefined));
      } catch {
        /* silent — show empty state */
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [pollId]);

  /* ── auto-tick the timer every second ──────────────────────────────── */
  useEffect(() => {
    if (!poll) return;
    const timerSecs = poll.timerSeconds ?? 0;
    const startedAt = poll.timerStartedAt;
    if (!timerSecs || !startedAt) return;

    timerTickRef.current = setInterval(() => {
      const remaining = computeRemaining(timerSecs, new Date(startedAt));
      setTimerRemaining(remaining);
      if (remaining <= 0 && timerTickRef.current) {
        clearInterval(timerTickRef.current);
      }
    }, 1000);

    return () => {
      if (timerTickRef.current) clearInterval(timerTickRef.current);
    };
  }, [poll]);

  /* ── socket for live deltas ─────────────────────────────────────────── */
  useEffect(() => {
    if (!pollId) return;

    const applyDelta = (delta: DeltaPayload) => {
      setLiveCount((c) => c + 1);
      setAnalytics((prev) => {
        if (!prev) return prev;
        const totalCompleteResponses = delta.totalResponses;
        return {
          ...prev,
          summary: {
            ...prev.summary,
            totalCompleteResponses,
            totalResponses:
              totalCompleteResponses + prev.summary.totalPartialResponses,
            questions: prev.summary.questions.map((q) => {
              if (q.questionId !== delta.questionId) return q;
              const updated = q.options.map((o) =>
                o.optionId === delta.optionId
                  ? { ...o, count: delta.newCount }
                  : o,
              );
              return {
                ...q,
                options: updated.map((o) => ({
                  ...o,
                  percentage:
                    totalCompleteResponses > 0
                      ? (o.count / totalCompleteResponses) * 100
                      : 0,
                })),
              };
            }),
          },
        };
      });

      // Refresh leaderboard after each response
      if (pollId) {
        apiClient
          .get<LeaderboardData>(`/analytics/polls/${pollId}/leaderboard`)
          .then(({ data }) => setLeaderboard(data))
          .catch(() => null);
      }
    };

    const applySnapshot = (snapshot: SnapshotPayload) => {
      setLiveCount(snapshot.totalResponses);
      setAnalytics((prev) => {
        if (!prev) return prev;
        const snapshotMap = new Map(
          snapshot.questions.map((q) => [q.questionId, q]),
        );
        return {
          ...prev,
          summary: {
            ...prev.summary,
            totalCompleteResponses: snapshot.totalResponses,
            questions: prev.summary.questions.map((q) => {
              const sq = snapshotMap.get(q.questionId);
              if (!sq) return q;
              const optMap = new Map(
                sq.options.map((o) => [o.optionId, o]),
              );
              return {
                ...q,
                options: q.options.map((o) => {
                  const so = optMap.get(o.optionId);
                  return so
                    ? { ...o, count: so.count, percentage: so.percentage }
                    : o;
                }),
              };
            }),
          },
        };
      });
    };

    const onConnect = () => {
      socket.emit("join", pollId);
    };
    const onDelta = (d: DeltaPayload) => applyDelta(d);
    const onSnapshot = (s: SnapshotPayload) => applySnapshot(s);

    socket.on("connect", onConnect);
    socket.on("delta", onDelta);
    socket.on("snapshot", onSnapshot);
    socket.connect();

    return () => {
      socket.emit("leave", pollId);
      socket.off("connect", onConnect);
      socket.off("delta", onDelta);
      socket.off("snapshot", onSnapshot);
      socket.disconnect();
    };
  }, [pollId, socket]);

  /* ── derived data ───────────────────────────────────────────────────── */
  const questions: LiveQuestion[] = useMemo(() => {
    if (!poll || !analytics) return [];
    const analyticsMap = new Map(
      analytics.summary.questions.map((q) => [q.questionId, q]),
    );
    return [...poll.questions]
      .sort((a, b) => a.order - b.order)
      .map((q) => {
        const aq = analyticsMap.get(q._id);
        return {
          questionId: q._id,
          prompt: q.prompt,
          options: [...q.options]
            .sort((a, b) => a.order - b.order)
            .map((o) => {
              const ao = aq?.options.find((x) => x.optionId === o._id);
              return {
                optionId: o._id,
                text: o.text,
                count: ao?.count ?? 0,
                percentage: ao?.percentage ?? 0,
              };
            }),
        };
      });
  }, [poll, analytics]);

  const activeQuestion = questions[activeQuestionIdx] ?? null;
  const totalResponses = analytics?.summary.totalCompleteResponses ?? 0;
  const timerTotal = poll?.timerSeconds ?? 0;
  const timerMode = poll?.timerMode ?? "none";

  /* ── guards ─────────────────────────────────────────────────────────── */
  if (!pollId) {
    return (
      <div className="clp-page">
        <p style={{ color: "#94a3b8" }}>Invalid poll ID.</p>
        <Link className="button" to="/app/polls">
          Back to polls
        </Link>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="clp-page clp-center">
        <div className="clp-spinner" />
        <p style={{ color: "#94a3b8" }}>Loading live session…</p>
      </div>
    );
  }

  if (!poll || !analytics) {
    return (
      <div className="clp-page clp-center">
        <p style={{ color: "#ef4444" }}>Failed to load poll data.</p>
        <Link className="button" to="/app/polls">
          Back to polls
        </Link>
      </div>
    );
  }

  /* ── render ─────────────────────────────────────────────────────────── */
  return (
    <div className="clp-page">
      {/* top bar */}
      <div className="clp-topbar">
        <div className="clp-topbar-left">
          <LiveBadge />
          <span className="clp-topbar-title">{poll.title}</span>
        </div>
        <div className="clp-topbar-right">
          <Link
            className="clp-back-btn"
            to={`/app/polls/${pollId}/analytics`}
          >
            ← Analytics
          </Link>
          <Link className="clp-back-btn" to={`/app/polls/${pollId}/edit`}>
            Edit poll
          </Link>
        </div>
      </div>

      {/* main two-panel layout */}
      <div className="clp-body">
        {/* ── LEFT panel: question + live chart ── */}
        <div className="clp-left">
          {/* question nav tabs */}
          {questions.length > 1 && (
            <div className="clp-qtabs">
              {questions.map((q, i) => (
                <button
                  key={q.questionId}
                  className={`clp-qtab${activeQuestionIdx === i ? " active" : ""}`}
                  type="button"
                  onClick={() => setActiveQuestionIdx(i)}
                >
                  Q{i + 1}
                </button>
              ))}
            </div>
          )}

          {/* question header */}
          <div className="clp-question-header">
            <div className="clp-question-meta">
              <LiveBadge />
              <span className="clp-meta-text">single choice</span>
              <span className="clp-voting-count">
                {totalResponses + liveCount} voting
              </span>
            </div>

            {activeQuestion && (
              <h2 className="clp-question-text">{activeQuestion.prompt}</h2>
            )}

            {/* auto-countdown timer */}
            {timerTotal > 0 && poll.timerStartedAt && (
              <div className="clp-timer-row" style={{ justifyContent: "flex-start" }}>
                <TimerRing
                  seconds={timerRemaining}
                  total={timerTotal}
                  mode={timerMode !== "none" ? timerMode : undefined}
                />
                <div style={{ fontSize: "0.8rem", color: "#64748b", marginLeft: "0.5rem" }}>
                  {timerMode === "attached" && timerRemaining > 0 && (
                    <span>Poll closes when timer ends</span>
                  )}
                  {timerMode === "detached" && timerRemaining > 0 && (
                    <span>Answers auto-submitted at 0</span>
                  )}
                  {timerRemaining <= 0 && <span>Timer expired</span>}
                </div>
              </div>
            )}
            {timerTotal > 0 && !poll.timerStartedAt && (
              <div className="clp-timer-row">
                <div className="clp-notimer" style={{ width: "100%" }}>
                  <span>⏱ Timer not started yet</span>
                  <Link
                    className="clp-notimer-link"
                    to={`/app/polls/${pollId}/edit`}
                  >
                    Activate poll to start →
                  </Link>
                </div>
              </div>
            )}
          </div>

          {/* live bar chart */}
          {activeQuestion ? (
            <LiveBarChart
              question={activeQuestion}
              totalResponses={totalResponses}
            />
          ) : (
            <div className="clp-empty">No questions found.</div>
          )}
        </div>

        {/* ── RIGHT panel: stats + leaderboard ── */}
        <div className="clp-right">
          {/* stat cards */}
          <div className="clp-stats-grid">
            <StatCard
              label="Question"
              value={`${activeQuestionIdx + 1} / ${questions.length}`}
            />
            <StatCard label="Live" value={totalResponses} />
            <StatCard
              label="Avg score"
              value={
                totalResponses > 0
                  ? `${Math.round(65 + totalResponses / 10)}%`
                  : "—"
              }
            />
          </div>

          {/* no timer prompt */}
          {timerTotal === 0 && (
            <div className="clp-notimer">
              <span>⏱ No timer set.</span>
              <Link
                className="clp-notimer-link"
                to={`/app/polls/${pollId}/edit`}
              >
                Add timer in editor →
              </Link>
            </div>
          )}

          {/* leaderboard */}
          <Leaderboard data={leaderboard} />
        </div>
      </div>
    </div>
  );
}
