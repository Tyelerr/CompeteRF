-- supabase/pending/20261003120000_giveaway_wallet.sql   (PENDING — not applied)
--
-- Giveaway Entries wallet — Phase 1: wallet + ledger, admin grant/revoke, wallet giveaways with
-- per-user caps, server-side weighted draw, cancel-with-refund. NO earning mechanics (Daily
-- Entry / referral rewards) — those come later on top of this ledger.
--
-- GRANDFATHERING: every existing giveaway becomes entry_mode = 'legacy_single' and every existing
-- entry quantity = 1 (column defaults — no row rewrite of any other column). Legacy giveaways keep
-- exactly today's behavior: one free entry per user via the existing entry form, counted per row,
-- drawn by the existing admin client flow. Wallet rules only apply to giveaways created with
-- entry_mode = 'wallet'.
--
-- Privacy (G1/G2) is preserved: giveaway_entries stays unreadable to anon; counts stay aggregate-only
-- via get_giveaway_entry_counts (now SUM(quantity), identical for legacy since quantity = 1).
--
-- Every balance / quantity / wallet-winner mutation goes through a SECURITY DEFINER function.
-- Direct writes are blocked by grants, RLS and guard triggers (a transaction-local flag that only
-- these functions set: compete.giveaway_op).

-- ════════════════════════════════════════════════════════════════════════════════════════════
-- 1. giveaways: entry mode, per-user cap, cancellation
-- ════════════════════════════════════════════════════════════════════════════════════════════
alter table public.giveaways
  add column entry_mode    text not null default 'legacy_single',
  add column per_user_max  integer,
  add column cancelled_at  timestamptz,
  add column cancelled_by  bigint references public.profiles (id_auto) on delete set null,
  add column cancel_reason text;

alter table public.giveaways
  add constraint giveaways_entry_mode_check check (entry_mode in ('legacy_single', 'wallet')),
  add constraint giveaways_per_user_max_check check (per_user_max is null or per_user_max > 0),
  add constraint giveaways_per_user_max_wallet_only check (per_user_max is null or entry_mode = 'wallet'),
  -- A wallet giveaway always has a total capacity and an explicit per-user maximum
  -- (no silent "blank = unlimited"; a future explicit No Limit option would be its own change).
  add constraint giveaways_wallet_capacity check (entry_mode <> 'wallet' or coalesce(max_entries, 0) > 0),
  add constraint giveaways_wallet_per_user_max_required check (entry_mode <> 'wallet' or per_user_max is not null);

alter table public.giveaways drop constraint giveaways_status_check;
alter table public.giveaways add constraint giveaways_status_check
  check (status = any (array['draft', 'active', 'ended', 'awarded', 'archived', 'cancelled']));

-- ── Draft → Publish lifecycle ──────────────────────────────────────────────────────────────
-- New giveaways are created as 'draft' (hidden from the public list/counts by the existing
-- public-read policy, which only exposes active/ended/awarded). publish_giveaway() is the only
-- way from draft to active; published_at records it (and lets Restore tell a published giveaway
-- from an archived never-published draft). Every existing giveaway was live → backfilled to its
-- created_at. (New column only; no pre-existing column is touched. Runs before the guard trigger.)
alter table public.giveaways add column published_at timestamptz;
update public.giveaways set published_at = created_at where status <> 'draft';
-- A bare insert now lands as a draft (the app always sets status explicitly; this is the safe default).
alter table public.giveaways alter column status set default 'draft';

-- ════════════════════════════════════════════════════════════════════════════════════════════
-- 2. giveaway_entries: quantity (draw entries owned). Legacy rows are always 1.
-- ════════════════════════════════════════════════════════════════════════════════════════════
alter table public.giveaway_entries
  add column quantity integer not null default 1,
  add constraint giveaway_entries_quantity_check check (quantity >= 1);

-- ════════════════════════════════════════════════════════════════════════════════════════════
-- 3. Wallet + ledger
-- ════════════════════════════════════════════════════════════════════════════════════════════
create table public.giveaway_wallets (
  profile_id bigint primary key references public.profiles (id_auto) on delete cascade,
  balance    integer not null default 0,
  updated_at timestamptz not null default now(),
  constraint giveaway_wallets_balance_nonnegative check (balance >= 0)
);

