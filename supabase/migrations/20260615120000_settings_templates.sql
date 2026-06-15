-- Per-TD saved tournament-settings templates (up to 5 each, enforced in app code).
-- The whole settings form is stored as a JSON blob so partial templates are fine.

create table if not exists public.tournament_settings_templates (
  id          bigint generated always as identity primary key,
  user_id     bigint not null references public.profiles(id_auto) on delete cascade,
  name        text   not null,
  settings    jsonb  not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists tournament_settings_templates_user_idx
  on public.tournament_settings_templates (user_id, created_at desc);

alter table public.tournament_settings_templates enable row level security;

-- A TD may read/write only their own templates (user_id = their profiles.id_auto).
drop policy if exists "settings templates select own" on public.tournament_settings_templates;
create policy "settings templates select own"
  on public.tournament_settings_templates for select
  using (user_id = (select id_auto from public.profiles where id = auth.uid()));

drop policy if exists "settings templates insert own" on public.tournament_settings_templates;
create policy "settings templates insert own"
  on public.tournament_settings_templates for insert
  with check (user_id = (select id_auto from public.profiles where id = auth.uid()));

drop policy if exists "settings templates update own" on public.tournament_settings_templates;
create policy "settings templates update own"
  on public.tournament_settings_templates for update
  using (user_id = (select id_auto from public.profiles where id = auth.uid()))
  with check (user_id = (select id_auto from public.profiles where id = auth.uid()));

drop policy if exists "settings templates delete own" on public.tournament_settings_templates;
create policy "settings templates delete own"
  on public.tournament_settings_templates for delete
  using (user_id = (select id_auto from public.profiles where id = auth.uid()));
