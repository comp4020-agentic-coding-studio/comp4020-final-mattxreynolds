import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import type { ErrorRequestHandler, RequestHandler } from "express";

// Only call with deliberately selected fields. Never pass requests, Players,
// errors, bodies, headers, URLs or device snapshots to the log sink.
type Value = string | number | boolean | null | undefined | readonly string[];
const context = new AsyncLocalStorage<{ requestId: string }>();
export function event(name: string, fields: Record<string, Value> = {}): void {
  console.log(JSON.stringify({
    schema: 1, at: new Date().toISOString(), level: "info",
    event: name, ...context.getStore(), ...fields,
  }));
}

export const instrument: RequestHandler = (req, res, next) => {
  const requestId = randomUUID(); // never trust an incoming correlation header
  const started = performance.now();
  res.setHeader("x-request-id", requestId);
  context.run({ requestId }, () => {
    if (req.path.startsWith("/api/") && req.path !== "/api/health") {
      res.on("finish", () => {
        // Express route patterns omit user-supplied paths and secret SSE queries.
        event("request.completed", { requestId,
          method: req.method, route: req.route ? `${req.baseUrl}${req.route.path}` : "unmatched",
          status: res.statusCode, durationMs: Math.round(performance.now() - started),
        });
      });
    }
    next();
  });
};

export const reportError: ErrorRequestHandler = (error, _req, res, _next) => {
  // Parser errors can contain the offending payload in their message/body.
  const kind = error?.type === "entity.parse.failed" ? "invalid_json"
    : error?.type === "entity.too.large" ? "body_too_large" : "internal_error";
  const status = kind === "invalid_json" ? 400 : kind === "body_too_large" ? 413 : 500;
  event("request.failed", { kind, status, level: status === 500 ? "error" : "warn" });
  if (res.headersSent) { res.destroy(); return; }
  res.status(status).json({ error: kind, requestId: res.getHeader("x-request-id") });
};
