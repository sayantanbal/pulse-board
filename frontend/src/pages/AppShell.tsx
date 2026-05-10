import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";

export function AppShell() {
  const { user, logout } = useAuth();

  return (
    <main className="page stack">
      <header className="app-header">
        <div>
          <h1 className="title">Pulse Board</h1>
          <p className="subtitle">
            Manage polls, track answers, publish results.
          </p>
        </div>
        <div className="stack" style={{ gap: "0.5rem" }}>
          <span className="pill">{user?.email ?? "Signed in"}</span>
          <button
            className="button secondary"
            type="button"
            onClick={() => void logout()}
          >
            Sign out
          </button>
        </div>
      </header>

      <nav className="app-nav">
        <NavLink to="/app/polls">Polls</NavLink>
        <NavLink to="/app/polls/new">New poll</NavLink>
        <span className="muted">Milestone 7: publish results</span>
      </nav>

      <Outlet />
    </main>
  );
}
