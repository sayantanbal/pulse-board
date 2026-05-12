import { loginBodySchema, type LoginBody } from "@pulse-board/shared";
import { zodResolver } from "@hookform/resolvers/zod";
import axios from "axios";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { LogIn } from "lucide-react";
import { useAuth } from "../auth/AuthProvider";

type LocationState = {
  from?: { pathname?: string; search?: string };
};

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as LocationState | null;
  const redirectTo = state?.from
    ? `${state.from.pathname || ""}${state.from.search || ""}`
    : "/app/polls";

  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginBody>({
    resolver: zodResolver(loginBodySchema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = handleSubmit(async (values) => {
    setError(null);

    try {
      await login(values);
      navigate(redirectTo, { replace: true });
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const message = err.response?.data?.message ?? err.message;
        setError(message || "Login failed");
      } else {
        setError("Login failed");
      }
    }
  });

  return (
    <main className="page stack">
      <header className="stack">
        <h1 className="title">Pulse Board</h1>
        <p className="subtitle">Welcome back. Sign in to manage your polls.</p>
      </header>

      <section className="card stack">
        <form className="stack" onSubmit={onSubmit}>
          <label className="field">
            <span>Email</span>
            <input
              className="input"
              type="email"
              autoComplete="email"
              {...register("email")}
              required
            />
            {errors.email ? (
              <span className="muted">{errors.email.message}</span>
            ) : null}
          </label>
          <label className="field">
            <span>Password</span>
            <input
              className="input"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              {...register("password")}
              required
            />
            {errors.password ? (
              <span className="muted">{errors.password.message}</span>
            ) : null}
          </label>
          <label className="row">
            <input
              type="checkbox"
              checked={showPassword}
              onChange={(event) => setShowPassword(event.target.checked)}
            />
            <span>Show password</span>
          </label>
          {error ? <p className="muted">{error}</p> : null}
          <button className="button" type="submit" disabled={isSubmitting}>
            <span className="button-content">
              <LogIn size={16} />
              {isSubmitting ? "Signing in…" : "Sign in"}
            </span>
          </button>
        </form>
        <p className="muted">
          New here?{" "}
          <Link to="/register" state={state}>
            Create an account
          </Link>
          .
        </p>
      </section>
    </main>
  );
}
