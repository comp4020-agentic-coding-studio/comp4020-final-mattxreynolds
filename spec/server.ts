import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";

/** Real routers, disposable caller-owned storage and captured JSON stdout. */
export async function boot(dir: string) {
  const child = spawn(process.execPath, ["--input-type=module", "-e", `
    import express from 'express';
    import { instrument, reportError } from './server/telemetry.ts';
    import { players } from './server/players.ts';
    import { roomRoutes, logRoutes } from './server/rooms.ts';
    const app = express(); app.use(instrument); app.use(express.json({limit:'16kb'}));
    app.use('/api/players', players); app.use('/api/rooms', roomRoutes); app.use('/api/log', logRoutes);
    app.get('/api/fault', () => { throw new Error('SECRET-ERROR-PAYLOAD'); });
    app.use(reportError);
    const s = app.listen(0, '127.0.0.1', () => console.log('PORT=' + s.address().port));
  `], { env: { ...process.env, DATA_DIR: dir }, stdio: ["ignore", "pipe", "pipe"] });
  let stderr = "", stdout = "", buffer = "";
  const events: Record<string, unknown>[] = [];
  child.stderr!.on("data", chunk => { stderr += chunk; });
  const port = await new Promise<number>((resolve, reject) => {
    const timer = setTimeout(() => { child.kill(); reject(new Error(`API did not start: ${stderr}`)); }, 5000);
    child.stdout!.on("data", data => {
      stdout += String(data); buffer += String(data);
      for (;;) {
        const end = buffer.indexOf("\n"); if (end === -1) break;
        const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
        if (line.startsWith("PORT=")) { clearTimeout(timer); resolve(Number(line.slice(5))); }
        else if (line.startsWith("{")) events.push(JSON.parse(line));
      }
    });
    child.once("error", e => { clearTimeout(timer); reject(e); });
    child.once("exit", () => { clearTimeout(timer); reject(new Error(stderr)); });
  });
  return { child, base: `http://127.0.0.1:${port}`, errors: () => stderr, output: () => stdout, events };
}
export async function stop(child: ChildProcess) {
  if (child.exitCode !== null) return;
  const ended = once(child, "exit"); child.kill("SIGTERM"); await ended;
}
