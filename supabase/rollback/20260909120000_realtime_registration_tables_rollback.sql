-- 20260909120000_realtime_registration_tables_rollback.sql
-- Standalone DOWN for 20260909120000_realtime_registration_tables.sql.
-- NOT a migration — run manually only if the registration Realtime feature must be
-- reverted. Wrap in a transaction (begin; ... commit;) if you want it atomic.
--
-- OWNERSHIP (important): the forward migration added the three tables with `if not
-- exists` guards, so it only introduced memberships that were absent. Evidence that this
-- migration OWNS all three: no earlier migration references `supabase_realtime`, and the
-- codebase had no Realtime subscribers before this feature — so none of these tables were
-- in the publication beforehand. This rollback therefore removes all three (guarded so a
-- missing membership is a no-op). If in your environment one of these tables was already
-- in `supabase_realtime` before this migration, DELETE that table's block below so its
-- pre-existing membership is preserved (do not blindly drop it).
--
-- Replica identity: only tournament_teams and tournament_team_members were changed by the
-- forward migration (to FULL); their prior state was DEFAULT. tournament_players was left
-- at DEFAULT and is not touched here.

-- ── Publication membership (guarded — drop only if present) ──────────────────────
do $$
begin
  if exists (select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='tournament_team_members') then
    alter publication supabase_realtime drop table public.tournament_team_members;
  end if;

  if exists (select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='tournament_teams') then
    alter publication supabase_realtime drop table public.tournament_teams;
  end if;

  if exists (select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='tournament_players') then
    alter publication supabase_realtime drop table public.tournament_players;
  end if;
end $$;

-- ── Replica identity (restore prior/default; only the two tables the forward changed) ──
alter table public.tournament_team_members replica identity default;
alter table public.tournament_teams replica identity default;
