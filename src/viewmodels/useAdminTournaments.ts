// src/viewmodels/useAdminTournaments.ts
// UPDATED: Batch queries replace per-tournament N+1 fetches

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { tournamentService } from "../models/services/tournament.service";
import { useAuthContext } from "../providers/AuthProvider";

export type TournamentStatusFilter =
  | "active"
  | "completed"
  | "cancelled"
  | "archived"
  | "all";
export type SortOption = "date" | "name";

export interface AdminTournamentWithStats {
  id: number;
  name: string;
  game_type: string;
  tournament_format: string;
  tournament_date: string;
  start_time: string;
  status: string;
  venue_id: number;
  venue_name: string;
  director_name: string;
  director_id: number;
  favorites_count: number;
  views_count: number;
  cancelled_at: string | null;
  cancelled_by: number | null;
  cancelled_by_name: string | null;
  cancellation_reason: string | null;
  archived_at: string | null;
  archived_by: number | null;
  archived_by_name: string | null;
}

export interface DirectorSearchResult {
  id: number;
  name: string;
  email: string;
}

export const useAdminTournaments = () => {
  const { profile } = useAuthContext();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tournaments, setTournaments] = useState<AdminTournamentWithStats[]>([]);
  const [processing, setProcessing] = useState<number | null>(null);

  const [statusFilter, setStatusFilter] = useState<TournamentStatusFilter>("active");
  const [sortOption, setSortOption] = useState<SortOption>("date");
  const [searchQuery, setSearchQuery] = useState("");

  const [directorResults, setDirectorResults] = useState<DirectorSearchResult[]>([]);
  const [searchingDirectors, setSearchingDirectors] = useState(false);

  useEffect(() => {
    loadTournaments();
  }, []);

  const loadTournaments = async () => {
    try {
      // ── Step 1: single query for all tournaments with joins ───────────────
      const { data: tournamentsData, error: tournamentsError } = await supabase
        .from("tournaments")
        .select(`
          id, name, game_type, tournament_format, tournament_date,
          start_time, status, venue_id, director_id,
          venues (venue),
          director:profiles!tournaments_director_id_fkey (name),
          cancelled_at, cancelled_by,
          canceller:profiles!tournaments_cancelled_by_fkey (name),
          cancellation_reason,
          archived_at, archived_by,
          archiver:profiles!tournaments_archived_by_fkey (name)
        `)
        .order("tournament_date", { ascending: false });

      if (tournamentsError) {
        console.error("Error loading tournaments:", tournamentsError);
        setTournaments([]);
        return;
      }
      if (!tournamentsData || tournamentsData.length === 0) {
        setTournaments([]);
        return;
      }

      const tournamentIds = tournamentsData.map((t: any) => t.id);

      // ── Step 2: batch favorites count (1 query for all tournaments) ────────
      const { data: favoritesData } = await supabase
        .from("favorites")
        .select("tournament_id")
        .in("tournament_id", tournamentIds);

      const favCountMap: Record<number, number> = {};
      for (const f of favoritesData || []) {
        favCountMap[f.tournament_id] = (favCountMap[f.tournament_id] || 0) + 1;
      }

      // ── Step 3: batch views count (1 query for all tournaments) ───────────
      const { data: viewsData } = await supabase
        .from("tournament_analytics")
        .select("tournament_id")
        .in("tournament_id", tournamentIds)
        .eq("event_type", "view");

      const viewCountMap: Record<number, number> = {};
      for (const v of viewsData || []) {
        viewCountMap[v.tournament_id] = (viewCountMap[v.tournament_id] || 0) + 1;
      }

      // ── Step 4: map into final shape (pure JS, no more DB calls) ──────────
      const tournamentsWithStats: AdminTournamentWithStats[] = tournamentsData.map(
        (t: any) => ({
          id: t.id,
          name: t.name,
          game_type: t.game_type,
          tournament_format: t.tournament_format,
          tournament_date: t.tournament_date,
          start_time: t.start_time,
          status: t.status,
          venue_id: t.venue_id,
          venue_name: t.venues?.venue || "Unknown",
          director_name: t.director?.name || "Unknown Director",
          director_id: t.director_id,
          favorites_count: favCountMap[t.id] || 0,
          views_count: viewCountMap[t.id] || 0,
          cancelled_at: t.cancelled_at,
          cancelled_by: t.cancelled_by,
          cancelled_by_name: t.canceller?.name || null,
          cancellation_reason: t.cancellation_reason,
          archived_at: t.archived_at,
          archived_by: t.archived_by,
          archived_by_name: t.archiver?.name || null,
        }),
      );

      setTournaments(tournamentsWithStats);
    } catch (error) {
      console.error("Error loading admin tournaments:", error);
      setTournaments([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // ── Director search (reassign modal) ─────────────────────────────────────
  const searchDirectors = useCallback(async (query: string) => {
    if (query.length < 2) { setDirectorResults([]); return; }
    setSearchingDirectors(true);
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("id_auto, name, email")
        .or(`name.ilike.%${query}%,email.ilike.%${query}%`)
        .limit(10);
      if (error) { setDirectorResults([]); return; }
      setDirectorResults(
        (data || []).map((u: any) => ({ id: u.id_auto, name: u.name || u.email, email: u.email })),
      );
    } catch { setDirectorResults([]); }
    finally { setSearchingDirectors(false); }
  }, []);

  const clearDirectorResults = useCallback(() => setDirectorResults([]), []);

  // ── Reassign director ─────────────────────────────────────────────────────
  const reassignDirector = useCallback(
    async (tournamentId: number, newDirectorId: number, newDirectorName: string, reason: string): Promise<boolean> => {
      if (!profile?.id_auto) return false;
      const tournament = tournaments.find((t) => t.id === tournamentId);
      if (!tournament) return false;
      setProcessing(tournamentId);
      try {
        const { error: updateError } = await supabase
          .from("tournaments").update({ director_id: newDirectorId }).eq("id", tournamentId);
        if (updateError) throw updateError;

        await supabase.from("reassignment_logs").insert({
          entity_type: "tournament_director", entity_id: tournamentId,
          entity_name: tournament.name,
          previous_user_id: tournament.director_id, previous_user_name: tournament.director_name,
          new_user_id: newDirectorId, new_user_name: newDirectorName,
          reason, reassigned_by: profile.id_auto, reassigned_by_name: profile.name || null,
        });

        await supabase.from("venue_directors").upsert(
          { venue_id: tournament.venue_id, director_id: newDirectorId, assigned_by: profile.id_auto },
          { onConflict: "venue_id,director_id" },
        );

        const { data: newDirProfile } = await supabase
          .from("profiles").select("role").eq("id_auto", newDirectorId).single();
        if (newDirProfile?.role === "basic_user") {
          await supabase.from("profiles").update({ role: "tournament_director" }).eq("id_auto", newDirectorId);
        }

        setTournaments((prev) =>
          prev.map((t) => t.id === tournamentId
            ? { ...t, director_id: newDirectorId, director_name: newDirectorName }
            : t),
        );
        return true;
      } catch (error) {
        console.error("Error reassigning director:", error);
        return false;
      } finally { setProcessing(null); }
    },
    [profile?.id_auto, profile?.name, tournaments],
  );

  // ── Archive / Cancel / Restore / Complete ─────────────────────────────────
  const handleArchiveTournament = useCallback(async (tournamentId: number): Promise<boolean> => {
    if (!profile?.id_auto) return false;
    setProcessing(tournamentId);
    try {
      await tournamentService.archiveTournament(tournamentId, profile.id_auto);
      setTournaments((prev) => prev.map((t) => t.id === tournamentId
        ? { ...t, status: "archived", archived_at: new Date().toISOString(), archived_by: profile.id_auto, archived_by_name: profile.name || null }
        : t));
      return true;
    } catch (error) { console.error("Error archiving:", error); return false; }
    finally { setProcessing(null); }
  }, [profile?.id_auto, profile?.name]);

  const handleCancelTournament = useCallback(async (tournamentId: number, reason: string): Promise<boolean> => {
    if (!profile?.id_auto) return false;
    setProcessing(tournamentId);
    try {
      await tournamentService.cancelTournament(tournamentId, reason, profile.id_auto);
      setTournaments((prev) => prev.map((t) => t.id === tournamentId
        ? { ...t, status: "cancelled", cancelled_at: new Date().toISOString(), cancelled_by: profile.id_auto, cancelled_by_name: profile.name || null, cancellation_reason: reason }
        : t));
      return true;
    } catch (error) { console.error("Error cancelling:", error); return false; }
    finally { setProcessing(null); }
  }, [profile?.id_auto, profile?.name]);

  const handleRestoreTournament = useCallback(async (tournamentId: number): Promise<boolean> => {
    setProcessing(tournamentId);
    try {
      await tournamentService.restoreTournament(tournamentId);
      setTournaments((prev) => prev.map((t) => t.id === tournamentId
        ? { ...t, status: "active", archived_at: null, archived_by: null, archived_by_name: null, cancelled_at: null, cancelled_by: null, cancelled_by_name: null, cancellation_reason: null }
        : t));
      return true;
    } catch (error) { console.error("Error restoring:", error); return false; }
    finally { setProcessing(null); }
  }, []);

  const handleCompleteTournament = useCallback(async (tournamentId: number): Promise<boolean> => {
    setProcessing(tournamentId);
    try {
      await tournamentService.completeTournament(tournamentId);
      setTournaments((prev) => prev.map((t) => t.id === tournamentId ? { ...t, status: "completed" } : t));
      return true;
    } catch (error) { console.error("Error completing:", error); return false; }
    finally { setProcessing(null); }
  }, []);

  // ── Filtering / sorting ───────────────────────────────────────────────────
  const filteredTournaments = useMemo(() => {
    let result = [...tournaments];
    if (statusFilter !== "all") result = result.filter((t) => t.status === statusFilter);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter((t) =>
        t.id.toString().includes(q) ||
        t.name.toLowerCase().includes(q) ||
        t.game_type.toLowerCase().includes(q) ||
        t.venue_name.toLowerCase().includes(q) ||
        t.director_name.toLowerCase().includes(q),
      );
    }
    if (sortOption === "date") {
      result.sort((a, b) => new Date(b.tournament_date).getTime() - new Date(a.tournament_date).getTime());
    } else {
      result.sort((a, b) => a.name.localeCompare(b.name));
    }
    return result;
  }, [tournaments, statusFilter, sortOption, searchQuery]);

  const statusCounts = useMemo(() => ({
    active: tournaments.filter((t) => t.status === "active").length,
    completed: tournaments.filter((t) => t.status === "completed").length,
    cancelled: tournaments.filter((t) => t.status === "cancelled").length,
    archived: tournaments.filter((t) => t.status === "archived").length,
    all: tournaments.length,
  }), [tournaments]);

  const onRefresh = useCallback(() => { setRefreshing(true); loadTournaments(); }, []);

  return {
    loading, refreshing, tournaments, filteredTournaments,
    totalCount: tournaments.length, processing,
    statusFilter, sortOption, searchQuery, statusCounts,
    directorResults, searchingDirectors, searchDirectors, clearDirectorResults,
    onRefresh, setStatusFilter, setSortOption, setSearchQuery,
    archiveTournament: handleArchiveTournament,
    cancelTournament: handleCancelTournament,
    restoreTournament: handleRestoreTournament,
    completeTournament: handleCompleteTournament,
    reassignDirector,
  };
};
