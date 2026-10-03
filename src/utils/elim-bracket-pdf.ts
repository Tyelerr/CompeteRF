// src/utils/elim-bracket-pdf.ts
// "Download Latest Bracket" — a printable PDF backup of an elimination bracket's CURRENT state
// (Single + Double). Pure: input is the bracket graph + the app's own resolved LiveMatch list
// (buildLiveMatches — the same names / races / winners / scores / tables / W- and L-numbers the
// TD sees) + the payouts and roster summaries, output is PDF bytes. Never touches the network
// or tournament state.
//
// Pages (US Letter landscape, readable at print size — never shrunk to fit):
//   1. Bracket pages per side (Winners, then Losers): bands of up to 4 rounds; 8 first-column
//      matches per page (sub-trees never straddle a page because brackets are powers of two).
//   2. FINALS page — the deciding matches kept together as one mini-bracket:
//        Double: Losers semifinal → Losers Final, Winners Final → Grand Final → Reset.
//        Single (32+ players): Semifinals → Final. (≤16 players: the whole bracket is one page.)
//   3. Tournament summary flowing in two columns (below the finals, then onto extra pages as
//      needed): Summary (champion, field, live / on-table matches) → Payouts → Player list.
//   Every box shows its match number, status / table, both players with their race "(5)"
//   (winner bold, loser muted; winner score green / loser score red — still distinct in
//   grayscale), or empty score boxes to fill in by pen, and where the winner / loser goes next.

import { BracketGraphNode, BracketSide } from "../models/types/tournament-settings.types";
import { LiveMatch } from "./match.utils";
import { computeStandings } from "./tournament.stats";
import { PdfColor, PdfDocument, PdfPage, fitText, textWidth } from "./pdf-writer";
import type { BackupPayouts, BackupRosterRow } from "./elim-bracket-summary";
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
  payouts?: BackupPayouts | null;
  roster?: BackupRosterRow[] | null;
  sidePotNames?: string[]; // configured side pots (player list column)
  bracketSize?: number | null;
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

// Colors: soft dark-grey text; winner / loser score hues that stay distinct in grayscale.
const INK: PdfColor = 0.18;
const INK_STRONG: PdfColor = 0.08;
const MUTED: PdfColor = 0.5;
const WIN_GREEN: PdfColor = [0.09, 0.47, 0.24];
const LOSS_RED: PdfColor = [0.72, 0.27, 0.27];

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

