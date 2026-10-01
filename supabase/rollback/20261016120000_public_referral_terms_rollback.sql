-- supabase/rollback/20261016120000_public_referral_terms_rollback.sql
-- Removes the public referral-terms RPC. Clients fall back to the generic Referral Rewards text
-- (no numbers) when the RPC is missing, so this is safe at any time.
drop function if exists public.get_public_referral_terms();
