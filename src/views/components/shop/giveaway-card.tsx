import React from "react";
import {
  Image,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Giveaway } from "../../../models/types/giveaway.types";
import { COLORS } from "../../../theme/colors";
import { SPACING } from "../../../theme/spacing";
import { FONT_SIZES } from "../../../theme/typography";

const isWeb = Platform.OS === "web";

interface GiveawayCardProps {
  giveaway: Giveaway;
  isEntered: boolean;
  daysRemaining: string;
  onEnter: () => void;
  onView: () => void;
}

export function GiveawayCard({
  giveaway,
  isEntered,
  daysRemaining,
  onEnter,
  onView,
}: GiveawayCardProps) {
  const entryCount = giveaway.entry_count || 0;
  const maxEntries = giveaway.max_entries || 0;
  const progressPercent =
    maxEntries > 0 ? Math.min((entryCount / maxEntries) * 100, 100) : 0;

  // ── Closed state ──────────────────────────────────────────────────────────
  // A giveaway is closed if:
  //   • its status is "ended" or "awarded" (DB-confirmed), OR
  //   • it has a max_entries cap and entries have reached/exceeded it
  //     (handles the in-session window before the next refetch)
  const isClosed =
    giveaway.status === "ended" ||
    giveaway.status === "awarded" ||
    (maxEntries > 0 && entryCount >= maxEntries);

  const formatValue = (value: number | null): string => {
    if (!value) return "";
    return `$${value.toLocaleString()} Value`;
  };

  return (
    <View style={[styles.container, isWeb && styles.containerWeb]}>
      <View style={[styles.content, isWeb && styles.contentWeb]}>
        {/* Image */}
        <View style={[styles.imageContainer, isWeb && styles.imageContainerWeb]}>
          {giveaway.image_url ? (
            <Image
              source={{ uri: giveaway.image_url }}
              style={styles.image}
              resizeMode="cover"
            />
          ) : (
            <View style={styles.imagePlaceholder}>
              <Text style={styles.imagePlaceholderText}>🎁</Text>
            </View>
          )}
          {/* Closed overlay tint on the image */}
          {isClosed && <View style={styles.imageClosedOverlay} />}
        </View>

        {/* Info */}
        <View style={styles.info}>
          <View style={styles.headerRow}>
            <Text
              style={[styles.name, isClosed && styles.textMuted]}
              numberOfLines={2}
            >
              {giveaway.name}
            </Text>
            {giveaway.prize_value && (
              <Text style={[styles.value, isClosed && styles.textMuted]}>
                {formatValue(giveaway.prize_value)}
              </Text>
            )}
          </View>

          {giveaway.description && (
            <Text
              style={[styles.description, isClosed && styles.textMuted]}
              numberOfLines={isWeb ? 3 : 1}
            >
              {giveaway.description}
            </Text>
          )}

          <Text style={styles.entries}>
            {entryCount}/{maxEntries || "∞"} Total Entries
          </Text>

          {/* Progress Bar */}
          {maxEntries > 0 && (
            <View style={styles.progressContainer}>
              <View style={styles.progressBackground}>
                <View
                  style={[
                    styles.progressFill,
                    isClosed && styles.progressFillClosed,
                    { width: `${progressPercent}%` as any },
                  ]}
                />
              </View>
            </View>
          )}

          <Text style={[styles.daysRemaining, isClosed && styles.textMuted]}>
            {isClosed ? "Entry period closed" : daysRemaining}
          </Text>
        </View>
      </View>

      {/* Buttons */}
      <View style={[styles.buttons, isWeb && styles.buttonsWeb]}>
        {isClosed ? (
          // ── Disabled "Giveaway Ended" button ────────────────────────────
          <View style={[styles.enterButton, styles.endedButton, isWeb && styles.enterButtonWeb]}>
            <Text style={styles.endedButtonText}>Giveaway Ended</Text>
          </View>
        ) : isEntered ? (
          // ── Already entered ──────────────────────────────────────────────
          <View style={[styles.enterButton, styles.enteredButton, isWeb && styles.enterButtonWeb]}>
            <Text style={styles.enteredButtonText}>Entered ✓</Text>
          </View>
        ) : (
          // ── Active CTA ───────────────────────────────────────────────────
          <TouchableOpacity
            style={[styles.enterButton, isWeb && styles.enterButtonWeb]}
            onPress={onEnter}
          >
            <Text style={styles.enterButtonText}>Enter Giveaway</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={[styles.viewButton, isWeb && styles.viewButtonWeb]}
          onPress={onView}
        >
          <Text style={styles.viewButtonText}>View</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // ── Container ──────────────────────────────────────────────────────────────
  container: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  containerWeb: {
    padding: SPACING.lg,
    marginBottom: 0,
  },

  // ── Content row ────────────────────────────────────────────────────────────
  content: {
    flexDirection: "row",
    marginBottom: SPACING.md,
  },
  contentWeb: {
    marginBottom: SPACING.lg,
  },

  // ── Image ──────────────────────────────────────────────────────────────────
  imageContainer: {
    width: 100,
    height: 100,
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: COLORS.surfaceLight,
    marginRight: SPACING.md,
    flexShrink: 0,
    position: "relative",
  },
  imageContainerWeb: {
    width: 140,
    height: 140,
  },
  image: {
    width: "100%",
    height: "100%",
  },
  imagePlaceholder: {
    width: "100%",
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: COLORS.surfaceLight,
  },
  imagePlaceholderText: {
    fontSize: 40,
  },
  // Subtle dark overlay when closed
  imageClosedOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.40)",
  },

  // ── Info ───────────────────────────────────────────────────────────────────
  info: {
    flex: 1,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: SPACING.xs,
  },
  name: {
    fontSize: FONT_SIZES.md,
    fontWeight: "700",
    color: COLORS.text,
    flex: 1,
    marginRight: SPACING.sm,
  },
  value: {
    fontSize: FONT_SIZES.sm,
    fontWeight: "600",
    color: COLORS.primary,
    flexShrink: 0,
  },
  description: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    marginBottom: SPACING.xs,
    lineHeight: 18,
  },
  entries: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textMuted,
    marginBottom: 6,
  },
  progressContainer: {
    marginBottom: 6,
  },
  progressBackground: {
    height: 6,
    backgroundColor: COLORS.surfaceLight,
    borderRadius: 3,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: COLORS.primary,
    borderRadius: 3,
  },
  progressFillClosed: {
    backgroundColor: COLORS.textMuted,
  },
  daysRemaining: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
  },

  // ── Shared muted style ─────────────────────────────────────────────────────
  textMuted: {
    color: COLORS.textMuted,
    opacity: 0.7,
  },

  // ── Buttons ────────────────────────────────────────────────────────────────
  buttons: {
    flexDirection: "row",
    gap: SPACING.sm,
  },
  buttonsWeb: {
    gap: SPACING.md,
  },

  // Active enter button
  enterButton: {
    flex: 1,
    backgroundColor: COLORS.primary,
    paddingVertical: SPACING.sm + 2,
    borderRadius: 8,
    alignItems: "center",
  },
  enterButtonWeb: {
    paddingVertical: SPACING.md,
  },
  enterButtonText: {
    color: COLORS.text,
    fontSize: FONT_SIZES.md,
    fontWeight: "600",
  },

  // Already entered
  enteredButton: {
    backgroundColor: COLORS.surfaceLight,
  },
  enteredButtonText: {
    color: COLORS.textMuted,
    fontSize: FONT_SIZES.md,
    fontWeight: "600",
  },

  // Closed / ended — gray, no press handler (View not TouchableOpacity)
  endedButton: {
    backgroundColor: COLORS.surfaceLight,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  endedButtonText: {
    color: COLORS.textMuted,
    fontSize: FONT_SIZES.md,
    fontWeight: "600",
  },

  // View button
  viewButton: {
    flex: 1,
    backgroundColor: COLORS.surfaceLight,
    paddingVertical: SPACING.sm + 2,
    borderRadius: 8,
    alignItems: "center",
  },
  viewButtonWeb: {
    paddingVertical: SPACING.md,
  },
  viewButtonText: {
    color: COLORS.text,
    fontSize: FONT_SIZES.md,
    fontWeight: "600",
  },
});
