// src/utils/queue-pins.ts
// Queue pins: TD relative overrides that COEXIST with an automatic mode (Balanced / Winners
// First / Losers First / Longest Waiting). The mode still generates the base order; each pin
// then moves one match relative to another (or to its tier's top/bottom). Pure, deterministic,
// and fail-safe: a stale, malformed or conflicting pin can never break schedule generation.
//
// Stored at live_settings.queuePins (server-validated shape; see the set_queue op):
//   { matchId, place: "before" | "after", anchorId } | { matchId, place: "top" | "bottom" }
//
// Resolution rules (applied per tier: Ready and Waiting separately):
//   1. Sanitize: drop malformed entries; one pin per match — the LATEST entry wins.
//   2. Apply in stored order (oldest first), each pin once: remove the match, re-insert it at
//      its target. A later pin therefore overrides an earlier conflicting one (A-before-B then
//      B-before-A ⇒ B before A). No cycles are possible: nothing is ever re-applied.
//   3. A pin is skipped when its match or anchor is not in this tier's list (assigned /
//      completed / other tier / gone) — i.e. it has expired or crossed the Ready/Waiting line.
//   4. The target is CLAMPED so the match never lands above one of its unresolved feeders or
//      below a match that depends on it (feeders/dependents taken from the projection).
//   5. "Pinned-last" items (a conditional GF2 that may never be played) are held at the end;
//      pins on them are ignored and nothing can be placed after them.

import { QueuePin } from "../models/types/tournament-settings.types";

export type { QueuePin, QueuePinPlace } from "../models/types/tournament-settings.types";
export const MAX_QUEUE_PINS = 32;

export const sanitizePins = (raw: unknown): QueuePin[] => {
  if (!Array.isArray(raw)) return [];
  const valid: QueuePin[] = [];
  for (const p of raw) {
    if (!p || typeof p !== "object") continue;
    const { matchId, place, anchorId } = p as Record<string, unknown>;
    if (typeof matchId !== "string" || !matchId) continue;
    if (place === "top" || place === "bottom") valid.push({ matchId, place });
    else if ((place === "before" || place === "after") && typeof anchorId === "string" && anchorId && anchorId !== matchId)
      valid.push({ matchId, place, anchorId });
  }
  // one pin per match: keep the LAST occurrence, in stored order
  const lastIdx = new Map<string, number>();
  valid.forEach((p, i) => lastIdx.set(p.matchId, i));
  return valid.filter((p, i) => lastIdx.get(p.matchId) === i);
};

// Apply pins to ONE tier's ordered items.
export const applyPinsToTier = <T,>(
  items: T[],
  idOf: (item: T) => string,
  rawPins: unknown,
  opts: {
    feedersOf?: (id: string) => string[]; // unresolved feeders (only those in this tier matter)
    pinnedLast?: (id: string) => boolean;
  } = {},
): T[] => {
  const pins = sanitizePins(rawPins);
  if (pins.length === 0 || items.length < 2) return items;
  const byId = new Map(items.map((it) => [idOf(it), it]));
  const isLast = opts.pinnedLast ?? (() => false);
  const tail = items.map(idOf).filter((id) => isLast(id));
  let list = items.map(idOf).filter((id) => !isLast(id));
  const inTier = new Set(list);
  const feeders = new Map<string, string[]>();
  const dependents = new Map<string, string[]>();
  for (const id of list) {
    const f = (opts.feedersOf?.(id) ?? []).filter((x) => inTier.has(x));
    feeders.set(id, f);
    for (const x of f) dependents.set(x, [...(dependents.get(x) ?? []), id]);
  }

  for (const pin of pins) {
    if (!inTier.has(pin.matchId)) continue;
    if ((pin.place === "before" || pin.place === "after") && !inTier.has(pin.anchorId as string)) continue;
    const rest = list.filter((id) => id !== pin.matchId);
    let target =
      pin.place === "top"
        ? 0
        : pin.place === "bottom"
          ? rest.length
          : rest.indexOf(pin.anchorId as string) + (pin.place === "after" ? 1 : 0);
    // never above an unresolved feeder, never below a dependent
    const lo = Math.max(0, ...(feeders.get(pin.matchId) ?? []).map((f) => rest.indexOf(f) + 1));
    const hi = Math.min(rest.length, ...(dependents.get(pin.matchId) ?? []).map((d) => rest.indexOf(d)));
    if (lo > hi) continue; // no legal slot — leave it where the mode put it
    target = Math.min(hi, Math.max(lo, target));
    rest.splice(target, 0, pin.matchId);
    list = rest;
  }
  return [...list, ...tail].map((id) => byId.get(id) as T);
};

// Pins after a "Move & Keep {mode}" action: stale pins (match or anchor no longer scheduled)
// are dropped, this match's previous pin is replaced, the new one is appended (applied last),
// and the list is capped (oldest dropped first).
export const pinsWithMove = (
  current: unknown,
  scheduledIds: string[],
  pin: QueuePin,
): QueuePin[] => {
  const live = new Set(scheduledIds);
  const kept = sanitizePins(current).filter(
    (p) => p.matchId !== pin.matchId && live.has(p.matchId) && (!p.anchorId || live.has(p.anchorId)),
  );
  return [...kept, pin].slice(-MAX_QUEUE_PINS);
};

export const pinsWithout = (current: unknown, matchId: string): QueuePin[] =>
  sanitizePins(current).filter((p) => p.matchId !== matchId);
