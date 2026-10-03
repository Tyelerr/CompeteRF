// src/views/components/tournament/live/ElimOfflineBanner.tsx
// Elimination Manage hub connection banner (offline local recovery, use.elim.offline.ts):
//   offline  → "Offline — showing last synced tournament state" (read-only; nothing queued)
//   changed  → "This tournament changed while you were offline." + Load Latest
//   synced   → a short "Back online · synced" note after a reconnect with no changes elsewhere
// Renders nothing while the screen is simply live on the cloud. Web + native.

import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { COLORS } from "../../../../theme/colors";
import { RADIUS, SPACING } from "../../../../theme/spacing";
import { FONT_SIZES } from "../../../../theme/typography";
import { ELIM_CHANGED_WHILE_OFFLINE, ELIM_OFFLINE_BANNER } from "../../../../utils/elim-local-recovery";
import { webMs, webSc } from "../../../../utils/scaling";
import { ElimOfflineStatus } from "../../../../viewmodels/hooks/use.elim.offline";

export const ElimOfflineBanner = ({
  status,
  justSynced,
  revision,
  onLoadLatest,
}: {
  status: ElimOfflineStatus;
  justSynced: boolean;
  revision: number | null;
  onLoadLatest: () => void;
}) => {
  if (status === "offline") {
    return (
      <View style={[styles.bar, styles.warn]} accessibilityRole="alert">
        <Text allowFontScaling={false} style={[styles.text, styles.warnText]}>
          {ELIM_OFFLINE_BANNER}
          {revision != null ? ` (revision #${revision})` : ""}. Changes are paused until you&apos;re back online.
        </Text>
      </View>
    );
  }
  if (status === "changed") {
    return (
      <View style={[styles.bar, styles.warn]} accessibilityRole="alert">
        <Text allowFontScaling={false} style={[styles.text, styles.warnText, styles.flex]}>{ELIM_CHANGED_WHILE_OFFLINE}</Text>
        <TouchableOpacity style={styles.btn} onPress={onLoadLatest} accessibilityRole="button">
          <Text allowFontScaling={false} style={styles.btnText}>Load Latest</Text>
        </TouchableOpacity>
      </View>
    );
  }
  if (justSynced) {
    return (
      <View style={[styles.bar, styles.ok]}>
        <Text allowFontScaling={false} style={[styles.text, styles.okText]}>
          Back online · synced{revision != null ? ` (revision #${revision})` : ""}
        </Text>
      </View>
    );
  }
  return null;
};

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    gap: webSc(SPACING.sm),
    borderWidth: 1,
    borderRadius: webSc(RADIUS.sm),
    paddingVertical: webSc(SPACING.xs),
    paddingHorizontal: webSc(SPACING.sm),
    marginHorizontal: webSc(SPACING.md),
    marginBottom: webSc(SPACING.xs),
  },
  warn: { backgroundColor: COLORS.warning + "20", borderColor: COLORS.warning },
  ok: { backgroundColor: COLORS.success + "18", borderColor: COLORS.success },
  text: { fontSize: webMs(FONT_SIZES.sm), fontWeight: "600" },
  warnText: { color: COLORS.warning },
  okText: { color: COLORS.success },
  flex: { flex: 1 },
  btn: {
    backgroundColor: COLORS.primary,
    borderRadius: webSc(RADIUS.sm),
    paddingVertical: webSc(SPACING.xs),
    paddingHorizontal: webSc(SPACING.sm),
  },
  btnText: { color: COLORS.white, fontSize: webMs(FONT_SIZES.sm), fontWeight: "700" },
});
