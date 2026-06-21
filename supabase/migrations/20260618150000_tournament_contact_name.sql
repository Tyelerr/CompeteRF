-- supabase/migrations/20260618150000_tournament_contact_name.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Contact name for a tournament (pairs with the existing phone_number). Defaults
-- to the TD's own name in the UI, with a custom option.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.tournaments
  add column if not exists contact_name text;

comment on column public.tournaments.contact_name is
  'Public contact person for the tournament (defaults to the director''s name).';
