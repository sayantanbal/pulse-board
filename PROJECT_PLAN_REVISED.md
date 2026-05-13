Poll Platform — Project Plan	Revised 2026-05-10 · documentation synced 2026-05-13


# **1. Goals**
- Full-stack polling platform with auth, poll creation, public sharing, response collection, analytics, result publishing, and real-time updates.
- Support single-option questions, anonymous or authenticated responses, and expiry-based access control.
- Low-latency real-time analytics using Socket.IO rooms (not namespaces per poll).
- Single repository with /frontend and /backend folders under pnpm workspaces, plus a /packages/shared contract layer.

# **2. Functional Requirements**
## **2.1 Authenticated Poll Creator**
- Create polls: title, optional description, expiry datetime, response mode (anonymous | authenticated).
- Add questions: prompt text, single-choice options, required/optional flag, display order; optional **correct** option (`isCorrect`) per question for composite leaderboard scoring when any option is marked.
- Edit and delete polls before first response is received.
- View analytics dashboard: total responses, per-question option counts, completion rate, drop-off rate.
- Publish final results; after publishing the public poll link switches to results view.

## **2.2 Public Respondent**
- Open shared poll link — visible until expiry or publishing.
- Validate required questions client-side before submission.
- Submit response with smooth UX; prevent resubmission (session-based guard).
- After publishing: same link shows final results summary, submission disabled.

## **2.3 Analytics**
- Total responses and response rate over time.
- Per-question option counts and percentages.
- Completion rate (responses where status = complete) vs. drop-off rate (status = partial).
- Live updates via Socket.IO — dashboard and public results page both subscribe to poll room.

# **3. Non-Functional Requirements**
- Real-time: Socket.IO delta payloads — send incremental counts, never full dataset.
- Security: httpOnly cookies for JWT; refresh token rotation; protected routes on both client and server.
- Validation: Zod schemas shared via packages/shared — single source of truth for frontend and backend.
- Spam guard: hashed (SHA-256) IP + user-agent composite stored on anonymous Response docs for deduplication.
- Scalability: indexed queries on pollId, questionId; aggregate cache collection for O(1) count reads.

# **4. Tech Stack**

|**Layer**|**Choice**|
| :- | :- |
|Frontend|React + Vite, TypeScript, React Router v6|
|Forms / Validation|React Hook Form + Zod (schemas from packages/shared)|
|Styling|Tailwind CSS|
|State / Data|TanStack Query (React Query) for server state|
|Backend|Node.js + Express, TypeScript|
|Database|MongoDB with Mongoose|
|Realtime|Socket.IO — single /analytics namespace, rooms per pollId|
|Auth|JWT (access 15 min + refresh 7 d) stored in httpOnly cookies|
|Monorepo|pnpm workspaces: /frontend, /backend, /packages/shared|

# **5. Repository & Module Structure**
## **5.1 Monorepo Layout**

|**Structure**  Three workspace packages share a root `pnpm-workspace.yaml` (including optional `allowBuilds` for toolchain deps). The shared package is the contract layer — both frontend and backend import Zod schemas and TypeScript types from it.|
| :- |

|**Path**|**Contents**|
| :- | :- |
|/packages/shared|Zod schemas, TS types, error codes, constants, analytics query helpers — imported by both apps|
|/frontend/src/pages|Route screens (poll builder, analytics, live dashboard, public poll, auth)|
|/frontend/src/auth|Auth provider and route guards|
|/frontend/src/ui|Navigation, theme toggle, error boundary|
|/frontend/src/data|API client (axios), hooks, Socket.IO client|
|/backend/src/routes|Express routers (mounted paths include `/auth`, `/polls`, `/public`, `/analytics`, `/internal`)|
|/backend/src/socket|Socket.IO `/analytics` namespace and room emit helpers|
|/backend/src/services|Business logic and workflow orchestration|
|/backend/src/repositories|Mongoose model access — one file per collection|
|/backend/src/domain|Mongoose schemas, aggregates, invariants|
|/backend/src/policies|Auth middleware, validation middleware, error mapper|

# **6. Data Model (Revised)**

|**Key Change**  Questions and options are embedded inside the Poll document rather than stored as separate collections. At hackathon scope this eliminates N+1 joins and simplifies the API without any real downside. Separate collections would only pay off at thousands of questions.|
| :- |

## **6.1 User**

|**Field**|**Type / Notes**|
| :- | :- |
|\_id|ObjectId|
|email|String, unique, indexed|
|passwordHash|String (bcrypt)|
|createdAt|Date|

## **6.2 Poll (with embedded Questions and Options)**

|**Field**|**Type / Notes**|
| :- | :- |
|\_id|ObjectId|
|ownerId|ObjectId ref User, indexed|
|title|String|
|description|String, optional|
|expiresAt|Date, indexed|
|responseMode|Enum: anonymous | authenticated|
|status|Enum: draft | active | expired | published — stored; expiry can also transition active → expired lazily|
|allowCreatorResponses|Boolean|
|allowResponseChanges|Boolean|
|timerSeconds, timerMode (none \| attached \| detached), timerStartedAt|Optional timer behavior|
|questions|Array<{ \_id, prompt, isRequired, order, options: [{ \_id, text, order, isCorrect?: boolean }] }>|
|deletedAt|Soft-delete timestamp, optional|
|createdAt / updatedAt|Date|

