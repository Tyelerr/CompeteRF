// src/utils/__tests__/play-compliance.test.ts
// Run: npx tsx --test src/utils/__tests__/play-compliance.test.ts
// Google Play pre-build batch (Android versionCode 8):
//  • unused Android permissions are blocked in app config
//  • Android billing: no payable Stripe invoice link, no in-app reactivate
//  • user-safety report types route through the verifying RPC; block errors are recognized
//  • static wiring: report/block entry points exist on every UGC surface, and the server
//    migrations keep the invariants the client relies on
/// <reference types="node" />

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { canTransactInApp, invoiceLinkFor } from "../../features/billing/billing-platform";
import { CONTENT_TYPE_LABELS, REPORT_REASON_LABELS, isRpcReportType } from "../../models/types/report.types";
import { BLOCKED_MESSAGING_TEXT, isBlockedMessagingError, reportErrorMessage } from "../user-safety";

const ROOT = join(__dirname, "..", "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8").replace(/^﻿/, "");

// ── Android permissions ──────────────────────────────────────────────────────────────
test("app.json blocks the unused CAMERA / RECORD_AUDIO / SYSTEM_ALERT_WINDOW permissions", () => {
  const cfg = JSON.parse(read("app.json"));
  const blocked: string[] = cfg.expo.android.blockedPermissions;
  for (const p of ["android.permission.CAMERA", "android.permission.RECORD_AUDIO", "android.permission.SYSTEM_ALERT_WINDOW"]) {
    assert.ok(blocked.includes(p), `${p} must be blocked`);
  }
  // Never block what Compete needs (push, network, haptics).
  for (const needed of ["POST_NOTIFICATIONS", "INTERNET", "VIBRATE", "RECEIVE_BOOT_COMPLETED", "WAKE_LOCK"]) {
    assert.ok(!blocked.some((p) => p.endsWith(needed)), `${needed} must not be blocked`);
  }
  assert.equal(cfg.expo.android.permissions, undefined, "no explicit permission additions");
});

// ── Android billing ──────────────────────────────────────────────────────────────────
const inv = (status: "paid" | "open" | "void" | "uncollectible") => ({
  status,
  hosted_invoice_url: "https://invoice.stripe.com/i/abc",
  receipt_url: status === "paid" ? "https://pay.stripe.com/receipts/abc" : null,
});

test("Android never links to a payable hosted invoice; paid receipts only", () => {
  assert.equal(canTransactInApp("android"), false);
  assert.equal(invoiceLinkFor(inv("open"), "android"), null);
  assert.equal(invoiceLinkFor(inv("uncollectible"), "android"), null);
  assert.equal(invoiceLinkFor(inv("void"), "android"), null);
  assert.equal(invoiceLinkFor(inv("paid"), "android"), "https://pay.stripe.com/receipts/abc");
  assert.equal(invoiceLinkFor({ ...inv("paid"), receipt_url: null }, "android"), null);
});

test("web and iOS billing behavior is unchanged", () => {
  for (const p of ["web", "ios"]) {
    assert.equal(canTransactInApp(p), true);
    assert.equal(invoiceLinkFor(inv("open"), p), "https://invoice.stripe.com/i/abc");
    assert.equal(invoiceLinkFor({ ...inv("open"), hosted_invoice_url: null }, p), null);
  }
});

test("billing screen: Reactivate and payable links are gated on canTransact", () => {
  const src = read("app/(tabs)/admin/bar-owner-billing.tsx");
  assert.match(src, /canTransactInApp\(Platform\.OS\)/);
  assert.match(src, /invoiceLinkFor\(invoice, Platform\.OS\)/);
  assert.match(src, /\(vm\.isCanceled \|\| vm\.isCancelAtPeriodEnd\) && !canTransact/);
  assert.doesNotMatch(src, /invoice\.hosted_invoice_url \?\? invoice\.receipt_url/);
});

