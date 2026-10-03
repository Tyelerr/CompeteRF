// supabase/tests/elim_undo_restore.test.ts
// Server-contract tests for supabase/migrations/20261019120000_elim_undo_restore.sql (Undo +
// Restore for Actions → Recovery & History) on a real Postgres (PGlite), on top of the
// 20261018120000 recovery foundation: what can be undone, downstream cascade + result
// restoration, refusal when later activity depends on it, stale revisions, one audit row,
// pre-change checkpoints, restore impact / status / draw guards, privileges.
// Participants / winners / champions are read back with the APP's own resolver
// (buildLiveMatches / computeStandings), so the assertions are about what TDs actually see.
//
// Run:
//   PGLITE_MODULE=file:///<path>/node_modules/@electric-sql/pglite/dist/index.js \
//     npx tsx --test supabase/tests/elim_undo_restore.test.ts
/// <reference types="node" />

import { test, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildBracketGraph } from "../../src/utils/bracket.double";
import { RaceConfig } from "../../src/utils/bracket.utils";
import { buildLiveMatches } from "../../src/utils/match.utils";
import { MatchLiveState } from "../../src/models/types/tournament-settings.types";

const ROOT = join(__dirname, "..", "..");
const read = (f: string) => readFileSync(join(ROOT, f), "utf8");
const cut = (src: string, head: string) => {
  const s = src.indexOf(head);
  return src.slice(s, src.indexOf("$$;", src.indexOf("$$", s) + 2) + 3);
};
const TD = "00000000-0000-0000-0000-000000000001";
const TD2 = "00000000-0000-0000-0000-000000000002";
const T = 10;
const CFG: RaceConfig = { mode: "fixed", fixedWinners: 5, groups: [], diffMin: 0, diffPerGame: 0, diffMax: null } as any;
const seeds = (n: number) => Array.from({ length: n }, (_, i) => ({ registrationId: i + 1, name: `P${i + 1}`, fargo: 500 }));

let db: any;
let graphDouble = true;
const q = async (sql: string, p: unknown[] = []) => (await db.query(sql, p)).rows;
const asUser = (uid: string) => q("select set_config('test.uid', $1, false)", [uid]);
const call = async (ops: unknown[], extra: { atomic?: boolean; rev?: number | null; opId?: string | null; dry?: boolean } = {}) =>
  (await q("select public.elim_live_apply($1, $2::jsonb, $3, $4, $5::uuid, $6) as r", [
    T, JSON.stringify(ops), extra.atomic ?? false, extra.rev ?? null, extra.opId ?? null, extra.dry ?? false,
  ]))[0].r;
const ms = async (): Promise<Record<string, MatchLiveState>> =>
  (await q("select live_settings->'matchState' m from public.tournaments where id = $1", [T]))[0].m ?? {};
const rev = async (): Promise<number> => Number((await q("select live_revision from public.tournaments where id = $1", [T]))[0].live_revision);
const bracket = (n: number) => ({ graph: buildBracketGraph(n, graphDouble), seeds: seeds(n) });
const reset = async (matchState: Record<string, MatchLiveState>, opts: { double?: boolean; n?: number } = {}) => {
  graphDouble = opts.double ?? true;
  await q("delete from public.tournament_audit where tournament_id = $1", [T]);
  await q("delete from public.elim_checkpoints where tournament_id = $1", [T]);
  await q("delete from public.tournament_events where tournament_id = $1", [T]);
  await q("update public.tournaments set live_settings = $2::jsonb, status = 'active', live_state = 'in_progress' where id = $1", [
    T, JSON.stringify({ bracket: { ...bracket(opts.n ?? 8), drawNumber: 1 }, matchState }),
  ]);
};
const W = (w: 1 | 2, extra: Partial<MatchLiveState> = {}): MatchLiveState =>
  ({ status: "completed", winner: w, result: "normal", completedAt: "2026-10-01T10:00:00.000Z", ...extra }) as MatchLiveState;
