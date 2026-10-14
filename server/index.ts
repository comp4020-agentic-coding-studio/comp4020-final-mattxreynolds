import { serve } from "@hono/node-server";
import { readFileSync } from "node:fs";
import type { Server } from "node:http";
import { resolve } from "node:path";
import { Hono } from "hono";
import { marked } from "marked";
import { createApi } from "./app.ts";
import { openDatabase } from "./database.ts";
import { rearmFinales } from "./finale.ts";
import { rearmPresence } from "./presence.ts";
import { serveSpa } from "./static.ts";

const root = resolve(import.meta.dirname, "..");
const port = Number(process.env.PORT ?? 8080);
const db = openDatabase(process.env.DATA_DIR ?? "/data");
rearmFinales(db);
rearmPresence(db);

// README.md is published in full at /readme/, rendered server-side so it is
// there with no script running.
const readme = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>README</title></head>
<body>${await marked.parse(readFileSync(resolve(root, "README.md"), "utf8"))}</body></html>`;

const app = new Hono();
app.get("/readme/", (c) => c.html(readme));
app.route("/api", createApi(db));
app.all("/api/*", (c) => c.json({ error: "not found" }, 404));
app.get("*", serveSpa(resolve(root, "dist")));

const server = serve({ fetch: app.fetch, port, hostname: "0.0.0.0" }, (info) => {
  console.log(`listening on port ${info.port}`);
});

// Fly and CI both run the image without --init, so nothing else forwards
// signals: stop accepting, checkpoint the WAL, close (ADR 0003).
function shutdown(): void {
  server.close(() => {
    db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
    db.close();
    process.exit(0);
  });
  (server as Server).closeAllConnections();
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
