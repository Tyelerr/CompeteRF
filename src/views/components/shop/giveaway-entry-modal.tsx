import { Ionicons } from "@expo/vector-icons";
import React from "react";
import {
  ActivityIndicator, Keyboard, Modal, Platform, Pressable,
  ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from "react-native";
import { Giveaway } from "../../../models/types/giveaway.types";
import { RADIUS } from "../../../theme/spacing";
import { moderateScale, scale } from "../../../utils/scaling";
import { useGiveawayEntry } from "../../../viewmodels/useGiveawayEntry";

const isWeb = Platform.OS === "web";

const COLORS = { background: "#000000", card: "#1C1C1E", cardBorder: "#2C2C2E", blue: "#007AFF", white: "#FFFFFF", gray: "#8E8E93", lightGray: "#AEAEB2", darkGray: "#3A3A3C", red: "#FF453A", green: "#30D158", amber: "#FF9F0A" };
const SPACING = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20 };
const FONT_SIZES = { xs: 11, sm: 13, md: 15, lg: 17, xl: 20 };

const DEFAULT_RULES_SECTIONS = [
  { heading: "", body: "NO PURCHASE NECESSARY TO ENTER OR WIN. A purchase or payment of any kind will not increase your chances of winning. Void where prohibited by law." },
  { heading: "1. Eligibility", body: "Giveaways hosted on the Compete app are open to legal residents of the United States who are 18 years of age or older at the time of entry. Employees, officers, and directors of Compete and its affiliates, and their immediate family members, are not eligible to participate. Void where prohibited or restricted by law." },
  { heading: "2. How to Enter", body: "No purchase necessary. To enter a giveaway, you must have a registered Compete account in good standing. Complete the entry form with your full legal name (as it appears on your government-issued ID), date of birth, email address, and phone number. All information must be accurate and truthful. Limit one (1) entry per person per giveaway. Multiple entries, duplicate accounts, or fraudulent information will result in disqualification." },
  { heading: "3. Entry Period", body: "Each giveaway has a specific start and end date displayed on the giveaway listing. Entries must be received before the posted end date and time. Late entries will not be accepted." },
  { heading: "4. Winner Selection", body: "Winners are selected at random from all eligible entries received during the entry period. The random drawing is conducted by Compete administrators. The odds of winning depend on the number of eligible entries received." },
  { heading: "5. Winner Notification", body: "The winner will be notified via the email address and/or phone number provided at the time of entry. The winner must respond within seven (7) days of notification to claim their prize. If the winner does not respond within the specified timeframe, the prize may be forfeited and an alternate winner may be selected." },
  { heading: "6. Prizes", body: "The prize for each giveaway is described on the giveaway listing page. Prize values are approximate. Prizes are non-transferable and cannot be exchanged for cash or other items. Compete reserves the right to substitute a prize of equal or greater value. Winners are solely responsible for any applicable taxes, fees, or other costs associated with the prize." },
  { heading: "7. Identity Verification", body: "Winners may be required to present a valid government-issued photo ID to verify their identity and age before receiving their prize. The name on the ID must match the name provided at the time of entry. Failure to verify identity may result in forfeiture of the prize." },
  { heading: "8. General Conditions", body: "By entering a giveaway, you agree to be bound by these Official Rules and the decisions of Compete, which are final and binding. Compete reserves the right to cancel, suspend, or modify any giveaway at any time for any reason." },
  { heading: "9. Privacy", body: "Information collected during giveaway entry is subject to the Compete Privacy Policy. Your information will be used for giveaway administration, winner notification, and prize fulfillment. Your information will not be sold to third parties." },
  { heading: "10. Governing Law", body: "These Official Rules are governed by the laws of the United States and the state in which Compete operates, without regard to conflict of law provisions." },
  { heading: "11. Apple Disclaimer", body: "This giveaway is in no way sponsored, endorsed, administered by, or associated with Apple Inc. or any of its subsidiaries or affiliates. Any questions, comments, or complaints regarding the giveaway should be directed to Compete, not Apple." },
];

