// supabase/functions/_shared/race.ts
// SERVER port of the app's authoritative race logic (src/utils/bracket.utils.ts:
// raceConfigFromLiveSettings / fixedRaceFor / soloRace / matchRaces, and the fixed-race stage
// rule in src/utils/bracket.resolve.ts). Used by notify-match-assigned so assignment messages
// never trust race text from a client. Pure: no Deno APIs, no imports — kept import-free so the
// parity test (supabase/tests/race_parity.test.ts) can run it next to the app code under Node.
// If you change race rules in the app, change them here too; the parity test will catch drift.

export type RaceMode = "fixed" | "groups" | "differential";
export type RaceStage = "winners" | "losers" | "finals";
export interface RaceGroup { label?: string; minFargo: number; maxFargo: number; raceTo: number }
export interface RaceConfig {
  mode: RaceMode;
  fixedWinners: number;
  fixedLosers: number | null;
  fixedFinals: number | null;
  groups: RaceGroup[];
  diffMin: number;
  diffPerGame: number;
  diffMax: number | null;
}
export interface RacePlayer { registrationId: number; name: string; fargo: number | null; raceOverride: number | null }

// deno-lint-ignore no-explicit-any
type Json = any;

export function raceConfigFromLiveSettings(ls: Json): RaceConfig {
  return {
    mode: (ls?.raceMode ?? "fixed") as RaceMode,
    fixedWinners: ls?.fixedRaceWinners ?? 5,
    fixedLosers: ls?.fixedRaceLosers ?? null,
    fixedFinals: ls?.fixedRaceFinals ?? null,
    groups: Array.isArray(ls?.raceGroups) ? ls.raceGroups : [],
    diffMin: ls?.fargoDiffMinRace ?? 3,
    diffPerGame: ls?.fargoDiffPerGame ?? 40,
    diffMax: ls?.fargoDiffMaxRace ?? null,
  };
}

export function fixedRaceFor(cfg: RaceConfig, stage: RaceStage): number {
  if (stage === "losers" && cfg.fixedLosers != null) return cfg.fixedLosers;
  if (stage === "finals" && cfg.fixedFinals != null) return cfg.fixedFinals;
  return cfg.fixedWinners;
}

function groupForFargo(fargo: number | null, groups: RaceGroup[]): RaceGroup | null {
  if (fargo == null) return null;
  return groups.find((g) => fargo >= g.minFargo && (g.maxFargo <= 0 || fargo <= g.maxFargo)) ?? null;
}

function soloRace(p: RacePlayer | null, cfg: RaceConfig, stage: RaceStage): number {
  if (p?.raceOverride != null) return p.raceOverride;
  if (cfg.mode === "groups") {
    const g = groupForFargo(p?.fargo ?? null, cfg.groups);
    return g ? g.raceTo : cfg.fixedWinners;
  }
  if (cfg.mode === "differential") return cfg.diffMin;
  return fixedRaceFor(cfg, stage);
}

export function matchRaces(
  p1: RacePlayer | null,
  p2: RacePlayer | null,
  cfg: RaceConfig,
  stage: RaceStage,
): { p1Race: number | null; p2Race: number | null; common: number | null } {
  if (cfg.mode === "differential" && p1 && p2 && p1.fargo != null && p2.fargo != null) {
    const lo = Math.min(p1.fargo, p2.fargo);
    const hi = Math.max(p1.fargo, p2.fargo);
    const extra = Math.floor((hi - lo) / Math.max(1, cfg.diffPerGame));
    const hiRace = cfg.diffMax != null ? Math.min(cfg.diffMax, cfg.diffMin + extra) : cfg.diffMin + extra;
    const p1Race = p1.raceOverride ?? (p1.fargo <= p2.fargo ? cfg.diffMin : hiRace);
    const p2Race = p2.raceOverride ?? (p2.fargo <= p1.fargo ? cfg.diffMin : hiRace);
    return { p1Race, p2Race, common: p1Race === p2Race ? p1Race : null };
  }
  const p1Race = p1 ? soloRace(p1, cfg, stage) : null;
  const p2Race = p2 ? soloRace(p2, cfg, stage) : null;
  const common =
    p1Race != null && p1Race === p2Race
      ? p1Race
      : cfg.mode === "fixed" && !p1?.raceOverride && !p2?.raceOverride
        ? fixedRaceFor(cfg, stage)
        : null;
  return { p1Race, p2Race, common };
}

// Fixed-race stage of a graph node: double elim finals = GF/GF2 (side "grand"); single elim
// finals = the top winners round; losers side = "losers"; everything else = "winners".
export function stageOfMatch(graph: Json[], matchId: string): RaceStage {
  const node = graph.find((n) => n?.id === matchId);
  if (!node) return "winners";
  if (node.side === "grand") return "finals";
  if (node.side === "losers") return "losers";
  const hasLosers = graph.some((n) => n?.side === "losers");
  const maxW = graph.reduce((a, n) => (n?.side === "winners" ? Math.max(a, Number(n.round) || 0) : a), 0);
  return !hasLosers && Number(node.round) === maxW ? "finals" : "winners";
}

// The seeded DrawPlayer (fargo / override) for a resolved registration id.
export function seedPlayer(ls: Json, registrationId: number, fallbackName: string): RacePlayer {
  const s = (Array.isArray(ls?.bracket?.seeds) ? ls.bracket.seeds : []).find(
    (x: Json) => x && x.registrationId === registrationId,
  );
  return {
    registrationId,
    name: s?.name ?? fallbackName,
    fargo: s?.fargo ?? null,
    raceOverride: s?.raceOverride ?? null,
  };
}

// "Race to 7" when equal, else one line per player (same wording as the app's matchRaceText).
export function raceText(p1Name: string, p1Race: number | null, p2Name: string, p2Race: number | null): string {
  if (p1Race != null && p1Race === p2Race) return `Race to ${p1Race}`;
  const line = (n: string, r: number | null) => `${n} — ${r != null ? `Race to ${r}` : "Race TBD"}`;
  return `${line(p1Name, p1Race)}\n${line(p2Name, p2Race)}`;
}

// Races for a resolved match (sides from _shared/bracket.ts resolveMatchSides).
export function computeMatchRace(
  ls: Json,
  matchId: string,
  sides: { p1: { registrationId: number; name: string }; p2: { registrationId: number; name: string } },
): { p1: RacePlayer; p2: RacePlayer; p1Race: number | null; p2Race: number | null; text: string } {
  const cfg = raceConfigFromLiveSettings(ls);
  const stage = stageOfMatch(Array.isArray(ls?.bracket?.graph) ? ls.bracket.graph : [], matchId);
  const p1 = seedPlayer(ls, sides.p1.registrationId, sides.p1.name);
  const p2 = seedPlayer(ls, sides.p2.registrationId, sides.p2.name);
  const r = matchRaces(p1, p2, cfg, stage);
  return { p1, p2, p1Race: r.p1Race, p2Race: r.p2Race, text: raceText(p1.name, r.p1Race, p2.name, r.p2Race) };
}
