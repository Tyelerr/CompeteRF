// src/utils/__tests__/elim-bracket-pdf.test.ts
// Run: npx tsx --test src/utils/__tests__/elim-bracket-pdf.test.ts
// Actions → Download Latest Bracket (Single + Double Elimination PDF backup). The PDF is built
// from the app's own resolver (buildLiveMatches), so these tests read the generated file back and
// check what a TD would see: every match once, correct names / winners / scores / tables / match
// numbers, byes, Grand Final + reset, pagination for 32–64 players, header (revision, generated
// time), offline labelling, a structurally valid PDF, and that the download path never writes.
/// <reference types="node" />

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildBracketGraph } from "../bracket.double";
import { RaceConfig, seedPlayers } from "../bracket.utils";
import { buildLiveMatches, LiveMatch } from "../match.utils";
import { MatchLiveState } from "../../models/types/tournament-settings.types";
import {
  BRACKET_BACKUP_NO_LOCAL,
  BRACKET_COLS_PER_PAGE,
  BRACKET_ROWS_PER_PAGE,
  bracketBackupAvailability,
  bracketBackupFileName,
  bracketChampion,
  buildElimBracketPdf,
  ElimBracketPdfInput,
  formatBackupTime,
  formatEventDate,
  elimBracketBlocks,
  formatMoney,
  layoutElimBracket,
} from "../elim-bracket-pdf";
import { BackupRegistration, buildBackupPayouts, buildBackupRoster } from "../elim-bracket-summary";
import { buildElimLocalRecord, validateElimLocalRecord } from "../elim-local-recovery";
import { bytesToBase64, fitText, textWidth, toWinAnsi } from "../pdf-writer";

const ROOT = join(__dirname, "..", "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8").replace(/^﻿/, "");
const CFG: RaceConfig = { mode: "fixed", fixedWinners: 7, groups: [], diffMin: 0, diffPerGame: 0, diffMax: null } as any;
const TABLES = [
  { id: 4, table_number: 4, label: "Table", status: "in_use" },
  { id: 9, table_number: 1, label: "Diamond", status: "available" },
] as any[];
const GEN = new Date(2026, 9, 3, 20, 42);

const setup = (size: number, players: number, double: boolean, ms: Record<string, Partial<MatchLiveState>> = {}) => {
  const graph = buildBracketGraph(size, double);
  const seeds = Array.from({ length: size }, (_, i) => (i < players ? { registrationId: i + 1, name: `P${i + 1}`, fargo: 500 } : null));
  const bracket = { graph, seeds, drawNumber: 1, players, bracketSize: size, byes: size - players } as any;
  const matches = buildLiveMatches(bracket, ms as Record<string, MatchLiveState>, TABLES, "9-ball", CFG);
  return { graph, matches };
};
const input = (size: number, players: number, double: boolean, ms: Record<string, Partial<MatchLiveState>> = {}, extra: Partial<ElimBracketPdfInput> = {}): ElimBracketPdfInput => {
  const { graph, matches } = setup(size, players, double, ms);
  return { tournamentName: "Friday Night 9-Ball", doubleElim: double, tournamentDate: "2026-10-03", players, revision: 146, graph, matches, mode: "latest", generatedAt: GEN, ...extra };
};
// Complete every match the resolver says is playable, in graph order, winner = slot 1.
const playAll = (size: number, players: number, double: boolean) => {
  const ms: Record<string, Partial<MatchLiveState>> = {};
  const graph = buildBracketGraph(size, double);
  for (let pass = 0; pass < graph.length; pass++) {
    const { matches } = setup(size, players, double, ms);
    const next = matches.find((m) => !m.bye && !m.empty && !m.pending && m.status !== "completed" && m.p1Name && m.p2Name && !ms[m.id]);
    if (!next) break;
    ms[next.id] = { status: "completed", winner: 1, p1Score: 7, p2Score: 3, result: "normal" };
  }
  return ms;
};

// Read the PDF back: every drawn string, per page, with its font.
const pdfStrings = (bytes: Uint8Array) => {
  const raw = Array.from(bytes, (b) => String.fromCharCode(b)).join("");
  const pages = raw.split(/\nendstream/).slice(0, -1).map((chunk) => chunk.slice(chunk.lastIndexOf("stream\n") + 7));
  // WinAnsi 0x80–0x9F punctuation back to Unicode (Latin-1 0xA0–0xFF maps 1:1).
  const WIN: Record<number, string> = { 0x85: "…", 0x91: "‘", 0x92: "’", 0x93: "“", 0x94: "”", 0x95: "•", 0x96: "–", 0x97: "—" };
  const unescape = (s: string) =>
    s.replace(/\\([0-7]{3}|[()\\])/g, (_, g: string) => {
      if (g.length !== 3) return g;
      const c = parseInt(g, 8);
      return WIN[c] ?? String.fromCharCode(c);
    });
  return pages.map((p) =>
    [...p.matchAll(/\/(F[12]) [\d.]+ Tf ([\d.]+ g|[\d.]+ [\d.]+ [\d.]+ rg) [\d.-]+ [\d.-]+ Td \(((?:\\.|[^\\)])*)\) Tj/g)].map((m) => ({
      font: m[1],
      color: m[2],
      text: unescape(m[3]),
    })),
  );
};
const allText = (bytes: Uint8Array) => pdfStrings(bytes).flat().map((s) => s.text);
const realMatches = (ms: LiveMatch[]) => ms.filter((m) => !m.empty);
// The PDF's reading order: every placed match in page order, tagged by bracket section, then the
// summary pages — consecutive repeats collapsed.
const readingOrder = (pdf: { pages: { section: string; placed: { id: string }[] }[] }, graph: { id: string; side: string; round: number }[]) => {
  const wMax = Math.max(...graph.filter((n) => n.side === "winners").map((n) => n.round));
  const lMax = Math.max(0, ...graph.filter((n) => n.side === "losers").map((n) => n.round));
  const tag = (id: string) => {
    const n = graph.find((g) => g.id === id)!;
    if (n.side === "winners") return n.round === wMax ? "WINNERS FINAL" : "WINNERS";
    if (n.side === "losers") return n.round === lMax ? "LOSERS FINAL" : "LOSERS";
    return n.round === 1 ? "GRAND FINAL" : "RESET";
  };
  const seq: string[] = [];
  for (const p of pdf.pages) {
    const tags = p.section === "summary" ? ["SUMMARY"] : p.placed.map((x) => tag(x.id));
    for (const t of tags) if (seq[seq.length - 1] !== t) seq.push(t);
  }
  return seq;
};

