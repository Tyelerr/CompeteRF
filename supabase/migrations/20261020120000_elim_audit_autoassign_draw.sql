-- supabase/migrations/20261020120000_elim_audit_autoassign_draw.sql
--
-- Elimination audit gaps: Auto Assign and Bracket Draw / Redraw now write manager audit rows (and
-- Auto Assign writes sanitized spectator activity) in the SAME transaction as the state change.
-- Additive: one AFTER UPDATE trigger on tournaments + a one-line flag in the Undo / Restore writer.
-- elim_auto_assign_apply, the client draw path and elim_live_apply are NOT replaced.
--
-- Why a trigger: the draw is a direct client UPDATE of tournaments.live_settings and Auto Assign is
-- a service-role RPC; both already pass through tournaments, where tournaments_live_revision
-- (20261018120000, BEFORE UPDATE) bumps live_revision and saves the "Before redraw" milestone. An
-- AFTER UPDATE row trigger runs inside that same statement, sees the final revision, and rolls back
-- with it — state, revision, milestone and audit are atomic without rewriting either write path.
--
--   • DRAW / REDRAW (any writer) — when bracket.drawNumber changes to a drawn bracket. op 'draw'
--     (no previous bracket) or 'redraw' (the previous bracket is the "Before redraw" milestone).
--     Actor = the signed-in user (source 'td'); a write without a user is source 'system'. Compact
--     detail only (format, bracket size, players, byes, draw #, reason) — never the bracket JSON.
--     Server-side format gate: a draw for a format with no bracket engine is refused
--     ('format_not_supported'), closing the old silent single/double fallback for older app builds
--     too. (Production: every drawn bracket is single-/double-elimination.) Spectator activity for
--     a redraw stays the app's existing 'bracket_redrawn' row — no duplicate.
--   • AUTO ASSIGN (service-role writes only = the auto-assign Edge Function; nothing else writes
--     tournaments as service role) — one audit row per match whose table / status changed, op
--     'auto_assign', source 'auto_assign', actor NULL (never attributed to a TD), plus a sanitized
--     public 'table_assigned' / 'table_changed' row (player names + table label only — no
--     revision, actor or before/after). Cycles that assign nothing don't update the row → no rows.
--   • Writes that audit themselves are skipped — exactly once: elim_live_apply runs as the TD (not
--     service role) and audits per op; Undo / Restore set compete.elim_audited (below).
--
-- Also fixed (verbatim copy + one NULL-safe check): _elim_public_events labelled the FIRST table
-- assignment of a match with no prior state as "Table changed" (jsonb_typeof(NULL) <> 'number' is
-- NULL), and named a table by its label alone ("Table" for most production tables) instead of the
-- app's "<label> <number>" ("Table 4"). Production had no server-written activity yet, so no rows
-- carry either wrong label.
--
-- Auto Assign on / off and match-order changes are TD set_queue ops already audited by
-- elim_live_apply; the History screen now names them ("Auto Assign enabled", …).
--
-- Rollback: supabase/rollback/20261020120000_elim_audit_autoassign_draw_rollback.sql
-- Tests:    supabase/tests/elim_audit_autoassign_draw.test.ts (PGlite)

begin;

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
    -- 20261020: the same table name the app shows ("<label> <number>", e.g. "Table 4", "Diamond 1").
    select coalesce(nullif(btrim(tt.label), ''), 'Table') || ' ' || tt.table_number into v_tlbl
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
    -- 20261020: NULL-safe (no prior state = no tableId key → a first assignment, not a change).
    if coalesce(jsonb_typeof(v_a -> 'tableId'), 'null') <> 'number' then v_type := 'table_unassigned';
    elsif coalesce(jsonb_typeof(v_b -> 'tableId'), 'null') <> 'number' then v_type := 'table_assigned';
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
  -- 20261020: this write audits itself (op undo / restore) — the tournaments system-audit trigger
  -- must not log it again (a Restore that brings back an earlier draw is not a "redraw").
  perform set_config('compete.elim_audited', 'on', true);
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
  perform set_config('compete.elim_audited', '', true);  -- scoped to this one UPDATE

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

create or replace function public.tg_tournaments_elim_system_audit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_claims jsonb := coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb);
  v_uid    uuid := auth.uid();
  v_old_ms jsonb := coalesce(old.live_settings -> 'matchState', '{}'::jsonb);
  v_new_ms jsonb := coalesce(new.live_settings -> 'matchState', '{}'::jsonb);
  v_fmt    text := lower(btrim(coalesce(new.tournament_format, '')));
  v_first  boolean;
  v_log    jsonb;
  v_id     text;
  v_b      jsonb;
  v_a      jsonb;
  v_tx     text := gen_random_uuid()::text;
  v_cols   text[] := array['status', 'tableId', 'startedAt', 'winner', 'p1Score', 'p2Score', 'result'];
