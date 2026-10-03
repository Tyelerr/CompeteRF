// src/utils/chip-backup-pdf.ts
// Chip Tournament "Download Tournament Backup" — a printable MANUAL OPERATING PACKET (not a
// bracket) a TD can use to keep a winner-stays chip event running on paper if Compete or the
// internet goes down. Pure: input is the Chip state exactly as the app holds it (entries,
// tables, matches, queue, settings) + meta; output is PDF bytes. Never touches the network or
// tournament state (read / export only).
//
// Packet (US Letter portrait — written on by hand, so rows are tall and text is never shrunk):
//   1. Tournament info + PLAYER LOOKUP & CHIP TRACKER — every field entrant by packet number
//      (#1…), Fargo, starting / current chips, one box per STARTING chip (used chips already
//      crossed out), W-L and live status (Playing · table / Up Next / Waiting · queue spot /
//      Eliminated / Winner).
//   2. QUEUE worksheet — today's queue order prefilled, then plenty of blank rows (40+).
//   3. TABLE WORKSHEETS — two tables per page, each a manual match log (current match prefilled,
//      12 more rows) built around winner-stays: P1 (stays) · P2 (challenger) · Winner · Loser ·
//      loser's chips left · chip crossed off · loser's queue spot · next challenger.
//   4. Blank table continuation sheet (print as many as needed) + general ACTIVITY LOG.
//   5. HOW TO USE THIS BACKUP — written for the tournament's CURRENT mode (normal winner-stays,
//      Shuffle Mode round, reshuffle in progress, finals).
//
// Player numbers: Chip has no stored player / team number, so the packet numbers the field
// entrants #1…N in the order they were added (created_at, then id) — stable across backups of
// the same event because the field is locked once the tournament starts. Teams (Scotch
// Doubles) are ONE entrant: one number, the team's names, combined Fargo, one chip count.

import { ChipEntry, ChipMatch, ChipState, ChipTable } from "../models/types/chip.types";
import { isChipFieldMember, teamName } from "../models/services/chip.engine";
import { formatBackupTime, formatEventDate } from "./elim-bracket-pdf";
import { naturalCompare } from "./natural-sort";
import { PdfColor, PdfDocument, PdfPage, fitText, textWidth } from "./pdf-writer";

export type ChipBackupMode = "latest" | "offline";

export interface ChipBackupInput {
  tournamentName: string;
  tournamentDate?: string | null;
  chip: ChipState;
  version: number | null; // chip_config.version
  mode: ChipBackupMode;
  generatedAt: Date;
  lastSyncedAt?: Date | null; // offline: when this device's copy was saved
  unsyncedOfflineChanges?: boolean; // offline copy holds changes the cloud never confirmed
}

// ── page geometry (points) ────────────────────────────────────────────────────────────────
const PAGE_W = 612;
const PAGE_H = 792;
const M = 36;
const HEADER_H = 70;
const FOOTER_H = 18;
const TOP = M + HEADER_H;
const BOTTOM = PAGE_H - M - FOOTER_H;
const WIDTH = PAGE_W - 2 * M;

const INK: PdfColor = 0.15;
const SOFT: PdfColor = 0.42;
const RULE: PdfColor = 0.7;

// ── shared helpers (exported for tests) ───────────────────────────────────────────────────
/** Field entrants in packet order (#1…): created_at, then id. */
export const chipBackupEntrants = (s: ChipState): ChipEntry[] =>
  s.entries
    .filter((e) => isChipFieldMember(s, e)) // the live field gate the Chip UI uses
    .sort((a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? "") || a.id.localeCompare(b.id));

export const chipBackupNumbers = (s: ChipState): Map<string, number> =>
  new Map(chipBackupEntrants(s).map((e, i) => [e.id, i + 1]));

const fullName = teamName; // full names ("First Last / First Last" for a team) — the lookup sheet

const ratingOf = (s: ChipState, e: ChipEntry): number | null =>
  s.settings.format === "scotch_doubles"
    ? e.teamFargo ?? (e.p1Fargo == null && e.p2Fargo == null ? null : (e.p1Fargo ?? 0) + (e.p2Fargo ?? 0))
    : e.p1Fargo ?? null;

