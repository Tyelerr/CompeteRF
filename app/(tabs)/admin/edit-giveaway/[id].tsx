import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React from "react";
import {
  ActivityIndicator,
  Alert,
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
import { COLORS } from "../../../../src/theme/colors";
import { SPACING } from "../../../../src/theme/spacing";
import { FONT_SIZES } from "../../../../src/theme/typography";
import { EditGiveawayForm, useEditGiveaway } from "../../../../src/viewmodels/useEditGiveaway";
import { Dropdown } from "../../../../src/views/components/common/dropdown";

const isWeb = Platform.OS === "web";

// ─────────────────────────────────────────────────────────────────────────────
// Section wrapper — identical to create-giveaway
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
// LockedField wrapper — dims the field and shows a lock badge + hint
// ─────────────────────────────────────────────────────────────────────────────
function LockedField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <View style={lf.wrapper}>
      <View style={lf.labelRow}>
        <Text style={lf.label}>{label}</Text>
        <View style={lf.badge}>
          <Ionicons name="lock-closed" size={10} color="#FF9F0A" />
          <Text style={lf.badgeText}>Locked</Text>
        </View>
      </View>
      <View style={lf.fieldWrap} pointerEvents="none">
        {children}
      </View>
      <View style={lf.hintRow}>
        <Ionicons name="information-circle-outline" size={12} color="#FF9F0A" />
        <Text style={lf.hint}>Locked after entries begin</Text>
      </View>
    </View>
  );
}
const lf = StyleSheet.create({
  wrapper: { marginBottom: SPACING.lg },
  labelRow: { flexDirection: "row", alignItems: "center", marginBottom: SPACING.xs, gap: SPACING.sm },
  label: { fontSize: FONT_SIZES.md, fontWeight: "600", color: COLORS.text },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "#FF9F0A18",
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: "#FF9F0A45",
  },
  badgeText: { color: "#FF9F0A", fontSize: 10, fontWeight: "700" },
  fieldWrap: { opacity: 0.45 },
  hintRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: SPACING.xs },
  hint: { color: "#FF9F0A", fontSize: FONT_SIZES.xs, fontWeight: "500" },
});

