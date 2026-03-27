import { useEffect, useState } from "react";
import {
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { analyticsService } from "../../../models/services/analytics.service";
import { Filters, defaultFilters, getFargoMax, isScotchDoubles } from "../../../models/types/filter.types";
import { COLORS } from "../../../theme/colors";
import { RADIUS, SPACING } from "../../../theme/spacing";
import { FONT_SIZES } from "../../../theme/typography";
import { moderateScale, scale } from "../../../utils/scaling";
import { DatePicker } from "./date-picker";
import { Dropdown } from "./dropdown";
import { RangeSlider } from "./range-slider";

const isWeb = Platform.OS === "web";

const GAME_TYPES = [
  { label: "All Game Types", value: "" },
  { label: "8 Ball", value: "8-ball" },
  { label: "9 Ball", value: "9-ball" },
  { label: "10 Ball", value: "10-ball" },
  { label: "8 Ball Scotch Doubles", value: "8-ball-scotch-doubles" },
  { label: "9 Ball Scotch Doubles", value: "9-ball-scotch-doubles" },
  { label: "10 Ball Scotch Doubles", value: "10-ball-scotch-doubles" },
  { label: "One Pocket", value: "one-pocket" },
  { label: "Straight Pool", value: "straight-pool" },
  { label: "Banks", value: "banks" },
];

const TOURNAMENT_FORMATS = [
  { label: "Select The Format", value: "" },
  { label: "Single Elimination", value: "single_elimination" },
  { label: "Double Elimination", value: "double_elimination" },
  { label: "Round Robin", value: "round_robin" },
  { label: "Swiss", value: "swiss" },
  { label: "Split Bracket", value: "split-bracket" },
];

const TABLE_SIZES = [
  { label: "All Table Sizes", value: "" },
  { label: "7ft", value: "7ft" },
  { label: "8ft", value: "8ft" },
  { label: "9ft", value: "9ft" },
];

const DAYS_OF_WEEK = [
  { label: "M", value: 1 },
  { label: "T", value: 2 },
  { label: "W", value: 3 },
  { label: "Th", value: 4 },
  { label: "F", value: 5 },
  { label: "Sa", value: 6 },
  { label: "Su", value: 0 },
];

interface FilterModalProps {
  visible: boolean;
  onClose: () => void;
  filters: Filters;
  onApply: (filters: Filters) => void;
}

export const FilterModal = ({ visible, onClose, filters, onApply }: FilterModalProps) => {
  const [localFilters, setLocalFilters] = useState<Filters>(filters);

  const fargoMax = getFargoMax(localFilters.gameType);
  const scotchSelected = isScotchDoubles(localFilters.gameType);
  const fargoMaxLabel = scotchSelected ? "2000+" : "1000+";
  const fargoMaxDisplay = scotchSelected ? 2000 : 1000;

  useEffect(() => {
    if (visible) setLocalFilters(filters);
  }, [visible]);

  const handleGameTypeChange = (value: string) => {
    const newFargoMax = getFargoMax(value);
    setLocalFilters({ ...localFilters, gameType: value, maxFargo: Math.min(localFilters.maxFargo, newFargoMax) });
  };

  const handleApply = () => {
    onApply(localFilters);
    const activeFilters: Record<string, any> = {};
    if (localFilters.gameType) activeFilters.gameType = localFilters.gameType;
    if (localFilters.tournamentFormat) activeFilters.tournamentFormat = localFilters.tournamentFormat;
    if (localFilters.tableSize) activeFilters.tableSize = localFilters.tableSize;
    if (localFilters.equipment) activeFilters.equipment = localFilters.equipment;
    if (localFilters.daysOfWeek.length > 0) activeFilters.daysOfWeek = localFilters.daysOfWeek;
    if (localFilters.fromDate) activeFilters.fromDate = localFilters.fromDate;
    if (localFilters.toDate) activeFilters.toDate = localFilters.toDate;
    if (localFilters.minEntryFee > 0) activeFilters.minEntryFee = localFilters.minEntryFee;
    if (localFilters.maxEntryFee < 1000) activeFilters.maxEntryFee = localFilters.maxEntryFee;
    if (localFilters.minFargo > 0) activeFilters.minFargo = localFilters.minFargo;
    if (localFilters.maxFargo < fargoMax) activeFilters.maxFargo = localFilters.maxFargo;
    if (localFilters.requiresFargoGames) activeFilters.requiresFargoGames = true;
    if (localFilters.reportsToFargo) activeFilters.reportsToFargo = true;
    if (localFilters.calcutta) activeFilters.calcutta = true;
    if (localFilters.openTournament) activeFilters.openTournament = true;
    analyticsService.trackFiltersChanged({ filters: activeFilters, source_screen: "billiards" });
    onClose();
  };

  const handleReset = () => {
    const r = { ...defaultFilters };
    setLocalFilters(r);
    onApply(r);
  };

  const toggleDay = (day: number) => {
    const days = localFilters.daysOfWeek;
    setLocalFilters({ ...localFilters, daysOfWeek: days.includes(day) ? days.filter((d) => d !== day) : [...days, day] });
  };

  const toggleCheckbox = (field: "requiresFargoGames" | "reportsToFargo" | "calcutta" | "openTournament") => {
    setLocalFilters({ ...localFilters, [field]: !localFilters[field] });
  };

  const renderDropdowns = () => (
    <>
      <Dropdown label="Game Type" placeholder="All Game Types" options={GAME_TYPES} value={localFilters.gameType} onSelect={handleGameTypeChange} />
      <Dropdown label="Tournament Format" placeholder="Select The Format" options={TOURNAMENT_FORMATS} value={localFilters.tournamentFormat} onSelect={(v) => setLocalFilters({ ...localFilters, tournamentFormat: v })} />
      <Dropdown label="Table Size" placeholder="All Table Sizes" options={TABLE_SIZES} value={localFilters.tableSize} onSelect={(v) => setLocalFilters({ ...localFilters, tableSize: v })} />
      <Text allowFontScaling={false} style={mStyles.label}>Equipment / Brand</Text>
      <TextInput allowFontScaling={false} style={mStyles.textInput} placeholder="e.g. Diamond, Brunswick, Olhausen" placeholderTextColor={COLORS.textMuted} value={localFilters.equipment} onChangeText={(t) => setLocalFilters({ ...localFilters, equipment: t })} />
      <Text allowFontScaling={false} style={mStyles.label}>Days of Week</Text>
      <View style={mStyles.daysRow}>
        {DAYS_OF_WEEK.map((day) => (
          <TouchableOpacity key={day.value} style={[mStyles.dayButton, localFilters.daysOfWeek.includes(day.value) && mStyles.dayButtonActive]} onPress={() => toggleDay(day.value)}>
            <Text allowFontScaling={false} style={[mStyles.dayButtonText, localFilters.daysOfWeek.includes(day.value) && mStyles.dayButtonTextActive]}>{day.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <Text allowFontScaling={false} style={mStyles.sectionTitle}>Tournament Date Range</Text>
      <View style={mStyles.dateRow}>
        <DatePicker value={localFilters.fromDate} onChange={(d) => setLocalFilters({ ...localFilters, fromDate: d })} placeholder="From Date" />
        <DatePicker value={localFilters.toDate} onChange={(d) => setLocalFilters({ ...localFilters, toDate: d })} placeholder="To Date" />
      </View>
    </>
  );

  const renderSliders = () => (
    <>
      <RangeSlider label="Entry Fee Range" minValue={localFilters.minEntryFee} maxValue={localFilters.maxEntryFee} min={0} max={1000} step={10} onValueChange={(mn, mx) => setLocalFilters({ ...localFilters, minEntryFee: mn, maxEntryFee: mx })} formatValue={(v) => (v >= 1000 ? "$1000+" : `$${v}`)} minLabel="$0" maxLabel="$1000+" />
      {scotchSelected && <Text allowFontScaling={false} style={mStyles.fargoNote}>Combined team Fargo for Scotch Doubles</Text>}
      <RangeSlider label="Fargo Rating Range" minValue={localFilters.minFargo} maxValue={Math.min(localFilters.maxFargo, fargoMaxDisplay)} min={0} max={fargoMaxDisplay} step={10} onValueChange={(mn, mx) => setLocalFilters({ ...localFilters, minFargo: mn, maxFargo: mx })} formatValue={(v) => v >= fargoMaxDisplay ? `${fargoMaxDisplay}+` : v.toString()} minLabel="0" maxLabel={fargoMaxLabel} />
    </>
  );

  const renderCheckboxes = () => (
    <>
      {(["requiresFargoGames", "calcutta", "openTournament"] as const).map((field) => {
        const labels: Record<string, string> = {
          requiresFargoGames: "Minimum Required Fargo Games",
          calcutta: "Calcutta",
          openTournament: "Open Tournament",
        };
        return (
          <TouchableOpacity key={field} style={mStyles.checkboxRow} onPress={() => toggleCheckbox(field)}>
            <View style={[mStyles.checkbox, localFilters[field] && mStyles.checkboxActive]}>
              {localFilters[field] && <Text allowFontScaling={false} style={mStyles.checkmark}>✓</Text>}
            </View>
            <Text allowFontScaling={false} style={mStyles.checkboxLabel}>{labels[field]}</Text>
          </TouchableOpacity>
        );
      })}
    </>
  );

  const renderFooter = () => (
    <View style={mStyles.footer}>
      <TouchableOpacity style={mStyles.applyButton} onPress={handleApply}>
        <Text allowFontScaling={false} style={mStyles.applyButtonText}>Apply Filters</Text>
      </TouchableOpacity>
      <TouchableOpacity style={mStyles.resetButton} onPress={handleReset}>
        <Text allowFontScaling={false} style={mStyles.resetButtonText}>Reset All</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <Modal visible={visible} animationType={isWeb ? "fade" : "slide"} transparent onRequestClose={onClose}>
      <View style={[mStyles.overlay, isWeb && wStyles.overlay]}>
        <View style={[mStyles.container, isWeb && wStyles.container]}>
          <View style={mStyles.header}>
            <Text allowFontScaling={false} style={mStyles.title}>Tournament Filters</Text>
            <TouchableOpacity onPress={onClose} style={mStyles.closeButton}>
              <Text allowFontScaling={false} style={mStyles.closeButtonText}>✕</Text>
            </TouchableOpacity>
          </View>
          {isWeb ? (
            <View style={wStyles.body}>
              <View style={wStyles.twoCol}>
                <View style={wStyles.col}>{renderDropdowns()}</View>
                <View style={wStyles.col}>{renderSliders()}{renderCheckboxes()}</View>
              </View>
            </View>
          ) : (
            <ScrollView style={mStyles.content} showsVerticalScrollIndicator={false}>
              {renderDropdowns()}
              {renderSliders()}
              {renderCheckboxes()}
              <View style={{ height: scale(SPACING.xl) }} />
            </ScrollView>
          )}
          {renderFooter()}
        </View>
      </View>
    </Modal>
  );
};

const mStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "center", alignItems: "center", padding: scale(SPACING.lg) },
  container: { backgroundColor: COLORS.background, borderRadius: RADIUS.xl, width: "100%", maxHeight: "90%" },
  header: { flexDirection: "row", justifyContent: "center", alignItems: "center", padding: scale(SPACING.md), borderBottomWidth: 1, borderBottomColor: COLORS.border },
  title: { fontSize: moderateScale(FONT_SIZES.lg), fontWeight: "600", color: COLORS.text },
  closeButton: { position: "absolute", right: scale(SPACING.md), backgroundColor: "#E53935", width: scale(36), height: scale(36), borderRadius: RADIUS.sm, alignItems: "center", justifyContent: "center" },
  closeButtonText: { fontSize: moderateScale(FONT_SIZES.lg), color: COLORS.white, fontWeight: "600" },
  content: { padding: scale(SPACING.md) },
  label: { fontSize: moderateScale(FONT_SIZES.sm), color: COLORS.textSecondary, marginBottom: scale(SPACING.sm), marginTop: scale(SPACING.md) },
  sectionTitle: { fontSize: moderateScale(FONT_SIZES.md), fontWeight: "600", color: COLORS.text, marginTop: scale(SPACING.lg), marginBottom: scale(SPACING.sm) },
  fargoNote: { fontSize: moderateScale(FONT_SIZES.xs), color: COLORS.primary, marginTop: scale(SPACING.sm), marginBottom: -scale(SPACING.xs), fontStyle: "italic" },
  textInput: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, paddingVertical: scale(SPACING.md), paddingHorizontal: scale(SPACING.md), fontSize: moderateScale(FONT_SIZES.md), color: COLORS.text },
  daysRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: scale(SPACING.md) },
  dayButton: { width: scale(40), height: scale(40), borderRadius: scale(20), borderWidth: 1, borderColor: COLORS.border, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.surface },
  dayButtonActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  dayButtonText: { fontSize: moderateScale(FONT_SIZES.sm), color: COLORS.textSecondary },
  dayButtonTextActive: { color: COLORS.white, fontWeight: "600" },
  dateRow: { flexDirection: "row", gap: scale(SPACING.md) },
  checkboxRow: { flexDirection: "row", alignItems: "center", marginTop: scale(SPACING.md) },
  checkbox: { width: scale(24), height: scale(24), borderRadius: RADIUS.sm, borderWidth: 2, borderColor: COLORS.border, marginRight: scale(SPACING.md), alignItems: "center", justifyContent: "center", backgroundColor: COLORS.surface },
  checkboxActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  checkmark: { color: COLORS.white, fontSize: moderateScale(FONT_SIZES.sm), fontWeight: "600" },
  checkboxLabel: { fontSize: moderateScale(FONT_SIZES.md), color: COLORS.text },
  footer: { flexDirection: "row", padding: scale(SPACING.md), borderTopWidth: 1, borderTopColor: COLORS.border, gap: scale(SPACING.md) },
  applyButton: { flex: 1, backgroundColor: "#4CAF50", borderRadius: RADIUS.md, padding: scale(SPACING.md), alignItems: "center" },
  applyButtonText: { fontSize: moderateScale(FONT_SIZES.md), color: COLORS.white, fontWeight: "600" },
  resetButton: { flex: 1, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, padding: scale(SPACING.md), alignItems: "center" },
  resetButtonText: { fontSize: moderateScale(FONT_SIZES.md), color: COLORS.text },
});

const wStyles = StyleSheet.create({
  overlay: { justifyContent: "center", alignItems: "center", padding: 40 },
  container: { width: 780, maxWidth: "90%" as any, borderRadius: RADIUS.lg, overflow: "visible" as any },
  body: { padding: scale(SPACING.md), overflow: "visible" as any },
  twoCol: { flexDirection: "row", gap: scale(SPACING.xl), overflow: "visible" as any },
  col: { flex: 1, overflow: "visible" as any },
});
