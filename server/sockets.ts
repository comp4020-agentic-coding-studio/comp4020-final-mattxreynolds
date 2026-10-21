// Socket.IO wiring. Every handler validates its input shape; the manager and
// the game reducer do the rest.

import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import type { HelloAck, IntentAck, IntentMessage } from "../shared/protocol.ts";
import type { Manager } from "./manager.ts";

export function attachSockets(http: HttpServer, manager: Manager): Server {
  const io = new Server(http, {
    serveClient: false,
    maxHttpBufferSize: 4096,
    // tolerate slow links: a missed heartbeat or two is not a disconnect
    pingInterval: 10000,
    pingTimeout: 15000,
  });

  io.on("connection", (socket) => {
    const conn = { id: socket.id, emit: (event: string, data: unknown) => socket.emit(event, data) };

    socket.on("hello", (msg: unknown, ack: unknown) => {
      const m = (msg ?? {}) as Partial<{ code: unknown; token: unknown }>;
      const res: HelloAck = manager.hello(conn, m.code, m.token);
      if (typeof ack === "function") ack(res);
    });

    socket.on("intent", (msg: unknown, ack: unknown) => {
      const m = msg as Partial<IntentMessage> | null;
      const res: IntentAck =
        m && typeof m === "object" && m.intent && typeof m.intent === "object"
          ? manager.intent(conn, m.intent)
          : { ok: false, reason: "bad-input", rev: 0 };
      if (typeof ack === "function") ack(res);
    });

    socket.on("disconnect", () => manager.disconnect(conn));
  });

  return io;
}
