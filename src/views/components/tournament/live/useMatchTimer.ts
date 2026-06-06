// src/views/components/tournament/live/useMatchTimer.ts
// Ticks once a second while a match is running and reports elapsed time + whether
// the match has gone past its allowed (overtime) window. Frozen for completed
// matches via the optional endAt.

import { useEffect, useState } from "react";

export interface MatchTimer {
  elapsedSeconds: number;
  isOvertime: boolean;
}

export const useMatchTimer = (
  startedAt: string | null,
  allowedSeconds: number,
  running: boolean,
  endAt?: string | null,
): MatchTimer => {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [running]);

  if (!startedAt) return { elapsedSeconds: 0, isOvertime: false };

  const startMs = new Date(startedAt).getTime();
  const endMs = running ? now : endAt ? new Date(endAt).getTime() : now;
  const elapsedSeconds = Math.max(0, (endMs - startMs) / 1000);
  return { elapsedSeconds, isOvertime: elapsedSeconds > allowedSeconds };
};
