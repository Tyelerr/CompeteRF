// src/utils/tournament-formats.ts
// Single source of truth for which tournament formats Compete can RUN live.
//
// Only three engines exist: Single Elimination, Double Elimination and Chip. Every other
// format the Setup lists show (Round Robin, Swiss, Modified Double, Split Bracket, …) is
// "Coming Soon": visible, but not selectable, and it can never start registration or draw a
// bracket. Before this module the draw path silently fell back — anything containing
// "double" drew a double-elimination bracket and everything else a single-elimination one —
// which turned unfinished formats into fake brackets.
//
// Historical rows keep working: legacy aliases (single-elim, double_elimination, …) still
// resolve to their engine, and unknown/unsupported stored values are left untouched (they
// stay readable; they just can't be started).

export type LiveEngine = "single" | "double" | "chip";

// Stored value (case-insensitive, trimmed) → engine. Includes every alias that exists in
// production or older code paths (normalization migration, legacy TD edit screen, bulk import).
const ENGINE_BY_FORMAT: Record<string, LiveEngine> = {
  "single-elimination": "single",
  "single-elim": "single",
  single_elimination: "single",
  "double-elimination": "double",
  "double-elim": "double",
  double_elimination: "double",
  "chip-tournament": "chip",
};

/** The live engine for a stored format value, or null when Compete can't run it (yet). */
export const liveEngineFor = (format?: string | null): LiveEngine | null =>
  ENGINE_BY_FORMAT[(format ?? "").trim().toLowerCase()] ?? null;

/** A chosen (non-empty) format that has no live engine yet. */
export const isFormatComingSoon = (format?: string | null): boolean =>
  !!(format ?? "").trim() && liveEngineFor(format) === null;

/** True only for formats that draw an elimination bracket (single or double). */
export const isBracketEngine = (format?: string | null): boolean => {
  const e = liveEngineFor(format);
  return e === "single" || e === "double";
};

export const COMING_SOON_BADGE = "COMING SOON";

export const COMING_SOON_FORMAT_MESSAGE =
  "This format is coming soon. Choose Single Elimination, Double Elimination or Chip Tournament to run this event in Compete.";

export interface FormatOption {
  label: string;
  value: string;
  disabled?: boolean;
  badge?: string;
}

/** Mark every real option that has no live engine as disabled + "COMING SOON". The empty
 *  placeholder option is left as-is. */
export const withFormatAvailability = (options: { label: string; value: string }[]): FormatOption[] =>
  options.map((o) =>
    o.value && liveEngineFor(o.value) === null ? { ...o, disabled: true, badge: COMING_SOON_BADGE } : { ...o },
  );
