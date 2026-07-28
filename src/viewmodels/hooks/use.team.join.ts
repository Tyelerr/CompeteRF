// src/viewmodels/hooks/use.team.join.ts
// The link-opener's side: validate a shared invite token and let the current
// user claim the open partner slot with their OWN Fargo (join_team_by_token).
// Used by the /join deep link → tournament-detail join banner.

import { useCallback, useEffect, useState } from "react";
import { teamService } from "../../models/services/team.service";
import { tournamentService } from "../../models/services/tournament.service";
import { TeamInviteInfo } from "../../models/types/team.types";
import { ChipChartRange, parseChipChart } from "../../utils/chip-chart";

export const useTeamJoin = (token?: string) => {
  const [info, setInfo] = useState<TeamInviteInfo | null>(null);
  const [chipChart, setChipChart] = useState<ChipChartRange[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [joined, setJoined] = useState(false);

  const refresh = useCallback(async () => {
    if (!token) {
      setInfo(null);
      setChipChart([]);
      return;
    }
    setLoading(true);
    try {
      const res = await teamService.getInviteByToken(token);
      setInfo(res);
      // Pull the tournament's saved chip chart so the join modal can show the
      // live team Fargo → chips (same data the Rating / Chip Chart renders).
      if (res?.tournament_id) {
        const t = await tournamentService.getTournament(res.tournament_id);
        setChipChart(parseChipChart((t as any)?.chip_ranges));
      } else {
        setChipChart([]);
      }
    } catch {
      setInfo(null);
      setChipChart([]);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const join = useCallback(
    async (fargo: number | null) => {
      if (!token) return;
      setBusy(true);
      try {
        await teamService.joinByToken(token, fargo);
        setJoined(true);
      } finally {
        setBusy(false);
      }
    },
    [token],
  );

  return { info, chipChart, loading, busy, joined, join, refresh };
};
