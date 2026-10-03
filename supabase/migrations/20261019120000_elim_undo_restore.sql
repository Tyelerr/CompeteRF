-- supabase/migrations/20261019120000_elim_undo_restore.sql
--
-- Elimination recovery — Undo + Restore (server side of Actions → Recovery & History).
-- Builds on 20261018120000_elim_recovery_foundation (revision, tournament_audit,
-- elim_checkpoints, _elim_cascade). Additive: two new RPCs, one audit-insert trigger, helpers,
-- plus one internal helper fix (_elim_state_slice, below). Installed apps are unaffected.
--
--   elim_undo(tid, expected_revision, dry_run)
--     Reverses the newest REVERSIBLE audited op that hasn't been undone (no redo).
--       • match ops (set_winner / change_result / forfeit / withdraw / reopen / reset / score /
--         timer / table / start / assign / unassign): only if the match is still exactly as that
--         op left it — otherwise refused 'match_changed' (use Restore). The match gets its
--         recorded BEFORE state back through the normal validated path (_elim_apply_one), then
--         the correction cascade clears downstream matches whose players change; results the
--         original op had cleared are put back from its checkpoint when their players match
--         again (completed results only — never a stale table / live state).
--       • restore: only if nothing changed since it (revision unchanged) → back to its
--         pre-restore checkpoint.
--     A finished tournament is not undone ('tournament_finished' — use Restore, which reopens
--     it explicitly).
--   elim_restore(tid, checkpoint_id, expected_revision, dry_run)
--     Returns the tournament to a checkpoint's matchState (+ queue order / pins; + the earlier
--     bracket for a pre-redraw milestone). A checkpoint from a DIFFERENT draw without its own
--     bracket is refused ('different_draw'). Restoring a FINISHED tournament to a different
--     state reopens it (status active / live_state in_progress) — the preview says so.
--     Auto Assign on/off and match-order mode stay as they are now.
--
--   Both: manager-only; p_expected_revision REQUIRED (refused 'stale_revision' if the
--   tournament moved); a checkpoint of the CURRENT state first (so they are themselves
--   reversible); one audit row; sanitized public activity; revision bump (trigger); a dry run
--   returns the exact impact (+ the resulting matchState for the client's standings check)
--   and writes nothing.
--
--   tournament_audit_names (trigger): stamps p1Name / p2Name of the audited match at write
--   time, so history reads "A defeated B" even after later corrections re-seat players.
--
--   Fix: _elim_state_slice (from 20261018120000) is redefined to strip only TOP-LEVEL nulls — its
--   recursive jsonb_strip_nulls dropped explicit nulls inside matches, so unchanged matches looked
--   "changed" in a restore preview. (No production checkpoints existed when this was found.)
--
-- Rollback: supabase/rollback/20261019120000_elim_undo_restore_rollback.sql
-- Tests:    supabase/tests/elim_undo_restore.test.ts (PGlite)

begin;

-- ── checkpoint slice: strip only TOP-LEVEL nulls (fix) ─────────────────────────────────
-- 20261018120000 used jsonb_strip_nulls, which is RECURSIVE: it also dropped explicit nulls inside
-- every match (result: null, tableId: null, …), so a restored / compared state looked different
-- from the live one even when nothing changed. Same keys, nested values kept verbatim.
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
    'bracket', case when p_with_bracket then p_ls -> 'bracket' end)) e
  where jsonb_typeof(e.value) <> 'null';
$$;
revoke all on function public._elim_state_slice(jsonb, boolean) from public, anon, authenticated;

