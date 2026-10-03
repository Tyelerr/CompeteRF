// src/utils/elim-bracket-summary.ts
// Pure data for the bracket backup PDF's Tournament Summary: payouts (the SAME math as the
// Results → Payouts tab: computeBreakdown / sidePotPayoutViews over pools derived from the
// drawn field, names from computeStandings) and the player list (entry / side pots / Fargo /
// participation status). No React, no Supabase.

import { Tournament } from "../models/types/tournament.types";
import { GeneratedBracket } from "../models/types/tournament-settings.types";
import { LiveMatch, computeEliminatedRegIds } from "./match.utils";
import {
  computeBreakdown,
  entryPoolTotal,
  feesPerPlayer,
  sidePotPayoutViews,
  sidePotTotal,
} from "./prize-pool";
import { parseAmount, safePaidSidePots } from "./side-pots";
import { computeStandings } from "./tournament.stats";

// A registration reduced to what the backup prints (also what the offline copy keeps).
export interface BackupRegistration {
  id: number;
  status: string; // raw tournament_players.status
  paid_entry: boolean;
  paid_side_pots: string[];
  fargo_rating: number | null;
  name: string | null;
}

type RawRegistration = {
  id: number;
  status: string;
  paid_entry?: boolean | null;
  paid_side_pots?: unknown;
  fargo_rating?: number | null;
  guest_name?: string | null;
  profiles?: { name?: string | null; user_name?: string | null } | null;
};

export const compactRegistrations = (rows: readonly RawRegistration[] | null | undefined): BackupRegistration[] =>
  (rows ?? []).map((r) => ({
    id: r.id,
    status: r.status,
    paid_entry: !!r.paid_entry,
    paid_side_pots: safePaidSidePots(r.paid_side_pots),
    fargo_rating: r.fargo_rating ?? null,
    name: r.profiles?.name || r.profiles?.user_name || r.guest_name || null,
  }));

// ── payouts ───────────────────────────────────────────────────────────────────────────────
export interface BackupPayoutLine {
  place: number;
  name: string | null; // null = not decided yet
  amount: number;
}
export interface BackupPayouts {
  configured: boolean;
  entry: { pool: number; places: BackupPayoutLine[] } | null;
  sidePots: { name: string; pool: number; places: BackupPayoutLine[] }[];
}

const isActive = (r: BackupRegistration) => r.status !== "cancelled" && r.status !== "no_show";

export const buildBackupPayouts = (
  t: Pick<Tournament, "entry_fee" | "added_money" | "side_pots" | "live_settings">,
  registrations: BackupRegistration[],
  matches: LiveMatch[],
): BackupPayouts => {
  const config = t.live_settings?.prizePool ?? null;
  if (!config) return { configured: false, entry: null, sidePots: [] };
  const bracket = t.live_settings?.bracket as GeneratedBracket | undefined;
  const players = bracket?.players ?? registrations.filter((r) => r.status === "checked_in").length;
  const fees = (t.live_settings?.fees ?? []).filter((f) => f.enabled ?? true).map((f) => ({ amount: Number(f.amount) || 0 }));
  const entryPool = entryPoolTotal(
    players,
    Number(t.entry_fee) || 0,
    feesPerPlayer(fees),
    !!t.live_settings?.feesAddedOnTop,
    config.includeAddedMoney ?? true,
    Number(t.added_money) || 0,
  );
  const active = registrations.filter(isActive);
  const pools: Record<string, number> = {};
  for (const p of t.side_pots ?? []) {
    const name = (p.name ?? "").trim();
    if (!name) continue;
    pools[name] = sidePotTotal(active.filter((r) => r.paid_side_pots.includes(name)).length, parseAmount(p.amount));
  }
  const standings = computeStandings(matches);
  const finished = standings.some((s) => s.place === 1);
  const nameAt = (place: number) => {
    const at = standings.filter((s) => s.place === place);
    return at.length ? at.map((s) => s.name).join(", ") : null;
  };
  const entry = computeBreakdown(entryPool, config.entryPlaces);
  return {
    configured: true,
    entry: { pool: entry.pool, places: entry.places.map((p) => ({ place: p.place, name: nameAt(p.place), amount: p.amount })) },
    sidePots: sidePotPayoutViews(config, pools).map((sp) => {
      const entered = new Set(active.filter((r) => r.paid_side_pots.includes(sp.name)).map((r) => `r${r.id}`));
      const finishers = standings.filter((s) => entered.has(s.key));
      return {
        name: sp.name,
        pool: sp.pool,
        places: sp.places.map((p, i) => ({ place: p.place, name: finished ? finishers[i]?.name ?? null : null, amount: p.amount })),
      };
    }),
  };
};

// ── player list ───────────────────────────────────────────────────────────────────────────
export interface BackupRosterRow {
  registrationId: number;
  name: string;
  entryPaid: boolean;
  sidePots: string[];
  fargo: number | null;
  status: string; // "In Field", "Champion", "Out · 3rd", "Registered", "No Show", …
}

const ORDER = (status: string) =>
  status === "Champion" ? 0 : status === "In Field" ? 1 : status.startsWith("Out") ? 2 : status === "Registered" ? 3 : status === "Pre-Registered" ? 4 : 5;

export const buildBackupRoster = (
  registrations: BackupRegistration[],
  matches: LiveMatch[],
  bracket: Pick<GeneratedBracket, "seeds"> | null,
): BackupRosterRow[] => {
  const seedName = new Map<number, string>();
  for (const s of bracket?.seeds ?? []) if (s) seedName.set(s.registrationId, s.name);
  const inBracket = new Set(seedName.keys());
  const eliminated = new Set(computeEliminatedRegIds(matches));
  const standings = computeStandings(matches);
  const placeOf = new Map(standings.map((s) => [s.key, s]));
  const rows: BackupRosterRow[] = [];
  for (const r of registrations) {
    if (r.status === "cancelled") continue; // removed entries aren't part of the event
    let status: string;
    const st = placeOf.get(`r${r.id}`);
    if (inBracket.has(r.id)) {
      if (st?.place === 1) status = "Champion";
      else if (eliminated.has(r.id) || (st && st.place > 1)) status = st ? `Out · ${st.placeLabel}` : "Eliminated";
      else status = "In Field";
    } else if (r.status === "checked_in") status = "In Field";
    else if (r.status === "no_show") status = "No Show";
    else if (r.status === "approved") status = "Registered";
    else status = "Pre-Registered";
    rows.push({
      registrationId: r.id,
      name: seedName.get(r.id) ?? r.name ?? `Player #${r.id}`,
      entryPaid: r.paid_entry,
      sidePots: r.paid_side_pots,
      fargo: r.fargo_rating,
      status,
    });
  }
  // Players in the bracket who have no registration row in this data (shouldn't happen) still print.
  for (const [id, name] of seedName) {
    if (!rows.some((x) => x.registrationId === id)) {
      rows.push({ registrationId: id, name, entryPaid: false, sidePots: [], fargo: null, status: "In Field" });
    }
  }
  return rows.sort((a, b) => ORDER(a.status) - ORDER(b.status) || a.status.localeCompare(b.status, undefined, { numeric: true }) || a.name.localeCompare(b.name));
};
