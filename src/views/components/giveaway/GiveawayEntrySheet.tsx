import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { COLORS } from "@/src/theme/colors";
import { FONT_SIZES, RADIUS, SPACING } from "@/src/theme/spacing";
import { Giveaway, GiveawayEntryForm, GiveawaySavedInfo } from "@/src/models/types/giveaway.types";
import { moderateScale, scale } from "@/src/utils/scaling";
import { useGiveawayEntry } from "@/src/viewmodels/useGiveawayEntry";

interface GiveawayEntrySheetProps {
  visible: boolean; onClose: () => void; onSuccess: () => void; giveaway: Giveaway;
}

export function GiveawayEntrySheet({ visible, onClose, onSuccess, giveaway }: GiveawayEntrySheetProps) {
  const { mode, form, savedInfo, submitting, error, updateField, updateBirthday, submit, startEdit, reset } = useGiveawayEntry({
    giveawayId: giveaway.id, minAge: giveaway.min_age ?? 18, onSuccess: () => { onSuccess(); onClose(); },
  });
  const handleClose = () => { reset(); onClose(); };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <SafeAreaView style={styles.container}>
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <View style={styles.header}>
            <TouchableOpacity onPress={handleClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close" size={24} color={COLORS.text} />
            </TouchableOpacity>
            <Text allowFontScaling={false} style={styles.headerTitle} numberOfLines={1}>{giveaway.name}</Text>
            <View style={styles.headerSpacer} />
          </View>
          {mode === "loading" && <View style={styles.centered}><ActivityIndicator color={COLORS.primary} /></View>}
          {mode === "quick-confirm" && (
            <QuickConfirmView savedInfo={savedInfo} form={form} submitting={submitting} error={error} onEditInfo={startEdit}
              onToggleRules={(v) => updateField("agreed_to_rules", v)} onToggleEligibility={(v) => updateField("confirmed_age", v)}
              onTogglePrivacy={(v) => updateField("agreed_to_privacy", v)} onTogglePromo={(v) => updateField("opted_in_promotions", v)} onSubmit={submit} />
          )}
          {(mode === "full-form" || mode === "edit") && (
            <FullFormView form={form} submitting={submitting} error={error} isEdit={mode === "edit"} onUpdateField={updateField} onUpdateBirthday={updateBirthday} onSubmit={submit} />
          )}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

interface QuickConfirmViewProps {
  savedInfo: GiveawaySavedInfo | null; form: GiveawayEntryForm; submitting: boolean; error: string | null;
  onEditInfo: () => void; onToggleRules: (v: boolean) => void; onToggleEligibility: (v: boolean) => void;
  onTogglePrivacy: (v: boolean) => void; onTogglePromo: (v: boolean) => void; onSubmit: () => void;
}

function QuickConfirmView({ savedInfo, form, submitting, error, onEditInfo, onToggleRules, onToggleEligibility, onTogglePrivacy, onTogglePromo, onSubmit }: QuickConfirmViewProps) {
  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
      <View style={styles.identityCard}>
        <Ionicons name="person-circle" size={40} color={COLORS.primary} style={styles.identityIcon} />
        <View style={styles.identityInfo}>
          <Text allowFontScaling={false} style={styles.identityName}>{savedInfo?.name_as_on_id ?? ""}</Text>
          <Text allowFontScaling={false} style={styles.identityDetail}>{savedInfo?.email ?? ""}</Text>
          <Text allowFontScaling={false} style={styles.identityDetail}>{savedInfo?.phone ?? ""}</Text>
        </View>
        <TouchableOpacity onPress={onEditInfo} style={styles.editChip}>
          <Text allowFontScaling={false} style={styles.editChipText}>Edit</Text>
        </TouchableOpacity>
      </View>
      <Text allowFontScaling={false} style={styles.sectionLabel}>Required confirmations</Text>
      <CheckRow checked={form.agreed_to_rules} onToggle={onToggleRules} label="I agree to the giveaway rules and terms" />
      <CheckRow checked={form.confirmed_age} onToggle={onToggleEligibility} label="I confirm I meet the eligibility requirements" />
      <CheckRow checked={form.agreed_to_privacy} onToggle={onTogglePrivacy} label="I agree to the privacy policy" />
      <CheckRow checked={form.opted_in_promotions} onToggle={onTogglePromo} label="Send me updates about future giveaways" optional />
      {!!error && <Text allowFontScaling={false} style={styles.errorText}>{error}</Text>}
      <TouchableOpacity style={[styles.submitButton, submitting && styles.submitButtonDisabled]} onPress={onSubmit} disabled={submitting}>
        {submitting ? <ActivityIndicator color={COLORS.white} size="small" /> : <Text allowFontScaling={false} style={styles.submitButtonText}>Enter Giveaway</Text>}
      </TouchableOpacity>
    </ScrollView>
  );
}

interface FullFormViewProps {
  form: GiveawayEntryForm; submitting: boolean; error: string | null; isEdit: boolean;
  onUpdateField: <K extends keyof GiveawayEntryForm>(key: K, value: GiveawayEntryForm[K]) => void;
  onUpdateBirthday: (field: "month" | "day" | "year", value: string) => void; onSubmit: () => void;
}

function FullFormView({ form, submitting, error, isEdit, onUpdateField, onUpdateBirthday, onSubmit }: FullFormViewProps) {
  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
      {isEdit && (
        <View style={styles.editBanner}>
          <Ionicons name="pencil-outline" size={14} color={COLORS.primary} />
          <Text allowFontScaling={false} style={styles.editBannerText}>Updating your saved entry info</Text>
        </View>
      )}
      <Text allowFontScaling={false} style={styles.sectionLabel}>Your information</Text>
      <View style={styles.fieldGroup}>
        <Text allowFontScaling={false} style={styles.fieldLabel}>Full name (as on ID)</Text>
        <TextInput allowFontScaling={false} style={styles.input} value={form.name_as_on_id} onChangeText={(v) => onUpdateField("name_as_on_id", v)} placeholder="First and last name" placeholderTextColor={COLORS.textMuted} autoCapitalize="words" />
      </View>
      <View style={styles.fieldGroup}>
        <Text allowFontScaling={false} style={styles.fieldLabel}>Email</Text>
        <TextInput allowFontScaling={false} style={styles.input} value={form.email} onChangeText={(v) => onUpdateField("email", v)} placeholder="your@email.com" placeholderTextColor={COLORS.textMuted} keyboardType="email-address" autoCapitalize="none" />
      </View>
      <View style={styles.fieldGroup}>
        <Text allowFontScaling={false} style={styles.fieldLabel}>Phone number</Text>
        <TextInput allowFontScaling={false} style={styles.input} value={form.phone} onChangeText={(v) => onUpdateField("phone", v)} placeholder="(555) 000-0000" placeholderTextColor={COLORS.textMuted} keyboardType="phone-pad" />
      </View>
      <View style={styles.fieldGroup}>
        <Text allowFontScaling={false} style={styles.fieldLabel}>Date of birth</Text>
        <View style={styles.dobRow}>
          <TextInput allowFontScaling={false} style={[styles.input, styles.dobShort]} value={form.birthday.month} onChangeText={(v) => onUpdateBirthday("month", v)} placeholder="MM" placeholderTextColor={COLORS.textMuted} keyboardType="numeric" maxLength={2} textAlign="center" />
          <TextInput allowFontScaling={false} style={[styles.input, styles.dobShort]} value={form.birthday.day} onChangeText={(v) => onUpdateBirthday("day", v)} placeholder="DD" placeholderTextColor={COLORS.textMuted} keyboardType="numeric" maxLength={2} textAlign="center" />
          <TextInput allowFontScaling={false} style={[styles.input, styles.dobYear]} value={form.birthday.year} onChangeText={(v) => onUpdateBirthday("year", v)} placeholder="YYYY" placeholderTextColor={COLORS.textMuted} keyboardType="numeric" maxLength={4} textAlign="center" />
        </View>
      </View>
      <View style={styles.disclosureBanner}>
        <Ionicons name="information-circle-outline" size={15} color={COLORS.textSecondary} style={styles.disclosureIcon} />
        <Text allowFontScaling={false} style={styles.disclosureText}>Your information will be saved for faster entry in future giveaways. It will only be used for giveaway entry purposes.</Text>
      </View>
      <Text allowFontScaling={false} style={[styles.sectionLabel, styles.agreementsLabel]}>Required confirmations</Text>
      <CheckRow checked={form.agreed_to_rules} onToggle={(v) => onUpdateField("agreed_to_rules", v)} label="I agree to the giveaway rules and terms" />
      <CheckRow checked={form.confirmed_age} onToggle={(v) => onUpdateField("confirmed_age", v)} label="I confirm I meet the eligibility requirements" />
      <CheckRow checked={form.agreed_to_privacy} onToggle={(v) => onUpdateField("agreed_to_privacy", v)} label="I agree to the privacy policy" />
      <CheckRow checked={form.opted_in_promotions} onToggle={(v) => onUpdateField("opted_in_promotions", v)} label="Send me updates about future giveaways" optional />
      {!!error && <Text allowFontScaling={false} style={styles.errorText}>{error}</Text>}
      <TouchableOpacity style={[styles.submitButton, submitting && styles.submitButtonDisabled]} onPress={onSubmit} disabled={submitting}>
        {submitting ? <ActivityIndicator color={COLORS.white} size="small" /> : <Text allowFontScaling={false} style={styles.submitButtonText}>{isEdit ? "Save & Enter Giveaway" : "Enter Giveaway"}</Text>}
      </TouchableOpacity>
      <View style={styles.bottomPad} />
    </ScrollView>
  );
}

