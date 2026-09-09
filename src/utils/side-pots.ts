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

// Reconcile a stored membership list (a player/team's `paid_side_pots` names) against an
// edited pot list: keep names that still exist, migrate renamed names via `renameMap`
// (oldName -> newName), drop names that were removed, and de-dupe. Used by every store
// (tournament_players, chip_entries, tournament_teams) so membership stays consistent
// after a Settings side-pot rename/remove.
export const reconcileSidePotMembership = (
  pots: string[],
  renameMap: Record<string, string>,
  validNames: string[],
): string[] => {
  const valid = new Set(validNames);
  const out: string[] = [];
  for (const raw of pots) {
    const n = String(raw ?? "").trim();
    if (!n) continue;
    const target = valid.has(n) ? n : renameMap[n];
    if (target && !out.includes(target)) out.push(target);
  }
  return out;
};

// Detect side-pot RENAMES between the previous and current pot lists. Side pots have no
// stable id — membership is keyed by name — so a rename is inferred from a set diff. A
// rename normally keeps the pot's amount, so removed names are paired to added names by
// equal amount (1:1); a single unpaired removed↔added left over is also treated as a
// rename (covers a rename that ALSO changed the amount). Any remaining unpaired removed
// name is a genuine removal. This biases toward detecting a rename so membership is
// MIGRATED rather than dropped — the safe default for the reported "members go stale on
// rename" bug. Returns the rename map (old -> new) and the list of truly-removed names.
export const detectSidePotRenames = (
  prev: SidePotDef[],
  cur: SidePotDef[],
): { renameMap: Record<string, string>; removed: string[] } => {
  const clean = (arr: SidePotDef[]) =>
    arr
      .map((p) => ({ name: String(p.name ?? "").trim(), amount: parseAmount(p.amount) }))
      .filter((p) => p.name.length > 0);
  const P = clean(prev);
  const C = clean(cur);
  const curNames = new Set(C.map((p) => p.name));
  const prevNames = new Set(P.map((p) => p.name));
  const removedDefs = P.filter((p) => !curNames.has(p.name));
  const availableAdded = C.filter((p) => !prevNames.has(p.name));

  const renameMap: Record<string, string> = {};
  const unpaired: { name: string; amount: number }[] = [];
  // 1) pair by equal amount (a plain rename keeps its amount)
  for (const r of removedDefs) {
    const i = availableAdded.findIndex((a) => a.amount === r.amount);
    if (i >= 0) {
      renameMap[r.name] = availableAdded[i].name;
      availableAdded.splice(i, 1);
    } else {
      unpaired.push(r);
    }
  }
  // 2) a single leftover removed <-> added is a rename that also changed the amount
  if (unpaired.length === 1 && availableAdded.length === 1) {
    renameMap[unpaired[0].name] = availableAdded[0].name;
    unpaired.length = 0;
  }
  return { renameMap, removed: unpaired.map((r) => r.name) };
};

// Format a currency amount compactly ("$25", "$5"). No cents unless present. Accepts the
// same messy string/number inputs as parseAmount so callers can pass raw config values.
export const formatMoney = (amount: number | string | null | undefined): string => {
  const n = parseAmount(amount);
  return Number.isInteger(n) ? `$${n}` : `$${n.toFixed(2)}`;
};
