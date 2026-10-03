// src/utils/__tests__/chip-backup.test.ts
// Run: npx tsx --test src/utils/__tests__/chip-backup.test.ts
// Chip Tournament "Download Tournament Backup" (printable operating packet) + the one-time
// post-start backup prompt for Chip / Single / Double. States are built by driving the REAL
// Chip engine (fixtures/chip-backup-fixture.ts); the PDF is read back to check what a TD sees.
/// <reference types="node" />

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildChipEvent } from "./fixtures/chip-backup-fixture";
import { beginShuffle, recordWinner, startPendingMatch } from "../../models/services/chip.engine";
import { ChipState } from "../../models/types/chip.types";
import {
  ACTIVITY_ROWS,
  CONTINUATION_ROWS,
  QUEUE_MIN_BLANK_ROWS,
  TABLE_ROWS,
  activeTables,
  buildChipBackupPdf,
  chipBackupEntrants,
  chipBackupFileName,
  chipBackupNumbers,
  chipBackupStatus,
  chipBoxMarks,
  chipInstructions,
  chipOperatingMode,
  chipTableNow,
  queueLayout,
  startingChipsText,
  chipBackupAvailability,
  CHIP_BACKUP_NO_LOCAL_NATIVE,
  CHIP_BACKUP_NO_LOCAL_WEB,
} from "../chip-backup-pdf";
import { backupAgeText } from "../../models/services/backup-history.service";

const ROOT = join(__dirname, "..", "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8").replace(/^﻿/, "");
const GEN = new Date(2026, 9, 3, 20, 42);
const pdfFor = (chip: ChipState, extra: Partial<Parameters<typeof buildChipBackupPdf>[0]> = {}) =>
  buildChipBackupPdf({ tournamentName: "Friday Night Chips", tournamentDate: "2026-10-03", chip, version: 37, mode: "latest", generatedAt: GEN, ...extra });

const WIN: Record<number, string> = { 0x85: "…", 0x96: "–", 0x97: "—" };
const pageTexts = (bytes: Uint8Array): string[][] => {
  const raw = Array.from(bytes, (b) => String.fromCharCode(b)).join("");
  const pages = raw.split(/\nendstream/).slice(0, -1).map((c) => c.slice(c.lastIndexOf("stream\n") + 7));
  const un = (s: string) =>
    s.replace(/\\([0-7]{3}|[()\\])/g, (_, g: string) => (g.length === 3 ? WIN[parseInt(g, 8)] ?? String.fromCharCode(parseInt(g, 8)) : g));
  return pages.map((p) => [...p.matchAll(/Td \(((?:\\.|[^\\)])*)\) Tj/g)].map((m) => un(m[1])));
};

// ══ PLAYER TRACKER ═══════════════════════════════════════════════════════════════════════
test("player numbers: the field in entry order (#1…), stable, one number per team", () => {
  const s = buildChipEvent({ players: 16, tables: 4, results: 10 });
  const num = chipBackupNumbers(s);
  const order = [...s.entries].filter((e) => e.checkedIn).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  order.forEach((e, i) => assert.equal(num.get(e.id), i + 1));
  assert.deepEqual(chipBackupNumbers(buildChipEvent({ players: 16, tables: 4, results: 25 })), num, "same numbers in a later backup");
  const d = buildChipEvent({ players: 8, tables: 2, doubles: true, results: 4 });
  assert.equal(chipBackupEntrants(d).length, 8, "a team is ONE entrant");
  const t1 = chipBackupEntrants(d)[0];
  const text = pageTexts(pdfFor(d).bytes)[0];
  assert.ok(text.includes(`${t1.p1Name} / ${t1.p2Name}`), "team shows both names");
  assert.ok(text.includes(String(t1.teamFargo)), "combined team Fargo");
  assert.ok(text.includes("Teams"));
});

