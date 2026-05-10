import type { AuthUserWire } from "@pulse-board/shared";

declare global {
  namespace Express {
    interface Request {
      /** Set by `requireAuth` after access JWT is verified. */
      user?: AuthUserWire;
    }
  }
}

export {};
