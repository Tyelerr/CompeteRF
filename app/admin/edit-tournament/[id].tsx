import { useLocalSearchParams } from "expo-router";
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { COLORS } from "../../../src/theme/colors";
import { RADIUS, SPACING } from "../../../src/theme/spacing";
import { FONT_SIZES } from "../../../src/theme/typography";
import {
  EQUIPMENT_OPTIONS,
  GAME_TYPES,
  START_TIMES,
  TABLE_SIZES,
  THUMBNAIL_OPTIONS,
  TOURNAMENT_FORMATS,
} from "../../../src/utils/tournament-form-data";
import { useEditTournament } from "../../../src/viewmodels/useEditTournament";
import { Button } from "../../../src/views/components/common/button";
import { DatePicker } from "../../../src/views/components/common/date-picker";
import { Dropdown } from "../../../src/views/components/common/dropdown";
import { KeyboardAwareView } from "../../../src/views/components/common/keyboard-aware-view";
import { ToggleSwitch } from "../../../src/views/components/common/toggle-switch";

export default function EditTournamentScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const vm = useEditTournament(id || "");

  // Loading state
  if (vm.isLoading) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.loadingText}>Loading tournament...</Text>
      </View>
    );
  }

  // Not logged in
  if (!vm.user) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.emoji}>🔒</Text>
        <Text style={styles.title}>Login Required</Text>
        <Text style={styles.subtitle}>Please log in to edit tournaments.</Text>
        <Button title="Go Back" onPress={vm.goBack} />
      </View>
    );
  }

  // Not authorized
  if (!vm.isAuthorized) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.emoji}>🚫</Text>
        <Text style={styles.title}>Not Authorized</Text>
        <Text style={styles.subtitle}>
          You can only edit tournaments you created.
        </Text>
        <Button title="Go Back" onPress={vm.goBack} />
      </View>
    );
  }

  // Tournament cancelled
  if (vm.isCancelled) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.emoji}>❌</Text>
        <Text style={styles.title}>Tournament Deleted</Text>
        <Text style={styles.subtitle}>
          This tournament has been deleted and cannot be edited.
        </Text>
        <Button title="Go Back" onPress={vm.goBack} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* FIXED TOP BAR */}
      <View style={styles.fixedHeader}>
        <TouchableOpacity style={styles.backButton} onPress={vm.goBack}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Edit Tournament</Text>
        <View style={styles.headerPlaceholder} />
      </View>

      {/* SCROLLABLE MIDDLE */}
      <KeyboardAwareView style={styles.scrollContainer}>
        <ScrollView style={styles.scrollContent}>
          {/* Tournament Status */}
          <View style={styles.statusBanner}>
            <Text style={styles.statusLabel}>Status:</Text>
            <View
              style={[
                styles.statusBadge,
                vm.tournament?.status === "active" && styles.statusActive,
                vm.tournament?.status === "completed" && styles.statusCompleted,
              ]}
            >
              <Text style={styles.statusText}>{vm.tournament?.status}</Text>
            </View>
          </View>

          {/* Basic Info */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Tournament Details</Text>

            <Text style={styles.label}>Tournament Name *</Text>
            <TextInput
              ref={vm.refs.name}
              style={styles.input}
              value={vm.formData.name}
              onChangeText={(v) => vm.updateFormData("name", v)}
              placeholder="Enter tournament name..."
              placeholderTextColor={COLORS.textMuted}
              returnKeyType="next"
              onSubmitEditing={() => vm.refs.gameSpot.current?.focus()}
            />

            <Dropdown
              label="Game Type *"
              placeholder="Select The Game Type"
              options={GAME_TYPES}
              value={vm.formData.gameType}
              onSelect={(v) => vm.updateFormData("gameType", v)}
            />

            <Dropdown
              label="Tournament Format *"
              placeholder="Select The Format"
              options={TOURNAMENT_FORMATS}
              value={vm.formData.tournamentFormat}
              onSelect={(v) => vm.updateFormData("tournamentFormat", v)}
            />

            <Text style={styles.label}>Game Spot</Text>
            <TextInput
              ref={vm.refs.gameSpot}
              style={styles.input}
              value={vm.formData.gameSpot}
              onChangeText={(v) => vm.updateFormData("gameSpot", v)}
              placeholder="e.g., The Ball"
              placeholderTextColor={COLORS.textMuted}
              returnKeyType="next"
              onSubmitEditing={() => vm.refs.race.current?.focus()}
            />

            <Text style={styles.label}>Race</Text>
            <TextInput
              ref={vm.refs.race}
              style={styles.input}
              value={vm.formData.race}
              onChangeText={(v) => vm.updateFormData("race", v)}
              placeholder="e.g., Race to 5"
              placeholderTextColor={COLORS.textMuted}
              returnKeyType="next"
              onSubmitEditing={() => vm.refs.description.current?.focus()}
            />

            <Text style={styles.label}>Description</Text>
            <TextInput
              ref={vm.refs.description}
              style={[styles.input, styles.textArea]}
              value={vm.formData.description}
              onChangeText={(v) => vm.updateFormData("description", v)}
              placeholder="Enter description..."
              placeholderTextColor={COLORS.textMuted}
              multiline={true}
              numberOfLines={3}
              textAlignVertical="top"
            />
          </View>

          {/* Fargo Settings */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Fargo Requirements</Text>

            <Text style={styles.label}>Maximum Fargo</Text>
            <TextInput
              ref={vm.refs.maxFargo}
              style={[
                styles.input,
                vm.isMaxFargoDisabled && styles.inputDisabled,
              ]}
              value={vm.formData.maxFargo}
              onChangeText={(v) => vm.updateFormData("maxFargo", v)}
              placeholder={
                vm.isMaxFargoDisabled
                  ? "Disabled (Open Tournament is ON)"
                  : "e.g., 550 (leave blank for open)"
              }
              placeholderTextColor={COLORS.textMuted}
              keyboardType="numeric"
              editable={!vm.isMaxFargoDisabled}
            />
            {vm.isMaxFargoDisabled && (
              <Text style={styles.hintWarning}>
                Disabled when Open Tournament is ON
              </Text>
            )}
          </View>

          {/* Fees */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Entry & Fees</Text>

            <Text style={styles.label}>Entry Fee</Text>
            <TextInput
              ref={vm.refs.entryFee}
              style={styles.input}
              value={vm.formData.entryFee}
              onChangeText={(v) => vm.updateFormData("entryFee", v)}
              placeholder="$ 0.00"
              placeholderTextColor={COLORS.textMuted}
              keyboardType="decimal-pad"
            />

            <View style={styles.sidePotHeader}>
              <Text style={styles.label}>Side Pots</Text>
              <TouchableOpacity
                style={styles.addButton}
                onPress={vm.addSidePot}
              >
                <Text style={styles.addButtonText}>+ Add</Text>
              </TouchableOpacity>
            </View>

            {vm.sidePots.map((pot, index) => (
              <View key={index} style={styles.sidePotRow}>
                <TextInput
                  style={[styles.input, styles.sidePotName]}
                  value={pot.name}
                  onChangeText={(v) => vm.updateSidePot(index, "name", v)}
                  placeholder="Name"
                  placeholderTextColor={COLORS.textMuted}
                />
                <TextInput
                  style={[styles.input, styles.sidePotAmount]}
                  value={pot.amount}
                  onChangeText={(v) => vm.updateSidePot(index, "amount", v)}
                  placeholder="$"
                  placeholderTextColor={COLORS.textMuted}
                  keyboardType="decimal-pad"
                />
                <TouchableOpacity
                  style={styles.removeButtonContainer}
                  onPress={() => vm.removeSidePot(index)}
                >
                  <Text style={styles.removeButton}>✕</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>

          {/* Date & Time */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Date & Time</Text>

            <Text style={styles.label}>Tournament Date *</Text>
            <DatePicker
              value={vm.formData.tournamentDate}
              onChange={(v) => vm.updateFormData("tournamentDate", v)}
              placeholder="Select Date"
            />

            <Dropdown
              label="Start Time *"
              placeholder="Select Start Time"
              options={START_TIMES}
              value={vm.formData.startTime}
              onSelect={(v) => vm.updateFormData("startTime", v)}
            />
            <Text style={styles.hint}>Timezone: {vm.formData.timezone}</Text>
          </View>

          {/* Toggle Switches */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Settings</Text>
            <ToggleSwitch
              label="Reports to Fargo"
              value={vm.formData.reportsToFargo}
              onValueChange={(v) => vm.updateFormData("reportsToFargo", v)}
            />
            {vm.isOpenTournamentDisabled && (
              <Text style={styles.hintWarning}>
                Disabled when Max Fargo is set
              </Text>
            )}
            <ToggleSwitch
              label="Open Tournament"
              value={vm.formData.openTournament}
              onValueChange={(v) => vm.updateFormData("openTournament", v)}
              disabled={vm.isOpenTournamentDisabled}
            />

            <ToggleSwitch
              label="Recurring Tournament"
              value={vm.formData.isRecurring}
              onValueChange={(v) => vm.updateFormData("isRecurring", v)}
            />
          </View>

          {/* Venue */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Venue</Text>

            <Dropdown
              label="Select Venue *"
              placeholder="Choose your venue"
              options={vm.venueOptions}
              value={vm.formData.venueId?.toString() || ""}
              onSelect={vm.handleVenueSelect}
            />

            {vm.selectedVenue && (
              <View style={styles.venueCard}>
                <Text style={styles.venueName}>{vm.selectedVenue.venue}</Text>
                <Text style={styles.venueAddress}>
                  {vm.selectedVenue.address}
                </Text>
                <Text style={styles.venueAddress}>
                  {vm.selectedVenue.city}, {vm.selectedVenue.state}{" "}
                  {vm.selectedVenue.zip_code}
                </Text>
              </View>
            )}

            <Text style={styles.label}>Contact Phone</Text>
            <TextInput
              ref={vm.refs.phone}
              style={styles.input}
              value={vm.formData.phoneNumber}
              onChangeText={(v) => vm.updateFormData("phoneNumber", v)}
              placeholder="Enter contact phone..."
              placeholderTextColor={COLORS.textMuted}
              keyboardType="phone-pad"
            />

            <Dropdown
              label="Equipment"
              placeholder="Select Equipment"
              options={EQUIPMENT_OPTIONS}
              value={vm.formData.equipment}
              onSelect={(v) => vm.updateFormData("equipment", v)}
            />

            <Dropdown
              label="Table Size"
              placeholder="Select Table Size"
              options={TABLE_SIZES}
              value={vm.formData.tableSize}
              onSelect={(v) => vm.updateFormData("tableSize", v)}
            />
          </View>

          {/* Thumbnail */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Tournament Image</Text>
            <View style={styles.thumbnailGrid}>
              {THUMBNAIL_OPTIONS.map((thumb) => (
                <TouchableOpacity
                  key={thumb.id}
                  style={[
                    styles.thumbnailOption,
                    vm.formData.thumbnail === thumb.id &&
                      styles.thumbnailSelected,
                  ]}
                  onPress={() => vm.updateFormData("thumbnail", thumb.id)}
                >
                  <View style={styles.thumbnailPlaceholder}>
                    <Text style={styles.thumbnailEmoji}>🎱</Text>
                    <Text style={styles.thumbnailText}>{thumb.name}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Spacer for bottom bar */}
          <View style={styles.bottomSpacer} />
        </ScrollView>
      </KeyboardAwareView>

      {/* FIXED BOTTOM BAR */}
      <View style={styles.fixedBottomBar}>
        <TouchableOpacity
          style={[styles.saveButton, vm.saving && styles.saveButtonDisabled]}
          onPress={vm.handleSave}
          disabled={vm.saving}
        >
          <Text style={styles.saveButtonText}>
            {vm.saving ? "Saving..." : "Save Changes"}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.cancelButton}
          onPress={vm.goBack}
          disabled={vm.saving}
        >
          <Text style={styles.cancelButtonText}>Cancel</Text>
        </TouchableOpacity>
      </View>
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
  emoji: {
    fontSize: 60,
    marginBottom: SPACING.md,
  },
  title: {
    fontSize: FONT_SIZES.xl,
    fontWeight: "700",
    color: COLORS.text,
    marginBottom: SPACING.sm,
    textAlign: "center",
  },
  subtitle: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textSecondary,
    textAlign: "center",
    marginBottom: SPACING.lg,
  },
  loadingText: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textSecondary,
  },
  // FIXED TOP BAR
  fixedHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.xl + SPACING.lg,
    paddingBottom: SPACING.md,
    backgroundColor: COLORS.background,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  backButton: {
    padding: SPACING.xs,
    minWidth: 70,
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
  },
  headerPlaceholder: {
    minWidth: 70,
  },
  // SCROLLABLE MIDDLE
  scrollContainer: {
    flex: 1,
  },
  scrollContent: {
    flex: 1,
  },
  statusBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: SPACING.md,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    gap: SPACING.sm,
  },
  statusLabel: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
  },
  statusBadge: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.border,
  },
  statusActive: {
    backgroundColor: COLORS.primary,
  },
  statusCompleted: {
    backgroundColor: COLORS.info,
  },
  statusText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.white,
    fontWeight: "600",
    textTransform: "capitalize",
  },
  section: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.lg,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  sectionTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: "700",
    color: COLORS.text,
    marginBottom: SPACING.sm,
  },
  label: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    marginBottom: SPACING.xs,
    marginTop: SPACING.lg,
  },
  input: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    fontSize: FONT_SIZES.md,
    color: COLORS.text,
    marginHorizontal: SPACING.sm,
  },
  textArea: {
    minHeight: 100,
    textAlignVertical: "top",
  },
  inputDisabled: {
    backgroundColor: COLORS.border,
    opacity: 0.6,
  },
  hint: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    marginTop: SPACING.xs,
  },
  hintWarning: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.warning,
    marginTop: SPACING.xs,
    marginBottom: SPACING.xs,
  },
  sidePotHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: SPACING.lg,
  },
  addButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.sm,
  },
  addButtonText: {
    color: COLORS.white,
    fontSize: FONT_SIZES.sm,
    fontWeight: "600",
  },
  sidePotRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    marginTop: SPACING.md,
  },
  sidePotName: {
    flex: 2,
  },
  sidePotAmount: {
    flex: 1,
  },
  removeButtonContainer: {
    padding: SPACING.sm,
  },
  removeButton: {
    color: COLORS.error,
    fontSize: FONT_SIZES.lg,
    fontWeight: "bold",
  },
  venueCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginTop: SPACING.md,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.primary,
  },
  venueName: {
    fontSize: FONT_SIZES.md,
    fontWeight: "600",
    color: COLORS.text,
  },
  venueAddress: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
  },
  thumbnailGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: SPACING.sm,
    marginTop: SPACING.md,
  },
  thumbnailOption: {
    width: "31%",
    aspectRatio: 1,
    borderRadius: RADIUS.md,
    borderWidth: 2,
    borderColor: COLORS.border,
    overflow: "hidden",
  },
  thumbnailSelected: {
    borderColor: COLORS.primary,
    borderWidth: 3,
  },
  thumbnailPlaceholder: {
    flex: 1,
    backgroundColor: COLORS.surface,
    justifyContent: "center",
    alignItems: "center",
    padding: SPACING.xs,
  },
  thumbnailEmoji: {
    fontSize: 24,
  },
  thumbnailText: {
    color: COLORS.textMuted,
    fontSize: FONT_SIZES.xs,
    textAlign: "center",
    marginTop: SPACING.xs,
  },
  bottomSpacer: {
    height: SPACING.xl,
  },
  // FIXED BOTTOM BAR
  fixedBottomBar: {
    flexDirection: "row",
    backgroundColor: COLORS.background,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.xl,
    gap: SPACING.md,
  },
  saveButton: {
    flex: 1,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    fontSize: FONT_SIZES.md,
    color: COLORS.white,
    fontWeight: "600",
  },
  cancelButton: {
    flex: 1,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.error,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelButtonText: {
    fontSize: FONT_SIZES.md,
    color: COLORS.error,
    fontWeight: "600",
  },
});
