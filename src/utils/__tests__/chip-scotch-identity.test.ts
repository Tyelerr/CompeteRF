// src/utils/__tests__/chip-scotch-identity.test.ts
// Run: npx tsx --test src/utils/__tests__/chip-scotch-identity.test.ts
// Scotch Doubles TEAM identity across save → reload (chip.team-identity), the team-level
// dropout rule, "(You)" for either teammate, and basic Chip history credit on the profile
// (utils/profile-chip-results). The server-side pieces (captain promotion, explicit Remove Team,
// claim linkage, get_player_chip_results) are verified by the migration's rolled-back SQL test.
/// <reference types="node" />

import { test } from "node:test";
import assert from "node:assert/strict";
import { entryToRow, rowToEntry } from "../../models/services/chip.rows";
import {
  chipEntryIncludesProfile,
  entryRegInactive,
  teamIdFromEntryId,
  teamMemberRemovalKind,
  TeamRosterIdentity,
  withTeamIdentity,
} from "../../models/services/chip.team-identity";
import {
  addTables,
  emptyChipState,
  recordWinner,
  settleChipState,
  startAllMatches,
  startChipTournament,
  undoLastActions,
  withRestorePoint,
} from "../../models/services/chip.engine";
import { chipResultLine, ChipResultRow, mergeChipResults } from "../profile-chip-results";
import { ChipEntry } from "../../models/types/chip.types";
import { PlayerTournament } from "../../models/types/registration.types";

// A started team entry exactly as rosterTeamToEntry + materialize leave it (captain P1, partner P2).
const teamEntry = (teamId: number, p1: number, p2: number | null, over: Partial<ChipEntry> = {}): ChipEntry =>
  ({
    id: `team_${teamId}`,
    p1Name: `Cap${teamId}`, p1Fargo: 500, p1Phone: null,
    p1ProfileId: p1, p1PlayerId: `uuid-${p1}`,
    p2Name: `Par${teamId}`, p2Fargo: 480,
    p2ProfileId: p2, p2PlayerId: p2 != null ? `uuid-${p2}` : `uuid-pending-${teamId}`,
    teamFargo: 980, startChips: 3, chips: 3, paid: true, checkedIn: true, paidSidePots: [],
    status: "queued", wins: 0, losses: 0, streak: 0, bestStreak: 0, eliminations: 0,
    createdAt: new Date().toISOString(),
    isTeam: true, teamId, teamName: "Desert Sharks", p1MemberId: teamId * 10 + 1, p2MemberId: teamId * 10 + 2,
    teamLocked: true, teamApproved: true, p1FargoVerified: true, p2FargoVerified: true,
    ...over,
  }) as ChipEntry;
const roster = (e: ChipEntry, over: Partial<TeamRosterIdentity> = {}): TeamRosterIdentity => ({
  id: e.teamId!,
  name: "Desert Sharks",
  locked: true,
  approved: true,
  members: [
    { member_id: e.p1MemberId!, role: "captain", invite_status: "accepted", player_id: e.p1ProfileId ?? null, player_uuid: e.p1PlayerId ?? null, fargo_verified: true },
    { member_id: e.p2MemberId!, role: "member", invite_status: "accepted", player_id: e.p2ProfileId ?? null, player_uuid: e.p2PlayerId ?? null, fargo_verified: true },
  ],
  ...over,
});
// Save → reload exactly as chipService does (entryToRow → DB row → rowToEntry).
const reload = (e: ChipEntry): ChipEntry => rowToEntry(JSON.parse(JSON.stringify(entryToRow(1, e))));

test("C: a reload alone loses the team identity (the bug) — withTeamIdentity restores it", () => {
  const e = teamEntry(7, 101, 102);
  const raw = reload(e);
  assert.equal(raw.teamId ?? null, null, "teamId is not a chip_entries column");
  assert.ok(!raw.isTeam);
  const back = withTeamIdentity(raw, roster(e));
  assert.equal(back.teamId, 7);
  assert.equal(back.isTeam, true);
  assert.equal(back.teamName, "Desert Sharks");
});

