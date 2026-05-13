# Scoring and Metrics Procedure

This document outlines the current procedures for calculating leaderboard markings and average scores within the Pulse Board application.

## 1. Leaderboard Marking (Individual Scores)

The leaderboard considers up to **300** most recent complete responses (by `createdAt`), computes a score for each, then shows the **top 10** after sorting.

### Speed-only polls

If **no** question has an option marked `isCorrect: true`, scoring is **speed-only**:

- **Speed score:** among all complete responses sorted oldest-first, index `i` (0-based) gets  
  `Math.round(((total - i) / total) * 500)` where `total` is the number of responses in that window.
- **Display rank:** sort by speed score descending (same order as submission order for unique scores), take first 10; `score` shown is the speed score.

### Polls with marked correct answers

If at least one option has `isCorrect: true` on some question, those questions define an **accuracy** dimension:

- **Scored questions:** questions where some option has `isCorrect === true`.
- **Accuracy part:** `(correctCount / scoredQuestionCount) * 500`, where `correctCount` counts how many of those questions the respondent answered with an option marked `isCorrect`.
- **Composite score:** `Math.round(accuracyPart * 0.65 + speedScore * 0.35)` with `speedScore` as in the speed-only formula above.
- **Ranking:** sort by composite score **descending**, tie-break by earlier `createdAt`; top 10 rows are shown. The displayed **`score`** is the composite value.

Names: authenticated polls use the email local-part; anonymous polls use `Anonymous #rank` after reordering.

*File Reference:* `backend/src/services/analytics.service.ts` (`getPollLeaderboard`)

## 2. Average Leaderboard Score (Live Dashboard)

The **Avg leaderboard score** stat on the creator Live Dashboard is the **mean of the `score` values** for the current top-10 leaderboard entries returned by the API (same speed-based scores as section 1). If there are no leaderboard entries yet, the UI shows an em dash (—).

- **Formula:**

  ```javascript
  entries.length === 0
    ? "—"
    : Math.round(entries.reduce((s, e) => s + e.score, 0) / entries.length)
  ```

*File Reference:* `frontend/src/pages/CreatorLivePage.tsx`

---
*Note: Accuracy weights (65% / 35%) and the response window size (300) are implementation choices and can be tuned in `getPollLeaderboard`.*
