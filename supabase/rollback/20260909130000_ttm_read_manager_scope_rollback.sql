-- 20260909130000_ttm_read_manager_scope_rollback.sql
-- Standalone DOWN for 20260909130000_ttm_read_manager_scope.sql.
-- NOT a migration — run manually only if the ttm_read manager-scope change must be
-- reverted. Restores the EXACT previous ttm_read policy from
-- 20260709130000_tournament_teams.sql (self + captain + inline director_id/admin branch).
-- Always safe (a policy swap).
--
-- NOTE: reverting this narrows tournament_team_members SELECT back to director_id + admins
-- only, so venue owners / venue directors would again miss partner rows (and their
-- Realtime member events). Revert only if you intend that.

drop policy if exists ttm_read on public.tournament_team_members;
create policy ttm_read on public.tournament_team_members for select using (
  player_id = (select id_auto from public.profiles where id = auth.uid())
  or exists (
    select 1 from public.tournament_teams t
    where t.id = team_id
      and t.captain_id = (select id_auto from public.profiles where id = auth.uid())
  )
  or exists (
    select 1 from public.tournaments tt
    where tt.id = tournament_id
      and (
        tt.director_id = (select id_auto from public.profiles where id = auth.uid())
        or (select role from public.profiles where id = auth.uid())
             in ('compete_admin', 'super_admin')
      )
  )
);
