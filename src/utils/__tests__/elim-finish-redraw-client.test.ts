// src/utils/__tests__/elim-finish-redraw-client.test.ts
// Run: npx tsx --test src/utils/__tests__/elim-finish-redraw-client.test.ts
// Client side of 20261021130000_elim_finish_redraw_recovery: the server reopens a finished event
// when a correction leaves required matches unplayed, and Undo stops at a bracket redraw. The app
// must (1) leave Results at once when the response says reopened, (2) tell the TD, (3) warn in the
// correction confirmation, and (4) explain an Undo that stops at the draw boundary — while
// Restore stays available.
/// <reference types="node" />

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CORRECTION_REOPENED_TEXT,
  CORRECTION_WILL_REOPEN_TEXT,
  describeAudit,
  undoUnavailableText,
} from "../elim-recovery.format";

const ROOT = join(__dirname, "..", "..", "..");
const read = (f: string) => readFileSync(join(ROOT, f), "utf8");

test("Undo unavailable at the redraw boundary says why and points to Restore", () => {
  const t = undoUnavailableText("draw_boundary");
  assert.match(t, /can't cross a bracket redraw/);
  assert.match(t, /Restore/);
  assert.match(undoUnavailableText("before_update"), /Restore/);
  assert.equal(undoUnavailableText("nothing_to_undo"), "Nothing to undo yet.");
});

test("History shows a correction that reopened the tournament", () => {
  const row = {
    op: "change_result", match_id: "W1M1", before: { winner: 1 }, after: { winner: 2, status: "completed" },
    detail: { p1Name: "Ann", p2Name: "Bob", reopened: true, cascade: { reset: ["W2M1", "W3M1"] } },
  };
  const d = describeAudit(row as any, "TD Pat");
  assert.match(d.line ?? "", /Bob defeated Ann/);
  assert.match(d.line ?? "", /2 later matches reset/);
  assert.match(d.line ?? "", /tournament reopened/);
  assert.equal(d.by, "TD Pat");
  // not duplicated for restores (their own branch already says it)
  const r = describeAudit({ op: "restore", match_id: null, before: null, after: null, detail: { restoredLabel: "Before redraw", reopened: true } } as any);
  assert.equal((r.line ?? "").match(/tournament reopened/g)?.length, 1);
});

test("a reopened response leaves Results at once (status → active) and refetches", () => {
  const src = read("src/viewmodels/hooks/use.manage.tournament.ts");
  const body = src.slice(src.indexOf("const applyLiveOps = async"), src.indexOf("const previewLiveOps = async"));
  assert.ok(/\.\.\.\(res\.reopened \? \{ status: "active", completed_at: null \} : \{\}\)/.test(body));
  assert.ok(/if \(res\.reopened\) invalidateTournament\(\);/.test(body));
});

test("the correction flow warns before, and tells the TD after, an automatic reopen", () => {
  const src = read("app/(tabs)/admin/manage-tournament/[id].tsx");
  const fn = src.slice(src.indexOf("const runMatchPatch = async"), src.indexOf("const runLiveOps = async"));
  assert.ok(fn.includes("preview.reopens_tournament"), "uses the server dry run, not a client guess");
  assert.ok(fn.includes("CORRECTION_WILL_REOPEN_TEXT"));
  assert.ok(/if \(res\?\.reopened\) Alert\.alert\(CORRECTION_REOPENED_TITLE, CORRECTION_REOPENED_TEXT\)/.test(fn));
  assert.match(CORRECTION_REOPENED_TEXT, /live again/);
  assert.match(CORRECTION_WILL_REOPEN_TEXT, /reopen/);
});

test("Recovery & History: Undo follows the server's availability; Restore is independent of it", () => {
  const src = read("src/views/components/tournament/live/ElimRecoveryModal.tsx");
  assert.ok(src.includes("undoUnavailableText(undoP?.reason)"), "the server's reason (incl. draw_boundary) is shown");
  assert.ok(/disabled=\{!undoP\?\.available \|\| rec\.busy \|\| offline\}/.test(src), "Undo disabled when the server says unavailable");
  const restoreBtn = src.slice(src.indexOf("onPress={() => doRestore(c.id"), src.indexOf("onPress={() => doRestore(c.id") + 10);
  assert.ok(restoreBtn.length > 0);
  assert.ok(/disabled=\{rec\.busy \|\| offline \|\| restoringId != null\}/.test(src), "Restore not tied to Undo availability");
});
