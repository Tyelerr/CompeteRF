// src/utils/bracket.utils.ts
// V1 bracket helpers: recommended size, random Round-1 draw with byes and
// handicap-aware race assignment, and a rough planning calculation summary.
// Pure functions (Math.random is fine in app runtime).

import {
  BracketMatch,
  BracketSlot,
  RaceGroup,
  RaceMode,
} from "../models/types/tournament-settings.types";

export interface DrawPlayer {
  registrationId: number;
  name: string;
  fargo: number | null;
  raceOverride?: number | null; // TD-set race-to; wins over group/Fargo logic
}

export interface RaceConfig {
  mode: RaceMode;
  fixedWinners: number; // fixed-mode match race
  groups: RaceGroup[];
  diffMin: number;
  diffPerGame: number;
  diffMax: number | null; // null = uncapped
}

// ── Sizing ───────────────────────────────────────────────────────────────────
export const nextPowerOfTwo = (n: number): number => {
  let s = 1;
  while (s < n) s *= 2;
  return s;
};

// Recommended standard bracket size: next power of two >= players, min 8.
// 1-8 -> 8, 9-16 -> 16, 17-32 -> 32, 33-64 -> 64, 65-128 -> 128.
export const recommendedBracketSize = (players: number): number =>
  Math.max(8, nextPowerOfTwo(Math.max(1, players)));

export const STANDARD_SIZES = [8, 16, 32, 64, 128];

// Average minutes per game by game type (drives the time estimate). Handles
// both slugs ("9-ball") and normalized labels ("9 Ball"). Order matters: check
// "10" before "8"/"9". Unlisted games fall back to a default.
export const minutesPerGameForType = (gameType: string): number => {
  const g = (gameType || "").toLowerCase();
  if (g.includes("10")) return 9; // 10-ball
  if (g.includes("9")) return 7; // 9-ball
  if (g.includes("8")) return 10; // 8-ball
  return 9; // one-pocket / straight / banks / other
};

// ── Race assignment ──────────────────────────────────────────────────────────
export const groupForFargo = (
  fargo: number | null,
  groups: RaceGroup[],
): RaceGroup | null => {
  if (fargo == null) return null;
  return (
    groups.find(
      (g) => fargo >= g.minFargo && (g.maxFargo <= 0 || fargo <= g.maxFargo),
    ) ?? null
  );
};

// ── Authoritative race display (from live_settings, not the stale `race` column) ─
// The denormalized top-level `race` string only gets rebuilt for fixed/differential
// on save; in groups mode it write-throughs the previous value and goes stale. This
// derives the CURRENT race display straight from live_settings — the same source the
// live view, Generate Bracket and group assignment use. Returns null when there is
// no raceMode (legacy tournaments) so callers can fall back to the old string.
export interface RaceGroupLine {
  label: string;
  range: string; // "600–750" / "0+"
  race: string; // "Race to 5"
}
export interface RaceDisplay {
  summary: string; // "Race Groups" / "Fixed Race" / "Fargo Differential"
  groups: RaceGroupLine[]; // groups mode only
  rows: { label: string; value: string }[]; // fixed / differential detail
}

const groupRange = (min: number, max: number): string => {
  const lo = min && min > 0 ? min : 0;
  return max && max > 0 ? `${lo}–${max}` : `${lo}+`;
};

