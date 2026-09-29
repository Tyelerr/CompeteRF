// src/models/services/staff-search.service.ts
// Staff user search (add director, venue team, reassign TD, create/edit venue) through the
// role-checked search_users_for_staff RPC (M3 privacy). Callers must be a TD, bar owner or
// admin — anyone else gets an error. Matches username / display name; an email matches only
// when typed in full for TDs and bar owners (partial email search is admin-only).
// email_display is the FULL email for admins and a masked one (j***@g***.com) for everyone
// else — never read profiles.email for another user from the client.

import { supabase } from "../../lib/supabase";

export interface StaffUserResult {
  id: string;
  id_auto: number;
  user_name: string;
  name: string | null;
  role: string | null;
  email_display: string | null;
}

export const staffSearchService = {
  async searchUsers(query: string, limit: number = 20): Promise<StaffUserResult[]> {
    const q = query.trim();
    if (q.length < 2) return [];
    const { data, error } = await supabase.rpc("search_users_for_staff", { p_query: q, p_limit: limit });
    if (error) throw error;
    return (data ?? []) as StaffUserResult[];
  },
};
