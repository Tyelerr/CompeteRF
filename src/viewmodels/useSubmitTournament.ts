import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Alert, TextInput } from "react-native";
import { ImageContentScanner } from "../../image-scanner"; // 🔍 Add image scanner
import { supabase } from "../lib/supabase";
import { tournamentService } from "../models/services/tournament.service";
import { useAuthContext } from "../providers/AuthProvider";
import {
  ChipRange,
  DEFAULT_CHIP_RANGES,
  THUMBNAIL_OPTIONS,
  TournamentFormData,
  getRecurrencePreviewText,
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

  // Image/thumbnail state
  const [customImageUri, setCustomImageUri] = useState<string | null>(null);
  const [hasManualSelection, setHasManualSelection] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [scanningImage, setScanningImage] = useState(false); // 🔍 Add scanning state

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

  // Auto-select thumbnail when game type changes (if not manually selected)
  useEffect(() => {
    if (formData.gameType && !hasManualSelection) {
      const matchingThumb = THUMBNAIL_OPTIONS.find(
        (thumb) =>
          thumb.gameType === formData.gameType ||
          (thumb.gameType && formData.gameType?.toLowerCase().includes(thumb.gameType)),
      );

      if (matchingThumb) {
        setFormData((prev) => ({ ...prev, thumbnail: matchingThumb.id }));
      }
    }
  }, [formData.gameType, hasManualSelection]);

  // 🎰 Auto-populate default chip ranges when "Chip Tournament" is selected
  // Also clear fields that don't apply to chip tournaments
  useEffect(() => {
    if (formData.tournamentFormat === "chip-tournament") {
      setFormData((prev) => ({
        ...prev,
        // Only populate defaults if chipRanges is currently empty
        chipRanges:
          prev.chipRanges.length === 0
            ? [...DEFAULT_CHIP_RANGES]
            : prev.chipRanges,
        // Clear fields that don't apply to chip tournaments
        gameSpot: "",
        race: "",
        maxFargo: "",
        openTournament: false,
      }));
    } else {
      // Clear chip ranges when switching away from chip tournament
      if (formData.chipRanges.length > 0) {
        setFormData((prev) => ({ ...prev, chipRanges: [] }));
      }
    }
  }, [formData.tournamentFormat]);

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

      // If switching to non-recurring, clear recurring fields only
      if (field === "isRecurring" && value === false) {
        updated.recurrenceType = "";
        updated.recurrenceDay = "";
        updated.recurrenceWeek = undefined;
        updated.seriesEndDate = null;
        // DON'T clear tournamentDate or startTime - user keeps their selections!
      }

      return updated;
    });
  };

  // ── Chip Range CRUD (ViewModel actions) ──────────────────────────────

  const addChipRange = () => {
    setFormData((prev) => {
      const ranges = [...prev.chipRanges];
      // Smart default: start after the last range's max rating
      const lastMax =
        ranges.length > 0 ? ranges[ranges.length - 1].maxRating : -1;
      const newMin = lastMax + 1;
      const newMax = lastMax + 50;
      const newRange: ChipRange = {
        label: `${newMin}-${newMax}`,
        minRating: newMin,
        maxRating: newMax,
        chips: 1,
      };
      return { ...prev, chipRanges: [...ranges, newRange] };
    });
  };

  const updateChipRange = (
    index: number,
    field: keyof ChipRange,
    value: string,
  ) => {
    setFormData((prev) => {
      const ranges = [...prev.chipRanges];
      if (field === "label") {
        // Label is a string — store as-is
        ranges[index] = { ...ranges[index], label: value };
      } else {
        // Numeric fields
        const numValue = parseInt(value) || 0;
        ranges[index] = { ...ranges[index], [field]: numValue };
      }
      return { ...prev, chipRanges: ranges };
    });
  };

  const removeChipRange = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      chipRanges: prev.chipRanges.filter((_, i) => i !== index),
    }));
  };

  const resetChipRangesToDefault = () => {
    setFormData((prev) => ({
      ...prev,
      chipRanges: [...DEFAULT_CHIP_RANGES],
    }));
  };

  // ── Computed: is this a chip tournament? ──────────────────────────────
  const isChipTournament = formData.tournamentFormat === "chip-tournament";

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
          // 🎰 Load chip ranges from template if present
          chipRanges:
            template.tournament_format === "chip-tournament" &&
            template.chip_ranges
              ? template.chip_ranges
              : [],
        });

        // Template selection counts as manual selection
        if (template.thumbnail) {
          setHasManualSelection(true);
        }

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

  const handleThumbnailSelect = (thumbnailId: string) => {
    if (thumbnailId === "upload-custom") {
      handleImageUpload();
    } else {
      setHasManualSelection(true);
      setCustomImageUri(null);
      updateFormData("thumbnail", thumbnailId);
    }
  };

  // 🔍 Updated handleImageUpload with image scanning
  const handleImageUpload = async () => {
    try {
      const { status } =
        await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (status !== "granted") {
        Alert.alert(
          "Permission needed",
          "Please grant photo library access to upload images.",
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        aspect: [16, 9],
        quality: 0.8,
        exif: false,
      });

      if (result.canceled || !result.assets[0]) {
        return;
      }

      setUploadingImage(true);
      setScanningImage(true); // Start scanning state
      const asset = result.assets[0];

      // 🔍 STEP 1: Scan image for inappropriate content FIRST
      console.log("🔍 Scanning image for inappropriate content...");
      const scanResult = await ImageContentScanner.scanImage(
        asset.uri,
        profile?.id_auto?.toString(),
      );

      console.log("Scan result:", {
        appropriate: scanResult.isAppropriate,
        violations: scanResult.violations,
      });

      setScanningImage(false); // End scanning state

      // 🚫 STEP 2: Block inappropriate images
      if (!scanResult.isAppropriate) {
        Alert.alert(
          "🚫 Image Not Allowed",
          `This image contains inappropriate content and cannot be used for tournaments:\n\n${scanResult.violations.join("\n")}`,
          [
            {
              text: "Try Different Image",
              onPress: () => handleImageUpload(),
            },
            { text: "Cancel", style: "cancel" },
          ],
        );
        setUploadingImage(false);
        return;
      }

      // ✅ STEP 3: Upload appropriate images to Supabase
      const timestamp = new Date().getTime();
      const fileExt = asset.uri.split(".").pop()?.toLowerCase() || "jpg";
      const fileName = `uploads/tournament-${timestamp}-custom.${fileExt}`;

      const formDataUpload = new FormData();
      formDataUpload.append("file", {
        uri: asset.uri,
        type: `image/${fileExt}`,
        name: fileName,
      } as any);

      const { data, error } = await supabase.storage
        .from("tournament-images")
        .upload(fileName, formDataUpload, {
          contentType: `image/${fileExt}`,
          upsert: false,
        });

      if (error) throw error;

      const {
        data: { publicUrl },
      } = supabase.storage.from("tournament-images").getPublicUrl(fileName);

      setCustomImageUri(asset.uri);
      setHasManualSelection(true);
      updateFormData("thumbnail", `custom:${publicUrl}`);

      Alert.alert("Success", "✅ Image scanned and uploaded successfully!");
    } catch (error: any) {
      console.error("Image upload error:", error);
      Alert.alert(
        "Upload Error",
        error.message ||
          "Failed to upload image. Please check your internet connection.",
      );
    } finally {
      setUploadingImage(false);
      setScanningImage(false);
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

  // 🎯 AUTO-DETERMINE DAY FROM SELECTED DATE
  const getDayFromDate = (date: Date): string => {
    const days = [
      "sunday",
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
      "saturday",
    ];
    return days[date.getDay()];
  };

  // 🎯 NEW: Calculate next tournament dates within 30-day horizon
  const calculateNextTournamentDates = (
    startDate: Date,
    recurrenceType: string,
  ): Date[] => {
    const dates: Date[] = [];
    const horizonDays = 30;
    const maxDate = new Date(startDate);
    maxDate.setDate(maxDate.getDate() + horizonDays);

    console.log(
      `📅 Calculating additional tournaments from ${startDate.toDateString()} for ${horizonDays} days`,
    );

    let nextDate = new Date(startDate);

    while (true) {
      // Calculate next occurrence
      if (recurrenceType === "weekly") {
        nextDate = new Date(nextDate);
        nextDate.setDate(nextDate.getDate() + 7);
      } else if (recurrenceType === "monthly") {
        nextDate = new Date(nextDate);
        nextDate.setMonth(nextDate.getMonth() + 1);
      } else {
        break;
      }

      // Check if within horizon
      if (nextDate > maxDate) {
        console.log(
          `⏰ ${nextDate.toDateString()} is beyond 30-day horizon, stopping`,
        );
        break;
      }

      dates.push(new Date(nextDate));
      console.log(`✅ Adding tournament date: ${nextDate.toDateString()}`);

      // Safety check - don't create more than 10 tournaments
      if (dates.length >= 10) {
        console.log("🛡️ Safety limit reached, stopping at 10 tournaments");
        break;
      }
    }

    console.log(`📊 Will create ${dates.length} additional tournaments`);
    return dates;
  };

  // ── Build the chip_ranges payload for database ────────────────────────
  const getChipRangesPayload = (): ChipRange[] | null => {
    if (!isChipTournament || formData.chipRanges.length === 0) return null;
    // Only include ranges that have valid data
    return formData.chipRanges.filter(
      (r) => r.maxRating > 0 && r.chips > 0,
    );
  };

  // 🎯 NEW: Create additional recurring tournaments
  const createAdditionalTournaments = async (
    templateId: number,
  ): Promise<void> => {
    console.log("🔄 Creating additional tournaments for 30-day horizon");

    if (!formData.tournamentDate || !formData.recurrenceType) {
      console.log("❌ Missing required data for additional tournaments");
      return;
    }

    const nextDates = calculateNextTournamentDates(
      formData.tournamentDate,
      formData.recurrenceType,
    );

    if (nextDates.length === 0) {
      console.log("ℹ️ No additional tournaments needed within 30-day horizon");
      return;
    }

    const validSidePots = sidePots.filter(
      (pot) => pot.name.trim() && pot.amount.trim(),
    );

    // Create base tournament data (same for all tournaments in series)
    const baseTournamentData = {
      director_id: profile!.id_auto,
      venue_id: formData.venueId,
      template_id: templateId,
      parent_template_id: templateId, // Link to recurring template
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
      // 🎰 Include chip ranges
      chip_ranges: getChipRangesPayload(),
      is_recurring: true,
      status: "active",
    };

    // Create tournaments for each date using tournament service
    for (const date of nextDates) {
      const tournamentData = {
        ...baseTournamentData,
        tournament_date: date.toISOString().split("T")[0],
      };

      try {
        // 🎯 USE TYPE CASTING TO BYPASS TYPESCRIPT ERRORS
        await tournamentService.createTournament(tournamentData as any);
        console.log(`✅ Created tournament for ${date.toDateString()}`);
      } catch (error) {
        console.error(
          `❌ Error creating tournament for ${date.toDateString()}:`,
          error,
        );
        throw error;
      }
    }

    console.log(
      `✅ Successfully created ${nextDates.length} additional tournaments`,
    );
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

    // 🎰 Validate chip ranges when chip tournament is selected
    if (isChipTournament) {
      if (formData.chipRanges.length === 0) {
        Alert.alert(
          "Error",
          "Please add at least one chip range for your Chip Tournament.",
        );
        return false;
      }

      for (let i = 0; i < formData.chipRanges.length; i++) {
        const range = formData.chipRanges[i];
        if (!range.label.trim()) {
          Alert.alert(
            "Error",
            `Chip range row ${i + 1}: Please enter a label (e.g., "299 & Under", "SL7").`,
          );
          return false;
        }
        if (range.minRating > range.maxRating) {
          Alert.alert(
            "Error",
            `Chip range row ${i + 1}: Min rating cannot be greater than max rating.`,
          );
          return false;
        }
        if (range.chips < 1) {
          Alert.alert(
            "Error",
            `Chip range row ${i + 1}: Chips must be at least 1.`,
          );
          return false;
        }
      }
    }

    if (!formData.startTime) {
      Alert.alert("Error", "Please select a start time.");
      return false;
    }
    if (!formData.venueId) {
      Alert.alert("Error", "Please select a venue.");
      return false;
    }
    if (!formData.tournamentDate) {
      Alert.alert(
        "Error",
        formData.isRecurring
          ? "Please select when your series begins."
          : "Please select a tournament date.",
      );
      return false;
    }

    // 🎯 SIMPLIFIED: Only check for frequency, not individual day selection
    if (formData.isRecurring) {
      if (!formData.recurrenceType) {
        Alert.alert("Error", "Please select how often this repeats.");
        return false;
      }
    }

    return true;
  };

  const resetForm = () => {
    setFormData(initialFormData);
    setSidePots([]);
    setSelectedVenue(null);
    setCustomImageUri(null);
    setHasManualSelection(false);
  };

  const createTournamentTemplate = async (): Promise<number> => {
    console.log("🔄 Creating tournament template with form data:", formData);

    const validSidePots = sidePots.filter(
      (pot) => pot.name.trim() && pot.amount.trim(),
    );

    // Use tournamentDate as series start date - much simpler!
    if (!formData.tournamentDate) {
      throw new Error("Tournament date is required");
    }

    // 🎯 AUTO-DETERMINE DAY FROM SELECTED DATE
    const recurrenceDay = getDayFromDate(formData.tournamentDate);
    console.log(
      `📅 Auto-determined recurrence day: ${recurrenceDay} from date: ${formData.tournamentDate}`,
    );

    let startDateString: string;
    if (formData.tournamentDate instanceof Date) {
      startDateString = formData.tournamentDate.toISOString().split("T")[0];
    } else if (typeof formData.tournamentDate === "string") {
      startDateString = formData.tournamentDate;
    } else {
      throw new Error("Invalid tournament date format");
    }

    let endDateString: string | null = null;
    if (formData.seriesEndDate) {
      if (formData.seriesEndDate instanceof Date) {
        endDateString = formData.seriesEndDate.toISOString().split("T")[0];
      } else if (typeof formData.seriesEndDate === "string") {
        endDateString = formData.seriesEndDate;
      }
    }

    const templateData = {
      director_id: profile!.id_auto,
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
      entry_fee: formData.entryFee ? parseFloat(formData.entryFee) : null,
      added_money: formData.addedMoney ? parseFloat(formData.addedMoney) : null,
      side_pots: validSidePots.length > 0 ? validSidePots : null,
      max_fargo: formData.maxFargo ? parseInt(formData.maxFargo) : null,
      required_fargo_games: formData.requiredFargoGames
        ? parseInt(formData.requiredFargoGames)
        : null,
      reports_to_fargo: formData.reportsToFargo || false,
      open_tournament: formData.openTournament || false,
      phone_number: formData.phoneNumber.trim() || null,
      thumbnail: formData.thumbnail || null,
      // 🎰 Include chip ranges in template
      chip_ranges: getChipRangesPayload(),
      recurrence_type: formData.recurrenceType,
      recurrence_day: recurrenceDay, // 🎯 Use auto-determined day
      recurrence_week: null, // 🎯 Simplified - no week selection needed
      start_time: formData.startTime,
      series_start_date: startDateString, // Use their tournament date as series start
      series_end_date: endDateString,
      horizon_days: 30, // Fixed value - users can't control this
      status: "active",
    };

    console.log("📋 Template data being inserted:", templateData);

    // Validate required fields before inserting
    const requiredFields = {
      game_type: templateData.game_type,
      tournament_format: templateData.tournament_format,
      recurrence_type: templateData.recurrence_type,
      recurrence_day: templateData.recurrence_day,
      start_time: templateData.start_time,
      series_start_date: templateData.series_start_date,
    };

    console.log("✅ Required fields check:", requiredFields);

    // Check if any required field is empty
    for (const [field, value] of Object.entries(requiredFields)) {
      if (!value || value === "") {
        console.error(`❌ Required field '${field}' is missing or empty`);
        throw new Error(`Required field '${field}' is missing or empty`);
      }
    }

    const { data, error } = await supabase
      .from("tournament_templates")
      .insert(templateData)
      .select()
      .single();

    if (error) {
      console.error("❌ Template creation error:", error);
      throw error;
    }

    console.log("✅ Template created successfully:", data);
    return data.id;
  };

  const createSingleTournament = async (
    templateId?: number,
  ): Promise<void> => {
    console.log("🎯 Creating single tournament with templateId:", templateId);

    const validSidePots = sidePots.filter(
      (pot) => pot.name.trim() && pot.amount.trim(),
    );

    const tournamentData = {
      director_id: profile!.id_auto,
      venue_id: formData.venueId,
      template_id: templateId || formData.templateId,
      parent_template_id: templateId, // Link to recurring template if created
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
      tournament_date: formData.tournamentDate!.toISOString().split("T")[0],
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
      // 🎰 Include chip ranges
      chip_ranges: getChipRangesPayload(),
      is_recurring: formData.isRecurring,
      status: "active",
    };

    // 🔍 ADD DEBUG LOGGING HERE
    console.log(
      "🔍 EXACT DATA BEING SENT TO DATABASE:",
      JSON.stringify(tournamentData, null, 2),
    );

    console.log("🔍 USER INFO:", {
      userId: profile?.id,
      userIdAuto: profile?.id_auto,
      userName: profile?.name,
      userRole: profile?.role,
    });

    console.log("🎯 Tournament data being inserted:", tournamentData);

    try {
      const createdTournament = await tournamentService.createTournament(
        tournamentData as any,
      );
      console.log(
        "✅ Tournament created successfully via service:",
        createdTournament,
      );
    } catch (error) {
      console.error("❌ Tournament creation error:", error);
      console.error("❌ Full error object:", JSON.stringify(error, null, 2));
      throw error;
    }
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;
    if (!profile) return;

    setSubmitting(true);
    try {
      if (formData.isRecurring) {
        console.log("🔄 Starting recurring tournament creation process");

        const templateId = await createTournamentTemplate();
        console.log("✅ Template created with ID:", templateId);

        await createSingleTournament(templateId);
        console.log("✅ First tournament instance created");

        await createAdditionalTournaments(templateId);
        console.log("✅ Additional tournaments created");

        const additionalCount = calculateNextTournamentDates(
          formData.tournamentDate!,
          formData.recurrenceType,
        ).length;

        Alert.alert(
          "Success!",
          `Your recurring tournament series "${formData.name}" has been created! ` +
            `${additionalCount + 1} tournaments have been scheduled within the next 30 days.`,
          [{ text: "OK", onPress: resetForm }],
        );
      } else {
        console.log("🎯 Creating single tournament");

        await createSingleTournament();
        console.log("✅ Single tournament created");

        Alert.alert(
          "Success!",
          "Your tournament has been submitted successfully!",
          [{ text: "OK", onPress: resetForm }],
        );
      }
    } catch (error: any) {
      console.error("❌ Submit error:", error);
      Alert.alert("Error", error.message || "Failed to submit tournament.");
    } finally {
      setSubmitting(false);
    }
  };

  const getRecurrencePreview = (): string => {
    return getRecurrencePreviewText(formData);
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

  const getThumbnailImageUrl = (thumbnailId: string) => {
    if (thumbnailId.startsWith("custom:")) {
      return thumbnailId.replace("custom:", "");
    }

    const option = THUMBNAIL_OPTIONS.find((opt) => opt.id === thumbnailId);
    if (option?.imageUrl) {
      return `https://fnbzfgmsamegbkeyhngn.supabase.co/storage/v1/object/public/tournament-images/${option.imageUrl}`;
    }

    return null;
  };

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

    // Image/thumbnail state
    customImageUri,
    hasManualSelection,
    uploadingImage,
    scanningImage,

    // Computed
    isMaxFargoDisabled: formData.openTournament === true,
    isOpenTournamentDisabled: formData.maxFargo.trim() !== "",
    isChipTournament, // 🎰 Expose to View — used to disable irrelevant fields

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
    handleThumbnailSelect,
    handleImageUpload,
    getThumbnailImageUrl,
    addSidePot,
    updateSidePot,
    removeSidePot,
    handleSubmit,
    getRecurrencePreview,
    navigateToLogin,
    navigateToFaq,

    // 🎰 Chip Tournament actions
    addChipRange,
    updateChipRange,
    removeChipRange,
    resetChipRangesToDefault,
  };
};
