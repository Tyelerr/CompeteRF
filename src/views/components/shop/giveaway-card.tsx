import React from "react";
import { Image, Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Giveaway } from "../../../models/types/giveaway.types";
import { COLORS } from "../../../theme/colors";
import { SPACING } from "../../../theme/spacing";
import { FONT_SIZES } from "../../../theme/typography";
import { moderateScale, scale } from "../../../utils/scaling";

const isWeb = Platform.OS === "web";
const wxMs = (v: number) => isWeb ? v : moderateScale(v);
const wxSc = (v: number) => isWeb ? v : scale(v);

interface GiveawayCardProps {
  giveaway: Giveaway;
  isEntered: boolean;
  daysRemaining: string;
  onEnter: () => void;
  onView: () => void;
}

export function GiveawayCard({ giveaway, isEntered, daysRemaining, onEnter, onView }: GiveawayCardProps) {
  const entryCount = giveaway.entry_count || 0;
  const maxEntries = giveaway.max_entries || 0;
  const progressPercent = maxEntries > 0 ? Math.min((entryCount / maxEntries) * 100, 100) : 0;
  const isClosed = giveaway.status === "ended" || giveaway.status === "awarded" || (maxEntries > 0 && entryCount >= maxEntries);

  const formatValue = (value: number | null): string => {
    if (!value) return "";
    return `$${value.toLocaleString()} Value`;
  };

  return (
    <View style={[styles.container, isWeb && styles.containerWeb]}>
      <View style={[styles.content, isWeb && styles.contentWeb]}>
        <View style={[styles.imageContainer, isWeb && styles.imageContainerWeb]}>
          {giveaway.image_url ? (
            <Image source={{ uri: giveaway.image_url }} style={styles.image} resizeMode="cover" />
          ) : (
            <View style={styles.imagePlaceholder}>
              <Text allowFontScaling={false} style={styles.imagePlaceholderText}>🎁</Text>
            </View>
          )}
          {isClosed && <View style={styles.imageClosedOverlay} />}
        </View>
        <View style={styles.info}>
          <View style={styles.headerRow}>
            <Text allowFontScaling={false} style={[styles.name, isClosed && styles.textMuted]} numberOfLines={2}>{giveaway.name}</Text>
            {giveaway.prize_value && <Text allowFontScaling={false} style={[styles.value, isClosed && styles.textMuted]}>{formatValue(giveaway.prize_value)}</Text>}
          </View>
          {giveaway.description && <Text allowFontScaling={false} style={[styles.description, isClosed && styles.textMuted]} numberOfLines={isWeb ? 3 : 1}>{giveaway.description}</Text>}
          <Text allowFontScaling={false} style={styles.entries}>{entryCount}/{maxEntries || "∞"} Total Entries</Text>
          {maxEntries > 0 && (
            <View style={styles.progressContainer}>
              <View style={styles.progressBackground}>
                <View style={[styles.progressFill, isClosed && styles.progressFillClosed, { width: `${progressPercent}%` as any }]} />
              </View>
            </View>
          )}
          <Text allowFontScaling={false} style={[styles.daysRemaining, isClosed && styles.textMuted]}>{isClosed ? "Entry period closed" : daysRemaining}</Text>
        </View>
      </View>
      <View style={[styles.buttons, isWeb && styles.buttonsWeb]}>
        {isClosed ? (
          <View style={[styles.enterButton, styles.endedButton, isWeb && styles.enterButtonWeb]}>
            <Text allowFontScaling={false} style={styles.endedButtonText}>Giveaway Ended</Text>
          </View>
        ) : isEntered ? (
          <View style={[styles.enterButton, styles.enteredButton, isWeb && styles.enterButtonWeb]}>
            <Text allowFontScaling={false} style={styles.enteredButtonText}>Entered ✓</Text>
          </View>
        ) : (
          <TouchableOpacity style={[styles.enterButton, isWeb && styles.enterButtonWeb]} onPress={onEnter}>
            <Text allowFontScaling={false} style={styles.enterButtonText}>Enter Giveaway</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={[styles.viewButton, isWeb && styles.viewButtonWeb]} onPress={onView}>
          <Text allowFontScaling={false} style={styles.viewButtonText}>View</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: COLORS.surface, borderRadius: wxSc(12), padding: wxSc(SPACING.md), marginBottom: wxSc(SPACING.md), borderWidth: 1, borderColor: COLORS.border },
  containerWeb: { padding: wxSc(SPACING.lg), marginBottom: 0 },
  content: { flexDirection: "row", marginBottom: wxSc(SPACING.md) },
  contentWeb: { marginBottom: wxSc(SPACING.lg) },
  imageContainer: { width: wxSc(100), height: wxSc(100), borderRadius: wxSc(8), overflow: "hidden", backgroundColor: COLORS.surfaceLight, marginRight: wxSc(SPACING.md), flexShrink: 0, position: "relative" },
  imageContainerWeb: { width: wxSc(140), height: wxSc(140) },
  image: { width: "100%", height: "100%" },
  imagePlaceholder: { width: "100%", height: "100%", justifyContent: "center", alignItems: "center", backgroundColor: COLORS.surfaceLight },
  imagePlaceholderText: { fontSize: wxMs(40) },
  imageClosedOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.40)" },
  info: { flex: 1 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: wxSc(SPACING.xs) },
  name: { fontSize: wxMs(FONT_SIZES.md), fontWeight: "700", color: COLORS.text, flex: 1, marginRight: wxSc(SPACING.sm) },
  value: { fontSize: wxMs(FONT_SIZES.sm), fontWeight: "600", color: COLORS.primary, flexShrink: 0 },
  description: { fontSize: wxMs(FONT_SIZES.sm), color: COLORS.textSecondary, marginBottom: wxSc(SPACING.xs), lineHeight: wxMs(18) },
  entries: { fontSize: wxMs(FONT_SIZES.sm), color: COLORS.textMuted, marginBottom: 6 },
  progressContainer: { marginBottom: 6 },
  progressBackground: { height: 6, backgroundColor: COLORS.surfaceLight, borderRadius: 3, overflow: "hidden" },
  progressFill: { height: "100%", backgroundColor: COLORS.primary, borderRadius: 3 },
  progressFillClosed: { backgroundColor: COLORS.textMuted },
  daysRemaining: { fontSize: wxMs(FONT_SIZES.xs), color: COLORS.textMuted },
  textMuted: { color: COLORS.textMuted, opacity: 0.7 },
  buttons: { flexDirection: "row", gap: wxSc(SPACING.sm) },
  buttonsWeb: { gap: wxSc(SPACING.md) },
  enterButton: { flex: 1, backgroundColor: COLORS.primary, paddingVertical: wxSc(SPACING.sm + 2), borderRadius: wxSc(8), alignItems: "center" },
  enterButtonWeb: { paddingVertical: wxSc(SPACING.md) },
  enterButtonText: { color: COLORS.text, fontSize: wxMs(FONT_SIZES.md), fontWeight: "600" },
  enteredButton: { backgroundColor: COLORS.surfaceLight },
  enteredButtonText: { color: COLORS.textMuted, fontSize: wxMs(FONT_SIZES.md), fontWeight: "600" },
  endedButton: { backgroundColor: COLORS.surfaceLight, borderWidth: 1, borderColor: COLORS.border },
  endedButtonText: { color: COLORS.textMuted, fontSize: wxMs(FONT_SIZES.md), fontWeight: "600" },
  viewButton: { flex: 1, backgroundColor: COLORS.surfaceLight, paddingVertical: wxSc(SPACING.sm + 2), borderRadius: wxSc(8), alignItems: "center" },
  viewButtonWeb: { paddingVertical: wxSc(SPACING.md) },
  viewButtonText: { color: COLORS.text, fontSize: wxMs(FONT_SIZES.md), fontWeight: "600" },
});
