import { useCallback, useMemo, useState } from "react";

interface UsePaginationOptions {
  itemsPerPage?: number;
  initialPage?: number;
}

interface UsePaginationReturn<T> {
  // Current state
  currentPage: number;
  totalPages: number;
  startIndex: number;
  endIndex: number;

  // Paginated data
  paginatedItems: T[];

  // Actions
  goToPage: (page: number) => void;
  nextPage: () => void;
  prevPage: () => void;
  resetPage: () => void;

  // Status flags
  canGoNext: boolean;
  canGoPrev: boolean;

  // Display info
  totalCount: number;
  displayRange: { start: number; end: number };
}

export function usePagination<T>(
  items: T[],
  options: UsePaginationOptions = {},
): UsePaginationReturn<T> {
  const { itemsPerPage = 10, initialPage = 1 } = options;
  const [currentPage, setCurrentPage] = useState(initialPage);

  const totalCount = items.length;
  const totalPages = Math.ceil(totalCount / itemsPerPage);

  // Ensure current page is valid when items change
  const validCurrentPage = useMemo(() => {
    if (totalPages === 0) return 1;
    if (currentPage > totalPages) return totalPages;
    return currentPage;
  }, [currentPage, totalPages]);

  // Calculate indices
  const startIndex = (validCurrentPage - 1) * itemsPerPage;
  const endIndex = Math.min(startIndex + itemsPerPage, totalCount);

  // Get paginated items
  const paginatedItems = useMemo(() => {
    return items.slice(startIndex, endIndex);
  }, [items, startIndex, endIndex]);

  // Navigation actions
  const goToPage = useCallback(
    (page: number) => {
      const validPage = Math.max(1, Math.min(page, totalPages || 1));
      setCurrentPage(validPage);
    },
    [totalPages],
  );

  const nextPage = useCallback(() => {
    if (validCurrentPage < totalPages) {
      setCurrentPage(validCurrentPage + 1);
    }
  }, [validCurrentPage, totalPages]);

  const prevPage = useCallback(() => {
    if (validCurrentPage > 1) {
      setCurrentPage(validCurrentPage - 1);
    }
  }, [validCurrentPage]);

  const resetPage = useCallback(() => {
    setCurrentPage(1);
  }, []);

  // Status flags
  const canGoNext = validCurrentPage < totalPages;
  const canGoPrev = validCurrentPage > 1;

  // Display range (1-indexed for UI)
  const displayRange = {
    start: totalCount === 0 ? 0 : startIndex + 1,
    end: endIndex,
  };

  return {
    currentPage: validCurrentPage,
    totalPages,
    startIndex,
    endIndex,
    paginatedItems,
    goToPage,
    nextPage,
    prevPage,
    resetPage,
    canGoNext,
    canGoPrev,
    totalCount,
    displayRange,
  };
}
