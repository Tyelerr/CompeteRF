// src/utils/__tests__/elim-recovery-ui.test.ts
// Run: npx tsx --test src/utils/__tests__/elim-recovery-ui.test.ts
// Client side of Elimination Recovery & History (server: 20261019120000_elim_undo_restore,
// tested in supabase/tests/elim_undo_restore.test.ts): readable audit lines, undo availability
// text, computed impact wording, restore-point labels, error mapping, and the wiring guarantees
// (opened from Actions, data only while open, paginated, never offline, never queued).
/// <reference types="node" />

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  auditFieldChanges,
  checkpointBadge,
  checkpointTitle,
  describeAudit,
  impactLines,
  impactSummary,
  undoUnavailableText,
} from "../elim-recovery.format";

const ROOT = join(__dirname, "..", "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8").replace(/^﻿/, "");
const none = { cleared: [], restored: [], changed: [], toWaiting: [], stopped: [], tablesChanged: [] };

test("audit → readable lines (who beat whom, op titles, downstream resets, actor)", () => {
  const win = describeAudit({ op: "set_winner", match_id: "W2M1", before: { status: "in_progress" }, after: { status: "completed", winner: 2 }, detail: { p1Name: "Review Partner", p2Name: "Review Basic" } }, "GoogleReviewTD");
  assert.deepEqual(win, { title: "Winner selected", line: "Review Basic defeated Review Partner", match: "Match W2M1", by: "GoogleReviewTD" });
  const fix = describeAudit({ op: "change_result", match_id: "W1M1", before: { winner: 1 }, after: { winner: 2 }, detail: { p1Name: "A", p2Name: "B", cascade: { reset: ["W2M1", "L1M1"] } } });
  assert.equal(fix.title, "Result changed");
  assert.equal(fix.line, "B defeated A · 2 later matches reset");
  assert.equal(describeAudit({ op: "reopen", match_id: "L3M2", before: null, after: null, detail: { p1Name: "A", p2Name: "B" } }).title, "Match reopened");
  assert.equal(describeAudit({ op: "undo", match_id: "W1M1", before: null, after: null, detail: { undoneOp: "change_result" } }).title, "Undo — result changed");
  const rs = describeAudit({ op: "restore", match_id: null, before: null, after: null, detail: { restoredLabel: "Before change to W1M1", reopened: true } });
  assert.equal(rs.line, "To: Before change to W1M1 · tournament reopened");
  assert.equal(describeAudit({ op: "forfeit", match_id: "W1M2", before: null, after: { winner: 1 }, detail: { p1Name: "A", p2Name: "B" } }).line, "A defeated B (forfeit)");
});

test("audit detail: only changed fields, readable values (no JSON)", () => {
  const ch = auditFieldChanges({ before: { status: "completed", winner: 1, p1Score: 5 }, after: { status: "completed", winner: 2, p1Score: 2 }, detail: { p1Name: "A", p2Name: "B" } });
  assert.deepEqual(ch, [
    { field: "Winner", from: "A", to: "B" },
    { field: "Score (P1)", from: "5", to: "2" },
  ]);
  assert.deepEqual(auditFieldChanges({ before: { status: "in_progress" }, after: { status: "scheduled" }, detail: null }), [{ field: "Status", from: "Live", to: "Waiting" }]);
});

test("undo availability: plain explanations, never a fake button", () => {
  assert.equal(undoUnavailableText("nothing_to_undo"), "Nothing to undo yet.");
  assert.match(undoUnavailableText("match_changed"), /later tournament activity depends on it\. Use Restore instead\./);
  assert.match(undoUnavailableText("changed_since"), /Use Restore instead/);
  assert.match(undoUnavailableText("blocked:table_occupied"), /table is now in use/);
  assert.match(undoUnavailableText("tournament_finished"), /finished.*reopen/);
});

