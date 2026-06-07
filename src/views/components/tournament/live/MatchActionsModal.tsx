// src/views/components/tournament/live/MatchActionsModal.tsx
// Unified match action sheet shared by Card View (overflow + primary buttons)
// and Bracket View (node tap). A small menu routes to focused sub-steps:
// table, winner, score, timer, forfeit, withdraw, details.

import { useEffect, useState } from "react";
import {
  Alert,
  Modal,
  Pressable,
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
import { useMatchTimer } from "./useMatchTimer";

type Step = MatchActionStep;

const now = () => new Date().toISOString();

// Increment/decrement a numeric string field, clamped.
const bump = (val: string, delta: number, min = 0, max = 99): string => {
  const n = parseInt(val || "0", 10) || 0;
  return String(Math.min(max, Math.max(min, n + delta)));
};

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
  onPatch: (matchId: string, patch: Partial<MatchLiveState>) => Promise<unknown>;
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

  // Live ticking timer lives here (a single instance) rather than on every card.
  const timer = useMatchTimer(
    match?.startedAt ?? null,
    match?.allowedSeconds ?? 0,
    match?.status === "in_progress",
    match?.completedAt ?? null,
  );

  if (!match) return null;
  const m = match;

  const apply = async (patch: Partial<MatchLiveState>) => {
    await onPatch(m.id, patch);
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
  // A bye auto-advances; start/score/table/timer don't apply. The advancing
  // player can still forfeit or withdraw (both remove them — a bye has no
  // opponent to award a loss to, so the player simply doesn't advance).
  if (m.bye) {
    items.push({ label: "View Match Details", onPress: () => setStep("details") });
    items.push({
      label: "Forfeit",
      danger: true,
      onPress: () => apply({ status: "completed", winner: null, result: "forfeit", completedAt: now() }),
    });
    items.push({
      label: "Withdraw",
      danger: true,
      onPress: () => apply({ status: "completed", winner: null, result: "withdraw", completedAt: now() }),
    });
  } else if (m.status === "scheduled") {
    items.push({
      label: "Start Match",
      onPress: () => {
        setTableMode("start");
        setStep("table");
      },
    });
    items.push({ label: "Assign Table", onPress: () => { setTableMode("assign"); setStep("table"); } });
    items.push({ label: "Set Timer", onPress: () => setStep("timer") });
    items.push({ label: "Forfeit", danger: true, onPress: () => setStep("forfeit") });
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
        Alert.alert("Reopen Match", `Reopen ${m.label}? It returns to in-progress.`, [
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
  if (!m.bye) items.push({ label: "View Match Details", onPress: () => setStep("details") });

  const Header = ({ title }: { title: string }) => (
    <View style={styles.sheetHeader}>
      <Text allowFontScaling={false} style={styles.sheetTitle} numberOfLines={1}>
        {title}
      </Text>
      <TouchableOpacity style={styles.closeX} onPress={onClose} hitSlop={10}>
        <Text allowFontScaling={false} style={styles.closeLink}>
          ✕
        </Text>
      </TouchableOpacity>
    </View>
  );

  // Footer for editable steps: a labeled Close + a Save Changes action.
  const Footer = ({
    onSave,
    saveLabel = "Save Changes",
  }: {
    onSave: () => void;
    saveLabel?: string;
  }) => (
    <View style={styles.footer}>
      <TouchableOpacity
        style={[styles.btn, styles.btnGhost]}
        onPress={onClose}
        disabled={busy}
      >
        <Text allowFontScaling={false} style={styles.btnGhostText}>
          Close
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.btn, styles.btnPrimary, busy && styles.disabled]}
        onPress={onSave}
        disabled={busy}
      >
        <Text allowFontScaling={false} style={styles.btnPrimaryText}>
          {busy ? "..." : saveLabel}
        </Text>
      </TouchableOpacity>
    </View>
  );

  // Close-only footer for pick / read-only steps.
  const CloseBtn = () => (
    <TouchableOpacity style={[styles.btn, styles.btnGhost, styles.closeBtn]} onPress={onClose}>
      <Text allowFontScaling={false} style={styles.btnGhostText}>
        Close
      </Text>
    </TouchableOpacity>
  );

  const matchTitle = m.label;
  const namesLine = m.bye
    ? `${m.p1Name ?? m.p2Name ?? "TBD"} (bye)`
    : `${m.p1Name ?? "TBD"} vs ${m.p2Name ?? "TBD"}`;

  const PlayerPick = ({
    onPick,
    actionLabel,
  }: {
    onPick: (slot: 1 | 2) => void;
    actionLabel?: string;
  }) => (
    <>
      <TouchableOpacity
        style={[styles.bigBtn, busy && styles.disabled]}
        onPress={() => onPick(1)}
        disabled={busy}
      >
        <Text allowFontScaling={false} style={styles.bigBtnText}>
          {actionLabel ? `${actionLabel}: ` : ""}
          {m.p1Name ?? "Player 1"}
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.bigBtn, busy && styles.disabled]}
        onPress={() => onPick(2)}
        disabled={busy}
      >
        <Text allowFontScaling={false} style={styles.bigBtnText}>
          {actionLabel ? `${actionLabel}: ` : ""}
          {m.p2Name ?? "Player 2"}
        </Text>
      </TouchableOpacity>
    </>
  );

  return (
    <Modal transparent visible animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
          {step === "menu" && (
            <>
              <Header title={`${matchTitle} actions`} />
              <Text allowFontScaling={false} style={styles.sub} numberOfLines={1}>
                {namesLine}
              </Text>
              <View>
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
              </View>
              <CloseBtn />
            </>
          )}

          {step === "table" && (
            <>
              <Header title={tableMode === "start" ? "Start match" : "Assign table"} />
              <Text allowFontScaling={false} style={styles.fieldLabel}>
                Table
              </Text>
              <Dropdown
                options={tableOptions}
                value={tableId != null ? String(tableId) : ""}
                onSelect={(v) => setTableId(v ? Number(v) : null)}
              />
              <Footer
                saveLabel={tableMode === "start" ? "Start Match" : "Save Changes"}
                onSave={() =>
                  apply(
                    tableMode === "start"
                      ? { status: "in_progress", tableId, startedAt: m.startedAt ?? now() }
                      : { tableId },
                  )
                }
              />
            </>
          )}

          {step === "winner" && (
            <>
              <Header title="Set winner" />
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
              <CloseBtn />
            </>
          )}

          {step === "score" && (
            <>
              <Header title="Edit score" />
              <View style={styles.scoreRow}>
                <ScoreCol
                  name={m.p1Name ?? "P1"}
                  value={p1Score}
                  onChange={setP1Score}
                />
                <ScoreCol
                  name={m.p2Name ?? "P2"}
                  value={p2Score}
                  onChange={setP2Score}
                />
              </View>
              <Footer
                onSave={() =>
                  apply({
                    p1Score: p1Score === "" ? null : Number(p1Score),
                    p2Score: p2Score === "" ? null : Number(p2Score),
                  })
                }
              />
            </>
          )}

          {step === "timer" && (
            <>
              <Header title="Match timer" />
              <Text allowFontScaling={false} style={styles.fieldLabel}>
                Allowed minutes (blank = auto)
              </Text>
              <View style={styles.stepperRow}>
                <TouchableOpacity
                  style={styles.stepBtn}
                  onPress={() => setTimerMin(bump(timerMin, -1, 0, 999))}
                >
                  <Text allowFontScaling={false} style={styles.stepBtnText}>
                    −
                  </Text>
                </TouchableOpacity>
                <TextInput
                  allowFontScaling={false}
                  style={styles.stepInput}
                  value={timerMin}
                  onChangeText={(v) => setTimerMin(v.replace(/[^0-9]/g, ""))}
                  keyboardType="numeric"
                  maxLength={3}
                  placeholder="Auto"
                  placeholderTextColor={COLORS.textMuted}
                />
                <TouchableOpacity
                  style={styles.stepBtn}
                  onPress={() => setTimerMin(bump(timerMin, 1, 0, 999))}
                >
                  <Text allowFontScaling={false} style={styles.stepBtnText}>
                    +
                  </Text>
                </TouchableOpacity>
              </View>
              <Footer
                onSave={() =>
                  apply({
                    timerSeconds: timerMin === "" ? null : Number(timerMin) * 60,
                  })
                }
              />
            </>
          )}

          {step === "forfeit" && (
            <>
              <Header title="Who forfeits?" />
              <PlayerPick
                onPick={(slot) =>
                  apply({
                    status: "completed",
                    winner: slot === 1 ? 2 : 1,
                    result: "forfeit",
                    completedAt: now(),
                  })
                }
              />
              <CloseBtn />
            </>
          )}

          {step === "withdraw" && (
            <>
              <Header title="Who withdraws?" />
              <PlayerPick
                onPick={(slot) =>
                  apply({
                    status: "completed",
                    winner: slot === 1 ? 2 : 1,
                    result: "withdraw",
                    completedAt: now(),
                  })
                }
              />
              <CloseBtn />
            </>
          )}

          {step === "details" && (
            <>
              <Header title={`${matchTitle} details`} />
              {m.status === "in_progress" && (
                <View style={styles.liveTimerBox}>
                  <Text allowFontScaling={false} style={styles.liveTimerLabel}>
                    LIVE
                  </Text>
                  <Text
                    allowFontScaling={false}
                    style={[styles.liveTimer, timer.isOvertime && styles.liveTimerOver]}
                  >
                    {formatClock(timer.elapsedSeconds)}
                    {timer.isOvertime ? "  • OVER" : ""}
                  </Text>
                </View>
              )}
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
              <CloseBtn />
            </>
          )}
          </ScrollView>
        </Pressable>
      </Pressable>
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

// One player's score column: −  [input]  +  (manual entry kept).
const ScoreCol = ({
  name,
  value,
  onChange,
}: {
  name: string;
  value: string;
  onChange: (v: string) => void;
}) => (
  <View style={styles.scoreCol}>
    <Text allowFontScaling={false} style={styles.scoreName} numberOfLines={1}>
      {name}
    </Text>
    <View style={styles.stepperRow}>
      <TouchableOpacity style={styles.stepBtn} onPress={() => onChange(bump(value, -1, 0, 999))}>
        <Text allowFontScaling={false} style={styles.stepBtnText}>
          −
        </Text>
      </TouchableOpacity>
      <TextInput
        allowFontScaling={false}
        style={styles.scoreInput}
        value={value}
        onChangeText={(v) => onChange(v.replace(/[^0-9]/g, ""))}
        keyboardType="numeric"
        maxLength={3}
        placeholder="0"
        placeholderTextColor={COLORS.textMuted}
      />
      <TouchableOpacity style={styles.stepBtn} onPress={() => onChange(bump(value, 1, 0, 999))}>
        <Text allowFontScaling={false} style={styles.stepBtnText}>
          +
        </Text>
      </TouchableOpacity>
    </View>
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
    justifyContent: "center",
    marginBottom: webSc(SPACING.sm),
    minHeight: webSc(28),
  },
  sheetTitle: {
    fontSize: webMs(FONT_SIZES.lg),
    fontWeight: "800",
    color: COLORS.text,
    textAlign: "center",
  },
  closeX: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 0,
    justifyContent: "center",
  },
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
    gap: webSc(SPACING.sm),
    marginTop: webSc(SPACING.sm),
  },
  scoreCol: { alignItems: "center" },
  scoreName: { fontSize: webMs(FONT_SIZES.sm), color: COLORS.textSecondary, marginBottom: webSc(SPACING.xs) },
  stepperRow: { flexDirection: "row", alignItems: "center", gap: webSc(SPACING.xs) },
  // Borderless tap target; the sign is gray (no box).
  stepBtn: {
    width: webSc(32),
    height: webSc(44),
    alignItems: "center",
    justifyContent: "center",
  },
  stepBtnText: { color: COLORS.textSecondary, fontSize: webMs(FONT_SIZES.xxl), fontWeight: "900" },
  scoreInput: {
    backgroundColor: COLORS.background,
    borderRadius: webSc(RADIUS.md),
    borderWidth: 1,
    borderColor: COLORS.border,
    color: COLORS.primary,
    fontSize: webMs(FONT_SIZES.lg),
    fontWeight: "900",
    textAlign: "center",
    width: webSc(50),
    paddingHorizontal: webSc(2),
    paddingVertical: webSc(SPACING.sm),
  },
  stepInput: {
    backgroundColor: COLORS.background,
    borderRadius: webSc(RADIUS.md),
    borderWidth: 1,
    borderColor: COLORS.border,
    color: COLORS.text,
    fontSize: webMs(FONT_SIZES.xl),
    fontWeight: "800",
    textAlign: "center",
    width: webSc(90),
    paddingVertical: webSc(SPACING.sm),
  },
  footer: {
    flexDirection: "row",
    gap: webSc(SPACING.sm),
    marginTop: webSc(SPACING.lg),
  },
  btn: {
    flex: 1,
    paddingVertical: webSc(SPACING.md),
    borderRadius: webSc(RADIUS.md),
    alignItems: "center",
  },
  btnPrimary: { backgroundColor: COLORS.primary },
  btnPrimaryText: { color: "#fff", fontWeight: "800", fontSize: webMs(FONT_SIZES.md) },
  btnGhost: { borderWidth: 1, borderColor: COLORS.border },
  btnGhostText: { color: COLORS.textSecondary, fontWeight: "700", fontSize: webMs(FONT_SIZES.md) },
  closeBtn: { marginTop: webSc(SPACING.md) },
  liveTimerBox: {
    alignItems: "center",
    paddingVertical: webSc(SPACING.sm),
    marginBottom: webSc(SPACING.xs),
  },
  liveTimerLabel: {
    fontSize: webMs(FONT_SIZES.xs),
    fontWeight: "900",
    color: COLORS.error,
    letterSpacing: 1,
  },
  liveTimer: {
    fontSize: webMs(FONT_SIZES.xxxl),
    fontWeight: "900",
    color: COLORS.text,
    fontVariant: ["tabular-nums"],
  },
  liveTimerOver: { color: COLORS.error },
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
