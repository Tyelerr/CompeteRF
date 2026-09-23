-- supabase/rollback/20261001130000_giveaway_privacy_lockdown_rollback.sql
--
-- Reverts 20261001130000_giveaway_privacy_lockdown.sql (G2) to the EXACT pre-G2 production state.
-- Restored policy bodies are verbatim from prod pg_policies (captured 2026-09-23); grants restore
-- the pre-G2 `GRANT ALL` to anon/authenticated on all four giveaway tables.
--
-- ⚠ EMERGENCY USE ONLY: this RE-EXPOSES every entrant's name/email/phone/birthday to anon.
-- Prefer a forward fix (e.g. widen _giveaway_is_admin or add a narrower policy). G1 objects are
-- intentionally NOT removed here — the updated client calls get_giveaway_entry_counts().

-- ── giveaway_entries: restored policies (verbatim) ───────────────────────────────────────────
drop policy if exists "Anyone can view entries" on public.giveaway_entries;
create policy "Anyone can view entries" on public.giveaway_entries as permissive for select to public
  using (true);

drop policy if exists "Users can view own giveaway entries" on public.giveaway_entries;
create policy "Users can view own giveaway entries" on public.giveaway_entries as permissive for select to public
  using ((user_id = ( SELECT profiles.id_auto
   FROM profiles
  WHERE (profiles.id = auth.uid()))));

-- ── restored grants ──────────────────────────────────────────────────────────────────────────
grant all on table public.giveaway_entries        to anon, authenticated;
grant all on table public.giveaway_winner_history to anon, authenticated;
grant all on table public.giveaway_draws          to anon, authenticated;
grant all on table public.giveaways               to anon, authenticated;
