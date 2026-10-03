// src/utils/elim-bracket-pdf.ts
// "Download Latest Bracket" — a printable PDF backup of an elimination bracket's CURRENT state
// (Single + Double). Pure: input is the bracket graph + the app's own resolved LiveMatch list
// (buildLiveMatches — the same names / winners / scores / tables / W- and L-numbers the TD sees),
// output is PDF bytes. Never touches the network or tournament state.
//
// Layout (US Letter landscape, readable at print size — never shrunk to fit):
//   • One section per side: Winners (Single: the whole bracket), Losers, then Finals & Summary.
//   • Each section is split into bands of up to 4 rounds (columns); within a band, 8 first-column
//     matches per page (sub-trees never straddle a page because brackets are powers of two).
//   • Every box shows its match number, status / table, both players (winner bold, loser grey),
//     scores — or empty score boxes to fill in by pen — and where the winner / loser goes next, so
//     progression can be traced even across pages.

import { BracketGraphNode, BracketSide } from "../models/types/tournament-settings.types";
import { LiveMatch } from "./match.utils";
import { PdfDocument, PdfPage, fitText, textWidth } from "./pdf-writer";
import type { ElimOfflineStatus } from "../viewmodels/hooks/use.elim.offline";

export type BracketBackupMode = "latest" | "offline";

export interface ElimBracketPdfInput {
  tournamentName: string;
  doubleElim: boolean;
  tournamentDate?: string | null; // YYYY-MM-DD
  players: number;
  revision: number | null;
  graph: BracketGraphNode[];
  matches: LiveMatch[];
  mode: BracketBackupMode;
  generatedAt: Date;
  lastSyncedAt?: Date | null; // offline: when the local copy was synced
}

// ── page geometry (points) ────────────────────────────────────────────────────────────────
const PAGE_W = 792;
const PAGE_H = 612;
const MARGIN = 32;
const HEADER_H = 66;
const FOOTER_H = 18;
const COL_LABEL_H = 16;
const AREA_TOP = MARGIN + HEADER_H + COL_LABEL_H;
const AREA_BOTTOM = PAGE_H - MARGIN - FOOTER_H;
export const BRACKET_ROWS_PER_PAGE = 8;
export const BRACKET_COLS_PER_PAGE = 4;
const PITCH = (AREA_BOTTOM - AREA_TOP) / BRACKET_ROWS_PER_PAGE; // ≈ 56 pt per first-column match
const COL_W = (PAGE_W - 2 * MARGIN) / BRACKET_COLS_PER_PAGE; // ≈ 182 pt
const BOX_W = 150;
const TOP_H = 12;
const ROW_H = 15;
const BOX_H = TOP_H + 2 * ROW_H; // 42
const NAME_SIZE = 9;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "Oct 3, 2026 · 8:42 PM" (device local time). */
export const formatBackupTime = (d: Date): string => {
  const h = d.getHours();
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()} · ${hh}:${String(d.getMinutes()).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
};

/** "2026-10-03" → "Sat, Oct 3, 2026" (calendar date — no timezone shift). */
export const formatEventDate = (ymd: string | null | undefined): string | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd ?? "");
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  const dow = new Date(Date.UTC(y, mo, d)).getUTCDay();
  return `${DAYS[dow]}, ${MONTHS[mo]} ${d}, ${y}`;
};

/** Compete-Friday-Night-9-Ball-Double-Elim-R146.pdf (offline: …-Last-Synced-R140.pdf). */
export const bracketBackupFileName = (name: string, doubleElim: boolean, revision: number | null, mode: BracketBackupMode): string => {
  const slug =
    String(name ?? "")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^A-Za-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60)
      .replace(/-+$/g, "") || "Tournament";
  return `Compete-${slug}-${doubleElim ? "Double" : "Single"}-Elim${mode === "offline" ? "-Last-Synced" : ""}${revision != null ? `-R${revision}` : ""}.pdf`;
};

// ── layout model (exported for tests) ─────────────────────────────────────────────────────
export interface PlacedMatch {
  id: string;
  col: number; // column on the page
  y: number; // row units within the page (0 = first row)
}
export interface BracketPageLayout {
  section: "winners" | "losers" | "finals" | "summary";
  title: string; // "WINNERS BRACKET · Rounds 1–4 · Part 1 of 2"
  columns: string[]; // round labels
  placed: PlacedMatch[];
  summaryCol?: number; // Single: summary drawn in this page's free columns (from this column)
}