interface CheckRowProps { checked: boolean; onToggle: (v: boolean) => void; label: string; optional?: boolean; }

function CheckRow({ checked, onToggle, label, optional }: CheckRowProps) {
  return (
    <TouchableOpacity style={styles.checkRow} onPress={() => onToggle(!checked)} activeOpacity={0.7}>
      <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
        {checked && <Ionicons name="checkmark" size={13} color={COLORS.white} />}
      </View>
      <Text allowFontScaling={false} style={styles.checkLabel}>
        {label}{optional && <Text style={styles.optionalTag}> — optional</Text>}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  flex: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: scale(SPACING.md), paddingVertical: scale(SPACING.md), borderBottomWidth: 1, borderBottomColor: COLORS.border },
  headerTitle: { flex: 1, fontSize: moderateScale(FONT_SIZES.lg), fontWeight: "600", color: COLORS.text, textAlign: "center", marginHorizontal: scale(SPACING.sm) },
  headerSpacer: { width: 24 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  scroll: { flex: 1 },
  scrollContent: { padding: scale(SPACING.md) },
  identityCard: { flexDirection: "row", alignItems: "center", backgroundColor: COLORS.backgroundCard, borderRadius: RADIUS.lg, padding: scale(SPACING.md), marginBottom: scale(SPACING.lg), borderWidth: 1, borderColor: COLORS.border },
  identityIcon: { marginRight: scale(SPACING.sm) },
  identityInfo: { flex: 1 },
  identityName: { fontSize: moderateScale(FONT_SIZES.md), fontWeight: "600", color: COLORS.text, marginBottom: 2 },
  identityDetail: { fontSize: moderateScale(FONT_SIZES.sm), color: COLORS.textSecondary, marginTop: 1 },
  editChip: { paddingHorizontal: scale(SPACING.sm), paddingVertical: scale(SPACING.xs), borderRadius: RADIUS.sm, borderWidth: 1, borderColor: COLORS.primary },
  editChipText: { fontSize: moderateScale(FONT_SIZES.sm), color: COLORS.primary, fontWeight: "600" },
  editBanner: { flexDirection: "row", alignItems: "center", gap: scale(SPACING.xs), backgroundColor: COLORS.surface, borderRadius: RADIUS.sm, padding: scale(SPACING.sm), marginBottom: scale(SPACING.md), borderWidth: 1, borderColor: COLORS.border },
  editBannerText: { fontSize: moderateScale(FONT_SIZES.sm), color: COLORS.primary },
  sectionLabel: { fontSize: moderateScale(FONT_SIZES.xs), fontWeight: "600", color: COLORS.textSecondary, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: scale(SPACING.sm) },
  agreementsLabel: { marginTop: scale(SPACING.md) },
  fieldGroup: { marginBottom: scale(SPACING.md) },
  fieldLabel: { fontSize: moderateScale(FONT_SIZES.sm), fontWeight: "600", color: COLORS.text, marginBottom: scale(SPACING.xs) },
  input: { backgroundColor: COLORS.surfaceLight, borderWidth: 1, borderColor: COLORS.borderLight, borderRadius: RADIUS.sm, paddingHorizontal: scale(SPACING.sm), paddingVertical: scale(SPACING.sm), fontSize: moderateScale(FONT_SIZES.md), color: COLORS.text },
  dobRow: { flexDirection: "row", gap: scale(SPACING.sm) },
  dobShort: { flex: 1 },
  dobYear: { flex: 1.6 },
  disclosureBanner: { flexDirection: "row", backgroundColor: COLORS.surface, borderRadius: RADIUS.sm, padding: scale(SPACING.sm), marginBottom: scale(SPACING.xs) },
  disclosureIcon: { marginRight: scale(SPACING.xs), marginTop: 1 },
  disclosureText: { flex: 1, fontSize: moderateScale(FONT_SIZES.xs), color: COLORS.textSecondary, lineHeight: moderateScale(16) },
  checkRow: { flexDirection: "row", alignItems: "flex-start", gap: scale(SPACING.sm), marginBottom: scale(SPACING.sm), paddingVertical: scale(SPACING.xs) },
  checkbox: { width: scale(22), height: scale(22), borderRadius: RADIUS.xs, borderWidth: 2, borderColor: COLORS.borderLight, alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 },
  checkboxChecked: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  checkLabel: { flex: 1, fontSize: moderateScale(FONT_SIZES.sm), color: COLORS.text, lineHeight: moderateScale(20) },
  optionalTag: { color: COLORS.textMuted },
  errorText: { fontSize: moderateScale(FONT_SIZES.sm), color: COLORS.error, marginBottom: scale(SPACING.md), textAlign: "center" },
  submitButton: { backgroundColor: COLORS.primary, borderRadius: RADIUS.sm, paddingVertical: scale(SPACING.md), alignItems: "center", justifyContent: "center", marginTop: scale(SPACING.md), minHeight: 52 },
  submitButtonDisabled: { backgroundColor: COLORS.textMuted },
  submitButtonText: { fontSize: moderateScale(FONT_SIZES.md), fontWeight: "600", color: COLORS.white },
  bottomPad: { height: scale(SPACING.xl) },
});
