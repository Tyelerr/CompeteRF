-- supabase/pending/20261009120000_chip_public_read_privacy.sql   (HELD — NOT safe until the public iOS build no longer reads chip_config / chip_events directly; move into migrations/ only then)
--
-- Chip public-read privacy. chip_config and chip_events were readable in full by anyone
-- (RLS read policy `true`), exposing restore snapshots (chip_config.restore_points), restore /
-- chip-adjust / Settings-unlock / Fargo-cap-override reasons, and actor names + ids.
--
-- Same architecture as the existing chip_entries_public: owner-rights projection views for
-- public (spectator / player hub) reads, and the base tables readable only by tournament
-- managers (is_chip_manager = can_manage_tournament). Writes are unchanged.
--
--   chip_config_public — every column EXCEPT restore_points (full state snapshots) and version.
--   chip_events_public — the public story only:
--     • TD-only, reason-bearing event types are not exposed at all (chip_adjust, restore, undo,
--       redo, settings_*, fargo_cap_override, player_added, table_added) — the spectator feed
--       never shows them;
--     • actor_id is not exposed; payload.actorName is removed from every row;
--     • payload.reason / payload.notes are removed, EXCEPT on forfeit events (Forfeit Match and
--       Forfeit Tournament), whose reason / notes are designed as PUBLIC audit notes;
--     • private chip-adjust keys (oldChips / newChips / playerState) and restore keys
--       (revertedTitles / restoredTo) are removed defensively.
--
-- Clients read the views when `publicRead` and fall back to the base tables if a view is missing,
-- so the client can ship before or after this migration.
-- Rollback: supabase/rollback/20261009120000_chip_public_read_privacy_rollback.sql

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

-- Base tables: full rows only for the tournament's managers (TD / venue owner / venue director /
-- admins). Scoped TO authenticated: anon has no EXECUTE on is_chip_manager, so a policy that
-- evaluated it for anon would ERROR instead of simply returning no rows — with no anon policy an
-- anonymous base read just returns nothing. Write policies unchanged.
drop policy if exists chip_config_read on public.chip_config;
create policy chip_config_read on public.chip_config
  for select to authenticated using (public.is_chip_manager(tournament_id));

drop policy if exists chip_events_read on public.chip_events;
create policy chip_events_read on public.chip_events
  for select to authenticated using (public.is_chip_manager(tournament_id));

-- The existing FOR ALL write policies (role PUBLIC) also apply to SELECT and would evaluate
-- is_chip_manager for anon → permission error. anon can never be a manager (no auth.uid()), so
-- scoping them to authenticated changes no write behaviour and lets an anonymous base read
-- return no rows cleanly.
alter policy chip_config_write on public.chip_config to authenticated;
alter policy chip_events_write on public.chip_events to authenticated;
