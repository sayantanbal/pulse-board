import type { PollStatus, PollWire, ResponseMode } from "@pulse-board/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  BarChart3,
  Copy,
  Link2,
  Pencil,
  Plus,
  Share2,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { apiClient } from "../data/api/client";
import { usePollLinks } from "../data/usePollLinks";

function formatDate(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) {
    return "-";
  }
  return date.toLocaleString();
}

export function PollListPage() {
  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<PollStatus | "all">("all");
  const [responseModeFilter, setResponseModeFilter] = useState<
    ResponseMode | "all"
  >("all");
  const {
    notice: linkNotice,
    error: linkError,
    handleCopyLink,
    handleShareLink,
  } = usePollLinks();

  const pollsQuery = useQuery({
    queryKey: ["polls"],
    queryFn: async () => {
      const { data } = await apiClient.get<{ polls: PollWire[] }>("/polls");
      return data.polls;
    },
  });

  const publishMutation = useMutation({
    mutationFn: async (pollId: string) => {
      const { data } = await apiClient.patch<{ poll: PollWire }>(
        `/polls/${pollId}/publish`,
      );
      return data.poll;
    },
    onSuccess: (poll) => {
      queryClient.setQueryData<PollWire[]>(["polls"], (prev) =>
        prev ? prev.map((p) => (p._id === poll._id ? poll : p)) : prev,
      );
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (pollId: string) => {
      await apiClient.delete(`/polls/${pollId}`);
      return pollId;
    },
    onSuccess: (pollId) => {
      queryClient.setQueryData<PollWire[]>(["polls"], (prev) =>
        prev ? prev.filter((poll) => poll._id !== pollId) : prev,
      );
    },
  });

  const handlePublish = async (pollId: string) => {
    if (publishingId || deletingId) {
      return;
    }

    const confirmed = window.confirm(
      "Publish results now? This will close responses and reveal the public summary.",
    );
    if (!confirmed) {
      return;
    }

    setActionError(null);
    setActionNotice(null);
    setPublishingId(pollId);
    try {
      await publishMutation.mutateAsync(pollId);
    } catch (err) {
      if (axios.isAxiosError(err)) {
        setActionError(err.response?.data?.message ?? "Failed to publish");
      } else {
        setActionError("Failed to publish");
      }
    } finally {
      setPublishingId(null);
    }
  };

  const handleDelete = async (pollId: string) => {
    if (publishingId || deletingId) {
      return;
    }

    const confirmed = window.confirm(
      "Delete this poll? This cannot be undone.",
    );
    if (!confirmed) {
      return;
    }

    setActionError(null);
    setActionNotice(null);
    setDeletingId(pollId);

    try {
      await deleteMutation.mutateAsync(pollId);
    } catch (err) {
      if (axios.isAxiosError(err)) {
        setActionError(err.response?.data?.message ?? "Failed to delete");
      } else {
        setActionError("Failed to delete");
      }
    } finally {
      setDeletingId(null);
    }
  };

  const polls = pollsQuery.data ?? [];
  const loading = pollsQuery.isLoading;
  const error = pollsQuery.error;
  const errorMessage = axios.isAxiosError(error)
    ? (error.response?.data?.message ?? "Failed to load polls")
    : "Failed to load polls";
  const normalizedSearch = searchTerm.trim().toLowerCase();

  const filteredPolls = useMemo(() => {
    if (!polls.length) {
      return [] as PollWire[];
    }

    return polls.filter((poll) => {
      if (statusFilter !== "all" && poll.status !== statusFilter) {
        return false;
      }
      if (
        responseModeFilter !== "all" &&
        poll.responseMode !== responseModeFilter
      ) {
        return false;
      }
      if (!normalizedSearch) {
        return true;
      }

      const haystack = `${poll.title} ${poll.description ?? ""} ${poll._id}`
        .toLowerCase()
        .trim();
      return haystack.includes(normalizedSearch);
    });
  }, [polls, statusFilter, responseModeFilter, normalizedSearch]);

  const hasFilters =
    statusFilter !== "all" ||
    responseModeFilter !== "all" ||
    normalizedSearch.length > 0;

  const handleClearFilters = () => {
    setSearchTerm("");
    setStatusFilter("all");
    setResponseModeFilter("all");
  };

  return (
    <section className="card stack">
      <div className="split">
        <h2 style={{ margin: 0 }}>Your polls</h2>
        <div className="nav-actions">
          <Link className="button" to="/app/polls/new">
            <span className="button-content">
              <Plus size={16} />
              New poll
            </span>
          </Link>
        </div>
      </div>

      <div className="grid-3">
        <label className="field">
          <span>Search</span>
          <input
            className="input"
            type="search"
            placeholder="Title, description, or id"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
          />
        </label>
        <label className="field">
          <span>Status</span>
          <select
            className="input"
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(event.target.value as PollStatus | "all")
            }
          >
            <option value="all">All statuses</option>
            <option value="draft">Draft</option>
            <option value="active">Active</option>
            <option value="expired">Expired</option>
            <option value="published">Published</option>
          </select>
        </label>
        <label className="field">
          <span>Response mode</span>
          <select
            className="input"
            value={responseModeFilter}
            onChange={(event) =>
              setResponseModeFilter(event.target.value as ResponseMode | "all")
            }
          >
            <option value="all">All modes</option>
            <option value="anonymous">Anonymous</option>
            <option value="authenticated">Authenticated</option>
          </select>
        </label>
      </div>

      {polls.length ? (
        <div className="split" style={{ alignItems: "center" }}>
          <p className="muted" style={{ margin: 0 }}>
            Showing {filteredPolls.length} of {polls.length}
          </p>
          {hasFilters ? (
            <button
              className="button ghost"
              type="button"
              onClick={handleClearFilters}
            >
              Clear filters
            </button>
          ) : null}
        </div>
      ) : null}

      {loading ? (
        <div className="stack" aria-busy="true" aria-live="polite">
          {Array.from({ length: 3 }).map((_, index) => (
            <div
              key={`poll-skeleton-${index}`}
              className="poll-card skeleton skeleton-card"
            />
          ))}
        </div>
      ) : null}
      {pollsQuery.isError ? <p className="muted">{errorMessage}</p> : null}
      {actionError ? <p className="muted">{actionError}</p> : null}
      {actionNotice ? <p className="muted">{actionNotice}</p> : null}
      {linkError ? <p className="muted">{linkError}</p> : null}
      {linkNotice ? <p className="muted">{linkNotice}</p> : null}

      {!loading && !error && polls.length === 0 ? (
        <div className="stack">
          <p className="muted">No polls yet. Create your first poll.</p>
          <Link className="button ghost" to="/app/polls/new">
            <span className="button-content">
              <Plus size={16} />
              Start a poll
            </span>
          </Link>
        </div>
      ) : null}

      {!loading && !error && polls.length > 0 && filteredPolls.length === 0 ? (
        <div className="stack">
          <p className="muted">No polls match these filters.</p>
          {hasFilters ? (
            <button
              className="button ghost"
              type="button"
              onClick={handleClearFilters}
            >
              Clear filters
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="stack">
        {filteredPolls.map((poll) => {
          const canShare = poll.status !== "draft";
          const canPublish =
            poll.status !== "published" && poll.status !== "draft";
          const canDelete = poll.status !== "published";
          const canViewAnalytics = poll.status !== "draft";

          return (
            <div key={poll._id} className="poll-card stack">
              <div className="split">
                <div>
                  <h3 style={{ margin: 0 }}>{poll.title}</h3>
                  <p className="muted" style={{ margin: "0.35rem 0 0" }}>
                    Status: {poll.status} | Expires:{" "}
                    {formatDate(poll.expiresAt)}
                  </p>
                </div>
                <span className="pill">{poll.responseMode}</span>
              </div>
              {poll.description ? (
                <p className="muted">{poll.description}</p>
              ) : null}
              <div className="poll-actions">
                <div className="action-group">
                  <p className="action-label">Manage</p>
                  <div className="action-row">
                    <Link
                      className="button ghost"
                      to={`/app/polls/${poll._id}/edit`}
                    >
                      <span className="button-content">
                        <Pencil size={16} />
                        Edit
                      </span>
                    </Link>
                    {canViewAnalytics ? (
                      <Link
                        className="button ghost"
                        to={`/app/polls/${poll._id}/analytics`}
                      >
                        <span className="button-content">
                          <BarChart3 size={16} />
                          Analytics
                        </span>
                      </Link>
                    ) : null}
                    {canPublish ? (
                      <button
                        className="button secondary"
                        type="button"
                        onClick={() => void handlePublish(poll._id)}
                        disabled={publishingId === poll._id}
                      >
                        <span className="button-content">
                          <UploadCloud size={16} />
                          {publishingId === poll._id
                            ? "Publishing..."
                            : "Publish"}
                        </span>
                      </button>
                    ) : null}
                    {canDelete ? (
                      <button
                        className="button ghost danger"
                        type="button"
                        onClick={() => void handleDelete(poll._id)}
                        disabled={deletingId === poll._id}
                      >
                        <span className="button-content">
                          <Trash2 size={16} />
                          {deletingId === poll._id ? "Deleting..." : "Delete"}
                        </span>
                      </button>
                    ) : null}
                  </div>
                </div>
                {canShare ? (
                  <div className="action-group">
                    <p className="action-label">Share</p>
                    <div className="action-row">
                      <Link className="button ghost" to={`/p/${poll._id}`}>
                        <span className="button-content">
                          <Link2 size={16} />
                          Public link
                        </span>
                      </Link>
                      <button
                        className="button ghost"
                        type="button"
                        onClick={() => void handleCopyLink(poll._id)}
                      >
                        <span className="button-content">
                          <Copy size={16} />
                          Copy link
                        </span>
                      </button>
                      <button
                        className="button ghost"
                        type="button"
                        onClick={() =>
                          void handleShareLink(poll._id, poll.title)
                        }
                      >
                        <span className="button-content">
                          <Share2 size={16} />
                          Share
                        </span>
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
