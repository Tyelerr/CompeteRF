import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { searchAlertService } from "../../../models/services/search-alert.service";
import { SearchAlert, SearchAlertFilters } from "../../../models/types/search-alert.types";
import { useAuthContext } from "../../../providers/AuthProvider";
import { COLORS } from "../../../theme/colors";
import { RADIUS, SPACING } from "../../../theme/spacing";
import { FONT_SIZES } from "../../../theme/typography";
import { moderateScale, scale } from "../../../utils/scaling";
import { US_STATES } from "../../../utils/constants";
import { US_CITIES_BY_STATE } from "../../../utils/us-cities";
import { Dropdown } from "../common/dropdown";

const isWeb = Platform.OS === "web";
const TAB_BAR_HEIGHT = 83;

export interface SearchAlertsModalProps {
  visible: boolean;
  onClose: () => void;
}

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
  { label: "Split Bracket", value: "split-bracket" },
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
  calcutta: boolean | undefined;
  openTournament: boolean | undefined;
  daysOfWeek: string[];
  isActive: boolean;
}

const initialFormState: FormState = {
  name: "", description: "", gameType: "", tournamentFormat: "", tableSize: "",
  equipment: "", state: "", city: "", entryFeeMin: "", entryFeeMax: "",
  fargoMax: "", reportsToFargo: undefined, calcutta: undefined,
  openTournament: undefined, daysOfWeek: [], isActive: true,
};

function formToCriteria(form: FormState): SearchAlertFilters {
  const criteria: Record<string, any> = {};
  if (form.gameType) criteria.gameType = form.gameType;
  if (form.tournamentFormat) criteria.tournamentFormat = form.tournamentFormat;
  if (form.tableSize) criteria.tableSize = form.tableSize;
  if (form.equipment.trim()) criteria.equipment = form.equipment.trim();
  if (form.state.trim()) criteria.state = form.state.trim();
  if (form.city.trim()) criteria.city = form.city.trim();
  if (form.entryFeeMin.trim()) criteria.entryFeeMin = parseFloat(form.entryFeeMin);
  if (form.entryFeeMax.trim()) criteria.entryFeeMax = parseFloat(form.entryFeeMax);
  if (form.fargoMax.trim()) criteria.fargoMax = parseInt(form.fargoMax);
  if (form.reportsToFargo !== undefined) criteria.reportsToFargo = form.reportsToFargo;
  if (form.calcutta !== undefined) criteria.calcutta = form.calcutta;
  if (form.openTournament !== undefined) criteria.openTournament = form.openTournament;
  if (form.daysOfWeek.length > 0) criteria.daysOfWeek = form.daysOfWeek;
  return criteria as SearchAlertFilters;
}

function criteriaToForm(alert: SearchAlert): FormState {
  const c: Record<string, any> = alert.filter_criteria || {};
  return {
    name: alert.name || "", description: alert.description || "",
    gameType: c.gameType || "", tournamentFormat: c.tournamentFormat || "",
    tableSize: c.tableSize || "", equipment: c.equipment || "",
    state: c.state || "", city: c.city || "",
    entryFeeMin: c.entryFeeMin !== undefined ? c.entryFeeMin.toString() : "",
    entryFeeMax: c.entryFeeMax !== undefined ? c.entryFeeMax.toString() : "",
    fargoMax: c.fargoMax !== undefined ? c.fargoMax.toString() : "",
    reportsToFargo: c.reportsToFargo, calcutta: c.calcutta,
    openTournament: c.openTournament, daysOfWeek: c.daysOfWeek || [],
    isActive: alert.is_active,
  };
}

function formatDate(dateString: string) {
  return new Date(dateString).toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "numeric" });
}