test("tracker: names, Fargo, starting / current chips, W-L, live status in the Chip UI's terms", () => {
  const s = buildChipEvent({ players: 8, tables: 3, results: 7 });
  const text = pageTexts(pdfFor(s).bytes)[0];
  for (const e of chipBackupEntrants(s)) {
    assert.ok(text.includes(e.p1Name), e.p1Name);
    assert.ok(text.includes(String(e.p1Fargo)));
    assert.ok(text.includes(`${e.wins}-${e.losses}`));
    const st = chipBackupStatus(s, e);
    assert.ok(text.includes(st), st);
    assert.match(st, /^(Playing · Table \d+|Up Next|Waiting · Queue #\d+|Waiting|Eliminated|Winner)$/);
  }
  assert.ok(text.includes("PLAYER LOOKUP & CHIP TRACKER") && text.includes("Starting chips") && text.includes(startingChipsText(s)));
  assert.equal(startingChipsText(s), "3–5 by Fargo (under 500: 5 · 500–599: 4 · 600+: 3)");
});

test("chip boxes: one per STARTING chip, lost chips crossed (vector X, not color)", () => {
  assert.deepEqual(chipBoxMarks(5, 5), { total: 5, used: 0 });
  assert.deepEqual(chipBoxMarks(5, 3), { total: 5, used: 2 });
  assert.deepEqual(chipBoxMarks(4, 0), { total: 4, used: 4 }, "eliminated: every box crossed");
  assert.deepEqual(chipBoxMarks(3, 4), { total: 4, used: 0 }, "a buy-back adds a box");
  const s = buildChipEvent({ players: 8, tables: 3, results: 7 });
  const raw = Array.from(pdfFor(s).bytes, (b) => String.fromCharCode(b)).join("");
  const lost = chipBackupEntrants(s).reduce((a, e) => a + chipBoxMarks(e.startChips, e.chips).used, 0);
  assert.ok(lost > 0);
  const page1 = raw.slice(raw.indexOf("stream\n"), raw.indexOf("endstream"));
  const xLines = (page1.match(/1 w 0\.1 G [\d.]+ [\d.]+ m [\d.]+ [\d.]+ l S/g) ?? []).length;
  assert.equal(xLines, lost * 2, "each lost chip = one X (two strokes)");
});

test("elimination status shows on the tracker", () => {
  let s = buildChipEvent({ players: 4, tables: 2, results: 0 });
  // Play until someone is eliminated.
  for (let k = 0; k < 40 && !s.entries.some((e) => e.status === "eliminated"); k++) {
    const m = s.matches.find((x) => x.status === "in_progress");
    if (!m) break;
    s = recordWinner(s, m.id, m.aId);
    s = buildChipEventContinue(s);
  }
  const out = s.entries.find((e) => e.status === "eliminated");
  assert.ok(out, "someone eliminated");
  assert.equal(chipBackupStatus(s, out!), "Eliminated");
  assert.ok(pageTexts(pdfFor(s).bytes)[0].includes("Eliminated"));
});
// start any announced matchups (winner-stays challengers wait for the TD)
const buildChipEventContinue = (s: ChipState) => {
  let n = s;
  for (const t of n.tables) if (t.pendingChallengerId && !t.matchId) n = startPendingMatch(n, t.id);
  return n;
};

// ══ QUEUE ════════════════════════════════════════════════════════════════════════════════
test("queue: current order prefilled (front = spot 1), then 40+ blank rows on queue sheets", () => {
  const s = buildChipEvent({ players: 32, tables: 8, results: 30 });
  const num = chipBackupNumbers(s);
  const pdf = pdfFor(s);
  const qi = pdf.pages.findIndex((p) => p.kind === "queue");
  const q = pageTexts(pdf.bytes)[qi];
  const want = s.queue.map((id) => `#${num.get(id)}`);
  const got = q.filter((t) => /^#\d+$/.test(t));
  assert.deepEqual(got, want.slice(0, got.length), "queue order exactly");
  assert.ok(q.includes("1") && q.includes(`Current queue (front = next up) · ${s.queue.length} waiting`));
  const lay = queueLayout(s.queue.length);
  assert.ok(lay.blank >= QUEUE_MIN_BLANK_ROWS && QUEUE_MIN_BLANK_ROWS >= 40);
  assert.equal(pdf.pages.filter((p) => p.kind === "queue").length, lay.total / lay.perPage);
});

// ══ TABLES ═══════════════════════════════════════════════════════════════════════════════
test("table worksheets: every active table, current matchup prefilled, 12 future rows, numbers not names", () => {
  const s = buildChipEvent({ players: 16, tables: 4, results: 12 });
  const num = chipBackupNumbers(s);
  const pdf = pdfFor(s);
  const texts = pageTexts(pdf.bytes);
  const tablePages = pdf.pages.map((p, i) => (p.kind === "tables" ? texts[i] : null)).filter((x): x is string[] => !!x);
  assert.equal(tablePages.length, Math.ceil(activeTables(s).length / 2), "two tables per page");
  const all = tablePages.flat();
  for (const t of activeTables(s)) {
    assert.ok(all.includes(t.label.toUpperCase()), t.label);
    const now = chipTableNow(s, t, num);
    if (now.p1) assert.ok(all.includes(now.p1));
    if (now.p2) assert.ok(all.includes(now.p2));
    assert.ok(all.some((x) => x.startsWith(now.text)), now.text);
  }
  assert.ok(all.includes("Now"), "live match row labelled Now");
  assert.ok(TABLE_ROWS - 1 >= 12, "at least 12 future-match rows per table");
  for (const e of chipBackupEntrants(s)) assert.equal(all.includes(e.p1Name), false, "worksheets use numbers, not names");
  for (const h of ["P1 # (stays)", "P2 # (challenger)", "Winner #", "Loser #", "Chips left", "Chip off", "Queue spot", "Next challenger #"]) assert.ok(all.includes(h), h);
});

test("announced (not started) matchup prefills as Next; holder-only and open tables read correctly", () => {
  const s = buildChipEvent({ players: 8, tables: 3, results: 0 });
  const num = chipBackupNumbers(s);
  const live = s.matches.find((m) => m.status === "in_progress")!;
  const after = recordWinner(s, live.id, live.aId); // winner stays; next challenger is announced, not started
  const t = after.tables.find((x) => x.id === live.tableId)!;
  const now = chipTableNow(after, t, num);
  assert.equal(now.kind, "next");
  assert.equal(now.p1, `#${num.get(live.aId)}`, "the winner stays as P1");
  const holder = { ...t, pendingChallengerId: null };
  assert.equal(chipTableNow(after, holder, num).kind, "holder");
  assert.equal(chipTableNow(after, { ...holder, holderId: null }, num).text, "Open");
  const texts = pageTexts(pdfFor(after).bytes).flat();
  assert.ok(texts.includes("Next"));
});

test("blank continuation sheet + activity log + instructions close the packet", () => {
  const pdf = pdfFor(buildChipEvent({ players: 8, tables: 3, results: 3 }));
  assert.deepEqual(pdf.pages.slice(-3).map((p) => p.kind), ["continuation", "activity", "instructions"]);
  assert.ok(CONTINUATION_ROWS >= 15 && CONTINUATION_ROWS <= 30, `${CONTINUATION_ROWS} continuation rows`);
  assert.ok(ACTIVITY_ROWS >= 28);
  const texts = pageTexts(pdf.bytes);
  assert.ok(texts[pdf.pages.length - 3].includes("TABLE: ________________"));
  for (const h of ["Time", "Table", "Winner #", "Loser #", "Chips left", "Queue spot", "Notes"]) assert.ok(texts[pdf.pages.length - 2].includes(h), h);
  assert.ok(texts[pdf.pages.length - 1].includes("HOW TO USE THIS BACKUP"));
});

test("large fields: 64 players / 16 tables paginate (no shrinking); every entrant + table present", () => {
  const s = buildChipEvent({ players: 64, tables: 16, results: 60 });
  const pdf = pdfFor(s);
  const all = pageTexts(pdf.bytes).flat();
  for (const e of chipBackupEntrants(s)) assert.ok(all.includes(e.p1Name), e.p1Name);
  assert.equal(pdf.pages.filter((p) => p.kind === "tables").length, 8);
  assert.ok(pdf.pages.filter((p) => p.kind === "lookup").length >= 2);
  assert.ok(all.includes("PLAYER LOOKUP (CONTINUED)"));
});

// ══ MODES / INSTRUCTIONS ═════════════════════════════════════════════════════════════════
test("instructions follow the CURRENT mode: normal, Shuffle round, reshuffle pending, finals, finished", () => {
  const normal = buildChipEvent({ players: 8, tables: 3, results: 2 });
  assert.equal(chipOperatingMode(normal), "normal");
  assert.ok(chipInstructions(normal).some((l) => l.includes("no immediate rematch on the same table")));
  const shuffle = buildChipEvent({ players: 8, tables: 3, results: 2, shuffle: true });
  assert.equal(chipOperatingMode(shuffle), "shuffle_round");
  assert.ok(chipInstructions(shuffle).some((l) => l.startsWith("Shuffle Mode is ON")));
  assert.equal(chipInstructions(shuffle).some((l) => l.includes("no immediate rematch on the same table")), false);
  const pending = beginShuffle(normal);
  assert.equal(chipOperatingMode(pending), "reshuffle_pending");
  assert.ok(chipInstructions(pending).some((l) => l.startsWith("A reshuffle is in progress")));
  const finals = { ...normal, entries: normal.entries.map((e, i) => (i < 6 ? { ...e, status: "eliminated" as const, chips: 0 } : e)) };
  assert.equal(chipOperatingMode(finals), "finals");
  const done = { ...normal, finishedAt: new Date().toISOString(), winnerId: normal.entries[0].id };
  assert.equal(chipOperatingMode(done), "finished");
  assert.equal(chipBackupStatus(done, normal.entries[0]), "Winner");
  assert.ok(pageTexts(pdfFor(shuffle).bytes).flat().includes("Current mode: Shuffle Mode (rounds — everyone plays once per round)"));
});

// ══ OFFLINE ══════════════════════════════════════════════════════════════════════════════
test("offline: last-synced web copy labelled as such; no copy → disabled with a reason", () => {
  assert.equal(chipBackupAvailability({ offline: false, hasLocal: false, native: false }).kind, "latest");
  const ls = chipBackupAvailability({ offline: true, hasLocal: true, native: false });
  assert.deepEqual([ls.kind, ls.label], ["last_synced", "Download Last Synced Backup"]);
  const web = chipBackupAvailability({ offline: true, hasLocal: false, native: false });
  assert.equal(web.kind === "unavailable" && web.reason, CHIP_BACKUP_NO_LOCAL_WEB);
  const nat = chipBackupAvailability({ offline: true, hasLocal: false, native: true });
  assert.equal(nat.kind === "unavailable" && nat.reason, CHIP_BACKUP_NO_LOCAL_NATIVE);
  const s = buildChipEvent({ players: 8, tables: 3, results: 3 });
  const off = pageTexts(pdfFor(s, { mode: "offline", lastSyncedAt: new Date(2026, 9, 3, 20, 31), unsyncedOfflineChanges: true }).bytes)[0];
  assert.ok(off.includes("OFFLINE BACKUP"));
  assert.equal(off.includes("TOURNAMENT BACKUP"), false);
  assert.ok(off.includes("Last synced: Oct 3, 2026 · 8:31 PM · Version 37"));
  assert.ok(off.some((t) => t.includes("changes made offline that Compete has not confirmed yet")));
  const on = pageTexts(pdfFor(s).bytes)[0];
  assert.ok(on.includes("TOURNAMENT BACKUP") && on.includes("Revision 37"));
  assert.equal(chipBackupFileName("Friday Night Chips", 37, "offline"), "Compete-Friday-Night-Chips-Chip-Backup-Last-Synced-R37.pdf");
  assert.equal(chipBackupFileName("Café Chips!", 5, "latest"), "Compete-Cafe-Chips-Chip-Backup-R5.pdf");
});

test("offline source: the validated local recovery snapshot only; online: a fresh cloud read", () => {
  const hook = read("src/viewmodels/hooks/use.chip.backup.ts");
  assert.match(hook, /store\.getLatestSnapshot\(tournamentId, owner\)/, "validated newest snapshot (isValidSnapshot inside)");
  assert.match(hook, /await chipService\.load\(tournamentId\)/);
  assert.match(hook, /finished \? reconcileCompleted\(b\.chip\) : healLoadedChip\(b\.chip\)/, "same board the Chip screen shows");
  assert.match(hook, /if \(!\(toConnectionAwareError\(e\) instanceof ConnectionRequiredError\)\) throw e;\s*src = await readLocal\(\);/);
});

// ══ ZERO WRITE ═══════════════════════════════════════════════════════════════════════════
test("zero tournament writes: export reads only; the PDF builder never mutates the state", () => {
  const hook = read("src/viewmodels/hooks/use.chip.backup.ts");
  for (const bad of [/\.update\(|\.insert\(|\.upsert\(|\.delete\(/, /chipService\.(save|start|markStarted|finish)/, /saveExplicit|persist|vm\./, /tournament_events|chip_events/])
    assert.doesNotMatch(hook, bad, String(bad));
  const svc = read("src/models/services/chip.service.ts");
  const load = svc.slice(svc.indexOf("async load(id: number"), svc.indexOf("return { tournament: t as Tournament, chip, version, results };"));
  assert.doesNotMatch(load, /\.update\(|\.insert\(|\.upsert\(|\.delete\(/, "chipService.load only selects");
  assert.deepEqual([...load.matchAll(/rpc\("([a-z_]+)"/g)].map((m) => m[1]), ["get_tournament_team_roster"], "only the read-only roster RPC");
  assert.doesNotMatch(read("src/utils/chip-backup-pdf.ts"), /supabase|services\/chip\.service|fetch\(/);
  const s = buildChipEvent({ players: 16, tables: 4, results: 10 });
  const before = JSON.stringify(s);
  pdfFor(s);
  assert.equal(JSON.stringify(s), before, "state untouched (version, queue, tables, matches, events)");
});

// ══ START PROMPT ═════════════════════════════════════════════════════════════════════════
test("start prompt: shown only by a successful Start (Single / Double / Chip), once, never auto-downloads", () => {
  const hub = read("app/(tabs)/admin/manage-tournament/[id].tsx");
  const sets = [...hub.matchAll(/setStartBackupPrompt\("(elim|chip)"\)/g)].map((m) => m[1]);
  assert.deepEqual(sets.sort(), ["chip", "elim"], "exactly two triggers");
  assert.match(hub, /\.start\(\)\s*\.then\(\(\) => setStartBackupPrompt\("elim"\)\)\s*\.catch\(/, "Single/Double: after hub.start() resolves");
  assert.match(hub, /onStarted=\{\(\) => \{\s*hub\.setLiveStateLocal\("in_progress"\);\s*setStartBackupPrompt\("chip"\);/, "Chip: the VM's confirmed start");
  // Each trigger sits inside a start handler — never an effect (load / refresh / reopen).
  for (const m of hub.matchAll(/setStartBackupPrompt\("(elim|chip)"\)/g)) {
    const before = hub.slice(Math.max(0, m.index! - 160), m.index!);
    assert.ok(/\.start\(\)|onStarted=/.test(before), `trigger ${m[1]} follows a start`);
    assert.doesNotMatch(before, /useEffect\(/);
  }
  const chipScreen = read("src/views/screens/admin/chip/chip-manage.screen.tsx");
  assert.match(chipScreen, /const okStarted = await vm\.start\(\);\s*if \(okStarted\) \{[\s\S]*?if \(!embedded\) setStartPrompt\(true\);/, "standalone Chip: same rule");
  assert.equal((chipScreen.match(/setStartPrompt\(true\)/g) ?? []).length, 1);
  const modal = read("src/views/components/tournament/live/BackupPromptModal.tsx");
  assert.doesNotMatch(modal, /useEffect/, "the modal never triggers a download by itself");
  assert.match(modal, /Not Now/);
  assert.match(modal, /You can download an updated backup anytime from Actions\./);
});

test("start prompt: Not Now closes; a failed backup never undoes the start", () => {
  const hub = read("app/(tabs)/admin/manage-tournament/[id].tsx");
  assert.match(hub, /onDismiss=\{\(\) => setStartBackupPrompt\(null\)\}/);
  const h = hub.slice(hub.indexOf("const handleStartBackupDownload"), hub.indexOf("const handleStartBackupDownload") + 900);
  assert.match(h, /The tournament has started\. You can try again anytime from Actions\./);
  assert.doesNotMatch(h, /setLiveState|liveState|reopen|hub\.(start|complete|pause)/, "no tournament state change on failure");
  assert.match(h, /fmt === "chip" \? await chipBackup\.download\(\) : await bracketBackup\.download\(\)/);
});

// ══ ACTIONS / PLATFORM ═══════════════════════════════════════════════════════════════════
test("Actions: Chip row 'Download Tournament Backup' (Utilities); Single/Double keep Download Latest Bracket", () => {
  const chipScreen = read("src/views/screens/admin/chip/chip-manage.screen.tsx");
  const util = chipScreen.slice(chipScreen.indexOf('title: "Utilities"'), chipScreen.indexOf('title: "Utilities"') + 700);
  assert.match(util, /label: chipBackup\.availability\.label/);
  assert.match(util, /Last \$\{chipBackup\.lastBackupText\}/, "last backup age (this device)");
  assert.equal(chipBackupAvailability({ offline: false, hasLocal: false, native: false }).label, "Download Tournament Backup");
  assert.match(read("app/(tabs)/admin/manage-tournament/[id].tsx"), /Last backup: \$\{bracketBackup\.lastBackupText\}/);
  // Same save path as the bracket PDF (web download / iOS share sheet / Android folder picker).
  assert.match(read("src/viewmodels/hooks/use.chip.backup.ts"), /import \{ savePdfFile, SavePdfResult \} from "\.\.\/\.\.\/utils\/save-pdf-file";/);
  const pkg = JSON.parse(read("package.json"));
  for (const dep of ["expo-print", "expo-sharing", "jspdf"]) assert.equal(pkg.dependencies[dep], undefined, dep);
  // "Last backup" is local only.
  assert.doesNotMatch(read("src/models/services/backup-history.service.ts"), /supabase/);
  assert.equal(backupAgeText(new Date(Date.now() - 47 * 60000)), "47 min ago");
  assert.equal(backupAgeText(null), null);
});

test("valid PDF structure (xref offsets) for an 8 / 3 packet", () => {
  const raw = Array.from(pdfFor(buildChipEvent({ players: 8, tables: 3, results: 5 })).bytes, (b) => String.fromCharCode(b)).join("");
  assert.ok(raw.startsWith("%PDF-1.4\n") && raw.trimEnd().endsWith("%%EOF"));
  const sx = Number(/startxref\n(\d+)/.exec(raw)![1]);
  [...raw.slice(sx).matchAll(/^(\d{10}) 00000 n $/gm)].forEach((m, i) => assert.ok(raw.slice(Number(m[1])).startsWith(`${i + 1} 0 obj`)));
});
