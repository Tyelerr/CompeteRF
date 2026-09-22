// src/views/components/tournament/live/QueueView.tsx
// Queue Manager — the TD's live operations screen, built on the shared projected
// schedule (utils/schedule.projection via useProjectedSchedule):
//   • On Tables        = schedule.active (parked or in progress)
//   • Scheduled Matches = schedule.scheduled — every remaining match, Ready first,
//     then Waiting/future matches with feeder placeholders. Next ~10 inline, the
//     rest in View Full Schedule.
// Reordering (Up/Down/Top/Bottom) changes PRIORITY only and persists through the
// existing queueOrder path; Auto Assign still plans from schedule.readyQueue (the
// unchanged orderQueue result). Assigning a table PARKS the match on it; the TD
// then starts it from On Tables (or uses Assign & Start to do both).

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { COLORS } from "../../../../theme/colors";
import { RADIUS, SPACING, WEB_MAXW } from "../../../../theme/spacing";
import { FONT_SIZES } from "../../../../theme/typography";
import { webMs, webSc } from "../../../../utils/scaling";
import { AutoAssignMode, QueuePin } from "../../../../models/types/tournament-settings.types";
import { TournamentTable } from "../../../../models/types/tournament-table.types";
import { formatClock, LiveMatch, MatchActionStep } from "../../../../utils/match.utils";
import {
  AUTO_ASSIGN_MODES,
  AssignmentPlan,
  formatWait,
  freeTables,
  planAutoAssign,
} from "../../../../utils/queue.utils";
import { ProjectedMatch, ProjectedSchedule, projectedSlotText } from "../../../../utils/schedule.projection";
import {
  classifyTables,
  liveOpErrorText,
  planDisplacements,
  TableState,
} from "../../../../utils/elim-live-ops";
import { pinsWithMove, pinsWithout, sanitizePins } from "../../../../utils/queue-pins";
import {
  pinForMove,
  reorderScheduled,
  MOVE_BLOCKED_TEXT,
  scheduleMoveState,
  ScheduleMove,
} from "../../../../utils/schedule.reorder";
import { Dropdown } from "../../common/dropdown";
import { ActionMenu, ActionMenuItem } from "../../admin/ActionMenu";
import { AutoAssignToggle } from "./AutoAssignToggle";
import { ScheduledMatchRow } from "./ScheduledMatchRow";

const projectedPlayers = (pm: ProjectedMatch): string =>
  `${projectedSlotText(pm.slot1)} vs ${projectedSlotText(pm.slot2)}`;

// Scheduled rows shown inline before "View Full Schedule".
const SCHEDULE_PREVIEW = 10;

interface QueueViewProps {
  matches: LiveMatch[];
  tables: TournamentTable[];
  schedule: ProjectedSchedule; // shared projection (useProjectedSchedule)
  occupancy: Record<number, string>; // tableId -> occupying match label
  mode: AutoAssignMode;
  queueOrder: string[];
  onAssign: (matchId: string, tableId: number) => void; // park on a table (not started)
  onAssignStart: (matchId: string, tableId: number) => void; // park + start
  onStart: (matchId: string) => void; // start a match already parked on a table
  onUnassign: (matchId: string) => void;
  // Assign Ready Matches "Assign All" / "Assign & Start All" — ONE server batch; resolves with
  // per-match results (the server may skip some, e.g. a table that just became occupied).
  // displacedIds: parked (NOT started) matches to unassign first — same atomic server call.
  onAssignMany: (
    plan: AssignmentPlan[],
    start: boolean,
    displacedIds?: string[],
  ) => Promise<{ matchId: string; ok: boolean; error?: string }[]>;
  onUnassignMany: (matchIds: string[]) => Promise<void>; // Recently Applied "Undo All"
  // Play Next: soft preference for a (busy) table; null clears it. Persisted server-side.
  onSetPreferredTable: (matchId: string, tableId: number | null) => void;
  // TD relative overrides kept alongside an automatic mode ("Move & Keep {mode}").
  queuePins: QueuePin[];
  onSetQueuePins: (pins: QueuePin[]) => void;
  // Persistent Auto Assign On/Off (live_settings.autoAssignEnabled) — independent of the Queue
  // Order mode; only the TD turning it Off disables it.
  autoAssignEnabled: boolean;
  onSetAutoAssignEnabled: (on: boolean) => void;
  onSetMode: (mode: AutoAssignMode) => void;
  onSetQueueOrder: (ids: string[]) => void;
  // Opens the shared match-actions modal (score/end/reopen/etc.) for an on-table
  // match — reuses the hub's existing MatchActionsModal, no second flow.
  onManageMatch?: (m: LiveMatch, step: MatchActionStep) => void;
  // Players still in / total field, for the right summary card (the hub already
  // derives these — QueueView can't from matches alone). "—" when not provided.
  playersRemaining?: number;
  playersTotal?: number;
}

