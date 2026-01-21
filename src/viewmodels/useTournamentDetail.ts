import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, Linking } from "react-native";
import { supabase } from "../lib/supabase";
import { useAuthContext } from "../providers/AuthProvider";

interface Tournament {
  id: number;
  name: string;
  description: string;
  game_type: string;
  tournament_format: string;
  tournament_date: string;
  start_time: string;
  timezone: string;
  entry_fee: number;
  added_money: number;
  max_fargo: number | null;
  reports_to_fargo: boolean;
  open_tournament: boolean;
  is_recurring: boolean;
  status: string;
  director_id: number;
  venues: {
    id: number;
    venue: string;
    address: string;
    city: string;
    state: string;
    zip_code: string;
    phone: string;
  };
}

interface UseTournamentDetailReturn {
  // State
  loading: boolean;
  tournament: Tournament | null;
  error: string;
  deleting: boolean;

  // Computed
  isDirector: boolean;
  canEdit: boolean;
  isDeleted: boolean;

  // Formatted values
  formattedDate: string;
  formattedTime: string;
  formattedEntryFee: string;

  // Actions
  openMaps: () => void;
  callVenue: () => void;
  handleEdit: () => void;
  handleDelete: () => void;
  goBack: () => void;
}

export const useTournamentDetail = (
  tournamentId: string,
): UseTournamentDetailReturn => {
  const router = useRouter();
  const { profile } = useAuthContext();

  const [loading, setLoading] = useState(true);
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (tournamentId) {
      loadTournament();
    }
  }, [tournamentId]);

  const loadTournament = async () => {
    try {
      const { data, error: fetchError } = await supabase
        .from("tournaments")
        .select(
          `
          *,
          venues (
            id,
            venue,
            address,
            city,
            state,
            zip_code,
            phone
          )
        `,
        )
        .eq("id", tournamentId)
        .single();

      if (fetchError) {
        setError(fetchError.message);
      } else {
        setTournament(data);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Computed values
  const isDirector = profile?.id_auto === tournament?.director_id;
  const isDeleted = tournament?.status === "cancelled";
  const canEdit = isDirector && !isDeleted;

  // Formatters
  const formatDate = (dateString: string): string => {
    if (!dateString) return "";
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  };

  const formatTime = (timeString: string): string => {
    if (!timeString) return "";
    const [hours, minutes] = timeString.split(":");
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? "PM" : "AM";
    const hour12 = hour % 12 || 12;
    return `${hour12}:${minutes} ${ampm}`;
  };

  const formatCurrency = (amount: number): string => {
    return amount === 0 ? "Free" : `$${amount}`;
  };

  // Actions
  const openMaps = () => {
    if (!tournament?.venues) return;
    const address = `${tournament.venues.address}, ${tournament.venues.city}, ${tournament.venues.state} ${tournament.venues.zip_code}`;
    const url = `https://maps.google.com/?q=${encodeURIComponent(address)}`;
    Linking.openURL(url);
  };

  const callVenue = () => {
    if (!tournament?.venues?.phone) return;
    Linking.openURL(`tel:${tournament.venues.phone}`);
  };

  const handleEdit = () => {
    if (!tournament) return;
    router.push({
      pathname: "/admin/edit-tournament/[id]",
      params: { id: tournament.id.toString() },
    });
  };

  const handleDelete = () => {
    if (!tournament) return;

    Alert.alert(
      "Delete Tournament",
      `Are you sure you want to delete "${tournament.name}"? This action cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: deleteTournament,
        },
      ],
    );
  };

  const deleteTournament = async () => {
    if (!tournament || !profile) return;

    setDeleting(true);
    try {
      const { error: updateError } = await supabase
        .from("tournaments")
        .update({
          status: "cancelled",
          cancelled_at: new Date().toISOString(),
          cancelled_by: profile.id_auto,
          updated_at: new Date().toISOString(),
        })
        .eq("id", tournament.id)
        .eq("director_id", profile.id_auto);

      if (updateError) throw updateError;

      Alert.alert("Deleted", "Tournament has been deleted.", [
        { text: "OK", onPress: () => router.back() },
      ]);
    } catch (err: any) {
      Alert.alert("Error", err.message || "Failed to delete tournament.");
    } finally {
      setDeleting(false);
    }
  };

  const goBack = () => router.back();

  return {
    // State
    loading,
    tournament,
    error,
    deleting,

    // Computed
    isDirector,
    canEdit,
    isDeleted,

    // Formatted values
    formattedDate: tournament ? formatDate(tournament.tournament_date) : "",
    formattedTime: tournament ? formatTime(tournament.start_time) : "",
    formattedEntryFee: tournament ? formatCurrency(tournament.entry_fee) : "",

    // Actions
    openMaps,
    callVenue,
    handleEdit,
    handleDelete,
    goBack,
  };
};
