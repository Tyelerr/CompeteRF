-- 20260910150000_chip_payouts_paid_rollback.sql
-- Standalone DOWN for 20260910150000_chip_payouts_paid.sql.
-- Restores the (public) live_settings.payoutsPaid map from the manager-only table, then
-- drops the table. NOTE: this RE-EXPOSES payment status publicly — revert only if intended.

update public.tournaments t
set live_settings = coalesce(t.live_settings, '{}'::jsonb) || jsonb_build_object(
  'payoutsPaid',
  (select coalesce(jsonb_object_agg(p.payout_key, true), '{}'::jsonb)
   from public.chip_payouts_paid p
   where p.tournament_id = t.id and p.paid)
)
where exists (select 1 from public.chip_payouts_paid p where p.tournament_id = t.id);

drop table if exists public.chip_payouts_paid;
