// One-line structured logs for lifecycle events. Never pass tokens here.

const quiet = process.env.LOG_QUIET === "1";

export function log(event: string, data: Record<string, unknown> = {}): void {
  if (quiet) return;
  const parts = Object.entries(data).map(([k, v]) => `${k}=${v}`);
  console.log(`${new Date().toISOString()} ${event}${parts.length ? " " + parts.join(" ") : ""}`);
}
