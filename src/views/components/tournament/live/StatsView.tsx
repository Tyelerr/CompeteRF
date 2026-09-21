// src/views/components/tournament/live/StatsView.tsx
// The single Stats page for the elimination spectator view — it now owns the player
// list (moved off the old Players tab) AND the tournament stats summary. Clicking a
// player opens a detail modal (Chip-style UX). Wide web: two columns — left player
// list + controls, right STICKY Tournament Stats. Mobile: a compact Tournament |
// Players toggle. All data is the shared authoritative derivation (SpectatorPlayer,
// computeTournamentStats / computeAllPlayerStats, groupForFargo via the viewmodel).
// Also shown to the TD in the manage hub. No second player-stats path.

import { useMemo, useState } from "react";
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { COLORS } from "../../../../theme/colors";
import { RADIUS, SPACING, WEB_MAXW } from "../../../../theme/spacing";
import { FONT_SIZES } from "../../../../theme/typography";
import { webMs, webSc } from "../../../../utils/scaling";
import { RaceConfig } from "../../../../utils/bracket.utils";
import { computeEliminatedRegIds, LiveMatch } from "../../../../utils/match.utils";
import {
  computeAllPlayerStats,
  computeTournamentStats,
  formatDurationMs,
  PlayerTournamentStats,
  winPctLabel,
} from "../../../../utils/tournament.stats";
import { SpectatorPlayer } from "../../../../viewmodels/useTournamentSpectator";
import { Dropdown } from "../../common/dropdown";
import { PlayerDetailModal } from "./PlayerDetailModal";

const isWeb = Platform.OS === "web";

type PlayerSort = "seed" | "fargo" | "name" | "group";

const winsOf = (p: SpectatorPlayer): number => p.record.filter((r) => r === "W").length;
const lossesOf = (p: SpectatorPlayer): number => p.record.filter((r) => r === "L").length;

// Group sort follows the CONFIGURED group order (never alphabetical), using the
// shared group label already assigned to each row by the viewmodel.
const sortPlayers = (
  players: SpectatorPlayer[],
  sort: PlayerSort,
  groupOrder: string[],
): SpectatorPlayer[] => {
  const bySeed = (a: SpectatorPlayer, b: SpectatorPlayer) => {
    if (a.seed != null && b.seed != null) return a.seed - b.seed;
    if (a.seed != null) return -1;
    if (b.seed != null) return 1;
    return a.name.localeCompare(b.name);
  };
  const copy = [...players];
  if (sort === "name") return copy.sort((a, b) => a.name.localeCompare(b.name));
  if (sort === "fargo")
    return copy.sort((a, b) => (b.fargo ?? -1) - (a.fargo ?? -1) || bySeed(a, b));
  if (sort === "group") {
    const rank = (g: string | null) => {
      if (g == null) return Infinity;
      const i = groupOrder.indexOf(g);
      return i === -1 ? Infinity : i;
    };
    return copy.sort((a, b) => rank(a.group) - rank(b.group) || bySeed(a, b));
  }
  return copy.sort(bySeed); // "seed"
};

const Stat = ({ label, value }: { label: string; value: string }) => (
  <View style={styles.stat}>
    <Text allowFontScaling={false} style={styles.statValue} numberOfLines={1}>
      {value}
    </Text>
    <Text allowFontScaling={false} style={styles.statLabel} numberOfLines={1}>
      {label}
    </Text>
  </View>
);

