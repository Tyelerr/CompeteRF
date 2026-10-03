// src/utils/__tests__/elim-local-recovery.test.ts
// Run: npx tsx --test src/utils/__tests__/elim-local-recovery.test.ts
// Elimination offline local recovery (cloud stays authoritative) + the audit-gap history text:
//   shared  — record build / validation / pruning bounds / reconnect status (pure)
//   storage — the AsyncStorage-backed store against an in-memory storage (per account, bounded,
//             invalid records pruned, storage failures never throw)
//   web / native wiring — how offline is detected, every live write refused (never queued)
//   two-TD  — TD A offline at revision 40 while TD B moves the cloud to 46
//   history — "Bracket drawn · 16 players", "Auto Assign enabled", "Match assigned automatically"
/// <reference types="node" />

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ELIM_CHANGED_WHILE_OFFLINE,
  ELIM_HELD_WRITE_TEXT,
  ELIM_LOCAL_FINISHED_MAX_AGE_MS,
  ELIM_LOCAL_INDEX_KEY,
  ELIM_LOCAL_MAX_AGE_MS,
  ELIM_LOCAL_MAX_TOURNAMENTS,
  ELIM_OFFLINE_BANNER,
  buildElimLocalRecord,
  elimLocalKey,
  elimReconnectStatus,
  planElimLocalPrune,
  validateElimLocalRecord,
} from "../elim-local-recovery";
import { createElimLocalRecoveryStore, ElimLocalStorage } from "../../models/services/elim-local-recovery.service";
import { describeAudit } from "../elim-recovery.format";

const ROOT = join(__dirname, "..", "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8").replace(/^﻿/, "");
const OWNER = "00000000-0000-0000-0000-0000000000aa";
const OTHER = "00000000-0000-0000-0000-0000000000bb";
const NOW = new Date("2026-10-02T18:00:00.000Z");
const row = (id: number, rev: number, extra: Record<string, unknown> = {}) => ({
  id,
  tournament_format: "double-elimination",
  status: "active",
  live_state: "in_progress",
  live_revision: rev,
  live_settings: { bracket: { drawNumber: 1, graph: [{ id: "W1M1" }], seeds: [] }, matchState: { W1M1: { status: "completed", winner: 1 } } },
  ...extra,
});
const memStorage = (opts: { failWrites?: boolean } = {}) => {
  const m = new Map<string, string>();
  const st: ElimLocalStorage & { m: Map<string, string> } = {
    m,
    getItem: async (k) => m.get(k) ?? null,
    setItem: async (k, v) => {
      if (opts.failWrites) throw new Error("QuotaExceededError");
      m.set(k, v);
    },
    removeItem: async (k) => void m.delete(k),
    multiRemove: async (ks) => ks.forEach((k) => m.delete(k)),
  };
  return st;
};

// ══ shared rules ═════════════════════════════════════════════════════════════════════════
test("shared: only a drawn Single/Double bracket with a server revision is kept (never Chip)", () => {
  assert.ok(buildElimLocalRecord(row(7, 3), [], OWNER, NOW));
  assert.equal(buildElimLocalRecord(row(7, 3, { tournament_format: "single_elimination" }), null, OWNER, NOW)?.revision, 3);
  assert.equal(buildElimLocalRecord(row(7, 3, { tournament_format: "chip-tournament" }), [], OWNER, NOW), null);
  assert.equal(buildElimLocalRecord(row(7, 3, { tournament_format: "round-robin" }), [], OWNER, NOW), null);
  assert.equal(buildElimLocalRecord(row(7, 3, { live_settings: { matchState: {} } }), [], OWNER, NOW), null, "no bracket yet");
  assert.equal(buildElimLocalRecord(row(7, 3, { live_revision: undefined }), [], OWNER, NOW), null, "no revision");
  assert.equal(buildElimLocalRecord(row(7, 3), [], null, NOW), null, "signed out → nothing stored");
  const r = buildElimLocalRecord(row(7, 3, { status: "completed" }), [{ id: 1 }], OWNER, NOW)!;
  assert.deepEqual([r.schema, r.kind, r.tournamentId, r.ownerId, r.revision, r.savedAt, r.finished], [1, "elimination", 7, OWNER, 3, NOW.toISOString(), true]);
});

