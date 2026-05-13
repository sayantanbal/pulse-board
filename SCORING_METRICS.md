# Scoring and Metrics Procedure

This document outlines the current procedures for calculating leaderboard markings and average scores within the Pulse Board application.

**See also:** [`docs/PROJECT_DOCUMENTATION.md`](docs/PROJECT_DOCUMENTATION.md) (section 14 — leaderboard and scoring).

## 1. Leaderboard Marking (Individual Scores)

The leaderboard loads up to **300** complete responses with **`createdAt` ascending** and **`limit(300)`** — i.e. the **300 earliest** complete submissions still stored for the poll (not the latest 300). Each loaded row gets a speed score; then the API sorts and returns the **top 10**.

### Speed-only polls

If **no** question has an option marked `isCorrect: true`, scoring is **speed-only**:

- **Speed score:** within that loaded window only, index `i` (0-based, oldest row first) gets  
  `Math.round(((total - i) / total) * 500)` where `total` is the number of responses in the window (≤ 300).
- **Display rank:** sort by speed score descending, tie-break by earlier `createdAt`; take first 10; `score` shown is the speed score.

### Polls with marked correct answers

If at least one option has `isCorrect: true` on some question, those questions define an **accuracy** dimension:

- **Scored questions:** questions where some option has `isCorrect === true`.
- **Accuracy part:** `(correctCount / scoredQuestionCount) * 500`, where `correctCount` counts how many of those questions the respondent answered with an option marked `isCorrect`.
- **Composite score:** `Math.round(accuracyPart * 0.65 + speedScore * 0.35)` with `speedScore` as in the speed-only formula above.
- **Ranking:** sort by composite score **descending**, tie-break by earlier `createdAt`; top 10 rows are shown. The displayed **`score`** is the composite value.

Names: authenticated polls use the email local-part; anonymous polls use `Anonymous #rank` after reordering.

*File Reference:* `backend/src/services/analytics.service.ts` (`getPollLeaderboard`)

## 2. Average Leaderboard Score (Live Dashboard)

The **Avg leaderboard score** stat on the creator Live Dashboard is the **mean of the `score` values** for the current top-10 leaderboard entries returned by the API (same scoring rules as section 1 — speed-only or composite). If there are no leaderboard entries yet, the UI shows an em dash (—).

- **Formula:**

  ```javascript
  entries.length === 0
    ? "—"
    : Math.round(entries.reduce((s, e) => s + e.score, 0) / entries.length)
  ```

*File Reference:* `frontend/src/pages/CreatorLivePage.tsx`

---
*Note: Accuracy weights (65% / 35%) and the response window size (300) are implementation choices and can be tuned in `getPollLeaderboard`.*
