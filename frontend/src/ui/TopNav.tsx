import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";

export function TopNav() {
  const { user, logout } = useAuth();

  return (
    <nav style={{
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      padding: "1rem 2rem",
      borderBottom: "1px solid rgba(255, 255, 255, 0.1)",
      background: "rgba(0, 0, 0, 0.2)",
    }}>
      <Link to="/" style={{ textDecoration: "none", color: "inherit" }}>
        <h1 style={{ margin: 0, fontSize: "1.5rem" }}>Pulse Board</h1>
      </Link>
      
      <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
        {user ? (
          <>
            <Link to="/app/polls" className="button ghost">
              My Polls
            </Link>
            <span style={{ color: "#94a3b8" }}>{user.email}</span>
            <button
              className="button ghost"
              type="button"
              onClick={() => void logout()}
            >
              Sign Out
            </button>
          </>
        ) : (
          <>
            <Link to="/login" className="button ghost">
              Sign In
            </Link>
            <Link to="/register" className="button">
              Sign Up
            </Link>
          </>
        )}
      </div>
    </nav>
  );
}
