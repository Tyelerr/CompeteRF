-- Winner-stays "Waiting to Start" state: a challenger has been pulled from the
-- queue and assigned to face the table's holder, but the match has not started
-- yet (no timer). The TD confirms with Start Match, which begins the match.
alter table public.chip_tables
  add column if not exists pending_challenger_id text;
