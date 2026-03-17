import React from "react";
import {
  Image,
  Keyboard,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Giveaway } from "../../../models/types/giveaway.types";
import { RADIUS } from "../../../theme/spacing";

const isWeb = Platform.OS === "web";

const MODAL_COLORS = {
  background: "#000000",
  card: "#1C1C1E",
  cardBorder: "#2C2C2E",
  blue: "#007AFF",
  white: "#FFFFFF",
  gray: "#8E8E93",
  lightGray: "#AEAEB2",
  red: "#FF453A",
};
const MODAL_SPACING = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20 };
const MODAL_FONT = { xs: 11, sm: 13, md: 15, lg: 17, xl: 20 };

interface GiveawayDetailModalProps {
  visible: boolean;
  giveaway: Giveaway | null;
  isEntered: boolean;
  daysRemaining: string;
  onClose: () => void;
  onEnter: () => void;
}

export function GiveawayDetailModal({
  visible,
  giveaway,
  isEntered,
  daysRemaining,
  onClose,
  onEnter,
}: GiveawayDetailModalProps) {
  if (!giveaway || !visible) return null;

  const entryCount = giveaway.entry_count || 0;
  const maxEntries = giveaway.max_entries || 0;
  const progressPercent =
    maxEntries > 0 ? Math.min((entryCount / maxEntries) * 100, 100) : 0;

  const formatValue = (value: number | null): string => {
    if (!value) return "";
    return `$${value.toLocaleString()}`;
  };

  const formatDate = (dateString: string | null): string => {
    if (!dateString) return "No end date";
    return new Date(dateString).toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  const innerContent = (
    <>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={onClose} style={s.closeButton}>
          <Text style={s.closeButtonText}>✕</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>Giveaway Details</Text>
        <View style={{ width: 40 }} />
      </View>
      <View style={s.divider} />

      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.scrollContent}
        showsVerticalScrollIndicator={false}
        onScrollBeginDrag={Keyboard.dismiss}
      >
        <Text style={s.giveawayName}>{giveaway.name}</Text>

        {/* Image */}
        <View style={s.imageContainer}>
          {giveaway.image_url ? (
            <Image
              source={{ uri: giveaway.image_url }}
              style={s.image}
              resizeMode="contain"
            />
          ) : (
            <View style={s.imagePlaceholder}>
              <Text style={s.imagePlaceholderText}>🎁</Text>
            </View>
          )}
        </View>

        {/* Prize value */}
        {giveaway.prize_value && (
          <Text style={s.value}>{formatValue(giveaway.prize_value)} Value</Text>
        )}

        {/* Description */}
        {giveaway.description && (
          <Text style={s.description}>{giveaway.description}</Text>
        )}

        {/* Stats card */}
        <View style={s.statsCard}>
          <View style={s.row}>
            <Text style={s.label}>Entries:</Text>
            <Text style={s.val}>
              {entryCount} / {maxEntries || "Unlimited"}
            </Text>
          </View>

          {maxEntries > 0 && (
            <View style={s.progressContainer}>
              <View style={s.progressBackground}>
                <View
                  style={[
                    s.progressFill,
                    { width: `${progressPercent}%` as any },
                  ]}
                />
              </View>
            </View>
          )}

          <View style={s.row}>
            <Text style={s.label}>Ends:</Text>
            <Text style={s.val}>{formatDate(giveaway.end_date)}</Text>
          </View>
          <View style={s.row}>
            <Text style={s.label}>Status:</Text>
            <Text style={[s.val, s.statusText]}>{daysRemaining}</Text>
          </View>
          <View style={[s.row, { marginBottom: 0 }]}>
            <Text style={s.label}>Min Age:</Text>
            <Text style={s.val}>{giveaway.min_age}+</Text>
          </View>
        </View>

        {/* Rules preview */}
        {giveaway.rules_text && (
          <View style={s.statsCard}>
            <Text style={s.sectionTitle}>Official Rules</Text>
            <Text style={s.rulesText} numberOfLines={6}>
              {giveaway.rules_text}
            </Text>
            <Text style={s.rulesMore}>Full rules shown when entering...</Text>
          </View>
        )}
      </ScrollView>

      {/* Bottom buttons */}
      <View style={s.bottomBar}>
        <TouchableOpacity
          style={[s.enterButton, isEntered && s.enteredButton]}
          onPress={onEnter}
          disabled={isEntered}
        >
          <Text style={[s.enterButtonText, isEntered && s.enteredButtonText]}>
            {isEntered ? "Already Entered ✓" : "Enter Giveaway"}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.cancelButton} onPress={onClose}>
          <Text style={s.cancelButtonText}>Close</Text>
        </TouchableOpacity>
      </View>
    </>
  );

  // ── Web: fixed centered dialog ────────────────────────────────────────────
  if (isWeb) {
    return (
      <>
        <TouchableOpacity
          style={s.backdrop}
          activeOpacity={1}
          onPress={onClose}
        />
        <View style={s.dialogWrap} pointerEvents="box-none">
          <View style={s.dialog}>{innerContent}</View>
        </View>
      </>
    );
  }

  // ── Mobile: centered floating card ───────────────────────────────────────
  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onClose}
    >
      <TouchableOpacity
        style={s.mobileBackdrop}
        activeOpacity={1}
        onPress={onClose}
      />
      <View style={s.mobileCardWrapper} pointerEvents="box-none">
        <View style={s.mobileCard}>{innerContent}</View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  // ── Web ────────────────────────────────────────────────────────────────────
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
    width: 640,
    maxWidth: "92%" as any,
    maxHeight: "90vh" as any,
    backgroundColor: MODAL_COLORS.background,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: MODAL_COLORS.cardBorder,
    overflow: "hidden" as any,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 24,
  },

  // ── Mobile: centered floating card ─────────────────────────────────────────
  mobileBackdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.7)",
  },
  mobileCardWrapper: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  mobileCard: {
    width: "100%",
    maxWidth: 480,
    height: "82%" as any,
    backgroundColor: MODAL_COLORS.background,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: MODAL_COLORS.cardBorder,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 24,
  },

  // ── Shared chrome ──────────────────────────────────────────────────────────
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: MODAL_SPACING.lg,
    paddingTop: MODAL_SPACING.lg,
    paddingBottom: MODAL_SPACING.md,
  },
  closeButton: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  closeButtonText: {
    color: MODAL_COLORS.white,
    fontSize: 20,
    fontWeight: "700",
  },
  headerTitle: {
    color: MODAL_COLORS.white,
    fontSize: MODAL_FONT.lg,
    fontWeight: "700",
  },
  divider: { height: 1, backgroundColor: MODAL_COLORS.cardBorder },

  scroll: { flex: 1 },
  scrollContent: {
    padding: MODAL_SPACING.xl,
    paddingBottom: MODAL_SPACING.lg,
  },

  giveawayName: {
    color: MODAL_COLORS.blue,
    fontSize: MODAL_FONT.lg,
    fontWeight: "600",
    textAlign: "center",
    marginBottom: MODAL_SPACING.xl,
  },

  imageContainer: {
    width: "100%",
    height: 200,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: MODAL_COLORS.card,
    marginBottom: MODAL_SPACING.md,
  },
  image: { width: "100%", height: "100%" },
  imagePlaceholder: {
    width: "100%",
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
  },
  imagePlaceholderText: { fontSize: 60 },

  value: {
    fontSize: MODAL_FONT.md,
    fontWeight: "600",
    color: MODAL_COLORS.blue,
    textAlign: "center",
    marginBottom: MODAL_SPACING.sm,
  },
  description: {
    fontSize: MODAL_FONT.md,
    color: MODAL_COLORS.lightGray,
    marginBottom: MODAL_SPACING.lg,
    lineHeight: 22,
  },

  statsCard: {
    backgroundColor: MODAL_COLORS.card,
    borderRadius: 10,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: MODAL_COLORS.cardBorder,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: MODAL_COLORS.white,
    marginBottom: MODAL_SPACING.sm,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: MODAL_SPACING.sm,
  },
  label: { fontSize: 14, color: MODAL_COLORS.gray },
  val: { fontSize: 14, color: MODAL_COLORS.white, fontWeight: "500" },
  statusText: { color: MODAL_COLORS.blue },

  progressContainer: { marginBottom: MODAL_SPACING.sm },
  progressBackground: {
    height: 8,
    backgroundColor: "#3A3A3C",
    borderRadius: 4,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: MODAL_COLORS.blue,
    borderRadius: 4,
  },

  rulesText: {
    fontSize: MODAL_FONT.sm,
    color: MODAL_COLORS.lightGray,
    lineHeight: 20,
  },
  rulesMore: {
    fontSize: MODAL_FONT.xs,
    color: MODAL_COLORS.gray,
    marginTop: MODAL_SPACING.sm,
    fontStyle: "italic",
  },

  // Bottom buttons
  bottomBar: {
    flexDirection: "row",
    padding: MODAL_SPACING.lg,
    gap: MODAL_SPACING.md,
    borderTopWidth: 1,
    borderTopColor: MODAL_COLORS.cardBorder,
    paddingBottom: Platform.OS === "ios" ? 34 : MODAL_SPACING.lg,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: MODAL_COLORS.card,
    borderRadius: 12,
    paddingVertical: MODAL_SPACING.lg,
    alignItems: "center",
    borderWidth: 1,
    borderColor: MODAL_COLORS.cardBorder,
  },
  cancelButtonText: {
    color: MODAL_COLORS.white,
    fontSize: MODAL_FONT.md,
    fontWeight: "600",
  },
  enterButton: {
    flex: 1,
    backgroundColor: MODAL_COLORS.blue,
    borderRadius: 12,
    paddingVertical: MODAL_SPACING.lg,
    alignItems: "center",
  },
  enteredButton: { opacity: 0.5 },
  enterButtonText: {
    color: MODAL_COLORS.white,
    fontSize: MODAL_FONT.md,
    fontWeight: "700",
  },
  enteredButtonText: { color: MODAL_COLORS.white },
});
