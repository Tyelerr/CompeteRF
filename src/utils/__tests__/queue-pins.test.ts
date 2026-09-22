// src/utils/__tests__/queue-pins.test.ts
// Run: npx tsx --test src/utils/__tests__/queue-pins.test.ts
// Queue pins: TD overrides kept alongside an automatic mode.
/// <reference types="node" />

import { test } from "node:test";
import assert from "node:assert/strict";
import { AutoAssignMode, MatchLiveState, QueuePin } from "../../models/types/tournament-settings.types";
import { buildBracketGraph } from "../bracket.double";
import { raceConfigFromLiveSettings } from "../bracket.utils";
import { buildLiveMatches } from "../match.utils";
import { freeTables, planAutoAssign } from "../queue.utils";
import { applyPinsToTier, pinsWithMove, pinsWithout, sanitizePins, MAX_QUEUE_PINS } from "../queue-pins";
import { projectSchedule, ProjectedSchedule } from "../schedule.projection";
import { pinForMove, reorderScheduled } from "../schedule.reorder";

const ids = (xs: string[]) => xs;
const tier = (order: string[], pins: unknown, feeders: Record<string, string[]> = {}, last: string[] = []) =>
  applyPinsToTier(order, (x) => x, pins, { feedersOf: (id) => feeders[id] ?? [], pinnedLast: (id) => last.includes(id) });

test("sanitize: malformed entries dropped, one pin per match (latest wins)", () => {
  assert.deepEqual(sanitizePins(null), []);
  assert.deepEqual(sanitizePins("x"), []);
  const s = sanitizePins([
    { matchId: "A", place: "top" },
    { matchId: "B", place: "before" }, // missing anchor
    { matchId: "C", place: "before", anchorId: "C" }, // self anchor
    { matchId: "D", place: "sideways" },
    7,
    { matchId: "A", place: "after", anchorId: "X" }, // replaces A's first pin
  ]);
  assert.deepEqual(s, [{ matchId: "A", place: "after", anchorId: "X" }]);
});

test("single pins: before / after / top / bottom within a tier", () => {
  const base = ids(["A", "B", "C", "D", "E"]);
  assert.deepEqual(tier(base, [{ matchId: "D", place: "before", anchorId: "B" }]), ["A", "D", "B", "C", "E"]);
  assert.deepEqual(tier(base, [{ matchId: "A", place: "after", anchorId: "C" }]), ["B", "C", "A", "D", "E"]);
  assert.deepEqual(tier(base, [{ matchId: "E", place: "top" }]), ["E", "A", "B", "C", "D"]);
  assert.deepEqual(tier(base, [{ matchId: "A", place: "bottom" }]), ["B", "C", "D", "E", "A"]);
});

test("multiple interacting pins apply in stored order; a later conflicting pin wins", () => {
  const base = ids(["A", "B", "C", "D", "E"]);
  // E to top, then C before E → C, E, A, B, D
  assert.deepEqual(
    tier(base, [{ matchId: "E", place: "top" }, { matchId: "C", place: "before", anchorId: "E" }]),
    ["C", "E", "A", "B", "D"],
  );
  // conflicting pair (a would-be cycle): A before B, then B before A → the later one wins
  assert.deepEqual(
    tier(base, [{ matchId: "A", place: "after", anchorId: "B" }, { matchId: "B", place: "after", anchorId: "A" }]),
    ["A", "B", "C", "D", "E"],
  );
  assert.deepEqual(
    tier(base, [{ matchId: "D", place: "before", anchorId: "A" }, { matchId: "A", place: "before", anchorId: "D" }]),
    ["A", "D", "B", "C", "E"],
  );
  // deterministic: same input → same output
  const pins = [{ matchId: "B", place: "bottom" }, { matchId: "E", place: "after", anchorId: "A" }, { matchId: "C", place: "top" }];
  assert.deepEqual(tier(base, pins), tier(base, pins));
});

test("stale pins (match or anchor gone / other tier) are ignored, never fatal", () => {
  const base = ids(["A", "B", "C"]);
  assert.deepEqual(
    tier(base, [
      { matchId: "Z", place: "top" }, // match gone
      { matchId: "C", place: "before", anchorId: "Q" }, // anchor gone / in the other tier
      { matchId: "B", place: "top" },
    ]),
    ["B", "A", "C"],
  );
});

