// src/views/components/profile/MyTournaments.tsx
// The profile "My Tournaments" section: a header with a Search Alerts button, a
// tab row (Live / Registered / Favorites / Following / Completed), and the list
// for the selected tab. Live/Registered/Completed come from the player's
// registrations (joined to tournaments); Favorites from the favorites list;
// Following is a placeholder for now.

import { useMemo, useState } from "react";
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "../../../theme/colors";
import { RADIUS, SPACING } from "../../../theme/spacing";
import { FONT_SIZES } from "../../../theme/typography";
import { moderateScale, scale } from "../../../utils/scaling";
import { PlayerTournament } from "../../../models/types/registration.types";
import { Dropdown } from "../common/dropdown";
import { SearchAlertsInline } from "./SearchAlertsInline";
import { StatusFilter } from "./StatusFilter";

const MORE_SORTS = [
  { label: "Newest first", value: "date_desc" },
  { label: "Oldest first", value: "date_asc" },
  { label: "Name A–Z", value: "name" },
];

// Normalize for forgiving search: lowercases, maps number words to digits, and
// strips everything but letters/digits — so "8ball", "8 Ball", "8-Ball" and
// "eight ball" all collapse to "8ball" and match each other.
const NUM_WORDS: Record<string, string> = {
  one: "1", two: "2", three: "3", four: "4", five: "5",
  six: "6", seven: "7", eight: "8", nine: "9", ten: "10",
};
const normalizeSearch = (s: string): string =>
  (s || "")
    .toLowerCase()
    .replace(/\b(one|two|three|four|five|six|seven|eight|nine|ten)\b/g, (w) => NUM_WORDS[w])
    .replace(/[^a-z0-9]/g, "");

const isWeb = Platform.OS === "web";
const wxMs = (v: number) => (isWeb ? v : moderateScale(v));
const wxSc = (v: number) => (isWeb ? v : scale(v));

type TabKey = "live" | "registered" | "favorites" | "following" | "completed";

export interface FavoriteItem {
  id: number; // favorite row id
  tournament_id: number;
  tournaments?: {
    name: string;
    game_type: string;
    tournament_date: string;
    venues?: { venue: string; city: string; state: string };
  } | null;
}

interface Row {
  tournamentId: number;
  name: string;
  game: string;
  date: string;
  venueLine: string;
  chip?: { label: string; color: string };
}

const prettyGame = (g: string) =>
  (g || "")
    .split(/[-\s]+/)
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w))
    .join(" ");

const fmtDate = (d: string) =>
  d
    ? new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : "";

const venueLineOf = (v?: { venue: string; city: string; state: string } | null) =>
  v ? [v.venue, v.city, v.state].filter(Boolean).join(", ") : "";

const rowFromPlayerTournament = (t: PlayerTournament, chip?: Row["chip"]): Row => ({
  tournamentId: t.tournament!.id,
  name: t.tournament!.name,
  game: t.tournament!.game_type,
  date: t.tournament!.tournament_date,
  venueLine: venueLineOf(t.tournament!.venues),
  chip,
});

// One tournament row card (reused inline and in the "View more" modal).
const RowCard = ({
  row,
  fav,
  onOpen,
  onToggleFav,
}: {
  row: Row;
  fav: boolean;
  onOpen: (id: number) => void;
  onToggleFav: (id: number) => void;
}) => (
  <TouchableOpacity
    style={styles.card}
    activeOpacity={0.85}
    onPress={() => onOpen(row.tournamentId)}
  >
    <View style={styles.cardLeft}>
      <View style={styles.gameBadge}>
        <Text allowFontScaling={false} style={styles.gameBadgeText} numberOfLines={1}>
          {prettyGame(row.game)}
        </Text>
      </View>
      <Text allowFontScaling={false} style={styles.cardName} numberOfLines={1}>
        {row.name}
      </Text>
      {!!row.venueLine && (
        <Text allowFontScaling={false} style={styles.cardMeta} numberOfLines={1}>
          {row.venueLine}
        </Text>
      )}
      <Text allowFontScaling={false} style={styles.cardMeta}>
        {fmtDate(row.date)}
      </Text>
    </View>
    <View style={styles.cardRight}>
      {row.chip && (
        <View style={[styles.chip, { backgroundColor: row.chip.color }]}>
          <Text allowFontScaling={false} style={styles.chipText}>
            {row.chip.label}
          </Text>
        </View>
      )}
      <TouchableOpacity hitSlop={8} onPress={() => onToggleFav(row.tournamentId)}>
        <Ionicons
          name={fav ? "heart" : "heart-outline"}
          size={wxMs(22)}
          color={fav ? COLORS.primary : COLORS.textMuted}
        />
      </TouchableOpacity>
    </View>
  </TouchableOpacity>
);

