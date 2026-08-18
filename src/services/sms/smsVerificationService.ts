// src/services/sms/smsVerificationService.ts
// Client wrapper for the Phase-3 phone-verification + consent trust boundary.
// All privileged work happens server-side (Edge Functions + service-role-only
// RPCs); this file only invokes them. Uses generated DB types NARROWLY (per the
// incremental-adoption policy) — it does NOT apply the global client generic.

import { supabase } from "@/src/lib/supabase";
import type { Database } from "@/src/lib/supabase/database.types";
import { SMS_CONSENT } from "@/src/models/types/notification.types";

// Narrow generated-type usage (new SMS code only):
type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];
export type PhoneState = Pick<ProfileRow, "phone_number" | "phone_verified_at">;

export interface SmsActionResult {
  success: boolean;
  error?: string;
}

// Read the caller's canonical phone + verification status (own row via RLS).
export async function getPhoneState(userId: string): Promise<PhoneState | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("phone_number, phone_verified_at")
    .eq("id", userId)
    .maybeSingle();
  if (error) return null;
  return data as PhoneState | null;
}

// Start verification: the Edge Function sets the canonical number (set_sms_phone),
// rate-limits, and asks Telnyx to send the code. Generic errors only.
export async function startPhoneVerification(phone: string): Promise<SmsActionResult> {
  const { data, error } = await supabase.functions.invoke("sms-verify-start", {
    body: { phone },
  });
  if (error) return { success: false, error: "Couldn't send the code. Please try again." };
  if (!data?.ok) return { success: false, error: data?.error ?? "Please try again." };
  return { success: true };
}

// Check the code. No phone is sent — the server uses the canonical number.
export async function checkPhoneVerification(code: string): Promise<SmsActionResult> {
  const { data, error } = await supabase.functions.invoke("sms-verify-check", {
    body: { code },
  });
  if (error) return { success: false, error: "That code didn't match. Please try again." };
  if (!data?.verified) return { success: false, error: data?.error ?? "That code didn't match." };
  return { success: true };
}

// Change the canonical number directly (own row; invalidates verification +
// disables SMS + logs phone_changed). Authenticated-safe RPC.
export async function setSmsPhone(phone: string): Promise<SmsActionResult> {
  const { error } = await supabase.rpc("set_sms_phone", { p_phone: phone });
  if (error) return { success: false, error: "Couldn't save that number." };
  return { success: true };
}

// The ONLY opt-in path: records consent (requires a verified number server-side).
export async function enableSmsAlerts(): Promise<SmsActionResult> {
  const { error } = await supabase.rpc("enable_sms_alerts", {
    p_source: "app_settings",
    p_version: SMS_CONSENT.version,
  });
  if (error) return { success: false, error: "Verify your number before enabling texts." };
  return { success: true };
}

export async function disableSmsAlerts(): Promise<SmsActionResult> {
  const { error } = await supabase.rpc("disable_sms_alerts", {});
  if (error) return { success: false, error: "Couldn't update. Please try again." };
  return { success: true };
}

// Server-authorized test send (no destination/body from client).
export async function sendTestMessage(): Promise<SmsActionResult> {
  const { data, error } = await supabase.functions.invoke("sms-send-test", { body: {} });
  if (error) return { success: false, error: "Couldn't send the test message." };
  if (!data?.ok) return { success: false, error: data?.error ?? "Please try again." };
  return { success: true };
}
