// src/views/components/tournament/live/MatchActionsModal.tsx
// Unified match action sheet shared by Card View (overflow + primary buttons)
// and Bracket View (node tap). A small menu routes to focused sub-steps:
// table, winner, score, timer, forfeit, withdraw, details.

import { useEffect, useState } from "react";
import {
  Alert,
  Modal,
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
import {
  formatClock,
  LiveMatch,
  MatchActionStep,
} from "../../../../utils/match.utils";
import { MatchLiveState } from "../../../../models/types/tournament-settings.types";
import { TournamentTable } from "../../../../models/types/tournament-table.types";
import { Dropdown } from "../../common/dropdown";

type Step = MatchActionStep;

const now = () => new Date().toISOString();

export const MatchActionsModal = ({
  match,
  initialStep = "menu",
  tables,
  onPatch,
  onClose,
  busy,
}: {
  match: LiveMatch | null;
  initialStep?: Step;
  tables: TournamentTable[];
  onPatch: (matchNumber: number, patch: Partial<MatchLiveState>) => Promise<unknown>;
  onClose: () => void;
  busy: boolean;
}) => {
  const [step, setStep] = useState<Step>(initialStep);
  const [tableId, setTableId] = useState<number | null>(null);
  const [tableMode, setTableMode] = useState<"start" | "assign">("assign");
  const [p1Score, setP1Score] = useState("");
  const [p2Score, setP2Score] = useState("");
  const [timerMin, setTimerMin] = useState("");

  useEffect(() => {
    if (!match) return;
    setStep(initialStep);
    setTableId(match.tableId);
    setP1Score(match.p1Score != null ? String(match.p1Score) : "");
    setP2Score(match.p2Score != null ? String(match.p2Score) : "");
    setTimerMin(
      match.hasCustomTimer ? String(Math.round(match.allowedSeconds / 60)) : "",
    );
  }, [match, initialStep]);

  if (!match) return null;
  const m = match;

  const apply = async (patch: Partial<MatchLiveState>) => {
    await onPatch(m.matchNumber, patch);
    onClose();
  };

  const tableOptions = [
    { label: "No table", value: "" },
    ...tables
      .filter((t) => t.status !== "unavailable")
      .map((t) => ({
        label:
          (t.label ? `${t.label} ${t.table_number}` : `Table ${t.table_number}`) +
          (t.is_streaming ? " · LIVE" : ""),
        value: String(t.id),
      })),
  ];

  // ---- menu items by status ----
  type Item = { label: string; danger?: boolean; onPress: () => void };
  const items: Item[] = [];
  if (m.status === "scheduled") {
    items.push({
      label: "Start Match",
      onPress: () => {
        setTableMode("start");
        setStep("table");
      },
    });
    items.push({ label: "Assign Table", onPress: () => { setTableMode("assign"); setStep("table"); } });
    items.push({ label: "Set Timer", onPress: () => setStep("timer") });
    items.push({ label: "Withdraw", danger: true, onPress: () => setStep("withdraw") });
  } else if (m.status === "in_progress") {
    items.push({ label: "End Match", onPress: () => setStep("winner") });
    items.push({ label: "Edit Score", onPress: () => setStep("score") });
    items.push({ label: "Set Winner", onPress: () => setStep("winner") });
    items.push({ label: "Change Table", onPress: () => { setTableMode("assign"); setStep("table"); } });
    items.push({ label: "Change Timer", onPress: () => setStep("timer") });
    items.push({ label: "Forfeit", danger: true, onPress: () => setStep("forfeit") });
    items.push({ label: "Withdraw", danger: true, onPress: () => setStep("withdraw") });
  } else {
    items.push({ label: "Edit Score", onPress: () => setStep("score") });
    items.push({ label: "Set Winner", onPress: () => setStep("winner") });
    items.push({
      label: "Reopen Match",
      onPress: () =>
        Alert.alert("Reopen Match", `Reopen M${m.matchNumber}? It returns to in-progress.`, [
          { text: "Cancel", style: "cancel" },
          {
            text: "Reopen",
            onPress: () =>
              apply({
                status: "in_progress",
                winner: null,
                completedAt: null,
                result: null,
                startedAt: m.startedAt ?? now(),
              }),
          },
        ]),
    });
  }
  items.push({ label: "View Match Details", onPress: () => setStep("details") });

  const Header = ({ title, back }: { title: string; back?: boolean }) => (
    <View style={styles.sheetHeader}>
      {back ? (
        <TouchableOpacity onPress={() => setStep("menu")} hitSlop={8}>
          <Text allowFontScaling={false} style={styles.backLink}>
            ‹ Back
          </Text>
        </TouchableOpacity>
      ) : (
        <View style={{ width: webSc(44) }} />
      )}
      <Text allowFontScaling={false} style={styles.sheetTitle} numberOfLines={1}>
        {title}
      </Text>
      <TouchableOpacity onPress={onClose} hitSlop={8}>
        <Text allowFontScaling={false} style={styles.closeLink}>
          ✕
        </Text>
      </TouchableOpacity>
    </View>
  );

  const matchTitle = `M${m.matchNumber}`;
  const namesLine = m.bye
    ? `${m.p1Name ?? m.p2Name ?? "TBD"} (bye)`
    : `${m.p1Name ?? "TBD"} vs ${m.p2Name ?? "TBD"}`;

  const PlayerPick = ({
    onPick,
    actionLabel,
  }: {
    onPick: (slot: 1 | 2) => void;
    actionLabel: string;
  }) => (
    <>
      <TouchableOpacity
        style={[styles.bigBtn, busy && styles.disabled]}
        onPress={() => onPick(1)}
        disabled={busy}
      >
        <Text allowFontScaling={false} style={styles.bigBtnText}>
          {actionLabel}: {m.p1Name ?? "Player 1"}
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.bigBtn, busy && styles.disabled]}
        onPress={() => onPick(2)}
        disabled={busy}
      >
        <Text allowFontScaling={false} style={styles.bigBtnText}>
          {actionLabel}: {m.p2Name ?? "Player 2"}
        </Text>
      </TouchableOpacity>
    </>
  );

  return (
    <Modal transparent visible animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          {step === "menu" && (
            <>
              <Header title={`${matchTitle} actions`} />
              <Text allowFontScaling={false} style={styles.sub} numberOfLines={1}>
                {namesLine}
              </Text>
              <ScrollView style={styles.menuScroll}>
                {items.map((it) => (
                  <TouchableOpacity
                    key={it.label}
                    style={styles.menuRow}
                    onPress={it.onPress}
                    disabled={busy}
                  >
                    <Text
                      allowFontScaling={false}
                      style={[styles.menuLabel, it.danger && styles.menuDanger]}
                    >
                      {it.label}
                    </Text>
                    <Text allowFontScaling={false} style={styles.chev}>
                      ›
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </>
          )}

          {step === "table" && (
            <>
              <Header title={tableMode === "start" ? "Start match" : "Assign table"} back />
              <Text allowFontScaling={false} style={styles.fieldLabel}>
                Table
              </Text>
              <Dropdown
                options={tableOptions}
                value={tableId != null ? String(tableId) : ""}
                onSelect={(v) => setTableId(v ? Number(v) : null)}
              />
              <TouchableOpacity
                style={[styles.bigBtn, styles.primary, busy && styles.disabled]}
                disabled={busy}
                onPress={() =>
                  apply(
                    tableMode === "start"
                      ? { status: "in_progress", tableId, startedAt: m.startedAt ?? now() }
                      : { tableId },
                  )
                }
              >
                <Text allowFontScaling={false} style={styles.bigBtnText}>
                  {tableMode === "start" ? "Start Match" : "Save Table"}
                </Text>
              </TouchableOpacity>
            </>
          )}

          {step === "winner" && (
            <>
              <Header title="Set winner" back />
              <PlayerPick
                actionLabel="Winner"
                onPick={(slot) =>
                  apply({
                    status: "completed",
                    winner: slot,
                    completedAt: m.completedAt ?? now(),
                    result: m.result ?? "normal",
                  })
                }
              />
            </>
          )}

          {step === "score" && (
            <>
              <Header title="Edit score" back />
              <View style={styles.scoreRow}>
                <View style={styles.scoreCol}>
                  <Text allowFontScaling={false} style={styles.scoreName} numberOfLines={1}>
                    {m.p1Name ?? "P1"}
                  </Text>
                  <TextInput
                    allowFontScaling={false}
                    style={styles.scoreInput}
                    value={p1Score}
                    onChangeText={(v) => setP1Score(v.replace(/[^0-9]/g, ""))}
                    keyboardType="numeric"
                    maxLength={2}
                    placeholder="0"
                    placeholderTextColor={COLORS.textMuted}
                  />
                </View>
                <Text allowFontScaling={false} style={styles.scoreDash}>
                  –
                </Text>
                <View style={styles.scoreCol}>
                  <Text allowFontScaling={false} style={styles.scoreName} numberOfLines={1}>
                    {m.p2Name ?? "P2"}
                  </Text>
                  <TextInput
                    allowFontScaling={false}
                    style={styles.scoreInput}
                    value={p2Score}
                    onChangeText={(v) => setP2Score(v.replace(/[^0-9]/g, ""))}
                    keyboardType="numeric"
                    maxLength={2}
                    placeholder="0"
                    placeholderTextColor={COLORS.textMuted}
                  />
                </View>
              </View>
              <TouchableOpacity
                style={[styles.bigBtn, styles.primary, busy && styles.disabled]}
                disabled={busy}
                onPress={() =>
                  apply({
                    p1Score: p1Score === "" ? null : Number(p1Score),
                    p2Score: p2Score === "" ? null : Number(p2Score),
                  })
                }
              >
                <Text allowFontScaling={false} style={styles.bigBtnText}>
                  Save Score
                </Text>
              </TouchableOpacity>
            </>
          )}

          {step === "timer" && (
            <>
              <Header title="Match timer" back />
              <Text allowFontScaling={false} style={styles.fieldLabel}>
                Allowed minutes (blank = auto)
              </Text>
              <TextInput
                allowFontScaling={false}
                style={styles.input}
                value={timerMin}
                onChangeText={(v) => setTimerMin(v.replace(/[^0-9]/g, ""))}
                keyboardType="numeric"
                maxLength={3}
                placeholder="Auto"
                placeholderTextColor={COLORS.textMuted}
              />
              <TouchableOpacity
                style={[styles.bigBtn, styles.primary, busy && styles.disabled]}
                disabled={busy}
                onPress={() =>
                  apply({
                    timerSeconds: timerMin === "" ? null : Number(timerMin) * 60,
                  })
                }
              >
                <Text allowFontScaling={false} style={styles.bigBtnText}>
                  Save Timer
                </Text>
              </TouchableOpacity>
            </>
          )}

          {step === "forfeit" && (
            <>
              <Header title="Forfeit — who forfeits?" back />
              <PlayerPick
                actionLabel="Forfeits"
                onPick={(slot) =>
                  apply({
                    status: "completed",
                    winner: slot === 1 ? 2 : 1,
                    result: "forfeit",
                    completedAt: now(),
                  })
                }
              />
            </>
          )}

          {step === "withdraw" && (
            <>
              <Header title="Withdraw — who withdraws?" back />
              <PlayerPick
                actionLabel="Withdraws"
                onPick={(slot) =>
                  apply({
                    status: "completed",
                    winner: slot === 1 ? 2 : 1,
                    result: "withdraw",
                    completedAt: now(),
                  })
                }
              />
            </>
          )}

          {step === "details" && (
            <>
              <Header title={`${matchTitle} details`} back />
              <View style={styles.detailBox}>
                <Detail label="Players" value={namesLine} />
                <Detail label="Race" value={m.raceLabel} />
                <Detail label="Table" value={m.tableLabel ?? "Unassigned"} />
                <Detail
                  label="Status"
                  value={
                    m.status === "in_progress"
                      ? "In progress"
                      : m.status === "completed"
                        ? `Completed${m.result && m.result !== "normal" ? ` (${m.result})` : ""}`
                        : "Not started"
                  }
                />
                {(m.p1Score != null || m.p2Score != null) && (
                  <Detail label="Score" value={`${m.p1Score ?? 0} – ${m.p2Score ?? 0}`} />
                )}
                {m.winner && (
                  <Detail
                    label="Winner"
                    value={(m.winner === 1 ? m.p1Name : m.p2Name) ?? "—"}
                  />
                )}
                <Detail
                  label="Allowed time"
                  value={`${formatClock(m.allowedSeconds)}${m.hasCustomTimer ? " (custom)" : ""}`}
                />
                {m.isStream && <Detail label="Stream" value="LIVE / stream table" />}
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
};

const Detail = ({ label, value }: { label: string; value: string }) => (
  <View style={styles.detailRow}>
    <Text allowFontScaling={false} style={styles.detailLabel}>
      {label}
    </Text>
    <Text allowFontScaling={false} style={styles.detailValue} numberOfLines={2}>
      {value}
    </Text>
  </View>
);

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
    padding: webSc(SPACING.lg),
  },
  sheet: {
    width: "100%",
    maxWidth: webSc(440),
    backgroundColor: COLORS.surface,
    borderRadius: webSc(RADIUS.xl),
    padding: webSc(SPACING.lg),
    borderWidth: 1,
    borderColor: COLORS.border,
    maxHeight: "82%",
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: webSc(SPACING.sm),
  },
  sheetTitle: {
    fontSize: webMs(FONT_SIZES.lg),
    fontWeight: "800",
    color: COLORS.text,
    flex: 1,
    textAlign: "center",
  },
  backLink: { color: COLORS.primary, fontSize: webMs(FONT_SIZES.md), fontWeight: "700", width: webSc(44) },
  closeLink: { color: COLORS.textSecondary, fontSize: webMs(FONT_SIZES.lg), fontWeight: "700" },
  sub: {
    fontSize: webMs(FONT_SIZES.sm),
    color: COLORS.textSecondary,
    textAlign: "center",
    marginBottom: webSc(SPACING.md),
  },
  menuScroll: { maxHeight: webSc(380) },
  menuRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: webSc(SPACING.md),
    borderBottomWidth: 1,
    borderColor: COLORS.border,
  },
  menuLabel: { fontSize: webMs(FONT_SIZES.md), color: COLORS.text, fontWeight: "600" },
  menuDanger: { color: COLORS.error },
  chev: { fontSize: webMs(FONT_SIZES.lg), color: COLORS.textMuted },
  fieldLabel: {
    fontSize: webMs(FONT_SIZES.sm),
    color: COLORS.textSecondary,
    fontWeight: "600",
    marginBottom: webSc(SPACING.xs),
  },
  input: {
    backgroundColor: COLORS.background,
    borderRadius: webSc(RADIUS.md),
    borderWidth: 1,
    borderColor: COLORS.border,
    color: COLORS.text,
    paddingHorizontal: webSc(SPACING.md),
    paddingVertical: webSc(SPACING.sm),
    fontSize: webMs(FONT_SIZES.md),
  },
  bigBtn: {
    backgroundColor: COLORS.success,
    borderRadius: webSc(RADIUS.md),
    paddingVertical: webSc(SPACING.md),
    alignItems: "center",
    marginTop: webSc(SPACING.md),
  },
  primary: { backgroundColor: COLORS.primary },
  disabled: { opacity: 0.5 },
  bigBtnText: { color: "#fff", fontWeight: "800", fontSize: webMs(FONT_SIZES.md) },
  scoreRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "center",
    gap: webSc(SPACING.md),
    marginTop: webSc(SPACING.sm),
  },
  scoreCol: { alignItems: "center", flex: 1 },
  scoreName: { fontSize: webMs(FONT_SIZES.sm), color: COLORS.textSecondary, marginBottom: webSc(SPACING.xs) },
  scoreInput: {
    backgroundColor: COLORS.background,
    borderRadius: webSc(RADIUS.md),
    borderWidth: 1,
    borderColor: COLORS.border,
    color: COLORS.text,
    fontSize: webMs(FONT_SIZES.xxl),
    fontWeight: "800",
    textAlign: "center",
    width: webSc(80),
    paddingVertical: webSc(SPACING.sm),
  },
  scoreDash: { fontSize: webMs(FONT_SIZES.xl), color: COLORS.textMuted, marginBottom: webSc(SPACING.md) },
  detailBox: { marginTop: webSc(SPACING.xs) },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: webSc(SPACING.sm),
    borderBottomWidth: 1,
    borderColor: COLORS.border,
    gap: webSc(SPACING.md),
  },
  detailLabel: { fontSize: webMs(FONT_SIZES.sm), color: COLORS.textMuted },
  detailValue: { fontSize: webMs(FONT_SIZES.sm), color: COLORS.text, fontWeight: "600", flex: 1, textAlign: "right" },
});