// ── Tournament stats summary (right sticky on desktop / toggle on mobile) ────────
const TournamentStatsBody = ({
  matches,
  maxLeaders,
}: {
  matches: LiveMatch[];
  maxLeaders?: number;
}) => {
  const stats = useMemo(() => computeTournamentStats(matches), [matches]);
  const leaders = maxLeaders != null ? stats.leaders.slice(0, maxLeaders) : stats.leaders;
  return (
    <>
      <View style={styles.card}>
        <Text allowFontScaling={false} style={styles.cardTitle}>
          Progress
        </Text>
        <View style={styles.grid}>
          <Stat label="Played" value={`${stats.matchesCompleted}/${stats.matchesTotal}`} />
          <Stat label="Complete" value={`${stats.percentComplete}%`} />
          <Stat label="Live now" value={String(stats.matchesInProgress)} />
          <Stat label="Remaining" value={String(stats.matchesRemaining)} />
        </View>
        <View style={styles.barTrack}>
          <View style={[styles.barFill, { width: `${stats.percentComplete}%` }]} />
        </View>
      </View>

      <View style={styles.card}>
        <Text allowFontScaling={false} style={styles.cardTitle}>
          Match Timing
        </Text>
        <View style={styles.grid}>
          <Stat label="Avg / match" value={formatDurationMs(stats.avgMatchMs)} />
          <Stat label="Fastest" value={formatDurationMs(stats.fastestMatchMs)} />
          <Stat label="Longest" value={formatDurationMs(stats.longestMatchMs)} />
          <Stat label="Total racks" value={String(stats.totalRacks)} />
        </View>
      </View>

      <View style={styles.card}>
        <Text allowFontScaling={false} style={styles.cardTitle}>
          Highlights
        </Text>
        <View style={styles.grid}>
          <Stat label="Upsets" value={String(stats.upsets)} />
          <Stat label="Forfeits" value={String(stats.forfeits)} />
          <Stat label="Withdrawals" value={String(stats.withdrawals)} />
        </View>
      </View>

      <View style={styles.card}>
        <Text allowFontScaling={false} style={styles.cardTitle}>
          W / L Leaderboard
        </Text>
        {leaders.length === 0 ? (
          <Text allowFontScaling={false} style={styles.empty}>
            No completed matches yet.
          </Text>
        ) : (
          leaders.map((p, i) => (
            <View key={p.key}>
              {i > 0 && <View style={styles.divider} />}
              <View style={styles.leaderRow}>
                <Text allowFontScaling={false} style={styles.rank}>{`#${i + 1}`}</Text>
                <Text allowFontScaling={false} style={styles.leaderName} numberOfLines={1}>
                  {p.name}
                </Text>
                <Text allowFontScaling={false} style={styles.record}>{`${p.wins}-${p.losses}`}</Text>
                <View style={styles.pctPill}>
                  <Text allowFontScaling={false} style={styles.pctText}>
                    {winPctLabel(p)}
                  </Text>
                </View>
              </View>
            </View>
          ))
        )}
      </View>
    </>
  );
};

// ── Player controls (search + sort, equal width on desktop) ─────────────────────
const PlayerControls = ({
  query,
  onQuery,
  sort,
  onSort,
  sortOptions,
}: {
  query: string;
  onQuery: (v: string) => void;
  sort: PlayerSort;
  onSort: (v: PlayerSort) => void;
  sortOptions: { label: string; value: PlayerSort }[];
}) => (
  <View style={styles.searchRow}>
    <TextInput
      allowFontScaling={false}
      style={styles.search}
      placeholder="Search players"
      placeholderTextColor={COLORS.textMuted}
      value={query}
      onChangeText={onQuery}
    />
    <View style={styles.sortWrap}>
      <Dropdown
        hideCheck={isWeb}
        selectedBlueText
        options={sortOptions}
        value={sort}
        onSelect={(v) => onSort(v as PlayerSort)}
      />
    </View>
  </View>
);

// One clickable standings row. Active names are green, eliminated names red; no
// redundant right-side status label (the section header + name color convey it).
const PlayerRow = ({
  p,
  rank,
  playing,
  isMe,
  onOpen,
}: {
  p: SpectatorPlayer;
  rank: number;
  playing: boolean;
  isMe: boolean;
  onOpen: (p: SpectatorPlayer) => void;
}) => {
  const wins = winsOf(p);
  const losses = lossesOf(p);
  return (
    <TouchableOpacity
      activeOpacity={0.6}
      onPress={() => onOpen(p)}
      style={[styles.pRow, isMe && styles.pRowMe]}
    >
      <Text allowFontScaling={false} style={styles.pRank}>
        {rank}
      </Text>
      <View style={styles.pMain}>
        <View style={styles.pNameRow}>
          <Text
            allowFontScaling={false}
            style={[styles.pName, p.eliminated ? styles.pNameOut : styles.pNameIn]}
            numberOfLines={1}
          >
            {p.name}
          </Text>
          {playing && (
            <Text allowFontScaling={false} style={styles.pPlaying}>
              Playing
            </Text>
          )}
        </View>
        <View style={styles.pSubRow}>
          {p.fargo != null && (
            <Text allowFontScaling={false} style={styles.pFargo}>
              Fargo {p.fargo}
            </Text>
          )}
          {p.group != null && (
            <View style={styles.pGroupTag}>
              <Text allowFontScaling={false} style={styles.pGroupText}>
                {p.group}
              </Text>
            </View>
          )}
          <Text allowFontScaling={false} style={styles.pRec}>
            {p.record.length === 0 ? (
              <Text style={styles.pRecEmpty}>0 - 0</Text>
            ) : (
              <>
                <Text style={styles.win}>{wins}</Text>
                <Text style={styles.recSep}> - </Text>
                <Text style={styles.loss}>{losses}</Text>
              </>
            )}
          </Text>
        </View>
      </View>
      <Text allowFontScaling={false} style={styles.chev}>
        ›
      </Text>
    </TouchableOpacity>
  );
};

