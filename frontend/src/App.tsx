import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./auth/AuthProvider";
import { RequireAuth } from "./auth/RequireAuth";
import { AppShell } from "./pages/AppShell";
import { DevHarness } from "./pages/DevHarness";
import { LoginPage } from "./pages/LoginPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { AnalyticsPage } from "./pages/AnalyticsPage";
import { PollBuilderPage } from "./pages/PollBuilderPage";
import { PollListPage } from "./pages/PollListPage";
import { PublicResultsPage } from "./pages/PublicResultsPage";
import { RegisterPage } from "./pages/RegisterPage";

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Navigate to="/app/polls" replace />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/dev" element={<DevHarness />} />
          <Route path="/p/:id" element={<PublicResultsPage />} />
          <Route element={<RequireAuth />}>
            <Route path="/app" element={<AppShell />}>
              <Route path="polls" element={<PollListPage />} />
              <Route path="polls/new" element={<PollBuilderPage />} />
              <Route path="polls/:id/edit" element={<PollBuilderPage />} />
              <Route path="polls/:id/analytics" element={<AnalyticsPage />} />
            </Route>
          </Route>
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