export const describeRace = (
  liveSettings:
    | {
        raceMode?: RaceMode;
        fixedRaceWinners?: number | null;
        fixedRaceLosers?: number | null;
        fixedRaceFinals?: number | null;
        raceGroups?: RaceGroup[];
        fargoDiffMinRace?: number | null;
        fargoDiffPerGame?: number | null;
        fargoDiffMaxRace?: number | null;
      }
    | null
    | undefined,
  format: string,
): RaceDisplay | null => {
  const mode = liveSettings?.raceMode;
  if (!mode) return null;
  const hasLosers = /double/i.test(format || "");
  if (mode === "groups") {
    const groups = (liveSettings?.raceGroups ?? []).map((g, i) => ({
      label: g.label || `Group ${i + 1}`,
      range: groupRange(g.minFargo, g.maxFargo),
      race: `Race to ${g.raceTo}`,
    }));
    return { summary: "Race Groups", groups, rows: [] };
  }
  if (mode === "fixed") {
    const w = liveSettings?.fixedRaceWinners ?? 5;
    const l = liveSettings?.fixedRaceLosers ?? w;
    const fin = liveSettings?.fixedRaceFinals ?? w;
    const rows = hasLosers
      ? [
          { label: "Winners", value: `Race to ${w}` },
          { label: "Losers", value: `Race to ${l}` },
          { label: "Finals", value: `Race to ${fin}` },
        ]
      : [
          { label: "Match", value: `Race to ${w}` },
          { label: "Finals", value: `Race to ${fin}` },
        ];
    return { summary: "Fixed Race", groups: [], rows };
  }
  // differential
  const min = liveSettings?.fargoDiffMinRace ?? 3;
  const per = liveSettings?.fargoDiffPerGame ?? 40;
  const max = liveSettings?.fargoDiffMaxRace;
  return {
    summary: "Fargo Differential",
    groups: [],
    rows: [
      { label: "Minimum Race", value: `${min}` },
      { label: "Points / Game", value: `${per}` },
      { label: "Maximum Race", value: max != null ? `${max}` : "No Limit" },
    ],
  };
};

// A player's race independent of opponent (fixed/groups, or differential solo).
// A manual override always wins.
const soloRace = (player: DrawPlayer | null, cfg: RaceConfig): number => {
  if (player?.raceOverride != null) return player.raceOverride;
  if (cfg.mode === "groups") {
    const g = groupForFargo(player?.fargo ?? null, cfg.groups);
    return g ? g.raceTo : cfg.fixedWinners;
  }
  if (cfg.mode === "differential") return cfg.diffMin;
  return cfg.fixedWinners;
};

export const averageRace = (players: DrawPlayer[], cfg: RaceConfig): number => {
  if (players.length === 0) return cfg.fixedWinners || 5;
  const sum = players.reduce((acc, p) => acc + soloRace(p, cfg), 0);
  return Math.max(1, Math.round(sum / players.length));
};

// Race for each side of a match (handicap-aware for differential).
export const matchRaces = (
  p1: DrawPlayer | null,
  p2: DrawPlayer | null,
  cfg: RaceConfig,
): { p1Race: number | null; p2Race: number | null; common: number | null } => {
  if (
    cfg.mode === "differential" &&
    p1 &&
    p2 &&
    p1.fargo != null &&
    p2.fargo != null
  ) {
    const lo = Math.min(p1.fargo, p2.fargo);
    const hi = Math.max(p1.fargo, p2.fargo);
    const extra = Math.floor((hi - lo) / Math.max(1, cfg.diffPerGame));
    const hiRace =
      cfg.diffMax != null
        ? Math.min(cfg.diffMax, cfg.diffMin + extra)
        : cfg.diffMin + extra;
    // A manual override wins over the computed differential race.
    const p1Race =
      p1.raceOverride ?? (p1.fargo <= p2.fargo ? cfg.diffMin : hiRace);
    const p2Race =
      p2.raceOverride ?? (p2.fargo <= p1.fargo ? cfg.diffMin : hiRace);
    return { p1Race, p2Race, common: p1Race === p2Race ? p1Race : null };
  }
  const p1Race = p1 ? soloRace(p1, cfg) : null;
  const p2Race = p2 ? soloRace(p2, cfg) : null;
  const common =
    p1Race != null && p1Race === p2Race
      ? p1Race
      : cfg.mode === "fixed" && !p1?.raceOverride && !p2?.raceOverride
        ? cfg.fixedWinners
        : null;
  return { p1Race, p2Race, common };
};

