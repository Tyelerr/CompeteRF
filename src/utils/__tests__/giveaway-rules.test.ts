// src/utils/__tests__/giveaway-rules.test.ts
// Run: npx tsx --test src/utils/__tests__/giveaway-rules.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { referralCardNote } from "../../models/constants/giveaway-rules";
import type { PublicReferralTerms } from "../../models/types/earning-rules.types";
import {
  buildOfficialRules,
  drawOddsLabel,
  endConditionOf,
  endsLabel,
  entryLimitLabel,
  formatArizonaDeadline,
} from "../giveaway-rules";

const CREATE_END = "2026-10-05T23:59:59-07:00"; // what Create Giveaway stores (11:59:59 PM Arizona)
/** Production Earning Rules as of 2026-10-01 — what get_public_referral_terms returns today. */
const PROD_TERMS: PublicReferralTerms = {
  referral_rewards_enabled: true, referrer_reward: 1, referred_reward: 1, attribution_window_days: 7, monthly_referrer_cap: 25,
  milestones: [{ threshold: 5, bonus: 5 }, { threshold: 10, bonus: 5 }, { threshold: 25, bonus: 5 }, { threshold: 50, bonus: 5 }],
};
const text = (g: Parameters<typeof buildOfficialRules>[0], terms: PublicReferralTerms | null = PROD_TERMS) =>
  buildOfficialRules(g, terms).map((s) => `${s.heading}\n${s.body}`).join("\n\n");
const referralSection = (terms: PublicReferralTerms | null) =>
  buildOfficialRules(null, terms).find((s) => s.id === "referrals")!.body;
const headings = (g: Parameters<typeof buildOfficialRules>[0]) => buildOfficialRules(g).map((s) => s.heading).filter(Boolean);

const legacyDate = { entry_mode: "legacy_single" as const, per_user_max: null, max_entries: null, end_date: CREATE_END };
const legacyCap = { entry_mode: "legacy_single" as const, per_user_max: null, max_entries: 200, end_date: null };
const walletBoth = { entry_mode: "wallet" as const, per_user_max: 10, max_entries: 5000, end_date: CREATE_END };
const walletDate = { entry_mode: "wallet" as const, per_user_max: 10, max_entries: null, end_date: CREATE_END };
const walletCap = { entry_mode: "wallet" as const, per_user_max: 10, max_entries: 5000, end_date: null };

test("Single Free Entry rules: one entry, no wallet sections", () => {
  const t = text(legacyDate);
  assert.match(t, /NO PURCHASE NECESSARY/);
  assert.match(t, /Single Free Entry giveaways: limit one \(1\) entry per person per giveaway\./);
  assert.match(t, /duplicate accounts, or false or fraudulent information will result in disqualification/);
  assert.match(t, /each eligible entrant has one entry, and therefore one chance to win/);
  assert.doesNotMatch(t, /Giveaway Entries giveaways:/);
  assert.doesNotMatch(t, /Referral Rewards|Cancellation|allocated/);
});

test("Giveaway Entries rules: multiple entries, per-user max, committed, refund, odds", () => {
  const t = text(walletBoth);
  assert.doesNotMatch(t, /limit one \(1\) entry/i);
  assert.match(t, /up to this giveaway’s per-person maximum of 10/);
  assert.match(t, /Each allocated Giveaway Entry is one entry in the drawing/);
  assert.match(t, /Allocated entries are committed to that giveaway/);
  assert.match(t, /returned to each entrant’s Giveaway Entries balance/);
  assert.match(t, /Your odds of winning equal the number of your eligible entries divided by the total number of eligible entries/);
  for (const fact of [
    /promotional chances/, /no cash value/, /cannot be bought/, /cannot be sold, transferred, or exchanged between users/,
    /tied to the Compete account/, /do not expire under the current program/, /referrals and referral milestone bonuses/,
    /own per-person maximum and total entry capacity/, /fraud, self-referral, duplicate accounts/, /forfeits any unused Giveaway Entries balance/,
    /entries you have not used yet/,
  ]) assert.match(t, fact);
  assert.doesNotMatch(t, /alternate (free )?method of entry|AMOE/i);
});

test("referral terms show the live Earning Rules (production values)", () => {
  const t = referralSection(PROD_TERMS);
  assert.match(t, /under the referral reward terms in effect when a referral is claimed/);
  assert.match(t, /Each account can be referred only once, and you cannot refer yourself/);
  assert.match(t, /Attribution window: the invite must be claimed within 7 days after the new account is created\./);
  assert.match(t, /You \(the referrer\) receive \+1 Giveaway Entry for each qualifying referral, up to 25 per-referral rewards per calendar month \(Arizona time\)\. Referrals beyond that limit still count toward milestone bonuses\./);
  assert.match(t, /The new user receives \+1 Giveaway Entry\./);
  assert.match(t, /\+5 Giveaway Entries each time you reach 5, 10, 25, and 50 successful referrals\. Each milestone is awarded once\./);
  assert.match(t, /reviewed for abuse/);
  assert.match(t, /Compete may change referral reward amounts and limits at any time\. Changes apply to referrals claimed afterward and do not change entries already issued\./);
  assert.match(text(walletBoth), /4\. Referral Rewards/);
});

