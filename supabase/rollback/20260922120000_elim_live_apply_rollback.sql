-- supabase/rollback/20260922120000_elim_live_apply_rollback.sql
--
-- Reverts 20260922120000_elim_live_apply.sql. No data migration is needed: the new functions
-- write live_settings in exactly the existing shape, so old clients read it unchanged.
-- Deploy order for a rollback: revert the client first (it calls elim_live_apply /
-- elim_merge_live_settings), then run this.

drop function if exists public.elim_merge_live_settings(bigint, jsonb, text[]);
drop function if exists public.elim_live_apply(bigint, jsonb, boolean);
drop function if exists public._elim_apply_one(bigint, text[], jsonb, jsonb);
drop function if exists public._elim_check_table(bigint, jsonb, text, bigint);

-- Restore submit_match_state exactly as defined by 20260804120000_phase4c_accept_either_authz.sql
-- (director-only TD branch; any active participant may patch any unfinished match).
create or replace function public.submit_match_state(p_tournament_id bigint, p_match_id text, p_patch jsonb) returns jsonb
    language plpgsql security definer
    set search_path to 'public', 'pg_temp'
    as $$
declare
  v_uid      bigint;
  v_player   uuid;
  v_is_td    boolean;
  v_allowed  boolean;
  v_ls       jsonb;
  v_existing jsonb;
  v_clean    jsonb;
begin
  -- 1. Resolve the caller's profile id_auto (legacy) and player id (new) from auth uid.
  select p.id_auto into v_uid
  from public.profiles p
  where p.id = auth.uid();
  v_player := public.current_player_id();

  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  -- 2. Authorize: the tournament director, or an active participant (accept-either).
  select exists (
    select 1 from public.tournaments t
    where t.id = p_tournament_id and t.director_id = v_uid
  )
  into v_is_td;

  select
    v_is_td
    or exists (
      select 1 from public.tournament_players tp
      where tp.tournament_id = p_tournament_id
        and (tp.player_id = v_uid or tp.player_uuid = v_player)
        and tp.status not in ('cancelled', 'no_show')
    )
  into v_allowed;

  if not v_allowed then
    raise exception 'Not allowed to score this tournament' using errcode = '42501';
  end if;

  -- 3. Whitelist the patch to scoring fields only.
  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb)
  into v_clean
  from jsonb_each(p_patch)
  where key in (
    'status', 'winner', 'p1Score', 'p2Score', 'startedAt', 'completedAt', 'result'
  );

  -- 4. Lock the row, then merge the patch into matchState -> <match_id>.
  select coalesce(t.live_settings, '{}'::jsonb)
  into v_ls
  from public.tournaments t
  where t.id = p_tournament_id
  for update;

  if v_ls is null then
    raise exception 'Tournament not found' using errcode = 'P0002';
  end if;

  v_ls := jsonb_set(v_ls, '{matchState}', coalesce(v_ls -> 'matchState', '{}'::jsonb), true);
  v_existing := coalesce(v_ls #> array['matchState', p_match_id], '{}'::jsonb);

  -- 4a. A final match is locked for players; only the TD may change it.
  if not v_is_td and (v_existing ->> 'status') = 'completed' then
    raise exception 'Match is final and locked' using errcode = '42501';
  end if;

  v_ls := jsonb_set(v_ls, array['matchState', p_match_id], v_existing || v_clean, true);

  update public.tournaments
  set live_settings = v_ls,
      updated_at = now()
  where id = p_tournament_id;

  return v_ls;
end;
$$;

revoke all on function public.submit_match_state(bigint, text, jsonb) from public, anon;
grant execute on function public.submit_match_state(bigint, text, jsonb) to authenticated;

-- _elim_resolve is only used by the functions above; drop it last.
drop function if exists public._elim_resolve(jsonb);
