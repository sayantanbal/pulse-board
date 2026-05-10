import { env } from "./config/env.js";
import { createApp } from "./app.js";
import { connectDb } from "./lib/db.js";
import { createServer } from "node:http";
import { attachAnalyticsSocket } from "./socket/analytics.socket.js";

const app = createApp();
const httpServer = createServer(app);

async function main(): Promise<void> {
  await connectDb(env.MONGODB_URI);
  attachAnalyticsSocket(httpServer);
  httpServer.listen(env.PORT, () => {
    console.log(`API listening on http://127.0.0.1:${env.PORT}`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
