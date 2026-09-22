// src/views/components/tournament/live/EliminationDashboard.tsx
// Live control-center for Single/Double Elimination (web/desktop). Presentational: every value
// and ordered list is derived by the host from the SAME authoritative sources the other Live
// pages use (the shared projected schedule, LiveMatch state, tournament_events). Chip is only a
// visual reference — this component is elimination-specific and does not touch Chip.

import { useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { COLORS } from "../../../../theme/colors";
import { RADIUS, SPACING, WEB_MAXW } from "../../../../theme/spacing";
import { FONT_SIZES } from "../../../../theme/typography";
import { webMs, webSc } from "../../../../utils/scaling";
import { LiveMatch, MatchActionStep } from "../../../../utils/match.utils";
import { AUTO_ASSIGN_MODES } from "../../../../utils/queue.utils";
import { ProjectedMatch } from "../../../../utils/schedule.projection";
import { AutoAssignMode } from "../../../../models/types/tournament-settings.types";
import { TournamentEvent } from "../../../../models/services/tournament-event.service";
import { Dropdown } from "../../common/dropdown";
import { MatchCard } from "./MatchCard";
import { ScheduledMatchRow } from "./ScheduledMatchRow";
import { AutoAssignToggle } from "./AutoAssignToggle";
import { useLiveNow } from "../../../../viewmodels/hooks/use.live.now";

export interface DashboardKpis {
  playersRemaining: number;
  activeMatches: number;
  waiting: number;
  tablesInUse: number;
  tablesAvailable: number;
  completed: number;
  avgMatchText: string; // "—" when no completed timing
}

// Reuse the authoritative mode list (values must match orderQueue's switch).
const MODE_OPTIONS = AUTO_ASSIGN_MODES;

const clockTime = (iso: string): string => {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  } catch {
    return "";
  }
};

// Human-readable activity line from the structured event (type + payload).
const eventTitle = (e: TournamentEvent): string => {
  switch (e.type) {
    case "tournament_started": return "Tournament started";
    case "match_started": return "Match started";
    case "match_completed": return "Match completed";
    case "table_assigned": return "Table assigned";
    case "table_changed": return "Table changed";
    case "table_unassigned": return "Table unassigned";
    case "match_reopened": return "Match reopened";
    case "match_timer_adjusted": return (e.payload as any)?.reset ? "Match timer reset" : "Match timer adjusted";
    case "bracket_redrawn": return "Bracket redrawn";
    default: return e.type;
  }
};
const eventDetail = (e: TournamentEvent): string | null => {
  const p = (e.payload ?? {}) as Record<string, unknown>;
  const vs = p.p1Name && p.p2Name ? `${p.p1Name} vs ${p.p2Name}` : (p.label as string) || null;
  const table = p.tableLabel ? `${p.tableLabel}` : null;
  const loc = (p.location as string) || null;
  if (e.type === "match_completed" && p.winnerName) {
    return `${p.winnerName} def. ${p.loserName ?? "opponent"}${loc ? ` · ${loc}` : ""}`;
  }
  if (e.type === "table_assigned" || e.type === "table_changed") {
    return [table, vs].filter(Boolean).join(" · ") || null;
  }
  if (e.type === "tournament_started") return null;
  if (e.type === "match_timer_adjusted") {
    if (p.reset) return vs;
    return p.prevElapsed && p.newElapsed ? `${p.prevElapsed} → ${p.newElapsed}` : vs;
  }
  return [vs, table].filter(Boolean).join(" · ") || loc;
};

const Section = ({
  title,
  right,
  collapsible,
  defaultOpen = true,
  children,
}: {
  title: string;
  right?: React.ReactNode;
  collapsible?: boolean;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <Text allowFontScaling={false} style={styles.cardTitle}>{title}</Text>
        {collapsible ? (
          // Profile-style collapse: title left, SHOW/HIDE on the far right.
          <TouchableOpacity onPress={() => setOpen((o) => !o)} activeOpacity={0.7} hitSlop={8}>
            <Text allowFontScaling={false} style={styles.showHide}>
              {open ? "HIDE ˅" : "SHOW ›"}
            </Text>
          </TouchableOpacity>
        ) : (
          right
        )}
      </View>
      {open && children}
    </View>
  );
};