const isWeb = Platform.OS === "web";

const tableLabelOf = (t: TournamentTable): string =>
  t.label ? `${t.label} ${t.table_number}` : `Table ${t.table_number}`;

// ▲/▼ priority control. When disabled it explains why: a native browser tooltip on
// web (title set on a plain wrapper View — a disabled RN-web touchable is
// pointerEvents box-none, so it wouldn't receive the hover itself) plus an
// accessibility hint everywhere. Presentational only; legality is passed in.
const ReorderArrow = ({
  dir,
  enabled,
  blockedReason,
  onPress,
}: {
  dir: "up" | "down";
  enabled: boolean;
  blockedReason?: string;
  onPress: () => void;
}) => {
  const wrapRef = useRef<View>(null);
  const label = dir === "up" ? "Move Up" : "Move Down";
  const tip = !enabled && blockedReason ? blockedReason : label;
  useEffect(() => {
    if (!isWeb) return;
    const node = wrapRef.current as unknown as { setAttribute?: (k: string, v: string) => void } | null;
    node?.setAttribute?.("title", tip);
  }, [tip]);
  return (
    <View ref={wrapRef}>
      <TouchableOpacity
        onPress={onPress}
        disabled={!enabled}
        style={[styles.reorderBtn, !enabled && styles.reorderOff]}
        hitSlop={6}
        accessibilityLabel={label}
        accessibilityHint={!enabled ? blockedReason : undefined}
        accessibilityState={{ disabled: !enabled }}
      >
        <Text allowFontScaling={false} style={styles.reorderText}>
          {dir === "up" ? "▲" : "▼"}
        </Text>
      </TouchableOpacity>
    </View>
  );
};

const SummaryRow = ({ label, value }: { label: string; value: string }) => (
  <View style={styles.summaryRow}>
    <Text allowFontScaling={false} style={styles.summaryLabel}>{label}</Text>
    <Text allowFontScaling={false} style={styles.summaryValue}>{value}</Text>
  </View>
);