-- ── names on audit rows ──────────────────────────────────────────────────────────────────
create or replace function public._elim_seed_name(p_ls jsonb, p_reg text)
returns text language sql immutable set search_path = public, pg_temp as $$
  select s ->> 'name' from jsonb_array_elements(coalesce(p_ls #> '{bracket,seeds}', '[]'::jsonb)) s
  where p_reg is not null and (s ->> 'registrationId') = p_reg limit 1;
$$;
revoke all on function public._elim_seed_name(jsonb, text) from public, anon, authenticated;

create or replace function public.tg_tournament_audit_names()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_ls jsonb; v_who jsonb;
begin
  if new.match_id is null or coalesce(new.detail, '{}'::jsonb) ? 'p1Name' then
    return new;
  end if;
  select t.live_settings into v_ls from public.tournaments t where t.id = new.tournament_id;
  if jsonb_typeof(v_ls #> '{bracket,graph}') <> 'array' then
    return new;
  end if;
  v_who := public._elim_resolve(v_ls) -> new.match_id;
  new.detail := coalesce(new.detail, '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
    'p1Name', public._elim_seed_name(v_ls, v_who ->> 'p1'),
    'p2Name', public._elim_seed_name(v_ls, v_who ->> 'p2')));
  return new;
end;
$$;
revoke all on function public.tg_tournament_audit_names() from public, anon, authenticated;
drop trigger if exists tournament_audit_names on public.tournament_audit;
create trigger tournament_audit_names
  before insert on public.tournament_audit
  for each row execute function public.tg_tournament_audit_names();

-- ── impact of replacing matchState p_cur with p_new (counts + ids; TD-facing preview) ────
create or replace function public._elim_impact(p_cur jsonb, p_new jsonb)
returns jsonb
language sql
immutable
set search_path = public, pg_temp
as $$
  with ids as (
    select k from jsonb_object_keys(coalesce(p_cur, '{}'::jsonb)) k
    union select k from jsonb_object_keys(coalesce(p_new, '{}'::jsonb)) k
  ), x as (
    select k,
           coalesce(p_cur -> k, '{}'::jsonb) c,
           coalesce(p_new -> k, '{}'::jsonb) n
    from ids
  ), f as (
    select k, c, n,
      coalesce(c ->> 'status', 'scheduled') = 'completed' as c_done,
      coalesce(n ->> 'status', 'scheduled') = 'completed' as n_done
    from x
  )
  select jsonb_build_object(
    'cleared',  coalesce(jsonb_agg(k) filter (where c_done and not n_done), '[]'::jsonb),
    'restored', coalesce(jsonb_agg(k) filter (where n_done and not c_done), '[]'::jsonb),
    'changed',  coalesce(jsonb_agg(k) filter (where c_done and n_done
                  and (coalesce(c -> 'winner', 'null') is distinct from coalesce(n -> 'winner', 'null')
                       or coalesce(c -> 'result', 'null') is distinct from coalesce(n -> 'result', 'null'))), '[]'::jsonb),
    'toWaiting', coalesce(jsonb_agg(k) filter (where public._elim_has_progress(c) and not public._elim_has_progress(n)), '[]'::jsonb),
    'stopped',  coalesce(jsonb_agg(k) filter (where coalesce(c ->> 'status', '') = 'in_progress' and coalesce(n ->> 'status', '') <> 'in_progress'), '[]'::jsonb),
    'tablesChanged', coalesce(jsonb_agg(k) filter (where coalesce(c -> 'tableId', 'null') is distinct from coalesce(n -> 'tableId', 'null')
                       and (jsonb_typeof(c -> 'tableId') = 'number' or jsonb_typeof(n -> 'tableId') = 'number')), '[]'::jsonb))
  from f;
$$;
revoke all on function public._elim_impact(jsonb, jsonb) from public, anon, authenticated;

-- Common entry: auth, manager, lock, revision. Returns the locked row as jsonb.
create or replace function public._elim_recovery_lock(p_tournament_id bigint, p_expected_revision bigint, p_dry_run boolean)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_row record;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;
  if p_tournament_id is null or not public.can_manage_tournament(p_tournament_id) then
    raise exception 'Not allowed to manage this tournament' using errcode = '42501';
  end if;
  select t.id, t.live_settings, t.live_state, t.status, t.tournament_format, t.live_revision
  into v_row from public.tournaments t where t.id = p_tournament_id for update;
  if not found then
    raise exception 'Tournament not found' using errcode = 'P0002';
  end if;
  if v_row.tournament_format = 'chip-tournament' then
    raise exception 'Not an elimination tournament' using errcode = '22023';
  end if;
  if jsonb_typeof(v_row.live_settings #> '{bracket,graph}') is distinct from 'array' then
    raise exception 'No elimination bracket' using errcode = '22023';
  end if;
  if not coalesce(p_dry_run, false) then
    if p_expected_revision is null then
      raise exception 'revision_required' using errcode = 'P0001';
    end if;
    if p_expected_revision is distinct from v_row.live_revision then
      raise exception 'stale_revision' using errcode = 'P0001', detail = v_row.live_revision::text;
    end if;
  end if;
  return jsonb_build_object('live_settings', v_row.live_settings, 'live_state', v_row.live_state,
    'status', v_row.status, 'revision', v_row.live_revision,
    'finished', coalesce(v_row.status, '') in ('completed', 'archived') or v_row.live_state = 'finished');
end;
$$;
revoke all on function public._elim_recovery_lock(bigint, bigint, boolean) from public, anon, authenticated;

-- Shared writer for undo / restore: pre-checkpoint, state write, audit row, public activity.
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

-- ── RESTORE ──────────────────────────────────────────────────────────────────────────────
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
  v_redraw := v_ck.state ? 'bracket' and (v_ck.state #> '{bracket,drawNumber}') is distinct from (v_ls #> '{bracket,drawNumber}');
  if not (v_ck.state ? 'bracket') and (v_ck.state -> 'drawNumber') is distinct from (v_ls #> '{bracket,drawNumber}') then
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

-- ── UNDO ─────────────────────────────────────────────────────────────────────────────────
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
  order by a.id desc
  limit 1;

  if not found then
    v_reason := 'nothing_to_undo';
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
                      'queuePins', (select c.state -> 'queuePins' from public.elim_checkpoints c where c.id = (v_a.detail ->> 'checkpoint')::bigint)));
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

revoke all on function public.elim_restore(bigint, bigint, bigint, boolean) from public, anon;
revoke all on function public.elim_undo(bigint, bigint, boolean) from public, anon;
grant execute on function public.elim_restore(bigint, bigint, bigint, boolean) to authenticated;
grant execute on function public.elim_undo(bigint, bigint, boolean) to authenticated;

notify pgrst, 'reload schema';

commit;
