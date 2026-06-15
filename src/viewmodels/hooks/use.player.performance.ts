// src/viewmodels/hooks/use.player.performance.ts
// Profile Performance Snapshot data: fetch the player's tournament history once,
// then derive the stats for the selected time window client-side.

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { registrationService } from "../../models/services/registration.service";
import {
  computePlayerPerformance,
  PERIODS,
  PeriodKey,
} from "../../utils/player.performance";

export const usePlayerPerformance = (playerId?: number) => {
  const [period, setPeriod] = useState<PeriodKey>("ALL");

  const { data, isLoading } = useQuery({
    queryKey: ["player-history", playerId],
    queryFn: () => registrationService.getPlayerHistory(playerId!),
    enabled: !!playerId,
  });

  const days = PERIODS.find((p) => p.key === period)?.days ?? null;
  const stats = useMemo(
    () => computePlayerPerformance(data ?? [], days, Date.now()),
    [data, days],
  );

  return { stats, period, setPeriod, loading: isLoading, hasData: (data?.length ?? 0) > 0 };
};
