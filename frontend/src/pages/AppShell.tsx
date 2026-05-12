import { NavLink, Outlet } from "react-router-dom";
import { LogOut } from "lucide-react";
import { useAuth } from "../auth/AuthProvider";
import { ThemeToggle } from "../ui/ThemeToggle";

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
        <div className="nav-actions">
          <ThemeToggle />
          <span className="pill">{user?.email ?? "Signed in"}</span>
          <button
            className="button secondary"
            type="button"
            onClick={() => void logout()}
          >
            <span className="button-content">
              <LogOut size={16} />
              Sign out
            </span>
          </button>
        </div>
      </header>

      <nav className="app-nav">
        <NavLink
          to="/app/polls"
          end
          className={({ isActive }) =>
            `button ghost${isActive ? " active" : ""}`
          }
        >
          Polls
        </NavLink>
        <NavLink to="/app/polls/new" className="button">
          New poll
        </NavLink>
      </nav>

      <Outlet />
    </main>
  );
}
