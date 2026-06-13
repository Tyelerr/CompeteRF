// src/views/components/tournament/live/QueueView.tsx
// Queue Manager — the TD's live operations screen. Shows ready-to-play matches
// with wait time + bracket location, lets the TD reorder the queue and assign a
// match to a specific table, and runs Auto Assign (preview → apply) to fill free
// tables using the selected mode. Assigning a table PARKS the match on it; the TD
// then starts it from the On Tables list (or uses Assign & Start to do both).

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { COLORS } from "../../../../theme/colors";
import { RADIUS, SPACING } from "../../../../theme/spacing";
import { FONT_SIZES } from "../../../../theme/typography";
import { webMs, webSc } from "../../../../utils/scaling";
import {
  AutoAssignMode,
  GeneratedBracket,
  MatchLiveState,
} from "../../../../models/types/tournament-settings.types";
import { TournamentTable } from "../../../../models/types/tournament-table.types";
import { LiveMatch } from "../../../../utils/match.utils";
import {
  AUTO_ASSIGN_MODES,
  AssignmentPlan,
  buildQueueEntries,
  computeReadyAtMap,
  formatWait,
  freeTables,
  orderQueue,
  planAutoAssign,
} from "../../../../utils/queue.utils";
import { Dropdown } from "../../common/dropdown";
import { ActionMenu, ActionMenuItem } from "../../admin/ActionMenu";

interface QueueViewProps {
  matches: LiveMatch[];
  tables: TournamentTable[];
  bracket: GeneratedBracket | null;
  matchState: Record<string, MatchLiveState>;
  occupancy: Record<number, string>; // tableId -> occupying match label
  mode: AutoAssignMode;
  queueOrder: string[];
  onAssign: (matchId: string, tableId: number) => void; // park on a table (not started)
  onAssignStart: (matchId: string, tableId: number) => void; // park + start
  onStart: (matchId: string) => void; // start a match already parked on a table
  onUnassign: (matchId: string) => void;
  onSetMode: (mode: AutoAssignMode) => void;
  onSetQueueOrder: (ids: string[]) => void;
}

const tableLabelOf = (t: TournamentTable): string =>
  t.label ? `${t.label} ${t.table_number}` : `Table ${t.table_number}`;

const waitColor = (ms: number): string => {
  const m = ms / 60000;
  if (m >= 20) return COLORS.error;
  if (m >= 10) return COLORS.warning;
  return COLORS.textSecondary;
};

