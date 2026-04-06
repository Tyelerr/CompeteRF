import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Alert, Linking, Platform } from "react-native";
import { supabase } from "../lib/supabase";
import { analyticsService, ENTITY_TYPES } from "../models/services/analytics.service";
import { notificationDispatcher } from "../models/services/notification-dispatcher.service";
import { useAuthContext } from "../providers/AuthProvider";

interface DirectorProfile {
  id_auto: number;
  first_name?: string;
  last_name?: string;
  user_name?: string;
}

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
  calcutta: boolean;
  open_tournament: boolean;
  is_recurring: boolean;
  is_hidden: boolean;
  status: string;
  director_id: number;
  venue_id: number;
  chip_ranges?: any[];
  game_spot?: string;
  race?: string;
  table_size?: string;
  thumbnail?: string;
  profiles: DirectorProfile | null;
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
  loading: boolean;
  tournament: Tournament | null;
  error: string;
  deleting: boolean;
  isDirector: boolean;
  isVenueOwner: boolean;
  canEdit: boolean;
  isDeleted: boolean;
  isHidden: boolean;
  showActionBar: boolean;
  formattedDate: string;
  formattedTime: string;
  formattedEntryFee: string;
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
  const params = useLocalSearchParams();
  const { profile } = useAuthContext();

  const [loading, setLoading] = useState(true);
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [isVenueOwner, setIsVenueOwner] = useState(false);
  const viewRecorded = useRef<string | null>(null);

  const fromBarOwner = params.fromBarOwner === "true";

  useEffect(() => {
    if (tournamentId) {
      loadTournament();
    }
  }, [tournamentId]);

  useEffect(() => {
    if (tournamentId && viewRecorded.current !== tournamentId) {
      viewRecorded.current = tournamentId;
      analyticsService.trackTournamentViewed(parseInt(tournamentId, 10), {
        source_screen: fromBarOwner ? "bar_owner_dashboard" : "tournament_detail",
      });
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
          ),
          profiles!director_id (
            id_auto,
            first_name,
            last_name,
            user_name
          )
        `,
        )
        .eq("id", tournamentId)
        .single();

      if (fetchError) {
        setError(fetchError.message);
      } else {
        setTournament(data);

        if (profile?.id_auto && data?.venue_id) {
          checkVenueOwnership(data.venue_id);
        }
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const checkVenueOwnership = async (venueId: number) => {
    if (!profile?.id_auto) return;
    try {
      const { data, error } = await supabase
        .from("venue_owners")
        .select("id")
        .eq("venue_id", venueId)
        .eq("owner_id", profile.id_auto)
        .is("archived_at", null)
        .maybeSingle();
      setIsVenueOwner(!!data && !error);
    } catch {
      setIsVenueOwner(false);
    }
  };

  const isDirector = profile?.id_auto === tournament?.director_id;
  const isDeleted = tournament?.status === "cancelled";
  const isHidden = tournament?.is_hidden === true;
  const canEdit = !isDeleted && (isDirector || (fromBarOwner && isVenueOwner));
  const showActionBar = isDirector || (fromBarOwner && isVenueOwner);

  const formatDate = (dateString: string): string => {
    if (!dateString) return "";
    const [y, m, d] = dateString.split("-").map(Number); const date = new Date(y, m - 1, d);
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

  const openMaps = () => {
    if (!tournament?.venues) return;
    const address = `${tournament.venues.address}, ${tournament.venues.city}, ${tournament.venues.state} ${tournament.venues.zip_code}`;
    const encodedAddress = encodeURIComponent(address);
    const url =
      Platform.select({
        ios: `https://maps.apple.com/?q=${encodedAddress}`,
        android: `https://www.google.com/maps/search/?api=1&query=${encodedAddress}`,
      }) || `https://www.google.com/maps/search/?api=1&query=${encodedAddress}`;
    analyticsService.trackDirectionsClicked(ENTITY_TYPES.TOURNAMENT, tournament.id, {
      venue_name: tournament.venues.venue,
    });
    Linking.openURL(url);
  };

  const callVenue = () => {
    if (!tournament?.venues?.phone) return;
    analyticsService.trackVenueContactClicked(ENTITY_TYPES.TOURNAMENT, tournament.id, {
      contact_type: "phone",
      venue_name: tournament.venues.venue,
    });
    const phone = tournament.venues.phone.replace(/[^0-9+]/g, "");
    Linking.openURL(`tel:${phone}`);
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
        { text: "Delete", style: "destructive", onPress: deleteTournament },
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
        .eq("id", tournament.id);

      if (updateError) throw updateError;

      notificationDispatcher
        .sendToTournamentFavorites(
          tournament.id,
          profile.id_auto,
          "Tournament Cancelled",
          `${tournament.name} has been cancelled`,
          { deep_link: `competerf:///tournament-detail?id=${tournament.id}` },
        )
        .catch((err) => console.error("Error sending cancellation notifications:", err));

      Alert.alert("Deleted", "Tournament has been deleted.", [
        { text: "OK", onPress: () => router.back() },
      ]);
    } catch (err: any) {
      Alert.alert("Error", err.message || "Failed to delete tournament.");
    } finally {
      setDeleting(false);
    }
  };

  const goBack = () => {
    const from = (params as any).from;
    if (from) {
      router.push(from as any);
    } else if (router.canGoBack()) {
      router.back();
    } else {
      router.push("/(tabs)/billiards" as any);
    }
  };

  return {
    loading,
    tournament,
    error,
    deleting,
    isDirector,
    isVenueOwner,
    canEdit,
    isDeleted,
    isHidden,
    showActionBar,
    formattedDate: tournament ? formatDate(tournament.tournament_date) : "",
    formattedTime: tournament ? formatTime(tournament.start_time) : "",
    formattedEntryFee: tournament ? formatCurrency(tournament.entry_fee) : "",
    openMaps,
    callVenue,
    handleEdit,
    handleDelete,
    goBack,
  };
};