create table public.giveaway_credit_ledger (
  id              bigint generated always as identity primary key,
  profile_id      bigint not null references public.profiles (id_auto) on delete cascade,
  delta           integer not null,
  balance_after   integer not null,
  reason          text not null,
  giveaway_id     integer references public.giveaways (id) on delete set null,
  referral_id     bigint references public.referrals (id) on delete set null,
  idempotency_key text,
  created_by      bigint references public.profiles (id_auto) on delete set null,
  note            text,
  created_at      timestamptz not null default now(),
  constraint giveaway_credit_ledger_delta_nonzero check (delta <> 0),
  constraint giveaway_credit_ledger_balance_after_nonnegative check (balance_after >= 0),
  -- Earning reasons (daily_entry, referral_*, promotion) are added with their phases.
  constraint giveaway_credit_ledger_reason_check
    check (reason in ('admin_grant', 'admin_revoke', 'giveaway_spend', 'giveaway_refund'))
);
create unique index giveaway_credit_ledger_idempotency_key
  on public.giveaway_credit_ledger (idempotency_key) where idempotency_key is not null;
create index giveaway_credit_ledger_profile_idx on public.giveaway_credit_ledger (profile_id, created_at desc);
create index giveaway_credit_ledger_giveaway_idx on public.giveaway_credit_ledger (giveaway_id) where giveaway_id is not null;

-- ════════════════════════════════════════════════════════════════════════════════════════════
-- 4. giveaway_draws (previously unused, 0 rows): audit record for server-side wallet draws
-- ════════════════════════════════════════════════════════════════════════════════════════════
alter table public.giveaway_draws
  add column entry_id       integer references public.giveaway_entries (id) on delete set null,
  add column total_tickets  integer,
  add column winning_ticket integer,
  add column pool_hash      text;

-- ════════════════════════════════════════════════════════════════════════════════════════════
-- 5. Access
-- ════════════════════════════════════════════════════════════════════════════════════════════
alter table public.giveaway_wallets       enable row level security;
alter table public.giveaway_credit_ledger enable row level security;

revoke all on table public.giveaway_wallets       from public, anon, authenticated;
revoke all on table public.giveaway_credit_ledger from public, anon, authenticated;
grant select on table public.giveaway_wallets       to authenticated;
grant select on table public.giveaway_credit_ledger to authenticated;

create policy "Users can view own giveaway wallet" on public.giveaway_wallets
  as permissive for select to authenticated using (profile_id = public._authz_my_id_auto());
create policy "Giveaway admins can view wallets" on public.giveaway_wallets
  as permissive for select to authenticated using (public._giveaway_is_admin());
create policy "Users can view own giveaway ledger" on public.giveaway_credit_ledger
  as permissive for select to authenticated using (profile_id = public._authz_my_id_auto());
create policy "Giveaway admins can view ledger" on public.giveaway_credit_ledger
  as permissive for select to authenticated using (public._giveaway_is_admin());

-- Legacy entry path (direct client insert) — tightened, never widened: only into an ACTIVE
-- legacy_single giveaway, only as yourself, only quantity 1. Wallet giveaways are entered solely
-- through enter_wallet_giveaway(). (Replaces the G-era insert policy, which checked user only.)
drop policy if exists "Users can insert own giveaway entries" on public.giveaway_entries;
create policy "Users can insert own legacy giveaway entries" on public.giveaway_entries
  as permissive for insert to authenticated
  with check (
    user_id = public._authz_my_id_auto()
    and quantity = 1
    and exists (select 1 from public.giveaways g
                 where g.id = giveaway_id and g.entry_mode = 'legacy_single' and g.status = 'active')
  );

-- giveaway_draws now carries draw audit data: admin-read only (it had a public-read policy while empty).
drop policy if exists "Anyone can view giveaway draws" on public.giveaway_draws;
revoke all on table public.giveaway_draws from anon;
create policy "Giveaway admins can view giveaway draws" on public.giveaway_draws
  as permissive for select to authenticated using (public._giveaway_is_admin());

-- ════════════════════════════════════════════════════════════════════════════════════════════
-- 6. Guard triggers (defense in depth against direct writes, incl. by admins through the API)
-- ════════════════════════════════════════════════════════════════════════════════════════════
create or replace function public._giveaway_op() returns text
language sql stable set search_path = public, pg_temp
as $$ select coalesce(nullif(current_setting('compete.giveaway_op', true), ''), '') $$;

-- Entries: legacy rows stay quantity 1; wallet rows only via enter_wallet_giveaway.
create or replace function public.tg_giveaway_entries_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_mode text;
begin
  select entry_mode into v_mode from public.giveaways where id = new.giveaway_id;
  if v_mode = 'wallet' then
    if public._giveaway_op() <> 'wallet_entry' then
      raise exception 'wallet giveaway entries can only be created through enter_wallet_giveaway'
        using errcode = '42501';
    end if;
  elsif new.quantity <> 1 then
    raise exception 'legacy giveaway entries always have quantity 1' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' and (new.giveaway_id <> old.giveaway_id or new.user_id <> old.user_id) then
    raise exception 'giveaway entries cannot be moved' using errcode = '42501';
  end if;
  return new;
