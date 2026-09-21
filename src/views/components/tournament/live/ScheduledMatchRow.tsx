// src/views/components/tournament/live/ScheduledMatchRow.tsx
// One compact row of the projected elimination schedule (Queue → Scheduled
// Matches, the Full Schedule modal, and the Dashboard's Match Schedule).
// Presentational only: order, readiness and slot text all come from the Phase 1
// projection (utils/schedule.projection). Feeder placeholders ("Winner of W4")
// are rendered via projectedSlotText — never rebuilt here.

import { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { COLORS } from "../../../../theme/colors";
import { RADIUS, SPACING } from "../../../../theme/spacing";
import { FONT_SIZES } from "../../../../theme/typography";
import { webMs, webSc } from "../../../../utils/scaling";
import { formatWait } from "../../../../utils/queue.utils";
import {
  ProjectedMatch,
  ProjectedSlot,
  projectedSlotText,
} from "../../../../utils/schedule.projection";

type RowStatus = "ready" | "waiting" | "conditional";

const statusOf = (pm: ProjectedMatch): RowStatus => {
  if (pm.eligibility.ready) return "ready";
  if (pm.conditional === "possible") return "conditional";
  return "waiting";
};

const STATUS_TEXT: Record<RowStatus, string> = {
  ready: "READY",
  waiting: "WAITING",
  conditional: "IF NEEDED",
};

const waitTone = (ms: number): string => {
  const mins = ms / 60000;
  if (mins >= 20) return COLORS.error;
  if (mins >= 10) return COLORS.warning;
  return COLORS.textSecondary;
};

const SlotText = ({ slot }: { slot: ProjectedSlot }) => (
  <Text style={slot.kind === "player" ? styles.player : styles.placeholder}>
    {projectedSlotText(slot)}
  </Text>
);

export const ScheduledMatchRow = ({
  pm,
  position,
  now,
  actions,
  stackActions,
  dense,
}: {
  pm: ProjectedMatch;
  position: number; // 1-based
  now?: number; // for the live wait of ready rows (display only)
  actions?: ReactNode;
  stackActions?: boolean; // narrow layouts: actions on their own line
  dense?: boolean; // side-panel variant (Dashboard)
}) => {
  const status = statusOf(pm);
  const waitMs =
    status === "ready" && pm.readyAt != null && now != null ? Math.max(0, now - pm.readyAt) : null;
  const badge = pm.matchId === "GF2" ? "Finals 2" : pm.numberLabel || pm.matchId;

  return (
    <View style={[styles.row, dense && styles.rowDense]}>
      <View style={styles.main}>
        <Text allowFontScaling={false} style={styles.pos}>{position}</Text>
        <View style={[styles.badge, status === "ready" && styles.badgeReady]}>
          <Text allowFontScaling={false} style={[styles.badgeText, status === "ready" && styles.badgeTextReady]} numberOfLines={1}>
            {badge}
          </Text>
        </View>
        <View style={styles.body}>
          <Text allowFontScaling={false} style={styles.players} numberOfLines={1}>
            <SlotText slot={pm.slot1} />
            <Text style={styles.vs}>{"  vs  "}</Text>
            <SlotText slot={pm.slot2} />
          </Text>
          <Text allowFontScaling={false} style={styles.meta} numberOfLines={1}>
            {pm.location}
            {status === "conditional" ? "  ·  Only if the reset is needed" : ""}
            {waitMs != null && (
              <Text style={{ color: waitTone(waitMs), fontWeight: "700" }}>
                {waitMs < 60000 ? "  ·  Just now" : `  ·  Waiting ${formatWait(waitMs)}`}
              </Text>
            )}
          </Text>
        </View>
        <View style={[styles.pill, styles[`pill_${status}`]]}>
          <Text allowFontScaling={false} style={[styles.pillText, styles[`pillText_${status}`]]}>
            {STATUS_TEXT[status]}
          </Text>
        </View>
        {!!actions && !stackActions && <View style={styles.actionsInline}>{actions}</View>}
      </View>
      {!!actions && stackActions && <View style={styles.actionsStacked}>{actions}</View>}
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    paddingVertical: webSc(SPACING.sm),
    borderTopWidth: 1,
    borderTopColor: COLORS.border + "60",
  },
  rowDense: { paddingVertical: webSc(SPACING.xs) },
  main: { flexDirection: "row", alignItems: "center", gap: webSc(SPACING.sm) },
  pos: {
    width: webSc(20),
    fontSize: webMs(FONT_SIZES.xs),
    fontWeight: "800",
    color: COLORS.textMuted,
    textAlign: "right",
    fontVariant: ["tabular-nums"],
  },
  badge: {
    minWidth: webSc(44),
    paddingHorizontal: webSc(SPACING.xs),
    paddingVertical: webSc(2),
    borderRadius: webSc(RADIUS.sm),
    backgroundColor: COLORS.surfaceLight,
    alignItems: "center",
  },
  badgeReady: { backgroundColor: COLORS.primary + "26" },
  badgeText: { fontSize: webMs(FONT_SIZES.xs), fontWeight: "800", color: COLORS.textSecondary },
  badgeTextReady: { color: COLORS.primaryLight },
  body: { flex: 1, minWidth: 0 as any },
  players: { fontSize: webMs(FONT_SIZES.sm) },
  player: { color: COLORS.text, fontWeight: "700" },
  // Unresolved feeder — a legitimate future opponent, not a disabled state.
  placeholder: { color: COLORS.primarySoft, fontWeight: "600", fontStyle: "italic" },
  vs: { color: COLORS.textMuted, fontWeight: "600" },
  meta: { fontSize: webMs(FONT_SIZES.xs), color: COLORS.textSecondary, marginTop: webSc(2) },
  pill: {
    paddingHorizontal: webSc(SPACING.sm),
    paddingVertical: webSc(2),
    borderRadius: webSc(RADIUS.full),
    borderWidth: 1,
  },
  pill_ready: { backgroundColor: COLORS.success + "22", borderColor: COLORS.success },
  pill_waiting: { backgroundColor: COLORS.transparent, borderColor: COLORS.borderLight },
  pill_conditional: { backgroundColor: COLORS.transparent, borderColor: COLORS.warning + "99" },
  pillText: { fontSize: webMs(FONT_SIZES.xs), fontWeight: "800", letterSpacing: 0.4 },
  pillText_ready: { color: COLORS.success },
  pillText_waiting: { color: COLORS.textSecondary },
  pillText_conditional: { color: COLORS.warning },
  actionsInline: { flexDirection: "row", alignItems: "center", gap: webSc(SPACING.xs) },
  actionsStacked: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: webSc(SPACING.xs),
    marginTop: webSc(SPACING.xs),
  },
});
