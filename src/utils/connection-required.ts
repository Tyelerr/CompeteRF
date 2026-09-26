// src/utils/connection-required.ts
// Player-side tournament writes are ONLINE-ONLY (Chip offline Phase 2 is controller-only).
// On web, an offline player device must never queue a write for later: the attempt is refused
// up front with a clear message, and a network failure is reported the same way. (React Query
// mutations default to pausing while offline and replaying on reconnect — web callers set
// networkMode "always" to opt out.) Pure (no react-native import); callers gate on web so
// native behavior is unchanged.

export const CONNECTION_REQUIRED_MESSAGE =
  "Connection required — this device is offline, so nothing was sent. Try again once you're back online.";

export class ConnectionRequiredError extends Error {
  constructor() {
    super(CONNECTION_REQUIRED_MESSAGE);
    this.name = "ConnectionRequiredError";
  }
}

// Throws before any request when the browser reports offline (null/undefined = unknown → allow).
export const requireConnection = (online: boolean | null | undefined): void => {
  if (online === false) throw new ConnectionRequiredError();
};

const NETWORK_FAILURE = /failed to fetch|network ?(request)? ?failed|networkerror|load failed|fetch failed/i;

// A write that failed because the network is gone → the same clear message (no retry queue).
export const toConnectionAwareError = (e: unknown): unknown => {
  const msg = e instanceof Error ? e.message : typeof e === "object" && e && "message" in e ? String((e as { message: unknown }).message) : "";
  return NETWORK_FAILURE.test(msg) ? new ConnectionRequiredError() : e;
};

// Wrap a player-side write: refuse while offline, never queue, map network failures.
// `enabled` false (native) → the write runs exactly as before.
export const onlineOnlyWrite = async <T>(
  enabled: boolean,
  online: boolean | null | undefined,
  write: () => Promise<T>,
): Promise<T> => {
  if (!enabled) return write();
  requireConnection(online);
  try {
    return await write();
  } catch (e) {
    throw toConnectionAwareError(e);
  }
};
