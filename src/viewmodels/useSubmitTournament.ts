import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Alert, Platform, TextInput } from "react-native";
import { ImageContentScanner } from "../../image-scanner";
import { supabase } from "../lib/supabase";
import { tournamentService } from "../models/services/tournament.service";
import {
  VenueTableRecord,
  venueTableService,
} from "../models/services/venue-table.service";
import { venueService } from "../models/services/venue.service";
import { Venue } from "../models/types/venue.types";
import { useAuthContext } from "../providers/AuthProvider";
import {
  ChipRange,
  DEFAULT_CHIP_RANGES,
  THUMBNAIL_OPTIONS,
  TournamentFormData,
  getRecurrencePreviewText,
  initialFormData,
} from "../utils/tournament-form-data";

// ── Web-safe alert helper ─────────────────────────────────────────────────────
const showAlert = (title: string, message: string, onOk?: () => void) => {
  if (Platform.OS === "web") {
    window.alert(`${title}\n\n${message}`);
    onOk?.();
  } else {
    Alert.alert(title, message, onOk ? [{ text: "OK", onPress: onOk }] : undefined);
  }
};

// ——— Helpers ——————————————————————————————————————————————————————————

/** Turn a Date into "YYYY-MM-DD" using LOCAL year/month/day (not UTC) */
const toLocalDateString = (date: Date): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

// ——— Types ———————————————————————————————————————————————————————————

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

interface DropdownOption {
  label: string;
  value: string;
}

// ——— Hook ————————————————————————————————————————————————————————————