const liveMatchOf = (s: ChipState, t: ChipTable): ChipMatch | undefined =>
  t.matchId ? s.matches.find((m) => m.id === t.matchId && m.status === "in_progress") : undefined;

export const activeTables = (s: ChipState): ChipTable[] =>
  s.tables.filter((t) => !t.inactive).sort((a, b) => naturalCompare(a.label, b.label));

/** Live status in the Chip UI's terms (Playing / Up Next / Waiting / Eliminated / Winner). */
export const chipBackupStatus = (s: ChipState, e: ChipEntry): string => {
  if (s.finishedAt) return s.winnerId === e.id ? "Winner" : "Eliminated";
  if (e.status === "eliminated") return "Eliminated";
  if (e.status === "playing" || e.tableId) {
    const t = s.tables.find((x) => x.id === e.tableId);
    return t ? `Playing · ${t.label}` : "Playing";
  }
  const q = s.queue.indexOf(e.id);
  if (q === 0) return "Up Next";
  return q > 0 ? `Waiting · Queue #${q + 1}` : "Waiting";
};

export interface ChipTableNow {
  kind: "live" | "next" | "holder" | "open";
  p1: string | null; // packet "#n"
  p2: string | null;
  text: string;
}
/** What is on a table right now (live match / announced matchup / holder waiting / open). */
export const chipTableNow = (s: ChipState, t: ChipTable, num: Map<string, number>): ChipTableNow => {
  const n = (id?: string | null) => (id && num.has(id) ? `#${num.get(id)}` : null);
  const m = liveMatchOf(s, t);
  if (m) return { kind: "live", p1: n(m.aId), p2: n(m.bId), text: `Live now: ${n(m.aId) ?? "?"} vs ${n(m.bId) ?? "?"}` };
  if (t.holderId && t.pendingChallengerId)
    return { kind: "next", p1: n(t.holderId), p2: n(t.pendingChallengerId), text: `Waiting to start: ${n(t.holderId)} vs ${n(t.pendingChallengerId)}` };
  if (t.holderId) return { kind: "holder", p1: n(t.holderId), p2: null, text: `${n(t.holderId)} holds the table — waiting for a challenger` };
  return { kind: "open", p1: null, p2: null, text: s.reshufflePending || s.shuffleReady ? "Open — waiting for the shuffle" : "Open" };
};

export const chipBackupFileName = (name: string, version: number | null, mode: ChipBackupMode): string => {
  const slug =
    String(name ?? "")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^A-Za-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60)
      .replace(/-+$/g, "") || "Tournament";
  return `Compete-${slug}-Chip-Backup${mode === "offline" ? "-Last-Synced" : ""}${version != null ? `-R${version}` : ""}.pdf`;
};

/** "5" or "3–5 by Fargo (under 500: 5 · 500–599: 4 · 600+: 3)". */
export const startingChipsText = (s: ChipState): string => {
  const tiers = [...(s.settings.tiers ?? [])].sort((a, b) => a.minFargo - b.minFargo);
  if (!tiers.length) {
    const starts = [...new Set(chipBackupEntrants(s).map((e) => e.startChips))].sort((a, b) => a - b);
    return starts.length ? starts.join(" / ") : "—";
  }
  const chips = tiers.map((t) => t.chips);
  const lo = Math.min(...chips);
  const hi = Math.max(...chips);
  if (lo === hi) return String(lo);
  const tierText = tiers
    .map((t, i) => {
      const range = i === 0 && t.minFargo <= 0 ? `under ${(t.maxFargo ?? 0) + 1}` : t.maxFargo == null ? `${t.minFargo}+` : `${t.minFargo}–${t.maxFargo}`;
      return `${range}: ${t.chips}`;
    })
    .join(" · ");
  return `${lo}–${hi} by Fargo (${tierText})`;
};

/** The CURRENT operating mode — drives the printed instructions. */
export type ChipBackupModeState = "normal" | "shuffle_round" | "reshuffle_pending" | "finals" | "finished";
export const chipOperatingMode = (s: ChipState): ChipBackupModeState => {
  if (s.finishedAt) return "finished";
  const alive = chipBackupEntrants(s).filter((e) => e.status !== "eliminated");
  if (alive.length === 2) return "finals";
  if (s.reshufflePending || s.shuffleReady) return "reshuffle_pending";
  if (s.shuffleRound || s.shuffleMode) return "shuffle_round";
  return "normal";
};

