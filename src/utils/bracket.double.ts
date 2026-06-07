// src/utils/bracket.double.ts
// Builds the full match graph for single- and double-elimination brackets. Pure,
// no players — every slot references where its player comes from (a round-1 seed,
// or the winner/loser of another match). The resolver fills players in as matches
// complete, so winners advance and losers drop into the losers bracket
// automatically.
//
// Match ids: winners "W{round}M{i}", losers "L{round}M{i}", grand final "GF".
// For a power-of-two size N: winners = N-1 matches, losers = N-2, grand final = 1
// (double elim total 2N-2). The losers bracket alternates minor rounds (LB
// survivors pair up) and major rounds (LB survivors meet the WB drop-downs), with
// the drop-downs reversed each major round to avoid immediate rematches.

import {
  BracketGraphNode,
  BracketSlotRef,
} from "../models/types/tournament-settings.types";

const winnersId = (r: number, i: number) => `W${r}M${i}`;
const losersId = (r: number, i: number) => `L${r}M${i}`;

const log2 = (n: number) => Math.round(Math.log2(n));

// Winners bracket: a standard single-elimination tree.
export const buildWinnersGraph = (bracketSize: number): BracketGraphNode[] => {
  const k = log2(bracketSize);
  const nodes: BracketGraphNode[] = [];
  for (let r = 1; r <= k; r++) {
    const count = bracketSize / 2 ** r;
    for (let i = 1; i <= count; i++) {
      let slot1: BracketSlotRef;
      let slot2: BracketSlotRef;
      if (r === 1) {
        slot1 = { kind: "seed", seedIndex: (i - 1) * 2 };
        slot2 = { kind: "seed", seedIndex: (i - 1) * 2 + 1 };
      } else {
        slot1 = { kind: "winner", matchId: winnersId(r - 1, i * 2 - 1) };
        slot2 = { kind: "winner", matchId: winnersId(r - 1, i * 2) };
      }
      nodes.push({ id: winnersId(r, i), side: "winners", round: r, slot1, slot2 });
    }
  }
  return nodes;
};

// Losers bracket: rounds 1..2(k-1). Sizes go [N/4, N/4, N/8, N/8, …, 1, 1].
export const buildLosersGraph = (bracketSize: number): BracketGraphNode[] => {
  const k = log2(bracketSize);
  if (k < 2) return [];
  const nodes: BracketGraphNode[] = [];
  const lbRounds = 2 * (k - 1);
  for (let r = 1; r <= lbRounds; r++) {
    const pairIndex = Math.floor((r - 1) / 2); // 0,0,1,1,2,2,…
    const count = bracketSize / 2 ** (pairIndex + 2);
    for (let i = 1; i <= count; i++) {
      let slot1: BracketSlotRef;
      let slot2: BracketSlotRef;
      if (r === 1) {
        // Minor (special): pair the round-1 winners-bracket losers.
        slot1 = { kind: "loser", matchId: winnersId(1, i * 2 - 1) };
        slot2 = { kind: "loser", matchId: winnersId(1, i * 2) };
      } else if (r % 2 === 0) {
        // Major: LB survivor vs a winners-bracket drop-down (reversed order).
        const wbRound = r / 2 + 1;
        const wbCount = bracketSize / 2 ** wbRound;
        slot1 = { kind: "winner", matchId: losersId(r - 1, i) };
        slot2 = { kind: "loser", matchId: winnersId(wbRound, wbCount - i + 1) };
      } else {
        // Minor: pair the survivors of the previous major round.
        slot1 = { kind: "winner", matchId: losersId(r - 1, i * 2 - 1) };
        slot2 = { kind: "winner", matchId: losersId(r - 1, i * 2) };
      }
      nodes.push({ id: losersId(r, i), side: "losers", round: r, slot1, slot2 });
    }
  }
  return nodes;
};

// Grand final: winners-bracket champion vs losers-bracket champion.
// (Single grand final; bracket reset can be added later.)
export const buildGrandFinal = (bracketSize: number): BracketGraphNode => {
  const k = log2(bracketSize);
  const lbRounds = 2 * (k - 1);
  return {
    id: "GF",
    side: "grand",
    round: 1,
    slot1: { kind: "winner", matchId: winnersId(k, 1) },
    slot2: { kind: "winner", matchId: losersId(lbRounds, 1) },
  };
};

export const buildBracketGraph = (
  bracketSize: number,
  doubleElim: boolean,
): BracketGraphNode[] => {
  const winners = buildWinnersGraph(bracketSize);
  if (!doubleElim) return winners;
  return [...winners, ...buildLosersGraph(bracketSize), buildGrandFinal(bracketSize)];
};
