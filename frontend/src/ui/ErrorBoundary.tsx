import type { ReactNode } from "react";
import { Component } from "react";
import { RefreshCcw } from "lucide-react";

type ErrorBoundaryProps = {
  children: ReactNode;
};

type ErrorBoundaryState = {
  hasError: boolean;
  message: string;
};

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false, message: "" };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    const message =
      error instanceof Error ? error.message : "Something went wrong.";
    return { hasError: true, message };
  }

  componentDidCatch(error: unknown): void {
    console.error(error);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <main className="page stack">
          <h1 className="title">Something went wrong</h1>
          <div className="card stack">
            <p className="muted">{this.state.message}</p>
            <button
              className="button"
              type="button"
              onClick={this.handleReload}
            >
              <span className="button-content">
                <RefreshCcw size={16} />
                Reload
              </span>
            </button>
          </div>
        </main>
      );
    }

    return this.props.children;
  }
}
