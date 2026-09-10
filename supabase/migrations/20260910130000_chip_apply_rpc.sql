-- Phase G (G3) — transactional chip state apply with optimistic concurrency (audit items
-- 41/42/43/22). Single authoritative, atomic, server-authorized mutation path that
-- REPLACES the client's blind whole-blob multi-request save.
--
-- Behavior:
--   * AUTHORIZE via the authoritative can_manage_tournament gate (same as every
--     registration/team RPC) — SECURITY DEFINER, so it is the only trusted write path.
--   * TRUSTED ACTOR: audit actor_id is taken from the server auth context (auth.uid() ->
--     profiles.id_auto), NOT from client-supplied values (item 22).
--   * OPTIMISTIC CONCURRENCY (item 41): locks chip_config, compares chip_config.version to
--     the caller's p_expected_version. On mismatch it returns {ok:false, conflict:true,
--     version:<current>} and writes NOTHING (the client must reload + notify — no replay).
--   * ATOMIC (item 42): the whole apply runs in this function's single transaction —
--     all-or-nothing. No partial writes.
--   * NO PRUNE RACE (item 43): engine rows are replaced (delete+insert) under the version
--     gate, so a stale client is rejected before it can delete another director's rows.
--
-- Config: only ENGINE-owned columns are written; settings columns (format is set only on
-- first insert; tiers/performance_tracking/etc. are left untouched on update).
-- chip_events: append-only (insert missing by id), actor_id stamped from the trusted actor.
--
-- This is the STRICT-CAS path. The client keeps it behind an OFF feature flag until you
-- apply this migration and verify it; the legacy whole-blob save remains the default.
--
-- ROLLBACK: supabase/rollback/20260910130000_chip_apply_rpc_rollback.sql

create or replace function public.chip_apply(
  p_tid bigint,
  p_expected_version bigint,
  p_config jsonb,
  p_entries jsonb,
  p_matches jsonb,
  p_tables jsonb,
  p_events jsonb
) returns jsonb
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  v_cur   bigint;
  v_next  bigint;
  v_actor bigint;
begin
  if not public.can_manage_tournament(p_tid) then
    raise exception 'not authorized to manage tournament %', p_tid using errcode = '42501';
  end if;

  select id_auto into v_actor from public.profiles where id = auth.uid();

  -- Lock + CAS. Reject stale writes cleanly, before any mutation.
  select version into v_cur from public.chip_config where tournament_id = p_tid for update;
  v_cur := coalesce(v_cur, 0);
  if p_expected_version is not null and v_cur is distinct from p_expected_version then
    return jsonb_build_object('ok', false, 'conflict', true, 'version', v_cur);
  end if;
  v_next := v_cur + 1;

  -- Config: engine-owned fields + version bump. On an existing row the settings columns
  -- (format/tiers/performance_tracking/…) are NOT listed, so they are preserved.
  insert into public.chip_config as cc (
    tournament_id, format, queue, started_at, finished_at, winner_entry_id,
    reshuffle_count, reshuffle_pending, reshuffle_table_count,
    shuffle_mode, shuffle_ready, shuffle_round, round_remaining, restore_points,
    reshuffle_removing_ids, version, updated_at
  ) values (
    p_tid,
    coalesce(p_config->>'format', 'singles'),
    coalesce(p_config->'queue', '[]'::jsonb),
    (p_config->>'started_at')::timestamptz,
    (p_config->>'finished_at')::timestamptz,
    p_config->>'winner_entry_id',
    coalesce((p_config->>'reshuffle_count')::int, 0),
    coalesce((p_config->>'reshuffle_pending')::boolean, false),
    (p_config->>'reshuffle_table_count')::int,
    coalesce((p_config->>'shuffle_mode')::boolean, false),
    coalesce((p_config->>'shuffle_ready')::boolean, false),
    coalesce((p_config->>'shuffle_round')::boolean, false),
    coalesce(p_config->'round_remaining', '[]'::jsonb),
    coalesce(p_config->'restore_points', '[]'::jsonb),
    coalesce(p_config->'reshuffle_removing_ids', '[]'::jsonb),
    v_next, now()
  )
  on conflict (tournament_id) do update set
    queue                  = excluded.queue,
    started_at             = excluded.started_at,
    finished_at            = excluded.finished_at,
    winner_entry_id        = excluded.winner_entry_id,
    reshuffle_count        = excluded.reshuffle_count,
    reshuffle_pending      = excluded.reshuffle_pending,
    reshuffle_table_count  = excluded.reshuffle_table_count,
    shuffle_mode           = excluded.shuffle_mode,
    shuffle_ready          = excluded.shuffle_ready,
    shuffle_round          = excluded.shuffle_round,
    round_remaining        = excluded.round_remaining,
    restore_points         = excluded.restore_points,
    reshuffle_removing_ids = excluded.reshuffle_removing_ids,
    version                = v_next,
    updated_at             = now();

  -- Engine rows: replace the owned set atomically (safe under CAS).
  delete from public.chip_entries where tournament_id = p_tid;
  if jsonb_typeof(p_entries) = 'array' then
    insert into public.chip_entries
      select * from jsonb_populate_recordset(null::public.chip_entries, p_entries);
  end if;

  delete from public.chip_matches where tournament_id = p_tid;
  if jsonb_typeof(p_matches) = 'array' then
    insert into public.chip_matches
      select * from jsonb_populate_recordset(null::public.chip_matches, p_matches);
  end if;

  delete from public.chip_tables where tournament_id = p_tid;
  if jsonb_typeof(p_tables) = 'array' then
    insert into public.chip_tables
      select * from jsonb_populate_recordset(null::public.chip_tables, p_tables);
  end if;

  -- Events: append-only; actor_id stamped from the trusted server actor (item 22).
  if jsonb_typeof(p_events) = 'array' then
    insert into public.chip_events (id, tournament_id, type, text, actor_id, payload, tx_id, superseded, created_at)
      select x.id, x.tournament_id, x.type, x.text, v_actor, x.payload, x.tx_id, x.superseded, x.created_at
      from jsonb_populate_recordset(null::public.chip_events, p_events) x
      on conflict (id) do nothing;
  end if;

  return jsonb_build_object('ok', true, 'conflict', false, 'version', v_next);
end;
$$;

revoke all on function public.chip_apply(bigint, bigint, jsonb, jsonb, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.chip_apply(bigint, bigint, jsonb, jsonb, jsonb, jsonb, jsonb) to authenticated;
