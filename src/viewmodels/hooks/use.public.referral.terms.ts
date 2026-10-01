// src/viewmodels/hooks/use.public.referral.terms.ts
// Current public referral earning terms (get_public_referral_terms) for the Official Giveaway Rules
// and the Refer Friends disclosure — both read this one query, so they always agree with the
// Super Admin's Earning Rules without an app release. Null while loading / unavailable (the rules
// then show their generic no-numbers wording). Freshness + invalidation:
// public-referral-terms.query.ts.

import { useQuery } from "@tanstack/react-query";
import { earningRulesService } from "../../models/services/earning-rules.service";
import { PublicReferralTerms } from "../../models/types/earning-rules.types";
import { PUBLIC_REFERRAL_TERMS_QUERY_KEY, PUBLIC_REFERRAL_TERMS_QUERY_OPTIONS } from "./public-referral-terms.query";

export function usePublicReferralTerms(enabled = true): { terms: PublicReferralTerms | null; loading: boolean } {
  const query = useQuery({
    queryKey: PUBLIC_REFERRAL_TERMS_QUERY_KEY,
    queryFn: () => earningRulesService.getPublicTerms(),
    enabled,
    ...PUBLIC_REFERRAL_TERMS_QUERY_OPTIONS,
  });
  return { terms: query.data ?? null, loading: enabled && query.isLoading };
}
