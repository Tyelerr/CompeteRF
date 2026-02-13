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

// ============================================
// OFFICIAL GIVEAWAY RULES
// ============================================
const OFFICIAL_RULES_SECTIONS = [
  {
    heading: "",
    body: "NO PURCHASE NECESSARY TO ENTER OR WIN. A purchase or payment of any kind will not increase your chances of winning. Void where prohibited by law.",
  },
  {
    heading: "1. Eligibility",
    body: "Giveaways hosted on the Compete app are open to legal residents of the United States who are 18 years of age or older at the time of entry. Employees, officers, and directors of Compete and its affiliates, and their immediate family members, are not eligible to participate. Void where prohibited or restricted by law.",
  },
  {
    heading: "2. How to Enter",
    body: "No purchase necessary. To enter a giveaway, you must have a registered Compete account in good standing. Complete the entry form with your full legal name (as it appears on your government-issued ID), date of birth, email address, and phone number. All information must be accurate and truthful. Limit one (1) entry per person per giveaway. Multiple entries, duplicate accounts, or fraudulent information will result in disqualification. Entry is free and open to all eligible participants.",
  },
  {
    heading: "3. Entry Period",
    body: "Each giveaway has a specific start and end date displayed on the giveaway listing. Entries must be received before the posted end date and time. Late entries will not be accepted.",
  },
  {
    heading: "4. Winner Selection",
    body: "Winners are selected at random from all eligible entries received during the entry period. The random drawing is conducted by Compete administrators. The odds of winning depend on the number of eligible entries received.",
  },
  {
    heading: "5. Winner Notification",
    body: "The winner will be notified via the email address and/or phone number provided at the time of entry. The winner must respond within seven (7) days of notification to claim their prize. If the winner does not respond within the specified timeframe, the prize may be forfeited and an alternate winner may be selected.",
  },
  {
    heading: "6. Prizes",
    body: "The prize for each giveaway is described on the giveaway listing page. Prize values are approximate. Prizes are non-transferable and cannot be exchanged for cash or other items. Compete reserves the right to substitute a prize of equal or greater value. Winners are solely responsible for any applicable taxes, fees, or other costs associated with the prize.",
  },
  {
    heading: "7. Identity Verification",
    body: "Winners may be required to present a valid government-issued photo ID to verify their identity and age before receiving their prize. The name on the ID must match the name provided at the time of entry. Failure to verify identity may result in forfeiture of the prize.",
  },
  {
    heading: "8. General Conditions",
    body: "By entering a giveaway, you agree to be bound by these Official Rules and the decisions of Compete, which are final and binding. Compete reserves the right to cancel, suspend, or modify any giveaway at any time for any reason. Compete is not responsible for any technical failures, errors, or other issues that may affect entry submissions. Entrants agree to release Compete, its officers, directors, employees, and agents from any liability arising from participation in the giveaway or acceptance of the prize.",
  },
  {
    heading: "9. Privacy",
    body: "Information collected during giveaway entry is subject to the Compete Privacy Policy. Your information will be used for giveaway administration, winner notification, and prize fulfillment. Your information will not be sold to third parties.",
  },
  {
    heading: "10. Governing Law",
    body: "These Official Rules are governed by the laws of the United States and the state in which Compete operates, without regard to conflict of law provisions.",
  },
  {
    heading: "11. Apple Disclaimer",
    body: "This giveaway is in no way sponsored, endorsed, administered by, or associated with Apple Inc. or any of its subsidiaries or affiliates. By entering, you acknowledge and agree that Apple has no responsibility or liability whatsoever in connection with this giveaway, including but not limited to the administration of the giveaway, the selection of winners, or the provision of prizes. Any questions, comments, or complaints regarding the giveaway should be directed to Compete, not Apple.",
  },
];

// ============================================
// PRIVACY POLICY SUMMARY (for giveaway context)
// ============================================
const PRIVACY_SECTIONS = [
  {
    heading: "What We Collect",
    body: "When you enter a giveaway on Compete, we collect the personal information you provide in the entry form: your full legal name, date of birth, email address, and phone number. This information is required for giveaway administration and winner verification.",
  },
  {
    heading: "How We Use Your Information",
    body: "Your giveaway entry information is used solely for: verifying your eligibility, administering the giveaway drawing, contacting the winner, and fulfilling the prize. We may also use your email to send you giveaway-related updates if you have opted in to notifications.",
  },
  {
    heading: "Information Sharing",
    body: "We do not sell, rent, or trade your personal information to third parties. Your giveaway entry data may be shared with prize sponsors solely for the purpose of prize fulfillment. We may disclose information if required by law.",
  },
  {
    heading: "Data Retention",
    body: "Giveaway entry data is retained for a reasonable period after the giveaway concludes for record-keeping and compliance purposes. You may request deletion of your data by contacting support@thecompeteapp.com.",
  },
  {
    heading: "Your Rights",
    body: "You have the right to access, correct, or delete your personal information at any time. To exercise these rights, contact us at support@thecompeteapp.com. For the full Compete Privacy Policy, visit the Privacy Policy page in the app settings.",
  },
  {
    heading: "Security",
    body: "We implement reasonable technical and organizational measures to protect your personal information from unauthorized access, alteration, or destruction. However, no method of transmission or storage is 100% secure.",
  },
  {
    heading: "Contact",
    body: "If you have questions about how your data is handled in connection with giveaways, please contact us at support@thecompeteapp.com.",
  },
];

