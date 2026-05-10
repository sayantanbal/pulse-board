import type { ZodSchema } from "zod";

import type { RequestHandler } from "express";

export function validateBody<T>(schema: ZodSchema<T>): RequestHandler {
  return (req, _res, next) => {
    try {
      req.body = schema.parse(req.body) as typeof req.body;
      next();
    } catch (e) {
      next(e);
    }
  };
}