const setWinner = (matchId: string, w: 1 | 2, extra: Record<string, unknown> = {}) =>
  ({ op: "patch_match", matchId, set: { status: "completed", winner: w, result: "normal", ...extra } });

// The app's view of the bracket.
const live = (m: Record<string, MatchLiveState>, n = 8) => buildLiveMatches(bracket(n) as any, m, [], "9-ball", CFG);
const who = (m: Record<string, MatchLiveState>, id: string, n = 8) => {
  const x = live(m, n).find((y) => y.id === id)!;
  return { p1: x.p1RegId ?? null, p2: x.p2RegId ?? null, winner: x.winner == null ? null : x.winner === 1 ? x.p1RegId : x.p2RegId };
};

before(async () => {
  const mod = await import(process.env.PGLITE_MODULE ?? "@electric-sql/pglite");
  db = new mod.PGlite();
  await db.exec(`
    create role authenticated; create role anon; create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select coalesce(nullif(current_setting('test.uid', true), ''), '${TD}')::uuid $$;
    create table public.profiles (id uuid primary key, id_auto bigint unique, role text default 'basic_user');
    create table public.tournaments (id bigint primary key, venue_id int, director_id int, tournament_format text not null,
      status text default 'active', live_state text default 'in_progress' not null, live_settings jsonb default '{}'::jsonb not null, updated_at timestamptz, completed_at timestamptz);
    create table public.tournament_players (id int primary key, tournament_id int, player_id int, player_uuid uuid, status text default 'checked_in');
    create table public.tournament_tables (id bigint primary key, tournament_id int, table_number int, status text default 'available' not null, label text not null default '');
    create table public.venue_owners (venue_id int, owner_id int, archived_at timestamptz);
    create table public.venue_directors (venue_id int, director_id int, archived_at timestamptz);
    create table public.tournament_events (id text primary key, tournament_id bigint not null, type text not null, text text default '' not null,
      actor_id bigint, payload jsonb, tx_id text, created_at timestamptz default now() not null);
    create function public.current_player_id() returns uuid language sql stable as $$ select null::uuid $$;
  `);
  await db.exec(cut(read("supabase/migrations/20260805120000_phase5_pending_accounts_registration.sql"), "create or replace function public.can_manage_tournament"));
  await db.exec(read("supabase/migrations/20260922120000_elim_live_apply.sql"));
  await db.exec(read("supabase/migrations/20260923120000_elim_assign_notify.sql"));
  await db.exec(read("supabase/migrations/20260926120000_elim_clear_table.sql"));
  await db.exec(read("supabase/migrations/20261017120000_elim_server_guards.sql"));
  await db.exec(read("supabase/migrations/20261018120000_elim_recovery_foundation.sql"));
  await db.exec(read("supabase/migrations/20261019120000_elim_undo_restore.sql"));
  await db.exec(readFileSync(join(ROOT, "supabase/migrations/20261021130000_elim_finish_redraw_recovery.sql"), "utf8")); // + latest recovery rules (20261021130000)
  await q(`insert into public.profiles values ('${TD}', 1, 'tournament_director'), ('${TD2}', 2, 'tournament_director')`);
  await q("insert into public.tournaments (id, venue_id, director_id, tournament_format) values ($1, 5, 1, 'double-elimination')", [T]);
  await q("insert into public.venue_directors values (5, 2, null)");
  await q("insert into public.tournament_tables values (71,$1,1,'available','Diamond'),(72,$1,2,'available',''),(73,$1,3,'available','')", [T]);
});
beforeEach(async () => { await asUser(TD); await reset({}); });

const undo = async (rev: number | null, dry = false) =>
  (await q("select public.elim_undo($1, $2, $3) as r", [T, rev, dry]))[0].r;
const restore = async (ck: number, rev: number | null, dry = false) =>
  (await q("select public.elim_restore($1, $2, $3, $4) as r", [T, ck, rev, dry]))[0].r;
const cps = async () => await q("select id, reason, label, milestone, revision from public.elim_checkpoints where tournament_id = $1 order by id", [T]);
const audits = async () => await q("select id, op, match_id, detail from public.tournament_audit where tournament_id = $1 order by id", [T]);
const opId = () => crypto.randomUUID();
const LIVE71 = { status: "in_progress", tableId: 71, startedAt: "2026-10-01T09:00:00.000Z" } as any;

