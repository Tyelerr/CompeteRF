-- supabase/migrations/20260924120000_elim_auto_assign_server.sql
--
-- Server-backed Auto Assign for Single/Double Elimination: Auto Assign no longer depends on a
-- TD keeping the Manage screen open.
--
--   meaningful change (DB trigger) ──┐
--   recovery sweep (pg_cron, 1/min) ─┴─► _elim_auto_assign_kick ──pg_net──► auto-assign-run
--        (Edge Function: runs the SAME bundled TypeScript scheduler the app uses, then writes via)
--        ──► elim_auto_assign_apply (service_role only: assign + ifUnassigned, never start,
--            row-locked, refuses a plan computed from stale state)
--
-- Objects (no table/column/data changes; no change to any existing function):
--   1. pg_net extension (async HTTP from Postgres; queued inside the transaction, so a rolled
--      back write sends nothing).
--   2. _elim_auto_assign_signature(jsonb)  what Auto Assign cares about: enabled flag, mode, queue
--      order, queue pins, draw number, the completed-match set, the occupied-table set and the
--      Play Next map. Scores / timers / start times are NOT in it, so rack-by-rack score
--      updates never trigger Auto Assign.
--   3. _elim_auto_assign_kick(tid, reason) secret-guarded fire-and-forget POST to auto-assign-run.
--      Reads the function URL + shared secret from Supabase Vault; a no-op until both exist.
--      Never raises (a kick failure must not break a TD's or player's write).
--   4. Triggers: tournaments (live_settings / live_state / is_paused) and tournament_tables
--      (a table added or brought back from 'unavailable').
--   5. elim_auto_assign_apply(tid, ops, expected_updated_at)  service_role only.
--   6. _elim_auto_assign_sweep() + cron job 'elim-auto-assign-sweep' (every minute, recovery).
--
-- Setup after applying (not in this file — secrets never live in git):
--   select vault.create_secret('https://<project-ref>.supabase.co/functions/v1/auto-assign-run', 'elim_auto_assign_url');
--   select vault.create_secret('<random 32+ bytes>', 'elim_auto_assign_secret');
--   supabase secrets set AUTO_ASSIGN_SECRET=<same random value>
--   supabase functions deploy auto-assign-run --no-verify-jwt   (auth = the shared secret header)

create extension if not exists pg_net with schema extensions;

