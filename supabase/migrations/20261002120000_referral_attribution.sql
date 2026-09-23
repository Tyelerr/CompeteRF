-- supabase/pending/20261002120000_referral_attribution.sql   (PENDING — not applied)
--
-- Referral attribution foundation — Phase 1. Records WHO REFERRED WHOM. Issues NO rewards.
--
--   referral_codes   one active, permanent, human-readable code per profile (e.g. TYELERR)
--   referrals        one row per referred profile — the ONE original referrer, forever
--
--   _referral_ensure_code(bigint)       internal: create the profile's code if it has none
--   tg_profiles_create_referral_code    AFTER INSERT ON profiles → every new profile gets a code
--   get_my_referral_code()              authenticated: caller's code (lazily created if missing)
--   resolve_referral_code(text)         anon+auth: { valid, code, inviter: "First L." } — nothing else
--   claim_referral(text, text)          authenticated: attribute the CALLER to a code's owner
--
-- Attribution identity is the profile id (id_auto), never the code string or username. Codes are
-- never edited or reused: a future code change = disable the old row + insert a new one, so
-- historical referrals (referral_code_id) always point at the exact code that was used.
--
-- Account deletion (delete_user_account hard-deletes profiles) keeps working without touching
-- that function: codes CASCADE with their owner; a referred user's row CASCADES; a deleted
-- REFERRER is SET NULL so the referred user keeps "already attributed" and can't re-claim.
--
-- Access: no direct client writes to either table. Users read only their own code row; referral
-- rows are admin-read only in this phase. EXECUTE on every function is granted explicitly.
-- Supabase default privileges auto-GRANT ALL on new public tables to anon/authenticated, so this
-- file REVOKEs them explicitly (lesson from the giveaway_entries exposure).
--
-- Conventions match 20260930120000_authz_rpcs.sql: SECURITY DEFINER, pinned search_path,
-- caller derived from auth.uid() (never an argument).

-- ── Tables ───────────────────────────────────────────────────────────────────────────────────
create table public.referral_codes (
  id          bigint generated always as identity primary key,
  profile_id  bigint not null references public.profiles (id_auto) on delete cascade,
  code        text   not null,
  created_at  timestamptz not null default now(),
  disabled_at timestamptz,
  -- Stored upper-case, so a plain unique index is case-insensitive for lookups that upper() input.
  constraint referral_codes_code_format check (code ~ '^[A-Z0-9]{3,16}$')
);
-- Codes are globally unique forever (disabled rows keep theirs — never reissued).
create unique index referral_codes_code_key on public.referral_codes (code);
-- One ACTIVE code per profile for now (affiliates may relax this later).
create unique index referral_codes_one_active_per_profile
  on public.referral_codes (profile_id) where disabled_at is null;

create table public.referrals (
  id                  bigint generated always as identity primary key,
  referred_profile_id bigint not null references public.profiles (id_auto) on delete cascade,
  referrer_profile_id bigint references public.profiles (id_auto) on delete set null,
  referral_code_id    bigint references public.referral_codes (id) on delete set null,
  source              text not null,
  created_at          timestamptz not null default now(),   -- attributed_at
  constraint referrals_one_referrer_per_user unique (referred_profile_id),
  constraint referrals_not_self check (referrer_profile_id is distinct from referred_profile_id),
  constraint referrals_source_check check (source in ('link', 'manual'))
);
create index referrals_referrer_idx on public.referrals (referrer_profile_id);

-- ── Access: RLS on, no client writes, explicit revokes ──────────────────────────────────────
alter table public.referral_codes enable row level security;
alter table public.referrals      enable row level security;

revoke all on table public.referral_codes from public, anon, authenticated;
revoke all on table public.referrals      from public, anon, authenticated;
grant select on table public.referral_codes to authenticated;
grant select on table public.referrals      to authenticated;

create policy "Users can view own referral codes" on public.referral_codes
  as permissive for select to authenticated
  using (profile_id = public._authz_my_id_auto());

create policy "Admins can view referral codes" on public.referral_codes
  as permissive for select to authenticated
  using (public._authz_is_admin());

