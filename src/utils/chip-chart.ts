// src/utils/chip-chart.ts
// Shared reader for a tournament's saved "Rating / Chip Chart" (tournaments.
// chip_ranges). One place that knows the range shape + matching rules, so the
// Tournament Details chart, the chip engine's tiers, and the Team Invite chip
// calc all agree. Range shape mirrors what the Compete form saves + what the
// detail screen renders: { minRating, maxRating, chips, label }, maxRating null
// (or >= 9000) meaning an open top tier ("701 & Above").

export interface ChipChartRange {
  minRating: number;
  maxRating: number | null; // null = open top
  chips: number;
  label?: string | null;
}

// Normalize a tournament's raw chip_ranges (tolerates the older minFargo/maxFargo
// key names too) into a consistent, sorted-desc chart.
export const parseChipChart = (raw: unknown): ChipChartRange[] => {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((r: any) => {
      const max = r?.maxRating ?? r?.maxFargo;
      return {
        minRating: Number(r?.minRating ?? r?.minFargo ?? 0),
        maxRating: max == null || Number(max) >= 9000 ? null : Number(max),
        chips: Number(r?.chips ?? 0),
        label: r?.label ?? null,
      };
    })
    .sort((a, b) => b.minRating - a.minRating);
};

// Chips for a rating from the saved chart. Returns null when NO range matches
// (caller shows "Chips require TD review") or the chart is empty / rating null.
// Unlike the engine's play-time helper, this does NOT fall back to a tier.
export const chipsForRating = (
  chart: ChipChartRange[],
  rating: number | null,
): number | null => {
  if (!chart.length || rating == null) return null;
  for (const r of chart) {
    const underMax = r.maxRating == null || rating <= r.maxRating;
    if (rating >= r.minRating && underMax) return r.chips;
  }
  return null;
};
