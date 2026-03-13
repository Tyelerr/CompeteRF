// src/views/components/profile/SearchAlertsModal.tsx

import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
import { Dropdown } from "../common/dropdown";

const isWeb = Platform.OS === "web";

// ─── Types ────────────────────────────────────────────────────────────────────

type ModalView = "list" | "create" | "edit";

export interface SearchAlertsModalProps {
  visible: boolean;
  onClose: () => void;
}

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
  calcutta: boolean | undefined;
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
  calcutta: undefined,
  openTournament: undefined,
  daysOfWeek: [],
  isActive: true,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
  if (form.calcutta !== undefined) criteria.calcutta = form.calcutta;
  if (form.openTournament !== undefined)
    criteria.openTournament = form.openTournament;
  if (form.daysOfWeek.length > 0) criteria.daysOfWeek = form.daysOfWeek;
  return criteria as SearchAlertFilters;
}

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
    calcutta: c.calcutta,
    openTournament: c.openTournament,
    daysOfWeek: c.daysOfWeek || [],
    isActive: alert.is_active,
  };
}

function formatDate(dateString: string) {
  return new Date(dateString).toLocaleDateString("en-US", {
    month: "numeric",
    day: "numeric",
    year: "numeric",
  });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

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
    onChange(
      selected.includes(dayValue)
        ? selected.filter((d) => d !== dayValue)
        : [...selected, dayValue],
    );
  };
  return (
    <View style={s.dayPickerRow}>
      {DAYS_OF_WEEK_OPTIONS.map((day) => {
        const isSelected = selected.includes(day.value);
        return (
          <TouchableOpacity
            key={day.value}
            style={[s.dayChip, isSelected && s.dayChipSelected]}
            onPress={() => toggle(day.value)}
            disabled={disabled}
          >
            <Text style={[s.dayChipText, isSelected && s.dayChipTextSelected]}>
              {day.label.slice(0, 3)}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

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
  const displayText = value === undefined ? "Any" : value ? "Yes" : "No";
  return (
    <TouchableOpacity
      style={s.toggleRow}
      onPress={onToggle}
      disabled={disabled}
    >
      <View style={s.toggleInfo}>
        <Text style={s.toggleLabel}>{label}</Text>
        {description && <Text style={s.toggleDescription}>{description}</Text>}
      </View>
      <View
        style={[
          s.togglePill,
          value === true && s.togglePillYes,
          value === false && s.togglePillNo,
        ]}
      >
        <Text
          style={[
            s.togglePillText,
            value === true && s.togglePillTextYes,
            value === false && s.togglePillTextNo,
          ]}
        >
          {displayText}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

function AlertCard({
  alert,
  onEdit,
  onDelete,
}: {
  alert: SearchAlert;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const description =
    alert.description ||
    searchAlertService.generateAlertDescription(alert.filter_criteria);
  return (
    <View style={s.alertCard}>
      <View style={s.cardTopRow}>
        <Text style={s.alertName} numberOfLines={1}>
          {alert.name}
        </Text>
        <View style={[s.onOffBadge, alert.is_active ? s.onBadge : s.offBadge]}>
          <Text style={[s.onOffText, alert.is_active ? s.onText : s.offText]}>
            {alert.is_active ? "ON" : "OFF"}
          </Text>
        </View>
      </View>
      <Text style={s.alertDescription} numberOfLines={2}>
        {description}
      </Text>
      <Text style={s.matchInfo}>
        {alert.match_count} {alert.match_count === 1 ? "match" : "matches"}
        {alert.last_match_date
          ? ` · Last: ${formatDate(alert.last_match_date)}`
          : ""}
      </Text>
      <View style={s.actionRow}>
        <TouchableOpacity
          style={[s.actionButton, s.actionOutline]}
          onPress={onEdit}
        >
          <Text style={s.actionOutlineText}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.actionButton, s.actionDelete]}
          onPress={onDelete}
        >
          <Text style={s.actionDeleteText}>Delete</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── List View ────────────────────────────────────────────────────────────────

function ListView({
  userId,
  onNavigate,
  onClose,
}: {
  userId: number;
  onNavigate: (view: ModalView, alertId?: number) => void;
  onClose: () => void;
}) {
  const [alerts, setAlerts] = useState<SearchAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadAlerts = useCallback(async () => {
    try {
      setError(null);
      const data = await searchAlertService.getUserAlerts(userId);
      setAlerts(data);
    } catch (err) {
      setError("Failed to load your search alerts.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userId]);

  useEffect(() => {
    loadAlerts();
  }, [loadAlerts]);

  const handleDelete = (alert: SearchAlert) => {
    Alert.alert(
      "Delete Alert",
      `Are you sure you want to delete "${alert.name}"?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await searchAlertService.deleteAlert(alert.id);
              setAlerts((prev) => prev.filter((a) => a.id !== alert.id));
            } catch {
              Alert.alert("Error", "Failed to delete alert.");
            }
          },
        },
      ],
    );
  };

  const totalAlerts = alerts.length;
  const activeAlerts = alerts.filter((a) => a.is_active).length;
  const totalMatches = alerts.reduce((sum, a) => sum + a.match_count, 0);

  const renderHeader = () => (
    <>
      {/* Modal header */}
      <View style={s.header}>
        <View style={{ width: 40 }} />
        <Text style={s.headerTitle}>SEARCH ALERTS</Text>
        <TouchableOpacity style={s.closeButton} onPress={onClose}>
          <Text style={s.closeButtonText}>&#x2715;</Text>
        </TouchableOpacity>
      </View>
      <View style={s.divider} />

      {/* Stats */}
      <View style={s.statsBar}>
        <View style={s.statItem}>
          <Text style={s.statValue}>{totalAlerts}</Text>
          <Text style={s.statLabel}>Total</Text>
        </View>
        <View style={s.statItem}>
          <Text style={s.statValue}>{activeAlerts}</Text>
          <Text style={s.statLabel}>Active</Text>
        </View>
        <View style={s.statItem}>
          <Text style={s.statValue}>{totalMatches}</Text>
          <Text style={s.statLabel}>Matches</Text>
        </View>
      </View>

      {/* Create button */}
      <View style={s.createButtonWrapper}>
        <TouchableOpacity
          style={s.createButton}
          onPress={() => onNavigate("create")}
        >
          <Text style={s.createButtonText}>+ Create New Alert</Text>
        </TouchableOpacity>
      </View>

      {error && (
        <View style={s.errorContainer}>
          <Text style={s.errorText}>{error}</Text>
          <TouchableOpacity
            style={s.retryButton}
            onPress={() => {
              setLoading(true);
              loadAlerts();
            }}
          >
            <Text style={s.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}
    </>
  );

  const renderEmpty = () => (
    <View style={s.emptyState}>
      <Text style={s.emptyIcon}>🔔</Text>
      <Text style={s.emptyTitle}>No Search Alerts Yet</Text>
      <Text style={s.emptySubtitle}>
        Create an alert to get notified when tournaments match your criteria.
      </Text>
    </View>
  );

  if (loading) {
    return (
      <View style={s.loadingWrap}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={s.loadingText}>Loading search alerts...</Text>
      </View>
    );
  }

  return (
    <FlatList
      data={alerts}
      keyExtractor={(item) => item.id.toString()}
      style={{ flex: 1 }}
      contentContainerStyle={[
        s.listContent,
        alerts.length === 0 && s.listContentEmpty,
      ]}
      ListHeaderComponent={renderHeader}
      ListEmptyComponent={renderEmpty}
      renderItem={({ item }) => (
        <AlertCard
          alert={item}
          onEdit={() => onNavigate("edit", item.id)}
          onDelete={() => handleDelete(item)}
        />
      )}
      refreshControl={
        isWeb ? undefined : (
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              loadAlerts();
            }}
            tintColor={COLORS.primary}
          />
        )
      }
      showsVerticalScrollIndicator={false}
    />
  );
}

// ─── Create / Edit Form View ──────────────────────────────────────────────────

function FormView({
  userId,
  alertId,
  onBack,
  onClose,
}: {
  userId: number;
  alertId: number | null;
  onBack: () => void;
  onClose: () => void;
}) {
  const isEditMode = alertId !== null;
  const [form, setForm] = useState<FormState>(initialFormState);
  const [loading, setLoading] = useState(isEditMode);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stateOptions = [{ label: "Any State", value: "" }, ...US_STATES];
  const cityList = form.state ? US_CITIES_BY_STATE[form.state] || [] : [];
  const cityOptions = [
    { label: "Any City", value: "" },
    ...cityList.map((city: string) => ({ label: city, value: city })),
  ];

  useEffect(() => {
    if (isEditMode && alertId) {
      searchAlertService
        .getAlert(alertId)
        .then((alert) => {
          if (alert) setForm(criteriaToForm(alert));
          else setError("Alert not found.");
        })
        .catch(() => setError("Failed to load alert."))
        .finally(() => setLoading(false));
    }
  }, [alertId]);

  const updateField = (field: keyof FormState, value: any) => {
    setForm((prev) => {
      const updated = { ...prev, [field]: value };
      if (field === "state" && value !== prev.state) updated.city = "";
      return updated;
    });
  };

  const cycleTriState = (
    field: "reportsToFargo" | "calcutta" | "openTournament",
  ) => {
    setForm((prev) => {
      const current = prev[field];
      const next =
        current === undefined ? true : current === true ? false : undefined;
      return { ...prev, [field]: next };
    });
  };

  const doSave = async () => {
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
      } else {
        await searchAlertService.createAlert(userId, {
          name: form.name.trim(),
          description,
          filter_criteria: criteria,
          is_active: form.isActive,
        });
      }
      onBack();
    } catch (err: any) {
      setError(err.message || "Failed to save alert.");
    } finally {
      setSaving(false);
    }
  };

  const handleSave = () => {
    if (!form.name.trim()) {
      Alert.alert("Error", "Please enter an alert name.");
      return;
    }
    const criteria = formToCriteria(form);
    if (Object.keys(criteria).length === 0) {
      Alert.alert(
        "No Filters",
        "No filters set — this alert will match every tournament.",
        [
          { text: "Add Filters", style: "cancel" },
          { text: "Save Anyway", onPress: doSave },
        ],
      );
      return;
    }
    doSave();
  };

  const generatePreview = () => {
    const criteria = formToCriteria(form);
    return searchAlertService.generateAlertDescription(criteria);
  };

  if (loading) {
    return (
      <View style={s.loadingWrap}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={s.loadingText}>Loading alert...</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity style={s.backButton} onPress={onBack}>
          <Text style={s.backButtonText}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>
          {isEditMode ? "EDIT ALERT" : "CREATE ALERT"}
        </Text>
        <TouchableOpacity style={s.closeButton} onPress={onClose}>
          <Text style={s.closeButtonText}>&#x2715;</Text>
        </TouchableOpacity>
      </View>
      <View style={s.divider} />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={s.formScrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {error && (
          <View style={s.errorContainer}>
            <Text style={s.errorText}>{error}</Text>
          </View>
        )}

        {/* Alert Info */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Alert Info</Text>
          <View style={s.fieldContainer}>
            <Text style={s.fieldLabel}>
              Alert Name <Text style={s.required}>*</Text>
            </Text>
            <TextInput
              style={s.textInput}
              placeholder='e.g. "9-Ball in Arizona"'
              placeholderTextColor={COLORS.textMuted}
              value={form.name}
              onChangeText={(v) => updateField("name", v)}
              editable={!saving}
              autoCapitalize="words"
              maxLength={100}
            />
          </View>
          <View style={s.fieldContainer}>
            <Text style={s.fieldLabel}>Description (optional)</Text>
            <TextInput
              style={[s.textInput, s.textInputMultiline]}
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
          <View style={s.switchRow}>
            <View style={s.switchInfo}>
              <Text style={s.fieldLabel}>Alert Active</Text>
              <Text style={s.switchDescription}>
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

        {/* Game Filters */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Game Filters</Text>
          <View style={s.fieldContainer}>
            <Text style={s.fieldLabel}>Game Type</Text>
            <Dropdown
              placeholder="Any Game Type"
              options={GAME_TYPE_OPTIONS}
              value={form.gameType}
              onSelect={(v: string) => updateField("gameType", v)}
              disabled={saving}
            />
            {form.gameType && !form.gameType.includes("scotch") && (
              <Text style={s.fieldHint}>
                💡 This will also match scotch doubles versions
              </Text>
            )}
          </View>
          <View style={s.fieldContainer}>
            <Text style={s.fieldLabel}>Tournament Format</Text>
            <Dropdown
              placeholder="Any Format"
              options={FORMAT_OPTIONS}
              value={form.tournamentFormat}
              onSelect={(v: string) => updateField("tournamentFormat", v)}
              disabled={saving}
            />
          </View>
          <View style={s.fieldContainer}>
            <Text style={s.fieldLabel}>Table Size</Text>
            <Dropdown
              placeholder="Any Table Size"
              options={TABLE_SIZE_OPTIONS}
              value={form.tableSize}
              onSelect={(v: string) => updateField("tableSize", v)}
              disabled={saving}
            />
          </View>
          <View style={s.fieldContainer}>
            <Text style={s.fieldLabel}>Equipment</Text>
            <TextInput
              style={s.textInput}
              placeholder='"Diamond", "Brunswick"'
              placeholderTextColor={COLORS.textMuted}
              value={form.equipment}
              onChangeText={(v) => updateField("equipment", v)}
              editable={!saving}
              autoCapitalize="words"
            />
          </View>
        </View>

        {/* Location */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Location</Text>
          <View style={s.fieldContainer}>
            <Text style={s.fieldLabel}>State</Text>
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
          <View style={s.fieldContainer}>
            <Text style={s.fieldLabel}>City</Text>
            <Dropdown
              placeholder={!form.state ? "Select a state first" : "Any City"}
              options={cityOptions}
              value={form.city}
              onSelect={(v: string) => updateField("city", v)}
              disabled={saving || !form.state}
              searchable
              searchPlaceholder="Search cities..."
            />
          </View>
        </View>

        {/* Entry Fee & Fargo */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Entry Fee & Skill Level</Text>
          <View style={s.rowFields}>
            <View style={[s.fieldContainer, s.fieldHalf]}>
              <Text style={s.fieldLabel}>Min Entry Fee ($)</Text>
              <TextInput
                style={s.textInput}
                placeholder="0"
                placeholderTextColor={COLORS.textMuted}
                value={form.entryFeeMin}
                onChangeText={(v) => updateField("entryFeeMin", v)}
                editable={!saving}
                keyboardType="numeric"
              />
            </View>
            <View style={[s.fieldContainer, s.fieldHalf]}>
              <Text style={s.fieldLabel}>Max Entry Fee ($)</Text>
              <TextInput
                style={s.textInput}
                placeholder="Any"
                placeholderTextColor={COLORS.textMuted}
                value={form.entryFeeMax}
                onChangeText={(v) => updateField("entryFeeMax", v)}
                editable={!saving}
                keyboardType="numeric"
              />
            </View>
          </View>
          <View style={s.fieldContainer}>
            <Text style={s.fieldLabel}>Max Fargo Rating</Text>
            <TextInput
              style={s.textInput}
              placeholder="e.g. 600 (leave blank for any)"
              placeholderTextColor={COLORS.textMuted}
              value={form.fargoMax}
              onChangeText={(v) => updateField("fargoMax", v)}
              editable={!saving}
              keyboardType="numeric"
            />
          </View>
        </View>

        {/* Toggle Filters */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Additional Filters</Text>
          <Text style={s.sectionHint}>Tap to cycle: Any → Yes → No → Any</Text>
          <ToggleRow
            label="Reports to Fargo"
            description="Tournament results reported to FargoRate"
            value={form.reportsToFargo}
            onToggle={() => cycleTriState("reportsToFargo")}
            disabled={saving}
          />
          <ToggleRow
            label="Calcutta"
            description="Tournament includes a Calcutta auction"
            value={form.calcutta}
            onToggle={() => cycleTriState("calcutta")}
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

        {/* Days of Week */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Days of Week</Text>
          <Text style={s.sectionHint}>Leave empty to match any day</Text>
          <DayPicker
            selected={form.daysOfWeek}
            onChange={(days) => updateField("daysOfWeek", days)}
            disabled={saving}
          />
        </View>

        {/* Preview */}
        <View style={s.previewContainer}>
          <Text style={s.previewLabel}>Alert Preview</Text>
          <Text style={s.previewText}>
            {form.name.trim() || "Untitled Alert"} — {generatePreview()}
          </Text>
        </View>
      </ScrollView>

      {/* Footer */}
      <View style={s.divider} />
      <View style={s.footer}>
        <TouchableOpacity
          style={[
            s.saveButton,
            (!form.name.trim() || saving) && s.buttonDisabled,
          ]}
          onPress={handleSave}
          disabled={!form.name.trim() || saving}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={s.saveButtonText}>
              {isEditMode ? "Save Changes" : "Create Alert"}
            </Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={s.cancelButton}
          onPress={onBack}
          disabled={saving}
        >
          <Text style={s.cancelButtonText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

// ─── Modal Shell ──────────────────────────────────────────────────────────────

export function SearchAlertsModal({
  visible,
  onClose,
}: SearchAlertsModalProps) {
  const { profile } = useAuthContext();
  const [view, setView] = useState<ModalView>("list");
  const [editingAlertId, setEditingAlertId] = useState<number | null>(null);

  // Reset to list whenever modal opens
  useEffect(() => {
    if (visible) {
      setView("list");
      setEditingAlertId(null);
    }
  }, [visible]);

  if (!visible) return null;

  const handleNavigate = (nextView: ModalView, alertId?: number) => {
    setEditingAlertId(alertId ?? null);
    setView(nextView);
  };

  const handleBack = () => {
    setView("list");
    setEditingAlertId(null);
  };

  const handleClose = () => {
    setView("list");
    setEditingAlertId(null);
    onClose();
  };

  const userId = profile?.id_auto;

  const innerContent = !userId ? (
    <View style={s.loadingWrap}>
      <Text style={s.loadingText}>Not logged in.</Text>
    </View>
  ) : view === "list" ? (
    <ListView
      userId={userId}
      onNavigate={handleNavigate}
      onClose={handleClose}
    />
  ) : (
    <FormView
      userId={userId}
      alertId={editingAlertId}
      onBack={handleBack}
      onClose={handleClose}
    />
  );

  // ── Web: fixed overlay ───────────────────────────────────────────
  if (isWeb) {
    return (
      <>
        <TouchableOpacity
          style={s.backdrop}
          activeOpacity={1}
          onPress={handleClose}
        />
        <View style={s.dialogWrap} pointerEvents="box-none">
          <View style={s.dialog}>{innerContent}</View>
        </View>
      </>
    );
  }

  // ── Mobile: React Native Modal ───────────────────────────────────
  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={handleClose}
    >
      <View style={s.mobileOverlay}>
        <TouchableOpacity
          style={StyleSheet.absoluteFillObject}
          activeOpacity={1}
          onPress={handleClose}
        />
        <View style={s.mobileContainer}>{innerContent}</View>
        {/* Red close button */}
        <TouchableOpacity style={s.mobileCloseButton} onPress={handleClose}>
          <Text style={s.mobileCloseButtonText}>Close</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  // Web overlay
  backdrop: {
    position: "fixed" as any,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.75)",
    zIndex: 2000,
  },
  dialogWrap: {
    position: "fixed" as any,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 2001,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  dialog: {
    width: 700,
    maxWidth: "92%" as any,
    height: "95vh" as any,
    backgroundColor: "#000000",
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: "#2C2C2E",
    overflow: "hidden" as any,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 24,
    display: "flex" as any,
    flexDirection: "column",
  },

  // Mobile overlay
  mobileOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.75)",
    justifyContent: "flex-end",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 110,
  },
  mobileContainer: {
    backgroundColor: COLORS.background,
    borderRadius: 20,
    width: "100%" as any,
    maxWidth: 500,
    height: "85%" as any,
    overflow: "hidden",
  },
  mobileCloseButton: {
    backgroundColor: "#E74C3C",
    borderRadius: 12,
    margin: 12,
    width: "100%" as any,
    maxWidth: 500,
    paddingVertical: SPACING.md,
    alignItems: "center",
  },
  mobileCloseButtonText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: FONT_SIZES.md,
  },

  // Shared header
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.md,
  },
  headerTitle: {
    color: COLORS.text,
    fontSize: FONT_SIZES.lg,
    fontWeight: "700",
    letterSpacing: 1,
  },
  closeButton: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  closeButtonText: { color: COLORS.text, fontSize: 20, fontWeight: "700" },
  backButton: {
    width: 70,
    justifyContent: "center",
  },
  backButtonText: {
    fontSize: FONT_SIZES.md,
    color: COLORS.primary,
    fontWeight: "600",
  },
  divider: { height: 1, backgroundColor: "#2C2C2E" },

  // Loading
  loadingWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: SPACING.xl,
  },
  loadingText: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZES.md,
    marginTop: SPACING.md,
  },

  // List view
  statsBar: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingVertical: SPACING.lg,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  statItem: { alignItems: "center" },
  statValue: {
    fontSize: FONT_SIZES.xl,
    fontWeight: "700",
    color: COLORS.primary,
  },
  statLabel: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  createButtonWrapper: { padding: SPACING.md },
  createButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.md,
    alignItems: "center",
  },
  createButtonText: {
    color: COLORS.white,
    fontSize: FONT_SIZES.md,
    fontWeight: "600",
  },
  listContent: { paddingBottom: SPACING.xl },
  listContentEmpty: { flexGrow: 1 },

  // Alert card
  alertCard: {
    backgroundColor: COLORS.backgroundCard,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    marginHorizontal: SPACING.md,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cardTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: SPACING.sm,
  },
  alertName: {
    fontSize: FONT_SIZES.lg,
    fontWeight: "700",
    color: COLORS.text,
    flex: 1,
    marginRight: SPACING.sm,
  },
  onOffBadge: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.md,
  },
  onBadge: { backgroundColor: COLORS.primary },
  offBadge: { backgroundColor: COLORS.textMuted + "40" },
  onOffText: { fontSize: FONT_SIZES.sm, fontWeight: "700" },
  onText: { color: COLORS.white },
  offText: { color: COLORS.textMuted },
  alertDescription: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textSecondary,
    lineHeight: 20,
    marginBottom: SPACING.xs,
  },
  matchInfo: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textMuted,
    marginBottom: SPACING.lg,
  },
  actionRow: { flexDirection: "row", gap: SPACING.sm },
  actionButton: {
    flex: 1,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.md,
    alignItems: "center",
    justifyContent: "center",
  },
  actionOutline: { borderWidth: 1, borderColor: COLORS.border },
  actionOutlineText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: "600",
    color: COLORS.text,
  },
  actionDelete: {
    borderWidth: 1,
    borderColor: COLORS.error + "60",
    backgroundColor: COLORS.error + "10",
  },
  actionDeleteText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: "600",
    color: COLORS.error,
  },

  // Empty state
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: SPACING.xl * 2,
    paddingHorizontal: SPACING.lg,
  },
  emptyIcon: { fontSize: 60, marginBottom: SPACING.md },
  emptyTitle: {
    fontSize: FONT_SIZES.lg,
    color: COLORS.text,
    fontWeight: "600",
    marginBottom: SPACING.sm,
    textAlign: "center",
  },
  emptySubtitle: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textSecondary,
    textAlign: "center",
    lineHeight: 20,
  },

  // Error
  errorContainer: {
    backgroundColor: COLORS.error + "20",
    padding: SPACING.md,
    marginHorizontal: SPACING.md,
    marginBottom: SPACING.md,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.error,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  errorText: { color: COLORS.error, fontSize: FONT_SIZES.sm, flex: 1 },
  retryButton: {
    backgroundColor: COLORS.error,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.sm,
  },
  retryText: {
    color: COLORS.white,
    fontSize: FONT_SIZES.sm,
    fontWeight: "600",
  },

  // Form view
  formScrollContent: { padding: SPACING.md, paddingBottom: SPACING.xl },
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
  fieldContainer: { marginBottom: SPACING.md },
  fieldLabel: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.text,
    fontWeight: "500",
    marginBottom: SPACING.sm,
  },
  required: { color: COLORS.error },
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
  textInputMultiline: { minHeight: 60, textAlignVertical: "top" },
  rowFields: { flexDirection: "row", gap: SPACING.md },
  fieldHalf: { flex: 1 },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: SPACING.sm,
  },
  switchInfo: { flex: 1, marginRight: SPACING.md },
  switchDescription: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  toggleInfo: { flex: 1, marginRight: SPACING.md },
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
  togglePillTextYes: { color: COLORS.primary },
  togglePillTextNo: { color: COLORS.error },
  dayPickerRow: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.sm },
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
  dayChipTextSelected: { color: COLORS.white },
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
  previewText: { fontSize: FONT_SIZES.sm, color: COLORS.text, lineHeight: 20 },

  // Form footer
  footer: { flexDirection: "row", gap: SPACING.sm, padding: SPACING.md },
  saveButton: {
    flex: 1,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.primary,
  },
  saveButtonText: { fontSize: FONT_SIZES.md, color: "#fff", fontWeight: "600" },
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
  buttonDisabled: { opacity: 0.5 },
});
