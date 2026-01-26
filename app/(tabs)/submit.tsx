import {
  Image,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { COLORS } from "../../src/theme/colors";
import { RADIUS, SPACING } from "../../src/theme/spacing";
import { FONT_SIZES } from "../../src/theme/typography";
import {
  EQUIPMENT_OPTIONS,
  GAME_TYPES,
  START_TIMES,
  TABLE_SIZES,
  THUMBNAIL_OPTIONS,
  TOURNAMENT_FORMATS,
} from "../../src/utils/tournament-form-data";
import { useSubmitTournament } from "../../src/viewmodels/useSubmitTournament";
import { Button } from "../../src/views/components/common/button";
import { DatePicker } from "../../src/views/components/common/date-picker";
import { Dropdown } from "../../src/views/components/common/dropdown";
import { KeyboardAwareView } from "../../src/views/components/common/keyboard-aware-view";
import { ToggleSwitch } from "../../src/views/components/common/toggle-switch";

export default function SubmitScreen() {
  const vm = useSubmitTournament();

  // Loading state
  if (vm.isLoading) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.subtitle}>Loading...</Text>
      </View>
    );
  }

  // Not logged in
  if (!vm.user) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.emoji}>🔒</Text>
        <Text style={styles.title}>Login Required</Text>
        <Text style={styles.subtitle}>
          Please log in to submit tournaments.
        </Text>
        <Button title="Log In" onPress={vm.navigateToLogin} />
      </View>
    );
  }

  // Not authorized
  if (!vm.canSubmitTournaments) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.emoji}>🎱</Text>
        <Text style={styles.title}>Become a Tournament Director</Text>
        <Text style={styles.subtitle}>
          Want to submit tournaments? Contact us to become a Tournament
          Director.
        </Text>
        <Button title="Contact Us" onPress={vm.navigateToFaq} />
      </View>
    );
  }

  const renderThumbnailOption = (thumb: any) => {
    const isSelected = vm.formData.thumbnail === thumb.id;
    const isUploadOption = thumb.id === "upload-custom";
    const isCustomImage = vm.formData.thumbnail?.startsWith("custom:");
    const showUploadedImage =
      isUploadOption && isCustomImage && vm.customImageUri;

    // Get the image URL for real images
    const imageUrl = thumb.imageUrl ? vm.getThumbnailImageUrl(thumb.id) : null;

    return (
      <TouchableOpacity
        key={thumb.id}
        style={[
          styles.thumbnailOption,
          isSelected && styles.thumbnailSelected,
          vm.uploadingImage && isUploadOption && styles.thumbnailUploading,
        ]}
        onPress={() => vm.handleThumbnailSelect(thumb.id)}
        disabled={vm.uploadingImage && isUploadOption}
      >
        <View style={styles.thumbnailPlaceholder}>
          {isUploadOption ? (
            // Upload Custom Option
            showUploadedImage ? (
              <Image
                source={{ uri: vm.customImageUri || undefined }}
                style={styles.thumbnailImage}
                resizeMode="cover"
              />
            ) : vm.uploadingImage ? (
              <Text style={styles.uploadingText}>...</Text>
            ) : (
              <Text style={styles.thumbnailEmoji}>+</Text>
            )
          ) : imageUrl ? (
            // Real Images (8-ball, 9-ball, 10-ball)
            <Image
              source={{ uri: imageUrl || undefined }}
              style={styles.thumbnailImage}
              resizeMode="cover"
              onError={() => console.log("Image failed to load:", imageUrl)}
            />
          ) : (
            // Emoji Placeholders (one-pocket, straight-pool, banks)
            <Text style={styles.thumbnailEmoji}>🎱</Text>
          )}
          <Text
            style={[styles.thumbnailText, isUploadOption && styles.uploadText]}
          >
            {thumb.name}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <KeyboardAwareView>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>SUBMIT TOURNAMENT</Text>
          <Text style={styles.headerSubtitle}>
            Submit your tournament for approval
          </Text>
        </View>

        {/* Template Selection */}
        {vm.hasTemplates && (
          <View style={styles.section}>
            <Dropdown
              label="Use a Template"
              placeholder="Start Fresh (No Template)"
              options={vm.templateOptions}
              value={vm.formData.templateId?.toString() || ""}
              onSelect={vm.handleTemplateSelect}
            />
          </View>
        )}

        {/* Director Info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Tournament Director</Text>
          <View style={styles.readOnlyCard}>
            <Text style={styles.directorName}>{vm.profile?.name}</Text>
            <Text style={styles.directorId}>ID: {vm.profile?.id_auto}</Text>
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
            returnKeyType="next"
            onSubmitEditing={() => vm.refs.requiredFargo.current?.focus()}
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
            <TouchableOpacity style={styles.addButton} onPress={vm.addSidePot}>
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
            {THUMBNAIL_OPTIONS.map(renderThumbnailOption)}
          </View>
        </View>

        {/* Submit Button */}
        <View style={styles.submitSection}>
          <Button
            title={vm.submitting ? "Submitting..." : "Submit Tournament"}
            onPress={vm.handleSubmit}
            loading={vm.submitting}
            disabled={vm.submitting}
            fullWidth
          />
        </View>

        <View style={styles.bottomSpacer} />
      </View>
    </KeyboardAwareView>
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
  header: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.xl + SPACING.lg,
    paddingBottom: SPACING.md,
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerTitle: {
    fontSize: FONT_SIZES.xl,
    fontWeight: "700",
    color: COLORS.text,
    letterSpacing: 1,
  },
  headerSubtitle: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
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
  readOnlyCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.primary,
  },
  directorName: {
    fontSize: FONT_SIZES.md,
    fontWeight: "600",
    color: COLORS.text,
  },
  directorId: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
  },
  hintWarning: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.warning,
    marginTop: SPACING.xs,
    marginBottom: SPACING.xs,
  },
  hint: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    marginTop: SPACING.xs,
    marginHorizontal: SPACING.sm,
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
  thumbnailUploading: {
    opacity: 0.6,
  },
  thumbnailPlaceholder: {
    flex: 1,
    backgroundColor: COLORS.surface,
    justifyContent: "center",
    alignItems: "center",
    padding: SPACING.xs,
  },
  thumbnailImage: {
    width: "100%",
    height: "70%",
    borderRadius: RADIUS.sm,
  },
  thumbnailEmoji: {
    fontSize: 32,
  },
  thumbnailText: {
    color: COLORS.textMuted,
    fontSize: FONT_SIZES.xs,
    textAlign: "center",
    marginTop: SPACING.xs,
  },
  uploadText: {
    color: COLORS.primary,
    fontWeight: "600",
  },
  uploadingText: {
    fontSize: FONT_SIZES.lg,
    color: COLORS.textMuted,
    fontWeight: "bold",
  },
  submitSection: {
    padding: Math.floor(SPACING.lg * 0.7), // Reduced by 30%
    paddingTop: SPACING.xl,
  },
  bottomSpacer: {
    height: Math.floor(SPACING.xl * 2 * 0.7), // Reduced by 30%
  },
});
