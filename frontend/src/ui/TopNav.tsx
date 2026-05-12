import { Link } from "react-router-dom";
import { List, LogIn, LogOut, UserPlus } from "lucide-react";
import { useAuth } from "../auth/AuthProvider";

export function TopNav() {
  const { user, logout } = useAuth();

  return (
    <nav className="top-nav">
      <Link to="/" className="top-nav-brand">
        <h1 className="top-nav-title">Pulse Board</h1>
      </Link>

      <div className="nav-actions">
        {user ? (
          <>
            <Link to="/app/polls" className="button ghost">
              <span className="button-content">
                <List size={16} />
                My Polls
              </span>
            </Link>
            <span className="muted">{user.email}</span>
            <button
              className="button ghost"
              type="button"
              onClick={() => void logout()}
            >
              <span className="button-content">
                <LogOut size={16} />
                Sign Out
              </span>
            </button>
          </>
        ) : (
          <>
            <Link to="/login" className="button ghost">
              <span className="button-content">
                <LogIn size={16} />
                Sign In
              </span>
            </Link>
            <Link to="/register" className="button">
              <span className="button-content">
                <UserPlus size={16} />
                Sign Up
              </span>
            </Link>
          </>
        )}
      </div>
    </nav>
  );
}
