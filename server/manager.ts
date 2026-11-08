// Owns live voyages: seating, presence, the tick loop, persistence and
// pushing each seat its own view. Game rules live in game/voyage.ts.

import { randomBytes, randomInt, randomUUID } from "node:crypto";
import { ABANDON_AFTER_MS, CALLSIGN_MAX, DISCONNECT_PAUSE_MS, MODES, NIGHTMARE_AFTER, PERSIST_EVERY_MS, TICK_MS, type Mode } from "../shared/config.ts";
import {
  ACT_OF,
  isEnded,
  isPlaying,
  ROLES,
  type Fx,
  type HelloAck,
  type Intent,
  type IntentAck,
  type Act,
  type Phase,
  type Role,
} from "../shared/protocol.ts";
import { hashToken, type Db } from "./db.ts";
import { log } from "./log.ts";
import { advance, applyIntent, bothSeatsReady, createVoyage, tick, upgradeVoyage, type Voyage } from "./game/voyage.ts";
import { viewFor, type Presence } from "./game/views.ts";
import { applyDevAction, type DevAction } from "./game/dev.ts";

/** The slice of a Socket.IO socket the manager uses (fakeable in tests). */
export type Conn = { id: string; emit(event: string, data: unknown): void };

type Live = {
  v: Voyage;
  rev: number;
  conns: Map<string, { conn: Conn; role: Role }>;
  /** When each seat last went from connected to disconnected. */
  awaySince: Partial<Record<Role, number>>;
  lastPersist: number;
  /** the highest voyage-log seq already copied to the events table */
  loggedSeq: number;
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
    for (const saved of db.loadLive()) {
      const v = upgradeVoyage(saved);
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
    // rev is seeded from the clock, not 0: a client that stays open across a
    // server restart drops views whose rev is lower than the last it saw, and
    // a voyage pushes at most ~5 views/s, far fewer than 1 per ms
    return { v, rev: Math.floor(now), conns: new Map(), awaySince, lastPersist: now, loggedSeq: this.db.maxSeq(v.id) };
  }

  /** What this pair has earned across every voyage they've sailed together. */
  private unlocksFor(crewId: string): Voyage["unlocks"] {
    const rows = this.db.crewRecords(crewId);
    let acts = 1;
    const survivedModes = new Set<string>();
    for (const r of rows) {
      if (r.practice !== null) continue; // practice never unlocks anything
      const act = r.outcome === "SURVIVED" ? 5 : ACT_OF[r.deepest_phase as Phase] || 1;
      acts = Math.max(acts, act);
      if (r.outcome === "SURVIVED") survivedModes.add(r.mode);
    }
    const modes: Mode[] = ["STANDARD"];
    if (survivedModes.has("STANDARD")) modes.push("ROUGH_SEAS", "BLACKOUT", "RAPID_FLOOD", "CHAIN_REACTION");
    const challenges = [...survivedModes].filter((m) => m !== "STANDARD" && m !== "NIGHTMARE").length;
    if (challenges >= NIGHTMARE_AFTER) modes.push("NIGHTMARE");
    return { modes: MODES.filter((m) => modes.includes(m)), acts: acts as Act };
  }

  private refreshUnlocks(v: Voyage): void {
    if (v.phase !== "LOBBY") return;
    if (v.dev) {
      v.unlocks = { modes: [...MODES], acts: 5 };
      return;
    }
    v.unlocks = this.unlocksFor(v.crewId);
    if (!v.unlocks.modes.includes(v.mode)) v.mode = "STANDARD";
    if (v.practice !== null && v.practice > v.unlocks.acts) v.practice = null;
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

  /** `from` = a previous voyage this browser holds a seat in: the new
   * voyage joins that crew's lineage, so its unlocks carry over. */
  create(rawCallsign: unknown, from?: { code: unknown; token: unknown }, rawShip?: unknown): SeatGrant | SeatError {
    const callsign = cleanCallsign(rawCallsign);
    if (!callsign) return "bad-callsign";
    const now = this.clock();
    let crewId: string | undefined;
    if (from && typeof from.token === "string") {
      const prev = this.db.loadByCode(normaliseCode(from.code));
      if (prev && this.db.roleForToken(prev.id, from.token)) crewId = this.db.crewOf(prev.voyage.code) ?? undefined;
    }
    const ship = typeof rawShip === "number" && Number.isInteger(rawShip) && rawShip >= 0 && rawShip < 2 ** 31 ? rawShip : randomInt(2 ** 31);
    const v = createVoyage(randomUUID(), this.newCode(), ship, now, { crewId });
    v.seats.ENGINEER = { callsign, ready: false };
    this.refreshUnlocks(v);
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
    this.refreshUnlocks(l.v);
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
    const l = this.wrap(upgradeVoyage(row.voyage));
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
    if (intent?.t === "sailAgain") return this.sailAgain(l, seat.role, intent.sameShip === true);

    // bring the simulation up to date first, so the intent lands on current state
    const tickFx = tick(l.v, now);
    const res = applyIntent(l.v, seat.role, intent, now);
    if (!res.ok) {
      log("intent.rejected", { code: l.v.code, role: seat.role, t: intent?.t, reason: res.reason });
      return { ok: false, reason: res.reason, rev: l.rev };
    }
    const fx = [...tickFx, ...res.fx];
    if (l.v.phase === "LOBBY") {
      if (intent.t === "setMode" || intent.t === "setStart") {
        this.db.event(l.v.id, "settings", `${l.v.mode} ${l.v.practice ? `practice act ${l.v.practice}` : "full voyage"}`);
        log("voyage.settings", { code: l.v.code, mode: l.v.mode, practice: l.v.practice ?? "none", by: seat.role });
      }
      this.maybeStart(l, now, fx);
    }
    this.afterChange(l, fx);
    return { ok: true, rev: l.rev };
  }

  private maybeStart(l: Live, now: number, fx: Fx[]): void {
    const p = this.presence(l);
    if (bothSeatsReady(l.v) && p.ENGINEER && p.NAVIGATOR && advance(l.v, "LOBBY", now, fx)) {
      this.db.event(l.v.id, "started", `${l.v.mode}${l.v.practice ? ` practice from act ${l.v.practice}` : ""}`);
      log("voyage.started", { code: l.v.code, mode: l.v.mode, practice: l.v.practice ?? "none" });
    }
  }

  private afterChange(l: Live, fx: Fx[]): void {
    // copy newly recorded significant events to the ordered events table
    for (const e of l.v.log) {
      if (e.seq <= l.loggedSeq) continue;
      this.db.event(l.v.id, `log.${e.k}`, e.text, e.seq);
      l.loggedSeq = e.seq;
    }
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

  private sailAgain(l: Live, role: Role, sameShip: boolean): IntentAck {
    if (!isEnded(l.v.phase)) return { ok: false, reason: "wrong-phase", rev: l.rev };
    if (!l.v.nextCode) {
      const now = this.clock();
      const seed = sameShip ? l.v.seed : randomInt(2 ** 31);
      const next = createVoyage(randomUUID(), this.newCode(), seed, now, { crewId: l.v.crewId, mode: l.v.mode, practice: l.v.practice });
      if (l.v.dev) next.dev = true;
      for (const r of ROLES) {
        if (l.v.seats[r]) next.seats[r] = { callsign: l.v.seats[r]!.callsign, ready: false };
      }
      this.refreshUnlocks(next);
      this.db.insertVoyage(next, l.v.code, sameShip);
      for (const s of this.db.seats(l.v.id)) this.db.insertSeat(next.id, s.role, s.callsign, s.token_hash);
      this.db.event(next.id, "created", `${sameShip ? "same ship again" : "sail again"} from ${l.v.code}`);
      l.v.nextCode = next.code;
      this.db.saveVoyage(l.v);
      this.live.set(next.code, this.wrap(next));
      log("voyage.created", { code: next.code, from: l.v.code, by: role, sameShip });
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

  // ------------------------------------------------------------ dev tools

  /** Dev mode (docs/DEV_MODE.md): one voyage with both seats filled and
   * every act and mode unlocked, so one browser can play both roles. */
  devCreate(rawShip?: unknown): { code: string; seats: SeatGrant[] } {
    const now = this.clock();
    const ship = typeof rawShip === "number" && Number.isInteger(rawShip) && rawShip >= 0 && rawShip < 2 ** 31 ? rawShip : randomInt(2 ** 31);
    const v = createVoyage(randomUUID(), this.newCode(), ship, now);
    v.dev = true;
    this.refreshUnlocks(v);
    const seats: SeatGrant[] = [];
    this.db.insertVoyage(v);
    for (const [role, callsign] of [["ENGINEER", "DEV-ENG"], ["NAVIGATOR", "DEV-NAV"]] as const) {
      v.seats[role] = { callsign, ready: false };
      const token = randomBytes(32).toString("base64url");
      this.db.insertSeat(v.id, role, callsign, hashToken(token));
      seats.push({ code: v.code, token, role });
    }
    this.db.saveVoyage(v);
    this.db.event(v.id, "created", "dev mode");
    this.live.set(v.code, this.wrap(v));
    log("voyage.created", { code: v.code, dev: true });
    return { code: v.code, seats };
  }

  /** Applies a dev action; the caller must prove a seat with its token. */
  devAction(rawCode: unknown, token: unknown, action: DevAction): "ok" | "not-found" | "bad-token" | "wrong-phase" {
    const l = this.get(normaliseCode(rawCode));
    if (!l) return "not-found";
    if (typeof token !== "string" || !this.db.roleForToken(l.v.id, token)) return "bad-token";
    // dev actions (skip/sink/danger) only act on voyages created in dev mode:
    // a real voyage must never be skippable, even with dev tools enabled
    if (!l.v.dev) return "wrong-phase";
    const now = this.clock();
    const fx = tick(l.v, now);
    if (!applyDevAction(l.v, action, now, fx)) return "wrong-phase";
    log("voyage.dev", { code: l.v.code, action: action.k });
    this.afterChange(l, fx);
    return "ok";
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