const PRIVACY_SECTIONS = [
  { heading: "What We Collect", body: "When you enter a giveaway on Compete, we collect the personal information you provide in the entry form: your full legal name, date of birth, email address, and phone number." },
  { heading: "How We Use Your Information", body: "Your giveaway entry information is used solely for: verifying your eligibility, administering the giveaway drawing, contacting the winner, and fulfilling the prize." },
  { heading: "Information Sharing", body: "We do not sell, rent, or trade your personal information to third parties. Your giveaway entry data may be shared with prize sponsors solely for the purpose of prize fulfillment." },
  { heading: "Data Retention", body: "Giveaway entry data is retained for a reasonable period after the giveaway concludes. You may request deletion of your data by contacting support@thecompeteapp.com." },
  { heading: "Your Rights", body: "You have the right to access, correct, or delete your personal information at any time. Contact us at support@thecompeteapp.com." },
  { heading: "Security", body: "We implement reasonable technical and organizational measures to protect your personal information from unauthorized access, alteration, or destruction." },
];

function LegalViewerModal({ visible, title, sections, customRulesText, onClose }: { visible: boolean; title: string; sections: { heading: string; body: string }[]; customRulesText?: string | null; onClose: () => void }) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={legalStyles.mobileModalOuter}>
        <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} />
        <View style={legalStyles.mobileCard}>
          <View style={legalStyles.header}>
            <Pressable onPress={onClose} style={legalStyles.closeButton}><Ionicons name="close" size={24} color={COLORS.white} /></Pressable>
            <Text allowFontScaling={false} style={legalStyles.headerTitle}>{title}</Text>
            <View style={{ width: 40 }} />
          </View>
          <View style={legalStyles.divider} />
          <ScrollView style={legalStyles.scrollView} contentContainerStyle={legalStyles.scrollContent} showsVerticalScrollIndicator onScrollBeginDrag={Keyboard.dismiss}>
            {sections.map((section, index) => (
              <View key={index} style={legalStyles.section}>
                {section.heading ? <Text allowFontScaling={false} style={legalStyles.heading}>{section.heading}</Text> : null}
                <Text allowFontScaling={false} style={legalStyles.body}>{section.body}</Text>
              </View>
            ))}
            {customRulesText ? (
              <View style={legalStyles.customSection}>
                <Text allowFontScaling={false} style={legalStyles.customHeading}>Additional Rules</Text>
                <Text allowFontScaling={false} style={legalStyles.body}>{customRulesText}</Text>
              </View>
            ) : null}
          </ScrollView>
          <View style={legalStyles.bottomBar}>
            <Pressable style={legalStyles.acceptButton} onPress={onClose}>
              <Text allowFontScaling={false} style={legalStyles.acceptButtonText}>Accept & Close</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const legalStyles = StyleSheet.create({
  mobileModalOuter: { flex: 1, justifyContent: "center", alignItems: "center", padding: scale(24), backgroundColor: "rgba(0,0,0,0.7)" },
  mobileCard: { backgroundColor: "#0F1117", borderRadius: scale(20), width: "100%", maxWidth: 480, height: "82%" as any, borderWidth: 1, borderColor: COLORS.cardBorder, flexDirection: "column" as any },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: scale(SPACING.lg), paddingTop: scale(SPACING.lg), paddingBottom: scale(SPACING.md) },
  closeButton: { width: 40, height: 40, justifyContent: "center", alignItems: "center" },
  headerTitle: { color: COLORS.white, fontSize: moderateScale(FONT_SIZES.lg), fontWeight: "700" },
  divider: { height: 1, backgroundColor: COLORS.cardBorder },
  scrollView: { flex: 1 },
  scrollContent: { padding: scale(SPACING.xl), paddingBottom: scale(SPACING.lg) },
  section: { marginBottom: scale(20) },
  heading: { color: COLORS.blue, fontSize: moderateScale(16), fontWeight: "600", marginBottom: scale(8) },
  body: { color: "#D1D5DB", fontSize: moderateScale(14), lineHeight: moderateScale(22) },
  customSection: { marginTop: scale(8), marginBottom: scale(20), paddingTop: scale(16), borderTopWidth: 1, borderTopColor: COLORS.cardBorder },
  customHeading: { color: COLORS.amber, fontSize: moderateScale(16), fontWeight: "600", marginBottom: scale(8) },
  bottomBar: { padding: scale(SPACING.lg), paddingBottom: Platform.OS === "ios" ? 34 : scale(SPACING.lg), borderTopWidth: 1, borderTopColor: COLORS.cardBorder },
  acceptButton: { paddingVertical: scale(14), borderRadius: scale(10), backgroundColor: COLORS.blue, alignItems: "center", justifyContent: "center" },
  acceptButtonText: { color: COLORS.white, fontSize: moderateScale(16), fontWeight: "600" },
});

