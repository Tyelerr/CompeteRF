import { Ionicons } from "@expo/vector-icons";
import React from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Giveaway } from "../../../models/types/giveaway.types";
import { useGiveawayEntry } from "../../../viewmodels/useGiveawayEntry";

const COLORS = {
  background: "#000000",
  card: "#1C1C1E",
  cardBorder: "#2C2C2E",
  blue: "#007AFF",
  white: "#FFFFFF",
  gray: "#8E8E93",
  lightGray: "#AEAEB2",
  darkGray: "#3A3A3C",
  red: "#FF453A",
  green: "#30D158",
};

const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
};

const FONT_SIZES = {
  xs: 11,
  sm: 13,
  md: 15,
  lg: 17,
  xl: 20,
};

interface Props {
  visible: boolean;
  giveaway: Giveaway | null;
  userId: number;
  onClose: () => void;
  onSuccess: (giveawayId: number) => void;
}

export function GiveawayEntryModal({
  visible,
  giveaway,
  userId,
  onClose,
  onSuccess,
}: Props) {
  const vm = useGiveawayEntry(giveaway);

  const handleSubmit = async () => {
    if (!giveaway) return;
    const success = await vm.submitEntry();
    if (success) {
      onSuccess(giveaway.id);
      onClose();
      vm.resetForm();
    }
  };

  const handleClose = () => {
    onClose();
    vm.resetForm();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.overlay}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.keyboardView}
        >
          <View style={styles.modalContainer}>
            {/* Header */}
            <View style={styles.header}>
              <Pressable onPress={handleClose} style={styles.closeButton}>
                <Ionicons name="close" size={24} color={COLORS.white} />
              </Pressable>
              <Text style={styles.headerTitle}>Enter Giveaway</Text>
              <View style={{ width: 40 }} />
            </View>

            <View style={styles.divider} />

            <ScrollView
              style={styles.scrollView}
              contentContainerStyle={styles.scrollContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <Text style={styles.giveawayName}>{giveaway?.name}</Text>

              {/* Full Name */}
              <Text style={styles.label}>Full Name (as on ID) *</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter your full legal name"
                placeholderTextColor={COLORS.gray}
                value={vm.form.name_as_on_id}
                onChangeText={(text) => vm.updateField("name_as_on_id", text)}
                autoCapitalize="words"
              />
              {vm.errors.name_as_on_id && (
                <Text style={styles.errorField}>{vm.errors.name_as_on_id}</Text>
              )}

              {/* Date of Birth */}
              <Text style={styles.label}>Date of Birth *</Text>
              <View style={styles.birthdayRow}>
                <Dropdown
                  options={vm.monthOptions}
                  value={vm.form.birthday.month}
                  onSelect={(val) => vm.updateBirthday("month", val)}
                  placeholder="Month"
                  flex={2}
                />
                <Dropdown
                  options={vm.dayOptions}
                  value={vm.form.birthday.day}
                  onSelect={(val) => vm.updateBirthday("day", val)}
                  placeholder="Day"
                  flex={1}
                />
                <Dropdown
                  options={vm.yearOptions}
                  value={vm.form.birthday.year}
                  onSelect={(val) => vm.updateBirthday("year", val)}
                  placeholder="Year"
                  flex={1}
                />
              </View>
              {vm.errors.birthday && (
                <Text style={styles.errorField}>{vm.errors.birthday}</Text>
              )}

              {/* Email */}
              <Text style={styles.label}>Email Address *</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter your email"
                placeholderTextColor={COLORS.gray}
                value={vm.form.email}
                onChangeText={(text) => vm.updateField("email", text)}
                keyboardType="email-address"
                autoCapitalize="none"
              />
              {vm.errors.email && (
                <Text style={styles.errorField}>{vm.errors.email}</Text>
              )}

              {/* Phone */}
              <Text style={styles.label}>Phone Number *</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter your phone number"
                placeholderTextColor={COLORS.gray}
                value={vm.form.phone}
                onChangeText={(text) => vm.updateField("phone", text)}
                keyboardType="phone-pad"
              />
              {vm.errors.phone && (
                <Text style={styles.errorField}>{vm.errors.phone}</Text>
              )}

              {/* Checkboxes */}
              <View style={styles.checkboxSection}>
                <CheckboxRow
                  label="I confirm I am 18+ years old"
                  checked={vm.form.confirmed_age}
                  onToggle={() => vm.toggleCheckbox("confirmed_age")}
                />
                <CheckboxRow
                  label="I agree to the official rules"
                  checked={vm.form.agreed_to_rules}
                  onToggle={() => vm.toggleCheckbox("agreed_to_rules")}
                />
                <CheckboxRow
                  label="I agree to the privacy policy"
                  checked={vm.form.agreed_to_privacy}
                  onToggle={() => vm.toggleCheckbox("agreed_to_privacy")}
                />
                <CheckboxRow
                  label="I understand this is one entry per person"
                  checked={vm.form.understood_one_entry}
                  onToggle={() => vm.toggleCheckbox("understood_one_entry")}
                />
              </View>
              {vm.errors.checkboxes && (
                <Text style={styles.errorField}>{vm.errors.checkboxes}</Text>
              )}

              {vm.submitError && (
                <Text style={styles.errorText}>{vm.submitError}</Text>
              )}
            </ScrollView>

            {/* Bottom buttons */}
            <View style={styles.bottomBar}>
              <Pressable style={styles.cancelButton} onPress={handleClose}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.submitButton,
                  (!vm.isFormComplete || vm.isSubmitting) &&
                    styles.submitButtonDisabled,
                ]}
                onPress={handleSubmit}
                disabled={!vm.isFormComplete || vm.isSubmitting}
              >
                <Text style={styles.submitButtonText}>
                  {vm.isSubmitting ? "Submitting..." : "Enter Giveaway"}
                </Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

