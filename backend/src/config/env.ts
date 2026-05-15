import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  MONGODB_URI: z.string().min(1),
  FRONTEND_ORIGIN: z.string().url().optional(),
  FRONTEND_ORIGINS: z.string().optional(),
  JWT_ACCESS_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  /** When set, `POST /internal/expire-polls` with `Authorization: Bearer <secret>` may transition due polls to `expired`. */
  INTERNAL_JOB_SECRET: z.string().min(8).optional(),
  IP_HASH_SALT: z.string().min(32),
  MAXMIND_DB_PATH: z.string().min(1).optional(),
});

export type Env = z.infer<typeof envSchema>;

export const env: Env = envSchema.parse(process.env);
