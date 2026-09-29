// src/utils/__tests__/profiles-privacy-stage1.test.ts
// Run: npx tsx --test src/utils/__tests__/profiles-privacy-stage1.test.ts
// M3 profiles privacy — Stage 1 client rules:
//  • native minimum-version gate (build numbers, fail-open, web skipped)
//  • /admin route access map (defense in depth; server stays authoritative)
//  • login identifier parsing (username → Edge Function, email → direct)
//  • STATIC privacy guard: no client code reads ANOTHER user's full profile row / email any
//    more, except own-row reads and admin-only screens on an explicit allowlist.
/// <reference types="node" />

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { evaluateVersionGate } from "../version-gate";
import { adminRouteAccess, canAccessAdminPath } from "../admin-route-access";
import { parseLoginIdentifier } from "../login-identifier";

const cfg = { ios_min_build: 68, android_min_build: 8, ios_store_url: "https://apps.apple.com/app/id6759150538", android_store_url: "https://play.google.com/store/apps/details?id=com.thecompeteapp.competerf", message: "Please update." };

// ── version gate ──────────────────────────────────────────────────────────────────────────
test("version gate: below minimum blocks; equal / above pass (per platform, build numbers)", () => {
  assert.equal(evaluateVersionGate({ platform: "android", buildNumber: "7", config: cfg }).status, "update_required");
  assert.equal(evaluateVersionGate({ platform: "android", buildNumber: "8", config: cfg }).status, "ok");
  assert.equal(evaluateVersionGate({ platform: "android", buildNumber: "9", config: cfg }).status, "ok");
  assert.equal(evaluateVersionGate({ platform: "ios", buildNumber: "67", config: cfg }).status, "update_required");
  assert.equal(evaluateVersionGate({ platform: "ios", buildNumber: "68", config: cfg }).status, "ok");
  const r = evaluateVersionGate({ platform: "android", buildNumber: 7, config: cfg });
  assert.ok(r.status === "update_required" && r.storeUrl === cfg.android_store_url && r.message === "Please update." && r.minBuild === 8 && r.currentBuild === 7);
});

test("version gate: never compares marketing versions — only integer build numbers", () => {
  // "1.25" is not a build number → cannot be read → fail open (never block on a version string)
  assert.equal(evaluateVersionGate({ platform: "ios", buildNumber: "1.25", config: cfg }).status, "ok");
});

test("version gate: FAIL-OPEN on web, unknown platform, missing/malformed config, zero/absent minimum, unreadable build", () => {
  for (const platform of ["web", "windows", "macos"]) assert.equal(evaluateVersionGate({ platform, buildNumber: "1", config: cfg }).status, "ok");
  for (const config of [null, undefined, {} as any, { android_min_build: "abc" }, { android_min_build: 0 }, { android_min_build: -5 }]) {
    assert.equal(evaluateVersionGate({ platform: "android", buildNumber: "1", config }).status, "ok");
  }
  for (const buildNumber of [null, undefined, "", "x", "7a"]) assert.equal(evaluateVersionGate({ platform: "android", buildNumber, config: cfg }).status, "ok");
});

test("version gate: the seeded config (0 / 0) blocks no released build", () => {
  const seed = { ios_min_build: 0, android_min_build: 0 };
  for (const b of ["1", "5", "6", "7", "53", "63", "66", "67"]) {
    assert.equal(evaluateVersionGate({ platform: "android", buildNumber: b, config: seed }).status, "ok");
    assert.equal(evaluateVersionGate({ platform: "ios", buildNumber: b, config: seed }).status, "ok");
  }
});

test("version gate: store link must be https (else hidden); default message when missing", () => {
  const r = evaluateVersionGate({ platform: "android", buildNumber: "1", config: { android_min_build: 2, android_store_url: "javascript:alert(1)" } });
  assert.ok(r.status === "update_required" && r.storeUrl === null && r.message.includes("no longer supported"));
});

// ── admin route access ────────────────────────────────────────────────────────────────────
const B = "basic_user", TD = "tournament_director", BO = "bar_owner", CA = "compete_admin", SA = "super_admin";

test("admin routes: basic users only reach the index (which shows 'No Dashboard Access')", () => {
  assert.ok(canAccessAdminPath("/admin", B));
  for (const p of ["/admin/user-management", "/admin/edit-user/123", "/admin/manage-tournament/2810", "/admin/messages", "/admin/tournaments/tournament-director-manager", "/admin/bar-owner-billing"]) {
    assert.equal(canAccessAdminPath(p, B), false, p);
  }
  assert.equal(canAccessAdminPath("/admin/user-management", null), false, "signed out");
});

test("admin routes: TD reaches TD tools, not admin / owner / super screens", () => {
  for (const p of ["/admin/tournaments/tournament-director-manager", "/admin/venues/td-venues", "/admin/manage-tournament/2810", "/admin/chip-tournament/2811", "/admin/messages", "/admin/director-analytics", "/admin/edit-tournament-td/2810"]) {
    assert.ok(canAccessAdminPath(p, TD), p);
  }
  for (const p of ["/admin/user-management", "/admin/edit-user/abc", "/admin/venue-management", "/admin/report-management", "/admin/giveaway-management", "/admin/bulk-import", "/admin/bar-owner-billing", "/admin/add-director", "/admin/tournaments/admin-tournament-manager", "/admin/tournaments/bar-tournament-manager"]) {
    assert.equal(canAccessAdminPath(p, TD), false, p);
  }
});

