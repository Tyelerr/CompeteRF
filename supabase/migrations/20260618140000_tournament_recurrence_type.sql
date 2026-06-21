-- supabase/migrations/20260618140000_tournament_recurrence_type.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Recurrence frequency on a tournament row.
--
-- is_recurring already marks a tournament as recurring; this stores HOW OFTEN
-- (weekly / biweekly / monthly) so the manager's "Recurring Frequency" picker can
-- round-trip it. (Compete's auto-generated series use tournament_templates; this
-- column lets an external/listed tournament record its frequency directly.)
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.tournaments
  add column if not exists recurrence_type text;

comment on column public.tournaments.recurrence_type is
  'How often a recurring tournament repeats: weekly | biweekly | monthly.';
