// src/views/components/tournament/live/ElimRecoveryModal.tsx
// Elimination (Single + Double) Recovery & History — Actions → Recovery & History. Same UX
// family as Chip's Actions → Undo / Audit Log (centered modal, plain-language timeline), with
// bracket-safe server logic: Undo and Restore are previewed by the server (exact downstream
// impact), confirmed by the TD, then applied transactionally against the revision the TD saw.
// Shared by web and native (centered sheet on both). Data loads only while it's open.

import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { MatchLiveState } from "../../../../models/types/tournament-settings.types";
import { COLORS } from "../../../../theme/colors";
import { RADIUS, SPACING } from "../../../../theme/spacing";
import { FONT_SIZES } from "../../../../theme/typography";
import {
  auditFieldChanges,
  checkpointBadge,
  checkpointTitle,
  describeAudit,
  impactSummary,
  undoUnavailableText,
  auditOpTitle,
} from "../../../../utils/elim-recovery.format";
import { webMs, webSc } from "../../../../utils/scaling";
import { recoveryOffline, useElimRecovery } from "../../../../viewmodels/hooks/use.elim.recovery";

const confirmRecovery = (title: string, message: string, okText: string): Promise<boolean> =>
  new Promise((resolve) =>
    Alert.alert(title, message, [
      { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
      { text: okText, style: "destructive", onPress: () => resolve(true) },
    ], { cancelable: true, onDismiss: () => resolve(false) }),
  );

const clock = (iso: string | null | undefined): string => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return d.toDateString() === new Date().toDateString()
    ? time
    : `${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })} ${time}`;
};