-- Phase 1: referral rows are admin-read only (user-facing activity comes later via an RPC).
create policy "Admins can view referrals" on public.referrals
  as permissive for select to authenticated
  using (public._authz_is_admin());

-- ── Code generation ─────────────────────────────────────────────────────────────────────────
-- Base = username stripped to [A-Z0-9], max 13 (room for a ≤3-digit suffix within 16).
-- First free of BASE, BASE2, BASE3, … wins.
-- Deterministic (oldest profile gets the bare code), idempotent (returns the existing active
-- code), and collision-safe under concurrency (unique index + retry on unique_violation).
create or replace function public._referral_ensure_code(p_profile_id bigint)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_code text;
  v_base text;
  v_try  text;
  n      int := 1;
begin
  select code into v_code from public.referral_codes
   where profile_id = p_profile_id and disabled_at is null;
  if v_code is not null then
    return v_code;
  end if;

  select left(upper(regexp_replace(coalesce(user_name, ''), '[^A-Za-z0-9]', '', 'g')), 13)
    into v_base
    from public.profiles where id_auto = p_profile_id;
  if v_base is null then
    return null;                                  -- no such profile
  end if;
  if length(v_base) < 3 then
    v_base := rpad(v_base, 3, 'X');         -- never happens today (usernames are ≥3)
  end if;

  loop
    v_try := case when n = 1 then v_base else v_base || n::text end;
    begin
      insert into public.referral_codes (profile_id, code) values (p_profile_id, v_try);
      return v_try;
    exception when unique_violation then
      -- Either the code is taken, or a concurrent call just gave THIS profile its code.
      select code into v_code from public.referral_codes
       where profile_id = p_profile_id and disabled_at is null;
      if v_code is not null then
        return v_code;
      end if;
      n := n + 1;
      if n > 999 then
        raise exception 'referral code space exhausted for base %', v_base;
      end if;
    end;
  end loop;
end
$$;

revoke all on function public._referral_ensure_code(bigint) from public, anon, authenticated;

-- New profiles get a code server-side, whichever client path created the profile (email
-- register, Apple complete-profile, anything future). Never allowed to break signup: failures
-- are downgraded to a WARNING and get_my_referral_code() lazily fills the gap.
create or replace function public.tg_profiles_create_referral_code()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  begin
    perform public._referral_ensure_code(new.id_auto);
  exception when others then
    raise warning 'referral code generation failed for profile %: %', new.id_auto, sqlerrm;
  end;
  return new;
end
$$;

revoke all on function public.tg_profiles_create_referral_code() from public, anon, authenticated;

create trigger on_profile_created_create_referral_code
  after insert on public.profiles
  for each row execute function public.tg_profiles_create_referral_code();

-- ── Client RPCs ─────────────────────────────────────────────────────────────────────────────
create or replace function public.get_my_referral_code()
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_me bigint := public._authz_my_id_auto();
begin
  if v_me is null then
    return null;
  end if;
  return public._referral_ensure_code(v_me);
end
$$;

revoke all on function public.get_my_referral_code() from public, anon;
grant execute on function public.get_my_referral_code() to authenticated;

-- Used by /r/[code] and the signup code field. Returns ONLY
--   { valid: boolean, code: text|null, inviter: "First L."|null }
-- — a minimal display value built here so no profile read access has to be widened.
-- Never returns ids, username, email, phone or any other profile field.
create or replace function public.resolve_referral_code(p_code text)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select jsonb_build_object(
              'valid', true,
              'code', rc.code,
              'inviter', nullif(btrim(
                coalesce(nullif(btrim(p.first_name), ''), split_part(btrim(p.name), ' ', 1))
                || coalesce(' ' || upper(left(nullif(btrim(
                     coalesce(nullif(btrim(p.last_name), ''),
                              nullif(regexp_replace(btrim(p.name), '^\S+\s*', ''), ''))), ''), 1)) || '.', '')
              ), ''))
       from public.referral_codes rc
       join public.profiles p on p.id_auto = rc.profile_id
      where rc.code = upper(btrim(coalesce(p_code, '')))
        and rc.disabled_at is null
        and coalesce(p.status, 'active') = 'active'
        and not p.is_disabled
        and p.deleted_at is null),
    jsonb_build_object('valid', false, 'code', null, 'inviter', null))