export const chipInstructions = (s: ChipState): string[] => {
  const mode = chipOperatingMode(s);
  const lines = [
    "Use the Player Lookup (page 1) to identify everyone by packet number (#). Write numbers, not names.",
  ];
  if (mode === "finished") {
    lines.push("This tournament is finished. Keep this packet as the record of the final chip counts and results.");
    return lines;
  }
  if (mode === "shuffle_round") {
    lines.push(
      "Shuffle Mode is ON. During a round, every remaining player gets one turn: the winner stays at the table, and each new challenger is the first player in the Queue who has NOT played yet this round (no rematch rule during a round).",
      "When every player has played this round, finish the matches in progress, then reshuffle: write the remaining players in a new random order on the Queue sheet and seat new pairs at every table.",
    );
  } else if (mode === "reshuffle_pending") {
    lines.push(
      "A reshuffle is in progress. Finish only the matches already being played and do not seat new challengers. Winners rejoin the FRONT of the Queue.",
      "When every table is empty, write the remaining players in a new random order on the Queue sheet and seat new pairs at every table, then continue as normal.",
    );
  } else if (mode === "finals") {
    lines.push("Only two players remain: they play the final on one table. The winner of that match is the champion.");
  } else {
    lines.push(
      "Winner stays at the table. The next challenger is the first player in the Queue — but skip a player who just lost to this same table's holder (no immediate rematch on the same table), unless everyone waiting is blocked.",
    );
  }
  lines.push(
    "Matches never start on their own: announce each matchup on the Table Worksheet and start it when both players are at the table.",
    "Record every result on that table's worksheet: Winner #, Loser #, and the loser's chips left. Carry the Winner # down to P1 on the next row.",
    "Cross off one chip box on the Player Lookup each time a player loses.",
    "A loser who still has chips goes to the BACK of the Queue — write their new queue spot on the worksheet and the Queue sheet.",
    "At 0 chips the player is eliminated: mark them Eliminated on the Player Lookup.",
    "If a table is being closed, its winner goes to the FRONT of the Queue instead of staying.",
  );
  if (s.settings.buyBacksAllowed) lines.push("Buy-backs are allowed: note any buy-back (player # and chips added) in the Activity Log.");
  if (mode !== "finals") lines.push("When only two players remain, they play the final on one table; the winner is the champion.");
  lines.push(
    "Keep the Queue sheet current as players rotate, and log every result in the Activity Log with the time.",
    "When Compete is available again, reconcile before continuing digitally: enter results in the order they happened, then check every player's chip count and the queue order against this packet.",
  );
  return lines;
};

// ── drawing primitives ────────────────────────────────────────────────────────────────────
const drawHeader = (page: PdfPage, inp: ChipBackupInput, section: string) => {
  const right = PAGE_W - M;
  page.text(M, M + 8, "COMPETE", 8, { font: "bold", gray: 0.4 });
  page.text(M, M + 26, fitText(inp.tournamentName || "Tournament", 16, WIDTH * 0.58, "bold"), 16, { font: "bold", gray: 0.08 });
  const fmt = inp.chip.settings.format === "scotch_doubles" ? "Scotch Doubles" : "Singles";
  page.text(M, M + 40, [`Chip Tournament · ${fmt}`, formatEventDate(inp.tournamentDate)].filter(Boolean).join(" · "), 9.5, { gray: INK });
  const offline = inp.mode === "offline";
  page.text(right, M + 9, offline ? "OFFLINE BACKUP" : "TOURNAMENT BACKUP", 11, { font: "bold", align: "right", gray: 0.08 });
  page.text(right, M + 23, `Generated: ${formatBackupTime(inp.generatedAt)}`, 8.5, { align: "right", gray: INK });
  page.text(
    right,
    M + 35,
    offline
      ? `Last synced: ${inp.lastSyncedAt ? formatBackupTime(inp.lastSyncedAt) : "unknown"} · Version ${inp.version ?? "—"}`
      : `Revision ${inp.version ?? "—"}`,
    8.5,
    { align: "right", font: offline ? "bold" : "regular", gray: INK },
  );
  page.line(M, M + 47, right, M + 47, { gray: 0.6, width: 0.6 });
  const note = offline
    ? inp.unsyncedOfflineChanges
      ? "Offline backup — this device's last copy, including changes made offline that Compete has not confirmed yet."
      : "Offline backup — this device's last synced copy. The tournament may have changed since."
    : "Backup snapshot — the tournament may change after this file was generated.";
  page.text(M, M + 58, fitText(note, 7.5, WIDTH * 0.7), 7.5, { gray: 0.35 });
  page.text(right, M + 58, section, 8.5, { font: "bold", align: "right", gray: 0.08 });
};