export const QueueView = ({
  matches,
  tables,
  schedule,
  occupancy,
  mode,
  queueOrder,
  onAssign,
  onAssignStart,
  onStart,
  onUnassign,
  onAssignMany,
  onUnassignMany,
  onSetPreferredTable,
  queuePins,
  onSetQueuePins,
  autoAssignEnabled,
  onSetAutoAssignEnabled,
  onSetMode,
  onSetQueueOrder,
  onManageMatch,
  playersRemaining,
  playersTotal,
}: QueueViewProps) => {
  const { width: winW, height: winH } = useWindowDimensions();
  const wide = isWeb && winW >= 980;
  // Display-only tick so wait times update live. Order never depends on it — the
  // schedule is memoized upstream on real state changes.
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  const [showOnTables, setShowOnTables] = useState(true);
  const [autoOpen, setAutoOpen] = useState(false);
  const [fullOpen, setFullOpen] = useState(false);
  // Match ids assigned during this Assign Ready Matches session — listed under the
  // preview as "Recently Applied" so the TD can move them or send them back.
  const [appliedIds, setAppliedIds] = useState<string[]>([]);

  // The ready queue is the existing orderQueue() result (exposed by the projection);
  // it is the ONLY list Auto Assign plans from.
  const ordered = schedule.readyQueue;
  const scheduled = schedule.scheduled;
  const waitingCount = scheduled.length - ordered.length;
  const available = useMemo(
    () => freeTables(tables, occupancy),
    [tables, occupancy],
  );
  // Every match sitting on a table — parked (assigned, not started) or in progress.
  // Parked matches get a Start button; in-progress ones show their live status.
  const onTables = schedule.active;
  // Longest current wait among ready matches — surfaced in the top summary so the
  // TD can spot anyone sitting too long at a glance.
  const longestWaitMs = useMemo(
    () => ordered.reduce((a, e) => Math.max(a, e.readyAt != null ? now - e.readyAt : 0), 0),
    [ordered, now],
  );
  const summaryText =
    `${ordered.length} Ready  ·  ${waitingCount} Waiting  ·  ${available.length} Table${available.length === 1 ? "" : "s"} Free` +
    (ordered.length > 0 ? `  ·  Longest Wait ${formatWait(longestWaitMs)}` : "");

  // Right-summary values — derived from the same authoritative match list (no new
  // business logic). Players Remaining comes from the hub (can't derive from matches).
  const activeMatchesCount = useMemo(
    () => matches.filter((m) => m.status === "in_progress" && !m.bye && !m.empty).length,
    [matches],
  );
  const completedCount = useMemo(
    () => matches.filter((m) => m.status === "completed" && !m.bye && !m.empty).length,
    [matches],
  );
  const avgMatchText = useMemo(() => {
    const durs = matches
      .filter((m) => m.status === "completed" && m.startedAt && m.completedAt)
      .map((m) => (Date.parse(m.completedAt as string) - Date.parse(m.startedAt as string)) / 1000)
      .filter((s) => s > 0);
    return durs.length ? formatClock(durs.reduce((a, b) => a + b, 0) / durs.length) : "—";
  }, [matches]);
  const modeLabel = AUTO_ASSIGN_MODES.find((o) => o.value === mode)?.label ?? "Balanced";
  const playersText =
    playersRemaining != null && playersTotal != null
      ? `${playersRemaining} / ${playersTotal}`
      : "—";

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

  // Reordering takes the TD into Manual mode with the displayed order + the move
  // applied (same queueOrder path as before). Priority only: reorderScheduled refuses
  // moves across the Ready/Waiting boundary or past a feeder, and the projection
  // re-derives eligibility independently.
  const reorderRef = useRef(onSetQueueOrder);
  reorderRef.current = onSetQueueOrder;
  // The specific requested move, in words: "Move "A vs B" above "C vs D"?" / "…to the top of
  // the Ready queue?" — derived from the displayed list (the same one the move is computed on).
  const describeMove = (matchId: string, dir: ScheduleMove): string => {
    const i = scheduled.findIndex((pm) => pm.matchId === matchId);
    const cur = scheduled[i];
    const nameOf = (pm: ProjectedMatch | undefined) =>
      pm ? `"${pm.numberLabel || pm.matchId} — ${projectedPlayers(pm)}"` : "";
    const tier = cur?.eligibility.ready ? "Ready" : "waiting";
    if (dir === "up") return `Move:\n${nameOf(cur)}\n\nabove:\n${nameOf(scheduled[i - 1])}?`;
    if (dir === "down") return `Move:\n${nameOf(cur)}\n\nbelow:\n${nameOf(scheduled[i + 1])}?`;
    if (dir === "top") return `Move:\n${nameOf(cur)}\n\nto the top of the ${tier} queue?`;
    return `Move:\n${nameOf(cur)}\n\nto the bottom of the ${tier} queue?`;
  };
  const move = (matchId: string, dir: ScheduleMove) => {
    const ids = reorderScheduled(scheduled, matchId, dir);
    if (!ids) return;
    if (mode === "manual") {
      reorderRef.current(ids);
      return;
    }
    // An automatic mode is active: the TD chooses. "Keep" stores ONE relative pin (the mode keeps
    // ordering everything else around it); "Switch to Manual" writes Manual + the displayed order
    // with exactly this move (and clears pins) in one set_queue write. Cancel changes nothing.
    const pin = pinForMove(scheduled, matchId, dir);
    Alert.alert(
      "Change Match Order?",
      `You're currently using ${modeLabel}.\n\n${describeMove(matchId, dir)}`,
      [
        { text: "Cancel", style: "cancel" },
        ...(pin
          ? [{
              text: `Move & Keep ${modeLabel}`,
              onPress: () => onSetQueuePins(pinsWithMove(queuePins, scheduled.map((pm) => pm.matchId), pin)),
            }]
          : []),
        { text: "Move & Switch to Manual", onPress: () => reorderRef.current(ids) },
      ],
    );
  };

  // Every table's state from the SAME data the page renders (free / parked / playing).
  const tableState = useMemo<Record<number, TableState>>(
    () => classifyTables(tables, onTables.map((pm) => pm.match)),
    [tables, onTables],
  );
  const pickableTables = useMemo(
    () => tables.filter((t) => t.status !== "unavailable").sort((a, b) => a.table_number - b.table_number),
    [tables],
  );
  const confirmDisplace = (tableName: string, occupant: string, onYes: () => void) =>
    Alert.alert(
      "Replace table assignment?",
      `${tableName} is currently assigned to:\n${occupant}.\n\nAssigning this table to the new match will remove the existing assignment.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Continue", style: "destructive", onPress: onYes },
      ],
    );

  // The pending plan, recomputed live from the current queue + free tables.
  const autoPlan = useMemo(
    () => planAutoAssign(ordered, available),
    [ordered, available],
  );

  // The TD reviews (and may edit) a SNAPSHOT of the plan; the live plan is only the default.
  const [draft, setDraft] = useState<AssignmentPlan[] | null>(null);
  const shownPlan = draft ?? autoPlan;
  const setDraftTable = (matchId: string, tableId: number) =>
    setDraft((cur) => (cur ?? autoPlan).map((p) => (p.matchId === matchId ? { ...p, tableId } : p)));
  const runAutoAssign = () => {
    setAppliedIds([]);
    setApplyNote(null);
    setDraft(autoPlan.map((p) => ({ ...p })));
    setAutoOpen(true);
  };
  // Table choices for one preview row: free → pick; parked (not started) → warn, then pick
  // (displaces it); in progress → never offered (disabled); chosen by another row → disabled.
  const tableChoices = (p: AssignmentPlan): ActionMenuItem[] =>
    pickableTables.map((t) => {
      const name = tableLabelOf(t);
      const st = tableState[t.id] ?? { kind: "free" };
      const takenInPlan = shownPlan.some((q) => q.matchId !== p.matchId && q.tableId === t.id);
      if (st.kind === "playing")
        return {
          label: `${name} — in progress · Play Next here`,
          onPress: () => {
            onSetPreferredTable(p.matchId, t.id);
            setDraft((cur) => (cur ?? autoPlan).filter((q) => q.matchId !== p.matchId));
          },
        };
      if (takenInPlan)
        return { label: `${name} — used in this plan`, disabled: true, onPress: () => {} };
      if (st.kind === "assigned")
        return {
          label: `${name} — replace ${st.label}`,
          tone: "danger",
          onPress: () => confirmDisplace(name, st.label, () => setDraftTable(p.matchId, t.id)),
        };
      return { label: `${name}${t.id === p.tableId ? "  ✓" : ""}`, onPress: () => setDraftTable(p.matchId, t.id) };
    });
  // Assign ALL planned matches at once; they drop into Recently Applied below.
  // start = also begin the matches (Assign & Start), otherwise just park them.
  // ONE awaited batch (the server applies every op under one lock). Only matches the server
  // accepted go into Recently Applied; skipped ones are summarized for the TD.
  const [applyBusy, setApplyBusy] = useState(false);
  const [applyNote, setApplyNote] = useState<string | null>(null);
  const applyAll = async (plan: AssignmentPlan[], start: boolean) => {
    if (applyBusy || plan.length === 0) return;
    const displaced = planDisplacements(plan, tableState);
    if (displaced.length > 0) {
      const n = plan.length;
      const d = displaced.length;
      Alert.alert(
        start ? "Assign & Start All?" : "Assign All?",
        `${n} match${n === 1 ? "" : "es"} will be assigned.\n${d} existing match${d === 1 ? "" : "es"} will become unassigned and need a table:\n` +
          displaced.map((x) => `• ${x.label}`).join("\n"),
        [
          { text: "Cancel", style: "cancel" },
          { text: start ? "Assign & Start All" : "Assign All", onPress: () => runApply(plan, start, displaced.map((x) => x.matchId)) },
        ],
      );
      return;
    }
    await runApply(plan, start, []);
  };
  const runApply = async (plan: AssignmentPlan[], start: boolean, displacedIds: string[]) => {
    setApplyBusy(true);
    try {
      const results = await onAssignMany(plan, start, displacedIds);
      const okIds = results.filter((r) => r.ok).map((r) => r.matchId);
      setAppliedIds((prev) => [...prev, ...okIds]);
      const skipped = results.filter((r) => !r.ok);
      setDraft(null); // back to the live plan for whatever is still Ready
      setApplyNote(
        skipped.length
          ? `${okIds.length} ${start ? "started" : "assigned"} · ${skipped.length} skipped — ${[
              ...new Set(skipped.map((r) => liveOpErrorText(r.error))),
            ].join(", ")}`
          : null,
      );
    } finally {
      setApplyBusy(false);
    }
  };
  const sendBackToQueue = (matchId: string) => {
    onUnassign(matchId);
    setAppliedIds((ids) => ids.filter((id) => id !== matchId));
  };
  const undoAll = async () => {
    const ids = appliedIds;
    setAppliedIds([]);
    setApplyNote(null);
    await onUnassignMany(ids);
  };

  const players = (m: LiveMatch | undefined): string =>
    m ? `${m.p1Name ?? "TBD"} vs ${m.p2Name ?? "TBD"}` : "—";

  // One Scheduled row (inline list + Full Schedule modal share it). Ready rows keep
  // the existing Assign / Assign & Start menu; every row gets priority controls.
  // Matches carrying a TD override that is in effect (automatic modes only; expired pins —
  // match/anchor no longer scheduled — are not shown).
  const pinnedIds = useMemo(() => {
    if (mode === "manual") return new Set<string>();
    const live = new Set(scheduled.map((pm) => pm.matchId));
    return new Set(
      sanitizePins(queuePins)
        .filter((p) => live.has(p.matchId) && (!p.anchorId || live.has(p.anchorId)))
        .map((p) => p.matchId),
    );
  }, [mode, queuePins, scheduled]);
  const renderScheduledRow = (pm: ProjectedMatch, i: number) => {
    // Legality + the reason a move is unavailable both come from the reorder helper.
    const { can, reason } = scheduleMoveState(scheduled, i);
    const why = (mv: ScheduleMove): string | undefined => {
      const r = reason[mv];
      return r ? MOVE_BLOCKED_TEXT[r] : undefined;
    };
    const assignItems: ActionMenuItem[] = !pm.eligibility.ready
      ? []
      : [
          ...available.map<ActionMenuItem>((t) => ({
            label: `Assign — ${tableLabelOf(t)}`,
            onPress: () => onAssign(pm.matchId, t.id),
          })),
          ...available.map<ActionMenuItem>((t) => ({
            label: `Assign & Start — ${tableLabelOf(t)}`,
            onPress: () => onAssignStart(pm.matchId, t.id),
          })),
          // Tables parked with a not-started match can be taken over after a warning; the
          // bumped match returns to Ready (atomic unassign + assign). Playing tables never.
          ...pickableTables.flatMap<ActionMenuItem>((t) => {
            const st = tableState[t.id];
            if (st?.kind !== "assigned") return [];
            const name = tableLabelOf(t);
            return [
              {
                label: `Assign — ${name} (replace ${st.label})`,
                tone: "danger",
                onPress: () =>
                  confirmDisplace(name, st.label, () =>
                    onAssignMany([{ matchId: pm.matchId, tableId: t.id }], false, [st.matchId]),
                  ),
              },
            ];
          }),
          // Play Next on a table that is IN PROGRESS: nothing is assigned now; the match gets
          // that table first when it frees up (soft — the table is never held idle).
          ...pickableTables.flatMap<ActionMenuItem>((t) =>
            tableState[t.id]?.kind === "playing"
              ? [{ label: `Play next on ${tableLabelOf(t)}`, tone: "primary", onPress: () => onSetPreferredTable(pm.matchId, t.id) }]
              : [],
          ),
          ...(pm.match.preferredTableId != null
            ? [{ label: "Clear Play Next", onPress: () => onSetPreferredTable(pm.matchId, null) } as ActionMenuItem]
            : []),
        ];
    const assign =
      pm.eligibility.ready &&
      (assignItems.length > 0 ? (
        <ActionMenu
          label="Assign Table"
          triggerStyle={styles.rowBtn}
          triggerTextStyle={styles.rowBtnText}
          items={assignItems}
        />
      ) : (
        <Text allowFontScaling={false} style={styles.noTable}>
          No table free
        </Text>
      ));
    const arrow = (dir: "up" | "down", enabled: boolean) => (
      <ReorderArrow
        dir={dir}
        enabled={enabled}
        blockedReason={why(dir)}
        onPress={() => move(pm.matchId, dir)}
      />
    );
    const actions = (
      <>
        {assign || null}
        {arrow("up", can.up)}
        {arrow("down", can.down)}
        {/* Always openable so a fully-pinned row (e.g. the conditional reset) can
            still explain itself — each disabled item shows its reason (works on native). */}
        <ActionMenu
          compact
          items={[
            { label: "Move to Top", tone: "primary", disabled: !can.top, hint: why("top"), onPress: () => move(pm.matchId, "top") },
            { label: "Move Up", tone: "primary", disabled: !can.up, hint: why("up"), onPress: () => move(pm.matchId, "up") },
            { label: "Move Down", tone: "danger", disabled: !can.down, hint: why("down"), onPress: () => move(pm.matchId, "down") },
            { label: "Move to Bottom", tone: "danger", disabled: !can.bottom, hint: why("bottom"), onPress: () => move(pm.matchId, "bottom") },
            ...(pinnedIds.has(pm.matchId)
              ? [{ label: "Clear override", onPress: () => onSetQueuePins(pinsWithout(queuePins, pm.matchId)) } as ActionMenuItem]
              : []),
          ]}
        />
      </>
    );
    return (
      <ScheduledMatchRow
        key={pm.matchId}
        pm={pm}
        position={i + 1}
        now={now}
        actions={actions}
        stackActions={!wide}
        note={
          [
            pinnedIds.has(pm.matchId) ? "Override" : null,
            pm.match.preferredTableId != null
              ? `Next on ${tableById[pm.match.preferredTableId] ? tableLabelOf(tableById[pm.match.preferredTableId]) : "table"}`
              : null,
          ]
            .filter(Boolean)
            .join("  ·  ") || null
        }
      />
    );
  };

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
       <View style={wide ? styles.twoColRow : undefined}>
        <View style={wide ? styles.leftCol : undefined}>
        {/* Quick status summary */}
        <Text allowFontScaling={false} style={styles.summary} numberOfLines={1} adjustsFontSizeToFit>
          {summaryText}
        </Text>
        {/* Controls: the persistent Auto Assign On/Off (same value as the Dashboard), the
            independent Match Order mode, and — only while Auto Assign is Off — the one-time
            "Assign Ready Matches" batch (opens the editable preview). */}
        <View style={styles.controls}>
          <AutoAssignToggle enabled={autoAssignEnabled} onChange={onSetAutoAssignEnabled} />
          <View style={styles.orderGroup}>
            <Text allowFontScaling={false} style={styles.controlLabel}>
              Match Order
            </Text>
            <View style={styles.modeWrap}>
              <Dropdown
                hideCheck
                options={AUTO_ASSIGN_MODES}
                value={mode}
                onSelect={(v) => onSetMode(v as AutoAssignMode)}
                placeholder="Match Order"
              />
            </View>
          </View>
          {!autoAssignEnabled && (
            <TouchableOpacity
              style={[styles.autoBtn, (available.length === 0 || ordered.length === 0) && styles.btnDisabled]}
              onPress={runAutoAssign}
              disabled={available.length === 0 || ordered.length === 0}
              activeOpacity={0.85}
            >
              <Text allowFontScaling={false} style={styles.autoBtnText}>
                Assign Ready Matches
              </Text>
            </TouchableOpacity>
          )}
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
              onTables.map(({ match: m, numberLabel, location }) => {
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
                      <Text allowFontScaling={false} style={styles.onTableTable} numberOfLines={1}>
                        {m.tableLabel ?? "Table"}
                        {"  ·  "}
                        <Text style={playing ? styles.onTableLive : styles.onTableParked}>
                          {playing ? "In progress" : "Not started"}
                        </Text>
                        <Text style={styles.onTableMeta}>
                          {`  ·  ${numberLabel || m.id}  ·  ${location}`}
                        </Text>
                      </Text>
                    </View>
                    <View style={styles.onTableActions}>
                      {playing && m.isStream && (
                        <Text allowFontScaling={false} style={styles.liveBadgeText}>
                          {"● LIVE"}
                        </Text>
                      )}
                      {playing ? (
                        onManageMatch && (
                          <TouchableOpacity
                            style={styles.manageBtn}
                            onPress={() => onManageMatch(m, "menu")}
                          >
                            <Text allowFontScaling={false} style={styles.manageBtnText}>
                              Manage
                            </Text>
                          </TouchableOpacity>
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
                      {/* Labeled Actions menu — sized to match Start/Manage exactly. */}
                      <ActionMenu
                        label="Actions"
                        triggerStyle={styles.qActionTrigger}
                        triggerTextStyle={styles.qActionTriggerText}
                        items={[
                          ...(onManageMatch
                            ? [
                                {
                                  label: playing ? "Edit score" : "Manage match",
                                  onPress: () =>
                                    onManageMatch(m, playing ? "score" : "menu"),
                                } as ActionMenuItem,
                              ]
                            : []),
                          {
                            label: "Send back to queue",
                            destructive: true,
                            onPress: () => onUnassign(m.id),
                          } as ActionMenuItem,
                        ]}
                      />
                    </View>
                  </View>
                );
              })}
          </View>
        )}

        {/* Scheduled Matches — the shared projected schedule: Ready first, then
            Waiting/future matches. Next ~10 inline; the rest in View Full Schedule. */}
        <View style={styles.section}>
          <View style={styles.schedHead}>
            <Text allowFontScaling={false} style={styles.sectionTitle}>
              Scheduled Matches ({scheduled.length})
            </Text>
            <Text allowFontScaling={false} style={styles.schedCounts}>
              {`${ordered.length} ready · ${waitingCount} waiting`}
            </Text>
          </View>
          {scheduled.length === 0 ? (
            <Text allowFontScaling={false} style={styles.emptyText}>
              No matches left to schedule.
            </Text>
          ) : (
            scheduled.slice(0, SCHEDULE_PREVIEW).map(renderScheduledRow)
          )}
          {scheduled.length > SCHEDULE_PREVIEW && (
            <TouchableOpacity
              style={styles.viewAllBtn}
              onPress={() => setFullOpen(true)}
              activeOpacity={0.8}
            >
              <Text allowFontScaling={false} style={styles.viewAllBtnText}>
                View Full Schedule ({scheduled.length})
              </Text>
            </TouchableOpacity>
          )}
        </View>
        </View>

        {/* RIGHT — sticky Queue Summary (wide web); stacks below on mobile. */}
        <View style={wide ? styles.rightColWrap : styles.summaryStack}>
          <View style={styles.summaryCard}>
            <Text allowFontScaling={false} style={styles.summaryTitle}>Queue Summary</Text>
            <SummaryRow label="Players Remaining" value={playersText} />
            <SummaryRow label="Active Matches" value={String(activeMatchesCount)} />
            <SummaryRow label="Ready / Waiting" value={`${ordered.length} / ${waitingCount}`} />
            <SummaryRow label="Tables Available" value={String(available.length)} />
            <SummaryRow label="Avg Match" value={avgMatchText} />
            <SummaryRow label="Completed Matches" value={String(completedCount)} />
            <View style={styles.summaryDivider} />
            <SummaryRow label="Match Order" value={modeLabel} />
            <SummaryRow label="Auto Assign" value={autoAssignEnabled ? "On" : "Off"} />
          </View>
        </View>
       </View>
      </ScrollView>

      {/* Full Schedule — every remaining scheduled match, same rows + controls. */}
      <Modal
        visible={fullOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setFullOpen(false)}
      >
        <View style={styles.overlay}>
          <View style={[styles.previewCard, styles.fullCard]}>
            <View style={styles.schedHead}>
              <Text allowFontScaling={false} style={styles.previewTitle}>
                Full Schedule ({scheduled.length})
              </Text>
              <Text allowFontScaling={false} style={styles.schedCounts}>
                {`${ordered.length} ready · ${waitingCount} waiting`}
              </Text>
            </View>
            <ScrollView style={[styles.fullList, { maxHeight: winH * 0.65 }]} bounces={false}>
              {scheduled.map(renderScheduledRow)}
            </ScrollView>
            <TouchableOpacity
              style={styles.previewCancel}
              onPress={() => setFullOpen(false)}
            >
              <Text allowFontScaling={false} style={styles.previewCancelText}>
                Close
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Assign Ready Matches (one-time batch) — preview on top, Recently Applied stacked below */}
      <Modal
        visible={autoOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setAutoOpen(false)}
      >
        <View style={styles.overlay}>
          <View style={styles.previewCard}>
            <Text allowFontScaling={false} style={styles.previewTitle}>
              Assign Ready Matches
            </Text>

            {/* Pending plan */}
            {autoPlan.length > 0 ? (
              <>
                <Text allowFontScaling={false} style={styles.sectionLabel}>
                  Will place:
                </Text>
                <ScrollView style={styles.previewList} bounces={false}>
                  {shownPlan.map((p) => (
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
                      <ActionMenu
                        label={tableById[p.tableId] ? tableLabelOf(tableById[p.tableId]) : "Table"}
                        triggerStyle={styles.rowBtn}
                        triggerTextStyle={styles.rowBtnText}
                        items={tableChoices(p)}
                      />
                    </View>
                  ))}
                </ScrollView>
                <TouchableOpacity
                  style={[styles.previewApply, applyBusy && styles.btnDisabled]}
                  disabled={applyBusy}
                  onPress={() => applyAll(shownPlan, false)}
                >
                  <Text allowFontScaling={false} style={styles.previewApplyText}>
                    Assign All ({autoPlan.length})
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.previewApplyStart, applyBusy && styles.btnDisabled]}
                  disabled={applyBusy}
                  onPress={() => applyAll(shownPlan, true)}
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

            {!!applyNote && (
              <Text allowFontScaling={false} style={styles.applyNote}>
                {applyNote}
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
                          {/* Move re-parks a not-yet-started match; a started match changes
                              table from the match-actions sheet (the server rejects re-assigning
                              a live match rather than silently un-starting it). */}
                          {available.length > 0 && m?.status !== "in_progress" && (
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
      web: { maxWidth: WEB_MAXW, width: "100%" as any, alignSelf: "center" as any },
    }),
  },
  summary: {
    fontSize: webMs(FONT_SIZES.sm),
    color: COLORS.textSecondary,
    fontWeight: "700",
    marginBottom: webSc(SPACING.sm),
  },
  // Compact control row: Auto Assign On/Off, Match Order dropdown, one-time Assign Ready Matches
  // (wraps on narrow screens).
  controls: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: webSc(SPACING.sm),
    marginBottom: webSc(SPACING.md),
  },
  autoBtn: {
    height: webSc(40),
    paddingHorizontal: webSc(SPACING.md),
    backgroundColor: COLORS.primary,
    borderRadius: webSc(RADIUS.sm),
    alignItems: "center",
    justifyContent: "center",
  },
  btnDisabled: { opacity: 0.5 },
  autoBtnText: {
    fontSize: webMs(FONT_SIZES.sm),
    color: COLORS.white,
    fontWeight: "800",
  },
  modeWrap: { width: webSc(220), maxWidth: "100%" as any },
  orderGroup: { flexDirection: "row", alignItems: "center", gap: webSc(SPACING.sm) },
  controlLabel: { fontSize: webMs(FONT_SIZES.sm), color: COLORS.text, fontWeight: "800" },
  // Two-column (wide web): operational left, sticky summary right.
  twoColRow: { flexDirection: "row", alignItems: "flex-start", gap: webSc(SPACING.lg) },
  leftCol: { flex: 70, minWidth: 0 as any },
  rightColWrap: {
    flex: 30,
    minWidth: 0 as any,
    position: "sticky" as any,
    top: webSc(SPACING.sm),
    alignSelf: "flex-start" as any,
  },
  summaryStack: { marginTop: webSc(SPACING.md) },
  summaryCard: {
    backgroundColor: COLORS.surface,
    borderRadius: webSc(RADIUS.md),
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: webSc(SPACING.md),
  },
  summaryTitle: {
    fontSize: webMs(FONT_SIZES.md),
    fontWeight: "800",
    color: COLORS.text,
    marginBottom: webSc(SPACING.sm),
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: webSc(SPACING.xs),
  },
  summaryLabel: { fontSize: webMs(FONT_SIZES.sm), color: COLORS.textSecondary },
  summaryValue: {
    fontSize: webMs(FONT_SIZES.sm),
    fontWeight: "800",
    color: COLORS.text,
    fontVariant: ["tabular-nums"],
  },
  summaryDivider: { height: 1, backgroundColor: COLORS.border, marginVertical: webSc(SPACING.xs) },
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
  // Start / Manage / Actions form one button group: identical height, radius,
  // padding, min-width and font so they align exactly row-to-row.
  startBtn: {
    height: webSc(40),
    minWidth: webSc(88),
    paddingHorizontal: webSc(SPACING.md),
    borderRadius: webSc(RADIUS.sm),
    backgroundColor: COLORS.success,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },
  startBtnText: { fontSize: webMs(FONT_SIZES.sm), color: COLORS.white, fontWeight: "800" },
  manageBtn: {
    height: webSc(40),
    minWidth: webSc(88),
    paddingHorizontal: webSc(SPACING.md),
    borderRadius: webSc(RADIUS.sm),
    borderWidth: 1,
    borderColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },
  manageBtnText: { fontSize: webMs(FONT_SIZES.sm), color: COLORS.primary, fontWeight: "800" },
  // Passed to ActionMenu so its trigger matches Start/Manage exactly.
  qActionTrigger: {
    height: webSc(40),
    minWidth: webSc(96),
    paddingVertical: 0,
    paddingHorizontal: webSc(SPACING.md),
    borderRadius: webSc(RADIUS.sm),
  },
  qActionTriggerText: { fontSize: webMs(FONT_SIZES.sm), fontWeight: "800" },
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
  onTableMeta: { color: COLORS.textSecondary, fontWeight: "600" },
  onTableLive: { color: COLORS.success, fontWeight: "800" },
  onTableParked: { color: COLORS.warning, fontWeight: "800" },
  // Scheduled Matches (compact list)
  schedHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: webSc(SPACING.sm),
    paddingVertical: webSc(SPACING.xs),
  },
  schedCounts: { fontSize: webMs(FONT_SIZES.xs), color: COLORS.textSecondary, fontWeight: "700" },
  emptyText: {
    fontSize: webMs(FONT_SIZES.sm),
    color: COLORS.textSecondary,
    textAlign: "center",
    paddingVertical: webSc(SPACING.md),
  },
  viewAllBtn: {
    marginTop: webSc(SPACING.sm),
    paddingVertical: webSc(SPACING.sm),
    borderRadius: webSc(RADIUS.sm),
    borderWidth: 1,
    borderColor: COLORS.primary,
    alignItems: "center",
  },
  viewAllBtnText: { fontSize: webMs(FONT_SIZES.sm), color: COLORS.primary, fontWeight: "800" },
  // Row-sized Assign trigger (smaller than the On Tables button group).
  rowBtn: {
    height: webSc(28),
    paddingVertical: 0,
    paddingHorizontal: webSc(SPACING.sm),
    borderRadius: webSc(RADIUS.sm),
  },
  rowBtnText: { fontSize: webMs(FONT_SIZES.xs), fontWeight: "800" },
  reorderBtn: {
    width: webSc(28),
    height: webSc(28),
    borderRadius: webSc(RADIUS.sm),
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.background,
    alignItems: "center",
    justifyContent: "center",
  },
  reorderOff: { opacity: 0.3 },
  reorderText: { fontSize: webMs(FONT_SIZES.xs), color: COLORS.primary, fontWeight: "700" },
  noTable: {
    fontSize: webMs(FONT_SIZES.xs),
    color: COLORS.textMuted,
    fontStyle: "italic",
  },
  fullCard: Platform.select({ web: { maxWidth: 760 }, default: {} }) as any,
  fullList: { flexGrow: 0 },
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
  applyNote: {
    fontSize: webMs(FONT_SIZES.xs),
    color: COLORS.warning,
    fontWeight: "700",
    marginTop: webSc(SPACING.sm),
  },
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
