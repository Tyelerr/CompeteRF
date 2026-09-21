// src/views/components/tournament/live/MatchesView.tsx
// The live Matches screen: a Card View (default — easiest to manage on a phone)
// and a Bracket View (pinch/pan visual navigation). Both share one match action
// sheet (MatchActionsModal). Fills available height; Card View scrolls itself.

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Keyboard,
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
import { LiveMatch, MatchActionStep } from "../../../../utils/match.utils";
import {
  MatchLiveState,
  RaceGroup,
} from "../../../../models/types/tournament-settings.types";
import { TournamentTable } from "../../../../models/types/tournament-table.types";
import { Dropdown } from "../../common/dropdown";
import { Pagination } from "../../common/pagination";
import { usePagination } from "../../../../viewmodels/usePagination";
import { MatchCard } from "./MatchCard";
import { useLiveNow } from "../../../../viewmodels/hooks/use.live.now";
import { BracketCanvas } from "./BracketCanvas";
import { MatchActionsModal } from "./MatchActionsModal";
import { SpectatorMatchModal } from "./SpectatorMatchModal";

const isWeb = Platform.OS === "web";
// Same centered content width the other admin Setup pages use (Players/Pool Tables), so the
// Live page sits in the same contained column with black gutters on wide screens.

type ViewMode = "cards" | "bracket";
type CardFilter = "all" | "scheduled" | "in_progress" | "completed" | "bye";

const FILTERS = [
  { label: "All Matches", value: "all" },
  { label: "Not Started", value: "scheduled" },
  { label: "In Progress", value: "in_progress" },
  { label: "Completed", value: "completed" },
  { label: "Byes", value: "bye" },
];