export const MyTournaments = ({
  live,
  registered,
  completed,
  favorites,
  favoritedIds,
  onOpenTournament,
  onToggleFavorite,
  alertsOpen,
  onToggleAlerts,
  userId,
}: {
  live: PlayerTournament[];
  registered: PlayerTournament[];
  completed: PlayerTournament[];
  favorites: FavoriteItem[];
  favoritedIds: Set<number>;
  onOpenTournament: (id: number) => void;
  onToggleFavorite: (tournamentId: number) => void;
  alertsOpen: boolean;
  onToggleAlerts: (open: boolean) => void;
  userId?: number;
}) => {
  const [tab, setTab] = useState<TabKey>(live.length > 0 ? "live" : "registered");
  // "View more" modal for the current filter (full list + search + sort).
  const [moreOpen, setMoreOpen] = useState(false);
  const [moreQuery, setMoreQuery] = useState("");
  const [moreSort, setMoreSort] = useState("date_desc");

  const tabs: { key: TabKey; label: string; count: number; color: string }[] = [
    { key: "live", label: "Live", count: live.length, color: COLORS.error },
    { key: "registered", label: "Registered", count: registered.length, color: COLORS.primary },
    { key: "favorites", label: "Favorites", count: favorites.length, color: "#A855F7" },
    { key: "following", label: "Following", count: 0, color: COLORS.warning },
    { key: "completed", label: "Completed", count: completed.length, color: COLORS.success },
  ];

  const rows: Row[] = useMemo(() => {
    if (tab === "live")
      return live.map((t) => rowFromPlayerTournament(t, { label: "LIVE", color: COLORS.error }));
    if (tab === "registered") return registered.map((t) => rowFromPlayerTournament(t));
    if (tab === "completed")
      return completed.map((t) =>
        rowFromPlayerTournament(t, { label: "Completed", color: COLORS.success }),
      );
    if (tab === "favorites")
      return favorites
        .filter((f) => f.tournaments)
        .map((f) => ({
          tournamentId: f.tournament_id,
          name: f.tournaments!.name,
          game: f.tournaments!.game_type,
          date: f.tournaments!.tournament_date,
          venueLine: venueLineOf(f.tournaments!.venues),
        }));
    return [];
  }, [tab, live, registered, completed, favorites]);

  const currentLabel = `${tabs.find((t) => t.key === tab)?.label ?? ""} Tournaments`;

  // Full list for the "View more" modal — searched (name / city / state / game,
  // game-variant tolerant) + sorted.
  const moreRows = useMemo(() => {
    const nq = normalizeSearch(moreQuery);
    const list = nq
      ? rows.filter(
          (r) =>
            normalizeSearch(r.name).includes(nq) ||
            normalizeSearch(r.venueLine).includes(nq) ||
            normalizeSearch(r.game).includes(nq),
        )
      : [...rows];
    if (moreSort === "name") {
      list.sort((a, b) => a.name.localeCompare(b.name));
    } else {
      list.sort((a, b) => {
        const da = new Date(a.date).getTime();
        const db = new Date(b.date).getTime();
        return moreSort === "date_asc" ? da - db : db - da;
      });
    }
    return list;
  }, [rows, moreQuery, moreSort]);

  const openMore = () => {
    setMoreQuery("");
    setMoreSort("date_desc");
    setMoreOpen(true);
  };

  return (
    <View style={styles.section}>
      {/* My Tournaments / Search Alerts toggle (Search Alerts opens its panel) */}
      <View style={styles.viewToggle}>
        <TouchableOpacity
          activeOpacity={1}
          style={[styles.viewSeg, !alertsOpen && styles.viewSegActive]}
          onPress={() => onToggleAlerts(false)}
        >
          <Text
            allowFontScaling={false}
            style={[styles.viewSegText, !alertsOpen && styles.viewSegTextActive]}
          >
            My Tournaments
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          activeOpacity={1}
          style={[styles.viewSeg, alertsOpen && styles.viewSegActive]}
          onPress={() => onToggleAlerts(true)}
        >
          <Text
            allowFontScaling={false}
            style={[styles.viewSegText, alertsOpen && styles.viewSegTextActive]}
          >
            {"🔍"} Search Alerts
          </Text>
        </TouchableOpacity>
      </View>

      {alertsOpen ? (
        userId != null ? (
          <SearchAlertsInline userId={userId} />
        ) : null
      ) : (
        <>
      {/* Pill-style status filter (Live / Registered / Favorites / Following / Completed) */}
      <View style={styles.filterRow}>
        <StatusFilter
          options={tabs.map((t) => ({
            key: t.key,
            label: `${t.label} Tournaments`,
            count: t.count,
            color: t.color,
          }))}
          value={tab}
          onChange={(k) => setTab(k as TabKey)}
        />
      </View>

      {/* List */}
      {tab === "following" ? (
        <View style={styles.empty}>
          <Text allowFontScaling={false} style={styles.emptyTitle}>
            Following is coming soon
          </Text>
          <Text allowFontScaling={false} style={styles.emptyBody}>
            You&apos;ll be able to follow venues and directors to see their events here
          </Text>
        </View>
      ) : rows.length === 0 ? (
        <View style={styles.empty}>
          <Text allowFontScaling={false} style={styles.emptyTitle}>
            Nothing here yet
          </Text>
          <Text allowFontScaling={false} style={styles.emptyBody}>
            {tab === "favorites"
              ? "Tap the heart on a tournament to save it"
              : tab === "live"
                ? "No tournaments you're in are live right now"
                : "Tournaments you join will show up here"}
          </Text>
        </View>
      ) : (
        <>
          {rows.slice(0, 3).map((r) => (
            <RowCard
              key={r.tournamentId}
              row={r}
              fav={favoritedIds.has(r.tournamentId)}
              onOpen={onOpenTournament}
              onToggleFav={onToggleFavorite}
            />
          ))}
          {rows.length > 3 && (
            <TouchableOpacity style={styles.viewMore} activeOpacity={0.7} onPress={openMore}>
              <Text allowFontScaling={false} style={styles.viewMoreText}>
                View more ({rows.length})
              </Text>
            </TouchableOpacity>
          )}
        </>
      )}
        </>
      )}

      {/* "View more" modal — full list for the current filter, with search + sort */}
      <Modal
        transparent
        visible={moreOpen}
        animationType="slide"
        onRequestClose={() => setMoreOpen(false)}
      >
        <View style={styles.moreBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setMoreOpen(false)} />
          <View style={styles.moreSheet}>
            <View style={styles.moreHeader}>
              <Text allowFontScaling={false} style={styles.moreTitle} numberOfLines={1}>
                {currentLabel}
              </Text>
              <TouchableOpacity onPress={() => setMoreOpen(false)} hitSlop={10}>
                <Text allowFontScaling={false} style={styles.moreClose}>
                  ✕
                </Text>
              </TouchableOpacity>
            </View>
            <View style={styles.moreSearchRow}>
              <TextInput
                allowFontScaling={false}
                style={styles.moreSearch}
                placeholder="Search name, city, state, game"
                placeholderTextColor={COLORS.textMuted}
                value={moreQuery}
                onChangeText={setMoreQuery}
              />
              <View style={styles.moreSortWrap}>
                <Dropdown compact options={MORE_SORTS} value={moreSort} onSelect={setMoreSort} />
              </View>
            </View>
            <ScrollView
              style={styles.moreList}
              contentContainerStyle={styles.moreListContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
            >
              {moreRows.length === 0 ? (
                <Text allowFontScaling={false} style={styles.moreEmpty}>
                  No tournaments match your search
                </Text>
              ) : (
                moreRows.map((r) => (
                  <RowCard
                    key={r.tournamentId}
                    row={r}
                    fav={favoritedIds.has(r.tournamentId)}
                    onOpen={(id) => {
                      setMoreOpen(false);
                      // Let this sheet dismiss before the detail modal presents.
                      setTimeout(() => onOpenTournament(id), 250);
                    }}
                    onToggleFav={onToggleFavorite}
                  />
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  section: { marginHorizontal: wxSc(SPACING.md), marginTop: wxSc(SPACING.lg) },
  filterRow: { marginBottom: wxSc(SPACING.md) },
  viewToggle: {
    flexDirection: "row",
    backgroundColor: COLORS.surface,
    borderRadius: wxSc(RADIUS.lg),
    padding: wxSc(SPACING.xs),
    marginBottom: wxSc(SPACING.md),
  },
  viewSeg: {
    flex: 1,
    paddingVertical: wxSc(SPACING.sm),
    borderRadius: wxSc(RADIUS.md),
    alignItems: "center",
  },
  viewSegActive: { backgroundColor: COLORS.primary },
  viewSegText: { fontSize: wxMs(FONT_SIZES.sm), fontWeight: "700", color: COLORS.textSecondary },
  viewSegTextActive: { color: "#fff" },
  tabsScroll: { marginBottom: wxSc(SPACING.md) },
  tabsRow: { flexDirection: "row", gap: wxSc(SPACING.xs), paddingRight: wxSc(SPACING.xs) },
  tab: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: wxSc(SPACING.xs),
    backgroundColor: COLORS.surface,
    borderRadius: wxSc(RADIUS.full),
    paddingVertical: wxSc(SPACING.sm),
    paddingHorizontal: wxSc(SPACING.md),
  },
  tabText: { fontSize: wxMs(FONT_SIZES.xs), fontWeight: "700", color: COLORS.textSecondary },
  tabTextActive: { color: "#fff" },
  tabCount: {
    minWidth: wxSc(18),
    height: wxSc(18),
    borderRadius: wxSc(9),
    backgroundColor: COLORS.background,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: wxSc(4),
  },
  tabCountActive: { backgroundColor: "rgba(0,0,0,0.25)" },
  tabCountText: { fontSize: 10, fontWeight: "800", color: COLORS.textSecondary },
  tabCountTextActive: { color: "#fff" },
  empty: { alignItems: "center", paddingVertical: wxSc(SPACING.xl) },
  emptyTitle: {
    fontSize: wxMs(FONT_SIZES.md),
    fontWeight: "800",
    color: COLORS.text,
    marginBottom: wxSc(SPACING.xs),
  },
  emptyBody: {
    fontSize: wxMs(FONT_SIZES.sm),
    color: COLORS.textMuted,
    textAlign: "center",
    paddingHorizontal: wxSc(SPACING.lg),
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: COLORS.backgroundCard,
    borderRadius: wxSc(RADIUS.lg),
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: wxSc(SPACING.md),
    marginBottom: wxSc(SPACING.sm),
    gap: wxSc(SPACING.sm),
  },
  cardLeft: { flex: 1, gap: wxSc(2) },
  gameBadge: {
    alignSelf: "flex-start",
    backgroundColor: COLORS.primary + "22",
    borderRadius: wxSc(RADIUS.sm),
    paddingHorizontal: wxSc(SPACING.sm),
    paddingVertical: wxSc(2),
    marginBottom: wxSc(2),
  },
  gameBadgeText: { fontSize: 10, fontWeight: "800", color: COLORS.primary },
  cardName: { fontSize: wxMs(FONT_SIZES.md), fontWeight: "800", color: COLORS.text },
  cardMeta: { fontSize: wxMs(FONT_SIZES.xs), color: COLORS.textSecondary },
  cardRight: { alignItems: "flex-end", gap: wxSc(SPACING.xs) },
  chip: {
    borderRadius: wxSc(RADIUS.sm),
    paddingHorizontal: wxSc(SPACING.sm),
    paddingVertical: wxSc(2),
  },
  chipText: { fontSize: 9, fontWeight: "900", color: "#fff", letterSpacing: 0.5 },
  heart: { fontSize: wxMs(FONT_SIZES.lg) },

  // "View more"
  viewMore: { alignItems: "center", paddingVertical: wxSc(SPACING.sm) },
  viewMoreText: { fontSize: wxMs(FONT_SIZES.sm), fontWeight: "800", color: COLORS.primary },

  // "View more" modal
  moreBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" },
  moreSheet: {
    backgroundColor: COLORS.background,
    borderTopLeftRadius: wxSc(20),
    borderTopRightRadius: wxSc(20),
    borderWidth: 1,
    borderColor: COLORS.border,
    height: "82%",
    paddingHorizontal: wxSc(SPACING.md),
    paddingTop: wxSc(SPACING.md),
    paddingBottom: Platform.OS === "ios" ? wxSc(SPACING.xl) : wxSc(SPACING.md),
  },
  moreHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: wxSc(SPACING.md),
  },
  moreTitle: { flex: 1, fontSize: wxMs(FONT_SIZES.lg), fontWeight: "800", color: COLORS.text },
  moreClose: { fontSize: wxMs(FONT_SIZES.lg), fontWeight: "700", color: COLORS.textSecondary },
  moreSearchRow: { flexDirection: "row", alignItems: "center", gap: wxSc(SPACING.sm), marginBottom: wxSc(SPACING.md) },
  moreSearch: {
    flex: 1,
    height: wxSc(44),
    backgroundColor: COLORS.surface,
    borderRadius: wxSc(RADIUS.md),
    borderWidth: 1,
    borderColor: COLORS.border,
    color: COLORS.text,
    paddingHorizontal: wxSc(SPACING.md),
    paddingVertical: 0,
    fontSize: wxMs(FONT_SIZES.sm),
  },
  moreSortWrap: { width: wxSc(150) },
  moreList: { flex: 1 },
  moreListContent: { paddingBottom: wxSc(SPACING.lg) },
  moreEmpty: {
    textAlign: "center",
    color: COLORS.textMuted,
    fontSize: wxMs(FONT_SIZES.sm),
    paddingVertical: wxSc(SPACING.xl),
  },
});
