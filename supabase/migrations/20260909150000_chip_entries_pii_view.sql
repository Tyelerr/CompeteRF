-- Restrict chip_entries PII (p1_phone) — spectator-safe public view (Phase F / audit item
-- 39, Option A).
--
-- Problem: every chip_* table's read policy is `for select using (true)` (fully public),
-- so chip_entries.p1_phone (participant PII) is readable by anon/authenticated spectators.
--
-- Fix (Option A): restrict the BASE chip_entries SELECT to tournament MANAGERS, and expose
-- a spectator-safe VIEW (chip_entries_public) that projects every column EXCEPT p1_phone
-- for public/spectator/player reads. Managers keep full-row access (incl. p1_phone) on the
-- base table; public access is NOT broadened (same rows as before, minus the phone).
--
-- The view runs with definer rights (security_invoker = false) so it reads the base table
-- as its owner and returns the same public row set the feed showed before — the base RLS
-- restriction applies to DIRECT base reads only. p1_phone is kept in the base table (may
-- feed future SMS/notification features); it is simply not exposed publicly.
--
-- APPLY ORDER: apply AFTER 20260909140000 (is_chip_manager → can_manage_tournament) so the
-- base manager-only policy admits venue owners/directors too, not just director/admin.
--
-- The client (chipService.load) already routes spectator/player reads to
-- chip_entries_public and falls back to the base table if this view is absent, so it is
-- safe whether or not this migration has been applied yet.
--
-- Column list = every column the client row-mapper consumes, minus p1_phone. If a future
-- migration adds a spectator-visible column to chip_entries, add it here too (a definer
-- view does not auto-pick up new base columns).
--
-- ROLLBACK: supabase/rollback/20260909150000_chip_entries_pii_view_rollback.sql

-- 1) Base table: managers only (replaces the public read policy for chip_entries ONLY;
--    other chip_* tables stay public — they carry no PII).
drop policy if exists chip_entries_read on public.chip_entries;
create policy chip_entries_read on public.chip_entries
  for select using (public.is_chip_manager(tournament_id));

-- 2) Spectator-safe projection (no p1_phone).
create or replace view public.chip_entries_public as
select
  id,
  tournament_id,
  p1_name,
  p1_fargo,
  p1_profile_id,
  p2_profile_id,
  p1_player_id,
  p2_player_id,
  p2_name,
  p2_fargo,
  team_fargo,
  start_chips,
  chips,
  paid,
  checked_in,
  paid_side_pots,
  status,
  wins,
  losses,
  streak,
  best_streak,
  eliminations,
  table_id,
  eliminated_at,
  created_at,
  fargo_cap_override,
  fargo_cap_at_override,
  player_fargo_at_override,
  fargo_cap_override_reason,
  fargo_cap_override_notes,
  overridden_by,
  overridden_at
from public.chip_entries;

-- Definer view: returns the public row set regardless of the base manager-only RLS.
alter view public.chip_entries_public set (security_invoker = false);

-- 3) Public read of the safe projection ONLY — explicitly read-only for public roles:
--    strip any inherited privileges first, then grant SELECT (no INSERT/UPDATE/DELETE).
revoke all on public.chip_entries_public from public, anon, authenticated;
grant select on public.chip_entries_public to anon, authenticated;
