// src/viewmodels/hooks/use.refresh.on.refocus.ts
// Re-fetch a screen's data silently when it regains focus (e.g. back from a detail page).
//  - Skips the first focus: the screen's viewmodel already loads on mount, so firing here too
//    would fetch everything twice on every open.
//  - Always calls the LATEST reload (held in a ref), so it uses the current filters/period —
//    a focus callback memoized with [] would otherwise keep the first render's closure.
//  - Pass a silent reload (no RefreshControl `refreshing`): on iOS a programmatic refreshing=true
//    pushes the content down until the load finishes.
import { useCallback, useEffect, useRef } from "react";
import { useFocusEffect } from "expo-router";

export function useRefreshOnRefocus(reload: () => unknown) {
  const latestReload = useRef(reload);
  useEffect(() => {
    latestReload.current = reload;
  }, [reload]);

  const focusedOnce = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (!focusedOnce.current) {
        focusedOnce.current = true;
        return;
      }
      void latestReload.current();
    }, []),
  );
}
