import { useEffect, useState } from "react";
import { Alert } from "react-native";
import { supabase } from "../lib/supabase";
import { tournamentService } from "../models/services/tournament.service";
import { Tournament } from "../models/types/tournament.types";
import { useAuthContext } from "../providers/AuthProvider";
import { getNavCache, setNavCache } from "./nav-cache";

export interface BarTournamentWithStats extends Tournament {
  views_count: number;
  favorites_count: number;
  venue_name: string;
  director_name: string;
  can_edit: boolean;
  can_delete: boolean;
}

export type TournamentStatusFilter = "active" | "completed" | "cancelled" | "archived" | "all";
export type SortOption = "date" | "name";
export type SortDirection = "asc" | "desc";

interface StatusCounts {
  active: number;
  completed: number;
  cancelled: number;
  archived: number;
  all: number;
}

export const useBarTournamentManager = () => {
  const { profile } = useAuthContext();

  // Show the last-loaded list instantly on revisit; refresh in the background.
  const cacheKey = `bar-tournaments:${profile?.id_auto ?? "none"}`;
  const cached = getNavCache<{ tournaments: BarTournamentWithStats[]; statusCounts: StatusCounts }>(cacheKey);

  const [loading, setLoading] = useState(!cached);
  const [refreshing, setRefreshing] = useState(false);
  const [processing, setProcessing] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [tournaments, setTournaments] = useState<BarTournamentWithStats[]>(cached?.tournaments ?? []);
  const [filteredTournaments, setFilteredTournaments] = useState<BarTournamentWithStats[]>([]);
  const [statusFilter, setStatusFilter] = useState<TournamentStatusFilter>("active");
  const [sortOption, setSortOption] = useState<SortOption>("date");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusCounts, setStatusCounts] = useState<StatusCounts>(cached?.statusCounts ?? {
    active: 0, completed: 0, cancelled: 0, archived: 0, all: 0,
  });

  const totalCount = tournaments.length;

  useEffect(() => {
    // Background refresh when we already have cached data → no full-screen spinner.
    if (profile?.id_auto) loadTournaments(!!cached);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id_auto]);

  useEffect(() => {
    applyFilters();
  }, [tournaments, statusFilter, sortOption, sortDirection, searchQuery]);

  const loadTournaments = async (background = false) => {
    if (!profile?.id_auto) return;
    try {
      if (!background) setLoading(true);
      const { data: venueOwnerships } = await supabase
        .from("venue_owners")
        .select("venue_id")
        .eq("owner_id", profile.id_auto)
        .is("archived_at", null);

      if (!venueOwnerships || venueOwnerships.length === 0) {
        setTournaments([]);
        const emptyCounts = calculateStatusCounts([]);
        setNavCache(cacheKey, { tournaments: [], statusCounts: emptyCounts });
        return;
      }

      const venueIds = venueOwnerships.map((vo) => vo.venue_id);
      const { data: tournamentData } = await supabase
        .from("tournaments")
        .select(`*, venues (id, venue), profiles!director_id (user_name)`)
        .in("venue_id", venueIds)
        .order("tournament_date", { ascending: false });

      if (!tournamentData) { setTournaments([]); return; }

      const nonDrafts = tournamentData.filter((t: any) => !t.is_draft); // hide unsaved drafts
      const engagement = await loadEngagementCounts(nonDrafts.map((t: any) => t.id as number));

      const tournamentsWithStats: BarTournamentWithStats[] = nonDrafts.map((tournament: any) => ({
        ...tournament,
        venue_name: tournament.venues?.venue || "Unknown",
        director_name: tournament.profiles?.user_name || "Unknown",
        views_count: engagement[tournament.id]?.views ?? 0,
        favorites_count: engagement[tournament.id]?.favorites ?? 0,
        can_edit: true,
        can_delete: tournament.status !== "completed",
      }));

      setTournaments(tournamentsWithStats);
      const counts = calculateStatusCounts(tournamentsWithStats);
      setNavCache(cacheKey, { tournaments: tournamentsWithStats, statusCounts: counts });
    } catch (error) {
      console.error("Error loading tournaments:", error);
      // Silent on background refreshes so a transient blip doesn't nag the user
      // while they're already looking at cached data.
      if (!background) Alert.alert("Error", "Failed to load tournaments. Please try again.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Engagement (views + favorites) counts for a set of tournaments. Fast path is
  // one batched RPC; if that function isn't in the DB yet (migration not applied)
  // or errors, it falls back to the original per-tournament counts so nothing
  // breaks either way.
  const loadEngagementCounts = async (
    ids: number[],
  ): Promise<Record<number, { views: number; favorites: number }>> => {
    const map: Record<number, { views: number; favorites: number }> = {};
    if (ids.length === 0) return map;

    try {
      const { data, error } = await supabase.rpc("bar_tournament_engagement", {
        p_tournament_ids: ids,
      });
      if (!error && Array.isArray(data)) {
        for (const row of data as any[]) {
          map[Number(row.tournament_id)] = {
            views: Number(row.views_count) || 0,
            favorites: Number(row.favorites_count) || 0,
          };
        }
        return map;
      }
    } catch {
      // fall through to the per-tournament fallback below
    }

    // Fallback: per-tournament counts (works before the migration is applied).
    await Promise.all(
      ids.map(async (id) => {
        const { count: viewsCount } = await supabase
          .from("tournament_analytics")
          .select("id", { count: "exact", head: true })
          .eq("tournament_id", id)
          .eq("event_type", "view");
        const { count: favoritesCount } = await supabase
          .from("favorites")
          .select("id", { count: "exact", head: true })
          .eq("tournament_id", id);
        map[id] = { views: viewsCount || 0, favorites: favoritesCount || 0 };
      }),
    );
    return map;
  };

  const calculateStatusCounts = (tournamentList: BarTournamentWithStats[]): StatusCounts => {
    const counts = tournamentList.reduce(
      (acc, t) => { acc.all++; acc[t.status as keyof StatusCounts]++; return acc; },
      { active: 0, completed: 0, cancelled: 0, archived: 0, all: 0 } as StatusCounts,
    );
    setStatusCounts(counts);
    return counts;
  };

  const applyFilters = () => {
    let filtered = [...tournaments];
    if (statusFilter !== "all") filtered = filtered.filter((t) => t.status === statusFilter);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          t.game_type.toLowerCase().includes(q) ||
          t.venue_name.toLowerCase().includes(q) ||
          t.director_name.toLowerCase().includes(q),
      );
    }
    filtered.sort((a, b) => {
      if (sortOption === "date") {
        const diff = new Date(a.tournament_date).getTime() - new Date(b.tournament_date).getTime();
        return sortDirection === "desc" ? -diff : diff;
      }
      const nameDiff = a.name.localeCompare(b.name);
      return sortDirection === "asc" ? nameDiff : -nameDiff;
    });
    setFilteredTournaments(filtered);
  };

  const archiveTournament = async (tournamentId: number): Promise<boolean> => {
    if (!profile?.id_auto) return false;
    try {
      setProcessing(tournamentId);
      await tournamentService.archiveTournament(tournamentId, profile.id_auto);
      await loadTournaments(true);
      return true;
    } catch (error) { console.error("Error archiving tournament:", error); return false; }
    finally { setProcessing(null); }
  };

  const cancelTournament = async (tournamentId: number, reason: string): Promise<boolean> => {
    if (!profile?.id_auto) return false;
    try {
      setProcessing(tournamentId);
      await tournamentService.cancelTournament(tournamentId, reason, profile.id_auto);
      await loadTournaments(true);
      return true;
    } catch (error) { console.error("Error cancelling tournament:", error); return false; }
    finally { setProcessing(null); }
  };

  const restoreTournament = async (tournamentId: number): Promise<boolean> => {
    try {
      setProcessing(tournamentId);
      await tournamentService.restoreTournament(tournamentId);
      await loadTournaments(true);
      return true;
    } catch (error) { console.error("Error restoring tournament:", error); return false; }
    finally { setProcessing(null); }
  };

  // Create a blank "draft" tournament straight from the manager, then open it in
  // the Manage hub (its Settings tab is a full build form). Seeds the required
  // NOT NULL columns with placeholders the owner edits in the hub. Created
  // `active` so it appears on Billiards right away. Returns the new id, or null.
  const createDraftTournament = async (
    source: "compete" | "external" = "compete",
  ): Promise<number | null> => {
    if (!profile?.id_auto) return null;
    try {
      setCreating(true);

      // Reuse this owner's existing unsaved draft instead of inserting a new row
      // every time — backing out of a draft shouldn't burn a new tournament id.
      const { data: existingDraft } = await supabase
        .from("tournaments")
        .select("id")
        .eq("director_id", profile.id_auto)
        .eq("is_draft", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (existingDraft?.id) {
        await supabase
          .from("tournaments")
          .update({ bracket_source: source })
          .eq("id", existingDraft.id);
        return existingDraft.id;
      }

      // Use one of the owner's (non-archived) venues as the default.
      const { data: venueRow } = await supabase
        .from("venue_owners")
        .select("venue_id")
        .eq("owner_id", profile.id_auto)
        .is("archived_at", null)
        .limit(1)
        .maybeSingle();

      if (!venueRow?.venue_id) {
        Alert.alert(
          "Add a Venue First",
          "You need at least one venue before you can create a tournament.",
        );
        return null;
      }

      const now = new Date();
      const localDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
      let timezone = "America/New_York";
      try {
        timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || timezone;
      } catch {
        // keep fallback
      }

      // The fields the owner fills in are left blank — name, game type, format,
      // fees. Date/time are NOT NULL columns, so we seed today's date and a
      // default start time (adjusted in the hub).
      const created = await tournamentService.createTournament({
        director_id: profile.id_auto,
        venue_id: venueRow.venue_id,
        name: "",
        game_type: "" as Tournament["game_type"],
        tournament_format: "" as Tournament["tournament_format"],
        tournament_date: localDate,
        start_time: "19:00",
        timezone,
        reports_to_fargo: false,
        calcutta: false,
        open_tournament: false,
        is_recurring: false,
        status: "active",
        bracket_source: source,
        is_draft: true,
      });

      await loadTournaments(true);
      return created.id;
    } catch (error) {
      console.error("Error creating draft tournament:", error);
      Alert.alert("Error", "Failed to create the tournament. Please try again.");
      return null;
    } finally {
      setCreating(false);
    }
  };

  const onRefresh = () => { setRefreshing(true); loadTournaments(true); };

  return {
    loading, refreshing, processing, creating,
    tournaments: filteredTournaments,
    totalCount,
    statusFilter, sortOption, sortDirection, searchQuery, statusCounts,
    setStatusFilter,
    setSortOption,
    setSortDirection,
    setSearchQuery,
    archiveTournament, cancelTournament, restoreTournament, createDraftTournament, onRefresh,
  };
};

