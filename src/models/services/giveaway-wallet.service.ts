// src/models/services/giveaway-wallet.service.ts
// Giveaway Entries wallet. Every balance / quantity / wallet-winner change goes through a
// SECURITY DEFINER RPC that derives the caller from auth; the client never writes the wallet,
// ledger or wallet-giveaway entries directly (the database refuses it).

import * as Crypto from "expo-crypto";
import { supabase } from "../../lib/supabase";
import {
  WalletAdjustResult,
  WalletCancelResult,
  WalletDrawResult,
  WalletEntrantDetails,
  WalletEntryResult,
} from "../types/giveaway-wallet.types";

export const giveawayWalletService = {
  /** Fresh id for one user action; resending it after a timeout is a safe replay. */
  newRequestId(): string {
    return Crypto.randomUUID();
  },

  /** The signed-in user's Giveaway Entries balance (0 when they have never had any). */
  async getMyBalance(): Promise<number> {
    const { data, error } = await supabase.rpc("get_my_giveaway_balance");
    if (error) throw error;
    return Number(data) || 0;
  },

  async enterWalletGiveaway(
    giveawayId: number,
    quantity: number,
    requestId: string,
    entrant?: WalletEntrantDetails | null,
  ): Promise<WalletEntryResult> {
    const { data, error } = await supabase.rpc("enter_wallet_giveaway", {
      p_giveaway_id: giveawayId,
      p_quantity: quantity,
      p_request_id: requestId,
      p_entrant: entrant ?? null,
    });
    if (error) throw error;
    return data as WalletEntryResult;
  },

  // ── Admin (giveaway admins only — enforced server-side) ───────────────────────────────────

  /** Any user's balance, for the admin grant screen (admin-read RLS on giveaway_wallets). */
  async getBalanceOf(profileId: number): Promise<number> {
    const { data, error } = await supabase
      .from("giveaway_wallets")
      .select("balance")
      .eq("profile_id", profileId)
      .maybeSingle();
    if (error) throw error;
    return data?.balance ?? 0;
  },

  async grantEntries(profileId: number, amount: number, note: string | null, idempotencyKey: string): Promise<WalletAdjustResult> {
    const { data, error } = await supabase.rpc("admin_grant_giveaway_entries", {
      p_profile_id: profileId,
      p_amount: amount,
      p_note: note,
      p_idempotency_key: idempotencyKey,
    });
    if (error) throw error;
    return data as WalletAdjustResult;
  },

  async revokeEntries(profileId: number, amount: number, note: string, idempotencyKey: string): Promise<WalletAdjustResult> {
    const { data, error } = await supabase.rpc("admin_revoke_giveaway_entries", {
      p_profile_id: profileId,
      p_amount: amount,
      p_note: note,
      p_idempotency_key: idempotencyKey,
    });
    if (error) throw error;
    return data as WalletAdjustResult;
  },

  /** Server-side weighted draw; pass a reason to redraw (disqualifies the current winner). */
  async drawWinner(giveawayId: number, redrawReason?: string): Promise<WalletDrawResult> {
    const { data, error } = await supabase.rpc("draw_wallet_giveaway", {
      p_giveaway_id: giveawayId,
      p_redraw_reason: redrawReason ?? null,
    });
    if (error) throw error;
    return data as WalletDrawResult;
  },

  async cancelAndRefund(giveawayId: number, reason: string): Promise<WalletCancelResult> {
    const { data, error } = await supabase.rpc("cancel_wallet_giveaway", {
      p_giveaway_id: giveawayId,
      p_reason: reason,
    });
    if (error) throw error;
    return data as WalletCancelResult;
  },
};
