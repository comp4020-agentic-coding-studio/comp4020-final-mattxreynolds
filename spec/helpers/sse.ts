// A minimal SSE reader over fetch, so a spec can read the raw frames
// (including ": heartbeat" comments, which EventSource hides).
export interface SseStream {
  /** Resolves with the next frame as raw text, or rejects after `ms`. */
  next(ms?: number): Promise<string>;
  close(): void;
}

export async function openSse(url: URL, cookie: string): Promise<{ status: number; stream: SseStream }> {
  const abort = new AbortController();
  const res = await fetch(url, { headers: { cookie, accept: "text/event-stream" }, signal: abort.signal });
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const stream: SseStream = {
    async next(ms = 3000) {
      const deadline = Date.now() + ms;
      for (;;) {
        const end = buffer.indexOf("\n\n");
        if (end !== -1) {
          const frame = buffer.slice(0, end);
          buffer = buffer.slice(end + 2);
          return frame;
        }
        const left = deadline - Date.now();
        if (left <= 0) throw new Error(`no SSE frame within ${ms} ms`);
        const chunk = await Promise.race([
          reader.read(),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`no SSE frame within ${ms} ms`)), left)),
        ]);
        if (chunk.done) throw new Error("stream ended");
        buffer += decoder.decode(chunk.value, { stream: true });
      }
    },
    close() {
      abort.abort();
    },
  };
  return { status: res.status, stream };
}

/** Parses `event: x\ndata: {...}` into its name and JSON data. */
export function parseFrame(frame: string): { event: string; data: unknown } {
  const event = frame.match(/^event: (.*)$/m)?.[1] ?? "message";
  const data = frame.match(/^data: (.*)$/m)?.[1];
  return { event, data: data === undefined ? undefined : JSON.parse(data) };
}
