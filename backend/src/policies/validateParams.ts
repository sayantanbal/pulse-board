import type { RequestHandler } from "express";
import type { ZodSchema } from "zod";

export function validateParams<T>(schema: ZodSchema<T>): RequestHandler {
  return (req, _res, next) => {
    try {
      req.params = schema.parse(req.params) as typeof req.params;
      next();
    } catch (e) {
      next(e);
    }
  };
}
