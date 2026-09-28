// src/models/services/chip.team-identity.ts
// Scotch Doubles TEAM identity for Chip entries (pure; used by chipService.load for the admin,
// spectator and player surfaces alike).
//
// A registered team is projected as ONE chip entry whose id is `team_<tournament_teams.id>`
// (rosterTeamToEntry). When the tournament starts that entry is materialized into
// chip_entries — but only the columns in entryToRow are stored (names, Fargo, both members'
// profile + player ids). teamId / isTeam / the member row ids / the team name are NOT columns,
// so before this module a reload produced a "team" entry with teamId = null and team rules
// silently fell back to singles (e.g. the registration-dropout rule checked only the captain).
//
// The entry id IS the durable team key (we generated it from the team row id), so the identity
// is rebuilt deterministically on every load — no schema change, and it repairs tournaments
// started before this fix. Roster data (when the team row still exists) only FILLS gaps: the
// persisted names / Fargo / chips / results are never overwritten, and a member id is only
// filled into the slot whose player it belongs to (matched by players.id or profiles.id_auto).

import { ChipEntry } from "../types/chip.types";

const TEAM_ENTRY_ID = /^team_(\d+)$/;

// tournament_teams.id encoded in a team entry id, else null.
export const teamIdFromEntryId = (id: string): number | null => {
  const m = TEAM_ENTRY_ID.exec(id);
  return m ? Number(m[1]) : null;
};

// One member row of get_tournament_team_roster (only the fields identity needs).
export interface TeamRosterMember {
  member_id: number | null;
  role: string | null;
  invite_status: string | null;
  player_id: number | null;
  player_uuid: string | null;
  fargo_verified?: boolean | null;
}
export interface TeamRosterIdentity {
  id: number;
  name: string | null;
  locked: boolean;
  approved: boolean;
  members: TeamRosterMember[];
}

const sameMember = (m: TeamRosterMember, profileId: number | null | undefined, playerId: string | null | undefined) =>
  (!!playerId && !!m.player_uuid && m.player_uuid === playerId) ||
  (profileId != null && m.player_id != null && m.player_id === profileId);

// Restore the team identity of a PERSISTED chip entry. Non-team entries are returned as-is.
export const withTeamIdentity = (e: ChipEntry, team?: TeamRosterIdentity | null): ChipEntry => {
  const teamId = e.teamId ?? teamIdFromEntryId(e.id);
  if (teamId == null) return e;
  const out: ChipEntry = { ...e, isTeam: true, teamId };
  if (!team || team.id !== teamId) return out;
  const accepted = team.members.filter((m) => m.invite_status === "accepted");
  // Slot each roster member to P1 / P2 by identity (never by role alone: a captain change after
  // the start must not swap who is P1 on the board).
  const slot = (which: 1 | 2): TeamRosterMember | null => {
    const profileId = which === 1 ? e.p1ProfileId : e.p2ProfileId;
    const playerId = which === 1 ? e.p1PlayerId : e.p2PlayerId;
    return accepted.find((m) => sameMember(m, profileId, playerId)) ?? null;
  };
  const m1 = slot(1);
  const m2 = slot(2);
  out.teamName = e.teamName ?? team.name ?? null;
  out.teamLocked = e.teamLocked ?? team.locked;
  out.teamApproved = e.teamApproved ?? team.approved;
  if (m1) {
    out.p1MemberId = e.p1MemberId ?? m1.member_id;
    out.p1FargoVerified = e.p1FargoVerified ?? !!m1.fargo_verified;
    // Fill-only: a pending member who has since claimed an account gains their profile id.
    if (out.p1ProfileId == null && m1.player_id != null) out.p1ProfileId = m1.player_id;
    if (!out.p1PlayerId && m1.player_uuid) out.p1PlayerId = m1.player_uuid;
  }
  if (m2) {
    out.p2MemberId = e.p2MemberId ?? m2.member_id;
    out.p2FargoVerified = e.p2FargoVerified ?? !!m2.fargo_verified;
    if (out.p2ProfileId == null && m2.player_id != null) out.p2ProfileId = m2.player_id;
    if (!out.p2PlayerId && m2.player_uuid) out.p2PlayerId = m2.player_uuid;
  }
  return out;
};

// Is this entry a registration DROPOUT candidate (its linked players' registrations are all
// cancelled / no-show)? Intentional team rule: a TEAM is inactive only when BOTH members are
// unregistered (one partner's cancellation must not flag a team that is still valid via
// tournament_teams); a single player is inactive when that player is. Keyed on the TEAM
// identity (withTeamIdentity) — never on whether a p2 name happens to be present.
export const entryRegInactive = (
  e: ChipEntry,
  isUnregistered: (profileId: number | null, playerId: string | null) => boolean,
): boolean => {
  const p1Out = isUnregistered(e.p1ProfileId ?? null, e.p1PlayerId ?? null);
  if (e.teamId == null && !e.isTeam) return p1Out;
  const p2Out = isUnregistered(e.p2ProfileId ?? null, e.p2PlayerId ?? null);
  return p1Out && p2Out;
};

// What the red ✕ beside a team member actually does — the UI wording is chosen from this so it
// always matches the server (td_remove_team_member / td_remove_team):
//   • "remove_player"   — singles player, or a team's PARTNER (the team then needs a partner);
//   • "promote_partner" — the CAPTAIN of a team with an accepted partner (partner becomes captain);
//   • "remove_team"     — the CAPTAIN is the only player: that is removing the whole team.
export type TeamMemberRemoval = "remove_player" | "promote_partner" | "remove_team";
export const teamMemberRemovalKind = (e: ChipEntry, which: 1 | 2): TeamMemberRemoval => {
  if (!e.isTeam || e.teamId == null || which === 2) return "remove_player";
  return e.p2MemberId != null && !!e.p2Name ? "promote_partner" : "remove_team";
};

// Does this entry include the signed-in viewer? EITHER member of a team counts — the captain is
// never the only recognized account.
export const chipEntryIncludesProfile = (e: ChipEntry, profileId: number | null | undefined): boolean =>
  profileId != null && (e.p1ProfileId === profileId || e.p2ProfileId === profileId);
