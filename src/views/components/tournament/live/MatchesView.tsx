// src/views/components/tournament/live/MatchesView.tsx
// The live Matches screen: a Card View (default — easiest to manage on a phone)
// and a Bracket View (pinch/pan visual navigation). Both share one match action
// sheet (MatchActionsModal). Fills available height; Card View scrolls itself.

import { useState } from "react";
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
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
import { MatchCard } from "./MatchCard";
import { BracketCanvas } from "./BracketCanvas";
import { MatchActionsModal } from "./MatchActionsModal";

type ViewMode = "cards" | "bracket";

export const MatchesView = ({
  matches,
  tables,
  bracketSize,
  onSetMatchState,
}: {
  matches: LiveMatch[];
  tables: TournamentTable[];
  bracketSize: number;
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
        <ScrollView
          style={styles.cardsScroll}
          contentContainerStyle={styles.cardsContent}
          showsVerticalScrollIndicator={false}
        >
          {matches.map((m) => (
            <MatchCard key={m.matchNumber} match={m} onAction={openSheet} busy={busy} />
          ))}
        </ScrollView>
      ) : (
        <View style={styles.bracketWrap}>
          <BracketCanvas
            round1={matches}
            bracketSize={bracketSize}
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
  cardsScroll: { flex: 1 },
  cardsContent: { paddingHorizontal: webSc(SPACING.md), paddingBottom: webSc(SPACING.xl) },
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
