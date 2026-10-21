// Express app: pages, JSON API and the built client.

import express, { type Request, type Response } from "express";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Db } from "./db.ts";
import type { Manager, SeatError } from "./manager.ts";
import { historyPage, notFoundPage, readmePage } from "./pages.ts";

const SEAT_ERROR_STATUS: Record<SeatError, number> = {
  "bad-callsign": 400,
  "not-found": 404,
  full: 409,
  ended: 409,
};

export type HttpOptions = {
  root: string;
  db: Db;
  manager: Manager;
  testHooks: boolean;
  /** Serves the client: static dist/ in production, Vite middleware in dev. */
  client: (app: express.Express) => Promise<void> | void;
};

export async function createApp(opts: HttpOptions): Promise<express.Express> {
  const { root, db, manager } = opts;
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "4kb" }));

  app.get("/healthz", (_req, res) => {
    res.json({ ok: true });
  });

  // Express matches a trailing slash loosely, so redirect the bare form by hand.
  app.use((req, res, next) => {
    if (req.path === "/readme" || req.path === "/history") res.redirect(301, req.path + "/");
    else next();
  });
  app.get("/readme/", (_req, res) => {
    const md = readFileSync(join(root, "README.md"), "utf8");
    res.type("html").send(readmePage(md));
  });
  // Images the README links relatively (docs/*.png) resolve at /readme/ too.
  app.use("/docs", express.static(join(root, "docs"), { index: false, extensions: [] }));

  app.get("/history/", (_req, res) => {
    res.type("html").send(historyPage(db.history(100), db.stats()));
  });
  app.get("/api/history", (_req, res) => {
    res.json({ voyages: db.history(100), stats: db.stats() });
  });

  const seatReply = (res: Response, r: ReturnType<Manager["create"]>): void => {
    if (typeof r === "string") res.status(SEAT_ERROR_STATUS[r]).json({ error: r });
    else res.status(201).json(r);
  };
  app.post("/api/voyages", (req: Request, res: Response) => {
    seatReply(res, manager.create(req.body?.callsign));
  });
  app.post("/api/voyages/:code/join", (req: Request, res: Response) => {
    seatReply(res, manager.join(req.params.code, req.body?.callsign));
  });
  app.get("/api/voyages/:code", (req: Request, res: Response) => {
    const p = manager.peek(req.params.code);
    if (!p) res.status(404).json({ error: "not-found" });
    else res.json(p);
  });

  if (opts.testHooks) {
    // Test-only: lets specs jump to a phase or read hidden config. Never in production.
    app.get("/api/test/voyages/:code", (req, res) => {
      const v = manager.testVoyage(String(req.params.code));
      if (!v) res.status(404).end();
      else res.json(v);
    });
    app.post("/api/test/voyages/:code/patch", (req, res) => {
      const v = manager.testVoyage(String(req.params.code));
      if (!v) return void res.status(404).end();
      deepMerge(v as unknown as Record<string, unknown>, req.body ?? {});
      manager.testChanged(v.code);
      res.json({ ok: true });
    });
    app.get("/api/test/voyages/:code/events", (req, res) => {
      const v = manager.testVoyage(String(req.params.code));
      if (!v) res.status(404).end();
      else res.json(db.events(v.id));
    });
  }

  await opts.client(app);

  app.use((_req, res) => {
    res.status(404).type("html").send(notFoundPage());
  });
  return app;
}

function deepMerge(target: Record<string, unknown>, patch: Record<string, unknown>): void {
  for (const [k, val] of Object.entries(patch)) {
    const cur = target[k];
    if (val && typeof val === "object" && !Array.isArray(val) && cur && typeof cur === "object" && !Array.isArray(cur)) {
      deepMerge(cur as Record<string, unknown>, val as Record<string, unknown>);
    } else {
      target[k] = val;
    }
  }
}

/** Production: serve dist/, with the SPA shell for / and /v/:code. */
export function staticClient(root: string) {
  return (app: express.Express): void => {
    const dist = resolve(root, "dist");
    const indexFile = join(dist, "index.html");
    app.use(express.static(dist, { index: false, maxAge: "1h" }));
    const sendIndex = (_req: Request, res: Response): void => {
      if (!existsSync(indexFile)) {
        res.status(503).type("text").send("Client not built: run `pnpm build`.");
        return;
      }
      res.setHeader("Cache-Control", "no-cache");
      // `root` keeps send's dotfile check to the path below dist/, so a checkout
      // under a dot-directory (e.g. .claude/worktrees) still serves the shell.
      res.sendFile("index.html", { root: dist });
    };
    app.get("/", sendIndex);
    app.get("/v/:code", sendIndex);
  };
}
