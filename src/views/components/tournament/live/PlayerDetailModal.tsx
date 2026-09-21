// src/views/components/tournament/live/PlayerDetailModal.tsx
// Read-only player-detail modal for the elimination spectator Stats page. Centered
// card on wide web, bottom sheet on mobile (Chip's player modal is the UX
// reference only — this is elimination data). Pure presentation over the SAME
// shared sources: SpectatorPlayer (record/group/status), computeAllPlayerStats
// (performance) and playerMatchHistory + bracketLocation (history). No second
// stats path.

import {
  Modal as RNModal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { COLORS } from "../../../../theme/colors";
import { RADIUS, SPACING } from "../../../../theme/spacing";
import { FONT_SIZES } from "../../../../theme/typography";
import { webMs, webSc } from "../../../../utils/scaling";
import { LiveMatch } from "../../../../utils/match.utils";
import { bracketLocation } from "../../../../utils/queue.utils";
import {
  formatDurationMs,
  playerMatchHistory,
  PlayerTournamentStats,
  winFractionLabel,
} from "../../../../utils/tournament.stats";
import { SpectatorPlayer } from "../../../../viewmodels/useTournamentSpectator";

// Green above Fargo, red below, gray near it (±10) — matches the old Stats view.
const deltaColor = (d: number | null): string =>
  d == null
    ? COLORS.textMuted
    : d > 10
      ? COLORS.success
      : d < -10
        ? COLORS.error
        : COLORS.textSecondary;
const deltaLabel = (d: number | null): string =>
  d == null ? "N/A" : d === 0 ? "Even" : d > 0 ? `+${d}` : `${d}`;

const Cell = ({
  label,
  value,
  valueColor,
}: {
  label: string;
  value: string;
  valueColor?: string;
}) => (
  <View style={styles.cell}>
    <Text
      allowFontScaling={false}
      style={[styles.cellValue, valueColor ? { color: valueColor } : null]}
      numberOfLines={1}
    >
      {value}
    </Text>
    <Text allowFontScaling={false} style={styles.cellLabel} numberOfLines={1}>
      {label}
    </Text>
  </View>
);

const Row = ({ label, value }: { label: string; value: string }) => (
  <View style={styles.row}>
    <Text allowFontScaling={false} style={styles.rowLabel}>
      {label}
    </Text>
    <Text allowFontScaling={false} style={styles.rowValue}>
      {value}
    </Text>
  </View>
);

export const PlayerDetailModal = ({
  visible,
  onClose,
  player,
  stats,
  matches,
  playing,
  groupsMode,
}: {
  visible: boolean;
  onClose: () => void;
  player: SpectatorPlayer | null;
  stats: PlayerTournamentStats | null;
  matches: LiveMatch[];
  playing: boolean;
  groupsMode: boolean;
}) => {
  const { width } = useWindowDimensions();
  const wide = Platform.OS === "web" && width >= 980;

  const wins = player ? player.record.filter((r) => r === "W").length : 0;
  const losses = player ? player.record.filter((r) => r === "L").length : 0;

  // History reuses the shared derivation, enriched with location/table/duration
  // from the same match objects (looked up by id) — presentation, not new math.
  const key = player ? `r${player.id}` : "";
  const history = player ? playerMatchHistory(matches, key) : [];
  const byId = new Map(matches.map((m) => [m.id, m]));

  const status = player?.eliminated
    ? { label: "Eliminated", style: styles.badgeOut }
    : playing
      ? { label: "Playing", style: styles.badgePlaying }
      : { label: "Still In", style: styles.badgeIn };

  return (
    <RNModal
      visible={visible && !!player}
      transparent
      animationType={wide ? "fade" : "slide"}
      onRequestClose={onClose}
    >
      <View style={[styles.overlay, wide ? styles.overlayCenter : styles.overlayBottom]}>
        <View style={[styles.container, wide ? styles.containerWide : styles.containerSheet]}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerMain}>
              <Text allowFontScaling={false} style={styles.name} numberOfLines={1}>
                {player?.name ?? "Player"}
              </Text>
              <View style={[styles.badge, status.style]}>
                <Text allowFontScaling={false} style={styles.badgeText}>
                  {status.label}
                </Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={8}>
              <Text allowFontScaling={false} style={styles.closeText}>
                ✕
              </Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.body}
            contentContainerStyle={styles.bodyContent}
            showsVerticalScrollIndicator={false}
          >
            {/* Summary cards */}
            <View style={styles.cellGrid}>
              <Cell label="Record" value={`${wins} - ${losses}`} />
              <Cell
                label="Win %"
                value={stats ? winFractionLabel(stats.winPct) : "N/A"}
              />
              <Cell
                label="Fargo"
                value={player?.fargo != null ? String(player.fargo) : "—"}
              />
              {groupsMode && (
                <Cell label="Group" value={player?.group ?? "—"} />
              )}
            </View>

            {/* Performance */}
            <View style={styles.card}>
              <Text allowFontScaling={false} style={styles.cardTitle}>
                Tournament Performance
              </Text>
              <View style={styles.perfHead}>
                <View>
                  <Text
                    allowFontScaling={false}
                    style={[styles.perfRating, { color: COLORS.success }]}
                  >
                    {stats?.performanceRating != null ? stats.performanceRating : "N/A"}
                  </Text>
                  <Text allowFontScaling={false} style={styles.perfRatingLabel}>
                    Performance Rating
                  </Text>
                </View>
                <View style={styles.deltaBadge}>
                  <Text
                    allowFontScaling={false}
                    style={[styles.deltaText, { color: deltaColor(stats?.performanceDelta ?? null) }]}
                  >
                    {deltaLabel(stats?.performanceDelta ?? null)}
                  </Text>
                </View>
              </View>
              <View style={styles.divider} />
              <Row
                label="Current Fargo"
                value={player?.fargo != null ? String(player.fargo) : "—"}
              />
              <Row
                label="Avg Opponent Fargo"
                value={stats?.avgOpponentFargo != null ? String(stats.avgOpponentFargo) : "—"}
              />
              <Row label="Games Won" value={String(stats?.gamesWon ?? 0)} />
              <Row label="Games Lost" value={String(stats?.gamesLost ?? 0)} />
              <Row label="Record" value={`${wins}-${losses}`} />
            </View>

            {/* Match history */}
            <View style={styles.card}>
              <Text allowFontScaling={false} style={styles.cardTitle}>
                Match History
              </Text>
              {history.length === 0 ? (
                <Text allowFontScaling={false} style={styles.empty}>
                  No matches played yet.
                </Text>
              ) : (
                history.map((h, i) => {
                  const m = byId.get(h.id);
                  const loc = m ? bracketLocation(m) : h.roundLabel;
                  const table = m?.tableLabel ?? null;
                  const dur =
                    m?.startedAt && m?.completedAt
                      ? formatDurationMs(
                          new Date(m.completedAt).getTime() -
                            new Date(m.startedAt).getTime(),
                        )
                      : null;
                  const meta = [loc, table, dur].filter(Boolean).join(" · ");
                  return (
                    <View key={h.id}>
                      {i > 0 && <View style={styles.divider} />}
                      <View style={styles.histRow}>
                        <View
                          style={[
                            styles.histTag,
                            h.live
                              ? styles.histTagLive
                              : h.won
                                ? styles.histTagWin
                                : styles.histTagLoss,
                          ]}
                        >
                          <Text allowFontScaling={false} style={styles.histTagText}>
                            {h.live ? "•" : h.won ? "W" : "L"}
                          </Text>
                        </View>
                        <View style={styles.histMain}>
                          <Text allowFontScaling={false} style={styles.histOpp} numberOfLines={1}>
                            {h.opponentName ? `vs ${h.opponentName}` : "vs TBD"}
                          </Text>
                          <Text allowFontScaling={false} style={styles.histMeta} numberOfLines={1}>
                            {meta}
                            {h.result === "forfeit"
                              ? " · Forfeit"
                              : h.result === "withdraw"
                                ? " · Withdraw"
                                : ""}
                          </Text>
                        </View>
                        <Text allowFontScaling={false} style={styles.histScore}>
                          {`${h.myScore}-${h.oppScore}`}
                        </Text>
                      </View>
                    </View>
                  );
                })
              )}
            </View>
          </ScrollView>

          {/* Footer close (matches Chip's bottom Close) */}
          <TouchableOpacity onPress={onClose} activeOpacity={0.8} style={styles.footerBtn}>
            <Text allowFontScaling={false} style={styles.footerBtnText}>
              Close
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </RNModal>
  );
};

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)" },
  overlayCenter: { alignItems: "center", justifyContent: "center", padding: webSc(SPACING.lg) },
  overlayBottom: { justifyContent: "flex-end" },
  container: { backgroundColor: COLORS.background, borderColor: COLORS.border },
  containerWide: {
    width: "100%" as any,
    maxWidth: 560,
    maxHeight: "85%" as any,
    borderRadius: webSc(RADIUS.xl),
    borderWidth: 1,
  },
  containerSheet: {
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    maxHeight: "90%" as any,
    borderTopWidth: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: webSc(SPACING.md),
    paddingVertical: webSc(SPACING.md),
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    gap: webSc(SPACING.sm),
  },
  headerMain: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: webSc(SPACING.sm),
    minWidth: 0 as any,
  },
  name: { fontSize: webMs(FONT_SIZES.lg), fontWeight: "900", color: COLORS.text, flexShrink: 1 },
  badge: {
    paddingHorizontal: webSc(SPACING.sm),
    paddingVertical: webSc(2),
    borderRadius: RADIUS.full,
  },
  badgeIn: { backgroundColor: COLORS.success + "22" },
  badgePlaying: { backgroundColor: COLORS.primary + "22" },
  badgeOut: { backgroundColor: COLORS.error + "22" },
  badgeText: { fontSize: webMs(FONT_SIZES.xs), fontWeight: "800", color: COLORS.text },
  closeBtn: { padding: webSc(SPACING.xs) },
  closeText: { fontSize: webMs(FONT_SIZES.lg), color: COLORS.textSecondary, fontWeight: "800" },

  body: { flexGrow: 0 },
  bodyContent: { padding: webSc(SPACING.md), gap: webSc(SPACING.md) },

  cellGrid: { flexDirection: "row", flexWrap: "wrap", gap: webSc(SPACING.sm) },
  cell: {
    flexGrow: 1,
    flexBasis: "28%" as any,
    minWidth: webSc(90),
    backgroundColor: COLORS.surface,
    borderRadius: webSc(RADIUS.md),
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: webSc(SPACING.sm),
    paddingHorizontal: webSc(SPACING.sm),
    alignItems: "center",
  },
  cellValue: {
    fontSize: webMs(FONT_SIZES.lg),
    fontWeight: "900",
    color: COLORS.text,
    fontVariant: ["tabular-nums"],
  },
  cellLabel: { fontSize: webMs(FONT_SIZES.xs), color: COLORS.textSecondary, marginTop: webSc(2) },

  card: {
    backgroundColor: COLORS.surface,
    borderRadius: webSc(RADIUS.lg),
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: webSc(SPACING.md),
  },
  cardTitle: {
    fontSize: webMs(FONT_SIZES.sm),
    fontWeight: "800",
    color: COLORS.text,
    marginBottom: webSc(SPACING.sm),
  },
  divider: { height: 1, backgroundColor: COLORS.border, marginVertical: webSc(SPACING.xs) },
  empty: { fontSize: webMs(FONT_SIZES.sm), color: COLORS.textMuted, textAlign: "center" },

  perfHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  perfRating: {
    fontSize: webMs(FONT_SIZES.xxl),
    fontWeight: "900",
    fontVariant: ["tabular-nums"],
  },
  perfRatingLabel: { fontSize: webMs(FONT_SIZES.xs), color: COLORS.textSecondary, fontWeight: "600" },
  deltaBadge: {
    paddingHorizontal: webSc(SPACING.md),
    paddingVertical: webSc(SPACING.sm),
    borderRadius: webSc(RADIUS.md),
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.background,
  },
  deltaText: { fontSize: webMs(FONT_SIZES.lg), fontWeight: "900", fontVariant: ["tabular-nums"] },

  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: webSc(SPACING.xs),
  },
  rowLabel: { fontSize: webMs(FONT_SIZES.sm), color: COLORS.textSecondary },
  rowValue: {
    fontSize: webMs(FONT_SIZES.sm),
    fontWeight: "800",
    color: COLORS.text,
    fontVariant: ["tabular-nums"],
  },

  histRow: { flexDirection: "row", alignItems: "center", gap: webSc(SPACING.sm), paddingVertical: webSc(SPACING.sm) },
  histTag: {
    width: webSc(24),
    height: webSc(24),
    borderRadius: webSc(RADIUS.sm),
    alignItems: "center",
    justifyContent: "center",
  },
  histTagWin: { backgroundColor: COLORS.success },
  histTagLoss: { backgroundColor: COLORS.error },
  histTagLive: { backgroundColor: COLORS.primary },
  histTagText: { fontSize: webMs(FONT_SIZES.xs), fontWeight: "900", color: "#fff" },
  histMain: { flex: 1, minWidth: 0 as any },
  histOpp: { fontSize: webMs(FONT_SIZES.sm), fontWeight: "700", color: COLORS.text },
  histMeta: { fontSize: webMs(FONT_SIZES.xs), color: COLORS.textSecondary, marginTop: webSc(2) },
  histScore: {
    fontSize: webMs(FONT_SIZES.md),
    fontWeight: "900",
    color: COLORS.text,
    fontVariant: ["tabular-nums"],
  },

  footerBtn: {
    margin: webSc(SPACING.md),
    paddingVertical: webSc(SPACING.md),
    borderRadius: webSc(RADIUS.md),
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
  },
  footerBtnText: { fontSize: webMs(FONT_SIZES.md), fontWeight: "800", color: COLORS.text },
});
