-- supabase/migrations/20260707120000_chip_entry_profile_ids.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Link chip registrations to real users. The TD selects an actual player (search
-- by name, disambiguated by player id) so two people with the same name can't be
-- confused. p2 is the scotch-doubles partner.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.chip_entries
  add column if not exists p1_profile_id bigint,
  add column if not exists p2_profile_id bigint;
