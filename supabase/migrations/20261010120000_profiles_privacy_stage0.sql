-- supabase/migrations/20261010120000_profiles_privacy_stage0.sql   (APPLIED 2026-09-28)
--
-- M3 profiles privacy — STAGE 0: additive compatibility layer ONLY.
--
-- Today public.profiles is readable in full (all 42 columns incl. email / phone_number) by
-- anon and every signed-in user ("Anyone can view active profiles", status='active'). The
-- released native apps (iOS 1.25 / Android 1.0.20) depend on that (username login reads
-- profiles.email signed-out; tournament browse embeds profiles!director_id(*); partner search
-- selects *), so this stage CHANGES NO EXISTING POLICY OR READ PATH. It only adds safe
-- endpoints that the next web + native release switch to (Stage 1). The base-table lockdown is
-- Stage 3, after the minimum-version gate retires the old builds.
--
--   profiles_public            view: safe columns only (no email / phone / activity / money)
--   _login_email_for_username  service_role-only lookup for the login-with-username Edge Function
--                              (the email never reaches a client)
--   is_username_available      case-insensitive availability check (anon + authenticated)
--   search_players             signed-in player search, safe columns only
--   search_users_for_staff     TD / bar owner / admin user search; full email for admins only,
--                              masked email + EXACT-email match for TDs / bar owners
--   grant cleanup              drop TRUNCATE / TRIGGER / REFERENCES on profiles from anon +
--                              authenticated (never used by any client; RLS does not cover TRUNCATE)
--
-- Rollback: supabase/rollback/20261010120000_profiles_privacy_stage0_rollback.sql

-- ── 1. Safe public projection ────────────────────────────────────────────────────────────
-- Owner-rights view (same pattern as chip_entries_public): exposes only these columns, for the
-- same rows the current public policy exposes (status = 'active').
create or replace view public.profiles_public as
select
  p.id, p.id_auto, p.user_name, p.name, p.first_name, p.last_name, p.avatar_url,
  p.home_state, p.role, p.status, p.fargo, p.fargo_status
from public.profiles p
where p.status = 'active';

comment on view public.profiles_public is
  'Safe public profile fields (no email/phone/activity/winnings). Use for any read of ANOTHER user''s profile.';
revoke all on public.profiles_public from public;
grant select on public.profiles_public to anon, authenticated;

-- ── 2. Username → email for server-side login only ──────────────────────────────────────
-- Called ONLY by the login-with-username Edge Function with the service role. Exact-case match
-- first; otherwise a UNIQUE case-insensitive match; ambiguous or unknown → null. Same rows the
-- current client lookup can see (status = 'active'). No wildcards (plain equality).
create or replace function public._login_email_for_username(p_username text)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_name text := trim(coalesce(p_username, ''));
  v_email text;
  v_n int;
begin
  if length(v_name) < 3 or length(v_name) > 40 then
    return null;
  end if;
  select email into v_email from public.profiles
   where user_name = v_name and status = 'active'
   limit 1;
  if v_email is not null then
    return v_email;
  end if;
  select count(*), min(email) into v_n, v_email from public.profiles
   where lower(user_name) = lower(v_name) and status = 'active';
  if v_n = 1 then
    return v_email;
  end if;
  return null;
end;
$$;
revoke all on function public._login_email_for_username(text) from public, anon, authenticated;
grant execute on function public._login_email_for_username(text) to service_role;

-- ── 3. Username availability (signup / complete-profile) ────────────────────────────────
-- Case-insensitive (fixes the current check, which lowercases the input but compares
-- case-sensitively). Reveals only whether a username is taken — usernames are public anyway.
create or replace function public.is_username_available(p_username text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when length(trim(coalesce(p_username, ''))) < 3 or length(trim(p_username)) > 30 then false
    else not exists (
      select 1 from public.profiles where lower(user_name) = lower(trim(p_username))
    )
  end;
$$;
revoke all on function public.is_username_available(text) from public;
grant execute on function public.is_username_available(text) to anon, authenticated;

-- ── 4. Player search (partner search, TD add player) — safe columns only ─────────────────
create or replace function public.search_players(p_query text, p_limit int default 20)
returns table (
  id uuid, id_auto bigint, user_name text, name text, first_name text, last_name text,
  avatar_url text, home_state text, fargo int, fargo_status text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_q text := trim(coalesce(p_query, ''));
  v_pat text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if length(v_q) < 2 then
    return;
  end if;
  -- literal match: escape LIKE wildcards in the user's input
  v_pat := '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  return query
    select p.id, p.id_auto, p.user_name, p.name, p.first_name, p.last_name,
           p.avatar_url, p.home_state, p.fargo, p.fargo_status
      from public.profiles p
     where p.status = 'active'
       and coalesce(p.is_disabled, false) = false
       and (p.user_name ilike v_pat or p.name ilike v_pat
            or p.first_name ilike v_pat or p.last_name ilike v_pat
            or (coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')) ilike v_pat)
     order by p.user_name
     limit least(greatest(coalesce(p_limit, 20), 1), 50);
end;
$$;
revoke all on function public.search_players(text, int) from public, anon;
grant execute on function public.search_players(text, int) to authenticated;

-- ── 5. Staff user search (add director, venue team, reassign TD, venue owner) ────────────
create or replace function public._mask_email(p_email text)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when p_email is null or position('@' in p_email) = 0 then null
    else left(split_part(p_email, '@', 1), 1) || '***@'
         || left(split_part(p_email, '@', 2), 1) || '***'
         || coalesce('.' || nullif(reverse(split_part(reverse(split_part(p_email, '@', 2)), '.', 1)), ''), '')
  end;
$$;
revoke all on function public._mask_email(text) from public, anon, authenticated;

create or replace function public.search_users_for_staff(p_query text, p_limit int default 20)
returns table (
  id uuid, id_auto bigint, user_name text, name text, role text, email_display text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role text;
  v_admin boolean;
  v_q text := trim(coalesce(p_query, ''));
  v_pat text;
begin
  select pr.role into v_role from public.profiles pr where pr.id = auth.uid();
  if v_role is null or v_role not in ('tournament_director', 'bar_owner', 'compete_admin', 'super_admin') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  v_admin := v_role in ('compete_admin', 'super_admin');
  if length(v_q) < 2 then
    return;
  end if;
  v_pat := '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  return query
    select p.id, p.id_auto, p.user_name, p.name, p.role,
           case when v_admin then p.email else public._mask_email(p.email) end
      from public.profiles p
     where p.status = 'active'
       and (p.user_name ilike v_pat or p.name ilike v_pat
            -- admins: partial email search; TDs / bar owners: exact email only (no enumeration)
            or (v_admin and p.email ilike v_pat)
            or (not v_admin and lower(p.email) = lower(v_q)))
     order by p.name nulls last, p.user_name
     limit least(greatest(coalesce(p_limit, 20), 1), 50);
end;
$$;
revoke all on function public.search_users_for_staff(text, int) from public, anon;
grant execute on function public.search_users_for_staff(text, int) to authenticated;

-- ── 6. Grant cleanup (unused by every client; TRUNCATE is not subject to RLS) ────────────
revoke truncate, trigger, references on public.profiles from anon, authenticated;
