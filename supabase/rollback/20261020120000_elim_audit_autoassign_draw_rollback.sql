-- supabase/rollback/20261020120000_elim_audit_autoassign_draw_rollback.sql
-- Rolls back 20261020120000: drops the tournaments system-audit trigger + function and restores
-- _elim_recovery_write verbatim from 20261019120000 (without the compete.elim_audited flag).
-- Audit rows / spectator activity written meanwhile are kept (inert history).

begin;

drop trigger if exists tournaments_elim_system_audit on public.tournaments;
drop function if exists public.tg_tournaments_elim_system_audit();

-- Restored verbatim from supabase/migrations/20261018120000_elim_recovery_foundation.sql
create or replace function public._elim_public_events(
  p_tournament_id bigint, p_ls jsonb, p_ms_before jsonb, p_ms_after jsonb, p_op jsonb,
  p_live_before text, p_live_after text, p_cascade jsonb, p_tx text
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_kind  text := p_op ->> 'op';
  v_mid   text := p_op ->> 'matchId';
  v_b     jsonb := coalesce(p_ms_before -> v_mid, '{}'::jsonb);
  v_a     jsonb := coalesce(p_ms_after -> v_mid, '{}'::jsonb);
  v_bs    text := coalesce(v_b ->> 'status', 'scheduled');
  v_as    text := coalesce(v_a ->> 'status', 'scheduled');
  v_who   jsonb;
  v_node  jsonb;
  v_p1    text;
  v_p2    text;
  v_tid   bigint;
  v_tlbl  text;
  v_base  jsonb;
  v_w     int;
  v_type  text;
  v_extra jsonb := '{}'::jsonb;
  v_n     int;
begin
  if v_mid is null then
    return;  -- set_queue: internal scheduling detail, audit only
  end if;
  v_who := public._elim_resolve(p_ls || jsonb_build_object('matchState', p_ms_after)) -> v_mid;
  select s ->> 'name' into v_p1 from jsonb_array_elements(coalesce(p_ls #> '{bracket,seeds}', '[]'::jsonb)) s
   where (s ->> 'registrationId') = (v_who ->> 'p1') limit 1;
  select s ->> 'name' into v_p2 from jsonb_array_elements(coalesce(p_ls #> '{bracket,seeds}', '[]'::jsonb)) s
   where (s ->> 'registrationId') = (v_who ->> 'p2') limit 1;
  select n into v_node from jsonb_array_elements(p_ls #> '{bracket,graph}') n where n ->> 'id' = v_mid limit 1;
  v_tid := case when jsonb_typeof(v_a -> 'tableId') = 'number' then (v_a ->> 'tableId')::bigint
                when jsonb_typeof(v_b -> 'tableId') = 'number' then (v_b ->> 'tableId')::bigint end;
  if v_tid is not null then
    select coalesce(nullif(btrim(tt.label), ''), 'Table ' || tt.table_number) into v_tlbl
    from public.tournament_tables tt where tt.id = v_tid and tt.tournament_id = p_tournament_id;
  end if;
  v_base := jsonb_strip_nulls(jsonb_build_object('matchId', v_mid, 'side', v_node ->> 'side',
              'round', (v_node ->> 'round')::int, 'p1Name', v_p1, 'p2Name', v_p2));

  if v_as = 'in_progress' and v_bs = 'scheduled' then
    if p_live_before is distinct from 'in_progress' and p_live_after = 'in_progress' then
      insert into public.tournament_events (id, tournament_id, type, payload, tx_id)
      values ('te_srv_' || gen_random_uuid(), p_tournament_id, 'tournament_started', '{}'::jsonb, p_tx);
    end if;
    v_type := 'match_started'; v_extra := jsonb_build_object('tableLabel', v_tlbl);
  elsif v_as = 'completed' and (v_bs <> 'completed' or (v_b -> 'winner') is distinct from (v_a -> 'winner')
                                 or (v_b -> 'result') is distinct from (v_a -> 'result')) then
    v_w := case when (v_a ->> 'winner') in ('1', '2') then (v_a ->> 'winner')::int end;
    v_type := 'match_completed';
    v_extra := jsonb_strip_nulls(jsonb_build_object(
      'winner', v_w,
      'winnerName', case v_w when 1 then v_p1 when 2 then v_p2 end,
      'loserName', case v_w when 1 then v_p2 when 2 then v_p1 end,
      'winnerScore', case v_w when 1 then v_a -> 'p1Score' when 2 then v_a -> 'p2Score' end,
      'loserScore', case v_w when 1 then v_a -> 'p2Score' when 2 then v_a -> 'p1Score' end,
      'result', v_a ->> 'result',
      'tableLabel', v_tlbl));
  elsif v_bs = 'completed' and v_as <> 'completed' then
    v_type := 'match_reopened';
  elsif v_as = 'scheduled' and v_bs = 'in_progress' then
    v_type := 'table_unassigned';     -- Reset of a live match (same type the app logged before)
  elsif (v_b -> 'tableId') is distinct from (v_a -> 'tableId') then
    if jsonb_typeof(v_a -> 'tableId') <> 'number' then v_type := 'table_unassigned';
    elsif jsonb_typeof(v_b -> 'tableId') <> 'number' then v_type := 'table_assigned';
    else v_type := 'table_changed'; end if;
    v_extra := jsonb_strip_nulls(jsonb_build_object('tableLabel', v_tlbl));
  elsif v_as = 'in_progress' and (v_b ->> 'startedAt') is distinct from (v_a ->> 'startedAt') then
    v_type := 'match_timer_adjusted';
    v_extra := jsonb_build_object(
      'reset', coalesce(extract(epoch from (now() - (v_a ->> 'startedAt')::timestamptz)) < 2, false),
      'prevElapsed', to_char(greatest(now() - (v_b ->> 'startedAt')::timestamptz, interval '0'), 'FMHH24:MI:SS'),
      'newElapsed', to_char(greatest(now() - (v_a ->> 'startedAt')::timestamptz, interval '0'), 'FMHH24:MI:SS'));
  end if;

  if v_type is not null then
    insert into public.tournament_events (id, tournament_id, type, payload, tx_id)
    values ('te_srv_' || gen_random_uuid(), p_tournament_id, v_type, v_base || v_extra, p_tx);
  end if;

  v_n := coalesce(jsonb_array_length(p_cascade -> 'reset'), 0);
  if v_n > 0 then
    insert into public.tournament_events (id, tournament_id, type, payload, tx_id)
    values ('te_srv_' || gen_random_uuid(), p_tournament_id, 'bracket_corrected',
            v_base || jsonb_build_object('resetCount', v_n,
                                         'clearedCount', coalesce(jsonb_array_length(p_cascade -> 'cleared'), 0)),
            p_tx);
  end if;
end;
$$;
revoke all on function public._elim_public_events(bigint, jsonb, jsonb, jsonb, jsonb, text, text, jsonb, text) from public, anon, authenticated;

-- Restored verbatim from supabase/migrations/20261019120000_elim_undo_restore.sql
create or replace function public._elim_recovery_write(
  p_tournament_id bigint, p_t jsonb, p_new_ls jsonb, p_reopen boolean,
  p_ck_reason text, p_ck_label text, p_op text, p_match_id text, p_detail jsonb,
  p_public_op jsonb, p_cascade jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ck  bigint;
  v_rev bigint;
  v_cur jsonb := coalesce(p_t #> '{live_settings,matchState}', '{}'::jsonb);
  v_new jsonb := coalesce(p_new_ls -> 'matchState', '{}'::jsonb);
  v_tx  text := gen_random_uuid()::text;
  v_cols text[] := array['status', 'winner', 'p1Score', 'p2Score', 'result', 'tableId', 'startedAt'];
  v_state text := p_t ->> 'live_state';
begin
  v_ck := public._elim_checkpoint(p_tournament_id, (p_t ->> 'revision')::bigint, p_ck_reason, p_ck_label,
            p_match_id, false, public._elim_state_slice(p_t -> 'live_settings', p_new_ls -> 'bracket' is distinct from p_t #> '{live_settings,bracket}'),
            coalesce((p_t ->> 'finished')::boolean, false) and not p_reopen);
  if p_reopen then
    v_state := 'in_progress';
    update public.tournaments
    set live_settings = p_new_ls, live_state = 'in_progress', status = 'active', completed_at = null, updated_at = now()
    where id = p_tournament_id
    returning live_revision into v_rev;
  else
    update public.tournaments
    set live_settings = p_new_ls, updated_at = now()
    where id = p_tournament_id
    returning live_revision into v_rev;
  end if;

  insert into public.tournament_audit (tournament_id, revision, op, match_id, table_id, actor_id, source, before, after, detail)
  values (p_tournament_id, v_rev, p_op, p_match_id,
    coalesce(case when jsonb_typeof(v_new -> p_match_id -> 'tableId') = 'number' then (v_new -> p_match_id ->> 'tableId')::bigint end,
             case when jsonb_typeof(v_cur -> p_match_id -> 'tableId') = 'number' then (v_cur -> p_match_id ->> 'tableId')::bigint end),
    (select p.id from public.profiles p where p.id = auth.uid()), 'td',
    case when p_match_id is not null then
      (select coalesce(jsonb_object_agg(k, v_cur -> p_match_id -> k), '{}'::jsonb) from unnest(v_cols) k where (v_cur -> p_match_id) ? k) end,
    case when p_match_id is not null then
      (select coalesce(jsonb_object_agg(k, v_new -> p_match_id -> k), '{}'::jsonb) from unnest(v_cols) k where (v_new -> p_match_id) ? k) end,
    jsonb_strip_nulls(p_detail || jsonb_build_object('checkpoint', v_ck, 'reopened', case when p_reopen then true end)));

  -- Sanitized spectator activity (no actor / ids / internals).
  if p_public_op is not null then
    perform public._elim_public_events(p_tournament_id, p_new_ls, v_cur, v_new, p_public_op,
                                       p_t ->> 'live_state', v_state, coalesce(p_cascade, '{}'::jsonb), v_tx);
  elsif coalesce(jsonb_array_length(p_cascade -> 'reset'), 0) > 0 then
    insert into public.tournament_events (id, tournament_id, type, payload, tx_id)
    values ('te_srv_' || gen_random_uuid(), p_tournament_id, 'bracket_corrected',
            jsonb_build_object('restored', true, 'resetCount', jsonb_array_length(p_cascade -> 'reset')), v_tx);
  end if;

  return jsonb_build_object('revision', v_rev, 'checkpoint', v_ck);
end;
$$;
revoke all on function public._elim_recovery_write(bigint, jsonb, jsonb, boolean, text, text, text, text, jsonb, jsonb, jsonb) from public, anon, authenticated;

notify pgrst, 'reload schema';

commit;