interface Props {
  visible: boolean;
  giveaway: Giveaway | null;
  onClose: () => void;
  onSuccess: (giveawayId: number) => void;
}

export function GiveawayEntryModal({ visible, giveaway, onClose, onSuccess }: Props) {
  const vm = useGiveawayEntry({
    giveawayId: giveaway?.id ?? null,
    minAge: giveaway?.min_age ?? 18,
    onSuccess: () => { if (giveaway) onSuccess(giveaway.id); },
  });

  const [showRulesModal, setShowRulesModal] = React.useState(false);
  const [showPrivacyModal, setShowPrivacyModal] = React.useState(false);

  const handleSubmit = async () => {
    const success = await vm.submitEntry();
    if (success) { vm.resetForm(); onClose(); }
  };

  const handleClose = () => { onClose(); vm.resetForm(); };
  const handleRulesLinkPress = () => { Keyboard.dismiss(); setShowRulesModal(true); };
  const handlePrivacyLinkPress = () => { Keyboard.dismiss(); setShowPrivacyModal(true); };
  const handleRulesModalClose = () => { setShowRulesModal(false); if (!vm.form.agreed_to_rules) vm.toggleCheckbox("agreed_to_rules"); };

  if (!visible) return null;

  if (vm.mode === "loading") {
    return renderShell(
      <>
        <View style={styles.header}>
          <Pressable onPress={handleClose} style={styles.closeButton}><Ionicons name="close" size={24} color={COLORS.white} /></Pressable>
          <Text allowFontScaling={false} style={styles.headerTitle}>Enter Giveaway</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.divider} />
        <View style={styles.centeredLoader}><ActivityIndicator color={COLORS.blue} /></View>
      </>,
      handleClose, isWeb
    );
  }

  const checkboxes = (
    <View style={styles.checkboxSection}>
      <CheckboxRowWithLink prefix="I agree to the " linkText="official rules" checked={vm.form.agreed_to_rules} onToggle={() => vm.toggleCheckbox("agreed_to_rules")} onLinkPress={handleRulesLinkPress} />
      <CheckboxRowWithLink prefix="I agree to the " linkText="privacy policy" checked={vm.form.agreed_to_privacy} onToggle={() => vm.toggleCheckbox("agreed_to_privacy")} onLinkPress={handlePrivacyLinkPress} />
      <CheckboxRow label="I understand this is one entry per person" checked={vm.form.understood_one_entry} onToggle={() => vm.toggleCheckbox("understood_one_entry")} />
      <CheckboxRow label="I confirm I am 18+ years old and meet eligibility requirements" checked={vm.form.confirmed_age} onToggle={() => vm.toggleCheckbox("confirmed_age")} />
    </View>
  );

  const legalModals = (
    <>
      <LegalViewerModal visible={showRulesModal} title="Official Giveaway Rules" sections={DEFAULT_RULES_SECTIONS} customRulesText={giveaway?.rules_text} onClose={handleRulesModalClose} />
      <LegalViewerModal visible={showPrivacyModal} title="Giveaway Privacy Policy" sections={PRIVACY_SECTIONS} onClose={() => setShowPrivacyModal(false)} />
    </>
  );

  if (vm.mode === "quick-confirm") {
    return renderShell(
      <>
        <View style={styles.header}>
          <Pressable onPress={handleClose} style={styles.closeButton}><Ionicons name="close" size={24} color={COLORS.white} /></Pressable>
          <Text allowFontScaling={false} style={styles.headerTitle}>Enter Giveaway</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.divider} />
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <Text allowFontScaling={false} style={styles.giveawayName}>{giveaway?.name}</Text>
          <View style={styles.identityCard}>
            <Ionicons name="person-circle" size={36} color={COLORS.blue} />
            <View style={styles.identityInfo}>
              <Text allowFontScaling={false} style={styles.identityName}>{vm.savedInfo?.name_as_on_id ?? ""}</Text>
              <Text allowFontScaling={false} style={styles.identityDetail}>{vm.savedInfo?.email ?? ""}</Text>
              <Text allowFontScaling={false} style={styles.identityDetail}>{vm.savedInfo?.phone ?? ""}</Text>
            </View>
            <TouchableOpacity onPress={vm.startEdit} style={styles.editChip}>
              <Text allowFontScaling={false} style={styles.editChipText}>Edit</Text>
            </TouchableOpacity>
          </View>
          <Text allowFontScaling={false} style={styles.savedDisclosure}>Your saved information will be used for this entry.</Text>
          {checkboxes}
          {vm.errors.checkboxes && <Text allowFontScaling={false} style={styles.errorField}>{vm.errors.checkboxes}</Text>}
          {vm.submitError && <Text allowFontScaling={false} style={styles.errorText}>{vm.submitError}</Text>}
        </ScrollView>
        <View style={styles.bottomBar}>
          <Pressable style={[styles.submitButton, (!vm.isFormComplete || vm.isSubmitting) && styles.submitButtonDisabled]} onPress={handleSubmit} disabled={!vm.isFormComplete || vm.isSubmitting}>
            <Text allowFontScaling={false} style={styles.submitButtonText}>{vm.isSubmitting ? "Submitting..." : "Enter Giveaway"}</Text>
          </Pressable>
          <Pressable style={styles.cancelButton} onPress={handleClose}>
            <Text allowFontScaling={false} style={styles.cancelButtonText}>Cancel</Text>
          </Pressable>
        </View>
        {legalModals}
      </>,
      handleClose, isWeb
    );
  }

  return renderShell(
    <>
      <View style={styles.header}>
        <Pressable onPress={handleClose} style={styles.closeButton}><Ionicons name="close" size={24} color={COLORS.white} /></Pressable>
        <Text allowFontScaling={false} style={styles.headerTitle}>{vm.mode === "edit" ? "Update Your Info" : "Enter Giveaway"}</Text>
        <View style={{ width: 40 }} />
      </View>
      <View style={styles.divider} />
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} scrollEventThrottle={16} onScrollBeginDrag={Keyboard.dismiss}>
        <Text allowFontScaling={false} style={styles.giveawayName}>{giveaway?.name}</Text>
        {vm.mode === "full-form" && (
          <View style={styles.disclosureBanner}>
            <Ionicons name="information-circle-outline" size={14} color={COLORS.gray} />
            <Text allowFontScaling={false} style={styles.disclosureText}>Your information will be saved for faster entry in future giveaways. It will only be used for giveaway entry purposes.</Text>
          </View>
        )}
        <Text allowFontScaling={false} style={styles.label}>Full Name (as on ID) *</Text>
        <TextInput allowFontScaling={false} style={styles.input} placeholder="Enter your full legal name" placeholderTextColor={COLORS.gray} value={vm.form.name_as_on_id} onChangeText={(text) => vm.updateField("name_as_on_id", text)} autoCapitalize="words" />
        {vm.errors.name_as_on_id && <Text allowFontScaling={false} style={styles.errorField}>{vm.errors.name_as_on_id}</Text>}
        <Text allowFontScaling={false} style={styles.label}>Date of Birth *</Text>
        <View style={styles.birthdayRow}>
          <Dropdown options={vm.monthOptions} value={vm.form.birthday.month} onSelect={(val) => vm.updateBirthday("month", val)} placeholder="Month" flex={2} />
          <Dropdown options={vm.dayOptions} value={vm.form.birthday.day} onSelect={(val) => vm.updateBirthday("day", val)} placeholder="Day" flex={1} />
          <Dropdown options={vm.yearOptions} value={vm.form.birthday.year} onSelect={(val) => vm.updateBirthday("year", val)} placeholder="Year" flex={1} />
        </View>
        {vm.errors.birthday && <Text allowFontScaling={false} style={styles.errorField}>{vm.errors.birthday}</Text>}
        <Text allowFontScaling={false} style={styles.label}>Email Address *</Text>
        <TextInput allowFontScaling={false} style={styles.input} placeholder="Enter your email" placeholderTextColor={COLORS.gray} value={vm.form.email} onChangeText={(text) => vm.updateField("email", text)} keyboardType="email-address" autoCapitalize="none" />
        {vm.errors.email && <Text allowFontScaling={false} style={styles.errorField}>{vm.errors.email}</Text>}
        <Text allowFontScaling={false} style={styles.label}>Phone Number *</Text>
        <TextInput allowFontScaling={false} style={styles.input} placeholder="Enter your phone number" placeholderTextColor={COLORS.gray} value={vm.form.phone} onChangeText={(text) => vm.updateField("phone", text)} keyboardType="phone-pad" />
        {vm.errors.phone && <Text allowFontScaling={false} style={styles.errorField}>{vm.errors.phone}</Text>}
        {checkboxes}
        {vm.errors.checkboxes && <Text allowFontScaling={false} style={styles.errorField}>{vm.errors.checkboxes}</Text>}
        {vm.submitError && <Text allowFontScaling={false} style={styles.errorText}>{vm.submitError}</Text>}
      </ScrollView>
      <View style={styles.bottomBar}>
        <Pressable style={[styles.submitButton, (!vm.isFormComplete || vm.isSubmitting) && styles.submitButtonDisabled]} onPress={handleSubmit} disabled={!vm.isFormComplete || vm.isSubmitting}>
          <Text allowFontScaling={false} style={styles.submitButtonText}>{vm.isSubmitting ? "Submitting..." : vm.mode === "edit" ? "Save & Enter Giveaway" : "Enter Giveaway"}</Text>
        </Pressable>
        <Pressable style={styles.cancelButton} onPress={handleClose}>
          <Text allowFontScaling={false} style={styles.cancelButtonText}>Cancel</Text>
        </Pressable>
      </View>
      {legalModals}
    </>,
    handleClose, isWeb
  );
}