test("D: both member ids / profile ids / player ids survive save → reload", () => {
  const e = teamEntry(8, 201, 202);
  const back = withTeamIdentity(reload(e), roster(e));
  assert.equal(back.p1MemberId, e.p1MemberId);
  assert.equal(back.p2MemberId, e.p2MemberId);
  assert.equal(back.p1ProfileId, 201);
  assert.equal(back.p2ProfileId, 202);
  assert.equal(back.p1PlayerId, "uuid-201");
  assert.equal(back.p2PlayerId, "uuid-202");
  // Team row gone (roster missing) → identity still rebuilt from the durable entry id.
  const noRoster = withTeamIdentity(reload(e), null);
  assert.equal(noRoster.teamId, 8);
  assert.equal(noRoster.isTeam, true);
});

test("D: slots are matched by identity — a captain change never swaps P1/P2 on the board", () => {
  const e = teamEntry(9, 301, 302);
  const promoted = roster(e);
  promoted.members = promoted.members.map((m) => ({ ...m, role: m.role === "captain" ? "member" : "captain" }));
  const back = withTeamIdentity(reload(e), promoted);
  assert.equal(back.p1ProfileId, 301);
  assert.equal(back.p1MemberId, e.p1MemberId, "P1 keeps P1's member row");
  assert.equal(back.p2MemberId, e.p2MemberId);
});

test("E: dropout rule is TEAM-level after reload (both members), singles stay single", () => {
  const e = teamEntry(10, 401, 402);
  const unregistered = new Set([401]); // only the captain's registration cancelled
  const isOut = (pid: number | null) => pid != null && unregistered.has(pid);
  // Old behaviour: the reloaded entry had no teamId → only the captain was checked.
  const legacy = reload(e);
  assert.equal(entryRegInactive(legacy, isOut), true, "without identity → captain-only (the bug)");
  const back = withTeamIdentity(legacy, roster(e));
  assert.equal(entryRegInactive(back, isOut), false, "team with one active member stays active");
  unregistered.add(402);
  assert.equal(entryRegInactive(back, isOut), true, "both out → inactive");
  const single = { ...reload(e), id: "e_single", p2Name: null, p2ProfileId: null, p2PlayerId: null } as ChipEntry;
  assert.equal(entryRegInactive(single, (pid) => pid === 401), true);
});

test("F/G: either teammate resolves as the signed-in user", () => {
  const e = withTeamIdentity(reload(teamEntry(11, 501, 502)), null);
  assert.equal(chipEntryIncludesProfile(e, 501), true, "captain signed in");
  assert.equal(chipEntryIncludesProfile(e, 502), true, "partner signed in");
  assert.equal(chipEntryIncludesProfile(e, 999), false);
  assert.equal(chipEntryIncludesProfile(e, null), false);
});

test("H/I: a claimed pending partner gains their profile id from the roster — fill-only, never overwritten", () => {
  const e = teamEntry(12, 601, null); // partner pending (players.id only)
  const r = roster(e);
  r.members[1] = { ...r.members[1], player_id: 602 }; // claimed → team member row linked to the account
  const back = withTeamIdentity(reload(e), r);
  assert.equal(back.p2ProfileId, 602, "(You) now works for the claimed partner");
  // A roster member that is NOT this entry's player (different uuid) is never slotted in.
  const wrong = roster(e);
  wrong.members[1] = { ...wrong.members[1], player_uuid: "uuid-someone-else", player_id: 777 };
  assert.equal(withTeamIdentity(reload(e), wrong).p2ProfileId ?? null, null);
  // An existing different profile id is never overwritten.
  const linked = teamEntry(13, 701, 702);
  const odd = roster(linked);
  odd.members[1] = { ...odd.members[1], player_id: 799 };
  assert.equal(withTeamIdentity(reload(linked), odd).p2ProfileId, 702);
});

test("M: Undo / Restore never turns a team entry into a singles-like entry", () => {
  let s = emptyChipState("scotch_doubles");
  s = { ...s, settings: { ...s.settings, tiers: [{ id: "t", minFargo: 0, maxFargo: null, chips: 3 }] } };
  s = { ...s, entries: [teamEntry(21, 1, 2), teamEntry(22, 3, 4), teamEntry(23, 5, 6)] };
  s = addTables(s, 1);
  s = settleChipState(startAllMatches(startChipTournament(s)));
  const m = s.matches.find((x) => x.status === "in_progress")!;
  const next = settleChipState(recordWinner(s, m.id, m.aId));
  const ev = next.events.slice(0, next.events.length - s.events.length);
  const withRp = withRestorePoint(next, s, ev.map((e) => e.id), ev[0].text);
  const undone = undoLastActions(withRp, 1, { reason: "test" });
  for (const e of undone.entries) {
    assert.equal(e.isTeam, true);
    assert.ok(e.teamId != null && e.p1MemberId != null && e.p2MemberId != null);
    assert.ok(e.p1ProfileId != null && e.p2ProfileId != null);
  }
});

