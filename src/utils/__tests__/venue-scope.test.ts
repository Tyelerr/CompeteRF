// src/utils/__tests__/venue-scope.test.ts
// Run: npx tsx --test src/utils/__tests__/venue-scope.test.ts
// Super-admin Phase 2: role = compete_admin / super_admin → global admin access, while
// venue_owners / venue_directors / tournaments.director_id stay REAL relationships only.
// Pure rules (src/utils/venue-scope.ts) + static guards on the call sites that use them.
/// <reference types="node" />

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ADMIN_ASSIGNER_LABEL,
  buildDirectorCandidates,
  canEditTournament,
  defaultDirectorFor,
  displayAssignerName,
  isAdminRole,
  resolveNewTournamentDirectorId,
  resolveVenueScope,
  venueInScope,
  withoutAdmins,
} from "../venue-scope";

const ADMIN = 1, OWNER = 10, TD = 20, OTHER = 30;

// ── scope ────────────────────────────────────────────────────────────────────────────────
test("admins see ALL venues by role, with no relationship rows", () => {
  for (const role of ["super_admin", "compete_admin"]) {
    const scope = resolveVenueScope({ role, ownedVenueIds: [], directedVenueIds: [] });
    assert.deepEqual(scope, { kind: "all" });
    assert.equal(venueInScope(scope, 12345), true);
  }
});

test("owners / TDs stay scoped to the venues they own or direct (deduped)", () => {
  assert.deepEqual(resolveVenueScope({ role: "bar_owner", ownedVenueIds: [9, 3], directedVenueIds: [3, 7] }), { kind: "ids", ids: [3, 7, 9] });
  const td = resolveVenueScope({ role: "tournament_director", ownedVenueIds: [], directedVenueIds: [5] });
  assert.equal(venueInScope(td, 5), true);
  assert.equal(venueInScope(td, 6), false);
  assert.deepEqual(resolveVenueScope({ role: "basic_user" }), { kind: "ids", ids: [] });
  assert.equal(venueInScope({ kind: "all" }, null), false);
});

test("isAdminRole only matches the two admin roles", () => {
  assert.equal(isAdminRole("super_admin"), true);
  assert.equal(isAdminRole("compete_admin"), true);
  for (const r of ["bar_owner", "tournament_director", "basic_user", "", null, undefined, "SUPER_ADMIN"]) {
    assert.equal(isAdminRole(r as any), false, String(r));
  }
});

// ── tournament editing ───────────────────────────────────────────────────────────────────
test("an admin can edit a tournament they do not direct, at a venue they do not own", () => {
  assert.equal(canEditTournament({ role: "super_admin", myIdAuto: ADMIN, directorId: TD, venueId: 9, ownedVenueIds: [] }), true);
  assert.equal(canEditTournament({ role: "compete_admin", myIdAuto: ADMIN, directorId: TD, venueId: 9, ownedVenueIds: [] }), true);
});

test("non-admins: only the director or an active owner of the venue", () => {
  assert.equal(canEditTournament({ role: "tournament_director", myIdAuto: TD, directorId: TD, venueId: 9, ownedVenueIds: [] }), true);
  assert.equal(canEditTournament({ role: "bar_owner", myIdAuto: OWNER, directorId: TD, venueId: 9, ownedVenueIds: [9] }), true);
  assert.equal(canEditTournament({ role: "bar_owner", myIdAuto: OWNER, directorId: TD, venueId: 9, ownedVenueIds: [4] }), false, "other venue's owner");
  assert.equal(canEditTournament({ role: "tournament_director", myIdAuto: OTHER, directorId: TD, venueId: 9, ownedVenueIds: [] }), false, "another TD");
  assert.equal(canEditTournament({ role: "basic_user", myIdAuto: OTHER, directorId: TD, venueId: 9 }), false);
});

// ── tournament creation / director selection ─────────────────────────────────────────────
test("director candidates = the venue's real TDs + owners (deduped, TD wins)", () => {
  const c = buildDirectorCandidates(
    [{ idAuto: TD, name: "Terry TD" }, { idAuto: OWNER, name: "Olive Owner" }],
    [{ idAuto: OWNER, name: "Olive Owner" }, { idAuto: 11, name: null, userName: "co_owner" }],
  );
  assert.deepEqual(c, [
    { idAuto: 11, name: "co_owner", relation: "owner" },
    { idAuto: OWNER, name: "Olive Owner", relation: "director" },
    { idAuto: TD, name: "Terry TD", relation: "director" },
  ]);
});

