-- supabase/migrations/20261016120000_public_referral_terms.sql
--
-- Public, read-only view of the CURRENT referral earning terms, so the Official Giveaway Rules
-- (/legal/giveaway-rules and the in-app rules) and the Refer Friends disclosure always show what
-- giveaway_earning_rules actually pays — no app release when a Super Admin edits Earning Rules.
--
-- get_public_referral_terms() → jsonb, callable by anon + authenticated:
--   referral_rewards_enabled  master switch (false → rewards paused; nothing else is meaningful)
--   referrer_reward           entries to the referrer per successful referral
--   referred_reward           entries to the newly referred user
--   attribution_window_days   days after account creation an invite can still be claimed
--   monthly_referrer_cap      max per-referral referrer credits per calendar month (Arizona time)
--   milestones                [{threshold, bonus}] actually paid, ascending; [] when milestone
--                             bonuses are disabled (bonus 0 rows are skipped by the reward step,
--                             so they are omitted here too)
--
-- Deliberately NOT exposed: velocity_flag_threshold (fraud review), milestones_enabled as a raw
-- flag (folded into milestones), updated_at / updated_by, stats, flags, audit data. The table's
-- RLS is unchanged (Super Admin only); this function returns only the fields above.
--
-- Additive only: no table, policy, trigger or existing function is changed.

create or replace function public.get_public_referral_terms()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'referral_rewards_enabled', rr.referral_rewards_enabled,
    'referrer_reward',          rr.referrer_reward,
    'referred_reward',          rr.referred_reward,
    'attribution_window_days',  rr.attribution_window_days,
    'monthly_referrer_cap',     rr.monthly_referrer_cap,
    'milestones', case
      when rr.milestones_enabled then coalesce((
        select jsonb_agg(jsonb_build_object('threshold', (m->>'threshold')::numeric::int,
                                            'bonus',     (m->>'bonus')::numeric::int)
                         order by (m->>'threshold')::numeric)
          from jsonb_array_elements(rr.milestones) m
         where (m->>'bonus')::numeric > 0), '[]'::jsonb)
      else '[]'::jsonb
    end)
  from public.giveaway_earning_rules rr
  where rr.id;
$$;

revoke all on function public.get_public_referral_terms() from public;
grant execute on function public.get_public_referral_terms() to anon, authenticated;

comment on function public.get_public_referral_terms() is
  'Public referral earning terms for the Official Giveaway Rules (no review/admin/audit fields).';