test("referral terms follow an admin edit with no code change", () => {
  const edited: PublicReferralTerms = {
    referral_rewards_enabled: true, referrer_reward: 3, referred_reward: 2, attribution_window_days: 14, monthly_referrer_cap: 10,
    milestones: [{ threshold: 3, bonus: 2 }, { threshold: 20, bonus: 10 }],
  };
  const t = referralSection(edited);
  assert.match(t, /receive \+3 Giveaway Entries for each qualifying referral, up to 10 per-referral rewards per calendar month/);
  assert.match(t, /The new user receives \+2 Giveaway Entries\./);
  assert.match(t, /within 14 days/);
  assert.match(t, /\+2 Giveaway Entries at 3 successful referrals; \+10 Giveaway Entries at 20 successful referrals/);
  assert.doesNotMatch(t, /\+1 Giveaway Entry|up to 25|7 days/);
});

test("referral terms: paused, unavailable, zero amounts, milestones off", () => {
  const paused = referralSection({ ...PROD_TERMS, referral_rewards_enabled: false });
  assert.match(paused, /Referral rewards are currently paused/);
  assert.doesNotMatch(paused, /\+1|Milestone bonuses:/);
  const unavailable = referralSection(null);
  assert.match(unavailable, /not available right now/);
  assert.match(unavailable, /Compete may change referral reward amounts/);
  assert.doesNotMatch(unavailable, /\+\d/);
  assert.match(
    referralSection({ ...PROD_TERMS, monthly_referrer_cap: 0 }),
    /Per-referral rewards to referrers are not currently being issued\. Qualifying referrals still count toward milestone bonuses\./,
  );
  const noReferrer = referralSection({ ...PROD_TERMS, referrer_reward: 0 });
  assert.match(noReferrer, /Referrers do not currently receive a per-referral reward/);
  assert.doesNotMatch(noReferrer, /Milestone bonuses:/); // milestones count only referrer-rewarded/capped referrals
  assert.match(referralSection({ ...PROD_TERMS, referred_reward: 0 }), /New users do not currently receive a referral reward/);
  assert.doesNotMatch(referralSection({ ...PROD_TERMS, milestones: [] }), /Milestone bonuses:/);
});

test("Refer Friends note uses the same live terms", () => {
  assert.equal(referralCardNote(PROD_TERMS), "When a friend joins with your invite, you each get +1 Giveaway Entry. Limits apply.");
  assert.equal(
    referralCardNote({ ...PROD_TERMS, referrer_reward: 2 }),
    "When a friend joins with your invite, you get +2 Giveaway Entries and they get +1 Giveaway Entry. Limits apply.",
  );
  assert.equal(referralCardNote({ ...PROD_TERMS, referred_reward: 0 }), "Get +1 Giveaway Entry when a friend joins with your invite. Limits apply.");
  assert.equal(referralCardNote({ ...PROD_TERMS, referral_rewards_enabled: false }), null);
  assert.equal(referralCardNote(null), null);
});

test("REFERRAL_REWARDS_LIVE stays off (promotional note hidden)", () => {
  const src = readFileSync(join(__dirname, "../referral.ts"), "utf8");
  assert.match(src, /export const REFERRAL_REWARDS_LIVE = false;/);
});

test("public referral RPC exposes only the public fields", () => {
  const sql = readFileSync(join(__dirname, "../../../supabase/migrations/20261016120000_public_referral_terms.sql"), "utf8");
  const body = sql.slice(sql.indexOf("as $$"), sql.lastIndexOf("$$;"));
  const keys = [...body.matchAll(/'([a-z_]+)',\s+(?:rr\.|case)/g)].map((m) => m[1]).sort();
  assert.deepEqual(keys, ["attribution_window_days", "milestones", "monthly_referrer_cap", "referral_rewards_enabled", "referred_reward", "referrer_reward"]);
  assert.doesNotMatch(body, /velocity|updated_by|updated_at|flag|audit/);
  assert.match(sql, /grant execute on function public\.get_public_referral_terms\(\) to anon, authenticated;/);
});