// ══ UNDO ═════════════════════════════════════════════════════════════════════════════════
test("UNDO 1+2: undo the latest result change with nothing downstream → previous winner back", async () => {
  await reset({ W1M1: W(1), W1M2: W(1) });
  await call([setWinner("W1M1", 2)], { opId: opId() });
  const pre = await undo(null, true);
  assert.equal(pre.available, true);
  assert.equal(pre.undoing.op, "change_result");
  assert.deepEqual([pre.impact.cleared, pre.impact.changed], [[], ["W1M1"]]);
  const r = await undo(await rev());
  assert.equal(r.ok, true);
  assert.equal((await ms()).W1M1.winner, 1, "previous winner restored");
  assert.equal(who(await ms(), "W2M1").p1, 1);
});

test("UNDO 3: undo clears what depended on the op AND restores the results the op had cleared", async () => {
  // P1 won W1M1, then won W2M1. TD wrongly changes W1M1 → P2 (cascade clears W2M1). Undo → W2M1 back.
  await reset({ W1M1: W(1), W1M2: W(1), W2M1: W(1, { p1Score: 5, p2Score: 3 }) });
  await call([setWinner("W1M1", 2)], { opId: opId() });
  assert.equal((await ms()).W2M1.status, "scheduled", "cascade cleared it");
  const pre = await undo(null, true);
  assert.deepEqual(pre.impact.restoredResults, ["W2M1"], "the cleared result comes back");
  await undo(await rev());
  const m = await ms();
  assert.equal(m.W1M1.winner, 1);
  assert.equal(m.W2M1.status, "completed");
  assert.equal(who(m, "W2M1").winner, 1, "credited to the player who actually won it");
  assert.equal(m.W2M1.p1Score, 5);
});

test("UNDO 3b: step back through ops; undoing a first result clears what was played on top of it", async () => {
  await reset({ W1M1: LIVE71, W1M2: W(1) });
  await call([setWinner("W1M1", 1)], { opId: opId() });
  await call([setWinner("W2M1", 1)], { opId: opId() });            // the next match was then played
  await call([{ op: "set_queue", autoAssignMode: "balanced" }], { opId: opId() }); // not reversible → skipped
  const pre = await undo(null, true);
  assert.equal(pre.undoing.matchId, "W2M1", "the most recent reversible op");
  await undo(await rev());
  const pre2 = await undo(null, true);
  assert.equal(pre2.undoing.matchId, "W1M1", "step back one more");
  assert.deepEqual(pre2.impact.cleared, ["W1M1"]);
  await undo(await rev());
  const m = await ms();
  assert.equal(m.W1M1.status, "in_progress", "back to live");
  assert.equal(m.W1M1.winner, null);
});

test("UNDO 3c: undo of a winner when the next match was already played clears that later result (shown first)", async () => {
  await reset({ W1M1: LIVE71, W1M2: W(1) });
  await call([setWinner("W1M1", 1)], { opId: opId() });
  await q(`update public.tournaments set live_settings = jsonb_set(live_settings, '{matchState,W2M1}', '{"status":"completed","winner":1,"result":"normal"}') where id = $1`, [T]); // later result by another path
  const pre = await undo(null, true);
  assert.equal(pre.undoing.matchId, "W1M1");
  assert.ok(pre.impact.cleared.includes("W2M1"), "the dependent later result is cleared");
  await undo(await rev());
  assert.equal((await ms()).W2M1.status, "scheduled");
});

test("UNDO 4: refused when the match changed after the op (later activity depends on it)", async () => {
  await reset({ W1M1: LIVE71, W1M2: W(1) });
  await call([setWinner("W1M1", 1)], { opId: opId() });
  await q(`update public.tournaments set live_settings = jsonb_set(live_settings, '{matchState,W1M1,winner}', '2') where id = $1`, [T]);
  const pre = await undo(null, true);
  assert.equal(pre.available, false);
  assert.equal(pre.reason, "match_changed");
  await assert.rejects(undo(await rev()), (e: any) => e.message === "undo_unavailable" && e.detail === "match_changed");
});

