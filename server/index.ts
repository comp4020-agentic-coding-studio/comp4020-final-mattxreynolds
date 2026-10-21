// Entry point: one process serves pages, API, sockets and the client
// (docs/ARCHITECTURE.md). Listens on 0.0.0.0:$PORT as fly.toml requires.

import { createServer } from "node:http";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { openDb } from "./db.ts";
import { createApp, staticClient } from "./http.ts";
import { log } from "./log.ts";
import { Manager } from "./manager.ts";
import { attachSockets } from "./sockets.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.env.PORT ?? 8080);
const host = process.env.HOST ?? "0.0.0.0";
const dbPath = process.env.DATABASE_PATH ?? resolve(root, "data/below-waterline.sqlite");
const production = process.env.NODE_ENV === "production";
const testHooks = process.env.ENABLE_TEST_HOOKS === "1";

let db: ReturnType<typeof openDb>;
try {
  db = openDb(dbPath);
} catch (err) {
  console.error(`database.failed path=${dbPath}`, err);
  process.exit(1);
}
log("database.open", { path: dbPath });

const manager = new Manager(db);
const http = createServer();

async function devClient(app: import("express").Express): Promise<void> {
  // Vite is a devDependency, loaded only in development.
  const { createServer: createVite } = await import("vite");
  const vite = await createVite({
    root,
    server: { middlewareMode: true, hmr: { server: http } },
    appType: "custom",
  });
  app.use(vite.middlewares);
  const { readFileSync } = await import("node:fs");
  const sendIndex = async (req: import("express").Request, res: import("express").Response) => {
    const html = await vite.transformIndexHtml(req.originalUrl, readFileSync(resolve(root, "index.html"), "utf8"));
    res.type("html").send(html);
  };
  app.get("/", sendIndex);
  app.get("/v/:code", sendIndex);
}

const app = await createApp({
  root,
  db,
  manager,
  testHooks,
  client: production ? staticClient(root) : devClient,
});
http.on("request", app);
attachSockets(http, manager);
manager.start();

http.listen(port, host, () => {
  log("server.listening", { host, port, mode: production ? "production" : "development", testHooks });
});

let stopping = false;
function shutdown(signal: string): void {
  if (stopping) return;
  stopping = true;
  log("server.stopping", { signal });
  manager.stop();
  db.close();
  http.close();
  // sockets may hold the server open; we've flushed state, so leave now
  setTimeout(() => process.exit(0), 200).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
