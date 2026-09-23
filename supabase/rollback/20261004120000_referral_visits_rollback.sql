-- supabase/rollback/20261004120000_referral_visits_rollback.sql
--
-- Reverts 20261004120000_referral_visits.sql. Referral attribution (referral_codes, referrals,
-- claim_referral) is untouched either way.
-- ⚠ Destroys the funnel analytics recorded since apply (export referral_visits first if needed).
-- The client fails soft without these functions (visits simply aren't tracked).

drop function if exists public.link_referral_visit(uuid);
drop function if exists public.mark_referral_visit(uuid, text);
drop function if exists public.log_referral_visit(text, text, text, text);
drop table if exists public.referral_visits;
