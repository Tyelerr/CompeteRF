// src/views/components/tournament/ChipPerformancePanel.tsx
// Shared, presentation-only panel for a chip player/team detail: the 6 stat tiles, the
// PERFORMANCE card, and the Match History list. Rendered by BOTH the spectator Performance
// modal (chip-live.screen) and the admin player-detail modal (chip-manage) so the two can
// never visually or numerically drift. It contains NO admin controls and NO permission logic —
// callers own their own header/chrome and (for admin) the ⋮ actions. All values are passed in
// already computed (record, win %, performance rating/delta/opponent-avg via the shared
// utils/performance, elapsed clock via utils/formatters), so formatting lives in one place.

import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { COLORS } from "../../../theme/colors";
import { RADIUS, SPACING } from "../../../theme/spacing";
import { FONT_SIZES } from "../../../theme/typography";
import { webMs, webSc } from "../../../utils/scaling";
import { chipStatusColor } from "../../../utils/chip-colors";
import { formatElapsedClock } from "../../../utils/formatters";

export interface ChipHistoryRow {
  id: string;
  won: boolean;
  opponentName: string;
  opponentFargo: number | null;
  tableLabel: string | null;
  durationMs: number | null;
}

export interface ChipPerformancePanelProps {
  chips: number;
  startChips: number;
  wins: number;
  losses: number;
  winPct: number; // 0..1
  fargo: number | null;
  bestStreak: number;
  isTeam: boolean; // "Team Fargo" vs "Fargo" label in the performance card
  perf: { rating: number | null; delta: number | null; avgOpponentFargo: number | null } | null;
  history: ChipHistoryRow[];
}

const RecordInline = ({ wins, losses }: { wins: number; losses: number }) => (
  <Text allowFontScaling={false}>
    <Text style={{ color: COLORS.success, fontWeight: "700" }}>{wins}</Text>
    <Text style={{ color: COLORS.textMuted }}>{" - "}</Text>
    <Text style={{ color: COLORS.error, fontWeight: "700" }}>{losses}</Text>
  </Text>
);

const PStat = ({ val, lbl, color }: { val: React.ReactNode; lbl: string; color?: string }) => (
  <View style={styles.pStat}>
    <Text allowFontScaling={false} style={[styles.pStatVal, color ? { color } : null]} numberOfLines={1}>{val}</Text>
    <Text allowFontScaling={false} style={styles.pStatLbl} numberOfLines={1}>{lbl}</Text>
  </View>
);

export const ChipPerformancePanel = ({
  chips,
  startChips,
  wins,
  losses,
  winPct,
  fargo,
  bestStreak,
  isTeam,
  perf,
  history,
}: ChipPerformancePanelProps) => {
  const d = perf?.delta ?? 0;
  const dColor = d > 0 ? COLORS.success : d < 0 ? COLORS.error : COLORS.textSecondary;
  return (
    <>
      {/* Stat grid — Chips / Record / Win Rate, then Started With / Fargo / Best Streak */}
      <View style={styles.pStatGrid}>
        <PStat val={`${chips}`} lbl="Chips" color={chipStatusColor(chips, startChips)} />
        <PStat val={<RecordInline wins={wins} losses={losses} />} lbl="Record" />
        <PStat val={`${Math.round(winPct * 100)}%`} lbl="Win Rate" />
        <PStat val={`${startChips}`} lbl="Started With" />
        <PStat val={fargo != null ? `${fargo}` : "—"} lbl="Fargo" />
        <PStat val={`${bestStreak}`} lbl="Best Streak" color={bestStreak > 0 ? COLORS.success : undefined} />
      </View>

      {/* Performance — "played like a NNN": Fargo → rating, signed delta, then supporting rows */}
      {perf && (
        <View style={styles.perfCard}>
          <Text allowFontScaling={false} style={styles.perfKicker}>PERFORMANCE</Text>
          <View style={styles.perfHeadline}>
            <Text allowFontScaling={false} style={styles.perfBig}>
              {fargo != null ? fargo : "—"}
              <Text style={styles.perfArrowSep}>{"  →  "}</Text>
              <Text style={{ color: COLORS.success }}>{perf.rating != null ? perf.rating : "—"}</Text>
            </Text>
            {perf.delta != null && (
              <Text allowFontScaling={false} style={[styles.perfDeltaInline, { color: dColor }]}>
                {d > 0 ? "+" : ""}{d}
              </Text>
            )}
          </View>
          <View style={styles.perfDivider} />
          <View style={styles.perfStatRow}>
            <Text allowFontScaling={false} style={styles.perfStatLbl}>{isTeam ? "Team Fargo" : "Fargo"}</Text>
            <Text allowFontScaling={false} style={styles.perfStatVal}>{fargo != null ? fargo : "—"}</Text>
          </View>
          <View style={styles.perfStatRow}>
            <Text allowFontScaling={false} style={styles.perfStatLbl}>Performance Rating</Text>
            <Text allowFontScaling={false} style={styles.perfStatVal}>{perf.rating != null ? perf.rating : "—"}</Text>
          </View>
          {perf.avgOpponentFargo != null && (
            <View style={styles.perfStatRow}>
              <Text allowFontScaling={false} style={styles.perfStatLbl}>Opponent Avg</Text>
              <Text allowFontScaling={false} style={styles.perfStatVal}>{perf.avgOpponentFargo}</Text>
            </View>
          )}
        </View>
      )}

      {/* Match history */}
      <Text allowFontScaling={false} style={styles.profileSecTitle}>Match History</Text>
      {history.length === 0 ? (
        <Text allowFontScaling={false} style={styles.emptyLine}>No matches played yet.</Text>
      ) : (
        history.map((h, i) => (
          <View key={h.id} style={[styles.histRow, i === history.length - 1 && styles.noBorder]}>
            <View style={[styles.histResult, { backgroundColor: (h.won ? COLORS.success : COLORS.error) + "22" }]}>
              <Text allowFontScaling={false} style={[styles.histResultText, { color: h.won ? COLORS.success : COLORS.error }]}>{h.won ? "W" : "L"}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text allowFontScaling={false} style={styles.histOpp} numberOfLines={1}>vs {h.opponentName}</Text>
              <Text allowFontScaling={false} style={styles.histMeta} numberOfLines={1}>
                {[
                  h.opponentFargo != null ? `Fargo ${h.opponentFargo}` : null,
                  h.tableLabel,
                  h.durationMs != null ? formatElapsedClock(h.durationMs) : null,
                ].filter(Boolean).join(" · ") || "—"}
              </Text>
            </View>
          </View>
        ))
      )}
    </>
  );
};