test("shared: validation — schema, kind, tournament, account, revision, timestamp, expiry", () => {
  const good = buildElimLocalRecord(row(7, 3), [], OWNER, NOW)!;
  const v = (raw: unknown, now = NOW, expect = { tournamentId: 7, ownerId: OWNER }) => {
    const r = validateElimLocalRecord(raw, expect, now);
    return r.ok ? "ok" : r.reason;
  };
  assert.equal(v(good), "ok");
  assert.equal(v(null), "shape");
  assert.equal(v({ ...good, schema: 2 }), "schema");
  assert.equal(v({ ...good, kind: "chip" }), "kind");
  assert.equal(v(good, NOW, { tournamentId: 8, ownerId: OWNER }), "tournament");
  assert.equal(v({ ...good, tournament: { ...good.tournament, id: 9 } }), "tournament");
  assert.equal(v(good, NOW, { tournamentId: 7, ownerId: OTHER }), "owner", "another account never sees it");
  assert.equal(v({ ...good, revision: 4 }), "revision", "revision must match its own row");
  assert.equal(v({ ...good, revision: -1 }), "revision");
  assert.equal(v({ ...good, savedAt: "not a date" }), "timestamp");
  assert.equal(v({ ...good, savedAt: new Date(NOW.getTime() + 60 * 60_000).toISOString() }), "timestamp", "future");
  assert.equal(v(good, new Date(NOW.getTime() + ELIM_LOCAL_MAX_AGE_MS + 1)), "expired");
  assert.equal(v(good, new Date(NOW.getTime() + ELIM_LOCAL_MAX_AGE_MS - 1)), "ok");
  const fin = buildElimLocalRecord(row(7, 3, { live_state: "finished" }), [], OWNER, NOW)!;
  assert.equal(v(fin, new Date(NOW.getTime() + ELIM_LOCAL_FINISHED_MAX_AGE_MS + 1)), "expired", "finished events expire sooner");
  assert.equal(v({ ...good, tournament: { ...good.tournament, tournament_format: "chip-tournament" } }), "kind");
});

test("shared: bounds — newest 20 tournaments, expired dropped, one entry per tournament", () => {
  const e = (id: number, minsAgo: number, owner = OWNER, finished = false) => ({
    tournamentId: id, ownerId: owner, revision: 1, finished, savedAt: new Date(NOW.getTime() - minsAgo * 60_000).toISOString(),
  });
  const many = Array.from({ length: 25 }, (_, i) => e(100 + i, i));
  const p = planElimLocalPrune(many, NOW);
  assert.equal(ELIM_LOCAL_MAX_TOURNAMENTS, 20);
  assert.equal(p.keep.length, 20);
  assert.deepEqual(p.drop.map((x) => x.tournamentId).sort(), [120, 121, 122, 123, 124], "oldest go first");
  const q = planElimLocalPrune([e(1, 5), e(1, 1), e(2, 15 * 24 * 60), e(3, 4 * 24 * 60, OWNER, true), "junk", null], NOW);
  assert.deepEqual(q.keep.map((x) => x.tournamentId), [1]);
  assert.equal(q.keep[0].savedAt, e(1, 1).savedAt, "newest copy of a tournament wins");
  assert.deepEqual(q.drop.map((x) => x.tournamentId).sort(), [2, 3]);
});

test("shared: reconnect — same revision = Synced, anything else = the cloud changed", () => {
  assert.equal(elimReconnectStatus(40, 40), "synced");
  assert.equal(elimReconnectStatus(40, 46), "cloud_changed");
  assert.equal(elimReconnectStatus(40, null), "cloud_changed");
  assert.equal(elimReconnectStatus(null, 40), "cloud_changed");
});

// ══ storage ══════════════════════════════════════════════════════════════════════════════
test("storage: save → read round trip, per account; one record per tournament (latest revision)", async () => {
  const st = memStorage();
  const store = createElimLocalRecoveryStore(st);
  assert.equal(await store.save(buildElimLocalRecord(row(7, 3), [{ id: 71, label: "Diamond" }], OWNER, NOW)!, NOW), true);
  assert.equal(await store.save(buildElimLocalRecord(row(7, 5), [], OWNER, NOW)!, NOW), true);
  const got = await store.read(7, OWNER, NOW);
  assert.equal(got?.revision, 5);
  assert.equal(await store.read(7, OTHER, NOW), null, "another account on this device sees nothing");
  assert.equal([...st.m.keys()].filter((k) => k !== ELIM_LOCAL_INDEX_KEY).length, 1, "one record per tournament");
  await store.remove(7, OWNER);
  assert.equal(await store.read(7, OWNER, NOW), null);
});

