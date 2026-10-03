// src/utils/bracket-round-labels.ts
// ONE source of truth for elimination round names and the placement each round plays for —
// the live bracket (BracketCanvas column headers + their blue place sub-labels) and the bracket
// backup PDF both read these, so they always agree. Pure (no React).
//
// Names (double elim):  Winners Round N … Winners Quarterfinal · Winners Semifinal · Hotseat
//                       Losers Round N … Losers Final · Finals · Finals (2nd Set)
// Names (single elim):  Round N … Quarterfinal · Semifinal · Final
// Places: single elim — the final is 1st / 2nd and each earlier round eliminates a block below
// it (3-4th, 5-8th …). Double elim — the losers-final loser is 3rd and each earlier losers
// round eliminates a block (4th, 5-6th, 7-8th, 9-12th …); Finals is 1st / 2nd; the Hotseat is
// 1st / 2nd (its winner reaches Finals). A winners-side loss doesn't eliminate — the loser drops
// into a losers round (losersDropRound) — so a player who REACHES a winners round is guaranteed
// that losers round's block — shown as the range itself (e.g. Winners Semifinal in 16: "5th–6th").
// Every header uses one style: a single place ("3rd") or a full range ("9th–12th").
// Winners Round 1 stays unlabeled: reaching it guarantees nothing beyond the field's last block.

const ordSuffix = (n: number): string => {
  const t = n % 100;
  if (t >= 11 && t <= 13) return "th";
  switch (n % 10) {
    case 1:
      return "st";
    case 2:
      return "nd";
    case 3:
      return "rd";
    default:
      return "th";
  }
};

/** "3rd" for a single place, "5th–6th" / "13th–16th" for a range (headers upper-case it). */
export const placeLabel = (lo: number, hi: number): string =>
  lo === hi ? `${lo}${ordSuffix(lo)}` : `${lo}${ordSuffix(lo)}–${hi}${ordSuffix(hi)}`;

export const FINALS_PLACE = placeLabel(1, 2); // "1st–2nd"

/** Winners-side round name. `doubleElim`: the winners final is the Hotseat. */
export const winnersRoundName = (r: number, maxR: number, doubleElim: boolean): string => {
  const fromEnd = maxR - r;
  if (fromEnd === 0) return doubleElim ? "Hotseat" : "Final";
  const base = fromEnd === 1 ? "Semifinal" : fromEnd === 2 ? "Quarterfinal" : `Round ${r}`;
  return doubleElim ? `Winners ${base}` : base;
};

export const losersRoundName = (r: number, maxR: number): string => (r === maxR ? "Losers Final" : `Losers Round ${r}`);

/** Grand-final rounds: 1 = Finals, 2 = the conditional reset. */
export const finalsRoundName = (round: number): string => (round === 1 ? "Finals" : "Finals (2nd Set)");
/** Finals and Finals (2nd Set) both decide 1st–2nd. */
export const finalsPlace = (_round: number): string => FINALS_PLACE;

/**
 * The losers round a winners-round loser drops into (double elim, matches buildLosersGraph):
 * Round 1 losers pair up in L1; Round r ≥ 2 losers enter the major round L(2(r−1)).
 */
export const losersDropRound = (winnersRound: number): number => (winnersRound <= 1 ? 1 : 2 * (winnersRound - 1));

/**
 * Placement each winners round plays for (round → label), from the per-round match counts.
 * Double elim needs the losers-side counts to state each round's guaranteed finish.
 */
export const winnersRoundPlaces = (
  countByRound: Map<number, number>,
  doubleElim: boolean,
  losersCountByRound?: Map<number, number>,
): Map<number, string> => {
  const out = new Map<number, string>();
  const maxR = Math.max(0, ...countByRound.keys());
  if (maxR <= 0) return out;
  if (doubleElim) {
    const losPlaces = losersRoundPlaces(losersCountByRound ?? new Map());
    for (let r = 2; r < maxR; r++) {
      const block = losPlaces.get(losersDropRound(r));
      if (block) out.set(r, block);
    }
    out.set(maxR, FINALS_PLACE);
    return out;
  }
  let place = 3;
  for (let r = maxR; r >= 1; r--) {
    const count = countByRound.get(r) ?? 0;
    if (count <= 0) continue;
    if (r === maxR) {
      out.set(r, FINALS_PLACE);
      continue;
    }
    const hi = place + count - 1;
    out.set(r, placeLabel(place, hi));
    place = hi + 1;
  }
  return out;
};

/** Placement each losers round plays for: the losers-final loser is 3rd, then blocks below. */
export const losersRoundPlaces = (countByRound: Map<number, number>): Map<number, string> => {
  const out = new Map<number, string>();
  const maxR = Math.max(0, ...countByRound.keys());
  let place = 3;
  for (let r = maxR; r >= 1; r--) {
    const count = countByRound.get(r) ?? 0;
    if (count <= 0) continue;
    const hi = place + count - 1;
    out.set(r, placeLabel(place, hi));
    place = hi + 1;
  }
  return out;
};

/** Per-round match counts for one side (from any list of { side, round }). */
export const roundCounts = (items: readonly { side: string; round: number }[], side: string): Map<number, number> => {
  const m = new Map<number, number>();
  for (const it of items) if (it.side === side) m.set(it.round, (m.get(it.round) ?? 0) + 1);
  return m;
};
