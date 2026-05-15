import { describe, expect, it } from "vitest";
import { hashIP } from "./ipHasher.js";

describe("hashIP", () => {
  it("produces a 64-character hex string", () => {
    const hash = hashIP("192.168.1.1");
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("is deterministic for the same IP", () => {
    expect(hashIP("10.0.0.1")).toBe(hashIP("10.0.0.1"));
  });

  it("differs for different IPs", () => {
    expect(hashIP("10.0.0.1")).not.toBe(hashIP("10.0.0.2"));
  });
});
