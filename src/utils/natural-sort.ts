// src/utils/natural-sort.ts
// Natural (human) string order: digit runs compare as NUMBERS, so "Table 2" < "Table 10"
// (plain localeCompare gives "Table 1, Table 10, Table 2"). Case-insensitive; stable tie-break
// on the raw string. Implemented by hand (no Intl numeric collation) so it behaves the same on
// web, iOS and Android JS engines.

const CHUNK = /(\d+)/;

export const naturalCompare = (a: string | null | undefined, b: string | null | undefined): number => {
  const x = (a ?? "").trim().toLowerCase().split(CHUNK);
  const y = (b ?? "").trim().toLowerCase().split(CHUNK);
  const n = Math.min(x.length, y.length);
  for (let i = 0; i < n; i++) {
    const p = x[i];
    const q = y[i];
    if (p === q) continue;
    const isNum = i % 2 === 1; // split with a capture group alternates text / digits
    if (isNum) {
      const d = Number(p) - Number(q);
      if (d !== 0) return d;
      continue;
    }
    return p < q ? -1 : 1;
  }
  if (x.length !== y.length) return x.length - y.length;
  return (a ?? "") < (b ?? "") ? -1 : (a ?? "") > (b ?? "") ? 1 : 0;
};

// Sort tables by label in natural order (Table 1, Table 2, … Table 10).
export const byTableLabel = <T extends { label?: string | null }>(p: T, q: T): number => naturalCompare(p.label, q.label);
