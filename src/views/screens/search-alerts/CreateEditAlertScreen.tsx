import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { searchAlertService } from "../../../models/services/search-alert.service";
import {
  SearchAlert,
  SearchAlertFilters,
} from "../../../models/types/search-alert.types";
import { useAuthContext } from "../../../providers/AuthProvider";
import { COLORS } from "../../../theme/colors";
import { RADIUS, SPACING } from "../../../theme/spacing";
import { FONT_SIZES } from "../../../theme/typography";
import { US_STATES } from "../../../utils/constants";
import { US_CITIES_BY_STATE } from "../../../utils/us-cities";
import { Dropdown } from "../../components/common/dropdown";
import { Loading } from "../../components/common/loading";

// ─── Option Data ──────────────────────────────────────────────────────────────

const GAME_TYPE_OPTIONS = [
  { label: "Any Game Type", value: "" },
  { label: "8-Ball", value: "8-ball" },
  { label: "9-Ball", value: "9-ball" },
  { label: "10-Ball", value: "10-ball" },
  { label: "One Pocket", value: "one-pocket" },
  { label: "Straight Pool", value: "straight-pool" },
  { label: "Bank Pool", value: "bank-pool" },
  { label: "Rotation", value: "rotation" },
  { label: "8-Ball Scotch Doubles", value: "8-ball-scotch-doubles" },
  { label: "9-Ball Scotch Doubles", value: "9-ball-scotch-doubles" },
  { label: "10-Ball Scotch Doubles", value: "10-ball-scotch-doubles" },
];

const FORMAT_OPTIONS = [
  { label: "Any Format", value: "" },
  { label: "Single Elimination", value: "single-elimination" },
  { label: "Double Elimination", value: "double-elimination" },
  { label: "Round Robin", value: "round-robin" },
  { label: "Swiss", value: "swiss" },
  { label: "Modified", value: "modified" },
];

const TABLE_SIZE_OPTIONS = [
  { label: "Any Table Size", value: "" },
  { label: "7 Foot (Bar Box)", value: "7-foot" },
  { label: "8 Foot", value: "8-foot" },
  { label: "9 Foot (Pro)", value: "9-foot" },
];

const DAYS_OF_WEEK_OPTIONS = [
  { label: "Sunday", value: "0" },
  { label: "Monday", value: "1" },
  { label: "Tuesday", value: "2" },
  { label: "Wednesday", value: "3" },
  { label: "Thursday", value: "4" },
  { label: "Friday", value: "5" },
  { label: "Saturday", value: "6" },
];

// ─── Form State ───────────────────────────────────────────────────────────────

interface FormState {
  name: string;
  description: string;
  gameType: string;
  tournamentFormat: string;
  tableSize: string;
  equipment: string;
  state: string;
  city: string;
  entryFeeMin: string;
  entryFeeMax: string;
  fargoMax: string;
  reportsToFargo: boolean | undefined;
  openTournament: boolean | undefined;
  daysOfWeek: string[];
  isActive: boolean;
}

const initialFormState: FormState = {
  name: "",
  description: "",
  gameType: "",
  tournamentFormat: "",
  tableSize: "",
  equipment: "",
  state: "",
  city: "",
  entryFeeMin: "",
  entryFeeMax: "",
  fargoMax: "",
  reportsToFargo: undefined,
  openTournament: undefined,
  daysOfWeek: [],
  isActive: true,
};

// ─── Helper: Convert form to criteria ─────────────────────────────────────────