export const QueueView = ({
  matches,
  tables,
  bracket,
  matchState,
  occupancy,
  mode,
  queueOrder,
  onAssign,
  onAssignStart,
  onStart,
  onUnassign,
  onSetMode,
  onSetQueueOrder,
}: QueueViewProps) => {
  // Tick so wait times update live.
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  const [showOnTables, setShowOnTables] = useState(true);
  const [autoOpen, setAutoOpen] = useState(false);
  // Match ids assigned during this Auto Assign session — listed under the
  // preview as "Recently Applied" so the TD can move them or send them back.
  const [appliedIds, setAppliedIds] = useState<string[]>([]);

  const readyAtMap = useMemo(
    () => computeReadyAtMap(bracket, matchState),
    [bracket, matchState],
  );
  const entries = useMemo(
    () => buildQueueEntries(matches, readyAtMap, now),
    [matches, readyAtMap, now],
  );
  const ordered = useMemo(
    () => orderQueue(entries, mode, queueOrder),
    [entries, mode, queueOrder],
  );
  const available = useMemo(
    () => freeTables(tables, occupancy),
    [tables, occupancy],
  );
  // Every match sitting on a table — parked (assigned, not started) or in progress.
  // Parked matches get a Start button; in-progress ones show their live status.
  const onTables = useMemo(
    () =>
      matches.filter(
        (m) =>
          m.tableId != null && m.status !== "completed" && !m.bye && !m.empty,
      ),
    [matches],
  );
  const assignableCount = tables.filter((t) => t.status !== "unavailable").length;

  const matchById = useMemo(() => {
    const map: Record<string, LiveMatch> = {};
    for (const m of matches) map[m.id] = m;
    return map;
  }, [matches]);
  const tableById = useMemo(() => {
    const map: Record<number, TournamentTable> = {};
    for (const t of tables) map[t.id] = t;
    return map;
  }, [tables]);

  // Reordering takes the TD into Manual mode with the current order applied.
  const reorderRef = useRef(onSetQueueOrder);
  reorderRef.current = onSetQueueOrder;
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= ordered.length) return;
    const ids = ordered.map((e) => e.match.id);
    [ids[i], ids[j]] = [ids[j], ids[i]];
    reorderRef.current(ids);
  };

  // The pending plan, recomputed live from the current queue + free tables.
  const autoPlan = useMemo(
    () => planAutoAssign(ordered, available),
    [ordered, available],
  );

  const runAutoAssign = () => {
    setAppliedIds([]);
    setAutoOpen(true);
  };
  // Assign ALL planned matches at once; they drop into Recently Applied below.
  // start = also begin the matches (Assign & Start), otherwise just park them.
  const applyAll = (plan: AssignmentPlan[], start: boolean) => {
    for (const p of plan) {
      if (start) onAssignStart(p.matchId, p.tableId);
      else onAssign(p.matchId, p.tableId);
    }
    setAppliedIds((prev) => [...prev, ...plan.map((p) => p.matchId)]);
  };
  const sendBackToQueue = (matchId: string) => {
    onUnassign(matchId);
    setAppliedIds((ids) => ids.filter((id) => id !== matchId));
  };
  const undoAll = () => {
    for (const id of appliedIds) onUnassign(id);
    setAppliedIds([]);
  };

  const players = (m: LiveMatch | undefined): string =>
    m ? `${m.p1Name ?? "TBD"} vs ${m.p2Name ?? "TBD"}` : "—";

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Controls */}
        <View style={styles.headRow}>
          <Text allowFontScaling={false} style={styles.tablesChip}>
            {available.length} of {assignableCount} tables free
          </Text>
        </View>
        <View style={styles.controls}>
          <TouchableOpacity
            style={[styles.autoBtn, available.length === 0 && styles.btnDisabled]}
            onPress={runAutoAssign}
            disabled={available.length === 0 || ordered.length === 0}
            activeOpacity={0.85}
          >
            <Text allowFontScaling={false} style={styles.autoBtnText}>
              {"⚡"} Auto Assign
            </Text>
          </TouchableOpacity>
          <View style={styles.modeWrap}>
            <Dropdown
              options={AUTO_ASSIGN_MODES}
              value={mode}
              onSelect={(v) => onSetMode(v as AutoAssignMode)}
              placeholder="Mode"
            />
          </View>
        </View>

        {/* On tables now */}
        {onTables.length > 0 && (
          <View style={styles.section}>
            <TouchableOpacity
              style={styles.sectionHead}
              onPress={() => setShowOnTables((s) => !s)}
            >
              <Text allowFontScaling={false} style={styles.sectionTitle}>
                {showOnTables ? "▾" : "▸"} On Tables ({onTables.length})
              </Text>
            </TouchableOpacity>
            {showOnTables &&
              onTables.map((m) => {
                const playing = m.status === "in_progress";
                return (
                  <View key={m.id} style={styles.onTableRow}>
                    <View style={styles.onTableInfo}>
                      <Text
                        allowFontScaling={false}
                        style={styles.onTableText}
                        numberOfLines={1}
                      >
                        {players(m)}
                      </Text>
                      <Text allowFontScaling={false} style={styles.onTableTable}>
                        {m.tableLabel ?? "Table"}
                        {!playing ? " · Not started" : ""}
                      </Text>
                    </View>
                    <View style={styles.onTableActions}>
                      {playing ? (
                        m.isStream ? (
                          <Text allowFontScaling={false} style={styles.liveBadgeText}>
                            {"● LIVE"}
                          </Text>
                        ) : (
                          <Text allowFontScaling={false} style={styles.playingTag}>
                            Playing
                          </Text>
                        )
                      ) : (
                        <TouchableOpacity
                          style={styles.startBtn}
                          onPress={() => onStart(m.id)}
                        >
                          <Text allowFontScaling={false} style={styles.startBtnText}>
                            {"▶ Start"}
                          </Text>
                        </TouchableOpacity>
                      )}
                      {/* Undo — send back to the queue (parked or just-started). */}
                      <TouchableOpacity
                        style={styles.backBtn}
                        onPress={() => onUnassign(m.id)}
                      >
                        <Text allowFontScaling={false} style={styles.backBtnText}>
                          {"↩"}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}
          </View>
        )}

        {/* Up next */}
        <Text allowFontScaling={false} style={styles.upNextLabel}>
          Up Next ({ordered.length})
        </Text>
        {ordered.length === 0 ? (
          <View style={styles.empty}>
            <Text allowFontScaling={false} style={styles.emptyText}>
              No matches are ready right now. They&apos;ll appear here as players
              finish.
            </Text>
          </View>
        ) : (
          ordered.map((e, i) => (
            <View key={e.match.id} style={styles.queueCard}>
              <View style={styles.queueTop}>
                <View style={styles.rankCol}>
                  <Text allowFontScaling={false} style={styles.rankNum}>
                    {i + 1}
                  </Text>
                  <View style={styles.arrows}>
                    <TouchableOpacity
                      onPress={() => move(i, -1)}
                      disabled={i === 0}
                      style={[styles.arrowBtn, i === 0 && styles.arrowOff]}
                    >
                      <Text allowFontScaling={false} style={styles.arrowText}>
                        ▲
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => move(i, 1)}
                      disabled={i === ordered.length - 1}
                      style={[
                        styles.arrowBtn,
                        i === ordered.length - 1 && styles.arrowOff,
                      ]}
                    >
                      <Text allowFontScaling={false} style={styles.arrowText}>
                        ▼
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>

                <View style={styles.matchCol}>
                  <Text
                    allowFontScaling={false}
                    style={styles.matchPlayers}
                    numberOfLines={1}
                  >
                    {players(e.match)}
                  </Text>
                  <View style={styles.metaRow}>
                    <View style={styles.locChip}>
                      <Text allowFontScaling={false} style={styles.locText}>
                        {e.location}
                      </Text>
                    </View>
                    <Text
                      allowFontScaling={false}
                      style={[styles.wait, { color: waitColor(e.waitMs) }]}
                    >
                      Waiting {formatWait(e.waitMs)}
                    </Text>
                  </View>
                </View>
              </View>

              {/* Assign actions sit on their own row so the menus never crowd the
                  wait time. */}
              <View style={styles.assignRow}>
                {available.length > 0 ? (
                  <>
                    <ActionMenu
                      label="Assign"
                      items={available.map<ActionMenuItem>((t) => ({
                        label: tableLabelOf(t),
                        onPress: () => onAssign(e.match.id, t.id),
                      }))}
                    />
                    <ActionMenu
                      label="Assign & Start"
                      items={available.map<ActionMenuItem>((t) => ({
                        label: tableLabelOf(t),
                        onPress: () => onAssignStart(e.match.id, t.id),
                      }))}
                    />
                  </>
                ) : (
                  <Text allowFontScaling={false} style={styles.noTable}>
                    No table free
                  </Text>
                )}
              </View>
            </View>
          ))
        )}
      </ScrollView>

      {/* Auto Assign — preview on top, Recently Applied stacked below */}
      <Modal
        visible={autoOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setAutoOpen(false)}
      >
        <View style={styles.overlay}>
          <View style={styles.previewCard}>
            <Text allowFontScaling={false} style={styles.previewTitle}>
              {"⚡"} Auto Assign
            </Text>

            {/* Pending plan */}
            {autoPlan.length > 0 ? (
              <>
                <Text allowFontScaling={false} style={styles.sectionLabel}>
                  Will place:
                </Text>
                <ScrollView style={styles.previewList} bounces={false}>
                  {autoPlan.map((p) => (
                    <View key={p.matchId} style={styles.previewRow}>
                      <Text
                        allowFontScaling={false}
                        style={styles.previewMatch}
                        numberOfLines={1}
                      >
                        {players(matchById[p.matchId])}
                      </Text>
                      <Text allowFontScaling={false} style={styles.previewArrow}>
                        {"→"}
                      </Text>
                      <Text allowFontScaling={false} style={styles.previewTable}>
                        {tableById[p.tableId]
                          ? tableLabelOf(tableById[p.tableId])
                          : "Table"}
                      </Text>
                    </View>
                  ))}
                </ScrollView>
                <TouchableOpacity
                  style={styles.previewApply}
                  onPress={() => applyAll(autoPlan, false)}
                >
                  <Text allowFontScaling={false} style={styles.previewApplyText}>
                    Assign All ({autoPlan.length})
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.previewApplyStart}
                  onPress={() => applyAll(autoPlan, true)}
                >
                  <Text allowFontScaling={false} style={styles.previewApplyStartText}>
                    {"▶ Assign & Start All"} ({autoPlan.length})
                  </Text>
                </TouchableOpacity>
              </>
            ) : (
              <Text allowFontScaling={false} style={styles.appliedEmpty}>
                {available.length === 0
                  ? "No tables free."
                  : "No matches ready to assign."}
              </Text>
            )}

            {/* Recently applied (below the preview) */}
            {appliedIds.length > 0 && (
              <>
                <View style={styles.divider} />
                <View style={styles.appliedHeader}>
                  <Text allowFontScaling={false} style={styles.sectionLabel}>
                    Recently Applied
                  </Text>
                  <TouchableOpacity onPress={undoAll}>
                    <Text allowFontScaling={false} style={styles.undoLink}>
                      Undo All
                    </Text>
                  </TouchableOpacity>
                </View>
                <ScrollView style={styles.appliedList} bounces={false}>
                  {appliedIds.map((id) => {
                    const m = matchById[id];
                    return (
                      <View key={id} style={styles.appliedRow}>
                        <View style={styles.appliedInfo}>
                          <Text
                            allowFontScaling={false}
                            style={styles.previewMatch}
                            numberOfLines={1}
                          >
                            {players(m)}
                          </Text>
                          <Text allowFontScaling={false} style={styles.appliedTable}>
                            {m?.tableLabel ?? "—"}
                          </Text>
                        </View>
                        <View style={styles.appliedActions}>
                          {m?.status !== "in_progress" && (
                            <TouchableOpacity
                              style={styles.startBtn}
                              onPress={() => onStart(id)}
                            >
                              <Text allowFontScaling={false} style={styles.startBtnText}>
                                {"▶ Start"}
                              </Text>
                            </TouchableOpacity>
                          )}
                          {available.length > 0 && (
                            <ActionMenu
                              label="Move"
                              items={available.map<ActionMenuItem>((t) => ({
                                label: tableLabelOf(t),
                                onPress: () => onAssign(id, t.id),
                              }))}
                            />
                          )}
                          <TouchableOpacity
                            style={styles.backBtn}
                            onPress={() => sendBackToQueue(id)}
                          >
                            <Text allowFontScaling={false} style={styles.backBtnText}>
                              {"↩"} Queue
                            </Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    );
                  })}
                </ScrollView>
              </>
            )}

            <TouchableOpacity
              style={styles.previewCancel}
              onPress={() => setAutoOpen(false)}
            >
              <Text allowFontScaling={false} style={styles.previewCancelText}>
                Close
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: {
    padding: webSc(SPACING.md),
    paddingBottom: webSc(SPACING.xl * 2),
    ...Platform.select({
      web: { maxWidth: 760, width: "100%" as any, alignSelf: "center" as any },
    }),
  },
  headRow: { alignItems: "flex-end", marginBottom: webSc(SPACING.xs) },
  tablesChip: {
    fontSize: webMs(FONT_SIZES.xs),
    color: COLORS.textSecondary,
    fontWeight: "600",
  },
  controls: {
    flexDirection: "row",
    alignItems: "center",
    gap: webSc(SPACING.sm),
    marginBottom: webSc(SPACING.md),
  },
  autoBtn: {
    flex: 1,
    height: webSc(44),
    backgroundColor: COLORS.primary,
    borderRadius: webSc(RADIUS.sm),
    alignItems: "center",
    justifyContent: "center",
  },
  btnDisabled: { opacity: 0.5 },
  autoBtnText: {
    fontSize: webMs(FONT_SIZES.sm),
    color: COLORS.white,
    fontWeight: "700",
  },
  modeWrap: { flex: 1 },
  // Sections
  section: {
    backgroundColor: COLORS.surface,
    borderRadius: webSc(RADIUS.md),
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: webSc(SPACING.sm),
    marginBottom: webSc(SPACING.md),
  },
  sectionHead: { paddingVertical: webSc(SPACING.xs) },
  sectionTitle: {
    fontSize: webMs(FONT_SIZES.sm),
    fontWeight: "700",
    color: COLORS.text,
  },
  onTableRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: webSc(SPACING.sm),
    paddingVertical: webSc(SPACING.sm),
    borderTopWidth: 1,
    borderTopColor: COLORS.border + "60",
  },
  onTableInfo: { flex: 1 },
  onTableActions: { flexDirection: "row", alignItems: "center", gap: webSc(SPACING.xs) },
  onTableText: { fontSize: webMs(FONT_SIZES.sm), color: COLORS.text, fontWeight: "600" },
  playingTag: { fontSize: webMs(FONT_SIZES.xs), color: COLORS.success, fontWeight: "700" },
  startBtn: {
    paddingVertical: webSc(SPACING.xs),
    paddingHorizontal: webSc(SPACING.sm),
    borderRadius: webSc(RADIUS.sm),
    backgroundColor: COLORS.success,
  },
  startBtnText: { fontSize: webMs(FONT_SIZES.xs), color: COLORS.white, fontWeight: "800" },
  liveBadgeText: {
    fontSize: webMs(FONT_SIZES.xs),
    color: COLORS.error,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  onTableTable: {
    fontSize: webMs(FONT_SIZES.xs),
    color: COLORS.primary,
    fontWeight: "700",
    marginTop: webSc(2),
  },
  upNextLabel: {
    fontSize: webMs(FONT_SIZES.md),
    fontWeight: "700",
    color: COLORS.text,
    marginBottom: webSc(SPACING.sm),
  },
  empty: {
    backgroundColor: COLORS.surface,
    borderRadius: webSc(RADIUS.md),
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: webSc(SPACING.lg),
  },
  emptyText: {
    fontSize: webMs(FONT_SIZES.sm),
    color: COLORS.textSecondary,
    textAlign: "center",
  },
  // Queue card
  queueCard: {
    backgroundColor: COLORS.surface,
    borderRadius: webSc(RADIUS.md),
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: webSc(SPACING.sm),
    marginBottom: webSc(SPACING.sm),
  },
  queueTop: { flexDirection: "row", alignItems: "center" },
  rankCol: { alignItems: "center", width: webSc(34), marginRight: webSc(SPACING.xs) },
  rankNum: {
    fontSize: webMs(FONT_SIZES.sm),
    fontWeight: "700",
    color: COLORS.primary,
    marginBottom: webSc(2),
  },
  arrows: { gap: webSc(2) },
  arrowBtn: {
    width: webSc(28),
    height: webSc(22),
    borderRadius: webSc(RADIUS.sm),
    backgroundColor: COLORS.primary + "15",
    alignItems: "center",
    justifyContent: "center",
  },
  arrowOff: { opacity: 0.3 },
  arrowText: { fontSize: webMs(FONT_SIZES.xs), color: COLORS.primary, fontWeight: "700" },
  matchCol: { flex: 1, marginRight: webSc(SPACING.sm) },
  matchPlayers: {
    fontSize: webMs(FONT_SIZES.sm),
    fontWeight: "700",
    color: COLORS.text,
    marginBottom: webSc(4),
  },
  metaRow: { flexDirection: "row", alignItems: "center", gap: webSc(SPACING.sm) },
  locChip: {
    backgroundColor: COLORS.background,
    borderRadius: webSc(RADIUS.sm),
    paddingHorizontal: webSc(SPACING.sm),
    paddingVertical: webSc(2),
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  locText: {
    fontSize: webMs(FONT_SIZES.xs),
    color: COLORS.textSecondary,
    fontWeight: "600",
  },
  wait: { fontSize: webMs(FONT_SIZES.xs), fontWeight: "600" },
  assignRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: webSc(SPACING.sm),
    marginTop: webSc(SPACING.sm),
    paddingTop: webSc(SPACING.sm),
    borderTopWidth: 1,
    borderTopColor: COLORS.border + "60",
  },
  noTable: {
    fontSize: webMs(FONT_SIZES.xs),
    color: COLORS.textMuted,
    fontStyle: "italic",
  },
  // Preview modal
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    padding: webSc(SPACING.lg),
  },
  previewCard: {
    backgroundColor: COLORS.surface,
    borderRadius: webSc(RADIUS.md),
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: webSc(SPACING.md),
    ...Platform.select({
      web: { maxWidth: 420, width: "100%" as any, alignSelf: "center" as any },
    }),
  },
  previewTitle: {
    fontSize: webMs(FONT_SIZES.md),
    fontWeight: "700",
    color: COLORS.text,
    marginBottom: webSc(SPACING.sm),
  },
  previewList: { maxHeight: webSc(280) },
  previewRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: webSc(SPACING.xs),
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border + "60",
  },
  previewMatch: { flex: 1, fontSize: webMs(FONT_SIZES.sm), color: COLORS.text },
  previewArrow: {
    fontSize: webMs(FONT_SIZES.sm),
    color: COLORS.textMuted,
    marginHorizontal: webSc(SPACING.sm),
  },
  previewTable: {
    fontSize: webMs(FONT_SIZES.sm),
    color: COLORS.primary,
    fontWeight: "700",
  },
  sectionLabel: {
    fontSize: webMs(FONT_SIZES.xs),
    color: COLORS.textMuted,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: webSc(SPACING.xs),
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: webSc(SPACING.md),
  },
  appliedHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  undoLink: {
    fontSize: webMs(FONT_SIZES.xs),
    color: COLORS.warning,
    fontWeight: "700",
  },
  appliedList: { maxHeight: webSc(200) },
  previewCancel: {
    paddingVertical: webSc(SPACING.sm),
    borderRadius: webSc(RADIUS.sm),
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
    marginTop: webSc(SPACING.md),
  },
  previewCancelText: { fontSize: webMs(FONT_SIZES.sm), color: COLORS.text, fontWeight: "600" },
  previewApply: {
    paddingVertical: webSc(SPACING.sm),
    borderRadius: webSc(RADIUS.sm),
    backgroundColor: COLORS.primary,
    alignItems: "center",
    marginTop: webSc(SPACING.sm),
  },
  previewApplyText: { fontSize: webMs(FONT_SIZES.sm), color: COLORS.white, fontWeight: "700" },
  previewApplyStart: {
    paddingVertical: webSc(SPACING.sm),
    borderRadius: webSc(RADIUS.sm),
    backgroundColor: COLORS.success,
    alignItems: "center",
    marginTop: webSc(SPACING.xs),
  },
  previewApplyStartText: { fontSize: webMs(FONT_SIZES.sm), color: COLORS.white, fontWeight: "800" },
  // Recently applied
  appliedEmpty: {
    fontSize: webMs(FONT_SIZES.sm),
    color: COLORS.textSecondary,
    textAlign: "center",
    paddingVertical: webSc(SPACING.md),
  },
  appliedRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: webSc(SPACING.sm),
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border + "60",
  },
  appliedInfo: { flex: 1, marginRight: webSc(SPACING.sm) },
  appliedTable: {
    fontSize: webMs(FONT_SIZES.xs),
    color: COLORS.primary,
    fontWeight: "700",
    marginTop: webSc(2),
  },
  appliedActions: { flexDirection: "row", alignItems: "center", gap: webSc(SPACING.xs) },
  backBtn: {
    paddingVertical: webSc(SPACING.xs),
    paddingHorizontal: webSc(SPACING.sm),
    borderRadius: webSc(RADIUS.sm),
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  backBtnText: { fontSize: webMs(FONT_SIZES.xs), color: COLORS.text, fontWeight: "600" },
});
