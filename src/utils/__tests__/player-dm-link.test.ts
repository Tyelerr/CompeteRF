// src/utils/__tests__/player-dm-link.test.ts
// Run: npx tsx --test src/utils/__tests__/player-dm-link.test.ts
// "Message Player" opens the existing composer with the right player preselected.
/// <reference types="node" />

import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPlayerDmLink } from "../player-dm-link";

const base = {
  profileId: "f86e562e-999d-49f2-8c91-93b20c2a5ef2",
  playerName: "Teat Aniyah",
  tournamentId: 2595,
  tournamentName: "Test 2 elim 1",
  tableLabel: "Diamond 1",
};

test("preselects the player and carries the match context", () => {
  const link = buildPlayerDmLink(base)!;
  const q = new URLSearchParams(link.slice(link.indexOf("?") + 1));
  assert.ok(link.startsWith("/compose-message?"), link);
  assert.equal(q.get("toId"), base.profileId, "recipient is the player, not a TD");
  assert.equal(q.get("toName"), "Teat Aniyah");
  assert.equal(q.get("context"), "Test 2 elim 1 — Diamond 1");
  assert.equal(q.get("tournamentId"), "2595");
});

test("a guest with no account cannot be messaged", () => {
  assert.equal(buildPlayerDmLink({ ...base, profileId: null }), null);
  assert.equal(buildPlayerDmLink({ ...base, profileId: undefined }), null);
  assert.equal(buildPlayerDmLink({ ...base, profileId: "" }), null);
});

test("context degrades gracefully without a table", () => {
  const link = buildPlayerDmLink({ ...base, tableLabel: null })!;
  assert.equal(new URLSearchParams(link.slice(link.indexOf("?") + 1)).get("context"), "Test 2 elim 1");
});

test("names with spaces and punctuation survive the round trip", () => {
  const link = buildPlayerDmLink({ ...base, playerName: "Bob O'Hara Jr.", tableLabel: "234 2" })!;
  const q = new URLSearchParams(link.slice(link.indexOf("?") + 1));
  assert.equal(q.get("toName"), "Bob O'Hara Jr.");
  assert.equal(q.get("context"), "Test 2 elim 1 — 234 2");
});