## **6.3 Response**

|**Field**|**Type / Notes**|
| :- | :- |
|\_id|ObjectId|
|pollId|ObjectId, indexed|
|respondentId|ObjectId | null (null for anonymous)|
|status|Enum: partial | complete — enables drop-off analytics|
|ipHash|String (SHA-256 of IP+UA) for anonymous dedup — never exposed in API|
|answers|Array<{ questionId: ObjectId, optionId: ObjectId }>|
|createdAt|Date|

## **6.4 Aggregate (Cache — Mandatory)**

|**Field**|**Type / Notes**|
| :- | :- |
|\_id|ObjectId|
|pollId|ObjectId, indexed|
|questionId|ObjectId|
|optionId|ObjectId|
|count|Number|

Updated transactionally on each response submission. Socket.IO emits the delta. recomputeAggregates(pollId) is a fallback if the transaction fails.

# **7. API Surface (Revised)**
## **7.1 Auth**

|**Method + Path**|**Notes**|
| :- | :- |
|POST /auth/register|Hash password, issue access + refresh tokens|
|POST /auth/login|Verify credentials, issue tokens|
|POST /auth/logout|Clear httpOnly cookies|
|POST /auth/refresh|Rotate refresh token, issue new access token — REQUIRED|
|GET  /auth/me|Return current user from access token|

## **7.2 Polls (Owner)**

|**Method + Path**|**Notes**|
| :- | :- |
|POST   /polls|Create poll with embedded questions and options|
|GET    /polls|List polls owned by current user|
|GET    /polls/:id|Full poll with questions|
|PATCH  /polls/:id|Update poll metadata or questions (before responses)|
|DELETE /polls/:id|Delete poll when it has no responses (soft-delete via `deletedAt`)|
|PATCH  /polls/:id/publish|Transition status to published — PATCH, not POST|

## **7.3 Public**

|**Method + Path**|**Notes**|
| :- | :- |
|GET  /public/polls/:id|Return poll if active; return results summary if published|
|POST /public/polls/:id/responses|Validate expiry, required answers, dedup, persist, update aggregates, emit socket delta|

## **7.4 Analytics (Owner)**

|**Method + Path**|**Notes**|
| :- | :- |
|GET /analytics/polls/:id|Full analytics: total, per-question counts, completion rate, drop-off, time series — owner only|
|GET /analytics/polls/:id/summary|Published summary — for published polls|
|GET /analytics/polls/:id/leaderboard|Top leaderboard entries — owner only; speed-only or composite if options use `isCorrect` (see `SCORING_METRICS.md`)|

## **7.5 Operations (internal)**

|**Method + Path**|**Notes**|
| :- | :- |
|POST /internal/expire-polls|`Authorization: Bearer <INTERNAL_JOB_SECRET>` — expires active polls past `expiresAt` without waiting for traffic (optional Cloud Scheduler)|

# **8. Frontend Routes**

|**Route**|**Description**|
| :- | :- |
|/login|Login form|
|/register|Registration form|
|/app/polls|Owned poll list|
|/app/polls/new|Poll builder (create)|
|/app/polls/:id/edit|Poll builder (edit — disabled after first response)|
|/app/polls/:id/analytics|Analytics dashboard with live Socket.IO updates|
|/app/polls/:id/live|Creator live dashboard (timer, charts, leaderboard)|
|/p/:id|Public responder or published results view|
|/dev|Optional developer harness (non-production convenience)|

# **9. Auth Flow Detail**
- Access token: 15-minute expiry, stored in memory (React state) or short-lived httpOnly cookie.
- Refresh token: 7-day expiry, stored in httpOnly Secure cookie.
- POST /auth/refresh: validates refresh token, issues new access token, rotates refresh token (old token invalidated).
- Axios interceptor: on 401, calls /auth/refresh automatically, retries original request once.
- Logout: clears both cookies server-side; client resets query cache.

# **10. Real-time Plan (Revised)**

|**Key Change**  Use a single Socket.IO namespace (/analytics) with rooms per pollId. One namespace per poll would create O(n) namespace objects — expensive and unnecessary.|
| :- |

## **10.1 Server**
- On response submission: update Aggregate collection inside a Mongoose session (transaction).
- After commit: io.to(pollId).emit('delta', { questionId, optionId, newCount, totalResponses }).
- On transaction failure: call recomputeAggregates(pollId) as fallback, then emit full snapshot.

## **10.2 Client**
- Analytics dashboard: join poll room on mount, leave on unmount (Socket.IO client emits `join` / `leave` with `pollId`).
- On `delta`: merge counts into local UI state (and/or invalidate queries where used).
- Public poll page: same `/analytics` namespace subscription while poll status is **active** or **published** (live counts can update before formal publish).
- Reconnection: on reconnect, refetch public poll or analytics via HTTP to reconcile any missed deltas.