test("O: legacy / non-team entries load unchanged", () => {
  assert.equal(teamIdFromEntryId("team_42"), 42);
  for (const id of ["e_abc", "reg_17", "team_", "team_x1", "myteam_3"]) assert.equal(teamIdFromEntryId(id), null, id);
  const singles = { ...reload(teamEntry(30, 1, 2)), id: "e_abc" } as ChipEntry;
  assert.equal(withTeamIdentity(singles, null), singles, "non-team entry untouched");
});

test("A/B: the captain ✕ says what it does — never a silent whole-team delete", () => {
  const two = withTeamIdentity(reload(teamEntry(40, 1, 2)), null);
  const full = { ...two, p1MemberId: 401, p2MemberId: 402 };
  assert.equal(teamMemberRemovalKind(full, 1), "promote_partner", "captain of a 2-person team → partner becomes captain");
  assert.equal(teamMemberRemovalKind(full, 2), "remove_player", "partner → removed from the team only");
  const alone = { ...full, p2MemberId: null, p2Name: null, p2ProfileId: null, p2PlayerId: null } as ChipEntry;
  assert.equal(teamMemberRemovalKind(alone, 1), "remove_team", "captain alone → an explicit Remove Team");
  const singles = { ...full, id: "e_1", isTeam: false, teamId: null } as ChipEntry;
  assert.equal(teamMemberRemovalKind(singles, 1), "remove_player");
});

// ── Profile history credit ─────────────────────────────────────────────────────
const tournament = (id: number) =>
  ({ id, name: `Chip ${id}`, game_type: "9-ball", tournament_date: "2026-09-20", status: "completed", live_state: "finished" }) as PlayerTournament["tournament"];
const resultRow = (tid: number, over: Partial<ChipResultRow> = {}): ChipResultRow => ({
  tournament_id: tid, tournament: tournament(tid), place: 2, field_size: 12, entry_id: `e_${tid}`,
  team_name: null, partner_name: null, wins: 5, losses: 3, is_team: false, ...over,
});

test("J: a completed SINGLES Chip result appears on the profile (with or without a registration)", () => {
  const reg: PlayerTournament = { id: 900, status: "checked_in", registered_at: "", tournament: tournament(1) };
  const merged = mergeChipResults([reg], [resultRow(1), resultRow(2, { place: 1, field_size: 8 })]);
  assert.equal(merged.length, 2, "one item per tournament");
  assert.equal(merged[0].id, 900, "attached to the existing registration");
  assert.deepEqual(merged[0].chipResult?.place, 2);
  const only = merged.find((t) => t.tournament?.id === 2)!;
  assert.equal(only.chipResultOnly, true, "a TD-added Chip entry with no registration still shows");
  assert.equal(chipResultLine(merged[0].chipResult!), "2nd of 12 · 5–3");
  assert.equal(chipResultLine(only.chipResult!), "1st of 8 · 5–3");
});

test("K/L: a Scotch team result credits BOTH teammates with the SAME single result", () => {
  // get_player_chip_results returns the ONE chip_results row of the team entry to each teammate.
  const forCaptain = resultRow(5, { entry_id: "team_77", is_team: true, team_name: "Desert Sharks", partner_name: "Pat", place: 3 });
  const forPartner = { ...forCaptain, partner_name: "Sam" };
  const a = mergeChipResults([], [forCaptain])[0].chipResult!;
  const b = mergeChipResults([], [forPartner])[0].chipResult!;
  assert.equal(a.place, b.place, "same placement");
  assert.equal(forCaptain.entry_id, forPartner.entry_id, "one entry → one standing");
  assert.equal(chipResultLine(a), "3rd of 12 · 5–3 · Desert Sharks with Pat");
  assert.equal(chipResultLine(b), "3rd of 12 · 5–3 · Desert Sharks with Sam");
  // The default "P1 / P2" pairing stored as team_name is not repeated next to the partner.
  const pairing = mergeChipResults([], [{ ...forCaptain, team_name: "Chris / Pat", partner_name: "Pat" }])[0].chipResult!;
  assert.equal(chipResultLine(pairing), "3rd of 12 · 5–3 · with Pat");
  // Duplicate rows for one tournament never produce two profile items.
  assert.equal(mergeChipResults([], [forCaptain, forCaptain]).length, 1);
});
