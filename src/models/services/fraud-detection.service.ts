// src/models/services/fraud-detection.service.ts
// ═══════════════════════════════════════════════════════════════════════════
// Fraud detection for giveaway entries.
//
// PHILOSOPHY:
//   • Low friction at entry time — do NOT reject people for weak signals
//     like matching name or birthday alone (common names / shared birthdays
//     are real and legitimate).
//   • Strong signals are stored silently as flags for review before the
//     winner receives their prize.
//   • Final decision is always human — this service informs, not adjudicates.
//
// SIGNAL STRENGTH:
//   STRONG  (weight 3) — near-certain indicator of rule violation
//   MEDIUM  (weight 2) — suspicious, requires context
//   WEAK    (weight 1) — informational only, not disqualifying alone
//
// RISK LEVEL:
//   clean    — total weight 0–1
//   low      — total weight 2–3
//   medium   — total weight 4–5
//   high     — total weight ≥ 6
//
// No new DB tables required. All checks query existing giveaway_entries data.
// ═══════════════════════════════════════════════════════════════════════════

import { supabase } from "../../lib/supabase";

export type FraudSignalStrength = "strong" | "medium" | "weak";
export type FraudRiskLevel = "clean" | "low" | "medium" | "high";

export interface FraudSignal {
  code: string;
  strength: FraudSignalStrength;
  description: string;
  /** IDs of other entries involved (for admin drill-down) */
  relatedEntryIds?: number[];
}

export interface FraudReport {
  userId: number;
  giveawayId: number;
  entryId: number;
  riskLevel: FraudRiskLevel;
  totalWeight: number;
  signals: FraudSignal[];
  /** True if ID verification is recommended before awarding prize */
  requiresVerification: boolean;
  /** True if manual review is strongly recommended */
  requiresManualReview: boolean;
  generatedAt: string;
}

const SIGNAL_WEIGHTS: Record<FraudSignalStrength, number> = {
  strong: 3,
  medium: 2,
  weak: 1,
};

function computeRiskLevel(weight: number): FraudRiskLevel {
  if (weight <= 1) return "clean";
  if (weight <= 3) return "low";
  if (weight <= 5) return "medium";
  return "high";
}

