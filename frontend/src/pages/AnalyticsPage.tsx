import type { PollStatus } from "@pulse-board/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Copy,
  Link2,
  Pencil,
  Radio,
  Share2,
  UploadCloud,
} from "lucide-react";
import { apiClient } from "../data/api/client";
import { usePollLinks } from "../data/usePollLinks";
import {
  getAnalyticsSocket,
  type DeltaPayload,
  type SnapshotPayload,
} from "../data/socket/analyticsSocket";

type AnalyticsSummary = {
  totalResponses: number;
  totalCompleteResponses: number;
  totalPartialResponses: number;
  completionRate: number;
  dropOffRate: number;
  questions: Array<{
    questionId: string;
    prompt: string;
    dropOffCount?: number;
    options: Array<{
      optionId: string;
      text: string;
      count: number;
      percentage: number;
    }>;
  }>;
};

type ResponseTimeSeriesPoint = {
  bucket: string;
  totalResponses: number;
  totalCompleteResponses: number;
  totalPartialResponses: number;
};

type AnalyticsResponse = {
  pollId: string;
  status: PollStatus;
  summary: AnalyticsSummary;
  timeSeries: ResponseTimeSeriesPoint[];
  seriesBucket?: "day" | "hour";
  seriesTimezone?: string;
};

type PollDetails = {
  title: string;
  description?: string;
};

const objectIdRegex = /^[a-f0-9]{24}$/i;

function formatPercent(value: number): string {
  if (!Number.isFinite(value)) {
    return "0%";
  }
  return `${Math.round(value * 10) / 10}%`;
}

function formatBucketDate(value: string, bucket: "day" | "hour", timeZone: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  if (bucket === "hour") {
    return date.toLocaleString(undefined, { timeZone });
  }
  return date.toLocaleDateString(undefined, { timeZone });
}

