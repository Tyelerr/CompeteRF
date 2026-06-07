// src/utils/bracket.resolve.ts
// Resolves a bracket graph into concrete matches: flows players through the
// winner/loser links as matches complete, auto-advances byes (a bye produces no
// loser, so the losers-bracket slot it feeds stays empty), computes each match's
// race, and handles the conditional grand-final reset (GF2). Pure + memoized over
// a DAG, so it just walks the graph.

import {
  BracketGraphNode,
  BracketSide,
  BracketSlotRef,
} from "../models/types/tournament-settings.types";
import { DrawPlayer, matchRaces, RaceConfig } from "./bracket.utils";

export type SlotState = "player" | "empty" | "pending";

export interface ResolvedSlot {
  player: DrawPlayer | null;
  state: SlotState;
  raceTo: number | null;
}

export interface ResolvedMatch {
  id: string;
  side: BracketSide;
  round: number;
  s1: ResolvedSlot;
  s2: ResolvedSlot;
  isBye: boolean; // exactly one player, the other permanently empty → auto-advance
  isEmpty: boolean; // no players at all (e.g. both feeders were byes)
  pending: boolean; // at least one slot not yet known
  skipped: boolean; // GF2 that isn't needed (winners finalist won GF)
  autoWinnerSlot: 1 | 2 | null;
  commonRace: number | null;
}

export interface MatchResult {
  winner?: 1 | 2 | null;
  completed: boolean;
  // "withdraw" removes the loser from the tournament — they do NOT drop to the
  // losers bracket. "forfeit"/"normal" are ordinary losses (winners-side losers
  // still drop).
  result?: "normal" | "forfeit" | "withdraw" | null;
}

export interface ResolvedBracket {
  byId: Map<string, ResolvedMatch>;
  matches: ResolvedMatch[];
  champion: DrawPlayer | null;
}

export const resolveBracket = (
  graph: BracketGraphNode[],
  seededPlayers: (DrawPlayer | null)[],
  results: Record<string, MatchResult>,
  cfg: RaceConfig,
): ResolvedBracket => {
  const byId = new Map(graph.map((n) => [n.id, n]));
  const cache = new Map<string, ResolvedMatch>();

  const winnerOf = (rm: ResolvedMatch): { player: DrawPlayer | null; decided: boolean } => {
    if (rm.skipped || rm.isEmpty) return { player: null, decided: true };
    if (rm.isBye) {
      // A bye normally auto-advances its one player, unless the TD has forfeited
      // or withdrawn them — then nobody advances (their next opponent walks over).
      const br = results[rm.id];
      if (br?.completed && (br.result === "forfeit" || br.result === "withdraw"))
        return { player: null, decided: true };
      return { player: rm.autoWinnerSlot === 1 ? rm.s1.player : rm.s2.player, decided: true };
    }
    if (rm.pending) return { player: null, decided: false };
    const r = results[rm.id];
    if (r?.completed && (r.winner === 1 || r.winner === 2))
      return { player: r.winner === 1 ? rm.s1.player : rm.s2.player, decided: true };
    return { player: null, decided: false };
  };

  const loserOf = (rm: ResolvedMatch): { player: DrawPlayer | null; decided: boolean } => {
    if (rm.skipped || rm.isEmpty) return { player: null, decided: true };
    if (rm.isBye) return { player: null, decided: true }; // a bye has no loser
    if (rm.pending) return { player: null, decided: false };
    const r = results[rm.id];
    if (r?.completed && (r.winner === 1 || r.winner === 2)) {
      // A withdrawal removes the player entirely — no drop to the losers bracket.
      if (r.result === "withdraw") return { player: null, decided: true };
      return { player: r.winner === 1 ? rm.s2.player : rm.s1.player, decided: true };
    }
    return { player: null, decided: false };
  };

  const slot = (ref: BracketSlotRef): { player: DrawPlayer | null; state: SlotState } => {
    if (ref.kind === "seed") {
      const p = seededPlayers[ref.seedIndex] ?? null;
      return { player: p, state: p ? "player" : "empty" };
    }
    if (ref.kind === "empty") return { player: null, state: "empty" };
    const src = resolve(ref.matchId);
    if (!src) return { player: null, state: "empty" };
    const got = ref.kind === "winner" ? winnerOf(src) : loserOf(src);
    if (!got.decided) return { player: null, state: "pending" };
    return { player: got.player, state: got.player ? "player" : "empty" };
  };

  const resolve = (id: string): ResolvedMatch | null => {
    const cached = cache.get(id);
    if (cached) return cached;
    const node = byId.get(id);
    if (!node) return null;

    const a = slot(node.slot1);
    const b = slot(node.slot2);

    // GF2 reset is only needed if the losers finalist won GF (slot2). If the
    // winners finalist (slot1) won GF, the tournament is over and GF2 is skipped.
    let skipped = false;
    if (node.conditional && node.id === "GF2") {
      const gfRes = results["GF"];
      if (gfRes?.completed && gfRes.winner === 1) skipped = true;
    }

    const present = [a, b].filter((s) => s.state === "player").length;
    const anyPending = a.state === "pending" || b.state === "pending";
    const pending = !skipped && anyPending;
    const isEmpty = !skipped && !anyPending && present === 0;
    const isBye = !skipped && !pending && present === 1;
    const autoWinnerSlot: 1 | 2 | null = isBye ? (a.state === "player" ? 1 : 2) : null;

    let s1Race: number | null = null;
    let s2Race: number | null = null;
    let common: number | null = null;
    if (present === 2) {
      const r = matchRaces(a.player, b.player, cfg);
      s1Race = r.p1Race;
      s2Race = r.p2Race;
      common = r.common;
    }

    const rm: ResolvedMatch = {
      id: node.id,
      side: node.side,
      round: node.round,
      s1: { player: a.player, state: a.state, raceTo: s1Race },
      s2: { player: b.player, state: b.state, raceTo: s2Race },
      isBye,
      isEmpty,
      pending,
      skipped,
      autoWinnerSlot,
      commonRace: common,
    };
    cache.set(id, rm);
    return rm;
  };

  const matches = graph
    .map((n) => resolve(n.id))
    .filter((m): m is ResolvedMatch => !!m);

  // Champion: GF2 winner if a reset happened, otherwise the GF winner.
  let champion: DrawPlayer | null = null;
  const gf2 = cache.get("GF2");
  const gf = cache.get("GF");
  if (gf2 && !gf2.skipped) {
    const w = winnerOf(gf2);
    if (w.decided) champion = w.player;
  } else if (gf) {
    const w = winnerOf(gf);
    if (w.decided) champion = w.player;
  }

  return { byId: cache, matches, champion };
};
