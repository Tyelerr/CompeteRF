// src/views/components/tournament/live/QueueView.tsx
// Queue Manager — the TD's live operations screen. Shows ready-to-play matches
// with wait time + bracket location, lets the TD reorder the queue and assign a
// match to a specific table, and runs Auto Assign (preview → apply) to fill free
// tables using the selected mode. Assigning a table starts the match.

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
  onAssign: (matchId: string, tableId: number) => void;
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
  const [preview, setPreview] = useState<AssignmentPlan[] | null>(null);

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
  const onTables = useMemo(
    () =>
      matches.filter((m) => m.status === "in_progress" && m.tableId != null),
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

  const runAutoAssign = () => {
    const plan = planAutoAssign(ordered, available);
    if (plan.length === 0) return;
    setPreview(plan);
  };
  const applyPlan = () => {
    if (preview) for (const p of preview) onAssign(p.matchId, p.tableId);
    setPreview(null);
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
                {showOnTables ? "▾" : "▸"} On Tables Now ({onTables.length})
              </Text>
            </TouchableOpacity>
            {showOnTables &&
              onTables.map((m) => (
                <View key={m.id} style={styles.onTableRow}>
                  <Text
                    allowFontScaling={false}
                    style={styles.onTableText}
                    numberOfLines={1}
                  >
                    {players(m)}
                  </Text>
                  <Text allowFontScaling={false} style={styles.onTableTable}>
                    {m.tableLabel ?? "Table"}
                  </Text>
                </View>
              ))}
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

              <View style={styles.assignCol}>
                {available.length > 0 ? (
                  <ActionMenu
                    label="Assign"
                    items={available.map<ActionMenuItem>((t) => ({
                      label: tableLabelOf(t),
                      onPress: () => onAssign(e.match.id, t.id),
                    }))}
                  />
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

      {/* Auto Assign preview */}
      <Modal
        visible={preview !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setPreview(null)}
      >
        <View style={styles.overlay}>
          <View style={styles.previewCard}>
            <Text allowFontScaling={false} style={styles.previewTitle}>
              Auto Assign will place:
            </Text>
            <ScrollView style={styles.previewList} bounces={false}>
              {(preview ?? []).map((p) => (
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
            <View style={styles.previewBtns}>
              <TouchableOpacity
                style={styles.previewCancel}
                onPress={() => setPreview(null)}
              >
                <Text allowFontScaling={false} style={styles.previewCancelText}>
                  Cancel
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.previewAdjust}
                onPress={() => setPreview(null)}
              >
                <Text allowFontScaling={false} style={styles.previewAdjustText}>
                  Adjust
                </Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.previewApply} onPress={applyPlan}>
                <Text allowFontScaling={false} style={styles.previewApplyText}>
                  Apply
                </Text>
              </TouchableOpacity>
            </View>
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
    paddingVertical: webSc(SPACING.xs),
    borderTopWidth: 1,
    borderTopColor: COLORS.border + "60",
  },
  onTableText: { flex: 1, fontSize: webMs(FONT_SIZES.sm), color: COLORS.text },
  onTableTable: {
    fontSize: webMs(FONT_SIZES.xs),
    color: COLORS.primary,
    fontWeight: "700",
    marginLeft: webSc(SPACING.sm),
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
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.surface,
    borderRadius: webSc(RADIUS.md),
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: webSc(SPACING.sm),
    marginBottom: webSc(SPACING.sm),
  },
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
  assignCol: { minWidth: webSc(96), alignItems: "flex-end" },
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
  previewBtns: {
    flexDirection: "row",
    gap: webSc(SPACING.sm),
    marginTop: webSc(SPACING.md),
  },
  previewCancel: {
    flex: 1,
    paddingVertical: webSc(SPACING.sm),
    borderRadius: webSc(RADIUS.sm),
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
  },
  previewCancelText: { fontSize: webMs(FONT_SIZES.sm), color: COLORS.text, fontWeight: "600" },
  previewAdjust: {
    flex: 1,
    paddingVertical: webSc(SPACING.sm),
    borderRadius: webSc(RADIUS.sm),
    borderWidth: 1,
    borderColor: COLORS.primary,
    alignItems: "center",
  },
  previewAdjustText: {
    fontSize: webMs(FONT_SIZES.sm),
    color: COLORS.primary,
    fontWeight: "700",
  },
  previewApply: {
    flex: 1,
    paddingVertical: webSc(SPACING.sm),
    borderRadius: webSc(RADIUS.sm),
    backgroundColor: COLORS.primary,
    alignItems: "center",
  },
  previewApplyText: { fontSize: webMs(FONT_SIZES.sm), color: COLORS.white, fontWeight: "700" },
});
