import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { supabase } from "../../../../src/lib/supabase";
import { useAuthContext } from "../../../../src/providers/AuthProvider";
import { COLORS } from "../../../../src/theme/colors";
import { SPACING } from "../../../../src/theme/spacing";
import { FONT_SIZES } from "../../../../src/theme/typography";
import { Dropdown } from "../../../../src/views/components/common/dropdown";

export default function EditTournamentTDScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const { profile } = useAuthContext();

  // Tournament data
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tournament, setTournament] = useState<any>(null);
  const [venues, setVenues] = useState<any[]>([]);

  // Form state
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    game_type: "",
    tournament_format: "",
    tournament_date: "",
    start_time: "",
    end_time: "",
    venue_id: "",
    entry_fee: "",
    prize_pool: "",
    max_participants: "",
    rules: "",
  });

  const gameTypes = [
    { label: "8-Ball", value: "8-Ball" },
    { label: "9-Ball", value: "9-Ball" },
    { label: "10-Ball", value: "10-Ball" },
    { label: "Straight Pool", value: "Straight Pool" },
  ];

  const formatTypes = [
    { label: "Single Elimination", value: "single_elimination" },
    { label: "Double Elimination", value: "double_elimination" },
    { label: "Round Robin", value: "round_robin" },
  ];

  useEffect(() => {
    if (id && profile?.id_auto) {
      loadTournamentAndVenues();
    }
  }, [id, profile?.id_auto]);

  const loadTournamentAndVenues = async () => {
    try {
      // Load tournament (only if user is the director)
      const { data: tournamentData, error: tournamentError } = await supabase
        .from("tournaments")
        .select(
          `
          *,
          venues (
            id,
            venue
          )
        `,
        )
        .eq("id", id)
        .eq("director_id", profile!.id_auto)
        .single();

      if (tournamentError || !tournamentData) {
        Alert.alert(
          "Error",
          "Tournament not found or you don't have permission to edit it",
        );
        router.back();
        return;
      }

      // Load venues where TD is assigned
      const { data: venueDirectors } = await supabase
        .from("venue_directors")
        .select(
          `
          venue_id,
          venues (
            id,
            venue
          )
        `,
        )
        .eq("director_id", profile!.id_auto)
        .is("archived_at", null);

      const userVenues =
        venueDirectors?.map((vd: any) => ({
          label: vd.venues.venue,
          value: vd.venues.id.toString(),
        })) || [];

      setTournament(tournamentData);
      setVenues(userVenues);

      // Set form data
      setFormData({
        name: tournamentData.name || "",
        description: tournamentData.description || "",
        game_type: tournamentData.game_type || "",
        tournament_format: tournamentData.tournament_format || "",
        tournament_date: tournamentData.tournament_date || "",
        start_time: tournamentData.start_time || "",
        end_time: tournamentData.end_time || "",
        venue_id: tournamentData.venue_id?.toString() || "",
        entry_fee: tournamentData.entry_fee?.toString() || "",
        prize_pool: tournamentData.prize_pool?.toString() || "",
        max_participants: tournamentData.max_participants?.toString() || "",
        rules: tournamentData.rules || "",
      });
    } catch (error) {
      console.error("Error loading tournament:", error);
      Alert.alert("Error", "Failed to load tournament");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!formData.name || !formData.game_type || !formData.tournament_date) {
      Alert.alert("Error", "Please fill in all required fields");
      return;
    }

    setSaving(true);
    try {
      const updateData = {
        name: formData.name,
        description: formData.description,
        game_type: formData.game_type,
        tournament_format: formData.tournament_format,
        tournament_date: formData.tournament_date,
        start_time: formData.start_time || null,
        end_time: formData.end_time || null,
        venue_id: formData.venue_id ? parseInt(formData.venue_id) : null,
        entry_fee: formData.entry_fee ? parseFloat(formData.entry_fee) : null,
        prize_pool: formData.prize_pool
          ? parseFloat(formData.prize_pool)
          : null,
        max_participants: formData.max_participants
          ? parseInt(formData.max_participants)
          : null,
        rules: formData.rules,
      };

      const { error } = await supabase
        .from("tournaments")
        .update(updateData)
        .eq("id", id)
        .eq("director_id", profile!.id_auto); // Ensure they can only edit their own tournaments

      if (error) throw error;

      Alert.alert("Success", "Tournament updated successfully", [
        { text: "OK", onPress: () => router.back() },
      ]);
    } catch (error) {
      console.error("Error updating tournament:", error);
      Alert.alert("Error", "Failed to update tournament");
    } finally {
      setSaving(false);
    }
  };

  const updateFormData = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.loadingText}>Loading tournament...</Text>
      </View>
    );
  }

  if (!tournament) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>Tournament not found</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Text style={styles.backText}>← Cancel</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>EDIT TOURNAMENT</Text>
          <Text style={styles.headerSubtitle}>Tournament Director</Text>
        </View>
        <TouchableOpacity
          style={[styles.saveButton, saving && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={saving}
        >
          <Text style={styles.saveButtonText}>
            {saving ? "Saving..." : "Save"}
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.form}>
          {/* Tournament Name */}
          <View style={styles.field}>
            <Text style={styles.label}>Tournament Name *</Text>
            <TextInput
              style={styles.input}
              value={formData.name}
              onChangeText={(value) => updateFormData("name", value)}
              placeholder="Enter tournament name"
              placeholderTextColor={COLORS.textSecondary}
            />
          </View>

          {/* Description */}
          <View style={styles.field}>
            <Text style={styles.label}>Description</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={formData.description}
              onChangeText={(value) => updateFormData("description", value)}
              placeholder="Tournament description"
              placeholderTextColor={COLORS.textSecondary}
              multiline
              numberOfLines={3}
            />
          </View>

          {/* Game Type */}
          <View style={styles.field}>
            <Text style={styles.label}>Game Type *</Text>
            <Dropdown
              options={gameTypes}
              value={formData.game_type}
              onSelect={(value) => updateFormData("game_type", value)}
              placeholder="Select game type"
            />
          </View>

          {/* Tournament Format */}
          <View style={styles.field}>
            <Text style={styles.label}>Format</Text>
            <Dropdown
              options={formatTypes}
              value={formData.tournament_format}
              onSelect={(value) => updateFormData("tournament_format", value)}
              placeholder="Select format"
            />
          </View>

          {/* Date */}
          <View style={styles.field}>
            <Text style={styles.label}>Tournament Date *</Text>
            <TextInput
              style={styles.input}
              value={formData.tournament_date}
              onChangeText={(value) => updateFormData("tournament_date", value)}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={COLORS.textSecondary}
            />
          </View>

          {/* Time Fields */}
          <View style={styles.timeRow}>
            <View style={[styles.field, styles.timeField]}>
              <Text style={styles.label}>Start Time</Text>
              <TextInput
                style={styles.input}
                value={formData.start_time}
                onChangeText={(value) => updateFormData("start_time", value)}
                placeholder="HH:MM"
                placeholderTextColor={COLORS.textSecondary}
              />
            </View>
            <View style={[styles.field, styles.timeField]}>
              <Text style={styles.label}>End Time</Text>
              <TextInput
                style={styles.input}
                value={formData.end_time}
                onChangeText={(value) => updateFormData("end_time", value)}
                placeholder="HH:MM"
                placeholderTextColor={COLORS.textSecondary}
              />
            </View>
          </View>

          {/* Venue - Only shows venues TD is assigned to */}
          <View style={styles.field}>
            <Text style={styles.label}>Venue</Text>
            <Dropdown
              options={venues}
              value={formData.venue_id}
              onSelect={(value) => updateFormData("venue_id", value)}
              placeholder="Select venue"
            />
          </View>

          {/* Entry Fee */}
          <View style={styles.field}>
            <Text style={styles.label}>Entry Fee ($)</Text>
            <TextInput
              style={styles.input}
              value={formData.entry_fee}
              onChangeText={(value) => updateFormData("entry_fee", value)}
              placeholder="0.00"
              placeholderTextColor={COLORS.textSecondary}
              keyboardType="numeric"
            />
          </View>

          {/* Prize Pool */}
          <View style={styles.field}>
            <Text style={styles.label}>Prize Pool ($)</Text>
            <TextInput
              style={styles.input}
              value={formData.prize_pool}
              onChangeText={(value) => updateFormData("prize_pool", value)}
              placeholder="0.00"
              placeholderTextColor={COLORS.textSecondary}
              keyboardType="numeric"
            />
          </View>

          {/* Max Participants */}
          <View style={styles.field}>
            <Text style={styles.label}>Max Participants</Text>
            <TextInput
              style={styles.input}
              value={formData.max_participants}
              onChangeText={(value) =>
                updateFormData("max_participants", value)
              }
              placeholder="32"
              placeholderTextColor={COLORS.textSecondary}
              keyboardType="numeric"
            />
          </View>

          {/* Rules */}
          <View style={styles.field}>
            <Text style={styles.label}>Rules</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={formData.rules}
              onChangeText={(value) => updateFormData("rules", value)}
              placeholder="Tournament rules and regulations"
              placeholderTextColor={COLORS.textSecondary}
              multiline
              numberOfLines={4}
            />
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  centerContainer: {
    flex: 1,
    backgroundColor: COLORS.background,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textSecondary,
  },
  errorText: {
    fontSize: FONT_SIZES.md,
    color: COLORS.error,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.xl + SPACING.sm,
    paddingBottom: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  backButton: {
    padding: SPACING.xs,
  },
  backText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.primary,
    fontWeight: "500",
  },
  headerCenter: {
    alignItems: "center",
    flex: 1,
  },
  headerTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: "600",
    color: COLORS.text,
    letterSpacing: 0.5,
  },
  headerSubtitle: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    opacity: 0.7,
    marginTop: 2,
  },
  saveButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: 8,
  },
  saveButtonDisabled: {
    backgroundColor: COLORS.textSecondary,
  },
  saveButtonText: {
    color: COLORS.surface,
    fontSize: FONT_SIZES.sm,
    fontWeight: "600",
  },
  scrollView: {
    flex: 1,
  },
  form: {
    padding: SPACING.md,
    paddingBottom: SPACING.xl * 2,
  },
  field: {
    marginBottom: SPACING.lg,
  },
  label: {
    fontSize: FONT_SIZES.sm,
    fontWeight: "600",
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },
  input: {
    backgroundColor: COLORS.surface,
    borderRadius: 8,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.sm,
    fontSize: FONT_SIZES.sm,
    color: COLORS.text,
    borderWidth: 1,
    borderColor: COLORS.border,
    minHeight: 44,
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: "top",
  },
  timeRow: {
    flexDirection: "row",
    gap: SPACING.md,
  },
  timeField: {
    flex: 1,
  },
});