// ══ SINGLE ELIMINATION ═══════════════════════════════════════════════════════════════════
// Pages: bracket pages, then the tournament summary.
for (const [size, players, pages] of [[4, 4, 2], [8, 8, 2], [16, 16, 2], [32, 32, 4], [64, 64, 6]] as const) {
  test(`single ${players} players: every match exactly once, readable pagination (${pages} pages)`, () => {
    const inp = input(size, players, false);
    const pdf = buildElimBracketPdf(inp);
    assert.equal(pdf.pages.length, pages);
    const placed = pdf.pages.flatMap((p) => p.placed.map((x) => x.id)).sort();
    assert.deepEqual(placed, inp.graph.map((n) => n.id).sort(), "every bracket match, once");
    for (const l of layoutElimBracket(inp.graph, false)) for (const b of l.blocks) assert.ok(b.block.columns.length <= BRACKET_COLS_PER_PAGE);
    for (const p of pdf.pages) for (const x of p.placed) assert.ok(x.y >= 0 && x.y < BRACKET_ROWS_PER_PAGE && x.top + 42 <= 562, `${x.id} on the page`);
    // Reads in tournament order: bracket (final last), then the summary.
    assert.deepEqual(readingOrder(pdf, inp.graph), ["WINNERS", "WINNERS FINAL", "SUMMARY"]);
    const text = allText(pdf.bytes);
    for (const m of inp.matches) assert.ok(text.includes(m.numberLabel), `match number ${m.numberLabel}`);
    assert.ok(text.includes("FINAL"), "final round labelled");
    assert.equal(text.filter((t) => t === `Page 1 of ${pages}`).length, 1);
  });
}

test("single with byes: bye boxes say Bye / BYE, carry no score, and the player advances", () => {
  // The app's own draw (byes spread to top seeds), not byes stacked at the end.
  const graph = buildBracketGraph(8, false);
  const seeds = seedPlayers(Array.from({ length: 6 }, (_, i) => ({ registrationId: i + 1, name: `P${i + 1}`, fargo: 500 })) as any, 8);
  const matches = buildLiveMatches({ graph, seeds, players: 6, bracketSize: 8, byes: 2 } as any, {}, TABLES, "9-ball", CFG);
  const inp: ElimBracketPdfInput = { ...input(8, 6, false), graph, matches };
  const text = allText(buildElimBracketPdf(inp).bytes);
  const byes = inp.matches.filter((m) => m.bye);
  assert.ok(byes.length >= 2);
  assert.ok(text.includes("BYE"));
  assert.ok(text.filter((t) => t === "Bye").length >= byes.length);
  for (const b of byes) {
    const advanced = (b.p1Name ?? b.p2Name)!;
    const next = inp.matches.find((m) => m.side === "winners" && m.round === 2 && (m.p1Name === advanced || m.p2Name === advanced));
    assert.ok(next, `${advanced} advanced past the bye`);
    assert.equal(b.p1Score ?? null, null, "no invented score");
  }
});

test("single partial: winners bold, scores, live table, assigned table, forfeit, pen boxes for unfinished", () => {
  const inp = input(8, 8, false, {
    W1M1: { status: "completed", winner: 2, p1Score: 4, p2Score: 7, result: "normal" },
    W1M2: { status: "completed", winner: 1, result: "forfeit" },
    W1M3: { status: "in_progress", tableId: 4, p1Score: 2, p2Score: 1 },
    W1M4: { status: "scheduled", tableId: 9 },
  });
  const pdf = buildElimBracketPdf(inp);
  const strings = pdfStrings(pdf.bytes).flat();
  const t = strings.map((s) => s.text);
  assert.ok(strings.some((s) => s.text === "P2" && s.font === "F2"), "winner of W1 in bold");
  assert.ok(strings.some((s) => s.text === "P1" && s.font === "F1"), "loser regular");
  assert.ok(t.includes("7") && t.includes("4"), "scores");
  assert.ok(t.includes("Final · Forfeit"));
  assert.ok(t.includes("LIVE · Table 4"), "live match + its table");
  assert.ok(t.includes("Diamond 1 · not started"), "assigned table");
  assert.ok(t.includes("Winner of W1") || t.includes("P2"), "round 2 shows its feeder or its player");
  const raw = Array.from(pdf.bytes, (b) => String.fromCharCode(b)).join("");
  assert.ok((raw.match(/ re S/g) ?? []).length > 10, "empty score boxes for pen marks");
});

