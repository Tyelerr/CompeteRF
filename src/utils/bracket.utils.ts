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
const groupForFargo = (
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