/** "$1,234" / "$12.50" — locale-independent. */
export const formatMoney = (n: number): string => {
  const cents = Math.round((Number(n) || 0) * 100);
  const whole = Math.trunc(Math.abs(cents) / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const frac = Math.abs(cents) % 100;
  return `${cents < 0 ? "-" : ""}$${whole}${frac ? `.${String(frac).padStart(2, "0")}` : ""}`;
};

const ordinal = (n: number): string => {
  const t = n % 100;
  const s = t >= 11 && t <= 13 ? "th" : n % 10 === 1 ? "st" : n % 10 === 2 ? "nd" : n % 10 === 3 ? "rd" : "th";
  return `${n}${s}`;
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
// The bracket is a fixed sequence of SECTIONS that follows the tournament:
//   Winners (rounds 1 … Winners Final) → Losers (rounds 1 … Losers Final) → Championship
//   (Grand Final → Reset). Single elimination: the bracket (rounds 1 … Final).
// Each section is cut into BLOCKS of up to 4 rounds (8 first-column matches tall; a taller
// first round becomes several parts — sub-trees never straddle a part because brackets are
// powers of two). Blocks are then packed top-to-bottom onto pages strictly in that order: a
// block joins the current page when it fits, otherwise it starts the next page. Small events
// share pages; large ones split — but the order never changes. The tournament summary always
// starts on its own page after the bracket.
export type BracketSection = "winners" | "losers" | "championship";

export interface PlacedMatch {
  id: string;
  col: number; // column on the page
  y: number; // row units within its block (0 = first row)
  top: number; // box top on the page (points)
}
export interface BracketBlock {
  section: BracketSection;
  title: string; // "WINNERS BRACKET · Rounds 1–3 · Part 1 of 2"
  range: string; // "Rounds 1–3 · Part 1 of 2" ("" for the championship)
  fromRound: number;
  toRound: number;
  columns: string[]; // round labels, left → right
  rows: number; // first-column rows (height)
  placed: Omit<PlacedMatch, "top">[];
}
export interface BracketPageLayout {
  section: BracketSection | "summary";
  title: string;
  blocks: { block: BracketBlock; top: number }[];
  placed: PlacedMatch[];
}

const CONTENT_TOP = MARGIN + HEADER_H; // first block's column labels start here
const BLOCK_GAP = 10;
const blockHeight = (b: BracketBlock) => COL_LABEL_H + b.rows * PITCH;

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

// One side → blocks: bands of ≤4 rounds (never ending on a lone round: 5 → 3 + 2); first
// column evenly spaced, later columns centered on their same-side feeders (losers drop-in
// rounds sit level with their one feeder).
const sideBlocks = (side: "winners" | "losers", nodes: BracketGraphNode[], doubleElim: boolean): BracketBlock[] => {
  const rounds = [...new Set(nodes.map((n) => n.round))].sort((a, b) => a - b);
  if (!rounds.length) return [];
  const maxRound = rounds[rounds.length - 1];
  const byRound = new Map<number, BracketGraphNode[]>();
  for (const r of rounds) byRound.set(r, nodes.filter((n) => n.round === r).sort((a, b) => matchIndex(a.id) - matchIndex(b.id)));
  const label = side === "winners" ? (doubleElim ? "WINNERS BRACKET" : "BRACKET") : "LOSERS BRACKET";

  const bands: number[][] = [];
  for (let b = 0; b < rounds.length; b += BRACKET_COLS_PER_PAGE) bands.push(rounds.slice(b, b + BRACKET_COLS_PER_PAGE));
  if (bands.length > 1 && bands[bands.length - 1].length === 1) bands[bands.length - 1].unshift(bands[bands.length - 2].pop()!);

  const blocks: BracketBlock[] = [];
  for (const band of bands) {
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
    const rangeText = band.length > 1 ? `Rounds ${band[0]}–${band[band.length - 1]}` : `Round ${band[0]}`;
    for (let p = 0; p < parts; p++) {
      const placed: Omit<PlacedMatch, "top">[] = [];
      band.forEach((r, col) => {
        for (const n of byRound.get(r)!) {
          const yy = y.get(n.id)!;
          if (Math.min(parts - 1, Math.floor(yy / BRACKET_ROWS_PER_PAGE)) !== p) continue;
          placed.push({ id: n.id, col, y: yy - p * BRACKET_ROWS_PER_PAGE });
        }
      });
      const range = `${rangeText}${parts > 1 ? ` · Part ${p + 1} of ${parts}` : ""}`;
      blocks.push({
        section: side,
        title: `${label} · ${range}`,
        range,
        fromRound: band[0],
        toRound: band[band.length - 1],
        columns: band.map((r) => roundName(side, r, maxRound, doubleElim)),
        rows: Math.min(BRACKET_ROWS_PER_PAGE, rows - p * BRACKET_ROWS_PER_PAGE),
        placed,
      });
    }
  }
  return blocks;
};

/** The bracket's blocks in tournament order (Winners → Losers → Championship). */
export const elimBracketBlocks = (graph: BracketGraphNode[], doubleElim: boolean): BracketBlock[] => {
  const grand = graph.filter((n) => n.side === "grand").sort((a, b) => a.round - b.round);
  const blocks = [
    ...sideBlocks("winners", graph.filter((n) => n.side === "winners"), doubleElim),
    ...sideBlocks("losers", graph.filter((n) => n.side === "losers"), doubleElim),
  ];
  if (grand.length) {
    blocks.push({
      section: "championship",
      title: "CHAMPIONSHIP · Grand Final",
      range: "",
      fromRound: 1,
      toRound: grand.length,
      columns: grand.map((n) => roundName("grand", n.round, 2, doubleElim)),
      rows: 1,
      placed: grand.map((n, i) => ({ id: n.id, col: i, y: 0 })),
    });
  }
  return blocks;
};

const SECTION_NAME: Record<BracketSection, string> = {
  winners: "WINNERS BRACKET",
  losers: "LOSERS BRACKET",
  championship: "CHAMPIONSHIP",
};

/** Pack the ordered blocks onto pages (top-to-bottom, never reordered). */
export const layoutElimBracket = (graph: BracketGraphNode[], doubleElim: boolean): BracketPageLayout[] => {
  const pages: BracketPageLayout[] = [];
  let cur: BracketPageLayout | null = null;
  let y = CONTENT_TOP;
  for (const block of elimBracketBlocks(graph, doubleElim)) {
    const h = blockHeight(block);
    const top = cur && cur.blocks.length ? y + BLOCK_GAP : y;
    if (!cur || top + h > AREA_BOTTOM) {
      cur = { section: block.section, title: "", blocks: [], placed: [] };
      pages.push(cur);
      y = CONTENT_TOP;
    }
    const blockTop = cur.blocks.length ? y + BLOCK_GAP : y;
    cur.blocks.push({ block, top: blockTop });
    for (const p of block.placed) cur.placed.push({ ...p, top: blockTop + COL_LABEL_H + p.y * PITCH + (PITCH - BOX_H - 8) / 2 });
    y = blockTop + h;
  }
  // Page title = what's on it, in order ("LOSERS BRACKET · Rounds 1–6 · CHAMPIONSHIP").
  for (const p of pages) {
    const groups: string[] = [];
    for (const s of [...new Set(p.blocks.map((b) => b.block.section))]) {
      const bs = p.blocks.filter((b) => b.block.section === s).map((b) => b.block);
      const name = s === "winners" && !doubleElim ? "BRACKET" : SECTION_NAME[s];
      // One block: its own range ("Rounds 1–3 · Part 1 of 2"); several: the span they cover.
      const range = s === "championship" ? "" : bs.length === 1 ? bs[0].range : `Rounds ${bs[0].fromRound}–${bs[bs.length - 1].toRound}`;
      groups.push(range ? `${name} · ${range}` : name);
    }
    p.title = groups.join(" · ");
  }
  return pages;
};

// ── drawing ───────────────────────────────────────────────────────────────────────────────
const boxX = (col: number) => MARGIN + col * COL_W;

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

/** "Tyelerr (5)" — the player's race beside their name; never for a BYE or an unknown slot. */
export const nameWithRace = (name: string | null, race: number | null | undefined): string | null =>
  name ? (race != null && Number.isFinite(race) ? `${name} (${race})` : name) : null;

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
  page.rect(x, top, BOX_W, BOX_H, { stroke: m.bye ? 0.7 : 0.25, fill: live ? 0.93 : null, width: live ? 1.6 : 0.8 });
  page.line(x, top + TOP_H, x + BOX_W, top + TOP_H, { gray: 0.72, width: 0.4 });
  page.line(x, top + TOP_H + ROW_H, x + BOX_W, top + TOP_H + ROW_H, { gray: 0.84, width: 0.4 });
  // Top line: match number left, status / table right.
  const tag = labels.get(m.id) ?? m.id;
  page.text(x + 4, top + 8.6, tag, 7.5, { font: "bold", gray: INK });
  const left = textWidth(tag, 7.5, "bold") + 10;
  page.text(x + BOX_W - 4, top + 8.6, fitText(statusText(m), 7, BOX_W - left - 8, live ? "bold" : "regular"), 7, {
    align: "right",
    font: live ? "bold" : "regular",
    gray: live ? INK_STRONG : 0.38,
  });

  const canMark = isPlayable(m) && m.status !== "completed";
  const decided = m.status === "completed" && (m.winner === 1 || m.winner === 2);
  ([1, 2] as const).forEach((slot) => {
    const name = slot === 1 ? m.p1Name : m.p2Name;
    const race = slot === 1 ? m.p1Race : m.p2Race;
    const score = slot === 1 ? m.p1Score : m.p2Score;
    const rowTop = top + TOP_H + (slot - 1) * ROW_H;
    const baseline = rowTop + 10.6;
    const won = decided && m.winner === slot;
    const lost = decided && m.winner !== slot;
    const scoreW = 18;
    if (won && !m.bye) page.rect(x + 3, rowTop + 4.5, 4, 6, { stroke: null, fill: INK_STRONG });
    const font = won ? "bold" : "regular";
    const placeholder = !name;
    if (placeholder) {
      page.text(x + 10, baseline, fitText(slotPlaceholder(node, slot, m, labels, byId), 7.5, BOX_W - 16 - scoreW), 7.5, { gray: 0.55 });
    } else {
      // Race stays whole; the name shortens if needed.
      const raceText = !m.bye && race != null ? ` (${race})` : "";
      const raceW = raceText ? textWidth(raceText, 8, "regular") : 0;
      const nameFit = fitText(name, NAME_SIZE, BOX_W - 16 - scoreW - raceW, font);
      const nameColor = won ? INK_STRONG : lost ? MUTED : INK;
      page.text(x + 10, baseline, nameFit, NAME_SIZE, { font, gray: nameColor });
      if (raceText) page.text(x + 10 + textWidth(nameFit, NAME_SIZE, font), baseline, raceText, 8, { gray: lost ? 0.6 : 0.42 });
    }
    if (score != null && !m.bye) {
      page.text(x + BOX_W - 5, baseline, String(score), NAME_SIZE, {
        align: "right",
        font: won ? "bold" : "regular",
        gray: won ? WIN_GREEN : lost ? LOSS_RED : INK,
      });
    } else if (canMark) {
      page.rect(x + BOX_W - scoreW - 1, rowTop + 2.5, scoreW - 3, ROW_H - 5, { stroke: 0.6, width: 0.5 }); // pen box
    }
  });
  // Where players go next (traceable across pages). Grand-final routing is explained in a note.
  const route =
    m.side === "grand"
      ? ""
      : [
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
  page.text(MARGIN, MARGIN + 26, fitText(input.tournamentName || "Tournament", 16, PAGE_W * 0.55, "bold"), 16, { font: "bold", gray: INK_STRONG });
  const facts = [
    input.doubleElim ? "Double Elimination" : "Single Elimination",
    `${input.players} Players`,
    formatEventDate(input.tournamentDate),
  ].filter(Boolean).join(" · ");
  page.text(MARGIN, MARGIN + 40, facts, 9.5, { gray: INK });
  const offline = input.mode === "offline";
  page.text(right, MARGIN + 9, offline ? "OFFLINE BACKUP" : "BRACKET BACKUP", 11, { font: "bold", align: "right", gray: INK_STRONG });
  page.text(right, MARGIN + 23, `Generated: ${formatBackupTime(input.generatedAt)}`, 8.5, { align: "right", gray: INK });
  page.text(
    right,
    MARGIN + 35,
    offline
      ? `Last synced: ${input.lastSyncedAt ? formatBackupTime(input.lastSyncedAt) : "unknown"} · Revision ${input.revision ?? "—"}`
      : `Revision ${input.revision ?? "—"}`,
    8.5,
    { align: "right", font: offline ? "bold" : "regular", gray: INK },
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
  page.text(right, MARGIN + 58, sectionTitle, 8.5, { font: "bold", align: "right", gray: INK_STRONG });
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

// ── tournament summary: a two-column flow of rows (keeps headings with their first lines) ─────
const SUM_GAP = 24;
const SUM_COL_W = (PAGE_W - 2 * MARGIN - SUM_GAP) / 2;

type FlowRow = {
  h: number;
  spacer?: boolean; // dropped at the top of a column
  keepWithNext?: number; // rows that must follow on the same column (headings)
  repeatHeader?: () => FlowRow; // table header to repeat at the top of a new column
  draw: (page: PdfPage, x: number, y: number, w: number) => void;
};

const textRow = (text: string, size: number, opts: { font?: "regular" | "bold"; gray?: PdfColor; h?: number; indent?: number; keepWithNext?: number } = {}): FlowRow => ({
  h: opts.h ?? size + 5,
  keepWithNext: opts.keepWithNext,
  draw: (page, x, y, w) =>
    page.text(x + (opts.indent ?? 0), y + size, fitText(text, size, w - (opts.indent ?? 0), opts.font ?? "regular"), size, {
      font: opts.font,
      gray: opts.gray ?? INK,
    }),
});

const amountRow = (left: string, amount: string, opts: { bold?: boolean; indent?: number; gray?: PdfColor } = {}): FlowRow => ({
  h: 13,
  draw: (page, x, y, w) => {
    const font = opts.bold ? "bold" : "regular";
    const aw = textWidth(amount, 9, font);
    page.text(x + (opts.indent ?? 0), y + 9, fitText(left, 9, w - aw - 12 - (opts.indent ?? 0), font), 9, { font, gray: opts.gray ?? INK });
    page.text(x + w, y + 9, amount, 9, { font, align: "right", gray: opts.gray ?? INK });
  },
});

const spacer = (h: number): FlowRow => ({ h, spacer: true, draw: () => {} });

const checkbox = (page: PdfPage, cx: number, y: number, checked: boolean) => {
  const s = 7.5;
  const bx = cx - s / 2;
  const by = y + 1.5;
  page.rect(bx, by, s, s, { stroke: 0.35, width: 0.6 });
  if (checked) {
    page.line(bx + 1.5, by + 1.5, bx + s - 1.5, by + s - 1.5, { gray: INK_STRONG, width: 1 });
    page.line(bx + s - 1.5, by + 1.5, bx + 1.5, by + s - 1.5, { gray: INK_STRONG, width: 1 });
  }
};

// Player list columns (within one summary column).
const PL = { name: 0, entry: 150, pot: 188, fargo: 262, status: 270 };

const summaryRows = (input: ElimBracketPdfInput): FlowRow[] => {
  const rows: FlowRow[] = [];
  const real = input.matches.filter(isPlayable);
  const done = real.filter((m) => m.status === "completed");
  const live = real.filter((m) => m.status === "in_progress");
  const onTable = real.filter((m) => m.status === "scheduled" && m.tableId != null);
  const waiting = real.filter((m) => m.status === "scheduled" && m.tableId == null);
  const champion = bracketChampion(input.matches, input.doubleElim);

  // Summary
  rows.push(textRow("Summary", 12, { font: "bold", gray: INK_STRONG, h: 18, keepWithNext: 2 }));
  rows.push(textRow(`Champion: ${champion ?? "not decided yet"}`, 10, { font: champion ? "bold" : "regular", gray: INK_STRONG, h: 16 }));
  const byes = input.bracketSize ? Math.max(0, input.bracketSize - input.players) : null;
  rows.push(textRow(`Field: ${input.players} players${input.bracketSize ? ` · ${input.bracketSize}-slot bracket` : ""}${byes ? ` · ${byes} byes` : ""}`, 9));
  rows.push(textRow(`Matches: ${done.length} completed · ${live.length} live · ${onTable.length} on a table · ${waiting.length} waiting`, 9));
  const list = (title: string, items: LiveMatch[]) => {
    if (!items.length) return;
    rows.push(spacer(4));
    rows.push(textRow(title, 9.5, { font: "bold", gray: INK_STRONG, keepWithNext: 1 }));
    for (const m of items) {
      rows.push(
        textRow(
          [labels(m), m.tableLabel, `${nameWithRace(m.p1Name, m.p1Race) ?? "TBD"} vs ${nameWithRace(m.p2Name, m.p2Race) ?? "TBD"}`]
            .filter(Boolean)
            .join(" · "),
          8.5,
          { indent: 8, h: 12 },
        ),
      );
    }
  };
  const labels = (m: LiveMatch) => (m.id === "GF2" ? "Finals Reset" : m.numberLabel || m.id);
  list("Live now", live);
  list("On a table, not started", onTable);
  // Placements decided so far (best first).
  const placed = computeStandings(input.matches).slice(0, 12);
  if (placed.length) {
    rows.push(spacer(4));
    rows.push(textRow("Placements", 9.5, { font: "bold", gray: INK_STRONG, keepWithNext: 1 }));
    for (const st of placed) rows.push(textRow(`${st.placeLabel}   ${st.name}   (${st.wins}–${st.losses})`, 8.5, { indent: 8, h: 12 }));
  }

  // Payouts
  rows.push(spacer(10));
  rows.push(textRow("Payouts", 12, { font: "bold", gray: INK_STRONG, h: 18, keepWithNext: 2 }));
  const pay = input.payouts;
  if (!pay || !pay.configured || !pay.entry) {
    rows.push(textRow("No prize pool configured for this tournament.", 9, { gray: MUTED }));
  } else {
    rows.push(amountRow("Prize Pool", formatMoney(pay.entry.pool), { bold: true }));
    for (const p of pay.entry.places) rows.push(amountRow(`${ordinal(p.place)}   ${p.name ?? "—"}`, formatMoney(p.amount), { indent: 8 }));
    for (const sp of pay.sidePots) {
      rows.push(spacer(4));
      rows.push({ ...amountRow(`Side pot · ${sp.name}`, formatMoney(sp.pool), { bold: true }), keepWithNext: 1 });
      for (const p of sp.places) rows.push(amountRow(`${ordinal(p.place)}   ${p.name ?? "—"}`, formatMoney(p.amount), { indent: 8 }));
    }
    if (pay.entry.places.some((p) => !p.name)) rows.push(textRow("Names fill in as places are decided.", 7.5, { gray: MUTED, h: 11 }));
  }

  // Player list
  if (input.roster == null && input.mode === "offline") {
    rows.push(spacer(10));
    rows.push(textRow("Player list isn't included in this offline copy — it's added the next time this device syncs.", 8, { gray: MUTED }));
  }
  const roster = input.roster ?? [];
  if (roster.length) {
    const pots = input.sidePotNames ?? [];
    const header = (): FlowRow => ({
      h: 15,
      draw: (page, x, y, w) => {
        const hy = y + 8;
        page.text(x + PL.name, hy, "Name", 7.5, { font: "bold", gray: 0.35 });
        page.text(x + PL.entry + 10, hy, "Entry", 7.5, { font: "bold", gray: 0.35, align: "center" });
        page.text(x + PL.pot + 22, hy, pots.length === 1 ? "Side Pot" : "Side Pots", 7.5, { font: "bold", gray: 0.35, align: "center" });
        page.text(x + PL.fargo, hy, "Fargo", 7.5, { font: "bold", gray: 0.35, align: "right" });
        page.text(x + PL.status, hy, "Status", 7.5, { font: "bold", gray: 0.35 });
        page.line(x, y + 11.5, x + w, y + 11.5, { gray: 0.7, width: 0.5 });
      },
    });
    rows.push(spacer(10));
    rows.push(textRow(`Players (${roster.length})`, 12, { font: "bold", gray: INK_STRONG, h: 18, keepWithNext: 2 }));
    rows.push({ ...header(), keepWithNext: 1 });
    roster.forEach((r, i) => {
      rows.push({
        h: 13,
        repeatHeader: header,
        draw: (page, x, y, w) => {
          if (i % 2 === 1) page.rect(x - 2, y - 0.5, w + 4, 13, { stroke: null, fill: 0.96 });
          const by = y + 9.2;
          const outOrGone = r.status.startsWith("Out") || r.status === "No Show";
          page.text(x + PL.name, by, fitText(r.name, 8.5, PL.entry - 8, r.status === "Champion" ? "bold" : "regular"), 8.5, {
            font: r.status === "Champion" ? "bold" : "regular",
            gray: outOrGone ? MUTED : INK,
          });
          checkbox(page, x + PL.entry + 10, y, r.entryPaid);
          if (pots.length === 1) checkbox(page, x + PL.pot + 22, y, r.sidePots.includes(pots[0]));
          else if (pots.length > 1)
            page.text(x + PL.pot + 22, by, fitText(r.sidePots.length ? r.sidePots.join(", ") : "—", 7.5, 66), 7.5, { gray: INK, align: "center" });
          else page.text(x + PL.pot + 22, by, "—", 8, { gray: MUTED, align: "center" });
          page.text(x + PL.fargo, by, r.fargo != null ? String(r.fargo) : "—", 8.5, { gray: INK, align: "right" });
          page.text(x + PL.status, by, fitText(r.status, 8.5, w - PL.status), 8.5, {
            font: r.status === "In Field" || r.status === "Champion" ? "bold" : "regular",
            gray: r.status === "In Field" || r.status === "Champion" ? INK_STRONG : MUTED,
          });
        },
      });
    });
  }
  return rows;
};

// Flow summary rows into two columns on pages that follow the bracket.
type FlowPlacement = { page: number; x: number; y: number; row: FlowRow };
const flowSummary = (rows: FlowRow[]): { placements: FlowPlacement[]; pages: number } => {
  const placements: FlowPlacement[] = [];
  const top = CONTENT_TOP + 4;
  let page = 0;
  let col = 0;
  let y = top;
  const nextColumn = () => {
    if (col === 0) col = 1;
    else {
      col = 0;
      page += 1;
    }
    y = top;
  };
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    let need = row.h;
    for (let k = 1; k <= (row.keepWithNext ?? 0) && i + k < rows.length; k++) need += rows[i + k].h;
    if (y + need > AREA_BOTTOM && y > top) {
      nextColumn();
      if (row.repeatHeader) {
        const hdr = row.repeatHeader();
        placements.push({ page, x: MARGIN + col * (SUM_COL_W + SUM_GAP), y, row: hdr });
        y += hdr.h;
      }
    }
    if (row.spacer && y === top) continue;
    placements.push({ page, x: MARGIN + col * (SUM_COL_W + SUM_GAP), y, row });
    y += row.h;
  }
  return { placements, pages: placements.reduce((a, p) => Math.max(a, p.page), 0) + 1 };
};

export interface BuiltPage {
  section: BracketPageLayout["section"];
  title: string;
  sections: BracketSection[]; // bracket sections on this page, in order
  placed: PlacedMatch[];
}

export const buildElimBracketPdf = (input: ElimBracketPdfInput): { bytes: Uint8Array; fileName: string; pages: BuiltPage[] } => {
  const layouts = layoutElimBracket(input.graph, input.doubleElim);
  const byId = new Map(input.matches.map((m) => [m.id, m]));
  const nodeById = new Map(input.graph.map((n) => [n.id, n]));
  const labels = new Map(input.matches.map((m) => [m.id, m.id === "GF2" ? "Finals Reset" : m.numberLabel || m.id]));
  const doc = new PdfDocument({ title: `${input.tournamentName} — bracket backup`, author: "Compete" });

  const flow = flowSummary(summaryRows(input));
  const pages: BuiltPage[] = [
    ...layouts.map((l) => ({ section: l.section, title: l.title, sections: l.blocks.map((b) => b.block.section), placed: l.placed })),
    ...Array.from({ length: flow.pages }, (_, i) => ({
      section: "summary" as const,
      title: i === 0 ? "TOURNAMENT SUMMARY" : "TOURNAMENT SUMMARY (CONTINUED)",
      sections: [] as BracketSection[],
      placed: [] as PlacedMatch[],
    })),
  ];

  pages.forEach((spec, i) => {
    const page = doc.addPage(PAGE_W, PAGE_H);
    drawHeader(page, input, spec.title);
    const layout = layouts[i];
    if (layout) {
      layout.blocks.forEach(({ block, top }, bi) => {
        if (bi > 0) page.line(MARGIN, top - BLOCK_GAP / 2, PAGE_W - MARGIN, top - BLOCK_GAP / 2, { gray: 0.8, width: 0.5 });
        block.columns.forEach((c, col) => page.text(boxX(col) + 2, top + COL_LABEL_H - 5, c.toUpperCase(), 8, { font: "bold", gray: 0.3 }));
      });
      const pos = new Map(layout.placed.map((p) => [p.id, p]));
      // Connectors first (under the boxes): feeder's right edge → this match's player row.
      for (const p of layout.placed) {
        const node = nodeById.get(p.id);
        if (!node) continue;
        ([node.slot1, node.slot2] as const).forEach((ref, k) => {
          if (ref.kind !== "winner") return;
          const src = pos.get(ref.matchId);
          if (!src || src.col !== p.col - 1) return;
          const sx = boxX(src.col) + BOX_W;
          const sy = src.top + TOP_H + ROW_H;
          const tx = boxX(p.col);
          const ty = p.top + TOP_H + ROW_H * (k + 0.5);
          const mid = sx + (tx - sx) / 2;
          page.path([[sx, sy], [mid, sy], [mid, ty], [tx, ty]], { gray: 0.4, width: 0.8 });
        });
      }
      for (const p of layout.placed) {
        const m = byId.get(p.id);
        if (m) drawMatch(page, m, nodeById.get(p.id), boxX(p.col), p.top, labels, byId);
        else if (p.id === "GF2") {
          // buildLiveMatches drops the reset once it is not needed.
          page.rect(boxX(p.col), p.top, BOX_W, BOX_H, { stroke: 0.8, width: 0.5 });
          page.text(boxX(p.col) + 6, p.top + BOX_H / 2 + 3, "Not needed", 8, { gray: 0.5 });
        }
      }
      const gfPos = pos.get("GF");
      if (gfPos && input.doubleElim) {
        const gf = byId.get("GF");
        const note =
          gf && gf.status === "completed" && gf.winner === 1
            ? "Reset not needed — winners-side finalist won the Grand Final."
            : "Reset is played only if the losers-side finalist wins the Grand Final.";
        // Beside the reset box (the championship uses two columns; the rest of the row is free).
        page.text(boxX(gfPos.col + 2) + 4, gfPos.top + BOX_H / 2 + 3, fitText(note, 7.5, 2 * COL_W - 12), 7.5, { gray: 0.4 });
      }
    }
    for (const fp of flow.placements) if (layouts.length + fp.page === i) fp.row.draw(page, fp.x, fp.y, SUM_COL_W);
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