test("storage: invalid / corrupted / expired records are pruned on read", async () => {
  const st = memStorage();
  const store = createElimLocalRecoveryStore(st);
  st.m.set(elimLocalKey(OWNER, 7), "{not json");
  assert.equal(await store.read(7, OWNER, NOW), null);
  assert.equal(st.m.has(elimLocalKey(OWNER, 7)), false, "corrupted record removed");
  await store.save(buildElimLocalRecord(row(8, 2), [], OWNER, NOW)!, NOW);
  assert.equal(await store.read(8, OWNER, new Date(NOW.getTime() + ELIM_LOCAL_MAX_AGE_MS + 1)), null);
  assert.equal(st.m.has(elimLocalKey(OWNER, 8)), false, "expired record removed");
  assert.deepEqual(JSON.parse(st.m.get(ELIM_LOCAL_INDEX_KEY)!), [], "index updated");
});

test("storage: device-wide cap — saving a 21st tournament evicts the oldest", async () => {
  const st = memStorage();
  const store = createElimLocalRecoveryStore(st);
  for (let i = 0; i < 22; i++) {
    const at = new Date(NOW.getTime() + i * 1000);
    await store.save(buildElimLocalRecord(row(200 + i, 1), [], OWNER, at)!, at);
  }
  const records = [...st.m.keys()].filter((k) => k !== ELIM_LOCAL_INDEX_KEY);
  assert.equal(records.length, 20);
  assert.equal(st.m.has(elimLocalKey(OWNER, 200)), false);
  assert.equal(st.m.has(elimLocalKey(OWNER, 201)), false);
  assert.equal(st.m.has(elimLocalKey(OWNER, 221)), true);
  assert.equal(JSON.parse(st.m.get(ELIM_LOCAL_INDEX_KEY)!).length, 20);
});

test("storage: failures never throw (quota / private mode) and oversized rows are skipped", async () => {
  const store = createElimLocalRecoveryStore(memStorage({ failWrites: true }));
  assert.equal(await store.save(buildElimLocalRecord(row(7, 3), [], OWNER, NOW)!, NOW), false);
  assert.equal(await store.read(7, OWNER, NOW), null);
  const st = memStorage();
  const big = buildElimLocalRecord(row(9, 1, { notes: "x".repeat(800_000) }), [], OWNER, NOW)!;
  assert.equal(await createElimLocalRecoveryStore(st).save(big, NOW), false);
  assert.equal(st.m.size, 0);
});

// ══ web / native / shared wiring ═════════════════════════════════════════════════════════
test("web: offline from the browser (navigator + online/offline events); storage = AsyncStorage (localStorage)", () => {
  const hook = read("src/viewmodels/hooks/use.elim.offline.ts");
  assert.match(hook, /navigator\.onLine === false/);
  assert.match(hook, /addEventListener\("online", sync\)/);
  assert.match(hook, /addEventListener\("offline", sync\)/);
  const svc = read("src/models/services/elim-local-recovery.service.ts");
  assert.match(svc, /import AsyncStorage from "@react-native-async-storage\/async-storage"/);
  assert.match(svc, /createElimLocalRecoveryStore\(\s*AsyncStorage\s*\)/);
});

test("native: offline = the tournament fetch failed with a network error; no new native module (no build)", () => {
  const hook = read("src/viewmodels/hooks/use.elim.offline.ts");
  assert.match(hook, /toConnectionAwareError\(cloudError\) instanceof ConnectionRequiredError && cloudErrorUpdatedAt >= cloudUpdatedAt/);
  assert.match(hook, /const offline = webOffline \|\| netFail;/);
  assert.doesNotMatch(hook, /netinfo/i, "no new native dependency");
  const pkg = JSON.parse(read("package.json"));
  assert.ok(pkg.dependencies["@react-native-async-storage/async-storage"], "already in the binary");
});

