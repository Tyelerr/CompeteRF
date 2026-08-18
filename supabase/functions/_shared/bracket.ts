// supabase/functions/_shared/bracket.ts
// Membership-only port of src/utils/bracket.resolve.ts — adapts the SAME
// winner/loser/seed flow to resolve the two current registrationIds of a match
// from trusted live_settings only (no race math). Server-only; rejects unknown
// ids, malformed JSON, cycles, and unresolved refs by returning null.

export type Player = { registrationId: number; name: string } | null;
export interface ResolvedSides { p1: Player; p2: Player }

type SlotRef =
  | { kind: "seed"; seedIndex: number }
  | { kind: "winner"; matchId: string }
  | { kind: "loser"; matchId: string }
  | { kind: "empty" };
interface GraphNode { id: string; slot1: SlotRef; slot2: SlotRef; conditional?: boolean }
interface Seed { registrationId: number; name: string }
interface Round1Slot { registrationId?: number | null; name: string }
interface Round1Match { matchNumber: number; p1: Round1Slot | null; p2: Round1Slot | null }
interface Bracket { graph?: GraphNode[]; seeds?: (Seed | null)[]; round1?: Round1Match[] }
interface MatchState { status?: string; winner?: 1 | 2 | null; result?: string | null }

type SlotState = "player" | "empty" | "pending";
interface RM {
  id: string; s1: Player; s2: Player; s1State: SlotState; s2State: SlotState;
  isBye: boolean; isEmpty: boolean; pending: boolean; skipped: boolean; autoWinnerSlot: 1 | 2 | null;
}

/** Resolve the two current sides of `matchId`, or null if not a real 2-player match. */
export function resolveMatchSides(
  bracket: Bracket,
  matchState: Record<string, MatchState>,
  matchId: string,
): ResolvedSides | null {
  try {
    if (Array.isArray(bracket?.graph) && bracket.graph.length > 0) {
      const rm = resolveFromGraph(bracket.graph, bracket.seeds ?? [], matchState ?? {}, matchId);
      if (!rm) return null;
      if (rm.s1State !== "player" || rm.s2State !== "player") return null;
      return { p1: rm.s1, p2: rm.s2 };
    }
    // Round-1-only (single-elim V1): matchId is the round-1 match number.
    const r1 = (bracket?.round1 ?? []).find((m) => String(m.matchNumber) === String(matchId));
    if (!r1) return null;
    const p1 = r1.p1?.registrationId != null ? { registrationId: r1.p1.registrationId, name: r1.p1.name } : null;
    const p2 = r1.p2?.registrationId != null ? { registrationId: r1.p2.registrationId, name: r1.p2.name } : null;
    if (!p1 || !p2) return null;
    return { p1, p2 };
  } catch {
    return null; // malformed JSON / cycle / unresolved ref
  }
}

function resolveFromGraph(
  graph: GraphNode[],
  seeds: (Seed | null)[],
  results: Record<string, MatchState>,
  targetId: string,
): RM | null {
  const byId = new Map(graph.map((n) => [n.id, n]));
  const cache = new Map<string, RM>();
  const visiting = new Set<string>();

  const seededPlayer = (i: number): Player => {
    const s = seeds[i] ?? null;
    return s && s.registrationId != null ? { registrationId: s.registrationId, name: s.name } : null;
  };

  const winnerOf = (rm: RM): { player: Player; decided: boolean } => {
    if (rm.skipped || rm.isEmpty) return { player: null, decided: true };
    if (rm.isBye) {
      const br = results[rm.id];
      if (br?.status === "completed" && (br.result === "forfeit" || br.result === "withdraw")) return { player: null, decided: true };
      return { player: rm.autoWinnerSlot === 1 ? rm.s1 : rm.s2, decided: true };
    }
    if (rm.pending) return { player: null, decided: false };
    const r = results[rm.id];
    if (r?.status === "completed" && (r.winner === 1 || r.winner === 2)) return { player: r.winner === 1 ? rm.s1 : rm.s2, decided: true };
    return { player: null, decided: false };
  };

  const loserOf = (rm: RM): { player: Player; decided: boolean } => {
    if (rm.skipped || rm.isEmpty) return { player: null, decided: true };
    if (rm.isBye) return { player: null, decided: true };
    if (rm.pending) return { player: null, decided: false };
    const r = results[rm.id];
    if (r?.status === "completed" && (r.winner === 1 || r.winner === 2)) {
      if (r.result === "withdraw") return { player: null, decided: true };
      return { player: r.winner === 1 ? rm.s2 : rm.s1, decided: true };
    }
    return { player: null, decided: false };
  };

  const slot = (ref: SlotRef): { player: Player; state: SlotState } => {
    if (ref.kind === "seed") { const p = seededPlayer(ref.seedIndex); return { player: p, state: p ? "player" : "empty" }; }
    if (ref.kind === "empty") return { player: null, state: "empty" };
    const src = resolve(ref.matchId);
    if (!src) return { player: null, state: "empty" };
    const got = ref.kind === "winner" ? winnerOf(src) : loserOf(src);
    if (!got.decided) return { player: null, state: "pending" };
    return { player: got.player, state: got.player ? "player" : "empty" };
  };

  const resolve = (id: string): RM | null => {
    const c = cache.get(id);
    if (c) return c;
    if (visiting.has(id)) throw new Error("cycle");
    const node = byId.get(id);
    if (!node) return null;
    visiting.add(id);
    const a = slot(node.slot1);
    const b = slot(node.slot2);
    let skipped = false;
    if (node.conditional && node.id === "GF2") {
      const gf = results["GF"];
      if (gf?.status === "completed" && gf.winner === 1) skipped = true;
    }
    const present = [a, b].filter((s) => s.state === "player").length;
    const anyPending = a.state === "pending" || b.state === "pending";
    const pending = !skipped && anyPending;
    const isEmpty = !skipped && !anyPending && present === 0;
    const isBye = !skipped && !pending && present === 1;
    const rm: RM = {
      id: node.id, s1: a.player, s2: b.player, s1State: a.state, s2State: b.state,
      isBye, isEmpty, pending, skipped,
      autoWinnerSlot: isBye ? (a.state === "player" ? 1 : 2) : null,
    };
    cache.set(id, rm);
    visiting.delete(id);
    return rm;
  };

  return resolve(targetId);
}
