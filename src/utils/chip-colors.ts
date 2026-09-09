// Shared stack-health color for LIVE chip counts. ONE source of truth so the same
// current/start ratio always maps to the same color on every surface (Active Tables,
// table detail, queue, players, chip leaders, standings, spectator, profile, team cards…).
//
// Color is by RATIO = currentChips / that entry's OWN startChips (Fargo-tier aware — a
// 2/8 stack and a 4/16 stack are both 25% → the same orange), never the tournament max.
//   0 chips                → red
//   >0–15%                 → burnt orange (critical)
//   >15–30%                → orange (very low)
//   >30–45%                → amber (getting low)
//   >45–60%                → yellow-gold (middle)
//   >60–80%                → green (healthy)
//   >80% (incl. buy-back / over-stack) → normal Compete accent (very healthy / full)
// Missing/invalid startChips → accent (never crash, never guess a percentage). 0 current
// is still red even when startChips is unknown.
//
// Use ONLY for current/live stack health — never for historical/config values (Starting
// Chips, tiers, audit old/new, payouts, final results). Those stay neutral.
import { COLORS } from "../theme/colors";

// Intermediate hues not in the theme palette (same pragmatic pattern as the audit colors).
const CHIP_HEALTH_CRITICAL = "#C1440E"; // burnt orange (>0–15%)
const CHIP_HEALTH_LOW = "#E8722C"; // orange (>15–30%)
const CHIP_HEALTH_GOLD = "#E8C547"; // yellow-gold (>45–60%)

export const chipStatusColor = (
  current: number,
  start: number | null | undefined,
): string => {
  if (current <= 0) return COLORS.error; // 0 chips → always red
  if (!start || start <= 0) return COLORS.primaryLight; // invalid/missing start → accent
  const ratio = current / start; // >1 (buy-back / manual over-stack) falls through to full
  if (ratio > 0.8) return COLORS.primaryLight; // >80% → normal Compete accent
  if (ratio > 0.6) return COLORS.success; // >60–80% → green / healthy
  if (ratio > 0.45) return CHIP_HEALTH_GOLD; // >45–60% → yellow-gold
  if (ratio > 0.3) return COLORS.warning; // >30–45% → amber
  if (ratio > 0.15) return CHIP_HEALTH_LOW; // >15–30% → orange
  return CHIP_HEALTH_CRITICAL; // >0–15% → deep red / burnt orange
};
