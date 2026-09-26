// src/models/services/chip.save-queue.ts
//
// Live Chip save reliability (tournament 2766 audit). Supabase-free so it is unit-testable.
//
// createChipSaveQueue — ONE save in flight at a time:
//   • enqueue(state) records the newest snapshot. If a save is running it just waits; when
//     that save finishes the queue saves the newest snapshot next. Intermediate snapshots are
//     skipped, never lost: chip state is cumulative, so the newest snapshot contains every
//     earlier action.
//   • A failed save retries the SAME snapshot after short delays (bounded: 3 attempts by
//     default). It never replays the tournament action. If a newer snapshot arrives while
//     retrying, the newer one (which supersedes it) is saved instead.
//   • After the last attempt fails the snapshot is kept as "failed/unsaved" (not dropped and
//     not overwritten by a reload): the next enqueue or retry() tries again.
//   • pause() (web local-recovery safety): NO new attempt starts while paused — not a queued
//     snapshot, not a retry after back-off (the back-off sleep is interrupted), not retry()/
//     enqueue(). The unsaved snapshot is HELD (peekUnsaved), never dropped. The returned
//     promise resolves once an attempt already sent to the server has settled, so a caller
//     that awaits pause() and then reads the cloud sees every write this queue will ever make
//     until resume(). resume() is explicit and only re-arms the queue.
//
// createLoadGuard — rejects a stale reload: a reload captures a token when it starts; any
// local mutation afterwards makes that token stale, and its result is discarded.

export interface ChipSaveAttemptFailure<S> {
  state: S;
  error: unknown;
  attempt: number;
  maxAttempts: number;
  willRetry: boolean;
}

export interface ChipSaveQueueOptions<S, R> {
  save: (state: S) => Promise<R>;
  onSaved?: (result: R, state: S) => void;
  onAttemptFailed?: (failure: ChipSaveAttemptFailure<S>) => void;
  // Every attempt for the newest snapshot failed; it is kept as unsaved.
  onGaveUp?: (state: S, error: unknown) => void;
  // Delay before each RETRY (attempts = retryDelaysMs.length + 1).
  retryDelaysMs?: number[];
  sleep?: (ms: number) => Promise<void>;
}

export const CHIP_SAVE_RETRY_DELAYS_MS = [1000, 3000];

export interface ChipSaveQueue<S, R> {
  enqueue(state: S): void;
  // Resolves once no save is running or pending. true = everything enqueued is persisted.
  flush(): Promise<boolean>;
  // Enqueue and wait for this snapshot (or a newer one) to persist; rejects if it could not.
  saveNow(state: S): Promise<R>;
  // Re-attempt the unsaved snapshot left by a give-up. No-op when there is none.
  retry(): void;
  // Forget any pending/unsaved snapshot (the TD chose to reload server state instead).
  dropUnsaved(): void;
  hasUnsaved(): boolean;
  isSaving(): boolean;
  // Suppress every cloud write; resolves when no attempt is in flight. Idempotent.
  pause(): Promise<void>;
  // Re-allow writes (starts saving a held snapshot, if one is still held).
  resume(): void;
  isPaused(): boolean;
  // The snapshot that would be written next (held/pending, else failed), or null.
  peekUnsaved(): S | null;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export const createChipSaveQueue = <S, R>(opts: ChipSaveQueueOptions<S, R>): ChipSaveQueue<S, R> => {
  const delays = opts.retryDelaysMs ?? CHIP_SAVE_RETRY_DELAYS_MS;
  const sleep = opts.sleep ?? defaultSleep;
  const maxAttempts = delays.length + 1;

  let pending: { state: S } | null = null;
  let failed: { state: S; error: unknown } | null = null;
  let running: Promise<void> | null = null;
  let lastResult: { result: R } | null = null;
  let paused = false;
  // Wakes an in-progress back-off sleep when pause() is called.
  let wakeSleep: (() => void) | null = null;
  const pausableSleep = (ms: number) =>
    new Promise<void>((resolve) => {
      wakeSleep = resolve;
      void sleep(ms).then(resolve);
    }).finally(() => {
      wakeSleep = null;
    });
  // Keep a snapshot unsaved while paused (a newer pending one supersedes it).
  const hold = (state: S) => {
    if (pending === null) pending = { state };
  };

  const saveWithRetries = async (state: S): Promise<boolean> => {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      if (paused) {
        hold(state);
        return true;
      }
      try {
        const result = await opts.save(state);
        lastResult = { result };
        opts.onSaved?.(result, state);
        return true;
      } catch (error) {
        // A newer snapshot supersedes this one — save that instead of retrying stale data.
        const superseded = pending !== null;
        const willRetry = attempt < maxAttempts && !superseded && !paused;
        opts.onAttemptFailed?.({ state, error, attempt, maxAttempts, willRetry });
        if (superseded) return true; // not a give-up: the newer snapshot carries this one
        if (paused) {
          hold(state); // paused mid-attempt: keep it unsaved, never retry until resume()
          return true;
        }
        if (!willRetry) {
          failed = { state, error };
          opts.onGaveUp?.(state, error);
          return false;
        }
        await pausableSleep(delays[attempt - 1]);
        if (pending !== null) return true; // superseded during the back-off
        // (paused during the back-off → the top-of-loop check holds it)
      }
    }
    return false;
  };

  const drain = async () => {
    while (pending && !paused) {
      const { state } = pending;
      pending = null;
      const ok = await saveWithRetries(state);
      if (!ok) break;
    }
  };

  const kick = () => {
    if (running || paused) return;
    running = drain().finally(() => {
      running = null;
      // enqueue() during the final microtask of a drain → pick it up.
      if (pending && !paused) kick();
    });
  };

  const flush = async (): Promise<boolean> => {
    while (running) await running;
    return failed === null && pending === null;
  };

  return {
    enqueue(state: S) {
      pending = { state };
      failed = null; // the newer snapshot supersedes any unsaved one
      kick();
    },
    flush,
    async saveNow(state: S) {
      this.enqueue(state);
      const ok = await flush();
      if (!ok || !lastResult) throw failed?.error ?? new Error("Save failed.");
      return lastResult.result;
    },
    retry() {
      if (!failed || pending) return;
      pending = { state: failed.state };
      failed = null;
      kick();
    },
    dropUnsaved() {
      pending = null;
      failed = null;
    },
    hasUnsaved: () => failed !== null || pending !== null,
    isSaving: () => running !== null,
    async pause() {
      paused = true;
      wakeSleep?.();
      while (running) await running;
    },
    resume() {
      paused = false;
      if (pending) kick();
    },
    isPaused: () => paused,
    peekUnsaved: () => pending?.state ?? failed?.state ?? null,
  };
};

export interface ChipLoadGuard {
  begin(): number;
  markLocalChange(): void;
  isStale(token: number): boolean;
}

export const createLoadGuard = (): ChipLoadGuard => {
  let generation = 0;
  return {
    begin: () => generation,
    markLocalChange: () => {
      generation += 1;
    },
    isStale: (token: number) => token !== generation,
  };
};
