import { useEffect, useState } from "react";
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { COLORS } from "../../../theme/colors";
import { RADIUS, SPACING } from "../../../theme/spacing";
import { FONT_SIZES } from "../../../theme/typography";
import { DatePicker } from "./date-picker";
import { Dropdown } from "./dropdown";
import { RangeSlider } from "./range-slider";

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

export interface Filters {
  gameType: string;
  tournamentFormat: string;
  tableSize: string;
  equipment: string;
  daysOfWeek: number[];
  fromDate: string;
  toDate: string;
  minEntryFee: number;
  maxEntryFee: number;
  minFargo: number;
  maxFargo: number;
  requiresFargoGames: boolean;
  reportsToFargo: boolean;
  openTournament: boolean;
}

export const defaultFilters: Filters = {
  gameType: "",
  tournamentFormat: "",
  tableSize: "",
  equipment: "",
  daysOfWeek: [],
  fromDate: "",
  toDate: "",
  minEntryFee: 0,
  maxEntryFee: 1000,
  minFargo: 0,
  maxFargo: 900,
  requiresFargoGames: false,
  reportsToFargo: false,
  openTournament: false,
};

interface FilterModalProps {
  visible: boolean;
  onClose: () => void;
  filters: Filters;
  onApply: (filters: Filters) => void;
}

