import type { PollWire } from "@pulse-board/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { useState } from "react";
import { Link } from "react-router-dom";
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
  const { notice: linkNotice, error: linkError, handleCopyLink, handleShareLink } = usePollLinks();

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

  return (
    <section className="card stack">
      <div className="split">
        <h2 style={{ margin: 0 }}>Your polls</h2>
        <Link className="button" to="/app/polls/new">
          New poll
        </Link>
      </div>

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
            Start a poll
          </Link>
        </div>
      ) : null}

      <div className="stack">
        {polls.map((poll) => (
          <div key={poll._id} className="poll-card stack">
            <div className="split">
              <div>
                <h3 style={{ margin: 0 }}>{poll.title}</h3>
                <p className="muted" style={{ margin: "0.35rem 0 0" }}>
                  Status: {poll.status} | Expires: {formatDate(poll.expiresAt)}
                </p>
              </div>
              <span className="pill">{poll.responseMode}</span>
            </div>
            {poll.description ? (
              <p className="muted">{poll.description}</p>
            ) : null}
            <div className="row">
              <Link className="button ghost" to={`/app/polls/${poll._id}/edit`}>
                Edit
              </Link>
              {poll.status !== "draft" ? (
                <Link
                  className="button ghost"
                  to={`/app/polls/${poll._id}/analytics`}
                >
                  Analytics
                </Link>
              ) : null}
              {poll.status !== "draft" ? (
                <Link className="button ghost" to={`/p/${poll._id}`}>
                  Public link
                </Link>
              ) : null}
              {poll.status !== "draft" ? (
                <button
                  className="button ghost"
                  type="button"
                  onClick={() => void handleCopyLink(poll._id)}
                >
                  Copy link
                </button>
              ) : null}
              {poll.status !== "draft" ? (
                <button
                  className="button ghost"
                  type="button"
                  onClick={() => void handleShareLink(poll._id, poll.title)}
                >
                  Share
                </button>
              ) : null}
              {poll.status !== "published" && poll.status !== "draft" ? (
                <button
                  className="button secondary"
                  type="button"
                  onClick={() => void handlePublish(poll._id)}
                  disabled={publishingId === poll._id}
                >
                  {publishingId === poll._id ? "Publishing..." : "Publish"}
                </button>
              ) : null}
              {poll.status !== "published" ? (
                <button
                  className="button ghost danger"
                  type="button"
                  onClick={() => void handleDelete(poll._id)}
                  disabled={deletingId === poll._id}
                >
                  {deletingId === poll._id ? "Deleting..." : "Delete"}
                </button>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
