import type { PollWire } from "@pulse-board/shared";
import axios from "axios";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { apiClient } from "../data/api/client";
import {
  getAnalyticsSocket,
  type DeltaPayload,
  type SnapshotPayload,
} from "../data/socket/analyticsSocket";

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
  const socket = useMemo(() => getAnalyticsSocket(), []);
  const answersRef = useRef<Record<string, string>>({});
  const submittedRef = useRef(false);

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
    !submitted &&
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

  const handleSelect = (questionId: string, optionId: string) => {
    setSubmitError(null);
    setAnswers((prev) => ({ ...prev, [questionId]: optionId }));
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
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const statusCode = err.response?.status;
        if (statusCode === 401) {
          setSubmitError("Please sign in to respond to this poll.");
        } else if (statusCode === 409) {
          setSubmitError(
            err.response?.data?.message ??
              "A response from this session already exists.",
          );
          sessionStorage.setItem(`${submittedKeyPrefix}${pollId}`, "1");
          setSubmitted(true);
        } else {
          setSubmitError(err.response?.data?.message ?? "Unable to submit.");
        }
      } else {
        setSubmitError("Unable to submit.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="page stack">
      <header className="stack">
        <h1 className="title">{poll.title}</h1>
        <p className="subtitle">
          {poll.description?.trim() ? poll.description : "Public poll"}
        </p>
        <div className="stack" style={{ gap: "0.5rem" }}>
          <span className="pill">Status: {poll.status}</span>
          <span className="muted">Expires: {formatDate(poll.expiresAt)}</span>
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
        {poll.responseMode === "authenticated" ? (
          <p className="muted">
            Sign in is required to submit a response for this poll.
          </p>
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
                  ? "Submitted"
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
                          <span
                            style={{
                              width: `${Math.min(100, Math.max(0, o.percentage))}%`,
                            }}
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
