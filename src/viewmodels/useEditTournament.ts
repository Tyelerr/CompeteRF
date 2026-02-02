import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Alert, TextInput } from "react-native";
import { supabase } from "../lib/supabase";
import { tournamentService } from "../models/services/tournament.service";
import { Tournament } from "../models/types/tournament.types";
import { useAuthContext } from "../providers/AuthProvider";

interface EditTournamentForm {
  name: string;
  gameType: string;
  tournamentFormat: string;
  gameSpot: string;
  race: string;
  description: string;
  maxFargo: string;
  entryFee: string;
  reportsToFargo: boolean;
  openTournament: boolean;
  tournamentDate: Date | null;
  startTime: string;
  timezone: string;
  venueId: number | null;
  phoneNumber: string;
  equipment: string;
  tableSize: string;
  thumbnail: string;
}

interface SidePot {
  name: string;
  amount: string;
}

export const useEditTournament = () => {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const { profile } = useAuthContext();

  // States
  const [isLoading, setIsLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [customImageUri, setCustomImageUri] = useState<string | null>(null);

  // Form data
  const [formData, setFormData] = useState<EditTournamentForm>({
    name: "",
    gameType: "",
    tournamentFormat: "",
    gameSpot: "",
    race: "",
    description: "",
    maxFargo: "",
    entryFee: "",
    reportsToFargo: false,
    openTournament: false,
    tournamentDate: null,
    startTime: "",
    timezone: "America/Phoenix",
    venueId: null,
    phoneNumber: "",
    equipment: "",
    tableSize: "",
    thumbnail: "",
  });

  const [sidePots, setSidePots] = useState<SidePot[]>([]);
  const [venues, setVenues] = useState<any[]>([]);

  // Refs for form inputs
  const refs = {
    name: useRef<TextInput>(null),
    gameSpot: useRef<TextInput>(null),
    race: useRef<TextInput>(null),
    description: useRef<TextInput>(null),
    maxFargo: useRef<TextInput>(null),
    requiredFargo: useRef<TextInput>(null),
    entryFee: useRef<TextInput>(null),
    phone: useRef<TextInput>(null),
  };

  useEffect(() => {
    if (id && profile?.id_auto) {
      loadTournament();
      loadVenues();
    }
  }, [id, profile?.id_auto]);

  const loadTournament = async () => {
    if (!id || !profile?.id_auto) return;

    try {
      setIsLoading(true);
      const tournamentData = await tournamentService.getTournament(Number(id));

      if (!tournamentData) {
        Alert.alert("Error", "Tournament not found");
        router.back();
        return;
      }

      // Check permissions - user can only edit tournaments at their owned venues or tournaments they created
      let canEdit = false;

      if (tournamentData.director_id === profile.id_auto) {
        canEdit = true; // Tournament director can edit their own tournaments
      } else {
        // Check if user owns the venue
        const { data: venueOwnership } = await supabase
          .from("venue_owners")
          .select("id")
          .eq("venue_id", tournamentData.venue_id)
          .eq("owner_id", profile.id_auto)
          .is("archived_at", null)
          .single();

        if (venueOwnership) {
          canEdit = true; // Venue owner can edit tournaments at their venues
        }
      }

      if (!canEdit) {
        Alert.alert(
          "Error",
          "You don't have permission to edit this tournament",
        );
        router.back();
        return;
      }

      setTournament(tournamentData);

      // Populate form with tournament data
      setFormData({
        name: tournamentData.name || "",
        gameType: tournamentData.game_type || "",
        tournamentFormat: tournamentData.tournament_format || "",
        gameSpot: tournamentData.game_spot || "",
        race: tournamentData.race || "",
        description: tournamentData.description || "",
        maxFargo: tournamentData.max_fargo?.toString() || "",
        entryFee: tournamentData.entry_fee?.toString() || "",
        reportsToFargo: tournamentData.reports_to_fargo || false,
        openTournament: tournamentData.open_tournament || false,
        tournamentDate: tournamentData.tournament_date
          ? new Date(tournamentData.tournament_date)
          : null,
        startTime: tournamentData.start_time || "",
        timezone: tournamentData.timezone || "America/Phoenix",
        venueId: tournamentData.venue_id || null,
        phoneNumber: tournamentData.phone_number || "",
        equipment: tournamentData.equipment || "",
        tableSize: tournamentData.table_size || "",
        thumbnail: tournamentData.thumbnail || "",
      });

      // Set side pots if they exist
      if (tournamentData.side_pots && Array.isArray(tournamentData.side_pots)) {
        setSidePots(
          tournamentData.side_pots.map((pot: any) => ({
            name: pot.name || "",
            amount: pot.amount?.toString() || "",
          })),
        );
      }
    } catch (error) {
      console.error("Error loading tournament:", error);
      Alert.alert("Error", "Failed to load tournament");
      router.back();
    } finally {
      setIsLoading(false);
    }
  };

  const loadVenues = async () => {
    if (!profile?.id_auto) return;

    try {
      // Get venue IDs owned by this user
      const { data: ownedVenueIds } = await supabase
        .from("venue_owners")
        .select("venue_id")
        .eq("owner_id", profile.id_auto)
        .is("archived_at", null);

      // Get venue IDs where they're a director
      const { data: directorVenueIds } = await supabase
        .from("venue_directors")
        .select("venue_id")
        .eq("director_id", profile.id_auto)
        .is("archived_at", null);

      // Combine all venue IDs
      const allVenueIds = [
        ...(ownedVenueIds?.map((o) => o.venue_id) || []),
        ...(directorVenueIds?.map((d) => d.venue_id) || []),
      ];

      // Remove duplicate venue IDs
      const uniqueVenueIds = [...new Set(allVenueIds)];

      if (uniqueVenueIds.length === 0) {
        setVenues([]);
        return;
      }

      // Get the actual venue data
      const { data: venueData } = await supabase
        .from("venues")
        .select(
          `
          id,
          venue,
          address,
          city,
          state,
          zip_code
        `,
        )
        .in("id", uniqueVenueIds)
        .eq("status", "active");

      setVenues(venueData || []);
    } catch (error) {
      console.error("Error loading venues:", error);
    }
  };

  const updateFormData = (key: keyof EditTournamentForm, value: any) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
  };

  const addSidePot = () => {
    setSidePots((prev) => [...prev, { name: "", amount: "" }]);
  };

  const removeSidePot = (index: number) => {
    setSidePots((prev) => prev.filter((_, i) => i !== index));
  };

  const updateSidePot = (index: number, key: keyof SidePot, value: string) => {
    setSidePots((prev) =>
      prev.map((pot, i) => (i === index ? { ...pot, [key]: value } : pot)),
    );
  };

  const handleVenueSelect = (venueIdString: string) => {
    const venueId = parseInt(venueIdString);
    setFormData((prev) => ({ ...prev, venueId }));
  };

  const handleThumbnailSelect = async (thumbnailId: string) => {
    if (thumbnailId === "upload-custom") {
      Alert.alert(
        "Feature Coming Soon",
        "Custom image upload will be available in a future update.",
      );
      return;
    }
    setFormData((prev) => ({ ...prev, thumbnail: thumbnailId }));
  };

  const getThumbnailImageUrl = (thumbnailId: string) => {
    if (thumbnailId.startsWith("custom:")) {
      return thumbnailId.replace("custom:", "");
    }
    return `https://your-cdn-url.com/thumbnails/${thumbnailId}.jpg`; // Update with your actual CDN
  };

  const handleSubmit = async () => {
    if (!tournament || !profile?.id_auto) return;

    // Basic validation
    if (!formData.name.trim()) {
      Alert.alert("Error", "Please enter a tournament name");
      return;
    }
    if (!formData.gameType) {
      Alert.alert("Error", "Please select a game type");
      return;
    }
    if (!formData.tournamentFormat) {
      Alert.alert("Error", "Please select a tournament format");
      return;
    }
    if (!formData.tournamentDate) {
      Alert.alert("Error", "Please select a tournament date");
      return;
    }
    if (!formData.startTime) {
      Alert.alert("Error", "Please select a start time");
      return;
    }
    if (!formData.venueId) {
      Alert.alert("Error", "Please select a venue");
      return;
    }

    try {
      setSubmitting(true);

      const updateData: Partial<Tournament> = {
        name: formData.name.trim(),
        game_type: formData.gameType as any,
        tournament_format: formData.tournamentFormat as any,
        game_spot: formData.gameSpot.trim() || undefined,
        race: formData.race.trim() || undefined,
        description: formData.description.trim() || undefined,
        max_fargo: formData.maxFargo ? parseInt(formData.maxFargo) : undefined,
        entry_fee: formData.entryFee
          ? parseFloat(formData.entryFee)
          : undefined,
        side_pots: sidePots
          .filter((pot) => pot.name.trim())
          .map((pot) => ({
            name: pot.name.trim(),
            amount: pot.amount ? parseFloat(pot.amount) : 0,
          })) as any,
        reports_to_fargo: formData.reportsToFargo,
        open_tournament: formData.openTournament,
        tournament_date: formData.tournamentDate.toISOString().split("T")[0],
        start_time: formData.startTime,
        timezone: formData.timezone,
        venue_id: formData.venueId as any,
        phone_number: formData.phoneNumber.trim() || undefined,
        equipment: formData.equipment as any,
        table_size: formData.tableSize as any,
        thumbnail: formData.thumbnail || undefined,
      };

      await tournamentService.updateTournament(tournament.id, updateData);

      Alert.alert("Success", "Tournament updated successfully", [
        { text: "OK", onPress: () => router.back() },
      ]);
    } catch (error) {
      console.error("Error updating tournament:", error);
      Alert.alert("Error", "Failed to update tournament. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  // Computed values
  const selectedVenue = venues.find((v) => v.id === formData.venueId);
  const isMaxFargoDisabled = formData.openTournament;
  const isOpenTournamentDisabled = !!formData.maxFargo;

  const venueOptions = venues.map((venue) => ({
    label: `${venue.venue} - ${venue.city}, ${venue.state}`,
    value: venue.id.toString(),
  }));

  return {
    // State
    isLoading,
    submitting,
    uploadingImage,
    tournament,
    customImageUri,

    // Form data
    formData,
    sidePots,

    // Computed
    selectedVenue,
    isMaxFargoDisabled,
    isOpenTournamentDisabled,
    venueOptions,

    // Refs
    refs,

    // Actions
    updateFormData,
    addSidePot,
    removeSidePot,
    updateSidePot,
    handleVenueSelect,
    handleThumbnailSelect,
    getThumbnailImageUrl,
    handleSubmit,
  };
};
