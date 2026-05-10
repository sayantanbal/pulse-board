import mongoose from "mongoose";
import type { Env } from "../config/env.js";
import dns from "node:dns/promises";

// Only override DNS if we are in development mode
if (process.env.NODE_ENV === "development") {
  dns.setServers(["1.1.1.1", "8.8.8.8"]);
}

export async function connectDb(uri: Env["MONGODB_URI"]): Promise<void> {
  mongoose.set("strictQuery", true);
  await mongoose.connect(uri);
}

export async function disconnectDb(): Promise<void> {
  await mongoose.disconnect();
}