test("feeder safety: clamped below its feeders and above its dependents; GF2 stays last", () => {
  // X depends on B; Y depends on X
  const order = ids(["A", "B", "X", "C", "Y", "GF2"]);
  const feeders = { X: ["B"], Y: ["X"] };
  assert.deepEqual(tier(order, [{ matchId: "X", place: "top" }], feeders, ["GF2"]), ["A", "B", "X", "C", "Y", "GF2"]);
  assert.deepEqual(tier(order, [{ matchId: "X", place: "bottom" }], feeders, ["GF2"]), ["A", "B", "C", "X", "Y", "GF2"]);
  assert.deepEqual(tier(order, [{ matchId: "GF2", place: "top" }], feeders, ["GF2"]), order); // pin on GF2 ignored
  assert.deepEqual(tier(order, [{ matchId: "C", place: "after", anchorId: "GF2" }], feeders, ["GF2"]), order); // nothing after GF2
});

test("pinsWithMove: replaces the match's old pin, drops stale pins, caps the list", () => {
  const cur: QueuePin[] = [
    { matchId: "A", place: "top" },
    { matchId: "B", place: "before", anchorId: "GONE" },
    { matchId: "C", place: "bottom" },
  ];
  assert.deepEqual(pinsWithMove(cur, ["A", "B", "C", "D"], { matchId: "A", place: "after", anchorId: "D" }), [
    { matchId: "C", place: "bottom" },
    { matchId: "A", place: "after", anchorId: "D" },
  ]);
  const many = Array.from({ length: 40 }, (_, i) => ({ matchId: `M${i}`, place: "top" as const }));
  const capped = pinsWithMove(many, many.map((p) => p.matchId).concat("N"), { matchId: "N", place: "top" });
  assert.equal(capped.length, MAX_QUEUE_PINS);
  assert.equal(capped.at(-1)!.matchId, "N");
  assert.deepEqual(pinsWithout(cur, "A").map((p) => p.matchId), ["B", "C"]);
});

// ── Projection integration ─────────────────────────────────────────────────────
const DRAWN = "2026-09-01T10:00:00.000Z";
const NOW = Date.parse("2026-09-01T14:00:00.000Z");
const at = (m: number) => new Date(Date.parse(DRAWN) + m * 60000).toISOString();
const done = (w: 1 | 2, m: number): MatchLiveState => ({ status: "completed", winner: w, completedAt: at(m) });
const NAMES = Array.from({ length: 16 }, (_, i) => `P${i + 1}`);
const bracket: any = { generatedAt: DRAWN, graph: buildBracketGraph(16, true), seeds: NAMES.map((n, i) => ({ registrationId: i + 1, name: n, fargo: 500 })) };
const MS: Record<string, MatchLiveState> = {
  W1M1: done(1, 20), W1M2: done(2, 25), W1M3: done(1, 30), W1M4: done(1, 35),
  W1M5: done(2, 40), W1M6: done(1, 45), W1M7: done(1, 50), W1M8: done(2, 55),
  W2M1: done(1, 80), W2M2: { status: "in_progress", tableId: 1 }, L1M1: done(1, 90), L1M2: { status: "scheduled", tableId: 2 },
};
const matches = buildLiveMatches(bracket, MS, [], "9-ball", raceConfigFromLiveSettings({ raceMode: "fixed" }));
const project = (mode: AutoAssignMode, queuePins: unknown = [], queueOrder: string[] = []) =>
  projectSchedule({ bracket, matches, matchState: MS, mode, queueOrder, now: NOW, queuePins });
