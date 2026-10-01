// src/utils/__tests__/public-referral-terms-query.test.ts
// Run: npx tsx --test src/utils/__tests__/public-referral-terms-query.test.ts
// Freshness of the public referral terms: a Super Admin Earning Rules save must refresh what the
// Official Giveaway Rules / Refer Friends show right away, and only public fields are ever exposed.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import type { PublicReferralTerms } from "../../models/types/earning-rules.types";
import {
  invalidatePublicReferralTerms,
  PUBLIC_REFERRAL_TERMS_QUERY_KEY,
  PUBLIC_REFERRAL_TERMS_QUERY_OPTIONS,
} from "../../viewmodels/hooks/public-referral-terms.query";

const ROOT = join(__dirname, "../../..");
const BEFORE: PublicReferralTerms = {
  referral_rewards_enabled: true, referrer_reward: 1, referred_reward: 1, attribution_window_days: 7, monthly_referrer_cap: 25,
  milestones: [{ threshold: 5, bonus: 5 }],
};
const AFTER: PublicReferralTerms = { ...BEFORE, referrer_reward: 3, monthly_referrer_cap: 10 };
const tick = () => new Promise((r) => setTimeout(r, 20));

/** A mounted reader (what usePublicReferralTerms does) against a fake "server" row. */
function mountReader(server: { terms: PublicReferralTerms | Error }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let fetches = 0;
  const observer = new QueryObserver(queryClient, {
    queryKey: PUBLIC_REFERRAL_TERMS_QUERY_KEY,
    queryFn: async () => {
      fetches++;
      if (server.terms instanceof Error) throw server.terms;
      return server.terms;
    },
    ...PUBLIC_REFERRAL_TERMS_QUERY_OPTIONS,
    retry: false,
  });
  const unsubscribe = observer.subscribe(() => {});
  return { queryClient, observer, unsubscribe, fetches: () => fetches };
}

test("freshness: ≤ 60 s stale, refetch on every open, no polling", () => {
  assert.ok(PUBLIC_REFERRAL_TERMS_QUERY_OPTIONS.staleTime <= 60_000);
  assert.equal(PUBLIC_REFERRAL_TERMS_QUERY_OPTIONS.refetchOnMount, "always");
  assert.equal(PUBLIC_REFERRAL_TERMS_QUERY_OPTIONS.refetchInterval, false);
});

test("an admin save makes the public terms stale and refetches them immediately", async () => {
  const server = { terms: BEFORE as PublicReferralTerms | Error };
  const r = mountReader(server);
  await tick();
  assert.deepEqual(r.observer.getCurrentResult().data, BEFORE);
  assert.equal(r.fetches(), 1);
  assert.equal(r.queryClient.getQueryState(PUBLIC_REFERRAL_TERMS_QUERY_KEY)?.isInvalidated, false);

  server.terms = AFTER; // Super Admin saves new Earning Rules (server enforces them at once)
  await invalidatePublicReferralTerms(r.queryClient); // what useGiveawayEarningRules.save does
  await tick();
  assert.equal(r.fetches(), 2); // refetched now — not after the 30 s staleTime
  assert.deepEqual(r.observer.getCurrentResult().data, AFTER);
  r.unsubscribe();
});

test("an invalidation with no reader mounted marks the terms stale for the next open", async () => {
  const r = mountReader({ terms: BEFORE });
  await tick();
  r.unsubscribe(); // rules screen closed
  await invalidatePublicReferralTerms(r.queryClient);
  assert.equal(r.queryClient.getQueryState(PUBLIC_REFERRAL_TERMS_QUERY_KEY)?.isInvalidated, true);
});

test("graceful fallback: a failed refetch keeps the last good terms; no terms → error, no data", async () => {
  const server = { terms: BEFORE as PublicReferralTerms | Error };
  const r = mountReader(server);
  await tick();
  server.terms = new Error("rpc unavailable");
  await invalidatePublicReferralTerms(r.queryClient);
  await tick();
  assert.deepEqual(r.observer.getCurrentResult().data, BEFORE); // still shows the last known terms
  r.unsubscribe();

  const missing = mountReader({ terms: new Error("function get_public_referral_terms does not exist") });
  await tick();
  assert.equal(missing.observer.getCurrentResult().data, undefined); // hook → null → generic wording
  missing.unsubscribe();
});

test("Earning Rules save invalidates the public terms only after a successful save", () => {
  const src = readFileSync(join(ROOT, "src/viewmodels/useGiveawayEarningRules.ts"), "utf8");
  const save = src.slice(src.indexOf("const save = useCallback"), src.indexOf("const reviewFlag"));
  const failReturn = save.indexOf("return;");
  const invalidate = save.indexOf("invalidatePublicReferralTerms(queryClient)");
  assert.ok(invalidate > failReturn && failReturn > 0, "invalidate after the failure early-return");
  assert.ok(invalidate > save.indexOf("setSaved(res.rules)"));
});

test("no admin-only fields are exposed (RPC, type, reader)", () => {
  const sql = readFileSync(join(ROOT, "supabase/migrations/20261016120000_public_referral_terms.sql"), "utf8");
  const body = sql.slice(sql.indexOf("as $$"), sql.lastIndexOf("$$;"));
  const keys = [...body.matchAll(/'([a-z_]+)',\s+(?:rr\.|case)/g)].map((m) => m[1]).sort();
  const PUBLIC = ["attribution_window_days", "milestones", "monthly_referrer_cap", "referral_rewards_enabled", "referred_reward", "referrer_reward"];
  assert.deepEqual(keys, PUBLIC); // exact output keys (milestones_enabled is only read, folded into milestones)
  for (const adminOnly of ["velocity", "updated_by", "updated_at", "flag", "audit", "stats"]) {
    assert.ok(!body.includes(adminOnly), `RPC must not expose ${adminOnly}`);
  }
  const types = readFileSync(join(ROOT, "src/models/types/earning-rules.types.ts"), "utf8");
  const iface = types.slice(types.indexOf("export interface PublicReferralTerms"), types.indexOf("}", types.indexOf("export interface PublicReferralTerms")));
  assert.deepEqual([...iface.matchAll(/^\s+([a-z_]+):/gm)].map((m) => m[1]).sort(), PUBLIC);
  assert.deepEqual(Object.keys(BEFORE).sort(), PUBLIC);
});
