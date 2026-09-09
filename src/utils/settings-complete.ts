// src/utils/settings-complete.ts
// SINGLE SOURCE OF TRUTH for "are the tournament Settings complete enough to open
// registration / leave the Settings step". Used by the header badge (Setup Incomplete
// vs Ready/Registration Open), the Settings→Players gate, and the Begin Registration
// CTA. Callers normalize their data (saved Tournament row OR the live SettingsForm)
// into SettingsCompleteInput so every surface agrees.
//
// Required fields (and ONLY these — optional metadata like Contact Phone, image,
// description are never required):
//   Tournament Name · Game Type · Format · Entry Fee ·
//   (Maximum Fargo OR Open Tournament) · Date · Time · Venue · Table Size · Equipment

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
}

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

// Missing required fields, ordered to read top-to-bottom like the Settings form.
export const missingSettingsFields = (s: SettingsCompleteInput): string[] => {
  const missing: string[] = [];
  if (!has(s.name)) missing.push("Tournament Name");
  if (!has(s.gameType)) missing.push("Game Type");
  if (!has(s.format)) missing.push("Format");
  if (!feeOk(s)) missing.push("Entry Fee");
  if (!fargoOk(s)) missing.push("Maximum Fargo or Open Tournament");
  if (!has(s.date)) missing.push("Date");
  if (!has(s.time)) missing.push("Time");
  if (!has(s.venueId)) missing.push("Venue");
  if (!has(s.tableSize)) missing.push("Table Size");
  if (!has(s.equipment)) missing.push("Equipment");
  return missing;
};

export const settingsComplete = (s: SettingsCompleteInput): boolean =>
  missingSettingsFields(s).length === 0;
