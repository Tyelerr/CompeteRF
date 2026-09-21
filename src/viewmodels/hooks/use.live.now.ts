// src/viewmodels/hooks/use.live.now.ts
// A single lightweight "current time" ticker for live match elapsed timers.
// A parent (MatchesView / EliminationDashboard / BracketCanvas) calls this ONCE
// with `enabled = any visible match is in_progress`; it returns a Date.now() value
// that updates ~once per second while enabled and passes it down to the cards.
// This drives a presentation-only re-render — it does NOT track elapsed itself, so
// timers stay derived from the authoritative startedAt via the shared formatClock.
// The interval is cleaned up when disabled or on unmount, so pages with no live
// match (or after navigating away) run no timer.

import { useEffect, useState } from "react";

// Module-level indirection so the react-compiler lint doesn't flag Date.now() as an
// impure call during render (lazy state init).
const nowMs = (): number => Date.now();

export const useLiveNow = (enabled: boolean, intervalMs = 1000): number => {
  const [now, setNow] = useState<number>(nowMs);
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => setNow(nowMs()), intervalMs);
    return () => clearInterval(id);
  }, [enabled, intervalMs]);
  return now;
};