# **11. Validation Rules**
- Zod schemas live in packages/shared/src/schemas — single source of truth.
- Frontend: React Hook Form resolver uses shared Zod schemas directly.
- Backend: validation middleware parses req.body with same schemas before controller runs.
- Required questions: at least one option selected; backend rejects if any required questionId missing from answers array.
- Expiry: backend checks expiresAt < now() on every submission — reject with 410 Gone.
- Response mode: if responseMode = authenticated, reject submissions without valid JWT.
- Max options per question: 10 (enforced in Zod schema and UI).
- Anonymous dedup: prefer long-lived `anon_session` httpOnly cookie; fallback hash(IP + User-Agent) with a **24 h** lookback when matching existing responses per poll; cookie max-age is **30 days** (see shipped cookie policy).

# **12. Drop-off / Completion Analytics**
This was undeliverable in the original plan. The revised data model makes it computable:

- On partial submissions (user closes tab mid-way): POST /public/polls/:id/responses with status: partial and answers submitted so far.
- Frontend: beforeunload event triggers a partial submission if any answers were given but form not submitted.
- Completion rate = responses where status = complete / total responses.
- Drop-off rate = responses where status = partial / total responses.
- Per-question drop-off: count of partial responses where the answer array stops before a given question.

# **13. Performance Considerations**
- Aggregate collection: O(1) count reads — never recompute on analytics GET in the happy path.
- WebSocket payloads: delta only (questionId, optionId, newCount) — never full dataset.
- Indexes: pollId on Response and Aggregate; expiresAt on Poll for expiry sweep; ownerId on Poll for list query.
- Embedded questions: single document read for full poll — no populate() calls.
- TanStack Query: staleTime 30s for analytics; invalidated immediately on socket delta.

# **14. Milestones (Revised Order)**

|**Key Change**  WebSocket infrastructure moved to Milestone 2 so response submission emits from day one. Building analytics without sockets first would require retrofitting all emission logic.|
| :- |

|**#**|**Deliverable**|
| :- | :- |
|1|Monorepo scaffolding: pnpm workspaces, /frontend, /backend, /packages/shared, modular skeleton, shared Zod schemas|
|2|Auth flows: register, login, logout, refresh endpoint, httpOnly cookies, protected routes, axios interceptor|
|2b|Socket.IO infrastructure: /analytics namespace, room join/leave helpers, delta emit stub wired into response service|
|3|Poll builder: create and edit with embedded questions and options, Zod validation, max-options guard|
|4|Public poll responder: expiry check, required question validation, dedup, partial submission on beforeunload|
|5|Aggregate collection + analytics dashboard: per-question counts, completion rate, drop-off rate|
|6|Live updates: connect dashboard and public results to Socket.IO room, TanStack Query cache update on delta|
|7|Publish results: status transition, public results view on /p/:id after publishing|
|8|Polish: loading skeletons, error boundaries, empty states, README, deployment|

# **15. Evaluation Criteria Alignment**

|**Criterion**|**Points**|**Plan Coverage**|**Status**|
| :- | :- | :- | :- |
|Auth & Access Control|10 pts|JWT + refresh rotation, protected routes, response mode enforcement|**Addressed**|
|Poll Creation & Questions|15 pts|Embedded schema, Zod validation, max-options, edit guard|**Addressed**|
|Response Collection|15 pts|Expiry enforcement, required validation, dedup, partial tracking|**Improved**|
|Analytics Dashboard|15 pts|Aggregate cache, completion rate, drop-off — all computable|**Improved**|
|Frontend Experience|10 pts|RHF + Zod, loading skeletons, error boundaries, smooth UX|**Addressed**|
|Backend Architecture|15 pts|Layered modules, shared contracts, DELETE + PATCH routes added|**Improved**|
|WebSockets|10 pts|Single namespace + rooms, delta payloads, reconnect reconcile|**Improved**|
|Code Quality|10 pts|packages/shared as single truth, feature modules, typed end-to-end|**Addressed**|

# **16. Risks & Mitigations**

|**Risk**|**Mitigation**|
| :- | :- |
|Aggregate out of sync on transaction failure|recomputeAggregates(pollId) fallback; emit full snapshot instead of delta|
|Anonymous spam|Session cookie + SHA-256 hash of IP+UA; duplicate guard uses hash lookback (see `publicPoll.service`)|
|Refresh token theft|Refresh token rotation: each use issues a new token and invalidates the old one|
|Socket reconnect missed deltas|On reconnect, client triggers HTTP refetch of analytics to reconcile|
|Partial submission beacon fails|beforeunload uses navigator.sendBeacon for reliability; accepted as best-effort|
|N+1 on analytics GET|Aggregate collection is the read model — analytics endpoint never scans Response docs|

# **17. Deliverables**
- Single GitHub repository with /frontend, /backend, /packages/shared.
- Deployed URL (frontend + backend, both live).
- README: setup instructions, pnpm workspace commands, architecture diagram, environment variable reference.
- packages/shared published as internal workspace package — importable by both apps.