test("admin routes: bar owner = owner + TD tools; admins everything except super-only bulk import", () => {
  for (const p of ["/admin/bar-owner-billing", "/admin/directors/bar-owner-directors", "/admin/add-director", "/admin/edit-venue/9", "/admin/tournaments/bar-tournament-manager", "/admin/manage-tournament/1"]) assert.ok(canAccessAdminPath(p, BO), p);
  for (const p of ["/admin/user-management", "/admin/bulk-import"]) assert.equal(canAccessAdminPath(p, BO), false, p);
  for (const p of ["/admin/user-management", "/admin/edit-user/x", "/admin/giveaway-management", "/admin/bar-owner-billing", "/admin/manage-tournament/1"]) assert.ok(canAccessAdminPath(p, CA), p);
  assert.equal(canAccessAdminPath("/admin/bulk-import", CA), false);
  assert.ok(canAccessAdminPath("/admin/bulk-import", SA));
});

test("admin routes: path parsing — groups, trailing slash, query, nested ids; unknown routes default to staff-only", () => {
  assert.equal(adminRouteAccess("/(tabs)/admin/user-management/"), "admin");
  assert.equal(adminRouteAccess("/admin/edit-user/abc?x=1"), "admin");
  assert.equal(adminRouteAccess("/admin/tournaments/super-admin-tournament-manager"), "admin");
  assert.equal(adminRouteAccess("/admin/some-new-screen"), "td");
  assert.equal(adminRouteAccess("/admin"), "signed_in");
});

// ── login identifier ──────────────────────────────────────────────────────────────────────
test("login identifier: real emails sign in directly; usernames (incl. @username) go to the Edge Function", () => {
  assert.deepEqual(parseLoginIdentifier(" Someone@Example.com "), { kind: "email", value: "Someone@Example.com" });
  assert.deepEqual(parseLoginIdentifier("GoogleReviewTD"), { kind: "username", value: "GoogleReviewTD" });
  assert.deepEqual(parseLoginIdentifier("@GoogleReviewTD"), { kind: "username", value: "GoogleReviewTD" });
  assert.deepEqual(parseLoginIdentifier("  name_with_underscore "), { kind: "username", value: "name_with_underscore" });
});

// ── static privacy guard ──────────────────────────────────────────────────────────────────
const ROOT = join(__dirname, "..", "..", "..");
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return n === "__tests__" || n === "node_modules" ? [] : walk(p);
    return /\.(ts|tsx)$/.test(n) && !n.endsWith(".d.ts") ? [p] : [];
  });
const files = [...walk(join(ROOT, "src")), ...walk(join(ROOT, "app")), ...walk(join(ROOT, "hooks"))]
  .filter((f) => !f.endsWith(`lib${sep}supabase${sep}database.types.ts`));
const rel = (f: string) => relative(ROOT, f).split(sep).join("/");

// Files allowed to read the base profiles table: OWN-row reads, and ADMIN-only screens
// (admins keep full base access in Stage 3). Everything else must use profiles_public / RPCs.
const OWN_ROW = new Set([
  "src/providers/AuthProvider.tsx", "src/viewmodels/useEditProfile.ts", "src/models/services/profile.service.ts",
  "src/services/sms/smsVerificationService.ts", "src/features/billing/billing.service.ts",
  "src/views/components/faq/ContactModal.tsx", "src/views/screens/auth/login.screen.tsx",
  "src/views/screens/auth/welcome.screen.tsx", "app/(tabs)/profile.tsx", "app/(tabs)/faq.tsx",
]);
const ADMIN_ONLY = new Set([
  "src/viewmodels/useAdminUsers.ts", "src/viewmodels/useEditUser.ts", "src/viewmodels/useAdminTournaments.ts",
  "src/viewmodels/useCompeteAdminDashboard.ts", "src/viewmodels/useSuperAdminDashboard.ts",
  "src/models/services/bulk-import.service.ts", "src/models/services/giveaway.service.ts",
  "src/models/services/featured-content.service.ts", "src/models/services/notification-dispatcher.service.ts",
  "src/viewmodels/hooks/use.message.center.ts", "src/models/services/conversation.service.ts",
  "app/(tabs)/admin/venue-management.tsx", "src/viewmodels/useAdminVenues.ts",
]);

test("static guard: base `profiles` is read only by own-row code and admin-only screens", () => {
  const offenders: string[] = [];
  for (const f of files) {
    const src = readFileSync(f, "utf8");
    if (/from\(\s*["']profiles["']\s*\)/.test(src) && !OWN_ROW.has(rel(f)) && !ADMIN_ONLY.has(rel(f))) offenders.push(rel(f));
  }
  assert.deepEqual(offenders, []);
});

test("static guard: no embed of the BASE profiles table outside admin-only code; no full-row director embed", () => {
  const offenders: string[] = [];
  for (const f of files) {
    // ignore line comments (e.g. "owner_id integer references profiles(id_auto)")
    const src = readFileSync(f, "utf8").replace(/^\s*\/\/.*$/gm, "");
    // alias:profiles(…) / profiles!fk(…) / profiles:col(…)  — but NOT profiles_public
    const base = /(?<![\w_])profiles(?!_public)\s*(?:![\w_]+|:[\w_]+)?\s*\(/g;
    const hits = [...src.matchAll(base)].filter((m) => {
      const before = src.slice(Math.max(0, m.index! - 40), m.index!);
      return /select|`|"|,|\(/.test(before) && !/\.from\(\s*$/.test(before);
    });
    if (hits.length && !ADMIN_ONLY.has(rel(f))) offenders.push(rel(f));
  }
  assert.deepEqual(offenders, []);
  const all = files.map((f) => readFileSync(f, "utf8")).join("\n");
  assert.ok(!/profiles!director_id\(\*\)/.test(all), "no full-row director embed");
  assert.ok(!/resolveEmailFromUsername/.test(all), "no client-side username → email lookup");
});
