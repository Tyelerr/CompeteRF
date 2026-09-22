// src/utils/__tests__/live-entries.test.ts
// Run: npx tsx --test src/utils/__tests__/live-entries.test.ts
// Regression: a Live entry that came only from get_my_live_tournament carried the
// TOURNAMENT id in `id`, which the player hook used as the registration id.
/// <reference types="node" />

import { test } from "node:test";
import assert from "node:assert/strict";
import { PlayerTournament } from "../../models/types/registration.types";
import { liveListNeedsResync, mergeLiveEntries, registrationIdOf } from "../live-entries";
import { buildBracketGraph } from "../bracket.double";
import { buildLiveMatches } from "../match.utils";

const TOURNAMENT_ID = 2595;
const MY_REG_ID = 1001;

const tournament = (live_state: string, extra: Record<string, unknown> = {}) => ({
  id: TOURNAMENT_ID,
  name: "Test 2 elim 1",
  game_type: "9-ball",
  tournament_format: "double-elimination",
  tournament_date: "2026-09-21",
  status: "active",
  live_state,
  ...extra,
});
// The player's own registration row, fetched BEFORE the TD started the event (stale).
const staleRow: PlayerTournament = {
  id: MY_REG_ID,
  status: "checked_in" as any,
  registered_at: "2026-09-20T10:00:00Z",
  eliminated_at: null,
  tournament: tournament("registration_closed"),
};
// get_my_live_tournament after go-live: id is the TOURNAMENT id.
const rpcEntry: PlayerTournament = {
  id: TOURNAMENT_ID,
  status: "registered" as any,
  registered_at: "",
  eliminated_at: null,
  tournament: tournament("in_progress", { gameplay_started_at: "2026-09-21T18:00:00Z" }),
};

test("go-live with a stale registration list: the live entry keeps the REGISTRATION id", () => {
  const live = mergeLiveEntries([], [rpcEntry], [staleRow]);
  assert.equal(live.length, 1);
  assert.equal(live[0].id, MY_REG_ID); // was TOURNAMENT_ID before the fix
  assert.equal(registrationIdOf(live[0]), MY_REG_ID);
  assert.equal(live[0].tournament?.live_state, "in_progress"); // fresh fields from the RPC
  assert.equal(live[0].tournament?.gameplay_started_at, "2026-09-21T18:00:00Z");
  assert.equal(live[0].liveRpcOnly, undefined);
  assert.equal(liveListNeedsResync([], [rpcEntry]), true); // → refetch the registration rows
});

test("RPC-only entry (no registration row loaded) never exposes the tournament id as a registration id", () => {
  const live = mergeLiveEntries([], [rpcEntry], []);
  assert.equal(live[0].liveRpcOnly, true);
  assert.equal(registrationIdOf(live[0]), null);
});

test("fresh registration list wins unchanged; no resync needed", () => {
  const freshRow = { ...staleRow, tournament: tournament("in_progress") };
  const live = mergeLiveEntries([freshRow], [rpcEntry], [freshRow]);
  assert.equal(live[0], freshRow);
  assert.equal(liveListNeedsResync([freshRow], [rpcEntry]), false);
});

test("with the fix the player's current match is found; with the old id it was not", () => {
  const seeds = [MY_REG_ID, 1002, 1003, 1004].map((registrationId, i) => ({ registrationId, name: `P${i}`, fargo: 500 }));
  const bracket: any = { generatedAt: "2026-09-21T18:00:00Z", graph: buildBracketGraph(4, true), seeds };
  const matches = buildLiveMatches(bracket, {}, [], "9-ball", {
    mode: "fixed", fixedWinners: 5, groups: [], diffMin: 0, diffPerGame: 0, diffMax: null,
  });
  const mine = (regId: number | null) => matches.filter((m) => m.p1RegId === regId || m.p2RegId === regId);
  const fixed = registrationIdOf(mergeLiveEntries([], [rpcEntry], [staleRow])[0]);
  assert.deepEqual(mine(fixed).map((m) => m.id), ["W1M1"]);
  assert.deepEqual(mine(rpcEntry.id).map((m) => m.id), []); // the old behavior: no current match
});
