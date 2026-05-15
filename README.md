# Pulse Board

Pulse Board is a shipped full-stack polling platform for creating polls, sharing public response links, collecting single-choice answers, publishing results, and watching live analytics update through WebSockets.

Production:

- Frontend: https://pulseboard.sayantanbal.in/
- Backend: https://pulse-board-backend-600719163026.asia-south1.run.app

Full project documentation: [docs/PROJECT_DOCUMENTATION.md](docs/PROJECT_DOCUMENTATION.md)

## Workspace

- `frontend`: React, Vite, TypeScript, React Router, TanStack Query, React Hook Form, custom CSS
- `backend`: Node.js, Express, TypeScript, MongoDB, Mongoose, Socket.IO
- `packages/shared`: shared Zod schemas, API wire types, constants, and error codes

The repository uses pnpm workspaces:

```bash
pnpm install
pnpm dev:backend
pnpm dev:frontend
pnpm build
pnpm typecheck
```

## Local Setup

Create `backend/.env`:

```bash
MONGODB_URI=mongodb://127.0.0.1:27017/pulse-board
FRONTEND_ORIGIN=http://localhost:5173
JWT_ACCESS_SECRET=replace-with-32-plus-chars
JWT_REFRESH_SECRET=replace-with-32-plus-chars
IP_HASH_SALT=replace-with-32-plus-chars
PORT=3000
```

Optional view-history geolocation (MaxMind GeoLite2 City):

```bash
# Download GeoLite2-City.mmdb from MaxMind and place at:
# backend/data/GeoLite2-City.mmdb
MAXMIND_DB_PATH=./data/GeoLite2-City.mmdb
```

Without the database file, view tracking still works; country/region/city are stored as null.

Optional `frontend/.env`:

```bash
VITE_API_BASE=http://localhost:3000
VITE_SOCKET_BASE=http://localhost:3000
```

In development, the Vite server also proxies `/api` and `/socket.io` to the backend.

## Deployment

The current deployment uses Google Cloud:

- Firebase Hosting serves `frontend/dist`.
- Cloud Run runs the backend container built from `Dockerfile`.
- MongoDB is the persistence layer.

Important production env vars:

```bash
NODE_ENV=production
PORT=8080
MONGODB_URI=...
FRONTEND_ORIGIN=https://pulseboard.sayantanbal.in
JWT_ACCESS_SECRET=...
JWT_REFRESH_SECRET=...
IP_HASH_SALT=...
# Optional: MAXMIND_DB_PATH=./data/GeoLite2-City.mmdb
```

Frontend build env:

```bash
VITE_API_BASE=https://pulse-board-backend-600719163026.asia-south1.run.app
VITE_SOCKET_BASE=https://pulse-board-backend-600719163026.asia-south1.run.app
```