test("exactly one legitimate candidate may default; otherwise an explicit choice is required", () => {
  assert.equal(defaultDirectorFor([{ idAuto: TD, name: "T", relation: "director" }], ADMIN), TD);
  assert.equal(defaultDirectorFor([{ idAuto: TD, name: "T", relation: "director" }, { idAuto: OWNER, name: "O", relation: "owner" }], ADMIN), null);
  assert.equal(defaultDirectorFor([], ADMIN), null);
});

test("the admin is NEVER auto-selected as director — even as the venue's only candidate", () => {
  assert.equal(defaultDirectorFor([{ idAuto: ADMIN, name: "Me", relation: "director" }], ADMIN), null);
  assert.equal(resolveNewTournamentDirectorId({ role: "super_admin", myIdAuto: ADMIN, selectedDirectorId: null }), null);
  assert.equal(resolveNewTournamentDirectorId({ role: "compete_admin", myIdAuto: ADMIN, selectedDirectorId: undefined }), null);
});

test("admin tournament creation writes the explicitly chosen director (incl. explicit self-assignment)", () => {
  assert.equal(resolveNewTournamentDirectorId({ role: "super_admin", myIdAuto: ADMIN, selectedDirectorId: TD }), TD);
  assert.equal(resolveNewTournamentDirectorId({ role: "super_admin", myIdAuto: ADMIN, selectedDirectorId: ADMIN }), ADMIN,
    "only via an explicit Assign-myself selection");
});

test("owner / TD tournament creation is unchanged: they direct their own tournaments", () => {
  assert.equal(resolveNewTournamentDirectorId({ role: "bar_owner", myIdAuto: OWNER, selectedDirectorId: null }), OWNER);
  assert.equal(resolveNewTournamentDirectorId({ role: "tournament_director", myIdAuto: TD, selectedDirectorId: 999 }), TD,
    "a non-admin cannot direct a tournament for someone else");
});

// ── display / candidates ─────────────────────────────────────────────────────────────────
test("assigned-by shows 'Compete Admin' for admins, the real name otherwise", () => {
  assert.equal(displayAssignerName("Tyelerr Hill", "super_admin"), ADMIN_ASSIGNER_LABEL);
  assert.equal(displayAssignerName("Pat Admin", "compete_admin"), ADMIN_ASSIGNER_LABEL);
  assert.equal(displayAssignerName("Olive Owner", "bar_owner"), "Olive Owner");
  assert.equal(displayAssignerName("", "bar_owner"), null);
});

test("withoutAdmins removes admin accounts from a candidate list only", () => {
  const rows = [{ id: 1, role: "super_admin" }, { id: 2, role: "tournament_director" }, { id: 3, role: "compete_admin" }, { id: 4, role: "basic_user" }];
  assert.deepEqual(withoutAdmins(rows).map((r) => r.id), [2, 4]);
});

