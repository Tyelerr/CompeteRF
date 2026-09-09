// src/views/components/profile/ChipTournamentHubView.tsx
// Profile "Tournament View" for a player in a LIVE CHIP tournament (winner-stays
// chip queue). Focuses on live status + performance. Headline = chips remaining,
// status, queue position. Secondary stats sit lower / in expandable sections.
// For scotch doubles everything is team-level (both names, combined Fargo, team
// record). Read-only; data comes from usePlayerChipTournament.

import { ReactNode, useEffect, useRef, useState } from "react";
import { Animated, LayoutAnimation, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, UIManager, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "../../../theme/colors";
import { RADIUS, SPACING } from "../../../theme/spacing";
import { FONT_SIZES } from "../../../theme/typography";
import { chipStatusColor } from "../../../utils/chip-colors";
import { formatElapsedClock } from "../../../utils/formatters";
import { moderateScale, scale } from "../../../utils/scaling";
import {
  ChipHubTable,
  ChipPlayerHub,
  ChipStatus,
} from "../../../viewmodels/hooks/use.player.chip.tournament";

const isWeb = Platform.OS === "web";
const wxMs = (v: number) => (isWeb ? v : moderateScale(v));
const wxSc = (v: number) => (isWeb ? v : scale(v));

// LayoutAnimation needs to be opted-in on old-arch Android; harmless elsewhere.
if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// Title Case a header caption ("RECENT MATCHES" → "Recent Matches") for a11y.
const titleCase = (s: string) =>
  s.toLowerCase().split(" ").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

const STATUS_META: Record<ChipStatus, { label: string; color: string }> = {
  waiting: { label: "Waiting", color: COLORS.textSecondary },
  next: { label: "Next Up", color: COLORS.warning },
  playing: { label: "Playing", color: COLORS.success },
  eliminated: { label: "Eliminated", color: COLORS.error },
};

// Strict zero-padded HH:MM:SS from the shared formatter (matches Admin exactly);
// keeps the em-dash for missing/zero durations. Was "Xh Ym" / "m:ss" before.
const fmtDur = (ms: number | null): string =>
  ms == null || ms <= 0 ? "—" : formatElapsedClock(ms);

const Stat = ({ label, value, tint }: { label: string; value: string; tint?: string }) => (
  <View style={styles.stat}>
    <Text allowFontScaling={false} style={[styles.statVal, tint ? { color: tint } : null]}>{value}</Text>
    <Text allowFontScaling={false} numberOfLines={2} style={styles.statLabel}>{label}</Text>
  </View>
);

// Win-loss record with wins green and losses red (dash stays neutral). `style` is
// the base text style (size/weight); the spans only override color.
const WinLoss = ({
  wins,
  losses,
  style,
}: {
  wins: number;
  losses: number;
  style?: object;
}) => (
  <Text allowFontScaling={false} style={style}>
    <Text style={{ color: COLORS.success }}>{wins}</Text>
    <Text>{" - "}</Text>
    <Text style={{ color: COLORS.error }}>{losses}</Text>
  </Text>
);

const Section = ({
  title,
  right,
  children,
}: {
  title: string;
  right?: ReactNode;
  children: ReactNode;
}) => (
  <View style={styles.section}>
    <View style={styles.sectionHead}>
      <Text allowFontScaling={false} style={styles.sectionTitle}>{title}</Text>
      {right}
    </View>
    {children}
  </View>
);

const Collapsible = ({
  title,
  count,
  children,
  startOpen,
}: {
  title: string;
  count?: number;
  children: ReactNode;
  startOpen?: boolean;
}) => {
  const [open, setOpen] = useState(!!startOpen);
  const rot = useRef(new Animated.Value(open ? 1 : 0)).current;

  const toggle = () => {
    // Content slides open/closed; chevron spins in sync.
    LayoutAnimation.configureNext(
      LayoutAnimation.create(180, LayoutAnimation.Types.easeInEaseOut, LayoutAnimation.Properties.opacity),
    );
    Animated.timing(rot, {
      toValue: open ? 0 : 1,
      duration: 180,
      useNativeDriver: true,
    }).start();
    setOpen((o) => !o);
  };

  const spin = rot.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "180deg"] });
  const pretty = titleCase(title);

  return (
    <View style={styles.section}>
      <Pressable
        style={({ pressed }) => [styles.collapseHead, pressed && styles.collapseHeadPressed]}
        onPress={toggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${open ? "Collapse" : "Expand"} ${pretty}`}
        accessibilityHint={open ? "Hides this section" : "Shows this section"}
      >
        <Text allowFontScaling={false} style={styles.sectionTitle}>
          {title}{count != null ? `  ·  ${count}` : ""}
        </Text>
        <View style={styles.collapseRight}>
          <Text allowFontScaling={false} style={styles.collapseLabel}>{open ? "Hide" : "Show"}</Text>
          <View style={styles.chevronBox}>
            <Animated.View style={{ transform: [{ rotate: spin }] }}>
              <Ionicons name="chevron-down" size={wxMs(18)} color={COLORS.primarySoft} />
            </Animated.View>
          </View>
        </View>
      </Pressable>
      {open && <View>{children}</View>}
    </View>
  );
};

// Chip Leaderboard preview/full-view sizing — mirrors the Queue preview + View
// Full pattern. Inline shows the top 10; the full modal renders in incremental
// batches so a large field never renders every row at once.
const LB_PREVIEW = 10;
const LB_PAGE = 30;
const TABLES_PREVIEW = 2;

// Read-only table row for the Profile hub — mirrors the spectator TableCard (holder
// = a-side, aStreak = win streak) with NO admin controls (no ⋮, no Start Match).
const HubTableRow = ({ t, now }: { t: ChipHubTable; now: number }) => {
  const elapsed = t.live && t.startedAt ? now - new Date(t.startedAt).getTime() : 0;
  const status = t.live
    ? `Live ${fmtDur(elapsed)}`
    : t.closing
      ? "Closing after match"
      : t.waitingText ?? "";
  return (
    <View style={styles.htCard}>
      <View style={styles.htTop}>
        <Text allowFontScaling={false} style={styles.htLabel} numberOfLines={1}>
          {t.label}{t.isStream ? "  🔴" : ""}
        </Text>
        <Text allowFontScaling={false} style={[styles.htStatus, t.live && styles.htStatusLive]} numberOfLines={1}>
          {status}
        </Text>
      </View>
      {t.aName ? (
        <View style={styles.htMatch}>
          <View style={styles.htSide}>
            <Text allowFontScaling={false} style={styles.htName} numberOfLines={1}>{t.aName}</Text>
            <Text allowFontScaling={false} style={styles.htMeta} numberOfLines={1}>
              {t.aChips != null ? <Text style={{ color: chipStatusColor(t.aChips, t.aStartChips) }}>{t.aChips} chips</Text> : ""}
              {t.aStreak != null && t.aStreak > 0 ? `  ·  🔥 ${t.aStreak}` : ""}
            </Text>
          </View>
          <Text allowFontScaling={false} style={styles.htVs}>VS</Text>
          <View style={[styles.htSide, styles.htSideRight]}>
            {t.bName ? (
              <>
                <Text allowFontScaling={false} style={styles.htName} numberOfLines={1}>{t.bName}</Text>
                <Text allowFontScaling={false} style={styles.htMeta} numberOfLines={1}>
                  {t.bChips != null ? <Text style={{ color: chipStatusColor(t.bChips, t.bStartChips) }}>{t.bChips} chips</Text> : ""}
                </Text>
              </>
            ) : (
              <Text allowFontScaling={false} style={styles.htMeta} numberOfLines={1}>Waiting for a challenger</Text>
            )}
          </View>
        </View>
      ) : (
        <Text allowFontScaling={false} style={styles.htMeta}>Open — no team assigned</Text>
      )}
    </View>
  );
};

export const ChipTournamentHubView = ({
  hub,
  onOpenTournament,
}: {
  hub: ChipPlayerHub;
  onOpenTournament: (tournamentId: number) => void;
}) => {
  const [now, setNow] = useState(Date.now());
  const [queueOpen, setQueueOpen] = useState(false);
  const [leaderboardOpen, setLeaderboardOpen] = useState(false);
  const [lbCount, setLbCount] = useState(LB_PAGE);
  const [tablesOpen, setTablesOpen] = useState(false);
  // Reset the full-leaderboard window on close (next open starts at the top batch);
  // avoids a setState-in-effect while keeping live polling updates intact.
  const closeLeaderboard = () => {
    setLbCount(LB_PAGE);
    setLeaderboardOpen(false);
  };
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const st = STATUS_META[hub.status];
  const entrantWord = hub.isTeam ? "teams" : "players";

  return (
    <View style={styles.root}>
      {/* ── Headline: status + chips + queue/table ───────────────────────── */}
      <TouchableOpacity
        style={styles.hero}
        activeOpacity={0.9}
        onPress={() => onOpenTournament(hub.tournamentId)}
      >
        <View style={styles.heroTop}>
          <Text allowFontScaling={false} style={styles.heroName} numberOfLines={1}>
            {hub.tournamentName}
          </Text>
          <View style={[styles.statusPill, { borderColor: st.color }]}>
            <View style={[styles.statusDot, { backgroundColor: st.color }]} />
            <Text allowFontScaling={false} style={[styles.statusText, { color: st.color }]}>
              {st.label}
            </Text>
          </View>
        </View>

        {hub.isTeam && (
          <Text allowFontScaling={false} style={styles.heroTeam} numberOfLines={1}>
            {hub.myName}{hub.myFargo != null ? `  ·  Team Fargo ${hub.myFargo}` : ""}
          </Text>
        )}

        <View style={styles.heroRow}>
          <View style={styles.chipsBox}>
            <Text allowFontScaling={false} style={[styles.chipsNum, { color: chipStatusColor(hub.chips, hub.startChips) }]}>{hub.chips}</Text>
            <Text allowFontScaling={false} style={styles.chipsLabel}>Chips Remaining</Text>
          </View>
          <View style={styles.heroMeta}>
            {hub.status === "playing" ? (
              <>
                <Text allowFontScaling={false} style={styles.metaBig}>
                  {hub.tableLabel ?? "At the table"}
                </Text>
                {hub.isStreamed && (
                  <View style={styles.streamBadge}>
                    <Text allowFontScaling={false} style={styles.streamText}>🔴 On stream</Text>
                  </View>
                )}
              </>
            ) : hub.queuePosition != null ? (
              <>
                <Text allowFontScaling={false} style={styles.metaBig}>#{hub.queuePosition}</Text>
                <Text allowFontScaling={false} style={styles.metaSub}>In Queue</Text>
              </>
            ) : (
              <Text allowFontScaling={false} style={styles.metaSub}>
                {hub.status === "eliminated" ? "Out of the running" : "—"}
              </Text>
            )}
          </View>
        </View>

        {hub.youreNext && (
          <View style={styles.nextBanner}>
            <Text allowFontScaling={false} style={styles.nextText}>
              You’re next after the current match finishes.
            </Text>
          </View>
        )}
      </TouchableOpacity>

      {/* ── Standing summary ─────────────────────────────────────────────── */}
      <View style={styles.summaryRow}>
        <Stat label={`${entrantWord} left`} value={String(hub.playersRemaining)} />
        <View style={styles.summaryDivider} />
        <Stat
          label="chip rank"
          value={hub.chipRank != null ? `#${hub.chipRank}` : "—"}
          tint={COLORS.primaryLight}
        />
        <View style={styles.summaryDivider} />
        <View style={styles.stat}>
          <WinLoss wins={hub.wins} losses={hub.losses} style={styles.statVal} />
          <Text allowFontScaling={false} numberOfLines={2} style={styles.statLabel}>record</Text>
        </View>
      </View>

      {/* ── Queue preview (expandable) ───────────────────────────────────── */}
      <Collapsible title="UP NEXT IN THE QUEUE" count={hub.fullQueue.length}>
        {hub.queuePreview.length === 0 ? (
          <Text allowFontScaling={false} style={styles.emptyLine}>The queue is empty right now.</Text>
        ) : (
          <View style={styles.card}>
            {hub.queuePreview.map((q, i) => (
              <View key={q.id}>
                {i > 0 && <View style={styles.divider} />}
                <View style={[styles.qRow, q.isMe && styles.qRowMe]}>
                  <Text allowFontScaling={false} style={[styles.qPos, q.isMe && styles.qMeText]}>{i + 1}</Text>
                  <View style={{ flex: 1 }}>
                    <Text allowFontScaling={false} style={[styles.qName, q.isMe && styles.qMeText]} numberOfLines={1}>
                      {q.name}{q.isMe ? "  (you)" : ""}
                    </Text>
                    {q.roundStatus && (
                      <Text allowFontScaling={false} style={[styles.qRoundStatus, { color: q.roundStatus === "waiting" ? COLORS.primary : COLORS.textMuted }]} numberOfLines={1}>
                        {q.roundStatus === "waiting" ? "Waiting for turn" : "✓ Played this round"}
                      </Text>
                    )}
                  </View>
                  <Text allowFontScaling={false} style={[styles.qChips, { color: chipStatusColor(q.chips, q.startChips) }]}>{q.chips} chips</Text>
                </View>
              </View>
            ))}
            {hub.fullQueue.length > hub.queuePreview.length && (
              <>
                <View style={styles.divider} />
                <Pressable
                  style={({ pressed }) => [styles.qViewAll, pressed && { opacity: 0.5 }]}
                  onPress={() => setQueueOpen(true)}
                >
                  <Text allowFontScaling={false} style={styles.qViewAllText}>View Full Queue ({hub.fullQueue.length})</Text>
                  <Text allowFontScaling={false} style={styles.qViewAllChevron}>›</Text>
                </Pressable>
              </>
            )}
          </View>
        )}
      </Collapsible>

      {/* Full queue (read-only) */}
      <Modal visible={queueOpen} transparent animationType="fade" onRequestClose={() => setQueueOpen(false)}>
        <View style={styles.fqRoot}>
          <Pressable style={styles.fqDim} onPress={() => setQueueOpen(false)} />
          <View style={styles.fqCard}>
            <View style={styles.fqHeader}>
              <Text allowFontScaling={false} style={styles.fqTitle}>Queue ({hub.fullQueue.length})</Text>
              <TouchableOpacity onPress={() => setQueueOpen(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Text allowFontScaling={false} style={styles.fqDone}>Done</Text>
              </TouchableOpacity>
            </View>
            {hub.fullQueue.length === 0 ? (
              <Text allowFontScaling={false} style={[styles.emptyLine, { padding: wxSc(SPACING.lg) }]}>The queue is empty right now.</Text>
            ) : (
              <ScrollView style={{ maxHeight: "100%" }} contentContainerStyle={{ paddingBottom: wxSc(SPACING.sm) }} showsVerticalScrollIndicator>
                {hub.fullQueue.map((q, i) => (
                  <View key={q.id} style={[styles.fqRow, q.isMe && styles.qRowMe, i > 0 && styles.fqRowDiv]}>
                    <Text allowFontScaling={false} style={[styles.qPos, q.isMe && styles.qMeText]}>{i + 1}</Text>
                    <View style={{ flex: 1 }}>
                      <Text allowFontScaling={false} style={[styles.qName, q.isMe && styles.qMeText]} numberOfLines={1}>
                        {q.name}{q.isMe ? "  (you)" : ""}
                      </Text>
                      {q.roundStatus && (
                        <Text allowFontScaling={false} style={[styles.qRoundStatus, { color: q.roundStatus === "waiting" ? COLORS.primary : COLORS.textMuted }]} numberOfLines={1}>
                          {q.roundStatus === "waiting" ? "Waiting for turn" : "✓ Played this round"}
                        </Text>
                      )}
                    </View>
                    <Text allowFontScaling={false} style={[styles.qChips, { color: chipStatusColor(q.chips, q.startChips) }]}>{q.chips} chips</Text>
                  </View>
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* ── Live matches (ALWAYS VISIBLE — critical live context: my match/opponent/
          timer among all live matches; the collapsed Tables section is NOT a
          replacement for this). Shown whenever any match is live. ─────────────── */}
      {hub.liveMatches.length > 0 && (
        <Section title="LIVE NOW">
          <View style={styles.card}>
            {hub.liveMatches.map((m, i) => {
              const elapsed = now - new Date(m.startedAt).getTime();
              return (
                <View key={m.id}>
                  {i > 0 && <View style={styles.divider} />}
                  <View style={styles.liveRow}>
                    <View style={{ flex: 1 }}>
                      <Text allowFontScaling={false} style={styles.liveNames} numberOfLines={1}>
                        {m.aName}  vs  {m.bName}
                      </Text>
                      <Text allowFontScaling={false} style={styles.liveMeta}>
                        {m.tableLabel ?? "Table"}{m.isStream ? "  ·  🔴 stream" : ""}
                      </Text>
                    </View>
                    <Text allowFontScaling={false} style={styles.liveTimer}>{fmtDur(elapsed)}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        </Section>
      )}

      {/* ── Performance (expandable) ─────────────────────────────────────── */}
      {/* Value-communicates-status: no "Underperforming/Overperforming" badge —
          the vs Fargo value itself is colored (green +, red −, gray 0). */}
      <Collapsible title="PERFORMANCE">
        <View style={styles.card}>
          {hub.perf && hub.perf.rating != null ? (
            <View style={styles.perfRow}>
              <Stat label="Performance Rating" value={String(hub.perf.rating)} />
              <View style={styles.summaryDivider} />
              <Stat
                label="vs Fargo"
                value={
                  hub.perf.delta != null
                    ? `${hub.perf.delta > 0 ? "+" : ""}${hub.perf.delta}`
                    : "—"
                }
                tint={
                  hub.perf.delta == null
                    ? COLORS.textSecondary
                    : hub.perf.delta > 0
                      ? COLORS.success
                      : hub.perf.delta < 0
                        ? COLORS.error
                        : COLORS.textSecondary
                }
              />
              <View style={styles.summaryDivider} />
              <Stat
                label="Avg Opp Fargo"
                value={hub.perf.avgOpponentFargo != null ? String(hub.perf.avgOpponentFargo) : "—"}
              />
            </View>
          ) : (
            <Text allowFontScaling={false} style={styles.perfHint}>
              Play a few matches to see your Fargo performance.
            </Text>
          )}

          {hub.perf && hub.perf.rating != null && <View style={styles.divider} />}

          <View style={styles.perfRow}>
            <Stat label="Win %" value={hub.matchesPlayed ? `${Math.round(hub.winPct * 100)}%` : "—"} tint={COLORS.success} />
            <View style={styles.summaryDivider} />
            <Stat
              label={hub.streakType === "loss" ? "Loss streak" : "Win streak"}
              value={hub.streak ? String(hub.streak) : "—"}
              tint={hub.streakType === "loss" ? COLORS.error : COLORS.success}
            />
            <View style={styles.summaryDivider} />
            <Stat label="Matches" value={String(hub.matchesPlayed)} />
            <View style={styles.summaryDivider} />
            <Stat label="Avg time" value={fmtDur(hub.avgMatchMs)} />
          </View>
        </View>
      </Collapsible>

      {/* ── Tables (read-only, expandable) ───────────────────────────────── */}
      <Collapsible title="TABLES" count={hub.tables.length}>
        {hub.tables.length === 0 ? (
          <Text allowFontScaling={false} style={styles.emptyLine}>No active tables right now.</Text>
        ) : (
          <View>
            {hub.tables.slice(0, TABLES_PREVIEW).map((t) => (
              <HubTableRow key={t.id} t={t} now={now} />
            ))}
            {hub.tables.length > TABLES_PREVIEW && (
              <Pressable
                style={({ pressed }) => [styles.qViewAll, pressed && { opacity: 0.5 }]}
                onPress={() => setTablesOpen(true)}
              >
                <Text allowFontScaling={false} style={styles.qViewAllText}>View All Tables ({hub.tables.length})</Text>
                <Text allowFontScaling={false} style={styles.qViewAllChevron}>›</Text>
              </Pressable>
            )}
          </View>
        )}
      </Collapsible>

      {/* Full tables (read-only, live-updating) */}
      <Modal visible={tablesOpen} transparent animationType="fade" onRequestClose={() => setTablesOpen(false)}>
        <View style={styles.fqRoot}>
          <Pressable style={styles.fqDim} onPress={() => setTablesOpen(false)} />
          <View style={styles.fqCard}>
            <View style={styles.fqHeader}>
              <Text allowFontScaling={false} style={styles.fqTitle}>Tables ({hub.tables.length})</Text>
              <TouchableOpacity onPress={() => setTablesOpen(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Text allowFontScaling={false} style={styles.fqDone}>Done</Text>
              </TouchableOpacity>
            </View>
            {hub.tables.length === 0 ? (
              <Text allowFontScaling={false} style={[styles.emptyLine, { padding: wxSc(SPACING.lg) }]}>No active tables right now.</Text>
            ) : (
              <ScrollView style={{ maxHeight: "100%" }} contentContainerStyle={{ padding: wxSc(SPACING.sm) }} showsVerticalScrollIndicator>
                {hub.tables.map((t) => (
                  <HubTableRow key={t.id} t={t} now={now} />
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* ── Chip leaderboard (expandable) ────────────────────────────────── */}
      <Collapsible title="CHIP LEADERBOARD" count={hub.playersRemaining}>
        {hub.leaderboard.length === 0 ? (
          <Text allowFontScaling={false} style={styles.emptyLine}>No standings yet.</Text>
        ) : (
          <View style={styles.card}>
            {hub.leaderboard.slice(0, LB_PREVIEW).map((l, i) => (
              <View key={l.id}>
                {i > 0 && <View style={styles.divider} />}
                <View style={[styles.lbRow, l.isMe && styles.qRowMe]}>
                  <Text allowFontScaling={false} style={[styles.lbRank, l.rank <= 3 && styles.lbRankTop]}>#{l.rank}</Text>
                  <Text allowFontScaling={false} style={[styles.lbName, l.isMe && styles.qMeText]} numberOfLines={1}>
                    {l.name}{l.isMe ? "  (you)" : ""}
                  </Text>
                  <WinLoss wins={l.wins} losses={l.losses} style={styles.lbRec} />
                  <Text allowFontScaling={false} style={[styles.lbChips, { color: chipStatusColor(l.chips, l.startChips) }]}>{l.chips}</Text>
                </View>
              </View>
            ))}
            {hub.fullLeaderboard.length > LB_PREVIEW && (
              <>
                <View style={styles.divider} />
                <Pressable
                  style={({ pressed }) => [styles.qViewAll, pressed && { opacity: 0.5 }]}
                  onPress={() => setLeaderboardOpen(true)}
                >
                  <Text allowFontScaling={false} style={styles.qViewAllText}>View Full Leaderboard ({hub.fullLeaderboard.length})</Text>
                  <Text allowFontScaling={false} style={styles.qViewAllChevron}>›</Text>
                </Pressable>
              </>
            )}
          </View>
        )}
      </Collapsible>

      {/* Full leaderboard (read-only) — reuses the Full Queue modal shell; renders
          in incremental batches (LB_PAGE) so a large field never draws all at once. */}
      <Modal visible={leaderboardOpen} transparent animationType="fade" onRequestClose={closeLeaderboard}>
        <View style={styles.fqRoot}>
          <Pressable style={styles.fqDim} onPress={closeLeaderboard} />
          <View style={styles.fqCard}>
            <View style={styles.fqHeader}>
              <Text allowFontScaling={false} style={styles.fqTitle}>Leaderboard ({hub.fullLeaderboard.length})</Text>
              <TouchableOpacity onPress={closeLeaderboard} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Text allowFontScaling={false} style={styles.fqDone}>Done</Text>
              </TouchableOpacity>
            </View>
            {hub.fullLeaderboard.length === 0 ? (
              <Text allowFontScaling={false} style={[styles.emptyLine, { padding: wxSc(SPACING.lg) }]}>No standings yet.</Text>
            ) : (
              <ScrollView style={{ maxHeight: "100%" }} contentContainerStyle={{ paddingBottom: wxSc(SPACING.sm) }} showsVerticalScrollIndicator>
                {hub.fullLeaderboard.slice(0, lbCount).map((l, i) => (
                  <View key={l.id} style={[styles.lbRow, l.isMe && styles.qRowMe, i > 0 && styles.fqRowDiv]}>
                    <Text allowFontScaling={false} style={[styles.lbRank, l.rank <= 3 && styles.lbRankTop]}>#{l.rank}</Text>
                    <Text allowFontScaling={false} style={[styles.lbName, l.isMe && styles.qMeText]} numberOfLines={1}>
                      {l.name}{l.isMe ? "  (you)" : ""}
                    </Text>
                    <WinLoss wins={l.wins} losses={l.losses} style={styles.lbRec} />
                    <Text allowFontScaling={false} style={[styles.lbChips, { color: chipStatusColor(l.chips, l.startChips) }]}>{l.chips}</Text>
                  </View>
                ))}
                {hub.fullLeaderboard.length > lbCount && (
                  <Pressable
                    style={({ pressed }) => [styles.qViewAll, pressed && { opacity: 0.5 }]}
                    onPress={() => setLbCount((c) => c + LB_PAGE)}
                  >
                    <Text allowFontScaling={false} style={styles.qViewAllText}>Load more</Text>
                    <Text allowFontScaling={false} style={styles.qViewAllChevron}>▾</Text>
                  </Pressable>
                )}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* ── Recent history (expandable) ──────────────────────────────────── */}
      <Collapsible title="RECENT MATCHES" count={hub.recentMatches.length}>
        {hub.recentMatches.length === 0 ? (
          <Text allowFontScaling={false} style={styles.emptyLine}>No completed matches yet.</Text>
        ) : (
          <View style={styles.card}>
            {hub.recentMatches.map((r, i) => (
              <View key={r.id}>
                {i > 0 && <View style={styles.divider} />}
                <View style={styles.histRow}>
                  <View style={[styles.wl, r.won ? styles.wlWin : styles.wlLoss]}>
                    <Text allowFontScaling={false} style={styles.wlText}>{r.won ? "W" : "L"}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text allowFontScaling={false} style={styles.histOpp} numberOfLines={1}>
                      vs {r.opponentName}
                    </Text>
                    <Text allowFontScaling={false} style={styles.histMeta}>
                      {r.tableLabel ?? "Table"}{r.durationMs ? `  ·  ${fmtDur(r.durationMs)}` : ""}
                    </Text>
                  </View>
                  <Text allowFontScaling={false} style={[styles.histResult, r.won ? styles.wlWinText : styles.wlLossText]}>
                    {r.won ? "Won" : "Lost"}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </Collapsible>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { width: "100%" },

  hero: {
    marginHorizontal: wxSc(SPACING.md),
    marginTop: wxSc(SPACING.sm),
    backgroundColor: COLORS.backgroundCard,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: wxSc(RADIUS.lg),
    padding: wxSc(SPACING.md),
  },
  heroTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: wxSc(SPACING.sm) },
  heroName: { flex: 1, color: COLORS.text, fontSize: wxMs(FONT_SIZES.md), fontWeight: "800" },
  statusPill: { flexDirection: "row", alignItems: "center", gap: 5, borderWidth: 1, borderRadius: wxSc(RADIUS.full), paddingHorizontal: wxSc(SPACING.sm), paddingVertical: 3 },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { fontSize: wxMs(FONT_SIZES.xs), fontWeight: "800" },
  heroTeam: { color: COLORS.textSecondary, fontSize: wxMs(FONT_SIZES.sm), fontWeight: "600", marginTop: wxSc(SPACING.xs) },

  heroRow: { flexDirection: "row", alignItems: "center", marginTop: wxSc(SPACING.md) },
  chipsBox: { flex: 1 },
  chipsNum: { color: COLORS.primaryLight, fontSize: wxMs(48), fontWeight: "900", lineHeight: wxMs(50) },
  chipsLabel: { color: COLORS.textSecondary, fontSize: wxMs(FONT_SIZES.sm), fontWeight: "600", marginTop: -2 },
  heroMeta: { alignItems: "flex-end", minWidth: wxSc(90) },
  metaBig: { color: COLORS.text, fontSize: wxMs(FONT_SIZES.xl), fontWeight: "900" },
  metaSub: { color: COLORS.textMuted, fontSize: wxMs(FONT_SIZES.xs), fontWeight: "600", marginTop: 1 },
  streamBadge: { marginTop: wxSc(SPACING.xs), backgroundColor: COLORS.error + "22", borderRadius: wxSc(RADIUS.sm), paddingHorizontal: wxSc(SPACING.sm), paddingVertical: 2 },
  streamText: { color: COLORS.error, fontSize: wxMs(FONT_SIZES.xs), fontWeight: "800" },
  nextBanner: { marginTop: wxSc(SPACING.md), backgroundColor: COLORS.warning + "1A", borderRadius: wxSc(RADIUS.md), borderWidth: 1, borderColor: COLORS.warning + "55", paddingHorizontal: wxSc(SPACING.md), paddingVertical: wxSc(SPACING.sm) },
  nextText: { color: COLORS.warning, fontSize: wxMs(FONT_SIZES.sm), fontWeight: "700", textAlign: "center" },

  summaryRow: { flexDirection: "row", alignItems: "center", marginHorizontal: wxSc(SPACING.md), marginTop: wxSc(SPACING.sm), backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: wxSc(RADIUS.lg), paddingVertical: wxSc(SPACING.md) },
  summaryDivider: { width: 1, alignSelf: "stretch", backgroundColor: COLORS.border },
  stat: { flex: 1, alignItems: "center" },
  statVal: { color: COLORS.text, fontSize: wxMs(FONT_SIZES.lg), fontWeight: "900" },
  // Stretch to the full column width so long Title-Case labels WRAP (centered) to a
  // 2nd line instead of overflowing and clipping; minHeight reserves two lines so the
  // three/four columns stay balanced whether a label is one or two lines. No ellipsis.
  statLabel: {
    color: COLORS.textMuted,
    fontSize: wxMs(FONT_SIZES.xs),
    fontWeight: "600",
    marginTop: 2,
    textTransform: "capitalize",
    textAlign: "center",
    alignSelf: "stretch",
    paddingHorizontal: wxSc(2),
    lineHeight: wxMs(FONT_SIZES.xs) + 3,
    minHeight: (wxMs(FONT_SIZES.xs) + 3) * 2,
  },

  section: { marginHorizontal: wxSc(SPACING.md), marginTop: wxSc(SPACING.lg) },
  sectionHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: wxSc(SPACING.sm) },
  sectionTitle: { color: COLORS.sectionHeader, fontSize: wxMs(FONT_SIZES.xs), fontWeight: "800", letterSpacing: 0.5 },
  collapseHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingLeft: wxSc(SPACING.md), paddingRight: wxSc(SPACING.xs), paddingVertical: wxSc(SPACING.xs), borderRadius: wxSc(RADIUS.md), backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, marginBottom: wxSc(SPACING.sm) },
  collapseHeadPressed: { backgroundColor: COLORS.primary + "1A", borderColor: COLORS.primary + "55" },
  collapseRight: { flexDirection: "row", alignItems: "center", gap: wxSc(SPACING.xs) },
  collapseLabel: { color: COLORS.primarySoft, fontSize: wxMs(FONT_SIZES.xs), fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  chevronBox: { width: wxSc(44), height: wxSc(44), alignItems: "center", justifyContent: "center" },

  // Performance rows live inside the shared rounded dark card; vertical
  // summaryDividers separate stats, a horizontal divider separates the two rows.
  perfRow: { flexDirection: "row", alignItems: "center", paddingVertical: wxSc(SPACING.md) },
  perfHint: { color: COLORS.textMuted, fontSize: wxMs(FONT_SIZES.xs), paddingVertical: wxSc(SPACING.md), paddingHorizontal: wxSc(SPACING.md), textAlign: "center" },

  card: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: wxSc(RADIUS.lg), overflow: "hidden" },
  divider: { height: 1, backgroundColor: COLORS.border },
  emptyLine: { color: COLORS.textMuted, fontSize: wxMs(FONT_SIZES.sm), paddingVertical: wxSc(SPACING.sm) },

  qRow: { flexDirection: "row", alignItems: "center", gap: wxSc(SPACING.sm), paddingHorizontal: wxSc(SPACING.md), paddingVertical: wxSc(SPACING.sm) },
  qRowMe: { backgroundColor: COLORS.primary + "1A" },
  qPos: { color: COLORS.textMuted, fontSize: wxMs(FONT_SIZES.sm), fontWeight: "800", width: wxSc(20) },
  qName: { flex: 1, color: COLORS.text, fontSize: wxMs(FONT_SIZES.sm), fontWeight: "700" },
  qChips: { color: COLORS.primaryLight, fontSize: wxMs(FONT_SIZES.xs), fontWeight: "800" },
  qRoundStatus: { fontSize: wxMs(FONT_SIZES.xs), fontWeight: "700", marginTop: 1 },
  qMeText: { color: COLORS.primaryLight },
  // View Full Queue affordance + read-only modal.
  qViewAll: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: wxSc(SPACING.md), paddingVertical: wxSc(SPACING.sm) },
  qViewAllText: { color: COLORS.primaryLight, fontSize: wxMs(FONT_SIZES.sm), fontWeight: "800" },
  qViewAllChevron: { color: COLORS.primaryLight, fontSize: wxMs(FONT_SIZES.lg), fontWeight: "800" },
  fqRoot: { flex: 1, justifyContent: "center", alignItems: "center", padding: wxSc(SPACING.lg) },
  fqDim: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(0,0,0,0.6)" },
  fqCard: { width: "100%", maxWidth: wxSc(460), maxHeight: "80%", backgroundColor: COLORS.backgroundCard, borderRadius: wxSc(22), borderWidth: 1, borderColor: COLORS.border, overflow: "hidden" },
  fqHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: wxSc(SPACING.md), paddingVertical: wxSc(SPACING.md), borderBottomWidth: 1, borderBottomColor: COLORS.border },
  fqTitle: { color: COLORS.text, fontSize: wxMs(FONT_SIZES.md), fontWeight: "800" },
  fqDone: { color: COLORS.primaryLight, fontSize: wxMs(FONT_SIZES.md), fontWeight: "800" },
  fqRow: { flexDirection: "row", alignItems: "center", gap: wxSc(SPACING.sm), paddingHorizontal: wxSc(SPACING.md), paddingVertical: wxSc(SPACING.sm) },
  fqRowDiv: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLORS.border },

  liveRow: { flexDirection: "row", alignItems: "center", gap: wxSc(SPACING.sm), paddingHorizontal: wxSc(SPACING.md), paddingVertical: wxSc(SPACING.sm) },
  liveNames: { color: COLORS.text, fontSize: wxMs(FONT_SIZES.sm), fontWeight: "700" },
  liveMeta: { color: COLORS.textMuted, fontSize: wxMs(FONT_SIZES.xs), marginTop: 1 },
  liveTimer: { color: COLORS.textSecondary, fontSize: wxMs(FONT_SIZES.sm), fontWeight: "800", fontVariant: ["tabular-nums"] },

  histRow: { flexDirection: "row", alignItems: "center", gap: wxSc(SPACING.sm), paddingHorizontal: wxSc(SPACING.md), paddingVertical: wxSc(SPACING.sm) },
  wl: { width: wxSc(26), height: wxSc(26), borderRadius: wxSc(13), alignItems: "center", justifyContent: "center" },
  wlWin: { backgroundColor: COLORS.success + "22" },
  wlLoss: { backgroundColor: COLORS.error + "22" },
  wlText: { fontSize: wxMs(FONT_SIZES.sm), fontWeight: "900", color: COLORS.text },
  histOpp: { color: COLORS.text, fontSize: wxMs(FONT_SIZES.sm), fontWeight: "700" },
  histMeta: { color: COLORS.textMuted, fontSize: wxMs(FONT_SIZES.xs), marginTop: 1 },
  histResult: { fontSize: wxMs(FONT_SIZES.xs), fontWeight: "800" },
  wlWinText: { color: COLORS.success },
  wlLossText: { color: COLORS.error },

  lbRow: { flexDirection: "row", alignItems: "center", gap: wxSc(SPACING.sm), paddingHorizontal: wxSc(SPACING.md), paddingVertical: wxSc(SPACING.sm) },
  lbRank: { color: COLORS.textMuted, fontSize: wxMs(FONT_SIZES.sm), fontWeight: "800", width: wxSc(30) },
  lbRankTop: { color: COLORS.warning },
  lbName: { flex: 1, color: COLORS.text, fontSize: wxMs(FONT_SIZES.sm), fontWeight: "700" },
  lbRec: { color: COLORS.textSecondary, fontSize: wxMs(FONT_SIZES.xs), fontWeight: "700", width: wxSc(48), textAlign: "right" },
  lbChips: { color: COLORS.primaryLight, fontSize: wxMs(FONT_SIZES.sm), fontWeight: "900", width: wxSc(36), textAlign: "right" },

  // Read-only Tables section rows (Profile hub).
  htCard: { backgroundColor: COLORS.surface, borderRadius: wxSc(RADIUS.md), borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: wxSc(SPACING.md), paddingVertical: wxSc(SPACING.sm), marginBottom: wxSc(SPACING.sm) },
  htTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: wxSc(SPACING.sm), marginBottom: wxSc(SPACING.xs) },
  htLabel: { color: COLORS.primaryLight, fontSize: wxMs(FONT_SIZES.sm), fontWeight: "800", flexShrink: 1 },
  htStatus: { color: COLORS.textMuted, fontSize: wxMs(FONT_SIZES.xs), fontWeight: "700" },
  htStatusLive: { color: COLORS.success },
  htMatch: { flexDirection: "row", alignItems: "center", gap: wxSc(SPACING.sm) },
  htSide: { flex: 1, minWidth: 0 },
  htSideRight: { alignItems: "flex-end" },
  htName: { color: COLORS.text, fontSize: wxMs(FONT_SIZES.sm), fontWeight: "700" },
  htMeta: { color: COLORS.textSecondary, fontSize: wxMs(FONT_SIZES.xs), fontWeight: "600", marginTop: 2 },
  htVs: { color: COLORS.textMuted, fontSize: wxMs(FONT_SIZES.xs), fontWeight: "800" },
});
