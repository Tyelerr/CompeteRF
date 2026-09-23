// src/utils/__tests__/match-actions.test.ts
// Run: npx tsx --test src/utils/__tests__/match-actions.test.ts
// Which Match Actions a NOT-STARTED match offers — the rule the MatchActionsModal menu is built
// from, for a Ready queue row (no table) and for a match parked on a table.
/// <reference types="node" />

import { test } from "node:test";
import assert from "node:assert/strict";
import { MatchActionKey, scheduledMatchActions } from "../match-actions";
import { buildClearTableOps } from "../clear-table";

const ready = (canClearTable = true) => scheduledMatchActions({ tableId: null, canClearTable });
const assigned = (canClearTable = true) => scheduledMatchActions({ tableId: 38, canClearTable });

test("Ready / unassigned row: Assign Table, Forfeit, Withdraw — the full admin set minus table-only actions", () => {
  assert.deepEqual(ready(), ["assignTable", "forfeit", "withdraw"]);
});

test("Ready row never offers Clear Table (no table) or Start (a start needs a table)", () => {
  assert.equal(ready().includes("clearTable"), false);
  assert.equal(ready().includes("start"), false);
  assert.equal(ready().includes("changeTable"), false);
});

test("assigned but not started: Start, Change Table, Clear Table, Forfeit, Withdraw", () => {
  assert.deepEqual(assigned(), ["start", "changeTable", "clearTable", "forfeit", "withdraw"]);
});

test("Set Time Limit is never offered on a not-started match (Ready or assigned)", () => {
  for (const keys of [ready(), assigned()])
    assert.equal((keys as string[]).some((k) => /time|timer/i.test(k)), false, keys.join(","));
});

test("Clear Table is dropped when the screen provides no handler; nothing else changes", () => {
  assert.deepEqual(assigned(false), ["start", "changeTable", "forfeit", "withdraw"]);
  assert.deepEqual(ready(false), ["assignTable", "forfeit", "withdraw"]);
});

test("Forfeit and Withdraw are offered in BOTH states — a queued match keeps full control", () => {
  for (const keys of [ready(), assigned()]) {
    assert.ok(keys.includes("forfeit"));
    assert.ok(keys.includes("withdraw"));
  }
});

test("exactly one table action per state (no duplicate Assign/Change entries)", () => {
  for (const keys of [ready(), assigned()]) {
    const tableActions = keys.filter((k) => k === "assignTable" || k === "changeTable");
    assert.equal(tableActions.length, 1, keys.join(","));
  }
});

test("after Clear Table the row is Ready again and offers the Ready action set", () => {
  // Clear Table writes only the unassign (+ manual order) — the match is then table-less…
  const ops = buildClearTableOps({ matchId: "W2M1", mode: "longestWait", queueOrder: [] });
  assert.deepEqual(ops, [{ op: "unassign", matchId: "W2M1" }]);
  // …so the very same rule now yields the Ready set, with Forfeit/Withdraw/Assign still there.
  const after = scheduledMatchActions({ tableId: null, canClearTable: true });
  assert.deepEqual(after, ["assignTable", "forfeit", "withdraw"]);
});

test("the key set is closed — a new action can't leak in unnoticed", () => {
  const allowed: MatchActionKey[] = ["start", "assignTable", "changeTable", "clearTable", "forfeit", "withdraw"];
  for (const keys of [ready(), assigned(), ready(false), assigned(false)])
    for (const k of keys) assert.ok(allowed.includes(k), k);
});