test("single completed: champion + every result", () => {
  const ms = playAll(16, 13, false);
  const inp = input(16, 13, false, ms);
  assert.equal(inp.matches.filter((m) => !m.bye && !m.empty).every((m) => m.status === "completed"), true);
  const text = allText(buildElimBracketPdf(inp).bytes);
  const champ = bracketChampion(inp.matches, false);
  assert.ok(champ);
  assert.ok(text.includes(`Champion: ${champ}`));
  assert.ok(text.some((t) => /· 0 live · 0 on a table · 0 waiting$/.test(t)));
});

// ══ DOUBLE ELIMINATION ═══════════════════════════════════════════════════════════════════
for (const [size, players, sections] of [[8, 8, 2], [16, 9, 3], [16, 16, 3], [32, 27, 6], [32, 32, 6], [64, 64, 9]] as const) {
  test(`double ${players} players: winners, losers, Grand Final + reset, every match once (${sections} pages)`, () => {
    const inp = input(size, players, true);
    const pdf = buildElimBracketPdf(inp);
    assert.equal(pdf.pages.length, sections);
    assert.deepEqual(pdf.pages.flatMap((p) => p.placed.map((x) => x.id)).sort(), inp.graph.map((n) => n.id).sort());
    assert.ok(pdf.pages.some((p) => p.sections.includes("winners")));
    assert.ok(pdf.pages.some((p) => p.sections.includes("losers")));
    // Winners → Winners Final → Losers → Losers Final → Grand Final → Reset → Summary — never interleaved.
    assert.deepEqual(readingOrder(pdf, inp.graph), ["WINNERS", "WINNERS FINAL", "LOSERS", "LOSERS FINAL", "GRAND FINAL", "RESET", "SUMMARY"]);
    assert.equal(pdf.pages[pdf.pages.length - 1].section, "summary");
    const text = allText(pdf.bytes);
    assert.ok(text.includes("WINNERS FINAL") && text.includes("LOSERS FINAL") && text.includes("GRAND FINAL"));
    assert.ok(text.includes("Finals Reset"), "reset box tagged distinctly");
    assert.ok(text.includes("Reset is played only if the losers-side finalist wins the Grand Final."));
    for (const m of realMatches(inp.matches)) assert.ok(text.includes(m.id === "GF2" ? "Finals Reset" : m.numberLabel), m.id);
    // 64 players stays readable: 8 first-column matches per page, never shrunk.
    for (const p of pdf.pages) for (const x of p.placed) assert.ok(x.y < BRACKET_ROWS_PER_PAGE);
  });
}

test("double: losers drop-ins are traceable (Loser of W… / drop-in from …)", () => {
  const text = allText(buildElimBracketPdf(input(16, 16, true)).bytes);
  assert.ok(text.some((t) => /^Loser of W\d+$/.test(t)));
  assert.ok(text.some((t) => /drop-in from W\d+/.test(t)));
  assert.ok(text.some((t) => /W to L\d+/.test(t)));
});

test("double with byes: a feeder that can never produce a player shows BYE (no raw ids)", () => {
  const text = allText(buildElimBracketPdf(input(32, 27, true)).bytes);
  assert.ok(text.includes("No match (both byes)"));
  assert.equal(text.some((t) => /\b[WL]\d+M\d+\b/.test(t)), false, "never an internal id like L1M8");
});

test("double completed without reset: GF won by the winners-side finalist → reset not needed, champion", () => {
  const ms = playAll(8, 8, true);
  delete ms.GF2;
  const inp = input(8, 8, true, ms);
  const text = allText(buildElimBracketPdf(inp).bytes);
  assert.ok(text.includes("Reset not needed — winners-side finalist won the Grand Final."));
  assert.ok(text.includes(`Champion: ${bracketChampion(inp.matches, true)}`));
});

test("double completed with reset: GF2 decides the champion", () => {
  const ms = playAll(8, 8, true);
  ms.GF = { status: "completed", winner: 2, p1Score: 5, p2Score: 7, result: "normal" };
  ms.GF2 = { status: "completed", winner: 2, p1Score: 6, p2Score: 7, result: "normal" };
  const inp = input(8, 8, true, ms);
  const gf2 = inp.matches.find((m) => m.id === "GF2")!;
  assert.equal(bracketChampion(inp.matches, true), gf2.p2Name);
  assert.ok(allText(buildElimBracketPdf(inp).bytes).includes(`Champion: ${gf2.p2Name}`));
});

