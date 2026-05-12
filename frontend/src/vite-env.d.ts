/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE?: string;
  readonly VITE_SOCKET_BASE?: string;
  readonly VITE_ALLOW_REMOTE_API?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
