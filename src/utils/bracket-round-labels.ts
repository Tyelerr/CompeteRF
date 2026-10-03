// src/utils/bracket-round-labels.ts
// ONE source of truth for elimination round names and the placement each round plays for —
// the live bracket (BracketCanvas column headers + their blue place sub-labels) and the bracket
// backup PDF both read these, so they always agree. Pure (no React).
//
// Names (double elim):  Winners Round N … Winners Quarterfinal · Winners Semifinal · Hotseat
//                       Losers Round N … Losers Final · Finals · Finals (2nd Set)
// Names (single elim):  Round N … Quarterfinal · Semifinal · Final
// Places: single elim — the final is 1st / 2nd and each earlier round eliminates a block below
// it (3-4th, 5-8th …). Double elim — winners-side losses don't eliminate, so only the Hotseat
// (winners final) carries a placement (1st / 2nd: its winner reaches Finals); the losers-final
// loser is 3rd and each earlier losers round eliminates a block (4th, 5-6th, 7-8th, 9-12th …);
// Finals is 1st / 2nd.

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

/** "3rd" for a single place, "5-6th" / "13-16th" for a range. */
export const placeLabel = (lo: number, hi: number): string =>
  lo === hi ? `${lo}${ordSuffix(lo)}` : `${lo}-${hi}${ordSuffix(hi)}`;

export const FINALS_PLACE = "1st / 2nd";

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
export const finalsPlace = (round: number): string | undefined => (round === 1 ? FINALS_PLACE : undefined);

/** Placement each winners round plays for (round → label), from the per-round match counts. */
export const winnersRoundPlaces = (countByRound: Map<number, number>, doubleElim: boolean): Map<number, string> => {
  const out = new Map<number, string>();
  const maxR = Math.max(0, ...countByRound.keys());
  if (maxR <= 0) return out;
  if (doubleElim) {
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
