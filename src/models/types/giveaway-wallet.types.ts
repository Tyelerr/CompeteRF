// src/models/types/giveaway-wallet.types.ts
// Giveaway Entries wallet. Server contract: supabase/migrations/20261003120000_giveaway_wallet.sql
// Business outcomes come back as { ok, status }; only transport errors throw.

/** Details/consents required for a user's FIRST entry into a wallet giveaway. */
export interface WalletEntrantDetails {
  name_as_on_id: string;
  birthday: string; // YYYY-MM-DD
  email: string;
  phone: string;
  agreed_to_rules: boolean;
  agreed_to_privacy: boolean;
  confirmed_age: boolean;
  opted_in_promotions: boolean;
}

export type WalletEntryStatus =
  | "entered"
  | "duplicate"               // replay of an already-applied request — nothing charged
  | "insufficient_balance"
  | "per_user_cap"
  | "capacity"
  | "closed"
  | "not_wallet_giveaway"
  | "entrant_details_required"
  | "underage"
  | "invalid_quantity"
  | "not_found"
  | "not_authenticated"
  | "request_id_required";

export interface WalletEntryResult {
  ok: boolean;
  status: WalletEntryStatus;
  added?: number;
  my_entries?: number;
  total_entries?: number;
  capacity?: number;
  balance?: number;
  remaining?: number;
  closed?: boolean;
}

export interface WalletAdjustResult {
  ok: boolean;
  status: "granted" | "revoked" | "duplicate" | "invalid_amount" | "note_required" | "insufficient_balance" | "no_such_user";
  balance?: number;
}

export interface WalletDrawResult {
  ok: boolean;
  status: "drawn" | "redrawn" | "not_found" | "not_wallet_giveaway" | "not_ended" | "not_awarded" | "reason_required" | "no_eligible_entries";
  draw_number?: number;
  total_tickets?: number;
  winning_ticket?: number;
  pool_hash?: string;
  winner?: { entry_id: number; user_id: number; name: string; email: string; phone: string };
}

export interface WalletCancelResult {
  ok: boolean;
  status: "cancelled" | "already_cancelled" | "reason_required" | "not_found" | "not_wallet_giveaway" | "not_cancellable";
  entrants_refunded?: number;
  credits_refunded?: number;
}
