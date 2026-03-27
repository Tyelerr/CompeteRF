import MultiSlider from "@ptomasroos/react-native-multi-slider";
import { useEffect, useState } from "react";
import { Dimensions, Platform, StyleSheet, Text, View } from "react-native";
import { COLORS } from "../../../theme/colors";
import { SPACING } from "../../../theme/spacing";
import { FONT_SIZES } from "../../../theme/typography";
import { moderateScale, scale } from "../../../utils/scaling";

const isWeb = Platform.OS === "web";
const SCREEN_WIDTH = Dimensions.get("window").width;
const SLIDER_LENGTH = SCREEN_WIDTH - 80;

interface RangeSliderProps {
  label: string; minValue: number; maxValue: number; min: number; max: number; step?: number;
  onValueChange: (min: number, max: number) => void; formatValue?: (value: number) => string;
  minLabel?: string; maxLabel?: string;
}

const STYLE_ID = "compete-range-style";
if (isWeb && typeof document !== "undefined" && !document.getElementById(STYLE_ID)) {
  const s = document.createElement("style");
  s.id = STYLE_ID;
  s.textContent = `.compete-range { position: absolute; width: 100%; height: 100%; top: 0; left: 0; margin: 0; padding: 0; background: transparent; -webkit-appearance: none; appearance: none; pointer-events: none; } .compete-range::-webkit-slider-thumb { -webkit-appearance: none; width: 20px; height: 20px; border-radius: 50%; background: ${COLORS.primary}; border: 3px solid #fff; cursor: pointer; pointer-events: all; box-shadow: 0 2px 4px rgba(0,0,0,0.4); } .compete-range::-moz-range-thumb { width: 20px; height: 20px; border-radius: 50%; background: ${COLORS.primary}; border: 3px solid #fff; cursor: pointer; pointer-events: all; } .compete-range::-webkit-slider-runnable-track { background: transparent; } .compete-range::-moz-range-track { background: transparent; }`;
  document.head.appendChild(s);
}

export const RangeSlider = ({ label, minValue, maxValue, min, max, step = 1, onValueChange, formatValue = (v) => v.toString(), minLabel, maxLabel }: RangeSliderProps) => {
  const [values, setValues] = useState<[number, number]>([minValue, maxValue]);
  useEffect(() => { setValues([minValue, maxValue]); }, [minValue, maxValue]);

  if (isWeb) {
    const range = max - min;
    const leftPct = ((values[0] - min) / range) * 100;
    const rightPct = ((values[1] - min) / range) * 100;
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text allowFontScaling={false} style={styles.label}>{label}</Text>
          <Text allowFontScaling={false} style={styles.value}>{formatValue(values[0])} – {formatValue(values[1])}</Text>
        </View>
        <View style={{ height: 36, justifyContent: "center", position: "relative" as any }}>
          <View style={{ position: "absolute" as any, left: 0, right: 0, height: 6, backgroundColor: COLORS.border, borderRadius: 3 }} />
          <View style={{ position: "absolute" as any, left: `${leftPct}%` as any, right: `${100 - rightPct}%` as any, height: 6, backgroundColor: COLORS.primary, borderRadius: 3 }} />
          <input className="compete-range" type="range" min={min} max={max} step={step} value={values[0]} style={{ zIndex: values[0] >= values[1] - step ? 5 : 3 }} onChange={(e) => { const v = Math.min(Number(e.target.value), values[1] - step); const next: [number, number] = [v, values[1]]; setValues(next); onValueChange(next[0], next[1]); }} />
          <input className="compete-range" type="range" min={min} max={max} step={step} value={values[1]} style={{ zIndex: 4 }} onChange={(e) => { const v = Math.max(Number(e.target.value), values[0] + step); const next: [number, number] = [values[0], v]; setValues(next); onValueChange(next[0], next[1]); }} />
        </View>
        <View style={styles.labelsRow}>
          <Text allowFontScaling={false} style={styles.sliderLabel}>{minLabel || formatValue(min)}</Text>
          <Text allowFontScaling={false} style={styles.sliderLabel}>{maxLabel || formatValue(max)}</Text>
        </View>
      </View>
    );
  }

  const handleValuesChange = (newValues: number[]) => setValues([newValues[0], newValues[1]]);
  const handleValuesChangeFinish = (newValues: number[]) => onValueChange(newValues[0], newValues[1]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text allowFontScaling={false} style={styles.label}>{label}</Text>
        <Text allowFontScaling={false} style={styles.value}>{formatValue(values[0])} – {formatValue(values[1])}</Text>
      </View>
      <View style={styles.sliderWrapper}>
        <MultiSlider values={values} min={min} max={max} step={step} sliderLength={SLIDER_LENGTH} onValuesChange={handleValuesChange} onValuesChangeFinish={handleValuesChangeFinish} selectedStyle={styles.selectedTrack} unselectedStyle={styles.unselectedTrack} trackStyle={styles.track} markerStyle={styles.marker} pressedMarkerStyle={styles.markerPressed} containerStyle={styles.sliderContainer} minMarkerOverlapDistance={20} snapped allowOverlap={false} markerOffsetY={2} />
      </View>
      <View style={styles.labelsRow}>
        <Text allowFontScaling={false} style={styles.sliderLabel}>{minLabel || formatValue(min)}</Text>
        <Text allowFontScaling={false} style={styles.sliderLabel}>{maxLabel || formatValue(max)}</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { marginVertical: scale(SPACING.md) },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: scale(SPACING.sm) },
  label: { fontSize: moderateScale(FONT_SIZES.md), fontWeight: "600", color: COLORS.text },
  value: { fontSize: moderateScale(FONT_SIZES.md), color: COLORS.text },
  sliderWrapper: { alignItems: "center", justifyContent: "center", paddingVertical: scale(SPACING.sm) },
  sliderContainer: { height: 40, justifyContent: "center" },
  track: { height: 6, borderRadius: 3, backgroundColor: COLORS.border },
  selectedTrack: { backgroundColor: COLORS.primary },
  unselectedTrack: { backgroundColor: COLORS.border },
  marker: { width: scale(24), height: scale(24), borderRadius: scale(12), backgroundColor: COLORS.primary, borderWidth: 3, borderColor: COLORS.white, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 3, elevation: 5 },
  markerPressed: { width: scale(28), height: scale(28), borderRadius: scale(14), backgroundColor: COLORS.primary, borderWidth: 3, borderColor: COLORS.white },
  labelsRow: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: scale(SPACING.xs) },
  sliderLabel: { fontSize: moderateScale(FONT_SIZES.xs), color: COLORS.textMuted },
});