const matchIndex = (id: string): number => Number(/M(\d+)$/.exec(id)?.[1] ?? 0);

const roundName = (side: BracketSide, round: number, maxRound: number, doubleElim: boolean): string => {
  if (side === "losers") return round === maxRound ? "Losers Final" : `Losers Round ${round}`;
  if (side === "grand") return round === 1 ? "Grand Final" : "Grand Final Reset";
  if (!doubleElim) {
    if (round === maxRound) return "Final";
    if (round === maxRound - 1 && maxRound >= 2) return "Semifinals";
    if (round === maxRound - 2 && maxRound >= 3) return "Quarterfinals";
    return `Round ${round}`;
  }
  if (round === maxRound) return "Winners Final";
  if (round === maxRound - 1 && maxRound >= 3) return "Winners Semifinals";
  return `Winners Round ${round}`;
};

// One side → pages: bands of ≤4 rounds; first column evenly spaced, later columns centered on
// their same-side feeders (losers drop-in rounds sit level with their one feeder).
const layoutSide = (side: "winners" | "losers", nodes: BracketGraphNode[], doubleElim: boolean): BracketPageLayout[] => {
  const rounds = [...new Set(nodes.map((n) => n.round))].sort((a, b) => a - b);
  if (!rounds.length) return [];
  const maxRound = rounds[rounds.length - 1];
  const byRound = new Map<number, BracketGraphNode[]>();
  for (const r of rounds) byRound.set(r, nodes.filter((n) => n.round === r).sort((a, b) => matchIndex(a.id) - matchIndex(b.id)));
  const label = side === "winners" ? (doubleElim ? "WINNERS BRACKET" : "BRACKET") : "LOSERS BRACKET";

  const pages: BracketPageLayout[] = [];
  for (let b = 0; b < rounds.length; b += BRACKET_COLS_PER_PAGE) {
    const band = rounds.slice(b, b + BRACKET_COLS_PER_PAGE);
    const y = new Map<string, number>();
    const first = byRound.get(band[0])!;
    first.forEach((n, i) => y.set(n.id, i));
    for (const r of band.slice(1)) {
      for (const n of byRound.get(r)!) {
        const feeders = [n.slot1, n.slot2]
          .map((s) => (s.kind === "winner" ? y.get(s.matchId) : undefined))
          .filter((v): v is number => v != null);
        y.set(n.id, feeders.length ? feeders.reduce((a, c) => a + c, 0) / feeders.length : matchIndex(n.id) - 1);
      }
    }
    const rows = first.length;
    const parts = Math.max(1, Math.ceil(rows / BRACKET_ROWS_PER_PAGE));
    const pad = rows < BRACKET_ROWS_PER_PAGE ? (BRACKET_ROWS_PER_PAGE - rows) / 2 : 0;
    const rangeText = band.length > 1 ? `Rounds ${band[0]}–${band[band.length - 1]}` : `Round ${band[0]}`;
    for (let p = 0; p < parts; p++) {
      const placed: PlacedMatch[] = [];
      band.forEach((r, col) => {
        for (const n of byRound.get(r)!) {
          const yy = y.get(n.id)!;
          if (Math.min(parts - 1, Math.floor(yy / BRACKET_ROWS_PER_PAGE)) !== p) continue;
          placed.push({ id: n.id, col, y: yy - p * BRACKET_ROWS_PER_PAGE + pad });
        }
      });
      pages.push({
        section: side,
        title: `${label} · ${rangeText}${parts > 1 ? ` · Part ${p + 1} of ${parts}` : ""}`,
        columns: band.map((r) => roundName(side, r, maxRound, doubleElim)),
        placed,
      });
    }
  }
  return pages;
};