// ─────────────────────────────────────────────────────────────────────────────
// Main screen
// ─────────────────────────────────────────────────────────────────────────────
export default function EditGiveawayScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const giveawayId = parseInt(id ?? "0", 10);

  const vm = useEditGiveaway(giveawayId);

  const handleSave = async () => {
    const ok = await vm.save();
    if (ok) {
      Alert.alert("Saved", "Giveaway updated successfully.", [
        { text: "OK", onPress: () => router.back() },
      ]);
    }
  };

  const handleBack = () => {
    if (vm.hasChanges) {
      Alert.alert(
        "Unsaved Changes",
        "You have unsaved changes. Discard them?",
        [
          { text: "Keep Editing", style: "cancel" },
          { text: "Discard", style: "destructive", onPress: () => router.back() },
        ],
      );
    } else {
      router.back();
    }
  };

  // ── Loading ───────────────────────────────────────────────────────────────
  if (vm.loading) {
    return (
      <View style={s.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={s.loadingText}>Loading giveaway...</Text>
      </View>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Render helpers — mirror create-giveaway patterns
  // ─────────────────────────────────────────────────────────────────────────
  const renderPrizeValue = () => {
    const inner = (
      <View style={s.currencyInputWrapper}>
        <Text style={s.currencySymbol}>$</Text>
        <TextInput
          style={[s.currencyInput, vm.isFieldLocked("prize_value") && s.inputLocked]}
          placeholder="500"
          placeholderTextColor={COLORS.textMuted}
          value={vm.form.prize_value}
          onChangeText={(t) => vm.updateField("prize_value", t.replace(/[^0-9.]/g, ""))}
          keyboardType="decimal-pad"
          editable={!vm.isFieldLocked("prize_value") && !vm.saving}
        />
      </View>
    );
    return vm.isFieldLocked("prize_value") ? (
      <LockedField label="ARV (Approximate Retail Value) *">{inner}</LockedField>
    ) : (
      <View style={s.fieldGroup}>
        <Text style={s.label}>ARV (Approximate Retail Value) <Text style={s.required}>*</Text></Text>
        {inner}
      </View>
    );
  };

  const renderEndType = () => {
    const inner = (
      <View style={s.endTypeRow}>
        {(["date", "entries", "both"] as const).map((type) => (
          <TouchableOpacity
            key={type}
            style={[s.endTypeButton, vm.form.end_type === type && s.endTypeButtonActive]}
            onPress={() => !vm.isFieldLocked("end_type") && vm.updateField("end_type", type)}
            disabled={vm.isFieldLocked("end_type")}
          >
            <Text style={[s.endTypeText, vm.form.end_type === type && s.endTypeTextActive]}>
              {type === "date" ? "📅 Date" : type === "entries" ? "👥 Entries" : "⚡ Both"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    );
    const hint = (
      <View style={s.endTypeHintBox}>
        <Text style={s.endTypeHint}>
          {vm.form.end_type === "date"    && "Closes on the specified date, regardless of entries."}
          {vm.form.end_type === "entries" && "Closes automatically when max entries is reached."}
          {vm.form.end_type === "both"    && "Closes when either condition is met first — whichever comes first."}
        </Text>
      </View>
    );
    return vm.isFieldLocked("end_type") ? (
      <LockedField label="End Giveaway By *">
        {inner}
        {hint}
      </LockedField>
    ) : (
      <View style={s.fieldGroup}>
        <Text style={s.label}>End Giveaway By <Text style={s.required}>*</Text></Text>
        {inner}
        {hint}
      </View>
    );
  };

  const renderMaxEntries = () => {
    const inner = (
      <TextInput
        style={[s.input, vm.isFieldLocked("max_entries") && s.inputLocked]}
        placeholder="500"
        placeholderTextColor={COLORS.textMuted}
        value={vm.form.max_entries}
        onChangeText={(t) => vm.updateField("max_entries", t.replace(/[^0-9]/g, ""))}
        keyboardType="number-pad"
        editable={!vm.isFieldLocked("max_entries") && !vm.saving}
      />
    );
    return vm.isFieldLocked("max_entries") ? (
      <LockedField label="Maximum Entries *">{inner}</LockedField>
    ) : (
      <View style={s.fieldGroup}>
        <Text style={s.label}>Maximum Entries <Text style={s.required}>*</Text></Text>
        {inner}
      </View>
    );
  };

  const renderEndDate = () => {
    const inner = (
      <View style={s.dateRow}>
        <View style={s.dateDropdown}>
          <Dropdown
            options={vm.monthOptions}
            value={vm.form.end_date.month}
            onSelect={(v) => vm.updateEndDate("month", v)}
            placeholder="Month"
            disabled={vm.isFieldLocked("end_date")}
          />
        </View>
        <View style={s.dateDropdownSmall}>
          <Dropdown
            options={vm.dayOptions}
            value={vm.form.end_date.day}
            onSelect={(v) => vm.updateEndDate("day", v)}
            placeholder="Day"
            disabled={vm.isFieldLocked("end_date")}
          />
        </View>
        <View style={s.dateDropdownSmall}>
          <Dropdown
            options={vm.yearOptions}
            value={vm.form.end_date.year}
            onSelect={(v) => vm.updateEndDate("year", v)}
            placeholder="Year"
            disabled={vm.isFieldLocked("end_date")}
          />
        </View>
      </View>
    );
    return vm.isFieldLocked("end_date") ? (
      <LockedField label="End Date *">{inner}</LockedField>
    ) : (
      <View style={s.fieldGroup}>
        <Text style={s.label}>End Date <Text style={s.required}>*</Text></Text>
        {inner}
      </View>
    );
  };

  // ── Main render ───────────────────────────────────────────────────────────
  return (
    <KeyboardAvoidingView
      style={s.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      {/* Header */}
      <View style={[s.header, isWeb && s.headerWeb]}>
        <TouchableOpacity style={s.backButton} onPress={handleBack}>
          <Text style={s.backText}>← Cancel</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>Edit Giveaway</Text>
        <View style={s.placeholder} />
      </View>

      {/* Entry lock notice */}
      {vm.hasEntries && (
        <View style={s.lockBanner}>
          <Ionicons name="lock-closed" size={14} color="#FF9F0A" />
          <Text style={s.lockBannerText}>
            {vm.entryCount} {vm.entryCount === 1 ? "entry" : "entries"} received
            — prize value, entry limits, and end conditions are locked
          </Text>
        </View>
      )}

      {vm.hasChanges && (
        <View style={s.unsavedBanner}>
          <Text style={s.unsavedText}>✏️  Unsaved changes</Text>
        </View>
      )}

      <ScrollView
        style={s.scrollView}
        contentContainerStyle={s.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Error */}
        {vm.error ? (
          <View style={s.errorBox}>
            <Text style={s.errorText}>{vm.error}</Text>
          </View>
        ) : null}

        {/* ── Section 1: Prize Info ─────────────────────────────────────── */}
        <Section title="Prize Info">
          {/* Image */}
          <View style={s.fieldGroup}>
            <Text style={s.label}>Prize Image</Text>
            {vm.form.image_url ? (
              <View style={s.imagePreviewContainer}>
                <Image source={{ uri: vm.form.image_url }} style={s.imagePreview} />
              </View>
            ) : (
              <View style={s.uploadButton}>
                <View style={s.uploadIconCircle}>
                  <Text style={s.uploadIcon}>🖼️</Text>
                </View>
                <Text style={s.uploadHint}>No image set</Text>
              </View>
            )}
            <TextInput
              style={[s.input, { marginTop: SPACING.sm }]}
              placeholder="Image URL (https://...)"
              placeholderTextColor={COLORS.textMuted}
              value={vm.form.image_url}
              onChangeText={(t) => vm.updateField("image_url", t)}
              autoCapitalize="none"
              keyboardType="url"
              editable={!vm.saving}
            />
          </View>

          {/* Name */}
          <View style={s.fieldGroup}>
            <Text style={s.label}>Prize Name <Text style={s.required}>*</Text></Text>
            <TextInput
              style={s.input}
              placeholder="e.g. iPad Pro, $500 Cash, HOW Glove"
              placeholderTextColor={COLORS.textMuted}
              value={vm.form.name}
              onChangeText={(t) => vm.updateField("name", t)}
              autoCapitalize="words"
              editable={!vm.saving}
            />
          </View>

          {/* Prize value — may be locked */}
          {renderPrizeValue()}

          {/* Description */}
          <View style={s.fieldGroup}>
            <Text style={s.label}>Description</Text>
            <TextInput
              style={[s.input, s.textArea]}
              placeholder="Describe the prize and what makes it special..."
              placeholderTextColor={COLORS.textMuted}
              value={vm.form.description}
              onChangeText={(t) => vm.updateField("description", t)}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
              editable={!vm.saving}
            />
          </View>
        </Section>

        {/* ── Section 2: Entry Rules ────────────────────────────────────── */}
        <Section title="Entry Rules">
          {renderEndType()}

          {(vm.form.end_type === "entries" || vm.form.end_type === "both") &&
            renderMaxEntries()}
        </Section>

        {/* ── Section 3: Timing ─────────────────────────────────────────── */}
        {(vm.form.end_type === "date" || vm.form.end_type === "both") && (
          <Section title="Timing">
            {renderEndDate()}
          </Section>
        )}

        {/* ── Section 4: Legal / Rules ──────────────────────────────────── */}
        <Section title="Legal / Rules">
          <View style={s.fieldGroup}>
            <Text style={s.label}>Age Requirement</Text>
            <View style={s.ageRequirementContainer}>
              <Text style={s.ageRequirementText}>🔒  18+ years old</Text>
              <Text style={s.ageRequirementSubtext}>Required by law</Text>
            </View>
          </View>

          <View style={s.fieldGroup}>
            <Text style={s.label}>Custom Rules Text</Text>
            <Text style={s.fieldHint}>
              Leave blank to use Compete's built-in Official Rules
            </Text>
            <TextInput
              style={[s.input, s.textAreaLarge]}
              placeholder="Enter full legal rules text here..."
              placeholderTextColor={COLORS.textMuted}
              value={vm.form.rules_text}
              onChangeText={(t) => vm.updateField("rules_text", t)}
              multiline
              numberOfLines={6}
              textAlignVertical="top"
              editable={!vm.saving}
            />
          </View>
        </Section>

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Bottom Buttons */}
      <View style={s.bottomButtons}>
        <TouchableOpacity
          style={s.cancelButton}
          onPress={handleBack}
          disabled={vm.saving}
        >
          <Text style={s.cancelButtonText}>Cancel</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            s.saveButton,
            (!vm.isValid || !vm.hasChanges || vm.saving) && s.buttonDisabled,
          ]}
          onPress={handleSave}
          disabled={!vm.isValid || !vm.hasChanges || vm.saving}
        >
          {vm.saving ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={s.saveButtonText}>💾  Save Changes</Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles — matched to create-giveaway.tsx
// ─────────────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container: {
    ...Platform.select({
      web: { maxWidth: 700, width: "100%" as any, alignSelf: "center" as any },
    }),
    flex: 1,
    backgroundColor: COLORS.background,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: COLORS.background,
    alignItems: "center",
    justifyContent: "center",
    gap: SPACING.md,
  },
  loadingText: { color: COLORS.textSecondary, fontSize: FONT_SIZES.md },

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

  lockBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    backgroundColor: "#FF9F0A18",
    borderBottomWidth: 1,
    borderBottomColor: "#FF9F0A40",
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
  },
  lockBannerText: { color: "#FF9F0A", fontSize: FONT_SIZES.sm, fontWeight: "500", flex: 1 },

  unsavedBanner: {
    backgroundColor: "#1A1600",
    borderBottomWidth: 1,
    borderBottomColor: "#3A3000",
    paddingVertical: SPACING.sm,
    alignItems: "center",
  },
  unsavedText: { color: "#FF9F0A", fontSize: FONT_SIZES.sm, fontWeight: "500" },

  scrollView: { flex: 1 },
  scrollContent: { padding: SPACING.md, paddingTop: SPACING.lg },

  errorBox: {
    backgroundColor: COLORS.error + "18",
    borderWidth: 1,
    borderColor: COLORS.error + "50",
    borderRadius: 10,
    padding: SPACING.md,
    marginBottom: SPACING.lg,
  },
  errorText: { color: COLORS.error, fontSize: FONT_SIZES.sm, textAlign: "center" },

  // Image
  uploadButton: {
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: COLORS.border,
    borderStyle: "dashed",
    paddingVertical: SPACING.xl,
    paddingHorizontal: SPACING.md,
    alignItems: "center",
    justifyContent: "center",
    gap: SPACING.xs,
    marginBottom: SPACING.sm,
  },
  uploadIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.surface,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: SPACING.xs,
  },
  uploadIcon: { fontSize: 24 },
  uploadHint: { fontSize: FONT_SIZES.sm, color: COLORS.textMuted },
  imagePreviewContainer: {
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: COLORS.primary + "50",
    marginBottom: SPACING.sm,
  },
  imagePreview: { width: "100%", height: 200, backgroundColor: COLORS.surface },

  // Fields
  fieldGroup: { marginBottom: SPACING.lg },
  label: { fontSize: FONT_SIZES.md, fontWeight: "600", color: COLORS.text, marginBottom: SPACING.xs },
  required: { color: COLORS.error || "#ef4444" },
  fieldHint: { fontSize: FONT_SIZES.sm, color: COLORS.textMuted, marginBottom: SPACING.xs },

  input: {
    backgroundColor: COLORS.surface,
    borderRadius: 10,
    padding: SPACING.md,
    fontSize: FONT_SIZES.md,
    color: COLORS.text,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  inputLocked: {
    opacity: 0.5,
    color: COLORS.textMuted,
  },
  textArea: { minHeight: 100, textAlignVertical: "top" },
  textAreaLarge: { minHeight: 150, textAlignVertical: "top" },

  currencyInputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  currencySymbol: { fontSize: FONT_SIZES.lg, color: COLORS.textSecondary, paddingLeft: SPACING.md, paddingRight: SPACING.xs },
  currencyInput: { flex: 1, padding: SPACING.md, paddingLeft: 0, fontSize: FONT_SIZES.md, color: COLORS.text },

  // End type
  endTypeRow: { flexDirection: "row", gap: SPACING.sm, marginBottom: SPACING.sm },
  endTypeButton: {
    flex: 1,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.sm,
    borderRadius: 10,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
  },
  endTypeButtonActive: { backgroundColor: COLORS.primary + "20", borderColor: COLORS.primary },
  endTypeText: { fontSize: FONT_SIZES.sm, fontWeight: "600", color: COLORS.textSecondary },
  endTypeTextActive: { color: COLORS.primary },
  endTypeHintBox: {
    backgroundColor: COLORS.surface,
    borderRadius: 8,
    padding: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  endTypeHint: { fontSize: FONT_SIZES.sm, color: COLORS.textSecondary, lineHeight: 18 },

  // Date
  dateRow: { flexDirection: "row", gap: SPACING.sm },
  dateDropdown: { flex: 2 },
  dateDropdownSmall: { flex: 1 },

  // Age
  ageRequirementContainer: {
    backgroundColor: COLORS.surface,
    borderRadius: 10,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  ageRequirementText: { fontSize: FONT_SIZES.md, fontWeight: "600", color: COLORS.text },
  ageRequirementSubtext: { fontSize: FONT_SIZES.sm, color: COLORS.textMuted, fontStyle: "italic" },

  // Bottom
  bottomButtons: {
    flexDirection: "row",
    padding: SPACING.md,
    paddingBottom: Platform.OS === "ios" ? 34 : SPACING.lg,
    gap: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    backgroundColor: COLORS.background,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: COLORS.surface,
    paddingVertical: SPACING.md,
    borderRadius: 10,
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cancelButtonText: { color: COLORS.text, fontSize: FONT_SIZES.md, fontWeight: "600" },
  saveButton: {
    flex: 2,
    backgroundColor: COLORS.primary,
    paddingVertical: SPACING.md,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  saveButtonText: { color: "#fff", fontSize: FONT_SIZES.md, fontWeight: "700" },
  buttonDisabled: { opacity: 0.45 },
});
