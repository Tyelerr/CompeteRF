// src/models/types/review.types.ts
// Types for the Tournament Reviews feature. Business rule: ONE REVIEW PER PLAYER PER
// TOURNAMENT (not per entry / rebuy / team membership / run) — enforced by the unique
// (tournament_id, reviewer_id) constraint. It is private operational feedback for the venue's
// Bar Owner and the Tournament Director. Mirrors the tournament_reviews table (snake_case
// columns) via the service mappers.

export type ReviewRating = 1 | 2 | 3 | 4 | 5;

// A submitted (or opportunity) review row, camelCased for the app.
export interface TournamentReview {
  id: string;
  tournamentId: number;
  reviewerId: string; // player auth uuid
  reviewerIdAuto: number | null;
  venueId: number | null;
  tournamentDirectorId: number | null;
  // snapshots
  tournamentName: string | null;
  tournamentDate: string | null;
  gameType: string | null;
  tournamentFormat: string | null;
  venueName: string | null;
  directorName: string | null;
  // content
  rating: number | null;
  selectedReasons: string[]; // structured multi-select reasons (source of truth → chips)
  selectedReason: string | null; // derived join of selectedReasons (search/display fallback)
  comment: string | null;
  // lifecycle
  submittedAt: string | null;
  dismissedAt: string | null;
  // reply linkage
  conversationId: string | null;
  replyCount: number;
  createdAt: string;
  updatedAt: string;
  // joined / derived (management display)
  reviewerName?: string | null;
  reviewerUsername?: string | null;
  readByMe?: boolean;
}

// The header context shown on the review PROMPT/form before submission (resolved live from
// the tournament, since no review row exists yet).
export interface ReviewContext {
  tournamentId: number;
  tournamentName: string | null;
  tournamentDate: string | null;
  gameType: string | null;
  tournamentFormat: string | null;
  venueName: string | null;
  directorName: string | null;
}

export interface ReviewFilters {
  search?: string;
  venueId?: number | null;
  directorId?: number | null;
  gameType?: string | null;
  format?: string | null;
  ratings?: number[]; // multi-select star ratings (empty/undefined = all ratings)
  tournamentId?: number | null;
  dateFrom?: string | null; // tournament_date >=
  dateTo?: string | null; // tournament_date <=
}

export type ReviewSort =
  | "recent" // submitted_at desc (default)
  | "oldest" // submitted_at asc
  | "highest" // rating desc
  | "lowest" // rating asc
  | "tdate_new" // tournament_date desc
  | "tdate_old"; // tournament_date asc

export const REVIEW_SORT_LABELS: Record<ReviewSort, string> = {
  recent: "Most Recent",
  oldest: "Oldest",
  highest: "Highest Rated",
  lowest: "Lowest Rated",
  tdate_new: "Tournament Date: Newest",
  tdate_old: "Tournament Date: Oldest",
};

// Short labels for the compact "Sort: …" button (full labels stay in the Sort modal).
export const REVIEW_SORT_SHORT: Record<ReviewSort, string> = {
  recent: "Most Recent",
  oldest: "Oldest",
  highest: "Highest",
  lowest: "Lowest",
  tdate_new: "Date Newest",
  tdate_old: "Date Oldest",
};

// Per-rating prompt title + the 2–3 quick reason chips (spec §14). Kept short by design.
export const REVIEW_QUESTIONS: Record<
  ReviewRating,
  { prompt: string; options: string[] }
> = {
  5: {
    prompt: "What made it great?",
    options: ["Well organized", "Great communication", "Great venue / equipment"],
  },
  4: {
    prompt: "What could have made it even better?",
    options: ["Organization / wait times", "Communication / rules", "Venue / equipment"],
  },
  3: {
    prompt: "What could be improved?",
    options: ["Organization / wait times", "Communication / rules", "Venue / equipment"],
  },
  2: {
    prompt: "What was the main issue?",
    options: ["Poor organization / long waits", "Communication / rules issues", "Venue / equipment problems"],
  },
  1: {
    prompt: "What was the biggest problem?",
    options: ["Tournament organization", "Communication / rules", "Venue / equipment / safety"],
  },
};