test("end conditions: date-only / capacity-only / both", () => {
  assert.equal(endConditionOf(walletDate), "date");
  assert.equal(endConditionOf(walletCap), "entries");
  assert.equal(endConditionOf(walletBoth), "both");
  assert.equal(endConditionOf({ entry_mode: "legacy_single", max_entries: null, end_date: null }), "none");

  assert.match(text(walletDate), /This giveaway ends at 11:59 PM Arizona time on October 5, 2026\. It has no entry capacity\./);
  assert.match(text(walletCap), /This giveaway ends as soon as 5,000 total entries have been received\. It has no end date\./);
  assert.match(text(walletBoth), /ends when 5,000 total entries have been received or at 11:59 PM Arizona time on October 5, 2026, whichever happens first/);
  assert.match(text(legacyCap), /ends as soon as 200 total entries have been received/);

  assert.equal(endsLabel(walletDate), "October 5, 2026, 11:59 PM (Arizona time)");
  assert.equal(endsLabel(walletCap), "At 5,000 total entries");
  assert.equal(endsLabel(walletBoth), "At 5,000 total entries or October 5, 2026, 11:59 PM (Arizona time), whichever comes first");
  assert.equal(endsLabel({ entry_mode: "legacy_single", max_entries: null, end_date: null }), null);
});

test("the stored end time is shown as-is (no assumed 11:59 PM)", () => {
  // Edit Giveaway currently saves T23:59:00Z = 4:59 PM Arizona — the rules must state the real time.
  assert.equal(formatArizonaDeadline("2026-10-05T23:59:00.000Z"), "4:59 PM Arizona time on October 5, 2026");
  assert.equal(formatArizonaDeadline("2026-01-01T06:59:59Z"), "11:59 PM Arizona time on December 31, 2025");
  assert.equal(formatArizonaDeadline("not a date"), null);
});

test("no rules variant claims every giveaway has a start and end date", () => {
  for (const g of [null, legacyDate, legacyCap, walletDate, walletCap, walletBoth]) {
    assert.doesNotMatch(text(g), /start and end date/);
    assert.match(text(g), /Entries received after a giveaway ends will not be accepted\./);
  }
});

test("public page (no giveaway) covers both entry methods and all end conditions", () => {
  const t = text(null);
  assert.match(t, /Single Free Entry giveaways: limit one/);
  assert.match(t, /Giveaway Entries giveaways: you choose how many/);
  assert.match(t, /the giveaway’s per-person maximum shown on the listing/);
  assert.match(t, /By entry capacity/);
  assert.match(t, /By end date — the giveaway ends at the end date and time shown on the listing \(Arizona time\)/);
  assert.match(t, /whichever happens first/);
  assert.match(t, /Referral Rewards/);
});

test("sponsor, platform disclaimer, winner/redraw wording", () => {
  for (const g of [null, legacyDate, walletBoth]) {
    const t = text(g);
    assert.match(t, /sponsored and administered by Compete Tournaments LLC, Phoenix, Arizona/);
    assert.match(t, /Apple Inc\. and Google LLC are not sponsors of the giveaway\./);
    assert.match(t, /notified through the Compete app and\/or the email address or phone number provided/);
    assert.match(t, /an alternate winner may be selected from the remaining eligible entries/);
  }
});

test("sections are numbered consecutively in every variant", () => {
  for (const g of [null, legacyDate, walletBoth]) {
    const nums = headings(g).filter((h) => /^\d+\./.test(h)).map((h) => parseInt(h, 10));
    assert.deepEqual(nums, nums.map((_, i) => i + 1));
  }
  assert.deepEqual(headings(legacyDate).slice(0, 4), ["Sponsor", "Platform Disclaimer", "1. Eligibility", "2. How to Enter"]);
  assert.ok(headings(walletBoth).includes("3. Giveaway Entries"));
  assert.ok(headings(walletBoth).includes("4. Referral Rewards"));
});

test("Entry Limit display", () => {
  assert.equal(entryLimitLabel(legacyDate), "1 per person"); // was "Unlimited" when max_entries was null
  assert.equal(entryLimitLabel(legacyCap), "1 per person");
  assert.equal(entryLimitLabel(walletBoth), "Up to 10 per person");
  assert.equal(entryLimitLabel(walletDate), "Up to 10 per person");
  assert.equal(entryLimitLabel({ entry_mode: "wallet", per_user_max: null }), "Multiple per person");
});

test("admin draw-odds label", () => {
  assert.equal(drawOddsLabel("legacy_single", 1234), "1 in 1,234");
  assert.equal(drawOddsLabel("wallet", 1234), "Weighted by entries");
  assert.equal(drawOddsLabel("legacy_single", 0), "—");
});

test("single source: rules text exists nowhere else in app/ or src/", () => {
  const root = join(__dirname, "../../..");
  const allowed = new Set(["src/models/constants/giveaway-rules.ts", "src/utils/__tests__/giveaway-rules.test.ts"]);
  const markers = [/NO PURCHASE NECESSARY/, /Limit one \(1\) entry per person/i, /DEFAULT_RULES_SECTIONS/, /rulesForEntryMode/];
  const offenders: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(tsx?|jsx?)$/.test(name)) {
        const rel = relative(root, p).replace(/\\/g, "/");
        if (allowed.has(rel)) continue;
        const src = readFileSync(p, "utf8");
        if (markers.some((m) => m.test(src))) offenders.push(rel);
      }
    }
  };
  walk(join(root, "src"));
  walk(join(root, "app"));
  assert.deepEqual(offenders, []);
});
