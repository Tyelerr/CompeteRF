// src/utils/tournament.archive.ts
// One shared source of truth for a tournament's COMPLETED vs ARCHIVED state.
//
// Completion and archival are separate concepts (see migration
// 20260728120000_tournament_completed_at): `status`/`live_state` say whether the
// event finished; archival is purely organizational and NEVER changes tournament
// data or its inclusion in analytics/reports.
//
// A completed tournament stays in the main "Completed" list for ARCHIVE_AFTER_DAYS,
// then auto-moves to "Archived" — the 30-day case is DERIVED here (no cron/write
// needed). A TD can also archive early by setting archived_at.

export const ARCHIVE_AFTER_DAYS = 30;
const ARCHIVE_AFTER_MS = ARCHIVE_AFTER_DAYS * 24 * 60 * 60 * 1000;

// Loose structural inputs so both the full Tournament model and the leaner
// admin/bar-owner list projections can be passed without casting.
type CompletionFields = { status?: string | null; live_state?: string | null };
type ArchiveFields = CompletionFields & { completed_at?: string | null; archived_at?: string | null };

export const isTournamentCompleted = (t: CompletionFields): boolean =>
  t.status === "completed" || t.live_state === "finished";

// Archived when manually archived (archived_at set) OR completed and 30+ days
// have elapsed since completion. Not-yet-completed tournaments are never archived.
export const isTournamentArchived = (t: ArchiveFields): boolean => {
  if (t.archived_at) return true;
  if (!isTournamentCompleted(t) || !t.completed_at) return false;
  return Date.now() - new Date(t.completed_at).getTime() >= ARCHIVE_AFTER_MS;
};

// Days left before a completed tournament auto-archives (null if not applicable /
// already archived). Handy for a "archives in N days" hint.
export const daysUntilArchived = (t: ArchiveFields): number | null => {
  if (t.archived_at || !isTournamentCompleted(t) || !t.completed_at) return null;
  const elapsed = Date.now() - new Date(t.completed_at).getTime();
  const left = Math.ceil((ARCHIVE_AFTER_MS - elapsed) / (24 * 60 * 60 * 1000));
  return left > 0 ? left : 0;
};
