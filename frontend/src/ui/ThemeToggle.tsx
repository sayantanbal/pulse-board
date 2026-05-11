import { useEffect, useState } from "react";

const STORAGE_KEY = "pb-theme";

/** Reads initial theme: stored preference → OS preference → light */
function getInitialTheme(): "dark" | "light" {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "dark" || stored === "light") return stored;
  } catch {
    // localStorage unavailable (SSR / private mode) — fall through
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/**
 * Toggles dark/light mode by adding/removing `data-theme="dark"` on <html>.
 * The CSS side uses [data-theme="dark"] selectors to override variables.
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<"dark" | "light">(getInitialTheme);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // ignore
    }
  }, [theme]);

  const toggle = () => setTheme((t) => (t === "dark" ? "light" : "dark"));

  return (
    <button
      id="theme-toggle"
      type="button"
      onClick={toggle}
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
      title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
      style={{
        background: "none",
        border: "1px solid rgba(148,163,184,0.4)",
        borderRadius: "999px",
        padding: "0.4rem 0.75rem",
        cursor: "pointer",
        fontSize: "1rem",
        lineHeight: 1,
        color: "inherit",
        transition: "background 0.2s, border-color 0.2s",
      }}
    >
      {theme === "dark" ? "☀️" : "🌙"}
    </button>
  );
}
