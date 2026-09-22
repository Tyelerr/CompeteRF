// supabase/tests/assignment_notify.test.ts
// Run: npx tsx --test supabase/tests/assignment_notify.test.ts
//
// The REAL server notifier (supabase/functions/_shared/notify.ts → notifyMatchAssignment) run
// against an in-memory Supabase stand-in and a stubbed Expo push endpoint:
//   1. recipients: 4-player tournament, match A = players 1 & 2 → only 1 & 2 get the in-app
//      notification + push; players 3 & 4 get nothing and their tokens are never sent to
//   2. wording (assignment_message.ts): tournament-name title, fallback title, equal / unequal
//      race, table changed
//   3. dedupe by assignedAt unchanged: same assignment twice → sent once; new assignedAt on a
//      different table → one "Table Changed" message
/// <reference types="node" />

import { test, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { buildBracketGraph } from "../../src/utils/bracket.double";
import { resolveMatchSides } from "../functions/_shared/bracket";
import { buildAssignmentMessage, FALLBACK_TITLE } from "../functions/_shared/assignment_message";
// notify.ts is Deno code (".ts" import specifiers) and supabase/functions is excluded from the app
// tsconfig, so load it at runtime (tsx resolves it) instead of pulling it into the app type-check.
type NotifyFn = (admin: unknown, tournamentId: number, matchId: string) =>
  Promise<{ skipped?: string; results: { registrationId: number; status: string }[] }>;
const NOTIFY_PATH = "../functions/_shared/notify";
let notifyMatchAssignment: NotifyFn;
before(async () => {
  ({ notifyMatchAssignment } = await import(NOTIFY_PATH));
});

// ── Minimal in-memory Supabase query builder (only what notify.ts uses) ─────────────────────
type Row = Record<string, any>;
function fakeAdmin(tables: Record<string, Row[]>) {
  let seq = 1000;
  const builder = (table: string) => {
    const filters: ((r: Row) => boolean)[] = [];
    let mode: "select" | "insert" | "update" | "upsert" = "select";
    let payload: Row | null = null;
    let upsertOpts: { onConflict: string; ignoreDuplicates?: boolean } | null = null;
    let returning = false;
    let orderBy: { col: string; asc: boolean } | null = null;
    let limitN: number | null = null;
    const rows = () => (tables[table] ??= []);
    const run = (): Row[] => {
      if (mode === "insert") {
        const r = { id: ++seq, created_at: new Date(Date.now() + seq).toISOString(), ...payload };
        rows().push(r);
        return [r];
      }
      if (mode === "upsert") {
        const keys = upsertOpts!.onConflict.split(",");
        const hit = rows().find((r) => keys.every((k) => r[k] === payload![k]));
        if (hit) return upsertOpts!.ignoreDuplicates ? [] : [Object.assign(hit, payload)];
        const r = { id: ++seq, created_at: new Date(Date.now() + seq).toISOString(), ...payload };
        rows().push(r);
        return [r];
      }
      let out = rows().filter((r) => filters.every((f) => f(r)));
      if (mode === "update") { out.forEach((r) => Object.assign(r, payload)); return out; }
      if (orderBy) out = [...out].sort((a, b) => (a[orderBy!.col] < b[orderBy!.col] ? -1 : 1) * (orderBy!.asc ? 1 : -1));
      if (limitN != null) out = out.slice(0, limitN);
      return out;
    };
    const api: any = {
      select: () => { returning = true; return api; },
      insert: (p: Row) => { mode = "insert"; payload = p; return api; },
      update: (p: Row) => { mode = "update"; payload = p; return api; },
      upsert: (p: Row, o: any) => { mode = "upsert"; payload = p; upsertOpts = o; return api; },
      eq: (c: string, v: any) => { filters.push((r) => r[c] === v); return api; },
      in: (c: string, vs: any[]) => { filters.push((r) => vs.includes(r[c])); return api; },
      order: (col: string, o?: { ascending?: boolean }) => { orderBy = { col, asc: o?.ascending !== false }; return api; },
      limit: (n: number) => { limitN = n; return api; },
      maybeSingle: async () => ({ data: run()[0] ?? null, error: null }),
      then: (res: any, rej: any) => Promise.resolve({ data: run(), error: null }).then(res, rej),
    };
    void returning;
    return api;
  };
  return { from: builder };
}

// ── Fixture: 4 registered players, single elimination ──────────────────────────────────────
const TID = 77;
const graph = buildBracketGraph(4, false);
// Put registrations 1 & 2 into match A (the first round-1 match), 3 & 4 into the other.
const MATCH_A = graph[0].id;
const probe = resolveMatchSides({ graph, seeds: [0, 1, 2, 3].map((i) => ({ registrationId: i, name: `s${i}` })) } as any, {}, MATCH_A)!;
const seedFor: number[] = [];
seedFor[probe.p1!.registrationId] = 1;
seedFor[probe.p2!.registrationId] = 2;
let nextOther = 3;
for (let i = 0; i < 4; i++) if (seedFor[i] == null) seedFor[i] = nextOther++;
const NAMES: Record<number, string> = { 1: "Test Hhhh", 2: "Teat Aniyah", 3: "Cy Third", 4: "Di Fourth" };
const seeds = [0, 1, 2, 3].map((i) => ({ registrationId: 500 + seedFor[i], name: NAMES[seedFor[i]], fargo: 500 }));
const TOKENS: Record<number, string[]> = {
  1: ["tok-p1-iphone", "tok-p1-ipad"], 2: ["tok-p2"], 3: ["tok-p3"], 4: ["tok-p4-a", "tok-p4-b"],
};

let db: Record<string, Row[]>;
let pushes: { to: string; title: string; body: string }[];
const liveSettings = (ms: Row, extra: Row = {}) => ({
  bracket: { graph, seeds, drawNumber: 1 }, matchState: ms, raceMode: "fixed", fixedRaceWinners: 5, ...extra,
});
function seed(name: string | null, ms: Row, extra: Row = {}) {
  db = {
    tournaments: [{ id: TID, name, tournament_format: "single_elimination", live_settings: liveSettings(ms, extra) }],
    tournament_tables: [
      { id: 38, tournament_id: TID, table_number: 1, label: "Diamond" },
      { id: 46, tournament_id: TID, table_number: 6, label: "Diamond" },
    ],
    tournament_players: [1, 2, 3, 4].map((n) => ({ id: 500 + n, tournament_id: TID, player_id: 100 + n, status: "checked_in" })),
    profiles: [1, 2, 3, 4].map((n) => ({ id: `uuid-${n}`, id_auto: 100 + n })),
    push_tokens: [1, 2, 3, 4].flatMap((n) => TOKENS[n].map((token) => ({ user_id: `uuid-${n}`, token, is_active: true }))),
    notification_preferences: [],
    notifications: [],
    match_assignment_notifications: [],
  };
}
beforeEach(() => {
  pushes = [];
  (globalThis as any).fetch = async (_url: string, init: any) => {
    const msgs = JSON.parse(init.body);
    pushes.push(...msgs);
    return { json: async () => ({ data: msgs.map(() => ({ status: "ok" })) }) };
  };
});
const assign = (tableId: number, at: string) => ({ status: "scheduled", tableId, assignedAt: at });
const setMs = (ms: Row) => { db.tournaments[0].live_settings.matchState = ms; };

// ── 1. Recipients ───────────────────────────────────────────────────────────────────────────
test("4-player tournament: only the two players in the match are notified; 3 & 4 get nothing", async () => {
  seed("Test 2 elim 1", { [MATCH_A]: assign(38, "2026-09-22T15:00:00.000Z") });
  const out = await notifyMatchAssignment(fakeAdmin(db) as any, TID, MATCH_A);

  assert.deepEqual(out.results.map((r) => r.registrationId).sort(), [501, 502]);
  assert.deepEqual(db.notifications.map((n) => n.user_id).sort(), [101, 102], "in-app: players 1 & 2 only");
  assert.deepEqual(pushes.map((p) => p.to).sort(), [...TOKENS[1], ...TOKENS[2]].sort(), "push: players 1 & 2's own devices");
  for (const t of [...TOKENS[3], ...TOKENS[4]]) assert.equal(pushes.some((p) => p.to === t), false, `never sent to ${t}`);
  assert.equal(db.notifications.some((n) => n.user_id === 103 || n.user_id === 104), false);
  assert.deepEqual(db.match_assignment_notifications.map((r) => r.recipient_id_auto).sort(), [101, 102]);
});

test("inactive tokens are never sent to; Tournament Updates off → in-app only", async () => {
  seed("Test 2 elim 1", { [MATCH_A]: assign(38, "2026-09-22T15:00:00.000Z") });
  db.push_tokens.find((t) => t.token === "tok-p1-ipad")!.is_active = false;
  db.notification_preferences.push({ user_id: "uuid-2", tournament_updates: false });
  await notifyMatchAssignment(fakeAdmin(db) as any, TID, MATCH_A);
  assert.deepEqual(pushes.map((p) => p.to), ["tok-p1-iphone"]);
  assert.equal(db.notifications.length, 2, "in-app still created for both players");
});

// ── 2. Wording ──────────────────────────────────────────────────────────────────────────────
test("wording: title is the tournament name; unequal race lists both players", () => {
  const m = buildAssignmentMessage({
    tournamentName: "Test 2 elim 1", kind: "assigned", tableLabel: "Diamond 1", opponentName: "Test Hhhh",
    raceText: "Test Hhhh — Race to 5\nTeat Aniyah — Race to 4",
  });
  assert.equal(m.title, "Test 2 elim 1");
  assert.equal(m.body, "Table Assigned: Diamond 1\nvs Test Hhhh\n\nTest Hhhh — Race to 5\nTeat Aniyah — Race to 4\n\nReport to your table when ready.");
});

test("wording: equal race is a single 'Race to N' line", () => {
  const m = buildAssignmentMessage({ tournamentName: "Friday 9-Ball", kind: "assigned", tableLabel: "Table 3", opponentName: "John Smith", raceText: "Race to 7" });
  assert.equal(m.body, "Table Assigned: Table 3\nvs John Smith\n\nRace to 7\n\nReport to your table when ready.");
});

test("wording: table changed", () => {
  const m = buildAssignmentMessage({ tournamentName: "Test 2 elim 1", kind: "table_changed", tableLabel: "Diamond 6", opponentName: "John Smith", raceText: "Race to 5" });
  assert.equal(m.title, "Test 2 elim 1");
  assert.equal(m.body, "Table Changed: Diamond 6\nvs John Smith\nRace to 5");
});

test("wording: 'Compete' only as the fallback title", () => {
  for (const name of [null, undefined, "", "   "])
    assert.equal(buildAssignmentMessage({ tournamentName: name, kind: "assigned", tableLabel: "T1", opponentName: "X", raceText: "Race to 5" }).title, FALLBACK_TITLE);
  assert.equal(FALLBACK_TITLE, "Compete");
});

test("wording end-to-end through the notifier: tournament title, opponent per recipient, no old phrasing", async () => {
  seed("Test 2 elim 1", { [MATCH_A]: assign(38, "2026-09-22T15:00:00.000Z") });
  await notifyMatchAssignment(fakeAdmin(db) as any, TID, MATCH_A);
  const byTo = (t: string) => pushes.find((p) => p.to === t)!;
  assert.equal(byTo("tok-p1-iphone").title, "Test 2 elim 1");
  assert.equal(byTo("tok-p1-iphone").body, "Table Assigned: Diamond 1\nvs Teat Aniyah\n\nRace to 5\n\nReport to your table when ready.");
  assert.match(byTo("tok-p2").body, /^Table Assigned: Diamond 1\nvs Test Hhhh\n/);
  for (const p of pushes) {
    assert.doesNotMatch(p.body, /You have been assigned|Table assigned:/);
    assert.equal(p.body.split("Diamond 1").length - 1, 1, "table named once");
  }
  assert.equal(db.notifications[0].title, "Test 2 elim 1", "in-app uses the same title");

  seed(null, { [MATCH_A]: assign(38, "2026-09-22T15:00:00.000Z") });
  pushes = [];
  await notifyMatchAssignment(fakeAdmin(db) as any, TID, MATCH_A);
  assert.ok(pushes.every((p) => p.title === "Compete"));
});

// ── 3. Dedupe by assignedAt (unchanged) ─────────────────────────────────────────────────────
test("dedupe: the same assignment (same assignedAt) is sent once, however often it is triggered", async () => {
  seed("Test 2 elim 1", { [MATCH_A]: assign(38, "2026-09-22T15:00:00.000Z") });
  const admin = fakeAdmin(db) as any;
  await notifyMatchAssignment(admin, TID, MATCH_A);
  const second = await notifyMatchAssignment(admin, TID, MATCH_A);
  const third = await notifyMatchAssignment(admin, TID, MATCH_A);
  assert.ok([...second.results, ...third.results].every((r) => r.status === "duplicate"));
  assert.equal(db.notifications.length, 2);
  assert.equal(pushes.length, TOKENS[1].length + TOKENS[2].length);
  assert.equal(db.match_assignment_notifications.length, 2);
});

test("dedupe: a new assignedAt on a different table → exactly one 'Table Changed' per player", async () => {
  seed("Test 2 elim 1", { [MATCH_A]: assign(38, "2026-09-22T15:00:00.000Z") });
  const admin = fakeAdmin(db) as any;
  await notifyMatchAssignment(admin, TID, MATCH_A);
  pushes = [];
  setMs({ [MATCH_A]: assign(46, "2026-09-22T15:10:00.000Z") });
  await notifyMatchAssignment(admin, TID, MATCH_A);
  await notifyMatchAssignment(admin, TID, MATCH_A); // replay
  assert.equal(db.notifications.length, 4);
  assert.equal(pushes.length, TOKENS[1].length + TOKENS[2].length);
  assert.ok(pushes.every((p) => p.body.startsWith("Table Changed: Diamond 6\nvs ")));
  assert.deepEqual(db.match_assignment_notifications.map((r) => r.kind).sort(), ["assigned", "assigned", "table_changed", "table_changed"]);
});

test("not assigned / no table → nothing sent", async () => {
  seed("Test 2 elim 1", { [MATCH_A]: { status: "scheduled" } });
  const out = await notifyMatchAssignment(fakeAdmin(db) as any, TID, MATCH_A);
  assert.equal(out.skipped, "not_assigned");
  assert.equal(db.notifications.length + pushes.length, 0);
});