export const MatchesView = ({
  matches,
  tables,
  onSetMatchState,
  readOnly,
  groups,
  initialMode,
  occupancy,
  focusMatchId,
  focusKey,
  highlightRegId,
}: {
  matches: LiveMatch[];
  tables: TournamentTable[];
  onSetMatchState?: (vars: {
    matchId: string;
    patch: Partial<MatchLiveState>;
  }) => Promise<unknown>;
  // Spectator mode: no management actions; tapping a card/node opens a read-only
  // detail. `groups` feeds the detail's race-group labels (groups mode only).
  readOnly?: boolean;
  groups?: RaceGroup[];
  initialMode?: ViewMode; // open straight to "bracket" or "cards"
  // tableId -> match label currently on it (blocks double-booking in the picker).
  occupancy?: Record<number, string>;
  // When set, the bracket opens centered on this match.
  focusMatchId?: string | null;
  focusKey?: string | number; // changing this re-centers on the focus match
  highlightRegId?: number | null; // viewer's reg id — green/red borders their matches
}) => {
  const [mode, setMode] = useState<ViewMode>(initialMode ?? "cards"); // Card View is the default
  // The toggle highlight uses `mode` (instant); the heavy view content uses the
  // deferred value, so tapping the toggle updates the button immediately while the
  // bracket mounts a beat later (no "stuck/greyed" highlight during the render).
  const viewMode = useDeferredValue(mode);
  const [sheet, setSheet] = useState<{ match: LiveMatch; step: MatchActionStep } | null>(
    null,
  );
  const [detail, setDetail] = useState<LiveMatch | null>(null); // read-only popup
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<CardFilter>("all");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return matches.filter((m) => {
      if (m.empty) return false; // dead slots (both feeders were byes)
      if (filter === "bye") {
        if (!m.bye) return false;
      } else if (filter !== "all" && (m.bye || m.status !== filter)) {
        return false;
      }
      if (q) {
        const hay = `${m.p1Name ?? ""} ${m.p2Name ?? ""} ${m.label} ${m.tableLabel ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [matches, query, filter]);

  // One shared per-second ticker for live elapsed clocks — runs only while a match
  // is in progress, cleaned up otherwise. Passed to each MatchCard so its timer
  // visibly advances (no per-card interval).
  const hasLive = useMemo(() => matches.some((m) => m.status === "in_progress"), [matches]);
  const now = useLiveNow(hasLive);

  // Web/desktop dense layout: compact toggle beside pagination, paginated compact cards.
  const { width: winW } = useWindowDimensions();
  const desktop = isWeb && winW >= 980;
  // Card View columns: 3 on wide desktop, 2 on medium desktop/tablet web. Widths
  // account for the fixed gap (SPACING.md = 16) so rows LEFT-PACK cleanly — an
  // incomplete last row leaves the trailing column empty instead of spreading.
  const cardCols = winW >= 1200 ? 3 : 2;
  const cardColWidth =
    cardCols === 3 ? ("calc((100% - 32px) / 3)" as any) : ("calc((100% - 16px) / 2)" as any);
  const pager = usePagination(filtered, { itemsPerPage: 20 });
  // Reset to page 1 whenever the search or filter changes (so results start at the top).
  useEffect(() => {
    pager.resetPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, filter]);

  const openSheet = (m: LiveMatch, step: MatchActionStep) => setSheet({ match: m, step });

  const onPatch = async (matchId: string, patch: Partial<MatchLiveState>) => {
    if (!onSetMatchState) return;
    setBusy(true);
    try {
      await onSetMatchState({ matchId, patch });
    } catch {
      Alert.alert("Error", "Could not update the match. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  if (matches.length === 0) {
    return (
      <View style={styles.empty}>
        <Text allowFontScaling={false} style={styles.emptyTitle}>
          No matches yet
        </Text>
        <Text allowFontScaling={false} style={styles.emptyBody}>
          Draw the bracket on the Bracket / Draw tab to generate matches.
        </Text>
      </View>
    );
  }

  // Compact segmented Cards | Bracket toggle (desktop) — reuses the SAME mode state/handlers.
  const compactToggle = (
    <View style={styles.segToggle}>
      {(["cards", "bracket"] as ViewMode[]).map((m) => (
        <TouchableOpacity
          key={m}
          activeOpacity={1}
          style={[styles.segBtn, mode === m && styles.segBtnActive]}
          onPress={() => {
            Keyboard.dismiss();
            setMode(m);
          }}
        >
          <Text allowFontScaling={false} style={[styles.segText, mode === m && styles.segTextActive]}>
            {m === "cards" ? "Card View" : "Bracket View"}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
  const pagerNode = (rightAccessory?: React.ReactNode) => (
    <Pagination
      totalCount={pager.totalCount}
      displayStart={pager.displayRange.start}
      displayEnd={pager.displayRange.end}
      currentPage={pager.currentPage}
      totalPages={pager.totalPages}
      onPrevPage={pager.prevPage}
      onNextPage={pager.nextPage}
      canGoPrev={pager.canGoPrev}
      canGoNext={pager.canGoNext}
      noun="matches"
      rightAccessory={rightAccessory}
    />
  );

  if (desktop) {
    return (
      <View style={styles.root}>
       <View style={styles.webContainer}>
        {viewMode === "cards" ? (
          <View style={styles.cardsWrap}>
            <View style={styles.searchRowDesktop}>
              <TextInput
                allowFontScaling={false}
                style={styles.searchDesktop}
                placeholder="Search player, M#, or table"
                placeholderTextColor={COLORS.textMuted}
                value={query}
                onChangeText={setQuery}
              />
              <View style={styles.filterWrapDesktop}>
                <Dropdown
                  hideCheck
                  selectedBlueText
                  options={FILTERS}
                  value={filter}
                  onSelect={(v) => setFilter(v as CardFilter)}
                />
              </View>
              {/* One toggle per view: Card View's lives here (right of search/filter). */}
              <View style={styles.toggleRight}>{compactToggle}</View>
            </View>
            {filtered.length === 0 ? (
              <Text allowFontScaling={false} style={styles.noResults}>
                No matches for this search / filter.
              </Text>
            ) : (
              <>
                {pagerNode()}
                <ScrollView
                  style={styles.cardsScroll}
                  contentContainerStyle={[styles.cardsContent, styles.cardsGridDesktop]}
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                >
                  {pager.paginatedItems.map((m) => (
                    <View key={m.id} style={[styles.cardCell, { width: cardColWidth }]}>
                      {readOnly ? (
                        <MatchCard match={m} readOnly onPress={() => setDetail(m)} compact now={now} />
                      ) : (
                        <MatchCard match={m} onAction={openSheet} busy={busy} compact now={now} />
                      )}
                    </View>
                  ))}
                </ScrollView>
                {pagerNode()}
              </>
            )}
          </View>
        ) : (
          <View style={styles.bracketWrapDesktop}>
            <BracketCanvas
              matches={matches}
              onNodePress={(m) => (readOnly ? setDetail(m) : openSheet(m, "menu"))}
              focusMatchId={focusMatchId}
              focusKey={focusKey}
              highlightRegId={highlightRegId}
              rightAccessory={compactToggle}
            />
          </View>
        )}
       </View>

        {!readOnly && sheet && (
          <MatchActionsModal
            match={sheet.match}
            initialStep={sheet.step}
            tables={tables}
            occupancy={occupancy}
            onPatch={onPatch}
            onClose={() => setSheet(null)}
            busy={busy}
          />
        )}
        {readOnly && (
          <SpectatorMatchModal match={detail} groups={groups} onClose={() => setDetail(null)} />
        )}
      </View>
    );
  }

  return (
    <View style={styles.root}>
      {/* View toggle: Cards | Bracket */}
      <View style={styles.toggle}>
        {(["cards", "bracket"] as ViewMode[]).map((m) => (
          <TouchableOpacity
            key={m}
            activeOpacity={1}
            style={[styles.toggleBtn, mode === m && styles.toggleBtnActive]}
            onPress={() => {
              Keyboard.dismiss();
              setMode(m);
            }}
          >
            <Text
              allowFontScaling={false}
              style={[styles.toggleText, mode === m && styles.toggleTextActive]}
            >
              {m === "cards" ? "Card View" : "Bracket View"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {viewMode === "cards" ? (
        <View style={styles.cardsWrap}>
          <View style={styles.searchRow}>
            <TextInput
              allowFontScaling={false}
              style={styles.search}
              placeholder="Search player, M#, or table"
              placeholderTextColor={COLORS.textMuted}
              value={query}
              onChangeText={setQuery}
            />
            <View style={styles.filterWrap}>
              <Dropdown
                compact
                options={FILTERS}
                value={filter}
                onSelect={(v) => setFilter(v as CardFilter)}
              />
            </View>
          </View>
          <ScrollView
            style={styles.cardsScroll}
            contentContainerStyle={[
              styles.cardsContent,
              isWeb && styles.cardsGrid,
            ]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
          >
            {filtered.length === 0 ? (
              <Text allowFontScaling={false} style={styles.noResults}>
                No matches for this search / filter.
              </Text>
            ) : (
              filtered.map((m) => (
                <View
                  key={m.id}
                  style={isWeb ? styles.cardCell : undefined}
                >
                  {readOnly ? (
                    <MatchCard match={m} readOnly onPress={() => setDetail(m)} now={now} />
                  ) : (
                    <MatchCard match={m} onAction={openSheet} busy={busy} now={now} />
                  )}
                </View>
              ))
            )}
          </ScrollView>
        </View>
      ) : (
        <View style={styles.bracketWrap}>
          <BracketCanvas
            matches={matches}
            onNodePress={(m) => (readOnly ? setDetail(m) : openSheet(m, "menu"))}
            focusMatchId={focusMatchId}
            focusKey={focusKey}
            highlightRegId={highlightRegId}
          />
        </View>
      )}

      {!readOnly && sheet && (
        <MatchActionsModal
          match={sheet.match}
          initialStep={sheet.step}
          tables={tables}
          occupancy={occupancy}
          onPatch={onPatch}
          onClose={() => setSheet(null)}
          busy={busy}
        />
      )}

      {readOnly && (
        <SpectatorMatchModal
          match={detail}
          groups={groups}
          onClose={() => setDetail(null)}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1 },
  // Centered contained column (matches Players/Pool Tables): black gutters on wide screens.
  webContainer: { flex: 1, width: "100%" as any, maxWidth: WEB_MAXW, alignSelf: "center" as any },
  toggle: {
    flexDirection: "row",
    backgroundColor: COLORS.surface,
    borderRadius: webSc(RADIUS.lg),
    padding: webSc(SPACING.xs),
    marginHorizontal: webSc(SPACING.md),
    marginTop: webSc(SPACING.sm),
    marginBottom: webSc(SPACING.sm),
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: webSc(SPACING.sm),
    borderRadius: webSc(RADIUS.md),
    alignItems: "center",
  },
  toggleBtnActive: { backgroundColor: COLORS.primary },
  toggleText: { fontSize: webMs(FONT_SIZES.sm), fontWeight: "700", color: COLORS.textSecondary },
  toggleTextActive: { color: "#fff" },
  cardsWrap: { flex: 1 },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: webSc(SPACING.sm),
    paddingHorizontal: webSc(SPACING.md),
    marginBottom: webSc(SPACING.sm),
  },
  search: {
    flex: 1,
    height: webSc(44), // match the filter Dropdown's selector height
    backgroundColor: COLORS.surface,
    borderRadius: webSc(RADIUS.md),
    borderWidth: 1,
    borderColor: COLORS.border,
    color: COLORS.text,
    paddingHorizontal: webSc(SPACING.md),
    paddingVertical: 0,
    fontSize: webMs(FONT_SIZES.sm),
  },
  filterWrap: { width: webSc(150) },
  // ── Desktop compact layout ──
  segToggle: { flexDirection: "row", borderWidth: 1, borderColor: COLORS.border, borderRadius: webSc(RADIUS.sm), overflow: "hidden" },
  segBtn: { minWidth: 100, height: 38, paddingHorizontal: webSc(SPACING.md), alignItems: "center", justifyContent: "center" },
  segBtnActive: { backgroundColor: COLORS.primary },
  segText: { color: COLORS.textSecondary, fontSize: webMs(FONT_SIZES.sm), fontWeight: "700" },
  segTextActive: { color: COLORS.white },
  searchRowDesktop: {
    flexDirection: "row",
    alignItems: "center",
    gap: webSc(SPACING.sm),
    paddingHorizontal: webSc(SPACING.md),
    paddingTop: webSc(SPACING.sm),
    marginBottom: webSc(SPACING.sm),
  },
  searchDesktop: {
    width: 320,
    height: 40,
    backgroundColor: COLORS.surface,
    borderRadius: webSc(RADIUS.md),
    borderWidth: 1,
    borderColor: COLORS.border,
    color: COLORS.text,
    paddingHorizontal: webSc(SPACING.md),
    paddingVertical: 0,
    fontSize: webMs(FONT_SIZES.sm),
    ...(Platform.OS === "web" ? ({ outlineStyle: "none", outlineWidth: 0 } as object) : null),
  },
  filterWrapDesktop: { width: 200 },
  toggleRight: { marginLeft: "auto" as any },
  // Desktop bracket wrapper: same top gap as the Card View search row (searchRowDesktop
  // paddingTop) so the toolbar sits at the SAME Y in both views and doesn't touch the phase nav.
  bracketWrapDesktop: {
    flex: 1,
    paddingHorizontal: webSc(SPACING.md),
    paddingTop: webSc(SPACING.sm),
    paddingBottom: webSc(SPACING.sm),
  },
  cardsScroll: { flex: 1 },
  cardsContent: { paddingHorizontal: webSc(SPACING.md), paddingBottom: webSc(SPACING.xl) },
  // Web: two match cards per row.
  cardsGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" },
  // Desktop card grid: left-packed with a fixed gap (no space-between), so an
  // incomplete last row leaves the trailing column(s) empty instead of spreading.
  cardsGridDesktop: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "stretch",
    gap: webSc(SPACING.md),
  },
  cardCell: { width: "49%" },
  noResults: {
    textAlign: "center",
    color: COLORS.textMuted,
    fontSize: webMs(FONT_SIZES.sm),
    paddingVertical: webSc(SPACING.xl),
  },
  bracketWrap: { flex: 1, paddingHorizontal: webSc(SPACING.md), paddingBottom: webSc(SPACING.sm) },
  empty: { alignItems: "center", paddingVertical: webSc(SPACING.xl) },
  emptyTitle: {
    fontSize: webMs(FONT_SIZES.lg),
    fontWeight: "800",
    color: COLORS.text,
    marginBottom: webSc(SPACING.xs),
  },
  emptyBody: { fontSize: webMs(FONT_SIZES.sm), color: COLORS.textMuted, textAlign: "center" },
});