export const layoutElimBracket = (graph: BracketGraphNode[], doubleElim: boolean): BracketPageLayout[] => {
  const pages = [
    ...layoutSide("winners", graph.filter((n) => n.side === "winners"), doubleElim),
    ...layoutSide("losers", graph.filter((n) => n.side === "losers"), doubleElim),
  ];
  const grand = graph.filter((n) => n.side === "grand").sort((a, b) => a.round - b.round);
  const last = pages[pages.length - 1];
  if (!grand.length && last && last.columns.length < BRACKET_COLS_PER_PAGE) {
    last.summaryCol = last.columns.length; // room beside the final — no near-empty summary page
    return pages;
  }
  pages.push({
    section: grand.length ? "finals" : "summary",
    title: grand.length ? "GRAND FINAL & SUMMARY" : "SUMMARY",
    columns: grand.map((n) => roundName("grand", n.round, 2, doubleElim)),
    placed: grand.map((n, i) => ({ id: n.id, col: i, y: 1 })),
  });
  return pages;
};

// ── drawing ───────────────────────────────────────────────────────────────────────────────
const boxX = (col: number) => MARGIN + col * COL_W;
const boxTop = (y: number) => AREA_TOP + y * PITCH + (PITCH - BOX_H - 8) / 2;

const isPlayable = (m: LiveMatch) => !m.empty && !m.bye && m.number > 0;

export const statusText = (m: LiveMatch): string => {
  const table = m.tableLabel ?? null;
  if (m.empty) return "No match (byes)";
  if (m.bye) return "Bye";
  if (m.status === "completed") {
    if (m.result === "forfeit") return "Final · Forfeit";
    if (m.result === "withdraw") return "Final · Withdrawal";
    return "Final";
  }
  if (m.status === "in_progress") return table ? `LIVE · ${table}` : "LIVE";
  if (table) return `${table} · not started`;
  return m.pending ? "Waiting for players" : "Waiting";
};

const slotPlaceholder = (
  node: BracketGraphNode | undefined,
  slot: 1 | 2,
  m: LiveMatch,
  labels: Map<string, string>,
  byId: Map<string, LiveMatch>,
): string => {
  if (m.bye) return "BYE";
  const ref = slot === 1 ? node?.slot1 : node?.slot2;
  if (!ref) return "TBD";
  // A feeder that can never produce a player (both of its sides were byes) is a bye here too.
  if ((ref.kind === "winner" || ref.kind === "loser") && byId.get(ref.matchId)?.empty) return "BYE";
  if (ref.kind === "winner") return `Winner of ${labels.get(ref.matchId) ?? ref.matchId}`;
  if (ref.kind === "loser") return `Loser of ${labels.get(ref.matchId) ?? ref.matchId}`;
  if (ref.kind === "empty") return "BYE";
  return "TBD";
};

