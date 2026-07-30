// src/viewmodels/hooks/use.unified.player.search.ts
// Debounced, tournament-scoped search for the unified Add Player / Add Team modal.
// Wraps playerRegistrationService so the modal never touches the service/Supabase
// layer. Searches BOTH active and pending players (server-side) and, before the TD
// types, exposes a Recent Players list. Results are keyed on the stable players.id.

import { useCallback, useEffect, useRef, useState } from "react";
import { playerRegistrationService } from "../../models/services/player.registration.service";
import { PlayerSearchResult } from "../../models/types/player.registration.types";

const MIN_QUERY_LENGTH = 2;
const DEBOUNCE_MS = 300;

export const useUnifiedPlayerSearch = (
  tournamentId: number | null,
  limit: number = 20,
) => {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlayerSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [recents, setRecents] = useState<PlayerSearchResult[]>([]);
  const [isLoadingRecents, setIsLoadingRecents] = useState(false);

  // Guards against a slow earlier request overwriting a newer one.
  const requestIdRef = useRef(0);

  useEffect(() => {
    const trimmed = query.trim();

    if (tournamentId == null || trimmed.length < MIN_QUERY_LENGTH) {
      setResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    const requestId = ++requestIdRef.current;

    const timer = setTimeout(async () => {
      try {
        const data = await playerRegistrationService.searchPlayers(
          tournamentId,
          trimmed,
          limit,
        );
        if (requestId === requestIdRef.current) setResults(data);
      } catch {
        if (requestId === requestIdRef.current) setResults([]);
      } finally {
        if (requestId === requestIdRef.current) setIsSearching(false);
      }
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [query, limit, tournamentId]);

  const loadRecents = useCallback(async () => {
    if (tournamentId == null) return;
    setIsLoadingRecents(true);
    try {
      const data = await playerRegistrationService.getRecentPlayers(tournamentId);
      setRecents(data);
    } catch {
      setRecents([]);
    } finally {
      setIsLoadingRecents(false);
    }
  }, [tournamentId]);

  const reset = useCallback(() => {
    requestIdRef.current++;
    setQuery("");
    setResults([]);
    setIsSearching(false);
  }, []);

  return {
    query,
    setQuery,
    results,
    isSearching,
    recents,
    loadRecents,
    isLoadingRecents,
    reset,
  };
};