test("UNDO 5: stale revision refused, nothing written; a real undo must carry the revision", async () => {
  await reset({ W1M1: W(1) });
  await call([setWinner("W1M1", 2)], { opId: opId() });
  const n = await rev();
  await asUser(TD2);
  await call([{ op: "assign", matchId: "W1M2", tableId: 72 }]);   // TD B → N+1
  await asUser(TD);
  const before = [await ms(), (await audits()).length, (await cps()).length];
  await assert.rejects(undo(n), (e: any) => e.message === "stale_revision" && e.detail === String(n + 1));
  assert.deepEqual([await ms(), (await audits()).length, (await cps()).length], before);
  await assert.rejects(undo(null), /revision_required/);
});

test("UNDO 6+7: exactly one audit row (undo → undone op) and a checkpoint of the pre-undo state", async () => {
  await reset({ W1M1: W(1) });
  await call([setWinner("W1M1", 2)], { opId: opId() });
  const a0 = (await audits()).length;
  const c0 = (await cps()).length;
  await undo(await rev());
  const rows = await audits();
  assert.equal(rows.length, a0 + 1);
  const u = rows[rows.length - 1];
  assert.equal(u.op, "undo");
  assert.equal(Number(u.detail.undoes), Number(rows[a0 - 1].id));
  assert.equal(u.detail.p1Name, "P1", "names stamped");
  const c = await cps();
  assert.equal(c.length, c0 + 1);
  assert.equal(c[c.length - 1].reason, "before_undo");
  const ev = await q("select type, actor_id from public.tournament_events where tournament_id = $1 and type = 'match_completed'", [T]);
  assert.ok(ev.length >= 2 && ev.every((e: any) => e.actor_id === null), "sanitized public activity");
});

test("UNDO 8: blocked undo (its table is in use) and finished events write nothing", async () => {
  await reset({ W1M1: LIVE71, W1M2: W(1) });
  await call([setWinner("W1M1", 1)], { opId: opId() });
  // Another match takes table 71 without an audited op (e.g. Auto Assign) → undo needs 71 back.
  await q(`update public.tournaments set live_settings = jsonb_set(live_settings, '{matchState,W1M3}', '{"status":"in_progress","tableId":71,"startedAt":"2026-10-01T09:30:00.000Z"}') where id = $1`, [T]);
  const pre = await undo(null, true);
  assert.equal(pre.available, false);
  assert.match(pre.reason, /^blocked:table_occupied/);
  const a0 = (await audits()).length;
  await assert.rejects(undo(await rev()), /undo_unavailable/);
  await q("update public.tournaments set status = 'completed', live_state = 'finished' where id = $1", [T]);
  assert.equal((await undo(null, true)).reason, "tournament_finished");
  await assert.rejects(undo(await rev()), /undo_unavailable/);
  assert.equal((await audits()).length, a0, "nothing written");
});

test("UNDO: nothing to undo on a fresh bracket", async () => {
  const pre = await undo(null, true);
  assert.deepEqual([pre.available, pre.reason], [false, "nothing_to_undo"]);
});

// ══ RESTORE ══════════════════════════════════════════════════════════════════════════════
test("RESTORE 1-4: back to a checkpoint — cleared later results return, unaffected matches kept", async () => {
  const m0: Record<string, MatchLiveState> = { W1M1: W(1), W1M2: W(1), W1M3: W(1), W1M4: W(1), W2M1: W(1), W2M2: W(1) };
  await reset(m0, { double: false });
  await call([setWinner("W1M1", 2)], { opId: opId() });      // checkpoint "before_correction" of m0
  const ck = (await cps()).find((c: any) => c.reason === "before_correction");
  const pre = await restore(ck.id, null, true);
  assert.deepEqual(pre.impact.restored, ["W2M1"], "the cleared semifinal result comes back");
  assert.deepEqual(pre.impact.changed, ["W1M1"]);
  assert.equal(pre.impact.reopensTournament, false);
  await restore(ck.id, await rev());
  const m = await ms();
  for (const id of Object.keys(m0)) assert.equal(m[id].winner, m0[id].winner, id);
  assert.equal(who(m, "W2M1").winner, 1, "credited to the right player");
});