export const ElimRecoveryModal = ({
  visible,
  onClose,
  tournamentId,
  revision,
  standingsChanged,
  onChanged,
}: {
  visible: boolean;
  onClose: () => void;
  tournamentId: number | null;
  revision: number | null;
  // Would replacing matchState with this one change the standings? (computed with the app's
  // own resolver by the caller) — adds "change the current standings" to confirmations.
  standingsChanged?: (ms: Record<string, MatchLiveState>) => boolean;
  onChanged: () => void;
}) => {
  const rec = useElimRecovery(tournamentId, visible, onChanged);
  const [tab, setTab] = useState<"history" | "restore">("history");
  const [openId, setOpenId] = useState<number | null>(null);
  const [restoringId, setRestoringId] = useState<number | null>(null);
  const offline = recoveryOffline();

  const undoP = rec.undoPreview;
  const undoTitle = undoP?.undoing ? auditOpTitle(undoP.undoing.op) : null;
  const undoLine = useMemo(() => {
    if (!undoP?.undoing) return null;
    const u = undoP.undoing;
    const d = describeAudit({ op: u.op, match_id: u.matchId, after: u.after ?? null, before: u.before ?? null, detail: { p1Name: u.p1Name ?? undefined, p2Name: u.p2Name ?? undefined } });
    return [d.line, d.match, clock(u.at)].filter(Boolean).join(" · ");
  }, [undoP]);

  const doUndo = async () => {
    if (!undoP?.available || undoP.revision == null) return;
    if (offline) return Alert.alert("You're offline", "Recovery actions require an internet connection.");
    const body = [undoLine, impactSummary(undoP.impact, { standingsChanged: undoP.matchState ? standingsChanged?.(undoP.matchState) : false })]
      .filter(Boolean)
      .join("\n\n");
    if (!(await confirmRecovery(`Undo “${undoTitle}”?`, body, "Undo"))) return;
    const r = await rec.undo(undoP.revision);
    if (!r.ok) Alert.alert("Couldn't undo", r.message);
  };

  const doRestore = async (checkpointId: number, when: string) => {
    if (offline) return Alert.alert("You're offline", "Recovery actions require an internet connection.");
    setRestoringId(checkpointId);
    try {
      const p = await rec.previewRestore(checkpointId);
      if (!p.ok) return Alert.alert("Can't restore", p.message);
      const body = impactSummary(p.preview.impact, { standingsChanged: standingsChanged?.(p.preview.matchState) });
      if (!(await confirmRecovery(`Restore tournament to ${when}?`, body, "Restore"))) return;
      const r = await rec.restore(checkpointId, p.preview.revision);
      if (!r.ok) Alert.alert("Couldn't restore", r.message);
    } finally {
      setRestoringId(null);
    }
  };

  const lastCk = rec.checkpoints[0] ?? null;

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.header}>
            <Text allowFontScaling={false} style={styles.title}>Recovery & History</Text>
            <TouchableOpacity onPress={onClose} hitSlop={10} accessibilityLabel="Close">
              <Text allowFontScaling={false} style={styles.closeX}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Status summary — confidence, not diagnostics */}
          <View style={styles.statusRow}>
            <Stat label="Cloud" value={offline ? "Offline" : "Synced"} tone={offline ? "warn" : "ok"} />
            <Stat label="Revision" value={revision != null ? `#${revision}` : "—"} />
            <Stat label="Last checkpoint" value={lastCk ? clock(lastCk.created_at) : "None yet"} />
            <Stat label="Restore points" value={String(rec.checkpoints.length)} />
          </View>

          {/* Undo */}
          <View style={styles.undoCard}>
            <View style={styles.undoText}>
              <Text allowFontScaling={false} style={styles.undoLabel}>
                {undoP?.available && undoTitle ? `Undo “${undoTitle}”` : "Undo last action"}
              </Text>
              <Text allowFontScaling={false} style={styles.undoSub} numberOfLines={3}>
                {rec.loadingUndo && !undoP
                  ? "Checking…"
                  : undoP?.available
                    ? undoLine ?? ""
                    : undoUnavailableText(undoP?.reason)}
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.undoBtn, (!undoP?.available || rec.busy || offline) && styles.btnDisabled]}
              disabled={!undoP?.available || rec.busy || offline}
              onPress={doUndo}
              accessibilityRole="button"
            >
              <Text allowFontScaling={false} style={styles.undoBtnText}>{rec.busy ? "…" : "Undo"}</Text>
            </TouchableOpacity>
          </View>
          {offline && <Text allowFontScaling={false} style={styles.offlineNote}>Recovery actions require an internet connection.</Text>}

          {/* Tabs */}
          <View style={styles.segment}>
            {(["history", "restore"] as const).map((k) => (
              <TouchableOpacity key={k} style={[styles.segBtn, tab === k && styles.segBtnOn]} onPress={() => setTab(k)} activeOpacity={0.8}>
                <Text allowFontScaling={false} style={[styles.segText, tab === k && styles.segTextOn]}>
                  {k === "history" ? "History" : `Restore Points (${rec.checkpoints.length})`}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <ScrollView style={styles.list} contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}>
            {tab === "history" ? (
              rec.loadingHistory ? (
                <ActivityIndicator color={COLORS.primary} style={styles.loader} />
              ) : rec.rows.length === 0 ? (
                <Text allowFontScaling={false} style={styles.empty}>No recorded activity yet.</Text>
              ) : (
                <>
                  {rec.rows.map((r) => {
                    const d = describeAudit(r, rec.actorName(r.actor_id));
                    const open = openId === r.id;
                    const changes = open ? auditFieldChanges(r) : [];
                    return (
                      <TouchableOpacity key={r.id} style={styles.item} onPress={() => setOpenId(open ? null : r.id)} activeOpacity={0.8}>
                        <View style={styles.itemTop}>
                          <Text allowFontScaling={false} style={styles.itemTitle} numberOfLines={1}>{d.title}</Text>
                          <Text allowFontScaling={false} style={styles.itemTime}>{clock(r.created_at)}</Text>
                        </View>
                        {!!d.line && <Text allowFontScaling={false} style={styles.itemLine} numberOfLines={open ? 4 : 2}>{d.line}</Text>}
                        <Text allowFontScaling={false} style={styles.itemMeta} numberOfLines={1}>
                          {[d.match, d.by ? `by ${d.by}` : null].filter(Boolean).join(" · ")}
                        </Text>
                        {open && (
                          <View style={styles.detail}>
                            {changes.map((c) => (
                              <Text key={c.field} allowFontScaling={false} style={styles.detailLine}>
                                {c.field}: {c.from} → {c.to}
                              </Text>
                            ))}
                            {(r.detail?.cascade?.reset?.length ?? 0) > 0 && (
                              <Text allowFontScaling={false} style={styles.detailLine}>
                                Later matches reset: {r.detail!.cascade!.reset!.join(", ")}
                              </Text>
                            )}
                            {r.table_id != null && <Text allowFontScaling={false} style={styles.detailLine}>Table id {r.table_id}</Text>}
                            <Text allowFontScaling={false} style={styles.detailMuted}>Revision #{r.revision}</Text>
                          </View>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                  {rec.hasMore && (
                    <TouchableOpacity style={styles.more} onPress={rec.loadMore} disabled={rec.loadingMore}>
                      <Text allowFontScaling={false} style={styles.moreText}>{rec.loadingMore ? "Loading…" : "Load more"}</Text>
                    </TouchableOpacity>
                  )}
                </>
              )
            ) : rec.loadingCheckpoints ? (
              <ActivityIndicator color={COLORS.primary} style={styles.loader} />
            ) : rec.checkpoints.length === 0 ? (
              <Text allowFontScaling={false} style={styles.empty}>
                {"No restore points yet. They're saved automatically before corrections, resets, reopens and at tournament milestones."}
              </Text>
            ) : (
              rec.checkpoints.map((c) => (
                <View key={c.id} style={styles.item}>
                  <View style={styles.itemTop}>
                    <Text allowFontScaling={false} style={styles.itemTitle} numberOfLines={1}>{checkpointTitle(c)}</Text>
                    <Text allowFontScaling={false} style={styles.itemTime}>{clock(c.created_at)}</Text>
                  </View>
                  <View style={styles.ckRow}>
                    <Text allowFontScaling={false} style={styles.itemMeta} numberOfLines={1}>
                      {[checkpointBadge(c), `Revision #${c.revision}`, rec.actorName(c.actor_id) ? `by ${rec.actorName(c.actor_id)}` : null]
                        .filter(Boolean)
                        .join(" · ")}
                    </Text>
                    {c.milestone && (
                      <View style={styles.badge}>
                        <Text allowFontScaling={false} style={styles.badgeText}>Milestone</Text>
                      </View>
                    )}
                    <TouchableOpacity
                      style={[styles.restoreBtn, (rec.busy || offline || restoringId != null) && styles.btnDisabled]}
                      disabled={rec.busy || offline || restoringId != null}
                      onPress={() => doRestore(c.id, clock(c.created_at))}
                    >
                      <Text allowFontScaling={false} style={styles.restoreBtnText}>{restoringId === c.id ? "…" : "Restore"}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}
          </ScrollView>

          <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
            <Text allowFontScaling={false} style={styles.closeBtnText}>Close</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const Stat = ({ label, value, tone }: { label: string; value: string; tone?: "ok" | "warn" }) => (
  <View style={styles.stat}>
    <Text allowFontScaling={false} style={styles.statLabel}>{label}</Text>
    <Text allowFontScaling={false} style={[styles.statValue, tone === "ok" && styles.statOk, tone === "warn" && styles.statWarn]} numberOfLines={1}>
      {value}
    </Text>
  </View>
);

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center", padding: webSc(SPACING.lg) },
  sheet: {
    width: "100%",
    maxWidth: webSc(560),
    maxHeight: "88%",
    backgroundColor: COLORS.surface,
    borderRadius: webSc(RADIUS.xl),
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: webSc(SPACING.lg),
  },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { fontSize: webMs(FONT_SIZES.lg), fontWeight: "800", color: COLORS.text },
  closeX: { fontSize: webMs(FONT_SIZES.lg), fontWeight: "700", color: COLORS.textSecondary },
  statusRow: { flexDirection: "row", flexWrap: "wrap", gap: webSc(SPACING.xs), marginTop: webSc(SPACING.md) },
  stat: {
    flexGrow: 1,
    flexBasis: "22%",
    minWidth: webSc(96),
    backgroundColor: COLORS.background,
    borderRadius: webSc(RADIUS.md),
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: webSc(SPACING.xs),
    paddingHorizontal: webSc(SPACING.sm),
  },
  statLabel: { fontSize: webMs(FONT_SIZES.xs), color: COLORS.textMuted, fontWeight: "600" },
  statValue: { fontSize: webMs(FONT_SIZES.sm), color: COLORS.text, fontWeight: "700", marginTop: 2 },
  statOk: { color: COLORS.success },
  statWarn: { color: COLORS.warning },
  undoCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: webSc(SPACING.sm),
    marginTop: webSc(SPACING.md),
    backgroundColor: COLORS.background,
    borderRadius: webSc(RADIUS.lg),
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: webSc(SPACING.md),
  },
  undoText: { flex: 1, minWidth: 0 },
  undoLabel: { fontSize: webMs(FONT_SIZES.md), color: COLORS.text, fontWeight: "700" },
  undoSub: { fontSize: webMs(FONT_SIZES.xs), color: COLORS.textSecondary, marginTop: 2, lineHeight: webMs(FONT_SIZES.xs) * 1.45 },
  undoBtn: { backgroundColor: COLORS.primary, borderRadius: webSc(RADIUS.md), paddingVertical: webSc(SPACING.sm), paddingHorizontal: webSc(SPACING.lg) },
  undoBtnText: { color: COLORS.white, fontWeight: "700", fontSize: webMs(FONT_SIZES.sm) },
  btnDisabled: { opacity: 0.45 },
  offlineNote: { fontSize: webMs(FONT_SIZES.xs), color: COLORS.warning, marginTop: webSc(SPACING.xs), fontWeight: "600" },
  segment: {
    flexDirection: "row",
    marginTop: webSc(SPACING.md),
    backgroundColor: COLORS.background,
    borderRadius: webSc(RADIUS.md),
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 3,
  },
  segBtn: { flex: 1, alignItems: "center", paddingVertical: webSc(SPACING.xs), borderRadius: webSc(RADIUS.md - 2) },
  segBtnOn: { backgroundColor: COLORS.primary },
  segText: { fontSize: webMs(FONT_SIZES.sm), color: COLORS.textSecondary, fontWeight: "600" },
  segTextOn: { color: COLORS.white },
  list: { marginTop: webSc(SPACING.sm), flexGrow: 0 },
  listContent: { paddingBottom: webSc(SPACING.xs) },
  loader: { marginVertical: webSc(SPACING.lg) },
  empty: { fontSize: webMs(FONT_SIZES.sm), color: COLORS.textMuted, textAlign: "center", marginVertical: webSc(SPACING.lg), paddingHorizontal: webSc(SPACING.md) },
  item: { paddingVertical: webSc(SPACING.sm), borderBottomWidth: 1, borderBottomColor: COLORS.border },
  itemTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: webSc(SPACING.sm) },
  itemTitle: { flex: 1, fontSize: webMs(FONT_SIZES.sm), color: COLORS.text, fontWeight: "700" },
  itemTime: { fontSize: webMs(FONT_SIZES.xs), color: COLORS.textMuted, fontVariant: ["tabular-nums"] },
  itemLine: { fontSize: webMs(FONT_SIZES.sm), color: COLORS.textSecondary, marginTop: 2 },
  itemMeta: { flexShrink: 1, fontSize: webMs(FONT_SIZES.xs), color: COLORS.textMuted, marginTop: 2 },
  detail: { marginTop: webSc(SPACING.xs), paddingTop: webSc(SPACING.xs), borderTopWidth: 1, borderTopColor: COLORS.border, gap: 2 },
  detailLine: { fontSize: webMs(FONT_SIZES.xs), color: COLORS.textSecondary },
  detailMuted: { fontSize: webMs(FONT_SIZES.xs), color: COLORS.textMuted },
  ckRow: { flexDirection: "row", alignItems: "center", gap: webSc(SPACING.sm), marginTop: 2 },
  badge: { borderWidth: 1, borderColor: COLORS.border, borderRadius: webSc(RADIUS.full), paddingHorizontal: webSc(SPACING.xs), paddingVertical: 1 },
  badgeText: { fontSize: webMs(FONT_SIZES.xs - 1), color: COLORS.textMuted, fontWeight: "700" },
  restoreBtn: {
    marginLeft: "auto",
    borderWidth: 1,
    borderColor: COLORS.primary,
    borderRadius: webSc(RADIUS.md),
    paddingVertical: webSc(4),
    paddingHorizontal: webSc(SPACING.md),
  },
  restoreBtnText: { color: COLORS.primary, fontWeight: "700", fontSize: webMs(FONT_SIZES.xs) },
  more: { alignItems: "center", paddingVertical: webSc(SPACING.md) },
  moreText: { color: COLORS.primary, fontWeight: "700", fontSize: webMs(FONT_SIZES.sm) },
  closeBtn: {
    marginTop: webSc(SPACING.md),
    paddingVertical: webSc(SPACING.md),
    borderRadius: webSc(RADIUS.md),
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
  },
  closeBtnText: { fontSize: webMs(FONT_SIZES.md), fontWeight: "800", color: COLORS.text },
});