begin
  if coalesce(current_setting('compete.elim_audited', true), '') = 'on' or v_fmt = 'chip-tournament'
     or jsonb_typeof(new.live_settings #> '{bracket,graph}') is distinct from 'array' then
    return null;
  end if;

  -- ── Draw / redraw ──────────────────────────────────────────────────────────────────────
  if (new.live_settings #> '{bracket,drawNumber}') is distinct from (old.live_settings #> '{bracket,drawNumber}') then
    if v_fmt not in ('single-elimination', 'single-elim', 'single_elimination',
                     'double-elimination', 'double-elim', 'double_elimination') then
      raise exception 'format_not_supported' using errcode = 'P0001',
        detail = 'This format is coming soon. Choose Single Elimination, Double Elimination or Chip Tournament.';
    end if;
    v_first := jsonb_typeof(old.live_settings #> '{bracket,graph}') is distinct from 'array';
    select e into v_log from jsonb_array_elements(
      case when jsonb_typeof(new.live_settings -> 'drawLog') = 'array' then new.live_settings -> 'drawLog' else '[]'::jsonb end) e
     where (e -> 'drawNumber') = (new.live_settings #> '{bracket,drawNumber}') limit 1;
    insert into public.tournament_audit (tournament_id, revision, op, actor_id, source, after, detail)
    values (new.id, new.live_revision, case when v_first then 'draw' else 'redraw' end,
      (select p.id from public.profiles p where p.id = v_uid),
      case when v_uid is null then 'system' else 'td' end,
      jsonb_strip_nulls(jsonb_build_object(
        'drawNumber', new.live_settings #> '{bracket,drawNumber}',
        'bracketSize', new.live_settings #> '{bracket,bracketSize}',
        'players', new.live_settings #> '{bracket,players}',
        'byes', new.live_settings #> '{bracket,byes}',
        'format', new.tournament_format)),
      jsonb_strip_nulls(jsonb_build_object(
        'previousDrawNumber', case when not v_first then old.live_settings #> '{bracket,drawNumber}' end,
        'previousSaved', case when not v_first then true end,
        'reason', case when not v_first then v_log ->> 'reason' end,
        'drawType', new.live_settings #>> '{bracket,drawType}')));
    return null;  -- a (re)draw replaces matchState wholesale; nothing below applies
  end if;

  -- ── Auto Assign (service role only — never attributed to a TD) ─────────────────────────
  if v_claims ->> 'role' = 'service_role' and v_uid is null and v_new_ms is distinct from v_old_ms then
    for v_id, v_a in select key, value from jsonb_each(v_new_ms) loop
      v_b := coalesce(v_old_ms -> v_id, '{}'::jsonb);
      continue when (v_b -> 'tableId') is not distinct from (v_a -> 'tableId')
                and coalesce(v_b ->> 'status', 'scheduled') = coalesce(v_a ->> 'status', 'scheduled');
      insert into public.tournament_audit (tournament_id, revision, op, match_id, table_id, actor_id, source, before, after, detail)
      values (new.id, new.live_revision, 'auto_assign', v_id,
        case when jsonb_typeof(v_a -> 'tableId') = 'number' then (v_a ->> 'tableId')::bigint end,
        null, 'auto_assign',
        (select coalesce(jsonb_object_agg(k, v_b -> k), '{}'::jsonb) from unnest(v_cols) k where v_b ? k),
        (select coalesce(jsonb_object_agg(k, v_a -> k), '{}'::jsonb) from unnest(v_cols) k where v_a ? k),
        jsonb_strip_nulls(jsonb_build_object('source', 'auto_assign', 'tableLabel',
          (select coalesce(nullif(btrim(tt.label), ''), 'Table') || ' ' || tt.table_number from public.tournament_tables tt
            where jsonb_typeof(v_a -> 'tableId') = 'number' and tt.id = (v_a ->> 'tableId')::bigint and tt.tournament_id = new.id))));
      perform public._elim_public_events(new.id, new.live_settings, v_old_ms, v_new_ms,
        jsonb_build_object('op', 'assign', 'matchId', v_id), old.live_state, new.live_state, '{}'::jsonb, v_tx);
    end loop;
  end if;
  return null;
end;
$$;
revoke all on function public.tg_tournaments_elim_system_audit() from public, anon, authenticated;

drop trigger if exists tournaments_elim_system_audit on public.tournaments;
create trigger tournaments_elim_system_audit
  after update on public.tournaments
  for each row
  when (new.live_settings is distinct from old.live_settings)
  execute function public.tg_tournaments_elim_system_audit();

notify pgrst, 'reload schema';

commit;