// ── Reports / blocks ─────────────────────────────────────────────────────────────────
test("user / message / review reports go through the verifying RPC; legacy types stay direct", () => {
  for (const t of ["user", "message", "review"] as const) assert.equal(isRpcReportType(t), true);
  for (const t of ["tournament", "profile", "giveaway"] as const) assert.equal(isRpcReportType(t), false);
  assert.equal(CONTENT_TYPE_LABELS.message, "Message");
  assert.ok(REPORT_REASON_LABELS.harassment);
});

test("block + report error helpers", () => {
  assert.equal(isBlockedMessagingError({ message: "blocked" }), true);
  assert.equal(isBlockedMessagingError(new Error("blocked")), true);
  assert.equal(isBlockedMessagingError({ message: "recipient_archived" }), false);
  assert.equal(isBlockedMessagingError(null), false);
  assert.match(BLOCKED_MESSAGING_TEXT, /can't send messages/);
  assert.match(reportErrorMessage("cannot_report_self"), /your own/);
  assert.match(reportErrorMessage("not_found"), /no longer available/);
  assert.match(reportErrorMessage(undefined), /try again/);
});

test("every UGC surface exposes report (+ block where messaging is possible)", () => {
  const thread = read("src/views/components/notifications/ConversationThread.tsx");
  assert.match(thread, /openReportModal\("user"/);
  assert.match(thread, /openReportModal\("message"/);
  assert.match(thread, /confirmBlock/);
  assert.match(thread, /canBlock = isSupport === false/, "support threads are never blockable");
  const reviews = read("src/views/components/reviews/ReviewsManager.tsx");
  assert.match(reviews, /openReportModal\("review"/);
  assert.match(reviews, /openReportModal\("user"/);
  assert.match(reviews, /openReportModal\("message"/);
  assert.match(reviews, /confirmBlock/);
  const admin = read("app/(tabs)/admin/report-management.tsx");
  assert.match(admin, /content_snapshot/);
  assert.match(admin, /edit-user\/\$\{report\.reported_user_id\}/);
});

test("UGC migration: RPC-only new types, private blocks, support exempt", () => {
  const sql = read("supabase/migrations/20261012120000_ugc_report_block.sql");
  assert.match(sql, /content_type = any \(array\['tournament','profile','giveaway'\]\)/);
  assert.match(sql, /can_view_tournament_reviews\(v_rev\.tournament_id\)/);
  assert.match(sql, /where cp\.conversation_id = v_msg\.conversation_id and cp\.user_id = v_uid\)/, "message reports: participants only");
  assert.match(sql, /using \(blocker_id = auth\.uid\(\)\)/);
  assert.match(sql, /c\.is_support\) then\s*return new/);
  assert.match(sql, /raise exception 'blocked'/);
});

test("deletion migration: unblocks FKs, de-identifies players, protects others' history", () => {
  const sql = read("supabase/migrations/20261012120100_account_deletion_hardening.sql");
  for (const fk of ["bar_requests_submitted_by_fkey", "bar_requests_reviewed_by_fkey", "image_scan_logs_user_id_fkey", "venue_audits_owner_id_fkey", "reassignment_logs_previous_user_fkey", "reassignment_logs_new_user_fkey", "reassignment_logs_reassigned_by_fkey"]) {
    assert.match(sql, new RegExp(`${fk}\\s+foreign key[^;]+on delete set null`), fk);
  }
  assert.match(sql, /SET email = NULL,[\s\S]*phone_e164 = NULL,[\s\S]*profile_id = NULL,[\s\S]*account_status = 'DISABLED'/);
  assert.doesNotMatch(sql, /email_normalized = NULL/, "email_normalized is a generated column");
  assert.match(sql, /DELETE FROM player_invitations WHERE player_id = ANY\(v_player_ids\)/);
  assert.match(sql, /UPDATE chip_entries SET p1_phone = NULL/);
  assert.match(sql, /other players'' registrations or results/);
  assert.match(sql, /DELETE FROM auth\.users WHERE id = v_uid/);
  // The captain move must run BEFORE the profile delete (captain_id is ON DELETE CASCADE).
  assert.ok(sql.indexOf("UPDATE tournament_teams") < sql.indexOf("DELETE FROM profiles WHERE id = v_uid"));
});
