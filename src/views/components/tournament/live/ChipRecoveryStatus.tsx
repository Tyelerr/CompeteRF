// src/views/components/tournament/live/ChipRecoveryStatus.tsx
// Web-only Chip local-backup UI (see chip.local-recovery.ts):
//   ChipRecoveryPrompt  — replaces the load error when the cloud is unavailable and this
//                         browser holds a local backup (Open Local Copy / Retry).
//   ChipRecoveryBanner  — compact persistent strip: Online + last local backup, or
//                         VIEWING LOCAL BACKUP (read-only), or the cloud-vs-local conflict choice.
// Presentation only; all behavior lives in the useChipTournament viewmodel.

import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import type { ChipRecoverySnapshot } from "../../../../models/services/chip.local-recovery";
import type { ChipOfflineMode } from "../../../../models/services/chip.offline-controller";
import type { ChipRecoveryView } from "../../../../viewmodels/use.chip.tournament";
import { COLORS } from "../../../../theme/colors";
import { RADIUS, SPACING } from "../../../../theme/spacing";
import { FONT_SIZES } from "../../../../theme/typography";
import { webMs, webSc } from "../../../../utils/scaling";

// "9:42 PM" today, otherwise "Sep 24, 9:42 PM".
export const formatBackupTime = (iso: string | null | undefined): string => {
  if (!iso) return "—";
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return "—";
  const time = when.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const sameDay = when.toDateString() === new Date().toDateString();
  return sameDay ? time : `${when.toLocaleDateString([], { month: "short", day: "numeric" })}, ${time}`;
};

const ActionButton = ({ label, onPress, primary, disabled }: { label: string; onPress: () => void; primary?: boolean; disabled?: boolean }) => (
  <TouchableOpacity
    onPress={onPress}
    disabled={disabled}
    activeOpacity={0.8}
    style={[styles.btn, primary ? styles.btnPrimary : styles.btnOutline, disabled && styles.btnDisabled]}
  >
    <Text style={[styles.btnText, primary ? styles.btnTextPrimary : styles.btnTextOutline]}>{label}</Text>
  </TouchableOpacity>
);

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export const ChipRecoveryPrompt = ({
  snapshot,
  onOpen,
  onRetry,
  canResume,
  onResume,
}: {
  snapshot: ChipRecoverySnapshot;
  onOpen: () => void;
  onRetry: () => void;
  // Phase 2: this browser's owner may resume the offline controller from this backup.
  canResume?: boolean;
  onResume?: () => void;
}) => {
  const offline = snapshot.offlineSession;
  return (
    <View style={styles.promptWrap}>
      <View style={styles.promptCard}>
        <View style={styles.row}>
          <Ionicons name="cloud-offline-outline" size={webMs(16)} color={COLORS.warning} />
          <Text style={styles.kicker}>{offline ? "OFFLINE TOURNAMENT RECOVERED" : "LOCAL TOURNAMENT BACKUP AVAILABLE"}</Text>
        </View>
        <Text style={styles.promptTitle} numberOfLines={2}>
          {snapshot.tournament.name || "Chip Tournament"}
        </Text>
        {offline && (
          <Text style={styles.promptLine}>Contains {plural(offline.unsyncedCount, "unsynced change")}</Text>
        )}
        <Text style={styles.promptLine}>Last local save: {formatBackupTime(snapshot.savedAt)}</Text>
        <Text style={styles.promptMuted}>Cloud connection is currently unavailable.</Text>
        {!snapshot.cloudConfirmed && !offline && (
          <Text style={styles.promptMuted}>This backup may include changes that never reached the cloud.</Text>
        )}
        {offline && !canResume && (
          <Text style={styles.promptMuted}>Only the director who ran it offline on this browser can resume it — read-only here.</Text>
        )}
        <View style={styles.btnRow}>
          {canResume && onResume ? <ActionButton primary label="Resume Offline Control" onPress={onResume} /> : null}
          <ActionButton primary={!canResume} label={canResume ? "Open Read-Only" : "Open Local Copy"} onPress={onOpen} />
          <ActionButton label="Retry Cloud Connection" onPress={onRetry} />
        </View>
      </View>
    </View>
  );
};

