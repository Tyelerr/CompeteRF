import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Alert, TextInput } from "react-native";
import { supabase } from "../lib/supabase";
import { useAuthContext } from "../providers/AuthProvider";
import {
  TournamentFormData,
  initialFormData,
} from "../utils/tournament-form-data";

interface Venue {
  id: number;
  venue: string;
  address: string;
  city: string;
  state: string;
  zip_code: string;
  phone: string;
}

interface SidePot {
  name: string;
  amount: string;
}

interface UseEditTournamentReturn {
  // Auth state
  user: any;
  profile: any;
  isLoading: boolean;
  isAuthorized: boolean;

  // Tournament state
  tournament: any | null;
  formData: TournamentFormData;
  sidePots: SidePot[];
  selectedVenue: Venue | null;
  saving: boolean;
  cancelling: boolean;

  // Computed
  isMaxFargoDisabled: boolean;
  isOpenTournamentDisabled: boolean;
  isCancelled: boolean;
  canEdit: boolean;

  // Dropdown options
  venueOptions: { label: string; value: string }[];

  // Refs
  refs: {
    name: React.RefObject<TextInput | null>;
    gameSpot: React.RefObject<TextInput | null>;
    race: React.RefObject<TextInput | null>;
    description: React.RefObject<TextInput | null>;
    maxFargo: React.RefObject<TextInput | null>;
    entryFee: React.RefObject<TextInput | null>;
    phone: React.RefObject<TextInput | null>;
  };

  // Actions
  updateFormData: (field: keyof TournamentFormData, value: any) => void;
  handleVenueSelect: (venueId: string) => void;
  addSidePot: () => void;
  updateSidePot: (
    index: number,
    field: "name" | "amount",
    value: string,
  ) => void;
  removeSidePot: (index: number) => void;
  handleSave: () => Promise<void>;
  handleCancel: () => void;
  goBack: () => void;
}

