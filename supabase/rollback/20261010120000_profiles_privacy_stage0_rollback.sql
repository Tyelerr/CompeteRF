-- supabase/pending/20261010120000_profiles_privacy_stage0_rollback.sql
-- Reverts Stage 0: drops the new view + functions and restores the default privileges it
-- revoked. Existing profiles policies were never touched, so nothing else needs restoring.
drop function if exists public.search_users_for_staff(text, int);
drop function if exists public._mask_email(text);
drop function if exists public.search_players(text, int);
drop function if exists public.is_username_available(text);
drop function if exists public._login_email_for_username(text);
drop view if exists public.profiles_public;
grant truncate, trigger, references on public.profiles to anon, authenticated;
