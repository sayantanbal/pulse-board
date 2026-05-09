# Poll Platform Project Plan

Date: 2026-05-10

## Goals

- Build a full-stack polling platform with authentication, poll creation, public sharing, response collection, analytics, publishing results, and real-time updates.
- Support single-option questions, anonymous or authenticated responses, and expiry-based access control.
- Ensure low-latency real-time analytics updates using WebSockets.
- Deliver in a single repository with separate /frontend and /backend folders.

## Functional Requirements

- Authenticated users can create polls with:
  - Title, description (optional), expiry time
  - Questions with single-choice options
  - Per-question required/optional flags
  - Response mode: anonymous or authenticated
- Public poll link for respondents:
  - Shows poll until expiry
  - Validates required questions
  - Submits responses with smooth UX
- Analytics dashboard for creators:
  - Total responses
  - Per-question option counts
  - Participation insights (completion rate, drop-off)
  - Live updates via WebSockets
- Publish final results:
  - After publishing, public poll link shows final results summary
  - Responses disabled if poll expired or published (configurable: allow viewing only)

## Non-Functional Requirements

- Low-latency real-time updates
- Secure auth and protected routes
- Input validation on frontend and backend
- Scalable schema design for hackathon scope

## Proposed Tech Stack

- Frontend: React + Vite, TypeScript, React Router, React Hook Form + Zod, Tailwind
- Backend: Node.js + Express, TypeScript
- Database: MongoDB (Mongoose)
- Realtime: Socket.IO (WebSockets)
- Auth: JWT (access + refresh) with httpOnly cookies
- Monorepo: pnpm workspaces

## High-Level Architecture

- Client (React):
  - Auth pages
  - Poll builder
  - Public poll responder
  - Analytics dashboard
- API (Express):
  - Auth endpoints
  - Poll CRUD
  - Response submission
  - Analytics endpoints
  - Publish results
- Realtime channel:
  - Socket.IO namespace per poll
  - Broadcast response count + per-question aggregates

## Repository Structure

- /frontend
  - React app and UI modules
- /backend
  - Express API, domain modules, and realtime
- Root
  - pnpm workspace config and shared scripts

## Modularity Approach (Maximal)

- Feature modules with clean boundaries and minimal cross-imports.
- Frontend layers:
  - Routes/pages (routing and layout composition)
  - Feature modules (polls, responses, analytics, auth)
  - Shared UI (design system, primitives, layout, forms)
  - Data access (API client, query hooks, WebSocket client)
  - Utilities (validation, formatting, guards)
- Backend layers:
  - Routes/controllers (HTTP and Socket.IO entrypoints)
  - Services (business rules, workflows)
  - Repositories (data access, Mongoose models)
  - Domain models (schemas, aggregates, invariants)
  - Shared policies (auth, validation, error mapping)
- Contract sharing to minimize duplication:
  - Schema-first with Zod or OpenAPI on backend, generate client types and validators for frontend.

## Data Model (Draft)

- User
  - \_id, email, passwordHash, createdAt
- Poll
  - \_id, ownerId, title, description, expiresAt, responseMode (anonymous|authenticated), isPublished, createdAt
- Question
  - \_id, pollId, prompt, isRequired, order
- Option
  - \_id, questionId, text, order
- Response
  - \_id, pollId, respondentId (nullable), createdAt
- Answer
  - \_id, responseId, questionId, optionId
- Aggregate (optional cache)
  - \_id, pollId, questionId, optionId, count

## API Surface (Draft)

- POST /auth/register
- POST /auth/login
- POST /auth/logout
- GET /auth/me

- POST /polls
- GET /polls (owned)
- GET /polls/:id
- PATCH /polls/:id
- POST /polls/:id/publish

- GET /public/polls/:id
- POST /public/polls/:id/responses

- GET /analytics/polls/:id (owner only)
- GET /analytics/polls/:id/summary (public if published)

## Frontend Routes (Draft)

- /login, /register
- /app/polls (list)
- /app/polls/new
- /app/polls/:id/edit
- /app/polls/:id/analytics
- /p/:id (public poll)

## Validation Rules

- Required questions must have a selected option
- Poll expiry enforced on both frontend (disable submit) and backend (reject submissions)
- Response mode enforced on backend
- Max options per question (define limit for UX consistency)

## Realtime Plan

- On response submission:
  - Update aggregates in DB (transaction)
  - Emit websocket event with deltas
- Client dashboard subscribes to poll room
- Public results page subscribes to same room after publishing

## Performance Considerations

- Keep websocket payloads small (send deltas, not full datasets)
- Cache aggregates per poll with option counts
- Use indexed queries on pollId and questionId

## Milestones

1. Repo scaffolding (pnpm workspaces, /frontend, /backend, modular skeleton)
2. Auth flows + protected routes
3. Poll builder (create/edit)
4. Public poll responder + validation
5. Analytics dashboard + aggregation
6. Publish results + public summary
7. WebSocket live updates
8. Final polish + README + deployment

## Evaluation Criteria

- Authentication & Access Control · 10
- Poll Creation & Question Management · 15
- Response Collection Flow · 15
- Analytics & Feedback Dashboard · 15
- Frontend Experience · 10
- Backend Architecture & API Design · 15
- Real-Time Updates Using WebSockets · 10
- Code Quality & Project Structure · 10

## Risks & Mitigations

- Real-time latency: use Socket.IO rooms and minimal payloads; avoid heavy recompute
- Data consistency: update aggregates in transaction; fallback to recompute if needed
- Expiry enforcement: check on server for every submission

## Deliverables

- Single repo with /frontend and /backend
- Deployed URL
- README with setup, scripts, and architecture notes
