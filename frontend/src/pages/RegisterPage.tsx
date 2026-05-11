import { registerBodySchema, type RegisterBody } from "@pulse-board/shared";
import { zodResolver } from "@hookform/resolvers/zod";
import axios from "axios";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";

export function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as { from?: { pathname?: string; search?: string } } | null;
  const redirectTo = state?.from
    ? `${state.from.pathname || ""}${state.from.search || ""}`
    : "/app/polls";

  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const {
    register: registerField,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterBody>({
    resolver: zodResolver(registerBodySchema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = handleSubmit(async (values) => {
    setError(null);

    try {
      await register(values);
      navigate(redirectTo, { replace: true });
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const message = err.response?.data?.message ?? err.message;
        setError(message || "Registration failed");
      } else {
        setError("Registration failed");
      }
    }
  });

  return (
    <main className="page stack">
      <header className="stack">
        <h1 className="title">Create your account</h1>
        <p className="subtitle">Start collecting responses in minutes.</p>
      </header>

      <section className="card stack">
        <form className="stack" onSubmit={onSubmit}>
          <label className="field">
            <span>Email</span>
            <input
              className="input"
              type="email"
              autoComplete="email"
              {...registerField("email")}
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
              autoComplete="new-password"
              {...registerField("password")}
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
            {isSubmitting ? "Creating…" : "Create account"}
          </button>
        </form>
        <p className="muted">
          Already have an account? <Link to="/login" state={state}>Sign in</Link>.
        </p>
      </section>
    </main>
  );
}