export const fraudDetectionService = {
  // ─────────────────────────────────────────────────────────────────────────
  // Run a full fraud check on a specific entry (used after winner selection).
  // Returns a complete FraudReport with all signals found.
  // ─────────────────────────────────────────────────────────────────────────
  async checkEntry(
    entryId: number,
    giveawayId: number,
    userId: number,
  ): Promise<FraudReport> {
    const signals: FraudSignal[] = [];

    try {
      // Fetch the entry being checked
      const { data: entry, error: entryError } = await supabase
        .from("giveaway_entries")
        .select("id, user_id, name_as_on_id, birthday, email, phone")
        .eq("id", entryId)
        .single();

      if (entryError || !entry) {
        console.error("Fraud check: entry not found", entryError);
        return fraudDetectionService._emptyReport(entryId, giveawayId, userId);
      }

      // Fetch all other entries for this giveaway (excluding the checked entry)
      const { data: otherEntries } = await supabase
        .from("giveaway_entries")
        .select("id, user_id, name_as_on_id, birthday, email, phone")
        .eq("giveaway_id", giveawayId)
        .neq("id", entryId);

      const others = otherEntries || [];

      // ── SIGNAL 1: Duplicate phone in this giveaway (STRONG) ──────────────
      // Same phone number on multiple entries = clear rule violation
      const samePhoneEntries = others.filter(
        (o) => o.phone && o.phone.replace(/\D/g, "") === entry.phone.replace(/\D/g, ""),
      );
      if (samePhoneEntries.length > 0) {
        signals.push({
          code: "DUPLICATE_PHONE_SAME_GIVEAWAY",
          strength: "strong",
          description: `Phone number matches ${samePhoneEntries.length} other ${samePhoneEntries.length === 1 ? "entry" : "entries"} in this giveaway`,
          relatedEntryIds: samePhoneEntries.map((e) => e.id),
        });
      }

      // ── SIGNAL 2: Same name + same DOB in this giveaway (STRONG) ─────────
      // The combination is a strong identity match — unlikely to be coincidence
      const sameIdentityEntries = others.filter(
        (o) =>
          o.name_as_on_id?.toLowerCase().trim() ===
            entry.name_as_on_id?.toLowerCase().trim() &&
          o.birthday === entry.birthday,
      );
      if (sameIdentityEntries.length > 0) {
        signals.push({
          code: "DUPLICATE_IDENTITY_SAME_GIVEAWAY",
          strength: "strong",
          description: `Full name and date of birth match ${sameIdentityEntries.length} other ${sameIdentityEntries.length === 1 ? "entry" : "entries"} in this giveaway`,
          relatedEntryIds: sameIdentityEntries.map((e) => e.id),
        });
      }

      // ── SIGNAL 3: Phone used by different accounts across all giveaways (STRONG)
      // Same phone on different user_ids = one person with multiple accounts
      const { data: crossGiveawayPhoneEntries } = await supabase
        .from("giveaway_entries")
        .select("id, user_id, giveaway_id")
        .eq("phone", entry.phone)
        .neq("user_id", userId);

      if (crossGiveawayPhoneEntries && crossGiveawayPhoneEntries.length > 0) {
        const uniqueUsers = new Set(crossGiveawayPhoneEntries.map((e) => e.user_id));
        signals.push({
          code: "PHONE_LINKED_TO_MULTIPLE_ACCOUNTS",
          strength: "strong",
          description: `Phone number is associated with ${uniqueUsers.size} other user ${uniqueUsers.size === 1 ? "account" : "accounts"}`,
          relatedEntryIds: crossGiveawayPhoneEntries.map((e) => e.id),
        });
      }

      // ── SIGNAL 4: Email alias pattern (MEDIUM) ─────────────────────────
      // username+tag@domain.com patterns suggest alias abuse
      const emailLocal = entry.email.split("@")[0] || "";
      if (emailLocal.includes("+")) {
        signals.push({
          code: "EMAIL_ALIAS_PATTERN",
          strength: "medium",
          description: "Email address appears to use an alias suffix (+ pattern)",
        });
      }

      // ── SIGNAL 5: Base email (before +) matches another entry (MEDIUM) ──
      const baseEmail = entry.email.replace(/\+[^@]*@/, "@").toLowerCase();
      const { data: aliasEmailEntries } = await supabase
        .from("giveaway_entries")
        .select("id, user_id, email")
        .eq("giveaway_id", giveawayId)
        .neq("id", entryId);

      const matchingBaseEmails = (aliasEmailEntries || []).filter((o) => {
        const otherBase = o.email.replace(/\+[^@]*@/, "@").toLowerCase();
        return otherBase === baseEmail;
      });

      if (matchingBaseEmails.length > 0) {
        signals.push({
          code: "EMAIL_BASE_MATCHES_OTHER_ENTRY",
          strength: "medium",
          description: `Email base address matches ${matchingBaseEmails.length} other ${matchingBaseEmails.length === 1 ? "entry" : "entries"} (possible alias)`,
          relatedEntryIds: matchingBaseEmails.map((e) => e.id),
        });
      }

      // ── SIGNAL 6: Same name only, different account (WEAK) ────────────────
      // Common names are legitimate — flag only, never disqualify alone
      const sameNameOnly = others.filter(
        (o) =>
          o.name_as_on_id?.toLowerCase().trim() ===
            entry.name_as_on_id?.toLowerCase().trim() &&
          o.birthday !== entry.birthday,
      );
      if (sameNameOnly.length > 0) {
        signals.push({
          code: "SAME_NAME_DIFFERENT_DOB",
          strength: "weak",
          description: `Name matches ${sameNameOnly.length} other ${sameNameOnly.length === 1 ? "entry" : "entries"} but with a different date of birth`,
          relatedEntryIds: sameNameOnly.map((e) => e.id),
        });
      }

      // ── SIGNAL 7: Same DOB only (WEAK) ────────────────────────────────────
      // Shared birthdays are common — informational only
      const sameDOBOnly = others.filter(
        (o) =>
          o.birthday === entry.birthday &&
          o.name_as_on_id?.toLowerCase().trim() !==
            entry.name_as_on_id?.toLowerCase().trim(),
      );
      if (sameDOBOnly.length > 0) {
        signals.push({
          code: "SAME_DOB_DIFFERENT_NAME",
          strength: "weak",
          description: `Date of birth matches ${sameDOBOnly.length} other ${sameDOBOnly.length === 1 ? "entry" : "entries"} with a different name`,
          relatedEntryIds: sameDOBOnly.map((e) => e.id),
        });
      }
    } catch (error) {
      console.error("Fraud detection error:", error);
      // Return clean on error — fail open, don't block legitimate winners
    }

    const totalWeight = signals.reduce(
      (sum, s) => sum + SIGNAL_WEIGHTS[s.strength],
      0,
    );
    const riskLevel = computeRiskLevel(totalWeight);
    const hasStrongSignal = signals.some((s) => s.strength === "strong");

    return {
      userId,
      giveawayId,
      entryId,
      riskLevel,
      totalWeight,
      signals,
      // ID verification required if:
      //   • total weight ≥ 4 (medium risk threshold), OR
      //   • any single strong signal is present (phone dup, identity dup, etc.)
      // A single medium signal alone (weight 2–3) does NOT trigger verification.
      requiresVerification: totalWeight >= 4 || hasStrongSignal,
      // Manual review only at high risk (weight ≥ 6)
      requiresManualReview: totalWeight >= 6,
      generatedAt: new Date().toISOString(),
    };
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Silent background check at entry time — fire and forget, logs only.
  // Does NOT block entry or return anything to the user.
  // ─────────────────────────────────────────────────────────────────────────
  async silentEntryCheck(
    entryId: number,
    giveawayId: number,
    userId: number,
  ): Promise<void> {
    try {
      const report = await fraudDetectionService.checkEntry(
        entryId,
        giveawayId,
        userId,
      );
      if (report.riskLevel !== "clean") {
        console.warn(
          `🚩 Fraud signals on entry ${entryId} (${report.riskLevel}):`,
          report.signals.map((s) => s.code).join(", "),
        );
        // Future: persist to a fraud_flags table for admin review
      }
    } catch (error) {
      // Never throw — this is a background check
      console.error("Silent fraud check error:", error);
    }
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Human-readable summary of a fraud report for display in admin UI
  // ─────────────────────────────────────────────────────────────────────────
  summarizeReport(report: FraudReport): string {
    if (report.riskLevel === "clean") return "No suspicious activity detected.";
    const strongCount = report.signals.filter((s) => s.strength === "strong").length;
    const mediumCount = report.signals.filter((s) => s.strength === "medium").length;
    const weakCount   = report.signals.filter((s) => s.strength === "weak").length;
    const parts: string[] = [];
    if (strongCount > 0) parts.push(`${strongCount} strong`);
    if (mediumCount > 0) parts.push(`${mediumCount} medium`);
    if (weakCount   > 0) parts.push(`${weakCount} weak`);
    return `${parts.join(", ")} signal${report.signals.length !== 1 ? "s" : ""} detected.`;
  },

  _emptyReport(
    entryId: number,
    giveawayId: number,
    userId: number,
  ): FraudReport {
    return {
      userId,
      giveawayId,
      entryId,
      riskLevel: "clean",
      totalWeight: 0,
      signals: [],
      requiresVerification: false,
      requiresManualReview: false,
      generatedAt: new Date().toISOString(),
    };
  },
};
