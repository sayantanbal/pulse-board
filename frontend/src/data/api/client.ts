import axios, { type AxiosError, type InternalAxiosRequestConfig } from "axios";

const baseURL =
  typeof import.meta.env.VITE_API_BASE === "string" &&
  import.meta.env.VITE_API_BASE.length > 0
    ? import.meta.env.VITE_API_BASE
    : "/api";

export const apiClient = axios.create({
  baseURL,
  withCredentials: true,
  headers: { "Content-Type": "application/json" },
});

type RetriableConfig = InternalAxiosRequestConfig & { _retry?: boolean };

let refreshInFlight: Promise<void> | null = null;

async function refreshTokens(): Promise<void> {
  if (!refreshInFlight) {
    refreshInFlight = apiClient
      .post("/auth/refresh")
      .then(() => undefined)
      .finally(() => {
        refreshInFlight = null;
      });
  }

  await refreshInFlight;
}

function shouldSkipRefreshForUrl(url: string | undefined): boolean {
  if (!url) return true;
  return (
    url.includes("/auth/login") ||
    url.includes("/auth/register") ||
    url.includes("/auth/refresh")
  );
}

apiClient.interceptors.response.use(
  (r) => r,
  async (error: AxiosError & { config?: RetriableConfig }) => {
    const status = error.response?.status;
    const cfg = error.config;

    if (!cfg) {
      return Promise.reject(error);
    }

    if (shouldSkipRefreshForUrl(cfg.url ?? "")) {
      return Promise.reject(error);
    }

    if (status === 401 && !cfg._retry) {
      cfg._retry = true;

      try {
        await refreshTokens();
        return await apiClient.request(cfg);
      } catch (e) {
        return Promise.reject(e);
      }
    }

    return Promise.reject(error);
  },
);
