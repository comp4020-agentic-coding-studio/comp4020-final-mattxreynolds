import express from "express";
import { readFileSync } from "node:fs";
import path from "node:path";
import { event, instrument, reportError } from "./telemetry.ts";
import { players } from "./players.ts";
import { renderReadme } from "./readme.ts";
import { logRoutes, roomRoutes } from "./rooms.ts";

const PORT = Number(process.env.PORT ?? 8080);
const DEV = process.env.NODE_ENV !== "production";
const root = path.resolve(import.meta.dirname, "..");

const app = express();
app.use(instrument);
app.use(express.json({ limit: "16kb" }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});
app.use("/api/players", players);
app.use("/api/rooms", roomRoutes);
app.use("/api/log", logRoutes);

app.get(["/readme", "/readme/"], (_req, res) => {
  res.type("html").send(renderReadme(path.join(root, "README.md")));
});
// Repository docs are private to the development workflow, including in dev.
app.use("/docs", (_req, res) => {
  res.sendStatus(404);
});

if (DEV) {
  const { createServer } = await import("vite");
  const vite = await createServer({
    configFile: path.join(root, "vite.config.ts"),
    server: { middlewareMode: true },
    appType: "spa",
  });
  app.use(vite.middlewares);
} else {
  const dist = path.join(root, "dist/client");
  const index = readFileSync(path.join(dist, "index.html"), "utf8");
  app.use(express.static(dist, { index: false }));
  app.use((_req, res) => {
    res.type("html").send(index);
  });
}

app.use(reportError);

app.listen(PORT, "0.0.0.0", () => {
  event("server.started", { port: PORT, mode: DEV ? "dev" : "production" });
});