// ============================================
// LEGAL VIEWER SUB-MODAL
// ============================================
function LegalViewerModal({
  visible,
  title,
  sections,
  onClose,
}: {
  visible: boolean;
  title: string;
  sections: { heading: string; body: string }[];
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={legalStyles.overlay}>
        <Pressable style={{ flex: 1 }} onPress={onClose} />
        <View style={legalStyles.container}>
          {/* Header */}
          <View style={legalStyles.header}>
            <Pressable onPress={onClose} style={legalStyles.closeButton}>
              <Ionicons name="close" size={24} color={COLORS.white} />
            </Pressable>
            <Text style={legalStyles.headerTitle}>{title}</Text>
            <View style={{ width: 40 }} />
          </View>

          <View style={legalStyles.divider} />

          {/* Content */}
          <ScrollView
            style={legalStyles.scrollView}
            contentContainerStyle={legalStyles.scrollContent}
            showsVerticalScrollIndicator
          >
            {sections.map((section, index) => (
              <View key={index} style={legalStyles.section}>
                <Text style={legalStyles.heading}>{section.heading}</Text>
                <Text style={legalStyles.body}>{section.body}</Text>
              </View>
            ))}
          </ScrollView>

          {/* Accept Button */}
          <View style={legalStyles.bottomBar}>
            <Pressable style={legalStyles.acceptButton} onPress={onClose}>
              <Text style={legalStyles.acceptButtonText}>Accept & Close</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const legalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
  },
  container: {
    backgroundColor: "#0F1117",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "90%",
    minHeight: "60%",
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
  section: { marginBottom: 20 },
  heading: {
    color: COLORS.blue,
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 8,
  },
  body: {
    color: "#D1D5DB",
    fontSize: 14,
    lineHeight: 22,
  },
  bottomBar: {
    padding: SPACING.lg,
    paddingBottom: Platform.OS === "ios" ? 34 : SPACING.lg,
    borderTopWidth: 1,
    borderTopColor: COLORS.cardBorder,
  },
  acceptButton: {
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: COLORS.blue,
    alignItems: "center",
    justifyContent: "center",
  },
  acceptButtonText: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: "600",
  },
});

// ============================================
// MAIN ENTRY MODAL
// ============================================
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
  const [showRulesModal, setShowRulesModal] = React.useState(false);
  const [showPrivacyModal, setShowPrivacyModal] = React.useState(false);

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
          <Pressable style={styles.dismissArea} onPress={handleClose} />
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
                <CheckboxRowWithLink
                  prefix="I agree to the "
                  linkText="official rules"
                  checked={vm.form.agreed_to_rules}
                  onToggle={() => vm.toggleCheckbox("agreed_to_rules")}
                  onLinkPress={() => setShowRulesModal(true)}
                />
                <CheckboxRowWithLink
                  prefix="I agree to the "
                  linkText="privacy policy"
                  checked={vm.form.agreed_to_privacy}
                  onToggle={() => vm.toggleCheckbox("agreed_to_privacy")}
                  onLinkPress={() => setShowPrivacyModal(true)}
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

      {/* Official Rules Sub-Modal */}
      <LegalViewerModal
        visible={showRulesModal}
        title="Official Giveaway Rules"
        sections={OFFICIAL_RULES_SECTIONS}
        onClose={() => setShowRulesModal(false)}
      />

      {/* Privacy Policy Sub-Modal */}
      <LegalViewerModal
        visible={showPrivacyModal}
        title="Giveaway Privacy Policy"
        sections={PRIVACY_SECTIONS}
        onClose={() => setShowPrivacyModal(false)}
      />
    </Modal>
  );
}

// ============================================
// DROPDOWN
// ============================================
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

// ============================================
// CHECKBOX COMPONENTS
// ============================================
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

function CheckboxRowWithLink({
  prefix,
  linkText,
  checked,
  onToggle,
  onLinkPress,
}: {
  prefix: string;
  linkText: string;
  checked: boolean;
  onToggle: () => void;
  onLinkPress: () => void;
}) {
  return (
    <View style={styles.checkboxRow}>
      <Pressable onPress={onToggle}>
        <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
          {checked && (
            <Ionicons name="checkmark" size={14} color={COLORS.white} />
          )}
        </View>
      </Pressable>
      <Text style={styles.checkboxLabel}>
        {prefix}
        <Text style={styles.linkText} onPress={onLinkPress}>
          {linkText}
        </Text>
      </Text>
    </View>
  );
}

// ============================================
// STYLES
// ============================================
const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  keyboardView: {
    flex: 1,
    justifyContent: "flex-end",
  },
  dismissArea: {
    flex: 1,
  },
  modalContainer: {
    backgroundColor: COLORS.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "92%",
    minHeight: "75%",
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
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: SPACING.xl,
    paddingBottom: SPACING.lg,
    flexGrow: 1,
  },
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
  checkboxRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
  },
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
  linkText: {
    color: COLORS.blue,
    textDecorationLine: "underline",
    fontSize: FONT_SIZES.sm,
  },
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
