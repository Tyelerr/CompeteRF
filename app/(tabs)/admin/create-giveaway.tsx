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
import { moderateScale, scale } from "../../../src/utils/scaling";

const isWeb = Platform.OS === "web";

// ─────────────────────────────────────────────────────────────────────────────
// Section wrapper
// ─────────────────────────────────────────────────────────────────────────────
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={sec.wrapper}>
      <View style={sec.titleRow}>
        <Text allowFontScaling={false} style={sec.title}>{title}</Text>
        <View style={sec.line} />
      </View>
      {children}
    </View>
  );
}
const sec = StyleSheet.create({
  wrapper: { marginBottom: scale(SPACING.lg) },
  titleRow: { flexDirection: "row", alignItems: "center", marginBottom: scale(SPACING.md), gap: scale(SPACING.sm) },
  title: { fontSize: moderateScale(FONT_SIZES.xs), fontWeight: "700", color: COLORS.textMuted, textTransform: "uppercase", letterSpacing: 0.8 },
  line: { flex: 1, height: scale(1), backgroundColor: COLORS.border },
});

// ─────────────────────────────────────────────────────────────────────────────
// Main screen
// ─────────────────────────────────────────────────────────────────────────────
export default function CreateGiveawayScreen() {
  const router = useRouter();
  const vm = useCreateGiveaway();

  // Custom rules section is hidden by default – most giveaways don't need it
  const [showCustomRules, setShowCustomRules] = useState(false);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      {/* Header */}
      <View style={[styles.header, isWeb && styles.headerWeb]}>
        <TouchableOpacity style={styles.backButton} onPress={vm.cancel}>
          <Text allowFontScaling={false} style={styles.backText}>← Cancel</Text>
        </TouchableOpacity>
        <Text allowFontScaling={false} style={styles.headerTitle}>Create Giveaway</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >

        {/* ── Section 1: Prize Info ──────────────────────────────────────────── */}
        <Section title="Prize Info">
          {/* Image upload */}
          <View style={styles.fieldGroup}>
            <Text allowFontScaling={false} style={styles.label}>Prize Image</Text>
            {vm.imageUri ? (
              <View style={styles.imagePreviewContainer}>
                <Image source={{ uri: vm.imageUri }} style={styles.imagePreview} />
                {vm.isUploadingImage ? (
                  <View style={styles.uploadingOverlay}>
                    <ActivityIndicator color={COLORS.primary} size="large" />
                    <Text allowFontScaling={false} style={styles.uploadingText}>Uploading...</Text>
                  </View>
                ) : (
                  <TouchableOpacity style={styles.removeImageButton} onPress={vm.removeImage}>
                    <Text allowFontScaling={false} style={styles.removeImageText}>✕</Text>
                  </TouchableOpacity>
                )}
                {!vm.isUploadingImage && (
                  <TouchableOpacity style={styles.changeImageButton} onPress={vm.pickImage}>
                    <Text allowFontScaling={false} style={styles.changeImageText}>Change Photo</Text>
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
                  <Text allowFontScaling={false} style={styles.uploadIcon}>📷</Text>
                </View>
                <Text allowFontScaling={false} style={styles.uploadText}>Upload Prize Photo</Text>
                <Text allowFontScaling={false} style={styles.uploadHint}>Tap to select from library</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Prize Name */}
          <View style={styles.fieldGroup}>
            <Text allowFontScaling={false} style={styles.label}>
              Prize Name <Text allowFontScaling={false} style={styles.required}>*</Text>
            </Text>
            <TextInput
              style={[styles.input, vm.formErrors.name && styles.inputError]}
              placeholder="e.g. iPad Pro, $500 Cash, HOW Glove"
              placeholderTextColor={COLORS.textMuted}
              value={vm.formData.name}
              onChangeText={(text) => vm.updateField("name", text)}
            />
            {vm.formErrors.name && (
              <Text allowFontScaling={false} style={styles.errorText}>{vm.formErrors.name}</Text>
            )}
          </View>

          {/* Prize Value */}
          <View style={styles.fieldGroup}>
            <Text allowFontScaling={false} style={styles.label}>
              ARV (Approximate Retail Value) <Text allowFontScaling={false} style={styles.required}>*</Text>
            </Text>
            <View style={styles.currencyInputWrapper}>
              <Text allowFontScaling={false} style={styles.currencySymbol}>$</Text>
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
              <Text allowFontScaling={false} style={styles.errorText}>{vm.formErrors.prize_value}</Text>
            )}
          </View>

          {/* Description */}
          <View style={styles.fieldGroup}>
            <Text allowFontScaling={false} style={styles.label}>Description</Text>
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

        {/* ── Section 2: Entry Rules ─────────────────────────────────────────── */}
        <Section title="Entry Rules">
          <View style={styles.fieldGroup}>
            <Text allowFontScaling={false} style={styles.label}>
              End Giveaway By <Text allowFontScaling={false} style={styles.required}>*</Text>
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
                  <Text allowFontScaling={false} style={[
                    styles.endTypeText,
                    vm.formData.end_type === type && styles.endTypeTextActive,
                  ]}>
                    {type === "date" ? "📅 Date" : type === "entries" ? "👥 Entries" : "⚡ Both"}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.endTypeHintBox}>
              <Text allowFontScaling={false} style={styles.endTypeHint}>
                {vm.formData.end_type === "date" &&
                  "The giveaway closes on the date you set, regardless of entries received."}
                {vm.formData.end_type === "entries" &&
                  "The giveaway closes automatically when maximum entries is reached."}
                {vm.formData.end_type === "both" &&
                  "Closes when either condition is met first – whichever comes first."}
              </Text>
            </View>
          </View>

          {/* Max Entries */}
          {(vm.formData.end_type === "entries" || vm.formData.end_type === "both") && (
            <View style={styles.fieldGroup}>
              <Text allowFontScaling={false} style={styles.label}>
                Maximum Entries <Text allowFontScaling={false} style={styles.required}>*</Text>
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
                <Text allowFontScaling={false} style={styles.errorText}>{vm.formErrors.max_entries}</Text>
              )}
            </View>
          )}
        </Section>

        {/* ── Section 3: Timing ──────────────────────────────────────────────── */}
        {(vm.formData.end_type === "date" || vm.formData.end_type === "both") && (
          <Section title="Timing">
            <View style={styles.fieldGroup}>
              <Text allowFontScaling={false} style={styles.label}>
                End Date <Text allowFontScaling={false} style={styles.required}>*</Text>
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
                <Text allowFontScaling={false} style={styles.errorText}>{vm.formErrors.end_date}</Text>
              )}
            </View>
          </Section>
        )}

        {/* ── Section 4: Legal / Rules ───────────────────────────────────────── */}
        <Section title="Legal / Rules">
          {/* Age – read only */}
          <View style={styles.fieldGroup}>
            <Text allowFontScaling={false} style={styles.label}>Age Requirement</Text>
            <View style={styles.ageRequirementContainer}>
              <Text allowFontScaling={false} style={styles.ageRequirementText}>🔒  18+ years old</Text>
              <Text allowFontScaling={false} style={styles.ageRequirementSubtext}>Required by law</Text>
            </View>
          </View>

          {/* Default rules notice */}
          <View style={styles.defaultRulesBox}>
            <Text allowFontScaling={false} style={styles.defaultRulesIcon}>✅</Text>
            <View style={{ flex: 1 }}>
              <Text allowFontScaling={false} style={styles.defaultRulesTitle}>
                Default Official Rules apply automatically
              </Text>
              <Text allowFontScaling={false} style={styles.defaultRulesBody}>
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
            <Text allowFontScaling={false} style={styles.customRulesToggleText}>
              {showCustomRules ? "▾  Hide custom rules" : "▸  Add custom / sponsor rules (optional)"}
            </Text>
          </TouchableOpacity>

          {showCustomRules && (
            <View style={styles.fieldGroup}>
              <Text allowFontScaling={false} style={styles.fieldHint}>
                Optional additional rules – added below Compete's official rules
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
              <Text allowFontScaling={false} style={styles.defaultRulesNote}>
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
          <Text allowFontScaling={false} style={styles.cancelButtonText}>Cancel</Text>
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
            <Text allowFontScaling={false} style={styles.createButtonText}>🚀  Launch Giveaway</Text>
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
    paddingHorizontal: scale(SPACING.md),
    paddingTop: scale(SPACING.xl + SPACING.sm),
    paddingBottom: scale(SPACING.md),
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerWeb: { paddingTop: scale(SPACING.lg) },
  backButton: { padding: scale(SPACING.xs) },
  backText: { fontSize: moderateScale(FONT_SIZES.sm), color: COLORS.primary, fontWeight: "500" },
  headerTitle: { fontSize: moderateScale(FONT_SIZES.lg), fontWeight: "700", color: COLORS.text },
  placeholder: { width: scale(60) },

  scrollView: { flex: 1 },
  scrollContent: { padding: scale(SPACING.md), paddingTop: scale(SPACING.lg) },

  // Image
  uploadButton: {
    backgroundColor: COLORS.surface,
    borderRadius: scale(14),
    borderWidth: 2,
    borderColor: COLORS.border,
    borderStyle: "dashed",
    paddingVertical: scale(SPACING.xl + 8),
    paddingHorizontal: scale(SPACING.md),
    alignItems: "center",
    justifyContent: "center",
    gap: scale(SPACING.xs),
  },
  uploadIconCircle: {
    width: scale(56), height: scale(56), borderRadius: scale(28),
    backgroundColor: COLORS.primary + "18",
    alignItems: "center", justifyContent: "center",
    marginBottom: scale(SPACING.sm),
    borderWidth: 1, borderColor: COLORS.primary + "40",
  },
  uploadIcon: { fontSize: moderateScale(28) },
  uploadText: { fontSize: moderateScale(FONT_SIZES.md), fontWeight: "700", color: COLORS.primary },
  uploadHint: { fontSize: moderateScale(FONT_SIZES.sm), color: COLORS.textMuted },
  imagePreviewContainer: {
    position: "relative", borderRadius: scale(14), overflow: "hidden",
    borderWidth: 2, borderColor: COLORS.primary + "50",
  },
  imagePreview: { width: "100%", height: scale(220), backgroundColor: COLORS.surface },
  uploadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center", alignItems: "center",
  },
  uploadingText: { color: COLORS.text, fontSize: moderateScale(FONT_SIZES.sm), marginTop: scale(SPACING.sm) },
  removeImageButton: {
    position: "absolute", top: scale(SPACING.sm), right: scale(SPACING.sm),
    backgroundColor: "rgba(0,0,0,0.75)",
    width: scale(30), height: scale(30), borderRadius: scale(15),
    justifyContent: "center", alignItems: "center",
  },
  removeImageText: { color: "#fff", fontSize: moderateScale(FONT_SIZES.md), fontWeight: "bold" },
  changeImageButton: {
    position: "absolute", bottom: scale(SPACING.sm), right: scale(SPACING.sm),
    backgroundColor: "rgba(0,0,0,0.72)",
    borderRadius: scale(10), paddingVertical: scale(SPACING.xs), paddingHorizontal: scale(SPACING.sm),
    borderWidth: 1, borderColor: "rgba(255,255,255,0.2)",
  },
  changeImageText: { color: "#fff", fontSize: moderateScale(FONT_SIZES.xs), fontWeight: "600" },

  // Fields
  fieldGroup: { marginBottom: scale(SPACING.lg) },
  label: { fontSize: moderateScale(FONT_SIZES.md), fontWeight: "600", color: COLORS.text, marginBottom: scale(SPACING.xs) },
  required: { color: COLORS.error || "#ef4444" },
  fieldHint: { fontSize: moderateScale(FONT_SIZES.sm), color: COLORS.textMuted, marginBottom: scale(SPACING.xs) },
  input: {
    backgroundColor: COLORS.surface, borderRadius: scale(10),
    padding: scale(SPACING.md), fontSize: moderateScale(FONT_SIZES.md), color: COLORS.text,
    borderWidth: 1, borderColor: COLORS.border,
  },
  inputError: { borderColor: COLORS.error || "#ef4444" },
  textArea: { minHeight: scale(100), textAlignVertical: "top" },
  textAreaLarge: { minHeight: scale(150), textAlignVertical: "top" },
  errorText: { color: COLORS.error || "#ef4444", fontSize: moderateScale(FONT_SIZES.sm), marginTop: scale(SPACING.xs) },

  currencyInputWrapper: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: COLORS.surface, borderRadius: scale(10),
    borderWidth: 1, borderColor: COLORS.border,
  },
  currencySymbol: {
    fontSize: moderateScale(FONT_SIZES.lg), color: COLORS.textSecondary,
    paddingLeft: scale(SPACING.md), paddingRight: scale(SPACING.xs),
  },
  currencyInput: {
    flex: 1, padding: scale(SPACING.md), paddingLeft: 0,
    fontSize: moderateScale(FONT_SIZES.md), color: COLORS.text,
  },

  // End type
  endTypeRow: { flexDirection: "row", gap: scale(SPACING.sm), marginBottom: scale(SPACING.sm) },
  endTypeButton: {
    flex: 1, paddingVertical: scale(SPACING.md), paddingHorizontal: scale(SPACING.sm),
    borderRadius: scale(10), backgroundColor: COLORS.surface,
    borderWidth: 1, borderColor: COLORS.border, alignItems: "center",
  },
  endTypeButtonActive: { backgroundColor: COLORS.primary + "20", borderColor: COLORS.primary },
  endTypeText: { fontSize: moderateScale(FONT_SIZES.sm), fontWeight: "600", color: COLORS.textSecondary },
  endTypeTextActive: { color: COLORS.primary },
  endTypeHintBox: {
    backgroundColor: COLORS.surface, borderRadius: scale(8),
    padding: scale(SPACING.sm), borderWidth: 1, borderColor: COLORS.border,
  },
  endTypeHint: { fontSize: moderateScale(FONT_SIZES.sm), color: COLORS.textSecondary, lineHeight: 18 },

  // Date
  dateRow: { flexDirection: "row", gap: scale(SPACING.sm) },
  dateDropdown: { flex: 2 },
  dateDropdownSmall: { flex: 1 },

  // Age
  ageRequirementContainer: {
    backgroundColor: COLORS.surface, borderRadius: scale(10), padding: scale(SPACING.md),
    borderWidth: 1, borderColor: COLORS.border,
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
  },
  ageRequirementText: { fontSize: moderateScale(FONT_SIZES.md), fontWeight: "600", color: COLORS.text },
  ageRequirementSubtext: { fontSize: moderateScale(FONT_SIZES.sm), color: COLORS.textMuted, fontStyle: "italic" },

  // Default rules notice
  defaultRulesBox: {
    flexDirection: "row",
    backgroundColor: COLORS.success + "12",
    borderRadius: scale(10), padding: scale(SPACING.md),
    borderWidth: 1, borderColor: COLORS.success + "35",
    gap: scale(SPACING.sm), marginBottom: scale(SPACING.md),
    alignItems: "flex-start",
  },
  defaultRulesIcon: { fontSize: moderateScale(18), marginTop: scale(1) },
  defaultRulesTitle: {
    fontSize: moderateScale(FONT_SIZES.sm), fontWeight: "700",
    color: COLORS.success, marginBottom: scale(3),
  },
  defaultRulesBody: {
    fontSize: moderateScale(FONT_SIZES.xs), color: COLORS.textSecondary, lineHeight: 17,
  },
  defaultRulesNote: {
    fontSize: moderateScale(FONT_SIZES.xs), color: COLORS.textMuted,
    marginTop: scale(SPACING.xs), fontStyle: "italic",
  },

  // Custom rules toggle
  customRulesToggle: {
    paddingVertical: scale(SPACING.sm),
    marginBottom: scale(SPACING.sm),
  },
  customRulesToggleText: {
    fontSize: moderateScale(FONT_SIZES.sm), color: COLORS.primary, fontWeight: "600",
  },

  // Bottom
  bottomSpacer: { height: scale(100) },
  bottomButtons: {
    flexDirection: "row",
    padding: scale(SPACING.md),
    paddingBottom: Platform.OS === "ios" ? scale(34) : scale(SPACING.lg),
    gap: scale(SPACING.sm),
    borderTopWidth: 1, borderTopColor: COLORS.border,
    backgroundColor: COLORS.background,
  },
  cancelButton: {
    flex: 1, backgroundColor: COLORS.surface,
    paddingVertical: scale(SPACING.md), borderRadius: scale(10),
    alignItems: "center", borderWidth: 1, borderColor: COLORS.border,
  },
  cancelButtonText: { color: COLORS.text, fontSize: moderateScale(FONT_SIZES.md), fontWeight: "600" },
  createButton: {
    flex: 2, backgroundColor: COLORS.primary,
    paddingVertical: scale(SPACING.md), borderRadius: scale(10),
    alignItems: "center", justifyContent: "center",
  },
  createButtonText: { color: "#fff", fontSize: moderateScale(FONT_SIZES.md), fontWeight: "700" },
  buttonDisabled: { opacity: 0.6 },
});
