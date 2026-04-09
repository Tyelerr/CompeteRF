// src/utils/game-type.utils.ts
// Single source of truth for game_type normalization.
// Extracted here to break the circular dependency between
// tournament.service.ts and search-alert.service.ts.

export const GAME_TYPE_MAP: Record<string, string> = {
  "8-ball":                 "8 Ball",
  "9-ball":                 "9 Ball",
  "10-ball":                "10 Ball",
  "one-pocket":             "One Pocket",
  "straight-pool":          "Straight Pool",
  "banks":                  "Banks",
  "8-ball-scotch-doubles":  "8 Ball Scotch Doubles",
  "9-ball-scotch-doubles":  "9 Ball Scotch Doubles",
  "10-ball-scotch-doubles": "10 Ball Scotch Doubles",
};

export function normalizeGameType(value: string | null | undefined): string {
  if (!value) return "";
  return GAME_TYPE_MAP[value.toLowerCase()] ?? value;
}