const drawMatch = (
  page: PdfPage,
  m: LiveMatch,
  node: BracketGraphNode | undefined,
  x: number,
  top: number,
  labels: Map<string, string>,
  byId: Map<string, LiveMatch>,
) => {
  if (m.empty) {
    page.rect(x, top, BOX_W, BOX_H, { stroke: 0.8, width: 0.5 });
    page.text(x + 6, top + BOX_H / 2 + 3, "No match (both byes)", 7.5, { gray: 0.55 });
    return;
  }
  const live = m.status === "in_progress";
  page.rect(x, top, BOX_W, BOX_H, { stroke: m.bye ? 0.7 : 0.15, fill: live ? 0.92 : null, width: live ? 1.6 : 0.8 });
  page.line(x, top + TOP_H, x + BOX_W, top + TOP_H, { gray: 0.7, width: 0.4 });
  page.line(x, top + TOP_H + ROW_H, x + BOX_W, top + TOP_H + ROW_H, { gray: 0.82, width: 0.4 });
  // Top line: match number (+ race) left, status / table right.
  const tag = labels.get(m.id) ?? m.id;
  page.text(x + 4, top + 8.6, tag, 7.5, { font: "bold" });
  const status = statusText(m);
  const left = textWidth(tag, 7.5, "bold") + 10;
  const race = m.raceLabel && isPlayable(m) && !m.pending && m.p1Name && m.p2Name ? m.raceLabel : "";
  const statusFit = fitText(status, 7, BOX_W - left - 8 - (race ? textWidth(race, 6.5) + 6 : 0), live ? "bold" : "regular");
  if (race) page.text(x + left, top + 8.6, race, 6.5, { gray: 0.45 });
  page.text(x + BOX_W - 4, top + 8.6, statusFit, 7, { align: "right", font: live ? "bold" : "regular", gray: live ? 0 : 0.3 });

  const canMark = isPlayable(m) && m.status !== "completed";
  ([1, 2] as const).forEach((slot) => {
    const name = slot === 1 ? m.p1Name : m.p2Name;
    const score = slot === 1 ? m.p1Score : m.p2Score;
    const rowTop = top + TOP_H + (slot - 1) * ROW_H;
    const baseline = rowTop + 10.6;
    const won = m.status === "completed" && m.winner === slot;
    const lost = m.status === "completed" && m.winner != null && m.winner !== slot;
    const scoreW = 18;
    if (won) page.rect(x + 3, rowTop + 4.5, 4, 6, { stroke: null, fill: 0 });
    const text = name ?? slotPlaceholder(node, slot, m, labels, byId);
    const placeholder = !name;
    page.text(x + 10, baseline, fitText(text, placeholder ? 7.5 : NAME_SIZE, BOX_W - 16 - scoreW, won ? "bold" : "regular"), placeholder ? 7.5 : NAME_SIZE, {
      font: won ? "bold" : "regular",
      gray: placeholder ? 0.5 : lost ? 0.45 : 0,
    });
    if (score != null && !m.bye) {
      page.text(x + BOX_W - 5, baseline, String(score), NAME_SIZE, { align: "right", font: won ? "bold" : "regular", gray: lost ? 0.45 : 0 });
    } else if (canMark) {
      page.rect(x + BOX_W - scoreW - 1, rowTop + 2.5, scoreW - 3, ROW_H - 5, { stroke: 0.6, width: 0.5 }); // pen box
    }
  });
  // Where players go next (traceable across pages). Grand-final routing is explained in a note.
  const route = m.side === "grand" ? "" : [
    m.winnerToLabel ? `W to ${m.winnerToLabel}` : null,
    m.loserToLabel ? `L to ${m.loserToLabel}` : null,
    m.loserFromLabels?.length ? `drop-in from ${m.loserFromLabels.join(", ")}` : null,
  ]
    .filter(Boolean)
    .join("  ·  ");
  if (route) page.text(x + 2, top + BOX_H + 7.5, fitText(route, 6.5, BOX_W + 20), 6.5, { gray: 0.45 });
};

const drawHeader = (page: PdfPage, input: ElimBracketPdfInput, sectionTitle: string) => {
  const right = PAGE_W - MARGIN;
  page.text(MARGIN, MARGIN + 8, "COMPETE", 8, { font: "bold", gray: 0.4 });
  page.text(MARGIN, MARGIN + 26, fitText(input.tournamentName || "Tournament", 16, PAGE_W * 0.55, "bold"), 16, { font: "bold" });
  const facts = [
    input.doubleElim ? "Double Elimination" : "Single Elimination",
    `${input.players} Players`,
    formatEventDate(input.tournamentDate),
  ].filter(Boolean).join(" · ");
  page.text(MARGIN, MARGIN + 40, facts, 9.5);
  const offline = input.mode === "offline";
  page.text(right, MARGIN + 9, offline ? "OFFLINE BACKUP" : "BRACKET BACKUP", 11, { font: "bold", align: "right" });
  page.text(right, MARGIN + 23, `Generated: ${formatBackupTime(input.generatedAt)}`, 8.5, { align: "right" });
  page.text(
    right,
    MARGIN + 35,
    offline
      ? `Last synced: ${input.lastSyncedAt ? formatBackupTime(input.lastSyncedAt) : "unknown"} · Revision ${input.revision ?? "—"}`
      : `Revision ${input.revision ?? "—"}`,
    8.5,
    { align: "right", font: offline ? "bold" : "regular" },
  );
  page.line(MARGIN, MARGIN + 47, right, MARGIN + 47, { gray: 0.6, width: 0.6 });
  page.text(
    MARGIN,
    MARGIN + 58,
    offline
      ? "Offline backup — last synced copy on this device. The tournament may have changed since; it could not be verified with Compete."
      : "Backup snapshot — tournament may have changed after this file was generated.",
    7.5,
    { gray: 0.35 },
  );
  page.text(right, MARGIN + 58, sectionTitle, 8.5, { font: "bold", align: "right" });
};