function Dropdown({
  options,
  value,
  onSelect,
  placeholder,
  flex = 1,
}: {
  options: { label: string; value: string }[];
  value: string;
  onSelect: (value: string) => void;
  placeholder: string;
  flex?: number;
}) {
  const [open, setOpen] = React.useState(false);
  const selectedLabel =
    options.find((o) => o.value === value)?.label || placeholder;

  return (
    <View style={{ flex }}>
      <Pressable style={styles.dropdownButton} onPress={() => setOpen(!open)}>
        <Text
          style={[styles.dropdownText, !value && styles.dropdownPlaceholder]}
          numberOfLines={1}
        >
          {selectedLabel}
        </Text>
        <Ionicons
          name={open ? "chevron-up" : "chevron-down"}
          size={14}
          color={COLORS.gray}
        />
      </Pressable>

      {open && (
        <Modal transparent animationType="fade">
          <Pressable
            style={styles.dropdownOverlay}
            onPress={() => setOpen(false)}
          >
            <View style={styles.dropdownList}>
              <ScrollView
                style={{ maxHeight: 250 }}
                showsVerticalScrollIndicator
              >
                {options
                  .filter((o) => o.value !== "")
                  .map((option) => (
                    <Pressable
                      key={option.value}
                      style={[
                        styles.dropdownOption,
                        option.value === value && styles.dropdownOptionActive,
                      ]}
                      onPress={() => {
                        onSelect(option.value);
                        setOpen(false);
                      }}
                    >
                      <Text
                        style={[
                          styles.dropdownOptionText,
                          option.value === value &&
                            styles.dropdownOptionTextActive,
                        ]}
                      >
                        {option.label}
                      </Text>
                    </Pressable>
                  ))}
              </ScrollView>
            </View>
          </Pressable>
        </Modal>
      )}
    </View>
  );
}

function CheckboxRow({
  label,
  checked,
  onToggle,
}: {
  label: string;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <Pressable style={styles.checkboxRow} onPress={onToggle}>
      <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
        {checked && (
          <Ionicons name="checkmark" size={14} color={COLORS.white} />
        )}
      </View>
      <Text style={styles.checkboxLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  keyboardView: { flex: 1, justifyContent: "flex-end" },
  modalContainer: {
    backgroundColor: COLORS.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "92%",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.md,
  },
  closeButton: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: {
    color: COLORS.white,
    fontSize: FONT_SIZES.lg,
    fontWeight: "700",
  },
  divider: { height: 1, backgroundColor: COLORS.cardBorder },
  scrollView: { flex: 1 },
  scrollContent: { padding: SPACING.xl, paddingBottom: SPACING.lg },
  giveawayName: {
    color: COLORS.blue,
    fontSize: FONT_SIZES.lg,
    fontWeight: "600",
    textAlign: "center",
    marginBottom: SPACING.xl,
  },
  label: {
    color: COLORS.white,
    fontSize: FONT_SIZES.md,
    fontWeight: "600",
    marginBottom: SPACING.sm,
    marginTop: SPACING.lg,
  },
  input: {
    backgroundColor: COLORS.card,
    borderRadius: 10,
    padding: SPACING.lg,
    color: COLORS.white,
    fontSize: FONT_SIZES.md,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
  },
  birthdayRow: { flexDirection: "row", gap: SPACING.sm },
  dropdownButton: {
    backgroundColor: COLORS.card,
    borderRadius: 10,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  dropdownText: { color: COLORS.white, fontSize: FONT_SIZES.sm, flex: 1 },
  dropdownPlaceholder: { color: COLORS.gray },
  dropdownOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  dropdownList: {
    backgroundColor: COLORS.card,
    borderRadius: 12,
    width: "80%",
    maxHeight: 300,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    overflow: "hidden",
  },
  dropdownOption: {
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.cardBorder,
  },
  dropdownOptionActive: { backgroundColor: COLORS.blue },
  dropdownOptionText: { color: COLORS.white, fontSize: FONT_SIZES.md },
  dropdownOptionTextActive: { fontWeight: "700" },
  checkboxSection: { marginTop: SPACING.xl, gap: SPACING.md },
  checkboxRow: { flexDirection: "row", alignItems: "center", gap: SPACING.md },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: COLORS.gray,
    justifyContent: "center",
    alignItems: "center",
  },
  checkboxChecked: { backgroundColor: COLORS.blue, borderColor: COLORS.blue },
  checkboxLabel: { color: COLORS.lightGray, fontSize: FONT_SIZES.sm, flex: 1 },
  errorField: {
    color: COLORS.red,
    fontSize: FONT_SIZES.xs,
    marginTop: SPACING.xs,
  },
  errorText: {
    color: COLORS.red,
    fontSize: FONT_SIZES.sm,
    marginTop: SPACING.md,
    textAlign: "center",
  },
  bottomBar: {
    flexDirection: "row",
    padding: SPACING.lg,
    gap: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.cardBorder,
    paddingBottom: Platform.OS === "ios" ? 34 : SPACING.lg,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: COLORS.card,
    borderRadius: 12,
    paddingVertical: SPACING.lg,
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
  },
  cancelButtonText: {
    color: COLORS.white,
    fontSize: FONT_SIZES.md,
    fontWeight: "600",
  },
  submitButton: {
    flex: 1,
    backgroundColor: COLORS.blue,
    borderRadius: 12,
    paddingVertical: SPACING.lg,
    alignItems: "center",
  },
  submitButtonDisabled: { opacity: 0.5 },
  submitButtonText: {
    color: COLORS.white,
    fontSize: FONT_SIZES.md,
    fontWeight: "700",
  },
});
