-- supabase/migrations/20261011120000_app_config_min_version.sql
--
-- Native minimum-version gate (M3 privacy Stage 1). A tiny public key/value config table the
-- native app reads at launch + on foreground. The 'min_supported' row holds per-platform
-- minimum NATIVE BUILD NUMBERS (iOS CFBundleVersion / Android versionCode — never marketing
-- version strings). Raising the minimum later is a single UPDATE — no migration, no build:
--
--   update public.app_config
--      set value = jsonb_set(value, '{android_min_build}', '9')
--    where key = 'min_supported';
--
-- Seeded with 0 / 0 so it can NEVER block any installed build until deliberately raised.
-- Readable by everyone (non-secret config only); writable only by Compete admins.
-- Rollback: supabase/rollback/20261011120000_app_config_min_version_rollback.sql

create table if not exists public.app_config (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid()
);

comment on table public.app_config is
  'Public, non-secret app configuration (e.g. min_supported native builds). Admin-writable only.';

alter table public.app_config enable row level security;

drop policy if exists app_config_read on public.app_config;
create policy app_config_read on public.app_config
  for select to anon, authenticated using (true);

drop policy if exists app_config_admin_write on public.app_config;
create policy app_config_admin_write on public.app_config
  for all to authenticated
  using (exists (select 1 from public.profiles p
                  where p.id = auth.uid() and p.role in ('compete_admin', 'super_admin')))
  with check (exists (select 1 from public.profiles p
                       where p.id = auth.uid() and p.role in ('compete_admin', 'super_admin')));

revoke all on public.app_config from public, anon, authenticated;
grant select on public.app_config to anon, authenticated;
grant insert, update, delete on public.app_config to authenticated;

create or replace function public.tg_app_config_touch()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

drop trigger if exists app_config_touch on public.app_config;
create trigger app_config_touch
  before insert or update on public.app_config
  for each row execute function public.tg_app_config_touch();

insert into public.app_config (key, value) values (
  'min_supported',
  jsonb_build_object(
    'ios_min_build', 0,
    'android_min_build', 0,
    'message', 'This version of Compete is no longer supported. Please update to keep using the app.',
    'ios_store_url', 'https://apps.apple.com/app/id6759150538',
    'android_store_url', 'https://play.google.com/store/apps/details?id=com.thecompeteapp.competerf'
  )
) on conflict (key) do nothing;