function formatErrorMessage(error: unknown, fallback: string): string {
  if (!error) {
    return fallback;
  }
  if (axios.isAxiosError(error)) {
    return error.response?.data?.message ?? fallback;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return fallback;
}

export function AnalyticsPage() {
  const { id } = useParams();
  const pollId = typeof id === "string" && objectIdRegex.test(id) ? id : null;
  const queryClient = useQueryClient();

  const [seriesBucket, setSeriesBucket] = useState<"day" | "hour">("day");
  const [seriesTimezone, setSeriesTimezone] = useState(() =>
    Intl.DateTimeFormat().resolvedOptions().timeZone,
  );
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [publishNotice, setPublishNotice] = useState<string | null>(null);
  const [lastSocketEvent, setLastSocketEvent] = useState<string | null>(null);
  const {
    notice: linkNotice,
    error: linkError,
    handleCopyLink: _handleCopyLink,
    handleShareLink: _handleShareLink,
  } = usePollLinks();
  const handleCopyLink = () => _handleCopyLink(pollId ?? "");
  const handleShareLink = () =>
    _handleShareLink(pollId ?? "", poll?.title ?? "Pulse Board poll");
  const socket = useMemo(() => getAnalyticsSocket(), []);

  const analyticsQueryKey = useMemo(
    () => ["analytics", pollId, seriesBucket, seriesTimezone] as const,
    [pollId, seriesBucket, seriesTimezone],
  );

  const analyticsQuery = useQuery({
    queryKey: analyticsQueryKey,
    enabled: Boolean(pollId),
    staleTime: 30_000,
    queryFn: async () => {
      const { data } = await apiClient.get<AnalyticsResponse>(
        `/analytics/polls/${pollId}`,
        {
          params: { seriesBucket, seriesTimezone },
        },
      );
      return data;
    },
  });

  const pollQuery = useQuery({
    queryKey: ["poll", pollId],
    enabled: Boolean(pollId),
    staleTime: 30_000,
    queryFn: async () => {
      const { data } = await apiClient.get<{ poll: PollDetails }>(
        `/polls/${pollId}`,
      );
      return data.poll;
    },
  });

  useEffect(() => {
    if (!pollId) {
      return;
    }

    const applyDelta = (prev: AnalyticsResponse, delta: DeltaPayload) => {
      const totalCompleteResponses = delta.totalResponses;
      const totalPartialResponses = prev.summary.totalPartialResponses;
      const totalResponses = totalCompleteResponses + totalPartialResponses;
      const completionRate = totalResponses
        ? (totalCompleteResponses / totalResponses) * 100
        : 0;
      const dropOffRate = totalResponses
        ? (totalPartialResponses / totalResponses) * 100
        : 0;

      return {
        ...prev,
        summary: {
          ...prev.summary,
          totalResponses,
          totalCompleteResponses,
          completionRate,
          dropOffRate,
          questions: prev.summary.questions.map((q) => {
            if (q.questionId !== delta.questionId) {
              return q;
            }
            const updatedOptions = q.options.map((o) =>
              o.optionId === delta.optionId
                ? { ...o, count: delta.newCount }
                : o,
            );
            return {
              ...q,
              options: updatedOptions.map((o) => ({
                ...o,
                percentage: totalCompleteResponses
                  ? (o.count / totalCompleteResponses) * 100
                  : 0,
              })),
            };
          }),
        },
      };
    };

    const applySnapshot = (
      prev: AnalyticsResponse,
      snapshot: SnapshotPayload,
    ) => {
      const totalCompleteResponses = snapshot.totalResponses;
      const totalPartialResponses = prev.summary.totalPartialResponses;
      const totalResponses = totalCompleteResponses + totalPartialResponses;
      const completionRate = totalResponses
        ? (totalCompleteResponses / totalResponses) * 100
        : 0;
      const dropOffRate = totalResponses
        ? (totalPartialResponses / totalResponses) * 100
        : 0;
      const snapshotMap = new Map(
        snapshot.questions.map((q) => [q.questionId, q]),
      );

      return {
        ...prev,
        summary: {
          ...prev.summary,
          totalResponses,
          totalCompleteResponses,
          completionRate,
          dropOffRate,
          questions: prev.summary.questions.map((q) => {
            const snapshotQuestion = snapshotMap.get(q.questionId);
            if (!snapshotQuestion) {
              return q;
            }
            const optionMap = new Map(
              snapshotQuestion.options.map((o) => [o.optionId, o]),
            );
            return {
              ...q,
              options: q.options.map((o) => {
                const snapshotOption = optionMap.get(o.optionId);
                if (!snapshotOption) {
                  return {
                    ...o,
                    percentage: totalCompleteResponses
                      ? (o.count / totalCompleteResponses) * 100
                      : 0,
                  };
                }
                return {
                  ...o,
                  count: snapshotOption.count,
                  percentage: snapshotOption.percentage,
                };
              }),
            };
          }),
        },
      };
    };

    const onDelta = (delta: DeltaPayload) => {
      setLastSocketEvent(`delta ${delta.questionId}/${delta.optionId}`);
      queryClient.setQueryData<AnalyticsResponse | undefined>(
        analyticsQueryKey,
        (prev) => (prev ? applyDelta(prev, delta) : prev),
      );
    };

    const onSnapshot = (snapshot: SnapshotPayload) => {
      setLastSocketEvent(`snapshot ${snapshot.pollId}`);
      queryClient.setQueryData<AnalyticsResponse | undefined>(
        analyticsQueryKey,
        (prev) => (prev ? applySnapshot(prev, snapshot) : prev),
      );
    };

    const onConnect = () => {
      setLastSocketEvent("connected");
      socket.emit("join", pollId);
    };

    const onReconnect = async () => {
      setLastSocketEvent("reconnected, refetching");
      await analyticsQuery.refetch();
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
      socket.disconnect();
    };
  }, [
    analyticsQuery.refetch,
    analyticsQueryKey,
    pollId,
    queryClient,
    seriesBucket,
    seriesTimezone,
    socket,
  ]);

  const analytics = analyticsQuery.data ?? null;
  const poll = pollQuery.data ?? null;
  const loading = analyticsQuery.isLoading || pollQuery.isLoading;
  const error = analyticsQuery.error ?? pollQuery.error;
  const errorMessage = formatErrorMessage(error, "Failed to load analytics");

  const summary = analytics?.summary ?? null;
  const timeSeries = analytics?.timeSeries ?? [];
  const showTimeSeries = analytics?.status !== "expired";

  const metrics = useMemo(() => {
    if (!summary) {
      return [];
    }
    return [
      { label: "Total responses", value: summary.totalResponses },
      { label: "Completed", value: summary.totalCompleteResponses },
      { label: "Partial", value: summary.totalPartialResponses },
      {
        label: "Completion rate",
        value: formatPercent(summary.completionRate),
      },
      { label: "Drop-off rate", value: formatPercent(summary.dropOffRate) },
    ];
  }, [summary]);

  const handlePublish = async () => {
    if (!pollId || publishing) {
      return;
    }

    const confirmed = window.confirm(
      "Publish results now? This will close responses and reveal the public summary.",
    );
    if (!confirmed) {
      return;
    }

    setPublishError(null);
    setPublishNotice(null);
    setPublishing(true);

    try {
      await apiClient.patch(`/polls/${pollId}/publish`);
      queryClient.setQueryData<AnalyticsResponse | undefined>(
        analyticsQueryKey,
        (prev) => (prev ? { ...prev, status: "published" } : prev),
      );
      setPublishNotice("Results published.");
    } catch (err) {
      if (axios.isAxiosError(err)) {
        setPublishError(err.response?.data?.message ?? "Failed to publish");
      } else {
        setPublishError("Failed to publish");
      }
    } finally {
      setPublishing(false);
    }
  };

  if (!pollId) {
    return (
      <section className="card stack">
        <h2 style={{ margin: 0 }}>Analytics</h2>
        <p className="muted">That link does not look like a valid poll id.</p>
        <Link className="button ghost" to="/app/polls">
          <span className="button-content">
            <ArrowLeft size={16} />
            Back to polls
          </span>
        </Link>
      </section>
    );
  }

  if (loading) {
    return (
      <section className="card stack">
        <h2 style={{ margin: 0 }}>Analytics</h2>
        <div className="stack">
          <div className="skeleton skeleton-title" style={{ width: "40%" }} />
          <div className="grid-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <div
                key={`analytics-skeleton-${index}`}
                className="poll-card skeleton skeleton-card"
              />
            ))}
          </div>
          <div className="skeleton skeleton-line" style={{ width: "60%" }} />
        </div>
      </section>
    );
  }

  if (!analytics || !summary) {
    return (
      <section className="card stack">
        <h2 style={{ margin: 0 }}>Analytics</h2>
        <p className="muted">
          {errorMessage || "Analytics data is unavailable."}
        </p>
        <Link className="button ghost" to="/app/polls">
          <span className="button-content">
            <ArrowLeft size={16} />
            Back to polls
          </span>
        </Link>
      </section>
    );
  }

  return (
    <section className="card stack">
      <div className="split">
        <div className="stack" style={{ gap: "0.35rem" }}>
          <h2 style={{ margin: 0 }}>{poll?.title ?? "Poll analytics"}</h2>
          {poll?.description ? (
            <p className="muted" style={{ marginTop: "0.35rem" }}>
              {poll.description}
            </p>
          ) : null}
          <div className="row">
            <span className="pill">Status: {analytics.status}</span>
            {lastSocketEvent ? (
              <span className="muted">Live: {lastSocketEvent}</span>
            ) : null}
          </div>
        </div>
        <div className="nav-actions">
          <Link className="button ghost" to="/app/polls">
            <span className="button-content">
              <ArrowLeft size={16} />
              Back to polls
            </span>
          </Link>
          <Link className="button ghost" to={`/app/polls/${pollId}/edit`}>
            <span className="button-content">
              <Pencil size={16} />
              Edit poll
            </span>
          </Link>
          <Link className="button ghost" to={`/p/${pollId}`}>
            <span className="button-content">
              <Link2 size={16} />
              Public link
            </span>
          </Link>
          <button
            className="button ghost"
            type="button"
            onClick={() => void handleCopyLink()}
          >
            <span className="button-content">
              <Copy size={16} />
              Copy link
            </span>
          </button>
          <button
            className="button ghost"
            type="button"
            onClick={() => void handleShareLink()}
          >
            <span className="button-content">
              <Share2 size={16} />
              Share
            </span>
          </button>
          {analytics.status !== "published" ? (
            <button
              className="button"
              type="button"
              onClick={() => void handlePublish()}
              disabled={publishing}
            >
              <span className="button-content">
                <UploadCloud size={16} />
                {publishing ? "Publishing..." : "Publish results"}
              </span>
            </button>
          ) : null}
          {analytics.status === "active" ? (
            <Link className="button live" to={`/app/polls/${pollId}/live`}>
              <span className="button-content">
                <Radio size={16} />
                Go Live
              </span>
            </Link>
          ) : null}
        </div>
      </div>

      {publishNotice ? <p className="muted">{publishNotice}</p> : null}
      {publishError ? <p className="muted">{publishError}</p> : null}
      {linkNotice ? <p className="muted">{linkNotice}</p> : null}
      {linkError ? <p className="muted">{linkError}</p> : null}

      <div className="grid-2">
        {metrics.map((metric) => (
          <div key={metric.label} className="poll-card stack">
            <span className="muted">{metric.label}</span>
            <strong style={{ fontSize: "1.3rem" }}>{metric.value}</strong>
          </div>
        ))}
      </div>

      {summary.totalResponses === 0 ? (
        <p className="muted">
          No responses yet. Share the poll to get started.
        </p>
      ) : null}

      {showTimeSeries ? (
        <div className="stack">
          <h3 style={{ margin: 0 }}>Response rate over time</h3>
          <div className="row" style={{ gap: "1rem", flexWrap: "wrap", alignItems: "center" }}>
            <label className="row" style={{ gap: "0.5rem" }}>
              <span className="muted">Bucket</span>
              <select
                className="input"
                style={{ width: "auto" }}
                value={seriesBucket}
                onChange={(e) =>
                  setSeriesBucket(e.target.value as "day" | "hour")
                }
              >
                <option value="day">Day</option>
                <option value="hour">Hour</option>
              </select>
            </label>
            <label className="field" style={{ minWidth: "12rem", flex: "1 1 200px" }}>
              <span className="muted">Time zone (IANA)</span>
              <input
                className="input"
                value={seriesTimezone}
                onChange={(e) => setSeriesTimezone(e.target.value)}
                spellCheck={false}
                placeholder="e.g. UTC or America/New_York"
              />
            </label>
          </div>
          {timeSeries.length === 0 ? (
            <p className="muted">No response history yet.</p>
          ) : (
            <div className="timeseries-table">
              <div className="timeseries-row timeseries-header">
                <span>{seriesBucket === "hour" ? "Hour" : "Day"}</span>
                <span>Complete</span>
                <span>Partial</span>
                <span>Total</span>
              </div>
              {timeSeries.map((point) => (
                <div key={point.bucket} className="timeseries-row">
                  <span>
                    {formatBucketDate(
                      point.bucket,
                      seriesBucket,
                      seriesTimezone,
                    )}
                  </span>
                  <span>{point.totalCompleteResponses}</span>
                  <span>{point.totalPartialResponses}</span>
                  <span>{point.totalResponses}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}

      <div className="stack">
        {summary.questions.map((question, index) => (
          <div key={question.questionId} className="question stack">
            <div className="split">
              <strong>
                {index + 1}. {question.prompt}
              </strong>
              {typeof question.dropOffCount === "number" ? (
                <span className="pill">Drop-offs: {question.dropOffCount}</span>
              ) : null}
            </div>

            <div className="stack" style={{ gap: "0.6rem" }}>
              {question.options.map((option) => (
                <div key={option.optionId} className="option-row">
                  <div className="stack" style={{ gap: "0.35rem" }}>
                    <span>{option.text}</span>
                    <div className="bar">
                      <span
                        style={{
                          width: `${Math.min(100, Math.max(0, option.percentage))}%`,
                        }}
                      />
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div>{option.count}</div>
                    <div className="muted">
                      {formatPercent(option.percentage)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
