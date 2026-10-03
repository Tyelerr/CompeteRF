// src/utils/__tests__/elim-recovery-client.test.ts
// Run: npx tsx --test src/utils/__tests__/elim-recovery-client.test.ts
// Client side of the elimination recovery foundation (server: 20261018120000, tested in
// supabase/tests/elim_recovery_foundation.test.ts): which TD actions are outcome changes
// (blocked offline) and corrections (revision + impact preview), the TD-facing impact text, the
// stale-revision message, and the static wiring of the single match-mutation path.
/// <reference types="node" />

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { correctionImpactText, isCorrection, isOutcomeChange, liveCallErrorText, liveOpErrorText } from "../elim-live-ops";
import { formatTournamentEvent } from "../tournament-event.format";

const ROOT = join(__dirname, "..", "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8").replace(/^﻿/, "");

const live = { status: "in_progress" as const, winner: null, result: null };
const done = (w: 1 | 2, result: "normal" | "forfeit" | "withdraw" = "normal") => ({ status: "completed" as const, winner: w, result });
const RESET = { status: "scheduled" as const, tableId: null, startedAt: null, completedAt: null, winner: null, p1Score: null, p2Score: null, result: null };

test("outcome changes (never sent offline): Set Winner, forfeit, withdraw, change, Reset, Reopen", () => {
  assert.equal(isOutcomeChange(live, { status: "completed", winner: 1, result: "normal" }), true, "Set Winner");
  assert.equal(isOutcomeChange(live, { status: "completed", winner: 2, result: "forfeit" }), true, "forfeit");
  assert.equal(isOutcomeChange(done(1), { winner: 2 }), true, "change result");
  assert.equal(isOutcomeChange(live, RESET), true, "Reset a live match");
  assert.equal(isOutcomeChange(done(1), { status: "in_progress", winner: null, result: null }), true, "Reopen");
  // Not outcome changes: table / timer / score / start.
  assert.equal(isOutcomeChange(live, { tableId: 3 }), false);
  assert.equal(isOutcomeChange(live, { startedAt: "2026-10-01T10:00:00Z" }), false);
  assert.equal(isOutcomeChange(live, { p1Score: 3 }), false);
  assert.equal(isOutcomeChange({ status: "scheduled", winner: null }, { status: "in_progress", tableId: 1 }), false, "start");
  assert.equal(isOutcomeChange(null, { status: "completed" }), false);
});

test("corrections (revision + impact preview) vs a first result", () => {
  assert.equal(isCorrection(live, { status: "completed", winner: 1 }), false, "first Set Winner → per-match expect only");
  assert.equal(isCorrection(done(1), { status: "completed", winner: 1, result: "normal" }), false, "same result re-saved");
  assert.equal(isCorrection(done(1), { p1Score: 5, p2Score: 4 }), false, "score-only edit");
  assert.equal(isCorrection(done(1), { winner: 2 }), true, "winner change");
  assert.equal(isCorrection(done(1), { result: "forfeit" }), true, "result type change");
  assert.equal(isCorrection(done(1), { status: "in_progress", winner: null, result: null }), true, "Reopen");
  assert.equal(isCorrection(done(1), RESET), true, "Reset of a completed match");
  assert.equal(isCorrection(live, RESET), true, "Reset of a live match");
});

test("impact text: concise, plural-aware; nothing downstream → no extra confirmation", () => {
  assert.equal(correctionImpactText({ reset: [], cleared: [], stopped: [], released: [] }), null);
  assert.equal(correctionImpactText(null), null);
  assert.equal(
    correctionImpactText({ reset: ["W2M1", "L1M1", "W3M1", "L2M1"], cleared: ["W2M1", "L1M1", "W3M1"], stopped: [], released: [] }),
    "This change will clear 3 downstream results and return 4 matches to Waiting. Players will be re-seated from the corrected result.",
  );
  const one = correctionImpactText({ reset: ["W2M1"], cleared: [], stopped: ["W2M1"], released: [71] })!;
  assert.match(one, /return 1 match to Waiting\. 1 match in progress is stopped\. 1 table is freed\./);
  assert.doesNotMatch(one, /clear 0/);
});

test("stale revision → the approved message (thrown RPC error or per-op code)", () => {
  const msg = "This tournament changed on another device. Reload the latest version.";
  assert.equal(liveCallErrorText({ message: "stale_revision" }), msg);
  assert.equal(liveCallErrorText(new Error("stale_revision")), msg);
  assert.equal(liveCallErrorText(new Error("network down")), null);
  assert.equal(liveOpErrorText("stale_revision"), msg);
});

test("spectator feed renders the server's bracket_corrected event (public count only)", () => {
  const e = { id: "x", tournament_id: 1, type: "bracket_corrected", text: "", actor_id: null, payload: { resetCount: 3, clearedCount: 2, p1Name: "A", p2Name: "B" }, tx_id: null, created_at: "" } as any;
  const f = formatTournamentEvent(e);
  assert.equal(f.title, "Bracket corrected");
  assert.equal(f.detail, "3 later matches reset after a result change");
});

test("wiring: one match-mutation path — offline block, preview, revision; server owns the activity log", () => {
  const hub = read("app/(tabs)/admin/manage-tournament/[id].tsx");
  const start = hub.indexOf("const runMatchPatch = async");
  const body = hub.slice(start, hub.indexOf("const runLiveOps = async", start));
  // Offline local recovery: no live write at all while offline / held (superset of the old
  // web-only outcome block) — see elim-local-recovery.test.ts.
  assert.match(body, /if \(liveWriteBlocked\(\)\) return;/);
  assert.match(body, /isCorrection\(prev, patch\)/);
  assert.match(body, /correctionImpact\(graph, hub\.matchState, matchId\)\.affected\.length > 0/);
  assert.match(body, /hub\.previewLiveOps\(\[op\]\)/);
  assert.match(body, /expectedRevision = preview\.revision/);
  assert.match(body, /hub\.setMatchState\(\{ matchId, patch, .*expectedRevision \}\)/);
  assert.doesNotMatch(hub, /logMatchDerivedEvent/, "the app no longer writes match activity (server does)");
  const vm = read("src/viewmodels/hooks/use.manage.tournament.ts");
  assert.match(vm, /opId: Crypto\.randomUUID\(\)/, "every elim_live_apply call carries an op id");
  assert.match(vm, /expectedRevision: opts\.expectedRevision \?\? null/);
  assert.match(vm, /live_revision: res\.revision/, "cache keeps the server revision");
  assert.equal((vm.match(/networkMode: "always"/g) ?? []).length >= 2, true, "live writes never pause-and-replay offline");
  const svc = read("src/models/services/tournament.service.ts");
  assert.match(svc, /p_dry_run: true/);
  assert.match(svc, /\.\.\.\(opts\.expectedRevision != null \? \{ p_expected_revision: opts\.expectedRevision \} : \{\}\)/);
});
