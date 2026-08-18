-- 20260817120000_chip_entries_fargo_cap_override_rollback.sql
-- Rollback for 20260817120000_chip_entries_fargo_cap_override.sql. Drops the Fargo-cap
-- override columns from all three registration tables. Run by hand only if reverting;
-- revert the app code that reads/writes these columns first.

do $$
declare tbl text;
begin
  foreach tbl in array array['chip_entries', 'tournament_teams', 'tournament_players']
  loop
    execute format($f$
      alter table public.%I
        drop column if exists fargo_cap_override,
        drop column if exists fargo_cap_at_override,
        drop column if exists player_fargo_at_override,
        drop column if exists fargo_cap_override_reason,
        drop column if exists fargo_cap_override_notes,
        drop column if exists overridden_by,
        drop column if exists overridden_at;
    $f$, tbl);
  end loop;
end $$;
