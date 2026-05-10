/** Build the public voting URL for a given poll id. */
export function buildPublicUrl(pollId: string): string {
  return `${window.location.origin}/p/${pollId}`;
}

/**
 * Copy text to the system clipboard.
 * Tries the modern Clipboard API first; falls back to execCommand for
 * non-secure (HTTP) contexts where navigator.clipboard is unavailable.
 * Throws if neither method works.
 */
export async function copyToClipboard(text: string): Promise<void> {
  // Modern API — available on HTTPS / localhost
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  // Legacy fallback via a hidden textarea (works on HTTP)
  const el = document.createElement("textarea");
  el.value = text;
  el.style.cssText = "position:fixed;top:-9999px;left:-9999px;opacity:0";
  document.body.appendChild(el);
  el.focus();
  el.select();
  const ok = document.execCommand("copy");
  document.body.removeChild(el);
  if (!ok) {
    throw new Error("Clipboard unavailable");
  }
}

/**
 * Return true when the error should be silently ignored.
 * Covers:
 *  - AbortError  — user dismissed the native share sheet
 *  - NotAllowedError — browser denied share (desktop Chromium without gesture)
 */
export function isAbortError(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    (error.name === "AbortError" || error.name === "NotAllowedError")
  );
}
