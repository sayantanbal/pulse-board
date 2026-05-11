import type { PollWire } from "@pulse-board/shared";
import axios from "axios";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import confetti from "canvas-confetti";
import { toast } from "sonner";
import { apiClient } from "../data/api/client";
import { useAuth } from "../auth/AuthProvider";
import {
  getAnalyticsSocket,
  type DeltaPayload,
  type SnapshotPayload,
} from "../data/socket/analyticsSocket";
import { ThemeToggle } from "../ui/ThemeToggle";

type PublicSummary = {
  totalCompleteResponses: number;
  questions: Array<{
    questionId: string;
    options: Array<{
      optionId: string;
      count: number;
      percentage: number;
    }>;
  }>;
};

type PublicPollResult = {
  poll: PollWire;
  summary?: PublicSummary;
};

const objectIdRegex = /^[a-f0-9]{24}$/i;
const submittedKeyPrefix = "poll-submitted:";

function formatDate(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) {
    return "-";
  }
  return date.toLocaleString();
}

function formatPercent(value: number): string {
  if (!Number.isFinite(value)) {
    return "0%";
  }
  return `${Math.round(value * 10) / 10}%`;
}

function getApiBase(): string {
  const raw = import.meta.env.VITE_API_BASE;
  if (typeof raw === "string" && raw.length > 0) {
    return raw.replace(/\/$/, "");
  }
  return "/api";
}

