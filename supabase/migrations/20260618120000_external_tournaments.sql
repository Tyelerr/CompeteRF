-- supabase/migrations/20260618120000_external_tournaments.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- "Other Software" tournaments.
--
-- A tournament is either run on Compete's live bracket engine (the default) or
-- managed in external software and merely LISTED here with a link to the
-- external bracket. bracket_source distinguishes the two; external tournaments
-- use external_bracket_url for the "View Bracket" link and get only a basic
-- manager (no players/bracket/queue/results).
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.tournaments
  add column if not exists bracket_source text not null default 'compete'
    check (bracket_source in ('compete', 'external')),
  add column if not exists external_bracket_url text;

comment on column public.tournaments.bracket_source is
  '''compete'' = run on the Compete live engine; ''external'' = run in other software, listed only.';
comment on column public.tournaments.external_bracket_url is
  'For external tournaments: the URL the "View Bracket" button opens.';
