-- Align tournament_team_members READ authorization with the authoritative
-- can_manage_tournament() gate (Phase B / B1 follow-up).
--
-- Problem: ttm_read (migration 20260709130000) allowed SELECT for the member themselves,
-- the team captain, or the tournament's director_id / compete_admin / super_admin. It did
-- NOT include the other legitimate management roles (venue owner, venue director), so a
-- bar owner / co-manager who is authorized to manage the tournament could not read
-- partner/member rows — and therefore would not receive tournament_team_members Realtime
-- changes for that tournament, leaving their roster partially stale.
--
-- Fix (smallest correct change): replace the inline director_id/admin branch with the
-- existing authoritative helper public.can_manage_tournament(tournament_id) — the SAME
-- gate every registration/team RPC (e.g. get_team_roster, register_player_for_tournament)
-- and the tournament_reviews RLS policy already use: compete/super admin, tournament
-- director, venue owner (active), venue director (active). This makes RLS agree with the
-- service/UI management-permission model. The self and captain branches are unchanged, so
-- no non-manager gains access and this is NOT a public-read policy.
--
-- tournament_team_members carries a denormalized tournament_id, so the helper is called
-- directly (no join). can_manage_tournament is security-definer + granted to
-- authenticated, exactly as consumed by the tournament_reviews policy.
--
-- ROLLBACK (reversible) — restore the prior inline policy:
--   drop policy if exists ttm_read on public.tournament_team_members;
--   create policy ttm_read on public.tournament_team_members for select using (
--     player_id = (select id_auto from public.profiles where id = auth.uid())
--     or exists (select 1 from public.tournament_teams t
--       where t.id = team_id
--         and t.captain_id = (select id_auto from public.profiles where id = auth.uid()))
--     or exists (select 1 from public.tournaments tt
--       where tt.id = tournament_id
--         and (tt.director_id = (select id_auto from public.profiles where id = auth.uid())
--              or (select role from public.profiles where id = auth.uid())
--                   in ('compete_admin', 'super_admin')))
--   );

drop policy if exists ttm_read on public.tournament_team_members;
create policy ttm_read on public.tournament_team_members for select using (
  -- the member themselves
  player_id = (select id_auto from public.profiles where id = auth.uid())
  -- the team captain
  or exists (
    select 1 from public.tournament_teams t
    where t.id = team_id
      and t.captain_id = (select id_auto from public.profiles where id = auth.uid())
  )
  -- any authorized manager of the tournament: admin / director / venue owner / venue
  -- director (the authoritative gate reused by the registration/team RPCs).
  or public.can_manage_tournament(tournament_id)
);
