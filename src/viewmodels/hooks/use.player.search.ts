// src/viewmodels/hooks/use.player.search.ts
// Debounced profile search for the TD "Add Player" flow. Wraps
// profileService.searchProfiles so screens never touch the service/Supabase
// layer directly. Results carry id_auto + name + user_name so the TD can
// disambiguate same-named players by their player ID.

import { useEffect, useRef, useState } from "react";
import { profileService } from "../../models/services/profile.service";
import { Profile } from "../../models/types/profile.types";

const MIN_QUERY_LENGTH = 2;
const DEBOUNCE_MS = 300;

export const usePlayerSearch = (limit: number = 20) => {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Profile[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Guards against a slow earlier request overwriting a newer one.
  const requestIdRef = useRef(0);

  useEffect(() => {
    const trimmed = query.trim();

    if (trimmed.length < MIN_QUERY_LENGTH) {
      setResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    const requestId = ++requestIdRef.current;

    const timer = setTimeout(async () => {
      try {
        const data = await profileService.searchProfiles(trimmed, limit);
        if (requestId === requestIdRef.current) setResults(data);
      } catch {
        if (requestId === requestIdRef.current) setResults([]);
      } finally {
        if (requestId === requestIdRef.current) setIsSearching(false);
      }
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [query, limit]);

  const reset = () => {
    requestIdRef.current++;
    setQuery("");
    setResults([]);
    setIsSearching(false);
  };

  return { query, setQuery, results, isSearching, reset };
};