function formToCriteria(form: FormState): SearchAlertFilters {
  const criteria: Record<string, any> = {};

  if (form.gameType) criteria.gameType = form.gameType;
  if (form.tournamentFormat) criteria.tournamentFormat = form.tournamentFormat;
  if (form.tableSize) criteria.tableSize = form.tableSize;
  if (form.equipment.trim()) criteria.equipment = form.equipment.trim();
  if (form.state.trim()) criteria.state = form.state.trim();
  if (form.city.trim()) criteria.city = form.city.trim();
  if (form.entryFeeMin.trim())
    criteria.entryFeeMin = parseFloat(form.entryFeeMin);
  if (form.entryFeeMax.trim())
    criteria.entryFeeMax = parseFloat(form.entryFeeMax);
  if (form.fargoMax.trim()) criteria.fargoMax = parseInt(form.fargoMax);
  if (form.reportsToFargo !== undefined)
    criteria.reportsToFargo = form.reportsToFargo;
  if (form.openTournament !== undefined)
    criteria.openTournament = form.openTournament;
  if (form.daysOfWeek.length > 0) criteria.daysOfWeek = form.daysOfWeek;

  return criteria as SearchAlertFilters;
}

// ─── Helper: Convert criteria to form ─────────────────────────────────────────

function criteriaToForm(alert: SearchAlert): FormState {
  const c: Record<string, any> = alert.filter_criteria || {};
  return {
    name: alert.name || "",
    description: alert.description || "",
    gameType: c.gameType || "",
    tournamentFormat: c.tournamentFormat || "",
    tableSize: c.tableSize || "",
    equipment: c.equipment || "",
    state: c.state || "",
    city: c.city || "",
    entryFeeMin: c.entryFeeMin !== undefined ? c.entryFeeMin.toString() : "",
    entryFeeMax: c.entryFeeMax !== undefined ? c.entryFeeMax.toString() : "",
    fargoMax: c.fargoMax !== undefined ? c.fargoMax.toString() : "",
    reportsToFargo: c.reportsToFargo,
    openTournament: c.openTournament,
    daysOfWeek: c.daysOfWeek || [],
    isActive: alert.is_active,
  };
}

// ─── Day Picker ───────────────────────────────────────────────────────────────

