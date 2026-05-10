# Pulse Board

Full-stack polling platform with authentication, poll creation, public sharing, response collection, analytics, publishing, and live updates.

## Workspace layout

- frontend: React + Vite app
- backend: Express API + Socket.IO
- packages/shared: Zod schemas and shared types

## Requirements

- Node.js
- pnpm
- MongoDB instance

## Setup

1. Install dependencies:

```bash
pnpm install
```

2. Configure backend env in backend/.env:

```bash
MONGODB_URI=mongodb://127.0.0.1:27017/pulse-board
FRONTEND_ORIGIN=http://localhost:5173
JWT_ACCESS_SECRET=replace-with-32-plus-chars
JWT_REFRESH_SECRET=replace-with-32-plus-chars
PORT=3000
```

3. Optional frontend env in frontend/.env:

```bash
VITE_API_BASE=http://localhost:3000
VITE_SOCKET_BASE=http://localhost:3000
```

## Development

Run each app in separate terminals:

```bash
pnpm dev:backend
pnpm dev:frontend
```

The frontend runs on http://localhost:5173 and proxies API requests to /api when configured.

## Build

```bash
pnpm build
```

## Deployment notes

- Build frontend with `pnpm --filter @pulse-board/frontend build` and serve the dist output.
- Start the backend with `pnpm --filter @pulse-board/backend start` and set all required env vars.
- Ensure `FRONTEND_ORIGIN` matches the deployed frontend URL so cookies are accepted.
- Configure `VITE_API_BASE` and `VITE_SOCKET_BASE` to point at the deployed backend.
