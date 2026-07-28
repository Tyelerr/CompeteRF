// src/views/screens/tournament/chip-live.screen.tsx
// Public, READ-ONLY spectator/player view for a live CHIP Tournament (winner-stays
// chip queue). Completely separate from the TD manage screen and the bracket
// viewer — no tournament controls of any kind. Four tabs: Overview (a live
// dashboard), Tables (every active match), Players (searchable roster + profiles)
// and Payouts. Data comes from useChipSpectator (polls the same chip state the TD
// writes), so it stays current with no manual refresh. Think ESPN, not admin.

import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { COLORS } from "../../../theme/colors";
import { RADIUS, SPACING } from "../../../theme/spacing";
import { FONT_SIZES } from "../../../theme/typography";
import { moderateScale, scale } from "../../../utils/scaling";
import {
  ChipSpectatorView,
  SpecPlayerProfile,
  SpecPlayerStatus,
  SpecTable,
  specMatchElapsedMs,
  useChipSpectator,
} from "../../../viewmodels/hooks/use.chip.spectator";
import { Loading } from "../../components/common/loading";

const isWeb = Platform.OS === "web";
const wxMs = (v: number) => (isWeb ? v : moderateScale(v));
const wxSc = (v: number) => (isWeb ? v : scale(v));

type Tab = "overview" | "tables" | "players" | "payouts";
const TABS: { key: Tab; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "tables", label: "Tables" },
  { key: "players", label: "Players" },
  { key: "payouts", label: "Payouts" },
];

type PlayerFilter = "all" | "playing" | "waiting" | "eliminated";
const PLAYER_FILTERS: { key: PlayerFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "playing", label: "Playing" },
  { key: "waiting", label: "Waiting" },
  { key: "eliminated", label: "Eliminated" },
];

const fmtClock = (ms: number): string => {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
};
const money = (n: number): string => `$${Math.round(n).toLocaleString()}`;
const fargoText = (f: number | null): string => (f != null ? `Fargo ${f}` : "Fargo —");

// Win–loss record with the wins green, the dash muted gray, the losses red.
// Rendered as inline <Text> spans so it drops into any surrounding Text run.
const RecordInline = ({ wins, losses }: { wins: number; losses: number }) => (
  <Text allowFontScaling={false}>
    <Text style={{ color: COLORS.success, fontWeight: "700" }}>{wins}</Text>
    <Text style={{ color: COLORS.textMuted }}>{" - "}</Text>
    <Text style={{ color: COLORS.error, fontWeight: "700" }}>{losses}</Text>
  </Text>
);

// "Fargo NNNN" as muted supporting text — the emphasis lives in chips (blue),
// wins (green), losses (red) and the status badges instead. Inline so it drops
// into any surrounding Text run, with a muted "  •  " bullet between pieces.
const FargoInline = ({ fargo }: { fargo: number | null }) => (
  <Text allowFontScaling={false} style={{ color: COLORS.textMuted }}>{fargoText(fargo)}</Text>
);
const MetaDot = () => <Text allowFontScaling={false} style={{ color: COLORS.textMuted }}>{"  •  "}</Text>;

// Timer color: green under 7:00, amber to 10:00, red beyond.
const LONG_MS = 10 * 60 * 1000;
const WARN_MS = 7 * 60 * 1000;
const timerColor = (ms: number): string =>
  ms >= LONG_MS ? COLORS.error : ms >= WARN_MS ? COLORS.warning : COLORS.success;

const STATUS_META: Record<
  SpecPlayerStatus,
  { label: string; color: string }
> = {
  playing: { label: "Playing", color: COLORS.success },
  next: { label: "Up Next", color: COLORS.primary },
  waiting: { label: "Waiting", color: COLORS.textSecondary },
  eliminated: { label: "Eliminated", color: COLORS.error },
  completed: { label: "Completed", color: COLORS.primaryLight },
};

// ── Small shared pieces ───────────────────────────────────────────────────────

const SectionHeader = ({
  icon,
  title,
  action,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  title: string;
  action?: React.ReactNode;
}) => (
  <View style={styles.secHead}>
    <View style={styles.secHeadLeft}>
      <Ionicons name={icon} size={wxMs(15)} color={COLORS.primary} />
      <Text allowFontScaling={false} style={styles.secTitle}>{title}</Text>
    </View>
    {action}
  </View>
);

const StatusBadge = ({ status }: { status: SpecPlayerStatus }) => {
  const m = STATUS_META[status];
  return (
    <View style={[styles.badge, { backgroundColor: m.color + "22" }]}>
      <Text allowFontScaling={false} numberOfLines={1} style={[styles.badgeText, { color: m.color }]}>{m.label}</Text>
    </View>
  );
};

// A live/waiting table card, reused by Overview "Currently Playing" and the Tables
// tab. Read-only — never any action buttons.
const TableCard = ({
  t,
  now,
  onTapTeam,
}: {
  t: SpecTable;
  now: number;
  onTapTeam: (id: string | null) => void;
}) => {
  const elapsed = t.live ? specMatchElapsedMs(t.startedAt, now) : 0;
  return (
    <View style={styles.tableCard}>
      <View style={styles.tableTop}>
        <Text allowFontScaling={false} style={styles.tableLabel} numberOfLines={1}>{t.label}</Text>
        <View style={styles.tableBadges}>
          {t.isStream && (
            <View style={styles.streamBadge}>
              <Ionicons name="videocam" size={wxMs(11)} color={COLORS.primary} />
              <Text allowFontScaling={false} style={styles.streamText}>Stream</Text>
            </View>
          )}
          {t.live ? (
            <View style={styles.liveBadge}>
              <View style={styles.liveDot} />
              <Text allowFontScaling={false} style={[styles.liveText, { color: timerColor(elapsed) }]}>
                {fmtClock(elapsed)}
              </Text>
            </View>
          ) : (
            <Text allowFontScaling={false} style={styles.tableWaiting} numberOfLines={1}>
              {t.waitingText}
            </Text>
          )}
        </View>
      </View>

      {t.aName ? (
        <View style={styles.matchup}>
          <TouchableOpacity style={styles.teamSide} activeOpacity={0.7} onPress={() => onTapTeam(t.aId)}>
            <Text allowFontScaling={false} style={styles.teamName} numberOfLines={2}>{t.aName}</Text>
            {t.aChips != null && (
              <Text allowFontScaling={false} style={styles.teamChips}>{t.aChips} {t.aChips === 1 ? "chip" : "chips"}</Text>
            )}
          </TouchableOpacity>
          <Text allowFontScaling={false} style={styles.vs}>VS</Text>
          {t.bName ? (
            <TouchableOpacity style={styles.teamSide} activeOpacity={0.7} onPress={() => onTapTeam(t.bId)}>
              <Text allowFontScaling={false} style={styles.teamName} numberOfLines={2}>{t.bName}</Text>
              {t.bChips != null && (
                <Text allowFontScaling={false} style={styles.teamChips}>{t.bChips} {t.bChips === 1 ? "chip" : "chips"}</Text>
              )}
            </TouchableOpacity>
          ) : (
            <View style={styles.teamSide}>
              <Text allowFontScaling={false} style={styles.teamWaiting} numberOfLines={2}>Waiting for a challenger</Text>
            </View>
          )}
        </View>
      ) : (
        <Text allowFontScaling={false} style={styles.tableEmpty}>Open — no team assigned</Text>
      )}
    </View>
  );
};

