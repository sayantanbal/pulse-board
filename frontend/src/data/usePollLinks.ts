import { toast } from "sonner";
import { buildPublicUrl, copyToClipboard, isAbortError } from "./pollLinks";

type LinkFeedback = {
  /** @deprecated feedback is now delivered via sonner toasts — kept for backward compat */
  notice: null;
  /** @deprecated feedback is now delivered via sonner toasts — kept for backward compat */
  error: null;
  clearFeedback: () => void;
  handleCopyLink: (pollId: string) => Promise<void>;
  handleShareLink: (pollId: string, title?: string) => Promise<void>;
};

/**
 * Provides copy-link and share-link handlers with sonner toast feedback.
 *
 * Usage:
 *   const { handleCopyLink, handleShareLink } = usePollLinks();
 */
export function usePollLinks(): LinkFeedback {
  const clearFeedback = () => { /* no-op — feedback via toasts */ };

  const handleCopyLink = async (pollId: string): Promise<void> => {
    try {
      await copyToClipboard(buildPublicUrl(pollId));
      toast.success("Link copied!", {
        description: "Share this link with respondents.",
        duration: 3000,
      });
    } catch {
      toast.error("Unable to copy link", {
        description: "Please copy the URL from your browser address bar.",
      });
    }
  };

  const handleShareLink = async (
    pollId: string,
    title = "Pulse Board poll",
  ): Promise<void> => {
    const url = buildPublicUrl(pollId);

    // Try the native share sheet first
    if (navigator.share) {
      try {
        await navigator.share({ title, url });
        return;
      } catch (err) {
        // User dismissed the share sheet — do nothing
        if (isAbortError(err)) {
          return;
        }
        // Browser denied share — fall through to clipboard fallback
      }
    }

    // Clipboard fallback (also used when navigator.share is unavailable)
    try {
      await copyToClipboard(url);
      toast.success("Link copied!", {
        description: "Share this link with respondents.",
        duration: 3000,
      });
    } catch {
      toast.error("Unable to copy link", {
        description: "Please copy the URL from your browser address bar.",
      });
    }
  };

  return { notice: null, error: null, clearFeedback, handleCopyLink, handleShareLink };
}