const drawFooter = (page: PdfPage, inp: ChipBackupInput, n: number, total: number) => {
  page.text(M, PAGE_H - M + 2, fitText(`Compete chip backup · ${inp.tournamentName}`, 7, WIDTH / 2), 7, { gray: 0.5 });
  page.text(PAGE_W - M, PAGE_H - M + 2, `Page ${n} of ${total}`, 7, { gray: 0.5, align: "right" });
};

type Col = { title: string; w: number; align?: "left" | "center" | "right" };
const colX = (cols: Col[], x0: number) => {
  const xs: number[] = [];
  let x = x0;
  for (const c of cols) {
    xs.push(x);
    x += c.w;
  }
  return xs;
};

// A ruled grid: header row + `rows` body rows, vertical rules between columns (handwriting).
const drawGrid = (
  page: PdfPage,
  x0: number,
  y0: number,
  cols: Col[],
  rows: number,
  rowH: number,
  cell: (row: number, col: number) => { text: string; bold?: boolean; gray?: PdfColor } | null,
  shade?: (row: number) => boolean,
) => {
  const xs = colX(cols, x0);
  const w = cols.reduce((a, c) => a + c.w, 0);
  const headH = 15;
  page.rect(x0, y0, w, headH, { stroke: null, fill: 0.9 });
  cols.forEach((c, i) => {
    const cx = c.align === "center" ? xs[i] + c.w / 2 : c.align === "right" ? xs[i] + c.w - 4 : xs[i] + 4;
    page.text(cx, y0 + 10.5, fitText(c.title, 7.5, c.w - 6, "bold"), 7.5, { font: "bold", gray: 0.25, align: c.align ?? "left" });
  });
  for (let r = 0; r < rows; r++) {
    const ry = y0 + headH + r * rowH;
    if (shade?.(r)) page.rect(x0, ry, w, rowH, { stroke: null, fill: 0.955 });
    page.line(x0, ry + rowH, x0 + w, ry + rowH, { gray: RULE, width: 0.5 });
    cols.forEach((c, i) => {
      const v = cell(r, i);
      if (!v || !v.text) return;
      const cx = c.align === "center" ? xs[i] + c.w / 2 : c.align === "right" ? xs[i] + c.w - 4 : xs[i] + 4;
      page.text(cx, ry + rowH / 2 + 3.2, fitText(v.text, 9, c.w - 6, v.bold ? "bold" : "regular"), 9, {
        font: v.bold ? "bold" : "regular",
        gray: v.gray ?? INK,
        align: c.align ?? "left",
      });
    });
  }
  const bottom = y0 + headH + rows * rowH;
  page.rect(x0, y0, w, bottom - y0, { stroke: 0.45, width: 0.7 });
  for (let i = 1; i < xs.length; i++) page.line(xs[i], y0, xs[i], bottom, { gray: RULE, width: 0.5 });
  return bottom;
};

/** One box per STARTING chip (more if buy-backs raised the count); lost chips are "used". */
export const chipBoxMarks = (start: number, current: number): { total: number; used: number } => {
  const total = Math.max(start ?? 0, current ?? 0, 0);
  return { total, used: Math.max(0, Math.min(start ?? 0, total) - Math.max(0, current ?? 0)) };
};

// Chips already lost are crossed out (vector X — never color alone).
const drawChipBoxes = (page: PdfPage, x: number, cy: number, start: number, current: number, maxW: number) => {
  const size = 8;
  const gap = 3;
  const { total, used } = chipBoxMarks(start, current);
  const fit = Math.max(1, Math.floor((maxW + gap) / (size + gap)));
  const shown = Math.min(total, fit);
  for (let i = 0; i < shown; i++) {
    const bx = x + i * (size + gap);
    const by = cy - size / 2;
    page.rect(bx, by, size, size, { stroke: 0.3, width: 0.7 });
    if (i < used) {
      page.line(bx + 1.2, by + 1.2, bx + size - 1.2, by + size - 1.2, { gray: 0.1, width: 1 });
      page.line(bx + size - 1.2, by + 1.2, bx + 1.2, by + size - 1.2, { gray: 0.1, width: 1 });
    }
  }
  if (total > shown) page.text(x + shown * (size + gap), cy + 3, `+${total - shown}`, 7.5, { gray: SOFT });
};

