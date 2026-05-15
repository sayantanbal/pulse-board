import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "./app.js";

describe("createApp", () => {
  it("trusts one proxy hop for correct client IP behind reverse proxies", () => {
    const app = createApp();
    expect(app.get("trust proxy")).toBe(1);
  });

  it("GET /health returns ok", async () => {
    const app = createApp();
    const res = await request(app).get("/health").expect(200);
    expect(res.body).toEqual({ ok: true });
  });

  it("GET /ready returns 503 when Mongo is not connected", async () => {
    const app = createApp();
    const res = await request(app).get("/ready").expect(503);
    expect(res.body).toEqual({ ok: false });
  });
});
