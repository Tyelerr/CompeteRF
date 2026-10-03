-- supabase/migrations/20261018120000_elim_recovery_foundation.sql
--
-- Elimination recovery — Phase 3A (correction cascade) + revision / audit / checkpoint
-- foundation. Design: ELIM_RECOVERY_DESIGN.md. Additive and backward-compatible:
--
--   1. CORRECTION CASCADE (the bug fix). matchState stores a result as a SLOT (winner 1|2), and
--      advancement is derived. Before this, changing / resetting / reopening an earlier match
--      left every downstream result in place, so a recorded later result silently moved to
--      whoever now occupies that slot. elim_live_apply now resolves the bracket BEFORE and
--      AFTER each outcome-changing op and, for every downstream match that has progress
--      (table / start / score / result) whose ordered participants changed — including a GF2
--      that is now skipped and any match whose feeder became undecided — clears it back to
--      Waiting (status scheduled, no winner / scores / result / start / table) and repeats until
--      nothing else changes. Unchanged matchups keep their results. Winners and losers paths,
--      byes, withdrawals (no losers drop) and the grand-final reset all follow from the single
--      shared resolver (_elim_resolve) — no second dependency walker.
--   2. REVISION. tournaments.live_revision (new, default 0 — no table rewrite) is bumped by a
--      BEFORE UPDATE trigger whenever live_settings / live_state / status change, so EVERY
--      writer (elim_live_apply, Auto Assign, the client draw, settings merges, finish) is
--      covered without touching those paths. A client can't set it (the trigger owns it).
--      elim_live_apply takes an optional p_expected_revision: if supplied and different, the
--      whole call is refused with 'stale_revision' (detail = the current revision) BEFORE
--      anything is written. Omitted → exactly today's behavior (installed native builds).
--   3. AUDIT. tournament_audit (new, manager-only read, server-only write): one compact row per
--      applied op — revision, op, match, table, actor (auth.uid()), compact before/after,
--      cascade detail, op id — written in the SAME transaction as the state change (a refused or
--      failed call writes nothing). Idempotent: (tournament_id, op_id, op_index) is unique and a
--      replayed p_op_id returns the current state without re-applying.
--   4. PUBLIC ACTIVITY. When the caller passes p_op_id (new clients), the server also writes the
--      sanitized spectator rows to tournament_events (names / table / location only; no actor,
--      no before/after, no op ids) and the client stops writing its own. Old clients (no op id)
--      keep writing their own activity exactly as before → no duplicates either way.
--   5. CHECKPOINTS. elim_checkpoints (new, manager-only read, server-only write): bounded
--      restore points holding matchState + queue keys (+ bracket only before a redraw). Taken
--      before destructive ops (winner/result change on a decided match, reset, reopen,
--      forfeit / withdraw, any cascade) and as milestones (first start, before redraw, finish).
--      Retention: newest 30 non-milestone per tournament; 5 once the event is finished;
--      milestones kept. Never in the live polling payload; no tournament is ever cloned.
--   6. DRY RUN. p_dry_run = true runs the exact same pipeline and returns results + cascade
--      impact + current revision without writing — the TD's impact preview can never disagree
--      with what the real call will do.
--
-- Rollback: supabase/rollback/20261018120000_elim_recovery_foundation_rollback.sql
-- Tests:    supabase/tests/elim_recovery_foundation.test.ts (PGlite)

begin;

-- ── 1. Revision column + trigger ─────────────────────────────────────────────────────────
alter table public.tournaments
  add column if not exists live_revision bigint not null default 0;

-- ── 2. Audit + checkpoints tables ────────────────────────────────────────────────────────
create table if not exists public.tournament_audit (
  id            bigserial primary key,
  tournament_id bigint not null references public.tournaments(id) on delete cascade,
  revision      bigint not null,
  op_id         uuid,
  op_index      int not null default 0,
  op            text not null,
  match_id      text,
  table_id      bigint,
  actor_id      uuid references public.profiles(id) on delete set null,
  source        text not null default 'td',
  before        jsonb,
  after         jsonb,
  detail        jsonb,
  created_at    timestamptz not null default now()
);
create unique index if not exists tournament_audit_op_uniq
  on public.tournament_audit (tournament_id, op_id, op_index) where op_id is not null;
create index if not exists tournament_audit_tid_id on public.tournament_audit (tournament_id, id desc);

