import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { COLORS } from "../../../src/theme/colors";
import { SPACING } from "../../../src/theme/spacing";
import { FONT_SIZES } from "../../../src/theme/typography";
import { useCreateGiveaway } from "../../../src/viewmodels/useCreateGiveaway";
import { Dropdown } from "../../../src/views/components/common/dropdown";

const isWeb = Platform.OS === "web";

// ─────────────────────────────────────────────────────────────────────────────
// Section wrapper
// ─────────────────────────────────────────────────────────────────────────────
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={sec.wrapper}>
      <View style={sec.titleRow}>
        <Text style={sec.title}>{title}</Text>
        <View style={sec.line} />
      </View>
      {children}
    </View>
  );
}
const sec = StyleSheet.create({
  wrapper: { marginBottom: SPACING.lg },
  titleRow: { flexDirection: "row", alignItems: "center", marginBottom: SPACING.md, gap: SPACING.sm },
  title: { fontSize: FONT_SIZES.xs, fontWeight: "700", color: COLORS.textMuted, textTransform: "uppercase", letterSpacing: 0.8 },
  line: { flex: 1, height: 1, backgroundColor: COLORS.border },
});

// ─────────────────────────────────────────────────────────────────────────────
// Main screen
// ─────────────────────────────────────────────────────────────────────────────
export default function CreateGiveawayScreen() {
  const router = useRouter();
  const vm = useCreateGiveaway();

  // Custom rules section is hidden by default — most giveaways don't need it
  const [showCustomRules, setShowCustomRules] = useState(false);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      {/* Header */}
      <View style={[styles.header, isWeb && styles.headerWeb]}>
        <TouchableOpacity style={styles.backButton} onPress={vm.cancel}>
          <Text style={styles.backText}>← Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Create Giveaway</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >

        {/* ── Section 1: Prize Info ─────────────────────────────────────── */}
        <Section title="Prize Info">
          {/* Image upload */}
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Prize Image</Text>
            {vm.imageUri ? (
              <View style={styles.imagePreviewContainer}>
                <Image source={{ uri: vm.imageUri }} style={styles.imagePreview} />
                {vm.isUploadingImage ? (
                  <View style={styles.uploadingOverlay}>
                    <ActivityIndicator color={COLORS.primary} size="large" />
                    <Text style={styles.uploadingText}>Uploading...</Text>
                  </View>
                ) : (
                  <TouchableOpacity style={styles.removeImageButton} onPress={vm.removeImage}>
                    <Text style={styles.removeImageText}>✕</Text>
                  </TouchableOpacity>
                )}
                {!vm.isUploadingImage && (
                  <TouchableOpacity style={styles.changeImageButton} onPress={vm.pickImage}>
                    <Text style={styles.changeImageText}>Change Photo</Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : (
              <TouchableOpacity
                style={styles.uploadButton}
                onPress={vm.pickImage}
                disabled={vm.isUploadingImage}
                activeOpacity={0.7}
              >
                <View style={styles.uploadIconCircle}>
                  <Text style={styles.uploadIcon}>📷</Text>
                </View>
                <Text style={styles.uploadText}>Upload Prize Photo</Text>
                <Text style={styles.uploadHint}>Tap to select from library</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Prize Name */}
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>
              Prize Name <Text style={styles.required}>*</Text>
            </Text>
            <TextInput
              style={[styles.input, vm.formErrors.name && styles.inputError]}
              placeholder="e.g. iPad Pro, $500 Cash, HOW Glove"
              placeholderTextColor={COLORS.textMuted}
              value={vm.formData.name}
              onChangeText={(text) => vm.updateField("name", text)}
            />
            {vm.formErrors.name && (
              <Text style={styles.errorText}>{vm.formErrors.name}</Text>
            )}
          </View>

          {/* Prize Value */}
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>
              ARV (Approximate Retail Value) <Text style={styles.required}>*</Text>
            </Text>
            <View style={styles.currencyInputWrapper}>
              <Text style={styles.currencySymbol}>$</Text>
              <TextInput
                style={[styles.currencyInput, vm.formErrors.prize_value && styles.inputError]}
                placeholder="500"
                placeholderTextColor={COLORS.textMuted}
                value={vm.formData.prize_value}
                onChangeText={(text) =>
                  vm.updateField("prize_value", text.replace(/[^0-9.]/g, ""))
                }
                keyboardType="decimal-pad"
              />
            </View>
            {vm.formErrors.prize_value && (
              <Text style={styles.errorText}>{vm.formErrors.prize_value}</Text>
            )}
          </View>

          {/* Description */}
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Description</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="Describe the prize and what makes it special..."
              placeholderTextColor={COLORS.textMuted}
              value={vm.formData.description}
              onChangeText={(text) => vm.updateField("description", text)}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
          </View>
        </Section>

        {/* ── Section 2: Entry Rules ────────────────────────────────────── */}
        <Section title="Entry Rules">
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>
              End Giveaway By <Text style={styles.required}>*</Text>
            </Text>
            <View style={styles.endTypeRow}>
              {(["date", "entries", "both"] as const).map((type) => (
                <TouchableOpacity
                  key={type}
                  style={[
                    styles.endTypeButton,
                    vm.formData.end_type === type && styles.endTypeButtonActive,
                  ]}
                  onPress={() => vm.updateField("end_type", type)}
                >
                  <Text style={[
                    styles.endTypeText,
                    vm.formData.end_type === type && styles.endTypeTextActive,
                  ]}>
                    {type === "date" ? "📅 Date" : type === "entries" ? "👥 Entries" : "⚡ Both"}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.endTypeHintBox}>
              <Text style={styles.endTypeHint}>
                {vm.formData.end_type === "date" &&
                  "The giveaway closes on the date you set, regardless of entries received."}
                {vm.formData.end_type === "entries" &&
                  "The giveaway closes automatically when maximum entries is reached."}
                {vm.formData.end_type === "both" &&
                  "Closes when either condition is met first — whichever comes first."}
              </Text>
            </View>
          </View>

          {/* Max Entries */}
          {(vm.formData.end_type === "entries" || vm.formData.end_type === "both") && (
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>
                Maximum Entries <Text style={styles.required}>*</Text>
              </Text>
              <TextInput
                style={[styles.input, vm.formErrors.max_entries && styles.inputError]}
                placeholder="500"
                placeholderTextColor={COLORS.textMuted}
                value={vm.formData.max_entries}
                onChangeText={(text) =>
                  vm.updateField("max_entries", text.replace(/[^0-9]/g, ""))
                }
                keyboardType="number-pad"
              />
              {vm.formErrors.max_entries && (
                <Text style={styles.errorText}>{vm.formErrors.max_entries}</Text>
              )}
            </View>
          )}
        </Section>

        {/* ── Section 3: Timing ─────────────────────────────────────────── */}
        {(vm.formData.end_type === "date" || vm.formData.end_type === "both") && (
          <Section title="Timing">
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>
                End Date <Text style={styles.required}>*</Text>
              </Text>
              <View style={styles.dateRow}>
                <View style={styles.dateDropdown}>
                  <Dropdown
                    options={vm.monthOptions}
                    value={vm.formData.end_date.month}
                    onSelect={(value) => vm.updateEndDate("month", value)}
                    placeholder="Month"
                  />
                </View>
                <View style={styles.dateDropdownSmall}>
                  <Dropdown
                    options={vm.dayOptions}
                    value={vm.formData.end_date.day}
                    onSelect={(value) => vm.updateEndDate("day", value)}
                    placeholder="Day"
                  />
                </View>
                <View style={styles.dateDropdownSmall}>
                  <Dropdown
                    options={vm.yearOptions}
                    value={vm.formData.end_date.year}
                    onSelect={(value) => vm.updateEndDate("year", value)}
                    placeholder="Year"
                  />
                </View>
              </View>
              {vm.formErrors.end_date && (
                <Text style={styles.errorText}>{vm.formErrors.end_date}</Text>
              )}
            </View>
          </Section>
        )}

        {/* ── Section 4: Legal / Rules ──────────────────────────────────── */}
        <Section title="Legal / Rules">
          {/* Age — read only */}
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Age Requirement</Text>
            <View style={styles.ageRequirementContainer}>
              <Text style={styles.ageRequirementText}>🔒  18+ years old</Text>
              <Text style={styles.ageRequirementSubtext}>Required by law</Text>
            </View>
          </View>

          {/* Default rules notice */}
          <View style={styles.defaultRulesBox}>
            <Text style={styles.defaultRulesIcon}>✅</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.defaultRulesTitle}>
                Default Official Rules apply automatically
              </Text>
              <Text style={styles.defaultRulesBody}>
                Every giveaway includes Compete's built-in legal rules covering
                eligibility, entry, winner selection, prizes, and Apple disclaimer.
                You do not need to enter anything here for standard giveaways.
              </Text>
            </View>
          </View>

          {/* Custom rules toggle */}
          <TouchableOpacity
            style={styles.customRulesToggle}
            onPress={() => setShowCustomRules((v) => !v)}
            activeOpacity={0.7}
          >
            <Text style={styles.customRulesToggleText}>
              {showCustomRules ? "▾  Hide custom rules" : "▸  Add custom / sponsor rules (optional)"}
            </Text>
          </TouchableOpacity>

          {showCustomRules && (
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldHint}>
                Optional additional rules — added below Compete's official rules
              </Text>
              <TextInput
                style={[styles.input, styles.textAreaLarge]}
                placeholder="Add any additional or special rules for this giveaway (optional)"
                placeholderTextColor={COLORS.textMuted}
                value={vm.formData.rules_text}
                onChangeText={(text) => vm.updateField("rules_text", text)}
                multiline
                numberOfLines={6}
                textAlignVertical="top"
              />
              <Text style={styles.defaultRulesNote}>
                Default rules are automatically applied to every giveaway.
              </Text>
            </View>
          )}
        </Section>

        <View style={styles.bottomSpacer} />
      </ScrollView>

      {/* Bottom Buttons */}
      <View style={styles.bottomButtons}>
        <TouchableOpacity
          style={styles.cancelButton}
          onPress={vm.cancel}
          disabled={vm.isSubmitting}
        >
          <Text style={styles.cancelButtonText}>Cancel</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.createButton,
            (vm.isSubmitting || vm.isUploadingImage) && styles.buttonDisabled,
          ]}
          onPress={vm.submit}
          disabled={vm.isSubmitting || vm.isUploadingImage}
        >
          {vm.isSubmitting ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.createButtonText}>🚀  Launch Giveaway</Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    ...Platform.select({
      web: { maxWidth: 700, width: "100%" as any, alignSelf: "center" as any },
    }),
    flex: 1,
    backgroundColor: COLORS.background,
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
  headerWeb: { paddingTop: SPACING.lg },
  backButton: { padding: SPACING.xs },
  backText: { fontSize: FONT_SIZES.sm, color: COLORS.primary, fontWeight: "500" },
  headerTitle: { fontSize: FONT_SIZES.lg, fontWeight: "700", color: COLORS.text },
  placeholder: { width: 60 },

  scrollView: { flex: 1 },
  scrollContent: { padding: SPACING.md, paddingTop: SPACING.lg },

  // Image
  uploadButton: {
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: COLORS.border,
    borderStyle: "dashed",
    paddingVertical: SPACING.xl + 8,
    paddingHorizontal: SPACING.md,
    alignItems: "center",
    justifyContent: "center",
    gap: SPACING.xs,
  },
  uploadIconCircle: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: COLORS.primary + "18",
    alignItems: "center", justifyContent: "center",
    marginBottom: SPACING.sm,
    borderWidth: 1, borderColor: COLORS.primary + "40",
  },
  uploadIcon: { fontSize: 28 },
  uploadText: { fontSize: FONT_SIZES.md, fontWeight: "700", color: COLORS.primary },
  uploadHint: { fontSize: FONT_SIZES.sm, color: COLORS.textMuted },
  imagePreviewContainer: {
    position: "relative", borderRadius: 14, overflow: "hidden",
    borderWidth: 2, borderColor: COLORS.primary + "50",
  },
  imagePreview: { width: "100%", height: 220, backgroundColor: COLORS.surface },
  uploadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center", alignItems: "center",
  },
  uploadingText: { color: COLORS.text, fontSize: FONT_SIZES.sm, marginTop: SPACING.sm },
  removeImageButton: {
    position: "absolute", top: SPACING.sm, right: SPACING.sm,
    backgroundColor: "rgba(0,0,0,0.75)",
    width: 30, height: 30, borderRadius: 15,
    justifyContent: "center", alignItems: "center",
  },
  removeImageText: { color: "#fff", fontSize: FONT_SIZES.md, fontWeight: "bold" },
  changeImageButton: {
    position: "absolute", bottom: SPACING.sm, right: SPACING.sm,
    backgroundColor: "rgba(0,0,0,0.72)",
    borderRadius: 10, paddingVertical: SPACING.xs, paddingHorizontal: SPACING.sm,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.2)",
  },
  changeImageText: { color: "#fff", fontSize: FONT_SIZES.xs, fontWeight: "600" },

  // Fields
  fieldGroup: { marginBottom: SPACING.lg },
  label: { fontSize: FONT_SIZES.md, fontWeight: "600", color: COLORS.text, marginBottom: SPACING.xs },
  required: { color: COLORS.error || "#ef4444" },
  fieldHint: { fontSize: FONT_SIZES.sm, color: COLORS.textMuted, marginBottom: SPACING.xs },
  input: {
    backgroundColor: COLORS.surface, borderRadius: 10,
    padding: SPACING.md, fontSize: FONT_SIZES.md, color: COLORS.text,
    borderWidth: 1, borderColor: COLORS.border,
  },
  inputError: { borderColor: COLORS.error || "#ef4444" },
  textArea: { minHeight: 100, textAlignVertical: "top" },
  textAreaLarge: { minHeight: 150, textAlignVertical: "top" },
  errorText: { color: COLORS.error || "#ef4444", fontSize: FONT_SIZES.sm, marginTop: SPACING.xs },

  currencyInputWrapper: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: COLORS.surface, borderRadius: 10,
    borderWidth: 1, borderColor: COLORS.border,
  },
  currencySymbol: {
    fontSize: FONT_SIZES.lg, color: COLORS.textSecondary,
    paddingLeft: SPACING.md, paddingRight: SPACING.xs,
  },
  currencyInput: {
    flex: 1, padding: SPACING.md, paddingLeft: 0,
    fontSize: FONT_SIZES.md, color: COLORS.text,
  },

  // End type
  endTypeRow: { flexDirection: "row", gap: SPACING.sm, marginBottom: SPACING.sm },
  endTypeButton: {
    flex: 1, paddingVertical: SPACING.md, paddingHorizontal: SPACING.sm,
    borderRadius: 10, backgroundColor: COLORS.surface,
    borderWidth: 1, borderColor: COLORS.border, alignItems: "center",
  },
  endTypeButtonActive: { backgroundColor: COLORS.primary + "20", borderColor: COLORS.primary },
  endTypeText: { fontSize: FONT_SIZES.sm, fontWeight: "600", color: COLORS.textSecondary },
  endTypeTextActive: { color: COLORS.primary },
  endTypeHintBox: {
    backgroundColor: COLORS.surface, borderRadius: 8,
    padding: SPACING.sm, borderWidth: 1, borderColor: COLORS.border,
  },
  endTypeHint: { fontSize: FONT_SIZES.sm, color: COLORS.textSecondary, lineHeight: 18 },

  // Date
  dateRow: { flexDirection: "row", gap: SPACING.sm },
  dateDropdown: { flex: 2 },
  dateDropdownSmall: { flex: 1 },

  // Age
  ageRequirementContainer: {
    backgroundColor: COLORS.surface, borderRadius: 10, padding: SPACING.md,
    borderWidth: 1, borderColor: COLORS.border,
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
  },
  ageRequirementText: { fontSize: FONT_SIZES.md, fontWeight: "600", color: COLORS.text },
  ageRequirementSubtext: { fontSize: FONT_SIZES.sm, color: COLORS.textMuted, fontStyle: "italic" },

  // Default rules notice
  defaultRulesBox: {
    flexDirection: "row",
    backgroundColor: COLORS.success + "12",
    borderRadius: 10, padding: SPACING.md,
    borderWidth: 1, borderColor: COLORS.success + "35",
    gap: SPACING.sm, marginBottom: SPACING.md,
    alignItems: "flex-start",
  },
  defaultRulesIcon: { fontSize: 18, marginTop: 1 },
  defaultRulesTitle: {
    fontSize: FONT_SIZES.sm, fontWeight: "700",
    color: COLORS.success, marginBottom: 3,
  },
  defaultRulesBody: {
    fontSize: FONT_SIZES.xs, color: COLORS.textSecondary, lineHeight: 17,
  },
  defaultRulesNote: {
    fontSize: FONT_SIZES.xs, color: COLORS.textMuted,
    marginTop: SPACING.xs, fontStyle: "italic",
  },

  // Custom rules toggle
  customRulesToggle: {
    paddingVertical: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  customRulesToggleText: {
    fontSize: FONT_SIZES.sm, color: COLORS.primary, fontWeight: "600",
  },

  // Bottom
  bottomSpacer: { height: 100 },
  bottomButtons: {
    flexDirection: "row",
    padding: SPACING.md,
    paddingBottom: Platform.OS === "ios" ? 34 : SPACING.lg,
    gap: SPACING.sm,
    borderTopWidth: 1, borderTopColor: COLORS.border,
    backgroundColor: COLORS.background,
  },
  cancelButton: {
    flex: 1, backgroundColor: COLORS.surface,
    paddingVertical: SPACING.md, borderRadius: 10,
    alignItems: "center", borderWidth: 1, borderColor: COLORS.border,
  },
  cancelButtonText: { color: COLORS.text, fontSize: FONT_SIZES.md, fontWeight: "600" },
  createButton: {
    flex: 2, backgroundColor: COLORS.primary,
    paddingVertical: SPACING.md, borderRadius: 10,
    alignItems: "center", justifyContent: "center",
  },
  createButtonText: { color: "#fff", fontSize: FONT_SIZES.md, fontWeight: "700" },
  buttonDisabled: { opacity: 0.6 },
});
