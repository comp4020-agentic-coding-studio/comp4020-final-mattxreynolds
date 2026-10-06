import { createHash, randomBytes } from "node:crypto";
import type { Request } from "express";
import { Router } from "express";
import { db } from "./db.ts";

// A person is an anonymous id their browser keeps, plus a callsign they can
// change. The id is a secret (it's what lets you rename yourself); the tag is
// a public fingerprint of it, so other people's screens can mark "you"
// without ever seeing the id.
export interface Player {
  id: string;
  tag: string;
  callsign: string;
}

const NAMES = [
  "VEGA", "ORION", "LYRA", "ALTAIR", "DENEB", "RIGEL", "SIRIUS", "CASTOR",
  "POLLUX", "ATLAS", "NOVA", "PULSAR", "QUASAR", "HALO", "ECHO", "KESTREL",
];
const tagOf = (id: string): string => createHash("sha256").update(id).digest("hex").slice(0, 10);

export const CALLSIGN = /^[A-Z0-9][A-Z0-9-]{1,15}$/;

export function normaliseCallsign(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const c = raw.trim().toUpperCase().replace(/\s+/g, "-");
  return CALLSIGN.test(c) ? c : null;
}

export function getPlayer(id: unknown): Player | null {
  if (typeof id !== "string" || id.length === 0) return null;
  const row = db.prepare("SELECT id, tag, callsign FROM players WHERE id = ?").get(id);
  return (row as Player | undefined) ?? null;
}

export const playerFrom = (req: Request): Player | null => getPlayer(req.get("x-player"));

export const players = Router();

players.post("/", (req, res) => {
  const id = randomBytes(16).toString("hex");
  const n = String(Math.floor(Math.random() * 100)).padStart(2, "0");
  const callsign =
    normaliseCallsign(req.body?.callsign) ?? `${NAMES[Math.floor(Math.random() * NAMES.length)]}-${n}`;
  const player: Player = { id, tag: tagOf(id), callsign };
  db.prepare("INSERT INTO players (id, tag, callsign, created_at) VALUES (?, ?, ?, ?)").run(
    id,
    player.tag,
    callsign,
    Date.now(),
  );
  res.status(201).json(player);
});

players.get("/me", (req, res) => {
  const player = playerFrom(req);
  if (!player) return void res.status(404).json({ error: "unknown player" });
  res.json(player);
});

players.patch("/me", (req, res) => {
  const player = playerFrom(req);
  if (!player) return void res.status(404).json({ error: "unknown player" });
  const callsign = normaliseCallsign(req.body?.callsign);
  if (!callsign) {
    return void res.status(400).json({ error: "callsign: 2–16 letters, digits or dashes" });
  }
  db.prepare("UPDATE players SET callsign = ? WHERE id = ?").run(callsign, player.id);
  res.json({ ...player, callsign });
});