// Phase 2 — the live OFFLINE CONTROLLER strip (takes priority over the Phase 1 states).
export const ChipOfflineBanner = ({
  mode,
  unsyncedCount,
  lastLocalSaveAt,
  conflictKept,
  onRetryConnection,
  onRetryLocalSave,
  onUseCloud,
  onKeepOfflineCopy,
}: {
  mode: ChipOfflineMode;
  unsyncedCount: number;
  lastLocalSaveAt: string | null;
  conflictKept: boolean;
  onRetryConnection: () => void;
  onRetryLocalSave: () => void;
  onUseCloud: () => void;
  onKeepOfflineCopy: () => void;
}) => {
  if (mode === "online") return null;
  const changes = plural(unsyncedCount, "unsynced change");
  const saved = `Last local save: ${formatBackupTime(lastLocalSaveAt)}`;
  if (mode === "local_save_failed") {
    return (
      <View style={[styles.strip, styles.stripDanger]}>
        <View style={styles.stripText}>
          <View style={styles.row}>
            <Ionicons name="warning" size={webMs(14)} color={COLORS.error} />
            <Text style={[styles.stripTitle, styles.dangerText]}>LOCAL SAVE FAILED</Text>
          </View>
          <Text style={styles.stripSub}>
            This tournament is offline and changes cannot be safely stored on this device. Actions are paused so
            nothing is lost — {changes} not protected by the cloud.
          </Text>
        </View>
        <ActionButton primary label="Retry Local Save" onPress={onRetryLocalSave} />
      </View>
    );
  }
  if (mode === "conflict") {
    return (
      <View style={[styles.strip, styles.stripWarn]}>
        <View style={styles.stripText}>
          <View style={styles.row}>
            <Ionicons name="git-compare-outline" size={webMs(14)} color={COLORS.warning} />
            <Text style={styles.stripTitle}>{conflictKept ? "CONFLICT — CLOUD VERSION CHANGED" : "CONFLICT DETECTED"}</Text>
          </View>
          <Text style={styles.stripSub}>
            {conflictKept
              ? `Local copy protected (read-only, ${changes}). Nothing was sent to the cloud.`
              : `This tournament changed in the cloud while this device was offline. Your offline copy (${changes}) is kept safe on this device; nothing was overwritten.`}
          </Text>
        </View>
        <View style={styles.btnRow}>
          <ActionButton primary label="Use Cloud Version" onPress={onUseCloud} />
          {!conflictKept && <ActionButton label="Keep Offline Copy" onPress={onKeepOfflineCopy} />}
        </View>
      </View>
    );
  }
  const title =
    mode === "reconnecting" ? "RECONNECTING — CHECKING THE CLOUD" : mode === "syncing" ? "SYNCING — SAVING TO CLOUD…" : "OFFLINE — SAVING LOCALLY";
  return (
    <View style={[styles.strip, styles.stripWarn]}>
      <View style={styles.stripText}>
        <View style={styles.row}>
          <Ionicons name={mode === "offline" ? "cloud-offline-outline" : "sync-outline"} size={webMs(14)} color={COLORS.warning} />
          <Text style={styles.stripTitle}>{title}</Text>
        </View>
        <Text style={styles.stripSub}>
          {changes} · {saved}
          {mode === "offline" ? " · Tournament keeps running on this device." : " · Actions resume in a moment."}
        </Text>
      </View>
      {mode === "offline" && <ActionButton label="Retry Connection" onPress={onRetryConnection} />}
    </View>
  );
};

