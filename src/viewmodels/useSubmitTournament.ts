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

interface Template {
  id: number;
  name: string;
  game_type: string;
  tournament_format: string;
}

interface SidePot {
  name: string;
  amount: string;
}

export const useSubmitTournament = () => {
  const router = useRouter();
  const {
    user,
    profile,
    loading: authLoading,
    canSubmitTournaments,
  } = useAuthContext();

  const [dataLoading, setDataLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedVenue, setSelectedVenue] = useState<Venue | null>(null);
  const [formData, setFormData] = useState<TournamentFormData>(initialFormData);
  const [sidePots, setSidePots] = useState<SidePot[]>([]);

  // Refs for auto-advance
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

  // Load venues and templates when profile is ready
  useEffect(() => {
    if (!authLoading && profile && canSubmitTournaments) {
      loadFormData();
    } else if (!authLoading) {
      setDataLoading(false);
    }
  }, [authLoading, profile, canSubmitTournaments]);

  const loadFormData = async () => {
    try {
      // Load venues
      const { data: venuesData } = await supabase
        .from("venues")
        .select("*")
        .eq("status", "active")
        .order("venue");

      if (venuesData) {
        setVenues(venuesData);
      }

      // Load user's templates
      const { data: templatesData } = await supabase
        .from("tournament_templates_user")
        .select("id, name, game_type, tournament_format")
        .eq("director_id", profile!.id_auto)
        .eq("status", "active");

      if (templatesData) {
        setTemplates(templatesData);
      }
    } catch (error) {
      console.error("Error loading form data:", error);
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

  const handleTemplateSelect = async (templateId: string) => {
    if (!templateId) {
      resetForm();
      return;
    }

    try {
      const { data: template } = await supabase
        .from("tournament_templates_user")
        .select("*")
        .eq("id", parseInt(templateId))
        .single();

      if (template) {
        const venue = venues.find((v) => v.id === template.venue_id);
        setSelectedVenue(venue || null);

        setFormData({
          ...initialFormData,
          templateId: template.id,
          name: template.name || "",
          gameType: template.game_type || "",
          tournamentFormat: template.tournament_format || "",
          gameSpot: template.game_spot || "",
          race: template.race || "",
          description: template.description || "",
          maxFargo: template.max_fargo?.toString() || "",
          requiredFargoGames: template.required_fargo_games?.toString() || "",
          reportsToFargo: template.reports_to_fargo || false,
          openTournament: template.open_tournament ?? true,
          entryFee: template.entry_fee?.toString() || "",
          addedMoney: template.added_money?.toString() || "",
          startTime: template.start_time || "",
          isRecurring: true,
          venueId: template.venue_id || null,
          phoneNumber: template.phone_number || "",
          tableSize: template.table_size || "",
          equipment: template.equipment || "",
          numberOfTables: template.number_of_tables?.toString() || "",
          thumbnail: template.thumbnail || "",
        });

        if (template.side_pots && Array.isArray(template.side_pots)) {
          setSidePots(template.side_pots);
        } else {
          setSidePots([]);
        }
      }
    } catch (error) {
      console.error("Error loading template:", error);
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

  const resetForm = () => {
    setFormData(initialFormData);
    setSidePots([]);
    setSelectedVenue(null);
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;
    if (!profile) return;

    setSubmitting(true);
    try {
      const validSidePots = sidePots.filter(
        (pot) => pot.name.trim() && pot.amount.trim(),
      );

      const tournamentData = {
        director_id: profile.id_auto,
        venue_id: formData.venueId,
        template_id: formData.templateId,
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
        status: "active",
      };

      const { error } = await supabase
        .from("tournaments")
        .insert(tournamentData);

      if (error) throw error;

      Alert.alert(
        "Success!",
        "Your tournament has been submitted for review.",
        [{ text: "OK", onPress: resetForm }],
      );
    } catch (error: any) {
      console.error("Submit error:", error);
      Alert.alert("Error", error.message || "Failed to submit tournament.");
    } finally {
      setSubmitting(false);
    }
  };

  const navigateToLogin = () => router.push("/auth/login");
  const navigateToFaq = () => router.push("/(tabs)/faq");

  // Build dropdown options
  const venueOptions = [
    { label: "Choose your venue", value: "" },
    ...venues.map((v) => ({
      label: `${v.venue} - ${v.city}, ${v.state}`,
      value: v.id.toString(),
    })),
  ];

  const templateOptions = [
    { label: "Start Fresh (No Template)", value: "" },
    ...templates.map((t) => ({ label: t.name, value: t.id.toString() })),
  ];

  return {
    // Auth state
    user,
    profile,
    isLoading: authLoading || dataLoading,
    canSubmitTournaments,

    // Form state
    formData,
    sidePots,
    selectedVenue,
    submitting,

    // Computed
    isMaxFargoDisabled: formData.openTournament === true,
    isOpenTournamentDisabled: formData.maxFargo.trim() !== "",

    // Dropdown options
    venueOptions,
    templateOptions,
    hasTemplates: templates.length > 0,

    // Refs
    refs,

    // Actions
    updateFormData,
    handleVenueSelect,
    handleTemplateSelect,
    addSidePot,
    updateSidePot,
    removeSidePot,
    handleSubmit,
    navigateToLogin,
    navigateToFaq,
  };
};
