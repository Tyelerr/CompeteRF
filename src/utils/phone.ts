// src/utils/phone.ts
// Client-side phone helpers for the SMS feature. Canonical storage is E.164,
// produced/validated authoritatively server-side (set_sms_phone + the verify
// Edge Functions). These are display/validation helpers only — never the source
// of truth, and they never log or expose full numbers.

/** Mask to the last four digits for display/diagnostics, e.g. "•••• 6789". */
export function maskPhone(value: string | null | undefined): string {
  if (!value) return "";
  const digits = value.replace(/\D/g, "");
  if (digits.length < 4) return "••••";
  return `•••• ${digits.slice(-4)}`;
}

/**
 * Loose sanity check so the UI can enable "Send code" — the server normalizes and
 * validates for real. Accepts a full +CC E.164 or a bare US 10/11-digit number.
 */
export function looksLikePhone(value: string | null | undefined): boolean {
  const raw = (value ?? "").trim();
  if (/^\+[1-9]\d{6,14}$/.test(raw)) return true;
  const digits = raw.replace(/\D/g, "");
  return digits.length === 10 || (digits.length === 11 && digits.startsWith("1"));
}

/** OTP shape check before hitting the server. NEVER log the code itself. */
export function isValidOtpFormat(code: string | null | undefined): boolean {
  return /^\d{4,10}$/.test((code ?? "").trim());
}

/** Strip to digits only. */
export function digitsOnly(raw: string | null | undefined): string {
  return (raw ?? "").replace(/\D/g, "");
}

/** Format up to 10 US digits as "(480) 307-5766" for display while typing. */
export function formatUsPhoneInput(raw: string | null | undefined): string {
  const d = digitsOnly(raw).slice(0, 10);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}
