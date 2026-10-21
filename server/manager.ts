// Owns live voyages: seating, presence, the tick loop, persistence and
// pushing each seat its own view. Game rules live in game/voyage.ts.

import { randomBytes, randomInt, randomUUID } from "node:crypto";
import { ABANDON_AFTER_MS, CALLSIGN_MAX, DISCONNECT_PAUSE_MS, PERSIST_EVERY_MS, TICK_MS } from "../shared/config.ts";
import {
  isEnded,
  isPlaying,
  ROLES,
  type Fx,
  type HelloAck,
  type Intent,
  type IntentAck,
  type Role,
} from "../shared/protocol.ts";
import { hashToken, type Db } from "./db.ts";
import { log } from "./log.ts";
import { advance, applyIntent, bothSeatsReady, createVoyage, tick, type Voyage } from "./game/voyage.ts";
import { viewFor, type Presence } from "./game/views.ts";

/** The slice of a Socket.IO socket the manager uses (fakeable in tests). */
export type Conn = { id: string; emit(event: string, data: unknown): void };

type Live = {
  v: Voyage;
  rev: number;
  conns: Map<string, { conn: Conn; role: Role }>;
  /** When each seat last went from connected to disconnected. */
  awaySince: Partial<Record<Role, number>>;
  lastPersist: number;
};

