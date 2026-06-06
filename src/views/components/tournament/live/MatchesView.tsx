// src/views/components/tournament/live/MatchesView.tsx
// The live Matches screen: a Card View (default — easiest to manage on a phone)
// and a Bracket View (pinch/pan visual navigation). Both share one match action
// sheet (MatchActionsModal). Fills available height; Card View scrolls itself.

import { useMemo, useState } from "react";
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { COLORS } from "../../../../theme/colors";
import { RADIUS, SPACING } from "../../../../theme/spacing";
import { FONT_SIZES } from "../../../../theme/typography";
import { webMs, webSc } from "../../../../utils/scaling";
import { LiveMatch, MatchActionStep } from "../../../../utils/match.utils";
import { MatchLiveState } from "../../../../models/types/tournament-settings.types";
import { TournamentTable } from "../../../../models/types/tournament-table.types";
import { Dropdown } from "../../common/dropdown";
import { MatchCard } from "./MatchCard";
import { BracketCanvas } from "./BracketCanvas";
import { MatchActionsModal } from "./MatchActionsModal";

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
  bracketSize,
  format,
  onSetMatchState,
}: {
  matches: LiveMatch[];
  tables: TournamentTable[];
  bracketSize: number;
  format?: string;
  onSetMatchState: (vars: {
    matchNumber: number;
    patch: Partial<MatchLiveState>;
  }) => Promise<unknown>;
}) => {
  const [mode, setMode] = useState<ViewMode>("cards"); // Card View is the default
  const [sheet, setSheet] = useState<{ match: LiveMatch; step: MatchActionStep } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<CardFilter>("all");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return matches.filter((m) => {
      if (filter === "bye") {
        if (!m.bye) return false;
      } else if (filter !== "all" && (m.bye || m.status !== filter)) {
        return false;
      }
      if (q) {
        const hay = `${m.p1Name ?? ""} ${m.p2Name ?? ""} m${m.matchNumber} ${m.matchNumber} ${m.tableLabel ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [matches, query, filter]);

  const openSheet = (m: LiveMatch, step: MatchActionStep) => setSheet({ match: m, step });

  const onPatch = async (matchNumber: number, patch: Partial<MatchLiveState>) => {
    setBusy(true);
    try {
      await onSetMatchState({ matchNumber, patch });
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

  return (
    <View style={styles.root}>
      {/* View toggle: Cards | Bracket */}
      <View style={styles.toggle}>
        {(["cards", "bracket"] as ViewMode[]).map((m) => (
          <TouchableOpacity
            key={m}
            style={[styles.toggleBtn, mode === m && styles.toggleBtnActive]}
            onPress={() => setMode(m)}
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

      {mode === "cards" ? (
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
            contentContainerStyle={styles.cardsContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {filtered.length === 0 ? (
              <Text allowFontScaling={false} style={styles.noResults}>
                No matches for this search / filter.
              </Text>
            ) : (
              filtered.map((m) => (
                <MatchCard key={m.matchNumber} match={m} onAction={openSheet} busy={busy} />
              ))
            )}
          </ScrollView>
        </View>
      ) : (
        <View style={styles.bracketWrap}>
          <BracketCanvas
            round1={matches}
            bracketSize={bracketSize}
            format={format}
            onNodePress={(m) => openSheet(m, "menu")}
          />
        </View>
      )}

      {sheet && (
        <MatchActionsModal
          match={sheet.match}
          initialStep={sheet.step}
          tables={tables}
          onPatch={onPatch}
          onClose={() => setSheet(null)}
          busy={busy}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1 },
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
    backgroundColor: COLORS.surface,
    borderRadius: webSc(RADIUS.md),
    borderWidth: 1,
    borderColor: COLORS.border,
    color: COLORS.text,
    paddingHorizontal: webSc(SPACING.md),
    paddingVertical: webSc(SPACING.sm),
    fontSize: webMs(FONT_SIZES.sm),
  },
  filterWrap: { width: webSc(150) },
  cardsScroll: { flex: 1 },
  cardsContent: { paddingHorizontal: webSc(SPACING.md), paddingBottom: webSc(SPACING.xl) },
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