export function PublicResultsPage() {
  const { id } = useParams();
  const pollId = typeof id === "string" && objectIdRegex.test(id) ? id : null;
  const { user, logout } = useAuth();

  const [poll, setPoll] = useState<PollWire | null>(null);
  const [summary, setSummary] = useState<PublicSummary | null>(null);
  const [status, setStatus] = useState<PollWire["status"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastSocketEvent, setLastSocketEvent] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const socket = useMemo(() => getAnalyticsSocket(), []);
  const answersRef = useRef<Record<string, string>>({});
  const submittedRef = useRef(false);
  const blurDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const navigate = useNavigate();
  const location = useLocation();

  /* ── timer countdown ───────────────────────────────────────────────── */
  const [timerRemaining, setTimerRemaining] = useState<number>(0);
  const timerTickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoSubmittedRef = useRef(false);

  function computeRemaining(timerSeconds: number, timerStartedAt: Date): number {
    const elapsed = Math.floor((Date.now() - timerStartedAt.getTime()) / 1000);
    return Math.max(0, timerSeconds - elapsed);
  }

  const fetchPublicPoll = useCallback(async () => {
    if (!pollId) {
      return;
    }
    setLoading(true);
    setError(null);

    try {
      const { data } = await apiClient.get<PublicPollResult>(
        `/public/polls/${pollId}`,
      );
      setPoll(data.poll);
      setStatus(data.poll.status);
      setSummary(data.summary ?? null);
    } catch (e) {
      if (axios.isAxiosError(e)) {
        const statusCode = e.response?.status;
        if (statusCode === 410) {
          setError(
            "This poll has expired. Results will appear once published.",
          );
        } else if (statusCode === 404) {
          setError("Poll not found.");
        } else {
          setError("Unable to load this poll right now.");
        }
      } else {
        setError("Unable to load this poll right now.");
      }
    } finally {
      setLoading(false);
    }
  }, [pollId]);

  useEffect(() => {
    answersRef.current = answers;
  }, [answers]);

  useEffect(() => {
    submittedRef.current = submitted;
  }, [submitted]);

  /* ── start timer tick when poll loads ──────────────────────────────── */
  useEffect(() => {
    if (!poll) return;
    const timerSecs = poll.timerSeconds ?? 0;
    const startedAt = poll.timerStartedAt
      ? new Date(poll.timerStartedAt)
      : null;
    if (!timerSecs || !startedAt) return;

    setTimerRemaining(computeRemaining(timerSecs, startedAt));

    timerTickRef.current = setInterval(() => {
      const remaining = computeRemaining(timerSecs, startedAt);
      setTimerRemaining(remaining);
      if (remaining <= 0) {
        if (timerTickRef.current) clearInterval(timerTickRef.current);
        // Detached mode: auto-submit current answers when timer ends
        if (
          (poll.timerMode ?? "none") === "detached" &&
          !submittedRef.current &&
          !autoSubmittedRef.current
        ) {
          autoSubmittedRef.current = true;
          const currentAnswers = answersRef.current;
          const payload = {
            status: Object.keys(currentAnswers).length > 0 ? "complete" : "partial",
            answers: Object.entries(currentAnswers)
              .filter(([, oid]) => Boolean(oid))
              .map(([qid, oid]) => ({ questionId: qid, optionId: oid })),
          };
          apiClient
            .post(`/public/polls/${poll._id}/responses`, payload)
            .then(() => {
              setSubmitted(true);
              sessionStorage.setItem(`poll_submitted_${poll._id}`, "1");
            })
            .catch(() => null);
        }
      }
    }, 1000);

    return () => {
      if (timerTickRef.current) clearInterval(timerTickRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poll]);

  useEffect(() => {
    if (!pollId) {
      return;
    }
    const stored = sessionStorage.getItem(`${submittedKeyPrefix}${pollId}`);
    setSubmitted(stored === "1");
  }, [pollId]);

  useEffect(() => {
    if (!pollId) {
      return;
    }
    setAnswers({});
    setSubmitError(null);
  }, [pollId]);

  useEffect(() => {
    void fetchPublicPoll();
  }, [fetchPublicPoll]);

  useEffect(() => {
    if (!pollId || !poll || poll.status === "published") {
      return;
    }

    const sendPartial = () => {
      if (submittedRef.current) {
        return;
      }
      const answerEntries = Object.entries(answersRef.current).filter(
        ([, optionId]) => Boolean(optionId),
      );
      if (answerEntries.length === 0) {
        return;
      }

      const payload = {
        status: "partial",
        answers: answerEntries.map(([questionId, optionId]) => ({
          questionId,
          optionId,
        })),
      };

      const url = `${getApiBase()}/public/polls/${pollId}/responses`;
      const blob = new Blob([JSON.stringify(payload)], {
        type: "application/json",
      });
      navigator.sendBeacon(url, blob);
    };

    const handleBeforeUnload = () => {
      sendPartial();
    };

    const handlePageHide = () => {
      sendPartial();
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    window.addEventListener("pagehide", handlePageHide);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("pagehide", handlePageHide);
    };
  }, [poll, pollId]);

  useEffect(() => {
    if (!pollId || status !== "published") {
      socket.disconnect();
      return;
    }

    const onDelta = (delta: DeltaPayload) => {
      setLastSocketEvent(`delta ${delta.questionId}/${delta.optionId}`);
      setSummary((prev) => {
        if (!prev) {
          return prev;
        }
        return {
          totalCompleteResponses: delta.totalResponses,
          questions: prev.questions.map((q) => {
            if (q.questionId !== delta.questionId) {
              return q;
            }
            const updatedOptions = q.options.map((o) =>
              o.optionId === delta.optionId
                ? { ...o, count: delta.newCount }
                : o,
            );
            const total = delta.totalResponses;
            return {
              ...q,
              options: updatedOptions.map((o) => ({
                ...o,
                percentage: total > 0 ? (o.count / total) * 100 : 0,
              })),
            };
          }),
        };
      });
    };

    const onSnapshot = (snapshot: SnapshotPayload) => {
      setLastSocketEvent(`snapshot ${snapshot.pollId}`);
      setSummary({
        totalCompleteResponses: snapshot.totalResponses,
        questions: snapshot.questions.map((q) => ({
          questionId: q.questionId,
          options: q.options.map((o) => ({
            optionId: o.optionId,
            count: o.count,
            percentage: o.percentage,
          })),
        })),
      });
    };

    const onConnect = () => {
      setLastSocketEvent("connected");
      socket.emit("join", pollId);
    };

    const onReconnect = async () => {
      setLastSocketEvent("reconnected, refetching");
      await fetchPublicPoll();
    };

    socket.on("connect", onConnect);
    socket.on("delta", onDelta);
    socket.on("snapshot", onSnapshot);
    socket.io.on("reconnect", onReconnect);
    socket.connect();

    return () => {
      socket.emit("leave", pollId);
      socket.off("connect", onConnect);
      socket.off("delta", onDelta);
      socket.off("snapshot", onSnapshot);
      socket.io.off("reconnect", onReconnect);
    };
  }, [fetchPublicPoll, pollId, socket, status]);

  const summaryMap = useMemo(() => {
    if (!summary) {
      return new Map<string, PublicSummary["questions"][number]>();
    }
    return new Map(summary.questions.map((q) => [q.questionId, q]));
  }, [summary]);

  const responderQuestions = useMemo(() => {
    if (!poll) {
      return [];
    }
    return [...poll.questions].sort((a, b) => a.order - b.order);
  }, [poll]);

  const resultsQuestions = useMemo(() => {
    if (!poll) {
      return [];
    }
    return [...poll.questions]
      .sort((a, b) => a.order - b.order)
      .map((q) => {
        const summaryQuestion = summaryMap.get(q._id);
        const optionMap = new Map(
          summaryQuestion?.options.map((o) => [o.optionId, o]) ?? [],
        );
        return {
          ...q,
          options: [...q.options]
            .sort((a, b) => a.order - b.order)
            .map((o) => {
              const summaryOption = optionMap.get(o._id);
              return {
                ...o,
                count: summaryOption?.count ?? 0,
                percentage: summaryOption?.percentage ?? 0,
              };
            }),
        };
      });
  }, [poll, summaryMap]);

  const missingRequired = useMemo(() => {
    if (!poll) {
      return [] as string[];
    }
    return poll.questions
      .filter((q) => q.isRequired && !answers[q._id])
      .map((q) => q._id);
  }, [answers, poll]);

  const canSubmit =
    !submitting &&
    (!submitted || poll?.allowResponseChanges) &&
    poll?.status !== "published" &&
    poll?.status !== "expired";

  if (!pollId) {
    return (
      <main className="page stack">
        <h1 className="title">Pulse Board</h1>
        <div className="card stack">
          <p className="subtitle">Public poll</p>
          <p className="muted">That link does not look like a valid poll id.</p>
        </div>
      </main>
    );
  }

  if (loading && !poll) {
    return (
      <main className="page stack">
        <h1 className="title">Pulse Board</h1>
        <div className="card">Loading public poll...</div>
      </main>
    );
  }

  if (!poll) {
    return (
      <main className="page stack">
        <h1 className="title">Pulse Board</h1>
        <div className="card stack">
          <p className="subtitle">Public poll</p>
          <p className="muted">{error ?? "Poll data is unavailable."}</p>
          <button
            className="button"
            type="button"
            onClick={() => void fetchPublicPoll()}
          >
            Try again
          </button>
        </div>
      </main>
    );
  }

  const triggerPartialSave = useCallback((debounceMs: number) => {
    if (!pollId || !poll || submitted || poll.status === "published") return;
    if (blurDebounceRef.current) clearTimeout(blurDebounceRef.current);
    blurDebounceRef.current = setTimeout(() => {
      if (submittedRef.current) return;
      const currentAnswers = answersRef.current;
      const answerEntries = Object.entries(currentAnswers).filter(([, v]) => Boolean(v));
      if (answerEntries.length === 0) return;
      const payload = {
        status: "partial",
        answers: answerEntries.map(([qid, oid]) => ({ questionId: qid, optionId: oid })),
      };
      const url = `${getApiBase()}/public/polls/${pollId}/responses`;
      const blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
      navigator.sendBeacon(url, blob);
    }, debounceMs);
  }, [pollId, poll, submitted]);

  const handleSelect = (questionId: string, optionId: string) => {
    setSubmitError(null);
    setAnswers((prev) => ({ ...prev, [questionId]: optionId }));
    triggerPartialSave(5000);
  };

  const handleBlur = () => {
    triggerPartialSave(1000);
  };

  const handleSubmit = async () => {
    if (!pollId || !poll) {
      return;
    }
    setSubmitError(null);

    if (missingRequired.length > 0) {
      setSubmitError("Please answer all required questions.");
      return;
    }

    const payload = {
      status: "complete",
      answers: Object.entries(answers)
        .filter(([, optionId]) => Boolean(optionId))
        .map(([questionId, optionId]) => ({
          questionId,
          optionId,
        })),
    };

    setSubmitting(true);
    try {
      await apiClient.post(`/public/polls/${pollId}/responses`, payload);
      sessionStorage.setItem(`${submittedKeyPrefix}${pollId}`, "1");
      setSubmitted(true);
      if (blurDebounceRef.current) clearTimeout(blurDebounceRef.current);
      toast.success("Response submitted! 🎉", {
        description: "Thanks for participating. Your answers are saved.",
        duration: 4000,
      });
      // Fire confetti burst on successful submission
      confetti({
        particleCount: 120,
        spread: 70,
        origin: { y: 0.6 },
        colors: ["#1d4ed8", "#60a5fa", "#a78bfa", "#34d399", "#fbbf24"],
      });
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const statusCode = err.response?.status;
        if (statusCode === 401) {
          const msg = "Please sign in to respond to this poll.";
          setSubmitError(msg);
          toast.error(msg);
        } else if (statusCode === 409) {
          const msg =
            err.response?.data?.message ??
            "A response from this session already exists.";
          setSubmitError(msg);
          toast.warning(msg);
          sessionStorage.setItem(`${submittedKeyPrefix}${pollId}`, "1");
          setSubmitted(true);
        } else {
          const msg = err.response?.data?.message ?? "Unable to submit.";
          setSubmitError(msg);
          toast.error(msg);
        }
      } else {
        const msg = "Unable to submit.";
        setSubmitError(msg);
        toast.error(msg);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="page stack">
      {/* ── Top-right controls: theme toggle + optional user avatar ── */}
      <div style={{ position: "absolute", top: "1rem", right: "1rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <ThemeToggle />
        {user ? (
          <>
            <div
              style={{
                width: "40px",
                height: "40px",
                borderRadius: "50%",
                backgroundColor: "#3b82f6",
                color: "white",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: "bold",
                fontSize: "1.2rem",
                textTransform: "uppercase",
                cursor: "pointer",
              }}
              title="Account"
              onClick={() => setShowUserMenu(!showUserMenu)}
            >
              {(user.email || "?")[0]}
            </div>
            {showUserMenu ? (
              <div
                className="card stack"
                style={{
                  position: "absolute",
                  top: "calc(100% + 0.5rem)",
                  right: 0,
                  padding: "1rem",
                  zIndex: 10,
                  minWidth: "max-content",
                  boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)",
                }}
              >
                <span className="muted" style={{ fontSize: "0.9rem" }}>
                  {user.email}
                </span>
                <button
                  className="button secondary"
                  type="button"
                  onClick={() => {
                    setShowUserMenu(false);
                    void logout();
                  }}
                >
                  Sign out
                </button>
              </div>
            ) : null}
          </>
        ) : null}
      </div>
      <header className="stack">
        <h1 className="title">{poll.title}</h1>
        <p className="subtitle">
          {poll.description?.trim() ? poll.description : "Public poll"}
        </p>
        <div className="stack" style={{ gap: "0.5rem" }}>
          <span className="pill">Status: {poll.status}</span>
          <span className="muted">Expires: {formatDate(poll.expiresAt)}</span>
          {/* ── Timer countdown visible to respondents ── */}
          {(poll.timerSeconds ?? 0) > 0 && poll.timerStartedAt && !submitted && (
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.5rem",
                padding: "0.35rem 0.8rem",
                borderRadius: "999px",
                background:
                  timerRemaining <= 0
                    ? "rgba(100,116,139,0.18)"
                    : timerRemaining <= (poll.timerSeconds ?? 0) * 0.25
                      ? "rgba(239,68,68,0.18)"
                      : "rgba(34,197,94,0.18)",
                border:
                  timerRemaining <= 0
                    ? "1px solid #334155"
                    : timerRemaining <= (poll.timerSeconds ?? 0) * 0.25
                      ? "1px solid #ef4444"
                      : "1px solid #22c55e",
                color:
                  timerRemaining <= 0
                    ? "#64748b"
                    : timerRemaining <= (poll.timerSeconds ?? 0) * 0.25
                      ? "#ef4444"
                      : "#22c55e",
                fontVariantNumeric: "tabular-nums",
                fontWeight: 600,
                fontSize: "0.9rem",
                transition: "all 0.4s ease",
              }}
            >
              <span>⏱</span>
              <span>
                {timerRemaining <= 0
                  ? poll.timerMode === "detached"
                    ? "Time's up — submitting…"
                    : "Ended"
                  : (() => {
                      const m = Math.floor(timerRemaining / 60);
                      const s = timerRemaining % 60;
                      return m > 0
                        ? `${m}:${s.toString().padStart(2, "0")} left`
                        : `${s}s left`;
                    })()}
              </span>
            </div>
          )}

          {status === "published" && lastSocketEvent ? (
            <span className="muted">Live: {lastSocketEvent}</span>
          ) : null}
        </div>
      </header>

      <div className="card stack">
        {error ? <p className="muted">{error}</p> : null}
        {poll.status !== "published" ? (
          <p className="muted">
            This poll is still collecting responses. Results appear here once it
            is published.
          </p>
        ) : null}
        {!user && poll.responseMode === "authenticated" ? (
          <div className="stack" style={{ gap: "0.5rem" }}>
            <p className="muted">
              Sign in is required to submit a response for this poll.
            </p>
            <button
              className="button"
              type="button"
              onClick={() => navigate('/login', { state: { from: location } })}
            >
              Sign In
            </button>
          </div>
        ) : null}
        <button
          className="button secondary"
          type="button"
          onClick={() => void fetchPublicPoll()}
        >
          Refresh
        </button>
      </div>

      {poll.status !== "published" ? (
        <section className="card stack">
          <div className="split">
            <h2 style={{ margin: 0 }}>Your response</h2>
            {submitted ? <span className="pill">Submitted</span> : null}
          </div>

          {submitError ? <p className="muted">{submitError}</p> : null}
          {submitted ? (
            <p className="muted">
              Thanks for responding. Your answers are saved.
            </p>
          ) : null}

          <div className="stack">
            {responderQuestions.map((question, qIndex) => (
              <div key={question._id} className="question stack">
                <div className="row">
                  <strong>
                    {qIndex + 1}. {question.prompt}
                  </strong>
                  {question.isRequired ? (
                    <span className="pill">Required</span>
                  ) : null}
                </div>
                <div className="stack" style={{ gap: "0.5rem" }}>
                  {question.options
                    .sort((a, b) => a.order - b.order)
                    .map((option) => (
                      <label key={option._id} className="row">
                        <input
                          type="radio"
                          name={`question-${question._id}`}
                          value={option._id}
                          checked={answers[question._id] === option._id}
                          onChange={() =>
                            handleSelect(question._id, option._id)
                          }
                          onBlur={handleBlur}
                          disabled={!canSubmit}
                        />
                        <span>{option.text}</span>
                      </label>
                    ))}
                </div>
              </div>
            ))}
          </div>

          <div className="row">
            <button
              className="button"
              type="button"
              onClick={() => void handleSubmit()}
              disabled={!canSubmit}
            >
              {submitting
                ? "Submitting..."
                : submitted
                  ? poll.allowResponseChanges
                    ? "Update Response"
                    : "Submitted"
                  : "Submit"}
            </button>
            {missingRequired.length > 0 && !submitted ? (
              <span className="muted">
                Required questions still need answers.
              </span>
            ) : null}
          </div>
        </section>
      ) : null}

      {poll.status === "published" ? (
        <section className="card stack">
          <div className="stack" style={{ gap: "0.35rem" }}>
            <span className="pill">
              Total responses: {summary?.totalCompleteResponses ?? 0}
            </span>
            <span className="muted">Updated with live deltas.</span>
          </div>

          <div className="stack">
            {resultsQuestions.map((q, qIndex) => (
              <div key={q._id} className="question stack">
                <div>
                  <strong>
                    {qIndex + 1}. {q.prompt}
                  </strong>
                </div>
                <div className="stack" style={{ gap: "0.6rem" }}>
                  {q.options.map((o) => (
                    <div key={o._id} className="option-row">
                      <div className="stack" style={{ gap: "0.35rem" }}>
                        <span>{o.text}</span>
                        <div className="bar">
                          <motion.span
                            initial={{ width: 0 }}
                            animate={{ width: `${Math.min(100, Math.max(0, o.percentage))}%` }}
                            transition={{ duration: 0.6, ease: "easeOut" }}
                            style={{ display: "block", height: "100%", background: "linear-gradient(90deg, #1d4ed8, #60a5fa)" }}
                          />
                        </div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div>{o.count}</div>
                        <div className="muted">
                          {formatPercent(o.percentage)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}