export type SeatGrant = { code: string; token: string; role: Role };
export type SeatError = "bad-callsign" | "not-found" | "full" | "ended";

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CALLSIGN_RE = /^[A-Za-z0-9 _.'-]+$/;

export function cleanCallsign(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.replace(/\s+/g, " ").trim().toUpperCase();
  if (s.length < 1 || s.length > CALLSIGN_MAX || !CALLSIGN_RE.test(s)) return null;
  return s;
}

export const normaliseCode = (raw: unknown): string =>
  typeof raw === "string" ? raw.trim().toUpperCase().slice(0, 8) : "";

export class Manager {
  private live = new Map<string, Live>();
  private byConn = new Map<string, Live>();
  private timer: NodeJS.Timeout | null = null;
  private readonly db: Db;
  private readonly clock: () => number;

  constructor(db: Db, clock: () => number = Date.now) {
    this.db = db;
    this.clock = clock;
    for (const v of db.loadLive()) {
      // Time the server was down is a pause, not a flood (MAX_TICK_DT_S).
      v.lastTickAt = null;
      this.live.set(v.code, this.wrap(v));
    }
    if (this.live.size) log("voyages.restored", { count: this.live.size });
  }

  private wrap(v: Voyage): Live {
    const now = this.clock();
    const awaySince: Partial<Record<Role, number>> = {};
    for (const r of ROLES) if (v.seats[r]) awaySince[r] = now;
    return { v, rev: 0, conns: new Map(), awaySince, lastPersist: now };
  }

  start(): void {
    this.timer = setInterval(() => this.tickAll(), TICK_MS);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.flushAll();
  }

  flushAll(): void {
    for (const l of this.live.values()) this.db.saveVoyage(l.v);
  }

  // ------------------------------------------------------------ seating

  private newCode(): string {
    for (;;) {
      let code = "";
      for (let i = 0; i < 4; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
      if (!this.db.codeExists(code)) return code;
    }
  }

  create(rawCallsign: unknown): SeatGrant | SeatError {
    const callsign = cleanCallsign(rawCallsign);
    if (!callsign) return "bad-callsign";
    const now = this.clock();
    const v = createVoyage(randomUUID(), this.newCode(), randomInt(2 ** 31), now);
    v.seats.ENGINEER = { callsign, ready: false };
    const token = randomBytes(32).toString("base64url");
    this.db.insertVoyage(v);
    this.db.insertSeat(v.id, "ENGINEER", callsign, hashToken(token));
    this.db.event(v.id, "created", callsign);
    this.live.set(v.code, this.wrap(v));
    log("voyage.created", { code: v.code });
    log("player.joined", { code: v.code, role: "ENGINEER" });
    return { code: v.code, token, role: "ENGINEER" };
  }

  join(rawCode: unknown, rawCallsign: unknown): SeatGrant | SeatError {
    const callsign = cleanCallsign(rawCallsign);
    if (!callsign) return "bad-callsign";
    const l = this.get(normaliseCode(rawCode));
    if (!l) return "not-found";
    if (isEnded(l.v.phase)) return "ended";
    if (l.v.seats.NAVIGATOR) return "full";
    l.v.seats.NAVIGATOR = { callsign, ready: false };
    const token = randomBytes(32).toString("base64url");
    this.db.insertSeat(l.v.id, "NAVIGATOR", callsign, hashToken(token));
    this.db.saveVoyage(l.v);
    this.db.event(l.v.id, "joined", callsign);
    l.awaySince.NAVIGATOR = this.clock();
    log("player.joined", { code: l.v.code, role: "NAVIGATOR" });
    this.broadcast(l);
    return { code: l.v.code, token, role: "NAVIGATOR" };
  }

  /** Public, secret-free summary for the join screen. */
  peek(rawCode: unknown): { code: string; phase: string; crew: { role: Role; callsign: string }[] } | null {
    const l = this.get(normaliseCode(rawCode));
    if (!l) return null;
    return {
      code: l.v.code,
      phase: l.v.phase,
      crew: ROLES.filter((r) => l.v.seats[r]).map((r) => ({ role: r, callsign: l.v.seats[r]!.callsign })),
    };
  }

  private get(code: string): Live | null {
    const hit = this.live.get(code);
    if (hit) return hit;
    const row = code ? this.db.loadByCode(code) : null;
    if (!row || row.status === "ABANDONED") return null;
    const l = this.wrap(row.voyage);
    this.live.set(code, l);
    return l;
  }

  // ------------------------------------------------------------ sockets

  hello(conn: Conn, rawCode: unknown, token: unknown): HelloAck {
    const l = this.get(normaliseCode(rawCode));
    if (!l) return { ok: false, reason: "not-found" };
    const role = typeof token === "string" ? this.db.roleForToken(l.v.id, token) : null;
    if (!role) return { ok: false, reason: "bad-token" };
    this.detach(conn);
    const wasAway = !this.connected(l, role);
    l.conns.set(conn.id, { conn, role });
    this.byConn.set(conn.id, l);
    delete l.awaySince[role];
    if (wasAway) {
      log("player.connected", { code: l.v.code, role });
      this.recomputePause(l);
    }
    this.sendView(l, conn, role);
    if (wasAway) this.broadcast(l);
    return { ok: true };
  }

  disconnect(conn: Conn): void {
    this.detach(conn);
  }

  private detach(conn: Conn): void {
    const l = this.byConn.get(conn.id);
    if (!l) return;
    const seat = l.conns.get(conn.id);
    l.conns.delete(conn.id);
    this.byConn.delete(conn.id);
    if (seat && !this.connected(l, seat.role)) {
      l.awaySince[seat.role] = this.clock();
      log("player.disconnected", { code: l.v.code, role: seat.role });
      if (l.v.phase === "LOBBY" && l.v.seats[seat.role]) l.v.seats[seat.role]!.ready = false;
      this.broadcast(l);
    }
  }

  private connected(l: Live, role: Role): boolean {
    for (const c of l.conns.values()) if (c.role === role) return true;
    return false;
  }

  private presence(l: Live): Presence {
    return { ENGINEER: this.connected(l, "ENGINEER"), NAVIGATOR: this.connected(l, "NAVIGATOR") };
  }

  intent(conn: Conn, intent: Intent): IntentAck {
    const l = this.byConn.get(conn.id);
    const seat = l?.conns.get(conn.id);
    if (!l || !seat) return { ok: false, reason: "not-seated", rev: 0 };
    const now = this.clock();
    if (intent?.t === "sailAgain") return this.sailAgain(l, seat.role);

    // bring the simulation up to date first, so the intent lands on current state
    const tickFx = tick(l.v, now);
    const res = applyIntent(l.v, seat.role, intent, now);
    if (!res.ok) {
      log("intent.rejected", { code: l.v.code, role: seat.role, t: intent?.t, reason: res.reason });
      return { ok: false, reason: res.reason, rev: l.rev };
    }
    const fx = [...tickFx, ...res.fx];
    if (l.v.phase === "LOBBY") this.maybeStart(l, now, fx);
    this.afterChange(l, fx);
    return { ok: true, rev: l.rev };
  }

  private maybeStart(l: Live, now: number, fx: Fx[]): void {
    const p = this.presence(l);
    if (bothSeatsReady(l.v) && p.ENGINEER && p.NAVIGATOR && advance(l.v, "LOBBY", now, fx)) {
      this.db.event(l.v.id, "started");
      log("voyage.started", { code: l.v.code });
    }
  }

  private afterChange(l: Live, fx: Fx[]): void {
    for (const f of fx) {
      if (f.k === "phase") {
        this.db.event(l.v.id, "phase", f.phase);
        log("voyage.phase", { code: l.v.code, phase: f.phase, danger: Math.round(l.v.danger) });
        if (isEnded(f.phase)) {
          this.db.event(l.v.id, "ended", l.v.failureCause ?? f.phase);
          log("voyage.ended", { code: l.v.code, outcome: f.phase, ms: Math.round(l.v.elapsedMs) });
        }
      }
    }
    this.db.saveVoyage(l.v);
    l.lastPersist = this.clock();
    this.broadcast(l, fx);
  }

  private sailAgain(l: Live, role: Role): IntentAck {
    if (!isEnded(l.v.phase)) return { ok: false, reason: "wrong-phase", rev: l.rev };
    if (!l.v.nextCode) {
      const now = this.clock();
      const next = createVoyage(randomUUID(), this.newCode(), randomInt(2 ** 31), now);
      for (const r of ROLES) {
        if (l.v.seats[r]) next.seats[r] = { callsign: l.v.seats[r]!.callsign, ready: false };
      }
      this.db.insertVoyage(next, l.v.code);
      for (const s of this.db.seats(l.v.id)) this.db.insertSeat(next.id, s.role, s.callsign, s.token_hash);
      this.db.event(next.id, "created", `sail again from ${l.v.code}`);
      l.v.nextCode = next.code;
      this.db.saveVoyage(l.v);
      this.live.set(next.code, this.wrap(next));
      log("voyage.created", { code: next.code, from: l.v.code, by: role });
    }
    for (const { conn } of l.conns.values()) conn.emit("moved", { code: l.v.nextCode, by: role });
    return { ok: true, rev: l.rev };
  }

  // ------------------------------------------------------------ tick

  private recomputePause(l: Live): void {
    if (!isPlaying(l.v.phase)) return;
    const now = this.clock();
    const away = ROLES.some((r) => l.awaySince[r] !== undefined && now - l.awaySince[r]! > DISCONNECT_PAUSE_MS);
    if (away !== l.v.paused) {
      l.v.paused = away;
      log(away ? "voyage.paused" : "voyage.resumed", { code: l.v.code });
    }
  }

  tickAll(): void {
    const now = this.clock();
    for (const [code, l] of this.live) {
      if (!isPlaying(l.v.phase)) {
        // ended or lobby voyages nobody is watching don't need to stay in memory
        if (l.conns.size === 0) {
          const idle = Math.min(...ROLES.map((r) => l.awaySince[r] ?? now));
          if (l.v.phase === "LOBBY" && now - idle > ABANDON_AFTER_MS) {
            this.db.markAbandoned(l.v.id);
            log("voyage.abandoned", { code });
            this.live.delete(code);
          } else if (isEnded(l.v.phase)) {
            this.live.delete(code);
          }
        }
        continue;
      }
      if (l.conns.size === 0) {
        const idle = Math.max(...ROLES.map((r) => l.awaySince[r] ?? now));
        if (now - idle > ABANDON_AFTER_MS) {
          this.db.saveVoyage(l.v);
          this.db.markAbandoned(l.v.id);
          log("voyage.abandoned", { code });
          this.live.delete(code);
          continue;
        }
      }
      const wasPaused = l.v.paused;
      this.recomputePause(l);
      const fx = tick(l.v, now);
      const ended = fx.some((f) => f.k === "phase");
      if (ended || fx.length || wasPaused !== l.v.paused) {
        this.afterChange(l, fx);
      } else {
        if (now - l.lastPersist >= PERSIST_EVERY_MS) {
          this.db.saveVoyage(l.v);
          l.lastPersist = now;
        }
        if (!l.v.paused && l.conns.size) this.broadcast(l);
      }
    }
  }

  // ------------------------------------------------------------ views

  private sendView(l: Live, conn: Conn, role: Role): void {
    conn.emit("view", viewFor(l.v, role, this.presence(l), l.rev, this.clock()));
  }

  private broadcast(l: Live, fx: Fx[] = []): void {
    l.rev++;
    const presence = this.presence(l);
    const now = this.clock();
    const views: Partial<Record<Role, unknown>> = {};
    for (const { conn, role } of l.conns.values()) {
      views[role] ??= viewFor(l.v, role, presence, l.rev, now);
      conn.emit("view", views[role]);
      if (fx.length) conn.emit("fx", fx);
    }
  }

  // ------------------------------------------------------------ tests

  /** Direct access for ENABLE_TEST_HOOKS only. */
  testVoyage(code: string): Voyage | null {
    return this.get(normaliseCode(code))?.v ?? null;
  }

  testChanged(code: string): void {
    const l = this.get(normaliseCode(code));
    if (l) this.afterChange(l, []);
  }
}
