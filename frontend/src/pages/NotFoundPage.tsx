import { Link } from "react-router-dom";

export function NotFoundPage() {
  return (
    <main className="page stack">
      <h1 className="title">Page not found</h1>
      <div className="card stack">
        <p className="muted">We could not find that page.</p>
        <div className="nav-actions">
          <Link className="button ghost" to="/app/polls">
            Go to your polls
          </Link>
        </div>
      </div>
    </main>
  );
}
