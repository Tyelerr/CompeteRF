-- supabase/migrations/20260618130000_tournament_draft_flag.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Unsaved-draft flag.
--
-- "New Tournament" creates a row immediately so the Manage hub has something to
-- edit, but it shouldn't appear anywhere (Billiards or the TD's tournament list)
-- until the TD actually Saves/Submits. is_draft hides it everywhere; the first
-- save clears it.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.tournaments
  add column if not exists is_draft boolean not null default false;

comment on column public.tournaments.is_draft is
  'True for a brand-new tournament that has not been saved/submitted yet — hidden from all listings until the first save clears it.';
