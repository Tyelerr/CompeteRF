-- supabase/migrations/20261009100000_chip_public_views.sql   (PENDING — not applied)
--
-- INTERIM, BACKWARD-COMPATIBLE step of the Chip public-read privacy work: creates ONLY the
-- public projection views. Base-table RLS is NOT changed — chip_config / chip_events stay
-- readable exactly as today, so currently released native apps (which read the base tables
-- directly) are unaffected. New clients (web 514d5a1+) read these views for spectator /
-- player-hub loads and stop falling back to the base tables.
--
--   chip_config_public — every column EXCEPT restore_points (full state snapshots) and version.
--   chip_events_public — no actor_id; payload.actorName removed; reason / notes removed except
--     on forfeits (public audit notes by design); TD-only event types excluded.
--
-- Owner-rights views (like chip_entries_public). They expose a strict subset of what the base
-- tables already expose publicly today — no new data becomes readable.
-- Identical definitions to 20261009120000 (create or replace), which later tightens base RLS.
-- Rollback: supabase/rollback/20261009100000_chip_public_views_rollback.sql

create or replace view public.chip_config_public as
select
  tournament_id, format, performance_tracking, stream_enabled, winner_stays, auto_eliminate,
  tiers, queue, started_at, finished_at, winner_entry_id, reshuffle_count, updated_at,
  buy_backs_allowed, shuffle_mode, shuffle_ready, reshuffle_pending, reshuffle_table_count,
  shuffle_round, played_round_ids, round_remaining, reshuffle_removing_ids
from public.chip_config;

create or replace view public.chip_events_public as
select
  e.id,
  e.tournament_id,
  e.type,
  e.text,
  case
    when e.type = 'forfeit'
      or (e.type = 'elimination' and e.payload ->> 'act' = 'forfeit_tournament')
      then coalesce(e.payload, '{}'::jsonb) - 'actorName'
    else coalesce(e.payload, '{}'::jsonb)
      - 'actorName' - 'reason' - 'notes'
      - 'oldChips' - 'newChips' - 'playerState'
      - 'revertedTitles' - 'restoredTo'
  end as payload,
  e.created_at,
  e.superseded,
  e.tx_id
from public.chip_events e
where e.type not in (
  'chip_adjust', 'restore', 'undo', 'redo',
  'settings_unlocked', 'settings_relocked_no_save', 'settings_updated_locked',
  'fargo_cap_override', 'player_added', 'table_added'
);

revoke all on public.chip_config_public from public;
revoke all on public.chip_events_public from public;
grant select on public.chip_config_public to anon, authenticated;
grant select on public.chip_events_public to anon, authenticated;
