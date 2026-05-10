import { useState } from "react";
import { buildPublicUrl, copyToClipboard, isAbortError } from "./pollLinks";

type LinkFeedback = {
  notice: string | null;
  error: string | null;
  clearFeedback: () => void;
  handleCopyLink: (pollId: string) => Promise<void>;
  handleShareLink: (pollId: string, title?: string) => Promise<void>;
};

/**
 * Provides copy-link and share-link handlers with notice/error feedback state.
 *
 * Usage:
 *   const { notice, error, clearFeedback, handleCopyLink, handleShareLink } = usePollLinks();
 */
export function usePollLinks(): LinkFeedback {
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const clearFeedback = () => {
    setNotice(null);
    setError(null);
  };

  const handleCopyLink = async (pollId: string): Promise<void> => {
    clearFeedback();
    try {
      await copyToClipboard(buildPublicUrl(pollId));
      setNotice("Public link copied.");
    } catch {
      setError("Unable to copy link.");
    }
  };

  const handleShareLink = async (
    pollId: string,
    title = "Pulse Board poll",
  ): Promise<void> => {
    clearFeedback();
    const url = buildPublicUrl(pollId);

    // Try the native share sheet first
    if (navigator.share) {
      try {
        await navigator.share({ title, url });
        setNotice("Share sheet opened.");
        return;
      } catch (err) {
        // User dismissed the share sheet — do nothing
        if (isAbortError(err)) {
          return;
        }
        // Browser denied share (e.g. desktop Chromium NotAllowedError) —
        // fall through to the clipboard fallback below
      }
    }

    // Clipboard fallback (also used when navigator.share is unavailable)
    try {
      await copyToClipboard(url);
      setNotice("Public link copied.");
    } catch {
      setError("Unable to copy link.");
    }
  };

  return { notice, error, clearFeedback, handleCopyLink, handleShareLink };
}