const drawFooter = (page: PdfPage, input: ElimBracketPdfInput, n: number, total: number) => {
  page.text(MARGIN, PAGE_H - MARGIN + 2, fitText(`Compete bracket backup · ${input.tournamentName}`, 7, PAGE_W / 2), 7, { gray: 0.5 });
  page.text(PAGE_W - MARGIN, PAGE_H - MARGIN + 2, `Page ${n} of ${total}`, 7, { gray: 0.5, align: "right" });
};

// Champion (single: the final's winner; double: GF winner unless a reset was needed).
export const bracketChampion = (matches: LiveMatch[], doubleElim: boolean): string | null => {
  const nameOf = (m?: LiveMatch) => (m && m.status === "completed" && m.winner ? (m.winner === 1 ? m.p1Name : m.p2Name) : null);
  if (!doubleElim) {
    const w = matches.filter((m) => m.side === "winners");
    const top = w.reduce((a, m) => Math.max(a, m.round), 0);
    return nameOf(w.find((m) => m.round === top));
  }
  const gf = matches.find((m) => m.id === "GF");
  const gf2 = matches.find((m) => m.id === "GF2");
  if (gf2 && gf2.status === "completed") return nameOf(gf2);
  if (gf && gf.status === "completed" && gf.winner === 1) return nameOf(gf);
  return null;
};

const drawSummary = (page: PdfPage, input: ElimBracketPdfInput, x: number, top: number, width: number) => {
  const real = input.matches.filter(isPlayable);
  const done = real.filter((m) => m.status === "completed");
  const live = real.filter((m) => m.status === "in_progress");
  const onTable = real.filter((m) => m.status === "scheduled" && m.tableId != null);
  const waiting = real.filter((m) => m.status === "scheduled" && m.tableId == null);
  let y = top;
  page.text(x, y, "Summary", 12, { font: "bold" });
  y += 18;
  const champion = bracketChampion(input.matches, input.doubleElim);
  page.text(x, y, fitText(`Champion: ${champion ?? "not decided yet"}`, 10, width, champion ? "bold" : "regular"), 10, { font: champion ? "bold" : "regular" });
  y += 16;
  for (const [label, n] of [["Completed", done.length], ["Live", live.length], ["On a table, not started", onTable.length], ["Waiting", waiting.length]] as const) {
    page.text(x, y, `${label}: ${n}`, 9);
    y += 12;
  }
  y += 8;
  const list = (title: string, items: LiveMatch[]) => {
    if (!items.length) return;
    page.text(x, y, title, 9.5, { font: "bold" });
    y += 13;
    const maxLines = Math.max(0, Math.floor((AREA_BOTTOM - y - 10) / 12));
    items.slice(0, maxLines).forEach((m) => {
      const line = [m.numberLabel || m.id, m.tableLabel, `${m.p1Name ?? "TBD"} vs ${m.p2Name ?? "TBD"}`].filter(Boolean).join(" · ");
      page.text(x + 8, y, fitText(line, 8.5, width - 8), 8.5);
      y += 12;
    });
    if (items.length > maxLines) {
      page.text(x + 8, y, `+${items.length - maxLines} more`, 8, { gray: 0.45 });
      y += 12;
    }
    y += 6;
  };
  list("Live now", live);
  list("On a table, not started", onTable);
};

