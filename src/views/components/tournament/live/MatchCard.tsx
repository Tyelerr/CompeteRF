// src/views/components/tournament/live/MatchCard.tsx
// A compact, dashboard-style live match card. Big player names, prominent timer
// (always shown; red when over time), compact race, live + stream indicators,
// status-based primary actions, and an overflow menu for everything else.

import { Pressable, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { COLORS } from "../../../../theme/colors";
import { RADIUS, SPACING } from "../../../../theme/spacing";
import { FONT_SIZES } from "../../../../theme/typography";
import { webMs, webSc } from "../../../../utils/scaling";
import {
  formatClock,
  LiveMatch,
  MatchActionStep,
} from "../../../../utils/match.utils";
import { LiveDot } from "./LiveDot";

// Built at runtime so no raw emoji lives in source (toolchain-safe).
const GLYPH = { cam: String.fromCodePoint(0x1f4f9) };

// Module-level indirection so the react-compiler lint doesn't flag Date.now() as an
// impure call during render. Elapsed is computed from startedAt at render time (it
// refreshes on the page's normal re-renders/poll), NEVER from component mount time.
const nowMs = (): number => Date.now();

export const MatchCard = ({
  match,
  onAction,
  busy,
  readOnly,
  onPress,
  compact,
  now,
}: {
  match: LiveMatch;
  onAction?: (m: LiveMatch, step: MatchActionStep) => void;
  busy?: boolean;
  // Spectator mode: no management actions; the whole card is tappable (onPress)
  // to open a read-only detail.
  readOnly?: boolean;
  onPress?: () => void;
  // Web/desktop dense layout (tighter padding/fonts). Opt-in so native/spectator are unchanged.
  compact?: boolean;
  // Current-time from the parent's shared ticker (useLiveNow) so the live elapsed
  // clock visibly advances. Falls back to a one-shot read when not provided.
  now?: number;
}) => {
  const m = match;
  const running = m.status === "in_progress";
  // Completed matches show their final duration (startedAt→completedAt). Live
  // matches show elapsed since startedAt via the SAME shared formatClock (mm:ss /
  // h:mm:ss) — computed from startedAt, refreshing on re-render, not a mount timer.
  const finalSeconds =
    m.startedAt && m.completedAt
      ? Math.max(0, (new Date(m.completedAt).getTime() - new Date(m.startedAt).getTime()) / 1000)
      : 0;
  const liveSeconds =
    running && m.startedAt
      ? Math.max(0, ((now ?? nowMs()) - new Date(m.startedAt).getTime()) / 1000)
      : 0;
  // Numeric elapsed shown TOP-RIGHT: live → ticking green clock; completed → final
  // (frozen) duration. Never a fake 0:00 for scheduled / bye / no-startedAt.
  const headerTimer =
    running && m.startedAt
      ? formatClock(liveSeconds)
      : m.status === "completed" && m.startedAt && m.completedAt
        ? formatClock(finalSeconds)
        : null;
  // Descriptive body status (non-numeric): bye outcome or "Not started".
  const statusText = m.bye
    ? m.result === "withdraw"
      ? "Withdrew (bye)"
      : m.result === "forfeit"
        ? "Forfeited (bye)"
        : "Advances (bye)"
    : m.status === "scheduled"
      ? "Not started"
      : null;
  const abnormal = !m.bye && !!m.result && m.result !== "normal";

  return (
    <Pressable
      onPress={readOnly ? onPress : undefined}
      style={({ hovered }: any) => [
        styles.card,
        compact && styles.cardCompact,
        running && styles.cardLive,
        m.isLiveActive && styles.cardStream,
        hovered && styles.cardHover,
      ]}
    >
      {/* Top meta row */}
      <View style={styles.topRow}>
        <View style={styles.topLeft}>
          <Text allowFontScaling={false} style={styles.matchNum}>
            {m.label}
          </Text>
          {m.tableLabel && (
            <Text allowFontScaling={false} style={styles.table} numberOfLines={1}>
              · {m.tableLabel}
            </Text>
          )}
        </View>
        <View style={styles.topRight}>
          {!!headerTimer && (
            <Text
              allowFontScaling={false}
              style={[styles.headerTimer, running && styles.headerTimerLive]}
            >
              {headerTimer}
            </Text>
          )}
          {m.isLiveActive && (
            <View style={styles.liveBadge}>
              <Text allowFontScaling={false} style={styles.liveBadgeText}>
                {GLYPH.cam} LIVE
              </Text>
            </View>
          )}
          {running && <LiveDot />}
        </View>
      </View>

      {/* Players (name + race) with a Fargo-style score box each. Byes use the
          same layout with dashes for the scores. */}
      <View style={[styles.players, compact && styles.playersCompact]}>
        <PlayerRow
          name={m.p1Name}
          race={m.p1Race}
          score={m.p1Score}
          dash={m.bye}
          result={m.result}
          won={m.winner === 1}
          lost={m.winner === 2}
          compact={compact}
        />
        <PlayerRow
          name={m.bye ? "Bye" : m.p2Name}
          race={m.bye ? null : m.p2Race}
          score={m.p2Score}
          dash={m.bye}
          result={m.result}
          won={m.winner === 2}
          lost={m.winner === 1}
          compact={compact}
        />
      </View>
      {/* Body status line — descriptive only (numeric elapsed lives top-right).
          Rendered only when there's something to say: bye outcome, "Not started",
          or an abnormal (forfeit/withdraw) result. */}
      {(statusText || abnormal) && (
        <View style={[styles.timerRow, compact && styles.timerRowCompact]}>
          {!!statusText && (
            <Text allowFontScaling={false} style={[styles.timer, styles.timerIdle]}>
              {statusText}
            </Text>
          )}
          {abnormal && (
            <Text allowFontScaling={false} style={styles.resultTag}>
              {m.result}
            </Text>
          )}
        </View>
      )}

      {/* Actions (management only — hidden in spectator/read-only mode).
          Compact (web/desktop): a single content-sized primary + a labeled
          "Actions ▾" menu, bottom-right. Non-compact (mobile/native): the original
          full-width primary + secondary + ⋯ overflow, unchanged. */}
      {!readOnly &&
        (compact ? (
          <View style={styles.actionsCompactRow}>
            {m.bye ? (
              <Btn label="View Details" primary grow={false} minW={120} onPress={() => onAction?.(m, "details")} busy={busy} compact />
            ) : m.pending ? null : m.status === "scheduled" ? (
              <Btn label="Start Match" primary grow={false} minW={120} onPress={() => onAction?.(m, "start")} busy={busy} compact />
            ) : running ? (
              <Btn label="Select Winner" primary grow={false} minW={120} onPress={() => onAction?.(m, "winner")} busy={busy} compact />
            ) : (
              <Btn label="View Details" primary grow={false} minW={120} onPress={() => onAction?.(m, "details")} busy={busy} compact />
            )}
            <Btn label="Actions ▾" grow={false} minW={96} onPress={() => onAction?.(m, "menu")} busy={busy} compact />
          </View>
        ) : (
          <View style={styles.actions}>
            {m.bye ? (
              <Btn label="View Details" primary onPress={() => onAction?.(m, "details")} busy={busy} />
            ) : m.pending ? (
              // Opponent hasn't advanced yet — not playable. Only open the (gated)
              // menu so the TD can view details, not start/score it.
              <Btn label="Waiting for player…" onPress={() => onAction?.(m, "menu")} busy={busy} />
            ) : m.status === "scheduled" ? (
              <>
                <Btn label="Start Match" primary onPress={() => onAction?.(m, "start")} busy={busy} />
                <Btn label="Assign Table" onPress={() => onAction?.(m, "table")} busy={busy} />
              </>
            ) : running ? (
              <>
                <Btn label="Select Winner" primary onPress={() => onAction?.(m, "winner")} busy={busy} />
                <Btn label="Edit Score" onPress={() => onAction?.(m, "score")} busy={busy} />
              </>
            ) : (
              <>
                <Btn label="View Details" primary onPress={() => onAction?.(m, "details")} busy={busy} />
                <Btn label="Reopen" onPress={() => onAction?.(m, "menu")} busy={busy} />
              </>
            )}
            <TouchableOpacity
              style={styles.overflow}
              onPress={() => onAction?.(m, "menu")}
              disabled={busy}
              hitSlop={6}
            >
              <Text allowFontScaling={false} style={styles.overflowText}>
                ⋯
              </Text>
            </TouchableOpacity>
          </View>
        ))}
    </Pressable>
  );
};

const scoreText = (
  score: number | null,
  dash: boolean | undefined,
  lost: boolean,
  result: "normal" | "forfeit" | "withdraw" | null,
): string => {
  if (dash) return "–";
  if (lost && result === "forfeit") return "FF";
  if (lost && result === "withdraw") return "WD";
  return String(score ?? 0);
};

const PlayerRow = ({
  name,
  race,
  score,
  dash,
  result,
  won,
  lost,
  compact,
}: {
  name: string | null;
  race: number | null;
  score: number | null;
  dash?: boolean;
  result?: "normal" | "forfeit" | "withdraw" | null;
  won: boolean;
  lost: boolean;
  compact?: boolean;
}) => (
  <View style={styles.playerRow}>
    <Text
      allowFontScaling={false}
      style={[styles.name, compact && styles.nameCompact, won && styles.nameWon, lost && styles.nameLost]}
      numberOfLines={1}
      adjustsFontSizeToFit
      minimumFontScale={0.7}
    >
      {name ?? "TBD"}
      {race != null ? ` (${race})` : ""}
      {won ? "  ✓" : ""}
    </Text>
    <View style={[styles.scoreBox, compact && styles.scoreBoxCompact, won && styles.scoreBoxWon]}>
      <Text
        allowFontScaling={false}
        style={[styles.scoreNum, compact && styles.scoreNumCompact, won && styles.scoreNumWon]}
        numberOfLines={1}
      >
        {scoreText(score, dash, lost, result ?? null)}
      </Text>
    </View>
  </View>
);

const Btn = ({
  label,
  onPress,
  primary,
  busy,
  compact,
  grow = true,
  minW,
}: {
  label: string;
  onPress: () => void;
  primary?: boolean;
  busy?: boolean;
  compact?: boolean;
  // grow=false → content-sized (for the compact bottom-right footer); default fills.
  grow?: boolean;
  // Minimum width (px) for the content-sized footer buttons, so labels never clip
  // and the primary/Actions columns line up across cards.
  minW?: number;
}) => (
  <TouchableOpacity
    style={[
      styles.btn,
      !grow && styles.btnAuto,
      !grow && minW != null ? { minWidth: webSc(minW) } : null,
      compact && styles.btnCompact,
      primary ? styles.btnPrimary : styles.btnGhost,
      busy && styles.btnDisabled,
    ]}
    onPress={onPress}
    disabled={busy}
  >
    <Text allowFontScaling={false} numberOfLines={1} style={[primary ? styles.btnPrimaryText : styles.btnGhostText, compact && styles.btnTextCompact]}>
      {label}
    </Text>
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: webSc(RADIUS.lg),
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: webSc(SPACING.md),
    paddingVertical: webSc(SPACING.md),
    marginBottom: webSc(SPACING.md),
  },
  cardLive: { backgroundColor: "#16241B" },
  cardStream: { borderColor: COLORS.error, borderWidth: 2 },
  // Subtle web hover — lighter surface + border emphasis, no size/layout change.
  cardHover: { backgroundColor: "#262626", borderColor: COLORS.primary + "80" },
  // Top-right elapsed clock chip.
  headerTimer: {
    fontSize: webMs(FONT_SIZES.sm),
    fontWeight: "900",
    color: COLORS.textSecondary,
    fontVariant: ["tabular-nums"],
  },
  headerTimerLive: { color: COLORS.success },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  topLeft: { flexDirection: "row", alignItems: "center", gap: webSc(SPACING.xs), flex: 1 },
  matchNum: { fontSize: webMs(FONT_SIZES.xs), fontWeight: "800", color: COLORS.primary },
  race: { fontSize: webMs(FONT_SIZES.xs), color: COLORS.textSecondary, fontWeight: "700" },
  table: { fontSize: webMs(FONT_SIZES.xs), color: COLORS.textMuted, flexShrink: 1 },
  topRight: { flexDirection: "row", alignItems: "center", gap: webSc(SPACING.xs) },
  liveBadge: {},
  liveBadgeText: {
    color: COLORS.error,
    fontSize: webMs(FONT_SIZES.xs),
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  bye: {
    fontSize: webMs(FONT_SIZES.md),
    color: COLORS.textSecondary,
    fontWeight: "600",
    paddingVertical: webSc(SPACING.sm),
  },
  players: {
    marginTop: webSc(SPACING.sm),
    gap: webSc(SPACING.sm),
  },
  playerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: webSc(SPACING.sm),
  },
  name: {
    fontSize: webMs(FONT_SIZES.lg),
    fontWeight: "800",
    color: COLORS.text,
    flex: 1,
  },
  nameWon: { color: COLORS.success },
  nameLost: { color: COLORS.textMuted },
  scoreBox: {
    minWidth: webSc(46),
    paddingHorizontal: webSc(SPACING.sm),
    paddingVertical: webSc(SPACING.xs),
    borderRadius: webSc(RADIUS.md),
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.background,
    alignItems: "center",
    justifyContent: "center",
  },
  scoreBoxWon: { borderColor: COLORS.success },
  scoreNum: {
    fontSize: webMs(FONT_SIZES.xl),
    fontWeight: "900",
    color: COLORS.primary,
    fontVariant: ["tabular-nums"],
  },
  scoreNumWon: { color: COLORS.success },
  timerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: webSc(SPACING.md),
  },
  timer: {
    fontSize: webMs(FONT_SIZES.xxl),
    fontWeight: "900",
    color: COLORS.text,
    fontVariant: ["tabular-nums"],
  },
  timerIdle: { fontSize: webMs(FONT_SIZES.sm), color: COLORS.textMuted, fontWeight: "600" },
  timerLive: { color: COLORS.success },
  timerDone: { fontSize: webMs(FONT_SIZES.md), color: COLORS.success },
  resultTag: {
    fontSize: webMs(FONT_SIZES.xs),
    color: COLORS.warning,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: webSc(SPACING.xs),
    marginTop: webSc(SPACING.sm),
  },
  // Compact footer: content-sized buttons pinned to the BOTTOM-right (marginTop
  // auto pushes the row down so every card's footer aligns even when bodies differ).
  actionsCompactRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: webSc(SPACING.xs),
    marginTop: "auto",
    paddingTop: webSc(SPACING.sm),
  },
  btn: {
    flex: 1,
    paddingVertical: webSc(SPACING.sm),
    borderRadius: webSc(RADIUS.md),
    alignItems: "center",
    justifyContent: "center",
  },
  // Content-sized (footer) button: sizes to its label (no clip), never shrinks.
  btnAuto: {
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: "auto" as any,
    paddingHorizontal: webSc(SPACING.md),
  },
  btnDisabled: { opacity: 0.5 },
  btnPrimary: { backgroundColor: COLORS.primary },
  btnPrimaryText: { color: "#fff", fontWeight: "800", fontSize: webMs(FONT_SIZES.sm) },
  btnGhost: { borderWidth: 1, borderColor: COLORS.border },
  btnGhostText: { color: COLORS.textSecondary, fontWeight: "700", fontSize: webMs(FONT_SIZES.sm) },
  overflow: {
    width: webSc(38),
    paddingVertical: webSc(SPACING.sm),
    borderRadius: webSc(RADIUS.md),
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
  },
  overflowText: { color: COLORS.text, fontSize: webMs(FONT_SIZES.lg), fontWeight: "900" },
  // ── Compact (web/desktop) overrides — tighter padding, smaller type/gaps ──
  cardCompact: {
    paddingHorizontal: webSc(SPACING.sm),
    paddingVertical: webSc(SPACING.sm),
    marginBottom: webSc(SPACING.sm),
    borderRadius: webSc(RADIUS.md),
    // Fill the (row-stretched) grid cell so cards in a row match height; the footer
    // pins to the bottom via marginTop:auto. minHeight normalizes across rows.
    flexGrow: 1,
    minHeight: webSc(150),
  },
  playersCompact: { marginTop: webSc(SPACING.xs), gap: webSc(SPACING.xs) },
  nameCompact: { fontSize: webMs(FONT_SIZES.md) },
  scoreBoxCompact: { minWidth: webSc(34), paddingVertical: webSc(2), paddingHorizontal: webSc(SPACING.xs) },
  scoreNumCompact: { fontSize: webMs(FONT_SIZES.md) },
  timerRowCompact: { marginTop: webSc(SPACING.xs) },
  timerCompact: { fontSize: webMs(FONT_SIZES.md) },
  actionsCompact: { marginTop: webSc(SPACING.xs) },
  btnCompact: { paddingVertical: webSc(6) },
  btnTextCompact: { fontSize: webMs(FONT_SIZES.xs) },
  overflowCompact: { width: webSc(32), paddingVertical: webSc(6) },
});