export const EliminationDashboard = ({
  kpis,
  activeMatches,
  schedule,
  mode,
  events,
  startableCount,
  busy,
  onSetMode,
  autoAssignEnabled,
  onSetAutoAssignEnabled,
  onAssignReady,
  onStartAll,
  onAction,
  onOpenPage,
}: {
  kpis: DashboardKpis;
  activeMatches: LiveMatch[]; // matches assigned to a table (waiting or live)
  schedule: ProjectedMatch[]; // projected schedule (Ready first, then Waiting) — same as Queue
  mode: AutoAssignMode;
  events: TournamentEvent[];
  startableCount: number;
  busy?: boolean;
  onSetMode: (m: AutoAssignMode) => void;
  // Persistent Auto Assign ON/OFF (live_settings.autoAssignEnabled) — the same value the Queue shows.
  autoAssignEnabled: boolean;
  onSetAutoAssignEnabled: (on: boolean) => void;
  // One-time batch: assign the currently Ready matches now (offered only while Auto Assign is Off).
  onAssignReady: () => void;
  onStartAll: () => void;
  onAction: (m: LiveMatch, step: MatchActionStep) => void;
  onOpenPage: (tab: "matches" | "tables" | "queue") => void;
}) => {
  // Shared per-second ticker for the live elapsed clocks on the Active Tables cards.
  const hasLive = activeMatches.some((m) => m.status === "in_progress");
  const now = useLiveNow(hasLive);
  const kpiCells: { label: string; value: React.ReactNode }[] = [
    { label: "Players Remaining", value: kpis.playersRemaining },
    { label: "Active Matches", value: kpis.activeMatches },
    { label: "Waiting / Ready", value: kpis.waiting },
    { label: "Tables Available", value: kpis.tablesAvailable },
    { label: "Avg Match", value: kpis.avgMatchText },
  ];

  return (
    <View style={styles.pane}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* KPI row */}
        <View style={styles.kpiRow}>
          {kpiCells.map((k) => (
            <View key={k.label} style={styles.kpi}>
              <Text allowFontScaling={false} style={styles.kpiValue}>{k.value}</Text>
              <Text allowFontScaling={false} style={styles.kpiLabel}>{k.label}</Text>
            </View>
          ))}
        </View>

        <View style={styles.twoCol}>
          {/* LEFT — active tables + Start All */}
          <View style={styles.mainCol}>
            <Section
              title={`Active Tables (${activeMatches.length})`}
              right={
                <TouchableOpacity
                  style={[styles.startAllBtn, (startableCount === 0 || busy) && styles.btnDisabled]}
                  onPress={onStartAll}
                  disabled={startableCount === 0 || busy}
                  activeOpacity={0.7}
                >
                  <Text allowFontScaling={false} style={styles.startAllText}>
                    {startableCount > 0 ? `Start All (${startableCount})` : "Start All"}
                  </Text>
                </TouchableOpacity>
              }
            >
              {activeMatches.length === 0 ? (
                <Text allowFontScaling={false} style={styles.muted}>
                  No matches on tables yet. Turn on Auto Assign or use Assign Ready Matches.
                </Text>
              ) : (
                <View style={styles.activeGrid}>
                  {activeMatches.map((m) => (
                    <View key={m.id} style={styles.activeCell}>
                      <MatchCard match={m} onAction={onAction} busy={busy} compact now={now} />
                    </View>
                  ))}
                </View>
              )}
              <TouchableOpacity onPress={() => onOpenPage("matches")} activeOpacity={0.7}>
                <Text allowFontScaling={false} style={styles.link}>View all matches ›</Text>
              </TouchableOpacity>
            </Section>

            {/* Tournament Activity lives in the LEFT/main column so it aligns to the
                match area above it (not spanning under the right column). */}
            <Section title="Tournament Activity" collapsible defaultOpen>
              {events.length === 0 ? (
                <Text allowFontScaling={false} style={styles.muted}>No activity yet.</Text>
              ) : (
                events.slice(0, 30).map((e) => {
                  const detail = eventDetail(e);
                  return (
                    <View key={e.id} style={styles.actRow}>
                      <Text allowFontScaling={false} style={styles.actTime}>{clockTime(e.created_at)}</Text>
                      <View style={styles.actBody}>
                        <Text allowFontScaling={false} style={styles.actTitle}>{eventTitle(e)}</Text>
                        {!!detail && <Text allowFontScaling={false} style={styles.actDetail} numberOfLines={1}>{detail}</Text>}
                      </View>
                    </View>
                  );
                })
              )}
            </Section>
          </View>

          {/* RIGHT — assignment + match schedule */}
          <View style={styles.sideCol}>
            <View style={styles.card}>
              <Text allowFontScaling={false} style={styles.cardTitle}>Table Assignment</Text>
              <View style={styles.cardBlock}>
                <AutoAssignToggle stacked enabled={autoAssignEnabled} onChange={onSetAutoAssignEnabled} />
              </View>
              <Text allowFontScaling={false} style={styles.fieldLabel}>Match Order</Text>
              <View style={styles.modeWrap}>
                <Dropdown
                  hideCheck
                  selectedBlueText
                  options={MODE_OPTIONS}
                  value={mode}
                  onSelect={(v) => onSetMode(v as AutoAssignMode)}
                />
              </View>
              {!autoAssignEnabled && (
                <TouchableOpacity
                  style={[styles.assignBtn, busy && styles.btnDisabled]}
                  onPress={onAssignReady}
                  disabled={busy}
                  activeOpacity={0.7}
                >
                  <Text allowFontScaling={false} style={styles.assignBtnText}>Assign Ready Matches</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={() => onOpenPage("queue")} activeOpacity={0.7}>
                <Text allowFontScaling={false} style={styles.link}>Manage Queue ›</Text>
              </TouchableOpacity>
            </View>

            <Section title={`Match Schedule (${schedule.length})`}>
              {schedule.length === 0 ? (
                <Text allowFontScaling={false} style={styles.muted}>No matches left to schedule.</Text>
              ) : (
                schedule
                  .slice(0, 10)
                  .map((pm, i) => (
                    <ScheduledMatchRow key={pm.matchId} pm={pm} position={i + 1} now={now} dense />
                  ))
              )}
              <TouchableOpacity onPress={() => onOpenPage("queue")} activeOpacity={0.7}>
                <Text allowFontScaling={false} style={styles.link}>View full schedule ›</Text>
              </TouchableOpacity>
            </Section>
          </View>
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  pane: { flex: 1 },
  scroll: { flex: 1 },
  content: {
    width: "100%" as any,
    maxWidth: WEB_MAXW,
    alignSelf: "center" as any,
    paddingHorizontal: webSc(SPACING.md),
    paddingTop: webSc(SPACING.sm),
    paddingBottom: webSc(SPACING.xl) * 2,
  },
  kpiRow: { flexDirection: "row", flexWrap: "wrap", gap: webSc(SPACING.sm), marginBottom: webSc(SPACING.md) },
  kpi: {
    flexGrow: 1,
    flexBasis: 0,
    minWidth: webSc(120),
    backgroundColor: COLORS.surface,
    borderRadius: webSc(RADIUS.md),
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: webSc(SPACING.sm),
    paddingHorizontal: webSc(SPACING.md),
    alignItems: "center",
  },
  kpiValue: { fontSize: webMs(FONT_SIZES.xl), fontWeight: "800", color: COLORS.primary },
  kpiLabel: { fontSize: webMs(FONT_SIZES.xs), color: COLORS.textSecondary, marginTop: webSc(2) },
  twoCol: { flexDirection: "row", alignItems: "flex-start", gap: webSc(SPACING.md) },
  mainCol: { flex: 72, minWidth: 0 as any },
  sideCol: { flex: 28, minWidth: 0 as any, gap: webSc(SPACING.md) },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: webSc(RADIUS.md),
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: webSc(SPACING.md),
    marginBottom: webSc(SPACING.md),
  },
  cardHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: webSc(SPACING.sm) },
  cardHeadBtn: { flexDirection: "row", alignItems: "center", gap: webSc(SPACING.xs) },
  cardTitle: { fontSize: webMs(FONT_SIZES.md), fontWeight: "800", color: COLORS.text },
  cardCaret: { fontSize: webMs(FONT_SIZES.sm), color: COLORS.textSecondary },
  showHide: { fontSize: webMs(FONT_SIZES.sm), color: COLORS.primary, fontWeight: "800", letterSpacing: 0.3 },
  muted: { fontSize: webMs(FONT_SIZES.sm), color: COLORS.textMuted, paddingVertical: webSc(SPACING.xs) },
  link: { fontSize: webMs(FONT_SIZES.sm), color: COLORS.primary, fontWeight: "700", marginTop: webSc(SPACING.xs) },
  startAllBtn: { backgroundColor: COLORS.primary, borderRadius: webSc(RADIUS.sm), paddingHorizontal: webSc(SPACING.md), paddingVertical: webSc(6) },
  startAllText: { color: COLORS.white, fontSize: webMs(FONT_SIZES.sm), fontWeight: "800" },
  btnDisabled: { opacity: 0.5 },
  activeGrid: { flexDirection: "row", flexWrap: "wrap", gap: webSc(SPACING.md) },
  activeCell: { width: "48.5%" as any },
  cardBlock: { marginTop: webSc(SPACING.sm), marginBottom: webSc(SPACING.sm) },
  fieldLabel: { fontSize: webMs(FONT_SIZES.xs), color: COLORS.textSecondary, fontWeight: "700", marginBottom: webSc(SPACING.xs) },
  assignBtn: { borderWidth: 1, borderColor: COLORS.primary, borderRadius: webSc(RADIUS.sm), paddingVertical: webSc(SPACING.sm), alignItems: "center", marginBottom: webSc(SPACING.sm) },
  assignBtnText: { color: COLORS.primary, fontSize: webMs(FONT_SIZES.sm), fontWeight: "800" },
  modeWrap: { marginBottom: webSc(SPACING.sm) },
  actRow: { flexDirection: "row", gap: webSc(SPACING.sm), paddingVertical: webSc(SPACING.xs), borderTopWidth: 1, borderTopColor: COLORS.border },
  actTime: { fontSize: webMs(FONT_SIZES.xs), color: COLORS.textMuted, width: webSc(64) },
  actBody: { flex: 1, minWidth: 0 as any },
  actTitle: { fontSize: webMs(FONT_SIZES.sm), fontWeight: "700", color: COLORS.text },
  actDetail: { fontSize: webMs(FONT_SIZES.xs), color: COLORS.textSecondary, marginTop: webSc(1) },
});
