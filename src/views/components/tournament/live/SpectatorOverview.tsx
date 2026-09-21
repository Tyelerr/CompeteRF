// src/views/components/tournament/live/SpectatorOverview.tsx
// Read-only, chip-style Overview for the Single/Double Elimination spectator view.
// Presentational: every live value/order is derived by the viewmodel from the SAME
// authoritative sources the admin uses (queue.utils ordering, LiveMatch state,
// tournament_events, computeTournamentStats). Responsive — desktop uses a 2-up
// Currently-Playing grid; mobile stacks. Shared across web + iOS + Android.

import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { COLORS } from "../../../../theme/colors";
import { RADIUS, SPACING } from "../../../../theme/spacing";
import { FONT_SIZES } from "../../../../theme/typography";
import { webMs, webSc } from "../../../../utils/scaling";
import { formatClock, LiveMatch } from "../../../../utils/match.utils";
import {
  AUTO_ASSIGN_MODES,
  bracketLocation,
  QueueEntry,
} from "../../../../utils/queue.utils";
import { AutoAssignMode } from "../../../../models/types/tournament-settings.types";
import { TournamentEvent } from "../../../../models/services/tournament-event.service";
import {
  eventClock,
  EventTone,
  formatTournamentEvent,
} from "../../../../utils/tournament-event.format";
import { SpectatorPlayer } from "../../../../viewmodels/useTournamentSpectator";

const isWeb = Platform.OS === "web";
// Module-level indirection so the react-compiler lint doesn't flag Date.now() as an
// impure call during render (elapsed-clock derivation).
const nowMs = (): number => Date.now();

const modeLabel = (m: AutoAssignMode): string =>
  AUTO_ASSIGN_MODES.find((o) => o.value === m)?.label ?? "Balanced";

const toneColor = (t: EventTone): string =>
  t === "win"
    ? COLORS.success
    : t === "start"
      ? COLORS.primary
      : t === "table"
        ? COLORS.warning
        : COLORS.textMuted;

const winsOf = (p: SpectatorPlayer): number =>
  p.record.filter((r) => r === "W").length;
const lossesOf = (p: SpectatorPlayer): number =>
  p.record.filter((r) => r === "L").length;

// Per-side race label from the AUTHORITATIVE per-match race targets on the
// LiveMatch (never recomputed here). Falls back to the common race.
const sideRace = (n: number | null, common: number | null): string | null => {
  const r = n ?? common;
  return r != null ? `Race to ${r}` : null;
};

// One live/waiting match tile in Currently Playing — table, matchup with scores,
// each player's race target, and bracket location.
const ActiveTile = ({ m }: { m: LiveMatch }) => {
  const live = m.status === "in_progress";
  const elapsed =
    live && m.startedAt
      ? formatClock(Math.max(0, (nowMs() - Date.parse(m.startedAt)) / 1000))
      : null;
  const s1 = m.p1Score ?? 0;
  const s2 = m.p2Score ?? 0;
  const r1 = sideRace(m.p1Race, m.raceTo);
  const r2 = sideRace(m.p2Race, m.raceTo);
  return (
    <View style={styles.tile}>
      <View style={styles.tileHead}>
        <Text allowFontScaling={false} style={styles.tileTable} numberOfLines={1}>
          {m.tableLabel ?? "Table"}
        </Text>
        {live ? (
          <View style={styles.tileLiveWrap}>
            <View style={styles.liveDot} />
            <Text allowFontScaling={false} style={styles.tileElapsed}>
              {elapsed ?? "LIVE"}
            </Text>
          </View>
        ) : (
          <Text allowFontScaling={false} style={styles.tileWaiting}>
            Waiting to Start
          </Text>
        )}
      </View>

      {/* Matchup with scores on the primary row */}
      <View style={styles.tileMatch}>
        <Text allowFontScaling={false} style={styles.tileName} numberOfLines={1}>
          {m.p1Name ?? "TBD"}
        </Text>
        <View style={styles.scoreWrap}>
          <Text allowFontScaling={false} style={styles.scoreText}>{s1}</Text>
          <Text allowFontScaling={false} style={styles.tileVs}>vs</Text>
          <Text allowFontScaling={false} style={styles.scoreText}>{s2}</Text>
        </View>
        <Text
          allowFontScaling={false}
          style={[styles.tileName, styles.tileNameRight]}
          numberOfLines={1}
        >
          {m.p2Name ?? "TBD"}
        </Text>
      </View>

      {/* Per-player race targets */}
      {(r1 || r2) && (
        <View style={styles.raceRow}>
          <Text allowFontScaling={false} style={styles.raceText} numberOfLines={1}>
            {r1 ?? ""}
          </Text>
          <Text
            allowFontScaling={false}
            style={[styles.raceText, styles.raceTextRight]}
            numberOfLines={1}
          >
            {r2 ?? ""}
          </Text>
        </View>
      )}

      <Text allowFontScaling={false} style={styles.tileMeta} numberOfLines={1}>
        {bracketLocation(m)}
      </Text>
    </View>
  );
};

