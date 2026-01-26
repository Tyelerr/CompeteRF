import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { COLORS } from "../../../../src/theme/colors";
import { SPACING } from "../../../../src/theme/spacing";
import { FONT_SIZES } from "../../../../src/theme/typography";
import { useEditTournament } from "../../../../src/viewmodels/useEditTournament";

type TabType = "basic" | "details" | "settings";

export default function EditTournamentScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const tournamentId = parseInt(id, 10);

  const [activeTab, setActiveTab] = useState<TabType>("basic");
  const vm = useEditTournament(tournamentId);

  const handleSave = async () => {
    const success = await vm.saveDetails();
    if (success) {
      Alert.alert("Success", "Tournament updated successfully.");
    } else {
      Alert.alert("Error", "Failed to update tournament.");
    }
  };

  const handleBack = () => {
    if (vm.hasChanges()) {
      Alert.alert(
        "Unsaved Changes",
        "You have unsaved changes. Are you sure you want to go back?",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Discard",
            style: "destructive",
            onPress: () => router.back(),
          },
        ],
      );
    } else {
      router.back();
    }
  };

  if (vm.loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading tournament...</Text>
      </View>
    );
  }

  if (!vm.tournament || !vm.editedTournament) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>Tournament not found</Text>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.linkText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const t = vm.editedTournament;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={handleBack}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          Edit Tournament
        </Text>
        <TouchableOpacity
          style={[styles.saveButton, vm.saving && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={vm.saving}
        >
          <Text style={styles.saveButtonText}>
            {vm.saving ? "Saving..." : "Save"}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, activeTab === "basic" && styles.activeTab]}
          onPress={() => setActiveTab("basic")}
        >
          <Text
            style={[
              styles.tabText,
              activeTab === "basic" && styles.activeTabText,
            ]}
          >
            Basic Info
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === "details" && styles.activeTab]}
          onPress={() => setActiveTab("details")}
        >
          <Text
            style={[
              styles.tabText,
              activeTab === "details" && styles.activeTabText,
            ]}
          >
            Game Details
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === "settings" && styles.activeTab]}
          onPress={() => setActiveTab("settings")}
        >
          <Text
            style={[
              styles.tabText,
              activeTab === "settings" && styles.activeTabText,
            ]}
          >
            Settings
          </Text>
        </TouchableOpacity>
      </View>

      {/* Content */}
      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={vm.refreshing}
            onRefresh={vm.onRefresh}
            tintColor={COLORS.primary}
          />
        }
      >
        {activeTab === "basic" && (
          <View style={styles.section}>
            {/* Tournament Name */}
            <View style={styles.field}>
              <Text style={styles.label}>Tournament Name *</Text>
              <TextInput
                style={styles.input}
                value={t.name || ""}
                onChangeText={(v) => vm.updateField("name", v)}
                placeholder="Enter tournament name"
                placeholderTextColor={COLORS.textSecondary}
              />
            </View>

            {/* Description */}
            <View style={styles.field}>
              <Text style={styles.label}>Description</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={t.description || ""}
                onChangeText={(v) => vm.updateField("description", v)}
                placeholder="Enter description"
                placeholderTextColor={COLORS.textSecondary}
                multiline
                numberOfLines={4}
              />
            </View>

            {/* Venue */}
            <View style={styles.field}>
              <Text style={styles.label}>Venue *</Text>
              <View style={styles.pickerWrapper}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {vm.venues.map((venue) => (
                    <TouchableOpacity
                      key={venue.id}
                      style={[
                        styles.pickerOption,
                        t.venue_id === venue.id && styles.pickerOptionActive,
                      ]}
                      onPress={() => vm.updateField("venue_id", venue.id)}
                    >
                      <Text
                        style={[
                          styles.pickerOptionText,
                          t.venue_id === venue.id &&
                            styles.pickerOptionTextActive,
                        ]}
                      >
                        {venue.venue}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            </View>

            {/* Director */}
            <View style={styles.field}>
              <Text style={styles.label}>Tournament Director *</Text>
              <View style={styles.pickerWrapper}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {vm.directors.map((director) => (
                    <TouchableOpacity
                      key={director.id_auto}
                      style={[
                        styles.pickerOption,
                        t.director_id === director.id_auto &&
                          styles.pickerOptionActive,
                      ]}
                      onPress={() =>
                        vm.updateField("director_id", director.id_auto)
                      }
                    >
                      <Text
                        style={[
                          styles.pickerOptionText,
                          t.director_id === director.id_auto &&
                            styles.pickerOptionTextActive,
                        ]}
                      >
                        {director.name || director.user_name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            </View>

            {/* Date */}
            <View style={styles.field}>
              <Text style={styles.label}>Tournament Date *</Text>
              <TextInput
                style={styles.input}
                value={t.tournament_date || ""}
                onChangeText={(v) => vm.updateField("tournament_date", v)}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={COLORS.textSecondary}
              />
            </View>

            {/* Start Time */}
            <View style={styles.field}>
              <Text style={styles.label}>Start Time *</Text>
              <TextInput
                style={styles.input}
                value={t.start_time || ""}
                onChangeText={(v) => vm.updateField("start_time", v)}
                placeholder="HH:MM (24hr format)"
                placeholderTextColor={COLORS.textSecondary}
              />
            </View>

            {/* Phone Number */}
            <View style={styles.field}>
              <Text style={styles.label}>Contact Phone</Text>
              <TextInput
                style={styles.input}
                value={t.phone_number || ""}
                onChangeText={(v) => vm.updateField("phone_number", v)}
                placeholder="Enter contact phone"
                placeholderTextColor={COLORS.textSecondary}
                keyboardType="phone-pad"
              />
            </View>
          </View>
        )}

        {activeTab === "details" && (
          <View style={styles.section}>
            {/* Game Type */}
            <View style={styles.field}>
              <Text style={styles.label}>Game Type *</Text>
              <View style={styles.optionsGrid}>
                {vm.gameTypeOptions.map((option) => (
                  <TouchableOpacity
                    key={option.value}
                    style={[
                      styles.optionButton,
                      t.game_type === option.value && styles.optionButtonActive,
                    ]}
                    onPress={() => vm.updateField("game_type", option.value)}
                  >
                    <Text
                      style={[
                        styles.optionButtonText,
                        t.game_type === option.value &&
                          styles.optionButtonTextActive,
                      ]}
                    >
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Tournament Format */}
            <View style={styles.field}>
              <Text style={styles.label}>Tournament Format *</Text>
              <View style={styles.optionsGrid}>
                {vm.formatOptions.map((option) => (
                  <TouchableOpacity
                    key={option.value}
                    style={[
                      styles.optionButton,
                      t.tournament_format === option.value &&
                        styles.optionButtonActive,
                    ]}
                    onPress={() =>
                      vm.updateField("tournament_format", option.value)
                    }
                  >
                    <Text
                      style={[
                        styles.optionButtonText,
                        t.tournament_format === option.value &&
                          styles.optionButtonTextActive,
                      ]}
                    >
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Table Size */}
            <View style={styles.field}>
              <Text style={styles.label}>Table Size</Text>
              <View style={styles.optionsGrid}>
                {vm.tableSizeOptions.map((option) => (
                  <TouchableOpacity
                    key={option.value}
                    style={[
                      styles.optionButton,
                      t.table_size === option.value &&
                        styles.optionButtonActive,
                    ]}
                    onPress={() => vm.updateField("table_size", option.value)}
                  >
                    <Text
                      style={[
                        styles.optionButtonText,
                        t.table_size === option.value &&
                          styles.optionButtonTextActive,
                      ]}
                    >
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Race */}
            <View style={styles.field}>
              <Text style={styles.label}>Race To</Text>
              <TextInput
                style={styles.input}
                value={t.race || ""}
                onChangeText={(v) => vm.updateField("race", v)}
                placeholder="e.g., 7 or 5/7"
                placeholderTextColor={COLORS.textSecondary}
              />
            </View>

            {/* Number of Tables */}
            <View style={styles.field}>
              <Text style={styles.label}>Number of Tables</Text>
              <TextInput
                style={styles.input}
                value={t.number_of_tables?.toString() || ""}
                onChangeText={(v) =>
                  vm.updateField("number_of_tables", v ? parseInt(v, 10) : null)
                }
                placeholder="Enter number of tables"
                placeholderTextColor={COLORS.textSecondary}
                keyboardType="number-pad"
              />
            </View>

            {/* Equipment */}
            <View style={styles.field}>
              <Text style={styles.label}>Equipment</Text>
              <TextInput
                style={styles.input}
                value={t.equipment || ""}
                onChangeText={(v) => vm.updateField("equipment", v)}
                placeholder="e.g., Diamond tables, Aramith balls"
                placeholderTextColor={COLORS.textSecondary}
              />
            </View>
          </View>
        )}

        {activeTab === "settings" && (
          <View style={styles.section}>
            {/* Entry Fee */}
            <View style={styles.field}>
              <Text style={styles.label}>Entry Fee ($)</Text>
              <TextInput
                style={styles.input}
                value={t.entry_fee?.toString() || ""}
                onChangeText={(v) =>
                  vm.updateField("entry_fee", v ? parseFloat(v) : null)
                }
                placeholder="0.00"
                placeholderTextColor={COLORS.textSecondary}
                keyboardType="decimal-pad"
              />
            </View>

            {/* Added Money */}
            <View style={styles.field}>
              <Text style={styles.label}>Added Money ($)</Text>
              <TextInput
                style={styles.input}
                value={t.added_money?.toString() || ""}
                onChangeText={(v) =>
                  vm.updateField("added_money", v ? parseFloat(v) : null)
                }
                placeholder="0.00"
                placeholderTextColor={COLORS.textSecondary}
                keyboardType="decimal-pad"
              />
            </View>

            {/* Open Tournament Toggle */}
            <View style={styles.toggleField}>
              <View style={styles.toggleInfo}>
                <Text style={styles.label}>Open Tournament</Text>
                <Text style={styles.toggleHint}>No Fargo rating limit</Text>
              </View>
              <Switch
                value={t.open_tournament || false}
                onValueChange={(v) => vm.updateField("open_tournament", v)}
                trackColor={{
                  false: COLORS.border,
                  true: COLORS.primary + "80",
                }}
                thumbColor={
                  t.open_tournament ? COLORS.primary : COLORS.textSecondary
                }
              />
            </View>

            {/* Max Fargo (only if not open) */}
            {!t.open_tournament && (
              <View style={styles.field}>
                <Text style={styles.label}>Max Fargo Rating</Text>
                <TextInput
                  style={styles.input}
                  value={t.max_fargo?.toString() || ""}
                  onChangeText={(v) =>
                    vm.updateField("max_fargo", v ? parseInt(v, 10) : null)
                  }
                  placeholder="e.g., 500"
                  placeholderTextColor={COLORS.textSecondary}
                  keyboardType="number-pad"
                />
              </View>
            )}

            {/* Required Fargo Games */}
            <View style={styles.field}>
              <Text style={styles.label}>Required Fargo Games</Text>
              <TextInput
                style={styles.input}
                value={t.required_fargo_games?.toString() || ""}
                onChangeText={(v) =>
                  vm.updateField(
                    "required_fargo_games",
                    v ? parseInt(v, 10) : null,
                  )
                }
                placeholder="Minimum games for Fargo rating"
                placeholderTextColor={COLORS.textSecondary}
                keyboardType="number-pad"
              />
            </View>

            {/* Reports to Fargo Toggle */}
            <View style={styles.toggleField}>
              <View style={styles.toggleInfo}>
                <Text style={styles.label}>Reports to Fargo</Text>
                <Text style={styles.toggleHint}>Results sent to FargoRate</Text>
              </View>
              <Switch
                value={t.reports_to_fargo || false}
                onValueChange={(v) => vm.updateField("reports_to_fargo", v)}
                trackColor={{
                  false: COLORS.border,
                  true: COLORS.primary + "80",
                }}
                thumbColor={
                  t.reports_to_fargo ? COLORS.primary : COLORS.textSecondary
                }
              />
            </View>

            {/* Status Info (read-only) */}
            <View style={styles.statusSection}>
              <Text style={styles.sectionTitle}>Status Information</Text>
              <View style={styles.statusRow}>
                <Text style={styles.statusLabel}>Current Status:</Text>
                <Text
                  style={[
                    styles.statusValue,
                    t.status === "active" && styles.statusActive,
                    t.status === "cancelled" && styles.statusCancelled,
                    t.status === "archived" && styles.statusArchived,
                  ]}
                >
                  {t.status?.toUpperCase()}
                </Text>
              </View>
              {t.status === "cancelled" && t.cancellation_reason && (
                <View style={styles.statusRow}>
                  <Text style={styles.statusLabel}>Cancel Reason:</Text>
                  <Text style={styles.statusValueSmall}>
                    {t.cancellation_reason}
                  </Text>
                </View>
              )}
            </View>
          </View>
        )}

        <View style={styles.bottomSpacer} />
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
    padding: SPACING.lg,
  },
  loadingText: {
    marginTop: SPACING.md,
    fontSize: FONT_SIZES.md,
    color: COLORS.textSecondary,
  },
  errorText: {
    fontSize: FONT_SIZES.lg,
    color: COLORS.error,
    marginBottom: SPACING.md,
  },
  linkText: {
    fontSize: FONT_SIZES.md,
    color: COLORS.primary,
    fontWeight: "600",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.xl + SPACING.lg,
    paddingBottom: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  backButton: {
    padding: SPACING.xs,
  },
  backText: {
    fontSize: FONT_SIZES.md,
    color: COLORS.primary,
    fontWeight: "600",
  },
  headerTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: "700",
    color: COLORS.text,
    flex: 1,
    textAlign: "center",
  },
  saveButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: 8,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: "#FFFFFF",
    fontSize: FONT_SIZES.sm,
    fontWeight: "600",
  },
  tabs: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  tab: {
    flex: 1,
    paddingVertical: SPACING.md,
    alignItems: "center",
  },
  activeTab: {
    borderBottomWidth: 2,
    borderBottomColor: COLORS.primary,
  },
  tabText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    fontWeight: "600",
  },
  activeTabText: {
    color: COLORS.primary,
  },
  content: {
    flex: 1,
  },
  section: {
    padding: SPACING.md,
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
    padding: SPACING.sm,
    fontSize: FONT_SIZES.md,
    color: COLORS.text,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  textArea: {
    minHeight: 100,
    textAlignVertical: "top",
  },
  pickerWrapper: {
    marginTop: SPACING.xs,
  },
  pickerOption: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: 20,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginRight: SPACING.sm,
  },
  pickerOptionActive: {
    backgroundColor: COLORS.primary + "20",
    borderColor: COLORS.primary,
  },
  pickerOptionText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
  },
  pickerOptionTextActive: {
    color: COLORS.primary,
    fontWeight: "600",
  },
  optionsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: SPACING.sm,
    marginTop: SPACING.xs,
  },
  optionButton: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: 8,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  optionButtonActive: {
    backgroundColor: COLORS.primary + "20",
    borderColor: COLORS.primary,
  },
  optionButtonText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
  },
  optionButtonTextActive: {
    color: COLORS.primary,
    fontWeight: "600",
  },
  toggleField: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: SPACING.lg,
    paddingVertical: SPACING.sm,
  },
  toggleInfo: {
    flex: 1,
  },
  toggleHint: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  statusSection: {
    marginTop: SPACING.lg,
    padding: SPACING.md,
    backgroundColor: COLORS.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  sectionTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: "700",
    color: COLORS.text,
    marginBottom: SPACING.md,
  },
  statusRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: SPACING.sm,
  },
  statusLabel: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
  },
  statusValue: {
    fontSize: FONT_SIZES.sm,
    fontWeight: "700",
    color: COLORS.text,
  },
  statusValueSmall: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.text,
    flex: 1,
    textAlign: "right",
    marginLeft: SPACING.sm,
  },
  statusActive: {
    color: COLORS.success,
  },
  statusCancelled: {
    color: COLORS.error,
  },
  statusArchived: {
    color: COLORS.textSecondary,
  },
  bottomSpacer: {
    height: SPACING.xl * 2,
  },
});