$$;

revoke all on function public.resolve_referral_code(text) from public;
grant execute on function public.resolve_referral_code(text) to anon, authenticated;

-- Attribute the CALLER to the owner of p_code. Business outcomes are returned (not raised) as
-- { ok, status }:
--   claimed             new attribution recorded
--   already_claimed     caller is already attributed to THIS code's owner (idempotent repeat)
--   already_attributed  caller already has a different referrer (never switched)
--   invalid_code        unknown / disabled code, or its owner is inactive
--   self_referral       caller owns the code
--   mutual_referral     code owner was referred by the caller (A↔B loop)
--   window_expired      caller's account is older than the claim window
--   not_authenticated / no_profile
create or replace function public.claim_referral(p_code text, p_source text default 'manual')
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  c_window   constant interval := interval '7 days';
  v_uid      uuid := auth.uid();
  v_me       bigint;
  v_signup   timestamptz;
  v_code_id  bigint;
  v_owner    bigint;
  v_existing bigint;
  v_new_id   bigint;
  v_source   text := case when p_source in ('link', 'manual') then p_source else 'manual' end;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'status', 'not_authenticated');
  end if;

  select id_auto into v_me from public.profiles where id = v_uid;
  if v_me is null then
    return jsonb_build_object('ok', false, 'status', 'no_profile');
  end if;

  select rc.id, rc.profile_id into v_code_id, v_owner
    from public.referral_codes rc
    join public.profiles p on p.id_auto = rc.profile_id
   where rc.code = upper(btrim(coalesce(p_code, '')))
     and rc.disabled_at is null
     and coalesce(p.status, 'active') = 'active'
     and not p.is_disabled
     and p.deleted_at is null;
  if v_code_id is null then
    return jsonb_build_object('ok', false, 'status', 'invalid_code');
  end if;

  if v_owner = v_me then
    return jsonb_build_object('ok', false, 'status', 'self_referral');
  end if;

  -- Existing attribution wins, always (checked before the window so repeats stay idempotent).
  select referrer_profile_id into v_existing from public.referrals where referred_profile_id = v_me;
  if found then
    return jsonb_build_object('ok', v_existing = v_owner,
      'status', case when v_existing = v_owner then 'already_claimed' else 'already_attributed' end);
  end if;

  -- Window measured from auth.users.created_at: server-set, unlike profiles.created_at, which the
  -- client can write on insert and on its own-row update.
  select created_at into v_signup from auth.users where id = v_uid;
  if v_signup is null or v_signup < now() - c_window then
    return jsonb_build_object('ok', false, 'status', 'window_expired');
  end if;

  if exists (select 1 from public.referrals
              where referred_profile_id = v_owner and referrer_profile_id = v_me) then
    return jsonb_build_object('ok', false, 'status', 'mutual_referral');
  end if;

  insert into public.referrals (referred_profile_id, referrer_profile_id, referral_code_id, source)
  values (v_me, v_owner, v_code_id, v_source)
  on conflict (referred_profile_id) do nothing
  returning id into v_new_id;

  if v_new_id is null then
    -- Lost a concurrent race: report what won.
    select referrer_profile_id into v_existing from public.referrals where referred_profile_id = v_me;
    return jsonb_build_object('ok', v_existing = v_owner,
      'status', case when v_existing = v_owner then 'already_claimed' else 'already_attributed' end);
  end if;

  return jsonb_build_object('ok', true, 'status', 'claimed');
end
$$;

revoke all on function public.claim_referral(text, text) from public, anon;
grant execute on function public.claim_referral(text, text) to authenticated;

-- ── Backfill: every existing profile gets a code, oldest first (so the older of any
-- case-insensitive username twins keeps the bare code). Idempotent: re-running is a no-op.
do $backfill$
declare r record;
begin
  for r in select id_auto from public.profiles order by id_auto loop
    perform public._referral_ensure_code(r.id_auto);
  end loop;
end
$backfill$;
