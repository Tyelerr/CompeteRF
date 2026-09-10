-- Phase G (G5) — move payout paid/unpaid state to a MANAGER-ONLY store (audit item 29
-- hardening + G-37). Today it lives in tournaments.live_settings.payoutsPaid, which is
-- PUBLICLY readable — so spectators could read physical payment status. This creates a
-- manager-only table, migrates the existing state, and strips the public copy.
--
--   * chip_payouts_paid keyed by (tournament_id, payout_key) where payout_key is
--     "entry:<place>" or "sidepot:<name>:<place>" (same keys the client already uses).
--   * RLS: SELECT + write gated by is_chip_manager — NOT public, NOT anon. Spectators can
--     never read paid/unpaid status.
--   * Data migration: copy every truthy live_settings.payoutsPaid key into the table, then
--     remove the payoutsPaid key from live_settings (the public copy). Idempotent.
--
-- The client (chipService) reads/writes this table with a resilient fallback to
-- live_settings, so it works whether or not this migration has been applied.
--
-- ROLLBACK: supabase/rollback/20260910150000_chip_payouts_paid_rollback.sql

create table if not exists public.chip_payouts_paid (
  tournament_id bigint not null references public.tournaments(id) on delete cascade,
  payout_key    text   not null,
  paid          boolean not null default true,
  paid_at       timestamptz not null default now(),
  paid_by       bigint,
  primary key (tournament_id, payout_key)
);

alter table public.chip_payouts_paid enable row level security;

-- Manager-only read (spectators must never see payment status).
drop policy if exists chip_payouts_paid_read on public.chip_payouts_paid;
create policy chip_payouts_paid_read on public.chip_payouts_paid
  for select using (public.is_chip_manager(tournament_id));

-- Manager-only write.
drop policy if exists chip_payouts_paid_write on public.chip_payouts_paid;
create policy chip_payouts_paid_write on public.chip_payouts_paid
  for all
  using (public.is_chip_manager(tournament_id))
  with check (public.is_chip_manager(tournament_id));

revoke all on public.chip_payouts_paid from public, anon;
grant select, insert, update, delete on public.chip_payouts_paid to authenticated;

-- Migrate existing paid-state out of the PUBLIC live_settings.payoutsPaid (truthy keys).
insert into public.chip_payouts_paid (tournament_id, payout_key, paid)
select t.id, kv.key, true
from public.tournaments t
cross join lateral jsonb_each(coalesce(t.live_settings->'payoutsPaid', '{}'::jsonb)) as kv(key, value)
where kv.value = 'true'::jsonb
on conflict (tournament_id, payout_key) do nothing;

-- Remove the now-migrated public copy so payment status is no longer publicly readable.
update public.tournaments
set live_settings = live_settings - 'payoutsPaid'
where live_settings ? 'payoutsPaid';
