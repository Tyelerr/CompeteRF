-- Rollback for 20260818160000_sync_eliminations_manager_only.sql
-- Restores the prior (manager OR participant) authorization on sync_tournament_eliminations.

create or replace function public.sync_tournament_eliminations(
  p_tournament_id integer,
  p_eliminated_reg_ids integer[]
) returns void
  language plpgsql security definer set search_path to 'public', 'pg_temp'
as $$
declare
  v_id_auto bigint;
begin
  select id_auto into v_id_auto from public.profiles where id = auth.uid();
  if v_id_auto is null then raise exception 'not authenticated'; end if;

  if not (
    public.can_manage_tournament(p_tournament_id)
    or exists (
      select 1 from public.tournament_players tp
       where tp.tournament_id = p_tournament_id and tp.player_id = v_id_auto
    )
  ) then
    raise exception 'not authorized for this tournament';
  end if;

  update public.tournament_players
     set eliminated_at = now()
   where tournament_id = p_tournament_id
     and id = any(p_eliminated_reg_ids)
     and eliminated_at is null;

  update public.tournament_players
     set eliminated_at = null
   where tournament_id = p_tournament_id
     and eliminated_at is not null
     and not (id = any(coalesce(p_eliminated_reg_ids, array[]::integer[])));
end;
$$;
