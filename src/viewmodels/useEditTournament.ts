import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { tournamentService } from "../models/services/tournament.service";
import { Tournament } from "../models/types/tournament.types";

export interface VenueOption {
  id: number;
  venue: string;
}

export interface DirectorOption {
  id_auto: number;
  name: string;
  user_name: string;
}

export const GAME_TYPE_OPTIONS = [
  { value: "8_ball", label: "8-Ball" },
  { value: "9_ball", label: "9-Ball" },
  { value: "10_ball", label: "10-Ball" },
  { value: "straight_pool", label: "Straight Pool" },
  { value: "one_pocket", label: "One Pocket" },
  { value: "bank_pool", label: "Bank Pool" },
  { value: "snooker", label: "Snooker" },
  { value: "other", label: "Other" },
];

export const FORMAT_OPTIONS = [
  { value: "single_elimination", label: "Single Elimination" },
  { value: "double_elimination", label: "Double Elimination" },
  { value: "round_robin", label: "Round Robin" },
  { value: "swiss", label: "Swiss" },
  { value: "other", label: "Other" },
];

export const TABLE_SIZE_OPTIONS = [
  { value: "7ft", label: "7 ft (Bar Box)" },
  { value: "8ft", label: "8 ft" },
  { value: "9ft", label: "9 ft" },
  { value: "10ft", label: "10 ft" },
  { value: "12ft", label: "12 ft (Snooker)" },
];

export const useEditTournament = (tournamentId: number) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [editedTournament, setEditedTournament] =
    useState<Partial<Tournament> | null>(null);

  // Options for dropdowns
  const [venues, setVenues] = useState<VenueOption[]>([]);
  const [directors, setDirectors] = useState<DirectorOption[]>([]);

  useEffect(() => {
    loadTournament();
    loadVenues();
    loadDirectors();
  }, [tournamentId]);

  const loadTournament = async () => {
    try {
      setLoading(true);
      const data = await tournamentService.getTournament(tournamentId);
      setTournament(data);
      setEditedTournament(data);
    } catch (error) {
      console.error("Error loading tournament:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadVenues = async () => {
    try {
      const { data, error } = await supabase
        .from("venues")
        .select("id, venue")
        .eq("status", "active")
        .order("venue");

      if (error) throw error;
      setVenues(data || []);
    } catch (error) {
      console.error("Error loading venues:", error);
    }
  };

  const loadDirectors = async () => {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("id_auto, name, user_name")
        .in("role", ["tournament_director", "super_admin", "compete_admin"])
        .order("name");

      if (error) throw error;
      setDirectors(data || []);
    } catch (error) {
      console.error("Error loading directors:", error);
    }
  };

  const updateField = useCallback((field: keyof Tournament, value: any) => {
    setEditedTournament((prev) => {
      if (!prev) return prev;

      // Handle open_tournament / max_fargo constraint
      if (field === "open_tournament" && value === true) {
        return {
          ...prev,
          [field]: value,
          max_fargo: undefined, // ✅ Use undefined instead of null
        };
      }

      if (field === "max_fargo" && value !== null && value !== undefined) {
        return { ...prev, [field]: value, open_tournament: false };
      }

      return { ...prev, [field]: value };
    });
  }, []);

  const saveDetails = async (): Promise<boolean> => {
    if (!editedTournament || !tournament) return false;

    setSaving(true);
    try {
      // Build update payload with only changed fields
      const updates: Partial<Tournament> = {};
      const editableFields: (keyof Tournament)[] = [
        "name",
        "description",
        "description_es",
        "venue_id",
        "director_id",
        "game_type",
        "tournament_format",
        "game_spot",
        "race",
        "table_size",
        "equipment",
        "number_of_tables",
        "tournament_date",
        "start_time",
        "timezone",
        "entry_fee",
        "added_money",
        "max_fargo",
        "required_fargo_games",
        "reports_to_fargo",
        "open_tournament",
        "phone_number",
      ];

      editableFields.forEach((field) => {
        if (editedTournament[field] !== tournament[field]) {
          (updates as any)[field] = editedTournament[field];
        }
      });

      if (Object.keys(updates).length === 0) {
        return true; // Nothing to update
      }

      await tournamentService.updateTournament(tournamentId, updates);

      // Reload to get fresh data
      await loadTournament();
      return true;
    } catch (error) {
      console.error("Error saving tournament:", error);
      return false;
    } finally {
      setSaving(false);
    }
  };

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadTournament().finally(() => setRefreshing(false));
  }, [tournamentId]);

  const hasChanges = useCallback(() => {
    if (!tournament || !editedTournament) return false;
    return JSON.stringify(tournament) !== JSON.stringify(editedTournament);
  }, [tournament, editedTournament]);

  return {
    // State
    loading,
    saving,
    refreshing,
    tournament,
    editedTournament,

    // Options
    venues,
    directors,
    gameTypeOptions: GAME_TYPE_OPTIONS,
    formatOptions: FORMAT_OPTIONS,
    tableSizeOptions: TABLE_SIZE_OPTIONS,

    // Actions
    updateField,
    setEditedTournament,
    saveDetails,
    onRefresh,
    hasChanges,
  };
};
