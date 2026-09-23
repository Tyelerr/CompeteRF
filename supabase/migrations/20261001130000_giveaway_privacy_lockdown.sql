-- supabase/migrations/20261001130000_giveaway_privacy_lockdown.sql
--
-- Giveaway privacy hardening — G2 (LOCKDOWN).
--
-- PREREQUISITES (in order):
--   1. 20261001120000_giveaway_privacy_additive.sql (G1) applied.
--   2. Web client deployed that reads counts via get_giveaway_entry_counts() instead of
--      COUNTing giveaway_entries rows. (Native store builds without that client will show
--      only the viewer's own entry in the counts until a new native build ships.)
--
-- Closes: anon / any user reading every entrant's name_as_on_id, birthday, email, phone,
-- consent flags and user_id via `"Anyone can view entries" FOR SELECT USING (true)`.
--
-- Resulting giveaway_entries read model:
--   anon                → no table access at all (counts via get_giveaway_entry_counts only)
--   authenticated user  → own rows only   ("Users can view own entries")
--   giveaway admin      → all rows        ("Giveaway admins can view all entries", G1)
--
-- Grants: RLS already denies every write removed below (no anon policy allows them, and
-- TRUNCATE/TRIGGER/REFERENCES are never used by the app), so the grant section is pure defense
-- in depth with zero behavior change. anon keeps SELECT on `giveaways` (public page) and on
-- `giveaway_draws` (unused, 0 rows; public-read policy left as-is).

-- ── giveaway_entries: policies ───────────────────────────────────────────────────────────────
drop policy if exists "Anyone can view entries" on public.giveaway_entries;
-- Exact duplicate of "Users can view own entries" (same USING), just scoped to {public}.
drop policy if exists "Users can view own giveaway entries" on public.giveaway_entries;

-- ── giveaway_entries: grants ─────────────────────────────────────────────────────────────────
revoke all on table public.giveaway_entries from anon;
revoke update, delete, truncate, references, trigger on table public.giveaway_entries from authenticated;
-- authenticated keeps SELECT (RLS: own rows / admin) and INSERT (RLS: own user_id).

-- ── giveaway_winner_history: grants (RLS: super_admin-only ALL policy, no public read) ───────
revoke all on table public.giveaway_winner_history from anon;
revoke truncate, references, trigger on table public.giveaway_winner_history from authenticated;

-- ── giveaway_draws: grants (unused table; keep public SELECT, remove client writes) ─────────
revoke insert, update, delete, truncate, references, trigger on table public.giveaway_draws from anon, authenticated;

-- ── giveaways: grants (anon keeps SELECT for the public page) ────────────────────────────────
revoke insert, update, delete, truncate, references, trigger on table public.giveaways from anon;
revoke truncate, references, trigger on table public.giveaways from authenticated;