create table if not exists public.elim_checkpoints (
  id            bigserial primary key,
  tournament_id bigint not null references public.tournaments(id) on delete cascade,
  revision      bigint not null,
  reason        text not null,
  label         text,
  match_id      text,
  milestone     boolean not null default false,
  actor_id      uuid references public.profiles(id) on delete set null,
  state         jsonb not null,
  created_at    timestamptz not null default now()
);
create index if not exists elim_checkpoints_tid on public.elim_checkpoints (tournament_id, id desc);

alter table public.tournament_audit enable row level security;
alter table public.elim_checkpoints enable row level security;
drop policy if exists tournament_audit_manager_read on public.tournament_audit;
create policy tournament_audit_manager_read on public.tournament_audit
  for select to authenticated using (public.can_manage_tournament(tournament_id));
drop policy if exists elim_checkpoints_manager_read on public.elim_checkpoints;
create policy elim_checkpoints_manager_read on public.elim_checkpoints
  for select to authenticated using (public.can_manage_tournament(tournament_id));
revoke all on public.tournament_audit from public, anon;
revoke all on public.elim_checkpoints from public, anon;
grant select on public.tournament_audit to authenticated;
grant select on public.elim_checkpoints to authenticated;

-- Insert a checkpoint and enforce retention (30 rolling, 5 once finished; milestones kept).
create or replace function public._elim_checkpoint(
  p_tournament_id bigint, p_revision bigint, p_reason text, p_label text, p_match_id text,
  p_milestone boolean, p_state jsonb, p_finished boolean
) returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_id bigint;
begin
  insert into public.elim_checkpoints (tournament_id, revision, reason, label, match_id, milestone, actor_id, state)
  values (p_tournament_id, p_revision, p_reason, p_label, p_match_id, coalesce(p_milestone, false),
          (select p.id from public.profiles p where p.id = auth.uid()), p_state)
  returning id into v_id;
  delete from public.elim_checkpoints c
  where c.tournament_id = p_tournament_id and not c.milestone
    and c.id not in (
      select c2.id from public.elim_checkpoints c2
      where c2.tournament_id = p_tournament_id and not c2.milestone
      order by c2.id desc
      limit case when coalesce(p_finished, false) then 5 else 30 end);
  return v_id;
end;
$$;
revoke all on function public._elim_checkpoint(bigint, bigint, text, text, text, boolean, jsonb, boolean) from public, anon, authenticated;

-- Restorable slice of live_settings (never the settings / prize keys; bracket only when asked).
create or replace function public._elim_state_slice(p_ls jsonb, p_with_bracket boolean)
returns jsonb language sql immutable set search_path = public, pg_temp as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'matchState', coalesce(p_ls -> 'matchState', '{}'::jsonb),
    'queueOrder', p_ls -> 'queueOrder',
    'queuePins', p_ls -> 'queuePins',
    'autoAssignMode', p_ls -> 'autoAssignMode',
    'autoAssignEnabled', p_ls -> 'autoAssignEnabled',
    'drawNumber', p_ls #> '{bracket,drawNumber}',
    'bracket', case when p_with_bracket then p_ls -> 'bracket' end));
$$;

