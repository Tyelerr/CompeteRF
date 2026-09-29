// src/utils/user-safety.ts
// Pure helpers for the user-safety features (report / block). No Supabase import so they can
// be unit tested and shared by services and screens.

/** True when a messaging RPC/insert was rejected because of a block (either direction). */
export const isBlockedMessagingError = (err: unknown): boolean =>
  /\bblocked\b/.test(String((err as { message?: string } | null)?.message ?? err ?? ""));

export const BLOCKED_MESSAGING_TEXT = "You can't send messages to this user.";

/** Friendly text for submit_content_report's error codes. */
export function reportErrorMessage(raw?: string | null): string {
  const msg = String(raw ?? "");
  if (msg.includes("cannot_report_self")) return "You can't report your own content.";
  if (msg.includes("not_found")) return "This content is no longer available to report.";
  return "Failed to submit report. Please try again.";
}
