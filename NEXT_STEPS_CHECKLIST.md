# Next Steps Checklist (Prioritized)

Date: 2026-05-10

## P0 - Response rate over time analytics

Goal: Add a time-series view (responses per time bucket) so the analytics dashboard covers "response rate over time" from the plan.
Current state: Analytics returns totals and per-question aggregates only. See [backend/src/services/analytics.service.ts](backend/src/services/analytics.service.ts) and [frontend/src/pages/AnalyticsPage.tsx](frontend/src/pages/AnalyticsPage.tsx).
Backend scope: Add a time-series aggregation on responses (likely by hour or day) using `ResponseModel` grouped by bucket and `status`. Expose it either by extending the existing `/analytics/polls/:id` response or by adding a new `/analytics/polls/:id/timeseries` endpoint in [backend/src/routes/analytics.route.ts](backend/src/routes/analytics.route.ts).
Frontend scope: Render the time series on the analytics page, at minimum as a table with bucket label and counts, or add a small chart component. Keep it read-only and fetched with the existing query in [frontend/src/pages/AnalyticsPage.tsx](frontend/src/pages/AnalyticsPage.tsx).
Acceptance: Analytics response includes a deterministic list of time buckets with counts, and the UI renders it for any poll with responses.

## P1 - Draft status flow (decide + implement or remove)

Goal: Align the product with the plan's `draft` status by either fully supporting drafts or removing the status and plan mentions.
Current state: `draft` exists in the shared enum but there is no draft flow; new polls are created as `active`. See [packages/shared/src/schemas/common.ts](packages/shared/src/schemas/common.ts), [backend/src/repositories/poll.repository.ts](backend/src/repositories/poll.repository.ts), and [backend/src/domain/pollStatus.ts](backend/src/domain/pollStatus.ts).
Backend scope (if implementing): Allow poll creation as `draft`, add a transition action to set `active`, and ensure expiry checks do not override `draft`. This likely requires adding a new endpoint or extending the update flow in [backend/src/routes/poll.route.ts](backend/src/routes/poll.route.ts) and [backend/src/services/poll.service.ts](backend/src/services/poll.service.ts).
Frontend scope (if implementing): Add "Save as draft" and "Activate" actions in [frontend/src/pages/PollBuilderPage.tsx](frontend/src/pages/PollBuilderPage.tsx) and indicate draft status in [frontend/src/pages/PollListPage.tsx](frontend/src/pages/PollListPage.tsx).
Acceptance: Either (a) drafts are fully supported in UI and API with a clear transition to active, or (b) `draft` is removed from the schema and plan notes to match the shipped behavior.

## P1 - Poll delete in the UI

Goal: Surface the existing delete capability so creators can remove polls before responses exist.
Current state: The backend supports delete with a guard, but the UI does not call it. See [backend/src/routes/poll.route.ts](backend/src/routes/poll.route.ts) and [backend/src/services/poll.service.ts](backend/src/services/poll.service.ts).
Frontend scope: Add a "Delete" action (with confirmation) in [frontend/src/pages/PollListPage.tsx](frontend/src/pages/PollListPage.tsx). Optionally add a delete button on the edit screen in [frontend/src/pages/PollBuilderPage.tsx](frontend/src/pages/PollBuilderPage.tsx).
UX details: Disable or hide delete when status is `published` or when the API returns a conflict. Provide a clear error message for the "responses exist" case.
Acceptance: A poll without responses can be deleted from the UI, and the list updates immediately.

## P2 - Standardize data fetching and form handling

Goal: Make client code consistent with the plan by using TanStack Query for server state and React Hook Form + Zod where forms exist.
Current state: React Query is used on analytics only, while PollList and PollBuilder use custom state/requests. RHF is used for auth only. See [frontend/src/pages/AnalyticsPage.tsx](frontend/src/pages/AnalyticsPage.tsx), [frontend/src/pages/PollListPage.tsx](frontend/src/pages/PollListPage.tsx), and [frontend/src/pages/PollBuilderPage.tsx](frontend/src/pages/PollBuilderPage.tsx).
Scope: Convert PollList to `useQuery`, add mutations for create/update/publish/delete, and refactor PollBuilder to use RHF with the shared Zod schema from [packages/shared/src/schemas/poll.ts](packages/shared/src/schemas/poll.ts). Consider extracting a small API hook layer in [frontend/src/data/api/client.ts](frontend/src/data/api/client.ts).
Acceptance: Poll list and builder no longer do manual request state management, and form validation errors come from Zod consistently.

## P3 - Tailwind CSS alignment

Goal: Resolve the mismatch between the plan and the current styling approach.
Current state: Styling is custom CSS; Tailwind is not installed. See [frontend/package.json](frontend/package.json) and [frontend/src/index.css](frontend/src/index.css).
Option A (adopt Tailwind): Install Tailwind + PostCSS, configure Vite, and migrate class names to Tailwind utilities.
Option B (update plan): Keep the custom CSS and update the plan to reflect the real styling approach.
Acceptance: Either Tailwind is fully wired and used, or the plan explicitly documents the custom CSS choice.
