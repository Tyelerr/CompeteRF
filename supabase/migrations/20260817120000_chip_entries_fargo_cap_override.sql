-- 20260817120000_chip_entries_fargo_cap_override.sql
-- Fargo-cap override for ALL registration surfaces (chip singles, chip/scotch doubles,
-- and self-registered players). tournament.max_fargo is the tournament's Maximum Fargo.
-- Going over it is a SOFT gate: the entry shows a warning and cannot be Ready until the
-- TD explicitly overrides (with a short reason). Maximum Fargo must behave identically
-- regardless of how the player entered, so the SAME columns live on every registration
-- record:
--   • chip_entries        — TD-added singles
--   • tournament_teams    — scotch/doubles teams (cap compared against the team rating,
--                           using the format's existing team-rating logic in app code)
--   • tournament_players  — self-registered / bracket-registered players
--
-- The override is a SNAPSHOT of the rating + cap it was granted for, so it stops covering
-- the entry if either the rating or the tournament max later changes (the TD must
-- re-acknowledge). Under-cap ⇒ ignored. Missing Fargo is a SEPARATE validation issue and
-- is never an over-cap override. over_by is NOT stored (derived:
-- player_fargo_at_override - fargo_cap_at_override) so it can't drift from the snapshot.
--
-- The current override state is readable directly from each record (so the card renders
-- without walking event history); an audit row is still written to chip_events by the
-- app. All columns are written via the existing upserts / RPCs — additive, zero backfill.

-- Reusable column set applied to each table.
do $$
declare tbl text;
begin
  foreach tbl in array array['chip_entries', 'tournament_teams', 'tournament_players']
  loop
    execute format($f$
      alter table public.%I
        add column if not exists fargo_cap_override          boolean not null default false,
        add column if not exists fargo_cap_at_override        integer,     -- tournament max at override time
        add column if not exists player_fargo_at_override     integer,     -- rating compared at override time (team rating for doubles)
        add column if not exists fargo_cap_override_reason    text,        -- quick choice: Point Cushion / Local Rule / Rating Adjustment / Other
        add column if not exists fargo_cap_override_notes     text,        -- optional free-text note
        add column if not exists overridden_by                uuid,        -- TD auth user id (auth.uid())
        add column if not exists overridden_at                timestamptz;
    $f$, tbl);
  end loop;
end $$;

comment on column public.chip_entries.fargo_cap_override is
  'TD-approved exception allowing this entry to be Ready despite exceeding tournament.max_fargo. Snapshot: valid only while player_fargo_at_override = current rating AND fargo_cap_at_override = current tournament.max_fargo. Reason = quick choice; notes = optional free text. Audit event also logged to chip_events (type=fargo_cap_override). Same columns exist on tournament_teams and tournament_players.';
