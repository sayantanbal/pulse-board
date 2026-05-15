import { describe, expect, it } from "vitest";
import {
  isAnonResponseClaimDuplicate,
  isDuplicateKeyError,
} from "./mongoErrors.js";

describe("mongoErrors", () => {
  it("isDuplicateKeyError detects code 11000", () => {
    expect(isDuplicateKeyError({ code: 11000 })).toBe(true);
    expect(isDuplicateKeyError({ code: 11001 })).toBe(false);
    expect(isDuplicateKeyError(new Error("no"))).toBe(false);
  });

  it("isAnonResponseClaimDuplicate matches claim index shape", () => {
    expect(
      isAnonResponseClaimDuplicate({
        code: 11000,
        keyPattern: { pollId: 1, dedupKey: 1 },
      }),
    ).toBe(true);
    expect(
      isAnonResponseClaimDuplicate({
        code: 11000,
        keyPattern: { pollId: 1, respondentId: 1 },
      }),
    ).toBe(false);
  });
});