create or replace function public.tg_tournaments_live_revision()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_changed boolean := new.live_settings is distinct from old.live_settings
                    or new.live_state is distinct from old.live_state
                    or new.status is distinct from old.status;
  v_old_bracket boolean := jsonb_typeof(old.live_settings #> '{bracket,graph}') = 'array';
begin
  -- The trigger owns the revision: a direct client UPDATE can never set or rewind it.
  new.live_revision := old.live_revision + case when v_changed then 1 else 0 end;
  if not v_changed or coalesce(new.tournament_format, '') = 'chip-tournament' then
    return new;
  end if;
  -- Milestones (elimination only). Before a redraw / bracket removal: the previous bracket.
  if v_old_bracket and (new.live_settings #> '{bracket,drawNumber}') is distinct from (old.live_settings #> '{bracket,drawNumber}') then
    perform public._elim_checkpoint(old.id, old.live_revision, 'before_redraw', 'Before bracket redraw', null, true,
                                    public._elim_state_slice(old.live_settings, true), false);
  end if;
  if jsonb_typeof(new.live_settings #> '{bracket,graph}') = 'array' then
    -- First real start.
    if new.live_state = 'in_progress' and old.live_state is distinct from 'in_progress' and old.live_state is distinct from 'finished' then
      perform public._elim_checkpoint(new.id, new.live_revision, 'tournament_started', 'Tournament started', null, true,
                                      public._elim_state_slice(old.live_settings, false), false);
    end if;
    -- Finish (status → completed / live_state → finished): the final state.
    if (new.status = 'completed' and old.status is distinct from 'completed')
       or (new.live_state = 'finished' and old.live_state is distinct from 'finished') then
      perform public._elim_checkpoint(new.id, new.live_revision, 'finished', 'Tournament finished', null, true,
                                      public._elim_state_slice(new.live_settings, false), true);
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.tg_tournaments_live_revision() from public, anon, authenticated;

drop trigger if exists tournaments_live_revision on public.tournaments;
create trigger tournaments_live_revision
  before update on public.tournaments
  for each row execute function public.tg_tournaments_live_revision();

-- ── 3. Correction cascade ────────────────────────────────────────────────────────────────
create or replace function public._elim_has_progress(p_st jsonb)
returns boolean language sql immutable set search_path = public, pg_temp as $$
  select jsonb_typeof(p_st) = 'object' and (
    coalesce(p_st ->> 'status', 'scheduled') <> 'scheduled'
    or jsonb_typeof(p_st -> 'winner') = 'number'
    or jsonb_typeof(p_st -> 'p1Score') = 'number'
    or jsonb_typeof(p_st -> 'p2Score') = 'number'
    or jsonb_typeof(p_st -> 'tableId') = 'number');
$$;

-- Clear every downstream match whose participants changed between p_ms_before and p_ms_after,
-- repeating until stable. Returns {ms, reset[], cleared[], stopped[], released[]}:
--   reset    = matches returned to Waiting (had any progress)
--   cleared  = …of which had a recorded result (winner / completed)
--   stopped  = …of which were in progress
--   released = table ids freed
create or replace function public._elim_cascade(p_ls jsonb, p_ms_before jsonb, p_ms_after jsonb)
returns jsonb
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v_before   jsonb := public._elim_resolve(p_ls || jsonb_build_object('matchState', p_ms_before));
  v_ms       jsonb := p_ms_after;
  v_after    jsonb;
  v_id       text;
  v_st       jsonb;
  v_b        jsonb;
  v_a        jsonb;
  v_reset    text[] := '{}';
  v_cleared  text[] := '{}';
  v_stopped  text[] := '{}';
  v_released jsonb := '[]'::jsonb;
  v_changed  boolean;
  v_iter     int := 0;
  v_now      text := to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
begin
  loop
    v_iter := v_iter + 1;
    v_changed := false;
    v_after := public._elim_resolve(p_ls || jsonb_build_object('matchState', v_ms));
    for v_id, v_st in select key, value from jsonb_each(v_ms) loop
      continue when not public._elim_has_progress(v_st);
      v_b := v_before -> v_id;
      v_a := v_after -> v_id;
      continue when v_b is null or v_a is null;              -- not a node of this bracket
      if (v_b ->> 'p1') is distinct from (v_a ->> 'p1')
         or (v_b ->> 'p2') is distinct from (v_a ->> 'p2')
         or coalesce((v_b ->> 'real')::boolean, false) is distinct from coalesce((v_a ->> 'real')::boolean, false) then
        v_reset := v_reset || v_id;
        if (v_st ->> 'status') = 'completed' or jsonb_typeof(v_st -> 'winner') = 'number' then
          v_cleared := v_cleared || v_id;
        end if;
        if (v_st ->> 'status') = 'in_progress' then
          v_stopped := v_stopped || v_id;
        end if;
        if jsonb_typeof(v_st -> 'tableId') = 'number' then
          v_released := v_released || jsonb_build_array(v_st -> 'tableId');
        end if;
        v_ms := v_ms || jsonb_build_object(v_id,
          (v_st - 'assignedAt' - 'preferredTableId')
          || jsonb_build_object('status', 'scheduled', 'winner', null, 'p1Score', null, 'p2Score', null,
                                'result', null, 'startedAt', null, 'completedAt', null, 'tableId', null)
          || case when jsonb_typeof(v_st -> 'tableId') = 'number'
                  then jsonb_build_object('clearedAt', v_now) else '{}'::jsonb end);
        v_changed := true;
      end if;
    end loop;
    exit when not v_changed or v_iter > 64;
  end loop;
  return jsonb_build_object('ms', v_ms, 'reset', to_jsonb(v_reset), 'cleared', to_jsonb(v_cleared),
                            'stopped', to_jsonb(v_stopped), 'released', v_released);
end;
$$;
revoke all on function public._elim_cascade(jsonb, jsonb, jsonb) from public, anon, authenticated;

-- ── 4. Sanitized public activity row for one applied op (spectator feed) ─────────────────
-- Names / table / bracket location only — no actor, no before/after, no op ids. Uses only
-- event types the installed apps already render, plus 'bracket_corrected' for a cascade.
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

-- Semantic audit label for one applied op (what the TD actually did).
create or replace function public._elim_op_label(p_kind text, p_b jsonb, p_a jsonb)
returns text language sql immutable set search_path = public, pg_temp as $$
  select case
    when p_kind <> 'patch_match' then p_kind
    when coalesce(p_a ->> 'status', 'scheduled') = 'completed' and coalesce(p_b ->> 'status', 'scheduled') <> 'completed' then
      case coalesce(p_a ->> 'result', '') when 'forfeit' then 'forfeit' when 'withdraw' then 'withdraw' else 'set_winner' end
    when coalesce(p_b ->> 'status', 'scheduled') = 'completed' and coalesce(p_a ->> 'status', 'scheduled') = 'completed'
         and ((p_a -> 'winner') is distinct from (p_b -> 'winner') or (p_a -> 'result') is distinct from (p_b -> 'result')) then 'change_result'
    when coalesce(p_b ->> 'status', 'scheduled') = 'completed' and coalesce(p_a ->> 'status', 'scheduled') <> 'completed' then 'reopen'
    when coalesce(p_b ->> 'status', 'scheduled') = 'in_progress' and coalesce(p_a ->> 'status', 'scheduled') = 'scheduled' then 'reset'
    when coalesce(p_b ->> 'status', 'scheduled') = 'scheduled' and coalesce(p_a ->> 'status', 'scheduled') = 'in_progress' then 'start'
    when (p_a -> 'p1Score') is distinct from (p_b -> 'p1Score') or (p_a -> 'p2Score') is distinct from (p_b -> 'p2Score') then 'score'
    when (p_a -> 'tableId') is distinct from (p_b -> 'tableId') then 'table'
    when (p_a ->> 'startedAt') is distinct from (p_b ->> 'startedAt') then 'timer'
    else 'patch_match' end;
$$;
revoke all on function public._elim_op_label(text, jsonb, jsonb) from public, anon, authenticated;

-- ── 5. elim_live_apply: cascade + revision + audit + checkpoints + dry run ───────────────
-- Same body as 20261017120000 (guards) with the additions marked "Recovery". The old
-- 3-argument signature is replaced by one with OPTIONAL trailing parameters, so existing calls
-- {p_tournament_id, p_ops, p_atomic} resolve to it unchanged.
drop function if exists public.elim_live_apply(bigint, jsonb, boolean);

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

  -- Recovery: dry run = the full pipeline, nothing written.
  if coalesce(p_dry_run, false) then
    return jsonb_build_object('dry_run', true, 'revision', v_row.live_revision, 'results', v_results,
      'cascade', jsonb_build_object('reset', v_reset, 'cleared', v_cleared, 'stopped', v_stopped, 'released', v_released));
  end if;

  if v_ok > 0 then
    -- Recovery: one checkpoint (the PRE-call state) per call that contains a destructive op.
    if v_destr then
      v_ckpt := public._elim_checkpoint(p_tournament_id, v_row.live_revision, 'before_correction',
                  'Before change to ' || v_destr_mid, v_destr_mid, false,
                  public._elim_state_slice(v_ls0, false), v_done);
    end if;
    v_ls := jsonb_set(v_ls, '{matchState}', v_ms, true);
    update public.tournaments
    set live_settings = v_ls,
        live_state = v_state,
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
    'cascade', jsonb_build_object('reset', v_reset, 'cleared', v_cleared, 'stopped', v_stopped, 'released', v_released));
end;
$$;

revoke all on function public.elim_live_apply(bigint, jsonb, boolean, bigint, uuid, boolean) from public, anon;
grant execute on function public.elim_live_apply(bigint, jsonb, boolean, bigint, uuid, boolean) to authenticated;
revoke all on function public._elim_has_progress(jsonb) from public, anon, authenticated;
revoke all on function public._elim_state_slice(jsonb, boolean) from public, anon, authenticated;

notify pgrst, 'reload schema';

commit;