-- ════════════════════════════════════════════════════════════════════════════════════════
-- 2. What Auto Assign reacts to
-- ════════════════════════════════════════════════════════════════════════════════════════
create or replace function public._elim_auto_assign_signature(p_ls jsonb)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  with ms as (
    select e.key, e.value
    from jsonb_each(case when jsonb_typeof(p_ls -> 'matchState') = 'object'
                         then p_ls -> 'matchState' else '{}'::jsonb end) e
    where jsonb_typeof(e.value) = 'object'
  )
  select concat_ws('|',
    coalesce(p_ls ->> 'autoAssignEnabled', ''),
    coalesce(p_ls ->> 'autoAssignMode', ''),
    coalesce((p_ls -> 'queueOrder')::text, ''),
    coalesce((p_ls -> 'queuePins')::text, ''),
    coalesce(p_ls #>> '{bracket,drawNumber}', ''),
    -- completed matches (a completion frees a table and can make new matches Ready)
    (select coalesce(string_agg(key, ',' order by key), '') from ms where value ->> 'status' = 'completed'),
    -- occupied tables (a table freed / taken)
    (select coalesce(string_agg(value ->> 'tableId', ',' order by value ->> 'tableId'), '')
       from ms where jsonb_typeof(value -> 'tableId') = 'number'
                 and coalesce(value ->> 'status', 'scheduled') <> 'completed'),
    -- Play Next preferences
    (select coalesce(string_agg(key || '>' || (value ->> 'preferredTableId'), ',' order by key), '')
       from ms where jsonb_typeof(value -> 'preferredTableId') = 'number')
  );
$$;

revoke all on function public._elim_auto_assign_signature(jsonb) from public, anon, authenticated;

-- ════════════════════════════════════════════════════════════════════════════════════════
-- 3. Kick the Edge Function (secret-guarded, fire-and-forget, never raises)
-- ════════════════════════════════════════════════════════════════════════════════════════
create or replace function public._elim_auto_assign_kick(p_tournament_id bigint, p_reason text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_url    text;
  v_secret text;
begin
  select ds.decrypted_secret into v_url from vault.decrypted_secrets ds where ds.name = 'elim_auto_assign_url';
  select ds.decrypted_secret into v_secret from vault.decrypted_secrets ds where ds.name = 'elim_auto_assign_secret';
  if v_url is null or v_secret is null then
    return;  -- not configured yet: Auto Assign simply doesn't run server-side
  end if;
  perform net.http_post(
    url := v_url,
    body := jsonb_build_object('tournament_id', p_tournament_id, 'reason', p_reason),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-auto-assign-secret', v_secret),
    timeout_milliseconds := 5000
  );
exception when others then
  -- A failed kick must never fail the TD's / player's write; the sweep recovers.
  raise warning 'elim auto-assign kick failed for tournament %: %', p_tournament_id, sqlerrm;
end;
$$;

revoke all on function public._elim_auto_assign_kick(bigint, text) from public, anon, authenticated;

-- ════════════════════════════════════════════════════════════════════════════════════════
-- 4. Triggers
-- ════════════════════════════════════════════════════════════════════════════════════════
create or replace function public._elim_auto_assign_on_tournament()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- (the WHEN clause already requires: enabled, running, not paused, not chip)
  if coalesce(OLD.live_settings ->> 'autoAssignEnabled', '') <> 'true'   -- just enabled
     or OLD.live_state is distinct from 'in_progress'                     -- just started
     or coalesce(OLD.is_paused, false)                                    -- just resumed
     or public._elim_auto_assign_signature(OLD.live_settings)
        is distinct from public._elim_auto_assign_signature(NEW.live_settings) then
    perform public._elim_auto_assign_kick(NEW.id, 'tournament_change');
  end if;
  return null;
end;
$$;

revoke all on function public._elim_auto_assign_on_tournament() from public, anon, authenticated;

drop trigger if exists elim_auto_assign_on_tournament on public.tournaments;
create trigger elim_auto_assign_on_tournament
  after update of live_settings, live_state, is_paused on public.tournaments
  for each row
  when (
    new.live_settings ->> 'autoAssignEnabled' = 'true'
    and new.live_state = 'in_progress'
    and not coalesce(new.is_paused, false)
    and new.tournament_format <> 'chip-tournament'
  )
  execute function public._elim_auto_assign_on_tournament();

-- A table added, or brought back into service, can take a Ready match.
create or replace function public._elim_auto_assign_on_table()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ok boolean;
begin
  if NEW.status = 'unavailable' then
    return null;
  end if;
  if TG_OP = 'UPDATE' and OLD.status is distinct from 'unavailable' then
    return null;  -- available ↔ in_use is not an availability change for Auto Assign
  end if;
  select (t.live_settings ->> 'autoAssignEnabled' = 'true'
          and t.live_state = 'in_progress'
          and not coalesce(t.is_paused, false)
          and t.tournament_format <> 'chip-tournament')
  into v_ok
  from public.tournaments t
  where t.id = NEW.tournament_id;
  if coalesce(v_ok, false) then
    perform public._elim_auto_assign_kick(NEW.tournament_id, 'table_available');
  end if;
  return null;
end;
$$;

revoke all on function public._elim_auto_assign_on_table() from public, anon, authenticated;

drop trigger if exists elim_auto_assign_on_table on public.tournament_tables;
create trigger elim_auto_assign_on_table
  after insert or update of status on public.tournament_tables
  for each row
  execute function public._elim_auto_assign_on_table();

-- ════════════════════════════════════════════════════════════════════════════════════════
-- 5. The ONLY write path for automatic assignments (service_role only)
-- ════════════════════════════════════════════════════════════════════════════════════════
-- Accepts only {"op":"assign","matchId","tableId","ifUnassigned":true[,"start":false]} ops, so it
-- can never start a match, move an already-assigned match, or touch anything else. Re-checks
-- that Auto Assign is still active under the row lock, and refuses a plan computed from state
-- that changed since it was read (p_expected_updated_at ≠ current updated_at → 'stale', no
-- write; the caller re-reads and re-plans). Otherwise applies the ops best-effort through the
-- same _elim_apply_one validator as the TD path (table must exist / be available / be free;
-- match must be Ready-shaped; assignedAt stamped for notification dedupe).
create or replace function public.elim_auto_assign_apply(
  p_tournament_id bigint,
  p_ops jsonb,
  p_expected_updated_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row     record;
  v_ls      jsonb;
  v_ms      jsonb;
  v_ids     text[];
  v_op      jsonb;
  v_step    jsonb;
  v_results jsonb := '[]'::jsonb;
  v_i       int := 0;
  v_ok      int := 0;
  v_now     timestamptz;
begin
  if p_ops is null or jsonb_typeof(p_ops) <> 'array'
     or jsonb_array_length(p_ops) < 1 or jsonb_array_length(p_ops) > 64 then
    raise exception 'ops must be an array of 1..64 operations' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_ops) e
    where jsonb_typeof(e) <> 'object'
       or (e ->> 'op') is distinct from 'assign'
       or exists (select 1 from jsonb_object_keys(e) k
                  where k not in ('op', 'matchId', 'tableId', 'ifUnassigned', 'start'))
       or (e -> 'ifUnassigned') is distinct from 'true'::jsonb
       or (e ? 'start' and (e -> 'start') is distinct from 'false'::jsonb)
  ) then
    raise exception 'Only automatic assign ops (ifUnassigned, never start) are allowed' using errcode = '42501';
  end if;

  select t.live_settings, t.live_state, t.is_paused, t.tournament_format, t.updated_at
  into v_row
  from public.tournaments t
  where t.id = p_tournament_id
  for update;
  if not found then
    raise exception 'Tournament not found' using errcode = 'P0002';
  end if;
  if coalesce(v_row.live_settings ->> 'autoAssignEnabled', '') <> 'true'
     or v_row.live_state is distinct from 'in_progress'
     or coalesce(v_row.is_paused, false)
     or v_row.tournament_format = 'chip-tournament' then
    return jsonb_build_object('status', 'inactive');
  end if;
  if p_expected_updated_at is null or v_row.updated_at is distinct from p_expected_updated_at then
    return jsonb_build_object('status', 'stale', 'updated_at', v_row.updated_at);
  end if;

  v_ls := coalesce(v_row.live_settings, '{}'::jsonb);
  if jsonb_typeof(v_ls #> '{bracket,graph}') is distinct from 'array' then
    return jsonb_build_object('status', 'inactive');
  end if;
  select coalesce(array_agg(n ->> 'id'), '{}') into v_ids
  from jsonb_array_elements(v_ls #> '{bracket,graph}') n;
  v_ms := case when jsonb_typeof(v_ls -> 'matchState') = 'object'
               then v_ls -> 'matchState' else '{}'::jsonb end;

  for v_op in select value from jsonb_array_elements(p_ops) loop
    begin
      v_step := public._elim_apply_one(p_tournament_id, v_ids, v_ms, v_op);
      v_ms := v_step -> 'ms';
      v_ok := v_ok + 1;
      v_results := v_results || jsonb_build_array(jsonb_build_object('i', v_i, 'ok', true));
    exception when sqlstate 'P0001' then
      v_results := v_results || jsonb_build_array(
        jsonb_build_object('i', v_i, 'ok', false, 'error', sqlerrm));
    end;
    v_i := v_i + 1;
  end loop;

  v_now := v_row.updated_at;
  if v_ok > 0 then
    v_ls := jsonb_set(v_ls, '{matchState}', v_ms, true);
    update public.tournaments
    set live_settings = v_ls, updated_at = now()
    where id = p_tournament_id
    returning updated_at into v_now;
  end if;
  return jsonb_build_object('status', 'applied', 'results', v_results, 'updated_at', v_now);
end;
$$;

revoke all on function public.elim_auto_assign_apply(bigint, jsonb, timestamptz) from public, anon, authenticated;
grant execute on function public.elim_auto_assign_apply(bigint, jsonb, timestamptz) to service_role;

-- ════════════════════════════════════════════════════════════════════════════════════════
-- 6. Recovery sweep (every minute): re-kick every tournament where Auto Assign is active, in
--    case a trigger's HTTP call was lost. The function is idempotent (nothing to do → no write).
-- ════════════════════════════════════════════════════════════════════════════════════════
create or replace function public._elim_auto_assign_sweep()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r record;
  n integer := 0;
begin
  for r in
    select t.id from public.tournaments t
    where t.live_state = 'in_progress'
      and not coalesce(t.is_paused, false)
      and t.tournament_format <> 'chip-tournament'
      and t.live_settings ->> 'autoAssignEnabled' = 'true'
      and jsonb_typeof(t.live_settings #> '{bracket,graph}') = 'array'
  loop
    perform public._elim_auto_assign_kick(r.id, 'sweep');
    n := n + 1;
  end loop;
  return n;
end;
$$;

revoke all on function public._elim_auto_assign_sweep() from public, anon, authenticated;

select cron.unschedule(j.jobid) from cron.job j where j.jobname = 'elim-auto-assign-sweep';
select cron.schedule('elim-auto-assign-sweep', '* * * * *', 'select public._elim_auto_assign_sweep()');