export const ChipRecoveryBanner = ({
  recovery,
  lastLocalBackupAt,
  cloudSync,
  divergentBackup,
  onRetry,
  onUseCloud,
  onKeepLocal,
  onViewDivergent,
  onDismissDivergent,
  canResume,
  onResume,
  unsyncedCount,
  localSaveFailed,
  canSyncRecovered,
  onSyncRecovered,
}: {
  canResume?: boolean;
  onResume?: () => void;
  unsyncedCount?: number;
  localSaveFailed?: boolean;
  canSyncRecovered?: boolean;
  onSyncRecovered?: () => void;
  recovery: ChipRecoveryView;
  lastLocalBackupAt: string | null;
  // Is the on-screen (live) state in the cloud yet? (normal online operation only)
  cloudSync: "synced" | "syncing" | "not_synced" | "view_only";
  divergentBackup: ChipRecoverySnapshot | null;
  onRetry: () => void;
  onUseCloud: () => void;
  onKeepLocal: () => void;
  onViewDivergent: () => void;
  onDismissDivergent: () => void;
}) => {
  if (recovery.status === "conflict") {
    return (
      <View style={[styles.strip, styles.stripWarn]}>
        <View style={styles.stripText}>
          <View style={styles.row}>
            <Ionicons name="git-compare-outline" size={webMs(14)} color={COLORS.warning} />
            <Text style={styles.stripTitle}>CLOUD DATA CHANGED</Text>
          </View>
          <Text style={styles.stripSub}>
            Cloud tournament data has changed since this local backup was created
            {recovery.unsavedSession ? " (this device also has unsaved changes from this session)" : ""}. Nothing
            has been overwritten.
          </Text>
        </View>
        <View style={styles.btnRow}>
          <ActionButton primary label="Use Cloud Version" onPress={onUseCloud} />
          <ActionButton label="Keep Local Backup Available" onPress={onKeepLocal} />
        </View>
      </View>
    );
  }
  if (recovery.status === "viewing") {
    const cloudBack = recovery.cloud === "available";
    return (
      <View style={[styles.strip, styles.stripWarn]}>
        <View style={styles.stripText}>
          <View style={styles.row}>
            <Ionicons name={cloudBack ? "cloud-done-outline" : "cloud-offline-outline"} size={webMs(14)} color={COLORS.warning} />
            <Text style={styles.stripTitle}>
              {recovery.snapshot.offlineSession && !cloudBack
                ? `OFFLINE TOURNAMENT RECOVERED — ${plural(recovery.snapshot.offlineSession.unsyncedCount, "UNSYNCED CHANGE")}`
                : cloudBack
                  ? "RECOVERY-ONLY LOCAL BACKUP — CLOUD AVAILABLE"
                  : "CLOUD UNAVAILABLE — VIEWING LOCAL BACKUP"}
            </Text>
          </View>
          <Text style={styles.stripSub}>
            Saved locally {formatBackupTime(recovery.snapshot.savedAt)}
            {recovery.snapshot.cloudConfirmed ? " · Matched the cloud when saved" : " · Includes changes NOT synced to the cloud"}
            {" · "}Recovery-only, read-only — tournament actions are disabled until you return to the cloud version.
          </Text>
        </View>
        {canResume && onResume && !cloudBack ? (
          <ActionButton primary label="Resume Offline Control" onPress={onResume} />
        ) : null}
        {cloudBack ? (
          <ActionButton primary label="Use Cloud Version" onPress={onUseCloud} />
        ) : (
          <ActionButton
            label={recovery.cloud === "checking" ? "Checking…" : "Retry Cloud Connection"}
            onPress={onRetry}
            disabled={recovery.cloud === "checking"}
          />
        )}
      </View>
    );
  }
  if (divergentBackup && canSyncRecovered && onSyncRecovered) {
    const n = divergentBackup.offlineSession?.unsyncedCount ?? 0;
    return (
      <View style={[styles.strip, styles.stripWarn]}>
        <View style={styles.stripText}>
          <View style={styles.row}>
            <Ionicons name="cloud-upload-outline" size={webMs(14)} color={COLORS.warning} />
            <Text style={styles.stripTitle}>OFFLINE CHANGES NOT SYNCED</Text>
          </View>
          <Text style={styles.stripSub}>
            This device ran the tournament offline ({plural(n, "unsynced change")}, last local save{" "}
            {formatBackupTime(divergentBackup.savedAt)}). The cloud hasn&apos;t changed since, so they can be synced
            safely. The cloud version is shown until you choose.
          </Text>
        </View>
        <View style={styles.btnRow}>
          <ActionButton primary label="Sync Offline Changes" onPress={onSyncRecovered} />
          <ActionButton label="Keep Cloud Version" onPress={onDismissDivergent} />
        </View>
      </View>
    );
  }
  if (divergentBackup) {
    return (
      <View style={[styles.strip, styles.stripWarn]}>
        <View style={styles.stripText}>
          <Text style={styles.stripSub}>
            Not synced: a local backup from {formatBackupTime(divergentBackup.savedAt)} has changes that never reached
            the cloud. The cloud version is shown; the backup is kept on this browser for 7 days (recovery-only, it
            is not restored automatically).
          </Text>
        </View>
        <View style={styles.btnRow}>
          <ActionButton label="View Backup" onPress={onViewDivergent} />
          <ActionButton label="Dismiss" onPress={onDismissDivergent} />
        </View>
      </View>
    );
  }
  if (cloudSync === "view_only") {
    return (
      <View style={styles.onlineRow}>
        <Ionicons name="lock-closed-outline" size={webMs(12)} color={COLORS.warning} />
        <Text style={[styles.onlineText, styles.notSyncedText]}>View only — not loaded from your signed-in account · nothing is saved</Text>
      </View>
    );
  }
  if (!lastLocalBackupAt && cloudSync === "synced" && !localSaveFailed) return null;
  const local = localSaveFailed
    ? "LOCAL BACKUP FAILED"
    : lastLocalBackupAt
      ? `Saved locally ${formatBackupTime(lastLocalBackupAt)}`
      : "Not saved locally";
  const pending = unsyncedCount && cloudSync !== "synced" ? ` (${plural(unsyncedCount, "change")})` : "";
  if (cloudSync === "not_synced" || localSaveFailed) {
    return (
      <View style={styles.onlineRow}>
        <Ionicons name="alert-circle" size={webMs(12)} color={COLORS.warning} />
        <Text style={[styles.onlineText, styles.notSyncedText]}>
          {local} · {cloudSync === "synced" ? "Synced to cloud" : `NOT synced to cloud yet${pending}`}
        </Text>
      </View>
    );
  }
  return (
    <View style={styles.onlineRow}>
      <View style={[styles.onlineDot, cloudSync === "syncing" && styles.syncingDot]} />
      <Text style={styles.onlineText}>
        {local} · {cloudSync === "synced" ? "Synced to cloud" : `Syncing to cloud…${pending}`}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: webSc(SPACING.xs) },
  promptWrap: { alignItems: "center", paddingVertical: webSc(SPACING.xl), paddingHorizontal: webSc(SPACING.md) },
  promptCard: {
    width: "100%",
    maxWidth: 440,
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: RADIUS.md,
    padding: webSc(SPACING.md),
    gap: webSc(SPACING.xs),
  },
  kicker: { color: COLORS.warning, fontSize: webMs(FONT_SIZES.xs), fontWeight: "700", letterSpacing: 0.5 },
  promptTitle: { color: COLORS.text, fontSize: webMs(FONT_SIZES.lg), fontWeight: "700", marginTop: webSc(SPACING.xs) },
  promptLine: { color: COLORS.text, fontSize: webMs(FONT_SIZES.sm) },
  promptMuted: { color: COLORS.textSecondary, fontSize: webMs(FONT_SIZES.xs) },
  btnRow: { flexDirection: "row", flexWrap: "wrap", gap: webSc(SPACING.sm), marginTop: webSc(SPACING.xs) },
  btn: { paddingVertical: webSc(SPACING.sm), paddingHorizontal: webSc(SPACING.md), borderRadius: RADIUS.sm, borderWidth: 1 },
  btnPrimary: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  btnOutline: { backgroundColor: COLORS.transparent, borderColor: COLORS.borderLight },
  btnDisabled: { opacity: 0.5 },
  btnText: { fontSize: webMs(FONT_SIZES.xs), fontWeight: "700" },
  btnTextPrimary: { color: COLORS.white },
  btnTextOutline: { color: COLORS.text },
  strip: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: webSc(SPACING.sm),
    paddingVertical: webSc(SPACING.sm),
    paddingHorizontal: webSc(SPACING.md),
    marginBottom: webSc(SPACING.sm),
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    backgroundColor: COLORS.surface,
  },
  stripWarn: { borderColor: COLORS.warning },
  stripDanger: { borderColor: COLORS.error },
  dangerText: { color: COLORS.error },
  stripText: { flexShrink: 1, flexGrow: 1, gap: webSc(SPACING.xs) / 2 },
  stripTitle: { color: COLORS.warning, fontSize: webMs(FONT_SIZES.xs), fontWeight: "700", letterSpacing: 0.4 },
  stripSub: { color: COLORS.textSecondary, fontSize: webMs(FONT_SIZES.xs) },
  onlineRow: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-end",
    gap: webSc(SPACING.xs),
    marginBottom: webSc(SPACING.xs),
  },
  onlineDot: { width: webSc(SPACING.sm), height: webSc(SPACING.sm), borderRadius: RADIUS.full, backgroundColor: COLORS.success },
  onlineText: { color: COLORS.textMuted, fontSize: webMs(FONT_SIZES.xs) },
  notSyncedText: { color: COLORS.warning, fontWeight: "700" },
  syncingDot: { backgroundColor: COLORS.warning },
});