test("RESTORE 5+9: stale revision refused; failed restore leaves everything unchanged", async () => {
  await reset({ W1M1: W(1) });
  await call([setWinner("W1M1", 2)], { opId: opId() });
  const ck = (await cps())[0];
  const n = await rev();
  await asUser(TD2);
  await call([setWinner("W1M2", 1)]);
  await asUser(TD);
  const before = [await ms(), (await audits()).length, (await cps()).length];
  await assert.rejects(restore(ck.id, n), /stale_revision/);
  await assert.rejects(restore(999999, await rev()), /checkpoint_not_found/);
  assert.deepEqual([await ms(), (await audits()).length, (await cps()).length], before);
});

test("RESTORE 6+7: pre-restore checkpoint + one audit row; the restore itself can be undone", async () => {
  await reset({ W1M1: W(1), W1M2: W(1), W2M1: W(1) });
  await call([setWinner("W1M1", 2)], { opId: opId() });
  const ck = (await cps())[0];
  const a0 = (await audits()).length;
  const r = await restore(ck.id, await rev());
  const rows = await audits();
  assert.equal(rows.length, a0 + 1);
  assert.equal(rows[rows.length - 1].op, "restore");
  assert.equal(Number(rows[rows.length - 1].detail.restoredCheckpoint), Number(ck.id));
  const preCk = (await cps()).find((c: any) => Number(c.id) === Number(r.checkpoint));
  assert.equal(preCk.reason, "before_restore");
  const u = await undo(null, true);
  assert.equal(u.undoing.op, "restore");
  await undo(await rev());
  assert.equal((await ms()).W1M1.winner, 2, "undo of the restore returns to the corrected state");
  assert.equal((await ms()).W2M1.status, "scheduled");
});

test("RESTORE 8: restoring a FINISHED tournament reopens it — and says so first", async () => {
  await reset({ W1M1: W(1), W1M2: W(1) });
  await call([setWinner("W1M1", 2)], { opId: opId() });
  const ck = (await cps())[0];
  await q("update public.tournaments set status = 'completed', live_state = 'finished' where id = $1", [T]);
  const fin = (await cps()).find((c: any) => c.reason === "finished");
  assert.ok(fin?.milestone, "finish milestone visible in the restore list");
  const same = await restore(fin.id, null, true);
  assert.equal(same.impact.reopensTournament, false, "restoring the identical finished state doesn't reopen");
  const pre = await restore(ck.id, null, true);
  assert.equal(pre.impact.reopensTournament, true);
  await restore(ck.id, await rev());
  const [t] = await q("select status, live_state from public.tournaments where id = $1", [T]);
  assert.deepEqual([t.status, t.live_state], ["active", "in_progress"]);
});

test("RESTORE: a checkpoint from an earlier draw without its bracket is refused; a pre-redraw milestone restores the old bracket", async () => {
  await reset({ W1M1: W(1) });
  await call([setWinner("W1M1", 2)], { opId: opId() });
  const ck = (await cps())[0];
  await q("update public.tournaments set live_settings = jsonb_set(jsonb_set(live_settings, '{bracket,drawNumber}', '2'), '{matchState}', '{}') where id = $1", [T]);
  await assert.rejects(restore(ck.id, await rev()), /different_draw/);
  const redraw = (await cps()).find((c: any) => c.reason === "before_redraw");
  const pre = await restore(redraw.id, null, true);
  assert.equal(pre.impact.replacesBracket, true);
  await restore(redraw.id, await rev());
  const [t] = await q("select live_settings #> '{bracket,drawNumber}' d from public.tournaments where id = $1", [T]);
  assert.equal(Number(t.d), 1, "earlier draw back");
});

