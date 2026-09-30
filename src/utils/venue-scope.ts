// src/utils/venue-scope.ts
// ONE rule for "which venues / tournaments can this user administer?" — pure, so it is
// unit-tested (src/utils/__tests__/venue-scope.test.ts):
//   role compete_admin / super_admin → every venue (global admin access, by role)
//   everyone else                     → only venues they genuinely own or direct
// Relationship data (venue_owners / venue_directors / tournaments.director_id) means real
// business relationships only — an admin is never inserted there just to gain access, and the
// helpers below never default an admin into a director / owner slot.

export const ADMIN_ROLES = ["compete_admin", "super_admin"] as const;
export const ADMIN_ASSIGNER_LABEL = "Compete Admin";

export const isAdminRole = (role: string | null | undefined): boolean =>
  (ADMIN_ROLES as readonly string[]).includes(role ?? "");

export type VenueScope = { kind: "all" } | { kind: "ids"; ids: number[] };

export function resolveVenueScope(input: {
  role: string | null | undefined;
  ownedVenueIds?: readonly number[] | null;
  directedVenueIds?: readonly number[] | null;
}): VenueScope {
  if (isAdminRole(input.role)) return { kind: "all" };
  const ids = [...new Set([...(input.ownedVenueIds ?? []), ...(input.directedVenueIds ?? [])])];
  return { kind: "ids", ids: ids.sort((a, b) => a - b) };
}

export const venueInScope = (scope: VenueScope, venueId: number | null | undefined): boolean =>
  venueId != null && (scope.kind === "all" || scope.ids.includes(venueId));

/** Edit / manage a tournament: admin, its director, or an active owner of its venue. */
export function canEditTournament(input: {
  role: string | null | undefined;
  myIdAuto: number | null | undefined;
  directorId: number | null | undefined;
  venueId: number | null | undefined;
  ownedVenueIds?: readonly number[] | null;
}): boolean {
  if (isAdminRole(input.role)) return true;
  if (input.myIdAuto != null && input.directorId === input.myIdAuto) return true;
  return input.venueId != null && (input.ownedVenueIds ?? []).includes(input.venueId);
}

// ── Tournament Director selection (admin tournament creation) ─────────────────────────────

export interface DirectorCandidate {
  idAuto: number;
  name: string;
  relation: "director" | "owner";
}

type StaffRow = { idAuto: number | null | undefined; name?: string | null; userName?: string | null };

/** Real candidates for a venue = its active TDs + owners (deduped; a TD entry wins). */
export function buildDirectorCandidates(directors: StaffRow[], owners: StaffRow[]): DirectorCandidate[] {
  const byId = new Map<number, DirectorCandidate>();
  const add = (rows: StaffRow[], relation: DirectorCandidate["relation"]) => {
    for (const r of rows) {
      if (r.idAuto == null || byId.has(r.idAuto)) continue;
      byId.set(r.idAuto, { idAuto: r.idAuto, name: r.name?.trim() || r.userName || `#${r.idAuto}`, relation });
    }
  };
  add(directors, "director");
  add(owners, "owner");
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Pre-selected director for an ADMIN creating a tournament: the single legitimate candidate if
 * there is exactly one — and never the admin themself (self-assignment is an explicit action).
 */
export function defaultDirectorFor(candidates: DirectorCandidate[], myIdAuto: number | null | undefined): number | null {
  const others = candidates.filter((c) => c.idAuto !== myIdAuto);
  return candidates.length === 1 && others.length === 1 ? others[0].idAuto : null;
}

/**
 * director_id to write when creating a tournament / template.
 * Non-admins: themselves (unchanged behaviour). Admins: an explicitly chosen real director is
 * REQUIRED — never silently the admin. Returns null when an admin has not chosen one.
 */
export function resolveNewTournamentDirectorId(input: {
  role: string | null | undefined;
  myIdAuto: number | null | undefined;
  selectedDirectorId: number | null | undefined;
}): number | null {
  if (!isAdminRole(input.role)) return input.myIdAuto ?? null;
  return input.selectedDirectorId ?? null;
}

// ── Display ────────────────────────────────────────────────────────────────────────────────

/** "Assigned by" as shown to owners / TDs: an admin appears as "Compete Admin", not by name. */
export const displayAssignerName = (
  name: string | null | undefined,
  role: string | null | undefined,
): string | null => (isAdminRole(role) ? ADMIN_ASSIGNER_LABEL : name?.trim() || null);

/** Remove admin accounts from a normal staff / director candidate list. */
export const withoutAdmins = <T extends { role?: string | null }>(rows: T[]): T[] =>
  rows.filter((r) => !isAdminRole(r.role));
