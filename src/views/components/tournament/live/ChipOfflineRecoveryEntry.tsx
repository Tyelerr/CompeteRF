// src/views/components/tournament/live/ChipOfflineRecoveryEntry.tsx
// WEB-ONLY compact app-root card: "Local tournament backup available" when the cloud profile
// can't load and this browser holds local Chip backups for the stored session's user. Opens
// the read-only /chip-recovery viewer. Renders nothing otherwise (and on native).
// Logic: useChipOfflineRecoveryEntry.

import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { COLORS } from "../../../../theme/colors";
import { RADIUS, SPACING } from "../../../../theme/spacing";
import { FONT_SIZES } from "../../../../theme/typography";
import { webMs, webSc } from "../../../../utils/scaling";
import { useChipOfflineRecoveryEntry } from "../../../../viewmodels/hooks/use.chip.offline.recovery";
import { formatBackupTime } from "./ChipRecoveryStatus";

const EntryCard = () => {
  const entry = useChipOfflineRecoveryEntry();
  const [collapsed, setCollapsed] = useState(false);
  if (!entry.show) return null;
  const many = entry.backups.length > 1;
  if (collapsed) {
    return (
      <TouchableOpacity style={[styles.wrap, styles.pill]} onPress={() => setCollapsed(false)} activeOpacity={0.8}>
        <Ionicons name="cloud-offline-outline" size={webMs(14)} color={COLORS.warning} />
        <Text style={styles.pillText}>Local backup{many ? `s (${entry.backups.length})` : ""}</Text>
      </TouchableOpacity>
    );
  }
  return (
    <View style={[styles.wrap, styles.card]}>
      <View style={styles.headRow}>
        <Ionicons name="cloud-offline-outline" size={webMs(16)} color={COLORS.warning} />
        <Text style={styles.kicker}>{many ? "LOCAL TOURNAMENT BACKUPS AVAILABLE" : "LOCAL TOURNAMENT BACKUP AVAILABLE"}</Text>
        <TouchableOpacity onPress={() => setCollapsed(true)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="remove-outline" size={webMs(16)} color={COLORS.textSecondary} />
        </TouchableOpacity>
      </View>
      <Text style={styles.muted}>
        Cloud connection is currently unavailable. Backups open read-only; an offline tournament you ran on this browser
        can be resumed.
      </Text>
      <ScrollView style={styles.list}>
        {entry.backups.map((b) => (
          <View key={b.tournamentId} style={styles.row}>
            <View style={styles.rowText}>
              <Text style={styles.name} numberOfLines={1}>
                {b.tournament.name || `Chip Tournament #${b.tournamentId}`}
              </Text>
              <Text style={styles.muted}>
                {b.offlineSession
                  ? `Offline tournament · ${b.offlineSession.unsyncedCount} unsynced change${b.offlineSession.unsyncedCount === 1 ? "" : "s"} · `
                  : ""}
                Last saved locally: {formatBackupTime(b.savedAt)}
                {b.finished ? " · Completed" : ""}
              </Text>
            </View>
            <TouchableOpacity style={styles.btn} onPress={() => entry.open(b.tournamentId)} activeOpacity={0.8}>
              <Text style={styles.btnText}>{b.offlineSession ? "Open Offline Tournament" : "Open Read-Only Backup"}</Text>
            </TouchableOpacity>
          </View>
        ))}
      </ScrollView>
    </View>
  );
};

export const ChipOfflineRecoveryEntry = () => (Platform.OS === "web" ? <EntryCard /> : null);

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    right: webSc(SPACING.md),
    bottom: webSc(SPACING.md),
    zIndex: 900,
    backgroundColor: COLORS.surface,
    borderColor: COLORS.warning,
    borderWidth: 1,
    borderRadius: RADIUS.md,
  },
  card: { width: 380, maxWidth: "92%" as any, padding: webSc(SPACING.md), gap: webSc(SPACING.xs) },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: webSc(SPACING.xs),
    paddingVertical: webSc(SPACING.sm),
    paddingHorizontal: webSc(SPACING.md),
  },
  pillText: { color: COLORS.text, fontSize: webMs(FONT_SIZES.xs), fontWeight: "700" },
  headRow: { flexDirection: "row", alignItems: "center", gap: webSc(SPACING.xs) },
  kicker: { flex: 1, color: COLORS.warning, fontSize: webMs(FONT_SIZES.xs), fontWeight: "700", letterSpacing: 0.5 },
  muted: { color: COLORS.textSecondary, fontSize: webMs(FONT_SIZES.xs) },
  list: { maxHeight: 280, marginTop: webSc(SPACING.xs) },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: webSc(SPACING.sm),
    paddingVertical: webSc(SPACING.sm),
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  rowText: { flex: 1, minWidth: 0 },
  name: { color: COLORS.text, fontSize: webMs(FONT_SIZES.sm), fontWeight: "700" },
  btn: {
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.sm,
    paddingVertical: webSc(SPACING.sm),
    paddingHorizontal: webSc(SPACING.sm),
  },
  btnText: { color: COLORS.white, fontSize: webMs(FONT_SIZES.xs), fontWeight: "700" },
});
