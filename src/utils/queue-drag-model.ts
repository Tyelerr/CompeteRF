// src/utils/queue-drag-model.ts
// Pure geometry + lifecycle rules for the Chip queue drag (QueueDragList). No React, no
// Animated — so the whole drop lifecycle is unit-testable (queue-drag-model.test.ts).
//
// Visual model: a row is drawn at   slotTop(indexInRenderedOrder) + offset(row).
// During a drag the rendered order stays the ORIGINAL order and only offsets move:
//   • the held row's offset = the raw pointer dy (then `landingOffset` while settling);
//   • displaced neighbours' offset = ± the held row's height (`neighborShift`).
// On finish the rendered order becomes the authoritative queue and EVERY offset must be 0
// in that same commit. Carrying a non-zero offset across the swap is exactly the
// "row disappears after drop" bug: the moved row is laid out in its NEW slot and then
// displaced again by its old landing offset, so it sits on top of another row and its own
// slot shows empty (ranks read 1, 2, _, 4, 5).

export type Heights = ReadonlyMap<string, number> | Record<string, number>;

const hOf = (heights: Heights, id: string): number =>
  (heights instanceof Map ? heights.get(id) : (heights as Record<string, number>)[id]) ?? 0;

export const slotTops = (order: readonly string[], heights: Heights): number[] => {
  const tops: number[] = [];
  let acc = 0;
  for (const id of order) {
    tops.push(acc);
    acc += hOf(heights, id);
  }
  return tops;
};

// The slot the held row would land in: it takes a neighbour's slot once the held row's
// centre crosses that neighbour's midpoint.
export const dragTargetIndex = (order: readonly string[], heights: Heights, from: number, dy: number): number => {
  const tops = slotTops(order, heights);
  const id = order[from];
  const center = tops[from] + hOf(heights, id) / 2 + dy;
  let to = from;
  if (dy > 0) {
    for (let k = from + 1; k < order.length; k++) if (center > tops[k] + hOf(heights, order[k]) / 2) to = k;
  } else if (dy < 0) {
    for (let k = from - 1; k >= 0; k--) if (center < tops[k] + hOf(heights, order[k]) / 2) to = k;
  }
  return to;
};

// How far a NEIGHBOUR at original index i moves to open the gap for from → to.
export const neighborShift = (i: number, from: number, to: number, heldHeight: number): number =>
  from < to && i > from && i <= to ? -heldHeight
    : from > to && i >= to && i < from ? heldHeight
      : 0;

// Where the held row lands (relative to its original slot) for from → to.
export const landingOffset = (order: readonly string[], heights: Heights, from: number, to: number): number => {
  let d = 0;
  if (to > from) for (let k = from + 1; k <= to; k++) d += hOf(heights, order[k]);
  else if (to < from) for (let k = to; k < from; k++) d -= hOf(heights, order[k]);
  return d;
};

// Offsets at the END of the settle animation (still in the ORIGINAL rendered order).
export const settledOffsets = (
  order: readonly string[],
  heights: Heights,
  from: number,
  to: number,
): Record<string, number> => {
  const held = order[from];
  const out: Record<string, number> = {};
  order.forEach((id, i) => {
    out[id] = id === held ? landingOffset(order, heights, from, to) : neighborShift(i, from, to, hOf(heights, held));
  });
  return out;
};

// The order the list shows once the drop lands (mirrors engine moveQueueEntry's splice).
export const droppedOrder = (order: readonly string[], from: number, to: number): string[] => {
  const next = order.slice();
  const [id] = next.splice(from, 1);
  next.splice(Math.max(0, Math.min(next.length, to)), 0, id);
  return next;
};

// Rank label a row shows while a drag is previewing from → to (1-based ranks stay contiguous).
export const displayIndex = (
  id: string,
  i: number,
  preview: { id: string; from: number; to: number } | null,
): number => {
  if (!preview) return i;
  const { from, to } = preview;
  if (id === preview.id) return to;
  if (from < to && i > from && i <= to) return i - 1;
  if (from > to && i >= to && i < from) return i + 1;
  return i;
};

// Visual top of every row = its slot in the rendered order + its offset.
export const visualTops = (
  order: readonly string[],
  heights: Heights,
  offsets: Record<string, number>,
): Record<string, number> => {
  const tops = slotTops(order, heights);
  const out: Record<string, number> = {};
  order.forEach((id, i) => {
    out[id] = tops[i] + (offsets[id] ?? 0);
  });
  return out;
};
