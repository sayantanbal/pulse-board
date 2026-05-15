import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../app.js";

describe("GET /analytics/polls/:id/views", () => {
  it("returns 401 without authentication", async () => {
    const app = createApp();
    const res = await request(app).get(
      "/analytics/polls/507f1f77bcf86cd799439011/views",
    );
    expect(res.status).toBe(401);
  });
});

describe("GET /analytics/polls/:id/views/summary", () => {
  it("returns 401 without authentication", async () => {
    const app = createApp();
    const res = await request(app).get(
      "/analytics/polls/507f1f77bcf86cd799439011/views/summary",
    );
    expect(res.status).toBe(401);
  });
});