// A titled section card (STILL IN / ELIMINATED) of clickable player rows.
const PlayerSection = ({
  title,
  players,
  playingRegIds,
  highlightRegId,
  onOpen,
}: {
  title: string;
  players: SpectatorPlayer[];
  playingRegIds: Set<number>;
  highlightRegId?: number | null;
  onOpen: (p: SpectatorPlayer) => void;
}) => {
  if (players.length === 0) return null;
  return (
    <>
      <Text allowFontScaling={false} style={styles.sectionHeader}>
        {title}
      </Text>
      <View style={styles.card}>
        {players.map((p, i) => (
          <View key={p.id}>
            {i > 0 && <View style={styles.divider} />}
            <PlayerRow
              p={p}
              rank={i + 1}
              playing={p.id != null && playingRegIds.has(p.id) && !p.eliminated}
              isMe={highlightRegId != null && p.id === highlightRegId}
              onOpen={onOpen}
            />
          </View>
        ))}
      </View>
    </>
  );
};

// Full player list = STILL IN then ELIMINATED (each sorted within itself). When a
// search returns only one group, only that section renders.
const PlayerList = ({
  active,
  eliminated,
  playingRegIds,
  highlightRegId,
  onOpen,
}: {
  active: SpectatorPlayer[];
  eliminated: SpectatorPlayer[];
  playingRegIds: Set<number>;
  highlightRegId?: number | null;
  onOpen: (p: SpectatorPlayer) => void;
}) => {
  if (active.length === 0 && eliminated.length === 0) {
    return (
      <View style={styles.card}>
        <Text allowFontScaling={false} style={styles.empty}>
          No players match your search.
        </Text>
      </View>
    );
  }
  return (
    <>
      <PlayerSection
        title="STILL IN"
        players={active}
        playingRegIds={playingRegIds}
        highlightRegId={highlightRegId}
        onOpen={onOpen}
      />
      <PlayerSection
        title="ELIMINATED"
        players={eliminated}
        playingRegIds={playingRegIds}
        highlightRegId={highlightRegId}
        onOpen={onOpen}
      />
    </>
  );
};

