-- supabase/rollback/20261001120000_giveaway_privacy_additive_rollback.sql
--
-- Reverts 20261001120000_giveaway_privacy_additive.sql (G1).
--
-- ⚠ Only safe if (a) G2 is NOT applied (or has been rolled back first), and (b) no deployed client
-- calls get_giveaway_entry_counts() — otherwise the Giveaways page loses its entry counts.
-- Order: G2 rollback → revert client → this file.

drop policy if exists "Giveaway admins can view all entries" on public.giveaway_entries;
drop function if exists public.get_giveaway_entry_counts(integer[]);
drop function if exists public._giveaway_is_admin();