function renderShell(content: React.ReactNode, onClose: () => void, web: boolean) {
  if (web) {
    return (
      <>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
        <View style={styles.dialogWrap} pointerEvents="box-none"><View style={styles.dialog}>{content}</View></View>
      </>
    );
  }
  return (
    <Modal visible animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.mobileModalOuter}>
        <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} />
        <View style={styles.mobileCard} onStartShouldSetResponder={() => true}>
          {content}
        </View>
      </View>
    </Modal>
  );
}

function Dropdown({ options, value, onSelect, placeholder, flex = 1 }: { options: { label: string; value: string }[]; value: string; onSelect: (value: string) => void; placeholder: string; flex?: number }) {
  const [open, setOpen] = React.useState(false);
  const selectedLabel = options.find((o) => o.value === value)?.label || placeholder;
  if (isWeb) {
    return (
      <View style={{ flex }}>
        <select value={value} onChange={(e) => onSelect(e.target.value)} style={{ flex: 1, backgroundColor: COLORS.card, color: value ? COLORS.white : COLORS.gray, fontSize: 15, borderRadius: 10, borderWidth: 1, borderColor: COLORS.cardBorder, padding: "12px 14px", width: "100%", appearance: "auto", cursor: "pointer", outline: "none" } as any}>
          <option value="" disabled style={{ color: COLORS.gray }}>{placeholder}</option>
          {options.filter((o) => o.value !== "").map((option) => (
            <option key={option.value} value={option.value} style={{ color: COLORS.white, backgroundColor: COLORS.card }}>{option.label}</option>
          ))}
        </select>
      </View>
    );
  }
  return (
    <View style={{ flex }}>
      <Pressable style={styles.dropdownButton} onPress={() => { Keyboard.dismiss(); setOpen(!open); }}>
        <Text allowFontScaling={false} style={[styles.dropdownText, !value && styles.dropdownPlaceholder]} numberOfLines={1}>{selectedLabel}</Text>
        <Ionicons name={open ? "chevron-up" : "chevron-down"} size={14} color={COLORS.gray} />
      </Pressable>
      {open && (
        <Modal transparent animationType="fade">
          <Pressable style={styles.dropdownOverlay} onPress={() => setOpen(false)}>
            <View style={styles.dropdownList}>
              <ScrollView style={{ maxHeight: 250 }} showsVerticalScrollIndicator>
                {options.filter((o) => o.value !== "").map((option) => (
                  <Pressable key={option.value} style={[styles.dropdownOption, option.value === value && styles.dropdownOptionActive]} onPress={() => { onSelect(option.value); setOpen(false); }}>
                    <Text allowFontScaling={false} style={[styles.dropdownOptionText, option.value === value && styles.dropdownOptionTextActive]}>{option.label}</Text>
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

function CheckboxRow({ label, checked, onToggle }: { label: string; checked: boolean; onToggle: () => void }) {
  return (
    <Pressable style={styles.checkboxRow} onPress={() => { Keyboard.dismiss(); onToggle(); }}>
      <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
        {checked && <Ionicons name="checkmark" size={14} color={COLORS.white} />}
      </View>
      <Text allowFontScaling={false} style={styles.checkboxLabel}>{label}</Text>
    </Pressable>
  );
}

function CheckboxRowWithLink({ prefix, linkText, checked, onToggle, onLinkPress }: { prefix: string; linkText: string; checked: boolean; onToggle: () => void; onLinkPress: () => void }) {
  return (
    <View style={styles.checkboxRow}>
      <Pressable onPress={() => { Keyboard.dismiss(); onToggle(); }}>
        <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
          {checked && <Ionicons name="checkmark" size={14} color={COLORS.white} />}
        </View>
      </Pressable>
      <View style={styles.checkboxLabelRow}>
        <Text allowFontScaling={false} style={styles.checkboxLabel}>{prefix}</Text>
        <Pressable onPress={() => { Keyboard.dismiss(); onLinkPress(); }} hitSlop={{ top: 10, bottom: 10, left: 4, right: 10 }}>
          <Text allowFontScaling={false} style={styles.linkText}>{linkText}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { position: "fixed" as any, top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.75)", zIndex: 2000 },
  dialogWrap: { position: "fixed" as any, top: 0, left: 0, right: 0, bottom: 0, zIndex: 2001, alignItems: "center", justifyContent: "center", padding: 24 },
  dialog: { width: 640, maxWidth: "92%" as any, maxHeight: "90vh" as any, backgroundColor: COLORS.background, borderRadius: RADIUS.xl, borderWidth: 1, borderColor: COLORS.cardBorder, overflow: "hidden" as any, shadowColor: "#000", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.5, shadowRadius: 24 },
  mobileModalOuter: { flex: 1, justifyContent: "center", alignItems: "center", padding: scale(20), backgroundColor: "rgba(0,0,0,0.6)" },
  mobileCard: { width: "100%", maxWidth: 480, height: "78%" as any, backgroundColor: COLORS.background, borderRadius: scale(20), borderWidth: 1, borderColor: COLORS.cardBorder, overflow: "hidden", shadowColor: "#000", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.5, shadowRadius: 24 },
  centeredLoader: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: scale(SPACING.lg), paddingTop: scale(SPACING.lg), paddingBottom: scale(SPACING.md) },
  closeButton: { width: 40, height: 40, justifyContent: "center", alignItems: "center" },
  headerTitle: { color: COLORS.white, fontSize: moderateScale(FONT_SIZES.lg), fontWeight: "700" },
  divider: { height: 1, backgroundColor: COLORS.cardBorder },
  scrollView: { flex: 1 },
  scrollContent: { padding: scale(SPACING.xl), paddingBottom: scale(SPACING.lg), flexGrow: 1 },
  giveawayName: { color: COLORS.blue, fontSize: moderateScale(FONT_SIZES.lg), fontWeight: "600", textAlign: "center", marginBottom: scale(SPACING.xl) },
  identityCard: { flexDirection: "row", alignItems: "center", backgroundColor: COLORS.card, borderRadius: scale(12), padding: scale(SPACING.lg), marginBottom: scale(SPACING.md), borderWidth: 1, borderColor: COLORS.cardBorder, gap: scale(SPACING.md) },
  identityInfo: { flex: 1 },
  identityName: { color: COLORS.white, fontSize: moderateScale(FONT_SIZES.md), fontWeight: "600", marginBottom: 2 },
  identityDetail: { color: COLORS.gray, fontSize: moderateScale(FONT_SIZES.sm), marginTop: 1 },
  editChip: { paddingHorizontal: scale(SPACING.md), paddingVertical: scale(SPACING.sm), borderRadius: scale(8), borderWidth: 1, borderColor: COLORS.blue },
  editChipText: { color: COLORS.blue, fontSize: moderateScale(FONT_SIZES.sm), fontWeight: "600" },
  savedDisclosure: { color: COLORS.gray, fontSize: moderateScale(FONT_SIZES.xs), textAlign: "center", marginBottom: scale(SPACING.lg) },
  disclosureBanner: { flexDirection: "row", alignItems: "flex-start", gap: scale(SPACING.sm), backgroundColor: COLORS.card, borderRadius: scale(8), padding: scale(SPACING.md), marginBottom: scale(SPACING.lg), borderWidth: 1, borderColor: COLORS.cardBorder },
  disclosureText: { flex: 1, color: COLORS.gray, fontSize: moderateScale(FONT_SIZES.xs), lineHeight: moderateScale(16) },
  label: { color: COLORS.white, fontSize: moderateScale(FONT_SIZES.md), fontWeight: "600", marginBottom: scale(SPACING.sm), marginTop: scale(SPACING.lg) },
  input: { backgroundColor: COLORS.card, borderRadius: scale(10), padding: scale(SPACING.lg), color: COLORS.white, fontSize: moderateScale(FONT_SIZES.md), borderWidth: 1, borderColor: COLORS.cardBorder },
  birthdayRow: { flexDirection: "row", gap: scale(SPACING.sm) },
  dropdownButton: { backgroundColor: COLORS.card, borderRadius: scale(10), padding: scale(SPACING.lg), borderWidth: 1, borderColor: COLORS.cardBorder, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  dropdownText: { color: COLORS.white, fontSize: moderateScale(FONT_SIZES.sm), flex: 1 },
  dropdownPlaceholder: { color: COLORS.gray },
  dropdownOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center" },
  dropdownList: { backgroundColor: COLORS.card, borderRadius: scale(12), width: "80%", maxHeight: 300, borderWidth: 1, borderColor: COLORS.cardBorder, overflow: "hidden" },
  dropdownOption: { paddingVertical: scale(SPACING.md), paddingHorizontal: scale(SPACING.lg), borderBottomWidth: 1, borderBottomColor: COLORS.cardBorder },
  dropdownOptionActive: { backgroundColor: COLORS.blue },
  dropdownOptionText: { color: COLORS.white, fontSize: moderateScale(FONT_SIZES.md) },
  dropdownOptionTextActive: { fontWeight: "700" },
  checkboxSection: { marginTop: scale(SPACING.xl), gap: scale(SPACING.md) },
  checkboxRow: { flexDirection: "row", alignItems: "center", gap: scale(SPACING.md) },
  checkboxLabelRow: { flex: 1, flexDirection: "row", flexWrap: "wrap", alignItems: "center" },
  checkbox: { width: scale(24), height: scale(24), borderRadius: scale(6), borderWidth: 2, borderColor: COLORS.gray, justifyContent: "center", alignItems: "center" },
  checkboxChecked: { backgroundColor: COLORS.blue, borderColor: COLORS.blue },
  checkboxLabel: { color: COLORS.lightGray, fontSize: moderateScale(FONT_SIZES.sm) },
  linkText: { color: COLORS.blue, textDecorationLine: "underline", fontSize: moderateScale(FONT_SIZES.sm) },
  errorField: { color: COLORS.red, fontSize: moderateScale(FONT_SIZES.xs), marginTop: scale(SPACING.xs) },
  errorText: { color: COLORS.red, fontSize: moderateScale(FONT_SIZES.sm), marginTop: scale(SPACING.md), textAlign: "center" },
  bottomBar: { flexDirection: "row", padding: scale(SPACING.lg), gap: scale(SPACING.md), borderTopWidth: 1, borderTopColor: COLORS.cardBorder, paddingBottom: Platform.OS === "ios" ? 34 : scale(SPACING.lg) },
  submitButton: { flex: 1, backgroundColor: COLORS.blue, borderRadius: scale(12), paddingVertical: scale(SPACING.lg), alignItems: "center" },
  submitButtonDisabled: { opacity: 0.5 },
  submitButtonText: { color: COLORS.white, fontSize: moderateScale(FONT_SIZES.md), fontWeight: "700" },
  cancelButton: { flex: 1, backgroundColor: COLORS.card, borderRadius: scale(12), paddingVertical: scale(SPACING.lg), alignItems: "center", borderWidth: 1, borderColor: COLORS.cardBorder },
  cancelButtonText: { color: COLORS.white, fontSize: moderateScale(FONT_SIZES.md), fontWeight: "600" },
});




