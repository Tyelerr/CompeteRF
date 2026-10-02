// src/utils/player-poll.ts
// Live polling policy for the PLAYER screens (Profile → Tournament View / Match Center).
// Tab screens stay mounted, so without this every player hook kept polling on other tabs, and
// Profile ran several observers of the same resource, each with its own interval timer:
// 2 × the full tournament row every 5s and 3 × the live-tournament RPC (focus ignored).
// Rule: a hook polls only while its screen is focused AND it is the designated poller
// (poll !== false); other observers of the same query read the shared cache. Pure.

export interface PlayerPollOptions {
  focused?: boolean; // the hosting tab is active (default true for callers that don't know)
  poll?: boolean; // this observer owns the interval for its resources (default true)
}

export const playerPollActive = (opts?: PlayerPollOptions): boolean =>
  (opts?.focused ?? true) && (opts?.poll ?? true);

export const playerPollInterval = (
  ms: number,
  resourceId: number | null | undefined,
  opts?: PlayerPollOptions,
): number | false => (resourceId != null && playerPollActive(opts) ? ms : false);
