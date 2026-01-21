import MultiSlider from "@ptomasroos/react-native-multi-slider";
import { useEffect, useState } from "react";
import { Dimensions, StyleSheet, Text, View } from "react-native";
import { COLORS } from "../../../theme/colors";
import { SPACING } from "../../../theme/spacing";
import { FONT_SIZES } from "../../../theme/typography";

const SCREEN_WIDTH = Dimensions.get("window").width;
const SLIDER_LENGTH = SCREEN_WIDTH - 80;

interface RangeSliderProps {
  label: string;
  minValue: number;
  maxValue: number;
  min: number;
  max: number;
  step?: number;
  onValueChange: (min: number, max: number) => void;
  formatValue?: (value: number) => string;
  minLabel?: string;
  maxLabel?: string;
}

export const RangeSlider = ({
  label,
  minValue,
  maxValue,
  min,
  max,
  step = 1,
  onValueChange,
  formatValue = (v) => v.toString(),
  minLabel,
  maxLabel,
}: RangeSliderProps) => {
  const [values, setValues] = useState<[number, number]>([minValue, maxValue]);

  // Sync when parent values change
  useEffect(() => {
    setValues([minValue, maxValue]);
  }, [minValue, maxValue]);

  const handleValuesChange = (newValues: number[]) => {
    setValues([newValues[0], newValues[1]]);
  };

  const handleValuesChangeFinish = (newValues: number[]) => {
    onValueChange(newValues[0], newValues[1]);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.value}>
          {formatValue(values[0])} — {formatValue(values[1])}
        </Text>
      </View>

      <View style={styles.sliderWrapper}>
        <MultiSlider
          values={values}
          min={min}
          max={max}
          step={step}
          sliderLength={SLIDER_LENGTH}
          onValuesChange={handleValuesChange}
          onValuesChangeFinish={handleValuesChangeFinish}
          selectedStyle={styles.selectedTrack}
          unselectedStyle={styles.unselectedTrack}
          trackStyle={styles.track}
          markerStyle={styles.marker}
          pressedMarkerStyle={styles.markerPressed}
          containerStyle={styles.sliderContainer}
          minMarkerOverlapDistance={20}
          snapped
          allowOverlap={false}
          markerOffsetY={2}
        />
      </View>

      <View style={styles.labelsRow}>
        <Text style={styles.sliderLabel}>{minLabel || formatValue(min)}</Text>
        <Text style={styles.sliderLabel}>{maxLabel || formatValue(max)}</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: SPACING.md,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: SPACING.sm,
  },
  label: {
    fontSize: FONT_SIZES.md,
    fontWeight: "600",
    color: COLORS.text,
  },
  value: {
    fontSize: FONT_SIZES.md,
    color: COLORS.text,
  },
  sliderWrapper: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: SPACING.sm,
  },
  sliderContainer: {
    height: 40,
    justifyContent: "center",
  },
  track: {
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.border,
  },
  selectedTrack: {
    backgroundColor: COLORS.primary,
  },
  unselectedTrack: {
    backgroundColor: COLORS.border,
  },
  marker: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: COLORS.primary,
    borderWidth: 3,
    borderColor: COLORS.white,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 5,
  },
  markerPressed: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.primary,
    borderWidth: 3,
    borderColor: COLORS.white,
  },
  labelsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: SPACING.xs,
  },
  sliderLabel: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
  },
});
