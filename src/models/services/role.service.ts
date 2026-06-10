// src/models/services/role.service.ts
// Single source of truth for deriving a user's account role from their current
// venue relationships. Call this after ANY assignment change (add/remove owner or
// director) so profiles.role can never drift, and so every path applies the same
// promote/demote rules.
//
// Rules (highest wins):
//   - compete_admin / super_admin are never touched (admins stay admins).
//   - owns at least one active venue (venue_owners)            -> bar_owner
//   - directs at least one active venue (venue_directors) OR is
//     the director of any active tournament                    -> tournament_director
//   - otherwise                                                -> basic_user

import { supabase } from "../../lib/supabase";

const ADMIN_ROLES = ["compete_admin", "super_admin"];

export const roleService = {
  async recomputeUserRole(userIdAuto: number): Promise<string | null> {
    if (!userIdAuto) return null;

    // Never alter admins — their role isn't derived from venue ties.
    const { data: prof } = await supabase
      .from("profiles")
      .select("role")
      .eq("id_auto", userIdAuto)
      .maybeSingle();
    const current = prof?.role ?? null;
    if (current && ADMIN_ROLES.includes(current)) return current;

    const [{ count: owned }, { count: directed }, { count: activeTournaments }] =
      await Promise.all([
        supabase
          .from("venue_owners")
          .select("id", { count: "exact", head: true })
          .eq("owner_id", userIdAuto)
          .is("archived_at", null),
        supabase
          .from("venue_directors")
          .select("id", { count: "exact", head: true })
          .eq("director_id", userIdAuto)
          .is("archived_at", null),
        supabase
          .from("tournaments")
          .select("id", { count: "exact", head: true })
          .eq("director_id", userIdAuto)
          .eq("status", "active"),
      ]);

    let role = "basic_user";
    if ((owned ?? 0) > 0) role = "bar_owner";
    else if ((directed ?? 0) > 0 || (activeTournaments ?? 0) > 0)
      role = "tournament_director";

    if (role !== current) {
      const { error } = await supabase
        .from("profiles")
        .update({ role })
        .eq("id_auto", userIdAuto);
      if (error) {
        console.error("[roleService] Failed to update role:", error);
      }
    }
    return role;
  },
};
