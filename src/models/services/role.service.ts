// src/models/services/role.service.ts
// Single source of truth for deriving a user's account role from their current
// venue relationships. Call this after ANY assignment change (add/remove owner or
// director) so profiles.role can never drift, and so every path applies the same
// promote/demote rules.
//
// Rules (highest wins) — now enforced server-side by the recompute_user_role RPC
// (supabase/migrations/20260930120000_authz_rpcs.sql), because clients can no longer
// write profiles.role directly:
//   - compete_admin / super_admin are never touched (admins stay admins).
//   - owns at least one active venue (venue_owners)            -> bar_owner
//   - directs at least one active venue (venue_directors) OR is
//     the director of any active tournament                    -> tournament_director
//   - otherwise                                                -> basic_user
//
// The RPC only lets an admin, the user themself, or an active owner of a venue the
// user is/was tied to trigger the recompute.

import { supabase } from "../../lib/supabase";

export const roleService = {
  async recomputeUserRole(userIdAuto: number): Promise<string | null> {
    if (!userIdAuto) return null;

    const { data, error } = await supabase.rpc("recompute_user_role", {
      p_user_id_auto: userIdAuto,
    });
    if (error) {
      console.error("[roleService] Failed to recompute role:", error);
      return null;
    }
    return (data as string | null) ?? null;
  },
};