test("shared: only cloud data is stored; the hold is read-only; Load Latest never pushes local state", () => {
  const hook = read("src/viewmodels/hooks/use.elim.offline.ts");
  assert.match(hook, /if \(held \|\| offline \|\| !ownerId \|\| !isElimLocalEligible\(cloud\)\) return;/, "save only fresh cloud copies");
  assert.match(hook, /buildElimLocalRecord\(cloud, tables \?\? null, ownerId, new Date\(\), roster\)/);
  assert.equal((hook.match(/elimLocalRecoveryService\.save\(/g) ?? []).length, 1);
  assert.doesNotMatch(hook, /rpc\(|supabase|applyLiveOps|setMatchState|elim_live_apply/, "nothing local is ever sent");
  assert.match(hook, /const loadLatest = useCallback\(\(\) => \{\s*setHeld\(null\);\s*refetchRef\.current\(\);/);
});

test("shared: every live write is refused offline / while held — never paused and replayed", () => {
  const vm = read("src/viewmodels/hooks/use.manage.tournament.ts");
  assert.ok((vm.match(/guardLiveWrite\(\);/g) ?? []).length >= 9, "liveOps, patch, preview, state, pause, finish, draw, bulk, queue");
  for (const m of ["drawBracketMutation", "bulkSetMatchStateMutation", "saveQueueSettingsMutation", "setMatchStateMutation", "liveOpsMutation"]) {
    const body = vm.slice(vm.indexOf(`const ${m} = useMutation({`), vm.indexOf(`const ${m} = useMutation({`) + 400);
    assert.match(body, /networkMode: "always"/, `${m} never pauses offline`);
  }
  for (const m of ["liveStateMutation", "pauseMutation", "completeMutation"]) {
    const body = vm.slice(vm.indexOf(`const ${m} = useMutation({`), vm.indexOf(`const ${m} = useMutation({`) + 200);
    assert.match(body, /networkMode: elimNetworkMode/, `${m}: elimination never pauses; Chip unchanged`);
  }
  assert.match(vm, /const elimNetworkMode = isElimEvent \? \("always" as const\) : \("online" as const\);/);
  const hub = read("app/(tabs)/admin/manage-tournament/[id].tsx");
  const fn = (name: string) => hub.slice(hub.indexOf(`const ${name} = `), hub.indexOf(`const ${name} = `) + 400);
  for (const h of ["runMatchPatch", "handleDrawBracket", "handleFinishTournament"]) assert.match(fn(h), /if \(liveWriteBlocked\(\)\) return;/, h);
  assert.match(fn("runLiveOps"), /if \(!isChip && hub\.elimOffline\.writeBlockedText\) throw new Error\(hub\.elimOffline\.writeBlockedText\);/);
  assert.match(hub, /const liveWriteBlocked = \(\): boolean => \{\s*if \(isChip\) return false;/, "Chip unchanged");
  const modal = read("src/views/components/tournament/live/ElimRecoveryModal.tsx");
  assert.match(modal, /const offline = recoveryOffline\(\) \|\| !!connection\?\.offline \|\| \(connection\?\.status \?\? "cloud"\) !== "cloud";/, "Undo / Restore refused offline");
});

test("shared: offline display never blanks — the hub shows the held copy, not a load error", () => {
  const vm = read("src/viewmodels/hooks/use.manage.tournament.ts");
  assert.match(vm, /const tournament = \(\(elimOffline\.display as unknown as Tournament \| null\) \?\? tournamentQuery\.data\) \?\? null;/);
  assert.match(vm, /isLoading: tournamentQuery\.isLoading && !elimOffline\.display,/);
  assert.match(vm, /error: elimOffline\.display \? null : tournamentQuery\.error,/);
  const banner = read("src/views/components/tournament/live/ElimOfflineBanner.tsx");
  assert.match(banner, /ELIM_OFFLINE_BANNER/);
  assert.match(banner, /ELIM_CHANGED_WHILE_OFFLINE/);
  assert.match(banner, />Load Latest</);
  assert.equal(ELIM_OFFLINE_BANNER, "Offline — showing last synced tournament state");
  assert.equal(ELIM_CHANGED_WHILE_OFFLINE, "This tournament changed while you were offline.");
});

test("Recovery & History: Cloud status, cloud revision, Local recovery — separate from server Restore Points", () => {
  const modal = read("src/views/components/tournament/live/ElimRecoveryModal.tsx");
  assert.match(modal, /<Stat label="Cloud" value=\{cloudLabel\}/);
  assert.match(modal, /<Stat label="Cloud revision"/);
  assert.match(modal, /Local recovery \(this device\)/);
  assert.match(modal, /`Available · last synced copy #\$\{connection\.local\.revision\} · \$\{clock\(connection\.local\.savedAt\)\}`/);
  assert.match(modal, /: "None"\}/);
  const hub = read("app/(tabs)/admin/manage-tournament/[id].tsx");
  assert.match(hub, /connection=\{\{\s*status: hub\.elimOffline\.status,/);
});

// ══ two TDs: A offline at revision 40, B moves the cloud to 46 ═══════════════════════════
test("two-TD offline scenario: A holds rev 40, B reaches 46 → A sees 'changed' + Load Latest, nothing of A's is pushed", async () => {
  const st = memStorage();
  const store = createElimLocalRecoveryStore(st);
  // TD A synced revision 40 before the connection dropped.
  await store.save(buildElimLocalRecord(row(30, 40), [], OWNER, NOW)!, NOW);
  const shown = (await store.read(30, OWNER, NOW))!;
  assert.equal(shown.revision, 40, "A's offline screen shows revision 40");
  // TD B (online) records results → cloud revision 46. A reconnects and fetches.
  const cloud = row(30, 46);
  assert.equal(elimReconnectStatus(shown.revision, cloud.live_revision), "cloud_changed");
  // Hook state machine for that case: banner + every write refused until Load Latest.
  const hook = read("src/viewmodels/hooks/use.elim.offline.ts");
  assert.match(hook, /if \(elimReconnectStatus\(held\.revision, cloud\.live_revision as number\) === "synced"\) \{[\s\S]*?\} else \{\s*setHeld\(\{ \.\.\.held, changed: true \}\);/);
  assert.match(hook, /: changed\s*\? ELIM_HELD_WRITE_TEXT/);
  assert.equal(ELIM_HELD_WRITE_TEXT, "This tournament changed while you were offline. Load the latest version first.");
  // After Load Latest, A's device copy is replaced by the cloud's 46 — A's 40 is never sent anywhere.
  await store.save(buildElimLocalRecord(cloud, [], OWNER, new Date(NOW.getTime() + 60_000))!, new Date(NOW.getTime() + 60_000));
  assert.equal((await store.read(30, OWNER, new Date(NOW.getTime() + 60_000)))?.revision, 46);
  // Case A (nothing changed elsewhere): same revision → Synced, hold released.
  assert.equal(elimReconnectStatus(40, 40), "synced");
  // Case C (fetch still failing): the hold only ends on a cloud fetch NEWER than the hold.
  assert.match(hook, /if \(!held \|\| held\.changed \|\| offline \|\| !cloud \|\| cloudUpdatedAt <= held\.since\) return;/);
});

// ══ history text for the audit gaps ══════════════════════════════════════════════════════
test("history: draw / redraw / Auto Assign / queue settings read cleanly; no fake TD", () => {
  const drawn = describeAudit({ op: "draw", match_id: null, before: null, after: { players: 16, bracketSize: 16, drawNumber: 1 }, detail: {} }, "GoogleReviewTD");
  assert.deepEqual([drawn.title, drawn.line, drawn.by], ["Bracket drawn", "16 players · 16-slot bracket", "GoogleReviewTD"]);
  const re = describeAudit({ op: "redraw", match_id: null, before: null, after: { players: 15, bracketSize: 16 }, detail: { reason: "Late player" } });
  assert.deepEqual([re.title, re.line], ["Bracket redrawn", "15 players · 16-slot bracket · Reason: Late player"]);
  const sys = describeAudit({ op: "redraw", match_id: null, before: null, after: {}, detail: {}, source: "system" });
  assert.equal(sys.by, "System");
  const aa = describeAudit({ op: "auto_assign", match_id: "W1M3", before: {}, after: { tableId: 74 }, detail: { tableLabel: "Table 4", p1Name: "Ann", p2Name: "Bo" }, source: "auto_assign" }, null);
  assert.deepEqual([aa.title, aa.line, aa.match, aa.by], ["Match assigned automatically", "Table 4 · Ann vs Bo", "Match W1M3", "Auto Assign"]);
  const q = (after: Record<string, unknown>) => describeAudit({ op: "set_queue", match_id: null, before: null, after, detail: {} }, "TD").title;
  assert.equal(q({ autoAssignEnabled: true }), "Auto Assign enabled");
  assert.equal(q({ autoAssignEnabled: false }), "Auto Assign disabled");
  assert.equal(q({ autoAssignMode: "losersFirst" }), "Auto Assign mode changed");
  assert.equal(q({ queueOrder: ["W1M2"] }), "Match order changed");
  assert.equal(q({ queuePins: [] }), "Play Next updated");
  const svc = read("src/models/services/elim-recovery.service.ts");
  assert.match(svc, /actor_id, source, before, after, detail, created_at/);
});