export const StatsView = ({
  matches,
  players,
  playingRegIds,
  raceConfig,
  highlightRegId,
}: {
  matches: LiveMatch[];
  // Spectator passes the rich viewmodel list; the TD manage hub passes only
  // `matches` and these are derived below from the SAME authoritative helpers
  // (computeAllPlayerStats + computeEliminatedRegIds) — never a second path.
  players?: SpectatorPlayer[];
  playingRegIds?: Set<number>;
  raceConfig?: RaceConfig;
  highlightRegId?: number | null;
}) => {
  const { width } = useWindowDimensions();
  const wide = Platform.OS === "web" && width >= 980;

  const [view, setView] = useState<"tournament" | "players">("tournament");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<PlayerSort>("seed");
  const [selected, setSelected] = useState<SpectatorPlayer | null>(null);

  // Fallback player list from the match graph when the caller didn't pass one
  // (admin manage hub). Reuses computeAllPlayerStats (records) + computeEliminatedRegIds.
  const derivedPlayers = useMemo<SpectatorPlayer[]>(() => {
    if (players) return players;
    const elim = new Set(computeEliminatedRegIds(matches));
    return computeAllPlayerStats(matches).map((s, i) => {
      const regId = s.key.startsWith("r") ? Number(s.key.slice(1)) : -(i + 1);
      return {
        id: regId,
        name: s.name,
        fargo: s.fargo,
        group: null,
        seed: null,
        status: "checked_in" as SpectatorPlayer["status"],
        record: [
          ...Array(s.matchWins).fill("W"),
          ...Array(s.matchLosses).fill("L"),
        ] as ("W" | "L")[],
        eliminated: regId >= 0 && elim.has(regId),
      };
    });
  }, [players, matches]);

  const effPlaying = useMemo<Set<number>>(() => {
    if (playingRegIds) return playingRegIds;
    const s = new Set<number>();
    for (const m of matches) {
      if (m.status !== "in_progress" || m.bye || m.empty) continue;
      if (m.p1RegId != null) s.add(m.p1RegId);
      if (m.p2RegId != null) s.add(m.p2RegId);
    }
    return s;
  }, [playingRegIds, matches]);

  const groupsMode = raceConfig?.mode === "groups";
  const groupOrder = useMemo(
    () => (raceConfig?.groups ?? []).map((g) => g.label),
    [raceConfig],
  );
  const sortOptions = useMemo<{ label: string; value: PlayerSort }[]>(
    () => [
      { label: "Seed", value: "seed" },
      { label: "Fargo", value: "fargo" },
      { label: "Name", value: "name" },
      ...(groupsMode ? [{ label: "Group", value: "group" as PlayerSort }] : []),
    ],
    [groupsMode],
  );

  // Sorted, searched, then split into Still In / Eliminated (sort applies WITHIN
  // each section — eliminated players never mix back in among active ones).
  const { activePlayers, eliminatedPlayers } = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? derivedPlayers.filter((p) => p.name.toLowerCase().includes(q))
      : derivedPlayers;
    const sorted = sortPlayers(list, sort, groupOrder);
    return {
      activePlayers: sorted.filter((p) => !p.eliminated),
      eliminatedPlayers: sorted.filter((p) => p.eliminated),
    };
  }, [derivedPlayers, query, sort, groupOrder]);

  // Per-player performance stats (shared derivation), keyed for modal lookup.
  const statsByKey = useMemo(() => {
    const map = new Map<string, PlayerTournamentStats>();
    for (const s of computeAllPlayerStats(matches)) map.set(s.key, s);
    return map;
  }, [matches]);

  const selectedStats = selected ? statsByKey.get(`r${selected.id}`) ?? null : null;
  const selectedPlaying =
    !!selected && selected.id != null && effPlaying.has(selected.id) && !selected.eliminated;

  const modal = (
    <PlayerDetailModal
      visible={!!selected}
      onClose={() => setSelected(null)}
      player={selected}
      stats={selectedStats}
      matches={matches}
      playing={selectedPlaying}
      groupsMode={groupsMode}
    />
  );

  // Wide web/desktop: combined two-column. Left player list scrolls, right summary sticks.
  if (wide) {
    return (
      <>
        <ScrollView
          style={styles.scrollFlex}
          contentContainerStyle={styles.contentWide}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.twoCol}>
            <View style={styles.leftCol}>
              <PlayerControls
                query={query}
                onQuery={setQuery}
                sort={sort}
                onSort={setSort}
                sortOptions={sortOptions}
              />
              <PlayerList
                active={activePlayers}
                eliminated={eliminatedPlayers}
                playingRegIds={effPlaying}
                highlightRegId={highlightRegId}
                onOpen={setSelected}
              />
            </View>
            <View style={styles.rightCol}>
              <Text allowFontScaling={false} style={styles.summaryHeading}>
                Tournament Stats
              </Text>
              <TournamentStatsBody matches={matches} maxLeaders={5} />
            </View>
          </View>
        </ScrollView>
        {modal}
      </>
    );
  }

  // Mobile / narrow: internal Tournament | Players toggle (no top-level Players tab).
  return (
    <>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <View style={styles.toggle}>
          {(["tournament", "players"] as const).map((v) => (
            <TouchableOpacity
              key={v}
              activeOpacity={0.85}
              style={[styles.toggleBtn, view === v && styles.toggleBtnOn]}
              onPress={() => setView(v)}
            >
              <Text
                allowFontScaling={false}
                style={[styles.toggleText, view === v && styles.toggleTextOn]}
              >
                {v === "tournament" ? "Tournament" : "Players"}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {view === "tournament" ? (
          <TournamentStatsBody matches={matches} />
        ) : (
          <>
            <PlayerControls
              query={query}
              onQuery={setQuery}
              sort={sort}
              onSort={setSort}
              sortOptions={sortOptions}
            />
            <PlayerList
              active={activePlayers}
              eliminated={eliminatedPlayers}
              playingRegIds={effPlaying}
              highlightRegId={highlightRegId}
              onOpen={setSelected}
            />
          </>
        )}
      </ScrollView>
      {modal}
    </>
  );
};

const styles = StyleSheet.create({
  content: {
    padding: webSc(SPACING.md),
    paddingBottom: webSc(SPACING.xl * 2),
    ...Platform.select({
      web: { maxWidth: 760, width: "100%" as any, alignSelf: "center" as any },
    }),
  },
  scrollFlex: { flex: 1 },
  contentWide: {
    padding: webSc(SPACING.md),
    paddingBottom: webSc(SPACING.xl * 2),
    width: "100%" as any,
    // Fills the shared spectator shell (webInner caps at 1080); matches Overview/Matches.
    maxWidth: WEB_MAXW,
    alignSelf: "center" as any,
  },
  twoCol: { flexDirection: "row", alignItems: "flex-start", gap: webSc(SPACING.lg) },
  leftCol: { flex: 68, minWidth: 0 as any },
  rightCol: {
    flex: 32,
    minWidth: 0 as any,
    position: "sticky" as any,
    top: webSc(SPACING.sm),
    alignSelf: "flex-start" as any,
  },
  summaryHeading: {
    fontSize: webMs(FONT_SIZES.xs),
    fontWeight: "900",
    color: COLORS.textSecondary,
    letterSpacing: 1,
    marginBottom: webSc(SPACING.sm),
    textTransform: "uppercase",
  },

  toggle: {
    flexDirection: "row",
    backgroundColor: COLORS.surface,
    borderRadius: webSc(RADIUS.lg),
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: webSc(SPACING.xs),
    marginBottom: webSc(SPACING.md),
  },
  toggleBtn: { flex: 1, paddingVertical: webSc(SPACING.sm), borderRadius: webSc(RADIUS.md), alignItems: "center" },
  toggleBtnOn: { backgroundColor: COLORS.primary },
  toggleText: { fontSize: webMs(FONT_SIZES.sm), fontWeight: "700", color: COLORS.textSecondary },
  toggleTextOn: { color: "#fff" },

  card: {
    backgroundColor: COLORS.surface,
    borderRadius: webSc(RADIUS.lg),
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: webSc(SPACING.md),
    marginBottom: webSc(SPACING.md),
  },
  cardTitle: { fontSize: webMs(FONT_SIZES.sm), fontWeight: "800", color: COLORS.text, marginBottom: webSc(SPACING.md) },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  stat: { width: "25%", paddingVertical: webSc(SPACING.xs), gap: webSc(2) },
  statValue: { fontSize: webMs(FONT_SIZES.lg), fontWeight: "900", color: COLORS.text, fontVariant: ["tabular-nums"] },
  statLabel: { fontSize: webMs(FONT_SIZES.xs), color: COLORS.textSecondary, fontWeight: "600" },
  barTrack: { height: webSc(6), borderRadius: webSc(RADIUS.full), backgroundColor: COLORS.background, marginTop: webSc(SPACING.sm), overflow: "hidden" },
  barFill: { height: "100%", borderRadius: webSc(RADIUS.full), backgroundColor: COLORS.success },
  empty: { fontSize: webMs(FONT_SIZES.sm), color: COLORS.textMuted, textAlign: "center" },
  divider: { height: 1, backgroundColor: COLORS.border, marginVertical: webSc(SPACING.xs) },

  // Leaderboard
  leaderRow: { flexDirection: "row", alignItems: "center", gap: webSc(SPACING.sm), paddingVertical: webSc(SPACING.sm) },
  rank: { fontSize: webMs(FONT_SIZES.sm), fontWeight: "900", color: COLORS.primary, minWidth: webSc(30), fontVariant: ["tabular-nums"] },
  leaderName: { flex: 1, fontSize: webMs(FONT_SIZES.sm), fontWeight: "700", color: COLORS.text },
  record: { fontSize: webMs(FONT_SIZES.sm), fontWeight: "800", color: COLORS.textSecondary, fontVariant: ["tabular-nums"] },
  pctPill: { minWidth: webSc(46), alignItems: "center", paddingHorizontal: webSc(SPACING.sm), paddingVertical: webSc(3), borderRadius: webSc(RADIUS.sm), backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.border },
  pctText: { fontSize: webMs(FONT_SIZES.xs), fontWeight: "800", color: COLORS.text, fontVariant: ["tabular-nums"] },

  // Controls
  searchRow: { flexDirection: "row", alignItems: "center", gap: webSc(SPACING.sm), marginBottom: webSc(SPACING.sm) },
  search: {
    flex: 1,
    height: webSc(44),
    backgroundColor: COLORS.surface,
    borderRadius: webSc(RADIUS.md),
    borderWidth: 1,
    borderColor: COLORS.border,
    color: COLORS.text,
    paddingHorizontal: webSc(SPACING.md),
    paddingVertical: 0,
    fontSize: webMs(FONT_SIZES.sm),
  },
  // Equal width to the search field on desktop (search flex 1 / sort flex 1). The
  // Dropdown selector fills the wrap and matches the search field's 44px height.
  sortWrap: { flex: 1 },
  filterRow: {
    flexDirection: "row",
    backgroundColor: COLORS.surface,
    borderRadius: webSc(RADIUS.lg),
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: webSc(SPACING.xs),
    marginBottom: webSc(SPACING.sm),
  },
  filterBtn: { flex: 1, paddingVertical: webSc(SPACING.xs), borderRadius: webSc(RADIUS.md), alignItems: "center" },
  filterBtnOn: { backgroundColor: COLORS.primary },
  filterText: { fontSize: webMs(FONT_SIZES.sm), fontWeight: "700", color: COLORS.textSecondary },
  filterTextOn: { color: "#fff" },

  sectionHeader: { fontSize: webMs(FONT_SIZES.xs), fontWeight: "900", color: COLORS.textSecondary, letterSpacing: 1, marginBottom: webSc(SPACING.sm) },

  // Player rows
  pRow: { flexDirection: "row", alignItems: "center", gap: webSc(SPACING.sm), paddingVertical: webSc(SPACING.sm) },
  pRowMe: { backgroundColor: COLORS.primary + "12", borderRadius: webSc(RADIUS.sm) },
  pRank: { minWidth: webSc(22), fontSize: webMs(FONT_SIZES.sm), fontWeight: "900", color: COLORS.textSecondary, textAlign: "center", fontVariant: ["tabular-nums"] },
  pMain: { flex: 1, minWidth: 0 as any, gap: webSc(2) },
  pNameRow: { flexDirection: "row", alignItems: "center", gap: webSc(SPACING.xs) },
  pName: { fontSize: webMs(FONT_SIZES.md), fontWeight: "800", color: COLORS.text, flexShrink: 1 },
  pNameIn: { color: COLORS.success }, // active players: green name
  pNameOut: { color: COLORS.error }, // eliminated players: red name
  pPlaying: { fontSize: webMs(9), fontWeight: "800", color: COLORS.primary, letterSpacing: 0.3 },
  pSubRow: { flexDirection: "row", alignItems: "center", gap: webSc(SPACING.sm), flexWrap: "wrap" },
  pFargo: { fontSize: webMs(FONT_SIZES.xs), color: COLORS.textSecondary, fontWeight: "700", fontVariant: ["tabular-nums"] },
  pGroupTag: { paddingHorizontal: webSc(SPACING.xs), paddingVertical: webSc(1), borderRadius: webSc(RADIUS.sm), backgroundColor: COLORS.primary + "18", borderWidth: 1, borderColor: COLORS.primary },
  pGroupText: { fontSize: webMs(9), fontWeight: "800", color: COLORS.primary, letterSpacing: 0.3 },
  pRec: { fontSize: webMs(FONT_SIZES.xs), fontWeight: "800", fontVariant: ["tabular-nums"] },
  pRecEmpty: { color: COLORS.textMuted },
  win: { color: COLORS.success },
  loss: { color: COLORS.error },
  recSep: { color: COLORS.textMuted },
  pIn: { fontSize: webMs(FONT_SIZES.xs), fontWeight: "800", color: COLORS.success },
  pOut: { fontSize: webMs(FONT_SIZES.xs), fontWeight: "800", color: COLORS.error },
  chev: { fontSize: webMs(FONT_SIZES.lg), color: COLORS.textMuted, fontWeight: "700", marginLeft: webSc(2) },
});
