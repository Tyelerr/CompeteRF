// src/views/components/tournament/live/MatchesView.tsx
// The live Matches screen: a Card View (default — easiest to manage on a phone)
// and a Bracket View (pinch/pan visual navigation). Both share the same live
// indicators. Match actions (Start / End / Reopen) open lightweight modals.

import { useMemo, useState } from "react";
import {
  Alert,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { COLORS } from "../../../../theme/colors";
import { RADIUS, SPACING } from "../../../../theme/spacing";
import { FONT_SIZES } from "../../../../theme/typography";
import { webMs, webSc } from "../../../../utils/scaling";
import { LiveMatch } from "../../../../utils/match.utils";
import { MatchLiveState } from "../../../../models/types/tournament-settings.types";
import { TournamentTable } from "../../../../models/types/tournament-table.types";
import { Dropdown } from "../../common/dropdown";
import { MatchCard } from "./MatchCard";
import { BracketCanvas } from "./BracketCanvas";

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
  const [startTarget, setStartTarget] = useState<LiveMatch | null>(null);
  const [startTableId, setStartTableId] = useState<number | null>(null);
  const [endTarget, setEndTarget] = useState<LiveMatch | null>(null);
  const [busy, setBusy] = useState(false);

  const tableOptions = useMemo(
    () => [
      { label: "No table", value: "" },
      ...tables
        .filter((t) => t.status !== "unavailable")
        .map((t) => ({
          label:
            (t.label ? `${t.label} ${t.table_number}` : `Table ${t.table_number}`) +
            (t.is_streaming ? " · LIVE" : ""),
          value: String(t.id),
        })),
    ],
    [tables],
  );

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
    } catch {
      Alert.alert("Error", "Could not update the match. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  // ---- Action entry points (shared by cards + nodes) ----
  const handleStart = (m: LiveMatch) => {
    const firstFree = tables.find(
      (t) => t.status !== "unavailable" && !t.match_id,
    );
    setStartTableId(m.tableId ?? firstFree?.id ?? null);
    setStartTarget(m);
  };
  const handleEnd = (m: LiveMatch) => setEndTarget(m);
  const handleReopen = (m: LiveMatch) =>
    Alert.alert("Reopen Match", `Reopen M${m.matchNumber}? It returns to in-progress.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Reopen",
        onPress: () =>
          run(() =>
            onSetMatchState({
              matchNumber: m.matchNumber,
              patch: {
                status: "in_progress",
                winner: null,
                completedAt: null,
                startedAt: m.startedAt ?? new Date().toISOString(),
              },
            }),
          ),
      },
    ]);

  const onNodePress = (m: LiveMatch) => {
    if (m.bye) return;
    if (m.status === "scheduled") handleStart(m);
    else if (m.status === "in_progress") handleEnd(m);
    else handleReopen(m);
  };

  const confirmStart = () =>
    run(async () => {
      if (!startTarget) return;
      await onSetMatchState({
        matchNumber: startTarget.matchNumber,
        patch: {
          status: "in_progress",
          tableId: startTableId,
          startedAt: new Date().toISOString(),
        },
      });
      setStartTarget(null);
    });

  const confirmEnd = (winner: 1 | 2) =>
    run(async () => {
      if (!endTarget) return;
      await onSetMatchState({
        matchNumber: endTarget.matchNumber,
        patch: {
          status: "completed",
          winner,
          completedAt: new Date().toISOString(),
        },
      });
      setEndTarget(null);
    });

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
    <View>
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
        <View>
          {matches.map((m) => (
            <MatchCard
              key={m.matchNumber}
              match={m}
              onStart={handleStart}
              onEnd={handleEnd}
              onReopen={handleReopen}
              busy={busy}
            />
          ))}
        </View>
      ) : (
        <BracketCanvas
          round1={matches}
          bracketSize={bracketSize}
          onNodePress={onNodePress}
        />
      )}

      {/* Start-match modal: pick a table */}
      <Modal
        transparent
        visible={!!startTarget}
        animationType="fade"
        onRequestClose={() => setStartTarget(null)}
      >
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            <Text allowFontScaling={false} style={styles.sheetTitle}>
              Start M{startTarget?.matchNumber}
            </Text>
            <Text allowFontScaling={false} style={styles.sheetSub} numberOfLines={2}>
              {startTarget?.p1Name} vs {startTarget?.p2Name} · {startTarget?.raceLabel}
            </Text>
            <Text allowFontScaling={false} style={styles.fieldLabel}>
              Table
            </Text>
            <Dropdown
              options={tableOptions}
              value={startTableId != null ? String(startTableId) : ""}
              onSelect={(v) => setStartTableId(v ? Number(v) : null)}
            />
            <View style={styles.sheetActions}>
              <TouchableOpacity
                style={[styles.btn, styles.btnGhost]}
                onPress={() => setStartTarget(null)}
                disabled={busy}
              >
                <Text allowFontScaling={false} style={styles.btnGhostText}>
                  Cancel
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btn, styles.btnPrimary, busy && styles.btnDisabled]}
                onPress={confirmStart}
                disabled={busy}
              >
                <Text allowFontScaling={false} style={styles.btnPrimaryText}>
                  {busy ? "..." : "Start"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* End-match modal: pick the winner */}
      <Modal
        transparent
        visible={!!endTarget}
        animationType="fade"
        onRequestClose={() => setEndTarget(null)}
      >
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            <Text allowFontScaling={false} style={styles.sheetTitle}>
              End M{endTarget?.matchNumber} — who won?
            </Text>
            <TouchableOpacity
              style={[styles.winnerBtn, busy && styles.btnDisabled]}
              onPress={() => confirmEnd(1)}
              disabled={busy}
            >
              <Text allowFontScaling={false} style={styles.winnerText}>
                {endTarget?.p1Name ?? "Player 1"}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.winnerBtn, busy && styles.btnDisabled]}
              onPress={() => confirmEnd(2)}
              disabled={busy}
            >
              <Text allowFontScaling={false} style={styles.winnerText}>
                {endTarget?.p2Name ?? "Player 2"}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btn, styles.btnGhost]}
              onPress={() => setEndTarget(null)}
              disabled={busy}
            >
              <Text allowFontScaling={false} style={styles.btnGhostText}>
                Cancel
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  toggle: {
    flexDirection: "row",
    backgroundColor: COLORS.surface,
    borderRadius: webSc(RADIUS.lg),
    padding: webSc(SPACING.xs),
    marginBottom: webSc(SPACING.md),
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: webSc(SPACING.sm),
    borderRadius: webSc(RADIUS.md),
    alignItems: "center",
  },
  toggleBtnActive: { backgroundColor: COLORS.primary },
  toggleText: {
    fontSize: webMs(FONT_SIZES.sm),
    fontWeight: "700",
    color: COLORS.textSecondary,
  },
  toggleTextActive: { color: "#fff" },
  empty: { alignItems: "center", paddingVertical: webSc(SPACING.xl) },
  emptyTitle: {
    fontSize: webMs(FONT_SIZES.lg),
    fontWeight: "800",
    color: COLORS.text,
    marginBottom: webSc(SPACING.xs),
  },
  emptyBody: {
    fontSize: webMs(FONT_SIZES.sm),
    color: COLORS.textMuted,
    textAlign: "center",
  },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    padding: webSc(SPACING.lg),
  },
  sheet: {
    backgroundColor: COLORS.surface,
    borderRadius: webSc(RADIUS.lg),
    padding: webSc(SPACING.lg),
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  sheetTitle: {
    fontSize: webMs(FONT_SIZES.lg),
    fontWeight: "800",
    color: COLORS.text,
    marginBottom: webSc(SPACING.xs),
  },
  sheetSub: {
    fontSize: webMs(FONT_SIZES.sm),
    color: COLORS.textSecondary,
    marginBottom: webSc(SPACING.md),
  },
  fieldLabel: {
    fontSize: webMs(FONT_SIZES.sm),
    color: COLORS.textSecondary,
    fontWeight: "600",
    marginBottom: webSc(SPACING.xs),
  },
  sheetActions: {
    flexDirection: "row",
    gap: webSc(SPACING.sm),
    marginTop: webSc(SPACING.lg),
  },
  btn: {
    flex: 1,
    paddingVertical: webSc(SPACING.sm),
    borderRadius: webSc(RADIUS.md),
    alignItems: "center",
  },
  btnDisabled: { opacity: 0.5 },
  btnPrimary: { backgroundColor: COLORS.primary },
  btnPrimaryText: { color: "#fff", fontWeight: "800", fontSize: webMs(FONT_SIZES.sm) },
  btnGhost: { borderWidth: 1, borderColor: COLORS.border },
  btnGhostText: {
    color: COLORS.textSecondary,
    fontWeight: "700",
    fontSize: webMs(FONT_SIZES.sm),
  },
  winnerBtn: {
    backgroundColor: COLORS.success,
    borderRadius: webSc(RADIUS.md),
    paddingVertical: webSc(SPACING.md),
    alignItems: "center",
    marginBottom: webSc(SPACING.sm),
  },
  winnerText: { color: "#fff", fontWeight: "800", fontSize: webMs(FONT_SIZES.md) },
});