// ══ CONCURRENCY ══════════════════════════════════════════════════════════════════════════
test("two TDs: A at revision N; B changes → N+1; A's Undo AND Restore refused, no partial writes", async () => {
  await reset({ W1M1: W(1), W1M2: W(1) });
  await call([setWinner("W1M1", 2)], { opId: opId() });
  const ck = (await cps())[0];
  const n = await rev();
  await asUser(TD2);
  await call([setWinner("W1M2", 2)], { opId: opId() });
  await asUser(TD);
  const snap = [await ms(), (await audits()).length, (await cps()).length, await rev()];
  await assert.rejects(undo(n), /stale_revision/);
  await assert.rejects(restore(ck.id, n), /stale_revision/);
  assert.deepEqual([await ms(), (await audits()).length, (await cps()).length, await rev()], snap);
});

// ══ AUDIT / PRIVILEGES ═══════════════════════════════════════════════════════════════════
test("audit history: newest-first pages with names; manager-only; RPCs not for anon", async () => {
  await reset({ W1M1: LIVE71 });
  for (let i = 0; i < 5; i++) await call([{ op: "patch_match", matchId: "W1M1", set: { p1Score: i + 1 } }], { opId: opId() });
  const page1 = await q("select id, op, detail from public.tournament_audit where tournament_id = $1 order by id desc limit 3", [T]);
  const page2 = await q("select id from public.tournament_audit where tournament_id = $1 and id < $2 order by id desc limit 3", [T, page1[2].id]);
  assert.equal(page1.length, 3);
  assert.equal(page2.length, 2);
  assert.ok(Number(page1[0].id) > Number(page1[1].id), "newest first");
  assert.equal(page1[0].op, "score");
  assert.deepEqual([page1[0].detail.p1Name, page1[0].detail.p2Name], ["P1", "P2"]);
  const [p] = await q(`select
    has_function_privilege('authenticated', 'public.elim_undo(bigint, bigint, boolean)', 'execute') as u,
    has_function_privilege('anon', 'public.elim_undo(bigint, bigint, boolean)', 'execute') as ua,
    has_function_privilege('authenticated', 'public.elim_restore(bigint, bigint, bigint, boolean)', 'execute') as r,
    has_function_privilege('anon', 'public.elim_restore(bigint, bigint, bigint, boolean)', 'execute') as ra,
    has_function_privilege('authenticated', 'public._elim_recovery_write(bigint, jsonb, jsonb, boolean, text, text, text, text, jsonb, jsonb, jsonb)', 'execute') as w,
    has_table_privilege('anon', 'public.elim_checkpoints', 'select') as ac`);
  assert.deepEqual(p, { u: true, ua: false, r: true, ra: false, w: false, ac: false });
});

test("non-managers can't undo / restore (server-checked)", async () => {
  await reset({ W1M1: W(1) });
  await call([setWinner("W1M1", 2)], { opId: opId() });
  const n = await rev();
  await q(`insert into public.profiles values ('00000000-0000-0000-0000-000000000009', 9, 'basic_user') on conflict do nothing`);
  await asUser("00000000-0000-0000-0000-000000000009");
  await assert.rejects(undo(n), /Not allowed/);
  await assert.rejects(restore(1, n, true), /Not allowed/);
});

test("checkpoints keep explicit nulls inside matches: an unchanged match never shows up as 'changed'", async () => {
  await reset({ W1M1: W(1), W1M3: { status: "completed", winner: 1, result: null, tableId: null, p1Score: null } as any });
  await call([setWinner("W1M1", 2)], { opId: opId() });
  const ck = (await cps())[0];
  const [row] = await q("select state from public.elim_checkpoints where id = $1", [ck.id]);
  assert.ok("result" in row.state.matchState.W1M3, "explicit null kept in the snapshot");
  const pre = await restore(ck.id, null, true);
  assert.deepEqual(pre.impact.changed, ["W1M1"], "only the match that really changed");
  assert.deepEqual(pre.impact.tablesChanged, []);
  assert.equal(pre.impact.matchesChanged, 1);
});
