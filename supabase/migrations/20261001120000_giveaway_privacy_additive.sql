-- supabase/migrations/20261001120000_giveaway_privacy_additive.sql
--
-- Giveaway privacy hardening — G1 (ADDITIVE ONLY).
--
-- Adds the server-side paths that the G2 lockdown (20261001130000_giveaway_privacy_lockdown.sql)
-- makes mandatory. Nothing here removes or narrows an existing policy/grant, so it is safe to
-- apply before (and independently of) the client release and G2.
--
--   _giveaway_is_admin()              policy helper — who may read ALL entrant rows
--   get_giveaway_entry_counts(int[])  aggregate-only entry counts for the public Giveaways page
--   "Giveaway admins can view all entries"   admin SELECT policy on giveaway_entries
--
-- Why: today every entry count (public page, cards, Latest Results, capacity check) is a
-- client-side COUNT over giveaway_entries, which only works because of the public
-- `"Anyone can view entries" USING (true)` policy — the same policy that exposes entrant
-- name/email/phone/birthday to anon. G1 gives counts and admin reads their own paths first.
--
-- Giveaway-admin role: super_admin ONLY. This matches the existing DB authority (every giveaway
-- write policy — insert/update giveaways, manage winner history — is super_admin-only) and the
-- only UI entry point (SuperAdminDashboard → Giveaways). NOTE the known mismatch: the client
-- PERMISSIONS map lists CREATE_GIVEAWAY / DRAW_WINNER for compete_admin too, but compete_admin
-- can neither reach the screens nor write giveaways. Widening is a one-line change here.
--
-- Conventions (match 20260930120000_authz_rpcs.sql): SECURITY DEFINER,
-- `set search_path = public, pg_temp`, caller derived from auth.uid(), EXECUTE revoked from PUBLIC.

-- ── Policy helper ────────────────────────────────────────────────────────────────────────────
create or replace function public._giveaway_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select role from public.profiles where id = auth.uid()) = 'super_admin',
    false)
$$;

revoke all on function public._giveaway_is_admin() from public, anon;
grant execute on function public._giveaway_is_admin() to authenticated;

-- ── Aggregate entry counts ───────────────────────────────────────────────────────────────────
-- Returns ONLY (giveaway_id, entry_count). No entrant identity, no user ids.
-- Visibility mirrors the public giveaways SELECT policy: active/ended/awarded for everyone,
-- plus archived for giveaway admins. p_giveaway_ids null = every visible giveaway.
create or replace function public.get_giveaway_entry_counts(p_giveaway_ids integer[] default null)
returns table (giveaway_id integer, entry_count bigint)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select g.id, count(e.id)
  from public.giveaways g
  left join public.giveaway_entries e on e.giveaway_id = g.id
  where (p_giveaway_ids is null or g.id = any (p_giveaway_ids))
    and (g.status in ('active', 'ended', 'awarded') or public._giveaway_is_admin())
  group by g.id
$$;

revoke all on function public.get_giveaway_entry_counts(integer[]) from public;
grant execute on function public.get_giveaway_entry_counts(integer[]) to anon, authenticated;

-- ── Admin read access to entrant rows ────────────────────────────────────────────────────────
-- Participants list, draw / redraw, winner history join, fraud review.
drop policy if exists "Giveaway admins can view all entries" on public.giveaway_entries;
create policy "Giveaway admins can view all entries" on public.giveaway_entries
  as permissive for select to authenticated
  using (public._giveaway_is_admin());
