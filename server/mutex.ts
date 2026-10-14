// One promise chain per Voyage (ADR 0005): intents for a Voyage run one at a
// time, in arrival order, and each runs its synchronous transaction to the end.
const tails = new Map<string, Promise<unknown>>();

export function withVoyage<T>(voyageId: string, fn: () => T): Promise<T> {
  const run = (tails.get(voyageId) ?? Promise.resolve()).then(fn);
  const tail = run.catch(() => {});
  tails.set(voyageId, tail);
  void tail.then(() => {
    if (tails.get(voyageId) === tail) tails.delete(voyageId);
  });
  return run;
}
