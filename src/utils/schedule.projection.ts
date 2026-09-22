// src/utils/schedule.projection.ts
// Projected schedule for Single/Double Elimination: every REMAINING match in the
// bracket — ready ones AND unresolved future ones — in the order the selected
// auto-assign mode would play them. Pure (no React, no Supabase), derived on
// demand from authoritative state; never persisted.
//
// Inputs are the same ones the live queue already uses:
//   bracket.graph (feeder DAG) + buildLiveMatches() output + matchState
//   + autoAssignMode + queueOrder.
//
// Two concepts are kept strictly separate:
//   • ELIGIBILITY — can this match be put on a table now? Exactly isReady(); computed
//     from the resolved match BEFORE any ordering and never touched by it.
//   • PRIORITY    — where the match sits in the projected order. Pure ranking; it
//     never makes a match ready and never places it ahead of its unresolved feeders.
//
// The order has two tiers: every READY match first, in the existing
// buildQueueEntries → orderQueue order (also exposed verbatim as `readyQueue` for
// planAutoAssign), then every WAITING match in the mode's future-aware order. A
// waiting match never displays above a match that is playable right now.

import {
  AutoAssignMode,
  BracketSide,
  GeneratedBracket,
  MatchLiveState,
} from "../models/types/tournament-settings.types";
import { LiveMatch } from "./match.utils";
import {
  bracketLocation,
  buildQueueEntries,
  computeReadyAtMap,
  isReady,
  orderQueue,
  QueueEntry,
} from "./queue.utils";
import { applyPinsToTier } from "./queue-pins";

// ── Types ─────────────────────────────────────────────────────────────────────

// One side of a projected match. Structured — display text is derived from it
// (projectedSlotText), never stored.
export type ProjectedSlot =
  // A known player (resolved through the bracket).
  | {
      kind: "player";
      registrationId: number | null;
      name: string;
      fargo: number | null;
      raceTo: number | null;
    }
  // Not known yet: the winner/loser of another match that hasn't been decided.
  | {
      kind: "feeder";
      outcome: "winner" | "loser";
      sourceMatchId: string; // graph id, e.g. "W2M1"
      sourceLabel: string; // that match's per-side number label, e.g. "W4" / "L3" / "Finals"
      sourceSide: BracketSide | null;
    }
  // Nobody will ever arrive here (bye seed, the "loser" of a bye, a withdrawal).
  | { kind: "empty" };

export type ProjectedLifecycle =
  | "completed" // finished
  | "inProgress" // being played
  | "assigned" // on a table, not started yet
  | "ready" // isReady(): both players known, unassigned — Auto Assign may take it
  | "waiting" // at least one side still depends on an undecided feeder match
  | "bye"; // never played: a bye/empty match, or a pending pass-through that can only become one

// GF2 (grand-final reset) is conditional: "possible" until GF is decided,
// "required" once the losers finalist has won GF. If the winners finalist wins GF
// the resolver marks GF2 skipped and it disappears from the match list entirely.
export type ConditionalState = "possible" | "required";

export interface MatchEligibility {
  ready: boolean; // === isReady(match). Never derived from priority.
  blockedBy: string[]; // undecided feeder match ids this match is waiting on
}

export interface ProjectedMatch {
  matchId: string;
  match: LiveMatch; // the authoritative resolved match (names, race, scores, table, timestamps)
  side: BracketSide;
  round: number;
  numberLabel: string; // "W4" / "L3" / "Finals"
  location: string; // bracketLocation(): "Winners R2" / "Hotseat" / "Finals (Reset)" …
  slot1: ProjectedSlot;
  slot2: ProjectedSlot;
  lifecycle: ProjectedLifecycle;
  eligibility: MatchEligibility;
  conditional: ConditionalState | null;
  // Unresolved dependency levels before this match can become ready: 0 for
  // ready/active/completed, 1 + max(feeder depth) for waiting matches. (ETA input.)
  dependencyDepth: number;
  readyAt: number | null; // computeReadyAtMap (null while any feeder is undecided)
  // For a waiting match, when its already-arrived player became available (real
  // timestamps only: draw time or the feeder's completedAt). Null if nobody arrived.
  firstSideReadyAt: number | null;
  priority: number | null; // index in schedule.scheduled (null when not scheduled)
  readyRank: number | null; // index in schedule.readyQueue (null when not ready)
}