export const useEditTournament = (
  tournamentId: string,
): UseEditTournamentReturn => {
  const router = useRouter();
  const { user, profile, loading: authLoading } = useAuthContext();

  const [dataLoading, setDataLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [tournament, setTournament] = useState<any | null>(null);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [selectedVenue, setSelectedVenue] = useState<Venue | null>(null);
  const [formData, setFormData] = useState<TournamentFormData>(initialFormData);
  const [sidePots, setSidePots] = useState<SidePot[]>([]);
  const [isAuthorized, setIsAuthorized] = useState(false);

  // Refs for auto-advance
  const refs = {
    name: useRef<TextInput>(null),
    gameSpot: useRef<TextInput>(null),
    race: useRef<TextInput>(null),
    description: useRef<TextInput>(null),
    maxFargo: useRef<TextInput>(null),
    entryFee: useRef<TextInput>(null),
    phone: useRef<TextInput>(null),
  };

  // Load tournament data when ready
  useEffect(() => {
    if (!authLoading && profile && tournamentId) {
      loadTournamentData();
    } else if (!authLoading) {
      setDataLoading(false);
    }
  }, [authLoading, profile, tournamentId]);

  const loadTournamentData = async () => {
    try {
      // Load tournament
      const { data: tournamentData, error: tournamentError } = await supabase
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
        .eq("id", parseInt(tournamentId))
        .single();

      if (tournamentError) throw tournamentError;

      // Check authorization - must be the director
      if (tournamentData.director_id !== profile?.id_auto) {
        setIsAuthorized(false);
        setDataLoading(false);
        return;
      }

      setIsAuthorized(true);
      setTournament(tournamentData);

      // Set venue
      if (tournamentData.venues) {
        setSelectedVenue(tournamentData.venues);
      }

      // Populate form data from tournament
      setFormData({
        templateId: tournamentData.template_id || null,
        name: tournamentData.name || "",
        gameType: tournamentData.game_type || "",
        tournamentFormat: tournamentData.tournament_format || "",
        gameSpot: tournamentData.game_spot || "",
        race: tournamentData.race || "",
        description: tournamentData.description || "",
        maxFargo: tournamentData.max_fargo?.toString() || "",
        requiredFargoGames:
          tournamentData.required_fargo_games?.toString() || "",
        reportsToFargo: tournamentData.reports_to_fargo || false,
        openTournament: tournamentData.open_tournament ?? true,
        entryFee: tournamentData.entry_fee?.toString() || "",
        addedMoney: tournamentData.added_money?.toString() || "",
        tournamentDate: tournamentData.tournament_date || "",
        startTime: tournamentData.start_time || "",
        timezone:
          tournamentData.timezone ||
          Intl.DateTimeFormat().resolvedOptions().timeZone,
        isRecurring: tournamentData.is_recurring || false,
        venueId: tournamentData.venue_id || null,
        phoneNumber: tournamentData.phone_number || "",
        tableSize: tournamentData.table_size || "",
        equipment: tournamentData.equipment || "",
        numberOfTables: tournamentData.number_of_tables?.toString() || "",
        thumbnail: tournamentData.thumbnail || "",
      });

      // Set side pots
      if (tournamentData.side_pots && Array.isArray(tournamentData.side_pots)) {
        setSidePots(tournamentData.side_pots);
      }

      // Load all venues for dropdown
      const { data: venuesData } = await supabase
        .from("venues")
        .select("*")
        .eq("status", "active")
        .order("venue");

      if (venuesData) {
        setVenues(venuesData);
      }
    } catch (error) {
      console.error("Error loading tournament:", error);
      Alert.alert("Error", "Failed to load tournament data.");
    } finally {
      setDataLoading(false);
    }
  };

  const updateFormData = (field: keyof TournamentFormData, value: any) => {
    setFormData((prev) => {
      const updated = { ...prev, [field]: value };

      // If Open Tournament is turned ON, clear Max Fargo
      if (field === "openTournament" && value === true) {
        updated.maxFargo = "";
      }

      // If Max Fargo is entered, turn OFF Open Tournament
      if (field === "maxFargo" && value.trim() !== "") {
        updated.openTournament = false;
      }

      return updated;
    });
  };

  const handleVenueSelect = (venueId: string) => {
    const venue = venues.find((v) => v.id.toString() === venueId);
    setSelectedVenue(venue || null);
    updateFormData("venueId", venue ? venue.id : null);
    if (venue?.phone) {
      updateFormData("phoneNumber", venue.phone);
    }
  };

  const addSidePot = () => {
    setSidePots([...sidePots, { name: "", amount: "" }]);
  };

  const updateSidePot = (
    index: number,
    field: "name" | "amount",
    value: string,
  ) => {
    const updated = [...sidePots];
    updated[index] = { ...updated[index], [field]: value };
    setSidePots(updated);
  };

  const removeSidePot = (index: number) => {
    setSidePots(sidePots.filter((_, i) => i !== index));
  };

  const validateForm = (): boolean => {
    if (!formData.name.trim()) {
      Alert.alert("Error", "Please enter a tournament name.");
      return false;
    }
    if (!formData.gameType) {
      Alert.alert("Error", "Please select a game type.");
      return false;
    }
    if (!formData.tournamentFormat) {
      Alert.alert("Error", "Please select a tournament format.");
      return false;
    }
    if (!formData.tournamentDate) {
      Alert.alert("Error", "Please select a tournament date.");
      return false;
    }
    if (!formData.startTime) {
      Alert.alert("Error", "Please select a start time.");
      return false;
    }
    if (!formData.venueId) {
      Alert.alert("Error", "Please select a venue.");
      return false;
    }
    return true;
  };

  const handleSave = async () => {
    if (!validateForm()) return;
    if (!profile || !tournament) return;

    setSaving(true);
    try {
      const validSidePots = sidePots.filter(
        (pot) => pot.name.trim() && pot.amount.trim(),
      );

      const updateData = {
        venue_id: formData.venueId,
        name: formData.name.trim(),
        description: formData.description.trim() || null,
        game_type: formData.gameType,
        tournament_format: formData.tournamentFormat,
        game_spot: formData.gameSpot.trim() || null,
        race: formData.race.trim() || null,
        table_size: formData.tableSize || null,
        equipment: formData.equipment || null,
        number_of_tables: formData.numberOfTables
          ? parseInt(formData.numberOfTables)
          : null,
        tournament_date: formData.tournamentDate,
        start_time: formData.startTime,
        timezone: formData.timezone,
        entry_fee: formData.entryFee ? parseFloat(formData.entryFee) : 0,
        added_money: formData.addedMoney ? parseFloat(formData.addedMoney) : 0,
        side_pots: validSidePots.length > 0 ? validSidePots : null,
        max_fargo: formData.maxFargo ? parseInt(formData.maxFargo) : null,
        required_fargo_games: formData.requiredFargoGames
          ? parseInt(formData.requiredFargoGames)
          : null,
        reports_to_fargo: formData.reportsToFargo,
        open_tournament: formData.openTournament,
        phone_number: formData.phoneNumber.trim() || null,
        thumbnail: formData.thumbnail || null,
        is_recurring: formData.isRecurring,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from("tournaments")
        .update(updateData)
        .eq("id", tournament.id)
        .eq("director_id", profile.id_auto);

      if (error) throw error;

      Alert.alert("Success!", "Tournament updated successfully.", [
        { text: "OK", onPress: () => router.back() },
      ]);
    } catch (error: any) {
      console.error("Update error:", error);
      Alert.alert("Error", error.message || "Failed to update tournament.");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    Alert.alert(
      "Cancel Tournament",
      "Are you sure you want to cancel this tournament? This will notify all users who favorited it.",
      [
        { text: "No, Keep It", style: "cancel" },
        {
          text: "Yes, Cancel It",
          style: "destructive",
          onPress: () => cancelTournament(),
        },
      ],
    );
  };

  const cancelTournament = async () => {
    if (!profile || !tournament) return;

    setCancelling(true);
    try {
      const { error } = await supabase
        .from("tournaments")
        .update({
          status: "cancelled",
          cancelled_at: new Date().toISOString(),
          cancelled_by: profile.id_auto,
          updated_at: new Date().toISOString(),
        })
        .eq("id", tournament.id)
        .eq("director_id", profile.id_auto);

      if (error) throw error;

      Alert.alert(
        "Tournament Cancelled",
        "The tournament has been cancelled.",
        [{ text: "OK", onPress: () => router.back() }],
      );
    } catch (error: any) {
      console.error("Cancel error:", error);
      Alert.alert("Error", error.message || "Failed to cancel tournament.");
    } finally {
      setCancelling(false);
    }
  };

  const goBack = () => router.back();

  // Build dropdown options
  const venueOptions = [
    { label: "Choose your venue", value: "" },
    ...venues.map((v) => ({
      label: `${v.venue} - ${v.city}, ${v.state}`,
      value: v.id.toString(),
    })),
  ];

  // Computed values
  const isCancelled = tournament?.status === "cancelled";
  const canEdit = isAuthorized && !isCancelled;

  return {
    // Auth state
    user,
    profile,
    isLoading: authLoading || dataLoading,
    isAuthorized,

    // Tournament state
    tournament,
    formData,
    sidePots,
    selectedVenue,
    saving,
    cancelling,

    // Computed
    isMaxFargoDisabled: formData.openTournament === true,
    isOpenTournamentDisabled: formData.maxFargo.trim() !== "",
    isCancelled,
    canEdit,

    // Dropdown options
    venueOptions,

    // Refs
    refs,

    // Actions
    updateFormData,
    handleVenueSelect,
    addSidePot,
    updateSidePot,
    removeSidePot,
    handleSave,
    handleCancel,
    goBack,
  };
};
