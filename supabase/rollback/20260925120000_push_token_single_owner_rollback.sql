-- supabase/rollback/20260925120000_push_token_single_owner_rollback.sql
-- Reverts 20260925120000_push_token_single_owner.sql (index + trigger + function). Rows the
-- cleanup deactivated stay inactive (each account re-activates its row on its next sign-in on
-- that device); restoring the old multi-owner state is intentionally not automated.
drop index if exists public.push_tokens_one_active_owner;
drop trigger if exists push_tokens_single_owner on public.push_tokens;
drop function if exists public._push_tokens_single_owner();
