// src/models/services/review.service.ts
// Data access for Tournament Reviews (tournament_reviews). Business rule: ONE REVIEW PER
// PLAYER PER TOURNAMENT (unique tournament_id + reviewer_id). Writes go through SECURITY
// DEFINER RPCs (submit / dismiss / mark-read / link-conversation) which enforce
// participation + idempotency + management authorization; reads are RLS-scoped so a Bar
// Owner sees only their venues' reviews and a TD only tournaments they directed.
//
// Replies REUSE the existing conversations system (conversationService) so a management
// reply lands in the player's normal Profile → Inbox and the thread renders with the
// existing messaging UI.

import { supabase } from "../../lib/supabase";
import { conversationService } from "./conversation.service";
import {
  ReviewContext,
  ReviewFilters,
  ReviewSort,
  TournamentReview,
} from "../types/review.types";

const rowToReview = (r: any): TournamentReview => ({
  id: r.id,
  tournamentId: r.tournament_id,
  reviewerId: r.reviewer_id,
  reviewerIdAuto: r.reviewer_id_auto ?? null,
  venueId: r.venue_id ?? null,
  tournamentDirectorId: r.tournament_director_id ?? null,
  tournamentName: r.tournament_name ?? null,
  tournamentDate: r.tournament_date ?? null,
  gameType: r.game_type ?? null,
  tournamentFormat: r.tournament_format ?? null,
  venueName: r.venue_name ?? null,
  directorName: r.director_name ?? null,
  rating: r.rating ?? null,
  selectedReasons: r.selected_reasons ?? [],
  selectedReason: r.selected_reason ?? null,
  comment: r.comment ?? null,
  submittedAt: r.submitted_at ?? null,
  dismissedAt: r.dismissed_at ?? null,
  conversationId: r.conversation_id ?? null,
  replyCount: r.reply_count ?? 0,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const SORT_COLUMN: Record<ReviewSort, { col: string; asc: boolean }> = {
  recent: { col: "submitted_at", asc: false },
  oldest: { col: "submitted_at", asc: true },
  highest: { col: "rating", asc: false },
  lowest: { col: "rating", asc: true },
  tdate_new: { col: "tournament_date", asc: false },
  tdate_old: { col: "tournament_date", asc: true },
};

const escapeLike = (s: string): string => s.replace(/[%,()]/g, " ").trim();

export const reviewService = {
  // ── Player side ───────────────────────────────────────────────────────────
  // Submit (idempotent via the RPC's unique key). Returns the review id.
  async submit(
    tournamentId: number,
    rating: number,
    selectedReasons: string[],
    comment: string | null,
  ): Promise<string> {
    const { data, error } = await supabase.rpc("submit_tournament_review", {
      p_tournament_id: tournamentId,
      p_rating: rating,
      p_selected_reasons: selectedReasons,
      p_comment: comment,
    });
    if (error) throw error;
    return data as string;
  },

  // Dismiss the one-time opportunity (player tapped X). Idempotent.
  async dismiss(tournamentId: number): Promise<void> {
    const { error } = await supabase.rpc("dismiss_tournament_review", {
      p_tournament_id: tournamentId,
    });
    if (error) throw error;
  },

  // Tournament ids the player has already resolved (submitted OR dismissed) — so the
  // one-time prompt is never shown again for them. RLS returns only the caller's rows.
  async getResolvedTournamentIds(): Promise<Set<number>> {
    const { data, error } = await supabase
      .from("tournament_reviews")
      .select("tournament_id");
    if (error) throw error;
    return new Set((data ?? []).map((r: any) => r.tournament_id as number));
  },

  // Live header context for the prompt/form (no review row exists yet).
  async getReviewContext(tournamentId: number): Promise<ReviewContext | null> {
    const { data, error } = await supabase
      .from("tournaments")
      .select(
        "id, name, tournament_date, game_type, tournament_format, director_id, venues:venue_id (venue)",
      )
      .eq("id", tournamentId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const t = data as any;
    let directorName: string | null = null;
    if (t.director_id != null) {
      const { data: dp } = await supabase
        .from("profiles")
        .select("first_name, last_name, name, user_name")
        .eq("id_auto", t.director_id)
        .maybeSingle();
      if (dp) {
        const full = [dp.first_name, dp.last_name].filter(Boolean).join(" ").trim();
        directorName = full || dp.name || dp.user_name || null;
      }
    }
    return {
      tournamentId: t.id,
      tournamentName: t.name ?? null,
      tournamentDate: t.tournament_date ?? null,
      gameType: t.game_type ?? null,
      tournamentFormat: t.tournament_format ?? null,
      venueName: t.venues?.venue ?? null,
      directorName,
    };
  },

  // ── Management side ─────────────────────────────────────────────────────────
  // Filtered / sorted / paginated review list. RLS scopes rows to the caller's authority.
  // Returns the page of reviews plus the TOTAL matching count (for "N of M").
  async getReviews(
    filters: ReviewFilters,
    sort: ReviewSort,
    limit = 25,
    offset = 0,
    // Active/Archived split: pass the caller's archived review ids. "active" excludes them,
    // "archived" shows only them. Archive state is per-management-user (tournament_review_archives).
    archiveScope?: { mode: "active" | "archived"; ids: string[] },
  ): Promise<{ reviews: TournamentReview[]; total: number }> {
    let q = supabase
      .from("tournament_reviews")
      .select("*", { count: "exact" })
      .not("submitted_at", "is", null);

    if (archiveScope) {
      const idList = archiveScope.ids;
      if (archiveScope.mode === "archived") {
        if (idList.length === 0) return { reviews: [], total: 0 };
        q = q.in("id", idList);
      } else if (idList.length > 0) {
        q = q.not("id", "in", `(${idList.map((i) => `"${i}"`).join(",")})`);
      }
    }

    if (filters.venueId != null) q = q.eq("venue_id", filters.venueId);
    if (filters.directorId != null) q = q.eq("tournament_director_id", filters.directorId);
    if (filters.gameType) q = q.eq("game_type", filters.gameType);
    if (filters.format) q = q.eq("tournament_format", filters.format);
    if (filters.tournamentId != null) q = q.eq("tournament_id", filters.tournamentId);
    if (filters.ratings && filters.ratings.length > 0)
      q = q.in("rating", filters.ratings);
    if (filters.dateFrom) q = q.gte("tournament_date", filters.dateFrom);
    if (filters.dateTo) q = q.lte("tournament_date", filters.dateTo);

    const raw = (filters.search ?? "").trim();
    if (raw) {
      const term = escapeLike(raw);
      // Resolve players whose name/username matches, so the one global box also searches
      // the reviewer (their identity isn't a column on the review row).
      const { data: ppl } = await supabase
        .from("profiles")
        .select("id_auto")
        .or(
          `user_name.ilike.%${term}%,first_name.ilike.%${term}%,last_name.ilike.%${term}%,name.ilike.%${term}%`,
        )
        .limit(50);
      const ids = (ppl ?? []).map((p: any) => p.id_auto).filter((n: any) => n != null);
      const ors = [
        `tournament_name.ilike.%${term}%`,
        `venue_name.ilike.%${term}%`,
        `director_name.ilike.%${term}%`,
        `game_type.ilike.%${term}%`,
        `tournament_format.ilike.%${term}%`,
        `selected_reason.ilike.%${term}%`,
        `comment.ilike.%${term}%`,
      ];
      // Tournament ID equality: match whether the user types just the number or the ID exactly
      // as shown in the UI ("4218", "ID: 4218", "ID 4218", "#4218"). Normalize by stripping an
      // optional ID/# prefix; only when the query is purely an ID reference (all digits after the
      // prefix) — so a phrase like "9-ball" never spuriously matches tournament #9.
      const idMatch = raw.match(/^(?:id\s*:?\s*|#\s*)?(\d+)$/i);
      if (idMatch) ors.push(`tournament_id.eq.${idMatch[1]}`);
      if (ids.length) ors.push(`reviewer_id_auto.in.(${ids.join(",")})`);
      q = q.or(ors.join(","));
    }

    const s = SORT_COLUMN[sort];
    q = q.order(s.col, { ascending: s.asc, nullsFirst: false }).range(offset, offset + limit - 1);

    const { data, error, count } = await q;
    if (error) throw error;
    const reviews = (data ?? []).map(rowToReview);
    await reviewService.enrich(reviews);
    return { reviews, total: count ?? reviews.length };
  },

  // Stable filter facets (venues + directors) for the management filter selectors — derived
  // from ALL of the caller's submitted reviews (RLS-scoped), INDEPENDENT of the active
  // search/rating/game/format/date filters. This is what keeps the Venue/Director selectors
  // from appearing/disappearing as other filters change. No unauthorized names leak (RLS).
  async getFilterFacets(): Promise<{
    venues: { value: string; label: string }[];
    directors: { value: string; label: string }[];
  }> {
    const { data, error } = await supabase
      .from("tournament_reviews")
      .select("venue_id, venue_name, tournament_director_id, director_name")
      .not("submitted_at", "is", null)
      .limit(2000);
    if (error) throw error;
    const venues = new Map<number, string>();
    const directors = new Map<number, string>();
    for (const r of (data ?? []) as any[]) {
      if (r.venue_id != null && r.venue_name) venues.set(r.venue_id, r.venue_name);
      if (r.tournament_director_id != null && r.director_name)
        directors.set(r.tournament_director_id, r.director_name);
    }
    return {
      venues: Array.from(venues, ([id, name]) => ({ value: String(id), label: name })),
      directors: Array.from(directors, ([id, name]) => ({ value: String(id), label: name })),
    };
  },

  // One review with reviewer identity + my read flag (for the detail view).
  async getReview(id: string): Promise<TournamentReview | null> {
    const { data, error } = await supabase
      .from("tournament_reviews")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const review = rowToReview(data);
    await reviewService.enrich([review]);
    return review;
  },

  // Attach reviewer name/username + readByMe to a set of reviews (batched lookups).
  async enrich(reviews: TournamentReview[]): Promise<void> {
    if (reviews.length === 0) return;
    const idAutos = Array.from(
      new Set(reviews.map((r) => r.reviewerIdAuto).filter((n): n is number => n != null)),
    );
    if (idAutos.length) {
      const { data: ppl } = await supabase
        .from("profiles")
        .select("id_auto, user_name, first_name, last_name, name")
        .in("id_auto", idAutos);
      const byId = new Map<number, any>();
      for (const p of ppl ?? []) byId.set(p.id_auto, p);
      for (const r of reviews) {
        const p = r.reviewerIdAuto != null ? byId.get(r.reviewerIdAuto) : null;
        if (p) {
          const full = [p.first_name, p.last_name].filter(Boolean).join(" ").trim();
          r.reviewerName = full || p.name || null;
          r.reviewerUsername = p.user_name ?? null;
        }
      }
    }
    const { data: auth } = await supabase.auth.getUser();
    const me = auth?.user?.id;
    if (me) {
      const { data: reads } = await supabase
        .from("tournament_review_reads")
        .select("review_id")
        .eq("viewer_id", me)
        .in(
          "review_id",
          reviews.map((r) => r.id),
        );
      const readSet = new Set((reads ?? []).map((x: any) => x.review_id));
      for (const r of reviews) r.readByMe = readSet.has(r.id);
    }
  },

  async markRead(reviewId: string): Promise<void> {
    const { error } = await supabase.rpc("mark_review_read", { p_review_id: reviewId });
    if (error) throw error;
  },

  // Count of submitted reviews (in the caller's scope) that the caller hasn't opened yet.
  async getUnreadCount(): Promise<number> {
    const { data, error } = await supabase
      .from("tournament_reviews")
      .select("id")
      .not("submitted_at", "is", null);
    if (error) throw error;
    const ids = (data ?? []).map((r: any) => r.id as string);
    if (ids.length === 0) return 0;
    const { data: auth } = await supabase.auth.getUser();
    const me = auth?.user?.id;
    if (!me) return 0;
    const { data: reads } = await supabase
      .from("tournament_review_reads")
      .select("review_id")
      .eq("viewer_id", me);
    const readSet = new Set((reads ?? []).map((x: any) => x.review_id));
    return ids.filter((id) => !readSet.has(id)).length;
  },

  // Management reply → reuses conversations. Creates the review thread on first reply
  // (so it lands in the player's Inbox), then links it back onto the review.
  async reply(
    review: TournamentReview,
    senderAuthUuid: string,
    body: string,
  ): Promise<string> {
    // A manager replying to their OWN review has no meaningful recipient, and creating the
    // conversation would try to add the same user as both creator and recipient (duplicate
    // participant). Block it cleanly instead of hitting a unique-constraint error.
    if (senderAuthUuid === review.reviewerId) {
      throw new Error("You can't reply to your own review.");
    }
    // ONE review = ONE conversation. Read the currently-linked conversation from the DB (the
    // source of truth) rather than the passed review object, which can be stale — otherwise a
    // second reply keeps seeing conversationId=null and creates duplicate conversations.
    const { data: cur, error: curErr } = await supabase
      .from("tournament_reviews")
      .select("conversation_id")
      .eq("id", review.id)
      .maybeSingle();
    if (curErr) throw curErr;
    let convId: string | null = cur?.conversation_id ?? null;

    if (convId) {
      // Reuse the existing thread — append the message.
      await conversationService.sendReply(convId, senderAuthUuid, body);
    } else {
      // First reply — create the single thread with this message as its first message.
      convId = await conversationService.createConversation({
        createdBy: senderAuthUuid,
        recipientId: review.reviewerId,
        subject: `Re: your review of ${review.tournamentName ?? "the tournament"}`,
        category: "review",
        tournamentId: review.tournamentId,
        isSupport: false,
        firstMessage: body,
      });
    }
    // Link (idempotent: coalesce keeps the first linked id) + bump reply_count.
    const { error } = await supabase.rpc("link_review_conversation", {
      p_review_id: review.id,
      p_conversation_id: convId,
    });
    if (error) throw error;
    return convId;
  },

  // ── Archive (per-management-user) ───────────────────────────────────────────
  // Review ids the caller has archived (RLS returns only the caller's own rows).
  async getArchivedReviewIds(): Promise<string[]> {
    const { data, error } = await supabase
      .from("tournament_review_archives")
      .select("review_id");
    if (error) throw error;
    return (data ?? []).map((r: any) => r.review_id as string);
  },

  // Archive / unarchive a review for the current management user (couples to their conversation
  // participant row so the player's replies are blocked while archived). Never touches the review.
  async setReviewArchived(reviewId: string, archived: boolean): Promise<void> {
    const { error } = await supabase.rpc("set_review_archived", {
      p_review_id: reviewId,
      p_archived: archived,
    });
    if (error) throw error;
  },

  // All of the player's OWN submitted reviews (RLS: reviewer_id = auth.uid()). Used to enrich the
  // player's Inbox review-conversation rows with venue / tournament / rating context.
  async getMyReviews(): Promise<TournamentReview[]> {
    const { data: auth } = await supabase.auth.getUser();
    const me = auth?.user?.id;
    if (!me) return [];
    const { data, error } = await supabase
      .from("tournament_reviews")
      .select("*")
      .eq("reviewer_id", me)
      .not("submitted_at", "is", null);
    if (error) throw error;
    return (data ?? []).map(rowToReview);
  },

  // The player's OWN review for a tournament (RLS: reviewer_id = auth.uid()). Used to build the
  // review context header shown above a review-category conversation in the player's Inbox.
  async getMyReviewForTournament(tournamentId: number): Promise<TournamentReview | null> {
    const { data: auth } = await supabase.auth.getUser();
    const me = auth?.user?.id;
    if (!me) return null;
    const { data, error } = await supabase
      .from("tournament_reviews")
      .select("*")
      .eq("tournament_id", tournamentId)
      .eq("reviewer_id", me)
      .not("submitted_at", "is", null)
      .maybeSingle();
    if (error) throw error;
    return data ? rowToReview(data) : null;
  },
};
