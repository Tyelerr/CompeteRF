import { useRouter } from "expo-router";
import React from "react";
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

export default function CreateGiveawayScreen() {
  const router = useRouter();
  const vm = useCreateGiveaway();

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      {/* Header */}
      <View style={styles.header}>
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
        {/* Prize Image */}
        <View style={styles.imageSection}>
          <Text style={styles.label}>Prize Image</Text>

          {vm.imageUri ? (
            <View style={styles.imagePreviewContainer}>
              <Image
                source={{ uri: vm.imageUri }}
                style={styles.imagePreview}
              />
              {vm.isUploadingImage && (
                <View style={styles.uploadingOverlay}>
                  <ActivityIndicator color={COLORS.primary} size="large" />
                  <Text style={styles.uploadingText}>Uploading...</Text>
                </View>
              )}
              {!vm.isUploadingImage && (
                <TouchableOpacity
                  style={styles.removeImageButton}
                  onPress={vm.removeImage}
                >
                  <Text style={styles.removeImageText}>✕</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            <TouchableOpacity
              style={styles.uploadButton}
              onPress={vm.pickImage}
              disabled={vm.isUploadingImage}
            >
              <Text style={styles.uploadIcon}>📷</Text>
              <Text style={styles.uploadText}>Upload Prize Image</Text>
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
            placeholder="e.g., iPad Pro, $500 Cash, HOW Glove"
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
            Prize ARV (Approximate Retail Value){" "}
            <Text style={styles.required}>*</Text>
          </Text>
          <View style={styles.currencyInputWrapper}>
            <Text style={styles.currencySymbol}>$</Text>
            <TextInput
              style={[
                styles.currencyInput,
                vm.formErrors.prize_value && styles.inputError,
              ]}
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
            placeholder="Describe the giveaway and prize details..."
            placeholderTextColor={COLORS.textMuted}
            value={vm.formData.description}
            onChangeText={(text) => vm.updateField("description", text)}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />
        </View>

        {/* End By Type Selector */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>
            End Giveaway By <Text style={styles.required}>*</Text>
          </Text>
          <View style={styles.endTypeRow}>
            <TouchableOpacity
              style={[
                styles.endTypeButton,
                vm.formData.end_type === "date" && styles.endTypeButtonActive,
              ]}
              onPress={() => vm.updateField("end_type", "date")}
            >
              <Text
                style={[
                  styles.endTypeText,
                  vm.formData.end_type === "date" && styles.endTypeTextActive,
                ]}
              >
                📅 Date
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.endTypeButton,
                vm.formData.end_type === "entries" &&
                  styles.endTypeButtonActive,
              ]}
              onPress={() => vm.updateField("end_type", "entries")}
            >
              <Text
                style={[
                  styles.endTypeText,
                  vm.formData.end_type === "entries" &&
                    styles.endTypeTextActive,
                ]}
              >
                👥 Entries
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.endTypeButton,
                vm.formData.end_type === "both" && styles.endTypeButtonActive,
              ]}
              onPress={() => vm.updateField("end_type", "both")}
            >
              <Text
                style={[
                  styles.endTypeText,
                  vm.formData.end_type === "both" && styles.endTypeTextActive,
                ]}
              >
                Both
              </Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.fieldHint}>
            {vm.formData.end_type === "date" &&
              "Giveaway ends on the specified date"}
            {vm.formData.end_type === "entries" &&
              "Giveaway ends when max entries reached"}
            {vm.formData.end_type === "both" &&
              "Giveaway ends whichever comes first"}
          </Text>
        </View>

        {/* Max Entries - show if entries or both */}
        {(vm.formData.end_type === "entries" ||
          vm.formData.end_type === "both") && (
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>
              Maximum Entries <Text style={styles.required}>*</Text>
            </Text>
            <TextInput
              style={[
                styles.input,
                vm.formErrors.max_entries && styles.inputError,
              ]}
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

        {/* End Date - show if date or both */}
        {(vm.formData.end_type === "date" ||
          vm.formData.end_type === "both") && (
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
        )}

        {/* Min Age */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Minimum Age</Text>
          <TextInput
            style={styles.input}
            placeholder="18"
            placeholderTextColor={COLORS.textMuted}
            value={vm.formData.min_age}
            onChangeText={(text) =>
              vm.updateField("min_age", text.replace(/[^0-9]/g, ""))
            }
            keyboardType="number-pad"
          />
        </View>

        {/* Rules Text */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Official Rules Text</Text>
          <Text style={styles.fieldHint}>Leave blank to use default rules</Text>
          <TextInput
            style={[styles.input, styles.textAreaLarge]}
            placeholder="Enter full legal rules text here..."
            placeholderTextColor={COLORS.textMuted}
            value={vm.formData.rules_text}
            onChangeText={(text) => vm.updateField("rules_text", text)}
            multiline
            numberOfLines={6}
            textAlignVertical="top"
          />
        </View>

        {/* Spacer for bottom buttons */}
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
            <ActivityIndicator color={COLORS.text} size="small" />
          ) : (
            <Text style={styles.createButtonText}>Create Giveaway</Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
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
  backButton: {
    padding: SPACING.xs,
  },
  backText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.primary,
    fontWeight: "500",
  },
  headerTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: "700",
    color: COLORS.text,
  },
  placeholder: {
    width: 60,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: SPACING.md,
  },

  // Image Section
  imageSection: {
    marginBottom: SPACING.lg,
  },
  uploadButton: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: COLORS.border,
    borderStyle: "dashed",
    padding: SPACING.xl,
    alignItems: "center",
    justifyContent: "center",
  },
  uploadIcon: {
    fontSize: 40,
    marginBottom: SPACING.sm,
  },
  uploadText: {
    fontSize: FONT_SIZES.md,
    fontWeight: "600",
    color: COLORS.primary,
    marginBottom: SPACING.xs,
  },
  uploadHint: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textMuted,
  },
  imagePreviewContainer: {
    position: "relative",
    borderRadius: 12,
    overflow: "hidden",
  },
  imagePreview: {
    width: "100%",
    height: 200,
    borderRadius: 12,
    backgroundColor: COLORS.surface,
  },
  uploadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 12,
  },
  uploadingText: {
    color: COLORS.text,
    fontSize: FONT_SIZES.sm,
    marginTop: SPACING.sm,
  },
  removeImageButton: {
    position: "absolute",
    top: SPACING.sm,
    right: SPACING.sm,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  removeImageText: {
    color: COLORS.text,
    fontSize: FONT_SIZES.md,
    fontWeight: "bold",
  },

  // Form Fields
  fieldGroup: {
    marginBottom: SPACING.lg,
  },
  label: {
    fontSize: FONT_SIZES.md,
    fontWeight: "600",
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },
  required: {
    color: COLORS.error || "#ef4444",
  },
  fieldHint: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textMuted,
    marginBottom: SPACING.xs,
  },
  input: {
    backgroundColor: COLORS.surface,
    borderRadius: 8,
    padding: SPACING.md,
    fontSize: FONT_SIZES.md,
    color: COLORS.text,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  inputError: {
    borderColor: COLORS.error || "#ef4444",
  },
  textArea: {
    minHeight: 100,
    textAlignVertical: "top",
  },
  textAreaLarge: {
    minHeight: 150,
    textAlignVertical: "top",
  },
  errorText: {
    color: COLORS.error || "#ef4444",
    fontSize: FONT_SIZES.sm,
    marginTop: SPACING.xs,
  },

  // Currency Input
  currencyInputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  currencySymbol: {
    fontSize: FONT_SIZES.lg,
    color: COLORS.textSecondary,
    paddingLeft: SPACING.md,
    paddingRight: SPACING.xs,
  },
  currencyInput: {
    flex: 1,
    padding: SPACING.md,
    paddingLeft: 0,
    fontSize: FONT_SIZES.md,
    color: COLORS.text,
  },

  // End Type Selector
  endTypeRow: {
    flexDirection: "row",
    gap: SPACING.sm,
    marginBottom: SPACING.xs,
  },
  endTypeButton: {
    flex: 1,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderRadius: 8,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
  },
  endTypeButtonActive: {
    backgroundColor: COLORS.primary + "20",
    borderColor: COLORS.primary,
  },
  endTypeText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: "600",
    color: COLORS.textSecondary,
  },
  endTypeTextActive: {
    color: COLORS.primary,
  },

  // Date Row
  dateRow: {
    flexDirection: "row",
    gap: SPACING.sm,
  },
  dateDropdown: {
    flex: 2,
  },
  dateDropdownSmall: {
    flex: 1,
  },

  // Bottom
  bottomSpacer: {
    height: 100,
  },
  bottomButtons: {
    flexDirection: "row",
    padding: SPACING.md,
    paddingBottom: SPACING.xl,
    gap: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    backgroundColor: COLORS.background,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: COLORS.surface,
    paddingVertical: SPACING.md,
    borderRadius: 8,
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cancelButtonText: {
    color: COLORS.text,
    fontSize: FONT_SIZES.md,
    fontWeight: "600",
  },
  createButton: {
    flex: 1,
    backgroundColor: COLORS.primary,
    paddingVertical: SPACING.md,
    borderRadius: 8,
    alignItems: "center",
  },
  createButtonText: {
    color: COLORS.text,
    fontSize: FONT_SIZES.md,
    fontWeight: "600",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});
