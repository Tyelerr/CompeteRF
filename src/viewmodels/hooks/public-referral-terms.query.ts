// src/viewmodels/hooks/public-referral-terms.query.ts
// React Query contract for the public referral terms (get_public_referral_terms), shared by the
// reader hook (use.public.referral.terms.ts) and the Earning Rules save (useGiveawayEarningRules).
// Kept free of Supabase imports so it is unit-testable (src/utils/__tests__/public-referral-terms-query.test.ts).
//
// Freshness: these are presented as the CURRENT reward terms and the server enforces an admin
// change immediately, so:
//   • staleTime 30 s, and every mount of a rules / referral surface refetches (refetchOnMount
//     "always") — opening the rules shows the current values; no polling interval;
//   • a successful Earning Rules save invalidates the query → mounted readers refetch at once.
// Errors keep the last good value (React Query retains data on a failed refetch); with no value at
// all the rules fall back to their generic no-numbers wording.

import type { QueryClient } from "@tanstack/react-query";

export const PUBLIC_REFERRAL_TERMS_QUERY_KEY = ["public-referral-terms"] as const;

export const PUBLIC_REFERRAL_TERMS_QUERY_OPTIONS = {
  staleTime: 30 * 1000,
  refetchOnMount: "always",
  refetchOnWindowFocus: true,
  refetchInterval: false,
  retry: 1,
} as const;

/** Call after Earning Rules are saved: marks the public terms stale and refetches mounted readers. */
export function invalidatePublicReferralTerms(queryClient: QueryClient): Promise<void> {
  return queryClient.invalidateQueries({ queryKey: PUBLIC_REFERRAL_TERMS_QUERY_KEY });
}