// ── pages ─────────────────────────────────────────────────────────────────────────────────
type PageDraw = { section: string; kind: "lookup" | "queue" | "tables" | "continuation" | "activity" | "instructions"; draw: (p: PdfPage) => void };

const TRACK_COLS: Col[] = [
  { title: "#", w: 26, align: "center" },
  { title: "Player / Team", w: 150 },
  { title: "Fargo", w: 36, align: "right" },
  { title: "Start", w: 32, align: "center" },
  { title: "Now", w: 30, align: "center" },
  { title: "Chips (cross one off per loss)", w: 120 },
  { title: "W-L", w: 34, align: "center" },
  { title: "Status", w: 112 },
];
const TRACK_ROW = 17;

const lookupPages = (inp: ChipBackupInput): PageDraw[] => {
  const s = inp.chip;
  const entrants = chipBackupEntrants(s);
  const num = chipBackupNumbers(s);
  const tables = activeTables(s);
  const alive = entrants.filter((e) => e.status !== "eliminated").length;
  const played = s.matches.filter((m) => m.status === "finished" && m.winnerId && m.loserId).length;
  const mode = chipOperatingMode(s);
  const champ = s.winnerId ? entrants.find((e) => e.id === s.winnerId) : null;
  const facts: [string, string][] = [
    [s.settings.format === "scotch_doubles" ? "Teams" : "Players", `${entrants.length} in the field · ${alive} still in · ${entrants.length - alive} eliminated`],
    ["Tables", tables.length ? `${tables.length} active (${tables.map((t) => t.label).join(", ")})` : "none active"],
    ["Starting chips", startingChipsText(s)],
    ["Shuffle Mode", s.shuffleMode ? `ON${s.reshuffleCount ? ` · shuffle #${s.reshuffleCount}` : ""}` : "OFF"],
    ["Rules", "Winner stays · loser loses 1 chip and goes to the back of the queue · 0 chips = eliminated"],
    ["Buy-backs", s.settings.buyBacksAllowed ? "Allowed" : "Not allowed"],
    [
      "State",
      mode === "finished"
        ? `Finished${champ ? ` · Winner #${num.get(champ.id)} ${fullName(champ)}` : ""}`
        : mode === "finals"
          ? "Final match (2 players left)"
          : mode === "reshuffle_pending"
            ? "Reshuffle in progress"
            : s.startedAt
              ? `Live · ${played} matches played`
              : "Not started",
    ],
  ];
  const factsH = facts.length * 13 + 8;
  const first = Math.floor((BOTTOM - (TOP + factsH + 22) - 15) / TRACK_ROW);
  const rest = Math.floor((BOTTOM - (TOP + 16) - 15) / TRACK_ROW);
  const chunks: ChipEntry[][] = [];
  let i = 0;
  chunks.push(entrants.slice(0, first));
  i = first;
  while (i < entrants.length) {
    chunks.push(entrants.slice(i, i + rest));
    i += rest;
  }
  return chunks.map((rows, ci) => ({
    section: ci === 0 ? "PLAYER LOOKUP & CHIP TRACKER" : "PLAYER LOOKUP (CONTINUED)",
    kind: "lookup" as const,
    draw: (page: PdfPage) => {
      let y = TOP;
      if (ci === 0) {
        for (const [k, v] of facts) {
          page.text(M, y + 9, k, 8.5, { font: "bold", gray: 0.3 });
          page.text(M + 92, y + 9, fitText(v, 8.5, WIDTH - 92), 8.5, { gray: INK });
          y += 13;
        }
        y += 8;
        page.text(M, y + 10, s.settings.format === "scotch_doubles" ? "Teams" : "Players", 11, { font: "bold", gray: 0.08 });
        y += 16;
      } else y += 2;
      const bottom = drawGrid(
        page,
        M,
        y,
        TRACK_COLS,
        rows.length,
        TRACK_ROW,
        (r, c) => {
          const e = rows[r];
          const st = chipBackupStatus(s, e);
          switch (c) {
            case 0:
              return { text: `${num.get(e.id)}`, bold: true };
            case 1:
              return { text: fullName(e), gray: st === "Eliminated" ? SOFT : INK };
            case 2: {
              const f = ratingOf(s, e);
              return { text: f != null ? String(f) : "—" };
            }
            case 3:
              return { text: String(e.startChips ?? 0) };
            case 4:
              return { text: String(e.chips ?? 0), bold: true };
            case 6:
              return { text: `${e.wins ?? 0}-${e.losses ?? 0}` };
            case 7:
              return { text: st, bold: st.startsWith("Playing") || st === "Up Next" || st === "Winner", gray: st === "Eliminated" ? SOFT : INK };
            default:
              return null;
          }
        },
        (r) => r % 2 === 1,
      );
      // chip boxes (column 5)
      const xs = colX(TRACK_COLS, M);
      rows.forEach((e, r) => drawChipBoxes(page, xs[5] + 5, y + 15 + r * TRACK_ROW + TRACK_ROW / 2, e.startChips ?? 0, e.chips ?? 0, TRACK_COLS[5].w - 10));
      if (ci === chunks.length - 1 && bottom + 14 < BOTTOM)
        page.text(M, bottom + 12, "Crossed boxes = chips already lost when this backup was made. Players at a table are not in the queue.", 7.5, { gray: SOFT });
    },
  }));
};

const QUEUE_COLS: Col[] = [
  { title: "Spot", w: 34, align: "center" },
  { title: "#", w: 40, align: "center" },
  { title: "Player / Team", w: 200 },
  { title: "Chips", w: 44, align: "center" },
  { title: "Notes", w: WIDTH - 318 },
];
const QUEUE_ROW = 19;
export const QUEUE_MIN_BLANK_ROWS = 40;

/** Queue sheet rows: the current queue + at least QUEUE_MIN_BLANK_ROWS blank rows, whole pages. */
export const queueLayout = (queued: number): { perPage: number; total: number; blank: number } => {
  const perPage = Math.floor((BOTTOM - (TOP + 28) - 15) / QUEUE_ROW);
  const total = Math.max(perPage, Math.ceil((queued + QUEUE_MIN_BLANK_ROWS) / perPage) * perPage);
  return { perPage, total, blank: total - queued };
};

const queuePages = (inp: ChipBackupInput): PageDraw[] => {
  const s = inp.chip;
  const num = chipBackupNumbers(s);
  const byId = new Map(s.entries.map((e) => [e.id, e]));
  const queued = s.queue.map((id) => byId.get(id)).filter((e): e is ChipEntry => !!e && num.has(e.id));
  const { perPage, total } = queueLayout(queued.length);
  const pages: PageDraw[] = [];
  for (let start = 0; start < total; start += perPage) {
    const pi = start / perPage;
    pages.push({
      section: pi === 0 ? "QUEUE" : "QUEUE (CONTINUED)",
      kind: "queue",
      draw: (page) => {
        page.text(M, TOP + 9, pi === 0 ? `Current queue (front = next up) · ${queued.length} waiting` : "Queue continued", 10, { font: "bold", gray: 0.08 });
        page.text(M, TOP + 21, "Losers with chips left join the BACK. Rewrite the order here as players rotate.", 7.5, { gray: SOFT });
        drawGrid(page, M, TOP + 28, QUEUE_COLS, perPage, QUEUE_ROW, (r, c) => {
          const e = queued[start + r];
          if (!e) return null;
          if (c === 0) return { text: String(start + r + 1) };
          if (c === 1) return { text: `#${num.get(e.id)}`, bold: true };
          if (c === 2) return { text: fullName(e) };
          if (c === 3) return { text: String(e.chips ?? 0) };
          return null;
        });
      },
    });
  }
  return pages;
};

const TABLE_COLS: Col[] = [
  { title: "Match", w: 38, align: "center" },
  { title: "P1 # (stays)", w: 56, align: "center" },
  { title: "P2 # (challenger)", w: 70, align: "center" },
  { title: "Winner #", w: 52, align: "center" },
  { title: "Loser #", w: 52, align: "center" },
  { title: "Chips left", w: 60, align: "center" },
  { title: "Chip off", w: 40, align: "center" },
  { title: "Queue spot", w: 62, align: "center" },
  { title: "Next challenger #", w: WIDTH - 430, align: "center" },
];
const TABLE_ROW = 19;
export const TABLE_ROWS = 13; // current match + 12 future matches
const TABLE_BLOCK_H = 30 + 15 + TABLE_ROWS * TABLE_ROW;

const drawTableLog = (page: PdfPage, y: number, title: string, sub: string, now: ChipTableNow | null, rows: number) => {
  page.text(M, y + 12, title, 12, { font: "bold", gray: 0.08 });
  page.text(M + textWidth(title, 12, "bold") + 10, y + 12, fitText(sub, 8.5, WIDTH - textWidth(title, 12, "bold") - 10), 8.5, { gray: SOFT });
  const bottom = drawGrid(page, M, y + 20, TABLE_COLS, rows, TABLE_ROW, (r, c) => {
    if (c === 0) return { text: r === 0 && now && now.kind !== "open" ? (now.kind === "live" ? "Now" : "Next") : String(r + 1), bold: r === 0 && !!now && now.kind !== "open", gray: SOFT };
    if (r === 0 && now) {
      if (c === 1 && now.p1) return { text: now.p1, bold: true };
      if (c === 2 && now.p2) return { text: now.p2, bold: true };
    }
    return null;
  });
  // "Chip off" check boxes.
  const xs = colX(TABLE_COLS, M);
  for (let r = 0; r < rows; r++) {
    const cy = y + 20 + 15 + r * TABLE_ROW + TABLE_ROW / 2;
    page.rect(xs[6] + TABLE_COLS[6].w / 2 - 4, cy - 4, 8, 8, { stroke: 0.4, width: 0.6 });
  }
  return bottom;
};

const tablePages = (inp: ChipBackupInput): PageDraw[] => {
  const s = inp.chip;
  const num = chipBackupNumbers(s);
  const tables = activeTables(s);
  const pages: PageDraw[] = [];
  for (let i = 0; i < tables.length; i += 2) {
    const pair = tables.slice(i, i + 2);
    pages.push({
      section: "TABLE WORKSHEETS",
      kind: "tables",
      draw: (page) => {
        pair.forEach((t, k) => {
          const now = chipTableNow(s, t, num);
          const flags = [t.isStream ? "Stream table" : null, t.locked ? "Locked" : null, t.closing ? "Closing after this match" : null].filter(Boolean);
          const y = TOP + 2 + k * (TABLE_BLOCK_H + 18);
          drawTableLog(page, y, t.label.toUpperCase(), [now.text, ...flags].join(" · "), now, TABLE_ROWS);
        });
        page.text(M, BOTTOM - 2, "Winner stays: carry the Winner # down to P1 on the next row. Chips left / Queue spot are the LOSER's. Cross the loser's chip off on the Player Lookup.", 7.5, { gray: SOFT });
      },
    });
  }
  return pages;
};

export const CONTINUATION_ROWS = Math.floor((BOTTOM - (TOP + 22) - 15 - 14) / TABLE_ROW);
const continuationPage = (): PageDraw => ({
  section: "BLANK TABLE CONTINUATION (PRINT AS NEEDED)",
  kind: "continuation",
  draw: (page) => {
    drawTableLog(page, TOP + 2, "TABLE: ________________", "Continue any table here — print this page as many times as you need.", null, CONTINUATION_ROWS);
  },
});

const ACT_COLS: Col[] = [
  { title: "Time", w: 52, align: "center" },
  { title: "Table", w: 60, align: "center" },
  { title: "Winner #", w: 56, align: "center" },
  { title: "Loser #", w: 56, align: "center" },
  { title: "Chips left", w: 66, align: "center" },
  { title: "Queue spot", w: 56, align: "center" },
  { title: "Notes", w: WIDTH - 346 },
];
export const ACTIVITY_ROWS = Math.floor((BOTTOM - (TOP + 22) - 15) / QUEUE_ROW);
const activityPage = (): PageDraw => ({
  section: "ACTIVITY LOG",
  kind: "activity",
  draw: (page) => {
    page.text(M, TOP + 10, "Every result, in order — your paper trail for reconciling with Compete", 10, { font: "bold", gray: 0.08 });
    drawGrid(page, M, TOP + 22, ACT_COLS, ACTIVITY_ROWS, QUEUE_ROW, () => null);
  },
});

const instructionsPage = (inp: ChipBackupInput): PageDraw => ({
  section: "HOW TO USE THIS BACKUP",
  kind: "instructions",
  draw: (page) => {
    let y = TOP + 4;
    page.text(M, y + 12, "HOW TO USE THIS BACKUP", 14, { font: "bold", gray: 0.08 });
    y += 26;
    const mode = chipOperatingMode(inp.chip);
    const modeText =
      mode === "shuffle_round"
        ? "Current mode: Shuffle Mode (rounds — everyone plays once per round)"
        : mode === "reshuffle_pending"
          ? "Current mode: reshuffle in progress"
          : mode === "finals"
            ? "Current mode: final match"
            : mode === "finished"
              ? "Tournament finished"
              : "Current mode: winner stays (normal queue)";
    page.text(M, y + 10, modeText, 10, { font: "bold", gray: INK });
    y += 22;
    chipInstructions(inp.chip).forEach((line, i) => {
      const words = line.split(" ");
      let cur = "";
      const wrapped: string[] = [];
      for (const w of words) {
        const next = cur ? `${cur} ${w}` : w;
        if (textWidth(next, 10) > WIDTH - 22) {
          wrapped.push(cur);
          cur = w;
        } else cur = next;
      }
      if (cur) wrapped.push(cur);
      page.text(M, y + 10, `${i + 1}.`, 10, { font: "bold", gray: INK });
      wrapped.forEach((wl, k) => page.text(M + 20, y + 10 + k * 14, wl, 10, { gray: INK }));
      y += wrapped.length * 14 + 8;
    });
  },
});

export const buildChipBackupPdf = (inp: ChipBackupInput): { bytes: Uint8Array; fileName: string; pages: { section: string; kind: PageDraw["kind"] }[] } => {
  const plan: PageDraw[] = [
    ...lookupPages(inp),
    ...queuePages(inp),
    ...tablePages(inp),
    continuationPage(),
    activityPage(),
    instructionsPage(inp),
  ];
  const doc = new PdfDocument({ title: `${inp.tournamentName} — chip tournament backup`, author: "Compete" });
  plan.forEach((pd, i) => {
    const page = doc.addPage(PAGE_W, PAGE_H);
    drawHeader(page, inp, pd.section);
    pd.draw(page);
    drawFooter(page, inp, i + 1, plan.length);
  });
  return { bytes: doc.toBytes(), fileName: chipBackupFileName(inp.tournamentName, inp.version, inp.mode), pages: plan.map((p) => ({ section: p.section, kind: p.kind })) };
};

// ── Actions row availability (pure) ──────────────────────────────────────────────────────
export const CHIP_BACKUP_NO_LOCAL_WEB =
  "You're offline and this browser has no saved copy of this tournament yet, so there's nothing to download.";
export const CHIP_BACKUP_NO_LOCAL_NATIVE =
  "You're offline. The app doesn't keep an offline copy of Chip tournaments on this device — download a backup while online (Actions → Download Tournament Backup).";

export type ChipBackupAvailability =
  | { kind: "latest"; label: "Download Tournament Backup"; detail: string }
  | { kind: "last_synced"; label: "Download Last Synced Backup"; detail: string }
  | { kind: "unavailable"; label: "Download Tournament Backup"; detail: string; reason: string };

/** Pure: what the Actions row offers (exported for tests). */
export const chipBackupAvailability = (a: { offline: boolean; hasLocal: boolean; native: boolean }): ChipBackupAvailability => {
  if (!a.offline) return { kind: "latest", label: "Download Tournament Backup", detail: "Printable packet: player lookup, chip tracker, queue and table worksheets" };
  if (a.hasLocal) return { kind: "last_synced", label: "Download Last Synced Backup", detail: "Offline — packet from this device's last synced copy" };
  const reason = a.native ? CHIP_BACKUP_NO_LOCAL_NATIVE : CHIP_BACKUP_NO_LOCAL_WEB;
  return { kind: "unavailable", label: "Download Tournament Backup", detail: reason, reason };
};
