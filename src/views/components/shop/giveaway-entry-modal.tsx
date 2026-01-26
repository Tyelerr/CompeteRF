import React from "react";
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { COLORS } from "../../../theme/colors";
import { SPACING } from "../../../theme/spacing";
import { FONT_SIZES } from "../../../theme/typography";
import { Giveaway } from "../../../models/types/giveaway.types";
import { useGiveawayEntry } from "../../../viewmodels/useGiveawayEntry";
import { Dropdown } from "../common/dropdown";

interface GiveawayEntryModalProps {
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
}: GiveawayEntryModalProps) {
  const vm = useGiveawayEntry(giveaway);

  const handleSubmit = async () => {
    const success = await vm.submitEntry();
    if (success) {
      onSuccess();
      onClose();
    }
  };

  const handleClose = () => {
    vm.resetForm();
    onClose();
  };

  if (!giveaway) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={handleClose}
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Official Rules</Text>
            <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.scrollView}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* Rules Text */}
            {vm.rulesText && (
              <View style={styles.rulesContainer}>
                <Text style={styles.rulesText}>{vm.rulesText}</Text>
              </View>
            )}

            {/* Form */}
            <View style={styles.form}>
              {/* Name */}
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>
                  Name (As it appears on license) <Text style={styles.required}>*</Text>
                </Text>
                <TextInput
                  style={[styles.input, vm.errors.name_as_on_id && styles.inputError]}
                  placeholder="Full Name"
                  placeholderTextColor={COLORS.textMuted}
                  value={vm.form.name_as_on_id}
                  onChangeText={(text) => vm.updateField("name_as_on_id", text)}
                  autoCapitalize="words"
                />
                {vm.errors.name_as_on_id && (
                  <Text style={styles.errorText}>{vm.errors.name_as_on_id}</Text>
                )}
              </View>

              {/* Birthday */}
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>
                  Birthday <Text style={styles.required}>*</Text>
                </Text>
                <View style={styles.birthdayRow}>
                  <View style={styles.birthdayDropdown}>
                    <Dropdown
                      options={vm.monthOptions}
                      selectedValue={vm.form.birthday.month}
                      onSelect={(value) => vm.updateBirthday("month", value)}
                      placeholder="Month"
                    />
                  </View>
                  <View style={styles.birthdayDropdownSmall}>
                    <Dropdown
                      options={vm.dayOptions}
                      selectedValue={vm.form.birthday.day}
                      onSelect={(value) => vm.updateBirthday("day", value)}
                      placeholder="Day"
                    />
                  </View>
                  <View style={styles.birthdayDropdownSmall}>
                    <Dropdown
                      options={vm.yearOptions}
                      selectedValue={vm.form.birthday.year}
                      onSelect={(value) => vm.updateBirthday("year", value)}
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
                <Text style={styles.label}>
                  Email <Text style={styles.required}>*</Text>
                </Text>
                <TextInput
                  style={[styles.input, vm.errors.email && styles.inputError]}
                  placeholder="your.email@example.com"
                  placeholderTextColor={COLORS.textMuted}
                  value={vm.form.email}
                  onChangeText={(text) => vm.updateField("email", text)}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                {vm.errors.email && (
                  <Text style={styles.errorText}>{vm.errors.email}</Text>
                )}
              </View>

              {/* Phone */}
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>
                  Phone Number <Text style={styles.required}>*</Text>
                </Text>
                <TextInput
                  style={[styles.input, vm.errors.phone && styles.inputError]}
                  placeholder="(555) 123-4567"
                  placeholderTextColor={COLORS.textMuted}
                  value={vm.form.phone}
                  onChangeText={(text) => vm.updateField("phone", text)}
                  keyboardType="phone-pad"
                />
                {vm.errors.phone && (
                  <Text style={styles.errorText}>{vm.errors.phone}</Text>
                )}
              </View>

              {/* Links */}
              <View style={styles.linksContainer}>
                <Text style={styles.linksTitle}>Links:</Text>
                <TouchableOpacity>
                  <Text style={styles.link}>Official Rules</Text>
                </TouchableOpacity>
                <TouchableOpacity>
                  <Text style={styles.link}>Privacy Policy</Text>
                </TouchableOpacity>
              </View>

              {/* Required Checkboxes */}
              <View style={styles.checkboxSection}>
                <Text style={styles.checkboxSectionTitle}>Required:</Text>

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
                  <Text style={styles.checkboxLabel}>
                    I am {vm.minAge} or older and meet the eligibility requirements.
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
                  <Text style={styles.checkboxLabel}>
                    I have read and agree to the Official Rules.
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
                  <Text style={styles.checkboxLabel}>
                    I have read and agree to the Privacy Policy.
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
                  <Text style={styles.checkboxLabel}>
                    I understand it's one entry per person and duplicate entries
                    will be void.
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Optional Checkbox */}
              <View style={styles.checkboxSection}>
                <Text style={styles.checkboxSectionTitle}>Optional:</Text>

                <TouchableOpacity
                  style={styles.checkboxRow}
                  onPress={() => vm.toggleCheckbox("opted_in_promotions")}
                >
                  <View
                    style={[
                      styles.checkbox,
                      vm.form.opted_in_promotions && styles.checkboxChecked,
                    ]}
                  >
                    {vm.form.opted_in_promotions && (
                      <Text style={styles.checkmark}>✓</Text>
                    )}
                  </View>
                  <Text style={styles.checkboxLabel}>
                    Receive optional updates, announcements, and promotions from
                    Compete.
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Error Messages */}
              {vm.errors.checkboxes && (
                <Text style={styles.errorText}>{vm.errors.checkboxes}</Text>
              )}
              {vm.submitError && (
                <Text style={styles.submitErrorText}>{vm.submitError}</Text>
              )}
            </View>
          </ScrollView>

          {/* Bottom Buttons */}
          <View style={styles.bottomButtons}>
            <TouchableOpacity
              style={[
                styles.submitButton,
                !vm.isFormComplete && styles.submitButtonDisabled,
              ]}
              onPress={handleSubmit}
              disabled={!vm.isFormComplete || vm.isSubmitting}
            >
              {vm.isSubmitting ? (
                <ActivityIndicator color={COLORS.text} />
              ) : (
                <Text
                  style={[
                    styles.submitButtonText,
                    !vm.isFormComplete && styles.submitButtonTextDisabled,
                  ]}
                >
                  I Agree & Continue
                </Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity style={styles.cancelButton} onPress={handleClose}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "flex-end",
  },
  container: {
    backgroundColor: COLORS.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "95%",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: "700",
    color: COLORS.text,
  },
  closeButton: {
    padding: SPACING.xs,
  },
  closeButtonText: {
    fontSize: FONT_SIZES.xl,
    color: COLORS.textSecondary,
  },
  scrollView: {
    padding: SPACING.md,
  },
  rulesContainer: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: SPACING.md,
    marginBottom: SPACING.lg,
  },
  rulesText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    lineHeight: 22,
  },
  form: {
    marginBottom: SPACING.md,
  },
  fieldGroup: {
    marginBottom: SPACING.md,
  },
  label: {
    fontSize: FONT_SIZES.md,
    color: COLORS.text,
    marginBottom: SPACING.xs,
    fontWeight: "500",
  },
  required: {
    color: COLORS.error || "#ef4444",
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
  submitErrorText: {
    color: COLORS.error || "#ef4444",
    fontSize: FONT_SIZES.md,
    textAlign: "center",
    marginTop: SPACING.md,
    padding: SPACING.sm,
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    borderRadius: 8,
  },
  birthdayRow: {
    flexDirection: "row",
    gap: SPACING.sm,
  },
  birthdayDropdown: {
    flex: 2,
  },
  birthdayDropdownSmall: {
    flex: 1,
  },
  linksContainer: {
    marginBottom: SPACING.md,
  },
  linksTitle: {
    fontSize: FONT_SIZES.md,
    color: COLORS.text,
    fontWeight: "500",
    marginBottom: SPACING.xs,
  },
  link: {
    fontSize: FONT_SIZES.md,
    color: COLORS.primary,
    marginBottom: 4,
    textDecorationLine: "underline",
  },
  checkboxSection: {
    marginBottom: SPACING.md,
  },
  checkboxSectionTitle: {
    fontSize: FONT_SIZES.md,
    color: COLORS.text,
    fontWeight: "600",
    marginBottom: SPACING.sm,
  },
  checkboxRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: SPACING.sm,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: COLORS.border,
    marginRight: SPACING.sm,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 2,
  },
  checkboxChecked: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  checkmark: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: "bold",
  },
  checkboxLabel: {
    flex: 1,
    fontSize: FONT_SIZES.md,
    color: COLORS.text,
    lineHeight: 22,
  },
  bottomButtons: {
    padding: SPACING.md,
    paddingBottom: SPACING.xl,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    flexDirection: "row",
    gap: SPACING.sm,
  },
  submitButton: {
    flex: 1,
    backgroundColor: COLORS.primary,
    paddingVertical: SPACING.md,
    borderRadius: 8,
    alignItems: "center",
  },
  submitButtonDisabled: {
    backgroundColor: COLORS.surfaceLight,
  },
  submitButtonText: {
    color: COLORS.text,
    fontSize: FONT_SIZES.md,
    fontWeight: "600",
  },
  submitButtonTextDisabled: {
    color: COLORS.textMuted,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: COLORS.surfaceLight,
    paddingVertical: SPACING.md,
    borderRadius: 8,
    alignItems: "center",
  },
  cancelButtonText: {
    color: COLORS.text,
    fontSize: FONT_SIZES.md,
    fontWeight: "600",
  },
});
