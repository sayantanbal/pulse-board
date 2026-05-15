import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import { runtimeConfig } from "./config/runtime.js";
import { errorHandler } from "./policies/errorHandler.js";
import { installRoutes } from "./routes/index.js";

export function createApp(): express.Express {
  const app = express();

  // Cloud Run (and similar) terminates TLS at the edge; trust the first proxy hop so
  // `req.ip` and express-rate-limit see the real client from `X-Forwarded-For`.
  app.set("trust proxy", 1);

  app.use(
    cors({
      origin: runtimeConfig.corsOrigin,
      credentials: true,
    }),
  );
  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser());

  installRoutes(app);

  app.use(errorHandler);
  return app;
}
