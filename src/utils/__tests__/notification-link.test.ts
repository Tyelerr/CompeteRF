// src/utils/__tests__/notification-link.test.ts
// Run: npx tsx --test src/utils/__tests__/notification-link.test.ts
// Client side of 20261021140000_security_cleanup: notification links are followed only when they
// stay inside the app (same rule the server enforces on inserts), and the report flow no longer
// reads admin push tokens (the server alerts admins).
/// <reference types="node" />

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { safeNotificationLink } from "../notification-link";

const ROOT = join(__dirname, "..", "..", "..");
const read = (f: string) => readFileSync(join(ROOT, f), "utf8");

test("every link the app itself sends is still followed", () => {
  for (const l of [
    "/(tabs)/shop", "/notifications", "/admin/report-management", "/tournament-detail?id=2847",
    "/(tabs)/profile", "/(tabs)/admin/manage-tournament/2595?issueMatch=W1M1&issueReg=12",
    "competerf:///tournament-detail?id=2847",
  ]) assert.equal(safeNotificationLink(l), l, l);
});

test("anything that could leave the app is dropped", () => {
  for (const l of [
    "https://evil.example/login", "http://x", "//evil.example/x", "/\\evil.example", "javascript:alert(1)",
    "competerf://evil", "mailto:a@b.c", "intent://x", "/ok path", " ", "", null, undefined, 42, { deep_link: "/x" },
  ]) assert.equal(safeNotificationLink(l as any), null, String(l));
});

test("push taps and both inbox screens go through the rule; the report flow no longer pushes to admins", () => {
  assert.ok(/const link = safeNotificationLink\(data\?\.deep_link\);[^\n]*\n\s*if \(link\) router\.push\(link as any\);/.test(read("src/viewmodels/hooks/use.notifications.ts")));
  assert.ok(read("app/(tabs)/notifications.tsx").includes("deep_link: safeNotificationLink(notif.data?.deep_link)"));
  assert.ok(read("src/views/components/notifications/NotificationsModal.tsx").includes(": safeNotificationLink(notif.data?.deep_link)"));
  const rep = read("src/models/services/report.service.ts");
  assert.ok(!rep.includes("sendToAdmins(") && !rep.includes("get_admin_push_tokens"));
});