export const FilterModal = ({
  visible,
  onClose,
  filters,
  onApply,
}: FilterModalProps) => {
  const [localFilters, setLocalFilters] = useState<Filters>(filters);

  useEffect(() => {
    if (visible) {
      setLocalFilters(filters);
    }
  }, [visible]);

  const handleApply = () => {
    onApply(localFilters);
    onClose();
  };

  const handleReset = () => {
    const resetFilters = { ...defaultFilters };
    setLocalFilters(resetFilters);
    onApply(resetFilters);
  };

  const toggleDay = (day: number) => {
    const days = localFilters.daysOfWeek;
    if (days.includes(day)) {
      setLocalFilters({
        ...localFilters,
        daysOfWeek: days.filter((d) => d !== day),
      });
    } else {
      setLocalFilters({ ...localFilters, daysOfWeek: [...days, day] });
    }
  };

  const toggleCheckbox = (
    field: "requiresFargoGames" | "reportsToFargo" | "openTournament",
  ) => {
    setLocalFilters({ ...localFilters, [field]: !localFilters[field] });
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.title}>Tournament Filters</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.content}
            showsVerticalScrollIndicator={false}
          >
            {/* Game Type */}
            <Dropdown
              label="Game Type"
              placeholder="All Game Types"
              options={GAME_TYPES}
              value={localFilters.gameType}
              onSelect={(value) =>
                setLocalFilters({ ...localFilters, gameType: value })
              }
            />

            {/* Tournament Format */}
            <Dropdown
              label="Tournament Format"
              placeholder="Select The Format"
              options={TOURNAMENT_FORMATS}
              value={localFilters.tournamentFormat}
              onSelect={(value) =>
                setLocalFilters({ ...localFilters, tournamentFormat: value })
              }
            />

            {/* Table Size */}
            <Dropdown
              label="Table Size"
              placeholder="All Table Sizes"
              options={TABLE_SIZES}
              value={localFilters.tableSize}
              onSelect={(value) =>
                setLocalFilters({ ...localFilters, tableSize: value })
              }
            />

            {/* Equipment */}
            <Text style={styles.label}>Equipment / Brand</Text>
            <TextInput
              style={styles.textInput}
              placeholder="e.g. Diamond, Brunswick, Olhausen"
              placeholderTextColor={COLORS.textMuted}
              value={localFilters.equipment}
              onChangeText={(text) =>
                setLocalFilters({ ...localFilters, equipment: text })
              }
            />

            {/* Days of Week */}
            <Text style={styles.label}>Days of Week</Text>
            <View style={styles.daysRow}>
              {DAYS_OF_WEEK.map((day) => (
                <TouchableOpacity
                  key={day.value}
                  style={[
                    styles.dayButton,
                    localFilters.daysOfWeek.includes(day.value) &&
                      styles.dayButtonActive,
                  ]}
                  onPress={() => toggleDay(day.value)}
                >
                  <Text
                    style={[
                      styles.dayButtonText,
                      localFilters.daysOfWeek.includes(day.value) &&
                        styles.dayButtonTextActive,
                    ]}
                  >
                    {day.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Date Range */}
            <Text style={styles.sectionTitle}>Tournament Date Range</Text>
            <View style={styles.dateRow}>
              <DatePicker
                value={localFilters.fromDate}
                onChange={(date) =>
                  setLocalFilters({ ...localFilters, fromDate: date })
                }
                placeholder="From Date"
              />
              <DatePicker
                value={localFilters.toDate}
                onChange={(date) =>
                  setLocalFilters({ ...localFilters, toDate: date })
                }
                placeholder="To Date"
              />
            </View>

            {/* Entry Fee Range */}
            <RangeSlider
              label="Entry Fee Range"
              minValue={localFilters.minEntryFee}
              maxValue={localFilters.maxEntryFee}
              min={0}
              max={1000}
              step={10}
              onValueChange={(minVal, maxVal) =>
                setLocalFilters({
                  ...localFilters,
                  minEntryFee: minVal,
                  maxEntryFee: maxVal,
                })
              }
              formatValue={(v) => (v >= 1000 ? "$1000+" : `$${v}`)}
              minLabel="$0"
              maxLabel="$1000+"
            />

            {/* Fargo Rating Range */}
            <RangeSlider
              label="Fargo Rating Range"
              minValue={localFilters.minFargo}
              maxValue={localFilters.maxFargo}
              min={0}
              max={900}
              step={10}
              onValueChange={(minVal, maxVal) =>
                setLocalFilters({
                  ...localFilters,
                  minFargo: minVal,
                  maxFargo: maxVal,
                })
              }
              formatValue={(v) => (v >= 900 ? "900+" : v.toString())}
              minLabel="0"
              maxLabel="900+"
            />

            {/* Checkboxes */}
            <TouchableOpacity
              style={styles.checkboxRow}
              onPress={() => toggleCheckbox("requiresFargoGames")}
            >
              <View
                style={[
                  styles.checkbox,
                  localFilters.requiresFargoGames && styles.checkboxActive,
                ]}
              >
                {localFilters.requiresFargoGames && (
                  <Text style={styles.checkmark}>✓</Text>
                )}
              </View>
              <Text style={styles.checkboxLabel}>
                Minimum Required Fargo Games
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.checkboxRow}
              onPress={() => toggleCheckbox("openTournament")}
            >
              <View
                style={[
                  styles.checkbox,
                  localFilters.openTournament && styles.checkboxActive,
                ]}
              >
                {localFilters.openTournament && (
                  <Text style={styles.checkmark}>✓</Text>
                )}
              </View>
              <Text style={styles.checkboxLabel}>Open Tournament</Text>
            </TouchableOpacity>

            <View style={styles.bottomSpacer} />
          </ScrollView>

          <View style={styles.footer}>
            <TouchableOpacity style={styles.applyButton} onPress={handleApply}>
              <Text style={styles.applyButtonText}>Apply Filters</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.resetButton} onPress={handleReset}>
              <Text style={styles.resetButtonText}>Reset All</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "center",
    alignItems: "center",
    padding: SPACING.lg,
  },
  container: {
    backgroundColor: COLORS.background,
    borderRadius: RADIUS.xl,
    width: "100%",
    maxHeight: "90%",
  },
  header: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    padding: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  title: {
    fontSize: FONT_SIZES.lg,
    fontWeight: "600",
    color: COLORS.text,
  },
  closeButton: {
    position: "absolute",
    right: SPACING.md,
    backgroundColor: "#E53935",
    width: 36,
    height: 36,
    borderRadius: RADIUS.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  closeButtonText: {
    fontSize: FONT_SIZES.lg,
    color: COLORS.white,
    fontWeight: "600",
  },
  content: {
    padding: SPACING.md,
  },
  label: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    marginBottom: SPACING.sm,
    marginTop: SPACING.md,
  },
  sectionTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: "600",
    color: COLORS.text,
    marginTop: SPACING.lg,
    marginBottom: SPACING.sm,
  },
  textInput: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    fontSize: FONT_SIZES.md,
    color: COLORS.text,
  },
  daysRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: SPACING.md,
  },
  dayButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.surface,
  },
  dayButtonActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  dayButtonText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
  },
  dayButtonTextActive: {
    color: COLORS.white,
    fontWeight: "600",
  },
  dateRow: {
    flexDirection: "row",
    gap: SPACING.md,
  },
  checkboxRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: SPACING.md,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: RADIUS.sm,
    borderWidth: 2,
    borderColor: COLORS.border,
    marginRight: SPACING.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.surface,
  },
  checkboxActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  checkmark: {
    color: COLORS.white,
    fontSize: FONT_SIZES.sm,
    fontWeight: "600",
  },
  checkboxLabel: {
    fontSize: FONT_SIZES.md,
    color: COLORS.text,
  },
  bottomSpacer: {
    height: SPACING.xl,
  },
  footer: {
    flexDirection: "row",
    padding: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    gap: SPACING.md,
  },
  applyButton: {
    flex: 1,
    backgroundColor: "#4CAF50",
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    alignItems: "center",
  },
  applyButtonText: {
    fontSize: FONT_SIZES.md,
    color: COLORS.white,
    fontWeight: "600",
  },
  resetButton: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    alignItems: "center",
  },
  resetButtonText: {
    fontSize: FONT_SIZES.md,
    color: COLORS.text,
  },
});
