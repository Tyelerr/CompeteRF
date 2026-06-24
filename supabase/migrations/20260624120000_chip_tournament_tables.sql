-- supabase/migrations/20260624120000_chip_tournament_tables.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Chip Tournament relational data. The format keeps its live state in real,
-- queryable tables (so player stats, match history, and eliminations are owned
-- data — not a JSON blob). See CHIP_TOURNAMENT.md.
--
-- IDs are TEXT to match the engine's client-generated ids (chip.engine.ts).
-- chip_config is 1:1 with a tournament and holds settings + run meta + the queue
-- order (an array of entry ids). RLS: public read (spectator-friendly); writes
-- restricted to the tournament's director (TD/Bar Owner) or an admin.
-- ─────────────────────────────────────────────────────────────────────────────

-- Who may write a tournament's chip data: its director, or an admin.
create or replace function public.is_chip_manager(p_tid bigint)
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.tournaments t
    where t.id = p_tid
      and (
        t.director_id = (select id_auto from public.profiles where id = auth.uid())
        or (select role from public.profiles where id = auth.uid())
             in ('compete_admin', 'super_admin')
      )
  );
$$;

-- ── chip_config (one row per chip tournament) ─────────────────────────────────
create table if not exists public.chip_config (
  tournament_id        bigint primary key references public.tournaments(id) on delete cascade,
  format               text    not null default 'singles',
  performance_tracking boolean not null default true,
  stream_enabled       boolean not null default false,
  winner_stays         boolean not null default true,
  auto_eliminate       boolean not null default true,
  tiers                jsonb   not null default '[]'::jsonb,
  queue                jsonb   not null default '[]'::jsonb, -- ordered entry ids
  started_at           timestamptz,
  finished_at          timestamptz,
  winner_entry_id      text,
  reshuffle_count      int     not null default 0,
  updated_at           timestamptz not null default now()
);

-- ── chip_entries (players / teams) ────────────────────────────────────────────
create table if not exists public.chip_entries (
  id            text primary key,
  tournament_id bigint not null references public.tournaments(id) on delete cascade,
  p1_name       text not null default '',
  p1_fargo      int,
  p1_phone      text,
  p2_name       text,
  p2_fargo      int,
  team_fargo    int,
  start_chips   int  not null default 0,
  chips         int  not null default 0,
  paid          boolean not null default false,
  checked_in    boolean not null default false,
  status        text not null default 'queued',
  wins          int  not null default 0,
  losses        int  not null default 0,
  streak        int  not null default 0,
  best_streak   int  not null default 0,
  eliminations  int  not null default 0,
  table_id      text,
  eliminated_at timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists chip_entries_tid on public.chip_entries(tournament_id);

-- ── chip_tables (physical tables) ─────────────────────────────────────────────
create table if not exists public.chip_tables (
  id            text primary key,
  tournament_id bigint not null references public.tournaments(id) on delete cascade,
  label         text not null default '',
  is_stream     boolean not null default false,
  stream_url    text,
  status        text not null default 'open',
  match_id      text,
  holder_id     text,
  last_loser_id text,
  sort          int not null default 0
);
create index if not exists chip_tables_tid on public.chip_tables(tournament_id);

-- ── chip_matches (append-mostly match log) ────────────────────────────────────
create table if not exists public.chip_matches (
  id            text primary key,
  tournament_id bigint not null references public.tournaments(id) on delete cascade,
  table_id      text not null,
  a_id          text not null,
  b_id          text not null,
  winner_id     text,
  loser_id      text,
  started_at    timestamptz not null default now(),
  ended_at      timestamptz,
  status        text not null default 'in_progress'
);
create index if not exists chip_matches_tid on public.chip_matches(tournament_id);

-- ── chip_events (history timeline) ────────────────────────────────────────────
create table if not exists public.chip_events (
  id            text primary key,
  tournament_id bigint not null references public.tournaments(id) on delete cascade,
  type          text not null,
  text          text not null default '',
  actor_id      bigint,
  payload       jsonb,
  created_at    timestamptz not null default now()
);
create index if not exists chip_events_tid on public.chip_events(tournament_id);

-- ── RLS: public read, manager write ───────────────────────────────────────────
do $$
declare tbl text;
begin
  foreach tbl in array array['chip_config','chip_entries','chip_tables','chip_matches','chip_events']
  loop
    execute format('alter table public.%I enable row level security;', tbl);
    execute format('drop policy if exists %I_read on public.%I;', tbl, tbl);
    execute format('drop policy if exists %I_write on public.%I;', tbl, tbl);
    execute format('create policy %I_read on public.%I for select using (true);', tbl, tbl);
    execute format(
      'create policy %I_write on public.%I for all using (public.is_chip_manager(tournament_id)) with check (public.is_chip_manager(tournament_id));',
      tbl, tbl
    );
  end loop;
end $$;

revoke all on function public.is_chip_manager(bigint) from public, anon;
grant execute on function public.is_chip_manager(bigint) to authenticated;
