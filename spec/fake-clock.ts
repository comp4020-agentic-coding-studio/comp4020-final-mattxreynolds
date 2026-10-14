// Preloaded with `node --import ./spec/fake-clock.ts server/index.ts`.
// FAKE_NOW (epoch ms) freezes Date.now() and new Date(). Production never
// preloads this file, and there is no endpoint to set the time (ADR 0007).
const fake = Number(process.env.FAKE_NOW);
if (process.env.FAKE_NOW !== undefined && Number.isFinite(fake)) {
  const Real = Date;
  class FakeDate extends Real {
    constructor(...args: unknown[]) {
      // @ts-expect-error spread into the overloaded Date constructor
      super(...(args.length === 0 ? [fake] : args));
    }
    static override now(): number {
      return fake;
    }
  }
  globalThis.Date = FakeDate as DateConstructor;
}
