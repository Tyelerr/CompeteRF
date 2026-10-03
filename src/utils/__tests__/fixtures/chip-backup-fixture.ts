// src/utils/__tests__/fixtures/chip-backup-fixture.ts
// Builds REAL Chip states for the backup-packet tests / renders by driving the actual engine
// (start → Start All → results), with the same post-action pipeline the VM runs.

import {
  addTables,
  assignFinals,
  emptyChipState,
  newId,
  reconcileEliminations,
  reconcileMatches,
  reconcileQueue,
  reconcileShuffleRound,
  recordWinner,
  setShuffleMode,
  settleShuffleDrain,
  startAllMatches,
  startChipTournament,
  startPendingMatch,
} from "../../../models/services/chip.engine";
import { ChipEntry, ChipState } from "../../../models/types/chip.types";

const FIRST = ["Tyelerr", "Johnny", "Ricardo", "Dara", "Jacob", "Maria", "Sam", "Lee", "Ana", "Chris", "Pat", "Kim", "Alex", "Jo", "Rae", "Max"];
const LAST = ["Hill", "Ortiz", "Nguyen", "Smith", "Brown", "Garcia", "Lopez", "Young"];

export const chipEntry = (i: number, doubles: boolean): ChipEntry =>
  ({
    id: `e${String(i).padStart(3, "0")}`,
    p1Name: `${FIRST[i % FIRST.length]} ${LAST[i % LAST.length]}${i >= FIRST.length ? ` ${i}` : ""}`,
    p1Fargo: 420 + ((i * 37) % 260),
    p1Phone: "",
    p2Name: doubles ? `${FIRST[(i + 5) % FIRST.length]} ${LAST[(i + 3) % LAST.length]}` : "",
    p2Fargo: doubles ? 400 + ((i * 53) % 240) : null,
    teamFargo: null,
    startChips: 0,
    chips: 0,
    paid: true,
    checkedIn: true,
    paidSidePots: [],
    status: "queued",
    wins: 0,
    losses: 0,
    streak: 0,
    bestStreak: 0,
    eliminations: 0,
    createdAt: new Date(Date.UTC(2026, 9, 3, 18, 0, i)).toISOString(),
  }) as ChipEntry;

const pipeline = (s: ChipState): ChipState =>
  assignFinals(reconcileShuffleRound(reconcileEliminations(settleShuffleDrain(reconcileQueue(reconcileMatches(s))))));

export const buildChipEvent = (opts: { players: number; tables: number; doubles?: boolean; results?: number; shuffle?: boolean; notStarted?: boolean }): ChipState => {
  let s = emptyChipState(opts.doubles ? "scotch_doubles" : "singles");
  s = {
    ...s,
    settings: {
      ...s.settings,
      tiers: [
        { id: newId("t"), minFargo: 0, maxFargo: 499, chips: 5 },
        { id: newId("t"), minFargo: 500, maxFargo: 599, chips: 4 },
        { id: newId("t"), minFargo: 600, maxFargo: null, chips: 3 },
      ],
    },
    entries: Array.from({ length: opts.players }, (_, i) => chipEntry(i, !!opts.doubles)),
  };
  s = addTables(s, opts.tables);
  if (opts.notStarted) return s;
  s = pipeline(startChipTournament(s));
  if (opts.shuffle) s = pipeline(setShuffleMode(s, true));
  s = pipeline(startAllMatches(s));
  for (let k = 0; k < (opts.results ?? 0); k++) {
    const m = s.matches.find((x) => x.status === "in_progress");
    if (!m) break;
    s = pipeline(recordWinner(s, m.id, k % 3 === 0 ? m.bId : m.aId));
    for (const t of s.tables) if (t.pendingChallengerId && !t.matchId) s = pipeline(startPendingMatch(s, t.id));
  }
  return s;
};