function DayPicker({ selected, onChange, disabled }: { selected: string[]; onChange: (days: string[]) => void; disabled?: boolean }) {
  const toggle = (v: string) => {
    if (disabled) return;
    onChange(selected.includes(v) ? selected.filter((d) => d !== v) : [...selected, v]);
  };
  return (
    <View style={s.dayPickerRow}>
      {DAYS_OF_WEEK_OPTIONS.map((day) => {
        const sel = selected.includes(day.value);
        return (
          <TouchableOpacity key={day.value} style={[s.dayChip, sel && s.dayChipSelected]} onPress={() => toggle(day.value)} disabled={disabled}>
            <Text allowFontScaling={false} style={[s.dayChipText, sel && s.dayChipTextSelected]}>{day.label.slice(0, 3)}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function ToggleRow({ label, description, value, onToggle, disabled }: { label: string; description?: string; value: boolean | undefined; onToggle: () => void; disabled?: boolean }) {
  const text = value === undefined ? "Any" : value ? "Yes" : "No";
  return (
    <TouchableOpacity style={s.toggleRow} onPress={onToggle} disabled={disabled}>
      <View style={s.toggleInfo}>
        <Text allowFontScaling={false} style={s.toggleLabel}>{label}</Text>
        {description && <Text allowFontScaling={false} style={s.toggleDescription}>{description}</Text>}
      </View>
      <View style={[s.togglePill, value === true && s.togglePillYes, value === false && s.togglePillNo]}>
        <Text allowFontScaling={false} style={[s.togglePillText, value === true && s.togglePillTextYes, value === false && s.togglePillTextNo]}>{text}</Text>
      </View>
    </TouchableOpacity>
  );
}

function AlertCard({ alert, onEdit, onDelete, onToggleActive }: { alert: SearchAlert; onEdit: () => void; onDelete: () => void; onToggleActive: () => void }) {
  const description = alert.description || searchAlertService.generateAlertDescription(alert.filter_criteria);
  return (
    <View style={s.alertCard}>
      <View style={s.cardTopRow}>
        <Text allowFontScaling={false} style={s.alertName} numberOfLines={1}>{alert.name}</Text>
        <TouchableOpacity style={[s.onOffBadge, alert.is_active ? s.onBadge : s.offBadge]} onPress={onToggleActive}>
          <Text allowFontScaling={false} style={[s.onOffText, alert.is_active ? s.onText : s.offText]}>{alert.is_active ? "ON" : "OFF"}</Text>
        </TouchableOpacity>
      </View>
      <Text allowFontScaling={false} style={s.alertDescription} numberOfLines={2}>{description}</Text>
      <Text allowFontScaling={false} style={s.matchInfo}>{alert.match_count} {alert.match_count === 1 ? "match" : "matches"}{alert.last_match_date ? ` · Last: ${formatDate(alert.last_match_date)}` : ""}</Text>
      <View style={s.actionRow}>
        <TouchableOpacity style={[s.actionButton, s.actionOutline]} onPress={onEdit}>
          <Text allowFontScaling={false} style={s.actionOutlineText}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.actionButton, s.actionDelete]} onPress={onDelete}>
          <Text allowFontScaling={false} style={s.actionDeleteText}>Delete</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function CreateEditForm({ userId, alertId, onDone, onClose }: { userId: number; alertId: number | null; onDone: () => void; onClose: () => void }) {
  const isEditMode = alertId !== null;
  const [form, setForm] = useState<FormState>(initialFormState);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const fieldOffsets = useRef<Record<string, number>>({});

  const scrollToField = (key: string) => {
    if (isWeb) return;
    const y = fieldOffsets.current[key];
    if (y === undefined) return;
    scrollRef.current?.scrollTo({ y: Math.max(0, y - 100), animated: true });
  };

  const stateOptions = [{ label: "Any State", value: "" }, ...US_STATES];
  const cityList = form.state ? US_CITIES_BY_STATE[form.state] || [] : [];
  const cityOptions = [{ label: "Any City", value: "" }, ...cityList.map((city: string) => ({ label: city, value: city }))];

  useEffect(() => {
    if (isEditMode && alertId) {
      setLoading(true);
      setError(null);
      searchAlertService.getAlert(alertId).then((alert) => {
        if (alert) setForm(criteriaToForm(alert));
        else setError("Alert not found.");
      }).catch(() => setError("Failed to load alert.")).finally(() => setLoading(false));
    } else {
      setForm(initialFormState);
      setError(null);
    }
  }, [alertId]);

  const updateField = (field: keyof FormState, value: any) => {
    setForm((prev) => {
      const updated = { ...prev, [field]: value };
      if (field === "state" && value !== prev.state) updated.city = "";
      return updated;
    });
  };

  const cycleTriState = (field: "reportsToFargo" | "calcutta" | "openTournament") => {
    setForm((prev) => {
      const cur = prev[field];
      const next = cur === undefined ? true : cur === true ? false : undefined;
      return { ...prev, [field]: next };
    });
  };

  const doSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const criteria = formToCriteria(form);
      const description = form.description.trim() || searchAlertService.generateAlertDescription(criteria);
      if (isEditMode && alertId) {
        await searchAlertService.updateAlert(alertId, { name: form.name.trim(), description, filter_criteria: criteria, is_active: form.isActive });
      } else {
        await searchAlertService.createAlert(userId, { name: form.name.trim(), description, filter_criteria: criteria, is_active: form.isActive });
      }
      onDone();
    } catch (err: any) {
      setError(err.message || "Failed to save alert.");
    } finally {
      setSaving(false);
    }
  };

  const handleSave = () => {
    if (!form.name.trim()) { Alert.alert("Error", "Please enter an alert name."); return; }
    const criteria = formToCriteria(form);
    if (Object.keys(criteria).length === 0) {
      Alert.alert("No Filters", "No filters set — this alert will match every tournament.", [
        { text: "Add Filters", style: "cancel" },
        { text: "Save Anyway", onPress: doSave },
      ]);
      return;
    }
    doSave();
  };

  if (loading) {
    return (
      <View style={s.loadingWrap}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text allowFontScaling={false} style={s.loadingText}>Loading alert...</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <View style={s.sheetHeader}>
        <Text allowFontScaling={false} style={s.sheetHeaderTitle}>{isEditMode ? "EDIT ALERT" : "CREATE ALERT"}</Text>
        <TouchableOpacity style={s.closeButton} onPress={onClose}>
          <Text allowFontScaling={false} style={s.closeButtonText}>&#x2715;</Text>
        </TouchableOpacity>
      </View>
      <View style={s.divider} />

      <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={s.formScrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        {error && <View style={s.errorContainer}><Text allowFontScaling={false} style={s.errorText}>{error}</Text></View>}

        <View style={s.section}>
          <Text allowFontScaling={false} style={s.sectionTitle}>Alert Info</Text>
          <View style={s.fieldContainer} onLayout={(e) => { fieldOffsets.current["name"] = e.nativeEvent.layout.y; }}>
            <Text allowFontScaling={false} style={s.fieldLabel}>Alert Name <Text style={s.required}>*</Text></Text>
            <TextInput allowFontScaling={false} style={s.textInput} placeholder='e.g. "9-Ball in Arizona"' placeholderTextColor={COLORS.textMuted} value={form.name} onChangeText={(v) => updateField("name", v)} onFocus={() => scrollToField("name")} editable={!saving} autoCapitalize="words" maxLength={100} />
          </View>
          <View style={s.fieldContainer} onLayout={(e) => { fieldOffsets.current["description"] = e.nativeEvent.layout.y; }}>
            <Text allowFontScaling={false} style={s.fieldLabel}>Description (optional)</Text>
            <TextInput allowFontScaling={false} style={[s.textInput, s.textInputMultiline]} placeholder="Auto-generated from your filters if left blank" placeholderTextColor={COLORS.textMuted} value={form.description} onChangeText={(v) => updateField("description", v)} onFocus={() => scrollToField("description")} editable={!saving} multiline numberOfLines={2} maxLength={250} />
          </View>
          <View style={s.switchRow}>
            <View style={s.switchInfo}>
              <Text allowFontScaling={false} style={s.fieldLabel}>Alert Active</Text>
              <Text allowFontScaling={false} style={s.switchDescription}>{"Inactive alerts won't match new tournaments"}</Text>
            </View>
            <Switch value={form.isActive} onValueChange={(v) => updateField("isActive", v)} trackColor={{ false: COLORS.border, true: COLORS.primary + "80" }} thumbColor={form.isActive ? COLORS.primary : COLORS.textMuted} disabled={saving} />
          </View>
        </View>

        <View style={s.section}>
          <Text allowFontScaling={false} style={s.sectionTitle}>Game Filters</Text>
          <View style={s.fieldContainer}>
            <Text allowFontScaling={false} style={s.fieldLabel}>Game Type</Text>
            <Dropdown placeholder="Any Game Type" options={GAME_TYPE_OPTIONS} value={form.gameType} onSelect={(v: string) => updateField("gameType", v)} disabled={saving} />
            {form.gameType && !form.gameType.includes("scotch") && <Text allowFontScaling={false} style={s.fieldHint}>💡 This will also match scotch doubles versions</Text>}
          </View>
          <View style={s.fieldContainer}>
            <Text allowFontScaling={false} style={s.fieldLabel}>Tournament Format</Text>
            <Dropdown placeholder="Any Format" options={FORMAT_OPTIONS} value={form.tournamentFormat} onSelect={(v: string) => updateField("tournamentFormat", v)} disabled={saving} />
          </View>
          <View style={s.fieldContainer}>
            <Text allowFontScaling={false} style={s.fieldLabel}>Table Size</Text>
            <Dropdown placeholder="Any Table Size" options={TABLE_SIZE_OPTIONS} value={form.tableSize} onSelect={(v: string) => updateField("tableSize", v)} disabled={saving} />
          </View>
          <View style={s.fieldContainer} onLayout={(e) => { fieldOffsets.current["equipment"] = e.nativeEvent.layout.y; }}>
            <Text allowFontScaling={false} style={s.fieldLabel}>Equipment</Text>
            <TextInput allowFontScaling={false} style={s.textInput} placeholder='"Diamond", "Brunswick"' placeholderTextColor={COLORS.textMuted} value={form.equipment} onChangeText={(v) => updateField("equipment", v)} onFocus={() => scrollToField("equipment")} editable={!saving} autoCapitalize="words" />
          </View>
        </View>

        <View style={s.section}>
          <Text allowFontScaling={false} style={s.sectionTitle}>Location</Text>
          <View style={s.fieldContainer}>
            <Text allowFontScaling={false} style={s.fieldLabel}>State</Text>
            <Dropdown placeholder="Any State" options={stateOptions} value={form.state} onSelect={(v: string) => updateField("state", v)} disabled={saving} searchable searchPlaceholder="Search states..." />
          </View>
          <View style={s.fieldContainer}>
            <Text allowFontScaling={false} style={s.fieldLabel}>City</Text>
            <Dropdown placeholder={!form.state ? "Select a state first" : "Any City"} options={cityOptions} value={form.city} onSelect={(v: string) => updateField("city", v)} disabled={saving || !form.state} searchable searchPlaceholder="Search cities..." />
          </View>
        </View>

        <View style={s.section}>
          <Text allowFontScaling={false} style={s.sectionTitle}>Entry Fee & Skill Level</Text>
          <View style={s.rowFields}>
            <View style={[s.fieldContainer, s.fieldHalf]} onLayout={(e) => { fieldOffsets.current["entryFeeMin"] = e.nativeEvent.layout.y; }}>
              <Text allowFontScaling={false} style={s.fieldLabel}>Min Entry Fee ($)</Text>
              <TextInput allowFontScaling={false} style={s.textInput} placeholder="0" placeholderTextColor={COLORS.textMuted} value={form.entryFeeMin} onChangeText={(v) => updateField("entryFeeMin", v)} onFocus={() => scrollToField("entryFeeMin")} editable={!saving} keyboardType="numeric" />
            </View>
            <View style={[s.fieldContainer, s.fieldHalf]} onLayout={(e) => { fieldOffsets.current["entryFeeMax"] = e.nativeEvent.layout.y; }}>
              <Text allowFontScaling={false} style={s.fieldLabel}>Max Entry Fee ($)</Text>
              <TextInput allowFontScaling={false} style={s.textInput} placeholder="Any" placeholderTextColor={COLORS.textMuted} value={form.entryFeeMax} onChangeText={(v) => updateField("entryFeeMax", v)} onFocus={() => scrollToField("entryFeeMax")} editable={!saving} keyboardType="numeric" />
            </View>
          </View>
          <View style={s.fieldContainer} onLayout={(e) => { fieldOffsets.current["fargoMax"] = e.nativeEvent.layout.y; }}>
            <Text allowFontScaling={false} style={s.fieldLabel}>Max Fargo Rating</Text>
            <TextInput allowFontScaling={false} style={s.textInput} placeholder="e.g. 600 (leave blank for any)" placeholderTextColor={COLORS.textMuted} value={form.fargoMax} onChangeText={(v) => updateField("fargoMax", v)} onFocus={() => scrollToField("fargoMax")} editable={!saving} keyboardType="numeric" />
          </View>
        </View>

        <View style={s.section}>
          <Text allowFontScaling={false} style={s.sectionTitle}>Additional Filters</Text>
          <Text allowFontScaling={false} style={s.sectionHint}>Tap to cycle: Any → Yes → No → Any</Text>
          <ToggleRow label="Reports to Fargo" description="Tournament results reported to FargoRate" value={form.reportsToFargo} onToggle={() => cycleTriState("reportsToFargo")} disabled={saving} />
          <ToggleRow label="Calcutta" description="Tournament includes a Calcutta auction" value={form.calcutta} onToggle={() => cycleTriState("calcutta")} disabled={saving} />
          <ToggleRow label="Open Tournament" description="No skill cap restriction" value={form.openTournament} onToggle={() => cycleTriState("openTournament")} disabled={saving} />
        </View>

        <View style={s.section}>
          <Text allowFontScaling={false} style={s.sectionTitle}>Days of Week</Text>
          <Text allowFontScaling={false} style={s.sectionHint}>Leave empty to match any day</Text>
          <DayPicker selected={form.daysOfWeek} onChange={(days) => updateField("daysOfWeek", days)} disabled={saving} />
        </View>

        <View style={s.previewContainer}>
          <Text allowFontScaling={false} style={s.previewLabel}>Alert Preview</Text>
          <Text allowFontScaling={false} style={s.previewText}>{form.name.trim() || "Untitled Alert"} — {searchAlertService.generateAlertDescription(formToCriteria(form))}</Text>
        </View>
      </ScrollView>

      <View style={s.divider} />
      <View style={s.footer}>
        <TouchableOpacity style={[s.saveButton, (!form.name.trim() || saving) && s.buttonDisabled]} onPress={handleSave} disabled={!form.name.trim() || saving}>
          {saving ? <ActivityIndicator size="small" color={COLORS.white} /> : <Text allowFontScaling={false} style={s.saveButtonText}>{isEditMode ? "Save Changes" : "Create Alert"}</Text>}
        </TouchableOpacity>
        <TouchableOpacity style={s.cancelButton} onPress={onClose} disabled={saving}>
          <Text allowFontScaling={false} style={s.cancelButtonText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

function AlertList({ userId, refreshKey, onOpenCreate, onOpenEdit, onClose }: { userId: number; refreshKey: number; onOpenCreate: () => void; onOpenEdit: (id: number) => void; onClose: () => void }) {
  const [alerts, setAlerts] = useState<SearchAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadAlerts = useCallback(async () => {
    try {
      setError(null);
      const data = await searchAlertService.getUserAlerts(userId);
      setAlerts(data);
    } catch {
      setError("Failed to load your search alerts.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userId]);

  useEffect(() => { setLoading(true); loadAlerts(); }, [refreshKey, loadAlerts]);

  const handleToggleActive = (alert: SearchAlert) => {
    const title = alert.is_active ? "Disable Alert?" : "Enable Alert?";
    const message = alert.is_active ? `"${alert.name}" will stop matching new tournaments until re-enabled.` : `"${alert.name}" will start matching new tournaments again.`;
    Alert.alert(title, message, [
      { text: "Cancel" },
      { text: alert.is_active ? "Disable" : "Enable", style: alert.is_active ? "destructive" : "default",
        onPress: async () => {
          try {
            await searchAlertService.updateAlert(alert.id, { is_active: !alert.is_active });
            setAlerts((prev) => prev.map((a) => a.id === alert.id ? { ...a, is_active: !a.is_active } : a));
          } catch { Alert.alert("Error", `Failed to ${alert.is_active ? "disable" : "enable"} alert.`); }
        },
      },
    ]);
  };

  const handleDelete = (alert: SearchAlert) => {
    Alert.alert("Delete Alert", `Are you sure you want to delete "${alert.name}"?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => {
          try {
            await searchAlertService.deleteAlert(alert.id);
            setAlerts((prev) => prev.filter((a) => a.id !== alert.id));
          } catch { Alert.alert("Error", "Failed to delete alert."); }
        },
      },
    ]);
  };

  const totalAlerts = alerts.length;
  const activeAlerts = alerts.filter((a) => a.is_active).length;
  const totalMatches = alerts.reduce((sum, a) => sum + a.match_count, 0);

  const renderHeader = () => (
    <>
      <View style={s.header}>
        <View style={{ width: 40 }} />
        <Text allowFontScaling={false} style={s.headerTitle}>SEARCH ALERTS</Text>
        <TouchableOpacity style={s.closeButton} onPress={onClose}>
          <Text allowFontScaling={false} style={s.closeButtonText}>&#x2715;</Text>
        </TouchableOpacity>
      </View>
      <View style={s.divider} />
      <View style={s.statsBar}>
        <View style={s.statItem}>
          <Text allowFontScaling={false} style={s.statValue}>{totalAlerts}</Text>
          <Text allowFontScaling={false} style={s.statLabel}>Total</Text>
        </View>
        <View style={s.statItem}>
          <Text allowFontScaling={false} style={s.statValue}>{activeAlerts}</Text>
          <Text allowFontScaling={false} style={s.statLabel}>Active</Text>
        </View>
        <View style={s.statItem}>
          <Text allowFontScaling={false} style={s.statValue}>{totalMatches}</Text>
          <Text allowFontScaling={false} style={s.statLabel}>Matches</Text>
        </View>
      </View>
      <View style={s.createButtonWrapper}>
        <TouchableOpacity style={s.createButton} onPress={onOpenCreate}>
          <Text allowFontScaling={false} style={s.createButtonText}>+ Create New Alert</Text>
        </TouchableOpacity>
      </View>
      {error && (
        <View style={s.errorContainer}>
          <Text allowFontScaling={false} style={s.errorText}>{error}</Text>
          <TouchableOpacity style={s.retryButton} onPress={() => { setLoading(true); loadAlerts(); }}>
            <Text allowFontScaling={false} style={s.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}
    </>
  );

  if (loading) {
    return (
      <View style={s.loadingWrap}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text allowFontScaling={false} style={s.loadingText}>Loading search alerts...</Text>
      </View>
    );
  }

  return (
    <FlatList
      data={alerts}
      keyExtractor={(item) => item.id.toString()}
      style={{ flex: 1 }}
      contentContainerStyle={[s.listContent, alerts.length === 0 && s.listContentEmpty]}
      ListHeaderComponent={renderHeader}
      ListEmptyComponent={() => (
        <View style={s.emptyState}>
          <Text allowFontScaling={false} style={s.emptyIcon}>🔔</Text>
          <Text allowFontScaling={false} style={s.emptyTitle}>No Search Alerts Yet</Text>
          <Text allowFontScaling={false} style={s.emptySubtitle}>Create an alert to get notified when tournaments match your criteria.</Text>
        </View>
      )}
      renderItem={({ item }) => (
        <AlertCard alert={item} onEdit={() => onOpenEdit(item.id)} onDelete={() => handleDelete(item)} onToggleActive={() => handleToggleActive(item)} />
      )}
      refreshControl={isWeb ? undefined : <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadAlerts(); }} tintColor={COLORS.primary} />}
      showsVerticalScrollIndicator={false}
    />
  );
}

export function SearchAlertsModal({ visible, onClose }: SearchAlertsModalProps) {
  const { profile } = useAuthContext();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingAlertId, setEditingAlertId] = useState<number | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const slideAnim = useRef(new Animated.Value(0)).current;

  const openSheet = (alertId: number | null = null) => {
    setEditingAlertId(alertId);
    setSheetOpen(true);
    Animated.spring(slideAnim, { toValue: 1, useNativeDriver: true, bounciness: 0, speed: 20 }).start();
  };

  const closeSheet = () => {
    Animated.timing(slideAnim, { toValue: 0, duration: 220, useNativeDriver: true }).start(() => {
      setSheetOpen(false);
      setEditingAlertId(null);
    });
  };

  const handleSheetDone = () => { closeSheet(); setRefreshKey((k) => k + 1); };

  useEffect(() => {
    if (!visible) { slideAnim.setValue(0); setSheetOpen(false); setEditingAlertId(null); }
  }, [visible]);

  const userId = profile?.id_auto;
  if (!userId) return null;

  const sheetTranslate = slideAnim.interpolate({ inputRange: [0, 1], outputRange: [800, 0] });

  const innerContent = (
    <View style={{ flex: 1 }}>
      <AlertList userId={userId} refreshKey={refreshKey} onOpenCreate={() => openSheet(null)} onOpenEdit={(id) => openSheet(id)} onClose={onClose} />
      {sheetOpen && (
        <>
          <TouchableOpacity style={s.sheetBackdrop} activeOpacity={1} onPress={closeSheet} />
          <Animated.View style={[s.sheetContainer, { transform: [{ translateY: sheetTranslate }] }]}>
            <CreateEditForm userId={userId} alertId={editingAlertId} onDone={handleSheetDone} onClose={closeSheet} />
          </Animated.View>
        </>
      )}
    </View>
  );

  if (isWeb) {
    if (!visible) return null;
    return (
      <>
        <TouchableOpacity style={s.backdrop} activeOpacity={1} onPress={onClose} />
        <View style={s.dialogWrap} pointerEvents="box-none">
          <View style={s.dialog}>{innerContent}</View>
        </View>
      </>
    );
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={s.mobileOverlay}>
        <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={onClose} />
        <View style={s.mobileContainer}>{innerContent}</View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { position: "fixed" as any, top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.75)", zIndex: 2000 },
  dialogWrap: { position: "fixed" as any, top: 0, left: 0, right: 0, bottom: 0, zIndex: 2001, alignItems: "center", justifyContent: "center", padding: 24 },
  dialog: { width: 700, maxWidth: "92%" as any, height: "92vh" as any, backgroundColor: COLORS.background, borderRadius: RADIUS.xl, borderWidth: 1, borderColor: COLORS.border, overflow: "hidden" as any, shadowColor: "#000", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.5, shadowRadius: 24, display: "flex" as any, flexDirection: "column" },
  mobileOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end", paddingBottom: TAB_BAR_HEIGHT },
  mobileContainer: { backgroundColor: COLORS.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, width: "100%", height: "88%" as any, overflow: "hidden" },
  sheetBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.45)" },
  sheetContainer: { position: "absolute", bottom: 0, left: 0, right: 0, height: "95%", backgroundColor: COLORS.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, overflow: "hidden" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: scale(SPACING.lg), paddingTop: scale(SPACING.lg), paddingBottom: scale(SPACING.md) },
  headerTitle: { color: COLORS.text, fontSize: moderateScale(FONT_SIZES.lg), fontWeight: "700", letterSpacing: 1 },
  sheetHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: scale(SPACING.lg), paddingTop: scale(SPACING.lg), paddingBottom: scale(SPACING.md) },
  sheetHeaderTitle: { color: COLORS.text, fontSize: moderateScale(FONT_SIZES.lg), fontWeight: "700", letterSpacing: 1, flex: 1 },
  closeButton: { width: 40, height: 40, justifyContent: "center", alignItems: "center" },
  closeButtonText: { color: COLORS.textSecondary, fontSize: moderateScale(20), fontWeight: "600" },
  divider: { height: 1, backgroundColor: COLORS.border },
  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: scale(SPACING.xl) },
  loadingText: { color: COLORS.textSecondary, fontSize: moderateScale(FONT_SIZES.md), marginTop: scale(SPACING.md) },
  statsBar: { flexDirection: "row", justifyContent: "space-around", paddingVertical: scale(SPACING.lg), borderBottomWidth: 1, borderBottomColor: COLORS.border },
  statItem: { alignItems: "center" },
  statValue: { fontSize: moderateScale(FONT_SIZES.xl), fontWeight: "700", color: COLORS.primary },
  statLabel: { fontSize: moderateScale(FONT_SIZES.sm), color: COLORS.textSecondary, marginTop: 2 },
  createButtonWrapper: { padding: scale(SPACING.md) },
  createButton: { backgroundColor: COLORS.primary, paddingVertical: scale(SPACING.md), borderRadius: RADIUS.md, alignItems: "center" },
  createButtonText: { color: COLORS.white, fontSize: moderateScale(FONT_SIZES.md), fontWeight: "600" },
  listContent: { paddingBottom: scale(SPACING.xl) },
  listContentEmpty: { flexGrow: 1 },
  alertCard: { backgroundColor: COLORS.backgroundCard, borderRadius: RADIUS.lg, padding: scale(SPACING.lg), marginHorizontal: scale(SPACING.md), marginBottom: scale(SPACING.md), borderWidth: 1, borderColor: COLORS.border },
  cardTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: scale(SPACING.sm) },
  alertName: { fontSize: moderateScale(FONT_SIZES.lg), fontWeight: "700", color: COLORS.text, flex: 1, marginRight: scale(SPACING.sm) },
  onOffBadge: { paddingHorizontal: scale(SPACING.md), paddingVertical: scale(SPACING.xs), borderRadius: RADIUS.md },
  onBadge: { backgroundColor: COLORS.primary },
  offBadge: { backgroundColor: COLORS.textMuted + "40" },
  onOffText: { fontSize: moderateScale(FONT_SIZES.sm), fontWeight: "700" },
  onText: { color: COLORS.white },
  offText: { color: COLORS.textMuted },
  alertDescription: { fontSize: moderateScale(FONT_SIZES.md), color: COLORS.textSecondary, lineHeight: moderateScale(20), marginBottom: scale(SPACING.xs) },
  matchInfo: { fontSize: moderateScale(FONT_SIZES.sm), color: COLORS.textMuted, marginBottom: scale(SPACING.lg) },
  actionRow: { flexDirection: "row", gap: scale(SPACING.sm) },
  actionButton: { flex: 1, paddingVertical: scale(SPACING.sm), borderRadius: RADIUS.md, alignItems: "center", justifyContent: "center" },
  actionOutline: { borderWidth: 1, borderColor: COLORS.border },
  actionOutlineText: { fontSize: moderateScale(FONT_SIZES.sm), fontWeight: "600", color: COLORS.text },
  actionDelete: { borderWidth: 1, borderColor: COLORS.error + "60", backgroundColor: COLORS.error + "10" },
  actionDeleteText: { fontSize: moderateScale(FONT_SIZES.sm), fontWeight: "600", color: COLORS.error },
  emptyState: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: scale(SPACING.xl * 2), paddingHorizontal: scale(SPACING.lg) },
  emptyIcon: { fontSize: moderateScale(60), marginBottom: scale(SPACING.md) },
  emptyTitle: { fontSize: moderateScale(FONT_SIZES.lg), color: COLORS.text, fontWeight: "600", marginBottom: scale(SPACING.sm), textAlign: "center" },
  emptySubtitle: { fontSize: moderateScale(FONT_SIZES.md), color: COLORS.textSecondary, textAlign: "center", lineHeight: moderateScale(20) },
  errorContainer: { backgroundColor: COLORS.error + "20", padding: scale(SPACING.md), marginHorizontal: scale(SPACING.md), marginBottom: scale(SPACING.md), borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.error, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  errorText: { color: COLORS.error, fontSize: moderateScale(FONT_SIZES.sm), flex: 1 },
  retryButton: { backgroundColor: COLORS.error, paddingHorizontal: scale(SPACING.md), paddingVertical: scale(SPACING.sm), borderRadius: RADIUS.sm },
  retryText: { color: COLORS.white, fontSize: moderateScale(FONT_SIZES.sm), fontWeight: "600" },
  formScrollContent: { padding: scale(SPACING.md), paddingBottom: scale(SPACING.xl) },
  section: { marginBottom: scale(SPACING.lg), backgroundColor: COLORS.backgroundCard, borderRadius: RADIUS.lg, padding: scale(SPACING.lg), borderWidth: 1, borderColor: COLORS.border },
  sectionTitle: { fontSize: moderateScale(FONT_SIZES.md), fontWeight: "700", color: COLORS.text, marginBottom: scale(SPACING.md), textTransform: "uppercase", letterSpacing: 0.5 },
  sectionHint: { fontSize: moderateScale(FONT_SIZES.xs), color: COLORS.textMuted, marginBottom: scale(SPACING.md), marginTop: -scale(SPACING.sm) },
  fieldContainer: { marginBottom: scale(SPACING.md) },
  fieldLabel: { fontSize: moderateScale(FONT_SIZES.sm), color: COLORS.text, fontWeight: "500", marginBottom: scale(SPACING.sm) },
  required: { color: COLORS.error },
  fieldHint: { fontSize: moderateScale(FONT_SIZES.xs), color: COLORS.primary, marginTop: scale(SPACING.xs) },
  textInput: { backgroundColor: COLORS.surface, borderColor: COLORS.border, borderWidth: 1, borderRadius: RADIUS.md, paddingVertical: scale(SPACING.md), paddingHorizontal: scale(SPACING.md), fontSize: moderateScale(FONT_SIZES.md), color: COLORS.text },
  textInputMultiline: { minHeight: 60, textAlignVertical: "top" },
  rowFields: { flexDirection: "row", gap: scale(SPACING.md) },
  fieldHalf: { flex: 1 },
  switchRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: scale(SPACING.sm) },
  switchInfo: { flex: 1, marginRight: scale(SPACING.md) },
  switchDescription: { fontSize: moderateScale(FONT_SIZES.xs), color: COLORS.textMuted, marginTop: 2 },
  toggleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: scale(SPACING.md), borderBottomWidth: 1, borderBottomColor: COLORS.border },
  toggleInfo: { flex: 1, marginRight: scale(SPACING.md) },
  toggleLabel: { fontSize: moderateScale(FONT_SIZES.sm), fontWeight: "500", color: COLORS.text },
  toggleDescription: { fontSize: moderateScale(FONT_SIZES.xs), color: COLORS.textMuted, marginTop: 2 },
  togglePill: { paddingHorizontal: scale(SPACING.md), paddingVertical: scale(SPACING.xs), borderRadius: RADIUS.sm, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, minWidth: 50, alignItems: "center" },
  togglePillYes: { backgroundColor: COLORS.primary + "20", borderColor: COLORS.primary },
  togglePillNo: { backgroundColor: COLORS.error + "15", borderColor: COLORS.error + "60" },
  togglePillText: { fontSize: moderateScale(FONT_SIZES.sm), fontWeight: "600", color: COLORS.textMuted },
  togglePillTextYes: { color: COLORS.primary },
  togglePillTextNo: { color: COLORS.error },
  dayPickerRow: { flexDirection: "row", flexWrap: "wrap", gap: scale(SPACING.sm) },
  dayChip: { paddingHorizontal: scale(SPACING.md), paddingVertical: scale(SPACING.sm), borderRadius: RADIUS.md, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  dayChipSelected: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  dayChipText: { fontSize: moderateScale(FONT_SIZES.sm), fontWeight: "500", color: COLORS.text },
  dayChipTextSelected: { color: COLORS.white },
  previewContainer: { backgroundColor: COLORS.surface, borderRadius: RADIUS.md, padding: scale(SPACING.md), borderWidth: 1, borderColor: COLORS.border, marginBottom: scale(SPACING.lg) },
  previewLabel: { fontSize: moderateScale(FONT_SIZES.xs), fontWeight: "600", color: COLORS.textMuted, textTransform: "uppercase", marginBottom: scale(SPACING.xs) },
  previewText: { fontSize: moderateScale(FONT_SIZES.sm), color: COLORS.text, lineHeight: moderateScale(20) },
  footer: { flexDirection: "row", gap: scale(SPACING.sm), paddingHorizontal: scale(SPACING.md), paddingTop: scale(SPACING.sm), paddingBottom: scale(SPACING.lg) },
  saveButton: { flex: 1, paddingVertical: scale(SPACING.md + 2), borderRadius: RADIUS.md, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.primary },
  saveButtonText: { fontSize: moderateScale(FONT_SIZES.md), color: COLORS.white, fontWeight: "700" },
  cancelButton: { flex: 1, paddingVertical: scale(SPACING.md + 2), borderRadius: RADIUS.md, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: COLORS.error },
  cancelButtonText: { fontSize: moderateScale(FONT_SIZES.md), color: COLORS.error, fontWeight: "600" },
  buttonDisabled: { opacity: 0.5 },
});
