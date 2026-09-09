// src/viewmodels/hooks/use.reviews.ts
// Management viewmodel for the Message Center → Reviews tab. Owns the search / filter / sort
// state and runs a single server-side, PAGINATED query (RLS scopes rows to the caller's
// authority, so a Bar Owner sees only their venues and a TD only tournaments they directed).
// "Load More" fetches the next page while preserving the current search/filters/sort. Also
// exposes the unread count for the tab badge and a reply action.

import { useCallback, useMemo, useState } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { reviewService } from "../../models/services/review.service";
import {
  ReviewFilters,
  ReviewSort,
  TournamentReview,
} from "../../models/types/review.types";

const PAGE = 25;

export const useReviews = () => {
  const qc = useQueryClient();
  const [filters, setFilters] = useState<ReviewFilters>({});
  const [sort, setSort] = useState<ReviewSort>("recent");
  const [view, setView] = useState<"active" | "archived">("active");

  // Per-management-user archived review ids (stable, filter-independent). Splits Active/Archived.
  const archivedQuery = useQuery({
    queryKey: ["reviews-archived-ids"],
    queryFn: () => reviewService.getArchivedReviewIds(),
    staleTime: 30000,
  });
  const archivedIds = useMemo(() => archivedQuery.data ?? [], [archivedQuery.data]);

  // Infinite/paginated query — the queryKey carries filters+sort+view+archivedIds, so changing any
  // of them resets pagination; Load More appends the next server page.
  const query = useInfiniteQuery({
    queryKey: ["reviews", filters, sort, view, archivedIds],
    queryFn: ({ pageParam = 0 }) =>
      reviewService.getReviews(filters, sort, PAGE, pageParam, { mode: view, ids: archivedIds }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce((n, p) => n + p.reviews.length, 0);
      return loaded < lastPage.total ? loaded : undefined;
    },
  });

  const reviews = useMemo(
    () => query.data?.pages.flatMap((p) => p.reviews) ?? [],
    [query.data],
  );
  const total = query.data?.pages[0]?.total ?? 0;

  const unreadQuery = useQuery({
    queryKey: ["reviews-unread"],
    queryFn: () => reviewService.getUnreadCount(),
    refetchInterval: 30000,
    refetchOnWindowFocus: true,
  });

  // Filter facets (venues/directors) — keyed WITHOUT filters/sort so the selector options stay
  // stable regardless of the active filters (fixes the disappearing Venue/Director selector).
  const facetsQuery = useQuery({
    queryKey: ["reviews-facets"],
    queryFn: () => reviewService.getFilterFacets(),
    staleTime: 60000,
  });

  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (filters.venueId != null) n++;
    if (filters.directorId != null) n++;
    if (filters.gameType) n++;
    if (filters.format) n++;
    if (filters.ratings && filters.ratings.length > 0) n++;
    if (filters.tournamentId != null) n++;
    if (filters.dateFrom || filters.dateTo) n++;
    return n;
  }, [filters]);

  const clearFilters = useCallback(() => setFilters({}), []);

  const markRead = useCallback(
    async (reviewId: string) => {
      await reviewService.markRead(reviewId);
      qc.invalidateQueries({ queryKey: ["reviews-unread"] });
      qc.invalidateQueries({ queryKey: ["reviews"] });
    },
    [qc],
  );

  const reply = useCallback(
    async (review: TournamentReview, senderAuthUuid: string, body: string) => {
      const convId = await reviewService.reply(review, senderAuthUuid, body);
      qc.invalidateQueries({ queryKey: ["reviews"] });
      return convId;
    },
    [qc],
  );

  const archiveReview = useCallback(
    async (reviewId: string, archived: boolean) => {
      await reviewService.setReviewArchived(reviewId, archived);
      qc.invalidateQueries({ queryKey: ["reviews-archived-ids"] });
      qc.invalidateQueries({ queryKey: ["reviews"] });
    },
    [qc],
  );

  return {
    reviews,
    total,
    isLoading: query.isLoading,
    refetch: query.refetch,
    hasMore: !!query.hasNextPage,
    loadMore: query.fetchNextPage,
    isLoadingMore: query.isFetchingNextPage,
    filters,
    setFilters,
    clearFilters,
    activeFilterCount,
    sort,
    setSort,
    unreadCount: unreadQuery.data ?? 0,
    venueOptions: facetsQuery.data?.venues ?? [],
    directorOptions: facetsQuery.data?.directors ?? [],
    view,
    setView,
    markRead,
    reply,
    archiveReview,
  };
};
