# Scoring and Metrics Procedure

This document outlines the current procedures for calculating leaderboard markings and average scores within the Pulse Board application.

## 1. Leaderboard Marking (Individual Scores)

At present, individual scores are not based on correctly answering questions, as options do not carry "right" or "wrong" values. Instead, the leaderboard is entirely **speed-based**, calculating a score based on how quickly users submit their completed responses.

- **Ranking Strategy:** Respondents are sorted in ascending order by their submission timestamp (`createdAt`). The fastest responder is placed at Rank 1.
- **Score Formula:** The score is calculated using the following formula:
  
  ```javascript
  Math.round(((total - index) / total) * 500)
  ```

  - `total`: The total number of complete responses included in the leaderboard calculation (capped at the top 10).
  - `index`: The 0-based index representing the user's rank (0 for 1st place, 1 for 2nd place, etc.).

**Example Scenario:**
If there are exactly 2 participants:
- **1st place (index 0):** `((2 - 0) / 2) * 500 = 500 points`
- **2nd place (index 1):** `((2 - 1) / 2) * 500 = 250 points`

*File Reference:* `backend/src/services/analytics.service.ts`

## 2. Average Score (Live Dashboard)

The "Avg score" displayed in the stats grid on the creator's Live Dashboard is currently **mocked functionality**. It does not aggregate the actual individual scores of participants.

Instead, the frontend computes a dummy percentage purely based on the total number of responses received.

- **Formula:** 
  
  ```javascript
  totalResponses > 0 ? `${Math.round(65 + totalResponses / 10)}%` : "—"
  ```

**Example Scenario:**
If there are exactly 2 participants:
- The calculation evaluates to `65 + (2 / 10) = 65.2`
- This is rounded to **65%** and displayed on the dashboard.

*File Reference:* `frontend/src/pages/CreatorLivePage.tsx`

---
*Note: If the application's scope expands to include correct/incorrect answers, these procedures will need to be refactored to incorporate accuracy-based grading logic.*
