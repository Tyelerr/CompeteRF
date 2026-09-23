-- supabase/rollback/20261002120000_referral_attribution_rollback.sql
--
-- Reverts 20261002120000_referral_attribution.sql entirely.
--
-- ⚠ DESTROYS all referral attribution recorded since apply (referrals rows are the only record
-- of who referred whom). Export first if any real claims exist:
--   select * from referrals;  select * from referral_codes;
-- Revert/disable the client (/r route, signup code field, share card) before or together with
-- this, or those calls will error (they fail soft: no referral recorded, signup unaffected).

drop trigger if exists on_profile_created_create_referral_code on public.profiles;
drop function if exists public.tg_profiles_create_referral_code();
drop function if exists public.claim_referral(text, text);
drop function if exists public.resolve_referral_code(text);
drop function if exists public.get_my_referral_code();
drop function if exists public._referral_ensure_code(bigint);
drop table if exists public.referrals;
drop table if exists public.referral_codes;
