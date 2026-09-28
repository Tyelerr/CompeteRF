// src/utils/profile-chip-results.ts
// Basic Chip tournament HISTORY credit on the profile (pure). The durable Chip result is
// chip_results — one row per ENTRY (a singles player or a Scotch Doubles TEAM) with both members'
// ids — read for a player by the get_player_chip_results RPC. Both teammates therefore see the
// SAME team placement; tournament standings are never duplicated.
//
// Scope (deliberately small): tournament played + placement + field size + the entry's W-L +
// partner / team name. NOT career aggregates (those need their own persisted fields) and NOT live
// stats (the Chip live views own those).

import { PlayerTournament } from "../models/types/registration.types";

export interface ChipResultCredit {
  place: number;
  fieldSize: number;
  wins: number | null;
  losses: number | null;
  partnerName: string | null;
  teamName: string | null;
  isTeam: boolean;
}

// One get_player_chip_results row.
export interface ChipResultRow {
  tournament_id: number;
  tournament: PlayerTournament["tournament"];
  place: number;
  field_size: number;
  entry_id: string;
  team_name: string | null;
  partner_name: string | null;
  wins: number | null;
  losses: number | null;
  is_team: boolean;
}

export const toChipResultCredit = (r: ChipResultRow): ChipResultCredit => ({
  place: r.place,
  fieldSize: r.field_size,
  wins: r.wins,
  losses: r.losses,
  partnerName: r.partner_name,
  teamName: r.team_name,
  isTeam: !!r.is_team,
});

// Attach each Chip result to the profile tournament it belongs to (the player's registration /
// team membership), or add the completed tournament when the profile has no other record of it
// (e.g. a TD-added Chip entry with no registration row). One item per tournament.
export const mergeChipResults = (all: PlayerTournament[], rows: ChipResultRow[]): PlayerTournament[] => {
  if (!rows.length) return all;
  const byTournament = new Map<number, ChipResultRow>();
  for (const r of rows) if (r.tournament && !byTournament.has(r.tournament_id)) byTournament.set(r.tournament_id, r);
  const out = all.map((t) => {
    const r = t.tournament ? byTournament.get(t.tournament.id) : undefined;
    if (!r) return t;
    byTournament.delete(t.tournament!.id);
    return { ...t, chipResult: toChipResultCredit(r) };
  });
  for (const r of byTournament.values()) {
    out.push({
      id: r.tournament_id,
      chipResultOnly: true,
      status: "checked_in",
      registered_at: r.tournament?.tournament_date ?? "",
      tournament: r.tournament,
      chipResult: toChipResultCredit(r),
    } as PlayerTournament);
  }
  return out;
};

const ordinal = (n: number): string => {
  const v = n % 100;
  const s = v >= 11 && v <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th";
  return `${n}${s}`;
};

// "1st of 12 · 5–3 · with Pat Smith" (team: "· Desert Sharks with Pat Smith").
export const chipResultLine = (c: ChipResultCredit): string => {
  const parts = [c.fieldSize > 0 ? `${ordinal(c.place)} of ${c.fieldSize}` : ordinal(c.place)];
  if (c.wins != null && c.losses != null) parts.push(`${c.wins}–${c.losses}`);
  if (c.isTeam) {
    // chip_results.team_name is usually the default "P1 / P2" pairing, not a custom name — only a
    // real custom team name is shown (never "Pat / Sam with Sam").
    const custom = c.teamName && !(c.partnerName && c.teamName.includes(c.partnerName)) && !c.teamName.includes(" / ")
      ? `${c.teamName} `
      : "";
    parts.push(c.partnerName ? `${custom}with ${c.partnerName}`.trim() : custom.trim() || "Team");
  }
  return parts.filter(Boolean).join(" · ");
};
