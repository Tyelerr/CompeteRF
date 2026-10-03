// src/utils/__tests__/audit-2026-10-03.test.ts
// Run: npx tsx --test src/utils/__tests__/audit-2026-10-03.test.ts
// Regression pins for the 2026-10-03 overnight audit fixes: spectator poll policy (pure) plus
// source contracts for the write-safety fixes (sign-out scope, account-switch cache clear,
// revision-checked draw / Finish, Start refused on a completed event, in-use table removal).
/// <reference types="node" />

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  SPECTATOR_FINISHED_POLL_MS,
  spectatedEventFinished,
  spectatorPollInterval,
} from "../player-poll";

const ROOT = join(__dirname, "..", "..", "..");
const read = (f: string) => readFileSync(join(ROOT, f), "utf8");

test("spectator poll: only while focused; slows (never stops) once the event is finished", () => {
  assert.equal(spectatorPollInterval(5000, 12), 5000, "default: focused, live");
  assert.equal(spectatorPollInterval(5000, 12, { focused: false }), false, "tab route left mounted");
  assert.equal(spectatorPollInterval(5000, undefined), false, "no tournament");
  assert.equal(spectatorPollInterval(5000, 12, { finished: true }), SPECTATOR_FINISHED_POLL_MS);
  assert.equal(spectatorPollInterval(90_000, 12, { finished: true }), 90_000, "never faster than asked");
  assert.equal(spectatorPollInterval(5000, 12, { focused: false, finished: true }), false);
});

test("spectatedEventFinished: completed status OR finished live_state", () => {
  assert.equal(spectatedEventFinished(null), false);
  assert.equal(spectatedEventFinished({ status: "active", live_state: "in_progress" }), false);
  assert.equal(spectatedEventFinished({ status: "completed", live_state: "in_progress" }), true);
  assert.equal(spectatedEventFinished({ status: "active", live_state: "finished" }), true);
});

test("both spectator screens pass their focus state into the poll", () => {
  const elim = read("src/views/screens/tournament/live-tournament.screen.tsx");
  assert.ok(/useTournamentSpectator\(tournamentId, \{ focused: isFocused \}\)/.test(elim));
  const chip = read("src/views/screens/tournament/chip-live.screen.tsx");
  assert.ok(/useChipSpectator\(tournamentId, viewerProfileId, \{\s*focused: isFocused,?\s*\}\)/.test(chip));
  assert.ok(/if \(!isFocused\) return;\s*const set = \(\) => setNow/.test(chip), "1s tick gated on focus");
});

test("sign-out ends only THIS device's session and never fakes success offline", () => {
  const src = read("src/providers/AuthProvider.tsx");
  const body = src.slice(src.indexOf("const signOut = async"), src.indexOf("// ── Context value"));
  assert.ok(/supabase\.auth\.signOut\(\{ scope: 'local' \}\)/.test(body), "local scope");
  const errAt = body.indexOf("if (error)");
  const resetAt = body.indexOf("resetStore()");
  assert.ok(errAt > 0 && resetAt > errAt, "error branch runs before the UI reset");
  assert.ok(/return;\s*\}/.test(body.slice(errAt, resetAt)), "error branch returns without resetting");
});

test("account change clears the shared query + nav caches", () => {
  const src = read("src/providers/AuthProvider.tsx");
  assert.ok(/prevUserId && prevUserId !== \(user\?\.id \?\? null\)/.test(src));
  assert.ok(/queryClient\.clear\(\);\s*clearNavCache\(\);/.test(src));
  assert.ok(/export const queryClient = new QueryClient/.test(read("src/providers/QueryProvider.tsx")));
});

test("draw / redraw and Finish are revision-checked; Start never revives a completed event", () => {
  const hook = read("src/viewmodels/hooks/use.manage.tournament.ts");
  const draw = hook.slice(hook.indexOf("const drawBracketMutation"), hook.indexOf("const bulkSetMatchStateMutation"));
  assert.ok(/\{ casRevision: true \}/.test(draw), "draw writes with CAS");
  assert.ok(/finishLiveTournament\(tournamentId!, currentTournament\(\)\?\.live_revision\)/.test(hook));

  const svc = read("src/models/services/tournament.service.ts");
  const cas = svc.slice(svc.indexOf("async updateTournamentIfRevision("), svc.indexOf("async updateTournament(id"));
  assert.ok(/\.eq\("live_revision", expectRevision\)/.test(cas));
  assert.ok(/if \(!data\) throw new StaleTournamentError\(\)/.test(cas), "0 rows → stale, nothing written");
  const live = svc.slice(svc.indexOf("async setLiveState("), svc.indexOf("openRegistration("));
  assert.ok(/if \(liveState === "in_progress"\) query = query\.neq\("status", "completed"\)/.test(live));
});

test("native table edit sheet can't remove a table with a live match on it", () => {
  const src = read("app/(tabs)/admin/manage-tournament/[id].tsx");
  const at = src.indexOf('{pool ? "Remove Pool Table" : "Remove Table"}');
  const btn = src.slice(src.lastIndexOf("<TouchableOpacity", at), at);
  assert.ok(/disabled=\{!!editOcc\}/.test(btn));
  assert.ok(/if \(editOcc\) return;/.test(btn));
});

test("admin report push opens the real report-management route", () => {
  // Since 20261021140000 the alert is sent by the server (reports_notify_admins), not the reporter's app.
  const mig = read("supabase/migrations/20261021140000_security_cleanup.sql");
  assert.ok(mig.includes("'deep_link', '/admin/report-management'"));
  assert.ok(!mig.includes("'/admin/reports'"));
  assert.ok(!read("src/models/services/report.service.ts").includes("sendToAdmins("), "the app no longer reads admin tokens");
});

test("TD Set Winner on a live match records a PLAYED result (never a participant-written one)", () => {
  const src = read("src/views/components/tournament/live/MatchActionsModal.tsx");
  assert.ok(src.includes('result: m.status === "completed" ? (m.result ?? "normal") : "normal",'));
  assert.ok(!src.includes('result: m.result ?? "normal",'));
});
