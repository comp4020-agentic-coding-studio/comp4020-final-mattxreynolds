import { createServer } from "node:http";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { expect, it } from "vitest";
import { api } from "../client/src/api.ts";

it("preserves uncertainty when response headers arrive but the body times out", async () => {
  let headersSent!: () => void;
  const sent = new Promise<void>(resolve => { headersSent = resolve; });
  const server = createServer((_req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.write('{"revision":'); // acknowledgement body never finishes
    headersSent();
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const controller = new AbortController();
  try {
    const request = api(`http://127.0.0.1:${(server.address() as AddressInfo).port}/action`, null,
      { method: "POST", signal: controller.signal });
    const verdict = expect(request).rejects.toMatchObject({ name: expect.stringMatching(/AbortError|TimeoutError/) });
    await sent;
    // Wait until fetch has received the headers and is consuming the body.
    await new Promise(resolve => setTimeout(resolve, 50));
    controller.abort(new DOMException("Acknowledgement timed out", "TimeoutError"));
    await verdict;
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