test("impact wording is computed, not generic", () => {
  assert.deepEqual(
    impactLines({ ...none, cleared: ["W2M1", "L1M1"], toWaiting: ["W2M1", "L1M1", "W3M1"], restoredResults: ["X"], changed: ["W1M1"] }, { standingsChanged: true }),
    ["restore 1 match result", "change 1 recorded result", "clear 2 match results", "return 3 matches to Waiting", "change the current standings"],
  );
  assert.equal(impactSummary({ ...none, tablesChanged: ["W1M2"] }), "This only changes table assignments and does not remove any completed results.");
  assert.equal(impactSummary(none), "Nothing in the bracket changes.");
  assert.match(impactSummary({ ...none, cleared: ["a"], reopensTournament: true }), /^This will:\n• clear 1 match result\n• reopen the finished tournament/);
  assert.match(impactSummary({ ...none, replacesBracket: true }), /replace the current bracket with the earlier draw/);
});

test("restore points: readable titles + type badges", () => {
  assert.equal(checkpointTitle({ reason: "before_correction", label: "Before change to W2M1", match_id: "W2M1" }), "Before result change · Match W2M1");
  assert.equal(checkpointTitle({ reason: "finished", label: "Tournament finished", match_id: null }), "Tournament finished");
  assert.equal(checkpointBadge({ reason: "before_redraw", milestone: true }), "Before redraw");
  assert.equal(checkpointBadge({ reason: "before_restore", milestone: false }), "Before restore");
});

test("errors → TD text: stale revision, offline, undo_unavailable detail", async () => {
  const src = read("src/viewmodels/hooks/use.elim.recovery.ts");
  assert.match(src, /code\.includes\("stale_revision"\)\) return RECOVERY_STALE_TEXT/);
  assert.match(src, /code\.includes\("undo_unavailable"\)\) return undoUnavailableText\(detail\)/);
  assert.match(src, /toConnectionAwareError\(e\) instanceof ConnectionRequiredError\) return RECOVERY_OFFLINE_TEXT/);
  // Offline: refused before any request; nothing queued.
  assert.match(src, /if \(recoveryOffline\(\)\) return \{ ok: false, message: RECOVERY_OFFLINE_TEXT \}/);
  assert.doesNotMatch(src, /useMutation/, "no React Query mutation that could pause and replay");
  // Stale / refused → refresh everything (history, restore points, undo preview, tournament).
  assert.match(src, /refreshAll\(\);\s*return \{ ok: false, message \}/);
});

test("wiring: Actions → Recovery & History; data only while open; paginated; revision from the preview", () => {
  const vm = read("src/viewmodels/hooks/use.elim.recovery.ts");
  assert.match(vm, /const enabled = open && !!tournamentId;/);
  assert.equal((vm.match(/enabled,|enabled: enabled/g) ?? []).length >= 4, true, "every query gated on open");
  assert.doesNotMatch(vm, /refetchInterval/, "never polled");
  assert.match(vm, /last\.length === ELIM_HISTORY_PAGE \? last\[last\.length - 1\]\.id : undefined/);
  const svc = read("src/models/services/elim-recovery.service.ts");
  assert.match(svc, /export const ELIM_HISTORY_PAGE = 30;/);
  assert.match(svc, /\.select\("id, revision, reason, label, match_id, milestone, actor_id, created_at"\)/, "never the snapshot");
  assert.match(svc, /rpc\("elim_undo", \{ p_tournament_id: tournamentId, p_dry_run: true \}\)/);
  assert.match(svc, /p_expected_revision: expectedRevision/);
  const modal = read("src/views/components/tournament/live/ElimRecoveryModal.tsx");
  assert.match(modal, /rec\.undo\(undoP\.revision\)/, "undo uses the revision the preview was computed at");
  assert.match(modal, /rec\.restore\(checkpointId, p\.preview\.revision\)/);
  assert.match(modal, /confirmRecovery\(`Undo “\$\{undoTitle\}”\?`/);
  assert.match(modal, /confirmRecovery\(`Restore tournament to \$\{when\}\?`/);
  const actions = read("src/views/components/tournament/live/TournamentActionsModal.tsx");
  assert.match(actions, /onPress: onRecovery && recoveryAvailable \? onRecovery : undefined/);
  const hub = read("app/(tabs)/admin/manage-tournament/[id].tsx");
  assert.match(hub, /setActionsOpen\(false\);\s*setRecoveryOpen\(true\);/, "never two modals at once");
  assert.match(hub, /\{!isChip && \(\s*<ElimRecoveryModal/, "elimination only; Chip unchanged");
});
