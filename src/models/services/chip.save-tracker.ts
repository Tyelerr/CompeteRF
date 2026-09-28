// src/models/services/chip.save-tracker.ts
// In-flight Chip cloud saves per tournament, shared by EVERY viewmodel instance in this JS
// runtime. The embedded manage screen can remount (e.g. switching Live tabs) while the previous
// instance's save queue is still writing in the background. A save is several requests (config,
// rows, events, then the version bump), so a load that runs mid-save reads a half-written
// snapshot: rows already new, version still old. Applying it would put the older board and
// version back over the TD's action, and its load-repair / next save would then overwrite (or
// "conflict" with) this device's own write. Every load waits here first.

const inflight = new Map<number, Set<Promise<unknown>>>();

// Register a save; it is removed once it settles (resolved or rejected). Returns the same promise.
export const trackChipSave = <T,>(tid: number, p: Promise<T>): Promise<T> => {
  let set = inflight.get(tid);
  if (!set) inflight.set(tid, (set = new Set()));
  const own = set;
  own.add(p);
  const done = () => {
    own.delete(p);
    if (!own.size && inflight.get(tid) === own) inflight.delete(tid);
  };
  p.then(done, done);
  return p;
};

// Resolve once no save for this tournament is in flight (including saves that START while
// waiting). Never rejects — a failed save is the queue's business, not the loader's.
export const waitForChipSaves = async (tid: number): Promise<void> => {
  for (let set = inflight.get(tid); set && set.size; set = inflight.get(tid)) {
    await Promise.allSettled([...set]);
  }
};

export const chipSavesInFlight = (tid: number): number => inflight.get(tid)?.size ?? 0;