function DayPicker({
  selected,
  onChange,
  disabled,
}: {
  selected: string[];
  onChange: (days: string[]) => void;
  disabled?: boolean;
}) {
  const toggle = (dayValue: string) => {
    if (disabled) return;
    if (selected.includes(dayValue)) {
      onChange(selected.filter((d) => d !== dayValue));
    } else {
      onChange([...selected, dayValue]);
    }
  };

  return (
    <View style={styles.dayPickerRow}>
      {DAYS_OF_WEEK_OPTIONS.map((day) => {
        const isSelected = selected.includes(day.value);
        return (
          <TouchableOpacity
            key={day.value}
            style={[styles.dayChip, isSelected && styles.dayChipSelected]}
            onPress={() => toggle(day.value)}
            disabled={disabled}
          >
            <Text
              style={[
                styles.dayChipText,
                isSelected && styles.dayChipTextSelected,
              ]}
            >
              {day.label.slice(0, 3)}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ─── Toggle Row ───────────────────────────────────────────────────────────────

function ToggleRow({
  label,
  description,
  value,
  onToggle,
  disabled,
}: {
  label: string;
  description?: string;
  value: boolean | undefined;
  onToggle: () => void;
  disabled?: boolean;
}) {
  // Three-state: undefined (any), true, false
  // Tapping cycles: undefined → true → false → undefined
  const displayText = value === undefined ? "Any" : value ? "Yes" : "No";

  return (
    <TouchableOpacity
      style={styles.toggleRow}
      onPress={onToggle}
      disabled={disabled}
    >
      <View style={styles.toggleInfo}>
        <Text style={styles.toggleLabel}>{label}</Text>
        {description && (
          <Text style={styles.toggleDescription}>{description}</Text>
        )}
      </View>
      <View
        style={[
          styles.togglePill,
          value === true && styles.togglePillYes,
          value === false && styles.togglePillNo,
        ]}
      >
        <Text
          style={[
            styles.togglePillText,
            value === true && styles.togglePillTextYes,
            value === false && styles.togglePillTextNo,
          ]}
        >
          {displayText}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function CreateEditAlertScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { profile } = useAuthContext();

  const alertId = params.id ? parseInt(params.id as string) : null;
  const isEditMode = alertId !== null;

  const [form, setForm] = useState<FormState>(initialFormState);
  const [loading, setLoading] = useState(isEditMode);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Location dropdowns
  const stateOptions = [{ label: "Any State", value: "" }, ...US_STATES];
  const cityList = form.state ? US_CITIES_BY_STATE[form.state] || [] : [];
  const cityOptions = [
    { label: "Any City", value: "" },
    ...cityList.map((city: string) => ({ label: city, value: city })),
  ];

  // Load existing alert for edit mode
  useEffect(() => {
    if (isEditMode && alertId) {
      loadAlert(alertId);
    }
  }, [alertId]);

  const loadAlert = async (id: number) => {
    try {
      const alert = await searchAlertService.getAlert(id);
      if (alert) {
        setForm(criteriaToForm(alert));
      } else {
        setError("Alert not found.");
      }
    } catch (err) {
      console.error("Error loading alert:", err);
      setError("Failed to load alert.");
    } finally {
      setLoading(false);
    }
  };

  const updateField = (field: keyof FormState, value: any) => {
    setForm((prev) => {
      const updated = { ...prev, [field]: value };
      // Clear city when state changes
      if (field === "state" && value !== prev.state) {
        updated.city = "";
      }
      return updated;
    });
  };

  const cycleTriState = (field: "reportsToFargo" | "openTournament") => {
    setForm((prev) => {
      const current = prev[field];
      // undefined → true → false → undefined
      const next =
        current === undefined ? true : current === true ? false : undefined;
      return { ...prev, [field]: next };
    });
  };

  const validate = (): boolean => {
    if (!form.name.trim()) {
      Alert.alert("Error", "Please enter an alert name.");
      return false;
    }

    // At least one filter criteria should be set
    const criteria = formToCriteria(form);
    const hasAnyCriteria = Object.keys(criteria).length > 0;
    if (!hasAnyCriteria) {
      Alert.alert(
        "No Filters",
        "Please set at least one filter criteria, otherwise this alert will match every tournament.",
        [
          { text: "Add Filters", style: "cancel" },
          { text: "Save Anyway", onPress: () => doSave() },
        ],
      );
      return false;
    }

    return true;
  };

  const handleSave = () => {
    if (!validate()) return;
    doSave();
  };

  const doSave = async () => {
    if (!profile?.id_auto) return;

    setSaving(true);
    setError(null);

    try {
      const criteria = formToCriteria(form);
      const description =
        form.description.trim() ||
        searchAlertService.generateAlertDescription(criteria);

      if (isEditMode && alertId) {
        await searchAlertService.updateAlert(alertId, {
          name: form.name.trim(),
          description,
          filter_criteria: criteria,
          is_active: form.isActive,
        });
        Alert.alert("Updated", "Your search alert has been updated!", [
          { text: "OK", onPress: () => router.back() },
        ]);
      } else {
        await searchAlertService.createAlert(profile.id_auto, {
          name: form.name.trim(),
          description,
          filter_criteria: criteria,
          is_active: form.isActive,
        });
        Alert.alert("Created", "Your search alert is now active!", [
          { text: "OK", onPress: () => router.back() },
        ]);
      }
    } catch (err: any) {
      console.error("Error saving alert:", err);
      setError(err.message || "Failed to save alert.");
    } finally {
      setSaving(false);
    }
  };

  const generatePreview = (): string => {
    const criteria = formToCriteria(form);
    return searchAlertService.generateAlertDescription(criteria);
  };

  if (loading) {
    return <Loading fullScreen message="Loading alert..." />;
  }

  return (
    <View style={styles.container}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          style={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.scrollContentContainer}
        >
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity
              onPress={() => router.back()}
              style={styles.backButton}
            >
              <Text style={styles.backText}>← Back</Text>
            </TouchableOpacity>
            <Text style={styles.headerTitle}>
              {isEditMode ? "EDIT ALERT" : "CREATE ALERT"}
            </Text>
            <Text style={styles.headerSubtitle}>
              {isEditMode
                ? "Update your search alert criteria"
                : "Get notified when matching tournaments are posted"}
            </Text>
          </View>

          <View style={styles.content}>
            {/* Error */}
            {error && (
              <View style={styles.errorContainer}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            {/* ─── Alert Info Section ──────────────────────────────── */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Alert Info</Text>

              <View style={styles.fieldContainer}>
                <Text style={styles.fieldLabel}>
                  Alert Name <Text style={styles.required}>*</Text>
                </Text>
                <TextInput
                  style={styles.textInput}
                  placeholder='e.g. "9-Ball in Arizona"'
                  placeholderTextColor={COLORS.textMuted}
                  value={form.name}
                  onChangeText={(v) => updateField("name", v)}
                  editable={!saving}
                  autoCapitalize="words"
                  maxLength={100}
                />
              </View>

              <View style={styles.fieldContainer}>
                <Text style={styles.fieldLabel}>Description (optional)</Text>
                <TextInput
                  style={[styles.textInput, styles.textInputMultiline]}
                  placeholder="Auto-generated from your filters if left blank"
                  placeholderTextColor={COLORS.textMuted}
                  value={form.description}
                  onChangeText={(v) => updateField("description", v)}
                  editable={!saving}
                  multiline
                  numberOfLines={2}
                  maxLength={250}
                />
              </View>

              {/* Active toggle */}
              <View style={styles.switchRow}>
                <View style={styles.switchInfo}>
                  <Text style={styles.fieldLabel}>Alert Active</Text>
                  <Text style={styles.switchDescription}>
                    {"Inactive alerts won\u0027t match new tournaments"}
                  </Text>
                </View>
                <Switch
                  value={form.isActive}
                  onValueChange={(v) => updateField("isActive", v)}
                  trackColor={{
                    false: COLORS.border,
                    true: COLORS.primary + "80",
                  }}
                  thumbColor={form.isActive ? COLORS.primary : COLORS.textMuted}
                  disabled={saving}
                />
              </View>
            </View>

            {/* ─── Game Filters Section ────────────────────────────── */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Game Filters</Text>

              <View style={styles.fieldContainer}>
                <Text style={styles.fieldLabel}>Game Type</Text>
                <Dropdown
                  placeholder="Any Game Type"
                  options={GAME_TYPE_OPTIONS}
                  value={form.gameType}
                  onSelect={(v: string) => updateField("gameType", v)}
                  disabled={saving}
                />
                {form.gameType && !form.gameType.includes("scotch") && (
                  <Text style={styles.fieldHint}>
                    💡 This will also match scotch doubles versions
                  </Text>
                )}
              </View>

              <View style={styles.fieldContainer}>
                <Text style={styles.fieldLabel}>Tournament Format</Text>
                <Dropdown
                  placeholder="Any Format"
                  options={FORMAT_OPTIONS}
                  value={form.tournamentFormat}
                  onSelect={(v: string) => updateField("tournamentFormat", v)}
                  disabled={saving}
                />
              </View>

              <View style={styles.fieldContainer}>
                <Text style={styles.fieldLabel}>Table Size</Text>
                <Dropdown
                  placeholder="Any Table Size"
                  options={TABLE_SIZE_OPTIONS}
                  value={form.tableSize}
                  onSelect={(v: string) => updateField("tableSize", v)}
                  disabled={saving}
                />
              </View>

              <View style={styles.fieldContainer}>
                <Text style={styles.fieldLabel}>Equipment</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder='e.g. "Diamond", "Brunswick"'
                  placeholderTextColor={COLORS.textMuted}
                  value={form.equipment}
                  onChangeText={(v) => updateField("equipment", v)}
                  editable={!saving}
                  autoCapitalize="words"
                />
              </View>
            </View>

            {/* ─── Location Section ────────────────────────────────── */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Location</Text>

              <View style={styles.fieldContainer}>
                <Text style={styles.fieldLabel}>State</Text>
                <Dropdown
                  placeholder="Any State"
                  options={stateOptions}
                  value={form.state}
                  onSelect={(v: string) => updateField("state", v)}
                  disabled={saving}
                  searchable
                  searchPlaceholder="Search states..."
                />
              </View>

              <View style={styles.fieldContainer}>
                <Text style={styles.fieldLabel}>City</Text>
                <Dropdown
                  placeholder={
                    !form.state ? "Select a state first" : "Any City"
                  }
                  options={cityOptions}
                  value={form.city}
                  onSelect={(v: string) => updateField("city", v)}
                  disabled={saving || !form.state}
                  searchable
                  searchPlaceholder="Search cities..."
                />
              </View>
            </View>

            {/* ─── Entry Fee & Fargo Section ───────────────────────── */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Entry Fee & Skill Level</Text>

              <View style={styles.rowFields}>
                <View style={[styles.fieldContainer, styles.fieldHalf]}>
                  <Text style={styles.fieldLabel}>Min Entry Fee ($)</Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="0"
                    placeholderTextColor={COLORS.textMuted}
                    value={form.entryFeeMin}
                    onChangeText={(v) => updateField("entryFeeMin", v)}
                    editable={!saving}
                    keyboardType="numeric"
                  />
                </View>
                <View style={[styles.fieldContainer, styles.fieldHalf]}>
                  <Text style={styles.fieldLabel}>Max Entry Fee ($)</Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="Any"
                    placeholderTextColor={COLORS.textMuted}
                    value={form.entryFeeMax}
                    onChangeText={(v) => updateField("entryFeeMax", v)}
                    editable={!saving}
                    keyboardType="numeric"
                  />
                </View>
              </View>

              <View style={styles.fieldContainer}>
                <Text style={styles.fieldLabel}>Max Fargo Rating</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="e.g. 600 (leave blank for any)"
                  placeholderTextColor={COLORS.textMuted}
                  value={form.fargoMax}
                  onChangeText={(v) => updateField("fargoMax", v)}
                  editable={!saving}
                  keyboardType="numeric"
                />
              </View>
            </View>

            {/* ─── Toggle Filters Section ──────────────────────────── */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Additional Filters</Text>
              <Text style={styles.sectionHint}>
                Tap to cycle: Any → Yes → No → Any
              </Text>

              <ToggleRow
                label="Reports to Fargo"
                description="Tournament results reported to FargoRate"
                value={form.reportsToFargo}
                onToggle={() => cycleTriState("reportsToFargo")}
                disabled={saving}
              />

              <ToggleRow
                label="Open Tournament"
                description="No skill cap restriction"
                value={form.openTournament}
                onToggle={() => cycleTriState("openTournament")}
                disabled={saving}
              />
            </View>

            {/* ─── Days of Week Section ─────────────────────────────── */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Days of Week</Text>
              <Text style={styles.sectionHint}>
                Only match tournaments on these days (leave empty for any day)
              </Text>

              <DayPicker
                selected={form.daysOfWeek}
                onChange={(days) => updateField("daysOfWeek", days)}
                disabled={saving}
              />
            </View>

            {/* ─── Preview Section ──────────────────────────────────── */}
            <View style={styles.previewContainer}>
              <Text style={styles.previewLabel}>Alert Preview</Text>
              <Text style={styles.previewText}>
                {form.name.trim() || "Untitled Alert"} — {generatePreview()}
              </Text>
            </View>
          </View>
        </ScrollView>

        {/* ─── Fixed Bottom Buttons ──────────────────────────────── */}
        <View style={styles.bottomBar}>
          <TouchableOpacity
            style={[
              styles.saveButton,
              (!form.name.trim() || saving) && styles.buttonDisabled,
            ]}
            onPress={handleSave}
            disabled={!form.name.trim() || saving}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.saveButtonText}>
                {isEditMode ? "Save Changes" : "Create Alert"}
              </Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.cancelButton}
            onPress={() => router.back()}
            disabled={saving}
          >
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    flex: 1,
  },
  scrollContentContainer: {
    paddingBottom: SPACING.xl,
  },

  // Header
  header: {
    padding: SPACING.md,
    paddingTop: SPACING.xl + SPACING.lg,
    alignItems: "center",
  },
  backButton: {
    alignSelf: "flex-start",
    paddingVertical: SPACING.sm,
    marginBottom: SPACING.md,
  },
  backText: {
    color: COLORS.primary,
    fontSize: FONT_SIZES.md,
  },
  headerTitle: {
    fontSize: FONT_SIZES.xl,
    fontWeight: "700",
    color: COLORS.text,
    textAlign: "center",
    marginBottom: SPACING.xs,
  },
  headerSubtitle: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    textAlign: "center",
    lineHeight: 20,
  },

  // Content
  content: {
    padding: SPACING.md,
    paddingTop: 0,
  },

  // Error
  errorContainer: {
    backgroundColor: COLORS.error + "20",
    borderColor: COLORS.error,
    borderWidth: 1,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  errorText: {
    color: COLORS.error,
    fontSize: FONT_SIZES.sm,
    textAlign: "center",
  },

  // Sections
  section: {
    marginBottom: SPACING.lg,
    backgroundColor: COLORS.backgroundCard,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  sectionTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: "700",
    color: COLORS.text,
    marginBottom: SPACING.md,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  sectionHint: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    marginBottom: SPACING.md,
    marginTop: -SPACING.sm,
  },

  // Fields
  fieldContainer: {
    marginBottom: SPACING.md,
  },
  fieldLabel: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.text,
    fontWeight: "500",
    marginBottom: SPACING.sm,
  },
  required: {
    color: COLORS.error,
  },
  fieldHint: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.primary,
    marginTop: SPACING.xs,
  },
  textInput: {
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    fontSize: FONT_SIZES.md,
    color: COLORS.text,
  },
  textInputMultiline: {
    minHeight: 60,
    textAlignVertical: "top",
  },

  // Row fields (side by side)
  rowFields: {
    flexDirection: "row",
    gap: SPACING.md,
  },
  fieldHalf: {
    flex: 1,
  },

  // Switch row
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: SPACING.sm,
  },
  switchInfo: {
    flex: 1,
    marginRight: SPACING.md,
  },
  switchDescription: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    marginTop: 2,
  },

  // Toggle row (tri-state)
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  toggleInfo: {
    flex: 1,
    marginRight: SPACING.md,
  },
  toggleLabel: {
    fontSize: FONT_SIZES.sm,
    fontWeight: "500",
    color: COLORS.text,
  },
  toggleDescription: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  togglePill: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    minWidth: 50,
    alignItems: "center",
  },
  togglePillYes: {
    backgroundColor: COLORS.primary + "20",
    borderColor: COLORS.primary,
  },
  togglePillNo: {
    backgroundColor: COLORS.error + "15",
    borderColor: COLORS.error + "60",
  },
  togglePillText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: "600",
    color: COLORS.textMuted,
  },
  togglePillTextYes: {
    color: COLORS.primary,
  },
  togglePillTextNo: {
    color: COLORS.error,
  },

  // Day picker
  dayPickerRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: SPACING.sm,
  },
  dayChip: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  dayChipSelected: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  dayChipText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: "500",
    color: COLORS.text,
  },
  dayChipTextSelected: {
    color: COLORS.white,
  },

  // Preview
  previewContainer: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: SPACING.lg,
  },
  previewLabel: {
    fontSize: FONT_SIZES.xs,
    fontWeight: "600",
    color: COLORS.textMuted,
    textTransform: "uppercase",
    marginBottom: SPACING.xs,
  },
  previewText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.text,
    lineHeight: 20,
  },

  // Fixed bottom bar
  bottomBar: {
    flexDirection: "row",
    gap: SPACING.sm,
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.xl + SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    backgroundColor: COLORS.background,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cancelButtonText: {
    fontSize: FONT_SIZES.md,
    color: COLORS.text,
    fontWeight: "600",
  },
  saveButton: {
    flex: 1,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.primary,
  },
  saveButtonText: {
    fontSize: FONT_SIZES.md,
    color: "#fff",
    fontWeight: "600",
  },
  buttonDisabled: {
    opacity: 0.5,
  },
});