// ── Screen ────────────────────────────────────────────────────────────────────

export const ChipLiveScreen = ({ id, from }: { id: string; from?: string }) => {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const tournamentId = id ? Number(id) : undefined;
  const { view, isLoading } = useChipSpectator(tournamentId);

  const [tab, setTab] = useState<Tab>("overview");
  const [now, setNow] = useState(() => 0);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [queueOpen, setQueueOpen] = useState(false);
  const [standingsOpen, setStandingsOpen] = useState(false);
  const [playerQuery, setPlayerQuery] = useState("");
  const [playerFilter, setPlayerFilter] = useState<PlayerFilter>("all");
  const bodyRef = useRef<ScrollView>(null);

  // Tick every second for the live match timers (cheap; only affects timers).
  useEffect(() => {
    const set = () => setNow(Date.now());
    set();
    const iv = setInterval(set, 1000);
    return () => clearInterval(iv);
  }, []);

  // This screen stays mounted (it's a tab route), so re-opening it from "View
  // Tournament" would otherwise keep the old tab + scroll offset. On every focus,
  // reset to the Overview tab scrolled to the top; on blur, close any overlay so
  // it can't float over the previous screen.
  useFocusEffect(
    useCallback(() => {
      setTab("overview");
      setProfileId(null);
      setQueueOpen(false);
      setStandingsOpen(false);
      bodyRef.current?.scrollTo({ y: 0, animated: false });
      return () => {
        setProfileId(null);
        setQueueOpen(false);
        setStandingsOpen(false);
      };
    }, []),
  );

  const goBack = () => {
    // Return to the OWNER tab (from the `from` param) rather than router.back():
    // in a tab navigator, back() drops to the initial tab (Home). The owner kept
    // its tournament-detail modal mounted (hidden while away) and re-shows it on
    // focus, so this lands back on that same modal.
    router.navigate((from === "profile" ? "/profile" : "/billiards") as any);
  };

  const openProfile = (pid: string | null) => {
    if (pid) setProfileId(pid);
  };

  // Opening a profile from inside the Full Queue / Standings modal: close that
  // modal FIRST, then open the profile once it has dismissed. Two native modals
  // on screen at once deadlocks touch handling on iOS.
  const openProfileFromList = (pid: string | null) => {
    if (!pid) return;
    setQueueOpen(false);
    setStandingsOpen(false);
    setTimeout(() => setProfileId(pid), 320);
  };

  const profile = useMemo<SpecPlayerProfile | null>(
    () => (view && profileId ? view.profileFor(profileId) : null),
    [view, profileId],
  );

  const filteredPlayers = useMemo(() => {
    if (!view) return [];
    const q = playerQuery.trim().toLowerCase();
    return view.players.filter((p) => {
      if (q && !p.name.toLowerCase().includes(q)) return false;
      if (playerFilter === "all") return true;
      if (playerFilter === "playing") return p.status === "playing";
      if (playerFilter === "waiting") return p.status === "waiting" || p.status === "next";
      return p.status === "eliminated";
    });
  }, [view, playerQuery, playerFilter]);

  return (
    <View style={styles.root}>
      <View style={[styles.inner, isWeb && styles.webInner]}>
        {/* Header */}
        <View style={[styles.header, { paddingTop: insets.top + wxSc(SPACING.xs) }]}>
          <TouchableOpacity onPress={goBack} style={styles.backBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="chevron-back" size={wxMs(24)} color={COLORS.text} />
          </TouchableOpacity>
          <View style={styles.headerMid}>
            <Text allowFontScaling={false} style={styles.headerTitle} numberOfLines={1}>
              {view?.tournamentName ?? "Chip Tournament"}
            </Text>
            {view?.venueName ? (
              <Text allowFontScaling={false} style={styles.headerSub} numberOfLines={1}>
                {[view.venueName, view.venueCity].filter(Boolean).join(" · ")}
              </Text>
            ) : null}
          </View>
          <View
            style={[
              styles.statusPill,
              view?.status === "completed" && styles.statusDone,
              view?.status === "upcoming" && styles.statusUpcoming,
              (!view || view.status === "live") && styles.statusLive,
            ]}
          >
            {(!view || view.status === "live") && <View style={styles.headerLiveDot} />}
            <Text allowFontScaling={false} style={styles.statusText}>
              {view?.status === "completed" ? "COMPLETED" : view?.status === "upcoming" ? "UPCOMING" : "LIVE"}
            </Text>
          </View>
        </View>

        {/* Tabs */}
        <View style={styles.tabs}>
          {TABS.map((tb) => (
            <TouchableOpacity
              key={tb.key}
              activeOpacity={0.8}
              style={[styles.tab, tab === tb.key && styles.tabActive]}
              onPress={() => setTab(tb.key)}
            >
              <Text allowFontScaling={false} style={[styles.tabText, tab === tb.key && styles.tabTextActive]}>
                {tb.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {isLoading && !view ? (
          <View style={styles.center}><Loading message="Loading tournament..." /></View>
        ) : !view ? (
          <View style={styles.center}>
            <Text allowFontScaling={false} style={styles.empty}>Tournament not found.</Text>
          </View>
        ) : (
          <ScrollView ref={bodyRef} style={styles.body} contentContainerStyle={styles.bodyContent} showsVerticalScrollIndicator={false}>
            {tab === "overview" && (
              <OverviewTab
                view={view}
                now={now}
                onTapTeam={openProfile}
                onViewQueue={() => setQueueOpen(true)}
                onViewStandings={() => setStandingsOpen(true)}
              />
            )}
            {tab === "tables" && <TablesTab view={view} now={now} onTapTeam={openProfile} />}
            {tab === "players" && (
              <PlayersTab
                players={filteredPlayers}
                total={view.players.length}
                query={playerQuery}
                onQuery={setPlayerQuery}
                filter={playerFilter}
                onFilter={setPlayerFilter}
                onTap={openProfile}
              />
            )}
            {tab === "payouts" && <PayoutsTab view={view} />}
            <View style={{ height: insets.bottom + wxSc(SPACING.xl) }} />
          </ScrollView>
        )}
      </View>

      {/* Player / team profile */}
      <ProfileModal profile={profile} onClose={() => setProfileId(null)} />

      {/* Full queue */}
      <ListModal
        visible={queueOpen}
        title="Full Queue"
        onClose={() => setQueueOpen(false)}
        rows={(view?.fullQueue ?? []).map((q) => ({
          id: q.id,
          left: `${q.position}`,
          title: q.name,
          sub: <><FargoInline fargo={q.fargo} /><MetaDot /><RecordInline wins={q.wins} losses={q.losses} /></>,
          right: `${q.chips} ${q.chips === 1 ? "chip" : "chips"}`,
        }))}
        emptyText="The queue is empty."
        onTap={openProfileFromList}
      />

      {/* Full standings */}
      <ListModal
        visible={standingsOpen}
        title="Full Standings"
        onClose={() => setStandingsOpen(false)}
        rows={(view?.fullStandings ?? []).map((r) => ({
          id: r.id,
          left: `${r.rank}`,
          title: r.name,
          sub: <RecordInline wins={r.wins} losses={r.losses} />,
          right: `${r.chips} ${r.chips === 1 ? "chip" : "chips"}`,
        }))}
        emptyText="No standings yet."
        onTap={openProfileFromList}
      />
    </View>
  );
};

// ── Overview ──────────────────────────────────────────────────────────────────

const OverviewTab = ({
  view,
  now,
  onTapTeam,
  onViewQueue,
  onViewStandings,
}: {
  view: ChipSpectatorView;
  now: number;
  onTapTeam: (id: string | null) => void;
  onViewQueue: () => void;
  onViewStandings: () => void;
}) => {
  const s = view.summary;
  const summaryCards = view.finished
    ? [
        { val: view.championName ?? "—", lbl: "Champion", wide: true },
        { val: `${s.activeTables}`, lbl: "Active Tables" },
        { val: `${s.completedMatches}`, lbl: "Completed" },
      ]
    : [
        { val: `${s.playersRemaining}`, lbl: "Remaining" },
        { val: `${s.activeTables}`, lbl: "Active Tables" },
        { val: `${s.waiting}`, lbl: "Waiting" },
        { val: `${s.completedMatches}`, lbl: "Completed" },
      ];

  return (
    <View>
      {/* 1 — Summary */}
      <View style={styles.sumRow}>
        {summaryCards.map((c) => (
          <View key={c.lbl} style={[styles.sumCard, (c as any).wide && styles.sumCardWide]}>
            <Text allowFontScaling={false} style={styles.sumVal} numberOfLines={1}>{c.val}</Text>
            <Text allowFontScaling={false} style={styles.sumLbl} numberOfLines={2}>{c.lbl}</Text>
          </View>
        ))}
      </View>

      {/* 2 — Chip Leader */}
      {view.chipLeader && (
        <TouchableOpacity style={styles.leaderCard} activeOpacity={0.85} onPress={() => onTapTeam(view.chipLeader!.id)}>
          <View style={styles.leaderKickerRow}>
            <Ionicons name="trophy" size={wxMs(14)} color={COLORS.primary} />
            <Text allowFontScaling={false} style={styles.leaderKicker}>CHIP LEADER</Text>
          </View>
          <Text allowFontScaling={false} style={styles.leaderName} numberOfLines={1}>{view.chipLeader.name}</Text>
          <View style={styles.leaderMetaRow}>
            <Text allowFontScaling={false} style={styles.leaderMeta}>
              <FargoInline fargo={view.chipLeader.fargo} /><MetaDot /><RecordInline wins={view.chipLeader.wins} losses={view.chipLeader.losses} />
            </Text>
            <Text allowFontScaling={false} style={styles.leaderChips}>{view.chipLeader.chips} chips</Text>
          </View>
        </TouchableOpacity>
      )}

      {/* 3 — Currently Playing */}
      <View style={styles.section}>
        <SectionHeader icon="flame-outline" title="Currently Playing" />
        {view.tables.length === 0 ? (
          <Text allowFontScaling={false} style={styles.emptyLine}>No matches in progress.</Text>
        ) : (
          <View style={styles.tableGrid}>
            {view.tables.map((t) => (
              <TableCard key={t.id} t={t} now={now} onTapTeam={onTapTeam} />
            ))}
          </View>
        )}
      </View>

      {/* 4 — Up Next */}
      <View style={styles.section}>
        <SectionHeader icon="list-outline" title="Up Next" />
        {view.queuePreview.length === 0 ? (
          <Text allowFontScaling={false} style={styles.emptyLine}>The queue is empty.</Text>
        ) : (
          <>
            {view.queuePreview.map((q) => (
              <TouchableOpacity key={q.id} style={styles.qRow} activeOpacity={0.7} onPress={() => onTapTeam(q.id)}>
                <Text allowFontScaling={false} style={styles.qPos}>{q.position}</Text>
                <View style={styles.qMid}>
                  <Text allowFontScaling={false} style={styles.qName} numberOfLines={1}>{q.name}</Text>
                  <View style={styles.qMetaRow}>
                    <Text allowFontScaling={false} style={styles.qSub} numberOfLines={1}>
                      <FargoInline fargo={q.fargo} /><MetaDot /><RecordInline wins={q.wins} losses={q.losses} />
                    </Text>
                    <Text allowFontScaling={false} style={styles.qChips}>{q.chips} {q.chips === 1 ? "chip" : "chips"}</Text>
                  </View>
                </View>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={styles.viewAll} activeOpacity={0.7} onPress={onViewQueue}>
              <Text allowFontScaling={false} style={styles.viewAllText}>View Full Queue ({view.fullQueue.length})</Text>
              <Ionicons name="chevron-forward" size={wxMs(15)} color={COLORS.primary} />
            </TouchableOpacity>
          </>
        )}
      </View>

      {/* 5 — Chip Leaders */}
      <View style={styles.section}>
        <SectionHeader icon="podium-outline" title="Chip Leaders" />
        {view.standingsPreview.length === 0 ? (
          <Text allowFontScaling={false} style={styles.emptyLine}>No standings yet.</Text>
        ) : (
          <>
            {view.standingsPreview.map((r) => (
              <TouchableOpacity key={r.id} style={[styles.clRow, r.rank === 1 && styles.clRowTop]} activeOpacity={0.7} onPress={() => onTapTeam(r.id)}>
                <Text allowFontScaling={false} style={[styles.clRank, r.rank === 1 && styles.clRankTop]}>{r.rank}</Text>
                <Text allowFontScaling={false} style={styles.clName} numberOfLines={1}>{r.name}</Text>
                <Text allowFontScaling={false} style={styles.clChips}>{r.chips} chips</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={styles.viewAll} activeOpacity={0.7} onPress={onViewStandings}>
              <Text allowFontScaling={false} style={styles.viewAllText}>View Full Standings ({view.fullStandings.length})</Text>
              <Ionicons name="chevron-forward" size={wxMs(15)} color={COLORS.primary} />
            </TouchableOpacity>
          </>
        )}
      </View>

      {/* 6 — Recent Activity */}
      <View style={styles.section}>
        <SectionHeader icon="pulse-outline" title="Recent Activity" />
        {view.activity.length === 0 ? (
          <Text allowFontScaling={false} style={styles.emptyLine}>Nothing yet — the action will show up here.</Text>
        ) : (
          view.activity.map((a, i) => (
            <View key={a.id} style={[styles.actRow, i === view.activity.length - 1 && styles.noBorder]}>
              <View style={[styles.actDot, { backgroundColor: activityColor(a.kind) }]} />
              <Text allowFontScaling={false} style={styles.actText} numberOfLines={2}>{a.text}</Text>
            </View>
          ))
        )}
      </View>
    </View>
  );
};

const activityColor = (kind: string): string =>
  kind === "elimination" || kind === "forfeit"
    ? COLORS.error
    : kind === "match_result"
      ? COLORS.success
      : kind === "shuffle"
        ? COLORS.primary
        : COLORS.textSecondary;

// ── Tables tab ────────────────────────────────────────────────────────────────

const TablesTab = ({
  view,
  now,
  onTapTeam,
}: {
  view: ChipSpectatorView;
  now: number;
  onTapTeam: (id: string | null) => void;
}) => (
  <View style={styles.section}>
    <SectionHeader icon="grid-outline" title={`Active Tables (${view.tables.length})`} />
    {view.tables.length === 0 ? (
      <Text allowFontScaling={false} style={styles.emptyLine}>No active tables right now.</Text>
    ) : (
      <View style={styles.tableGrid}>
        {view.tables.map((t) => (
          <TableCard key={t.id} t={t} now={now} onTapTeam={onTapTeam} />
        ))}
      </View>
    )}
  </View>
);

// ── Players tab ───────────────────────────────────────────────────────────────

const PlayersTab = ({
  players,
  total,
  query,
  onQuery,
  filter,
  onFilter,
  onTap,
}: {
  players: ChipSpectatorView["players"];
  total: number;
  query: string;
  onQuery: (v: string) => void;
  filter: PlayerFilter;
  onFilter: (f: PlayerFilter) => void;
  onTap: (id: string | null) => void;
}) => (
  <View style={styles.section}>
    <View style={styles.searchWrap}>
      <Ionicons name="search" size={wxMs(16)} color={COLORS.textMuted} />
      <TextInput
        style={styles.searchInput}
        placeholder={`Search ${total} players...`}
        placeholderTextColor={COLORS.textMuted}
        value={query}
        onChangeText={onQuery}
        autoCapitalize="none"
        autoCorrect={false}
      />
      {query.length > 0 && (
        <TouchableOpacity onPress={() => onQuery("")} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="close-circle" size={wxMs(16)} color={COLORS.textMuted} />
        </TouchableOpacity>
      )}
    </View>

    {/* Quick status filters */}
    <View style={styles.filterRow}>
      {PLAYER_FILTERS.map((f) => (
        <TouchableOpacity
          key={f.key}
          style={[styles.filterChip, filter === f.key && styles.filterChipActive]}
          activeOpacity={0.8}
          onPress={() => onFilter(f.key)}
        >
          <Text allowFontScaling={false} style={[styles.filterChipText, filter === f.key && styles.filterChipTextActive]}>{f.label}</Text>
        </TouchableOpacity>
      ))}
    </View>

    {/* Column header — just PLAYER; chips moved onto the row's second line and
        the status badge is the only right-aligned element */}
    <View style={styles.plHeadRow}>
      <Text allowFontScaling={false} style={styles.plHeadLabel}>PLAYER</Text>
    </View>

    {players.length === 0 ? (
      <Text allowFontScaling={false} style={styles.emptyLine}>No players match.</Text>
    ) : (
      players.map((p) => (
        <TouchableOpacity key={p.id} style={styles.plRow} activeOpacity={0.7} onPress={() => onTap(p.id)}>
          <View style={styles.plNameRow}>
            <Text allowFontScaling={false} style={styles.plName} numberOfLines={2}>{p.name}</Text>
            <StatusBadge status={p.status} />
          </View>
          <Text allowFontScaling={false} style={styles.plMeta} numberOfLines={1}>
            <FargoInline fargo={p.fargo} /><MetaDot /><RecordInline wins={p.wins} losses={p.losses} /><MetaDot />
            <Text style={styles.plMetaChips}>{p.chips} Chips</Text>
          </Text>
        </TouchableOpacity>
      ))
    )}
  </View>
);

// ── Payouts tab ───────────────────────────────────────────────────────────────

const PayoutsTab = ({ view }: { view: ChipSpectatorView }) => {
  const p = view.payouts;
  const ordinal = (n: number): string => {
    const s = ["th", "st", "nd", "rd"];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  };
  return (
    <View>
      <View style={styles.section}>
        <SectionHeader icon="cash-outline" title="Prize Pool" />
        <View style={styles.payRow}>
          <Text allowFontScaling={false} style={styles.payLbl}>Entry Fee</Text>
          <Text allowFontScaling={false} style={styles.payVal}>{p.entryFee > 0 ? money(p.entryFee) : "—"}</Text>
        </View>
        <View style={styles.payRow}>
          <Text allowFontScaling={false} style={styles.payLbl}>Added Money</Text>
          <Text allowFontScaling={false} style={styles.payVal}>{p.addedMoney > 0 ? money(p.addedMoney) : "—"}</Text>
        </View>
        <View style={[styles.payRow, styles.payRowTotal]}>
          <Text allowFontScaling={false} style={styles.payLblTotal}>Prize Pool</Text>
          <Text allowFontScaling={false} style={styles.payValTotal}>{p.pool > 0 ? money(p.pool) : "—"}</Text>
        </View>
      </View>

      <View style={styles.section}>
        <SectionHeader icon="ribbon-outline" title="Payout Breakdown" />
        {p.places && p.places.length > 0 ? (
          p.places.map((row, i) => (
            <View key={row.place} style={[styles.payoutRow, i === (p.places!.length - 1) && styles.noBorder]}>
              <View style={[styles.payoutPlace, row.place <= 3 && styles.payoutPlaceTop]}>
                <Text allowFontScaling={false} style={[styles.payoutPlaceText, row.place <= 3 && styles.payoutPlaceTextTop]}>{ordinal(row.place)}</Text>
              </View>
              <Text allowFontScaling={false} style={styles.payoutPct}>{row.percent}%</Text>
              <Text allowFontScaling={false} style={styles.payoutAmt}>{money(row.amount)}</Text>
            </View>
          ))
        ) : (
          <View style={styles.payFallback}>
            <Ionicons name="megaphone-outline" size={wxMs(20)} color={COLORS.textMuted} />
            <Text allowFontScaling={false} style={styles.payFallbackText}>
              Payouts will be announced by the tournament director.
            </Text>
          </View>
        )}
      </View>
    </View>
  );
};

// ── Shared centered modal shell ───────────────────────────────────────────────
// A proper CENTERED modal — never a bottom sheet. Inset from every edge so it
// floats above the tab bar and never looks attached to the bottom. Fixed header
// (title + X), scrollable body, and a full-width Close button pinned in a fixed
// footer. Dismiss via X, the Close button, or tapping the backdrop.
const SpectatorModal = ({
  visible,
  title,
  onClose,
  children,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) => {
  const insets = useSafeAreaInsets();
  const { height: winH } = useWindowDimensions();
  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View
        style={[
          styles.modalBackdrop,
          { paddingTop: insets.top + wxSc(SPACING.lg), paddingBottom: insets.bottom + wxSc(SPACING.lg) },
        ]}
      >
        {/* Tap-to-close layer sits BEHIND the card. The card is a plain View (not
            a Pressable) so it never swallows the ScrollView's scroll gesture. */}
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[styles.modalCard, { height: Math.round(winH * 0.74) }]}>
          <View style={styles.modalHeader}>
            <Text allowFontScaling={false} style={styles.modalTitle} numberOfLines={2}>{title}</Text>
            <TouchableOpacity onPress={onClose} style={styles.modalX} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={wxMs(22)} color={COLORS.textSecondary} />
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.modalBody} contentContainerStyle={styles.modalBodyContent} showsVerticalScrollIndicator nestedScrollEnabled>
            {children}
          </ScrollView>
          <View style={styles.modalFooter}>
            <TouchableOpacity style={styles.modalCloseBtn} onPress={onClose} activeOpacity={0.85}>
              <Text allowFontScaling={false} style={styles.modalCloseText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

// ── Player / team profile ─────────────────────────────────────────────────────

const ProfileModal = ({
  profile,
  onClose,
}: {
  profile: SpecPlayerProfile | null;
  onClose: () => void;
}) => (
  <SpectatorModal visible={profile != null} title={profile?.name ?? "Player Details"} onClose={onClose}>
    {profile && (
      <>
        <View style={styles.profileTopRow}>
          {profile.isTeam ? (
            <Text allowFontScaling={false} style={styles.profileMembers} numberOfLines={2}>
              {[profile.p1Name, profile.p2Name].filter(Boolean).join("   /   ")}
            </Text>
          ) : (
            <View style={{ flex: 1 }} />
          )}
          <StatusBadge status={profile.status} />
        </View>

        {/* Stat grid */}
        <View style={styles.pStatGrid}>
          <PStat val={`${profile.chips}`} lbl="Chips" color={COLORS.primary} />
          <PStat val={<RecordInline wins={profile.wins} losses={profile.losses} />} lbl="Record" />
          <PStat val={`${Math.round(profile.winPct * 100)}%`} lbl="Win Rate" />
          <PStat val={`${profile.startChips}`} lbl="Started With" />
          <PStat val={profile.fargo != null ? `${profile.fargo}` : "—"} lbl="Fargo" />
          <PStat
            val={`${profile.streak}`}
            lbl="Win Streak"
            color={profile.streak > 0 ? COLORS.success : undefined}
          />
        </View>

        {/* Performance — "played like a NNN" as a sports stat, not a report card */}
        {profile.perf && (() => {
          const d = profile.perf.delta ?? 0;
          const dColor = d > 0 ? COLORS.success : d < 0 ? COLORS.error : COLORS.textSecondary;
          const dArrow = d > 0 ? "▲" : d < 0 ? "▼" : "▬";
          return (
            <View style={styles.perfCard}>
              <Text allowFontScaling={false} style={styles.perfKicker}>PERFORMANCE</Text>
              {/* Focal centered stat; the arrow + change sits to the right and is
                  vertically CENTERED against the big number (not baseline-aligned) */}
              <View style={styles.perfHeadline}>
                <Text allowFontScaling={false} style={styles.perfBig}>
                  {profile.fargo != null ? profile.fargo : "—"}
                  <Text style={styles.perfArrowSep}>{"  →  "}</Text>
                  {profile.perf.rating != null ? profile.perf.rating : "—"}
                </Text>
                {profile.perf.delta != null && (
                  <Text allowFontScaling={false} style={[styles.perfDeltaInline, { color: dColor }]}>{`${dArrow} ${Math.abs(d)}`}</Text>
                )}
              </View>
              {/* Supporting two-column stats */}
              <View style={styles.perfDivider} />
              <View style={styles.perfStatRow}>
                <Text allowFontScaling={false} style={styles.perfStatLbl}>Team Fargo</Text>
                <Text allowFontScaling={false} style={styles.perfStatVal}>{profile.fargo != null ? profile.fargo : "—"}</Text>
              </View>
              <View style={styles.perfStatRow}>
                <Text allowFontScaling={false} style={styles.perfStatLbl}>Performance</Text>
                <Text allowFontScaling={false} style={styles.perfStatVal}>{profile.perf.rating != null ? profile.perf.rating : "—"}</Text>
              </View>
              {profile.perf.avgOpponentFargo != null && (
                <View style={styles.perfStatRow}>
                  <Text allowFontScaling={false} style={styles.perfStatLbl}>Opponent Avg</Text>
                  <Text allowFontScaling={false} style={styles.perfStatVal}>{profile.perf.avgOpponentFargo}</Text>
                </View>
              )}
            </View>
          );
        })()}

        {/* Match history */}
        <Text allowFontScaling={false} style={styles.profileSecTitle}>Match History</Text>
        {profile.history.length === 0 ? (
          <Text allowFontScaling={false} style={styles.emptyLine}>No matches played yet.</Text>
        ) : (
          profile.history.map((h, i) => (
            <View key={h.id} style={[styles.histRow, i === profile.history.length - 1 && styles.noBorder]}>
              <View style={[styles.histResult, { backgroundColor: (h.won ? COLORS.success : COLORS.error) + "22" }]}>
                <Text allowFontScaling={false} style={[styles.histResultText, { color: h.won ? COLORS.success : COLORS.error }]}>{h.won ? "W" : "L"}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text allowFontScaling={false} style={styles.histOpp} numberOfLines={1}>vs {h.opponentName}</Text>
                <Text allowFontScaling={false} style={styles.histMeta} numberOfLines={1}>
                  {[h.tableLabel, h.durationMs != null ? fmtClock(h.durationMs) : null].filter(Boolean).join(" · ") || "—"}
                </Text>
              </View>
            </View>
          ))
        )}

      </>
    )}
  </SpectatorModal>
);

const PStat = ({ val, lbl, color }: { val: React.ReactNode; lbl: string; color?: string }) => (
  <View style={styles.pStat}>
    <Text allowFontScaling={false} style={[styles.pStatVal, color ? { color } : null]} numberOfLines={1}>{val}</Text>
    <Text allowFontScaling={false} style={styles.pStatLbl} numberOfLines={1}>{lbl}</Text>
  </View>
);

// ── Generic list modal (Full Queue / Full Standings) ─────────────────────────

interface ListRow { id: string; left: string; title: string; sub: React.ReactNode; right: string }
const ListModal = ({
  visible,
  title,
  rows,
  emptyText,
  onClose,
  onTap,
}: {
  visible: boolean;
  title: string;
  rows: ListRow[];
  emptyText: string;
  onClose: () => void;
  onTap: (id: string | null) => void;
}) => (
  <SpectatorModal visible={visible} title={title} onClose={onClose}>
    {rows.length === 0 ? (
      <Text allowFontScaling={false} style={styles.emptyLine}>{emptyText}</Text>
    ) : (
      rows.map((r, i) => (
        <TouchableOpacity key={r.id} style={[styles.qRow, i === 0 && styles.noBorderTop]} activeOpacity={0.7} onPress={() => onTap(r.id)}>
          <Text allowFontScaling={false} style={styles.qPos}>{r.left}</Text>
          <View style={styles.qMid}>
            <Text allowFontScaling={false} style={styles.qName} numberOfLines={1}>{r.title}</Text>
            <Text allowFontScaling={false} style={styles.qSub} numberOfLines={1}>{r.sub}</Text>
          </View>
          <Text allowFontScaling={false} style={styles.qChips}>{r.right}</Text>
        </TouchableOpacity>
      ))
    )}
  </SpectatorModal>
);

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  inner: { flex: 1 },
  webInner: { width: "100%" as any, maxWidth: 820, alignSelf: "center" as any },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: wxSc(SPACING.xl) },
  empty: { color: COLORS.textMuted, fontSize: wxMs(FONT_SIZES.md) },

  // Header
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: wxSc(SPACING.md), paddingBottom: wxSc(SPACING.sm), gap: wxSc(SPACING.sm) },
  backBtn: { width: wxSc(36), height: wxSc(36), alignItems: "center", justifyContent: "center" },
  headerMid: { flex: 1, minWidth: 0 },
  headerTitle: { color: COLORS.text, fontSize: wxMs(FONT_SIZES.lg), fontWeight: "800" },
  headerSub: { color: COLORS.textMuted, fontSize: wxMs(FONT_SIZES.xs), marginTop: 1 },
  statusPill: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: wxSc(SPACING.sm), height: wxSc(26), borderRadius: RADIUS.full, backgroundColor: COLORS.surface },
  statusLive: { backgroundColor: COLORS.error + "1F" },
  statusDone: { backgroundColor: COLORS.textSecondary + "22" },
  statusUpcoming: { backgroundColor: COLORS.primary + "22" },
  headerLiveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: COLORS.error },
  statusText: { color: COLORS.text, fontSize: wxMs(FONT_SIZES.xs), fontWeight: "800", letterSpacing: 0.5 },

  // Tabs
  tabs: { flexDirection: "row", paddingHorizontal: wxSc(SPACING.md), gap: wxSc(SPACING.xs), borderBottomWidth: 1, borderBottomColor: COLORS.border },
  tab: { flex: 1, alignItems: "center", paddingVertical: wxSc(SPACING.sm), borderBottomWidth: 2, borderBottomColor: "transparent" },
  tabActive: { borderBottomColor: COLORS.primary },
  tabText: { color: COLORS.textSecondary, fontSize: wxMs(FONT_SIZES.sm), fontWeight: "700" },
  tabTextActive: { color: COLORS.primary },

  body: { flex: 1 },
  bodyContent: { padding: wxSc(SPACING.md) },

  // Sections
  section: { backgroundColor: COLORS.backgroundCard, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: wxSc(SPACING.md), paddingVertical: wxSc(SPACING.sm), marginBottom: wxSc(SPACING.md) },
  secHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: wxSc(SPACING.xs) },
  secHeadLeft: { flexDirection: "row", alignItems: "center", gap: 6 },
  secTitle: { color: COLORS.text, fontSize: wxMs(FONT_SIZES.sm), fontWeight: "800" },
  emptyLine: { color: COLORS.textMuted, fontSize: wxMs(FONT_SIZES.sm), paddingVertical: wxSc(SPACING.sm) },
  noBorder: { borderBottomWidth: 0 },
  noBorderTop: { borderTopWidth: 0 },

  // Summary cards
  sumRow: { flexDirection: "row", flexWrap: "wrap", gap: wxSc(SPACING.sm), marginBottom: wxSc(SPACING.md) },
  sumCard: { flexGrow: 1, flexBasis: "22%", minWidth: 74, alignItems: "center", justifyContent: "flex-start", backgroundColor: COLORS.backgroundCard, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, paddingVertical: wxSc(SPACING.md), paddingHorizontal: wxSc(SPACING.xs) },
  sumCardWide: { flexBasis: "100%" },
  sumVal: { color: COLORS.primary, fontSize: wxMs(FONT_SIZES.xl), fontWeight: "900" },
  // Reserve two lines so "Active Tables" can wrap to Active / Tables without
  // truncating, and every card stays the same height with a centered label.
  sumLbl: { color: COLORS.textMuted, fontSize: wxMs(FONT_SIZES.xs), fontWeight: "600", marginTop: 4, textAlign: "center", lineHeight: wxMs(FONT_SIZES.xs) * 1.25, minHeight: wxMs(FONT_SIZES.xs) * 1.25 * 2 },

  // Chip leader
  leaderCard: { backgroundColor: COLORS.primary + "12", borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.primary + "55", padding: wxSc(SPACING.md), marginBottom: wxSc(SPACING.md) },
  leaderKickerRow: { flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 4 },
  leaderKicker: { color: COLORS.primary, fontSize: wxMs(FONT_SIZES.xs), fontWeight: "800", letterSpacing: 0.5 },
  leaderName: { color: COLORS.text, fontSize: wxMs(FONT_SIZES.lg), fontWeight: "800" },
  leaderMetaRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 3 },
  leaderMeta: { color: COLORS.textSecondary, fontSize: wxMs(FONT_SIZES.xs) },
  leaderChips: { color: COLORS.primary, fontSize: wxMs(FONT_SIZES.md), fontWeight: "900" },

  // Table cards
  tableGrid: { flexDirection: "row", flexWrap: "wrap", gap: wxSc(SPACING.sm), paddingTop: wxSc(SPACING.xs) },
  tableCard: { flexGrow: 1, flexBasis: isWeb ? "46%" : "100%", minWidth: isWeb ? 240 : undefined, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, padding: wxSc(SPACING.md) },
  tableTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: wxSc(SPACING.sm) },
  tableLabel: { color: COLORS.primary, fontSize: wxMs(FONT_SIZES.md), fontWeight: "800" },
  tableBadges: { flexDirection: "row", alignItems: "center", gap: wxSc(SPACING.xs) },
  streamBadge: { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: COLORS.primary + "1A", paddingHorizontal: 6, height: wxSc(20), borderRadius: RADIUS.sm },
  streamText: { color: COLORS.primary, fontSize: wxMs(FONT_SIZES.xs), fontWeight: "700" },
  liveBadge: { flexDirection: "row", alignItems: "center", gap: 4 },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: COLORS.success },
  liveText: { fontSize: wxMs(FONT_SIZES.sm), fontWeight: "800", fontVariant: ["tabular-nums"] },
  tableWaiting: { color: COLORS.textMuted, fontSize: wxMs(FONT_SIZES.xs), fontWeight: "600" },
  // Three columns [Team A][VS][Team B], both team columns TOP-aligned and equal
  // width so a wrapping name never pushes the opposite team down.
  matchup: { flexDirection: "row", alignItems: "flex-start", gap: wxSc(SPACING.xs) },
  teamSide: { flex: 1, alignItems: "center" },
  teamName: { color: COLORS.text, fontSize: wxMs(FONT_SIZES.sm), fontWeight: "700", textAlign: "center" },
  teamChips: { color: COLORS.primary, fontSize: wxMs(FONT_SIZES.xs), fontWeight: "700", marginTop: 2 },
  teamWaiting: { color: COLORS.textMuted, fontSize: wxMs(FONT_SIZES.xs), fontStyle: "italic", textAlign: "center" },
  vs: { color: COLORS.textMuted, fontSize: wxMs(FONT_SIZES.xs), fontWeight: "800", marginTop: wxSc(2) },
  tableEmpty: { color: COLORS.textMuted, fontSize: wxMs(FONT_SIZES.sm), fontStyle: "italic", textAlign: "center", paddingVertical: wxSc(SPACING.sm) },

  // Queue rows
  qRow: { flexDirection: "row", alignItems: "center", gap: wxSc(SPACING.sm), paddingVertical: wxSc(SPACING.sm), borderTopWidth: 1, borderTopColor: COLORS.border },
  qPos: { color: COLORS.textMuted, fontSize: wxMs(FONT_SIZES.sm), fontWeight: "800", width: wxSc(22), textAlign: "center" },
  qMid: { flex: 1, minWidth: 0 },
  qName: { color: COLORS.text, fontSize: wxMs(FONT_SIZES.sm), fontWeight: "700" },
  qMetaRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: wxSc(SPACING.sm), marginTop: 2 },
  qSub: { flexShrink: 1, color: COLORS.textMuted, fontSize: wxMs(FONT_SIZES.xs), marginTop: 1 },
  qChips: { color: COLORS.primary, fontSize: wxMs(FONT_SIZES.xs), fontWeight: "800" },

  viewAll: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, paddingVertical: wxSc(SPACING.sm), marginTop: wxSc(SPACING.xs) },
  viewAllText: { color: COLORS.primary, fontSize: wxMs(FONT_SIZES.sm), fontWeight: "700" },

  // Chip leaders
  clRow: { flexDirection: "row", alignItems: "center", gap: wxSc(SPACING.sm), paddingVertical: wxSc(SPACING.sm), borderTopWidth: 1, borderTopColor: COLORS.border },
  clRowTop: { borderTopWidth: 0 },
  clRank: { color: COLORS.textMuted, fontSize: wxMs(FONT_SIZES.sm), fontWeight: "800", width: wxSc(22), textAlign: "center" },
  clRankTop: { color: COLORS.primary },
  clName: { flex: 1, color: COLORS.text, fontSize: wxMs(FONT_SIZES.sm), fontWeight: "700" },
  clChips: { color: COLORS.primary, fontSize: wxMs(FONT_SIZES.xs), fontWeight: "800" },

  // Activity
  actRow: { flexDirection: "row", alignItems: "center", gap: wxSc(SPACING.sm), paddingVertical: wxSc(SPACING.sm), borderBottomWidth: 1, borderBottomColor: COLORS.border },
  actDot: { width: 8, height: 8, borderRadius: 4 },
  actText: { flex: 1, color: COLORS.textSecondary, fontSize: wxMs(FONT_SIZES.sm) },

  // Players
  searchWrap: { flexDirection: "row", alignItems: "center", gap: wxSc(SPACING.xs), backgroundColor: COLORS.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: wxSc(SPACING.sm), height: wxSc(42), marginVertical: wxSc(SPACING.xs) },
  searchInput: { flex: 1, color: COLORS.text, fontSize: wxMs(FONT_SIZES.sm), ...(isWeb ? ({ outlineStyle: "none" } as object) : null) },
  // Quick filter chips
  filterRow: { flexDirection: "row", flexWrap: "wrap", gap: wxSc(SPACING.xs), marginBottom: wxSc(SPACING.xs) },
  filterChip: { paddingHorizontal: wxSc(SPACING.sm), height: wxSc(30), borderRadius: RADIUS.full, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface, alignItems: "center", justifyContent: "center", ...(isWeb ? ({ cursor: "pointer" } as object) : null) },
  filterChipActive: { backgroundColor: COLORS.primary + "22", borderColor: COLORS.primary },
  filterChipText: { color: COLORS.textSecondary, fontSize: wxMs(FONT_SIZES.xs), fontWeight: "700" },
  filterChipTextActive: { color: COLORS.primary },
  // Column header
  plHeadRow: { paddingBottom: wxSc(SPACING.xs), paddingTop: wxSc(SPACING.xs) },
  plHeadLabel: { color: COLORS.textMuted, fontSize: wxMs(FONT_SIZES.xs), fontWeight: "800", letterSpacing: 0.5 },
  // Each row is a self-contained "player card": name + badge on top, then Fargo •
  // Record • Chips grouped on the second line. Taller rows, subtle divider.
  plRow: { paddingVertical: wxSc(SPACING.md), borderTopWidth: 1, borderTopColor: COLORS.border },
  plNameRow: { flexDirection: "row", alignItems: "flex-start", gap: wxSc(SPACING.sm) },
  plName: { flex: 1, color: COLORS.text, fontSize: wxMs(FONT_SIZES.lg), fontWeight: "600", lineHeight: wxMs(FONT_SIZES.lg) * 1.25 },
  plMeta: { color: COLORS.textMuted, fontSize: wxMs(FONT_SIZES.sm), marginTop: wxSc(SPACING.xs) },
  plMetaChips: { color: COLORS.primary, fontWeight: "700" },
  badge: { paddingHorizontal: wxSc(SPACING.xs), height: wxSc(22), borderRadius: RADIUS.sm, alignItems: "center", justifyContent: "center" },
  badgeText: { fontSize: wxMs(FONT_SIZES.xs), fontWeight: "800" },

  // Payouts
  payRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: wxSc(SPACING.sm), borderTopWidth: 1, borderTopColor: COLORS.border },
  payRowTotal: { borderTopWidth: 1, borderTopColor: COLORS.border },
  payLbl: { color: COLORS.textSecondary, fontSize: wxMs(FONT_SIZES.sm) },
  payVal: { color: COLORS.text, fontSize: wxMs(FONT_SIZES.sm), fontWeight: "700" },
  payLblTotal: { color: COLORS.text, fontSize: wxMs(FONT_SIZES.md), fontWeight: "800" },
  payValTotal: { color: COLORS.primary, fontSize: wxMs(FONT_SIZES.lg), fontWeight: "900" },
  payoutRow: { flexDirection: "row", alignItems: "center", gap: wxSc(SPACING.sm), paddingVertical: wxSc(SPACING.sm), borderBottomWidth: 1, borderBottomColor: COLORS.border },
  payoutPlace: { minWidth: wxSc(42), height: wxSc(26), borderRadius: RADIUS.sm, backgroundColor: COLORS.surface, alignItems: "center", justifyContent: "center", paddingHorizontal: 6 },
  payoutPlaceTop: { backgroundColor: COLORS.primary + "1F" },
  payoutPlaceText: { color: COLORS.textSecondary, fontSize: wxMs(FONT_SIZES.xs), fontWeight: "800" },
  payoutPlaceTextTop: { color: COLORS.primary },
  payoutPct: { flex: 1, color: COLORS.textMuted, fontSize: wxMs(FONT_SIZES.xs) },
  payoutAmt: { color: COLORS.text, fontSize: wxMs(FONT_SIZES.md), fontWeight: "800" },
  payFallback: { flexDirection: "row", alignItems: "center", gap: wxSc(SPACING.sm), paddingVertical: wxSc(SPACING.md) },
  payFallbackText: { flex: 1, color: COLORS.textMuted, fontSize: wxMs(FONT_SIZES.sm), lineHeight: wxMs(FONT_SIZES.sm) * 1.4 },

  // Modals
  // Centered modal (NOT a bottom sheet): backdrop pads all four edges so the card
  // floats inset from every side and above the tab bar.
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", alignItems: "center", paddingHorizontal: wxSc(SPACING.md) },
  // Card sizes to content up to a maxHeight (set inline ≈74% of the screen).
  // flexDirection column: fixed header, flexible ScrollView, fixed footer.
  modalCard: { width: "100%", maxWidth: 560, backgroundColor: COLORS.background, borderRadius: RADIUS.xl, borderWidth: 1, borderColor: COLORS.border, overflow: "hidden" },
  modalHeader: { flexDirection: "row", alignItems: "center", gap: wxSc(SPACING.sm), paddingHorizontal: wxSc(SPACING.md), paddingVertical: wxSc(SPACING.md), borderBottomWidth: 1, borderBottomColor: COLORS.border },
  modalTitle: { flex: 1, color: COLORS.text, fontSize: wxMs(FONT_SIZES.lg), fontWeight: "900" },
  modalX: { width: wxSc(32), height: wxSc(32), alignItems: "center", justifyContent: "center", borderRadius: RADIUS.sm, backgroundColor: COLORS.surface },
  // The card has a fixed height, so flex:1 gives the ScrollView a bounded height
  // between the fixed header and footer — only the middle scrolls.
  modalBody: { flex: 1 },
  modalBodyContent: { paddingHorizontal: wxSc(SPACING.md), paddingTop: wxSc(SPACING.md), paddingBottom: wxSc(SPACING.md) },
  modalFooter: { paddingHorizontal: wxSc(SPACING.md), paddingTop: wxSc(SPACING.sm), paddingBottom: wxSc(SPACING.sm), borderTopWidth: 1, borderTopColor: COLORS.border },
  modalCloseBtn: { height: wxSc(48), borderRadius: RADIUS.md, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, alignItems: "center", justifyContent: "center", ...(isWeb ? ({ cursor: "pointer" } as object) : null) },
  modalCloseText: { color: COLORS.text, fontSize: wxMs(FONT_SIZES.md), fontWeight: "800" },
  profileTopRow: { flexDirection: "row", alignItems: "center", gap: wxSc(SPACING.sm), marginBottom: wxSc(SPACING.md), minHeight: wxSc(22) },
  profileMembers: { flex: 1, color: COLORS.textSecondary, fontSize: wxMs(FONT_SIZES.sm) },
  pStatGrid: { flexDirection: "row", flexWrap: "wrap", gap: wxSc(SPACING.sm), marginBottom: wxSc(SPACING.md) },
  pStat: { flexGrow: 1, flexBasis: "30%", minWidth: 90, alignItems: "center", backgroundColor: COLORS.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, paddingVertical: wxSc(SPACING.sm) },
  pStatVal: { color: COLORS.text, fontSize: wxMs(FONT_SIZES.lg), fontWeight: "900" },
  pStatLbl: { color: COLORS.textMuted, fontSize: wxMs(FONT_SIZES.xs), fontWeight: "600", marginTop: 2 },
  perfCard: { backgroundColor: COLORS.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, padding: wxSc(SPACING.md), marginBottom: wxSc(SPACING.md) },
  perfKicker: { color: COLORS.textMuted, fontSize: wxMs(FONT_SIZES.xs), fontWeight: "800", letterSpacing: 0.5 },
  // Focal "Fargo → played-like" number with the arrow + change to its right,
  // vertically centered against it via the row's alignItems.
  perfHeadline: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: wxSc(SPACING.md), marginTop: wxSc(SPACING.sm), marginBottom: wxSc(SPACING.md) },
  perfBig: { color: COLORS.text, fontSize: wxMs(FONT_SIZES.xxxl), fontWeight: "900" },
  perfArrowSep: { color: COLORS.textMuted, fontWeight: "700" },
  perfDeltaInline: { fontSize: wxMs(FONT_SIZES.lg), fontWeight: "800" },
  perfDivider: { height: 1, backgroundColor: COLORS.border, marginBottom: wxSc(SPACING.sm) },
  // Full-width two-column supporting stats (label left, value right).
  perfStatRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: wxSc(SPACING.sm), paddingVertical: wxSc(5) },
  perfStatLbl: { color: COLORS.textSecondary, fontSize: wxMs(FONT_SIZES.sm) },
  perfStatVal: { color: COLORS.text, fontSize: wxMs(FONT_SIZES.sm), fontWeight: "800" },
  profileSecTitle: { color: COLORS.text, fontSize: wxMs(FONT_SIZES.sm), fontWeight: "800", marginBottom: wxSc(SPACING.xs), marginTop: wxSc(SPACING.xs) },
  histRow: { flexDirection: "row", alignItems: "center", gap: wxSc(SPACING.sm), paddingVertical: wxSc(SPACING.sm), borderBottomWidth: 1, borderBottomColor: COLORS.border },
  histResult: { width: wxSc(28), height: wxSc(28), borderRadius: RADIUS.sm, alignItems: "center", justifyContent: "center" },
  histResultText: { fontSize: wxMs(FONT_SIZES.sm), fontWeight: "900" },
  histOpp: { color: COLORS.text, fontSize: wxMs(FONT_SIZES.sm), fontWeight: "600" },
  histMeta: { color: COLORS.textMuted, fontSize: wxMs(FONT_SIZES.xs), marginTop: 1 },

});
