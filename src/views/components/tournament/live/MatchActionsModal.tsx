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
// Module-level indirection (react-compiler-safe) for reading wall-clock time.
const nowMs = () => Date.now();
const pad2 = (n: number) => String(n).padStart(2, "0");

// Increment/decrement a numeric string field, clamped.
const bump = (val: string, delta: number, min = 0, max = 99): string => {
  const n = parseInt(val || "0", 10) || 0;
  return String(Math.min(max, Math.max(min, n + delta)));
};

export const MatchActionsModal = ({
  match,
  initialStep = "menu",
  tables,
  occupancy,
  onPatch,
  onClose,
  busy,
}: {
  match: LiveMatch | null;
  initialStep?: Step;
  tables: TournamentTable[];
  // tableId -> label of the match currently on it (to block double-booking).
  occupancy?: Record<number, string>;
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
  const [winnerSlot, setWinnerSlot] = useState<1 | 2 | null>(null);
  // Elapsed-time editor fields — prefilled ONCE from the live elapsed when the
  // modal opens, then owned by the TD's typing (they don't keep re-syncing).
  const [elH, setElH] = useState("");
  const [elM, setElM] = useState("");
  const [elS, setElS] = useState("");
  const [confirmingReset, setConfirmingReset] = useState(false);

  useEffect(() => {
    if (!match) return;
    // A match whose opponent hasn't arrived yet (a feeder is still undecided) is
    // NOT playable — force it to the (gated) menu no matter what step was asked
    // for, so a card/node shortcut can't jump straight into scoring it.
    if (match.pending && !match.bye) {
      setStep("menu");
    } else if (initialStep === "start") {
      // "start" is a card-view shortcut: open the table step ready to START the
      // match; plain "table" opens it in assign-only mode.
      setTableMode("start");
      setStep("table");
    } else {
      if (initialStep === "table") setTableMode("assign");
      setStep(initialStep);
    }
    setTableId(match.tableId);
    setP1Score(match.p1Score != null ? String(match.p1Score) : "");
    setP2Score(match.p2Score != null ? String(match.p2Score) : "");
    setWinnerSlot(null);
    setTimerMin(
      match.hasCustomTimer ? String(Math.round(match.allowedSeconds / 60)) : "",
    );
    // Prefill the elapsed editor from the current live elapsed (once, at open).
    const elapsed =
      match.startedAt && match.status === "in_progress"
        ? Math.max(0, Math.floor((nowMs() - Date.parse(match.startedAt)) / 1000))
        : 0;
    setElH(pad2(Math.floor(elapsed / 3600)));
    setElM(pad2(Math.floor((elapsed % 3600) / 60)));
    setElS(pad2(elapsed % 60));
    setConfirmingReset(false);
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

  // A table is "busy" if a DIFFERENT in-progress match is on it.
  const busyByOther = (tableId: number): string | null => {
    const occ = occupancy?.[tableId];
    return occ && occ !== m.label ? occ : null;
  };

  const tableOptions = [
    { label: "No table", value: "" },
    ...tables
      .filter((t) => t.status !== "unavailable")
      .map((t) => {
        const taken = busyByOther(t.id);
        return {
          label:
            (t.label ? `${t.label} ${t.table_number}` : `Table ${t.table_number}`) +
            (t.is_streaming ? " · LIVE" : "") +
            (taken ? ` · In use (${taken})` : ""),
          value: String(t.id),
        };
      }),
  ];

  // Guard the table assignment: refuse a table already in use by another match.
  const saveTable = () => {
    if (tableId != null) {
      const taken = busyByOther(tableId);
      if (taken) {
        Alert.alert(
          "Table in use",
          `That table is already in use by ${taken}. Free it or pick another table.`,
        );
        return;
      }
    }
    apply(
      tableMode === "start"
        ? { status: "in_progress", tableId, startedAt: m.startedAt ?? now() }
        : { tableId },
    );
  };

  // A match with a still-undecided feeder (one side is TBD) can't be started,
  // scored, or won — the second player hasn't arrived. A bye is a separate,
  // legitimate one-player case, handled below.
  const notReady = m.pending && !m.bye;

  // ---- menu items by status ----
  type Item = { label: string; danger?: boolean; onPress: () => void };
  const items: Item[] = [];
  if (notReady) {
    // Nothing to play yet — only let the TD look, or clear a result that was
    // recorded before this guard existed (recovery path for corrupted state).
    items.push({ label: "View Match Details", onPress: () => setStep("details") });
    const hasProgress =
      m.status !== "scheduled" ||
      m.winner != null ||
      m.p1Score != null ||
      m.p2Score != null ||
      m.tableId != null;
    if (hasProgress) {
      items.push({
        label: "Reset Match",
        danger: true,
        onPress: () =>
          apply({
            status: "scheduled",
            tableId: null,
            startedAt: null,
            completedAt: null,
            winner: null,
            p1Score: null,
            p2Score: null,
            result: null,
          }),
      });
    }
  } else if (m.bye) {
    // A bye auto-advances; start/score/table/timer don't apply. The advancing
    // player can still forfeit or withdraw (both remove them — a bye has no
    // opponent to award a loss to, so the player simply doesn't advance).
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
    items.push({ label: "Set Time Limit", onPress: () => setStep("timer") });
    items.push({ label: "Forfeit", danger: true, onPress: () => setStep("forfeit") });
    items.push({ label: "Withdraw", danger: true, onPress: () => setStep("withdraw") });
  } else if (m.status === "in_progress") {
    items.push({ label: "End Match", onPress: () => setStep("winner") });
    items.push({ label: "Edit Score", onPress: () => setStep("score") });
    items.push({ label: "Set Winner", onPress: () => setStep("winner") });
    items.push({ label: "Change Table", onPress: () => { setTableMode("assign"); setStep("table"); } });
    items.push({ label: "Change Match Timer", onPress: () => setStep("elapsed") });
    items.push({ label: "Set Time Limit", onPress: () => setStep("timer") });
    // Started by mistake? Reset clears the table, score and start so the match
    // goes back to the queue as not-started and can be re-assigned.
    items.push({
      label: "Reset Match",
      danger: true,
      onPress: () =>
        Alert.alert(
          "Reset Match",
          `Reset ${m.label}? It returns to the queue as not started — the table, score and start time are cleared.`,
          [
            { text: "Cancel", style: "cancel" },
            {
              text: "Reset",
              style: "destructive",
              onPress: () =>
                apply({
                  status: "scheduled",
                  tableId: null,
                  startedAt: null,
                  completedAt: null,
                  winner: null,
                  p1Score: null,
                  p2Score: null,
                  result: null,
                }),
            },
          ],
        ),
    });
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
  if (!m.bye && !notReady)
    items.push({ label: "View Match Details", onPress: () => setStep("details") });

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
              {notReady && (
                <Text allowFontScaling={false} style={styles.notReadyNote}>
                  Waiting for the other player to advance. This match can be
                  scored once both players are set.
                </Text>
              )}
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
                onSave={saveTable}
              />
            </>
          )}

          {step === "winner" && (
            <>
              <Header title="Set winner" />
              <PlayerPick
                actionLabel="Winner"
                onPick={(slot) => {
                  // Pick the winner, then collect the score. Pre-fill the
                  // winner's score to their race so the TD just sets the loser.
                  setWinnerSlot(slot);
                  const wRace =
                    (slot === 1 ? m.p1Race ?? m.raceTo : m.p2Race ?? m.raceTo) ??
                    null;
                  if (slot === 1) {
                    if (wRace != null) setP1Score(String(wRace));
                    if (p2Score === "") setP2Score("0");
                  } else {
                    if (wRace != null) setP2Score(String(wRace));
                    if (p1Score === "") setP1Score("0");
                  }
                  setStep("winnerScore");
                }}
              />
              <CloseBtn />
            </>
          )}

          {step === "winnerScore" && winnerSlot != null && (
            <>
              <Header title="Match score" />
              <Text allowFontScaling={false} style={styles.sub}>
                Winner: {(winnerSlot === 1 ? m.p1Name : m.p2Name) ?? "Player"}
              </Text>
              <View style={styles.scoreRow}>
                <ScoreCol
                  name={m.p1Name ?? "P1"}
                  value={p1Score}
                  onChange={setP1Score}
                  max={(m.p1Race ?? m.raceTo) ?? 999}
                />
                <ScoreCol
                  name={m.p2Name ?? "P2"}
                  value={p2Score}
                  onChange={setP2Score}
                  max={(m.p2Race ?? m.raceTo) ?? 999}
                />
              </View>
              <Footer
                saveLabel="Set Winner"
                onSave={() =>
                  apply({
                    status: "completed",
                    winner: winnerSlot,
                    p1Score: p1Score === "" ? 0 : Number(p1Score),
                    p2Score: p2Score === "" ? 0 : Number(p2Score),
                    completedAt: m.completedAt ?? now(),
                    result: m.result ?? "normal",
                  })
                }
              />
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
                  max={(m.p1Race ?? m.raceTo) ?? 999}
                />
                <ScoreCol
                  name={m.p2Name ?? "P2"}
                  value={p2Score}
                  onChange={setP2Score}
                  max={(m.p2Race ?? m.raceTo) ?? 999}
                />
              </View>
              <Footer
                onSave={() => {
                  const r1 = m.p1Race ?? m.raceTo ?? null;
                  const r2 = m.p2Race ?? m.raceTo ?? null;
                  const cap = (s: string, race: number | null) =>
                    Math.max(0, Math.min(s === "" ? 0 : Number(s), race ?? 999));
                  const np1 = cap(p1Score, r1);
                  const np2 = cap(p2Score, r2);
                  const reach1 = r1 != null && np1 >= r1;
                  const reach2 = r2 != null && np2 >= r2;
                  const done = reach1 || reach2;
                  apply({
                    p1Score: np1,
                    p2Score: np2,
                    // Reaching the race closes the match with that player as winner;
                    // otherwise it's an in-progress score.
                    status: done ? "completed" : "in_progress",
                    startedAt: m.startedAt ?? now(),
                    winner: done ? (reach1 ? 1 : 2) : null,
                    completedAt: done ? now() : null,
                    result: done ? "normal" : null,
                  });
                }}
              />
            </>
          )}

          {step === "timer" && (
            <>
              <Header title="Match time limit" />
              <Text allowFontScaling={false} style={styles.fieldLabel}>
                Allowed minutes (blank = auto) — turns the elapsed timer red past this
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

          {step === "elapsed" && confirmingReset && (
            <>
              <View style={styles.sheetHeader}>
                <Text allowFontScaling={false} style={styles.sheetTitle} numberOfLines={1}>
                  Reset Timer
                </Text>
                <TouchableOpacity style={styles.closeX} onPress={onClose} hitSlop={10}>
                  <Text allowFontScaling={false} style={styles.closeLink}>✕</Text>
                </TouchableOpacity>
              </View>
              <Text allowFontScaling={false} style={styles.resetNote}>
                This will clear the current elapsed match time and reset it to 0:00.
              </Text>
              <Text allowFontScaling={false} style={styles.resetMatchName} numberOfLines={1}>
                {m.label}
              </Text>
              {!m.bye && (m.p1Name || m.p2Name) && (
                <Text allowFontScaling={false} style={styles.resetNames} numberOfLines={1}>
                  {namesLine}
                </Text>
              )}
              <TouchableOpacity
                style={[styles.btn, styles.btnDanger, busy && styles.disabled]}
                onPress={() => apply({ startedAt: now() })}
                disabled={busy}
              >
                <Text allowFontScaling={false} style={styles.btnDangerText}>
                  {busy ? "..." : "Reset"}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btn, styles.btnGhost, styles.closeBtn]}
                onPress={() => setConfirmingReset(false)}
                disabled={busy}
              >
                <Text allowFontScaling={false} style={styles.btnGhostText}>
                  Cancel
                </Text>
              </TouchableOpacity>
            </>
          )}

          {step === "elapsed" && !confirmingReset && (
            <>
              {/* Inline header (avoids the in-render Header component pattern). */}
              <View style={styles.sheetHeader}>
                <Text allowFontScaling={false} style={styles.sheetTitle} numberOfLines={1}>
                  Change Match Timer
                </Text>
                <TouchableOpacity style={styles.closeX} onPress={onClose} hitSlop={10}>
                  <Text allowFontScaling={false} style={styles.closeLink}>✕</Text>
                </TouchableOpacity>
              </View>
              {/* Current, live-ticking match time (authoritative now − startedAt). */}
              <Text allowFontScaling={false} style={styles.currentLabel}>
                Current Match Time
              </Text>
              <Text
                allowFontScaling={false}
                style={[styles.currentTime, timer.isOvertime && styles.liveTimerOver]}
              >
                {formatClock(timer.elapsedSeconds)}
              </Text>
              <Text allowFontScaling={false} style={styles.fieldLabel}>
                Set Elapsed Time
              </Text>
              <View style={styles.hmsRow}>
                <HmsField value={elH} onChange={setElH} caption="HH" max={99} />
                <Text allowFontScaling={false} style={styles.hmsColon}>:</Text>
                <HmsField value={elM} onChange={setElM} caption="MM" max={59} />
                <Text allowFontScaling={false} style={styles.hmsColon}>:</Text>
                <HmsField value={elS} onChange={setElS} caption="SS" max={59} />
              </View>
              <View style={styles.footer}>
                <TouchableOpacity
                  style={[styles.btn, styles.btnGhost, busy && styles.disabled]}
                  onPress={() => setConfirmingReset(true)}
                  disabled={busy}
                >
                  <Text allowFontScaling={false} style={styles.btnGhostText}>
                    Reset Timer
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.btn, styles.btnPrimary, busy && styles.disabled]}
                  onPress={() => {
                    const h = parseInt(elH || "0", 10) || 0;
                    const mm = parseInt(elM || "0", 10) || 0;
                    const s = parseInt(elS || "0", 10) || 0;
                    if (h < 0 || mm < 0 || mm > 59 || s < 0 || s > 59) {
                      Alert.alert(
                        "Invalid time",
                        "Minutes and seconds must be 0–59, hours 0 or more.",
                      );
                      return;
                    }
                    // Correct the AUTHORITATIVE startedAt so every timer surface
                    // (derived from startedAt) shows this elapsed and keeps ticking.
                    const totalMs = (h * 3600 + mm * 60 + s) * 1000;
                    apply({ startedAt: new Date(nowMs() - totalMs).toISOString() });
                  }}
                  disabled={busy}
                >
                  <Text allowFontScaling={false} style={styles.btnPrimaryText}>
                    {busy ? "..." : "Save Changes"}
                  </Text>
                </TouchableOpacity>
              </View>
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

// One HH / MM / SS field for the elapsed-time editor: numeric, clamped to `max`.
const HmsField = ({
  value,
  onChange,
  caption,
  max,
}: {
  value: string;
  onChange: (v: string) => void;
  caption: string;
  max: number;
}) => (
  <View style={styles.hmsCol}>
    <TextInput
      allowFontScaling={false}
      style={styles.hmsInput}
      value={value}
      onChangeText={(v) => {
        const n = v.replace(/[^0-9]/g, "");
        onChange(n === "" ? "" : String(Math.min(max, Number(n))));
      }}
      keyboardType="numeric"
      maxLength={2}
      placeholder="00"
      placeholderTextColor={COLORS.textMuted}
      selectTextOnFocus
    />
    <Text allowFontScaling={false} style={styles.hmsCaption}>
      {caption}
    </Text>
  </View>
);

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
  max = 999,
}: {
  name: string;
  value: string;
  onChange: (v: string) => void;
  max?: number; // the race for this side — score can't exceed it
}) => (
  <View style={styles.scoreCol}>
    <Text allowFontScaling={false} style={styles.scoreName} numberOfLines={1}>
      {name}
    </Text>
    <View style={styles.stepperRow}>
      <TouchableOpacity style={styles.stepBtn} onPress={() => onChange(bump(value, -1, 0, max))}>
        <Text allowFontScaling={false} style={styles.stepBtnText}>
          −
        </Text>
      </TouchableOpacity>
      <TextInput
        allowFontScaling={false}
        style={styles.scoreInput}
        value={value}
        onChangeText={(v) => {
          const n = v.replace(/[^0-9]/g, "");
          onChange(n === "" ? "" : String(Math.min(max, Number(n))));
        }}
        keyboardType="numeric"
        maxLength={3}
        placeholder="0"
        placeholderTextColor={COLORS.textMuted}
      />
      <TouchableOpacity style={styles.stepBtn} onPress={() => onChange(bump(value, 1, 0, max))}>
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
  notReadyNote: {
    fontSize: webMs(FONT_SIZES.sm),
    color: COLORS.warning,
    textAlign: "center",
    marginBottom: webSc(SPACING.md),
    lineHeight: webMs(FONT_SIZES.md) * 1.3,
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
  btnDanger: { backgroundColor: COLORS.error, marginTop: webSc(SPACING.lg) },
  btnDangerText: { color: "#fff", fontWeight: "800", fontSize: webMs(FONT_SIZES.md) },
  closeBtn: { marginTop: webSc(SPACING.md) },
  // Reset-timer confirmation copy
  resetNote: {
    fontSize: webMs(FONT_SIZES.sm),
    color: COLORS.textSecondary,
    textAlign: "center",
    lineHeight: webMs(FONT_SIZES.md) * 1.35,
    marginBottom: webSc(SPACING.md),
  },
  resetMatchName: {
    fontSize: webMs(FONT_SIZES.lg),
    fontWeight: "800",
    color: COLORS.text,
    textAlign: "center",
  },
  resetNames: {
    fontSize: webMs(FONT_SIZES.sm),
    color: COLORS.textMuted,
    textAlign: "center",
    marginTop: webSc(2),
  },
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
  // Elapsed editor: prominent live "Current Match Time" + HH:MM:SS inputs.
  currentLabel: {
    fontSize: webMs(FONT_SIZES.sm),
    color: COLORS.textSecondary,
    fontWeight: "700",
    textAlign: "center",
    marginTop: webSc(SPACING.xs),
  },
  currentTime: {
    fontSize: webMs(FONT_SIZES.xxxl),
    fontWeight: "900",
    color: COLORS.success,
    fontVariant: ["tabular-nums"],
    textAlign: "center",
    marginBottom: webSc(SPACING.md),
  },
  hmsRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "center",
    gap: webSc(SPACING.xs),
    marginTop: webSc(SPACING.xs),
  },
  hmsCol: { alignItems: "center" },
  hmsInput: {
    backgroundColor: COLORS.background,
    borderRadius: webSc(RADIUS.md),
    borderWidth: 1,
    borderColor: COLORS.border,
    color: COLORS.text,
    fontSize: webMs(FONT_SIZES.xl),
    fontWeight: "900",
    textAlign: "center",
    width: webSc(64),
    paddingVertical: webSc(SPACING.sm),
    fontVariant: ["tabular-nums"],
  },
  hmsColon: {
    fontSize: webMs(FONT_SIZES.xl),
    fontWeight: "900",
    color: COLORS.textSecondary,
    marginTop: webSc(SPACING.sm),
  },
  hmsCaption: {
    fontSize: webMs(FONT_SIZES.xs),
    color: COLORS.textMuted,
    fontWeight: "700",
    marginTop: webSc(2),
  },
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