export interface ProjectedSchedule {
  mode: AutoAssignMode;
  // Remaining matches not yet on a table (ready + waiting), in projected order.
  scheduled: ProjectedMatch[];
  // On tables: assigned (waiting to start) + in progress, in graph order.
  active: ProjectedMatch[];
  completed: ProjectedMatch[];
  // Every projected match (incl. byes) by id.
  byId: Record<string, ProjectedMatch>;
  // Exactly the existing orderQueue() result — the only list Auto Assign may consume.
  readyQueue: QueueEntry[];
}

export interface ProjectScheduleInput {
  bracket: GeneratedBracket | null;
  matches: LiveMatch[]; // buildLiveMatches() output
  matchState: Record<string, MatchLiveState>;
  mode: AutoAssignMode;
  queueOrder: string[];
  now: number; // only feeds the existing ready-queue wait calc
  // TD relative overrides kept alongside an automatic mode (ignored in Manual, where queueOrder
  // is authoritative). Untrusted shape: sanitized and resolved by utils/queue-pins.ts.
  queuePins?: unknown;
}

// ── Display helpers (derived, never persisted) ─────────────────────────────────

// "Winner of W4" / "Loser of W2" / "Winner of L3"
export const feederText = (outcome: "winner" | "loser", sourceLabel: string): string =>
  `${outcome === "winner" ? "Winner" : "Loser"} of ${sourceLabel}`;

export const projectedSlotText = (slot: ProjectedSlot): string => {
  if (slot.kind === "player") return slot.name;
  if (slot.kind === "feeder") return feederText(slot.outcome, slot.sourceLabel);
  return "Bye";
};

// ── Projection ────────────────────────────────────────────────────────────────

const EMPTY: ProjectedSlot = { kind: "empty" };

const EMPTY_SCHEDULE = (mode: AutoAssignMode): ProjectedSchedule => ({
  mode,
  scheduled: [],
  active: [],
  completed: [],
  byId: {},
  readyQueue: [],
});