// ── A/B/C race-group validation (pure) ────────────────────────────────────────
// Blank bounds are MEANINGFUL: blank min ⇒ 0, blank max ⇒ no upper limit (open-ended).
// A blank max is NEVER an error (it is implicitly bounded by the tournament max when Open
// Tournament is off), so the TD is never forced to type the tournament max. Only an EXPLICIT
// max above the tournament max (with Open off) warns.
export interface RaceGroupRange {
  label: string;
  min: number | null; // null = blank ⇒ 0
  max: number | null; // null = blank ⇒ open-ended
  raceTo: number | null; // null/blank ⇒ missing
}
export interface RaceGroupValidationResult {
  ok: boolean;
  errors: string[];
  invalidIndices: number[];
}
export const validateRaceGroups = (
  groups: RaceGroupRange[],
  opts: { tournamentMax: number | null; open: boolean },
): RaceGroupValidationResult => {
  const errors: string[] = [];
  const invalid = new Set<number>();
  const gname = (g: RaceGroupRange, i: number) => `Group ${g.label.trim() || i + 1}`;
  if (groups.length === 0) {
    return { ok: false, errors: ["Add at least one race group."], invalidIndices: [] };
  }
  groups.forEach((g, i) => {
    // A. min ≤ max (only when BOTH bounds are explicit)
    if (g.min != null && g.max != null && g.min > g.max) {
      errors.push(`${gname(g, i)} minimum Fargo (${g.min}) cannot be greater than its maximum Fargo (${g.max}).`);
      invalid.add(i);
    }
    // B. explicit max ≤ tournament max (only when a max is TYPED and Open Tournament is off)
    if (!opts.open && opts.tournamentMax != null && g.max != null && g.max > opts.tournamentMax) {
      errors.push(`${gname(g, i)} maximum Fargo (${g.max}) exceeds the tournament maximum Fargo (${opts.tournamentMax}).`);
      invalid.add(i);
    }
    // D. Race To required (≥ 1)
    if (g.raceTo == null || g.raceTo < 1) {
      errors.push(`${gname(g, i)} needs a Race To of 1 or more.`);
      invalid.add(i);
    }
  });
  // C. overlap (blank min ⇒ 0, blank max ⇒ +∞)
  const lo = (g: RaceGroupRange) => g.min ?? 0;
  const hi = (g: RaceGroupRange) => (g.max == null ? Number.POSITIVE_INFINITY : g.max);
  for (let i = 0; i < groups.length; i++) {
    for (let j = i + 1; j < groups.length; j++) {
      if (lo(groups[i]) <= hi(groups[j]) && lo(groups[j]) <= hi(groups[i])) {
        errors.push(`${gname(groups[i], i)} overlaps ${gname(groups[j], j)}.`);
        invalid.add(i);
        invalid.add(j);
      }
    }
  }
  return { ok: errors.length === 0, errors, invalidIndices: [...invalid].sort((a, b) => a - b) };
};

// ── Seeding / draw ───────────────────────────────────────────────────────────
// Standard single-elimination seed order so byes spread to the top seeds.
const seedOrder = (size: number): number[] => {
  let pos = [1, 2];
  while (pos.length < size) {
    const sum = pos.length * 2 + 1;
    const next: number[] = [];
    for (const p of pos) {
      next.push(p);
      next.push(sum - p);
    }
    pos = next;
  }
  return pos;
};

const shuffle = <T,>(arr: T[]): T[] => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

const slotOf = (
  player: DrawPlayer | null,
  raceTo: number | null,
): BracketSlot | null =>
  player
    ? {
        registrationId: player.registrationId,
        name: player.name,
        fargo: player.fargo,
        raceTo,
      }
    : null;

// Random seeding: shuffle players into standard seed slots, byes fill the rest.
// Returns an array indexed by round-1 slot position (0..bracketSize-1), where
// slots [2m, 2m+1] are the two players of round-1 match m. This is the seed order
// the graph's seedIndex references.
export const seedPlayers = (
  players: DrawPlayer[],
  bracketSize: number,
): (DrawPlayer | null)[] => {
  const shuffled = shuffle(players);
  const order = seedOrder(bracketSize);
  return order.map((seed) => (seed <= shuffled.length ? shuffled[seed - 1] : null));
};

// Round-1 matches from an already-seeded slot array (pairs + races).
export const round1FromSeeds = (
  filled: (DrawPlayer | null)[],
  cfg: RaceConfig,
): BracketMatch[] => {
  const matches: BracketMatch[] = [];
  for (let m = 0; m < filled.length / 2; m++) {
    const a = filled[m * 2];
    const b = filled[m * 2 + 1];
    const { p1Race, p2Race, common } = matchRaces(a, b, cfg);
    matches.push({
      matchNumber: m + 1,
      p1: slotOf(a, p1Race),
      p2: slotOf(b, p2Race),
      bye: !a || !b,
      raceTo: common,
    });
  }
  return matches;
};

