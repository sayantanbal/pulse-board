import { ERROR_CODES } from "@pulse-board/shared";
import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import { HttpError } from "./httpError.js";

export const errorHandler: ErrorRequestHandler = (err, _req, res, next) => {
  if (res.headersSent) {
    next(err);
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({
      code: ERROR_CODES.VALIDATION_FAILED,
      message: "Validation failed",
      details: err.flatten(),
    });
    return;
  }

  if (err instanceof HttpError) {
    res.status(err.status).json({
      code: err.code,
      message: err.message,
    });
    return;
  }

  const status =
    typeof err === "object" &&
    err &&
    "status" in err &&
    typeof (err as { status?: number }).status === "number"
      ? (err as { status: number }).status
      : 500;

  const message =
    err instanceof Error ? err.message : "Internal Server Error";

  res.status(status).json({
    code: status >= 500 ? ERROR_CODES.INTERNAL : ERROR_CODES.VALIDATION_FAILED,
    message: status >= 500 ? "Internal Server Error" : message,
  });
};
