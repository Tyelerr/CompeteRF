-- Realtime for the ACTIVE admin roster (Phase B / B1 follow-up).
--
-- Enables Supabase Realtime `postgres_changes` on the three registration tables so the
-- director's Manage → Players roster refreshes cross-device when a registration changes
-- (see src/viewmodels/hooks/use.registration.realtime.ts). The client subscribes ONLY
-- while a director is actively on a tournament's manage screen, scoped by
-- `tournament_id=eq.<id>`; this migration just lets those changes be published.
--
-- Two parts:
--   1) Add the tables to the `supabase_realtime` publication (idempotent — skips a table
--      already present). Nothing is published until a table is in this publication.
--   2) REPLICA IDENTITY FULL on `tournament_teams` and `tournament_team_members` ONLY.
--      The subscription filters on `tournament_id`, which is NOT the primary key. On a
--      DELETE, logical replication carries only the replica-identity columns of the OLD
--      row; with the default identity (primary key) `tournament_id` is absent, so a
--      `tournament_id=eq.<id>` filter cannot match and the DELETE is never delivered.
--      `cancel_team` and `cancel_team_partner` HARD-DELETE from these two tables, and
--      those cancellations are exactly the events the roster must reflect — so FULL is
--      required here. It is NOT applied to `tournament_players`: that table only ever
--      sees INSERTs and soft-cancel UPDATEs (status -> 'cancelled'), never a hard delete,
--      and INSERT/UPDATE carry the full NEW tuple (with `tournament_id`), so the filter
--      already matches with the default replica identity.
--
-- Safe to apply before/independently of the client code: with no subscribers it only
-- marks these tables for logical replication (a small per-write WAL cost — FULL logs the
-- whole old row on UPDATE/DELETE, negligible on these low-volume registration tables).
-- Without it, the client hook is simply inert (no events arrive).
--
-- ROLLBACK (reversible):
--   alter publication supabase_realtime drop table public.tournament_team_members;
--   alter publication supabase_realtime drop table public.tournament_teams;
--   alter publication supabase_realtime drop table public.tournament_players;
--   alter table public.tournament_team_members replica identity default;
--   alter table public.tournament_teams replica identity default;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'tournament_players'
  ) then
    alter publication supabase_realtime add table public.tournament_players;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'tournament_teams'
  ) then
    alter publication supabase_realtime add table public.tournament_teams;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'tournament_team_members'
  ) then
    alter publication supabase_realtime add table public.tournament_team_members;
  end if;
end $$;

-- FULL only where a HARD DELETE is filtered by a non-PK column (see note above).
alter table public.tournament_teams replica identity full;
alter table public.tournament_team_members replica identity full;