// ══ STATE + HEADER ═══════════════════════════════════════════════════════════════════════
test("header: name, format, players, event date, generated time, revision, snapshot note", () => {
  const text = allText(buildElimBracketPdf(input(16, 14, true)).bytes);
  assert.ok(text.includes("COMPETE"));
  assert.ok(text.includes("Friday Night 9-Ball"));
  assert.ok(text.includes("Double Elimination · 14 Players · Sat, Oct 3, 2026"));
  assert.ok(text.includes("BRACKET BACKUP"));
  assert.ok(text.includes("Generated: Oct 3, 2026 · 8:42 PM"));
  assert.ok(text.includes("Revision 146"));
  assert.ok(text.includes("Backup snapshot — tournament may have changed after this file was generated."));
  assert.equal(formatBackupTime(new Date(2026, 0, 5, 0, 7)), "Jan 5, 2026 · 12:07 AM");
  assert.equal(formatEventDate("2026-10-03"), "Sat, Oct 3, 2026");
  assert.equal(formatEventDate(""), null);
});

test("file name: sanitized, format + revision; offline says Last-Synced", () => {
  assert.equal(bracketBackupFileName("Friday Night 9-Ball", true, 146, "latest"), "Compete-Friday-Night-9-Ball-Double-Elim-R146.pdf");
  assert.equal(bracketBackupFileName("Café / “Pro” <Am>: 8-Ball!!", false, 3, "latest"), "Compete-Cafe-Pro-Am-8-Ball-Single-Elim-R3.pdf");
  assert.equal(bracketBackupFileName("../../etc", false, null, "offline"), "Compete-etc-Single-Elim-Last-Synced.pdf");
  assert.equal(bracketBackupFileName("🎱🎱", true, 9, "offline"), "Compete-Tournament-Double-Elim-Last-Synced-R9.pdf");
});

