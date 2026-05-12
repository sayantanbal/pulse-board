import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import { runtimeConfig } from "./config/runtime.js";
import { errorHandler } from "./policies/errorHandler.js";
import { installRoutes } from "./routes/index.js";

export function createApp(): express.Express {
  const app = express();

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
