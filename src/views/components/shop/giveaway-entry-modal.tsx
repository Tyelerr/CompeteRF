import React from "react";
import {
  ActivityIndicator,
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { COLORS } from "../../../theme/colors";
import { SPACING } from "../../../theme/spacing";
import { FONT_SIZES } from "../../../theme/typography";
import { Dropdown } from "../common/dropdown";
import { useGiveawayEntry } from "../../../viewmodels/useGiveawayEntry";
import { Giveaway } from "../../../models/types/giveaway.types";

interface Props {
  visible: boolean;
  giveaway: Giveaway | null;
  onClose: () => void;
  onSuccess: () => void;
}

export function GiveawayEntryModal({
  visible,
  giveaway,
  onClose,
  onSuccess,
}: Props) {
  const vm = useGiveawayEntry(giveaway);

  const handleSubmit = async () => {
    const success = await vm.submitEntry();
    if (success) {
      onSuccess();
      onClose();
    }
  };

  if (!giveaway) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Text style={styles.closeText}>✕</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Enter Giveaway</Text>
          <View style={styles.placeholder} />
        </View>

        <ScrollView style={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.giveawayTitle}>{giveaway.name}</Text>

          {/* Full Name */}
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Full Name (as on ID) *</Text>
            <TextInput
              style={[
                styles.input,
                vm.errors.name_as_on_id && styles.inputError,
              ]}
              value={vm.form.name_as_on_id}
              onChangeText={(text) => vm.updateField("name_as_on_id", text)}
              placeholder="Enter your full name"
              placeholderTextColor={COLORS.textMuted}
              autoCapitalize="words"
            />
            {vm.errors.name_as_on_id && (
              <Text style={styles.errorText}>{vm.errors.name_as_on_id}</Text>
            )}
          </View>

          {/* Birthday - THIS IS THE KEY SECTION */}
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Date of Birth *</Text>
            <View style={styles.dateRow}>
              <View style={styles.dateDropdown}>
                <Dropdown
                  options={vm.monthOptions}
                  value={vm.form.birthday.month} // ✅ This will now persist!
                  onSelect={(value) => {
                    console.log("Month selected:", value); // Debug log
                    vm.updateBirthday("month", value);
                  }}
                  placeholder="Month"
                />
              </View>
              <View style={styles.dateDropdownSmall}>
                <Dropdown
                  options={vm.dayOptions}
                  value={vm.form.birthday.day}
                  onSelect={(value) => {
                    console.log("Day selected:", value); // Debug log
                    vm.updateBirthday("day", value);
                  }}
                  placeholder="Day"
                />
              </View>
              <View style={styles.dateDropdownSmall}>
                <Dropdown
                  options={vm.yearOptions}
                  value={vm.form.birthday.year}
                  onSelect={(value) => {
                    console.log("Year selected:", value); // Debug log
                    vm.updateBirthday("year", value);
                  }}
                  placeholder="Year"
                />
              </View>
            </View>
            {vm.errors.birthday && (
              <Text style={styles.errorText}>{vm.errors.birthday}</Text>
            )}
          </View>

          {/* Email */}
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Email Address *</Text>
            <TextInput
              style={[styles.input, vm.errors.email && styles.inputError]}
              value={vm.form.email}
              onChangeText={(text) => vm.updateField("email", text)}
              placeholder="Enter your email"
              placeholderTextColor={COLORS.textMuted}
              keyboardType="email-address"
              autoCapitalize="none"
            />
            {vm.errors.email && (
              <Text style={styles.errorText}>{vm.errors.email}</Text>
            )}
          </View>

          {/* Phone */}
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Phone Number *</Text>
            <TextInput
              style={[styles.input, vm.errors.phone && styles.inputError]}
              value={vm.form.phone}
              onChangeText={(text) => vm.updateField("phone", text)}
              placeholder="(555) 123-4567"
              placeholderTextColor={COLORS.textMuted}
              keyboardType="phone-pad"
            />
            {vm.errors.phone && (
              <Text style={styles.errorText}>{vm.errors.phone}</Text>
            )}
          </View>

          {/* Checkboxes */}
          <View style={styles.checkboxSection}>
            <TouchableOpacity
              style={styles.checkboxRow}
              onPress={() => vm.toggleCheckbox("confirmed_age")}
            >
              <View
                style={[
                  styles.checkbox,
                  vm.form.confirmed_age && styles.checkboxChecked,
                ]}
              >
                {vm.form.confirmed_age && (
                  <Text style={styles.checkmark}>✓</Text>
                )}
              </View>
              <Text style={styles.checkboxText}>
                I confirm I am {vm.minAge}+ years old
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.checkboxRow}
              onPress={() => vm.toggleCheckbox("agreed_to_rules")}
            >
              <View
                style={[
                  styles.checkbox,
                  vm.form.agreed_to_rules && styles.checkboxChecked,
                ]}
              >
                {vm.form.agreed_to_rules && (
                  <Text style={styles.checkmark}>✓</Text>
                )}
              </View>
              <Text style={styles.checkboxText}>
                I agree to the official rules
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.checkboxRow}
              onPress={() => vm.toggleCheckbox("agreed_to_privacy")}
            >
              <View
                style={[
                  styles.checkbox,
                  vm.form.agreed_to_privacy && styles.checkboxChecked,
                ]}
              >
                {vm.form.agreed_to_privacy && (
                  <Text style={styles.checkmark}>✓</Text>
                )}
              </View>
              <Text style={styles.checkboxText}>
                I agree to the privacy policy
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.checkboxRow}
              onPress={() => vm.toggleCheckbox("understood_one_entry")}
            >
              <View
                style={[
                  styles.checkbox,
                  vm.form.understood_one_entry && styles.checkboxChecked,
                ]}
              >
                {vm.form.understood_one_entry && (
                  <Text style={styles.checkmark}>✓</Text>
                )}
              </View>
              <Text style={styles.checkboxText}>
                I understand this is one entry per person
              </Text>
            </TouchableOpacity>

            {vm.errors.checkboxes && (
              <Text style={styles.errorText}>{vm.errors.checkboxes}</Text>
            )}
          </View>

          {/* Debug Info - REMOVE AFTER TESTING */}
          <View style={styles.debugInfo}>
            <Text style={styles.debugTitle}>
              🔍 DEBUG INFO (remove after testing):
            </Text>
            <Text style={styles.debugText}>
              Month: "{vm.form.birthday.month}"
            </Text>
            <Text style={styles.debugText}>Day: "{vm.form.birthday.day}"</Text>
            <Text style={styles.debugText}>
              Year: "{vm.form.birthday.year}"
            </Text>
          </View>

          {/* Submit Error */}
          {vm.submitError && (
            <View style={styles.errorContainer}>
              <Text style={styles.submitError}>{vm.submitError}</Text>
            </View>
          )}
        </ScrollView>

        {/* Bottom Buttons */}
        <View style={styles.bottomButtons}>
          <TouchableOpacity
            style={styles.cancelButton}
            onPress={onClose}
            disabled={vm.isSubmitting}
          >
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.submitButton,
              (!vm.isFormComplete || vm.isSubmitting) && styles.buttonDisabled,
            ]}
            onPress={handleSubmit}
            disabled={!vm.isFormComplete || vm.isSubmitting}
          >
            {vm.isSubmitting ? (
              <ActivityIndicator color={COLORS.text} size="small" />
            ) : (
              <Text style={styles.submitButtonText}>Enter Giveaway</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  closeButton: {
    padding: SPACING.xs,
  },
  closeText: {
    fontSize: 18,
    color: COLORS.textSecondary,
  },
  headerTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: "600",
    color: COLORS.text,
  },
  placeholder: {
    width: 30,
  },
  content: {
    flex: 1,
    padding: SPACING.md,
  },
  giveawayTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: "600",
    color: COLORS.text,
    textAlign: "center",
    marginBottom: SPACING.lg,
  },
  fieldGroup: {
    marginBottom: SPACING.md,
  },
  label: {
    fontSize: FONT_SIZES.md,
    fontWeight: "600",
    color: COLORS.text,
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
  errorText: {
    color: COLORS.error || "#ef4444",
    fontSize: FONT_SIZES.sm,
    marginTop: SPACING.xs,
  },
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
  checkboxSection: {
    marginTop: SPACING.md,
  },
  checkboxRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: SPACING.md,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    marginRight: SPACING.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxChecked: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  checkmark: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: "bold",
  },
  checkboxText: {
    flex: 1,
    fontSize: FONT_SIZES.sm,
    color: COLORS.text,
  },
  debugInfo: {
    backgroundColor: "#f0f0f0",
    padding: SPACING.md,
    margin: SPACING.md,
    borderRadius: 8,
    marginTop: SPACING.lg,
  },
  debugTitle: {
    fontSize: FONT_SIZES.sm,
    fontWeight: "bold",
    marginBottom: SPACING.xs,
  },
  debugText: {
    fontSize: FONT_SIZES.sm,
    marginBottom: 2,
  },
  errorContainer: {
    marginTop: SPACING.md,
  },
  submitError: {
    color: COLORS.error || "#ef4444",
    fontSize: FONT_SIZES.sm,
    textAlign: "center",
  },
  bottomButtons: {
    flexDirection: "row",
    padding: SPACING.md,
    gap: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
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
  submitButton: {
    flex: 1,
    backgroundColor: COLORS.primary,
    paddingVertical: SPACING.md,
    borderRadius: 8,
    alignItems: "center",
  },
  submitButtonText: {
    color: COLORS.text,
    fontSize: FONT_SIZES.md,
    fontWeight: "600",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});