// ── static guards on the call sites ──────────────────────────────────────────────────────
const ROOT = join(__dirname, "..", "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

test("tournament editing: shared canEditTournament; the save never writes director_id", () => {
  const src = read("src/viewmodels/useEditTournament.ts");
  assert.ok(src.includes("canEditTournament("), "uses the shared rule");
  assert.ok(src.includes("venueScope.loadVenues()"), "venue picker from the shared scope");
  const save = src.slice(src.indexOf("const updateData"), src.indexOf("tournamentService.updateTournament"));
  assert.ok(save.length > 0 && !/director_id/.test(save), "update payload has no director_id");
});

test("the director-only editor redirects admins to the full editor", () => {
  const src = read("app/(tabs)/admin/edit-tournament-td/[id].tsx");
  assert.ok(/if \(isAdmin\) return <Redirect href=\{`\/\(tabs\)\/admin\/edit-tournament\/\$\{id\}`/.test(src));
});

test("tournament creation never hard-codes director_id to the signed-in user", () => {
  const src = read("src/viewmodels/useSubmitTournament.ts");
  assert.ok(!/director_id:\s*profile!?\.id_auto/.test(src), "no director_id: profile.id_auto");
  assert.equal((src.match(/director_id:\s*newTournamentDirectorId\(\)/g) ?? []).length, 2, "tournament + template payloads");
  assert.ok(/if \(isAdmin && newTournamentDirectorId\(\) == null\)/.test(src), "admins must choose a director");
  assert.ok(src.includes("venueScope.loadVenues()"), "venue list from the shared scope");
});

test("manage-tournament venue picker uses the shared scope (admins: all venues)", () => {
  const src = read("app/(tabs)/admin/manage-tournament/[id].tsx");
  assert.ok(src.includes("useVenuesInScope()"));
  assert.ok(!src.includes("useVenuesByDirector(tdProfile"), "no relationship-only picker");
});

test("venue creation: an admin's owner is explicit (p_owner_id sent only when chosen)", () => {
  const svc = read("src/models/services/venue.service.ts");
  assert.ok(/\.\.\.\(ownerId != null \? \{ p_owner_id: ownerId \} : \{\}\)/.test(svc), "optional, backward compatible");
  const vm = read("src/viewmodels/useCreateVenue.ts");
  assert.ok(/isAdmin \? owner\?\.id_auto \?\? null : null/.test(vm), "only admins pass an owner");
});

test("admins are not default director/staff candidates; self-assignment is explicit", () => {
  const dir = read("src/models/services/director.service.ts");
  const avail = dir.slice(dir.indexOf("async getAvailableDirectors"));
  assert.ok(!/super_admin|compete_admin/.test(avail.slice(0, avail.indexOf("return data"))), "getAvailableDirectors: TDs only");
  const adminVm = read("src/viewmodels/useAdminTournaments.ts");
  const search = adminVm.slice(adminVm.indexOf("const searchDirectors"), adminVm.indexOf("const selfDirectorOption"));
  assert.ok(search.includes("staffSearchService.searchUsers") && !search.includes('.from("profiles")'), "shared staff search");
  assert.ok(read("app/(tabs)/admin/tournaments/super-admin-tournament-manager.tsx").includes("selfOption={vm.selfDirectorOption}"));
  assert.ok(read("src/views/components/common/reassign-director-modal.tsx").includes("Assign myself as director"));
});

test("add-director: admins get every venue via the shared scope; owners unchanged", () => {
  const src = read("app/(tabs)/admin/add-director.tsx");
  assert.ok(/if \(isAdmin\) \{\s*const all = await loadScopedVenues\(\)/.test(src));
  assert.ok(src.includes('.from("venue_owners")'), "owner path still reads their own venues");
});

test("owner reassignment never records the admin as the previous owner", () => {
  const src = read("app/(tabs)/admin/venue-management.tsx");
  assert.ok(src.includes("const previousOwnerId = currentOwners?.[0]?.owner_id ?? null;"));
  assert.ok(!/previousOwnerId = [^;]*profile\.id_auto/.test(src));
});

test("TD venue card shows admin assigners as 'Compete Admin'", () => {
  assert.ok(read("src/views/components/venues/TDVenueCard.tsx").includes("displayAssignerName("));
  assert.ok(/assigned_by_profile:profiles_public!assigned_by \(\s*name,\s*user_name,\s*role/.test(read("src/viewmodels/useTournamentDirectorVenues.ts")));
});

test("venue team lists still come from the real relationship tables (no role filtering)", () => {
  const team = read("src/viewmodels/useVenueTeam.ts");
  assert.ok(team.includes("venue_owners") || team.includes("getVenueOwners"), "owners from relationships");
  assert.ok(!team.includes("withoutAdmins"), "an explicitly assigned admin is not hidden");
});

test("Migration A is independent of the parked Stripe work (no Edge Function / Stripe dependency)", () => {
  const file = "20261013120000_admin_global_authz_phase1.sql";
  const dir = existsSync(join(ROOT, "supabase/migrations", file)) ? "supabase/migrations" : "supabase/pending";
  const mig = read(`${dir}/${file}`);
  const code = mig.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
  assert.ok(!/stripe|functions\.|webhook/i.test(code), "no Stripe / function references in SQL");
});