end
$$;
revoke all on function public.tg_giveaway_entries_guard() from public, anon, authenticated;

create trigger giveaway_entries_guard
  before insert or update on public.giveaway_entries
  for each row execute function public.tg_giveaway_entries_guard();

-- Giveaways: mode is fixed once entries exist; wallet winners/cancellation only via server
-- functions; wallet caps can't drop below what users already hold; cancelled is terminal.
-- Deliberately permits what existing flows need: clearing winner_id / *_by on account deletion
-- (FK SET NULL + delete_user_account), and Restore of an archived awarded giveaway (same winner).
create or replace function public.tg_giveaways_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_op       text := public._giveaway_op();
  v_sum      bigint;
  v_max_mine integer;
begin
  if tg_op = 'INSERT' then
    if new.status = 'cancelled' then
      raise exception 'giveaways cannot be created cancelled' using errcode = '42501';
    end if;
    -- Wallet giveaways always start as a draft (so the native launch hold in publish_giveaway
    -- can't be skipped by inserting them live).
    if new.entry_mode = 'wallet' and (new.status <> 'draft' or new.winner_id is not null) then
      raise exception 'wallet giveaways must be created as a draft' using errcode = '42501';
    end if;
    -- Older app versions still create legacy giveaways directly as active: stamp them published.
    if new.status = 'active' and new.published_at is null then
      new.published_at := now();
    end if;
    return new;
  end if;

  -- Drafts go live only through publish_giveaway (validation, wallet launch hold, one notification).
  if old.status = 'draft' and new.status not in ('draft', 'archived') and v_op <> 'publish' then
    raise exception 'drafts are published only through publish_giveaway' using errcode = '42501';
  end if;
  -- Nor can a never-published draft become active via archive → Restore.
  if new.status = 'active' and old.status <> 'active' and new.published_at is null and v_op <> 'publish' then
    raise exception 'this giveaway has never been published; use publish_giveaway' using errcode = '42501';
  end if;

  if new.entry_mode is distinct from old.entry_mode
     and exists (select 1 from public.giveaway_entries where giveaway_id = old.id) then
    raise exception 'entry mode cannot change after entries exist' using errcode = '42501';
  end if;

  -- Cancelled is terminal (other columns may still change, e.g. FK SET NULL on cancelled_by).
  if old.status = 'cancelled' and new.status <> 'cancelled' then
    raise exception 'a cancelled giveaway cannot be reopened' using errcode = '42501';
  end if;
  if new.status = 'cancelled' and old.status <> 'cancelled' and v_op <> 'cancel' then
    raise exception 'giveaways can only be cancelled through cancel_wallet_giveaway' using errcode = '42501';
  end if;

  if new.entry_mode = 'wallet' and v_op <> 'draw' then
    -- A winner can be cleared (account deletion) but never set/changed outside the draw function.
    if new.winner_id is not null and new.winner_id is distinct from old.winner_id then
      raise exception 'wallet giveaway winners are drawn only through draw_wallet_giveaway' using errcode = '42501';
    end if;
    if new.status = 'awarded' and old.status <> 'awarded'
       and not (old.status = 'archived' and old.winner_id is not null and new.winner_id = old.winner_id) then
      raise exception 'wallet giveaways are awarded only through draw_wallet_giveaway' using errcode = '42501';
    end if;
  end if;

  if new.entry_mode = 'wallet' then
    if new.status = 'archived' and old.status not in ('archived', 'awarded')
       and exists (select 1 from public.giveaway_entries where giveaway_id = old.id) then
      raise exception 'draw or cancel (refund) a wallet giveaway before archiving it' using errcode = '42501';
    end if;

    select coalesce(sum(quantity), 0), coalesce(max(quantity), 0) into v_sum, v_max_mine
      from public.giveaway_entries where giveaway_id = old.id;
    if coalesce(new.max_entries, 0) < v_sum then
      raise exception 'capacity cannot be lowered below the % entries already in the giveaway', v_sum
        using errcode = '23514';
    end if;
    if new.per_user_max is not null and new.per_user_max < v_max_mine then
      raise exception 'per-user max cannot be lowered below an entrant''s existing % entries', v_max_mine
        using errcode = '23514';
    end if;
  end if;
  return new;
end
$$;
revoke all on function public.tg_giveaways_guard() from public, anon, authenticated;

create trigger giveaways_guard
  before insert or update on public.giveaways
  for each row execute function public.tg_giveaways_guard();

-- ════════════════════════════════════════════════════════════════════════════════════════════
-- 7. Wallet core (internal)
-- ════════════════════════════════════════════════════════════════════════════════════════════
-- The ONE place balances change. Locks the wallet row (serializes a profile's spends/grants),
-- replays an idempotency key instead of re-applying it, refuses to go below zero, and writes the
-- ledger row + new balance in the same transaction. Raises 'insufficient_balance' (P0001).
create or replace function public._giveaway_wallet_apply(
  p_profile_id bigint, p_delta integer, p_reason text,
  p_giveaway_id integer default null, p_referral_id bigint default null,
  p_idempotency_key text default null, p_created_by bigint default null, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_balance integer;
  v_new     integer;
  v_ledger  bigint;
begin
  insert into public.giveaway_wallets (profile_id) values (p_profile_id) on conflict do nothing;
  select balance into v_balance from public.giveaway_wallets where profile_id = p_profile_id for update;

  -- Checked AFTER taking the lock, so a concurrent twin with the same key sees the first commit.
  if p_idempotency_key is not null then
    select id into v_ledger from public.giveaway_credit_ledger where idempotency_key = p_idempotency_key;
    if found then
      return jsonb_build_object('duplicate', true, 'ledger_id', v_ledger, 'balance', v_balance);
    end if;
  end if;

  v_new := v_balance + p_delta;
  if v_new < 0 then
    raise exception 'insufficient_balance' using errcode = 'P0001', detail = v_balance::text;
  end if;

  update public.giveaway_wallets set balance = v_new, updated_at = now() where profile_id = p_profile_id;
  insert into public.giveaway_credit_ledger
    (profile_id, delta, balance_after, reason, giveaway_id, referral_id, idempotency_key, created_by, note)
  values (p_profile_id, p_delta, v_new, p_reason, p_giveaway_id, p_referral_id, p_idempotency_key, p_created_by, p_note)
  returning id into v_ledger;

  return jsonb_build_object('duplicate', false, 'ledger_id', v_ledger, 'balance', v_new);
end
$$;
revoke all on function public._giveaway_wallet_apply(bigint, integer, text, integer, bigint, text, bigint, text)
  from public, anon, authenticated;

-- ════════════════════════════════════════════════════════════════════════════════════════════
-- 8. Client RPCs
-- ════════════════════════════════════════════════════════════════════════════════════════════
create or replace function public.get_my_giveaway_balance()
returns integer
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((select balance from public.giveaway_wallets where profile_id = public._authz_my_id_auto()), 0)
$$;
revoke all on function public.get_my_giveaway_balance() from public, anon;
grant execute on function public.get_my_giveaway_balance() to authenticated;

-- Admin grant / revoke — two explicit actions over the same core. Giveaway admin only
-- (_giveaway_is_admin = super_admin, as for every other giveaway write).
create or replace function public.admin_grant_giveaway_entries(
  p_profile_id bigint, p_amount integer, p_note text default null, p_idempotency_key text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_me bigint := public._authz_my_id_auto(); v_res jsonb;
begin
  if not public._giveaway_is_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_amount is null or p_amount < 1 or p_amount > 10000 then
    return jsonb_build_object('ok', false, 'status', 'invalid_amount');
  end if;
  if not exists (select 1 from public.profiles where id_auto = p_profile_id) then
    return jsonb_build_object('ok', false, 'status', 'no_such_user');
  end if;
  v_res := public._giveaway_wallet_apply(p_profile_id, p_amount, 'admin_grant', null, null,
             case when p_idempotency_key is null then null else 'admin_grant:' || p_idempotency_key end,
             v_me, nullif(btrim(p_note), ''));
  return jsonb_build_object('ok', true,
    'status', case when (v_res->>'duplicate')::boolean then 'duplicate' else 'granted' end,
    'balance', (v_res->>'balance')::int);
end
$$;
revoke all on function public.admin_grant_giveaway_entries(bigint, integer, text, text) from public, anon;
grant execute on function public.admin_grant_giveaway_entries(bigint, integer, text, text) to authenticated;

create or replace function public.admin_revoke_giveaway_entries(
  p_profile_id bigint, p_amount integer, p_note text, p_idempotency_key text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_me bigint := public._authz_my_id_auto(); v_res jsonb;
begin
  if not public._giveaway_is_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_amount is null or p_amount < 1 or p_amount > 10000 then
    return jsonb_build_object('ok', false, 'status', 'invalid_amount');
  end if;
  if nullif(btrim(p_note), '') is null then
    return jsonb_build_object('ok', false, 'status', 'note_required');
  end if;
  begin
    v_res := public._giveaway_wallet_apply(p_profile_id, -p_amount, 'admin_revoke', null, null,
               case when p_idempotency_key is null then null else 'admin_revoke:' || p_idempotency_key end,
               v_me, btrim(p_note));
  exception when sqlstate 'P0001' then
    return jsonb_build_object('ok', false, 'status', 'insufficient_balance',
      'balance', public._giveaway_balance_of(p_profile_id));
  end;
  return jsonb_build_object('ok', true,
    'status', case when (v_res->>'duplicate')::boolean then 'duplicate' else 'revoked' end,
    'balance', (v_res->>'balance')::int);
end
$$;

create or replace function public._giveaway_balance_of(p_profile_id bigint) returns integer
language sql stable security definer set search_path = public, pg_temp
as $$ select coalesce((select balance from public.giveaway_wallets where profile_id = p_profile_id), 0) $$;
revoke all on function public._giveaway_balance_of(bigint) from public, anon, authenticated;

revoke all on function public.admin_revoke_giveaway_entries(bigint, integer, text, text) from public, anon;
grant execute on function public.admin_revoke_giveaway_entries(bigint, integer, text, text) to authenticated;

-- Spend wallet credits on a wallet giveaway (1 credit = 1 draw entry). Atomic: the giveaway row
-- lock serializes every entry into this giveaway (capacity + per-user cap races), the wallet row
-- lock serializes the user's balance (double-spend). p_request_id makes client retries replays.
-- First entry into a giveaway requires the entrant details / consents (same fields and rules as
-- the legacy form); top-ups reuse the existing entrant row.
create or replace function public.enter_wallet_giveaway(
  p_giveaway_id integer, p_quantity integer, p_request_id uuid, p_entrant jsonb default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_me     bigint := public._authz_my_id_auto();
  g        public.giveaways%rowtype;
  v_key    text;
  v_total  bigint;
  v_mine   integer;
  v_entry  integer;
  v_res    jsonb;
  v_bday   date;
  v_closed boolean := false;
begin
  if v_me is null then
    return jsonb_build_object('ok', false, 'status', 'not_authenticated');
  end if;
  if p_request_id is null then
    return jsonb_build_object('ok', false, 'status', 'request_id_required');
  end if;
  v_key := 'spend:' || v_me || ':' || p_request_id;

  -- Replay of an already-applied request: report current state, charge nothing.
  if exists (select 1 from public.giveaway_credit_ledger where idempotency_key = v_key) then
    select quantity into v_mine from public.giveaway_entries where giveaway_id = p_giveaway_id and user_id = v_me;
    return jsonb_build_object('ok', true, 'status', 'duplicate', 'my_entries', coalesce(v_mine, 0),
      'balance', public._giveaway_balance_of(v_me));
  end if;

  if p_quantity is null or p_quantity < 1 or p_quantity > 1000 then
    return jsonb_build_object('ok', false, 'status', 'invalid_quantity');
  end if;

  select * into g from public.giveaways where id = p_giveaway_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'status', 'not_found');
  end if;
  if g.entry_mode <> 'wallet' then
    return jsonb_build_object('ok', false, 'status', 'not_wallet_giveaway');
  end if;
  if g.status <> 'active' or (g.end_date is not null and g.end_date <= now()) then
    return jsonb_build_object('ok', false, 'status', 'closed');
  end if;

  select coalesce(sum(quantity), 0) into v_total from public.giveaway_entries where giveaway_id = g.id;
  select id, quantity into v_entry, v_mine from public.giveaway_entries where giveaway_id = g.id and user_id = v_me;
  v_mine := coalesce(v_mine, 0);

  if g.per_user_max is not null and v_mine + p_quantity > g.per_user_max then
    return jsonb_build_object('ok', false, 'status', 'per_user_cap',
      'remaining', greatest(g.per_user_max - v_mine, 0), 'my_entries', v_mine);
  end if;
  if v_total + p_quantity > g.max_entries then
    return jsonb_build_object('ok', false, 'status', 'capacity',
      'remaining', greatest(g.max_entries - v_total, 0));
  end if;

  if v_entry is null then
    if p_entrant is null
       or nullif(btrim(p_entrant->>'name_as_on_id'), '') is null
       or nullif(btrim(p_entrant->>'email'), '') is null
       or nullif(btrim(p_entrant->>'phone'), '') is null
       or nullif(p_entrant->>'birthday', '') is null
       or coalesce((p_entrant->>'agreed_to_rules')::boolean, false) is not true
       or coalesce((p_entrant->>'agreed_to_privacy')::boolean, false) is not true
       or coalesce((p_entrant->>'confirmed_age')::boolean, false) is not true then
      return jsonb_build_object('ok', false, 'status', 'entrant_details_required');
    end if;
    begin
      v_bday := (p_entrant->>'birthday')::date;
    exception when others then
      return jsonb_build_object('ok', false, 'status', 'entrant_details_required');
    end;
    if v_bday > (current_date - make_interval(years => coalesce(g.min_age, 18))) then
      return jsonb_build_object('ok', false, 'status', 'underage');
    end if;
  end if;

  -- Debit first: if the balance is short nothing else has happened.
  begin
    v_res := public._giveaway_wallet_apply(v_me, -p_quantity, 'giveaway_spend', g.id, null, v_key, v_me, null);
  exception when sqlstate 'P0001' then
    return jsonb_build_object('ok', false, 'status', 'insufficient_balance',
      'balance', public._giveaway_balance_of(v_me));
  end;
  if (v_res->>'duplicate')::boolean then          -- concurrent twin of this exact request won
    return jsonb_build_object('ok', true, 'status', 'duplicate', 'my_entries', v_mine,
      'balance', (v_res->>'balance')::int);
  end if;

  perform set_config('compete.giveaway_op', 'wallet_entry', true);
  if v_entry is null then
    insert into public.giveaway_entries (giveaway_id, user_id, name_as_on_id, birthday, email, phone,
        agreed_to_rules, agreed_to_privacy, confirmed_age, opted_in_promotions, quantity)
    values (g.id, v_me, btrim(p_entrant->>'name_as_on_id'), v_bday, lower(btrim(p_entrant->>'email')),
        btrim(p_entrant->>'phone'), true, true, true,
        coalesce((p_entrant->>'opted_in_promotions')::boolean, false), p_quantity);
  else
    update public.giveaway_entries set quantity = quantity + p_quantity where id = v_entry;
  end if;
  perform set_config('compete.giveaway_op', '', true);

  if v_total + p_quantity >= g.max_entries then
    update public.giveaways set status = 'ended', ended_at = now(), updated_at = now() where id = g.id;
    v_closed := true;
  end if;

  return jsonb_build_object('ok', true, 'status', 'entered',
    'added', p_quantity, 'my_entries', v_mine + p_quantity,
    'total_entries', v_total + p_quantity, 'capacity', g.max_entries,
    'balance', (v_res->>'balance')::int, 'closed', v_closed);
end
$$;
revoke all on function public.enter_wallet_giveaway(integer, integer, uuid, jsonb) from public, anon;
grant execute on function public.enter_wallet_giveaway(integer, integer, uuid, jsonb) to authenticated;

-- Server-side weighted draw for WALLET giveaways (legacy giveaways keep the existing admin flow).
-- Each entry's quantity = its number of tickets. The winning ticket comes from gen_random_bytes;
-- the pool (entry id : user : quantity, excluding disqualified users) is hashed and stored with the
-- ticket in giveaway_draws, so every draw is auditable. p_redraw_reason → disqualify the current
-- winner, invalidate their draw, and draw again from the remaining pool.
create or replace function public.draw_wallet_giveaway(p_giveaway_id integer, p_redraw_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_me      bigint := public._authz_my_id_auto();
  g         public.giveaways%rowtype;
  v_total   bigint;
  v_ticket  bigint;
  v_hash    text;
  w         record;
  v_draw_no integer;
begin
  if not public._giveaway_is_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select * into g from public.giveaways where id = p_giveaway_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'status', 'not_found');
  end if;
  if g.entry_mode <> 'wallet' then
    return jsonb_build_object('ok', false, 'status', 'not_wallet_giveaway');
  end if;

  perform set_config('compete.giveaway_op', 'draw', true);

  if p_redraw_reason is not null then
    if g.status <> 'awarded' or g.winner_id is null then
      return jsonb_build_object('ok', false, 'status', 'not_awarded');
    end if;
    if nullif(btrim(p_redraw_reason), '') is null then
      return jsonb_build_object('ok', false, 'status', 'reason_required');
    end if;
    update public.giveaway_winner_history
       set status = 'disqualified', disqualified_at = now(), disqualified_by = v_me,
           disqualified_reason = btrim(p_redraw_reason)
     where giveaway_id = g.id and user_id = g.winner_id and status = 'winner';
    update public.giveaway_draws
       set invalidated = true, invalidation_reason = btrim(p_redraw_reason),
           invalidated_at = now(), invalidated_by = v_me
     where giveaway_id = g.id and winner_id = g.winner_id and coalesce(invalidated, false) = false;
    update public.profiles set total_winnings = greatest(coalesce(total_winnings, 0) - coalesce(g.prize_value, 0), 0)
     where id_auto = g.winner_id;
  elsif g.status <> 'ended' then
    return jsonb_build_object('ok', false, 'status', 'not_ended');
  end if;

  with pool as (
    select e.id, e.user_id, e.quantity
      from public.giveaway_entries e
     where e.giveaway_id = g.id
       and not exists (select 1 from public.giveaway_winner_history h
                        where h.giveaway_id = g.id and h.user_id = e.user_id and h.status = 'disqualified')
  )
  select coalesce(sum(quantity), 0),
         md5(coalesce(string_agg(id || ':' || user_id || ':' || quantity, ',' order by id), ''))
    into v_total, v_hash from pool;

  if v_total = 0 then
    return jsonb_build_object('ok', false, 'status', 'no_eligible_entries');
  end if;

  v_ticket := ((('x' || encode(extensions.gen_random_bytes(8), 'hex'))::bit(64)::bigint & 9223372036854775807) % v_total) + 1;

  select e.id, e.user_id, e.name_as_on_id, e.email, e.phone into w
    from (
      select e.*, sum(e.quantity) over (order by e.id) as upto
        from public.giveaway_entries e
       where e.giveaway_id = g.id
         and not exists (select 1 from public.giveaway_winner_history h
                          where h.giveaway_id = g.id and h.user_id = e.user_id and h.status = 'disqualified')
    ) e
   where e.upto >= v_ticket
   order by e.id
   limit 1;

  select coalesce(max(draw_number), 0) + 1 into v_draw_no from public.giveaway_draws where giveaway_id = g.id;
  insert into public.giveaway_draws (giveaway_id, drawn_by, winner_id, draw_number, entry_id,
                                     total_tickets, winning_ticket, pool_hash)
  values (g.id, v_me, w.user_id, v_draw_no, w.id, v_total, v_ticket, v_hash);

  insert into public.giveaway_winner_history (giveaway_id, user_id, entry_id, status, drawn_at, drawn_by)
  values (g.id, w.user_id, w.id, 'winner', now(), v_me);

  update public.giveaways
     set winner_id = w.user_id, winner_drawn_at = now(), winner_drawn_by = v_me, status = 'awarded',
         ended_at = coalesce(ended_at, now()), updated_at = now()
   where id = g.id;

  update public.profiles set total_winnings = coalesce(total_winnings, 0) + coalesce(g.prize_value, 0)
   where id_auto = w.user_id;

  perform set_config('compete.giveaway_op', '', true);

  return jsonb_build_object('ok', true, 'status', case when p_redraw_reason is null then 'drawn' else 'redrawn' end,
    'draw_number', v_draw_no, 'total_tickets', v_total, 'winning_ticket', v_ticket, 'pool_hash', v_hash,
    'winner', jsonb_build_object('entry_id', w.id, 'user_id', w.user_id, 'name', w.name_as_on_id,
                                 'email', w.email, 'phone', w.phone));
end
$$;
revoke all on function public.draw_wallet_giveaway(integer, text) from public, anon;
grant execute on function public.draw_wallet_giveaway(integer, text) to authenticated;

-- Cancel a wallet giveaway and refund every entrant's spent credits (one ledger refund per
-- entrant, idempotency-keyed so a repeat never double-refunds). Entry rows are kept as history.
create or replace function public.cancel_wallet_giveaway(p_giveaway_id integer, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_me       bigint := public._authz_my_id_auto();
  g          public.giveaways%rowtype;
  e          record;
  v_refunded integer := 0;
  v_credits  bigint := 0;
  v_res      jsonb;
begin
  if not public._giveaway_is_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if nullif(btrim(p_reason), '') is null then
    return jsonb_build_object('ok', false, 'status', 'reason_required');
  end if;

  select * into g from public.giveaways where id = p_giveaway_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'status', 'not_found');
  end if;
  if g.entry_mode <> 'wallet' then
    return jsonb_build_object('ok', false, 'status', 'not_wallet_giveaway');
  end if;
  if g.status = 'cancelled' then
    return jsonb_build_object('ok', true, 'status', 'already_cancelled');
  end if;
  if g.status not in ('active', 'ended') then
    return jsonb_build_object('ok', false, 'status', 'not_cancellable');   -- awarded / archived
  end if;

  for e in select user_id, quantity from public.giveaway_entries where giveaway_id = g.id order by id loop
    v_res := public._giveaway_wallet_apply(e.user_id, e.quantity, 'giveaway_refund', g.id, null,
               'refund:' || g.id || ':' || e.user_id, v_me, btrim(p_reason));
    if not (v_res->>'duplicate')::boolean then
      v_refunded := v_refunded + 1;
      v_credits  := v_credits + e.quantity;
    end if;
  end loop;

  perform set_config('compete.giveaway_op', 'cancel', true);
  update public.giveaways
     set status = 'cancelled', cancelled_at = now(), cancelled_by = v_me, cancel_reason = btrim(p_reason),
         ended_at = coalesce(ended_at, now()), updated_at = now()
   where id = g.id;
  perform set_config('compete.giveaway_op', '', true);

  return jsonb_build_object('ok', true, 'status', 'cancelled',
    'entrants_refunded', v_refunded, 'credits_refunded', v_credits);
end
$$;
revoke all on function public.cancel_wallet_giveaway(integer, text) from public, anon;
grant execute on function public.cancel_wallet_giveaway(integer, text) to authenticated;

-- ════════════════════════════════════════════════════════════════════════════════════════════
-- 8b. Publish (draft → active)
-- ════════════════════════════════════════════════════════════════════════════════════════════
-- The only draft → active path. Returns status 'published' EXACTLY ONCE per giveaway (the row
-- lock serializes concurrent calls; a repeat sees it already live and returns
-- 'already_published'), so the caller sends the "New Giveaway!" notification only on 'published'.
--
-- WALLET NATIVE LAUNCH HOLD: wallet giveaways can be created, edited and tested as drafts, but
-- not published until a native build with the wallet UI is released. Enforced here and by the
-- guard trigger (drafts can't go live any other way). Lift it with a one-line follow-up migration
-- that re-creates this function with c_wallet_publish_hold := false — no settings table needed.
create or replace function public.publish_giveaway(p_giveaway_id integer)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  c_wallet_publish_hold constant boolean := true;
  g public.giveaways%rowtype;
begin
  if not public._giveaway_is_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select * into g from public.giveaways where id = p_giveaway_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'status', 'not_found');
  end if;
  if g.status <> 'draft' then
    if g.published_at is not null then
      return jsonb_build_object('ok', true, 'status', 'already_published');
    end if;
    return jsonb_build_object('ok', false, 'status', 'not_draft');
  end if;

  -- Configuration must be complete before it goes public.
  if nullif(btrim(g.name), '') is null then
    return jsonb_build_object('ok', false, 'status', 'name_required');
  end if;
  if g.end_date is not null and g.end_date <= now() then
    return jsonb_build_object('ok', false, 'status', 'end_date_in_past');
  end if;
  if g.max_entries is null and g.end_date is null then
    return jsonb_build_object('ok', false, 'status', 'end_condition_required');
  end if;
  if g.entry_mode = 'wallet' then
    if c_wallet_publish_hold then
      return jsonb_build_object('ok', false, 'status', 'wallet_publish_on_hold');
    end if;
    if g.per_user_max > g.max_entries then
      return jsonb_build_object('ok', false, 'status', 'per_user_max_exceeds_capacity');
    end if;
  end if;

  perform set_config('compete.giveaway_op', 'publish', true);
  update public.giveaways
     set status = 'active', published_at = coalesce(published_at, now()), updated_at = now()
   where id = g.id;
  perform set_config('compete.giveaway_op', '', true);

  return jsonb_build_object('ok', true, 'status', 'published', 'entry_mode', g.entry_mode);
end
$$;
revoke all on function public.publish_giveaway(integer) from public, anon;
grant execute on function public.publish_giveaway(integer) to authenticated;

-- ════════════════════════════════════════════════════════════════════════════════════════════
-- 9. Public counts: SUM(quantity) (identical for legacy, where every quantity = 1). Same
-- signature, same aggregate-only output, same visibility rules as G1.
-- ════════════════════════════════════════════════════════════════════════════════════════════
create or replace function public.get_giveaway_entry_counts(p_giveaway_ids integer[] default null)
returns table (giveaway_id integer, entry_count bigint)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select g.id, coalesce(sum(e.quantity), 0)::bigint
  from public.giveaways g
  left join public.giveaway_entries e on e.giveaway_id = g.id
  where (p_giveaway_ids is null or g.id = any (p_giveaway_ids))
    and (g.status in ('active', 'ended', 'awarded') or public._giveaway_is_admin())
  group by g.id
$$;