export const generateRound1 = (
  players: DrawPlayer[],
  bracketSize: number,
  cfg: RaceConfig,
): BracketMatch[] => round1FromSeeds(seedPlayers(players, bracketSize), cfg);

// ── Planning calculation summary ─────────────────────────────────────────────
export interface BracketStats {
  players: number;
  bracketSize: number;
  byes: number;
  totalMatches: number;
  winnerSideMatches: number;
  loserSideMatches: number;
  gamesPerMatch: number;
  estGames: number;
  minPerGame: number;
  estCompletionHours: number;
  byTable: { tables: number; hours: number }[];
}

const isDoubleElim = (format: string): boolean =>
  (format || "").toLowerCase().includes("double");

// ── Race-aware duration model (pure) ──────────────────────────────────────────
// Expected games in a match. A race-to-N match plays between N and 2N-1 games; a
// long-run average of ~1.5N is the established heuristic used across this planner. For an
// ASYMMETRIC match (e.g. Fargo Differential, where the two sides race to different targets)
// we base it on BOTH targets — the mean of the two — so neither the higher nor the lower
// target alone drives the estimate. Symmetric races (raceB === raceA) reduce to round(1.5N).
export const GAMES_PER_RACE_FACTOR = 1.5;
export const expectedGamesForRace = (raceA: number, raceB: number = raceA): number =>
  Math.max(1, Math.round(GAMES_PER_RACE_FACTOR * ((raceA + raceB) / 2)));

// Expected games per match for a field whose race depends on the PAIRING (groups /
// differential), not on a fixed per-bracket value. We average expectedGamesForRace over every
// unique unordered pair in the actual Ready field, deriving each pair's two race targets from
// the SAME authoritative matchRaces() the live engine uses — so it honors diffMin, points/game,
// rounding and max-race (differential) and per-group raceTo (groups). This replaces the old
// "use diffMin for every match" underestimate. O(n²) but runs once per estimate.
export const expectedFieldGamesPerMatch = (
  players: DrawPlayer[],
  cfg: RaceConfig,
): number => {
  const fallbackRace = cfg.mode === "differential" ? cfg.diffMin : cfg.fixedWinners;
  if (players.length < 2) return expectedGamesForRace(Math.max(1, fallbackRace));
  let sum = 0;
  let n = 0;
  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      const { p1Race, p2Race } = matchRaces(players[i], players[j], cfg);
      sum += expectedGamesForRace(p1Race ?? fallbackRace, p2Race ?? fallbackRace);
      n++;
    }
  }
  return n > 0 ? sum / n : expectedGamesForRace(Math.max(1, fallbackRace));
};

export interface DurationInput {
  players: number; // Ready-player count (drives matches + rounds)
  format: string;
  tables: number; // usable tables (see availability caller)
  minPerGame: number; // minutes per game/rack for the game type
  cfg: RaceConfig; // authoritative race config (matchRaces / soloRace)
  field: DrawPlayer[]; // Ready players (groups/differential pairing average)
  fixedLosers?: number | null; // fixed-mode loser-side race (falls back to winners)
  fixedFinals?: number | null; // fixed-mode grand-final race (falls back to winners)
}

export interface DurationEstimate {
  winnerGames: number;
  loserGames: number;
  finalGames: number;
  totalWorkMinutes: number; // sum of every match's duration (the 1-table time)
  criticalPathMinutes: number; // dependency floor (the unlimited-tables time)
  estElapsedMinutes: number; // modeled elapsed start→finish
  estElapsedHours: number | null; // null = unknown (no usable table)
}

const ceilLog2Rounds = (n: number): number =>
  Math.max(1, Math.ceil(Math.log2(Math.max(2, n))));