// ══ OFFLINE ══════════════════════════════════════════════════════════════════════════════
test("offline: availability — last synced copy, or disabled with a reason", () => {
  assert.equal(bracketBackupAvailability({ offline: false, status: "cloud", local: null }).kind, "latest");
  assert.equal(bracketBackupAvailability({ offline: false, status: "changed", local: null }).kind, "latest", "online: fetch the newest cloud state");
  const ls = bracketBackupAvailability({ offline: true, status: "offline", local: { revision: 40, savedAt: "2026-10-03T03:58:00.000Z" } });
  assert.equal(ls.kind, "last_synced");
  assert.equal(ls.label, "Download Last Synced Bracket");
  assert.match(ls.detail, /revision #40/);
  const none = bracketBackupAvailability({ offline: true, status: "offline", local: null });
  assert.equal(none.kind, "unavailable");
  assert.equal(none.detail, BRACKET_BACKUP_NO_LOCAL);
  assert.equal(bracketBackupAvailability({ offline: false, status: "offline", local: null }).kind, "unavailable", "held offline");
});

test("offline: the PDF is labelled OFFLINE BACKUP with the local revision + sync time — never 'latest'", () => {
  const synced = new Date(2026, 9, 3, 20, 58);
  const pdf = buildElimBracketPdf(input(8, 8, false, {}, { mode: "offline", revision: 40, lastSyncedAt: synced, generatedAt: new Date(2026, 9, 3, 21, 5) }));
  const text = allText(pdf.bytes);
  assert.ok(text.includes("OFFLINE BACKUP"));
  assert.equal(text.includes("BRACKET BACKUP"), false);
  assert.ok(text.includes("Last synced: Oct 3, 2026 · 8:58 PM · Revision 40"));
  assert.ok(text.some((t) => t.startsWith("Offline backup — last synced copy on this device.")));
  assert.match(pdf.fileName, /Last-Synced-R40\.pdf$/);
});

test("offline: the hook reads only the validated local copy; local state never overwrites cloud", () => {
  const hook = read("src/viewmodels/hooks/use.elim.bracket.backup.ts");
  assert.match(hook, /elimLocalRecoveryService\.read\(tournamentId, ownerId\)/);
  assert.doesNotMatch(hook, /elimLocalRecoveryService\.(save|remove)/);
  assert.match(hook, /if \(availability\.kind === "unavailable"\) return \{ ok: false, message: BRACKET_BACKUP_NO_LOCAL \};/);
  // Online but the request fails with a network error → the local copy, labelled offline.
  assert.match(hook, /if \(!\(toConnectionAwareError\(e\) instanceof ConnectionRequiredError\)\) throw e;\s*src = await readLocal\(\);/);
});

// ══ SAFETY: export only ══════════════════════════════════════════════════════════════════
test("zero tournament writes: the download path only SELECTs; no revision / restore point / audit / activity", () => {
  const hook = read("src/viewmodels/hooks/use.elim.bracket.backup.ts");
  assert.match(hook, /tournamentService\.getTournament\(tournamentId\)/);
  assert.match(hook, /tournamentTableService\.getTables\(tournamentId\)/);
  for (const bad of [/\.update\(/, /\.insert\(/, /\.upsert\(/, /\.delete\(/, /\.rpc\(/, /supabase/, /applyLiveOps|setMatchState|saveQueueSettings|drawBracket|invalidateQueries|setQueryData|tournament_events|logEvent/])
    assert.doesNotMatch(hook, bad, String(bad));
  for (const f of ["src/utils/elim-bracket-pdf.ts", "src/utils/pdf-writer.ts", "src/utils/save-pdf-file.ts", "src/utils/save-pdf-file.native.ts"]) {
    const src = read(f);
    assert.doesNotMatch(src, /supabase|services\/|fetch\(/, `${f} never talks to the backend`);
  }
  const svc = read("src/models/services/tournament.service.ts");
  const get = svc.slice(svc.indexOf("async getTournament(id: number)"), svc.indexOf("async getTournamentsByVenue"));
  assert.match(get, /\.from\("tournaments"\)\s*\.select\(/);
  assert.doesNotMatch(get, /update|insert|rpc/);
  const hub = read("app/(tabs)/admin/manage-tournament/[id].tsx");
  const handler = hub.slice(hub.indexOf("const handleDownloadBracket = async"), hub.indexOf("const handleDownloadBracket = async") + 400);
  assert.doesNotMatch(handler, /hub\.|refreshEvents|runLiveOps|runMatchPatch/);
});

test("no public URL / upload: web downloads a local Blob; native saves via modules already in the binary", () => {
  const web = read("src/utils/save-pdf-file.ts");
  assert.match(web, /new Blob\(\[bytes as BlobPart\], \{ type: "application\/pdf" \}\)/);
  assert.match(web, /URL\.revokeObjectURL\(url\)/);
  const nat = read("src/utils/save-pdf-file.native.ts");
  assert.match(nat, /from "expo-file-system\/legacy"/);
  assert.match(nat, /StorageAccessFramework/);
  assert.match(nat, /Share\.share\(\{ url: uri, title: fileName \}\)/);
  const pkg = JSON.parse(read("package.json"));
  assert.ok(pkg.dependencies["expo-file-system"], "already a dependency (in every native build)");
  for (const dep of ["expo-print", "expo-sharing", "jspdf", "react-native-html-to-pdf", "react-native-share"]) assert.equal(pkg.dependencies[dep], undefined, dep);
});

test("Actions: Download Latest Bracket sits under Recovery & History, elimination only", () => {
  const modal = read("src/views/components/tournament/live/TournamentActionsModal.tsx");
  const rec = modal.indexOf('key: "recovery"');
  const bak = modal.indexOf('key: "backup"');
  const fin = modal.indexOf('key: "finish"');
  assert.ok(rec > 0 && rec < bak && bak < fin);
  const hub = read("app/(tabs)/admin/manage-tournament/[id].tsx");
  assert.match(hub, /backup=\{\s*isChip\s*\? undefined/);
  assert.match(hub, /disabledTag: !hub\.bracket \? "No bracket yet" : "No offline copy"/);
});

// ══ PDF file structure ═══════════════════════════════════════════════════════════════════
test("valid PDF: header, xref offsets point at their objects, page count, trailer", () => {
  const pdf = buildElimBracketPdf(input(32, 30, true));
  const raw = Array.from(pdf.bytes, (b) => String.fromCharCode(b)).join("");
  assert.ok(raw.startsWith("%PDF-1.4\n"));
  assert.ok(raw.trimEnd().endsWith("%%EOF"));
  const startxref = Number(/startxref\n(\d+)/.exec(raw)![1]);
  assert.ok(raw.slice(startxref).startsWith("xref\n"));
  const entries = [...raw.slice(startxref).matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
  entries.forEach((off, i) => assert.ok(raw.slice(off).startsWith(`${i + 1} 0 obj`), `object ${i + 1}`));
  assert.ok(raw.includes(`/Count ${pdf.pages.length}`));
  for (const m of raw.matchAll(/<< \/Length (\d+) >>\nstream\n/g)) {
    const start = m.index! + m[0].length;
    assert.equal(raw.slice(start + Number(m[1]), start + Number(m[1]) + 10), "\nendstream", "stream length exact");
  }
});

test("text encoding: accents kept, unsupported glyphs become ?, long names shortened (not shrunk)", () => {
  assert.deepEqual(toWinAnsi("José"), [74, 111, 115, 0xe9]);
  assert.deepEqual(toWinAnsi("Łukasz"), toWinAnsi("Lukasz"), "accent stripped when outside Latin-1");
  assert.equal(toWinAnsi("🎱")[0], 63);
  const long = "Bartholomew Maximilian Featherstonehaugh-Worthington";
  const fit = fitText(long, 9, 120);
  assert.ok(fit.endsWith("…") && textWidth(fit, 9) <= 120);
  assert.equal(bytesToBase64(new Uint8Array([77, 97, 110])), "TWFu");
  assert.equal(bytesToBase64(new Uint8Array([77, 97])), "TWE=");
});

test("layout: sub-trees never straddle pages; later columns centered on their feeders", () => {
  for (const [size, double] of [[64, false], [64, true], [128, true]] as const) {
    const graph = buildBracketGraph(size, double);
    const pages = layoutElimBracket(graph, double);
    const where = new Map<string, number>();
    pages.forEach((p, i) => p.placed.forEach((x) => where.set(x.id, i)));
    const sameBand = (a: string, b: string) => {
      const pa = pages[where.get(a)!];
      const pb = pages[where.get(b)!];
      return pa.title.split(" · Part")[0] === pb.title.split(" · Part")[0];
    };
    for (const n of graph) {
      for (const ref of [n.slot1, n.slot2]) {
        if (ref.kind !== "winner") continue;
        const src = graph.find((g) => g.id === ref.matchId)!;
        if (src.side !== n.side || !sameBand(src.id, n.id)) continue;
        assert.equal(where.get(src.id), where.get(n.id), `${src.id} → ${n.id} on one page (size ${size})`);
      }
    }
  }
});

// ══ Refinement: finals grouping, races, styling, payouts, player list, In Field ══════════
const regsFor = (players: number, extra: BackupRegistration[] = []): BackupRegistration[] => [
  ...Array.from({ length: players }, (_, i) => ({
    id: i + 1,
    status: "checked_in",
    paid_entry: i % 4 !== 3,
    paid_side_pots: i % 2 ? ["Calcutta"] : [],
    fargo_rating: 500 + i,
    name: `P${i + 1}`,
  })),
  ...extra,
];
const T_PRIZE: any = {
  entry_fee: 20,
  added_money: 50,
  side_pots: [{ name: "Calcutta", amount: 10 }],
  live_settings: {
    bracket: { players: 9 },
    prizePool: { entryPlaces: [{ percent: 60 }, { percent: 30 }, { percent: 10 }], sidePots: [{ name: "Calcutta", places: [{ percent: 70 }, { percent: 30 }] }], includeAddedMoney: true },
    fees: [{ name: "Green", amount: 5, enabled: true }, { name: "Off", amount: 3, enabled: false }],
  },
};

test("page packing: small events share pages in order; the summary always starts on its own page", () => {
  // 8-player double: Winners + Losers + Championship all on page 1, then the summary.
  const d8 = layoutElimBracket(buildBracketGraph(8, true), true);
  assert.equal(d8.length, 1);
  assert.deepEqual(d8[0].blocks.map((b) => b.block.section), ["winners", "losers", "championship"]);
  // 16-slot double (the 9-player example): page 1 Winners through the Winners Final; page 2 Losers
  // through the Losers Final + Grand Final / Reset.
  const d16 = layoutElimBracket(buildBracketGraph(16, true), true);
  assert.deepEqual(d16.map((p) => p.blocks.map((b) => b.block.section)), [["winners"], ["losers", "losers", "championship"]]);
  assert.deepEqual(d16[0].blocks[0].block.columns, ["Winners Round 1", "Winners Round 2", "Winners Semifinals", "Winners Final"]);
  assert.equal(d16[1].title, "LOSERS BRACKET · Rounds 1–6 · CHAMPIONSHIP");
  // Blocks never overlap and stay inside the page.
  for (const l of [...d8, ...d16, ...layoutElimBracket(buildBracketGraph(64, true), true)]) {
    for (const p of l.placed) assert.ok(p.top >= 98 && p.top + 42 <= 562, p.id);
    l.blocks.forEach((b, i) => i > 0 && assert.ok(b.top > l.blocks[i - 1].top));
  }
  const s16 = buildElimBracketPdf(input(16, 16, false));
  assert.deepEqual(s16.pages.map((p) => p.section), ["winners", "summary"]);
  assert.equal(s16.pages[1].title, "TOURNAMENT SUMMARY");
});

test("large brackets: 32 / 64 double paginate by section, Winners Final with the winners side", () => {
  const t = (n: number) => layoutElimBracket(buildBracketGraph(n, true), true).map((p) => p.title);
  assert.deepEqual(t(32), [
    "WINNERS BRACKET · Rounds 1–3 · Part 1 of 2",
    "WINNERS BRACKET · Rounds 1–3 · Part 2 of 2",
    "WINNERS BRACKET · Rounds 4–5",
    "LOSERS BRACKET · Rounds 1–4",
    "LOSERS BRACKET · Rounds 5–8 · CHAMPIONSHIP",
  ]);
  assert.deepEqual(t(64), [
    "WINNERS BRACKET · Rounds 1–4 · Part 1 of 4",
    "WINNERS BRACKET · Rounds 1–4 · Part 2 of 4",
    "WINNERS BRACKET · Rounds 1–4 · Part 3 of 4",
    "WINNERS BRACKET · Rounds 1–4 · Part 4 of 4",
    "WINNERS BRACKET · Rounds 5–6",
    "LOSERS BRACKET · Rounds 1–4 · Part 1 of 2",
    "LOSERS BRACKET · Rounds 1–4 · Part 2 of 2",
    "LOSERS BRACKET · Rounds 5–10 · CHAMPIONSHIP",
  ]);
});

test("no lone trailing round: 5 rounds band as 3 + 2 (32-player double winners side)", () => {
  const blocks = elimBracketBlocks(buildBracketGraph(32, true), true).filter((b) => b.section === "winners");
  assert.deepEqual([...new Set(blocks.map((b) => b.columns.length))].sort(), [2, 3]);
});

test("race beside player names: 'Name (race)'; BYE shows only BYE", () => {
  const graph = buildBracketGraph(8, false);
  const seeds = [
    { registrationId: 1, name: "Tyelerr", fargo: 560, raceOverride: 5 },
    { registrationId: 2, name: "Player", fargo: 500, raceOverride: 4 },
    { registrationId: 3, name: "Solo", fargo: 520 },
    null,
    ...Array.from({ length: 4 }, (_, i) => ({ registrationId: 10 + i, name: `Q${i}`, fargo: 500 })),
  ];
  const matches = buildLiveMatches({ graph, seeds, players: 7, bracketSize: 8 } as any, {}, [], "9-ball", { ...CFG, fixedWinners: 6 } as any);
  const t = pdfStrings(buildElimBracketPdf({ ...input(8, 7, false), graph, matches }).bytes)[0].map((s) => s.text);
  const w1 = matches.find((m) => m.id === "W1M1")!;
  assert.ok(w1.p1Race != null && w1.p2Race != null);
  const i1 = t.indexOf("Tyelerr");
  assert.equal(t[i1 + 1], ` (${w1.p1Race})`, "race right after the name");
  const i2 = t.indexOf("Player");
  assert.equal(t[i2 + 1], ` (${w1.p2Race})`);
  assert.ok(matches.find((m) => m.bye));
  assert.ok(t.includes("BYE"));
  const iSolo = t.indexOf("Solo");
  assert.ok(iSolo >= 0);
  assert.equal(String(t[iSolo + 1]).startsWith(" ("), false, "no race printed in a bye match");
  assert.equal(t.some((s) => /^BYE \(/.test(s)), false, "never a race for BYE");
});

test("played matches: winner bold + green score, loser muted + red score; readable in grayscale", () => {
  const inp = input(8, 8, false, { W1M1: { status: "completed", winner: 1, p1Score: 7, p2Score: 3, result: "normal" } });
  const s = pdfStrings(buildElimBracketPdf(inp).bytes)[0];
  const win = s.find((x) => x.text === "P1")!;
  const lose = s.find((x) => x.text === "P2")!;
  assert.equal(win.font, "F2", "winner bold");
  assert.equal(lose.font, "F1");
  assert.equal(win.color, "0.08 g", "winner near-black");
  assert.equal(lose.color, "0.5 g", "loser muted grey");
  const sw = s.find((x) => x.text === "7")!;
  const sl = s.find((x) => x.text === "3")!;
  assert.match(sw.color, / rg$/);
  assert.match(sl.color, / rg$/);
  assert.notEqual(sw.color, sl.color);
  assert.equal(sw.font, "F2", "winner score bold (still distinct without color)");
  const unplayed = s.find((x) => x.text === "P5")!;
  assert.equal(unplayed.color, "0.18 g", "names soft dark grey, not pure black");
});

test("payouts: same math as the Payouts tab (fees, added money, side pot entrants, places)", () => {
  const { matches } = setup(16, 9, true);
  const regs = regsFor(9, [{ id: 99, status: "no_show", paid_entry: true, paid_side_pots: ["Calcutta"], fargo_rating: null, name: "NS" }]);
  const pay = buildBackupPayouts(T_PRIZE, regs, matches);
  assert.equal(pay.configured, true);
  assert.equal(pay.entry!.pool, 9 * (20 - 5) + 50, "entry − enabled fees, plus added money");
  assert.deepEqual(pay.entry!.places.map((p) => p.amount), [115, 55, 15]);
  assert.equal(pay.sidePots[0].pool, 4 * 10, "only active entrants who bought in (no-show excluded)");
  assert.deepEqual(pay.sidePots[0].places.map((p) => p.name), [null, null], "side pots stay blank until the event is decided");
  assert.equal(buildBackupPayouts({ ...T_PRIZE, live_settings: { ...T_PRIZE.live_settings, prizePool: undefined } }, [], matches).configured, false);
  const text = allText(buildElimBracketPdf({ ...input(16, 9, true), payouts: pay }).bytes);
  for (const s of ["Payouts", "Prize Pool", "$185", "$115", "$55", "$15", "Side pot · Calcutta", "$40"]) assert.ok(text.some((t) => t.includes(s)), s);
  assert.equal(formatMoney(1234.5), "$1,234.50");
  assert.equal(formatMoney(15), "$15");
});

test("player list: entry / side pot checkboxes, Fargo, participation status; Champion + Out places", () => {
  const ms = playAll(8, 8, true);
  delete ms.GF2;
  const inp = input(8, 8, true, ms);
  const roster = buildBackupRoster(
    regsFor(8, [
      { id: 50, status: "approved", paid_entry: false, paid_side_pots: [], fargo_rating: 610, name: "Late Larry" },
      { id: 51, status: "no_show", paid_entry: false, paid_side_pots: [], fargo_rating: null, name: "Nora" },
      { id: 52, status: "cancelled", paid_entry: false, paid_side_pots: [], fargo_rating: null, name: "Gone" },
    ]),
    inp.matches,
    { seeds: Array.from({ length: 8 }, (_, i) => ({ registrationId: i + 1, name: `P${i + 1}`, fargo: 500 })) },
  );
  assert.equal(roster[0].status, "Champion");
  assert.equal(roster[0].name, bracketChampion(inp.matches, true));
  assert.ok(roster.some((r) => r.status === "Out · 2nd"));
  assert.ok(roster.some((r) => r.status === "Out · 3rd"));
  assert.deepEqual(roster.slice(-2).map((r) => r.status), ["Registered", "No Show"]);
  assert.equal(roster.some((r) => r.name === "Gone"), false, "removed entries are not listed");
  const text = allText(buildElimBracketPdf({ ...inp, roster, sidePotNames: ["Calcutta"] }).bytes);
  for (const s of ["Players (10)", "Name", "Entry", "Side Pot", "Fargo", "Status", "Champion", "Late Larry", "610"]) assert.ok(text.includes(s), s);
  const live = buildBackupRoster(regsFor(8), input(8, 8, false).matches, { seeds: [] });
  assert.ok(live.every((r) => r.status === "In Field"));
  assert.ok(allText(buildElimBracketPdf({ ...input(8, 8, false), roster: live }).bytes).includes("In Field"));
});

test("large field: the summary flows onto continuation pages with the table header repeated", () => {
  const inp = input(64, 64, true);
  const roster = buildBackupRoster(regsFor(64), inp.matches, { seeds: [] });
  const pdf = buildElimBracketPdf({ ...inp, roster, payouts: buildBackupPayouts(T_PRIZE, regsFor(64), inp.matches) });
  assert.equal(pdf.pages[pdf.pages.length - 1].title, "TOURNAMENT SUMMARY (CONTINUED)");
  const perPage = pdfStrings(pdf.bytes);
  const firstSummary = pdf.pages.findIndex((p) => p.section === "summary");
  assert.ok(perPage[firstSummary].some((s) => s.text === "Summary"), "summary starts on its own page after the bracket");
  assert.ok(pdf.pages.slice(0, firstSummary).every((p) => p.section !== "summary"));
  const names = perPage.flat().map((s) => s.text).filter((t) => /^P\d+$/.test(t));
  for (let i = 1; i <= 64; i++) assert.ok(names.includes(`P${i}`), `P${i} listed`);
  assert.ok(perPage[perPage.length - 1].some((s) => s.text === "Fargo"), "header repeated on the continuation page");
});

test("offline: roster travels in the local copy (optional field; older copies stay valid)", () => {
  const row: any = { id: 7, tournament_format: "double-elimination", status: "active", live_state: "in_progress", live_revision: 3, live_settings: { bracket: { graph: [{ id: "W1M1" }] } } };
  const now = new Date("2026-10-02T18:00:00.000Z");
  const owner = "00000000-0000-0000-0000-0000000000aa";
  const rec = buildElimLocalRecord(row, [], owner, now, regsFor(2))!;
  assert.equal(rec.registrations!.length, 2);
  const v = validateElimLocalRecord(JSON.parse(JSON.stringify(rec)), { tournamentId: 7, ownerId: owner }, now);
  assert.equal(v.ok && v.record.registrations!.length, 2);
  const old = { ...rec } as any;
  delete old.registrations;
  const v2 = validateElimLocalRecord(old, { tournamentId: 7, ownerId: owner }, now);
  assert.equal(v2.ok, true);
  assert.equal(v2.ok && v2.record.registrations, null);
  const v3 = validateElimLocalRecord({ ...rec, registrations: "junk" }, { tournamentId: 7, ownerId: owner }, now);
  assert.equal(v3.ok && v3.record.registrations, null, "a malformed roster is ignored, never trusted");
  const text = allText(buildElimBracketPdf({ ...input(8, 8, false), mode: "offline", roster: null }).bytes);
  assert.ok(text.some((t) => t.startsWith("Player list isn't included in this offline copy")));
  assert.match(read("src/viewmodels/hooks/use.elim.offline.ts"), /buildElimLocalRecord\(cloud, tables \?\? null, ownerId, new Date\(\), roster\)/);
});

test("download still reads only: registrations via a SELECT; payouts / roster are pure", () => {
  const hook = read("src/viewmodels/hooks/use.elim.bracket.backup.ts");
  assert.match(hook, /registrationService\.getRegistrations\(tournamentId\)/);
  const svc = read("src/models/services/registration.service.ts");
  const get = svc.slice(svc.indexOf("async getRegistrations("), svc.indexOf("async getRegistrationCounts("));
  assert.match(get, /\.select\(/);
  assert.doesNotMatch(get, /update|insert|rpc|delete/);
  assert.doesNotMatch(read("src/utils/elim-bracket-summary.ts"), /supabase|services\/|fetch\(/);
});

test("'Ready' → 'In Field' only where it means 'in the tournament field' (elimination roster)", () => {
  const hub = read("app/(tabs)/admin/manage-tournament/[id].tsx");
  assert.match(hub, /ready: \{ label: "In Field", color: COLORS\.success \}/, "roster status pill + roster export");
  assert.match(hub, /\{ label: "In Field", value: "ready" \}/, "roster filter");
  assert.match(hub, /\{ label: "In Field", n: statusCounts\.ready, color: DISPLAY_META\.ready\.color \}/, "summary breakdown");
  assert.match(hub, /short: "In Field", n: statusCounts\.ready/, "count chips");
  assert.match(hub, /✓ In Field<\/Text>/, "player card state");
  // Unchanged: actions and match-level readiness.
  assert.match(hub, /"Undo Ready"/);
  assert.match(hub, /Assign Ready Matches/);
  assert.match(hub, /You need at least 2 Ready players/);
  assert.match(read("src/views/components/tournament/live/QueueView.tsx"), /Ready \/ Waiting/);
  assert.match(read("src/views/components/tournament/live/EliminationDashboard.tsx"), /Waiting \/ Ready/);
  // Chip unchanged (its roster already shows "In Field").
  assert.match(read("src/utils/registration-lifecycle.ts"), /ready: \{ label: "Ready", color: COLORS\.success \}/);
});
