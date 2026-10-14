// Preloaded with `node --import ./spec/fake-clock.ts server/index.ts`.
// FAKE_NOW (epoch ms) freezes Date.now() and new Date(). FAKE_TICKS=1 lets it
// run on from there at real speed, so a spec can start from a known instant
// and still watch the Clock move or stop (Away, #56). Production never
// preloads this file, and there is no endpoint to set the time (ADR 0007).
// A spec's second server is spawned with an IPC channel; when its parent goes, so does it.
if (process.send) process.on("disconnect", () => process.exit(0));

const fake = Number(process.env.FAKE_NOW);
if (process.env.FAKE_NOW !== undefined && Number.isFinite(fake)) {
  const Real = Date;
  const started = Real.now();
  const nowMs = (): number => (process.env.FAKE_TICKS === "1" ? fake + (Real.now() - started) : fake);
  class FakeDate extends Real {
    constructor(...args: unknown[]) {
      // @ts-expect-error spread into the overloaded Date constructor
      super(...(args.length === 0 ? [nowMs()] : args));
    }
    static override now(): number {
      return nowMs();
    }
  }
  globalThis.Date = FakeDate as DateConstructor;
}
