import { Hono } from "hono";
import { serve } from "@hono/node-server";

const HEARTBEAT_MS = Number(process.env.HEARTBEAT_MS ?? 15000);
const app = new Hono();
let open = 0;
let aborted = 0;
let cancelled = 0;
let cleaned = 0;
const log = (m: string) => console.log(`${new Date().toISOString()} ${m}`);

// Heartbeat + cleanup stream, via Hono's web-stream wrapper (streamSSE-free: raw ReadableStream).
app.get("/events", (c) => {
  const enc = new TextEncoder();
  let timer: NodeJS.Timeout | undefined;
  const id = ++open;
  const cleanup = (why: string) => {
    if (timer) {
      clearInterval(timer);
      timer = undefined;
      cleaned++;
      open--;
      log(`stream ${id} cleaned (${why}) open=${open}`);
    }
  };
  c.req.raw.signal.addEventListener("abort", () => {
    aborted++;
    cleanup("request signal abort");
  });
  const body = new ReadableStream({
    start(ctrl) {
      ctrl.enqueue(enc.encode(`event: state\ndata: {"full":true}\n\n`));
      timer = setInterval(() => ctrl.enqueue(enc.encode(`: hb\n\n`)), HEARTBEAT_MS);
    },
    cancel() {
      cancelled++;
      cleanup("ReadableStream cancel");
    },
  });
  return new Response(body, {
    headers: { "content-type": "text/event-stream", "cache-control": "no-cache" },
  });
});

// Backpressure: a producer that respects pull() and logs how far ahead it gets.
const CHUNK = 64 * 1024;
app.get("/flood", (c) => {
  const chunk = new TextEncoder().encode("x".repeat(CHUNK - 1) + "\n");
  let pulls = 0;
  let timer: NodeJS.Timeout | undefined;
  const body = new ReadableStream(
    {
      pull(ctrl) {
        pulls++;
        ctrl.enqueue(chunk);
        if (pulls % 50 === 0) log(`flood pulls=${pulls} (${((pulls * CHUNK) / 1e6).toFixed(1)} MB) rss=${(process.memoryUsage().rss / 1e6).toFixed(0)}MB`);
      },
      cancel() {
        log(`flood cancelled after pulls=${pulls}`);
      },
    },
    { highWaterMark: 4 },
  );
  void timer;
  return new Response(body, { headers: { "content-type": "application/octet-stream" } });
});

// Naive push-style producer that ignores backpressure (what an SSE broadcaster would do).
app.get("/push", (c) => {
  const chunk = new TextEncoder().encode(`data: ${"x".repeat(1023)}\n\n`);
  let n = 0;
  let timer: NodeJS.Timeout | undefined;
  const body = new ReadableStream({
    start(ctrl) {
      timer = setInterval(() => {
        n++;
        try {
          ctrl.enqueue(chunk);
        } catch {}
        if (n % 2000 === 0) log(`push n=${n} desiredSize=${ctrl.desiredSize} rss=${(process.memoryUsage().rss / 1e6).toFixed(0)}MB`);
      }, 1);
    },
    cancel() {
      clearInterval(timer);
      log(`push cancelled at n=${n}`);
    },
  });
  return new Response(body, { headers: { "content-type": "text/event-stream" } });
});

app.get("/stats", (c) => c.json({ open, aborted, cancelled, cleaned }));

const port = Number(process.env.PORT ?? 9039);
serve({ fetch: app.fetch, port }, () => log(`listening ${port} hb=${HEARTBEAT_MS}`));
