-- supabase/migrations/20261021130000_elim_finish_redraw_recovery.sql
--
-- Elimination recovery hardening (2026-10-03). Two server-side correctness rules; old clients are
-- covered too (same RPCs, unchanged signatures and grants).
--
-- A. Correction after Finish. elim_live_apply allowed correcting a completed match on a finished
--    event and cascaded the downstream clears, but left status=completed / live_state=finished —
--    every replay op was then refused ('tournament_finished') and Undo too: stuck until Restore.
--    Now: if, after the call, the bracket has NO complete champion path (_elim_bracket_complete:
--    every REAL match — both players known, not a bye / skipped Finals 2nd set — completed with a
--    winner; by induction nothing is left pending), the same UPDATE reopens the event
--    (status active, live_state in_progress, completed_at null): one revision bump, one audit row
--    (detail.reopened), a normal (non-finished) pre-change checkpoint. A correction that keeps the
--    bracket complete (score edit, Finals / Finals 2nd-set winner flip) leaves it finished. The dry
--    run reports reopens_tournament; the response carries reopened + status.
--
-- B. Undo across a redraw. elim_undo picked the newest not-undone audit row regardless of draw,
--    so an action recorded on an earlier bracket could be applied to the new one. Now every audit
--    row is stamped (BEFORE INSERT trigger) with the server-owned draw identity drawKey =
--    md5(live_settings.bracket) — every draw / redraw changes it, even with identical seeding
--    (generatedAt), and a Restore of an earlier draw brings that draw's key back. Undo only
--    targets rows whose drawKey is the current one; unstamped (pre-migration) rows fail safe.
--    Undoing a cross-draw Restore now brings its bracket back with it (it used to put the newer
--    draw's results onto the older bracket). Restore compares whole-bracket identity, so a
--    checkpoint from a different draw that happens to share the drawNumber is still refused /
--    swapped correctly. Checkpoint slices also carry drawKey.
--
-- Functions replaced verbatim from their latest migrations + the marked "20261021130000"
-- patches: elim_live_apply (20261018120000), elim_undo / elim_restore / _elim_state_slice
-- (20261019120000). Signatures unchanged → existing grants kept.
-- Rollback: supabase/rollback/20261021130000_elim_finish_redraw_recovery_rollback.sql.

begin;

-- Draw identity: changes on every draw / redraw; equal for the same bracket (jsonb is canonical).
create or replace function public._elim_draw_key(p_ls jsonb)
returns text language sql immutable set search_path = public, pg_temp as $$
  select case when jsonb_typeof(p_ls #> '{bracket,graph}') = 'array' then md5((p_ls -> 'bracket')::text) end;
$$;
revoke all on function public._elim_draw_key(jsonb) from public, anon, authenticated;

-- A bracket is complete when every real match is decided (completed with winner 1 | 2).
create or replace function public._elim_bracket_complete(p_ls jsonb)
returns boolean language sql immutable set search_path = public, pg_temp as $$
  select jsonb_typeof(p_ls #> '{bracket,graph}') = 'array' and not exists (
    select 1 from jsonb_each(public._elim_resolve(p_ls)) r
    where coalesce((r.value ->> 'real')::boolean, false)
      and not (coalesce(p_ls #>> array['matchState', r.key, 'status'], '') = 'completed'
               and coalesce(p_ls #>> array['matchState', r.key, 'winner'], '') in ('1', '2')));
$$;
revoke all on function public._elim_bracket_complete(jsonb) from public, anon, authenticated;

-- Stamp every audit row with the bracket it was recorded on (all writers: elim_live_apply, undo /
-- restore, the draw / Auto Assign system trigger). Runs after the row's tournaments UPDATE in the
-- same transaction, so it sees the bracket the action produced.
create or replace function public.tg_tournament_audit_draw_key()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare v_key text;
begin
  if coalesce(new.detail, '{}'::jsonb) ? 'drawKey' then
    return new;
  end if;
  select public._elim_draw_key(t.live_settings) into v_key from public.tournaments t where t.id = new.tournament_id;
  if v_key is not null then
    new.detail := coalesce(new.detail, '{}'::jsonb) || jsonb_build_object('drawKey', v_key);
  end if;
  return new;
end;
$function$;
revoke all on function public.tg_tournament_audit_draw_key() from public, anon, authenticated;

drop trigger if exists tournament_audit_draw_key on public.tournament_audit;
create trigger tournament_audit_draw_key
  before insert on public.tournament_audit
  for each row execute function public.tg_tournament_audit_draw_key();

-- _elim_state_slice (from 20261019120000) + drawKey
create or replace function public._elim_state_slice(p_ls jsonb, p_with_bracket boolean)
returns jsonb language sql immutable set search_path = public, pg_temp as $$
  select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb)
  from jsonb_each(jsonb_build_object(
    'matchState', coalesce(p_ls -> 'matchState', '{}'::jsonb),
    'queueOrder', p_ls -> 'queueOrder',
    'queuePins', p_ls -> 'queuePins',
    'autoAssignMode', p_ls -> 'autoAssignMode',
    'autoAssignEnabled', p_ls -> 'autoAssignEnabled',
    'drawNumber', p_ls #> '{bracket,drawNumber}',
    'drawKey', to_jsonb(public._elim_draw_key(p_ls)),
    'bracket', case when p_with_bracket then p_ls -> 'bracket' end)) e
  where jsonb_typeof(e.value) <> 'null';
$$;

-- elim_live_apply (from 20261018120000) + A
create or replace function public.elim_live_apply(
  p_tournament_id     bigint,
  p_ops               jsonb,
  p_atomic            boolean default false,
  p_expected_revision bigint  default null,
  p_op_id             uuid    default null,
  p_dry_run           boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row     record;
  v_ls      jsonb;
  v_ls0     jsonb;
  v_ms      jsonb;
  v_ms_prev jsonb;
  v_ids     text[];
  v_op      jsonb;
  v_step    jsonb;
  v_results jsonb := '[]'::jsonb;
  v_i       int := 0;
  v_ok      int := 0;
  v_started boolean := false;
  v_state   text;
  v_done    boolean;
  v_res     jsonb := null;
  v_kind    text;
  v_mid     text;
  v_nst     text;
  v_who     jsonb;
  v_needs_real boolean;
  -- Recovery
  v_rev       bigint;
  v_casc      jsonb;
  v_reset     jsonb := '[]'::jsonb;
  v_cleared   jsonb := '[]'::jsonb;
  v_stopped   jsonb := '[]'::jsonb;
  v_released  jsonb := '[]'::jsonb;
  v_applied   jsonb := '[]'::jsonb;  -- [{i, op, before_ms, after_ms, cascade}]
  v_destr     boolean := false;
  v_destr_mid text;
  v_prev_st   jsonb;
  v_ckpt      bigint;
  v_tx        text := p_op_id::text;
  v_a         jsonb;
  v_cols      text[] := array['status', 'winner', 'p1Score', 'p2Score', 'result', 'tableId', 'startedAt'];
  -- 20261021130000: a correction on a finished event that breaks the champion path reopens it.
  v_reopen    boolean := false;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;
  if p_tournament_id is null or not public.can_manage_tournament(p_tournament_id) then
    raise exception 'Not allowed to manage this tournament' using errcode = '42501';
  end if;
  if p_ops is null or jsonb_typeof(p_ops) <> 'array'
     or jsonb_array_length(p_ops) < 1 or jsonb_array_length(p_ops) > 64 then
    raise exception 'ops must be an array of 1..64 operations' using errcode = '22023';
  end if;

  select t.live_settings, t.live_state, t.status, t.tournament_format, t.live_revision
  into v_row
  from public.tournaments t
  where t.id = p_tournament_id
  for update;
  if not found then
    raise exception 'Tournament not found' using errcode = 'P0002';
  end if;
  if v_row.tournament_format = 'chip-tournament' then
    raise exception 'Not an elimination tournament' using errcode = '22023';
  end if;

  -- Recovery: idempotent replay — an op id that already landed returns the current state.
  if p_op_id is not null and not coalesce(p_dry_run, false) and exists (
       select 1 from public.tournament_audit a where a.tournament_id = p_tournament_id and a.op_id = p_op_id) then
    return jsonb_build_object(
      'live_settings', v_row.live_settings, 'live_state', v_row.live_state,
      'revision', v_row.live_revision, 'replayed', true,
      'results', coalesce((select jsonb_agg(jsonb_build_object('i', a.op_index, 'ok', true) order by a.op_index)
                           from public.tournament_audit a
                           where a.tournament_id = p_tournament_id and a.op_id = p_op_id), '[]'::jsonb));
  end if;
  -- Recovery: revision precondition (optional for backward compatibility). Checked before any
  -- op runs, so a stale device changes nothing and writes no audit.
  if p_expected_revision is not null and p_expected_revision is distinct from v_row.live_revision
     and not coalesce(p_dry_run, false) then
    raise exception 'stale_revision' using errcode = 'P0001', detail = v_row.live_revision::text;
  end if;

  v_done := coalesce(v_row.status, '') in ('completed', 'archived') or v_row.live_state = 'finished';
  v_ls := coalesce(v_row.live_settings, '{}'::jsonb);
  v_ls0 := v_ls;
  if jsonb_typeof(v_ls #> '{bracket,graph}') is distinct from 'array' then
    raise exception 'No elimination bracket' using errcode = '22023';
  end if;
  select coalesce(array_agg(n ->> 'id'), '{}') into v_ids
  from jsonb_array_elements(v_ls #> '{bracket,graph}') n;
  v_ms := case when jsonb_typeof(v_ls -> 'matchState') = 'object'
               then v_ls -> 'matchState' else '{}'::jsonb end;

  for v_op in select value from jsonb_array_elements(p_ops) loop
    begin
      v_kind := v_op ->> 'op';
      v_mid := v_op ->> 'matchId';
      v_nst := case when v_kind = 'patch_match' then v_op -> 'set' ->> 'status' end;
      if v_done and not (
           v_kind = 'patch_match'
           and coalesce(v_nst, coalesce(v_ms -> v_mid ->> 'status', 'scheduled')) = 'completed'
           and coalesce(v_ms -> v_mid ->> 'status', 'scheduled') = 'completed'
           and not (v_op -> 'set' ? 'tableId' and jsonb_typeof(v_op -> 'set' -> 'tableId') = 'number')
         ) then
        raise exception 'tournament_finished' using errcode = 'P0001';
      end if;
      v_needs_real := v_kind in ('assign', 'start')
        or (v_kind = 'patch_match' and (v_nst = 'in_progress'
            or (jsonb_typeof(v_op -> 'set' -> 'winner') = 'number')
            or (jsonb_typeof(v_op -> 'set' -> 'tableId') = 'number')));
      if v_needs_real and v_mid is not null then
        if v_res is null then
          v_res := public._elim_resolve(v_ls || jsonb_build_object('matchState', v_ms));
        end if;
        v_who := v_res -> v_mid;
        if v_who is not null and not coalesce((v_who ->> 'real')::boolean, false) then
          raise exception 'match_not_ready' using errcode = 'P0001';
        end if;
        if v_who is not null
           and coalesce(v_ms -> v_mid ->> 'status', 'scheduled') = 'scheduled'
           and (v_kind = 'start' or (v_kind = 'assign' and coalesce((v_op ->> 'start')::boolean, false))
                or v_nst = 'in_progress')
           and exists (
             select 1 from jsonb_each(v_ms) e
             where e.key <> v_mid
               and jsonb_typeof(e.value) = 'object'
               and (e.value ->> 'status') = 'in_progress'
               and (v_res -> e.key ->> 'p1' in (v_who ->> 'p1', v_who ->> 'p2')
                    or v_res -> e.key ->> 'p2' in (v_who ->> 'p1', v_who ->> 'p2'))
           ) then
          raise exception 'player_busy' using errcode = 'P0001';
        end if;
      end if;
      v_ms_prev := v_ms;
      v_prev_st := coalesce(v_ms -> v_mid, '{}'::jsonb);
      v_step := public._elim_apply_one(p_tournament_id, v_ids, v_ms, v_op);
      v_casc := null;
      if v_kind = 'patch_match' and (v_op -> 'set' ?| array['status', 'winner', 'result']) then
        -- Recovery: correction cascade — clear downstream results whose players changed.
        v_casc := public._elim_cascade(v_ls, v_ms_prev, v_step -> 'ms');
        v_step := jsonb_set(v_step, '{ms}', v_casc -> 'ms');
        v_res := null;
        -- Destructive (checkpoint-worthy): a decided/live outcome is changed, a match is reset /
        -- reopened, a forfeit / withdrawal, or anything cascaded.
        v_a := (v_step -> 'ms') -> v_mid;
        if jsonb_array_length(v_casc -> 'reset') > 0
           or coalesce(v_op -> 'set' ->> 'result', '') in ('forfeit', 'withdraw')
           or (coalesce(v_prev_st ->> 'status', 'scheduled') = 'completed'
               and ((v_a -> 'winner') is distinct from (v_prev_st -> 'winner')
                    or (v_a ->> 'status') is distinct from (v_prev_st ->> 'status')
                    or (v_a -> 'result') is distinct from (v_prev_st -> 'result')))
           or (coalesce(v_prev_st ->> 'status', 'scheduled') = 'in_progress' and (v_a ->> 'status') = 'scheduled') then
          if not v_destr then v_destr_mid := v_mid; end if;
          v_destr := true;
        end if;
        v_reset := v_reset || (v_casc -> 'reset');
        v_cleared := v_cleared || (v_casc -> 'cleared');
        v_stopped := v_stopped || (v_casc -> 'stopped');
        v_released := v_released || (v_casc -> 'released');
      end if;
      v_ms := v_step -> 'ms';
      v_ls := v_ls || (v_step -> 'top');
      v_started := v_started or coalesce((v_step ->> 'started')::boolean, false);
      v_ok := v_ok + 1;
      v_results := v_results || jsonb_build_array(jsonb_build_object('i', v_i, 'ok', true));
      v_applied := v_applied || jsonb_build_array(jsonb_build_object(
        'i', v_i, 'op', v_op, 'before', v_ms_prev, 'after', v_ms, 'cascade', v_casc));
    exception when sqlstate 'P0001' then
      if p_atomic then
        raise;
      end if;
      v_results := v_results || jsonb_build_array(
        jsonb_build_object('i', v_i, 'ok', false, 'error', sqlerrm));
    end;
    v_i := v_i + 1;
  end loop;

  v_state := v_row.live_state;
  v_rev := v_row.live_revision;
  if v_ok > 0 and v_started
     and coalesce(v_row.live_state, '') not in ('in_progress', 'finished')
     and coalesce(v_row.status, '') not in ('completed', 'archived') then
    v_state := 'in_progress';
  end if;

  -- 20261021130000: finished event + this call leaves the bracket WITHOUT a complete champion
  -- path (cleared downstream results, or Finals (2nd Set) newly required) → reopen it in the SAME
  -- write, so the affected matches can be replayed. Driven by the resolver, not by "a correction
  -- happened": a correction that keeps every real match decided leaves the event finished. An
  -- event finished while already incomplete (e.g. a split) reopens only if this call cleared
  -- recorded results.
  if v_done and v_ok > 0 then
    v_reopen := not public._elim_bracket_complete(jsonb_set(v_ls, '{matchState}', v_ms, true))
                and (public._elim_bracket_complete(v_ls0) or jsonb_array_length(v_reset) > 0);
  end if;
  if v_reopen then
    v_state := 'in_progress';
  end if;

  -- Recovery: dry run = the full pipeline, nothing written.
  if coalesce(p_dry_run, false) then
    return jsonb_build_object('dry_run', true, 'revision', v_row.live_revision, 'results', v_results,
      'reopens_tournament', v_reopen,
      'cascade', jsonb_build_object('reset', v_reset, 'cleared', v_cleared, 'stopped', v_stopped, 'released', v_released));
  end if;

  if v_ok > 0 then
    -- Recovery: one checkpoint (the PRE-call state) per call that contains a destructive op.
    if v_destr then
      v_ckpt := public._elim_checkpoint(p_tournament_id, v_row.live_revision, 'before_correction',
                  'Before change to ' || v_destr_mid, v_destr_mid, false,
                  public._elim_state_slice(v_ls0, false), v_done and not v_reopen);
    end if;
    v_ls := jsonb_set(v_ls, '{matchState}', v_ms, true);
    update public.tournaments
    set live_settings = v_ls,
        live_state = v_state,
        status = case when v_reopen then 'active' else status end,
        completed_at = case when v_reopen then null else completed_at end,
        updated_at = now()
    where id = p_tournament_id
    returning live_revision into v_rev;   -- bumped by tournaments_live_revision

    -- Recovery: audit — one compact row per applied op, same transaction.
    insert into public.tournament_audit (tournament_id, revision, op_id, op_index, op, match_id, table_id,
                                         actor_id, source, before, after, detail)
    select p_tournament_id, v_rev, p_op_id, (x ->> 'i')::int,
           public._elim_op_label(x #>> '{op,op}', x #> '{before}' -> (x #>> '{op,matchId}'),
                                 x #> '{after}' -> (x #>> '{op,matchId}')),
           x #>> '{op,matchId}',
           coalesce(case when jsonb_typeof(x #> '{after}' -> (x #>> '{op,matchId}') -> 'tableId') = 'number'
                         then (x #> '{after}' -> (x #>> '{op,matchId}') ->> 'tableId')::bigint end,
                    case when jsonb_typeof(x #> '{before}' -> (x #>> '{op,matchId}') -> 'tableId') = 'number'
                         then (x #> '{before}' -> (x #>> '{op,matchId}') ->> 'tableId')::bigint end),
           (select p.id from public.profiles p where p.id = auth.uid()),
           'td',
           case when x #>> '{op,matchId}' is not null then
             (select coalesce(jsonb_object_agg(k, x #> '{before}' -> (x #>> '{op,matchId}') -> k), '{}'::jsonb)
              from unnest(v_cols) k where (x #> '{before}' -> (x #>> '{op,matchId}')) ? k) end,
           case when x #>> '{op,matchId}' is not null then
             (select coalesce(jsonb_object_agg(k, x #> '{after}' -> (x #>> '{op,matchId}') -> k), '{}'::jsonb)
              from unnest(v_cols) k where (x #> '{after}' -> (x #>> '{op,matchId}')) ? k)
           else (x -> 'op') - 'op' end,
           jsonb_strip_nulls(jsonb_build_object(
             'cascade', case when jsonb_array_length(coalesce(x #> '{cascade,reset}', '[]'::jsonb)) > 0
                             then (x -> 'cascade') - 'ms' end,
             'checkpoint', case when (x #>> '{op,matchId}') = v_destr_mid then v_ckpt end,
             'reopened', case when v_reopen and (x #>> '{op,matchId}') = v_destr_mid then true end,
             'source', 'elim_live_apply'))
    from jsonb_array_elements(v_applied) x;

    -- Recovery: sanitized spectator activity — only for new clients (they stop logging their own).
    if p_op_id is not null then
      perform public._elim_public_events(p_tournament_id, v_ls, x -> 'before', x -> 'after', x -> 'op',
                                         v_row.live_state, v_state, coalesce(x -> 'cascade', '{}'::jsonb), v_tx)
      from jsonb_array_elements(v_applied) x;
    end if;
  end if;

  return jsonb_build_object('live_settings', v_ls, 'live_state', v_state, 'results', v_results,
    'revision', v_rev,
    'reopened', v_reopen,
    'status', case when v_reopen then 'active' else v_row.status end,
    'cascade', jsonb_build_object('reset', v_reset, 'cleared', v_cleared, 'stopped', v_stopped, 'released', v_released));
end;
$$;

-- elim_restore (from 20261019120000) + whole-bracket draw identity
create or replace function public.elim_restore(
  p_tournament_id     bigint,
  p_checkpoint_id     bigint,
  p_expected_revision bigint  default null,
  p_dry_run           boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_t       jsonb;
  v_ck      record;
  v_ls      jsonb;
  v_new     jsonb;
  v_ms      jsonb;
  v_id      text;
  v_st      jsonb;
  v_cleared int := 0;
  v_imp     jsonb;
  v_reopen  boolean;
  v_redraw  boolean;
  v_w       jsonb;
  v_changed int;
begin
  v_t := public._elim_recovery_lock(p_tournament_id, p_expected_revision, p_dry_run);
  v_ls := v_t -> 'live_settings';
  select c.* into v_ck from public.elim_checkpoints c where c.id = p_checkpoint_id and c.tournament_id = p_tournament_id;
  if not found then
    raise exception 'checkpoint_not_found' using errcode = 'P0001';
  end if;
  -- 20261021130000: draw identity is the whole bracket (two draws can share a drawNumber).
  v_redraw := v_ck.state ? 'bracket' and (v_ck.state -> 'bracket') is distinct from (v_ls -> 'bracket');
  if not (v_ck.state ? 'bracket') and (
       (v_ck.state -> 'drawNumber') is distinct from (v_ls #> '{bracket,drawNumber}')
       or (v_ck.state ? 'drawKey' and (v_ck.state ->> 'drawKey') is distinct from public._elim_draw_key(v_ls))) then
    raise exception 'different_draw' using errcode = 'P0001';
  end if;

  -- Restored state: matchState + queue order / pins (+ the earlier bracket). Scheduler settings
  -- (Auto Assign on/off, match-order mode) stay as they are now.
  v_ms := coalesce(v_ck.state -> 'matchState', '{}'::jsonb);
  -- A table that no longer exists in this tournament can't be restored onto a match.
  for v_id, v_st in select key, value from jsonb_each(v_ms) loop
    if jsonb_typeof(v_st -> 'tableId') = 'number' and not exists (
         select 1 from public.tournament_tables tt
         where tt.id = (v_st ->> 'tableId')::bigint and tt.tournament_id = p_tournament_id) then
      v_ms := v_ms || jsonb_build_object(v_id, v_st || jsonb_build_object('tableId', null));
      v_cleared := v_cleared + 1;
    end if;
  end loop;
  v_new := (v_ls - 'queueOrder' - 'queuePins')
           || jsonb_build_object('matchState', v_ms)
           || jsonb_strip_nulls(jsonb_build_object('queueOrder', v_ck.state -> 'queueOrder', 'queuePins', v_ck.state -> 'queuePins'))
           || case when v_redraw then jsonb_build_object('bracket', v_ck.state -> 'bracket') else '{}'::jsonb end;

  v_imp := public._elim_impact(v_ls -> 'matchState', v_ms);
  v_changed := (select count(*) from (
      select k from jsonb_object_keys(coalesce(v_ls -> 'matchState', '{}'::jsonb)) k
      union select k from jsonb_object_keys(v_ms) k) ids
    where jsonb_strip_nulls(coalesce(v_ls #> array['matchState', ids.k], '{}'::jsonb))
          is distinct from jsonb_strip_nulls(coalesce(v_ms -> ids.k, '{}'::jsonb)));
  v_reopen := coalesce((v_t ->> 'finished')::boolean, false) and (v_changed > 0 or v_redraw);
  v_imp := v_imp || jsonb_build_object('matchesChanged', v_changed, 'reopensTournament', v_reopen,
                                       'replacesBracket', v_redraw, 'missingTables', v_cleared);

  if coalesce(p_dry_run, false) then
    return jsonb_build_object('dry_run', true, 'revision', (v_t ->> 'revision')::bigint, 'impact', v_imp,
      'matchState', v_ms, 'bracket', case when v_redraw then v_ck.state -> 'bracket' end,
      'checkpoint', jsonb_build_object('id', v_ck.id, 'label', v_ck.label, 'reason', v_ck.reason,
                                       'revision', v_ck.revision, 'created_at', v_ck.created_at));
  end if;

  v_w := public._elim_recovery_write(p_tournament_id, v_t, v_new, v_reopen,
           'before_restore', 'Before restore to ' || coalesce(v_ck.label, 'checkpoint #' || v_ck.id), 'restore', null,
           jsonb_build_object('restoredCheckpoint', v_ck.id, 'restoredLabel', v_ck.label,
                              'restoredRevision', v_ck.revision, 'impact', v_imp - 'matchState'),
           null, jsonb_build_object('reset', to_jsonb(array_fill('x'::text, array[v_changed]))));
  return jsonb_build_object('ok', true, 'revision', v_w -> 'revision', 'checkpoint', v_w -> 'checkpoint',
    'impact', v_imp, 'live_settings', v_new,
    'live_state', case when v_reopen then 'in_progress' else v_t ->> 'live_state' end);
end;
$$;

-- elim_undo (from 20261019120000) + B
create or replace function public.elim_undo(
  p_tournament_id     bigint,
  p_expected_revision bigint  default null,
  p_dry_run           boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_t       jsonb;
  v_ls      jsonb;
  v_ms      jsonb;
  v_a       record;
  v_cur     jsonb;
  v_set     jsonb := '{}'::jsonb;
  v_k       text;
  v_ck_ms   jsonb;
  v_ids     text[];
  v_step    jsonb;
  v_casc    jsonb;
  v_new     jsonb;
  v_restore text[] := '{}';
  v_id      text;
  v_res_ck  jsonb;
  v_res_new jsonb;
  v_iter    int := 0;
  v_bad     boolean;
  v_imp     jsonb;
  v_reason  text;
  v_w       jsonb;
  v_meta    jsonb;
  v_cols    text[] := array['status', 'winner', 'p1Score', 'p2Score', 'result', 'tableId', 'startedAt'];
begin
  v_t := public._elim_recovery_lock(p_tournament_id, p_expected_revision, p_dry_run);
  v_ls := v_t -> 'live_settings';
  v_ms := coalesce(v_ls -> 'matchState', '{}'::jsonb);

  -- Newest reversible audited op that hasn't been undone (undo rows themselves are not redone).
  select a.* into v_a
  from public.tournament_audit a
  where a.tournament_id = p_tournament_id
    and a.op in ('set_winner', 'change_result', 'forfeit', 'withdraw', 'reopen', 'reset', 'score', 'timer',
                 'table', 'start', 'assign', 'unassign', 'patch_match', 'restore')
    and not exists (select 1 from public.tournament_audit u
                    where u.tournament_id = p_tournament_id and u.op = 'undo' and (u.detail ->> 'undoes')::bigint = a.id)
    -- 20261021130000: a draw / redraw is a hard boundary — only actions recorded on the CURRENT
    -- bracket (server-stamped draw identity) can be undone. Rows without the stamp (recorded
    -- before this migration) fail safe: never undone. Restore is the way across draws.
    and (a.detail ->> 'drawKey') = public._elim_draw_key(v_ls)
  order by a.id desc
  limit 1;

  if not found then
    v_reason := case
      when exists (select 1 from public.tournament_audit a
                   where a.tournament_id = p_tournament_id
                     and a.op in ('set_winner', 'change_result', 'forfeit', 'withdraw', 'reopen', 'reset', 'score', 'timer',
                                  'table', 'start', 'assign', 'unassign', 'patch_match', 'restore')
                     and (a.detail ->> 'drawKey') is not null
                     and not exists (select 1 from public.tournament_audit u
                                     where u.tournament_id = p_tournament_id and u.op = 'undo' and (u.detail ->> 'undoes')::bigint = a.id))
        then 'draw_boundary'
      when exists (select 1 from public.tournament_audit a
                   where a.tournament_id = p_tournament_id and (a.detail ->> 'drawKey') is null
                     and a.op in ('set_winner', 'change_result', 'forfeit', 'withdraw', 'reopen', 'reset', 'score', 'timer',
                                  'table', 'start', 'assign', 'unassign', 'patch_match', 'restore'))
        then 'before_update'
      else 'nothing_to_undo' end;
  elsif coalesce((v_t ->> 'finished')::boolean, false) then
    v_reason := 'tournament_finished';
  end if;
  if v_a.id is not null then
    v_meta := jsonb_build_object('auditId', v_a.id, 'op', v_a.op, 'matchId', v_a.match_id, 'at', v_a.created_at,
      'p1Name', v_a.detail ->> 'p1Name', 'p2Name', v_a.detail ->> 'p2Name',
      'before', v_a.before, 'after', v_a.after);
  end if;

  -- ── undo a restore: back to its pre-restore checkpoint, only if nothing changed since ──
  if v_reason is null and v_a.op = 'restore' then
    if v_a.revision is distinct from (v_t ->> 'revision')::bigint then
      v_reason := 'changed_since';
    else
      select c.state -> 'matchState' into v_ck_ms from public.elim_checkpoints c
      where c.id = (v_a.detail ->> 'checkpoint')::bigint and c.tournament_id = p_tournament_id;
      if v_ck_ms is null then
        v_reason := 'checkpoint_missing';
      else
        v_new := (v_ls - 'queueOrder' - 'queuePins') || jsonb_build_object('matchState', v_ck_ms)
                 || jsonb_strip_nulls(jsonb_build_object(
                      'queueOrder', (select c.state -> 'queueOrder' from public.elim_checkpoints c where c.id = (v_a.detail ->> 'checkpoint')::bigint),
                      'queuePins', (select c.state -> 'queuePins' from public.elim_checkpoints c where c.id = (v_a.detail ->> 'checkpoint')::bigint)))
                 -- 20261021130000: a Restore that brought back an earlier DRAW is undone with its
                 -- bracket (its pre-restore checkpoint holds it) — never the newer results on the
                 -- older bracket.
                 || coalesce((select jsonb_build_object('bracket', c.state -> 'bracket') from public.elim_checkpoints c
                              where c.id = (v_a.detail ->> 'checkpoint')::bigint and c.state ? 'bracket'), '{}'::jsonb);
        v_casc := jsonb_build_object('reset', '[]'::jsonb, 'cleared', '[]'::jsonb, 'stopped', '[]'::jsonb, 'released', '[]'::jsonb);
      end if;
    end if;
  -- ── undo a match op ──────────────────────────────────────────────────────────────────
  elsif v_reason is null then
    v_cur := coalesce(v_ms -> v_a.match_id, '{}'::jsonb);
    -- The match must still be exactly as that op left it.
    if exists (select 1 from jsonb_each(coalesce(v_a.after, '{}'::jsonb)) e
               where (case when e.key = 'status' then coalesce(v_cur -> 'status', '"scheduled"'::jsonb) else coalesce(v_cur -> e.key, 'null'::jsonb) end)
                     is distinct from e.value) then
      v_reason := 'match_changed';
    else
      -- Inverse patch: the recorded BEFORE fields (absent → cleared).
      foreach v_k in array v_cols loop
        v_set := v_set || jsonb_build_object(v_k,
          case when v_k = 'status' then coalesce(v_a.before -> 'status', '"scheduled"'::jsonb)
               else coalesce(v_a.before -> v_k, 'null'::jsonb) end);
      end loop;
      -- completedAt: from the op's checkpoint when there is one, else now / null.
      if (v_a.detail ->> 'checkpoint') is not null then
        select c.state -> 'matchState' into v_ck_ms from public.elim_checkpoints c
        where c.id = (v_a.detail ->> 'checkpoint')::bigint and c.tournament_id = p_tournament_id;
      end if;
      v_set := v_set || jsonb_build_object('completedAt',
        case when (v_set ->> 'status') = 'completed'
             then coalesce(v_ck_ms -> v_a.match_id -> 'completedAt',
                           to_jsonb(to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')))
             else 'null'::jsonb end);
      select coalesce(array_agg(n ->> 'id'), '{}') into v_ids from jsonb_array_elements(v_ls #> '{bracket,graph}') n;
      begin
        v_step := public._elim_apply_one(p_tournament_id, v_ids, v_ms, jsonb_build_object('op', 'patch_match', 'matchId', v_a.match_id, 'set', v_set));
      exception when sqlstate 'P0001' then
        v_reason := 'blocked:' || sqlerrm;   -- e.g. its table is now in use by another match
      end;
      if v_reason is null then
        v_casc := public._elim_cascade(v_ls, v_ms, v_step -> 'ms');
        v_new := v_casc -> 'ms';
        -- Put back COMPLETED results the original op's cascade had cleared, when their players
        -- match the checkpoint again and nothing has happened on them since.
        if v_ck_ms is not null and jsonb_typeof(v_a.detail #> '{cascade,reset}') = 'array' then
          select coalesce(array_agg(r #>> '{}'), '{}') into v_restore
          from jsonb_array_elements(v_a.detail #> '{cascade,reset}') r
          where coalesce(v_ck_ms -> (r #>> '{}') ->> 'status', '') = 'completed'
            and not public._elim_has_progress(v_new -> (r #>> '{}'));
          loop
            v_iter := v_iter + 1;
            v_res_new := v_new;
            foreach v_id in array v_restore loop
              v_res_new := v_res_new || jsonb_build_object(v_id, (v_ck_ms -> v_id) - 'tableId' - 'assignedAt');
            end loop;
            v_res_ck := public._elim_resolve(v_ls || jsonb_build_object('matchState', v_ck_ms));
            v_bad := false;
            foreach v_id in array v_restore loop
              if (public._elim_resolve(v_ls || jsonb_build_object('matchState', v_res_new)) -> v_id ->> 'p1') is distinct from (v_res_ck -> v_id ->> 'p1')
                 or (public._elim_resolve(v_ls || jsonb_build_object('matchState', v_res_new)) -> v_id ->> 'p2') is distinct from (v_res_ck -> v_id ->> 'p2') then
                v_restore := array_remove(v_restore, v_id);
                v_bad := true;
              end if;
            end loop;
            exit when not v_bad or v_iter > 10 or cardinality(v_restore) = 0;
          end loop;
          if cardinality(v_restore) > 0 then
            v_new := v_res_new;
          end if;
        end if;
        v_new := v_ls || jsonb_build_object('matchState', v_new);
      end if;
    end if;
  end if;

  if v_reason is not null then
    if coalesce(p_dry_run, false) then
      return jsonb_build_object('dry_run', true, 'available', false, 'reason', v_reason,
                                'revision', (v_t ->> 'revision')::bigint, 'undoing', v_meta);
    end if;
    raise exception 'undo_unavailable' using errcode = 'P0001', detail = v_reason;
  end if;

  v_imp := public._elim_impact(v_ms, v_new -> 'matchState')
           || jsonb_build_object('restoredResults', to_jsonb(v_restore));
  if coalesce(p_dry_run, false) then
    return jsonb_build_object('dry_run', true, 'available', true, 'revision', (v_t ->> 'revision')::bigint,
      'undoing', v_meta, 'impact', v_imp, 'cascade', v_casc - 'ms', 'matchState', v_new -> 'matchState');
  end if;

  v_w := public._elim_recovery_write(p_tournament_id, v_t, v_new, false,
           'before_undo', 'Before undo of ' || v_a.op || coalesce(' ' || v_a.match_id, ''), 'undo', v_a.match_id,
           jsonb_build_object('undoes', v_a.id, 'undoneOp', v_a.op, 'impact', v_imp,
                              'cascade', case when jsonb_array_length(coalesce(v_casc -> 'reset', '[]'::jsonb)) > 0 then v_casc - 'ms' end),
           case when v_a.match_id is not null then jsonb_build_object('op', 'patch_match', 'matchId', v_a.match_id) end,
           v_casc);
  return jsonb_build_object('ok', true, 'revision', v_w -> 'revision', 'checkpoint', v_w -> 'checkpoint',
    'undone', v_meta, 'impact', v_imp, 'live_settings', v_new, 'live_state', v_t ->> 'live_state');
end;
$$;

notify pgrst, 'reload schema';

commit;
