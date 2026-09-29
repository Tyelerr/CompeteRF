// src/models/services/authz.service.ts
// Client-side authorization probes that mirror the SERVER's own rules (defense in depth — RLS
// and the RPCs remain authoritative; these only decide what UI to render).

import { supabase } from "../../lib/supabase";

export const authzService = {
  // Same predicate the server uses for every tournament write: admin, the tournament's
  // director, or an active owner / director of its venue.
  async canManageTournament(tournamentId: number): Promise<boolean> {
    const { data, error } = await supabase.rpc("can_manage_tournament", { p_tournament_id: tournamentId });
    if (error) throw error;
    return data === true;
  },
};
