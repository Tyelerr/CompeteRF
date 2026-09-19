// src/utils/settings-complete.ts
// SINGLE SOURCE OF TRUTH for "are the tournament Settings complete enough to open
// registration / leave the Settings step". Used by the header badge (Setup Incomplete
// vs Ready/Registration Open), the Settings→Players gate, the Begin Registration CTA,
// the required-field `*` markers, and the post-attempt red field errors. Callers
// normalize their data (saved Tournament row OR the live SettingsForm) into
// SettingsCompleteInput so every surface agrees.
//
// Required fields (and ONLY these — optional metadata like Contact Phone, image,
// description are never required):
//   Tournament Name · Game Type · Format · Entry Fee ·
//   (Maximum Fargo OR Open Tournament) · Race Type* · Date · Time · Venue · Table Size · Equipment
//   *Race Type is required ONLY for bracket formats. Chip tournaments configure their
//    race via the chip race-to stepper (not the Race Type selector), so it is exempt.

// Stable, UI-facing key for each requirement (drives `*` markers, red field errors, and
// scroll-to-first-missing). Distinct from the human label so UI mapping never parses text.
export type SettingsFieldKey =
  | "name"
  | "gameType"
  | "format"
  | "entryFee"
  | "fargo"
  | "raceMode"
  | "date"
  | "time"
  | "venue"
  | "tableSize"
  | "equipment";

export interface MissingSettingsItem {
  key: SettingsFieldKey;
  label: string;
}

export interface SettingsCompleteInput {
  name?: string | null;
  gameType?: string | null;
  format?: string | null;
  venueId?: number | null;
  date?: string | null;
  time?: string | null;
  tableSize?: string | null;
  equipment?: string | null;
  entryFee?: number | string | null;
  maxFargo?: number | string | null;
  open?: boolean | null;
  // Race Type (live_settings.raceMode). An unconfigured bracket tournament has no saved
  // race mode (undefined/""), which counts as missing — the TD must explicitly pick
  // Fixed Race / A-B-C Groups / Fargo Differential before opening registration. Chip
  // tournaments are exempt (see CHIP_FORMAT below).
  raceMode?: string | null;
}

// Chip tournaments don't use the bracket Race Type selector, so Race Type is not
// required for them. Kept as one constant so the rule can't drift across surfaces.
const CHIP_FORMAT = "chip-tournament";

const has = (v: unknown): boolean =>
  v != null && !(typeof v === "string" && v.trim() === "");

// Fargo eligibility: satisfied by an explicit Open Tournament OR a Maximum Fargo.
const fargoOk = (s: SettingsCompleteInput): boolean => {
  if (s.open === true) return true;
  const mf = typeof s.maxFargo === "string" ? Number(s.maxFargo) : s.maxFargo;
  return mf != null && !Number.isNaN(mf) && mf > 0;
};

// Entry fee counts as provided even when free ($0) — only a blank field is missing.
const feeOk = (s: SettingsCompleteInput): boolean => {
  if (s.entryFee == null || s.entryFee === "") return false;
  const n = typeof s.entryFee === "string" ? Number(s.entryFee) : s.entryFee;
  return !Number.isNaN(n) && n >= 0;
};

// Whether Race Type applies to this format. Bracket formats use the Race Type selector;
// chip tournaments use the chip race-to stepper and are exempt.
const raceTypeApplies = (format?: string | null): boolean => format !== CHIP_FORMAT;

// Missing required requirements as {key,label}, ordered top-to-bottom like the Settings
// form. THIS is the single rule set; every other export derives from it.
export const missingSettingsItems = (
  s: SettingsCompleteInput,
): MissingSettingsItem[] => {
  const missing: MissingSettingsItem[] = [];
  if (!has(s.name)) missing.push({ key: "name", label: "Tournament Name" });
  if (!has(s.gameType)) missing.push({ key: "gameType", label: "Game Type" });
  if (!has(s.format)) missing.push({ key: "format", label: "Format" });
  if (!feeOk(s)) missing.push({ key: "entryFee", label: "Entry Fee" });
  if (!fargoOk(s))
    missing.push({ key: "fargo", label: "Maximum Fargo or Open Tournament" });
  if (raceTypeApplies(s.format) && !has(s.raceMode))
    missing.push({ key: "raceMode", label: "Race Type" });
  if (!has(s.date)) missing.push({ key: "date", label: "Date" });
  if (!has(s.time)) missing.push({ key: "time", label: "Time" });
  if (!has(s.venueId)) missing.push({ key: "venue", label: "Venue" });
  if (!has(s.tableSize)) missing.push({ key: "tableSize", label: "Table Size" });
  if (!has(s.equipment)) missing.push({ key: "equipment", label: "Equipment" });
  return missing;
};

// Human-readable labels only (backward-compatible output used by the "Still needed…"
// summary and the Alert). Derived from missingSettingsItems so it never diverges.
export const missingSettingsFields = (s: SettingsCompleteInput): string[] =>
  missingSettingsItems(s).map((m) => m.label);

export const settingsComplete = (s: SettingsCompleteInput): boolean =>
  missingSettingsItems(s).length === 0;

// Whether a field is required for a given format — the single source for the `*` marker.
// Everything except Race Type is always required; Race Type is bracket-only. Derived from
// the same rules above so markers, validation, and errors can never drift apart.
export const isSettingsFieldRequired = (
  key: SettingsFieldKey,
  format?: string | null,
): boolean => {
  if (key === "raceMode") return raceTypeApplies(format);
  return true;
};