export const projectSchedule = (input: ProjectScheduleInput): ProjectedSchedule => {
  const { bracket, matches, matchState, mode, queueOrder, now, queuePins } = input;
  const pinsActive = mode !== "manual" && Array.isArray(queuePins) && queuePins.length > 0;
  const graph = bracket?.graph;
  if (!graph || !matches.length) return EMPTY_SCHEDULE(mode);

  const drawnAt = bracket?.generatedAt ? Date.parse(bracket.generatedAt) : 0;
  const nodeById = new Map(graph.map((n) => [n.id, n]));
  const graphIndex = new Map(graph.map((n, i) => [n.id, i]));
  const matchById = new Map(matches.map((m) => [m.id, m]));

  // Has match `id` produced its outcome (so anything it feeds is now either a
  // known player or permanently empty)? Mirrors the resolver's decided-ness:
  // byes/empties decide at draw; a real match decides when completed with a winner.
  // A match absent from the list was skipped (an unneeded GF2) — nothing flows out.
  const outcomeDecided = (id: string): boolean => {
    const f = matchById.get(id);
    if (!f) return true;
    if (f.bye || f.empty) return true;
    return f.status === "completed" && f.winner != null;
  };

  // Projected slots per match, in graph slot order. Memoized (graph is a DAG).
  const slotMemo = new Map<string, [ProjectedSlot, ProjectedSlot]>();

  const playerSlot = (m: LiveMatch, k: 1 | 2): ProjectedSlot | null => {
    const name = k === 1 ? m.p1Name : m.p2Name;
    if (name == null) return null;
    return {
      kind: "player",
      registrationId: k === 1 ? m.p1RegId : m.p2RegId,
      name,
      fargo: k === 1 ? m.p1Fargo : m.p2Fargo,
      raceTo: k === 1 ? m.p1Race : m.p2Race,
    };
  };

  // Where an undecided winner/loser of `srcId` will come from. A pending source
  // match that can only ever be a bye (one side permanently empty) is a
  // pass-through: its "winner" is whoever arrives on its live side, and it has no
  // loser. Following it keeps placeholders pointing at a match that will really
  // be played.
  const feederSlot = (outcome: "winner" | "loser", srcId: string): ProjectedSlot => {
    const src = matchById.get(srcId);
    if (src && src.pending) {
      const [a, b] = slotsOf(src);
      const feeders = [a, b].filter((s) => s.kind === "feeder");
      const players = [a, b].filter((s) => s.kind === "player");
      if (feeders.length + players.length < 2) {
        if (outcome === "loser") return EMPTY; // a bye produces no loser
        if (feeders.length === 1 && players.length === 0) return feeders[0];
        if (feeders.length === 0 && players.length === 0) return EMPTY;
      }
    }
    return {
      kind: "feeder",
      outcome,
      sourceMatchId: srcId,
      sourceLabel: src?.numberLabel || srcId,
      sourceSide: src?.side ?? nodeById.get(srcId)?.side ?? null,
    };
  };

  const slotsOf = (m: LiveMatch): [ProjectedSlot, ProjectedSlot] => {
    const cached = slotMemo.get(m.id);
    if (cached) return cached;
    let out: [ProjectedSlot, ProjectedSlot];
    if (m.bye) {
      // buildLiveMatches already puts the advancing player on p1 for a bye.
      out = [playerSlot(m, 1) ?? EMPTY, EMPTY];
    } else if (m.empty) {
      out = [EMPTY, EMPTY];
    } else {
      const node = nodeById.get(m.id);
      const side = (k: 1 | 2): ProjectedSlot => {
        const known = playerSlot(m, k);
        if (known) return known;
        const ref = k === 1 ? node?.slot1 : node?.slot2;
        if (!ref || ref.kind === "seed" || ref.kind === "empty") return EMPTY;
        if (outcomeDecided(ref.matchId)) return EMPTY;
        return feederSlot(ref.kind, ref.matchId);
      };
      out = [side(1), side(2)];
    }
    slotMemo.set(m.id, out);
    return out;
  };

  // When the arrived player(s) of a partially-resolved match became available.
  const arrivalAt = (m: LiveMatch, k: 1 | 2): number => {
    const ref = k === 1 ? nodeById.get(m.id)?.slot1 : nodeById.get(m.id)?.slot2;
    if (!ref || ref.kind === "seed" || ref.kind === "empty") return drawnAt;
    const c = matchState[ref.matchId]?.completedAt;
    return c ? Date.parse(c) : drawnAt; // a bye feeder advanced at draw time
  };

  const lifecycleOf = (m: LiveMatch, slots: [ProjectedSlot, ProjectedSlot]): ProjectedLifecycle => {
    if (m.bye || m.empty) return "bye";
    if (m.status === "completed") return "completed";
    if (m.status === "in_progress") return "inProgress";
    if (m.tableId != null) return "assigned";
    if (isReady(m)) return "ready";
    // Pending: it's only a real future match if two sides can still arrive.
    const live = slots.filter((s) => s.kind !== "empty").length;
    return live >= 2 ? "waiting" : "bye";
  };

  const conditionalOf = (m: LiveMatch): ConditionalState | null => {
    if (!nodeById.get(m.id)?.conditional) return null;
    // Still in the match list ⇒ not skipped. Required once GF is decided (the
    // losers finalist won it); possible while GF is still undecided.
    const gfDecided = matchState["GF"]?.status === "completed" && matchState["GF"]?.winner != null;
    return gfDecided ? "required" : "possible";
  };

  const readyAtMap = computeReadyAtMap(bracket, matchState);

  // Base projection (no ordering yet). Eligibility is fixed here.
  const base = new Map<string, ProjectedMatch>();
  for (const m of matches) {
    const [slot1, slot2] = slotsOf(m);
    const lifecycle = lifecycleOf(m, [slot1, slot2]);
    const blockedBy =
      lifecycle === "waiting"
        ? [
            ...new Set(
              [slot1, slot2]
                .filter((s): s is Extract<ProjectedSlot, { kind: "feeder" }> => s.kind === "feeder")
                .map((s) => s.sourceMatchId),
            ),
          ]
        : [];
    let firstSideReadyAt: number | null = null;
    if (lifecycle === "waiting") {
      const arrived = ([1, 2] as const)
        .filter((k) => (k === 1 ? slot1 : slot2).kind === "player")
        .map((k) => arrivalAt(m, k));
      firstSideReadyAt = arrived.length ? Math.min(...arrived) : null;
    }
    base.set(m.id, {
      matchId: m.id,
      match: m,
      side: m.side,
      round: m.round,
      numberLabel: m.numberLabel,
      location: bracketLocation(m),
      slot1,
      slot2,
      lifecycle,
      eligibility: { ready: isReady(m), blockedBy },
      conditional: conditionalOf(m),
      dependencyDepth: 0,
      readyAt: readyAtMap[m.id] ?? null,
      firstSideReadyAt,
      priority: null,
      readyRank: null,
    });
  }

  // Dependency depth over undecided feeders only.
  const depthMemo = new Map<string, number>();
  const depthOf = (id: string): number => {
    const cached = depthMemo.get(id);
    if (cached != null) return cached;
    depthMemo.set(id, 0); // cycle guard (DAG)
    const pm = base.get(id);
    let d = 0;
    if (pm && pm.lifecycle === "waiting") {
      d = 1 + Math.max(0, ...pm.eligibility.blockedBy.map(depthOf));
    }
    depthMemo.set(id, d);
    return d;
  };
  for (const pm of base.values()) pm.dependencyDepth = depthOf(pm.matchId);

  // Ready subset: the existing, unchanged ordering path.
  // Ready tier: the mode's order (unchanged orderQueue), then TD pins within the tier. This is
  // the ONE list Auto Assign plans from, so it honors the TD's overrides.
  const modeReady = orderQueue(buildQueueEntries(matches, readyAtMap, now), mode, queueOrder);
  const readyQueue = pinsActive ? applyPinsToTier(modeReady, (e) => e.match.id, queuePins) : modeReady;

  const futures = [...base.values()].filter((pm) => pm.lifecycle === "waiting");
  const merged = mergeProjected(
    readyQueue.map((e) => base.get(e.match.id) as ProjectedMatch),
    futures,
    mode,
    queueOrder,
    graphIndex,
  );
  // Waiting tier: TD pins applied after the dependency-safe merge, clamped so nothing lands
  // above its own unresolved feeder or below a dependent; a possible GF2 stays last.
  const ordered = pinsActive
    ? [
        ...merged.slice(0, readyQueue.length),
        ...applyPinsToTier(merged.slice(readyQueue.length), (pm) => pm.matchId, queuePins, {
          feedersOf: (id) => base.get(id)?.eligibility.blockedBy ?? [],
          pinnedLast: (id) => base.get(id)?.conditional === "possible",
        }),
      ]
    : merged;

  // Finalize (fresh objects so priority/readyRank never alias eligibility).
  const readyRankOf = new Map(readyQueue.map((e, i) => [e.match.id, i]));
  const priorityOf = new Map(ordered.map((pm, i) => [pm.matchId, i]));
  const byId: Record<string, ProjectedMatch> = {};
  for (const pm of base.values()) {
    byId[pm.matchId] = {
      ...pm,
      priority: priorityOf.get(pm.matchId) ?? null,
      readyRank: readyRankOf.get(pm.matchId) ?? null,
    };
  }

  return {
    mode,
    scheduled: ordered.map((pm) => byId[pm.matchId]),
    active: matches
      .map((m) => byId[m.id])
      .filter((pm) => pm.lifecycle === "assigned" || pm.lifecycle === "inProgress"),
    completed: matches.map((m) => byId[m.id]).filter((pm) => pm.lifecycle === "completed"),
    byId,
    readyQueue,
  };
};