const order = (s: ProjectedSchedule) => s.scheduled.map((p) => p.matchId);
const invariants = (s: ProjectedSchedule) => {
  const n = s.readyQueue.length;
  assert.deepEqual(order(s).slice(0, n), s.readyQueue.map((e) => e.match.id), "ready tier first = readyQueue");
  for (const p of s.scheduled.slice(n)) assert.equal(p.lifecycle, "waiting");
  const pos = new Map(order(s).map((id, i) => [id, i]));
  for (const p of s.scheduled)
    for (const f of p.eligibility.blockedBy) if (pos.has(f)) assert.ok(pos.get(f)! < pos.get(p.matchId)!, `${p.matchId} after ${f}`);
  const gf2 = s.scheduled.findIndex((p) => p.conditional === "possible");
  if (gf2 >= 0) assert.equal(gf2, s.scheduled.length - 1, "GF2 last");
  for (const p of s.scheduled) assert.equal(p.eligibility.ready, p.lifecycle === "ready");
};

test("Keep-mode pin reproduces the requested move (up/down/top/bottom) and keeps the mode", () => {
  for (const mode of ["balanced", "winnersFirst", "losersFirst", "longestWait"] as AutoAssignMode[]) {
    const base = project(mode);
    for (const i of [1, base.readyQueue.length + 1, base.readyQueue.length + 3]) {
      const id = base.scheduled[i].matchId;
      for (const mv of ["up", "down", "top", "bottom"] as const) {
        const pin = pinForMove(base.scheduled, id, mv);
        const manual = reorderScheduled(base.scheduled, id, mv);
        assert.equal(pin == null, manual == null, `${mode} ${id} ${mv}`);
        if (!pin) continue;
        const s = project(mode, [pin]);
        invariants(s);
        assert.equal(s.mode, mode);
        if (mv === "up" || mv === "down") assert.deepEqual(order(s), manual, `${mode} ${id} ${mv}`);
        else {
          // A pin moves ONLY its own match (other matches keep the mode's order), so top/bottom
          // land at the tier edge or directly next to the nearest blocking feeder / dependent.
          const o = order(s);
          const k = o.indexOf(id);
          const me = s.byId[id];
          const n = s.readyQueue.length;
          const tierStart = me.eligibility.ready ? 0 : n;
          const tierEnd = me.eligibility.ready ? n - 1 : o.length - 1 - (s.scheduled.at(-1)?.conditional === "possible" ? 1 : 0);
          if (mv === "top") assert.ok(k === tierStart || me.eligibility.blockedBy.includes(o[k - 1]), `${mode} ${id} top`);
          else assert.ok(k === tierEnd || s.byId[o[k + 1]].eligibility.blockedBy.includes(id), `${mode} ${id} bottom`);
          assert.equal(pinForMove(s.scheduled, id, mv), null, "already at the edge afterwards");
        }
      }
    }
  }
});

test("Auto Assign respects mode order + pins; Manual ignores pins", () => {
  const base = project("losersFirst");
  const last = base.readyQueue.at(-1)!.match.id;
  const pinned = project("losersFirst", [{ matchId: last, place: "top" }]);
  assert.equal(pinned.readyQueue[0].match.id, last);
  const tables: any[] = [{ id: 7, tournament_id: 1, table_number: 1, status: "available", is_streaming: false }];
  assert.deepEqual(planAutoAssign(pinned.readyQueue, freeTables(tables, {})), [{ matchId: last, tableId: 7 }]);
  // Manual: queueOrder is authoritative, pins are ignored
  assert.deepEqual(order(project("manual", [{ matchId: last, place: "top" }])), order(project("manual")));
});

test("pins can't lift Waiting above Ready or pass a feeder; bad pins never break generation (fuzz)", () => {
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  const allIds = bracket.graph.map((n: any) => n.id);
  for (const mode of ["balanced", "winnersFirst", "losersFirst", "longestWait"] as AutoAssignMode[]) {
    for (let run = 0; run < 150; run++) {
      const pins: unknown[] = Array.from({ length: 1 + Math.floor(rnd() * 12) }, () => {
        const r = rnd();
        if (r < 0.05) return "garbage";
        const matchId = allIds[Math.floor(rnd() * allIds.length)];
        const place = ["before", "after", "top", "bottom"][Math.floor(rnd() * 4)];
        return place === "top" || place === "bottom" ? { matchId, place } : { matchId, place, anchorId: allIds[Math.floor(rnd() * allIds.length)] };
      });
      const s = project(mode, pins);
      invariants(s);
      assert.deepEqual([...order(s)].sort(), [...order(project(mode))].sort(), "same matches, only reordered");
    }
  }
});
