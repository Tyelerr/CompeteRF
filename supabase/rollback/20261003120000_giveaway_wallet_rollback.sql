-- supabase/rollback/20261003120000_giveaway_wallet_rollback.sql
--
-- Reverts 20261003120000_giveaway_wallet.sql to the exact pre-wallet production state
-- (policy bodies verbatim from prod pg_policies, count RPC verbatim from G1).
--
-- ⚠ DESTROYS all wallet balances, the credit ledger, wallet-giveaway quantities and wallet draw
-- audit rows. Before running: export giveaway_wallets, giveaway_credit_ledger, giveaway_draws and
-- every wallet giveaway's entries. Wallet giveaways themselves remain as rows but lose their mode
-- (they would read as legacy). The status constraint restore FAILS while any giveaway is
-- 'cancelled' or 'draft' — resolve those rows (e.g. to 'archived') first, deliberately.
-- Revert the client (wallet UI / RPC calls) before or together with this.

-- ── functions & triggers ───────────────────────────────────────────────────────────────────
drop trigger if exists giveaways_guard on public.giveaways;
drop trigger if exists giveaway_entries_guard on public.giveaway_entries;
drop function if exists public.tg_giveaways_guard();
drop function if exists public.tg_giveaway_entries_guard();
drop function if exists public.publish_giveaway(integer);
drop function if exists public.cancel_wallet_giveaway(integer, text);
drop function if exists public.draw_wallet_giveaway(integer, text);
drop function if exists public.enter_wallet_giveaway(integer, integer, uuid, jsonb);
drop function if exists public.admin_revoke_giveaway_entries(bigint, integer, text, text);
drop function if exists public.admin_grant_giveaway_entries(bigint, integer, text, text);
drop function if exists public.get_my_giveaway_balance();
drop function if exists public._giveaway_balance_of(bigint);
drop function if exists public._giveaway_wallet_apply(bigint, integer, text, integer, bigint, text, bigint, text);
drop function if exists public._giveaway_op();

-- ── counts RPC back to G1 (COUNT of rows) ──────────────────────────────────────────────────
create or replace function public.get_giveaway_entry_counts(p_giveaway_ids integer[] default null)
returns table (giveaway_id integer, entry_count bigint)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select g.id, count(e.id)
  from public.giveaways g
  left join public.giveaway_entries e on e.giveaway_id = g.id
  where (p_giveaway_ids is null or g.id = any (p_giveaway_ids))
    and (g.status in ('active', 'ended', 'awarded') or public._giveaway_is_admin())
  group by g.id
$$;

-- ── policies back to pre-wallet (verbatim) ─────────────────────────────────────────────────
drop policy if exists "Users can insert own legacy giveaway entries" on public.giveaway_entries;
create policy "Users can insert own giveaway entries" on public.giveaway_entries as permissive for insert to public
  with check ((user_id = ( SELECT profiles.id_auto
   FROM profiles
  WHERE (profiles.id = auth.uid()))));

drop policy if exists "Giveaway admins can view giveaway draws" on public.giveaway_draws;
create policy "Anyone can view giveaway draws" on public.giveaway_draws as permissive for select to public
  using (true);
grant select on table public.giveaway_draws to anon;

-- ── tables & columns ───────────────────────────────────────────────────────────────────────
drop table if exists public.giveaway_credit_ledger;
drop table if exists public.giveaway_wallets;

alter table public.giveaway_draws
  drop column if exists pool_hash,
  drop column if exists winning_ticket,
  drop column if exists total_tickets,
  drop column if exists entry_id;

alter table public.giveaway_entries drop column if exists quantity;

alter table public.giveaways drop constraint if exists giveaways_status_check;
alter table public.giveaways add constraint giveaways_status_check
  check ((status = any (array['active'::text, 'ended'::text, 'awarded'::text, 'archived'::text])));
alter table public.giveaways alter column status set default 'active'::text;
alter table public.giveaways
  drop column if exists published_at,
  drop column if exists cancel_reason,
  drop column if exists cancelled_by,
  drop column if exists cancelled_at,
  drop column if exists per_user_max,
  drop column if exists entry_mode;