// ── Ordering ──────────────────────────────────────────────────────────────────
// Two tiers:
//   TIER 1 — READY NOW: every ready match, first, exactly in orderQueue() order.
//            A waiting match never displays above a match playable right now.
//   TIER 2 — WAITING: dependency-safe list scheduling over the future matches.
//            A waiting match becomes a candidate only once every undecided feeder
//            that is itself in the schedule has been placed (ready feeders are
//            already placed in tier 1; feeders on a table are ahead of the whole
//            schedule). Among candidates, the mode's projection key picks next.
//
// Future projection keys (lower sorts first). Tie-breaks use only real data:
// dependencyDepth (fewest unresolved levels first), firstSideReadyAt (the arrived
// player who has waited longest), then graph order. A conditional GF2 that may
// never happen always sorts last.
//   balanced     : cond, grand-first, round, losers-before-winners, …
//   winnersFirst : cond, grand/winners/losers, round, …
//   losersFirst  : cond, grand/losers/winners, round, …
//   longestWait  : cond, … — unresolved matches have no wait time; soonest-playable order.
//   manual       : cond, queueOrder rank (unlisted = ∞), then the balanced key.
//                  Manual still projects; it just never auto-assigns.
const mergeProjected = (
  readyOrdered: ProjectedMatch[],
  futures: ProjectedMatch[],
  mode: AutoAssignMode,
  queueOrder: string[],
  graphIndex: Map<string, number>,
): ProjectedMatch[] => {
  const rank = new Map(queueOrder.map((id, i) => [id, i]));
  const inSchedule = new Set([...readyOrdered, ...futures].map((pm) => pm.matchId));

  const keyOf = (pm: ProjectedMatch): number[] => {
    const cond = pm.conditional === "possible" ? 1 : 0;
    const tail = [
      pm.dependencyDepth,
      pm.firstSideReadyAt ?? Infinity,
      graphIndex.get(pm.matchId) ?? Infinity,
    ];
    const grandFirst = pm.side === "grand" ? 0 : 1;
    const losersFirstTie = pm.side === "losers" ? 0 : 1;
    switch (mode) {
      case "winnersFirst": {
        const s = pm.side === "grand" ? 0 : pm.side === "winners" ? 1 : 2;
        return [cond, s, pm.round, ...tail];
      }
      case "losersFirst": {
        const s = pm.side === "grand" ? 0 : pm.side === "losers" ? 1 : 2;
        return [cond, s, pm.round, ...tail];
      }
      case "longestWait":
        return [cond, ...tail];
      case "manual":
        return [
          cond,
          rank.get(pm.matchId) ?? Infinity,
          grandFirst,
          pm.round,
          losersFirstTie,
          ...tail,
        ];
      case "balanced":
      default:
        return [cond, grandFirst, pm.round, losersFirstTie, ...tail];
    }
  };
  const less = (a: number[], b: number[]): boolean => {
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      const x = a[i] ?? 0;
      const y = b[i] ?? 0;
      if (x < y) return true;
      if (x > y) return false;
    }
    return false;
  };

  // Tier 1: ready, verbatim.
  const out: ProjectedMatch[] = [...readyOrdered];
  const placed = new Set<string>(readyOrdered.map((pm) => pm.matchId));

  // Tier 2: waiting, dependency-safe.
  const pool = [...futures];
  const unlocked = (pm: ProjectedMatch): boolean =>
    pm.eligibility.blockedBy.every((id) => !inSchedule.has(id) || placed.has(id));

  while (pool.length) {
    let bestIdx = -1;
    let bestKey: number[] | null = null;
    for (let i = 0; i < pool.length; i++) {
      if (!unlocked(pool[i])) continue;
      const k = keyOf(pool[i]);
      if (!bestKey || less(k, bestKey)) {
        bestIdx = i;
        bestKey = k;
      }
    }
    if (bestIdx < 0) {
      // Unreachable for a DAG; never drop a match if the graph is malformed.
      pool.sort((a, b) => (graphIndex.get(a.matchId) ?? 0) - (graphIndex.get(b.matchId) ?? 0));
      out.push(...pool);
      break;
    }
    const [best] = pool.splice(bestIdx, 1);
    out.push(best);
    placed.add(best.matchId);
  }
  return out;
};
