import { ERROR_CODES } from "@pulse-board/shared";
import type { UserDoc } from "../domain/user.model.js";
import { UserModel } from "../domain/user.model.js";
import { HttpError } from "../policies/httpError.js";

function isDuplicateKeyError(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    "code" in e &&
    (e as { code: unknown }).code === 11_000
  );
}

export async function createUser(
  email: string,
  passwordHash: string,
): Promise<UserDoc> {
  try {
    return await UserModel.create({
      email: email.toLowerCase(),
      passwordHash,
    });
  } catch (e: unknown) {
    if (isDuplicateKeyError(e)) {
      throw new HttpError(
        409,
        ERROR_CODES.CONFLICT,
        "Email is already registered",
      );
    }
    throw e;
  }
}

export async function findUserByEmailNormalized(email: string) {
  return UserModel.findOne({ email: email.toLowerCase() });
}
