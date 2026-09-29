// src/utils/login-identifier.ts
// Classify what the user typed in "Email or Username". A real email (something@domain) signs
// in directly with email + password; anything else is a username for the login-with-username
// Edge Function (a leading "@" is dropped — the field's placeholder is "@username").
export type LoginIdentifier = { kind: "email" | "username"; value: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const parseLoginIdentifier = (raw: string): LoginIdentifier => {
  const value = (raw ?? "").trim();
  if (EMAIL_RE.test(value)) return { kind: "email", value };
  return { kind: "username", value: value.replace(/^@+/, "") };
};