export const useSubmitTournament = () => {
  const router = useRouter();
  const {
    user,
    profile,
    loading: authLoading,
    canSubmitTournaments,
  } = useAuthContext();

  // —— Data state —————————————————————————————————————————————————————
  const [dataLoading, setDataLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedVenue, setSelectedVenue] = useState<Venue | null>(null);
  const [formData, setFormData] = useState<TournamentFormData>(initialFormData);
  const [sidePots, setSidePots] = useState<SidePot[]>([]);

  // —— Venue tables state —————————————————————————————————————————————
  const [venueTables, setVenueTables] = useState<VenueTableRecord[]>([]);
  const [venueTableSizeOptions, setVenueTableSizeOptions] = useState<DropdownOption[]>([]);
  const [loadingVenueTables, setLoadingVenueTables] = useState(false);

  // —— Image/thumbnail state ——————————————————————————————————————————
  const [customImageUri, setCustomImageUri] = useState<string | null>(null);
  const [hasManualSelection, setHasManualSelection] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [scanningImage, setScanningImage] = useState(false);

  // —— Refs for auto-advance ——————————————————————————————————————————
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

  // —— Effects ————————————————————————————————————————————————————————

  useEffect(() => {
    if (!authLoading && profile && canSubmitTournaments) {
      loadFormData();
    } else if (!authLoading) {
      setDataLoading(false);
    }
  }, [authLoading, profile, canSubmitTournaments]);

  useEffect(() => {
    if (formData.gameType && !hasManualSelection) {
      // Normalize scotch doubles → base game type for thumbnail matching
      const normalizedGameType = formData.gameType?.replace("-scotch-doubles", "") ?? formData.gameType;
      const matchingThumb = THUMBNAIL_OPTIONS.find(
        (thumb) =>
          thumb.gameType === formData.gameType ||
          thumb.gameType === normalizedGameType ||
          (thumb.gameType &&
            normalizedGameType?.toLowerCase().includes(thumb.gameType)),
      );
      if (matchingThumb) {
        setFormData((prev) => ({ ...prev, thumbnail: matchingThumb.id }));
      }
    }
  }, [formData.gameType, hasManualSelection]);

  useEffect(() => {
    if (formData.tournamentFormat === "chip-tournament") {
      setFormData((prev) => ({
        ...prev,
        chipRanges:
          prev.chipRanges.length === 0
            ? [...DEFAULT_CHIP_RANGES]
            : prev.chipRanges,
        gameSpot: "",
        race: "",
        maxFargo: "",
        openTournament: false,
      }));
    } else {
      if (formData.chipRanges.length > 0) {
        setFormData((prev) => ({ ...prev, chipRanges: [] }));
      }
    }
  }, [formData.tournamentFormat]);

  // —— Data loading ———————————————————————————————————————————————————

  const loadFormData = async () => {
    try {
      const venuesData = await venueService.getVenues();
      setVenues(venuesData);

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

  // —— Venue tables loading ———————————————————————————————————————————

  const loadVenueTables = async (venueId: number) => {
    setLoadingVenueTables(true);
    try {
      const [tables, sizeOptions] = await Promise.all([
        venueTableService.getTablesForVenue(venueId),
        venueTableService.getTableSizeOptions(venueId),
      ]);

      setVenueTables(tables);
      setVenueTableSizeOptions([
        { label: "Select Table Size", value: "" },
        ...sizeOptions,
      ]);

      if (sizeOptions.length === 1) {
        setFormData((prev) => ({ ...prev, tableSize: sizeOptions[0].value }));
      } else {
        setFormData((prev) => ({ ...prev, tableSize: "" }));
      }
    } catch (error) {
      console.error("Error loading venue tables:", error);
      setVenueTables([]);
      setVenueTableSizeOptions([]);
    } finally {
      setLoadingVenueTables(false);
    }
  };

  // —— Form updates ———————————————————————————————————————————————————

  const updateFormData = (field: keyof TournamentFormData, value: any) => {
    // Changing game type should re-trigger auto thumbnail selection
    if (field === "gameType") {
      setHasManualSelection(false);
    }

    setFormData((prev) => {
      const updated = { ...prev, [field]: value };

      if (field === "openTournament" && value === true) {
        updated.maxFargo = "";
      }
      if (field === "maxFargo" && value.trim() !== "") {
        updated.openTournament = false;
      }
      if (field === "isRecurring" && value === false) {
        updated.recurrenceType = "";
        updated.recurrenceDay = "";
        updated.recurrenceWeek = undefined;
        updated.seriesEndDate = null;
      }

      return updated;
    });
  };

  // —— Chip Range CRUD ————————————————————————————————————————————————

  const addChipRange = () => {
    setFormData((prev) => {
      const ranges = [...prev.chipRanges];
      const lastMax = ranges.length > 0 ? ranges[ranges.length - 1].maxRating : -1;
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

  const updateChipRange = (index: number, field: keyof ChipRange, value: string) => {
    setFormData((prev) => {
      const ranges = [...prev.chipRanges];
      if (field === "label") {
        ranges[index] = { ...ranges[index], label: value };
      } else {
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
    setFormData((prev) => ({ ...prev, chipRanges: [...DEFAULT_CHIP_RANGES] }));
  };

  // —— Computed ———————————————————————————————————————————————————————

  const isChipTournament = formData.tournamentFormat === "chip-tournament";
  const venueHasTables = venueTables.length > 0;

  // —— Venue selection ————————————————————————————————————————————————

  const handleVenueSelect = (venueId: string) => {
    const venue = venues.find((v) => v.id.toString() === venueId);
    setSelectedVenue(venue || null);
    updateFormData("venueId", venue ? venue.id : null);

    if (venue?.phone) {
      updateFormData("phoneNumber", venue.phone);
    }

    if (venue) {
      loadVenueTables(venue.id);
    } else {
      setVenueTables([]);
      setVenueTableSizeOptions([]);
      setFormData((prev) => ({ ...prev, tableSize: "" }));
    }
  };

  // —— Template selection —————————————————————————————————————————————

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

        if (venue) {
          await loadVenueTables(venue.id);
        }

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
          calcutta: template.calcutta || false,
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
          chipRanges:
            template.tournament_format === "chip-tournament" && template.chip_ranges
              ? template.chip_ranges
              : [],
        });

        if (template.thumbnail) setHasManualSelection(true);

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

  // —— Thumbnail / Image upload ———————————————————————————————————————

  const handleThumbnailSelect = (thumbnailId: string) => {
    if (thumbnailId === "upload-custom") {
      handleImageUpload();
    } else {
      setHasManualSelection(true);
      setCustomImageUri(null);
      updateFormData("thumbnail", thumbnailId);
    }
  };

  const handleImageUpload = async () => {
    try {
      const { status: existingStatus } =
        await ImagePicker.getMediaLibraryPermissionsAsync();

      if (existingStatus === "denied") {
        Alert.alert(
          "Photo Access Disabled",
          "Compete needs access to your photo library to upload images. Please enable it in Settings.",
          [
            { text: "Cancel", style: "cancel" },
            { text: "Open Settings", onPress: () => Linking.openSettings() },
          ],
        );
        return;
      }

      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (status !== "granted") {
        Alert.alert(
          "Permission needed",
          "Please grant photo library access to upload images.",
          [
            { text: "Cancel", style: "cancel" },
            { text: "Open Settings", onPress: () => Linking.openSettings() },
          ],
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

      if (result.canceled || !result.assets[0]) return;

      setUploadingImage(true);
      setScanningImage(true);
      const asset = result.assets[0];

      const scanResult = await ImageContentScanner.scanImage(
        asset.uri,
        profile?.id_auto?.toString(),
      );

      setScanningImage(false);

      if (!scanResult.isAppropriate) {
        Alert.alert(
          "🚫 Image Not Allowed",
          `This image contains inappropriate content and cannot be used for tournaments:\n\n${scanResult.violations.join("\n")}`,
          [
            { text: "Try Different Image", onPress: () => handleImageUpload() },
            { text: "Cancel", style: "cancel" },
          ],
        );
        setUploadingImage(false);
        return;
      }

      const timestamp = new Date().getTime();
      const fileExt = asset.uri.split(".").pop()?.toLowerCase() || "jpg";
      const fileName = `uploads/tournament-${timestamp}-custom.${fileExt}`;

      const formDataUpload = new FormData();
      formDataUpload.append("file", {
        uri: asset.uri,
        type: `image/${fileExt}`,
        name: fileName,
      } as any);

      const { error } = await supabase.storage
        .from("tournament-images")
        .upload(fileName, formDataUpload, {
          contentType: `image/${fileExt}`,
          upsert: false,
        });

      if (error) throw error;

      const { data: { publicUrl } } = supabase.storage
        .from("tournament-images")
        .getPublicUrl(fileName);

      setCustomImageUri(asset.uri);
      setHasManualSelection(true);
      updateFormData("thumbnail", `custom:${publicUrl}`);

      Alert.alert("Success", "✅ Image scanned and uploaded successfully!");
    } catch (error: any) {
      console.error("Image upload error:", error);
      Alert.alert(
        "Upload Error",
        error.message || "Failed to upload image. Please check your internet connection.",
      );
    } finally {
      setUploadingImage(false);
      setScanningImage(false);
    }
  };

  // —— Side pots ——————————————————————————————————————————————————————

  const addSidePot = () => setSidePots([...sidePots, { name: "", amount: "" }]);

  const updateSidePot = (index: number, field: "name" | "amount", value: string) => {
    const updated = [...sidePots];
    updated[index] = { ...updated[index], [field]: value };
    setSidePots(updated);
  };

  const removeSidePot = (index: number) => {
    setSidePots(sidePots.filter((_, i) => i !== index));
  };

  // —— Recurrence helpers —————————————————————————————————————————————

  const getDayFromDate = (date: Date): string => {
    const days = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
    return days[date.getDay()];
  };

  const calculateNextTournamentDates = (startDate: Date, recurrenceType: string): Date[] => {
    const dates: Date[] = [];
    const horizonDays = 30;
    const maxDate = new Date(startDate);
    maxDate.setDate(maxDate.getDate() + horizonDays);

    let nextDate = new Date(startDate);

    while (true) {
      if (recurrenceType === "weekly") {
        nextDate = new Date(nextDate);
        nextDate.setDate(nextDate.getDate() + 7);
      } else if (recurrenceType === "monthly") {
        nextDate = new Date(nextDate);
        nextDate.setMonth(nextDate.getMonth() + 1);
      } else {
        break;
      }

      if (nextDate > maxDate) break;
      dates.push(new Date(nextDate));
      if (dates.length >= 10) break;
    }

    return dates;
  };

  const getChipRangesPayload = (): ChipRange[] | null => {
    if (!isChipTournament || formData.chipRanges.length === 0) return null;
    return formData.chipRanges.filter((r) => r.maxRating > 0 && r.chips > 0);
  };

  // —— Equipment options from venue ——————————————————————————————————

  const getEquipmentOptionsFromVenue = (): DropdownOption[] => {
    if (venueTables.length === 0) return [];
    const brands = [...new Set(venueTables.map((t) => t.brand).filter(Boolean))] as string[];
    if (brands.length === 0) return [];
    return [
      { label: "Select Equipment", value: "" },
      ...brands.map((b) => ({ label: b, value: b.toLowerCase() })),
    ];
  };

  // —— Submission —————————————————————————————————————————————————————

  const buildTournamentPayload = (dateOverride?: Date, templateId?: number) => {
    const validSidePots = sidePots.filter((pot) => pot.name.trim() && pot.amount.trim());
    const date = dateOverride || formData.tournamentDate!;

    return {
      director_id: profile!.id_auto,
      venue_id: formData.venueId,
      template_id: templateId || formData.templateId,
      parent_template_id: templateId,
      name: formData.name.trim(),
      description: formData.description.trim() || null,
      game_type: formData.gameType,
      tournament_format: formData.tournamentFormat,
      game_spot: formData.gameSpot.trim() || null,
      race: formData.race.trim() || null,
      table_size: formData.tableSize || null,
      equipment: formData.equipment || null,
      number_of_tables: formData.numberOfTables ? parseInt(formData.numberOfTables) : null,
      tournament_date: date instanceof Date ? toLocalDateString(date) : date,
      start_time: formData.startTime,
      timezone: formData.timezone,
      entry_fee: formData.entryFee ? parseFloat(formData.entryFee) : 0,
      added_money: formData.addedMoney ? parseFloat(formData.addedMoney) : 0,
      side_pots: validSidePots.length > 0 ? validSidePots : null,
      max_fargo: formData.maxFargo ? parseInt(formData.maxFargo) : null,
      required_fargo_games: formData.requiredFargoGames ? parseInt(formData.requiredFargoGames) : null,
      reports_to_fargo: formData.reportsToFargo,
      calcutta: formData.calcutta,
      open_tournament: formData.openTournament,
      phone_number: formData.phoneNumber.trim() || null,
      thumbnail: formData.thumbnail || null,
      chip_ranges: getChipRangesPayload(),
      is_recurring: formData.isRecurring,
      status: "active",
    };
  };

  const createTournamentTemplate = async (): Promise<number> => {
    if (!formData.tournamentDate) throw new Error("Tournament date is required");

    const recurrenceDay = getDayFromDate(formData.tournamentDate);
    let startDateString: string;
    if (formData.tournamentDate instanceof Date) {
      startDateString = toLocalDateString(formData.tournamentDate);
    } else if (typeof formData.tournamentDate === "string") {
      startDateString = formData.tournamentDate;
    } else {
      throw new Error("Invalid tournament date format");
    }

    let endDateString: string | null = null;
    if (formData.seriesEndDate) {
      if (formData.seriesEndDate instanceof Date) {
        endDateString = toLocalDateString(formData.seriesEndDate);
      } else if (typeof formData.seriesEndDate === "string") {
        endDateString = formData.seriesEndDate;
      }
    }

    const validSidePots = sidePots.filter((pot) => pot.name.trim() && pot.amount.trim());

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
      number_of_tables: formData.numberOfTables ? parseInt(formData.numberOfTables) : null,
      entry_fee: formData.entryFee ? parseFloat(formData.entryFee) : null,
      added_money: formData.addedMoney ? parseFloat(formData.addedMoney) : null,
      side_pots: validSidePots.length > 0 ? validSidePots : null,
      max_fargo: formData.maxFargo ? parseInt(formData.maxFargo) : null,
      required_fargo_games: formData.requiredFargoGames ? parseInt(formData.requiredFargoGames) : null,
      reports_to_fargo: formData.reportsToFargo || false,
      calcutta: formData.calcutta || false,
      open_tournament: formData.openTournament || false,
      phone_number: formData.phoneNumber.trim() || null,
      thumbnail: formData.thumbnail || null,
      chip_ranges: getChipRangesPayload(),
      recurrence_type: formData.recurrenceType,
      recurrence_day: recurrenceDay,
      recurrence_week: null,
      start_time: formData.startTime,
      series_start_date: startDateString,
      series_end_date: endDateString,
      horizon_days: 30,
      status: "active",
    };

    const { data, error } = await supabase
      .from("tournament_templates")
      .insert(templateData)
      .select()
      .single();

    if (error) throw error;
    return data.id;
  };

  const createSingleTournament = async (templateId?: number): Promise<void> => {
    const payload = buildTournamentPayload(undefined, templateId);
    await tournamentService.createTournament(payload as any);
  };

  const createAdditionalTournaments = async (templateId: number): Promise<void> => {
    if (!formData.tournamentDate || !formData.recurrenceType) return;

    const nextDates = calculateNextTournamentDates(
      formData.tournamentDate,
      formData.recurrenceType,
    );

    if (nextDates.length === 0) return;
    for (const date of nextDates) {
      const payload = buildTournamentPayload(date, templateId);
      await tournamentService.createTournament(payload as any);
    }
  };

  // —— Validation (web-safe) ——————————————————————————————————————————

  const validateForm = (): boolean => {
    if (!formData.name.trim()) {
      showAlert("Error", "Please enter a tournament name.");
      return false;
    }
    if (!formData.gameType) {
      showAlert("Error", "Please select a game type.");
      return false;
    }
    if (!formData.tournamentFormat) {
      showAlert("Error", "Please select a tournament format.");
      return false;
    }

    if (isChipTournament) {
      if (formData.chipRanges.length === 0) {
        showAlert("Error", "Please add at least one chip range for your Chip Tournament.");
        return false;
      }
      for (let i = 0; i < formData.chipRanges.length; i++) {
        const range = formData.chipRanges[i];
        if (!range.label.trim()) {
          showAlert("Error", `Chip range row ${i + 1}: Please enter a label.`);
          return false;
        }
        if (range.minRating > range.maxRating) {
          showAlert("Error", `Chip range row ${i + 1}: Min rating cannot be greater than max rating.`);
          return false;
        }
        if (range.chips < 1) {
          showAlert("Error", `Chip range row ${i + 1}: Chips must be at least 1.`);
          return false;
        }
      }
    }

    if (!formData.startTime) {
      showAlert("Error", "Please select a start time.");
      return false;
    }
    if (!formData.venueId) {
      showAlert("Error", "Please select a venue.");
      return false;
    }
    if (!venueHasTables) {
      showAlert("No Tables Configured", "This venue doesn't have any tables set up yet. Please contact the venue owner to add their table information before creating a tournament.");
      return false;
    }
    if (!formData.tableSize) {
      showAlert("Error", "Please select a table size.");
      return false;
    }
    if (!formData.tournamentDate) {
      showAlert(
        "Error",
        formData.isRecurring
          ? "Please select when your series begins."
          : "Please select a tournament date.",
      );
      return false;
    }
    if (formData.isRecurring && !formData.recurrenceType) {
      showAlert("Error", "Please select how often this repeats.");
      return false;
    }

    return true;
  };

  const resetForm = () => {
    setFormData(initialFormData);
    setSidePots([]);
    setSelectedVenue(null);
    setCustomImageUri(null);
    setHasManualSelection(false);
    setVenueTables([]);
    setVenueTableSizeOptions([]);
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;
    if (!profile) return;

    setSubmitting(true);
    try {
      if (formData.isRecurring) {
        const templateId = await createTournamentTemplate();
        await createSingleTournament(templateId);
        await createAdditionalTournaments(templateId);

        const additionalCount = calculateNextTournamentDates(
          formData.tournamentDate!,
          formData.recurrenceType,
        ).length;

        showAlert(
          "Success!",
          `Your recurring tournament series "${formData.name}" has been created! ${additionalCount + 1} tournaments have been scheduled within the next 30 days.`,
          resetForm,
        );
      } else {
        await createSingleTournament();
        showAlert("Success!", "Your tournament has been submitted successfully!", resetForm);
      }
    } catch (error: any) {
      console.error("Submit error:", error);
      showAlert("Error", error.message || "Failed to submit tournament.");
    } finally {
      setSubmitting(false);
    }
  };

  const getRecurrencePreview = (): string => getRecurrencePreviewText(formData);

  const navigateToLogin = () => router.push("/auth/login" as any);
  const navigateToFaq = () => router.push("/(tabs)/faq" as any);

  // —— Dropdown options ———————————————————————————————————————————————

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

  const equipmentOptionsFromVenue = getEquipmentOptionsFromVenue();

  const getThumbnailImageUrl = (thumbnailId: string) => {
    if (thumbnailId.startsWith("custom:")) return thumbnailId.replace("custom:", "");
    const option = THUMBNAIL_OPTIONS.find((opt) => opt.id === thumbnailId);
    if (option?.imageUrl) {
      return `https://fnbzfgmsamegbkeyhngn.supabase.co/storage/v1/object/public/tournament-images/${option.imageUrl}`;
    }
    return null;
  };

  // —— Public API —————————————————————————————————————————————————————

  return {
    user,
    profile,
    isLoading: authLoading || dataLoading,
    canSubmitTournaments,
    formData,
    sidePots,
    selectedVenue,
    submitting,
    venueTables,
    venueTableSizeOptions,
    loadingVenueTables,
    venueHasTables,
    equipmentOptionsFromVenue,
    customImageUri,
    hasManualSelection,
    uploadingImage,
    scanningImage,
    isMaxFargoDisabled: formData.openTournament === true,
    isOpenTournamentDisabled: formData.maxFargo.trim() !== "",
    isChipTournament,
    venueOptions,
    templateOptions,
    hasTemplates: templates.length > 0,
    refs,
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
    addChipRange,
    updateChipRange,
    removeChipRange,
    resetChipRangesToDefault,
  };
};
