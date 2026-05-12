type ClientEnv = {
  apiBase: string;
  socketBase: string;
  isDev: boolean;
  isProd: boolean;
  mode: string;
};

function normalizeBase(value: string): string {
  return value.replace(/\/+$/, "");
}

function readEnvBase(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
}

const rawApiBase = readEnvBase(import.meta.env.VITE_API_BASE);
const rawSocketBase = readEnvBase(import.meta.env.VITE_SOCKET_BASE);
const allowRemoteApi = import.meta.env.VITE_ALLOW_REMOTE_API === "true";

function isAbsoluteUrl(value: string): boolean {
  return /^(https?:|wss?:)\/\//i.test(value);
}

function shouldForceProxy(base: string): boolean {
  if (!import.meta.env.DEV || allowRemoteApi) {
    return false;
  }
  if (!isAbsoluteUrl(base)) {
    return false;
  }
  if (typeof window === "undefined") {
    return false;
  }
  return !base.startsWith(window.location.origin);
}

const normalizedApiBase = rawApiBase ? normalizeBase(rawApiBase) : "/api";
const normalizedSocketBase = rawSocketBase ? normalizeBase(rawSocketBase) : "";
const apiBase = shouldForceProxy(normalizedApiBase) ? "/api" : normalizedApiBase;
const socketBase = shouldForceProxy(normalizedSocketBase)
  ? ""
  : normalizedSocketBase;

export const clientEnv: ClientEnv = {
  apiBase,
  socketBase,
  isDev: import.meta.env.DEV,
  isProd: import.meta.env.PROD,
  mode: import.meta.env.MODE,
};
