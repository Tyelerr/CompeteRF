-- Align is_chip_manager with the authoritative can_manage_tournament gate (Phase F /
-- audit item 40).
--
-- Problem: is_chip_manager(p_tid) (migration 20260624120000) authorized only the
-- tournament's director_id + compete_admin/super_admin. It gates the WRITE (ALL) RLS
-- policies on every chip_* table (chip_config, chip_entries, chip_matches, chip_tables,
-- chip_events) and chip_results. So a VENUE OWNER or VENUE DIRECTOR who is legitimately
-- allowed to manage the tournament in the UI (and is already authorized by every
-- registration/team RPC via can_manage_tournament) could NOT write chip state — RLS and
-- the UI disagreed.
--
-- Fix (smallest correct change): redefine is_chip_manager to delegate to the existing
-- authoritative helper public.can_manage_tournament(p_tid), which already covers ALL
-- legitimate management roles: compete/super admin, tournament director, active venue
-- owner, active venue director. This makes chip_* write RLS agree with the RPC/UI model
-- and keeps a single source of truth for "can manage this tournament". Signature, grants
-- (authenticated), security-definer/stable, and all call sites are unchanged — only the
-- set of authorized users widens to the roles the UI already allows.
--
-- can_manage_tournament exists as of 20260805120000 (this migration is later). No schema
-- change; behavior only widens (no one loses access), so it is safe to apply anytime.
--
-- ROLLBACK: supabase/rollback/20260909140000_is_chip_manager_venue_owners_rollback.sql

create or replace function public.is_chip_manager(p_tid bigint)
  returns boolean
  language sql
  security definer
  stable
  set search_path = public, pg_temp
as $$
  select public.can_manage_tournament(p_tid);
$$;

revoke all on function public.is_chip_manager(bigint) from public, anon;
grant execute on function public.is_chip_manager(bigint) to authenticated;
