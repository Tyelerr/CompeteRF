// src/models/services/admin-user.service.ts
// Admin user management (role / status / disabled / soft delete). These columns can
// only be changed server-side: each method calls an authorized SECURITY DEFINER RPC
// (supabase/migrations/20260930120000_authz_rpcs.sql) that re-checks the caller is an
// admin allowed to manage the target — the client-side canEdit checks are UX only.

import { supabase } from "../../lib/supabase";

export interface AdminUserUpdate {
  name: string;
  first_name: string;
  last_name: string;
  role: string;
  status: string;
}

export interface AdminUpdatedUser {
  id: string;
  id_auto: number;
  name: string;
  first_name: string | null;
  last_name: string | null;
  role: string;
  status: string;
  is_disabled: boolean;
}

export const adminUserService = {
  async updateUser(userId: string, fields: AdminUserUpdate): Promise<AdminUpdatedUser> {
    const { data, error } = await supabase.rpc("admin_update_user", {
      p_user_id: userId,
      p_name: fields.name,
      p_first_name: fields.first_name,
      p_last_name: fields.last_name,
      p_role: fields.role,
      p_status: fields.status,
    });
    if (error) throw error;
    return data as AdminUpdatedUser;
  },

  async setDisabled(userId: string, disabled: boolean): Promise<boolean> {
    const { data, error } = await supabase.rpc("admin_set_user_disabled", {
      p_user_id: userId,
      p_disabled: disabled,
    });
    if (error) throw error;
    return data as boolean;
  },

  async softDelete(userId: string): Promise<void> {
    const { error } = await supabase.rpc("admin_soft_delete_user", { p_user_id: userId });
    if (error) throw error;
  },
};
