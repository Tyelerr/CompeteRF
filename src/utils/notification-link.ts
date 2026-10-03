// src/utils/notification-link.ts
// The ONE rule for following a link carried by a notification (in-app list or push tap): only
// destinations inside the app — an app route '/…' or the app's own 'competerf:///…' scheme. No
// other scheme (https:, javascript:, …), no host-relative '//host', no whitespace. Same rule the
// server enforces on notification inserts (20261021140000_security_cleanup); this keeps old rows
// and any push payload from opening an arbitrary destination. Pure.

export const safeNotificationLink = (link: unknown): string | null => {
  if (typeof link !== "string") return null;
  const s = link.trim();
  if (!s || /\s/.test(s)) return null;
  if (/^\/[^/\\]/.test(s)) return s;
  if (s.startsWith("competerf:///")) return s;
  return null;
};
