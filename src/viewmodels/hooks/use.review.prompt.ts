// src/viewmodels/hooks/use.review.prompt.ts
// Player viewmodel for the ONE-TIME "How was <tournament>?" prompt. Business rule: ONE REVIEW
// PER PLAYER PER TOURNAMENT (not per entry / rebuy / team / run). A prompt is offered when the
// player's involvement is authoritatively over — the overall event completed (covers the
// winner, forfeited players and elimination-format players), or the chip engine has marked the
// player eliminated (authoritative persisted status; passed in as eliminatedTournamentId).
// It is shown at most once per (player, tournament): submitting OR dismissing writes the single
// tournament_reviews row (unique on tournament_id + reviewer_id), and this hook filters those
// resolved tournaments out so the prompt never reappears.

import { useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { reviewService } from "../../models/services/review.service";
import { PlayerTournament } from "../../models/types/registration.types";
import { ReviewContext } from "../../models/types/review.types";

interface UseReviewPromptArgs {
  playerId?: number;
  // Completed tournaments the player took part in (participation has ended for all of them).
  completed: PlayerTournament[];
  // Still-LIVE tournaments in which the player's participation has authoritatively ended and
  // so should be prompted immediately (don't wait for the whole event to finish): chip →
  // engine "eliminated" status; elimination → persisted tournament_players.eliminated_at.
  endedLiveTournamentIds?: number[];
}

export const useReviewPrompt = ({
  playerId,
  completed,
  endedLiveTournamentIds = [],
}: UseReviewPromptArgs) => {
  const qc = useQueryClient();

  // Tournaments this player has already reviewed OR dismissed — never prompt for these again.
  const resolvedQuery = useQuery({
    queryKey: ["review-resolved", playerId],
    queryFn: () => reviewService.getResolvedTournamentIds(),
    enabled: !!playerId,
    refetchOnWindowFocus: true,
  });

  // Candidate = the authoritatively-eliminated live event first (chip), then completed events
  // the player actually participated in (exclude cancelled / no-show / removed), minus anything
  // already resolved (submitted or dismissed).
  const EXCLUDED = new Set(["cancelled", "no_show", "removed", "withdrawn"]);
  const candidateId = useMemo(() => {
    const resolved = resolvedQuery.data;
    if (!resolved) return null;
    const ordered: number[] = [...endedLiveTournamentIds];
    for (const t of completed) {
      const id = t.tournament?.id;
      if (id != null && !EXCLUDED.has(String(t.status ?? "").toLowerCase())) ordered.push(id);
    }
    for (const id of ordered) if (!resolved.has(id)) return id;
    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedQuery.data, endedLiveTournamentIds, completed]);

  // Live header context for the prompt/form (name / date / venue / game / format / TD).
  const contextQuery = useQuery({
    queryKey: ["review-context", candidateId],
    queryFn: () => reviewService.getReviewContext(candidateId!),
    enabled: candidateId != null,
  });

  const invalidate = useCallback(() => {
    qc.invalidateQueries({ queryKey: ["review-resolved", playerId] });
  }, [qc, playerId]);

  const submit = useCallback(
    async (rating: number, reasons: string[], comment: string | null) => {
      if (candidateId == null) return;
      const id = candidateId;
      // Persist first; if it throws, the caller keeps the modal open to retry.
      await reviewService.submit(id, rating, reasons, comment);
      // On success, optimistically mark resolved so the modal closes IMMEDIATELY (before the
      // network refetch), then resync with the server.
      qc.setQueryData<Set<number>>(["review-resolved", playerId], (prev) => {
        const next = new Set(prev ?? []);
        next.add(id);
        return next;
      });
      invalidate();
    },
    [candidateId, playerId, qc, invalidate],
  );

  const dismiss = useCallback(async () => {
    if (candidateId == null) return;
    const id = candidateId;
    // Optimistically mark this tournament resolved so the prompt closes IMMEDIATELY (no network
    // wait) and won't reappear this session even if the request fails. Both the X and the
    // Dismiss button route here, so they share this behavior.
    qc.setQueryData<Set<number>>(["review-resolved", playerId], (prev) => {
      const next = new Set(prev ?? []);
      next.add(id);
      return next;
    });
    try {
      await reviewService.dismiss(id);
      invalidate(); // success → resync with the server (the dismissal row now exists)
    } catch {
      // Keep the optimistic close; do NOT invalidate (the server lacks the row) so the modal
      // never reopens in the player's face. A failed dismissal simply isn't persisted — the
      // one-time prompt may return in a future session, which is acceptable.
    }
  }, [candidateId, playerId, qc, invalidate]);

  const context: ReviewContext | null =
    candidateId != null ? contextQuery.data ?? null : null;

  return {
    // Only surface the prompt once its header context has loaded.
    pending: context,
    submit,
    dismiss,
  };
};
