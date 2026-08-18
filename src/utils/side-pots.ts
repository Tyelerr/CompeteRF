// src/utils/side-pots.ts
// Shared side-pot helpers for tournament entry across formats (elimination + chip).
//
// SEMANTICS (see the chip_entries.paid_side_pots migration): `paid_side_pots` is a
// text[] of pot NAMES a player/team is ENTERED in — MEMBERSHIP, not per-pot money
// collection. The only "collected" flag in the model is the entry-fee boolean
// (tournament_players.paid_entry / chip_entries.paid / tournament_teams.paid). There is
// no per-pot "collected" concept. So "entered" ≠ "$ collected".

export interface SidePotDef {
  name: string;
  amount: number;
}

// Coerce a raw side-pot amount to a number. tournament.side_pots is typed {name, amount:
// number} but the submit/edit form actually stores `amount` as a STRING (e.g. "20", and
// sometimes "$20" or " 20 "), so ad-hoc `Number(x)` reads render "$0" on messy input.
// This strips any non-numeric characters first so a configured amount always shows.
export const parseAmount = (raw: unknown): number => {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : 0;
  if (typeof raw === "string") {
    const n = parseFloat(raw.replace(/[^0-9.]/g, ""));
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
};

// THE single source of truth for reading a tournament's configured side pots: keep only
// named pots and coerce every amount consistently. Use this everywhere side pots render
// (Add flow, cards, Review & Start) so a Setup change is reflected identically.
export const parseSidePots = (raw: unknown): SidePotDef[] =>
  (Array.isArray(raw) ? raw : [])
    .map((p) => ({ name: String(p?.name ?? "").trim(), amount: parseAmount(p?.amount) }))
    .filter((p) => p.name.length > 0);

// paid_side_pots should always be a string[], but legacy/seed rows may store a
// non-array value (e.g. an empty JSONB object). Coerce defensively so callers never
// crash on `.filter`/`.length`/`.map`. (Promoted from the elimination manage screen.)
export const safePaidSidePots = (value: unknown): string[] =>
  Array.isArray(value) ? (value as string[]) : [];

// The amount a player is ENTERED for = entry fee + the amounts of the pots they're in.
// This is a SELECTION total (what they owe / are entered in), NOT "collected".
export const selectedEntryTotal = (
  entryFee: number | null | undefined,
  sidePots: SidePotDef[],
  enteredNames: string[],
): number => {
  const entered = new Set(enteredNames);
  const pots = sidePots
    .filter((p) => entered.has(p.name))
    .reduce((sum, p) => sum + parseAmount(p.amount), 0);
  return parseAmount(entryFee) + pots;
};

// Format a currency amount compactly ("$25", "$5"). No cents unless present. Accepts the
// same messy string/number inputs as parseAmount so callers can pass raw config values.
export const formatMoney = (amount: number | string | null | undefined): string => {
  const n = parseAmount(amount);
  return Number.isInteger(n) ? `$${n}` : `$${n.toFixed(2)}`;
};
