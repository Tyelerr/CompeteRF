-- 20260818140000_gameplay_started_and_eliminations.sql
-- Two authoritative lifecycle signals:
--   1) tournaments.gameplay_started_at — the real moment an event went live (live_state →
--      'in_progress'), set by a trigger so it is written exactly on that transition and NEVER
--      on later edits. Used to pick the primary tournament when a player has several live at
--      once (latest gameplay_started_at wins) instead of the noisy updated_at.
--   2) tournament_players.eliminated_at — a general, durable per-player elimination state for
--      elimination-format events, so a player's run officially ending is a persisted fact
--      (reusable by Tournament View, the review opportunity, notifications, standings,
--      spectator UI, history, analytics) rather than UI loss-inference. The bracket ENGINE
--      determines elimination (a completed match whose loser has no onward path); the app
--      reconciles that set into this column via sync_tournament_eliminations().

-- ── gameplay_started_at ────────────────────────────────────────────────────────────
alter table public.tournaments add column if not exists gameplay_started_at timestamptz;

create or replace function public.set_gameplay_started_at()
  returns trigger
  language plpgsql
as $$
begin
  -- Stamp only on the transition INTO in_progress, and only once (never overwrite / never on
  -- unrelated edits made while already live).
  if new.live_state = 'in_progress'
     and (tg_op = 'INSERT' or old.live_state is distinct from 'in_progress')
     and new.gameplay_started_at is null then
    new.gameplay_started_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_set_gameplay_started_at on public.tournaments;
create trigger trg_set_gameplay_started_at
  before insert or update on public.tournaments
  for each row execute function public.set_gameplay_started_at();

-- Safe fallback for existing live records so multi-live ordering works immediately without
-- breaking anything: seed currently-in-progress events from updated_at (best known start).
update public.tournaments
   set gameplay_started_at = updated_at
 where live_state = 'in_progress' and gameplay_started_at is null;

-- ── eliminated_at (elimination-format per-player run-ended state) ────────────────────
alter table public.tournament_players add column if not exists eliminated_at timestamptz;
create index if not exists idx_tplayers_eliminated on public.tournament_players (tournament_id, eliminated_at);

-- Reconcile the eliminated set for an elimination tournament. The CLIENT computes the set
-- from the bracket engine's resolved graph (loser of a completed match with no onward path);
-- this RPC persists it idempotently and self-corrects on score corrections (clears players no
-- longer eliminated). Authorized to the tournament's managers OR any of its participants
-- (players self-score), and it only ever touches eliminated_at.
create or replace function public.sync_tournament_eliminations(
  p_tournament_id integer,
  p_eliminated_reg_ids integer[]
) returns void
  language plpgsql
  security definer
  set search_path to 'public', 'pg_temp'
as $$
declare
  v_id_auto bigint;
begin
  select id_auto into v_id_auto from public.profiles where id = auth.uid();
  if v_id_auto is null then raise exception 'not authenticated'; end if;

  if not (
    public.can_manage_tournament(p_tournament_id)
    or exists (
      select 1 from public.tournament_players tp
       where tp.tournament_id = p_tournament_id and tp.player_id = v_id_auto
    )
  ) then
    raise exception 'not authorized for this tournament';
  end if;

  -- Stamp newly eliminated (only where not already set).
  update public.tournament_players
     set eliminated_at = now()
   where tournament_id = p_tournament_id
     and id = any(p_eliminated_reg_ids)
     and eliminated_at is null;

  -- Clear anyone previously eliminated who is no longer in the set (score correction / undo).
  update public.tournament_players
     set eliminated_at = null
   where tournament_id = p_tournament_id
     and eliminated_at is not null
     and not (id = any(coalesce(p_eliminated_reg_ids, array[]::integer[])));
end;
$$;

revoke all on function public.sync_tournament_eliminations(integer, integer[]) from public, anon;
grant execute on function public.sync_tournament_eliminations(integer, integer[]) to authenticated;

comment on function public.sync_tournament_eliminations(integer, integer[]) is
  'Reconcile tournament_players.eliminated_at for an elimination event from the client-computed bracket-engine elimination set. Idempotent + self-correcting. Manager- or participant-gated.';