const styles = StyleSheet.create({
  pStatGrid: { flexDirection: "row", flexWrap: "wrap", gap: webSc(SPACING.sm), marginBottom: webSc(SPACING.md) },
  pStat: { flexGrow: 1, flexBasis: "30%", minWidth: 90, alignItems: "center", backgroundColor: COLORS.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, paddingVertical: webSc(SPACING.sm) },
  pStatVal: { color: COLORS.text, fontSize: webMs(FONT_SIZES.lg), fontWeight: "900" },
  pStatLbl: { color: COLORS.textMuted, fontSize: webMs(FONT_SIZES.xs), fontWeight: "600", marginTop: 2 },
  perfCard: { backgroundColor: COLORS.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, padding: webSc(SPACING.md), marginBottom: webSc(SPACING.md) },
  perfKicker: { color: COLORS.textMuted, fontSize: webMs(FONT_SIZES.xs), fontWeight: "800", letterSpacing: 0.5 },
  perfHeadline: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: webSc(SPACING.md), marginTop: webSc(SPACING.sm), marginBottom: webSc(SPACING.md) },
  perfBig: { color: COLORS.text, fontSize: webMs(FONT_SIZES.xxxl), fontWeight: "900" },
  perfArrowSep: { color: COLORS.textMuted, fontWeight: "700" },
  perfDeltaInline: { fontSize: webMs(FONT_SIZES.lg), fontWeight: "800" },
  perfDivider: { height: 1, backgroundColor: COLORS.border, marginBottom: webSc(SPACING.sm) },
  perfStatRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: webSc(SPACING.sm), paddingVertical: webSc(5) },
  perfStatLbl: { color: COLORS.textSecondary, fontSize: webMs(FONT_SIZES.sm) },
  perfStatVal: { color: COLORS.text, fontSize: webMs(FONT_SIZES.sm), fontWeight: "800" },
  profileSecTitle: { color: COLORS.text, fontSize: webMs(FONT_SIZES.sm), fontWeight: "800", marginBottom: webSc(SPACING.xs), marginTop: webSc(SPACING.xs) },
  emptyLine: { color: COLORS.textMuted, fontSize: webMs(FONT_SIZES.sm), fontStyle: "italic", paddingVertical: webSc(SPACING.sm) },
  histRow: { flexDirection: "row", alignItems: "center", gap: webSc(SPACING.sm), paddingVertical: webSc(SPACING.sm), borderBottomWidth: 1, borderBottomColor: COLORS.border },
  noBorder: { borderBottomWidth: 0 },
  histResult: { width: webSc(28), height: webSc(28), borderRadius: RADIUS.sm, alignItems: "center", justifyContent: "center" },
  histResultText: { fontSize: webMs(FONT_SIZES.sm), fontWeight: "900" },
  histOpp: { color: COLORS.text, fontSize: webMs(FONT_SIZES.sm), fontWeight: "600" },
  histMeta: { color: COLORS.textMuted, fontSize: webMs(FONT_SIZES.xs), marginTop: 1 },
});
