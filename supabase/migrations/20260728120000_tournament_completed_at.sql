-- Separate a tournament's COMPLETION from its ARCHIVED state.
--
-- Before: `status` was a single field (active | cancelled | completed | archived),
-- so archiving OVERWROTE "completed" with "archived". That dropped archived
-- tournaments out of every analytic/report keyed on "completed".
--
-- After:
--   • `status` is the lifecycle only: active | cancelled | completed. A finished
--     tournament STAYS "completed" forever, so it always counts in analytics.
--   • `completed_at` records when it finished (the 30-day retention clock).
--   • `archived_at` is the ONLY archival flag. A tournament is shown under
--     "Archived" when archived_at is set OR 30 days have passed since completed_at
--     (the app derives the 30-day case — no cron needed). Archival is purely
--     organizational; it never deletes or changes tournament data.
--
-- Idempotent + data-preserving.

alter table public.tournaments add column if not exists completed_at timestamptz;

-- Backfill completed_at for anything already finished/completed/archived. Prefer
-- tournament_date (when the event actually happened) over updated_at, since any
-- later edit bumps updated_at and would make an old tournament look freshly
-- completed (and wrongly reset its 30-day archive clock).
update public.tournaments
set completed_at = coalesce(completed_at, archived_at, (tournament_date)::timestamptz, updated_at)
where completed_at is null
  and (status in ('completed', 'archived') or live_state = 'finished');

-- Decouple archival from status: previously-archived tournaments KEEP their
-- completed status (so they still count in analytics) and stay archived via
-- archived_at (already set on those rows).
update public.tournaments
set status = 'completed'
where status = 'archived';

-- Chip tournaments finished via live_state should also carry the completed status
-- so they appear consistently in the Completed list + analytics.
update public.tournaments
set status = 'completed'
where live_state = 'finished' and status not in ('completed', 'cancelled');

-- Normalize the other direction: a bracket tournament completed via the OLD code
-- got status='completed' but never had live_state flipped. Align both fields so
-- completion is represented identically for every tournament type and they can't
-- drift. (Cancelled rows are left alone.)
update public.tournaments
set live_state = 'finished'
where status = 'completed' and coalesce(live_state, '') <> 'finished';