// Estimate ELAPSED tournament time (start of round 1 → grand final finishes), NOT total labor.
// Two bounds, take the max — the standard makespan model for parallel work with a dependency
// floor:
//   • totalWork / tables : throughput bound (all match-minutes spread over usable tables)
//   • criticalPath       : dependency floor (a champion's chain of matches must run in series;
//                          more tables can never beat this)
// elapsed = max(criticalPath, totalWork / tables). Properties this guarantees:
//   1 table  → totalWork (no parallelism);  ∞ tables → criticalPath (never →0);
//   more tables never increases it and stops helping past saturation.
// Rounds = ceil(log2(players)) (a champion plays one match per round). Double elim adds the
// loser-bracket tail (~rounds-1 loser matches on the critical path) plus the grand final, and
// counts P-1 winner-side + P-2 loser-side + 1 grand-final matches for the work total. Race per
// position: fixed uses winners/losers/finals explicitly; groups & differential use the field's
// expected per-match games for every position (race varies by pairing, not by bracket side).
export const estimateTournamentDuration = (i: DurationInput): DurationEstimate => {
  const P = Math.max(0, Math.floor(i.players));
  const perGame = Math.max(0, i.minPerGame);
  const dbl = isDoubleElim(i.format);

  let winnerGames: number;
  let loserGames: number;
  let finalGames: number;
  if (i.cfg.mode === "fixed") {
    winnerGames = expectedGamesForRace(i.cfg.fixedWinners);
    loserGames = expectedGamesForRace(i.fixedLosers ?? i.cfg.fixedWinners);
    finalGames = expectedGamesForRace(i.fixedFinals ?? i.cfg.fixedWinners);
  } else {
    const d = expectedFieldGamesPerMatch(i.field, i.cfg);
    winnerGames = loserGames = finalGames = d;
  }
  const wDur = winnerGames * perGame;
  const lDur = loserGames * perGame;
  const fDur = finalGames * perGame;

  if (P < 2) {
    return {
      winnerGames,
      loserGames,
      finalGames,
      totalWorkMinutes: 0,
      criticalPathMinutes: 0,
      estElapsedMinutes: 0,
      estElapsedHours: i.tables >= 1 ? 0 : null,
    };
  }

  const W = ceilLog2Rounds(P);
  const totalWork = dbl
    ? (P - 1) * wDur + (P - 2) * lDur + fDur
    : (P - 2) * wDur + fDur;
  const criticalPath = dbl
    ? (W - 1) * wDur + (W - 1) * lDur + fDur
    : (W - 1) * wDur + fDur;

  const tables = Math.floor(i.tables);
  if (tables < 1) {
    // No usable table → elapsed time is unknown (do not divide by zero / show 0).
    return {
      winnerGames,
      loserGames,
      finalGames,
      totalWorkMinutes: totalWork,
      criticalPathMinutes: criticalPath,
      estElapsedMinutes: totalWork,
      estElapsedHours: null,
    };
  }

  const elapsed = Math.max(criticalPath, totalWork / tables);
  return {
    winnerGames,
    loserGames,
    finalGames,
    totalWorkMinutes: totalWork,
    criticalPathMinutes: criticalPath,
    estElapsedMinutes: elapsed,
    estElapsedHours: elapsed / 60,
  };
};

export const computeBracketStats = (
  players: number,
  bracketSize: number,
  format: string,
  avgRace: number,
  tables: number,
  minPerGame = 9,
): BracketStats => {
  const byes = Math.max(0, bracketSize - players);
  const dbl = isDoubleElim(format);
  const winnerSideMatches = Math.max(0, players - 1);
  const loserSideMatches = dbl ? Math.max(0, players - 2) : 0;
  const grandFinal = dbl && players >= 2 ? 1 : 0;
  const totalMatches = winnerSideMatches + loserSideMatches + grandFinal;

  const gamesPerMatch = Math.max(1, Math.round(avgRace * 1.5));
  const estGames = totalMatches * gamesPerMatch;
  const totalMinutes = estGames * minPerGame;
  const hoursFor = (t: number) => totalMinutes / Math.max(1, t) / 60;

  return {
    players,
    bracketSize,
    byes,
    totalMatches,
    winnerSideMatches,
    loserSideMatches,
    gamesPerMatch,
    estGames,
    minPerGame,
    estCompletionHours: hoursFor(Math.max(1, tables)),
    byTable: [4, 6, 8, 10].map((t) => ({ tables: t, hours: hoursFor(t) })),
  };
};
