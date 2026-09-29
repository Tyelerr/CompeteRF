// src/models/services/block.service.ts
// Minimal user blocking (Google Play UGC). A block only affects direct messaging: the server
// (trg_block_blocked_message) rejects new messages between the two users in either direction
// in non-support conversations. Tournament participation, rosters and broadcasts are
// unaffected. Rows are private to the blocker (RLS) — the blocked user can't see them.

import { supabase } from "../../lib/supabase";

export const blockService = {
  /** Profile ids (uuid) the current user has blocked. */
  async getMyBlockedIds(): Promise<Set<string>> {
    const { data, error } = await supabase.from("user_blocks").select("blocked_id");
    if (error) throw error;
    return new Set((data ?? []).map((r: { blocked_id: string }) => r.blocked_id));
  },

  async block(blockerId: string, blockedId: string): Promise<void> {
    const { error } = await supabase
      .from("user_blocks")
      .upsert({ blocker_id: blockerId, blocked_id: blockedId }, { onConflict: "blocker_id,blocked_id", ignoreDuplicates: true });
    if (error) throw error;
  },

  async unblock(blockerId: string, blockedId: string): Promise<void> {
    const { error } = await supabase
      .from("user_blocks")
      .delete()
      .eq("blocker_id", blockerId)
      .eq("blocked_id", blockedId);
    if (error) throw error;
  },
};

export { BLOCKED_MESSAGING_TEXT, isBlockedMessagingError } from "../../utils/user-safety";