export const buildElimBracketPdf = (input: ElimBracketPdfInput): { bytes: Uint8Array; fileName: string; pages: BracketPageLayout[] } => {
  const pages = layoutElimBracket(input.graph, input.doubleElim);
  const byId = new Map(input.matches.map((m) => [m.id, m]));
  const nodeById = new Map(input.graph.map((n) => [n.id, n]));
  const labels = new Map(input.matches.map((m) => [m.id, m.id === "GF2" ? "Finals Reset" : m.numberLabel || m.id]));
  const doc = new PdfDocument({ title: `${input.tournamentName} — bracket backup`, author: "Compete" });

  pages.forEach((layout, i) => {
    const page = doc.addPage(PAGE_W, PAGE_H);
    drawHeader(page, input, layout.title);
    layout.columns.forEach((c, col) =>
      page.text(boxX(col) + 2, AREA_TOP - 5, c.toUpperCase(), 8, { font: "bold", gray: 0.3 }),
    );
    const pos = new Map(layout.placed.map((p) => [p.id, p]));
    // Connectors first (under the boxes): feeder's right edge → this match's player row.
    for (const p of layout.placed) {
      const node = nodeById.get(p.id);
      if (!node || layout.section === "finals") continue;
      ([node.slot1, node.slot2] as const).forEach((ref, k) => {
        if (ref.kind !== "winner") return;
        const src = pos.get(ref.matchId);
        if (!src || src.col !== p.col - 1) return;
        const sx = boxX(src.col) + BOX_W;
        const sy = boxTop(src.y) + TOP_H + ROW_H;
        const tx = boxX(p.col);
        const ty = boxTop(p.y) + TOP_H + ROW_H * (k + 0.5);
        const mid = sx + (tx - sx) / 2;
        page.path([[sx, sy], [mid, sy], [mid, ty], [tx, ty]], { gray: 0.35, width: 0.8 });
      });
    }
    for (const p of layout.placed) {
      const m = byId.get(p.id);
      if (m) drawMatch(page, m, nodeById.get(p.id), boxX(p.col), layout.section === "finals" ? AREA_TOP + 8 : boxTop(p.y), labels, byId);
    }
    if (layout.section === "finals") {
      const gf = byId.get("GF");
      const reset = layout.placed.some((p) => p.id === "GF2");
      if (reset) {
        const x2 = boxX(1);
        const note =
          gf && gf.status === "completed" && gf.winner === 1
            ? "Reset not needed — winners-side finalist won the Grand Final."
            : "Played only if the losers-side finalist wins the Grand Final.";
        page.text(x2, AREA_TOP + 8 + BOX_H + 18, fitText(note, 7.5, COL_W * 2 - 10), 7.5, { gray: 0.4 });
      }
      drawSummary(page, input, MARGIN, AREA_TOP + 8 + BOX_H + 44, PAGE_W - 2 * MARGIN);
    } else if (layout.summaryCol != null) {
      const sx = boxX(layout.summaryCol) + 24;
      drawSummary(page, input, sx, AREA_TOP + 8, PAGE_W - MARGIN - sx);
    } else if (layout.section === "summary") {
      drawSummary(page, input, MARGIN, AREA_TOP + 8, PAGE_W - 2 * MARGIN);
    }
    drawFooter(page, input, i + 1, pages.length);
  });

  return { bytes: doc.toBytes(), fileName: bracketBackupFileName(input.tournamentName, input.doubleElim, input.revision, input.mode), pages };
};

// ── Actions row availability (pure) ──────────────────────────────────────────────────────
export const BRACKET_BACKUP_NO_LOCAL =
  "You're offline and this device has no synced copy of this bracket, so there's nothing to download.";
export const BRACKET_BACKUP_NO_BRACKET = "The bracket hasn't been drawn yet.";

export type BracketBackupAvailability =
  | { kind: "latest"; label: "Download Latest Bracket"; detail: string }
  | { kind: "last_synced"; label: "Download Last Synced Bracket"; detail: string; revision: number; savedAt: string }
  | { kind: "unavailable"; label: "Download Latest Bracket"; detail: string; reason: string };

/** What the Actions row offers right now (pure — exported for tests). */
export const bracketBackupAvailability = (conn: {
  offline: boolean;
  status: ElimOfflineStatus;
  local: { revision: number; savedAt: string } | null;
}): BracketBackupAvailability => {
  const offline = conn.offline || conn.status === "offline";
  if (!offline) return { kind: "latest", label: "Download Latest Bracket", detail: "Printable PDF of the current bracket — a manual backup" };
  if (conn.local)
    return {
      kind: "last_synced",
      label: "Download Last Synced Bracket",
      detail: `Offline — PDF of the last synced copy (revision #${conn.local.revision})`,
      revision: conn.local.revision,
      savedAt: conn.local.savedAt,
    };
  return { kind: "unavailable", label: "Download Latest Bracket", detail: BRACKET_BACKUP_NO_LOCAL, reason: "Offline" };
};