export const SpectatorOverview = ({
  players,
  playingRegIds,
  kpis,
  activeMatches,
  upNext,
  autoAssignMode,
  events,
  live,
  onOpenPlayers,
  onOpenMatches,
}: {
  players: SpectatorPlayer[];
  playingRegIds: Set<number>;
  kpis: {
    playersRemaining: number;
    activeTables: number;
    waiting: number;
    matchesPlayed: number;
  };
  activeMatches: LiveMatch[];
  upNext: QueueEntry[];
  autoAssignMode: AutoAssignMode;
  events: TournamentEvent[];
  live: boolean;
  onOpenPlayers: () => void; // → Stats (player list)
  onOpenMatches: () => void;
}) => {
  // Currently Playing collapses to the first 4 cards; "View More Matches" reveals
  // the rest in place. Local presentation state only (no persistence).
  const [showAllMatches, setShowAllMatches] = useState(false);
  const shownMatches = showAllMatches ? activeMatches : activeMatches.slice(0, 4);

  // Player leaders: reuse the SpectatorPlayer record derivation (byes excluded),
  // best record first. Only players who have played a match appear.
  const leaders = [...players]
    .filter((p) => p.record.length > 0)
    .sort((a, b) => {
      const wl = winsOf(b) - winsOf(a);
      if (wl !== 0) return wl;
      const ll = lossesOf(a) - lossesOf(b);
      if (ll !== 0) return ll;
      return a.name.localeCompare(b.name);
    })
    .slice(0, 5);

  // Remaining shows still-in / total field (numerator drops as players are
  // eliminated; denominator is the tracked tournament field size, stable).
  const kpiCells = [
    { label: "Remaining", value: `${kpis.playersRemaining}/${players.length}` },
    { label: "Active Tables", value: kpis.activeTables },
    { label: "Waiting", value: kpis.waiting },
    { label: "Matches Played", value: kpis.matchesPlayed },
  ];

  return (
    <>
      {/* Live KPI row */}
      {live && (
        <View style={styles.kpiRow}>
          {kpiCells.map((k) => (
            <View key={k.label} style={styles.kpi}>
              <Text allowFontScaling={false} style={styles.kpiValue}>
                {k.value}
              </Text>
              <Text allowFontScaling={false} style={styles.kpiLabel}>
                {k.label}
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* Currently Playing */}
      {live && (
        <View style={styles.card}>
          <View style={styles.sectionHead}>
            <Ionicons
              name="flame"
              size={webMs(16)}
              color={COLORS.primary}
              style={styles.sectionIcon}
            />
            <Text allowFontScaling={false} style={styles.cardTitle}>
              Currently Playing
            </Text>
          </View>
          {activeMatches.length === 0 ? (
            <Text allowFontScaling={false} style={styles.muted}>
              No matches on tables right now.
            </Text>
          ) : (
            <>
              <View style={styles.tileGrid}>
                {shownMatches.map((m) => (
                  <View key={m.id} style={styles.tileCell}>
                    <ActiveTile m={m} />
                  </View>
                ))}
              </View>
              {activeMatches.length > 4 && (
                <TouchableOpacity
                  onPress={() => setShowAllMatches((v) => !v)}
                  activeOpacity={0.7}
                >
                  <Text allowFontScaling={false} style={styles.link}>
                    {showAllMatches
                      ? "Show Less"
                      : `View More Matches (${activeMatches.length - 4}) ›`}
                  </Text>
                </TouchableOpacity>
              )}
            </>
          )}
        </View>
      )}

      {/* Schedule (was "Up Next") — same authoritative queue ordering */}
      {live && (
        <View style={styles.card}>
          <View style={styles.sectionHead}>
            <Ionicons
              name="list"
              size={webMs(16)}
              color={COLORS.primary}
              style={styles.sectionIcon}
            />
            <Text allowFontScaling={false} style={styles.cardTitle}>
              Schedule
            </Text>
            <Text allowFontScaling={false} style={styles.sectionSub}>
              {`· ${modeLabel(autoAssignMode)}`}
            </Text>
          </View>
          {upNext.length === 0 ? (
            <Text allowFontScaling={false} style={styles.muted}>
              No matches are ready to be scheduled yet.
            </Text>
          ) : (
            <>
              <View style={styles.schedGrid}>
                {upNext.slice(0, 8).map((q, i) => (
                  <View key={q.match.id} style={styles.schedCell}>
                    <View style={styles.schedCard}>
                      <View style={styles.schedTop}>
                        {i === 0 ? (
                          <View style={styles.nextUpBadge}>
                            <Text allowFontScaling={false} style={styles.nextUpText}>
                              NEXT UP
                            </Text>
                          </View>
                        ) : (
                          <Text allowFontScaling={false} style={styles.schedNum}>
                            {`#${i + 1}`}
                          </Text>
                        )}
                        <Text
                          allowFontScaling={false}
                          style={styles.schedLoc}
                          numberOfLines={1}
                        >
                          {q.location}
                        </Text>
                      </View>
                      <View style={styles.schedMatch}>
                        <Text
                          allowFontScaling={false}
                          style={styles.schedName}
                          numberOfLines={1}
                        >
                          {q.match.p1Name ?? "TBD"}
                        </Text>
                        <Text allowFontScaling={false} style={styles.schedVs}>
                          vs
                        </Text>
                        <Text
                          allowFontScaling={false}
                          style={[styles.schedName, styles.schedNameRight]}
                          numberOfLines={1}
                        >
                          {q.match.p2Name ?? "TBD"}
                        </Text>
                      </View>
                    </View>
                  </View>
                ))}
              </View>
              {upNext.length > 8 && (
                <Text allowFontScaling={false} style={styles.muted}>
                  {`+${upNext.length - 8} more scheduled`}
                </Text>
              )}
              <TouchableOpacity onPress={onOpenMatches} activeOpacity={0.7}>
                <Text allowFontScaling={false} style={styles.link}>
                  View bracket ›
                </Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      )}

      {/* Player Leaders */}
      {leaders.length > 0 && (
        <View style={styles.card}>
          <View style={styles.sectionHead}>
            <Ionicons
              name="podium"
              size={webMs(16)}
              color={COLORS.primary}
              style={styles.sectionIcon}
            />
            <Text allowFontScaling={false} style={styles.cardTitle}>
              Player Leaders
            </Text>
          </View>
          {leaders.map((p, i) => {
            const playing =
              p.id != null && playingRegIds.has(p.id) && !p.eliminated;
            return (
              <View key={p.id} style={styles.leaderRow}>
                <Text allowFontScaling={false} style={styles.leaderRank}>
                  {i + 1}
                </Text>
                <View style={styles.leaderMain}>
                  <Text
                    allowFontScaling={false}
                    style={[
                      styles.leaderName,
                      p.eliminated && styles.dimName,
                    ]}
                    numberOfLines={1}
                  >
                    {p.name}
                  </Text>
                  <Text allowFontScaling={false} style={styles.leaderRec}>
                    <Text style={styles.win}>{winsOf(p)}</Text>
                    <Text style={styles.recSep}> - </Text>
                    <Text style={styles.loss}>{lossesOf(p)}</Text>
                  </Text>
                </View>
                {p.eliminated ? (
                  <Text allowFontScaling={false} style={styles.statusOut}>
                    Eliminated
                  </Text>
                ) : playing ? (
                  <Text allowFontScaling={false} style={styles.statusPlaying}>
                    Playing
                  </Text>
                ) : (
                  <Text allowFontScaling={false} style={styles.statusIn}>
                    Still In
                  </Text>
                )}
              </View>
            );
          })}
          <TouchableOpacity onPress={onOpenPlayers} activeOpacity={0.7}>
            <Text allowFontScaling={false} style={styles.link}>
              View all players ›
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Recent Activity */}
      {events.length > 0 && (
        <View style={styles.card}>
          <View style={styles.sectionHead}>
            <Ionicons
              name="pulse"
              size={webMs(16)}
              color={COLORS.primary}
              style={styles.sectionIcon}
            />
            <Text allowFontScaling={false} style={styles.cardTitle}>
              Recent Activity
            </Text>
          </View>
          {events.slice(0, 10).map((e) => {
            const f = formatTournamentEvent(e);
            return (
              <View key={e.id} style={styles.actRow}>
                <View
                  style={[styles.actDot, { backgroundColor: toneColor(f.tone) }]}
                />
                <View style={styles.actBody}>
                  <Text allowFontScaling={false} style={styles.actTitle}>
                    {f.title}
                  </Text>
                  {!!f.detail && (
                    <Text
                      allowFontScaling={false}
                      style={styles.actDetail}
                      numberOfLines={1}
                    >
                      {f.detail}
                    </Text>
                  )}
                </View>
                <Text allowFontScaling={false} style={styles.actTime}>
                  {eventClock(e.created_at)}
                </Text>
              </View>
            );
          })}
        </View>
      )}
    </>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: webSc(RADIUS.lg),
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: webSc(SPACING.md),
    marginBottom: webSc(SPACING.md),
  },
  cardTitle: {
    fontSize: webMs(FONT_SIZES.sm),
    fontWeight: "800",
    color: COLORS.text,
    marginBottom: webSc(SPACING.sm),
  },
  sectionHead: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: webSc(SPACING.sm),
  },
  sectionIcon: { marginRight: webSc(SPACING.xs) },
  sectionSub: {
    fontSize: webMs(FONT_SIZES.xs),
    color: COLORS.textMuted,
    fontWeight: "700",
    marginLeft: webSc(SPACING.xs),
    marginBottom: webSc(SPACING.sm),
  },
  muted: {
    fontSize: webMs(FONT_SIZES.sm),
    color: COLORS.textMuted,
    paddingVertical: webSc(SPACING.xs),
  },
  link: {
    fontSize: webMs(FONT_SIZES.sm),
    color: COLORS.primary,
    fontWeight: "700",
    marginTop: webSc(SPACING.sm),
  },

  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: webSc(SPACING.md),
    paddingVertical: webSc(SPACING.xs),
  },
  rowLabel: { fontSize: webMs(FONT_SIZES.sm), color: COLORS.textSecondary },
  rowVal: {
    fontSize: webMs(FONT_SIZES.sm),
    color: COLORS.text,
    fontWeight: "700",
    flexShrink: 1,
    textAlign: "right",
  },

  // Race groups detail
  groupBox: {
    backgroundColor: COLORS.background,
    borderRadius: webSc(RADIUS.md),
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: webSc(SPACING.sm),
    marginTop: webSc(SPACING.xs),
    marginBottom: webSc(SPACING.xs),
    gap: webSc(SPACING.xs),
  },
  groupRow: { flexDirection: "row", alignItems: "center", gap: webSc(SPACING.sm) },
  groupTag: {
    minWidth: webSc(52),
    paddingHorizontal: webSc(SPACING.sm),
    paddingVertical: webSc(3),
    borderRadius: webSc(RADIUS.sm),
    backgroundColor: COLORS.primary + "18",
    borderWidth: 1,
    borderColor: COLORS.primary,
    alignItems: "center",
  },
  groupTagText: {
    fontSize: webMs(FONT_SIZES.xs),
    fontWeight: "800",
    color: COLORS.primary,
  },
  groupRange: {
    flex: 1,
    fontSize: webMs(FONT_SIZES.sm),
    color: COLORS.text,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  groupRace: {
    fontSize: webMs(FONT_SIZES.xs),
    color: COLORS.textSecondary,
    fontWeight: "700",
  },

  // KPI row
  kpiRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: webSc(SPACING.sm),
    marginBottom: webSc(SPACING.md),
  },
  kpi: {
    flexGrow: 1,
    flexBasis: isWeb ? 0 : ("46%" as any),
    minWidth: webSc(120),
    backgroundColor: COLORS.surface,
    borderRadius: webSc(RADIUS.md),
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: webSc(SPACING.md),
    paddingHorizontal: webSc(SPACING.md),
    alignItems: "center",
  },
  kpiValue: {
    fontSize: webMs(FONT_SIZES.xl),
    fontWeight: "900",
    color: COLORS.primary,
    fontVariant: ["tabular-nums"],
  },
  kpiLabel: {
    fontSize: webMs(FONT_SIZES.xs),
    color: COLORS.textSecondary,
    marginTop: webSc(2),
    fontWeight: "600",
  },

  // Currently Playing tiles
  tileGrid: { flexDirection: "row", flexWrap: "wrap", gap: webSc(SPACING.sm) },
  tileCell: { flexGrow: 1, flexBasis: isWeb ? ("47%" as any) : ("100%" as any), minWidth: webSc(220) },
  tile: {
    backgroundColor: COLORS.background,
    borderRadius: webSc(RADIUS.md),
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: webSc(SPACING.sm),
    gap: webSc(SPACING.xs),
  },
  tileHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  tileTable: {
    fontSize: webMs(FONT_SIZES.sm),
    fontWeight: "800",
    color: COLORS.primary,
    flexShrink: 1,
  },
  tileLiveWrap: { flexDirection: "row", alignItems: "center", gap: webSc(4) },
  liveDot: {
    width: webSc(7),
    height: webSc(7),
    borderRadius: webSc(4),
    backgroundColor: COLORS.success,
  },
  tileElapsed: {
    fontSize: webMs(FONT_SIZES.xs),
    fontWeight: "800",
    color: COLORS.success,
    fontVariant: ["tabular-nums"],
  },
  tileWaiting: {
    fontSize: webMs(FONT_SIZES.xs),
    fontWeight: "700",
    color: COLORS.textMuted,
  },
  tileMatch: { flexDirection: "row", alignItems: "center", gap: webSc(SPACING.xs) },
  tileName: {
    flex: 1,
    fontSize: webMs(FONT_SIZES.sm),
    fontWeight: "700",
    color: COLORS.text,
  },
  tileNameRight: { textAlign: "right" },
  tileVs: { fontSize: webMs(FONT_SIZES.xs), color: COLORS.textMuted, fontWeight: "700" },
  tileMeta: { fontSize: webMs(FONT_SIZES.xs), color: COLORS.textSecondary },
  // Scores on the matchup row — plain, prominent numbers (no box/pill).
  scoreWrap: { flexDirection: "row", alignItems: "center", gap: webSc(SPACING.sm) },
  scoreText: {
    minWidth: webSc(18),
    textAlign: "center",
    fontSize: webMs(FONT_SIZES.xl),
    fontWeight: "900",
    color: COLORS.text,
    fontVariant: ["tabular-nums"],
  },
  // Per-player race targets under the matchup
  raceRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  raceText: { fontSize: webMs(FONT_SIZES.xs), color: COLORS.textSecondary, fontWeight: "700", flex: 1 },
  raceTextRight: { textAlign: "right" },

  // Schedule cards
  schedGrid: { flexDirection: "row", flexWrap: "wrap", gap: webSc(SPACING.sm) },
  schedCell: { flexGrow: 1, flexBasis: isWeb ? ("47%" as any) : ("100%" as any), minWidth: webSc(220) },
  schedCard: {
    backgroundColor: COLORS.background,
    borderRadius: webSc(RADIUS.md),
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: webSc(SPACING.sm),
    gap: webSc(SPACING.xs),
  },
  schedTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: webSc(SPACING.sm) },
  nextUpBadge: {
    backgroundColor: COLORS.primary,
    borderRadius: webSc(RADIUS.sm),
    paddingHorizontal: webSc(SPACING.sm),
    paddingVertical: webSc(2),
  },
  nextUpText: { fontSize: webMs(9), fontWeight: "900", color: COLORS.white, letterSpacing: 0.5 },
  schedNum: { fontSize: webMs(FONT_SIZES.sm), fontWeight: "900", color: COLORS.primary, fontVariant: ["tabular-nums"] },
  schedLoc: { fontSize: webMs(FONT_SIZES.xs), color: COLORS.textMuted, fontWeight: "700", flexShrink: 1, textAlign: "right" },
  schedMatch: { flexDirection: "row", alignItems: "center", gap: webSc(SPACING.xs) },
  schedName: { flex: 1, fontSize: webMs(FONT_SIZES.sm), fontWeight: "700", color: COLORS.text },
  schedNameRight: { textAlign: "right" },
  schedVs: { fontSize: webMs(FONT_SIZES.xs), color: COLORS.textMuted, fontWeight: "700" },

  // Up Next
  upRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: webSc(SPACING.sm),
    paddingVertical: webSc(SPACING.xs),
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  upNum: {
    fontSize: webMs(FONT_SIZES.sm),
    fontWeight: "800",
    color: COLORS.primary,
    width: webSc(22),
    textAlign: "center",
    fontVariant: ["tabular-nums"],
  },
  upBody: { flex: 1, minWidth: 0 as any },
  upName: { fontSize: webMs(FONT_SIZES.sm), fontWeight: "700", color: COLORS.text },
  upMeta: { fontSize: webMs(FONT_SIZES.xs), color: COLORS.textMuted, marginTop: webSc(1) },

  // Leaders
  leaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: webSc(SPACING.sm),
    paddingVertical: webSc(SPACING.xs),
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  leaderRank: {
    fontSize: webMs(FONT_SIZES.sm),
    fontWeight: "900",
    color: COLORS.textSecondary,
    width: webSc(22),
    textAlign: "center",
    fontVariant: ["tabular-nums"],
  },
  leaderMain: {
    flex: 1,
    minWidth: 0 as any,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: webSc(SPACING.sm),
  },
  leaderName: { flex: 1, fontSize: webMs(FONT_SIZES.sm), fontWeight: "700", color: COLORS.text },
  dimName: { color: COLORS.textMuted },
  leaderRec: { fontSize: webMs(FONT_SIZES.sm), fontWeight: "800", fontVariant: ["tabular-nums"] },
  win: { color: COLORS.success },
  loss: { color: COLORS.error },
  recSep: { color: COLORS.textMuted },
  statusIn: { fontSize: webMs(FONT_SIZES.xs), fontWeight: "800", color: COLORS.success },
  statusPlaying: { fontSize: webMs(FONT_SIZES.xs), fontWeight: "800", color: COLORS.primary },
  statusOut: { fontSize: webMs(FONT_SIZES.xs), fontWeight: "800", color: COLORS.error },

  // Entry note
  poolNote: {
    flexDirection: "row",
    alignItems: "center",
    gap: webSc(SPACING.xs),
    marginTop: webSc(SPACING.sm),
  },
  poolText: { fontSize: webMs(FONT_SIZES.xs), color: COLORS.textMuted },

  // Recent Activity
  actRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: webSc(SPACING.sm),
    paddingVertical: webSc(SPACING.xs),
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  actDot: { width: webSc(8), height: webSc(8), borderRadius: webSc(4) },
  actBody: { flex: 1, minWidth: 0 as any },
  actTitle: { fontSize: webMs(FONT_SIZES.sm), fontWeight: "700", color: COLORS.text },
  actDetail: { fontSize: webMs(FONT_SIZES.xs), color: COLORS.textSecondary, marginTop: webSc(1) },
  actTime: { fontSize: webMs(FONT_SIZES.xs), color: COLORS.textMuted },
});
