-- Phase G (G4) — participant-model backfill for historical Chip SINGLES (audit items
-- 36/38). ADDITIVE + IDEMPOTENT + skip-ambiguous. Creates the missing tournament_players
-- participation rows for completed Chip singles that have a reliable identity, so they
-- reappear in completed history / results / reviews. NEVER fabricates data.
--
-- SCOPE (safety): only COMPLETED chip tournaments (t.status='completed' OR
-- live_state='finished'); live tournaments are untouched. Only SINGLES chip entries
-- (chip_config.format='singles' and the entry carries no p2 identity). Teams keep their
-- tournament_teams/_members participation model (rule 4) — never backfilled here.
--
-- RECONSTRUCTION RULES (as directed):
--   * Reliable identity required: p1_player_id (→ tournament_players.player_uuid) and/or
--     p1_profile_id (→ tournament_players.player_id). Name-only entries are SKIPPED (rule 3).
--   * status = 'checked_in' (there is NO 'eliminated' status; elimination is represented
--     by eliminated_at only — rule 6).
--   * paid_entry ← chip entry paid; paid_side_pots ← chip membership (text[] → jsonb);
--     fargo_rating ← chip Fargo snapshot; eliminated_at ← chip_entries.eliminated_at (or
--     NULL, never fabricated); checked_in_at left NULL (no trustworthy historical value).
--   * Honors BOTH partial unique indexes ((tournament_id,player_id) and
--     (tournament_id,player_uuid)); an entry already represented by either — or that would
--     conflict with an existing row on either key — is SKIPPED (NOT EXISTS), never
--     overwritten (rule 7).
--
-- IDEMPOTENT: re-running inserts nothing new (the NOT EXISTS guard already matches the
-- rows created on the first run). Every inserted id is recorded in
-- chip_participant_backfill_log so the rollback can remove EXACTLY these rows and nothing
-- legitimate.
--
-- NOTE on fargo_at_registration (rule 5): it is not confirmed present in the live schema,
-- so it is intentionally OMITTED to keep this migration from failing on a missing column.
-- If your tournament_players has a `fargo_at_registration` column and you want it set, add
-- `fargo_at_registration` to the INSERT column list and `e.p1_fargo` to the SELECT.
--
-- Run the DRY-RUN / report queries at the bottom of this file BEFORE applying to preview
-- exactly what will be backfilled vs skipped.
--
-- ROLLBACK: supabase/rollback/20260910140000_chip_participant_backfill_rollback.sql

create table if not exists public.chip_participant_backfill_log (
  tournament_player_id bigint primary key,
  tournament_id        bigint,
  backfilled_at        timestamptz not null default now()
);

with ins as (
  insert into public.tournament_players (
    tournament_id, player_uuid, player_id, status,
    paid_entry, paid_side_pots, fargo_rating, eliminated_at
  )
  select
    e.tournament_id,
    e.p1_player_id,
    e.p1_profile_id,
    'checked_in',
    coalesce(e.paid, false),
    to_jsonb(coalesce(e.paid_side_pots, '{}'::text[])),
    e.p1_fargo,
    e.eliminated_at
  from public.chip_entries e
  join public.chip_config cc on cc.tournament_id = e.tournament_id
  join public.tournaments  t on t.id = e.tournament_id
  where (t.status = 'completed' or t.live_state = 'finished')
    and cc.format = 'singles'
    and e.p2_player_id is null
    and e.p2_profile_id is null
    and (e.p2_name is null or e.p2_name = '')
    and (e.p1_player_id is not null or e.p1_profile_id is not null)
    and not exists (
      select 1 from public.tournament_players tp
      where tp.tournament_id = e.tournament_id
        and (
          (e.p1_player_id  is not null and tp.player_uuid = e.p1_player_id)
          or (e.p1_profile_id is not null and tp.player_id  = e.p1_profile_id)
        )
    )
  returning id, tournament_id
)
insert into public.chip_participant_backfill_log (tournament_player_id, tournament_id)
select id, tournament_id from ins
on conflict (tournament_player_id) do nothing;

-- ============================================================================
-- DRY-RUN / REPORT QUERIES (run manually; do not require the migration to run)
-- ============================================================================
-- (a) ELIGIBLE — would be backfilled:
-- select count(*) as eligible
-- from public.chip_entries e
-- join public.chip_config cc on cc.tournament_id = e.tournament_id
-- join public.tournaments  t on t.id = e.tournament_id
-- where (t.status='completed' or t.live_state='finished') and cc.format='singles'
--   and e.p2_player_id is null and e.p2_profile_id is null and (e.p2_name is null or e.p2_name='')
--   and (e.p1_player_id is not null or e.p1_profile_id is not null)
--   and not exists (select 1 from public.tournament_players tp
--     where tp.tournament_id=e.tournament_id
--       and ((e.p1_player_id is not null and tp.player_uuid=e.p1_player_id)
--         or (e.p1_profile_id is not null and tp.player_id=e.p1_profile_id)));
--
-- (b) ALREADY REPRESENTED — has identity, matched by an existing row (consistent):
-- select count(*) as already_represented
-- from public.chip_entries e join public.chip_config cc on cc.tournament_id=e.tournament_id
-- join public.tournaments t on t.id=e.tournament_id
-- where (t.status='completed' or t.live_state='finished') and cc.format='singles'
--   and e.p2_player_id is null and e.p2_profile_id is null and (e.p2_name is null or e.p2_name='')
--   and (e.p1_player_id is not null or e.p1_profile_id is not null)
--   and exists (select 1 from public.tournament_players tp
--     where tp.tournament_id=e.tournament_id
--       and ((e.p1_player_id is not null and tp.player_uuid=e.p1_player_id)
--         or (e.p1_profile_id is not null and tp.player_id=e.p1_profile_id)));
--
-- (c) SKIPPED — name-only (no reliable identity):
-- select count(*) as skipped_name_only
-- from public.chip_entries e join public.chip_config cc on cc.tournament_id=e.tournament_id
-- join public.tournaments t on t.id=e.tournament_id
-- where (t.status='completed' or t.live_state='finished') and cc.format='singles'
--   and e.p2_player_id is null and e.p2_profile_id is null and (e.p2_name is null or e.p2_name='')
--   and e.p1_player_id is null and e.p1_profile_id is null
--   and coalesce(e.p1_name,'') <> '';
--
-- (d) SKIPPED — identity conflict (both ids present; an existing row matches one key but
--     contradicts the other → not overwritten):
-- select count(*) as skipped_identity_conflict
-- from public.chip_entries e join public.chip_config cc on cc.tournament_id=e.tournament_id
-- join public.tournaments t on t.id=e.tournament_id
-- where (t.status='completed' or t.live_state='finished') and cc.format='singles'
--   and e.p1_player_id is not null and e.p1_profile_id is not null
--   and exists (select 1 from public.tournament_players tp
--     where tp.tournament_id=e.tournament_id
--       and ((tp.player_uuid=e.p1_player_id and tp.player_id is distinct from e.p1_profile_id)
--         or (tp.player_id=e.p1_profile_id and tp.player_uuid is distinct from e.p1_player_id)));
--
-- (e) SUCCESSFULLY BACKFILLED (after applying):
-- select count(*) as backfilled from public.chip_participant_backfill_log;
