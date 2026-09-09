// src/views/screens/admin/chip/chip-manage.screen.tsx
// Chip Tournament manage flow (TD / Bar Owner). Structured like the bracket hub:
// a Setup / Live / Results phase with sub-page tabs. Setup pages = Settings (name,
// format, buy-backs, Fargo chip table), Players (registration), Tables (add/remove
// + mark stream), Review & Start. Live pages = Dashboard, Tables (winner buttons +
// timers), Queue, Players (chips/records + buy-back). Results = Standings.
// Rules in chip.engine.ts; persistence (real tables) in chip.service.ts.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Easing,
  Keyboard,
  KeyboardAvoidingView,
  LayoutAnimation,
  Linking,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardAwareScrollView } from "react-native-keyboard-aware-scroll-view";
import { COLORS } from "../../../../theme/colors";
import { RADIUS, SPACING } from "../../../../theme/spacing";
import { FONT_SIZES } from "../../../../theme/typography";
import { chipStatusColor } from "../../../../utils/chip-colors";
import { formatElapsedClock } from "../../../../utils/formatters";
import { webMs, webSc } from "../../../../utils/scaling";
import {
  PhaseNav,
  PhaseNavPhase,
} from "../../../components/tournament/live/PhaseNav";
import { useChipTournament } from "../../../../viewmodels/use.chip.tournament";
import { teamInviteLink, teamInviteMessage } from "../../../../utils/team.invite";
import {
  chipsForFargo,
  dashboard,
  enteredField,
  finalPlacements,
  LONG_MATCH_MS,
  matchElapsedMs,
  recommendedActiveTables,
  recommendedShuffleThreshold,
  recommendedSetupTables,
  playableEntryCount,
  isPostMatchPending,
  rematchSkippedLabel,
  teamFargoOf,
  teamName,
} from "../../../../models/services/chip.engine";
import { scheduleStaleError } from "../../../../utils/schedule";
import { computeBreakdown, entryPoolTotal, feesPerPlayer, sidePotTotal, sidePotPayoutViews, type PayoutBucketAllocation } from "../../../../utils/prize-pool";
import { computePerformance, PerfGame } from "../../../../utils/performance";
import { buildReadinessSummary, ReadinessRow, PlayerReadinessSummary } from "../../../../utils/player-readiness";
import { ChipEntry, ChipEvent, ChipTable } from "../../../../models/types/chip.types";
import { usePlayerSearch } from "../../../../viewmodels/hooks/use.player.search";
import { UnifiedRegisterModal } from "../../../components/tournament/UnifiedRegisterModal";
import {
  LifecyclePhase,
  LifecycleStatus,
  LIFECYCLE_META,
  LIFECYCLE_RANK,
  paymentSatisfied,
  readyGate,
  fargoOverBy,
  isFargoOverCap,
} from "../../../../utils/registration-lifecycle";
import {
  chipEntryLifecycle,
  chipHardBlocker,
  chipHasPartner,
  chipReadyEntries,
} from "../../../../utils/chip-lifecycle";
import { parseSidePots } from "../../../../utils/side-pots";
import { PlayerSearchResult } from "../../../../models/types/player.registration.types";
import { playerRegistrationService } from "../../../../models/services/player.registration.service";
import { TeamCard, TeamCardPlayerVM, TeamCardProps, ActionsAnchor } from "../../../components/tournament/TeamCard";
import { useAuthContext } from "../../../../providers/AuthProvider";
import { Profile } from "../../../../models/types/profile.types";
import { ConfettiBurst, ConfettiBurstRef } from "../../../components/common/ConfettiBurst";

const profileName = (p: Profile): string =>
  [p.first_name, p.last_name].filter(Boolean).join(" ").trim() || p.name || p.user_name;

// "1st" / "2nd" / "3rd" / "4th" … ordinal suffix for placement labels.
const ordSuffix = (n: number): string => {
  const s = ["th", "st", "nd", "rd"], v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
};

const isWeb = Platform.OS === "web";

// Gap kept between the floating sheet and the top of the keyboard (px).
const SHEET_KB_GAP = 20;

// Tracks the on-screen keyboard height as an animated value so a floating sheet
// can sit a fixed gap ABOVE the keyboard rather than being pinned to it. Follows
// the keyboard's own show/hide curve. iOS only — on Android the window resizes
// (softwareKeyboardLayoutMode "resize"), so bottom-anchoring already clears it.
const useKeyboardHeight = () => {
  const height = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (Platform.OS !== "ios") return;
    const animateTo = (to: number, duration: number) =>
      Animated.timing(height, {
        toValue: to,
        duration: duration || 250,
        useNativeDriver: false,
      }).start();
    const showSub = Keyboard.addListener(
      "keyboardWillShow",
      (e: { endCoordinates: { height: number }; duration?: number }) =>
        animateTo(e.endCoordinates.height, e.duration ?? 250),
    );
    const hideSub = Keyboard.addListener(
      "keyboardWillHide",
      (e: { duration?: number }) => animateTo(0, e.duration ?? 200),
    );
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [height]);
  return height;
};

// "Settings" jumps back to the Compete form (the real settings live there).
const SETUP_PAGES = ["Settings", "Players", "Tables", "Review"];
const LIVE_PAGES = ["Dashboard", "Tables", "Queue", "Players"];
const RESULTS_PAGES = ["Standings", "Payouts", "History"];
const DEFAULT_PAGE: Record<string, string> = {
  setup: "Players",
  live: "Tables",
  results: "Standings",
};

// Registration lifecycle shown on the Players cards.
// Visible lifecycle status for a chip entry. Aliased to the shared lifecycle type so
// chip and elimination converge on one vocabulary (Pre-Registered → Registered → Ready).
type EntryState = LifecycleStatus;

// Strict zero-padded HH:MM:SS from the shared formatter (single source of truth
// so Admin, spectator, and profile timers stay identical). e.g. 00:03:42, 13:35:58.
const fmtClock = (ms: number) => formatElapsedClock(ms);
// Live match timer color: normal < 7:00, yellow 7:00–9:59, red ≥ 10:00.
const WARN_MATCH_MS = 7 * 60 * 1000;
const CRIT_MATCH_MS = 10 * 60 * 1000;
const timerColor = (ms: number) =>
  ms >= CRIT_MATCH_MS ? COLORS.error : ms >= WARN_MATCH_MS ? COLORS.warning : COLORS.success;
// Human duration: "9m 14s", "1h 2m", "45s".
const fmtDur = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
};

// ── Audit-log presentation ────────────────────────────────────────────────────
// Accent palette for the activity timeline (theme colors + a few event-specific
// hues). Module-level named constants (Hermes-safe — no 1–2 char identifiers).
const AUDIT_BLUE = COLORS.primary;
const AUDIT_GREEN = COLORS.success;
const AUDIT_RED = COLORS.error;
const AUDIT_PURPLE = "#8B5CF6";
const AUDIT_CYAN = "#06B6D4";
const AUDIT_ORANGE = "#F59E0B";
const AUDIT_DARKRED = "#B91C1C";
const AUDIT_TEAL = "#14B8A6";
const AUDIT_GRAY = COLORS.textMuted;

export type AuditCategory =
  | "Matches" | "Chips" | "Players" | "Tables" | "Shuffle" | "Undo" | "Admin";
// Dropdown options (label + the category it filters to). "Admin/System" reads
// clearer than "Admin" in a full-width menu.
export const AUDIT_FILTER_OPTS: { label: string; value: "All" | AuditCategory }[] = [
  { label: "All Actions", value: "All" },
  { label: "Matches", value: "Matches" },
  { label: "Chips", value: "Chips" },
  { label: "Players", value: "Players" },
  { label: "Tables", value: "Tables" },
  { label: "Shuffle", value: "Shuffle" },
  { label: "Undo / Redo", value: "Undo" },
  { label: "Admin / System", value: "Admin" },
];
export type AuditSort = "newest" | "oldest" | "type";
export const AUDIT_SORT_OPTS: { label: string; value: AuditSort }[] = [
  { label: "Newest", value: "newest" },
  { label: "Oldest", value: "oldest" },
  { label: "By Type", value: "type" },
];

// Live · Players tab — presentation-only sort options. "status" preserves the
// current authoritative/live ordering (chip.entries order); the rest are pure
// display sorts and never touch queue/table/winner-stays state.
export type LivePlayerSort =
  | "status"
  | "name"
  | "chipsDesc"
  | "chipsAsc"
  | "record"
  | "fargoDesc"
  | "fargoAsc";

// B5: session-scoped, per-tournament cache of the Players roster UI controls (Setup +
// Live search text, status filter, sort). The embedded ChipManageScreen remounts when the
// TD crosses setup⇄live or swaps Players↔Settings/Prize-Pool; without persisting these,
// that remount resets the search/filter/sort the TD had set. Keyed by tournament id,
// cleared on app restart. Correctness-neutral (affects only what the TD sees on return,
// never tournament data) and NOT global app state — a bounded, screen-local Map, same
// spirit as nav-cache. (Scroll-offset restoration is PARTIAL/deferred: in embedded mode
// the Setup roster scrolls inside the host's ScrollView, so it would need host
// coordination — tracked as a follow-up, not done here.)
type RosterUiState = {
  rosterQuery: string;
  rosterFilter: "all" | "prereg" | "registered" | "ready" | "no_show";
  rosterSort:
    | "default"
    | "name"
    | "fargoDesc"
    | "fargoAsc"
    | "chipsDesc"
    | "recent"
    | "status";
  liveQuery: string;
  liveSort: LivePlayerSort;
};
const rosterUiCache = new Map<number, RosterUiState>();

// B5/item-15: session-scoped, per-tournament set of dismissed live-alert ids. Keyed by a
// STABLE per-condition id (e.g. "shuffle:0", "reduce:5", "long:Table 3"), so a dismissal
// sticks across this screen's remounts and refreshes and only reappears when the condition
// materially changes (the id changes). Session-only (cleared on app restart) — advisory
// alerts don't warrant durable DB persistence.
const dismissedAlertsCache = new Map<number, Set<string>>();
export const LIVE_SORT_OPTS: { label: string; value: LivePlayerSort }[] = [
  { label: "Current / Status", value: "status" },
  { label: "Name A–Z", value: "name" },
  { label: "Chips — High to Low", value: "chipsDesc" },
  { label: "Chips — Low to High", value: "chipsAsc" },
  { label: "Record — Best First", value: "record" },
  { label: "Fargo — High to Low", value: "fargoDesc" },
  { label: "Fargo — Low to High", value: "fargoAsc" },
];

// Live · Tables tab — presentation-only sort. "default" = the authoritative board
// order (chip.tables). All others sort a shallow copy for display only.
export type LiveTableSort = "default" | "number" | "status" | "longest" | "shortest";
export const LIVE_TABLE_SORT_OPTS: { label: string; value: LiveTableSort }[] = [
  { label: "Current / Default", value: "default" },
  { label: "Table Number", value: "number" },
  { label: "Status", value: "status" },
  { label: "Longest Running", value: "longest" },
  { label: "Shortest Time", value: "shortest" },
];

// Strip any accumulated "Undo:/Redo:/Reverted:/Restored:" prefixes from an old
// event's text so the log never exposes recursive internal undo names.
const stripAuditPrefix = (s: string): string => {
  let out = s;
  let prev: string;
  do {
    prev = out;
    out = out.replace(/^\s*(undo|redo|reverted|restored|restore)(\s+action)?\s*:\s*/i, "").trim();
  } while (out !== prev);
  return out || s.trim();
};
// Preset reasons for a Tournament Restore (accountability). "Other…" requires a
// typed explanation before the Restore button enables.
export const RESTORE_REASONS = [
  "Incorrect winner",
  "Wrong chip adjustment",
  "Wrong table assignment",
  "Software issue",
  "Tournament Director mistake",
  "Other",
];

interface AuditMeta {
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  title: string;
  category: AuditCategory;
}
// Icon + accent + SPECIFIC human title + filter bucket for one event, so the
// timeline is scannable by color/shape and never shows a vague "Update". Titles
// for generic "manual"/"shuffle"/"table" events are refined from the text.
const auditMeta = (ev: ChipEvent): AuditMeta => {
  const t = ev.text.toLowerCase();
  switch (ev.type) {
    case "match_result":
      return { icon: "trophy", color: AUDIT_BLUE, title: "Match Completed", category: "Matches" };
    case "chip_adjust": {
      const delta = typeof ev.payload?.delta === "number" ? (ev.payload.delta as number) : (/-/.test(ev.text) ? -1 : 1);
      if (/restored/.test(t)) return { icon: "refresh-circle", color: AUDIT_GREEN, title: "Chip Restored", category: "Chips" };
      return delta >= 0
        ? { icon: "add-circle", color: AUDIT_GREEN, title: "Chip Added", category: "Chips" }
        : { icon: "remove-circle", color: AUDIT_RED, title: "Chip Removed", category: "Chips" };
    }
    case "chip_loss":
      return { icon: "remove-circle", color: AUDIT_RED, title: "Chip Lost", category: "Chips" };
    case "elimination":
      return { icon: "close-circle", color: AUDIT_DARKRED, title: "Player Eliminated", category: "Players" };
    case "forfeit":
      return { icon: "flag", color: AUDIT_DARKRED, title: "Forfeit", category: "Players" };
    case "player_added":
      return { icon: "person-add", color: AUDIT_TEAL, title: "Player Added", category: "Players" };
    case "shuffle":
      if (/ready to shuffle/.test(t)) return { icon: "shuffle", color: AUDIT_PURPLE, title: "Shuffle Ready", category: "Shuffle" };
      if (/reshuffle/.test(t)) return { icon: "shuffle", color: AUDIT_PURPLE, title: "Shuffle Started", category: "Shuffle" };
      return { icon: "shuffle", color: AUDIT_PURPLE, title: "Shuffle", category: "Shuffle" };
    case "table_added":
      return { icon: "albums", color: AUDIT_CYAN, title: /reactivated/.test(t) ? "Table Reactivated" : "Table Added", category: "Tables" };
    case "table_removed":
      return { icon: "albums", color: AUDIT_CYAN, title: /will close/.test(t) ? "Table Closing" : "Table Removed", category: "Tables" };
    case "move":
      return /queue/.test(t)
        ? { icon: "swap-vertical", color: AUDIT_CYAN, title: "Queue Reordered", category: "Tables" }
        : { icon: "swap-horizontal", color: AUDIT_CYAN, title: "Table Moved", category: "Tables" };
    case "restore":
      return { icon: "arrow-undo-circle", color: AUDIT_ORANGE, title: "Tournament Restored", category: "Undo" };
    // Director settings-override trail. Explicit cases so the text ("…unlocked"/"…locked")
    // isn't mis-caught by the default /unlocked/ /locked/ table-lock regexes below.
    case "settings_unlocked":
      return { icon: "lock-open", color: AUDIT_ORANGE, title: "Settings Unlocked", category: "Admin" };
    case "settings_updated_locked":
      return { icon: "create", color: AUDIT_BLUE, title: "Settings Updated & Locked", category: "Admin" };
    case "settings_relocked_no_save":
      return { icon: "lock-closed", color: AUDIT_GRAY, title: "Settings Relocked", category: "Admin" };
    case "undo":
      return { icon: "arrow-undo", color: AUDIT_ORANGE, title: "Undo", category: "Undo" };
    case "redo":
      return { icon: "arrow-redo", color: AUDIT_ORANGE, title: "Redo", category: "Undo" };
    default: {
      // "manual" — refine to a specific title from the text.
      if (/match started/.test(t)) return { icon: "play-circle", color: AUDIT_BLUE, title: "Match Started", category: "Matches" };
      if (/wins the tournament/.test(t)) return { icon: "trophy", color: AUDIT_BLUE, title: "Tournament Winner", category: "Matches" };
      if (/tournament started/.test(t)) return { icon: "flag", color: AUDIT_BLUE, title: "Tournament Started", category: "Admin" };
      if (/timer reset/.test(t)) return { icon: "timer", color: AUDIT_CYAN, title: "Timer Reset", category: "Tables" };
      if (/cleared/.test(t)) return { icon: "albums", color: AUDIT_CYAN, title: "Table Cleared", category: "Tables" };
      if (/unlocked/.test(t)) return { icon: "lock-open", color: AUDIT_CYAN, title: "Table Unlocked", category: "Tables" };
      if (/locked/.test(t)) return { icon: "lock-closed", color: AUDIT_CYAN, title: "Table Locked", category: "Tables" };
      if (/shuffle mode enabled/.test(t)) return { icon: "shuffle", color: AUDIT_PURPLE, title: "Shuffle Enabled", category: "Shuffle" };
      if (/shuffle mode disabled/.test(t)) return { icon: "shuffle", color: AUDIT_PURPLE, title: "Shuffle Disabled", category: "Shuffle" };
      if (/shuffle cancelled/.test(t)) return { icon: "shuffle", color: AUDIT_PURPLE, title: "Shuffle Cancelled", category: "Shuffle" };
      if (/bought back/.test(t)) return { icon: "refresh-circle", color: AUDIT_GREEN, title: "Bought Back", category: "Players" };
      return { icon: "ellipse", color: AUDIT_GRAY, title: "Update", category: "Admin" };
    }
  }
};
// Small relative stamp for recent events; falls back to null past a day so the
// caller can show the clock time instead.
const fmtRelative = (iso: string, nowMs: number): string | null => {
  const t = new Date(iso).getTime();
  if (isNaN(t)) return null;
  const min = Math.floor(Math.max(0, nowMs - t) / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min${min === 1 ? "" : "s"} ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hr${hr === 1 ? "" : "s"} ago`;
  return null;
};

// A single chip "page" the embedded body can render (driven by the standard
// manager's tab, so the chip engine lives inside that shell — no separate route).
export type ChipBodyPage =
  | "players"
  | "tables"
  | "review"
  | "live-dashboard"
  | "live-tables"
  | "live-queue"
  | "live-players"
  | "standings"
  | "payouts"
  | "history"
  | "summary";

interface ChipManageProps {
  id: number;
  // Embedded mode: render just the chip content for `embeddedPage` (no header /
  // PhaseNav / ScrollView — the host manager supplies those). `onGoLive` lets the
  // Review → Start action drive the host's phase nav.
  embedded?: boolean;
  embeddedPage?: ChipBodyPage;
  onGoLive?: () => void;
  // The host manager's global ⚡ Actions button controls this (so the chip
  // Actions modal opens from the shared page header on any chip page).
  actionsOpen?: boolean;
  onActionsOpenChange?: (open: boolean) => void;
  // Jump to another Live page (the host owns tab nav in embedded mode).
  onNavigate?: (tab: "players" | "tables" | "queue" | "dashboard") => void;
  // Ask the host page to scroll its ScrollView to the top (host owns scrolling).
  onRequestScrollTop?: () => void;
  // Open the tournament's Settings page (the host owns tab nav in embedded mode).
  onOpenSettings?: () => void;
  // Open the Results → Standings page (host owns tab nav in embedded mode).
  onOpenResults?: () => void;
  // Jump to a Setup page (host owns tab nav in embedded mode) — used by the
  // Review & Start quick actions to hop to Settings / Players / Tables / Prize Pool.
  onOpenSetupPage?: (tab: "settings" | "players" | "tables" | "prizepool") => void;
  // Read-only Prize Pool summary for Review & Start (the split + fee math lives in
  // the host manager, so it's computed there and passed down — see ChipReviewPrize).
  reviewPrize?: ChipReviewPrize | null;
  // Live Ready count from THIS screen's authoritative roster. The host uses it to
  // drive setup gating (Players step complete at ≥2 Ready) so the guided-flow
  // footer/dropdown reflect status changes made here without a stale refetch.
  onReadyCountChange?: (count: number) => void;
  // Live table count from THIS screen's authoritative chip state, for the same
  // reason: drives setup gating (Tables step complete at ≥1 table) live.
  onTableCountChange?: (count: number) => void;
  // Live player-readiness summary from THIS screen's authoritative chip state, so the
  // host's Players→Tables readiness modal never reads a stale roster query.
  onReadinessChange?: (summary: PlayerReadinessSummary | null) => void;
  // Fired ONCE after a confirmed Start Tournament so the host can flip its cached
  // tournament/header to Running immediately (this VM persists the start itself).
  onStarted?: () => void;
  // Bumped by the host's tournament-scoped registration Realtime subscription. This
  // roster is VM-driven (not a React Query key), so a change on this number triggers a
  // SILENT reload to surface cross-client registration changes (e.g. a player who just
  // self-registered from another device) without a spinner or scroll reset.
  reloadSignal?: number;
}

// Compact Prize Pool summary shown on Review & Start (computed by the host).
export interface ChipReviewPrize {
  total: number; // entry pool + side-pot pools (dollars)
  paidPlaces: number; // number of paid places in the main entry split
  complete: boolean; // isPrizePoolComplete — payouts valid & within the pool
  // Per-bucket allocation (entry + each enabled side pot) for the Start gate + display.
  buckets: PayoutBucketAllocation[];
  balanced: boolean; // EVERY enabled bucket allocates its pool exactly ($0 remaining)
}

// Next available number for tables sharing a base label (e.g. "Table", "Diamond"),
// so batch-adding never duplicates an existing "<base> <n>". Scans current labels
// for "<base> <digits>" (case-insensitive) and returns max + 1 (1 when none match).
const nextTableNumber = (
  tables: { label?: string | null }[],
  base: string,
): number => {
  const escaped = base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`^${escaped}\\s+(\\d+)$`, "i");
  let highest = 0;
  for (const tbl of tables) {
    const matched = tbl.label?.match(pattern);
    if (matched) highest = Math.max(highest, parseInt(matched[1], 10));
  }
  return highest + 1;
};

// ── Shuffle animation (presentation only) ───────────────────────────────────────
// A short billiards-themed flourish shown after the TD confirms a shuffle. It is
// PURELY cosmetic — the authoritative shuffle (beginShuffle) has already run in the
// engine before this mounts; this just plays for a beat, then calls onDone. Defined
// at module scope (never during render) and driven by ONE Animated value with the
// native driver, so it's cheap. `onDone` is guaranteed to fire once (timer fallback
// in case the animation is paused/interrupted, e.g. the app backgrounds).
const SHUFFLE_ANIM_MS = 3000;
// A 9-ball rack (diamond), matching a standard rack layout: 1 at the top, then 2/5,
// then 8/9/4, then 7/6, then 3 at the bottom. (dx, dy) = offset from cluster center.
const SHUFFLE_BALLS: { num: number; color: string; dx: number; dy: number }[] = [
  { num: 1, color: "#F4C20D", dx: 0, dy: -56 },
  { num: 2, color: "#1F6FEB", dx: -20, dy: -28 },
  { num: 5, color: "#F97316", dx: 20, dy: -28 },
  { num: 8, color: "#111111", dx: -40, dy: 0 },
  { num: 9, color: "#F4C20D", dx: 0, dy: 0 },
  { num: 4, color: "#8250DF", dx: 40, dy: 0 },
  { num: 7, color: "#7A1F2B", dx: -20, dy: 28 },
  { num: 6, color: "#2DA44E", dx: 20, dy: 28 },
  { num: 3, color: "#E5484D", dx: 0, dy: 56 },
];
const SHUFFLE_CLUSTER = 160; // cluster box; ball centers sit at (80 + dx, 80 + dy)
const SHUFFLE_SCATTER_R = 72; // radius balls fan out to at the mid-point of the mix
const ShuffleBallsAnimation = ({ onDone }: { onDone: () => void }) => {
  // useState initializer (not useRef().current) so the animated value isn't a ref
  // read during render — keeps the react-compiler lint clean.
  const [progress] = useState(() => new Animated.Value(0));
  const firedRef = useRef(false);
  useEffect(() => {
    const finish = () => {
      if (firedRef.current) return;
      firedRef.current = true;
      onDone();
    };
    const anim = Animated.timing(progress, {
      toValue: 1,
      duration: SHUFFLE_ANIM_MS,
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: true,
    });
    anim.start(({ finished }) => { if (finished) finish(); });
    // Safety net: guarantee routing even if the timing callback is missed.
    const fallback = setTimeout(finish, SHUFFLE_ANIM_MS + 600);
    return () => { anim.stop(); clearTimeout(fallback); };
  }, [progress, onDone]);
  // The whole rack spins twice while each ball fans OUT to a ring at the mid-point and
  // settles BACK into the rack — reads as the field being mixed and re-racked. No cue,
  // no table; just balls on the dark overlay.
  const spin = progress.interpolate({ inputRange: [0, 0.6, 1], outputRange: ["0deg", "430deg", "720deg"] });
  const scale = progress.interpolate({ inputRange: [0, 0.2, 0.85, 1], outputRange: [0.6, 1.08, 1.08, 1] });
  const half = SHUFFLE_CLUSTER / 2;
  return (
    <View style={styles.shufAnimRoot} pointerEvents="none">
      <Animated.View style={[styles.shufBallCluster, { transform: [{ rotate: spin }, { scale }] }]}>
        {SHUFFLE_BALLS.map((b, i) => {
          const ang = (i / SHUFFLE_BALLS.length) * Math.PI * 2;
          const rx = Math.cos(ang) * SHUFFLE_SCATTER_R;
          const ry = Math.sin(ang) * SHUFFLE_SCATTER_R;
          const translateX = progress.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, rx - b.dx, 0] });
          const translateY = progress.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, ry - b.dy, 0] });
          return (
            <Animated.View
              key={i}
              style={[styles.shufBall, { backgroundColor: b.color, left: half - 15 + b.dx, top: half - 15 + b.dy, transform: [{ translateX }, { translateY }] }]}
            >
              <View style={styles.shufBallDot}>
                <Text style={styles.shufBallNum}>{b.num}</Text>
              </View>
            </Animated.View>
          );
        })}
      </Animated.View>
      <Text style={styles.shufAnimLabel}>Shuffling…</Text>
    </View>
  );
};

export const ChipManageScreen = ({ id, embedded, embeddedPage, onGoLive, actionsOpen: actionsOpenProp, onActionsOpenChange, onNavigate, onRequestScrollTop, onOpenSettings, onOpenResults, onOpenSetupPage, reviewPrize, onReadyCountChange, onTableCountChange, onReadinessChange, onStarted, reloadSignal }: ChipManageProps) => {
  // Acting director identity (from auth) — passed into the VM so it can stamp gameplay
  // audit events, and reused by reason-gated actions. Computed BEFORE the VM call.
  const { profile } = useAuthContext();
  const actorId = profile?.id_auto ?? null;
  const actorName = (() => {
    const full = profile
      ? [profile.first_name, profile.last_name].filter(Boolean).join(" ").trim() ||
        profile.name ||
        profile.user_name ||
        ""
      : "";
    const parts = full.trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return "Tournament Director";
    return parts.length < 2 ? parts[0] : `${parts[0]} ${parts[parts.length - 1][0]}.`;
  })();
  const vm = useChipTournament(id, actorId, actorName);
  // Host bumps `reloadSignal` when its tournament-scoped registration Realtime channel
  // sees a change. Silently reload so a cross-client registration surfaces here without
  // a spinner/scroll reset. Refs keep reload stable and skip the initial mount value
  // (which the host's own load already covers) — the effect fires only on real changes.
  const reloadRef = useRef(vm.reload);
  useEffect(() => {
    reloadRef.current = vm.reload;
  }, [vm.reload]);
  const lastReloadSignal = useRef(reloadSignal);
  useEffect(() => {
    if (reloadSignal === lastReloadSignal.current) return;
    lastReloadSignal.current = reloadSignal;
    reloadRef.current({ silent: true });
  }, [reloadSignal]);
  // Shared completed-tournament lock. Every manager page reads this: when true the
  // pages are historical/read-only — all mutating controls are hidden. The engine
  // guards (see the viewmodel) enforce the same lock so stale UI can't change it.
  const readOnly = vm.isFinished;
  // Setup-roster lock for the SETUP Players page: read-only once the tournament is
  // LIVE (running) as well as when finished. While live, roster edits must go through
  // the controlled Add Late Player flow (Phase 2), never the setup editor. The
  // viewmodel enforces the same lock on every mutation method (defense-in-depth), so
  // this only governs presentation. Uses authoritative live state (vm.isLive), not
  // local nav — completed behaviour (readOnly) is unchanged since it's a subset.
  const setupLocked = readOnly || vm.isLive;
  const router = useRouter();
  // Acting Tournament Director — recorded on restores as "Performed by".
  // Consistent display names: First name + Last initial ("Brandee Ogunjobi" →
  // "Brandee O."). When two DISTINCT players would collapse to the same short
  // form (e.g. "Tyler Braun" + "Tyler Brown" → "Tyler B."), those specific names
  // expand to their full name so every player is uniquely identifiable — and the
  // resolved name is used everywhere so nobody flips between forms across screens.
  const nameMap = useMemo(() => {
    const shortOf = (full: string) => {
      const parts = full.trim().split(/\s+/).filter(Boolean);
      if (parts.length < 2) return parts[0] ?? full.trim();
      return `${parts[0]} ${parts[parts.length - 1][0]}.`;
    };
    const names = new Set<string>();
    for (const e of vm.chip?.entries ?? []) {
      if (e.p1Name?.trim()) names.add(e.p1Name.trim());
      if (e.p2Name?.trim()) names.add(e.p2Name.trim());
    }
    const groups = new Map<string, string[]>();
    for (const full of names) {
      const s = shortOf(full);
      const arr = groups.get(s) ?? [];
      arr.push(full);
      groups.set(s, arr);
    }
    const map = new Map<string, string>();
    for (const [, fulls] of groups) {
      if (fulls.length <= 1) map.set(fulls[0], shortOf(fulls[0]));
      else for (const full of fulls) map.set(full, full); // conflict → full names
    }
    return map;
  }, [vm.chip?.entries]);
  const [selectedPhase, setSelectedPhase] = useState<"setup" | "live" | "results">("setup");
  const [page, setPage] = useState<string>("Players");
  const initedRef = useRef(false);
  const [now, setNow] = useState(Date.now());
  const { width: winW, height: winH } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  // Desktop two-column dashboard layout (web only, roomy widths).
  const dashTwoCol = isWeb && winW >= 980;
  // Ultra-wide: Active Tables can fit three cards per row.
  const dashUltra = isWeb && winW >= 1500;
  // Players tab: which team row is expanded in the compact desktop table.
  const [expandedEntryId, setExpandedEntryId] = useState<string | null>(null);
  // TD player search: pick a REAL user (by player id) so same-named players can't
  // be confused. "new" = a new entry's Player 1; "partner" = an entry's Player 2.
  const playerSearch = usePlayerSearch();
  const kbHeight = useKeyboardHeight();
  const [picker, setPicker] = useState<
    { mode: "new" } | { mode: "partner"; entryId: string } | null
  >(null);
  // Phase 5: unified Scotch-Doubles Add Team flow. When set, the shared search-first
  // modal is open instead of the legacy picker + Fargo popup. resumeTeam != null =>
  // "Add Player 2" on an existing waiting team. Singles keeps the legacy picker.
  const [unifiedOpen, setUnifiedOpen] = useState<
    { resumeTeam: { teamId: number; captainName: string | null } | null } | null
  >(null);
  // Edit an attached PENDING team member (players.id) via the shared modal.
  const [editPlayerId, setEditPlayerId] = useState<string | null>(null);
  // The picker sheet has two content-driven heights: a compact state before the
  // user types, and an expanded state once results appear. Animate the switch so
  // the sheet grows/shrinks smoothly instead of snapping.
  const sheetExpanded = playerSearch.query.trim().length >= 2;
  useEffect(() => {
    if (isWeb || !picker) return;
    LayoutAnimation.configureNext(
      LayoutAnimation.create(
        200,
        LayoutAnimation.Types.easeInEaseOut,
        LayoutAnimation.Properties.scaleXY,
      ),
    );
  }, [sheetExpanded, picker]);
  // After picking a player we ask for their Fargo, then create a REAL member
  // (so it's verifiable + persists — no more local-only "No Fargo" rows).
  const [addFargo, setAddFargo] = useState<
    { mode: "new"; player: Profile } | { mode: "partner"; entryId: string; player: Profile } | null
  >(null);
  const [addFargoVal, setAddFargoVal] = useState("");
  const onPickProfile = (p: Profile) => {
    if (!picker) return;
    setAddFargo(
      picker.mode === "new"
        ? { mode: "new", player: p }
        : { mode: "partner", entryId: picker.entryId, player: p },
    );
    setAddFargoVal("");
    setPicker(null);
    playerSearch.reset();
  };

  // TD approval: confirm the player's Fargo, which becomes their VERIFIED profile
  // Fargo and this event's snapshot (see the Fargo verification flow).
  const [approve, setApprove] = useState<
    | { kind: "reg"; regId: number; name: string }
    | { kind: "member"; memberId: number; name: string }
    | null
  >(null);
  const [approveFargo, setApproveFargo] = useState("");
  const [approving, setApproving] = useState(false);

  // Live Ready count for the host's setup gating (Players complete at ≥2 Ready).
  // Computed with the SAME lifecycle filter the roster uses (chipReadyEntries ==
  // entryState === "ready"), and published on every change so the guided-flow
  // footer/dropdown update the instant a player is marked Ready — no stale refetch.
  // Kept above the loading guard so the Hook order stays stable.
  const liveReadyCount = useMemo(() => {
    const c = vm.chip;
    const t = vm.tournament;
    if (!c) return null;
    const phase: LifecyclePhase =
      t?.status === "completed" || t?.live_state === "finished"
        ? "completed"
        : t?.live_state === "in_progress"
          ? "live"
          : "setup";
    return chipReadyEntries(c.entries, {
      phase,
      doubles: c.settings.format === "scotch_doubles",
      entryFeeRequired: (Number(t?.entry_fee) || 0) > 0,
    }).length;
  }, [vm.chip, vm.tournament]);
  useEffect(() => {
    if (liveReadyCount != null) onReadyCountChange?.(liveReadyCount);
  }, [liveReadyCount, onReadyCountChange]);
  // Live table count for the host's setup gating (Tables complete at ≥1 table).
  // Same authoritative chip state the Tables screen renders; kept above the loading
  // guard so the Hook order stays stable.
  const liveTableCount = vm.chip ? vm.chip.tables.length : null;
  useEffect(() => {
    if (liveTableCount != null) onTableCountChange?.(liveTableCount);
  }, [liveTableCount, onTableCountChange]);

  // Live player-readiness SUMMARY for the host's Players→Tables gate. Built from THIS
  // (embedded) VM's authoritative live chip state via the SHARED helper, so the host's
  // readiness modal never reads the host's separate (stale) chip-roster query.
  const liveReadiness = useMemo<PlayerReadinessSummary | null>(() => {
    const c = vm.chip;
    const t = vm.tournament;
    if (!c) return null;
    const doubles = c.settings.format === "scotch_doubles";
    const entryFeeRequired = (Number(t?.entry_fee) || 0) > 0;
    // Side-pot info is informational only; infer presence from entry memberships
    // (ChipSettings carries no pot config on this VM).
    const hasSidePots = c.entries.some((e) => (e.paidSidePots?.length ?? 0) > 0);
    const ctx = { phase: "setup" as const, doubles, entryFeeRequired };
    const rows: ReadinessRow[] = c.entries.map((e) => ({
      status: chipEntryLifecycle(e, ctx),
      paid: !!e.paid,
      entryFeeRequired,
      inAnySidePot: (e.paidSidePots?.length ?? 0) > 0,
    }));
    return buildReadinessSummary(rows, doubles, hasSidePots);
  }, [vm.chip, vm.tournament]);
  useEffect(() => {
    onReadinessChange?.(liveReadiness);
  }, [liveReadiness, onReadinessChange]);
  // ── Tables setup: rename dialog, bulk-add sheet, inline stream editor ─────────
  const [renameTbl, setRenameTbl] = useState<{ id: string; label: string } | null>(null);
  const [renameVal, setRenameVal] = useState("");
  const [streamEditId, setStreamEditId] = useState<string | null>(null);
  const [streamVal, setStreamVal] = useState("");
  // Live-play stream-link editor (a centered modal, opened from the table menus).
  const [streamLinkId, setStreamLinkId] = useState<string | null>(null);
  const [streamLinkVal, setStreamLinkVal] = useState("");
  const [addTblOpen, setAddTblOpen] = useState(false);
  const [addTblCount, setAddTblCount] = useState(1);
  // Optional shared label applied to every table in a batch (numbers auto-append).
  const [addTblLabel, setAddTblLabel] = useState("");
  // Which Review & Start summary sections are expanded (collapsed by default).
  const [reviewOpen, setReviewOpen] = useState<Record<string, boolean>>({});
  // Live table management: reduce-tables selection sheet (also used as the
  // "Manage Tables" step of a shuffle cycle).
  const [reduceOpen, setReduceOpen] = useState(false);
  const [reduceSel, setReduceSel] = useState<string[]>([]);
  // ⚡ Actions quick-sheet (controlled by the host header when embedded) + Audit Log.
  const [actionsInternal, setActionsInternal] = useState(false);
  const actionsOpen = actionsOpenProp ?? actionsInternal;
  const setActionsOpen = onActionsOpenChange ?? setActionsInternal;
  const [auditOpen, setAuditOpen] = useState(false);
  // Audit-log timeline controls: text search, category filter, and the per-row
  // ⋯ action menu (which event it's open for, or null).
  const [auditSearch, setAuditSearch] = useState("");
  const [auditFilter, setAuditFilter] = useState<"All" | AuditCategory>("All");
  const [auditSort, setAuditSort] = useState<AuditSort>("newest");
  const [auditDropdown, setAuditDropdown] = useState<"filter" | "sort" | null>(null);
  // Per-row ⋯ menu, anchored at the tap coords. Carries the restore target id
  // (oldest of a merged group) so "Restore to Here" reverts the whole group.
  const [auditMenu, setAuditMenu] = useState<{ ev: ChipEvent; targetId: string; x: number; y: number } | null>(null);
  // View Details modal — the event whose full breakdown is shown.
  const [detailEv, setDetailEv] = useState<ChipEvent | null>(null);
  // Restore-confirmation: the target event id, a required reason, optional notes.
  const [restoreTargetId, setRestoreTargetId] = useState<string | null>(null);
  const [restoreReason, setRestoreReason] = useState<string | null>(null);
  const [restoreReasonOpen, setRestoreReasonOpen] = useState(false);
  const [restoreNotes, setRestoreNotes] = useState("");
  // Team/player Tournament Profile (tap a row to open) + its header context menu,
  // which floats INSIDE the same modal (no nested modal / bottom sheet).
  const [profileId, setProfileId] = useState<string | null>(null);
  const [profMenuOpen, setProfMenuOpen] = useState(false);
  // Results · Final Standings: collapsed to the top few by default, expandable.
  const [resultsStandingsExpanded, setResultsStandingsExpanded] = useState(false);
  const profScrollRef = useRef<ScrollView>(null);
  const closeProfile = () => { setProfMenuOpen(false); setProfileId(null); };
  // Dashboard expand toggles.
  const [showFullStandings, setShowFullStandings] = useState(false);
  // Restore-chip (eliminated team) reason prompt.
  // Complete-match winner picker (Tables page).
  const [completeMatch, setCompleteMatch] = useState<{ matchId: string; aId: string; bId: string } | null>(null);
  // Manual chip-override session (reason-gated). Opened from the +/- chip controls.
  const [chipAdjust, setChipAdjust] = useState<{ entryId: string; name: string; current: number; playing: boolean } | null>(null);
  const [chipAdjustNew, setChipAdjustNew] = useState(0);
  const [chipAdjustReason, setChipAdjustReason] = useState<string | null>(null);
  const [chipAdjustNotes, setChipAdjustNotes] = useState("");
  // Forfeit decision (reason-gated). Opened from the table ⋮, the queue row, and the
  // player ⋮. Offers Forfeit Match (−1 chip, back of queue, opponent wins) only when the
  // entry has a live match; always offers Forfeit Tournament (authoritative elimination).
  const [forfeit, setForfeit] = useState<{ entryId: string; name: string; matchId: string | null; oppName: string | null } | null>(null);
  const [forfeitReason, setForfeitReason] = useState<string | null>(null);
  const [forfeitNotes, setForfeitNotes] = useState("");
  // Tables master/detail: open detail for a table, and the move-destination picker.
  const [tableDetailId, setTableDetailId] = useState<string | null>(null);
  const [moveFromId, setMoveFromId] = useState<string | null>(null);
  const [manualAssignId, setManualAssignId] = useState<string | null>(null);
  const [tableHistoryId, setTableHistoryId] = useState<string | null>(null);
  // Player ⋮ actions: an anchored dropdown that drops from the tapped button and
  // opens leftward. We measure the button in the window, then place the menu.
  const [playerMenu, setPlayerMenu] = useState<MenuPos | null>(null);
  const playerMenuRefs = useRef<Record<string, any>>({});
  // Table ⋮ actions: same anchored-dropdown pattern for the Active Tables rows.
  // Anchored menu position: `left` + EITHER `top` (open downward) OR `bottom` (open
  // upward), plus `maxH` = the card's max height on the chosen side (internal scroll
  // when the content is taller). Guarantees the whole card stays on-screen.
  type MenuPos = { id: string; left: number; top?: number; bottom?: number; maxH: number };
  const [tableMenu, setTableMenu] = useState<MenuPos | null>(null);
  const tableMenuRefs = useRef<Record<string, any>>({});
  // Separate ref map for the SAME table card rendered inside the "View All Tables"
  // modal, so its ⋮ anchors to the modal card (never collides with the preview card).
  const dashModalTableMenuRefs = useRef<Record<string, any>>({});
  // Actions sheet layered INSIDE the Table Details modal (one native modal, no
  // nesting) + which history rows are expanded in the Match History modal.
  const [detailActions, setDetailActions] = useState(false);
  const [histOpenIds, setHistOpenIds] = useState<string[]>([]);
  // Full-screen queue manager + the per-team action sheet inside it.
  const [queueModalOpen, setQueueModalOpen] = useState(false);
  const [queueMenuId, setQueueMenuId] = useState<string | null>(null);
  // Admin dashboard "Active Tables" preview → full-list modal (dashboard only; the
  // Live → Tables management tab is unchanged).
  const [dashTablesOpen, setDashTablesOpen] = useState(false);
  // Live → Tables tab: view mode (resets to "card" on leaving the page) + sort.
  const [tablesView, setTablesView] = useState<"card" | "list">("card");
  const [tablesSort, setTablesSort] = useState<LiveTableSort>("default");
  const [tablesSortMenuOpen, setTablesSortMenuOpen] = useState(false);
  // Shuffle flow (Live → Tables): a compact confirm modal (pick tables to remove
  // after the round) → cosmetic animation → route to the dashboard. All authoritative
  // work reuses the engine (closeTables + beginShuffle); no new persisted state.
  const [shuffleModalOpen, setShuffleModalOpen] = useState(false);
  const [shuffleRemoveIds, setShuffleRemoveIds] = useState<Set<string>>(new Set());
  const [shuffleAnimating, setShuffleAnimating] = useState(false);
  // "Next match" assignment popup: shown once per winner-stays assignment. The
  // ref tracks which pending assignments were already surfaced (so a re-render or
  // a re-received assignment doesn't reopen it).
  const [assignPopupTableId, setAssignPopupTableId] = useState<string | null>(null);
  const ackedPendingRef = useRef<Set<string>>(new Set());
  // Champion confirmation: shown once per decided winner while still Live. Confetti
  // fires exactly once when the TD taps Finish (guarded so it never replays on
  // reload/undo). `championShownRef` remembers which winnerId we've surfaced.
  const [championModalOpen, setChampionModalOpen] = useState(false);
  const championShownRef = useRef<string | null>(null);
  const confettiFiredRef = useRef<string | null>(null);
  const confettiRef = useRef<ConfettiBurstRef>(null);
  // Last-known keyboard height (px). The Add-Tables sheet reserves exactly this
  // much space beneath itself when you enter Customize mode, so the keyboard
  // then slides UNDER the sheet without shifting it. Seeded with a modern iOS
  // default until the keyboard is first shown.
  const [kbPx, setKbPx] = useState(336);
  useEffect(() => {
    if (Platform.OS !== "ios") return;
    const sub = Keyboard.addListener("keyboardWillShow", (e) =>
      setKbPx(e.endCoordinates.height),
    );
    return () => sub.remove();
  }, []);
  const openApprove = (regId: number, name: string, fargo: number | null) => {
    setApprove({ kind: "reg", regId, name });
    setApproveFargo(fargo == null ? "" : String(fargo));
  };
  const openConfirmMember = (memberId: number, name: string, fargo: number | null) => {
    setApprove({ kind: "member", memberId, name });
    setApproveFargo(fargo == null ? "" : String(fargo));
  };
  const submitApprove = async () => {
    if (!approve) return;
    const digits = approveFargo.replace(/\D/g, "");
    if (digits === "") return;
    setApproving(true);
    try {
      const f = parseInt(digits, 10);
      if (approve.kind === "reg") await vm.approveRegistration(approve.regId, f);
      else await vm.confirmTeamMemberFargo(approve.memberId, f);
      setApprove(null);
      setApproveFargo("");
    } catch {
      Alert.alert("Error", "Couldn't confirm this player's Fargo. Please try again.");
    } finally {
      setApproving(false);
    }
  };

  // Players page (registration manager) UI state: search, status filter, per-card
  // edit mode, and the three-dot menu target.
  // Seed from the per-tournament UI cache so search/filter/sort survive a remount (B5).
  const [rosterQuery, setRosterQuery] = useState(() => rosterUiCache.get(id)?.rosterQuery ?? "");
  const [rosterFilter, setRosterFilter] = useState<"all" | "prereg" | "registered" | "ready" | "no_show">(
    () => rosterUiCache.get(id)?.rosterFilter ?? "all",
  );
  const [rosterSort, setRosterSort] = useState<
    "default" | "name" | "fargoDesc" | "fargoAsc" | "chipsDesc" | "recent" | "status"
  >(() => rosterUiCache.get(id)?.rosterSort ?? "default");
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  // Live · Players tab — presentation-only search + sort (separate from the Setup
  // roster controls above; never touches queue/table/winner-stays state).
  const [liveQuery, setLiveQuery] = useState(() => rosterUiCache.get(id)?.liveQuery ?? "");
  const [liveSort, setLiveSort] = useState<LivePlayerSort>(() => rosterUiCache.get(id)?.liveSort ?? "status");
  const [liveSortMenuOpen, setLiveSortMenuOpen] = useState(false);
  const [editEntryId, setEditEntryId] = useState<string | null>(null);
  // Fargo-cap override modals: confirm (Allow over cap?) → reason (chips + notes); plus a
  // resolve prompt when a Ready entry's rating/cap changes past its override coverage.
  const [capConfirm, setCapConfirm] = useState<{ entryId: string } | null>(null);
  const [capResolve, setCapResolve] = useState<{ entryId: string } | null>(null);
  const [capReason, setCapReason] = useState<{ entryId: string } | null>(null);
  const [capReasonChoice, setCapReasonChoice] = useState<string>("Point Cushion");
  const [capReasonNotes, setCapReasonNotes] = useState<string>("");
  const [capReasonMenuOpen, setCapReasonMenuOpen] = useState(false);
  const [menuEntryId, setMenuEntryId] = useState<string | null>(null);
  // Persist the roster UI controls so they survive this screen's remount (B5).
  useEffect(() => {
    rosterUiCache.set(id, { rosterQuery, rosterFilter, rosterSort, liveQuery, liveSort });
  }, [id, rosterQuery, rosterFilter, rosterSort, liveQuery, liveSort]);
  // Live-alert dismissals (item 15) — persisted per tournament across remounts.
  const [dismissedAlerts, setDismissedAlerts] = useState<Set<string>>(
    () => dismissedAlertsCache.get(id) ?? new Set(),
  );
  const dismissAlert = useCallback(
    (alertId: string) =>
      setDismissedAlerts((prev) => {
        const next = new Set(prev);
        next.add(alertId);
        dismissedAlertsCache.set(id, next);
        return next;
      }),
    [id],
  );
  const [alertsModalOpen, setAlertsModalOpen] = useState(false);
  // Window rect of the Actions button that opened the menu (for above/below math) +
  // the screen-root's window origin (so we can position the in-tree overlay, which
  // lives inside the scroll content, in the root's coordinate space).
  const [menuAnchor, setMenuAnchor] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [menuRoot, setMenuRoot] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const rootRef = useRef<View>(null);
  // ── Card-focused Edit Player positioning (non-embedded) — ONE controller ─────
  // The single owner of scrolling for this feature is positionEditingCard(). Everything
  // else (edit-enter, Fargo focus, Fargo blur) just requests it once at a known-good
  // moment. It targets an ABSOLUTE content offset derived from the card's onLayout y
  // (stable, scroll-offset-independent) — NOT a delta from the live scroll offset — so it
  // can never accumulate error or clamp to 0 and jump to the top.
  const rosterScrollRef = useRef<KeyboardAwareScrollView>(null);
  const scrollAreaRef = useRef<View>(null);
  const cardTops = useRef<Record<string, number>>({}); // onLayout y within the roster content
  const cardHeights = useRef<Record<string, number>>({}); // onLayout height
  const kbNumRef = useRef(0); // numeric keyboard height (px)
  const pendingSnapRef = useRef<string | null>(null); // card awaiting its first edit-mode snap
  // Latest editEntryId for use inside the (once-registered) keyboard listeners.
  const editEntryIdRef = useRef<string | null>(null);
  editEntryIdRef.current = editEntryId;

  // THE one place that scrolls for Edit Player. mode "edit" = keyboard closed (usable
  // bottom = pinned footer top); mode "keyboard" = usable bottom = keyboard top. Fits →
  // top-anchor the card just below the header; too tall → bottom-anchor so Done / Ready
  // stay visible. Invalid measurement → do nothing (never falls back to y=0).
  const positionEditingCard = (entryId: string | null, mode: "edit" | "keyboard") => {
    if (entryId == null) return;
    const cardTop = cardTops.current[entryId];
    const cardH = cardHeights.current[entryId];
    const areaNode = scrollAreaRef.current;
    // Guard: without a valid card layout + scroll area, bail rather than scroll to 0.
    if (cardTop == null || !(cardH > 0) || !areaNode?.measureInWindow) return;
    areaNode.measureInWindow((_ax, areaTopWin, _aw, areaH) => {
      if (!(areaH > 0)) return;
      const GAP = webSc(14);
      const CONTENT_PAD = webSc(SPACING.md); // roster content container top padding
      const screenH = Dimensions.get("window").height;
      const kb = mode === "keyboard" ? kbNumRef.current : 0;
      // Portion of the scroll area covered by the keyboard (0 when closed).
      const overlap = Math.max(0, areaTopWin + areaH - (screenH - kb));
      const usableH = areaH - overlap;
      const cardContentTop = CONTENT_PAD + cardTop; // absolute offset in the scroll content
      // Fits → top-anchor (card top GAP below the viewport top). Too tall → bottom-anchor
      // (card bottom GAP above the usable bottom) so the footer controls stay visible.
      const target =
        cardH + GAP * 2 <= usableH
          ? cardContentTop - GAP
          : cardContentTop + cardH - usableH + GAP;
      if (!Number.isFinite(target)) return;
      rosterScrollRef.current?.scrollToPosition(0, Math.max(0, target), true);
    });
  };

  // Enter Edit Player → ONE snap once the edit-mode layout is ready. The card's onLayout
  // (below) fires the snap when it lands; this rAF is a fallback for when the height is
  // unchanged and onLayout doesn't re-fire. The pending flag guarantees exactly one.
  useEffect(() => {
    if (editEntryId == null) { pendingSnapRef.current = null; return; }
    pendingSnapRef.current = editEntryId;
    const raf = requestAnimationFrame(() => {
      if (pendingSnapRef.current === editEntryId) {
        pendingSnapRef.current = null;
        positionEditingCard(editEntryId, "edit");
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [editEntryId]);

  // Keyboard listeners (registered ONCE). Fargo focus → keyboardWillShow (final height is
  // known) → snap for the keyboard viewport. Fargo blur → keyboardDidHide (keyboard fully
  // gone, layout settled) → re-settle in the edit viewport. Both guarded by the live
  // editEntryId so leaving edit mode (Done) never triggers a stray snap.
  useEffect(() => {
    const show = Keyboard.addListener("keyboardWillShow", (e: { endCoordinates?: { height?: number } }) => {
      kbNumRef.current = e?.endCoordinates?.height ?? 0;
      if (editEntryIdRef.current != null) positionEditingCard(editEntryIdRef.current, "keyboard");
    });
    const hide = Keyboard.addListener("keyboardDidHide", () => {
      kbNumRef.current = 0;
      if (editEntryIdRef.current != null) positionEditingCard(editEntryIdRef.current, "edit");
    });
    return () => { show.remove(); hide.remove(); };
  }, []);
  const closeMenu = () => {
    setMenuEntryId(null);
    setMenuAnchor(null);
  };
  const openActionsMenu = (entryId: string, anchor: ActionsAnchor) => {
    // Capture the root's window origin so the overlay (inside the scroll content) can
    // convert the button's window rect into root-relative coordinates.
    if (rootRef.current?.measureInWindow) {
      rootRef.current.measureInWindow((rx, ry) => {
        setMenuRoot({ x: rx, y: ry });
        setMenuAnchor(anchor);
        setMenuEntryId(entryId);
      });
    } else {
      setMenuRoot({ x: 0, y: 0 });
      setMenuAnchor(anchor);
      setMenuEntryId(entryId);
    }
  };

  useEffect(() => {
    if (vm.phase !== "live") return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [vm.phase]);

  // Surface the "Next Match" popup once per new winner-stays assignment (a table
  // that has a holder + a pending challenger, awaiting Start Match).
  useEffect(() => {
    // An ack should suppress the popup only for a table's CURRENT pending
    // assignment (so "Not Yet" isn't nagged). Prune any ack that no longer
    // matches a live pending — once that match is started or the assignment
    // changes, the NEXT winner-stays assignment must re-prompt, INCLUDING the
    // same team returning to the same table. Without this the prompt fired only
    // once per (table, challenger) pairing for the whole tournament.
    const validAcks = new Set<string>();
    for (const t of vm.chip?.tables ?? []) {
      if (t.pendingChallengerId && !t.matchId) validAcks.add(`${t.id}:${t.pendingChallengerId}`);
    }
    for (const key of Array.from(ackedPendingRef.current)) {
      if (!validAcks.has(key)) ackedPendingRef.current.delete(key);
    }

    if (assignPopupTableId) return;
    // The "Next Match / Incoming Team" callout fires ONLY for a genuine winner-stays
    // next challenger — a pending created because a completed match freed the table
    // (isPostMatchPending: the holder has already played). An OPENING matchup merely
    // Waiting to Start (holder has never played) is deliberately excluded, so
    // assigning/starting the opening never pops the callout; each table only starts
    // calling its next match once its OWN match completes and a winner is recorded.
    const c = vm.chip;
    const pend = c?.tables?.find(
      (t) => isPostMatchPending(c, t) && !ackedPendingRef.current.has(`${t.id}:${t.pendingChallengerId}`),
    );
    if (pend) setAssignPopupTableId(pend.id);
  }, [vm.chip, assignPopupTableId]);

  // Scroll-to-top bridge. Chip LIVE pages own their ScrollView (see the embedded
  // return), so the host's onRequestScrollTop (which scrolls the shared page
  // ScrollView) is a no-op there. This ref points at whichever live ScrollView is
  // currently mounted — Tables' own sticky ScrollView OR the shared Dashboard/Queue/
  // Players wrapper (only one is mounted at a time). scrollToTop prefers it and falls
  // back to the host for setup/results pages.
  const liveScrollRef = useRef<ScrollView>(null);
  const scrollToTop = useCallback(() => {
    if (liveScrollRef.current) liveScrollRef.current.scrollTo({ y: 0, animated: true });
    else onRequestScrollTop?.();
  }, [onRequestScrollTop]);
  // Y offset of the on-page "Chip Leaders" section within the live scroll content, so the
  // Chip Leader card's "View Standings" CTA can scroll to it instead of no-op (item 24).
  const leadersYRef = useRef(0);
  const scrollToLeaders = useCallback(() => {
    setShowFullStandings(true);
    liveScrollRef.current?.scrollTo({ y: Math.max(0, leadersYRef.current), animated: true });
  }, []);

  // Route to the Live Dashboard — the authoritative Shuffle-transition hub. Embedded:
  // ask the host to switch tabs + scroll top. Standalone: drive our own phase/page.
  const goToDashboard = useCallback(() => {
    if (embedded) {
      onNavigate?.("dashboard");
      onRequestScrollTop?.();
    } else {
      setSelectedPhase("live");
      setPage("Dashboard");
    }
  }, [embedded, onNavigate, onRequestScrollTop]);
  // Cosmetic shuffle animation finished → tear it down and land on the dashboard.
  // Stable identity so the animation child's effect never restarts mid-play.
  const onShuffleAnimDone = useCallback(() => {
    setShuffleAnimating(false);
    goToDashboard();
  }, [goToDashboard]);

  // Pull-to-refresh for the live-owned ScrollViews. A DEDICATED flag (not vm.refreshing,
  // which also flips during post-mutation background revalidation) so the native
  // spinner shows ONLY during an actual pull. Reuses the VM's silent reload — the same
  // server reconcile the host's pull previously ran — refreshing the on-screen chip data.
  const [pullRefreshing, setPullRefreshing] = useState(false);
  const onPullRefresh = useCallback(async () => {
    setPullRefreshing(true);
    try {
      await vm.reload({ silent: true });
    } finally {
      setPullRefreshing(false);
    }
  }, [vm]);
  const liveRefreshControl = isWeb ? undefined : (
    <RefreshControl refreshing={pullRefreshing} onRefresh={onPullRefresh} tintColor={COLORS.primary} />
  );

  // When a shuffle round completes (→ "Ready to Shuffle"), jump the page to the
  // top so the Shuffle Mode banner / Start Shuffle button is right there.
  const prevReadyRef = useRef(false);
  useEffect(() => {
    const ready = !!vm.chip?.shuffleReady;
    if (ready && !prevReadyRef.current) scrollToTop();
    prevReadyRef.current = ready;
  }, [vm.chip?.shuffleReady, scrollToTop]);

  // When Shuffle Mode is turned ON (from the Actions sheet, the dashboard header
  // button, or the Tables toolbar's Begin-Shuffle), scroll the live page up so the
  // Shuffle banner is visible. In an effect (not the tap handler) so the live-scroll
  // ref read stays out of render.
  const prevShuffleModeRef = useRef(false);
  useEffect(() => {
    const on = !!vm.chip?.shuffleMode;
    if (on && !prevShuffleModeRef.current) scrollToTop();
    prevShuffleModeRef.current = on;
  }, [vm.chip?.shuffleMode, scrollToTop]);

  // Land on the current phase ONCE after the first load. After that the TD drives
  // the nav — starting the tournament must not yank them off Settings.
  useEffect(() => {
    if (vm.loading || initedRef.current) return;
    initedRef.current = true;
    setSelectedPhase(vm.phase);
    setPage(DEFAULT_PAGE[vm.phase]);
  }, [vm.loading, vm.phase]);

  // When the winner-stays queue crowns a champion (one entry left), nudge the TD
  // to finish the event — the engine sets chip.winnerId, but the tournament only
  // moves to Results when the TD ends it. Fires once per decision.
  useEffect(() => {
    const winnerId = vm.chip?.winnerId;
    // Only while the champion is decided but the event is still Live (not yet
    // finished). Surface the modal once per winnerId.
    if (!winnerId || vm.phase !== "live") {
      championShownRef.current = null;
      return;
    }
    if (championShownRef.current === winnerId) return;
    championShownRef.current = winnerId;
    setChampionModalOpen(true);
  }, [vm.chip?.winnerId, vm.phase]);

  // The one Finish action (shared by the champion modal, the champion card, and
  // the Actions sheet). Idempotent: fires confetti once per winner, then hands off
  // to the vm's idempotent endTournament (no double-complete / duplicate rows).
  const doFinishTournament = () => {
    // Idempotent at the UI layer: ignore repeat taps while finishing or once done.
    if (vm.finishing || vm.isFinished) { setChampionModalOpen(false); return; }
    const winnerId = vm.chip?.winnerId;
    setChampionModalOpen(false);
    if (winnerId && confettiFiredRef.current !== winnerId) {
      confettiFiredRef.current = winnerId;
      confettiRef.current?.fire();
    }
    vm.endTournament();
  };

  // Full-body loader ONLY on the initial, never-loaded state (no chip yet). Once the
  // roster exists, background reconciles (vm.refreshing) keep it on screen — a mutation
  // never blanks the list or remounts the screen.
  if (vm.loading && !vm.chip) {
    if (embedded) {
      return (
        <View style={[styles.center, { paddingVertical: webSc(SPACING.xl) }]}>
          <ActivityIndicator color={COLORS.primary} />
        </View>
      );
    }
    // Keep the header so the push transition lands on a consistent screen instead
    // of flashing a bare spinner.
    return (
      <View style={styles.container}>
        <View style={[styles.header, isWeb && styles.headerWeb]}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.back}>‹ Back</Text>
          </TouchableOpacity>
          <View style={styles.headerCenter} />
          <View style={{ width: webSc(44) }} />
        </View>
        <View style={styles.center}>
          <ActivityIndicator color={COLORS.primary} />
        </View>
      </View>
    );
  }
  if (vm.error || !vm.chip || !vm.tournament) {
    return (
      <View style={[styles.center, embedded && { paddingVertical: webSc(SPACING.xl) }]}>
        <Text style={styles.errorText}>{vm.error ?? "Tournament not found."}</Text>
      </View>
    );
  }

  const { chip, tournament } = vm;
  const doubles = chip.settings.format === "scotch_doubles";
  // Fargo label: only doubles/team formats show a COMBINED rating; singles is just
  // "Fargo". Display-only — the underlying teamFargo value is unchanged.
  const fargoLabel = doubles ? "Combined Fargo" : "Fargo";
  const shortPerson = (name?: string | null) => {
    if (!name) return "";
    const key = name.trim();
    const resolved = nameMap.get(key);
    if (resolved) return resolved;
    const parts = key.split(/\s+/).filter(Boolean);
    if (parts.length < 2) return parts[0] ?? "";
    return `${parts[0]} ${parts[parts.length - 1][0]}.`;
  };
  const shortTeam = (e: ChipEntry) => {
    const p1 = shortPerson(e.p1Name);
    const p2 = doubles && e.p2Name ? shortPerson(e.p2Name) : "";
    return p2 ? `${p1} / ${p2}` : p1 || "—";
  };
  const entryById = (eid: string | null | undefined) =>
    chip.entries.find((e) => e.id === eid) ?? null;
  const autoChips = (e: ChipEntry) =>
    chipsForFargo(chip.settings.tiers, teamFargoOf(e, chip.settings.format));
  const chipPreview = (e: ChipEntry) =>
    e.chipOverride != null ? e.chipOverride : autoChips(e);

  // Side pots are defined on the tournament (name + amount), exactly like the
  // single/double-elim flow. A team's entries live on tournament_teams
  // .paid_side_pots (mirrors tournament_players.paid_side_pots). Tapping a chip
  // enters/removes the team.
  // Single source of truth for this tournament's configured side pots (name + numeric
  // amount, robustly coerced) — used by the cards, the Add flow, and Review & Start.
  const tournamentSidePots = parseSidePots(tournament?.side_pots);
  // Toggle a side-pot ENTRY (membership). Both paths persist the membership IMMEDIATELY
  // with a targeted per-row write (teams → tournament_teams via setTeamSidePots; singles →
  // chip_entries via setEntrySidePots), not via the debounced whole-blob save — so a
  // background refetch can't drop it and singles behave the same as teams.
  const toggleSidePot = (e: ChipEntry, name: string) => {
    const cur = e.paidSidePots ?? [];
    const next = cur.includes(name)
      ? cur.filter((n) => n !== name)
      : [...cur, name];
    if (e.teamId != null) vm.setTeamSidePots(e.teamId, next);
    else vm.setEntrySidePots(e.id, next);
  };

  // ── Setup · Players (registration) ───────────────────────────────────────────
  const fargoOf = (n: number | null | undefined) => (n == null ? "" : String(n));
  const setFargo = (entryId: string, key: "p1Fargo" | "p2Fargo", v: string) => {
    const d = v.replace(/\D/g, "");
    vm.updateEntry(entryId, { [key]: d === "" ? null : parseInt(d, 10) } as any);
  };
  // Singles: when the TD commits an inline Fargo edit, promote it to the player's
  // GLOBAL verified rating (profiles/players, server-gated). Retryable, non-blocking:
  // the chip entry already holds the value; a failure only means the global promotion
  // didn't save. Doubles verification runs inside the team RPCs, so skip it here.
  const commitSinglesFargo = (e: ChipEntry) => {
    if (doubles || e.isTeam || readOnly) return;
    // Read fresh state (the value was just typed via onChangeFargo → updateEntry).
    const cur = entryById(e.id) ?? e;
    // Fargo-cap reconciliation on edit:
    if (isOverCap(cur)) {
      // Ready player whose new rating is no longer covered → make them deal with it now.
      if (cur.checkedIn && !overrideCovers(cur)) setCapResolve({ entryId: cur.id });
    } else if (cur.fargoCapOverride) {
      // Back under the cap → the override no longer applies; clear it (keep Ready as-is).
      void clearOverride(cur, false);
    }
    if (!cur.p1PlayerId || cur.p1Fargo == null) return;
    playerRegistrationService.verifyPlayerFargo(id, cur.p1PlayerId, cur.p1Fargo).catch(() => {
      Alert.alert(
        "Fargo not verified",
        "The Fargo verification could not be saved. Retry from the player card.",
      );
    });
  };
  // ── Players page: lifecycle + card renderers ─────────────────────────────────
  const hasPartner = (e: ChipEntry) => chipHasPartner(e);
  // Per-side Fargo verification — kept ONLY for the doubles per-member rows. Fargo
  // verification is not part of the visible lifecycle anymore.
  const sideVerified = (e: ChipEntry, which: 1 | 2): boolean => {
    if (e.isTeam) return which === 1 ? !!e.p1FargoVerified : !!e.p2FargoVerified;
    if (e.fromRegistration) return e.fargoStatus === "verified" || e.regStatus === "approved";
    return e.p1Fargo != null;
  };

  // ── Maximum-Fargo cap (soft gate + override) ─────────────────────────────────
  // The tournament's cap. Doubles compares the TEAM rating (sum), using the same
  // team-rating logic the chip engine uses; singles compares the player's Fargo. A
  // missing rating is NOT over-cap — that's the separate "No Fargo" hard blocker.
  const maxFargo = tournament?.max_fargo ?? null;
  const ratingForCap = (e: ChipEntry): number | null =>
    doubles
      ? e.p1Fargo != null && e.p2Fargo != null
        ? e.p1Fargo + e.p2Fargo
        : null
      : e.p1Fargo ?? null;
  const isOverCap = (e: ChipEntry): boolean => isFargoOverCap(ratingForCap(e), maxFargo);
  const overByOf = (e: ChipEntry): number => fargoOverBy(ratingForCap(e), maxFargo);
  // The override is a SNAPSHOT: it only covers the entry while the rating AND cap it was
  // granted for still match the current values.
  const overrideCovers = (e: ChipEntry): boolean =>
    !!e.fargoCapOverride && e.playerFargoAtOverride === ratingForCap(e) && e.fargoCapAtOverride === maxFargo;
  const hasValidOverride = (e: ChipEntry): boolean => isOverCap(e) && overrideCovers(e);
  // Over cap with no valid override → cannot become (or remain trustworthy as) Ready.
  const overCapBlocking = (e: ChipEntry): boolean => isOverCap(e) && !overrideCovers(e);

  // ── Shared registration lifecycle: Pre-Registered → Registered → Ready ───────
  // Does this tournament require an entry fee?
  const entryFeeRequired = (Number(tournament?.entry_fee) || 0) > 0;
  // Format hard blocker (chip needs a Fargo to assign starting chips) — delegated to the
  // shared chip-lifecycle helper so the Prize Pool counts derive readiness identically.
  const hardBlockerOf = (e: ChipEntry): boolean => chipHardBlocker(e, doubles);
  // Phase-aware derivation (see registration-lifecycle): setup uses the new invariant;
  // live/completed reflect real participation and never reinterpret history.
  const lifecyclePhase: LifecyclePhase = readOnly
    ? "completed"
    : vm.phase === "setup"
      ? "setup"
      : "live";
  // Canonical visible status — ONE source of truth (chipEntryLifecycle), shared with the
  // Prize Pool player/side-pot counts so the roster and the pool can never disagree.
  // (Name kept as entryState so existing call sites stand.)
  const entryState = (e: ChipEntry): EntryState =>
    chipEntryLifecycle(e, { phase: lifecyclePhase, doubles, entryFeeRequired });

  // Whether an entry is ELIGIBLE to be Ready (payment satisfied + no hard blocker + a
  // partner for doubles). Ready still additionally requires an explicit TD decision.
  const eligibleForReady = (e: ChipEntry): boolean =>
    paymentSatisfied(!!e.paid, entryFeeRequired) && !hardBlockerOf(e) && (!doubles || hasPartner(e));

  // PAYMENT control (Entry Fee row). Payment is now SEPARATE from readiness: paying does
  // NOT auto-mark Ready (that's an explicit action); UNpaying clears Ready because Ready
  // requires payment. Side-pot changes use toggleSidePot and never call this.
  const setPaid = async (e: ChipEntry, nextPaid: boolean) => {
    if (readOnly) return;
    const nextCheckedIn = nextPaid ? !!e.checkedIn : false; // pay: unchanged · unpay: clear Ready
    try {
      if (e.teamId != null) {
        await vm.setTeamPaid(e.teamId, nextPaid);
        if (!nextCheckedIn && e.checkedIn) await vm.setTeamCheckedIn(e.teamId, false);
      } else if (e.regId != null && e.fromRegistration) {
        await vm.setRegistrationReady(e.regId, { paid: nextPaid, ready: nextCheckedIn });
      } else {
        vm.updateEntry(e.id, { paid: nextPaid, checkedIn: nextCheckedIn });
      }
    } catch {
      Alert.alert("Update failed", "Couldn't update this player. Please try again.");
    }
  };

  // READINESS control (the ✓ Ready / Mark Ready button) — explicit TD decision, does NOT
  // touch payment. Only sets the engine's checkedIn flag.
  const setExplicitReady = async (e: ChipEntry, ready: boolean) => {
    if (readOnly) return;
    try {
      if (e.teamId != null) {
        if (ready && !e.teamApproved) {
          try { await vm.approveTeam(e.teamId, true); } catch { /* approval is internal */ }
        }
        await vm.setTeamCheckedIn(e.teamId, ready);
      } else if (e.regId != null && e.fromRegistration) {
        await vm.setRegistrationReady(e.regId, { paid: !!e.paid, ready });
      } else {
        vm.updateEntry(e.id, { checkedIn: ready });
      }
    } catch {
      Alert.alert("Update failed", "Couldn't update this player. Please try again.");
    }
  };
  // Mark Ready: payment is still a requirement, but no longer identical to Ready. Explain
  // exactly what's missing rather than silently doing nothing.
  const markReady = (e: ChipEntry) => {
    if (readOnly) return;
    if (!paymentSatisfied(!!e.paid, entryFeeRequired)) {
      Alert.alert("Entry fee required", "Mark the entry fee paid before this player can be Ready.");
      return;
    }
    if (hardBlockerOf(e)) {
      Alert.alert("Fargo required", `Enter a Fargo rating before this ${doubles ? "team" : "player"} can be Ready.`);
      return;
    }
    if (doubles && !hasPartner(e)) return;
    // Over the Fargo cap with no valid override → route through the override flow instead
    // of marking Ready directly.
    if (overCapBlocking(e)) { setCapConfirm({ entryId: e.id }); return; }
    void setExplicitReady(e, true);
  };

  // ── Fargo-cap override flow ───────────────────────────────────────────────────
  // Persist an override snapshot on the right source AND mark the entry Ready, then log
  // an audit event. reason = quick choice; notes = optional free text.
  const applyOverrideAndReady = async (e: ChipEntry, reason: string, notes: string) => {
    const rating = ratingForCap(e);
    const cap = maxFargo;
    const snap = { cap, rating, reason, notes: notes.trim() || null, overriddenBy: profile?.id ?? null };
    try {
      if (e.teamId != null) {
        await vm.setTeamFargoOverride(e.teamId, true, snap);
        if (!e.teamApproved) { try { await vm.approveTeam(e.teamId, true); } catch { /* internal */ } }
        await vm.setTeamCheckedIn(e.teamId, true);
      } else if (e.regId != null && e.fromRegistration) {
        await vm.setRegistrationFargoOverride(e.regId, true, snap);
        await vm.setRegistrationReady(e.regId, { paid: !!e.paid, ready: true });
      } else {
        vm.updateEntry(e.id, {
          fargoCapOverride: true,
          fargoCapAtOverride: cap,
          playerFargoAtOverride: rating,
          fargoCapOverrideReason: reason,
          fargoCapOverrideNotes: notes.trim() || null,
          overriddenBy: profile?.id ?? null,
          overriddenAt: new Date().toISOString(),
          checkedIn: true,
        });
      }
      vm.logEvent(
        "fargo_cap_override",
        `${shortTeam(e)} allowed at Fargo ${rating} (max ${cap}, over by ${overByOf(e)}) — ${reason}`,
        { entryId: e.id, rating, cap, overBy: overByOf(e), reason, notes: notes.trim() || null, overriddenBy: profile?.id ?? null },
      ).catch(() => {});
    } catch {
      Alert.alert("Update failed", "Couldn't save the override. Please try again.");
    }
  };
  // Clear an override snapshot on the right source (used when back under cap, or when the
  // TD chooses "Make Registered"). Optionally also clear Ready.
  const clearOverride = async (e: ChipEntry, alsoUnready: boolean) => {
    const empty = { cap: null, rating: null, reason: null, notes: null, overriddenBy: null };
    try {
      if (e.teamId != null) {
        await vm.setTeamFargoOverride(e.teamId, false, empty);
        if (alsoUnready) await vm.setTeamCheckedIn(e.teamId, false);
      } else if (e.regId != null && e.fromRegistration) {
        await vm.setRegistrationFargoOverride(e.regId, false, empty);
        if (alsoUnready) await vm.setRegistrationReady(e.regId, { paid: !!e.paid, ready: false });
      } else {
        vm.updateEntry(e.id, {
          fargoCapOverride: false,
          fargoCapAtOverride: null,
          playerFargoAtOverride: null,
          fargoCapOverrideReason: null,
          fargoCapOverrideNotes: null,
          overriddenBy: null,
          overriddenAt: null,
          ...(alsoUnready ? { checkedIn: false } : {}),
        });
      }
    } catch {
      Alert.alert("Update failed", "Couldn't update this player. Please try again.");
    }
  };

  // Tapping ✓ Ready makes the player Unready WITHOUT touching payment / pots / Fargo.
  const confirmMakeUnready = (e: ChipEntry) => {
    Alert.alert(
      "Make player unready?",
      "This player will remain registered and their entry fee will stay marked Paid, but they will not be included in the live field until they are marked Ready again.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Make Unready", style: "destructive", onPress: () => void setExplicitReady(e, false) },
      ],
    );
  };

  // Checking Entry Fee is instant; UNCHECKING (Paid → Unpaid) confirms first because it
  // also clears Ready when the player was Ready.
  const confirmTogglePaid = (e: ChipEntry) => {
    if (!e.paid) { void setPaid(e, true); return; } // checking → instant
    const wasReady = entryState(e) === "ready";
    Alert.alert(
      "Mark entry fee unpaid?",
      wasReady
        ? "This player will move from Ready to Registered and will not be included in the live field."
        : "This player's entry fee will be marked unpaid.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Mark Unpaid", style: "destructive", onPress: () => void setPaid(e, false) },
      ],
    );
  };
  const confirmToggleSidePot = (e: ChipEntry, name: string) => {
    const entered = (e.paidSidePots ?? []).includes(name);
    if (!entered) { toggleSidePot(e, name); return; } // entering → instant
    Alert.alert(
      `Remove from ${name}?`,
      `This player will no longer be entered in ${name}.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Remove", style: "destructive", onPress: () => toggleSidePot(e, name) },
      ],
    );
  };
  // Player-level remove (the red X in a card's edit mode) — always confirms first, and
  // only ever removes THAT player/member (never the whole team). Format-aware wording:
  // Singles → "from this tournament"; Doubles member → "from this team".
  const removePlayerWithConfirm = (
    e: ChipEntry,
    which: 1 | 2,
    memberId: number | null | undefined,
    name: string,
  ) => {
    Alert.alert(
      "Remove Player?",
      `Remove ${name || "this player"} from this ${doubles ? "team" : "tournament"}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove Player",
          style: "destructive",
          onPress: () => {
            if (memberId != null) vm.removeTeamMember(memberId);
            else if (which === 2)
              vm.updateEntry(e.id, { p2Name: null, p2Fargo: null, p2ProfileId: null, p2PlayerId: null });
            else vm.removeEntry(e.id);
          },
        },
      ],
    );
  };

  // Entry-level removal, source-aware: teams remove the captain (cascades to the team),
  // self-reg cancels the registration (stops re-projecting), TD-added singles delete the
  // chip_entries row. ONE function so the card Actions menu and the over-cap modal can't
  // behave differently.
  const removeEntryNow = (e: ChipEntry) => {
    if (e.isTeam && e.teamId != null) {
      if (e.p1MemberId != null) void vm.removeTeamMember(e.p1MemberId);
      else vm.removeEntry(e.id);
    } else if (e.fromRegistration && e.regId != null) {
      void vm.cancelRegistration(e.regId);
    } else {
      vm.removeEntry(e.id);
    }
  };
  // Shared "Remove Player" confirmation (used by the Actions menu AND the over-cap modal).
  const confirmRemovePlayer = (e: ChipEntry) => {
    Alert.alert(
      `Remove ${e.isTeam ? "Team" : "Player"}?`,
      `Remove ${shortTeam(e)} from this tournament?\n\nTheir tournament entry, Ready status, and current chip assignment will be removed.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: `Remove ${e.isTeam ? "Team" : "Player"}`, style: "destructive", onPress: () => removeEntryNow(e) },
      ],
    );
  };

  // ── Tables setup handlers (rename dialog + bulk-add sheet) ────────────────────
  const openRename = (t: ChipTable) => {
    setRenameVal(t.label);
    setRenameTbl({ id: t.id, label: t.label });
  };
  // Meaningful table status (list + detail).
  const tableStatusInfo = (t: ChipTable) => {
    if (t.inactive) return { dot: "⚪", label: "Inactive", color: COLORS.textMuted };
    if (t.matchId && chip.matches.some((m) => m.id === t.matchId && m.status === "in_progress"))
      return { dot: "🔴", label: "Live Match", color: COLORS.error };
    if (t.locked) return { dot: "🔒", label: "Locked", color: COLORS.textSecondary };
    if (t.pendingChallengerId && t.holderId) return { dot: "🔵", label: "Waiting to Start", color: COLORS.primary };
    if (t.holderId) return { dot: "🟢", label: "Waiting for Opponent", color: COLORS.success };
    if (chip.reshufflePending) return { dot: "🟡", label: "Pending Reshuffle", color: COLORS.warning };
    return { dot: "⚪", label: "Empty", color: COLORS.textMuted };
  };
  // Open the manual chip-override modal for an entry. A manual change to a live player's
  // chips is a director override (affects standings/elimination/results), so it always
  // goes through the reason modal — never a direct silent +/- . Blocks the immediate
  // playing→0 case up front with a clear message (the engine also refuses it).
  const openChipAdjust = (entry: ChipEntry, initialDelta: number) => {
    const inLiveMatch = chip.matches.some(
      (m) => m.status === "in_progress" && (m.aId === entry.id || m.bId === entry.id),
    );
    const playing = entry.status === "playing" || inLiveMatch;
    if (playing && entry.chips + initialDelta <= 0) {
      Alert.alert(
        "Player In Match",
        "This player is currently in an active match. Their chips can't be manually reduced to 0 while playing — elimination should happen through the match-result flow.",
      );
      return;
    }
    const floor = playing ? 1 : 0;
    setChipAdjust({ entryId: entry.id, name: teamName(entry), current: entry.chips, playing });
    setChipAdjustNew(Math.max(floor, entry.chips + initialDelta));
    setChipAdjustReason(null);
    setChipAdjustNotes("");
  };
  const commitChipAdjust = () => {
    if (!chipAdjust || !chipAdjustReason) return;
    const netDelta = chipAdjustNew - chipAdjust.current;
    if (netDelta !== 0) {
      vm.adjustChips(chipAdjust.entryId, netDelta, {
        reason: chipAdjustReason,
        notes: chipAdjustNotes.trim() || null,
        actorId,
        actorName,
      });
    }
    setChipAdjust(null);
  };

  // Open the forfeit decision modal for an entry. Resolves the entry's live match (if any)
  // so the modal can offer Forfeit Match; a forfeit with no active match context is
  // Forfeit Tournament only.
  const openForfeit = (entryId: string) => {
    const e = entryById(entryId);
    if (!e || e.status === "eliminated") return;
    const m = chip.matches.find(
      (mm) => mm.status === "in_progress" && (mm.aId === entryId || mm.bId === entryId),
    );
    const oppId = m ? (m.aId === entryId ? m.bId : m.aId) : null;
    const opp = oppId ? entryById(oppId) : null;
    setForfeit({ entryId, name: teamName(e), matchId: m?.id ?? null, oppName: opp ? teamName(opp) : null });
    setForfeitReason(null);
    setForfeitNotes("");
  };
  const commitForfeit = (mode: "match" | "tournament") => {
    if (!forfeit || !forfeitReason) return;
    const meta = { reason: forfeitReason, notes: forfeitNotes.trim() || null, actorId, actorName };
    if (mode === "match") vm.forfeitMatch(forfeit.entryId, meta);
    else vm.forfeitEntry(forfeit.entryId, meta);
    setForfeit(null);
  };

  // Lock/Unlock a table (pure availability — never seats). Locking a table that has a
  // live match uses a controlled "Lock After Match" confirm (the match finishes, then no
  // new match is assigned there). Locking an idle table and unlocking are immediate.
  const toggleTableLock = (t: ChipTable) => {
    if (t.locked) {
      vm.setTableLocked(t.id, false);
      return;
    }
    const m = chip.matches.find((mm) => mm.id === t.matchId && mm.status === "in_progress");
    if (m) {
      Alert.alert(
        "Lock After Match?",
        `${t.label} has a match in progress. It finishes normally, then the table is locked and won't be assigned new matches.`,
        [
          { text: "Cancel", style: "cancel" },
          { text: "Lock After Match", onPress: () => vm.setTableLocked(t.id, true) },
        ],
      );
      return;
    }
    vm.setTableLocked(t.id, true);
  };

  // "Remove Table" (the single, always-red menu action). Opens a state-aware modal:
  //   pending removal (closing) → offer to Keep the table (cancel the scheduled removal);
  //   live match → Remove After Match (finishes normally, then removed);
  //   holder / pending challenger, no match → guard (finish/move first);
  //   truly empty → Remove now. None of these seat the queue or start a match.
  const confirmRemoveTableSmart = (t: ChipTable) => {
    if (t.closing) {
      Alert.alert(
        "Removal Scheduled",
        `${t.label} will be removed after its current match finishes.`,
        [
          { text: "OK", style: "cancel" },
          { text: "Keep Table", onPress: () => vm.reactivateTable(t.id) },
        ],
      );
      return;
    }
    const m = chip.matches.find((mm) => mm.id === t.matchId && mm.status === "in_progress");
    if (m) {
      // Live match: the controlled action is Remove-After-Match (never interrupts play).
      const a = entryById(m.aId);
      const b = entryById(m.bId);
      Alert.alert(
        "Remove Table",
        `Remove ${t.label} after ${a ? teamName(a) : "?"} vs ${b ? teamName(b) : "?"} is finished?`,
        [
          { text: "Cancel", style: "cancel" },
          { text: "Remove After Match", onPress: () => vm.closeTables([t.id]) },
        ],
      );
      return;
    }
    // Occupied without a live match (a waiting winner / an announced matchup): don't
    // silently remove it and shuffle players around — guard and tell the TD to resolve
    // the table first (finish/move via the table's own controls).
    if (t.holderId || t.pendingChallengerId) {
      Alert.alert(
        "Table In Use",
        `${t.label} still has a player assigned. Finish or move their game before removing the table.`,
        [{ text: "OK" }],
      );
      return;
    }
    // Truly empty: safe to remove. Removal is table-management only — it never seats the
    // queue or starts a match (engine no longer auto-seats after close).
    Alert.alert(`Remove ${t.label}?`, `${t.label} will be removed from the tournament.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: () => vm.closeTables([t.id]) },
    ]);
  };
  const confirmForfeitTeam = (t: ChipTable) => {
    const m = chip.matches.find((mm) => mm.id === t.matchId && mm.status === "in_progress");
    if (m) {
      // Live match: pick which side is forfeiting, then open the reason-gated decision
      // modal (Forfeit Match vs Forfeit Tournament) for that entry.
      const a = entryById(m.aId);
      const b = entryById(m.bId);
      Alert.alert("Forfeit Team", "Which team is forfeiting?", [
        { text: "Cancel", style: "cancel" },
        { text: a ? teamName(a) : "Team A", onPress: () => openForfeit(m.aId) },
        { text: b ? teamName(b) : "Team B", onPress: () => openForfeit(m.bId) },
      ]);
    } else if (t.holderId) {
      openForfeit(t.holderId);
    }
  };
  const confirmClearTable = (t: ChipTable) => {
    Alert.alert(
      `Clear ${t.label}`,
      "Where should the players from this table be placed?",
      [
        { text: "Next in Queue", onPress: () => vm.clearTable(t.id, "next") },
        { text: "End of Queue", onPress: () => vm.clearTable(t.id, "end") },
        { text: "Cancel", style: "cancel" },
      ],
    );
  };
  // Acknowledge a pending assignment so its popup doesn't reopen, then close it.
  const ackPending = (t: ChipTable) => {
    if (t.pendingChallengerId) ackedPendingRef.current.add(`${t.id}:${t.pendingChallengerId}`);
  };
  const dismissAssignPopup = () => {
    const t = chip.tables.find((x) => x.id === assignPopupTableId);
    if (t) ackPending(t);
    setAssignPopupTableId(null);
  };
  const confirmRemoveFromQueue = (e: ChipEntry) => {
    // Queued entry has no live match → the modal offers Forfeit Tournament only.
    openForfeit(e.id);
  };
  const saveRename = () => {
    if (!renameTbl) return;
    const v = renameVal.trim();
    // Blank keeps the current name (unchanged behavior). Otherwise the name must be
    // unique within the tournament — compared trimmed + case-insensitively, ignoring
    // this table itself so re-saving its own name is allowed.
    if (v) {
      const clash = chip.tables.some(
        (t) => t.id !== renameTbl.id && t.label.trim().toLowerCase() === v.toLowerCase(),
      );
      if (clash) {
        Alert.alert("Name in use", "That table name is already in use.");
        return;
      }
    }
    vm.updateTable(renameTbl.id, { label: v || renameTbl.label });
    setRenameTbl(null);
  };
  const openStreamLink = (t: ChipTable) => {
    setStreamLinkVal(t.streamUrl ?? "");
    setStreamLinkId(t.id);
  };
  const saveStreamLink = () => {
    if (!streamLinkId) return;
    const url = streamLinkVal.trim();
    vm.updateTable(streamLinkId, { isStream: !!url, streamUrl: url || null });
    setStreamLinkId(null);
  };
  const clearStreamLink = () => {
    if (!streamLinkId) return;
    vm.updateTable(streamLinkId, { isStream: false, streamUrl: null });
    setStreamLinkId(null);
  };
  const openAddTables = () => {
    setAddTblCount(1);
    setAddTblLabel("");
    setAddTblOpen(true);
  };
  const confirmAddTables = () => {
    // Blank/whitespace label → default "Table"; otherwise the trimmed custom label.
    // Numbers continue from the next available so we never duplicate an existing name.
    const base = addTblLabel.trim() || "Table";
    const start = nextTableNumber(chip.tables, base);
    const names = Array.from(
      { length: addTblCount },
      (_, i) => `${base} ${start + i}`,
    );
    vm.addTables(addTblCount, names);
    setAddTblOpen(false);
  };

  // End / reopen the event (both confirmed — they change the lifecycle).
  const confirmEndTournament = () => {
    Alert.alert(
      "Finish Tournament",
      "Mark this tournament completed and move to Results? Live editing stops.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Finish", style: "destructive", onPress: doFinishTournament },
      ],
    );
  };
  const confirmReopen = () => {
    Alert.alert(
      "Reopen Tournament",
      "Move this tournament back to Live so you can keep playing? Any recorded champion is cleared — reshuffle to re-seat tables if it had finished.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Reopen", onPress: () => vm.reopen() },
      ],
    );
  };

  // ── Table-count management (keep a queue as the field shrinks) ────────────────
  const tableStatus = (
    t: (typeof chip.tables)[number],
  ): "inactive" | "closing" | "playing" | "available" => {
    if (t.inactive) return "inactive";
    if (t.closing) return "closing";
    if (t.matchId && chip.matches.some((m) => m.id === t.matchId && m.status === "in_progress"))
      return "playing";
    return "available";
  };
  const openReduce = () => {
    setReduceSel([]);
    setReduceOpen(true);
  };
  const toggleReduceSel = (id: string) =>
    setReduceSel((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  const confirmReduce = () => {
    if (reduceSel.length === 0) return;
    const labels = reduceSel
      .map((id) => chip.tables.find((t) => t.id === id)?.label)
      .filter(Boolean)
      .join(" and ");
    const anyPlaying = reduceSel.some((id) => tableStatus(chip.tables.find((t) => t.id === id)!) === "playing");
    Alert.alert(
      reduceSel.length === 1 ? `Remove ${labels}?` : `Remove ${labels}?`,
      `${reduceSel.length === 1 ? "This table" : "These tables"} will no longer receive new matches.` +
        (anyPlaying ? "\n\nAny table with a match in progress will close after that match finishes." : ""),
      [
        { text: "Cancel", style: "cancel" },
        {
          text: reduceSel.length === 1 ? "Remove Table" : "Confirm Removal",
          style: "destructive",
          onPress: () => {
            vm.closeTables(reduceSel);
            setReduceOpen(false);
            setReduceSel([]);
          },
        },
      ],
    );
  };
  // Placeholder for Actions that aren't fully built yet.
  const soon = (title: string, msg: string) => {
    setActionsOpen(false);
    Alert.alert(title, msg);
  };
  // Quick shortcut: revert the last N logged actions (no reason required). Used by
  // the Tournament Actions menu for common recent mistakes.
  const doUndoLast = (n: number) => {
    if (!vm.canUndo) {
      Alert.alert("Nothing to Undo", "There are no recent actions to undo.");
      return;
    }
    const avail = Math.min(n, vm.undoCount);
    const rps = vm.restorePoints;
    const lastLabel = rps[rps.length - 1]?.label;
    const detail = n === 1 && lastLabel ? `\n\nThis will undo: “${lastLabel}”.` : "";
    Alert.alert(
      n === 1 ? "Undo Last Action" : `Undo Last ${n} Actions`,
      `This reverts the last ${avail} action${avail === 1 ? "" : "s"}. History is kept in the Audit Log.${detail}`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Undo",
          style: "destructive",
          onPress: () => {
            vm.undoLast(n, { reason: n === 1 ? "Quick undo (last action)" : `Quick undo (last ${avail} actions)`, actorId, actorName });
            setActionsOpen(false);
          },
        },
      ],
    );
  };
  // Open the Restore confirmation for a target event id.
  const openRestore = (targetId: string) => {
    setRestoreReason(null);
    setRestoreReasonOpen(false);
    setRestoreNotes("");
    setRestoreTargetId(targetId);
  };
  const closeRestore = () => {
    Keyboard.dismiss(); // never leave the keyboard trapped open
    setRestoreTargetId(null);
    setRestoreReason(null);
    setRestoreReasonOpen(false);
    setRestoreNotes("");
  };
  // Reverted-action count + the point-in-time we'd return to.
  const restoreMeta = restoreTargetId ? vm.restoreInfo(restoreTargetId) : null;
  // "Other" requires notes; a preset reason enables Restore on its own.
  const restoreNotesMissing = restoreReason === "Other" && restoreNotes.trim().length === 0;
  const restoreReady = !!restoreReason && !restoreNotesMissing;
  // Commit the restore once the reason (and any required notes) is in.
  const confirmRestore = () => {
    Keyboard.dismiss(); // dismiss first so nothing is trapped behind the keyboard
    if (!restoreTargetId || !restoreReady) return;
    const reason = restoreNotes.trim() ? `${restoreReason} — ${restoreNotes.trim()}` : restoreReason;
    vm.restoreToEvent(restoreTargetId, { reason, actorId, actorName });
    closeRestore();
  };
  // Rewrite full player names inside an audit line to the short display form
  // ("Brandee Ogunjobi" → "Brandee O.") so team names never wrap awkwardly.
  const shortenAudit = (text: string): string => {
    let out = text;
    const pairs = Array.from(nameMap.entries())
      .filter(([full, short]) => full !== short)
      .sort((a, b) => b[0].length - a[0].length);
    for (const [full, short] of pairs) out = out.split(full).join(short);
    return out;
  };
  // Structured match data for a match_result row (winner/loser/table/duration).
  const auditMatchInfo = (ev: ChipEvent) => {
    const mid = ev.payload?.matchId as string | undefined;
    const m = mid ? chip.matches.find((x) => x.id === mid) : null;
    if (!m) return null;
    const table = chip.tables.find((t) => t.id === m.tableId);
    const dur =
      m.endedAt && m.startedAt
        ? new Date(m.endedAt).getTime() - new Date(m.startedAt).getTime()
        : null;
    return {
      winner: entryById(m.winnerId),
      loser: entryById(m.loserId),
      tableLabel: table?.label ?? null,
      dur: dur && dur > 0 ? dur : null,
    };
  };
  // The events shown for the current filter + search (events are newest-first).
  const auditFilteredRaw = chip.events.filter((ev) => {
    if (auditFilter !== "All" && auditMeta(ev).category !== auditFilter) return false;
    const q = auditSearch.trim().toLowerCase();
    if (q && !(shortenAudit(ev.text).toLowerCase().includes(q) || auditMeta(ev).title.toLowerCase().includes(q))) return false;
    return true;
  });
  // Apply the sort. "type" groups by category (preserving newest-first inside).
  const CAT_ORDER: AuditCategory[] = ["Matches", "Chips", "Players", "Tables", "Shuffle", "Undo", "Admin"];
  const auditFiltered =
    auditSort === "oldest"
      ? [...auditFilteredRaw].reverse()
      : auditSort === "type"
        ? [...auditFilteredRaw].sort(
            (a, b) => CAT_ORDER.indexOf(auditMeta(a).category) - CAT_ORDER.indexOf(auditMeta(b).category),
          )
        : auditFilteredRaw;
  // Group the timeline. (1) TRANSACTIONS: consecutive events sharing a txId are one
  // action (a completed match logs match_result + chip_loss + elimination) — shown
  // as the parent row with the rest folded into "resulting changes". (2) MERGE:
  // consecutive identical low-value system events (e.g. two timer resets) collapse
  // into one row with a count so the log doesn't flood.
  interface AuditGroup { rep: ChipEvent; children: ChipEvent[]; repAt: string; count: number; targetId: string; targetAt: string; }
  const MERGEABLE = ["manual", "table_added", "table_removed", "move", "shuffle"];
  const auditGroups: AuditGroup[] = [];
  let gi = 0;
  while (gi < auditFiltered.length) {
    const ev = auditFiltered[gi];
    // (1) Transaction run.
    if (ev.txId) {
      const members: ChipEvent[] = [];
      let j = gi;
      while (j < auditFiltered.length && auditFiltered[j].txId === ev.txId) { members.push(auditFiltered[j]); j++; }
      if (members.length > 1) {
        // Parent = the CAUSE = first-pushed event = the one appearing latest in the
        // stored (newest-first) log (highest index = oldest of the transaction).
        const parent = members.reduce((best, m) => (chip.events.indexOf(m) > chip.events.indexOf(best) ? m : best), members[0]);
        auditGroups.push({
          rep: parent,
          children: members.filter((m) => m !== parent),
          repAt: parent.at,
          count: 1,
          targetId: parent.id,
          targetAt: parent.at,
        });
        gi = j;
        continue;
      }
    }
    // (2) Mergeable dedup, else a plain single event.
    const prev = auditGroups[auditGroups.length - 1];
    const same =
      prev &&
      prev.children.length === 0 &&
      MERGEABLE.includes(ev.type) &&
      !ev.txId &&
      !!prev.rep.superseded === !!ev.superseded &&
      auditMeta(prev.rep).title === auditMeta(ev).title &&
      shortenAudit(prev.rep.text) === shortenAudit(ev.text);
    if (same && prev) {
      prev.count += 1;
      if (ev.at > prev.repAt) { prev.rep = ev; prev.repAt = ev.at; }
      if (ev.at < prev.targetAt) { prev.targetId = ev.id; prev.targetAt = ev.at; }
    } else {
      auditGroups.push({ rep: ev, children: [], repAt: ev.at, count: 1, targetId: ev.id, targetAt: ev.at });
    }
    gi += 1;
  }
  // Structured detail lines for the events that carry payload data — so the body
  // reads as clean lines ("Craig" / "+1 chip • 3 chips total") not one long string.
  const auditDetailLines = (ev: ChipEvent): { team: string | null; lines: string[] } | null => {
    const p = ev.payload ?? {};
    const entry = typeof p.entryId === "string" ? entryById(p.entryId) : null;
    if ((ev.type === "chip_adjust" || ev.type === "chip_loss") && typeof p.resulting === "number") {
      const delta = typeof p.delta === "number" ? p.delta : ev.type === "chip_loss" ? -1 : 1;
      const resulting = p.resulting as number;
      const sign = delta >= 0 ? `+${delta}` : `${delta}`;
      const line = `${sign} chip${Math.abs(delta) === 1 ? "" : "s"} • ${resulting} chip${resulting === 1 ? "" : "s"} total`;
      return { team: entry ? shortTeam(entry) : null, lines: [line] };
    }
    if (ev.type === "elimination") {
      const by = typeof p.byId === "string" ? entryById(p.byId) : null;
      return { team: entry ? shortTeam(entry) : null, lines: [by ? `Eliminated by ${shortTeam(by)}` : "Eliminated"] };
    }
    if (ev.type === "forfeit") {
      const opp = typeof p.oppId === "string" ? entryById(p.oppId) : null;
      return { team: entry ? shortTeam(entry) : null, lines: [opp ? `Forfeited vs ${shortTeam(opp)}` : "Forfeited the tournament"] };
    }
    return null;
  };
  // A short muted phrase for a transaction's child event ("resulting change").
  const childPhrase = (ev: ChipEvent): string => {
    const p = ev.payload ?? {};
    const entry = typeof p.entryId === "string" ? entryById(p.entryId) : null;
    const who = entry ? shortTeam(entry) : null;
    if (ev.type === "chip_loss" || (ev.type === "chip_adjust" && typeof p.delta === "number")) {
      const delta = typeof p.delta === "number" ? p.delta : -1;
      const amt = Math.abs(delta);
      const resulting = typeof p.resulting === "number" ? p.resulting : null;
      const verb = delta < 0 ? "lost" : "gained";
      return `${who ? who + " " : ""}${verb} ${amt} chip${amt === 1 ? "" : "s"}${resulting != null ? ` • ${resulting} remaining` : ""}`;
    }
    if (ev.type === "elimination") return `${who ?? "Team"} eliminated`;
    if (ev.type === "forfeit") return `${who ?? "Team"} forfeited`;
    return stripAuditPrefix(shortenAudit(ev.text));
  };
  // Concise detail for system rows: drop the verb the title already conveys.
  const auditSystemDetail = (ev: ChipEvent): string => {
    let s = shortenAudit(ev.text);
    s = s.replace(/\s+(match timer reset|waiting timer reset|match started|cleared.*|locked|unlocked)$/i, "");
    s = s.replace(/^(Added|Removed)\s+/i, "");
    return s.trim() || shortenAudit(ev.text);
  };
  // Small stamp: "2 mins ago" for recent, clock time otherwise.
  const auditStamp = (iso: string) => fmtRelative(iso, now) ?? fmtEventTime(iso);
  // Full "July 24, 2026 • 1:42 PM" stamp for restore-target timestamps.
  const fmtRestoreStamp = (iso: string): string => {
    const dt = new Date(iso);
    if (isNaN(dt.getTime())) return "an earlier point";
    const date = dt.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
    return `${date} • ${fmtEventTime(iso)}`;
  };
  // "Today • 2:01 PM" / "Yesterday • …" / "Jul 22 • …" for the restore dialog.
  const fmtRestoreWhen = (iso: string): string => {
    const dt = new Date(iso);
    if (isNaN(dt.getTime())) return "an earlier point";
    const today = new Date(now);
    const yest = new Date(now);
    yest.setDate(today.getDate() - 1);
    const day =
      dt.toDateString() === today.toDateString()
        ? "Today"
        : dt.toDateString() === yest.toDateString()
          ? "Yesterday"
          : dt.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    return `${day} • ${fmtEventTime(iso)}`;
  };
  // Copy one line (native → share sheet; web → clipboard).
  const copyAudit = async (ev: ChipEvent) => {
    const line = `${fmtEventTime(ev.at)} — ${auditMeta(ev).title}: ${shortenAudit(ev.text)}`;
    try {
      if (isWeb && typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(line);
        Alert.alert("Copied", "The audit line was copied to the clipboard.");
      } else {
        await Share.share({ message: line });
      }
    } catch {
      /* user cancelled share */
    }
  };
  // Structured fields for the View Details modal — everything known about an event.
  const buildDetailFields = (ev: ChipEvent): { label: string; value: string }[] => {
    const p = ev.payload ?? {};
    const fields: { label: string; value: string }[] = [];
    fields.push({ label: "Time", value: fmtRestoreStamp(ev.at) });
    fields.push({ label: "Performed By", value: typeof p.actorName === "string" && p.actorName ? p.actorName : "Tournament Director" });
    if (ev.type === "match_result") {
      const info = auditMatchInfo(ev);
      if (info?.winner) fields.push({ label: "Winner", value: shortTeam(info.winner) });
      if (info?.loser) fields.push({ label: "Loser", value: shortTeam(info.loser) });
      if (info?.tableLabel) fields.push({ label: "Related Match", value: info.tableLabel });
      if (info?.dur) fields.push({ label: "Duration", value: fmtDur(info.dur) });
    } else if (ev.type === "chip_adjust" || ev.type === "chip_loss") {
      const entry = typeof p.entryId === "string" ? entryById(p.entryId) : null;
      if (entry) fields.push({ label: "Affected Team", value: shortTeam(entry) });
      if (typeof p.resulting === "number" && typeof p.delta === "number") {
        fields.push({ label: "Previous Chips", value: String((p.resulting as number) - (p.delta as number)) });
        fields.push({ label: "New Chips", value: String(p.resulting) });
      }
    } else if (ev.type === "elimination") {
      const entry = typeof p.entryId === "string" ? entryById(p.entryId) : null;
      const by = typeof p.byId === "string" ? entryById(p.byId) : null;
      if (entry) fields.push({ label: "Affected Team", value: shortTeam(entry) });
      if (by) fields.push({ label: "Eliminated By", value: shortTeam(by) });
    } else if (ev.type === "forfeit") {
      const entry = typeof p.entryId === "string" ? entryById(p.entryId) : null;
      const opp = typeof p.oppId === "string" ? entryById(p.oppId) : null;
      if (entry) fields.push({ label: "Affected Team", value: shortTeam(entry) });
      if (opp) fields.push({ label: "Opponent", value: shortTeam(opp) });
    } else if (ev.type === "restore") {
      if (typeof p.restoredTo === "string") fields.push({ label: "Restored To", value: fmtRestoreStamp(p.restoredTo) });
      if (typeof p.revertedCount === "number") fields.push({ label: "Actions Reverted", value: String(p.revertedCount) });
    } else {
      fields.push({ label: "Details", value: stripAuditPrefix(shortenAudit(ev.text)) });
    }
    if (typeof p.reason === "string" && p.reason) fields.push({ label: "Reason", value: String(p.reason) });
    return fields;
  };
  // Export the whole log as CSV (native → share sheet; web → file download).
  const exportAudit = async () => {
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const header = "Time,Type,Action";
    const rows = chip.events.map((ev) =>
      [esc(new Date(ev.at).toLocaleString()), esc(auditMeta(ev).title), esc(shortenAudit(ev.text))].join(","),
    );
    const csv = [header, ...rows].join("\n");
    try {
      if (isWeb && typeof document !== "undefined") {
        const blob = new Blob([csv], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `audit-log-${id}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        await Share.share({ message: csv, title: `Audit Log — ${tournament?.name ?? "Tournament"}` });
      }
    } catch {
      /* user cancelled */
    }
  };
  const fmtEventTime = (iso: string): string => {
    const dt = new Date(iso);
    if (isNaN(dt.getTime())) return "";
    const h = dt.getHours();
    const m = dt.getMinutes();
    const hr = ((h + 11) % 12) + 1;
    return `${hr}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
  };

  // Full tournament profile for one team/player, derived from the chip state.
  const buildTeamProfile = (e: ChipEntry) => {
    const finished = chip.matches
      .filter((m) => m.status !== "in_progress" && m.endedAt && (m.aId === e.id || m.bId === e.id))
      .sort((a, b) => new Date(b.endedAt as string).getTime() - new Date(a.endedAt as string).getTime());
    const history = finished.map((m) => {
      const oppId = m.aId === e.id ? m.bId : m.aId;
      const opp = chip.entries.find((x) => x.id === oppId);
      const dur = m.endedAt ? new Date(m.endedAt).getTime() - new Date(m.startedAt).getTime() : null;
      return {
        id: m.id,
        opp: opp ? teamName(opp) : "—",
        won: m.winnerId === e.id,
        table: chip.tables.find((t) => t.id === m.tableId)?.label ?? null,
        dur: dur && dur > 0 ? dur : null,
      };
    });
    const opponents = [...new Set(history.map((h) => h.opp))];
    const qi = chip.queue.indexOf(e.id);
    const status: "waiting" | "next" | "playing" | "eliminated" =
      e.status === "eliminated" ? "eliminated"
        : e.status === "playing" || e.tableId ? "playing"
          : qi === 0 ? "next" : "waiting";
    const table = e.tableId ? chip.tables.find((t) => t.id === e.tableId)?.label ?? null : null;
    const matchesPlayed = e.wins + e.losses;
    const winPct = matchesPlayed ? e.wins / matchesPlayed : 0;
    // Performance Rating (expected-vs-actual, Fargo-anchored) via the shared helper
    // (utils/performance.ts). Chip has no rack scores → one finished match = one game.
    const pGamesRows: PerfGame[] = finished.map((m) => {
      const oppId = m.aId === e.id ? m.bId : m.aId;
      const opp = chip.entries.find((x) => x.id === oppId);
      const won = m.winnerId === e.id;
      return {
        opponentFargo: opp?.teamFargo ?? null,
        gamesWon: won ? 1 : 0,
        gamesLost: won ? 0 : 1,
      };
    });
    const pPerf = computePerformance(pGamesRows, e.teamFargo ?? null);
    const avgOpp = pPerf.avgOpponentFargo;
    const performanceRating = pPerf.rating;
    const performanceDelta = pPerf.delta;
    // Timeline: chip events that name this team.
    const nm = teamName(e);
    const timeline = chip.events.filter((ev) => ev.text.includes(nm)).slice(0, 40);
    return { e, history, opponents, qi, status, table, matchesPlayed, winPct, performanceRating, performanceDelta, avgOpp, timeline };
  };

  // Commit the Fargo prompt shown after picking a player → create a real member.
  const submitAddFargo = async () => {
    if (!addFargo) return;
    const d = addFargoVal.replace(/\D/g, "");
    const fargo = d === "" ? null : parseInt(d, 10);
    try {
      if (addFargo.mode === "new") {
        if (doubles) await vm.tdCreateTeam(addFargo.player.id_auto, fargo);
        else vm.addEntry({ p1Name: profileName(addFargo.player), p1ProfileId: addFargo.player.id_auto, p1Fargo: fargo });
      } else {
        const entry = entryById(addFargo.entryId);
        if (entry?.teamId != null) await vm.addTeamMember(entry.teamId, addFargo.player.id_auto, fargo);
        else vm.updateEntry(addFargo.entryId, { p2Name: profileName(addFargo.player), p2ProfileId: addFargo.player.id_auto, p2Fargo: fargo });
      }
      setAddFargo(null);
      setAddFargoVal("");
    } catch (err: any) {
      Alert.alert("Error", err?.message ?? "Couldn't add the player.");
    }
  };

  // TD "Invite Partner": share this team's EXISTING invite link so Player 2 can
  // join it (join_team_by_token fills the open slot on this same team — never a
  // second team, never replacing Player 1). Token is read lazily (the roster RPC
  // omits it). Offers Text / Share / Copy via a native action sheet.
  const openInvite = async (e: ChipEntry) => {
    if (e.teamId == null || !vm.tournament) return;
    let token: string | null = null;
    try {
      token = await vm.getInviteToken(e.teamId as number);
    } catch {
      /* fall through to the unavailable alert */
    }
    if (!token) {
      Alert.alert("Invite unavailable", "Couldn't load the team invite link. Please try again.");
      return;
    }
    const link = teamInviteLink(vm.tournament.id, token);
    const msg = teamInviteMessage(e.p1Name, vm.tournament.name, link);
    Alert.alert("Invite Partner", "Send Player 2 the invite link to join this team.", [
      {
        text: "Text Invite",
        onPress: () => {
          const sep = Platform.OS === "ios" ? "&" : "?";
          Linking.openURL(`sms:${sep}body=${encodeURIComponent(msg)}`).catch(() => {});
        },
      },
      { text: "Share Invite", onPress: () => { Share.share({ message: msg }).catch(() => {}); } },
      {
        text: "Copy Link",
        onPress: () => {
          if (Platform.OS === "web" && typeof navigator !== "undefined" && (navigator as any).clipboard) {
            (navigator as any).clipboard.writeText(link).catch(() => {});
          } else {
            Share.share({ message: link }).catch(() => {});
          }
        },
      },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  // One player's row: name (wraps to 2 lines) + Player ID · Fargo, with a SMALL
  // secondary Verify control (the only large button on the card is the workflow one).
  const renderPlayerRow = (e: ChipEntry, which: 1 | 2) => {
    const editing = editEntryId === e.id;
    const name = which === 1 ? e.p1Name : e.p2Name ?? "";
    const pid = which === 1 ? e.p1ProfileId : e.p2ProfileId;
    const fargo = which === 1 ? e.p1Fargo : e.p2Fargo;
    const verified = sideVerified(e, which);
    const memberId = which === 1 ? e.p1MemberId : e.p2MemberId;
    const canVerify = (e.isTeam && memberId != null) || (!e.isTeam && e.regId != null);
    const onVerify = () => {
      if (e.isTeam && memberId != null) openConfirmMember(memberId, name || "Player", fargo ?? null);
      else if (!e.isTeam && e.regId != null) openApprove(e.regId, name || "Player", fargo ?? null);
    };
    const onRemovePlayer = () => removePlayerWithConfirm(e, which, memberId, name);
    return (
      <View style={styles.prow}>
        <View style={styles.pavatar}><Text style={styles.pavatarText}>{(name || "?").charAt(0).toUpperCase()}</Text></View>
        <View style={{ flex: 1 }}>
          {editing ? (
            <View style={styles.peditRow}>
              <TextInput allowFontScaling={false} style={[styles.peditName, { flex: 1 }]} value={name} onChangeText={(v) => vm.updateEntry(e.id, which === 1 ? { p1Name: v } : { p2Name: v })} placeholder={`Player ${which}`} placeholderTextColor={COLORS.textMuted} />
              <View style={styles.peditFargoWrap}>
                <Text style={styles.phash}>#</Text>
                <TextInput allowFontScaling={false} style={styles.peditFargo} value={fargoOf(fargo)} onChangeText={(v) => setFargo(e.id, which === 1 ? "p1Fargo" : "p2Fargo", v)} onEndEditing={() => commitSinglesFargo(e)} keyboardType="number-pad" placeholder="Fargo" placeholderTextColor={COLORS.textMuted} maxLength={4} />
              </View>
              <TouchableOpacity style={styles.premoveBtn} onPress={onRemovePlayer} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={styles.premoveText}>✕</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <Text style={styles.pname}>{name || "Player"}</Text>
              <Text style={styles.pmeta}>{pid != null ? `Player ID #${pid} · ` : ""}Fargo {fargo ?? "—"}</Text>
            </>
          )}
        </View>
        {!editing && (
          <View style={styles.pverifyCol}>
            {verified ? (
              <Text style={styles.pverified}>✓ Verified</Text>
            ) : canVerify && !setupLocked ? (
              <TouchableOpacity style={styles.pverifyBtn} onPress={onVerify} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={styles.pverifyText}>Verify</Text>
              </TouchableOpacity>
            ) : fargo == null ? (
              <Text style={styles.pneeds}>No Fargo</Text>
            ) : null}
          </View>
        )}
      </View>
    );
  };

  // The footer workflow button. Ready is an explicit toggle: ✓ Ready (green outline) taps
  // to Make Unready; otherwise Mark Ready (which explains any blocker on tap). Payment is
  // handled separately by the Entry Fee row.
  const renderPrimary = (e: ChipEntry, st: EntryState) => {
    // Live / completed: reflect participation only — no setup workflow action.
    if (readOnly || vm.phase !== "setup") {
      const inField = st === "ready" || e.checkedIn;
      return (
        <View style={[styles.tprimary, styles.tprimaryDone]}>
          <Text style={styles.tprimaryDoneText}>{inField ? "✓ In Field" : LIFECYCLE_META[st].label}</Text>
        </View>
      );
    }
    if (st === "waiting")
      return <View style={[styles.tprimary, styles.tprimaryDim]}><Text style={styles.tprimaryDimText}>Waiting for Partner</Text></View>;
    if (st === "ready") {
      // Ready but the rating/cap moved past the override coverage → amber "⚠ Over Cap"
      // that opens the resolve prompt (Make Registered / Allow Override) instead of the
      // normal unready confirm. Otherwise green outlined ✓ Ready (tap → make Unready).
      if (overCapBlocking(e)) {
        return (
          <TouchableOpacity style={[styles.tprimary, styles.tprimaryDim]} onPress={() => setCapResolve({ entryId: e.id })}>
            <Text style={styles.tprimaryDimText}>⚠ Over Cap</Text>
          </TouchableOpacity>
        );
      }
      return (
        <TouchableOpacity style={[styles.tprimary, styles.tprimaryReady]} onPress={() => confirmMakeUnready(e)}>
          <Text style={styles.tprimaryReadyText}>✓ Ready</Text>
        </TouchableOpacity>
      );
    }
    // Registered / Pre-Registered: Mark Ready. Dimmed when not eligible; markReady()
    // explains what's missing (entry fee / Fargo) rather than silently failing.
    const eligible = eligibleForReady(e);
    return (
      <TouchableOpacity style={[styles.tprimary, !eligible && styles.tprimaryOff]} onPress={() => markReady(e)}>
        <Text style={styles.tprimaryText}>Mark Ready</Text>
      </TouchableOpacity>
    );
  };

  // Attention order for "Default" sort: Ready first, then Registered, then Pre-Reg, etc.
  const rank = (st: EntryState) => LIFECYCLE_RANK[st];
  const rosterFiltered = chip.entries
    .filter((e) => {
      const st = entryState(e);
      // Exact-status filters. "prereg" also surfaces Waiting-for-Partner teams (both
      // need TD attention before they can advance).
      if (rosterFilter === "prereg" && !(st === "prereg" || st === "waiting")) return false;
      if (rosterFilter === "registered" && st !== "registered") return false;
      if (rosterFilter === "ready" && st !== "ready") return false;
      if (rosterFilter === "no_show" && st !== "no_show") return false;
      const q = rosterQuery.trim().toLowerCase();
      if (q) {
        const hay = `${e.p1Name} ${e.p2Name ?? ""} ${e.p1ProfileId ?? ""} ${e.p2ProfileId ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    })
    .sort((a, b) => {
      // Default = REGISTRATION ORDER (createdAt asc): a STABLE order that never shifts as
      // the TD edits payment / side pots / Fargo / Ready, so a card can't jump away
      // mid-interaction. Status sorting is opt-in only (rosterSort === "status").
      const fargoOf = (e: ChipEntry) => e.teamFargo ?? e.p1Fargo ?? 0;
      const registrationOrder = () =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      switch (rosterSort) {
        case "name":
          return (a.p1Name || "").localeCompare(b.p1Name || "");
        case "fargoDesc":
          return fargoOf(b) - fargoOf(a);
        case "fargoAsc":
          return fargoOf(a) - fargoOf(b);
        case "chipsDesc":
          return chipPreview(b) - chipPreview(a);
        case "recent":
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        case "status":
          return rank(entryState(a)) - rank(entryState(b)) || registrationOrder();
        default:
          return registrationOrder();
      }
    });
  const STATUS_LABELS: Record<typeof rosterFilter, string> = {
    all: "All",
    prereg: "Pre-Registered",
    registered: "Registered",
    ready: "Ready",
    no_show: "No Show",
  };
  const SORT_LABELS: Record<typeof rosterSort, string> = {
    default: "Registration Order",
    name: "Name A–Z",
    fargoDesc: "Fargo High–Low",
    fargoAsc: "Fargo Low–High",
    chipsDesc: "Chips High–Low",
    recent: "Recently Added",
    status: "Status",
  };
  // Lifecycle counters across the whole roster (Waiting-for-Partner folds into Pre-Reg
  // since both still need TD attention before they can advance).
  const statusCounts = chip.entries.reduce(
    (acc, e) => {
      const st = entryState(e);
      if (st === "prereg" || st === "waiting") acc.prereg += 1;
      else if (st === "registered") acc.registered += 1;
      else if (st === "ready") acc.ready += 1;
      else if (st === "no_show") acc.no_show += 1;
      return acc;
    },
    { prereg: 0, registered: 0, ready: 0, no_show: 0 },
  );
  const readyCount = statusCounts.ready;
  // Tappable counter chip: taps set the matching status filter (Pre-Reg toggles).
  const STATUS_COUNTERS: { key: typeof rosterFilter; label: string; n: number }[] = [
    { key: "prereg", label: "Pre-Reg", n: statusCounts.prereg },
    { key: "registered", label: "Registered", n: statusCounts.registered },
    { key: "ready", label: "Ready", n: statusCounts.ready },
    { key: "no_show", label: "No Show", n: statusCounts.no_show },
  ];

  // Expanded detail body for the desktop players table — reuses the existing
  // player rows (verify / Fargo / IDs), chip-override edit, side pots, and the
  // approve control. No new logic; just the collapsible detail region.
  const renderTeamExpanded = (e: ChipEntry, st: EntryState, editing: boolean) => (
    <View style={styles.ptExpand}>
      {renderPlayerRow(e, 1)}
      {doubles &&
        (hasPartner(e) ? (
          renderPlayerRow(e, 2)
        ) : setupLocked ? null : (
          <View style={styles.partnerActionsRow}>
            <TouchableOpacity style={styles.partnerBtn} onPress={() => (e.teamId != null ? setUnifiedOpen({ resumeTeam: { teamId: e.teamId, captainName: e.p1Name ?? null } }) : setPicker({ mode: "partner", entryId: e.id }))}>
              <Text style={styles.partnerBtnText}>Add Player 2</Text>
            </TouchableOpacity>
            {e.teamId != null && (
              <TouchableOpacity style={styles.invitePartnerBtn} onPress={() => openInvite(e)}>
                <Text style={styles.invitePartnerBtnText}>Invite Partner</Text>
              </TouchableOpacity>
            )}
          </View>
        ))}
      {editing && !setupLocked && e.teamId != null && (
        <View style={styles.editChipRow}>
          <Text style={styles.editChipLabel}>Chip count (blank = auto)</Text>
          <TextInput
            allowFontScaling={false}
            style={styles.editChipInput}
            defaultValue={e.chipOverride != null ? String(e.chipOverride) : ""}
            onEndEditing={(ev) => {
              const d = ev.nativeEvent.text.replace(/\D/g, "");
              vm.setTeamChips(e.teamId as number, d === "" ? null : parseInt(d, 10));
            }}
            keyboardType="number-pad"
            placeholder={`Auto (${autoChips(e)})`}
            placeholderTextColor={COLORS.textMuted}
            maxLength={3}
          />
        </View>
      )}
      {tournamentSidePots.length > 0 && e.teamId != null && (
        <View style={styles.tpotsBlock}>
          <Text style={styles.tpotsHead}>Side Pots</Text>
          {tournamentSidePots.map((p) => {
            const name = p.name.trim();
            const inPot = (e.paidSidePots ?? []).includes(name);
            const amt = Number(p.amount) ? ` ($${Number(p.amount)})` : "";
            return (
              <TouchableOpacity key={name} disabled={setupLocked} style={styles.potRow} onPress={() => confirmToggleSidePot(e, name)} activeOpacity={0.7}>
                <View style={[styles.potCheckbox, inPot && styles.potCheckboxOn]}>{inPot && <Text style={styles.potCheckMark}>✓</Text>}</View>
                <Text style={[styles.potLabel, inPot && styles.potLabelOn]}>{name}{amt}{inPot ? " · Entered" : ""}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}
      {/* Mark Ready (setup only). The Ready gate = entry fee satisfied + no hard blocker;
          the row's Status column also offers this — kept here for the expanded view. */}
      {lifecyclePhase === "setup" && !readOnly && st !== "ready" && st !== "waiting" && (
        hardBlockerOf(e) ? (
          <Text style={styles.tprimaryHint}>Enter a Fargo rating before this {doubles ? "team" : "player"} can be Ready.</Text>
        ) : (
          <TouchableOpacity style={styles.ptApprove} onPress={() => markReady(e)}>
            <Text style={styles.ptApproveText}>Mark Ready</Text>
          </TouchableOpacity>
        )
      )}
    </View>
  );

  // Desktop = compact expandable table; mobile/narrow = the original stacked cards.
  const renderPlayersSetupDesktop = () => {
    const showPay = winW >= 1000;
    return (
      <View>
        <View style={styles.ptHeadingRow}>
          <Text style={styles.ptTitle}>Players</Text>
          <Text style={styles.ptCount}>· {chip.entries.length} {doubles ? "teams" : "players"}</Text>
        </View>
        {readOnly ? (
          <Text style={styles.readOnlyNote}>Tournament completed — player registration is locked.</Text>
        ) : vm.isLive ? (
          <Text style={styles.readOnlyNote}>Tournament is live — the roster is locked to protect the live queue and standings.</Text>
        ) : null}
        <View style={styles.ptToolbar}>
          <View style={styles.ptSearch}>
            <Ionicons name="search" size={16} color={COLORS.textMuted} />
            <TextInput allowFontScaling={false} style={styles.ptSearchInput} value={rosterQuery} onChangeText={setRosterQuery} placeholder="Search by player or team name…" placeholderTextColor={COLORS.textMuted} autoCapitalize="none" autoCorrect={false} />
            {rosterQuery.length > 0 && (
              <TouchableOpacity onPress={() => setRosterQuery("")} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close-circle" size={16} color={COLORS.textMuted} />
              </TouchableOpacity>
            )}
          </View>
          <TouchableOpacity style={styles.ptFilterBtn} onPress={() => setStatusMenuOpen(true)}>
            <Text style={styles.ptFilterText} numberOfLines={1}>{STATUS_LABELS[rosterFilter]}</Text>
            <Ionicons name="chevron-down" size={15} color={COLORS.textSecondary} />
          </TouchableOpacity>
          {!setupLocked && (
            <TouchableOpacity style={styles.ptAddBtn} onPress={() => setUnifiedOpen({ resumeTeam: null })} activeOpacity={0.85}>
              <Ionicons name="add" size={18} color="#FFFFFF" />
              <Text style={styles.ptAddText}>Add {doubles ? "Team" : "Player"}</Text>
            </TouchableOpacity>
          )}
        </View>

        {rosterFiltered.length === 0 ? (
          <Text style={styles.hint}>
            {chip.entries.length === 0
              ? `No ${doubles ? "teams" : "players"} yet. Tap “+ Add ${doubles ? "Team" : "Player"}”.`
              : "No matches for this filter."}
          </Text>
        ) : (
          <View style={styles.ptTable}>
            <View style={[styles.ptRow, styles.ptHeadRow]}>
              <Text style={[styles.ptHcell, styles.ptcNum]}>#</Text>
              <Text style={[styles.ptHcell, styles.ptcTeam]}>Team / Players</Text>
              <Text style={[styles.ptHcell, styles.ptcFargo]}>Fargo</Text>
              <Text style={[styles.ptHcell, styles.ptcChips]}>Chips</Text>
              {showPay && <Text style={[styles.ptHcell, styles.ptcPay]}>Payment</Text>}
              <Text style={[styles.ptHcell, styles.ptcStatus]}>Status</Text>
              <Text style={[styles.ptHcell, styles.ptcActions]}>Actions</Text>
            </View>
            {rosterFiltered.map((e, i) => {
              const st = entryState(e);
              const meta = LIFECYCLE_META[st];
              const editing = editEntryId === e.id;
              const expanded = expandedEntryId === e.id;
              const combined = doubles ? (e.p1Fargo ?? 0) + (e.p2Fargo ?? 0) : e.p1Fargo;
              return (
                <View key={e.id} style={i > 0 && styles.ptRowDiv}>
                  <Pressable
                    onPress={() => setExpandedEntryId(expanded ? null : e.id)}
                    style={(s: any) => [styles.ptRow, s.hovered && styles.ptRowHover]}
                  >
                    <Text allowFontScaling={false} style={[styles.ptNum, styles.ptcNum]}>{i + 1}</Text>
                    <View style={styles.ptcTeam}>
                      <Text allowFontScaling={false} style={styles.ptName} numberOfLines={1}>{teamName(e)}</Text>
                      {e.teamName ? <Text allowFontScaling={false} style={styles.ptNameSub} numberOfLines={1}>{e.teamName}</Text> : null}
                    </View>
                    <Text allowFontScaling={false} style={[styles.ptCell, styles.ptcFargo]}>{combined != null ? combined : "—"}</Text>
                    <Text allowFontScaling={false} style={[styles.ptChips, styles.ptcChips]}>{chipPreview(e)}</Text>
                    {showPay && (
                      <View style={styles.ptcPay}>
                        <TouchableOpacity disabled={setupLocked} onPress={() => confirmTogglePaid(e)} style={[styles.ptBadge, e.paid ? styles.ptBadgeGood : styles.ptBadgeMuted]} activeOpacity={0.7}>
                          <Text allowFontScaling={false} style={[styles.ptBadgeText, e.paid ? styles.ptBadgeTextGood : styles.ptBadgeTextMuted]}>{e.paid ? "Paid" : "Unpaid"}</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                    <View style={styles.ptcStatus}>
                      {readOnly || lifecyclePhase !== "setup" ? (
                        <View style={[styles.ptBadge, st === "ready" ? styles.ptBadgeGood : { borderColor: meta.color + "88", backgroundColor: meta.color + "22" }]}>
                          <Text allowFontScaling={false} style={[styles.ptBadgeText, st === "ready" ? styles.ptBadgeTextGood : { color: meta.color }]}>{st === "ready" ? "In Field" : meta.label}</Text>
                        </View>
                      ) : st === "ready" ? (
                        <TouchableOpacity onPress={() => confirmMakeUnready(e)} style={[styles.ptBadge, styles.ptBadgeGood]} activeOpacity={0.7}>
                          <Text allowFontScaling={false} style={[styles.ptBadgeText, styles.ptBadgeTextGood]}>✓ Ready</Text>
                        </TouchableOpacity>
                      ) : st === "waiting" ? (
                        <View style={[styles.ptBadge, { borderColor: meta.color + "88", backgroundColor: meta.color + "22" }]}>
                          <Text allowFontScaling={false} style={[styles.ptBadgeText, { color: meta.color }]}>{meta.label}</Text>
                        </View>
                      ) : hardBlockerOf(e) ? (
                        <View style={[styles.ptBadge, { borderColor: meta.color + "88", backgroundColor: meta.color + "22" }]}>
                          <Text allowFontScaling={false} style={[styles.ptBadgeText, { color: meta.color }]}>{meta.label} · Needs Fargo</Text>
                        </View>
                      ) : (
                        <TouchableOpacity onPress={() => markReady(e)} style={styles.ptCheckBtn} activeOpacity={0.85}>
                          <Text allowFontScaling={false} style={styles.ptCheckBtnText}>Mark Ready</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                    <View style={styles.ptcActions}>
                      {!setupLocked && (
                        <TouchableOpacity onPress={() => setMenuEntryId(e.id)} style={styles.ptDots} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                          <Ionicons name="ellipsis-horizontal" size={webMs(18)} color={COLORS.textSecondary} />
                        </TouchableOpacity>
                      )}
                      <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={webMs(16)} color={COLORS.textMuted} />
                    </View>
                  </Pressable>
                  {expanded && renderTeamExpanded(e, st, editing)}
                </View>
              );
            })}
          </View>
        )}
      </View>
    );
  };

  // Map a roster entry -> shared TeamCard props (display mode). Reuses the exact
  // same helpers/handlers the old mobile card used, so behavior is preserved; the
  // desktop table still uses renderPlayerRow/renderTeamExpanded (untouched).
  const teamCardPlayerVM = (e: ChipEntry, which: 1 | 2): TeamCardPlayerVM => {
    const editing = editEntryId === e.id;
    const name = which === 1 ? e.p1Name : e.p2Name ?? "";
    const pid = which === 1 ? e.p1ProfileId : e.p2ProfileId;
    const fg = which === 1 ? e.p1Fargo : e.p2Fargo;
    const verified = sideVerified(e, which);
    const memberId = which === 1 ? e.p1MemberId : e.p2MemberId;
    const canVerify = ((e.isTeam && memberId != null) || (!e.isTeam && e.regId != null)) && !setupLocked;
    // A PENDING member has a stable players.id but no id_auto — offer Edit (attached).
    const playerUuid = which === 1 ? e.p1PlayerId : e.p2PlayerId;
    const isPending = playerUuid != null && pid == null;
    return {
      name,
      idLabel: pid != null ? `Player ID #${pid}` : null,
      fargo: fg ?? null,
      verified,
      canVerify,
      onVerify: () => {
        if (e.isTeam && memberId != null) openConfirmMember(memberId, name || "Player", fg ?? null);
        else if (!e.isTeam && e.regId != null) openApprove(e.regId, name || "Player", fg ?? null);
      },
      editingRow: editing,
      onChangeName: (v) => vm.updateEntry(e.id, which === 1 ? { p1Name: v } : { p2Name: v }),
      onChangeFargo: (v) => setFargo(e.id, which === 1 ? "p1Fargo" : "p2Fargo", v),
      onCommitFargo: () => commitSinglesFargo(e),
      onRemove: () => removePlayerWithConfirm(e, which, memberId, name),
      onEdit: isPending && !setupLocked ? () => setEditPlayerId(playerUuid!) : undefined,
      // Account axis (tertiary): a PENDING player has a players.id but no linked
      // profile (id_auto). Active accounts get no badge.
      pendingAccount: isPending,
    };
  };

  const toTeamCardProps = (e: ChipEntry, i: number): TeamCardProps => {
    const st = entryState(e);
    const meta = LIFECYCLE_META[st];
    const editing = editEntryId === e.id;
    const partner = doubles && hasPartner(e);
    // Show the Ready blocker only in setup, only when the fee is satisfied but a hard
    // blocker (missing Fargo) still stands between the entry and Ready.
    const blockedButPaid =
      lifecyclePhase === "setup" &&
      st !== "ready" &&
      st !== "waiting" &&
      paymentSatisfied(!!e.paid, entryFeeRequired) &&
      hardBlockerOf(e);
    return {
      mode: "display",
      doubles,
      label: `${doubles ? "Team" : "Player"} #${i + 1}`,
      statusLabel: meta.label,
      statusColor: meta.color,
      // Subtle whole-card outline encodes status at a glance so we don't need green
      // everywhere: green = Ready, amber = needs attention, red = No Show, gray = other.
      cardBorderColor:
        st === "ready"
          ? COLORS.success
          : st === "no_show"
            ? COLORS.error
            : st === "prereg" || st === "waiting"
              ? COLORS.warning
              : undefined,
      chipsPillText: `${chipPreview(e)} Chips`,
      teamName: e.teamName,
      player1: teamCardPlayerVM(e, 1),
      player2: partner ? teamCardPlayerVM(e, 2) : null,
      showAddPartner: doubles && !hasPartner(e) && !setupLocked,
      onAddPlayer2: () => (e.teamId != null ? setUnifiedOpen({ resumeTeam: { teamId: e.teamId, captainName: e.p1Name ?? null } }) : setPicker({ mode: "partner", entryId: e.id })),
      onInvitePartner: e.teamId != null ? () => openInvite(e) : undefined,
      showTeamFargo: !!partner,
      teamFargo: (e.p1Fargo ?? 0) + (e.p2Fargo ?? 0),
      assignedChipsText: `${chipPreview(e)}${e.chipOverride != null ? " · manual" : ""}`,
      paid: !!e.paid,
      // Entry Fee row is the payment control; it reconciles Ready internally. Unchecking
      // (Ready → Registered) confirms first; checking is instant.
      onTogglePaid: setupLocked ? undefined : () => confirmTogglePaid(e),
      // Shared Tournament Entry section: entry fee (Paid/Unpaid ← chip_entries.paid) +
      // every defined side pot (Entered/Not Entered ← paid_side_pots). Removing a pot
      // confirms; entering is instant. Side pots never affect Ready.
      entryFee: Number(tournament?.entry_fee) || 0,
      sidePots: tournamentSidePots,
      enteredPots: e.paidSidePots ?? [],
      onToggleSidePot: setupLocked ? undefined : (name: string) => confirmToggleSidePot(e, name),
      showChipOverride: editing && !setupLocked && e.teamId != null,
      chipOverrideDefault: e.chipOverride != null ? String(e.chipOverride) : "",
      chipAutoPlaceholder: `Auto (${autoChips(e)})`,
      onChipOverrideEnd: (v) => {
        const d = v.replace(/\D/g, "");
        if (e.teamId != null) vm.setTeamChips(e.teamId, d === "" ? null : parseInt(d, 10));
      },
      readOnly: setupLocked,
      actionsLabel: editing ? "Done" : "Actions",
      onActions: (anchor: ActionsAnchor) => {
        if (setupLocked) return; // roster locked while live/finished — no mutations menu
        // In edit mode the Actions button reads "Done" → exit edit + Fargo-input, dismiss
        // the keyboard, and release the card-focused scroll behavior.
        if (editing) { Keyboard.dismiss(); setEditEntryId(null); return; }
        openActionsMenu(e.id, anchor);
      },
      primary: renderPrimary(e, st),
      // Full-width note under the footer. Fargo-cap messages take priority: a valid
      // override shows the override indicator; over-cap-without-override shows the amber
      // warning (worded for a stale-Ready entry vs a Registered one). Otherwise the
      // paid-but-no-Fargo blocker.
      warning: (() => {
        if (lifecyclePhase === "setup" && hasValidOverride(e)) {
          const reason = e.fargoCapOverrideReason ? ` • ${e.fargoCapOverrideReason}` : "";
          return `⚠ Fargo Cap Override — ${overByOf(e)} over maximum${reason}`;
        }
        if (lifecyclePhase === "setup" && overCapBlocking(e)) {
          const over = overByOf(e);
          const pts = over === 1 ? "point" : "points";
          return st === "ready"
            ? `⚠ Now over the Fargo cap — ${over} ${pts} over ${maxFargo}. Approve override or make Registered.`
            : `⚠ ${over} ${pts} over the tournament maximum of ${maxFargo}.`;
        }
        return blockedButPaid
          ? "Entry fee is marked paid, but a Fargo rating is required before this player can be Ready."
          : undefined;
      })(),
    };
  };

  const renderPlayersSetup = () => {
    if (isWeb && winW >= 760) return renderPlayersSetupDesktop();
    return (
    <View>
      {readOnly ? (
        <Text style={styles.readOnlyNote}>Tournament completed — player registration is locked.</Text>
      ) : vm.isLive ? (
        <Text style={styles.readOnlyNote}>Tournament is live — the roster is locked to protect the live queue and standings.</Text>
      ) : null}
      <View style={styles.searchRow}>
        <TextInput allowFontScaling={false} style={styles.searchInput} value={rosterQuery} onChangeText={setRosterQuery} placeholder="Search by player or team name…" placeholderTextColor={COLORS.textMuted} autoCapitalize="none" autoCorrect={false} />
        {!setupLocked && (
          <TouchableOpacity style={styles.addBtn} onPress={() => setUnifiedOpen({ resumeTeam: null })}>
            <Text style={styles.addBtnText}>+ Add {doubles ? "Team" : "Player"}</Text>
          </TouchableOpacity>
        )}
      </View>
      {/* Lifecycle counters — tap a chip to filter to that status (tap again = All). */}
      <View style={styles.counterRow}>
        {STATUS_COUNTERS.map((c) => {
          const active = rosterFilter === c.key;
          return (
            <TouchableOpacity
              key={c.key}
              style={[styles.counterChip, active && styles.counterChipActive]}
              onPress={() => setRosterFilter(active ? "all" : c.key)}
              activeOpacity={0.7}
            >
              <Text allowFontScaling={false} style={[styles.counterNum, active && styles.counterNumActive]}>{c.n}</Text>
              <Text allowFontScaling={false} style={[styles.counterLabel, active && styles.counterLabelActive]} numberOfLines={1}>{c.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <View style={styles.rosterFilterRow}>
        <TouchableOpacity style={styles.rosterFilterCol} onPress={() => setStatusMenuOpen(true)}>
          <Text style={styles.statusDropText} numberOfLines={1}>Status: <Text style={styles.statusDropVal}>{STATUS_LABELS[rosterFilter]}</Text>  ▾</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.rosterFilterCol} onPress={() => setSortMenuOpen(true)}>
          <Text style={styles.statusDropText} numberOfLines={1}>Sort: <Text style={styles.statusDropVal}>{SORT_LABELS[rosterSort]}</Text>  ▾</Text>
        </TouchableOpacity>
      </View>

      {rosterFiltered.length === 0 && (
        <Text style={styles.hint}>
          {chip.entries.length === 0
            ? `No ${doubles ? "teams" : "players"} yet. Tap “+ Add ${doubles ? "Team" : "Player"}”.`
            : "No matches for this filter."}
        </Text>
      )}

      {/* Phase 5: mobile roster now renders the SHARED TeamCard (display mode) — the
          same component the Add Team modal uses in draft mode, so they can't drift.
          Business logic stays here and is passed via toTeamCardProps(). */}
      {rosterFiltered.map((e, i) => (
        // onLayout captures the card's offset + height in roster content coords (the
        // single scroll target for card-focused edit mode). When this card is awaiting
        // its first edit-mode snap, fire it here — onLayout guarantees the edit layout
        // is measured.
        <View
          key={e.id}
          onLayout={(ev) => {
            cardTops.current[e.id] = ev.nativeEvent.layout.y;
            cardHeights.current[e.id] = ev.nativeEvent.layout.height;
            if (pendingSnapRef.current === e.id) {
              pendingSnapRef.current = null;
              positionEditingCard(e.id, "edit");
            }
          }}
        >
          <TeamCard {...toTeamCardProps(e, i)} />
        </View>
      ))}
    </View>
    );
  };

  // Pinned "Review & Start →" CTA for the NON-embedded Players setup page — rendered below
  // the screen's own ScrollView so it floats above the roster. In embedded mode the host
  // (manage-tournament) owns scroll + nav and renders its own pinned footer.
  const showReviewCta =
    !embedded && !setupLocked && selectedPhase === "setup" && page === "Players";
  const reviewCta = (
    <View style={styles.reviewCtaBar}>
      <TouchableOpacity style={styles.reviewCta} onPress={() => setPage("Review")} activeOpacity={0.85}>
        <Text allowFontScaling={false} style={styles.reviewCtaText}>
          Review &amp; Start{readyCount > 0 ? `  (${readyCount} Ready)` : ""}  →
        </Text>
      </TouchableOpacity>
    </View>
  );

  // ── Setup · Tables (incl. stream marking) ────────────────────────────────────
  const renderTablesSetup = () => {
    // Format-aware recommendation (single source of truth: chip.engine). Counts only
    // playable entries — singles = players, doubles = COMPLETE teams — and targets
    // ~half the field active with the rest queued (winner-stays): floor(entries / 4).
    const entrantWord = doubles ? "teams" : "players";
    const entrantWordSingular = doubles ? "team" : "player";
    const entrantCount = playableEntryCount(chip);
    const recommendedTables = recommendedSetupTables(entrantCount);
    // Singular-aware display label (visual only — counts are unchanged).
    const entrantLabel = entrantCount === 1 ? entrantWordSingular : entrantWord;

    const openStream = (t: ChipTable) => {
      setStreamVal(t.streamUrl ?? "");
      setStreamEditId(t.id);
    };
    const saveStream = (t: ChipTable) => {
      const url = streamVal.trim();
      vm.updateTable(t.id, { isStream: !!url, streamUrl: url || null });
      setStreamEditId(null);
    };
    const useRecommended = () => {
      const cur = chip.tables.length;
      if (cur < recommendedTables) vm.addTables(recommendedTables - cur);
      else if (cur > recommendedTables)
        chip.tables.slice(recommendedTables).forEach((t) => vm.removeTable(t.id));
    };

    return (
    <Section title={`Tables (${chip.tables.length})`} action={<HeaderBtn label="+ Add Table" onPress={openAddTables} />}>
      {entrantCount > 0 && chip.tables.length < recommendedTables && (
        <View style={styles.recBox}>
          <Text allowFontScaling={false} style={styles.recTitle}>Recommended setup</Text>
          <Text allowFontScaling={false} style={styles.recLine}>
            {entrantCount} {entrantLabel}
            {"  •  "}
            <Text style={styles.recNum}>{recommendedTables} table{recommendedTables === 1 ? "" : "s"}</Text>
          </Text>
          <Text allowFontScaling={false} style={styles.recSub}>Balanced starting setup</Text>
          {chip.tables.length !== recommendedTables && (
            <TouchableOpacity style={styles.recBtn} onPress={useRecommended} activeOpacity={0.85}>
              <Text allowFontScaling={false} style={styles.recBtnText}>Use {recommendedTables} Table{recommendedTables === 1 ? "" : "s"}</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
      {chip.tables.map((t) => (
        <View key={t.id} style={styles.tableSetupRow}>
          <View style={styles.tableSetupTop}>
            <TouchableOpacity style={styles.tblNameBtn} onPress={() => openRename(t)}>
              <Text style={styles.tableLabel} numberOfLines={1}>{t.label}</Text>
              <Text style={styles.tblEditIcon}>✎</Text>
            </TouchableOpacity>
            <View style={styles.flexSpacer} />
            {t.isStream ? (
              <View style={styles.streamLinkedWrap}>
                <Text style={styles.streamLinkedText}>🔴 Stream Linked</Text>
                <TouchableOpacity onPress={() => openStream(t)}>
                  <Text style={styles.streamEditLink}>Edit</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity style={styles.addStreamPill} onPress={() => openStream(t)}>
                <Text style={styles.addStreamText}>+ Add Stream</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={() => vm.removeTable(t.id)}><Text style={styles.delX}>✕</Text></TouchableOpacity>
          </View>
          {streamEditId === t.id && (
            <View style={styles.streamEditor}>
              <TextInput
                allowFontScaling={false}
                style={styles.input}
                value={streamVal}
                onChangeText={setStreamVal}
                placeholder="Stream URL (e.g. twitch.tv/yourchannel)"
                placeholderTextColor={COLORS.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
                autoFocus
              />
              <View style={styles.streamEditorBtns}>
                <TouchableOpacity style={styles.streamCancel} onPress={() => setStreamEditId(null)}>
                  <Text style={styles.streamCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.streamSave} onPress={() => saveStream(t)}>
                  <Text style={styles.streamSaveText}>Save</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      ))}
      {chip.tables.length === 0 && <Text allowFontScaling={false} style={styles.recHelper}>Add at least one table to continue.</Text>}
    </Section>
    );
  };

  // ── Setup · Review & Start ───────────────────────────────────────────────────
  const renderReview = () => {
    const started = vm.phase !== "setup";
    const unit = doubles ? "teams" : "players";
    const nameOf = (e: ChipEntry) => teamName(e) || (doubles ? "Team" : "Player");
    // Categorize the roster so the TD sees exactly who is in the field and who is not.
    // The high-value case is PAID BUT NOT READY — money collected, about to be excluded.
    const paidNotReady = chip.entries.filter((e) => entryState(e) === "registered" && !!e.paid);
    const unpaid = chip.entries.filter((e) => entryState(e) === "registered" && !e.paid);
    const prereg = chip.entries.filter((e) => entryState(e) === "prereg" || entryState(e) === "waiting");
    // Ready entries that are over the Fargo cap without a valid override — a stale/
    // inconsistent Ready state. Do NOT silently exclude these; BLOCK Start until resolved.
    const overCapReady = chip.entries.filter((e) => entryState(e) === "ready" && overCapBlocking(e));
    // Payout-allocation gate: every enabled bucket (entry + each side pot) must allocate
    // its whole pool ($0 remaining) — reviewPrize.balanced from the authoritative
    // payoutAllocations. When reviewPrize isn't provided (non-embedded), don't gate.
    const payoutsAllocated = !reviewPrize || (reviewPrize.complete && reviewPrize.balanced);
    const canStart =
      readyCount >= 2 && chip.tables.length >= 1 && chip.settings.tiers.length >= 1 && overCapReady.length === 0 && payoutsAllocated;

    // Start: if any paid players aren't Ready, force an explicit Proceed Anyway so the TD
    // can't accidentally exclude someone they already collected money from.
    // Navigate to the Live dashboard — ONLY called after a confirmed successful start.
    // Embedded: the host owns phase/tab nav (same path as the "Go to Live" button);
    // standalone: flip our own local phase to Live and land on the Tables dashboard.
    const goLiveAfterStart = () => {
      if (embedded) onGoLive?.();
      else { setSelectedPhase("live"); setPage("Tables"); }
    };
    const runStart = async () => {
      const okStarted = await vm.start();
      if (okStarted) {
        // Tell the host the tournament is now live so its cached tournament / header
        // badge flips to Running immediately (this VM persisted the start, not the
        // host's mutation). Only on a CONFIRMED start.
        onStarted?.();
        goLiveAfterStart();
      } // else stay on Review & Start (error shown)
    };
    const doStart = () => {
      // Stale-schedule gate (shared helper — same rule as every start path): block a
      // not-yet-started tournament whose saved date/time is in the past and tell the
      // TD to fix Date/Start Time on Setup. vm.start() also refuses defensively.
      const staleErr = scheduleStaleError(vm.tournament);
      if (staleErr) {
        Alert.alert("Update the schedule", staleErr);
        return;
      }
      // Over-cap Ready entries hard-block Start (canStart already false); guard anyway.
      if (overCapReady.length > 0) return;
      if (paidNotReady.length > 0) {
        const names = paidNotReady.slice(0, 8).map(nameOf).join("\n");
        const more = paidNotReady.length > 8 ? `\n…and ${paidNotReady.length - 8} more` : "";
        Alert.alert(
          "Some paid players are not Ready",
          `${paidNotReady.length} ${paidNotReady.length === 1 ? `${doubles ? "team has" : "player has"}` : `${unit} have`} paid but ${paidNotReady.length === 1 ? "is" : "are"} not marked Ready. They will NOT be included in the live field if you continue.\n\n${names}${more}`,
          [
            { text: "Go Back", style: "cancel" },
            { text: "Proceed Anyway", style: "destructive", onPress: () => void runStart() },
          ],
        );
        return;
      }
      void runStart();
    };

    // Quick-action nav to a setup page (host owns tab nav in embedded mode).
    const goSetup = (tab: "settings" | "players" | "tables" | "prizepool") => {
      if (onOpenSetupPage) { onOpenSetupPage(tab); return; }
      if (tab === "settings") onOpenSettings?.();
      else if (tab === "players") setPage("Players");
      else if (tab === "tables") setPage("Tables");
    };
    const setSec = (k: string, val: boolean) =>
      setReviewOpen((o) => ({ ...o, [k]: val }));
    const money = (n: number): string => `$${Math.round(n).toLocaleString()}`;

    const registered = chip.entries.length;
    const tablesCount = chip.tables.length;
    const tierCount = chip.settings.tiers.length;
    const chipFmt = doubles ? "Scotch Doubles" : "Singles";
    const gameType = tournament?.game_type || "—";
    const fargoLine = tournament?.open_tournament
      ? "Open — no Fargo cap"
      : maxFargo
        ? `Up to ${maxFargo}`
        : "No cap set";
    const entryFee = Number(tournament?.entry_fee) || 0;
    const addedMoney = Number(tournament?.added_money) || 0;

    // Most urgent Players issue drives the header badge (and auto-expands the section).
    const playersBadge =
      overCapReady.length > 0
        ? { kind: "error" as const, text: `${overCapReady.length} over cap` }
        : paidNotReady.length > 0
          ? { kind: "warn" as const, text: `${paidNotReady.length} paid · not Ready` }
          : null;
    const playersExpanded = reviewOpen.players ?? !!playersBadge;

    // Section shell: concise collapsed header (title · summary · badge · quick action)
    // with an expandable body for detail — keeps the default view compact.
    const sec = (
      key: string,
      title: string,
      summary: string,
      expanded: boolean,
      action: { label: string; onPress: () => void },
      badge: { kind: "warn" | "error"; text: string } | null,
      body: React.ReactNode,
    ) => (
      <View key={key} style={styles.revSec}>
        <View style={styles.revSecHead}>
          <TouchableOpacity style={styles.revSecMain} activeOpacity={0.7} onPress={() => setSec(key, !expanded)}>
            <View style={styles.revSecTitleRow}>
              <Text allowFontScaling={false} style={styles.revCaret}>{expanded ? "▾" : "▸"}</Text>
              <Text allowFontScaling={false} style={styles.revSecTitle}>{title}</Text>
              {badge && (
                <View style={[styles.revBadge, badge.kind === "error" ? styles.revBadgeError : styles.revBadgeWarn]}>
                  <Text allowFontScaling={false} style={[styles.revBadgeText, badge.kind === "error" ? styles.revBadgeTextError : styles.revBadgeTextWarn]}>{badge.text}</Text>
                </View>
              )}
            </View>
            <Text allowFontScaling={false} style={styles.revSecSummary} numberOfLines={1}>{summary}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.revActionBtn} onPress={action.onPress}>
            <Text allowFontScaling={false} style={styles.revActionText}>{action.label}</Text>
          </TouchableOpacity>
        </View>
        {expanded && <View style={styles.revSecBody}>{body}</View>}
      </View>
    );
    const kv = (label: string, value: string) => (
      <View key={label} style={styles.revKV}>
        <Text allowFontScaling={false} style={styles.revKVLabel} numberOfLines={1}>{label}</Text>
        <Text allowFontScaling={false} style={styles.revKVVal} numberOfLines={1}>{value}</Text>
      </View>
    );

    return (
      <Section title={started ? "Tournament" : "Review & Start"}>
        {/* Compact top summary */}
        <View style={styles.revTop}>
          <View style={styles.revStat}>
            <Text allowFontScaling={false} style={styles.revStatNum}>{readyCount}</Text>
            <Text allowFontScaling={false} style={styles.revStatLbl}>Ready</Text>
            <Text allowFontScaling={false} style={styles.revStatSub}>{registered} registered</Text>
          </View>
          <View style={styles.revStat}>
            <Text allowFontScaling={false} style={styles.revStatNum}>{tablesCount}</Text>
            <Text allowFontScaling={false} style={styles.revStatLbl}>Tables</Text>
          </View>
          <View style={styles.revStat}>
            <Text allowFontScaling={false} style={styles.revStatNum}>{tierCount}</Text>
            <Text allowFontScaling={false} style={styles.revStatLbl}>Chip tiers</Text>
          </View>
        </View>

        {started ? (
          <>
            <Text style={styles.hint}>
              The tournament is {vm.phase === "results" ? "finished" : "running"}. You can still edit
              Settings, Players and Tables here at any time.
            </Text>
            <TouchableOpacity style={styles.startBtn} onPress={() => { if (embedded) { onGoLive?.(); } else { setSelectedPhase(vm.phase); setPage(vm.phase === "results" ? "Standings" : "Tables"); } }}>
              <Text style={styles.startBtnText}>{vm.phase === "results" ? "View Results →" : "Go to Live →"}</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            {/* Players */}
            {sec(
              "players",
              "Players",
              `${readyCount} Ready · ${registered} registered`,
              playersExpanded,
              { label: "View / Add", onPress: () => goSetup("players") },
              playersBadge,
              <>
                {/* BLOCKING: Ready entries over the Fargo cap without a valid override. */}
                {overCapReady.length > 0 && (
                  <View style={styles.reviewBlock}>
                    <Text allowFontScaling={false} style={styles.reviewBlockHead}>
                      ⛔ {overCapReady.length} {overCapReady.length === 1 ? (doubles ? "team is" : "player is") : `${unit} are`} over the Fargo limit and need approval before the tournament can start.
                    </Text>
                    {overCapReady.map((e) => (
                      <View key={e.id} style={styles.reviewBlockRow}>
                        <Text allowFontScaling={false} style={styles.reviewBlockName} numberOfLines={1}>
                          {nameOf(e)} — {overByOf(e)} over ({ratingForCap(e)} / max {maxFargo})
                        </Text>
                        <View style={styles.reviewBlockBtns}>
                          <TouchableOpacity style={styles.reviewFixSecondary} onPress={() => void clearOverride(e, true)}>
                            <Text allowFontScaling={false} style={styles.reviewFixSecondaryText}>Make Registered</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={styles.reviewFixPrimary}
                            onPress={() => { setCapReasonChoice("Point Cushion"); setCapReasonNotes(e.fargoCapOverrideNotes ?? ""); setCapReason({ entryId: e.id }); }}
                          >
                            <Text allowFontScaling={false} style={styles.reviewFixPrimaryText}>Approve Override</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    ))}
                  </View>
                )}

                {/* Paid but not Ready → money collected, being excluded. */}
                {paidNotReady.length > 0 && (
                  <View style={styles.reviewWarn}>
                    <Text allowFontScaling={false} style={styles.reviewWarnHead}>
                      ⚠ Paid but Not Ready — {paidNotReady.length}
                    </Text>
                    {paidNotReady.map((e) => (
                      <Text allowFontScaling={false} key={e.id} style={styles.reviewWarnRow} numberOfLines={1}>
                        {nameOf(e)} — Paid • Not Ready · will not be included
                      </Text>
                    ))}
                    <Text allowFontScaling={false} style={styles.reviewWarnNote}>
                      Mark them Ready to include them, or Proceed Anyway to exclude them.
                    </Text>
                  </View>
                )}

                {(unpaid.length > 0 || prereg.length > 0) && (
                  <View style={styles.reviewExcluded}>
                    <Text allowFontScaling={false} style={styles.reviewExcludedHead}>Also not included:</Text>
                    {unpaid.length > 0 && (
                      <Text allowFontScaling={false} style={styles.reviewExcludedRow}>• {unpaid.length} Registered / Unpaid — entry fee not collected</Text>
                    )}
                    {prereg.length > 0 && (
                      <Text allowFontScaling={false} style={styles.reviewExcludedRow}>• {prereg.length} Pre-Registered — need review</Text>
                    )}
                    <Text allowFontScaling={false} style={styles.reviewExcludedNote}>
                      Only Ready {unit} are added. Others stay in setup and can be brought in later.
                    </Text>
                  </View>
                )}

                {overCapReady.length === 0 && paidNotReady.length === 0 && unpaid.length === 0 && prereg.length === 0 && (
                  <Text allowFontScaling={false} style={styles.revEmpty}>
                    All {readyCount} Ready {readyCount === 1 ? (doubles ? "team" : "player") : unit} will be included.
                  </Text>
                )}
              </>,
            )}

            {/* Tables */}
            {sec(
              "tables",
              "Tables",
              `${tablesCount} ${tablesCount === 1 ? "table" : "tables"}`,
              !!reviewOpen.tables,
              { label: "Edit", onPress: () => goSetup("tables") },
              tablesCount === 0 ? { kind: "error" as const, text: "Add a table" } : null,
              tablesCount === 0 ? (
                <Text allowFontScaling={false} style={styles.revEmpty}>No tables yet — add at least one to run the queue.</Text>
              ) : (
                <>{chip.tables.map((t) => (
                  <View key={t.id} style={styles.revKV}>
                    <Text allowFontScaling={false} style={styles.revKVLabel} numberOfLines={1}>{t.label}</Text>
                    <Text allowFontScaling={false} style={styles.revKVVal}>{t.isStream ? "🔴 Stream" : ""}</Text>
                  </View>
                ))}</>
              ),
            )}

            {/* Prize Pool */}
            {sec(
              "prize",
              "Prize Pool",
              reviewPrize ? `${money(reviewPrize.total)} · ${reviewPrize.paidPlaces} paid ${reviewPrize.paidPlaces === 1 ? "place" : "places"}` : "—",
              !!reviewOpen.prize,
              { label: "Edit", onPress: () => goSetup("prizepool") },
              reviewPrize && !(reviewPrize.complete && reviewPrize.balanced) ? { kind: "warn" as const, text: "Incomplete" } : null,
              <>
                {kv("Total prize pool", reviewPrize ? money(reviewPrize.total) : "—")}
                {kv("Entry fee", entryFee ? money(entryFee) : "—")}
                {kv("Added money", addedMoney ? money(addedMoney) : "—")}
                {kv("Side pots", tournamentSidePots.length ? String(tournamentSidePots.length) : "None")}
                {kv("Paid places", reviewPrize ? String(reviewPrize.paidPlaces) : "—")}
                {/* Per-bucket allocation (entry + each enabled side pot): Allocated / Pool,
                    with any unallocated (or over-allocated) amount flagged. Start is blocked
                    until every bucket is exactly $0 remaining. */}
                {(reviewPrize?.buckets ?? []).map((b) => {
                  const off = Math.abs(b.remaining) >= 0.005;
                  return (
                    <View key={b.key}>
                      {kv(b.label, `${money(b.allocated)} / ${money(b.pool)}`)}
                      {off ? (
                        <Text allowFontScaling={false} style={styles.payoutMismatch}>
                          {b.remaining > 0
                            ? `${money(b.remaining)} unallocated`
                            : `over-allocated by ${money(-b.remaining)}`}
                        </Text>
                      ) : null}
                    </View>
                  );
                })}
                {reviewPrize && !(reviewPrize.complete && reviewPrize.balanced) ? (
                  <Text allowFontScaling={false} style={styles.payoutWarn}>
                    Payouts incomplete — assign every dollar of each pool (entry and each side pot) before starting.
                  </Text>
                ) : (
                  kv("Payout status", reviewPrize ? "Complete" : "—")
                )}
              </>,
            )}

            {/* Tournament Settings */}
            {sec(
              "settings",
              "Tournament Settings",
              `${gameType} · ${chipFmt}`,
              !!reviewOpen.settings,
              { label: "View / Edit", onPress: () => goSetup("settings") },
              tierCount === 0 ? { kind: "error" as const, text: "No chip tiers" } : null,
              <>
                {kv("Game type", gameType)}
                {kv("Format", `Chip Tournament · ${chipFmt}`)}
                {kv("Fargo cap", fargoLine)}
                {kv("Chip tiers", String(tierCount))}
                {kv("Buy-backs", chip.settings.buyBacksAllowed ? "Allowed" : "Off")}
              </>,
            )}

            <Text style={styles.reviewLead}>
              {readyCount === 0
                ? `No ${unit} are Ready yet. Mark ${unit} Ready (Entry Fee paid + Fargo) to build the field.`
                : `${readyCount} Ready ${readyCount === 1 ? (doubles ? "team" : "player") : unit} will enter the live field when you start.`}
            </Text>

            <TouchableOpacity style={[styles.startBtn, !canStart && styles.startBtnDisabled]} disabled={!canStart || vm.starting} onPress={doStart}>
              {vm.starting ? <ActivityIndicator color="#fff" /> : <Text style={styles.startBtnText}>{canStart ? "Start Tournament" : overCapReady.length > 0 ? "Resolve over-cap players to start" : !payoutsAllocated ? "Allocate all payouts to start" : "Need 2+ Ready, a table, and a chip tier"}</Text>}
            </TouchableOpacity>
          </>
        )}
      </Section>
    );
  };

  // ── Unified Shuffle entry (Dashboard + Tables share ONE flow) ────────────────
  // A shuffle cycle is "active" once the engine is draining / ready / mid-round.
  const shuffleActive =
    !!chip.reshufflePending || !!chip.shuffleReady || !!chip.shuffleRound;
  // Board is between rounds (draining or ready for the redraw): an empty active table
  // here is intentionally empty awaiting the next redraw → "Waiting for Shuffle" (not
  // "Available" / "No team assigned", which would look broken).
  const shuffleTransitioning = !!chip.reshufflePending || !!chip.shuffleReady;
  const isShuffleWaitTable = (t: ChipTable) =>
    shuffleTransitioning && !t.inactive && !t.locked && !t.closing && !t.matchId && !t.holderId && !t.pendingChallengerId;
  // Queue round-status badge (Shuffle rounds only, TEAM-level). Authoritative 3-state
  // derivation (no new state): "waiting" = still in roundRemaining (not yet seated);
  // seated/live (holder/pending of an active table OR an in-progress match participant)
  // → null (at-table, NOT played — never mislabel a seated/live entry as played, even
  // though such entries aren't in the queue); "played" = otherwise (turn completed,
  // back in the queue). NOT derived from !roundRemaining alone.
  const roundRemainingIds = new Set(chip.roundRemaining ?? []);
  const onTableIds = new Set<string>();
  for (const t of chip.tables) {
    if (t.inactive) continue;
    if (t.holderId) onTableIds.add(t.holderId);
    if (t.pendingChallengerId) onTableIds.add(t.pendingChallengerId);
  }
  for (const mm of chip.matches) {
    if (mm.status === "in_progress") { onTableIds.add(mm.aId); onTableIds.add(mm.bId); }
  }
  const queueRoundStatus = (id: string): { label: string; color: string } | null => {
    if (!chip.shuffleRound) return null;
    if (roundRemainingIds.has(id)) return { label: "Waiting for turn", color: COLORS.primary };
    if (onTableIds.has(id)) return null; // seated / live — at table, not yet completed
    return { label: "✓ Played this round", color: COLORS.textMuted };
  };
  // EVERY "start a new cycle" control (Tables toolbar, Dashboard header button,
  // Dashboard banner Begin-Shuffle / switch) calls this — it ONLY opens the setup
  // modal. No control calls beginShuffle directly, and no engine state changes until
  // the TD confirms in the modal (so cancelling leaves the tournament untouched).
  const openShuffleModal = () => {
    // Always start fresh: discard any selection from a prior (possibly cancelled)
    // attempt. Active tables + recommendation are re-read from CURRENT state at render.
    setShuffleRemoveIds(new Set());
    setShuffleModalOpen(true);
  };
  // Cancel: close AND discard the temporary selection. Never mutates tournament state
  // (no closeTables / beginShuffle / closing marks happen on cancel).
  const closeShuffleModal = () => {
    setShuffleModalOpen(false);
    setShuffleRemoveIds(new Set());
  };
  // Toggle a table for removal-after-shuffle. Stream tables warn before selecting
  // (never auto-protected); deselect is immediate. Selection is modal-only state —
  // nothing is applied to the tournament until confirm.
  const selectRemoveTable = (t: ChipTable) => {
    if (shuffleRemoveIds.has(t.id)) {
      setShuffleRemoveIds((prev) => { const nextSet = new Set(prev); nextSet.delete(t.id); return nextSet; });
      return;
    }
    const add = () => setShuffleRemoveIds((prev) => new Set(prev).add(t.id));
    if (t.isStream || t.streamUrl) {
      Alert.alert(
        "Remove stream table?",
        `${t.label} has a stream link. Remove it anyway?`,
        [{ text: "Keep", style: "cancel" }, { text: "Remove", style: "destructive", onPress: add }],
      );
    } else {
      add();
    }
  };
  // Modal confirm: apply safe removals (empty → inactive now; live → Closing After
  // Match), begin the authoritative shuffle, then play the cosmetic animation which
  // routes to the dashboard on completion. Hard guard: never strand active players by
  // removing every table (authoritative — not just the disabled button).
  const confirmShuffle = () => {
    const activeNow = chip.tables.filter((t) => !t.inactive);
    const hasActivePlayers = chip.entries.some((e) => e.status !== "eliminated" && enteredField(e));
    if (hasActivePlayers && activeNow.length - shuffleRemoveIds.size < 1) return;
    // ONE atomic engine step (startShuffleCycle): applies the removal selection AND
    // either redraws immediately (no live matches) or drains ("Finishing the Round",
    // live matches). Play the animation NOW only when it redraws now (Case 2) — the
    // animation must run immediately BEFORE the actual redraw, never while waiting for
    // live matches to finish. In the live-match case the animation plays later, at the
    // Ready-state Start Shuffle tap (startShuffleRedraw).
    const hasLiveMatches = chip.matches.some((m) => m.status === "in_progress");
    vm.startShuffleCycle([...shuffleRemoveIds]);
    setShuffleModalOpen(false);
    setShuffleRemoveIds(new Set());
    if (!hasLiveMatches) {
      // Case 2 — immediate redraw: play the animation, which routes to the dashboard.
      setShuffleAnimating(true);
    } else {
      // Case 1 — matches live: no animation yet; go to the dashboard to watch
      // "Finishing the Round" drain, then Ready to Shuffle → Start Shuffle.
      goToDashboard();
    }
  };
  // Start Shuffle from the Ready state (initial after a drain, OR a completed round):
  // the ONE deliberate tap that plays the animation and performs the redraw.
  const startShuffleRedraw = () => {
    vm.startShuffle(); // finalizeReshuffle → next round, opening matchups announced (Waiting to Start)
    setShuffleAnimating(true);
  };

  // ── Shuffle Mode banner ──────────────────────────────────────────────────────
  // Persistent while Shuffle Mode is on. Three states:
  //   available → "Normal Play — Shuffle Mode Available" + Begin Shuffle
  //   draining  → "Waiting for Current Matches to Finish" + Cancel
  //   ready     → "Ready to Shuffle" + Manage Tables / Start Shuffle / Cancel
  const renderShuffleBanner = () => {
    if (!chip.shuffleMode) return null;
    const live = chip.matches.filter((m) => m.status === "in_progress").length;
    const ready = !!chip.shuffleReady;
    const draining = !!chip.reshufflePending && !ready;
    // The Ready state rests until the TD taps Start Shuffle (never auto-advances now).
    // Two flavours, distinguished by shuffleRound: a completed round (shuffleRound true,
    // set by startDrain "round") vs the initial drain of a shuffle started while matches
    // were live (shuffleRound false, startDrain "initial"). Both show a Start Shuffle CTA.
    const roundComplete = ready && !!chip.shuffleRound;
    const readyInitial = ready && !chip.shuffleRound; // initial cycle drained → Ready to Shuffle
    const round = !!chip.shuffleRound && !draining && !ready;
    const roundNum = chip.reshuffleCount ?? 0;
    const aliveTeams = chip.entries.filter((e) => e.status !== "eliminated" && enteredField(e));
    const totalCount = aliveTeams.length;
    // Format-aware unit label — "Teams" for scotch doubles, "Players" for singles (one
    // chip ENTRY = one team or one player, never individual partners).
    const doubles = chip.settings.format === "scotch_doubles";
    const units = (n: number) => (doubles ? (n === 1 ? "Team" : "Teams") : (n === 1 ? "Player" : "Players"));
    const rec = recommendedActiveTables(totalCount);
    // Round-progress counter = alive entries NOT YET SEATED this round (still waiting for
    // their turn) = the authoritative roundRemaining set. Once seated (Waiting to Start)
    // or live, an entry drops out of the count. (roundRemaining is the not-yet-seated set
    // that also gates seating via roundSeatable — display and gate share the meaning.)
    const roundRemSet = new Set(chip.roundRemaining ?? []);
    const remainingCount = aliveTeams.filter((e) => roundRemSet.has(e.id)).length;
    const stateLabel = roundComplete
      ? `Round ${roundNum} Complete`
      : readyInitial
      ? "Ready to Shuffle"
      : round
      ? `Round ${roundNum} in Progress`
      : draining
      ? "Finishing the Round"
      : "Normal Play — Shuffle Mode Available";
    const accent = (roundComplete || readyInitial) ? COLORS.primary : round ? COLORS.success : draining ? COLORS.warning : COLORS.textSecondary;

    // ── Finals: exactly two players left ────────────────────────────────────────
    // At 2 remaining we replace the Shuffle Mode round UX with a Finals banner. The
    // two are AUTO-ASSIGNED to a table (assignFinals, in the VM settle path) as a
    // reserved holder + pending challenger — but NOT started. The TD taps Start
    // Match to go live. The match then uses the SAME chip / winner-stays /
    // elimination rules; its winner drops the loser to 0 chips → alive === 1 →
    // recordWinner sets finishedAt and the existing results flow takes over.
    const isFinals = totalCount === 2 && !chip.finishedAt;
    if (isFinals) {
      const finalLive = live > 0; // the two are already playing
      // Assigned-but-not-started final: a table reserved with holder + pending, no match.
      const finalsTable = chip.tables.find(
        (t) => t.holderId && t.pendingChallengerId && !t.matchId,
      );
      const hA = finalsTable ? entryById(finalsTable.holderId) : null;
      const hB = finalsTable ? entryById(finalsTable.pendingChallengerId) : null;
      const hasSeatableTable = chip.tables.some((t) => !t.inactive);
      const stateLbl = finalLive
        ? "Final Match in Progress"
        : finalsTable
          ? "Final Match Ready"
          : "Final Two";
      const subText = finalLive
        ? "The last two face off — record the winner. The loser drops a chip; the finals continue until someone runs out."
        : finalsTable && hA && hB
          ? `${shortTeam(hA)} vs ${shortTeam(hB)} · ${finalsTable.label} — tap Start Match when ready.`
          : hasSeatableTable
            ? "Assigning the final match…"
            : "Finals ready — waiting for an available table.";
      return (
        <View style={[styles.shufBanner, { borderColor: COLORS.primary }]}>
          <View style={styles.shufHead}>
            <View style={styles.shufTitleWrap}>
              <Ionicons name="trophy-outline" size={webMs(16)} color={COLORS.primary} />
              <Text style={styles.shufTitle}>Finals</Text>
            </View>
          </View>
          <Text style={[styles.shufState, { color: COLORS.primary }]}>{stateLbl}</Text>
          <Text style={styles.shufSub}>{subText}</Text>
          {!finalLive && finalsTable && (
            <TouchableOpacity
              style={[styles.shufPrimary, isWeb && styles.shufPrimaryWeb]}
              onPress={() => vm.startPendingMatch(finalsTable.id)}
              activeOpacity={0.85}
            >
              <Text style={styles.shufPrimaryText}>Start Match</Text>
            </TouchableOpacity>
          )}
        </View>
      );
    }

    return (
      <View style={[styles.shufBanner, { borderColor: roundComplete || readyInitial || round || draining ? accent : COLORS.border }]}>
        <View style={styles.shufHead}>
          <View style={styles.shufTitleWrap}>
            <Ionicons name="shuffle" size={webMs(16)} color={accent} />
            <Text style={styles.shufTitle}>Shuffle Mode</Text>
          </View>
          <Switch
            // Turning ON opens the setup modal (does NOT enable the engine or flip the
            // switch until the TD confirms). Turning OFF disables shuffle mode.
            value={!!chip.shuffleMode}
            onValueChange={(v) => (v ? openShuffleModal() : vm.setShuffleMode(false))}
            trackColor={{ true: COLORS.primary, false: COLORS.border }}
            thumbColor={COLORS.white}
          />
        </View>
        <Text style={[styles.shufState, { color: accent }]}>{stateLabel}</Text>
        {round && (
          <>
            <Text style={styles.shufCount}>
              {remainingCount} of {totalCount} {units(totalCount)} Remaining
            </Text>
            <Text style={styles.shufSub}>Every {doubles ? "team" : "player"} plays once before the next shuffle.</Text>
          </>
        )}
        {draining && (
          <Text style={styles.shufSub}>
            {live} match{live === 1 ? "" : "es"} still in progress. Each table clears as its match finishes.
          </Text>
        )}
        {roundComplete && (
          <>
            <Text style={styles.shufCount}>
              {totalCount} {units(totalCount)} Advance
            </Text>
            <Text style={styles.shufSub}>
              Round complete. Adjust the table layout if needed, then Start Shuffle — the new matchups are announced as Waiting to Start, then you start them.
            </Text>
            <Text style={styles.shufRec}>Recommended Tables: {rec}</Text>
          </>
        )}
        {readyInitial && (
          <>
            <Text style={styles.shufSub}>
              All tables are clear. Adjust the table layout if needed, then Start Shuffle — the new matchups are announced as Waiting to Start, then you start them.
            </Text>
            <Text style={styles.shufRec}>Recommended Tables: {rec}</Text>
          </>
        )}
        {!draining && !roundComplete && !readyInitial && !round && (
          <TouchableOpacity style={[styles.shufPrimary, isWeb && styles.shufPrimaryWeb]} onPress={openShuffleModal} activeOpacity={0.85}>
            <Text style={styles.shufPrimaryText}>Begin Shuffle</Text>
          </TouchableOpacity>
        )}
        {(roundComplete || readyInitial) && (
          <View style={styles.shufBtnRow}>
            <TouchableOpacity style={styles.shufGhost} onPress={() => setReduceOpen(true)} activeOpacity={0.85}>
              <Text style={styles.shufGhostText} numberOfLines={1}>Manage Tables</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.shufPrimarySm} onPress={startShuffleRedraw} activeOpacity={0.85}>
              <Text style={styles.shufPrimaryText} numberOfLines={1}>Start Shuffle</Text>
            </TouchableOpacity>
          </View>
        )}
        {(draining || roundComplete || readyInitial || round) && (
          <TouchableOpacity
            style={styles.shufCancel}
            onPress={() =>
              Alert.alert(
                "Cancel Shuffle?",
                "This stops the shuffle cycle and resumes normal winner-stays play. Any teams still waiting to be re-seated go back to the queue.",
                [
                  { text: "Keep Shuffling", style: "cancel" },
                  { text: "Cancel Shuffle", style: "destructive", onPress: () => vm.cancelReshuffle() },
                ],
              )
            }
            activeOpacity={0.7}
          >
            <Text style={styles.shufCancelText}>Cancel Shuffle</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  // ONE shared active-table card — used by the dashboard Active Tables preview, its
  // "View All Tables" modal (inModal), AND the Live → Tables tab Card View. Identical
  // presentation, statuses, matchup, Start Match, and ⋮ menu everywhere. `inModal`
  // routes the ⋮ to a distinct ref map so the dashboard preview + modal never collide
  // (the Tables tab and dashboard are never mounted at the same time, so they share
  // the default ref map safely).
  const renderTableCard = (t: ChipTable, inModal = false) => {
            const m = chip.matches.find((mm) => mm.id === t.matchId && mm.status === "in_progress");
            const a = m ? entryById(m.aId) : null;
            const b = m ? entryById(m.bId) : null;
            const elapsed = m ? matchElapsedMs(m, now) : 0;
            const holder = entryById(t.holderId);
            const pending = !m && t.pendingChallengerId ? entryById(t.pendingChallengerId) : null;
            const dotColor = m || holder ? COLORS.success : COLORS.textMuted; // dot stays green even past 7:00
            // `locked` must be surfaced — a locked table receives no new matches (the
            // redraw/seating skips it), so if it isn't shown the TD sees an empty table
            // labelled "Available" with no idea why it never fills (the "Table 2 stays
            // empty" report). Matches the List view's status wording.
            const waitShuffle = isShuffleWaitTable(t);
            const badgeColor = m ? timerColor(elapsed) : pending ? COLORS.primary : (t.closing || t.locked) ? COLORS.warning : waitShuffle ? COLORS.primary : COLORS.textMuted;
            // Top status = CURRENT live state only (no pending suffixes — those move to a
            // note under the match so the top line stays scannable).
            const statusLbl = m ? `Live ${fmtClock(elapsed)}` : pending ? "Waiting to Start" : t.closing ? "Removes after match" : t.locked ? "🔒 Locked" : holder ? "Waiting" : waitShuffle ? "Waiting for Shuffle" : "Available";
            // One active player/team on the MAIN card: centered "Name (chips)" — no Fargo,
            // no "Chips" word, no left/right columns. Chip count is the live ChipState
            // value in parentheses right after the name. Richer per-player detail (Fargo +
            // chips) lives in the tapped table-detail view.
            const renderActivePlayer = (e: ChipEntry) => (
              <Text style={styles.atMatchTeam} numberOfLines={1}>
                {shortTeam(e)}{" "}
                <Text style={{ color: chipStatusColor(e.chips, e.startChips) }}>({e.chips})</Text>
              </Text>
            );
            return (
              <Pressable
                key={t.id}
                onPress={isWeb ? () => setTableDetailId(t.id) : undefined}
                style={(s: any) => [styles.atCard, dashTwoCol && styles.atCardWeb, dashUltra && styles.atCardUltra, isWeb && s.hovered && styles.atCardHover]}
              >
                <View style={styles.atHeader}>
                  <TouchableOpacity style={styles.atHeaderMain} onPress={() => setTableDetailId(t.id)} activeOpacity={0.7}>
                    <View style={styles.atNameRow}>
                      <Text style={styles.atTableName} numberOfLines={1}>{t.label}</Text>
                      {t.isStream && <Ionicons name="videocam" size={webMs(13)} color={COLORS.primary} style={styles.atStreamIcon} />}
                    </View>
                  </TouchableOpacity>
                  <View style={styles.atBadge}>
                    <View style={[styles.atDot, { backgroundColor: dotColor }]} />
                    <Text style={[styles.atBadgeText, { color: badgeColor }]} numberOfLines={1}>{statusLbl}</Text>
                  </View>
                  <Pressable
                    ref={(r) => { (inModal ? dashModalTableMenuRefs : tableMenuRefs).current[t.id] = r; }}
                    style={styles.atMenuHit}
                    onPress={() => (inModal ? openDashModalTableMenu : openTableMenu)(t.id)}
                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                  >
                    {(s: any) => (
                      <View style={[styles.atMenuBg, isWeb && s.hovered && styles.atMenuBgHover, s.pressed && styles.atMenuBgPressed]}>
                        <Ionicons name="ellipsis-vertical" size={webMs(18)} color={COLORS.textSecondary} />
                      </View>
                    )}
                  </Pressable>
                </View>
                <TouchableOpacity style={styles.atMatch} onPress={() => setTableDetailId(t.id)} activeOpacity={0.7}>
                  {m && a && b ? (
                    <>
                      {renderActivePlayer(a)}
                      <Text style={styles.atVs}>VS</Text>
                      {renderActivePlayer(b)}
                    </>
                  ) : holder && pending ? (
                    <>
                      {renderActivePlayer(holder)}
                      <Text style={styles.atVs}>VS</Text>
                      {renderActivePlayer(pending)}
                    </>
                  ) : holder ? (
                    <>
                      {renderActivePlayer(holder)}
                      <Text style={styles.atVs}>VS</Text>
                      <Text style={styles.atMatchWaiting}>Waiting for Opponent</Text>
                    </>
                  ) : (
                    <Text style={styles.atMatchWaiting}>{waitShuffle ? "Waiting for Shuffle" : "No team assigned"}</Text>
                  )}
                </TouchableOpacity>
                {/* Pending future table-state, shown BELOW the match so the top line stays
                    focused on the current live state. Idle-locked shows "🔒 Locked" in the
                    top status instead. */}
                {m && t.closing ? (
                  <Text style={styles.atPendingNote}>Removal after match</Text>
                ) : m && t.locked ? (
                  <Text style={styles.atPendingNote}>Locks after match</Text>
                ) : null}
                {pending && (
                  <TouchableOpacity style={styles.atStartBtn} onPress={() => vm.startPendingMatch(t.id)} activeOpacity={0.85}>
                    <Text style={styles.atStartBtnText}>Start Match</Text>
                  </TouchableOpacity>
                )}
              </Pressable>
      );
    };

  // ── Live · Dashboard (live control center) ───────────────────────────────────
  const renderLiveDashboard = () => {
    const d = dashboard(chip);
    const alive = chip.entries.filter((e) => e.status !== "eliminated" && enteredField(e));
    const activeTables = chip.tables.filter((t) => !t.inactive);
    const activeCount = activeTables.length;
    // Preview ordering (item 12): Waiting-to-Start (0) first, then Live (1), then
    // locked/available/other (2), so the director never misses a table awaiting Start Match.
    const tableRank = (t: ChipTable): number => {
      const live = chip.matches.some((m) => m.id === t.matchId && m.status === "in_progress");
      if (!live && t.pendingChallengerId) return 0;
      if (live) return 1;
      return 2;
    };
    const sortedActiveTables = [...activeTables].sort((a, b) => tableRank(a) - tableRank(b));
    const waitingCount = activeTables.filter((t) => tableRank(t) === 0).length;
    const rec = recommendedActiveTables(d.playersRemaining);
    const overStaffed = d.playersRemaining > 0 && activeCount > rec && !chip.reshufflePending;
    const leaders = [...alive].sort((a, b) => b.chips - a.chips || b.wins - a.wins);
    const chipLeader = leaders[0] ?? null;
    const tablesAdded = chip.events.filter((e) => e.type === "table_added").length;
    const tablesRemoved = chip.events.filter((e) => e.type === "table_removed").length;
    const durs = chip.matches.filter((m) => m.status !== "in_progress" && m.endedAt).map((m) => new Date(m.endedAt as string).getTime() - new Date(m.startedAt).getTime()).filter((x) => x > 0);
    const fastest = durs.length ? Math.min(...durs) : null;

    const longNow = activeTables.map((t) => {
      const m = chip.matches.find((mm) => mm.id === t.matchId && mm.status === "in_progress");
      if (!m) return null;
      const ms = matchElapsedMs(m, now);
      return ms > LONG_MATCH_MS ? { label: t.label, clock: fmtClock(ms) } : null;
    }).filter(Boolean) as { label: string; clock: string }[];
    const streamAvail = chip.tables.some((t) => t.isStream && !t.matchId && !t.inactive);

    // Alerts are for conditions that need the TD's attention only. A normal
    // waiting queue is expected during a chip tournament and is already shown in
    // the Queue summary card + the Queue section, so it is NOT an alert.
    // Each alert carries a STABLE id keyed to its condition so a Dismiss persists for that
    // specific instance and only reappears when the condition materially changes (id
    // changes). Recommendations are passive cards (never a re-popup on refresh).
    const alerts: { id: string; text: string; sub?: string; onPress?: () => void; cta?: string; urgent?: boolean }[] = [];
    // (Re)shuffle milestone — recommend once the alive field reaches ~50% of the current
    // cycle's baseline (item 13). Suppressed while a reshuffle is already pending/ready or
    // continuous Shuffle Mode is running (don't nag toward endgame).
    const shuffleThreshold = recommendedShuffleThreshold(chip);
    const recommendReshuffle =
      shuffleThreshold >= 2 &&
      d.playersRemaining >= 2 &&
      d.playersRemaining <= shuffleThreshold &&
      !chip.reshufflePending &&
      !chip.shuffleReady &&
      !chip.shuffleMode;
    const shuffleLabel = (chip.reshuffleCount ?? 0) === 0 ? "Recommended Shuffle" : "Recommended Reshuffle";
    if (recommendReshuffle)
      alerts.push({
        id: `shuffle:${chip.reshuffleCount ?? 0}`,
        text: shuffleLabel,
        sub: `${d.playersRemaining} players remain — ${(chip.reshuffleCount ?? 0) === 0 ? "shuffle" : "reshuffle"} to rebalance the field.`,
        onPress: openShuffleModal,
        cta: "Take Action",
      });
    if (overStaffed)
      alerts.push({
        id: `reduce:${rec}`,
        text: "Adjustment Recommended",
        sub: `${d.playersRemaining} players remain · ${activeCount} active tables — reduce to ~${rec} to keep the queue balanced.`,
        onPress: openReduce,
        cta: "Take Action",
      });
    if (streamAvail) alerts.push({ id: "stream", text: "Stream table available" });
    for (const lm of longNow) alerts.push({ id: `long:${lm.label}`, text: `Long match: ${lm.clock} on ${lm.label}`, urgent: true });
    const visibleAlerts = alerts.filter((a) => !dismissedAlerts.has(a.id));

    const queueIds = chip.queue.slice(0, 5);
    const leaderList = showFullStandings ? leaders : leaders.slice(0, 5);

    type SumCard = { val: number | string; lbl: string; nav: "players" | "tables" | "queue" | null };
    const summary: SumCard[] = [
      { val: d.playersRemaining, lbl: "Remaining", nav: "players" },
      { val: activeCount, lbl: "Active Tables", nav: "tables" },
      { val: d.queueCount, lbl: "Queue", nav: "queue" },
    ];
    // Desktop shows a fourth stat (Avg Match) and relabels Queue → Waiting.
    const summaryWide: SumCard[] = [
      { val: d.playersRemaining, lbl: "Remaining", nav: "players" },
      { val: activeCount, lbl: "Active Tables", nav: "tables" },
      { val: d.queueCount, lbl: "Waiting", nav: "queue" },
      { val: d.avgMatchMs ? fmtClock(d.avgMatchMs) : "—", lbl: "Avg Match", nav: null },
    ];

    const summaryEl = (
      <View style={styles.sumCardsRow}>
        {(dashTwoCol ? summaryWide : summary).map((c) => (
          <TouchableOpacity key={c.lbl} style={styles.sumCard} onPress={() => c.nav && onNavigate?.(c.nav)} activeOpacity={0.8}>
            <Text style={styles.sumCardVal}>{c.val}</Text>
            <Text style={styles.sumCardLbl} numberOfLines={1}>{c.lbl}</Text>
          </TouchableOpacity>
        ))}
      </View>
    );

    const chipLeaderEl = chipLeader ? (
      <View style={styles.leaderCardN}>
        <View style={styles.leaderHeadN}>
          <Text style={styles.leaderKickerN}>Chip Leader</Text>
          <TouchableOpacity onPress={scrollToLeaders} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={styles.leaderLinkN}>View Standings</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity onPress={() => setProfileId(chipLeader.id)} activeOpacity={0.7}>
          <Text style={styles.leaderNameN} numberOfLines={1}>{shortTeam(chipLeader)}</Text>
          <View style={styles.leaderMetaRowN}>
            <Text style={styles.leaderMetaN} numberOfLines={1}>{chipLeader.teamFargo != null ? `${fargoLabel}: ${chipLeader.teamFargo}` : ""}</Text>
            <Text style={[styles.leaderChipsN, { color: chipStatusColor(chipLeader.chips, chipLeader.startChips) }]}>{chipLeader.chips} chips</Text>
          </View>
        </TouchableOpacity>
      </View>
    ) : null;

    const championEl = chip.winnerId ? (
      <View style={styles.champCard}>
        <Ionicons name="trophy" size={webMs(18)} color={COLORS.primary} />
        <View style={styles.champTextWrap}>
          {vm.isFinished && <Text style={styles.champKicker}>WINNING TEAM</Text>}
          <Text style={styles.champText} numberOfLines={1}>
            {teamName(entryById(chip.winnerId)!)}{vm.isFinished ? "" : " wins"}
          </Text>
        </View>
        {!vm.isFinished && (
          <TouchableOpacity
            style={[styles.champBtn, vm.finishing && styles.champBtnDisabled]}
            onPress={doFinishTournament}
            disabled={vm.finishing}
            activeOpacity={0.85}
          >
            <Text style={styles.champBtnText}>{vm.finishing ? "Finishing…" : "Finish"}</Text>
          </TouchableOpacity>
        )}
      </View>
    ) : null;

    // One alert row (shared by the 3-item preview and the View All modal). A lowercase
    // helper returning JSX (not a component) so it's not re-created on each render.
    const alertRowEl = (a: (typeof visibleAlerts)[number], last: boolean) => (
      <View key={a.id} style={[styles.alertRow2, last && styles.noBorder]}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.alertText2, a.urgent && styles.alertUrgent]}>{a.text}</Text>
          {a.sub ? <Text style={styles.alertSub2}>{a.sub}</Text> : null}
        </View>
        {a.onPress && (
          <TouchableOpacity style={styles.secBtnSm} onPress={a.onPress}><Text style={styles.secBtnSmText}>{a.cta}</Text></TouchableOpacity>
        )}
        <TouchableOpacity onPress={() => dismissAlert(a.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ marginLeft: webSc(SPACING.sm), padding: 2 }}>
          <Ionicons name="close" size={webMs(16)} color={COLORS.textMuted} />
        </TouchableOpacity>
      </View>
    );
    // Preview shows at most 3; the rest open in a "View All Alerts" modal (item 15).
    const alertsPreview = visibleAlerts.slice(0, 3);
    const alertsEl = visibleAlerts.length > 0 ? (
      <>
        <DashSection icon="warning-outline" iconColor={COLORS.warning} title="Alerts">
          {alertsPreview.map((a, i) => alertRowEl(a, visibleAlerts.length <= 3 && i === alertsPreview.length - 1))}
          {visibleAlerts.length > 3 && (
            <TouchableOpacity style={styles.atViewAll} onPress={() => setAlertsModalOpen(true)} activeOpacity={0.7}>
              <Text style={styles.atViewAllText}>View All Alerts ({visibleAlerts.length})</Text>
              <Ionicons name="chevron-forward" size={webMs(15)} color={COLORS.primary} />
            </TouchableOpacity>
          )}
        </DashSection>
        <Modal visible={alertsModalOpen} transparent animationType="fade" onRequestClose={() => setAlertsModalOpen(false)}>
          <Pressable style={styles.menuBackdrop} onPress={() => setAlertsModalOpen(false)}>
            <Pressable style={styles.dashTablesCard} onPress={() => {}}>
              <View style={styles.dashTablesHeader}>
                <Text style={styles.dashTablesTitle}>Alerts ({visibleAlerts.length})</Text>
                <TouchableOpacity onPress={() => setAlertsModalOpen(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <Text style={styles.dashTablesDone}>Done</Text>
                </TouchableOpacity>
              </View>
              <ScrollView style={{ maxHeight: "100%" }} contentContainerStyle={{ paddingHorizontal: webSc(SPACING.md), paddingVertical: webSc(SPACING.sm) }} showsVerticalScrollIndicator>
                {visibleAlerts.map((a, i) => alertRowEl(a, i === visibleAlerts.length - 1))}
              </ScrollView>
            </Pressable>
          </Pressable>
        </Modal>
      </>
    ) : null;

    const queueEl = (
      <DashSection icon="list-outline" title={`Queue (${chip.queue.length})`}>
        {chip.queue.length === 0 ? (
          <View style={styles.qEmpty}>
            <Text style={styles.qEmptyTitle}>Queue is empty</Text>
            <Text style={styles.qEmptySub}>Teams will appear here when they are waiting for a table.</Text>
          </View>
        ) : (
          <>
            {queueIds.map((qid, i) => {
              const e = entryById(qid);
              if (!e) return null;
              return (
                <TouchableOpacity key={qid} style={[styles.qRow2, i === 0 && styles.noBorderTop]} onPress={() => setProfileId(e.id)} activeOpacity={0.7}>
                  <Text style={styles.qPos2}>{i + 1}</Text>
                  <View style={styles.qNameCol}>
                    <Text style={styles.qName2} numberOfLines={1}>{shortTeam(e)}</Text>
                    {e.teamFargo != null ? <Text style={styles.qFargo2}>{fargoLabel}: {e.teamFargo}</Text> : null}
                    {(() => { const rs = queueRoundStatus(qid); return rs ? <Text style={[styles.qRoundStatus, { color: rs.color }]} numberOfLines={1}>{rs.label}</Text> : null; })()}
                    {rematchSkippedLabel(chip, qid) ? (
                      <Text style={styles.qRematchSkip} numberOfLines={1}>⚠ Rematch skipped</Text>
                    ) : null}
                  </View>
                  <Text style={[styles.qChipsRight, { color: chipStatusColor(e.chips, e.startChips) }]}>{e.chips} {e.chips === 1 ? "chip" : "chips"}</Text>
                </TouchableOpacity>
              );
            })}
            <Pressable
              style={({ pressed }) => [styles.qViewAll, pressed && styles.qViewAllPressed]}
              onPress={() => { setQueueMenuId(null); setQueueModalOpen(true); }}
            >
              <Text style={styles.qViewAllText}>
                {chip.queue.length > 5 ? `View Full Queue (${chip.queue.length})` : `Manage Queue (${chip.queue.length})`}
              </Text>
              <Ionicons name="chevron-forward" size={webMs(16)} color={COLORS.primary} />
            </Pressable>
          </>
        )}
      </DashSection>
    );

    // Dashboard PREVIEW: first 2 active tables + "View All Tables (X)". The full list
    // (all tables, all statuses/actions) opens in a modal — the Live → Tables tab is
    // untouched.
    const activeTablesEl = (
      <>
        <DashSection icon="grid-outline" title="Active Tables" action={vm.startAllMode ? <HeaderBtn label={vm.startAllMode === "all" ? "Start All" : "Start Remaining"} onPress={() => vm.startAllMatches()} /> : !shuffleActive && !chip.shuffleMode ? <HeaderBtn label="Shuffle" onPress={openShuffleModal} /> : undefined}>
          {activeTables.length === 0 && <Text style={styles.hint}>No active tables.</Text>}
          {(() => {
            // Always show EVERY waiting-to-start table (even beyond the normal 2-card cap)
            // plus fill to at least 2; the rest live under "View All Tables".
            const previewCount = Math.max(2, waitingCount);
            const preview = sortedActiveTables.slice(0, previewCount);
            return (
              <>
                <View style={dashTwoCol ? styles.atGrid : undefined}>
                  {preview.map((t) => renderTableCard(t))}
                </View>
                {activeTables.length > preview.length && (
                  <TouchableOpacity style={styles.atViewAll} onPress={() => setDashTablesOpen(true)} activeOpacity={0.7}>
                    <Text style={styles.atViewAllText}>View All Tables ({activeTables.length})</Text>
                    <Ionicons name="chevron-forward" size={webMs(15)} color={COLORS.primary} />
                  </TouchableOpacity>
                )}
              </>
            );
          })()}
        </DashSection>
        <Modal visible={dashTablesOpen} transparent animationType="fade" onRequestClose={() => setDashTablesOpen(false)}>
          <Pressable style={styles.menuBackdrop} onPress={() => setDashTablesOpen(false)}>
            <Pressable style={styles.dashTablesCard} onPress={() => {}}>
              <View style={styles.dashTablesHeader}>
                <Text style={styles.dashTablesTitle}>Active Tables ({activeTables.length})</Text>
                <TouchableOpacity onPress={() => setDashTablesOpen(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <Text style={styles.dashTablesDone}>Done</Text>
                </TouchableOpacity>
              </View>
              <ScrollView style={{ maxHeight: "100%" }} contentContainerStyle={{ paddingHorizontal: webSc(SPACING.md), paddingVertical: webSc(SPACING.md) }} showsVerticalScrollIndicator>
                {sortedActiveTables.map((t) => renderTableCard(t, true))}
              </ScrollView>
            </Pressable>
          </Pressable>
          {/* Table ⋮ menu rendered IN THIS layer (not a second RN Modal). Backdrop
              dismisses only the menu → Active Tables stays open. Modal-launching
              actions close Active Tables first (renderTableMenu's onModalAction). */}
          {tableMenu != null && (
            <View style={styles.dashMenuOverlay}>
              {renderTableMenu(() => setTableMenu(null), () => setDashTablesOpen(false))}
            </View>
          )}
        </Modal>
      </>
    );

    const chipLeadersEl = (
      <View onLayout={(e) => { leadersYRef.current = e.nativeEvent.layout.y; }}>
        <DashSection icon="trophy-outline" title="Chip Leaders" action={<HeaderBtn label={showFullStandings ? "Show less" : "View Standings"} onPress={() => setShowFullStandings((v) => !v)} />}>
          {leaderList.map((e, i) => (
            <TouchableOpacity key={e.id} style={[styles.clRow, i === 0 && styles.clRowTop]} onPress={() => setProfileId(e.id)} activeOpacity={0.7}>
              <Text style={styles.clRank}>{i + 1}.</Text>
              <Text style={styles.clName} numberOfLines={1}>{shortTeam(e)}</Text>
              <Text style={[styles.clChips, { color: chipStatusColor(e.chips, e.startChips) }]}>{e.chips} chips</Text>
            </TouchableOpacity>
          ))}
        </DashSection>
      </View>
    );

    const activityEl = (
        <DashSection icon="stats-chart-outline" title="Tournament Activity">
          <View style={dashTwoCol ? styles.actStatGrid : undefined}>
          {[
            ["Completed Matches", String(d.matchesPlayed)],
            ["Average Match Time", d.avgMatchMs ? fmtClock(d.avgMatchMs) : "-"],
            ["Fastest Match", fastest != null ? fmtClock(fastest) : "-"],
            ["Longest Match", d.longestMatchMs ? fmtClock(d.longestMatchMs) : "-"],
            ["Reshuffles", String(chip.reshuffleCount ?? 0)],
            ["Tables Added", String(tablesAdded)],
            ["Tables Removed", String(tablesRemoved)],
          ].map(([label, value], i) => (
            <View key={label} style={[styles.actRow, dashTwoCol ? styles.actItemWeb : i > 0 && styles.actRowDiv]}>
              <Text style={styles.actLbl}>{label}</Text>
              <Text style={styles.actVal}>{value}</Text>
            </View>
          ))}
          </View>
        </DashSection>
    );

    // Completed: a dedicated recap dashboard — champion + completed metrics + a
    // link to the final standings. Every active element (shuffle banner, chip
    // leader, queue, active tables, alerts, activity, auto-run) is omitted, and
    // the state itself is already torn down (reconcileCompleted) so nothing here
    // can be revived.
    if (vm.isFinished) {
      const completedCards = [
        { val: String(chip.entries.length), lbl: "Final Teams" },
        { val: String(d.matchesPlayed), lbl: "Matches Played" },
        { val: String(chip.tables.length), lbl: "Tables Used" },
      ];
      return (
        <View>
          {championEl}
          <View style={styles.sumCardsRow}>
            {completedCards.map((c) => (
              <View key={c.lbl} style={styles.sumCard}>
                <Text style={styles.sumCardVal}>{c.val}</Text>
                <Text style={styles.sumCardLbl} numberOfLines={2}>{c.lbl}</Text>
              </View>
            ))}
          </View>
          <TouchableOpacity style={styles.completedStandingsBtn} onPress={() => onOpenResults?.()} activeOpacity={0.8}>
            <Ionicons name="podium-outline" size={webMs(16)} color={COLORS.primary} />
            <Text style={styles.completedStandingsText}>View Final Standings</Text>
            <Ionicons name="chevron-forward" size={webMs(16)} color={COLORS.primary} />
          </TouchableOpacity>
        </View>
      );
    }

    // Desktop: main column (queue/tables/activity) + side column (leader/alerts/
    // standings). Mobile/narrow: the original single-column order (unchanged).
    if (dashTwoCol) {
      return (
        <View>
          {renderShuffleBanner()}
          {summaryEl}
          <View style={styles.dashCols}>
            <View style={styles.dashMain}>
              {queueEl}
              {activeTablesEl}
              {activityEl}
            </View>
            <View style={styles.dashSide}>
              {chipLeaderEl}
              {championEl}
              {alertsEl}
              {chipLeadersEl}
            </View>
          </View>
        </View>
      );
    }

    return (
      <View>
        {renderShuffleBanner()}
        {summaryEl}
        {chipLeaderEl}
        {championEl}
        {alertsEl}
        {queueEl}
        {activeTablesEl}
        {chipLeadersEl}
        {activityEl}
      </View>
    );
  };

  // ── Live · Tables ────────────────────────────────────────────────────────────
  const STATUS_TAG: Record<
    "inactive" | "closing" | "playing" | "available",
    { label: string; color: string }
  > = {
    playing: { label: "Match in progress", color: COLORS.success },
    available: { label: "Available", color: COLORS.textSecondary },
    closing: { label: "Closing after match", color: COLORS.warning },
    inactive: { label: "Inactive", color: COLORS.textMuted },
  };
  const renderLiveTables = () => {
    // Completed: no operational table controls or leftover table state — the live
    // layout is cleared. Just a completed message + a link to the history.
    if (readOnly) {
      return (
        <View style={styles.completedWrap}>
          <Ionicons name="checkmark-circle-outline" size={webMs(44)} color={COLORS.textMuted} />
          <Text style={styles.completedTitle}>Tournament Completed</Text>
          <Text style={styles.completedSub}>All tables have been cleared.</Text>
          <TouchableOpacity style={styles.completedStandingsBtn} onPress={() => onOpenResults?.()} activeOpacity={0.8}>
            <Ionicons name="time-outline" size={webMs(16)} color={COLORS.primary} />
            <Text style={styles.completedStandingsText}>View Match History</Text>
          </TouchableOpacity>
        </View>
      );
    }
    const d = dashboard(chip);
    const activeTables = chip.tables.filter((t) => !t.inactive);
    const inactiveTables = chip.tables.filter((t) => t.inactive);
    const activeCount = activeTables.length;
    const rec = recommendedActiveTables(d.playersRemaining);
    const overStaffed = d.playersRemaining > 0 && activeCount > rec && !chip.reshufflePending;

    // Presentation-only sort over a COPY (never mutates the authoritative board order).
    const liveOf = (t: ChipTable) => (t.matchId ? chip.matches.find((mm) => mm.id === t.matchId && mm.status === "in_progress") : null);
    const tableElapsed = (t: ChipTable) => { const m = liveOf(t); return m ? matchElapsedMs(m, now) : 0; };
    const statusRank = (t: ChipTable) => {
      if (liveOf(t)) return 0;
      if (t.holderId && t.pendingChallengerId) return 1; // waiting to start
      if (t.holderId) return 2; // waiting for opponent
      if (t.closing) return 3;
      return 4; // available/empty
    };
    const tableNum = (t: ChipTable) => { const n = parseInt(String(t.label).replace(/[^0-9]/g, ""), 10); return Number.isFinite(n) ? n : Number.MAX_SAFE_INTEGER; };
    const origIdx = new Map(activeTables.map((t, i) => [t.id, i]));
    const tie = (a: ChipTable, b: ChipTable) => (origIdx.get(a.id) ?? 0) - (origIdx.get(b.id) ?? 0);
    const sortedActive = tablesSort === "default"
      ? activeTables
      : [...activeTables].sort((a, b) => {
          switch (tablesSort) {
            case "number": return (tableNum(a) - tableNum(b)) || tie(a, b);
            case "status": return (statusRank(a) - statusRank(b)) || tie(a, b);
            case "longest": return (tableElapsed(b) - tableElapsed(a)) || tie(a, b);
            case "shortest": return (tableElapsed(a) - tableElapsed(b)) || tie(a, b);
            default: return tie(a, b);
          }
        });

    // Compact one-per-line row for List View. Same statuses/wording as the card; the
    // ⋮ opens the SAME unified table menu (openTableMenu → renderTableMenu).
    const renderTableListRow = (t: ChipTable) => {
      const m = liveOf(t);
      const a = m ? entryById(m.aId) : null;
      const b = m ? entryById(m.bId) : null;
      const holder = entryById(t.holderId);
      const pending = !m && t.pendingChallengerId ? entryById(t.pendingChallengerId) : null;
      const elapsed = m ? matchElapsedMs(m, now) : 0;
      const waitShuffle = isShuffleWaitTable(t);
      const statusLabel = m ? `Live ${fmtClock(elapsed)}` : pending ? "Waiting to Start" : t.closing ? "Removes after match" : t.locked ? "🔒 Locked" : holder ? "Waiting for Opponent" : waitShuffle ? "Waiting for Shuffle" : "Available";
      const pendingNote = m && t.closing ? "Removal after match" : m && t.locked ? "Locks after match" : null;
      const statusColor = m ? timerColor(elapsed) : pending ? COLORS.primary : t.closing || t.locked ? COLORS.warning : holder ? COLORS.success : waitShuffle ? COLORS.primary : COLORS.textMuted;
      const matchup = m && a && b ? `${shortTeam(a)} vs ${shortTeam(b)}`
        : holder && pending ? `${shortTeam(holder)} vs ${shortTeam(pending)}`
        : holder ? `${shortTeam(holder)} — waiting` : waitShuffle ? "Waiting for Shuffle" : "Open";
      return (
        <TouchableOpacity key={t.id} style={styles.tlRow} onPress={() => setTableDetailId(t.id)} activeOpacity={0.7}>
          <Text style={styles.tlName} numberOfLines={1}>{t.label}</Text>
          <View style={styles.tlMid}>
            <Text style={[styles.tlStatus, { color: statusColor }]} numberOfLines={1}>{statusLabel}</Text>
            <Text style={styles.tlMatch} numberOfLines={1}>{matchup}</Text>
            {pendingNote && <Text style={{ color: COLORS.warning, fontSize: webMs(FONT_SIZES.xs - 1), fontWeight: "700" }} numberOfLines={1}>{pendingNote}</Text>}
          </View>
          <TouchableOpacity ref={(r) => { tableMenuRefs.current[t.id] = r; }} style={styles.tlMenu} onPress={() => openTableMenu(t.id)} hitSlop={10}>
            <Ionicons name="ellipsis-vertical" size={webMs(18)} color={COLORS.textSecondary} />
          </TouchableOpacity>
        </TouchableOpacity>
      );
    };

    // Toolbar Shuffle button: active cycle → route to the Dashboard status card;
    // otherwise → open the SHARED setup modal (openShuffleModal, component scope —
    // same flow the dashboard uses). shuffleActive / openShuffleModal / confirmShuffle
    // all live at component scope now so both entry points behave identically.
    const onTapShuffle = () => {
      if (shuffleActive) goToDashboard();
      else openShuffleModal();
    };

    // Top banner (over-staffed recommendation only). The large Shuffle status card no
    // longer lives on the Tables page — it belongs to the Live Dashboard.
    const topBanners = (
      <>
        {overStaffed && (
          <View style={styles.recNeutral}>
            <View style={{ flex: 1 }}>
              <Text style={styles.recNeutralTitle}>Recommended: {rec} table{rec === 1 ? "" : "s"}</Text>
              <Text style={styles.recNeutralSub}>You currently have {activeCount} active tables.</Text>
            </View>
            <TouchableOpacity onPress={openReduce} hitSlop={8}>
              <Text style={styles.recNeutralAction}>Reduce</Text>
            </TouchableOpacity>
          </View>
        )}
      </>
    );

    // The 2×2 toolbar — the PINNED region (sticky header) in embedded mode. Row/cell
    // geometry is unchanged; only the surrounding wrapper (bg + divider) is new.
    const toolbar = (
      <>
        {/* Row 1 — Add Table + Shuffle/Start All. Column widths are owned by the
            shared tbRow/tbCol wrappers (two equal flex cells + one gap), NOT by the
            controls; each control just fills its cell (tbCtrl width:100%). */}
        <View style={styles.tbRow}>
          <View style={styles.tbCol}>
            <TouchableOpacity style={[styles.tbCtrl, styles.tbAddBtn]} onPress={openAddTables} activeOpacity={0.85}>
              <Ionicons name="add" size={webMs(16)} color={COLORS.primary} />
              <Text style={styles.tbAddText}>Add Table</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.tbCol}>
            {vm.startAllMode ? (
              <TouchableOpacity
                style={[styles.tbCtrl, styles.tbReshufBtn, styles.tbStartAllBtn]}
                onPress={() => vm.startAllMatches()}
                activeOpacity={0.85}
              >
                <Ionicons name="play" size={webMs(16)} color={COLORS.white} />
                <Text style={[styles.tbReshufText, styles.tbStartAllText]}>
                  {vm.startAllMode === "all" ? "Start All" : "Start Remaining"}
                </Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[styles.tbCtrl, styles.tbReshufBtn, shuffleActive && styles.tbReshufBtnOn]}
                onPress={onTapShuffle}
                activeOpacity={0.85}
              >
                <Ionicons name="shuffle" size={webMs(16)} color={shuffleActive ? COLORS.primary : COLORS.text} />
                <Text style={[styles.tbReshufText, shuffleActive && { color: COLORS.primary }]}>
                  {shuffleActive ? "Shuffle On" : "Shuffle"}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Row 2 — Card/List toggle + presentation-only Sort. Same tbRow/tbCol
            structure as Row 1, so the two columns line up column-for-column. */}
        <View style={[styles.tbRow, styles.tbRow2]}>
          <View style={styles.tbCol}>
            <View style={[styles.tbCtrl, styles.tblSeg]}>
              <TouchableOpacity style={[styles.tblSegBtn, tablesView === "card" && styles.tblSegBtnOn]} onPress={() => setTablesView("card")} activeOpacity={0.7}>
                <Ionicons name="grid-outline" size={webMs(14)} color={tablesView === "card" ? COLORS.primary : COLORS.textSecondary} />
                <Text style={[styles.tblSegText, tablesView === "card" && styles.tblSegTextOn]}>Card</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.tblSegBtn, tablesView === "list" && styles.tblSegBtnOn]} onPress={() => setTablesView("list")} activeOpacity={0.7}>
                <Ionicons name="list-outline" size={webMs(14)} color={tablesView === "list" ? COLORS.primary : COLORS.textSecondary} />
                <Text style={[styles.tblSegText, tablesView === "list" && styles.tblSegTextOn]}>List</Text>
              </TouchableOpacity>
            </View>
          </View>
          {/* Compact — no selected label in the toolbar; the choice is shown (✓) in
              the menu. A subtle dot marks that a non-default sort is active. */}
          <View style={styles.tbCol}>
            <TouchableOpacity style={[styles.tbCtrl, styles.tblSortBtn]} onPress={() => setTablesSortMenuOpen(true)} activeOpacity={0.7}>
              <Ionicons name="swap-vertical-outline" size={webMs(14)} color={tablesSort !== "default" ? COLORS.primary : COLORS.textSecondary} />
              <Text style={[styles.tblSortText, tablesSort !== "default" && { color: COLORS.primary }]}>Sort</Text>
              <Ionicons name="chevron-down" size={webMs(13)} color={COLORS.textMuted} />
            </TouchableOpacity>
          </View>
        </View>
      </>
    );

    const listContent = (
      <>
        {activeTables.length === 0 && <Text style={styles.hint}>No active tables. Add one above.</Text>}

        {tablesView === "card" ? (
          <View style={dashTwoCol ? styles.atGrid : undefined}>
            {sortedActive.map((t) => renderTableCard(t))}
          </View>
        ) : (
          <View>{sortedActive.map((t) => renderTableListRow(t))}</View>
        )}

        {inactiveTables.length > 0 && (
          <View style={styles.manageTables}>
            <Text style={styles.manageHead}>INACTIVE TABLES</Text>
            {inactiveTables.map((t) => (
              <View key={t.id} style={styles.inactiveRow}>
                <Text style={styles.inactiveLabel}>{t.label}</Text>
                <TouchableOpacity style={styles.reactivateBtn} onPress={() => vm.reactivateTable(t.id)}>
                  <Text style={styles.reactivateText}>Reactivate</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}
      </>
    );

    const sortModal = (
      <Modal visible={tablesSortMenuOpen} transparent animationType="fade" onRequestClose={() => setTablesSortMenuOpen(false)}>
        <Pressable style={styles.menuBackdrop} onPress={() => setTablesSortMenuOpen(false)}>
          <Pressable style={styles.menuCard} onPress={() => {}}>
            {LIVE_TABLE_SORT_OPTS.map((o) => (
              <TouchableOpacity key={o.value} style={styles.menuItem} onPress={() => { setTablesSort(o.value); setTablesSortMenuOpen(false); }}>
                <Text style={[styles.menuItemText, tablesSort === o.value && styles.menuItemOn]}>
                  {tablesSort === o.value ? "✓  " : ""}{o.label}
                </Text>
              </TouchableOpacity>
            ))}
          </Pressable>
        </Pressable>
      </Modal>
    );

    // NOTE: the Shuffle setup modal + animation are rendered ONCE at component level
    // (in `modals`), NOT here — so they overlay every live page (Dashboard included),
    // and both entry points share the exact same modal/animation.

    // Embedded (the live manager): the host gives this page a fill-height slot, so we
    // own our scrolling and PIN the toolbar via stickyHeaderIndices. Order inside the
    // scroll: [0] top banners (scroll away), [1] toolbar (STICKY), [2] table list.
    // The sticky wrapper carries a solid bg + divider so table rows never bleed
    // through behind it. Anchored ⋮ / Sort menus are window-positioned overlays, so
    // scrolling/pinning does not affect their placement; both Card and List views
    // share this exact structure.
    if (embedded) {
      return (
        <View style={styles.liveTablesFlex}>
          <ScrollView
            ref={liveScrollRef}
            style={styles.liveTablesFlex}
            contentContainerStyle={styles.liveTablesScrollInner}
            stickyHeaderIndices={[1]}
            showsVerticalScrollIndicator={false}
            refreshControl={liveRefreshControl}
          >
            <View>{topBanners}</View>
            <View style={styles.stickyToolbar}>{toolbar}</View>
            <View style={styles.liveTablesList}>{listContent}</View>
          </ScrollView>
          {sortModal}
        </View>
      );
    }

    // Standalone (legacy route): rendered inside the screen's own ScrollView, so keep
    // the flat (non-pinned) layout — no nested scroll.
    return (
      <View>
        {topBanners}
        <View style={styles.stickyToolbar}>{toolbar}</View>
        <View style={styles.liveTablesList}>{listContent}</View>
        {sortModal}
      </View>
    );
  };

  // ── Live · Queue ─────────────────────────────────────────────────────────────
  const renderLiveQueue = () => (
    <Section title={`Queue (${chip.queue.length})`}>
      {chip.queue.map((qid, i) => {
        const e = entryById(qid);
        if (!e) return null;
        return (
          <View key={qid} style={styles.queueRow}>
            <Text style={styles.queuePos}>{i + 1}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.queueName} numberOfLines={1}>{shortTeam(e)}</Text>
              {(() => { const rs = queueRoundStatus(qid); return rs ? <Text style={[styles.qRoundStatus, { color: rs.color }]} numberOfLines={1}>{rs.label}</Text> : null; })()}
              {rematchSkippedLabel(chip, qid) ? (
                <Text style={styles.qRematchSkip} numberOfLines={1}>⚠ Rematch skipped</Text>
              ) : null}
            </View>
            <Text style={styles.queueMeta}><Text style={{ color: chipStatusColor(e.chips, e.startChips) }}>{e.chips} chip{e.chips === 1 ? "" : "s"}</Text> · {e.wins}-{e.losses}</Text>
          </View>
        );
      })}
      {chip.queue.length === 0 && <Text style={styles.hint}>Queue is empty.</Text>}
    </Section>
  );

  // Measure an anchor node in the window and place a dropdown just below it,
  // right-edge aligned (opens left), clamped to stay on-screen.
  // `estH` is only a DIRECTION preference (does the menu comfortably fit below?), not a
  // fit guarantee: whichever side is chosen, the card is capped to that side's real
  // available space (safe areas + tab bar accounted for) and its list scrolls if the
  // content is taller — so ALL actions stay on-screen regardless of how many rows.
  const placeMenu = (
    node: any,
    id: string,
    setter: (v: MenuPos) => void,
    estH = webSc(300),
  ) => {
    const MENU_W = webSc(270); // must match styles.ddCard width so the clamp is exact
    const screen = Dimensions.get("window");
    const GAP = webSc(4);
    const usableTop = insets.top + webSc(8); // below the status bar / notch
    const usableBottom = screen.height - Math.max(insets.bottom, webSc(8)) - webSc(56); // above the tab bar
    if (node && node.measureInWindow) {
      node.measureInWindow((x: number, y: number, w: number, h: number) => {
        let left = x + w - MENU_W;
        left = Math.max(webSc(8), Math.min(left, screen.width - MENU_W - webSc(8)));
        // Actual room on each side, clamped to the usable viewport (never negative).
        const spaceBelow = Math.max(0, usableBottom - (y + h) - GAP);
        const spaceAbove = Math.max(0, (y - GAP) - usableTop);
        // Down if it comfortably fits; else up if it comfortably fits; else the side
        // with more room. maxH is EXACTLY the room on the chosen side (never floored
        // above it, which previously pushed the last action off-screen under the tab
        // bar) — the menu's ScrollView scrolls when the content is taller.
        const openDown = spaceBelow >= estH || (spaceBelow < estH && spaceAbove < estH && spaceBelow >= spaceAbove);
        if (openDown) {
          setter({ id, left, top: y + h + GAP, maxH: spaceBelow });
        } else {
          setter({ id, left, bottom: screen.height - (y - GAP), maxH: spaceAbove });
        }
      });
    } else {
      setter({ id, left: Math.max(webSc(8), screen.width - MENU_W - webSc(8)), top: usableTop + webSc(60), maxH: usableBottom - usableTop });
    }
  };
  const openPlayerMenu = (id: string) => placeMenu(playerMenuRefs.current[id], id, setPlayerMenu);
  const openTableMenu = (id: string) => placeMenu(tableMenuRefs.current[id], id, setTableMenu, webSc(360));
  const openDashModalTableMenu = (id: string) => placeMenu(dashModalTableMenuRefs.current[id], id, setTableMenu, webSc(360));

  // Shared table action-menu body (backdrop + anchored card). Rendered BOTH by the
  // standalone Modal (dashboard preview ⋮) AND inline inside the Active Tables modal
  // layer (its ⋮): a second RN Modal cannot present over an already-open Modal on iOS,
  // so the modal path renders this in the same layer. `onModalAction` (set only for the
  // in-modal path) closes the Active Tables modal FIRST for actions that open their own
  // RN Modal (Set Winner / Manually Assign / Move / Rename / Stream Link) — otherwise
  // that follow-up modal would hit the same nested-present wall. Direct calls and native
  // Alerts (Lock / Reset / Assign / Forfeit / Clear / Remove) keep the modal open.
  const renderTableMenu = (close: () => void, onModalAction?: () => void) => {
    const t = tableMenu ? chip.tables.find((x) => x.id === tableMenu.id) : null;
    if (!t || !tableMenu) return null;
    const match = chip.matches.find((m) => m.id === t.matchId && m.status === "in_progress");
    const holder = entryById(t.holderId);
    const occupied = !!match || !!holder;
    const canMove = chip.tables.some((x) => x.id !== t.id && !x.inactive && !x.locked && !x.matchId && !x.holderId);
    // Action that opens its OWN RN modal → dismiss the menu, close Active Tables (if in
    // that layer), then launch — never two stacked modals.
    const viaModal = (fn: () => void) => () => { close(); onModalAction?.(); fn(); };
    const direct = (fn: () => void) => () => { close(); fn(); };
    const Row = ({ label, icon, onPress, danger, disabled }: { label: string; icon: React.ComponentProps<typeof Ionicons>["name"]; onPress: () => void; danger?: boolean; disabled?: boolean }) => (
      <TouchableOpacity style={[styles.ddRow, disabled && styles.btnDisabledLite]} disabled={disabled} onPress={onPress} activeOpacity={0.6}>
        <Ionicons name={icon} size={webMs(17)} color={danger ? COLORS.error : COLORS.textSecondary} />
        <Text style={[styles.ddRowText, danger && { color: COLORS.error }]} numberOfLines={1}>{label}</Text>
      </TouchableOpacity>
    );
    return (
      <>
        <Pressable style={styles.ddBackdrop} onPress={close} />
        <Pressable style={[styles.ddCard, { left: tableMenu.left, top: tableMenu.top, bottom: tableMenu.bottom, maxHeight: tableMenu.maxH }]} onPress={() => {}}>
          <Text style={styles.ddName} numberOfLines={1}>{t.label}</Text>
          <ScrollView style={{ flexShrink: 1 }} showsVerticalScrollIndicator={true}>
            {match && <Row icon="trophy-outline" label="Set Winner" onPress={viaModal(() => setCompleteMatch({ matchId: match.id, aId: match.aId, bId: match.bId }))} />}
            {occupied && <Row icon="exit-outline" label="Forfeit Team" onPress={direct(() => confirmForfeitTeam(t))} />}
            {occupied && <Row icon="time-outline" label="Reset Match Timer" onPress={direct(() => vm.resetTableTimer(t.id))} />}
            {occupied && <Row icon="refresh-outline" label="Clear Table" onPress={direct(() => confirmClearTable(t))} />}
            {!match && <Row icon="play-forward-outline" label="Assign Next Team" disabled={t.locked || (!holder && chip.queue.length < 2) || (!!holder && chip.queue.length < 1)} onPress={direct(() => vm.assignNextTeam(t.id))} />}
            {!match && <Row icon="hand-left-outline" label="Manually Assign" disabled={t.locked || chip.queue.length === 0} onPress={viaModal(() => setManualAssignId(t.id))} />}
            {occupied && <Row icon="swap-horizontal-outline" label="Move Team" disabled={!canMove} onPress={viaModal(() => setMoveFromId(t.id))} />}
            <Row icon="create-outline" label="Rename Table" onPress={viaModal(() => openRename(t))} />
            <Row icon={t.locked ? "lock-open-outline" : "lock-closed-outline"} label={t.locked ? "Unlock Table" : "Lock Table"} onPress={direct(() => toggleTableLock(t))} />
            <Row icon="videocam-outline" label={t.isStream ? "Edit Stream Link" : "Add Stream Link"} onPress={viaModal(() => openStreamLink(t))} />
            {/* State-aware: a table already scheduled to remove shows "Cancel Removal"
                (undo, pure state — reactivate never seats); otherwise the red "Remove
                Table" opens the state-aware modal (live → remove after match, occupied →
                guard, empty → remove). Pending state also shows on the card. */}
            {t.closing ? (
              <Row icon="refresh-outline" label="Cancel Removal" onPress={direct(() => vm.reactivateTable(t.id))} />
            ) : (
              <Row icon="trash-outline" label="Remove Table" danger onPress={direct(() => confirmRemoveTableSmart(t))} />
            )}
          </ScrollView>
        </Pressable>
      </>
    );
  };

  // ── Live · Players (records + buy-back) ──────────────────────────────────────

  const renderLivePlayers = () => {
    const aliveAll = chip.entries.filter((e) => e.status !== "eliminated" && enteredField(e));
    const outAll = chip.entries.filter((e) => e.status === "eliminated");

    // ── Presentation-only search + sort ────────────────────────────────────────
    // Filters/reorders ONLY this display list. It never mutates the queue, table
    // assignments, winner-stays state, or persisted order — the engine arrays are
    // untouched; we filter/sort a shallow copy for rendering.
    const q = liveQuery.trim().toLowerCase();
    const matchesQuery = (e: ChipEntry): boolean => {
      if (!q) return true;
      // Name (incl. both partners via teamName) + Fargo (team + each member).
      const hay = `${teamName(e)} ${e.teamFargo ?? ""} ${e.p1Fargo ?? ""} ${e.p2Fargo ?? ""}`.toLowerCase();
      return hay.includes(q);
    };
    const nameKey = (e: ChipEntry) => teamName(e).toLowerCase();
    // Fargo compare — unrated (null) always sorts last; name is the final tiebreak.
    const fargoCmp = (a: ChipEntry, b: ChipEntry, dir: "asc" | "desc"): number => {
      const fa = a.teamFargo;
      const fb = b.teamFargo;
      if (fa == null && fb == null) return nameKey(a).localeCompare(nameKey(b));
      if (fa == null) return 1;
      if (fb == null) return -1;
      return (dir === "desc" ? fb - fa : fa - fb) || nameKey(a).localeCompare(nameKey(b));
    };
    // "status" = keep the current authoritative/live order (no comparator).
    // Record — Best First = win differential desc, then wins desc, then name.
    const cmp: ((a: ChipEntry, b: ChipEntry) => number) | null =
      liveSort === "name" ? (a, b) => nameKey(a).localeCompare(nameKey(b))
      : liveSort === "chipsDesc" ? (a, b) => b.chips - a.chips || nameKey(a).localeCompare(nameKey(b))
      : liveSort === "chipsAsc" ? (a, b) => a.chips - b.chips || nameKey(a).localeCompare(nameKey(b))
      : liveSort === "record" ? (a, b) =>
          (b.wins - b.losses) - (a.wins - a.losses) || b.wins - a.wins || nameKey(a).localeCompare(nameKey(b))
      : liveSort === "fargoDesc" ? (a, b) => fargoCmp(a, b, "desc")
      : liveSort === "fargoAsc" ? (a, b) => fargoCmp(a, b, "asc")
      : null;
    const applyView = (arr: ChipEntry[]): ChipEntry[] => {
      const f = arr.filter(matchesQuery);
      return cmp ? [...f].sort(cmp) : f;
    };
    const alive = applyView(aliveAll);
    const out = applyView(outAll);
    const shown = alive.length + out.length;
    const totalPlayers = aliveAll.length + outAll.length;
    const sortLabel = LIVE_SORT_OPTS.find((o) => o.value === liveSort)?.label ?? "Sort";

    // Completed: read-only. Replace the active status ("queued"/"playing") with a
    // final placement label and hide the per-team action menu.
    const placeById = new Map(readOnly ? finalPlacements(chip).map((p) => [p.entryId, p.place]) : []);
    const finalLabel = (e: ChipEntry): string => {
      const p = placeById.get(e.id);
      if (p === 1) return "Winner";
      if (p != null) return `${ordSuffix(p)} Place`;
      return "Eliminated";
    };
    return (
      <>
        {readOnly && (
          <Text style={styles.readOnlyNote}>Tournament completed — this roster is final and read-only.</Text>
        )}

        {/* Compact, presentation-only search + sort (reuses the roster toolbar UI). */}
        <View style={styles.ptToolbar}>
          <View style={styles.ptSearch}>
            <Ionicons name="search" size={16} color={COLORS.textMuted} />
            <TextInput
              allowFontScaling={false}
              style={styles.ptSearchInput}
              value={liveQuery}
              onChangeText={setLiveQuery}
              placeholder="Search name or Fargo…"
              placeholderTextColor={COLORS.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
            />
            {liveQuery.length > 0 && (
              <TouchableOpacity onPress={() => setLiveQuery("")} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close-circle" size={16} color={COLORS.textMuted} />
              </TouchableOpacity>
            )}
          </View>
          <TouchableOpacity style={styles.ptFilterBtn} onPress={() => setLiveSortMenuOpen(true)} activeOpacity={0.7}>
            <Text style={styles.ptFilterText} numberOfLines={1}>{sortLabel}</Text>
            <Ionicons name="chevron-down" size={14} color={COLORS.textMuted} />
          </TouchableOpacity>
        </View>
        {q.length > 0 && (
          <Text style={styles.hint}>Showing {shown} of {totalPlayers}</Text>
        )}

        <Section title={`Players (${aliveAll.length})`}>
          {alive.length === 0 ? (
            <Text style={styles.hint}>{q ? "No players match your search." : "No players yet."}</Text>
          ) : alive.map((e) => (
            <View key={e.id} style={styles.playerRow}>
              <TouchableOpacity style={styles.playerTap} onPress={() => setProfileId(e.id)} activeOpacity={0.7}>
                <Text style={styles.playerName} numberOfLines={1}>{shortTeam(e)} <Text style={styles.playerChevron}>›</Text></Text>
                <Text style={styles.playerMeta} numberOfLines={1}>
                  <Text style={[styles.playerChips, { color: chipStatusColor(e.chips, e.startChips) }]}>{e.chips} {e.chips === 1 ? "chip" : "chips"}</Text>
                  <Text style={styles.playerMetaSep}>{"   ·   "}</Text>
                  <Text style={styles.playerRecord}>{e.wins}-{e.losses}</Text>
                  <Text style={styles.playerMetaSep}>{"   ·   "}</Text>
                  <Text style={readOnly ? styles.playerRecord : e.status === "playing" ? styles.playerStatusPlaying : styles.playerStatusIdle}>
                    {readOnly ? finalLabel(e) : e.status}
                  </Text>
                </Text>
              </TouchableOpacity>
              {!readOnly && (
                <TouchableOpacity ref={(r) => { playerMenuRefs.current[e.id] = r; }} style={styles.playerMenuBtn} onPress={() => openPlayerMenu(e.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="ellipsis-vertical" size={webMs(18)} color={COLORS.textSecondary} />
                </TouchableOpacity>
              )}
            </View>
          ))}
        </Section>
        {out.length > 0 && (
          <Section title={`Eliminated (${out.length})`}>
            {out.map((e) => (
              <View key={e.id} style={styles.playerRow}>
                <TouchableOpacity style={styles.playerTap} onPress={() => setProfileId(e.id)} activeOpacity={0.7}>
                  <Text style={[styles.playerName, styles.playerOut]} numberOfLines={1}>{shortTeam(e)}</Text>
                  <Text style={[styles.playerMeta, styles.playerMetaOut]}>{readOnly ? `${finalLabel(e)} · ${e.wins}-${e.losses}` : `${e.wins}-${e.losses}`}</Text>
                </TouchableOpacity>
                {!readOnly && (
                  <TouchableOpacity ref={(r) => { playerMenuRefs.current[e.id] = r; }} style={styles.playerMenuBtn} onPress={() => openPlayerMenu(e.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons name="ellipsis-vertical" size={webMs(18)} color={COLORS.textSecondary} />
                  </TouchableOpacity>
                )}
              </View>
            ))}
          </Section>
        )}

        {/* Sort options (reuses the roster sort-menu UI). */}
        <Modal
          visible={liveSortMenuOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setLiveSortMenuOpen(false)}
        >
          <Pressable style={styles.menuBackdrop} onPress={() => setLiveSortMenuOpen(false)}>
            <Pressable style={styles.menuCard} onPress={() => {}}>
              {LIVE_SORT_OPTS.map((o) => (
                <TouchableOpacity
                  key={o.value}
                  style={styles.menuItem}
                  onPress={() => { setLiveSort(o.value); setLiveSortMenuOpen(false); }}
                >
                  <Text style={[styles.menuItemText, liveSort === o.value && styles.menuItemOn]}>
                    {liveSort === o.value ? "✓  " : ""}
                    {o.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </Pressable>
          </Pressable>
        </Modal>
      </>
    );
  };

  // ── Results · Standings ──────────────────────────────────────────────────────
  const renderStandings = () => {
    const alive = [...chip.entries].filter((e) => e.status !== "eliminated" && enteredField(e)).sort((a, b) => b.chips - a.chips || b.wins - a.wins);
    const out = [...chip.entries].filter((e) => e.status === "eliminated").sort((a, b) => b.wins - a.wins);
    const row = (e: ChipEntry, rank: number) => {
      const isOut = e.status === "eliminated";
      return (
        <TouchableOpacity key={e.id} style={styles.standRow} onPress={() => setProfileId(e.id)} activeOpacity={0.7}>
          <Text style={styles.standRank} numberOfLines={1}>{rank}</Text>
          <Text style={[styles.standName, isOut && styles.playerOut]} numberOfLines={1}>{shortTeam(e)}</Text>
          <Text style={styles.standMeta}><Text style={{ color: chipStatusColor(e.chips, e.startChips) }}>{e.chips}</Text> · {e.wins}-{e.losses} · {e.eliminations}K</Text>
        </TouchableOpacity>
      );
    };
    return (
      <>
        {chip.winnerId && <Section title="Champion"><Text style={styles.champ}>🏆 {teamName(entryById(chip.winnerId)!)}</Text></Section>}
        <Section title="Standings">
          <Text style={styles.hint}>Chips · W-L · Eliminations</Text>
          {alive.map((e, i) => row(e, i + 1))}
        </Section>
        {out.length > 0 && <Section title="Eliminated">{out.map((e, i) => row(e, alive.length + i + 1))}</Section>}
        {vm.phase === "results" && (
          <Section title="Manage">
            <Text style={styles.hint}>Ended by mistake? Put it back to Live to keep playing.</Text>
            <TouchableOpacity style={styles.reopenBtn} onPress={confirmReopen}>
              <Text style={styles.reopenBtnText}>↩ Reopen Tournament</Text>
            </TouchableOpacity>
          </Section>
        )}
      </>
    );
  };

  // ── Results · History (timeline from chip_events) ────────────────────────────
  const renderHistory = () => (
    <Section title="History">
      {chip.events.length === 0 && <Text style={styles.hint}>No events yet.</Text>}
      {chip.events.map((ev) => (
        <View key={ev.id} style={styles.histRow}>
          <Text style={styles.histText} numberOfLines={2}>{ev.text}</Text>
        </View>
      ))}
    </Section>
  );

  // ── Results · Summary (official tournament recap) ────────────────────────────
  const SumGroup = ({ title, rows }: { title: string; rows: [string, string][] }) => (
    <View style={styles.sumGroup}>
      <Text style={styles.sumGroupTitle}>{title}</Text>
      {rows.map(([l, v], i) => (
        <View key={l} style={[styles.sumRow, i > 0 && styles.sumRowDiv]}>
          <Text style={styles.sumLbl} numberOfLines={1}>{l}</Text>
          <Text style={styles.sumVal} numberOfLines={1}>{v}</Text>
        </View>
      ))}
    </View>
  );
  // Results · Payouts — connects final placements (exact elimination order) to the
  // TD's configured payout positions. Reuses the same prize-pool math as the
  // bracket flow; no paid/unpaid tracking or splitting yet.
  const renderPayouts = () => {
    const money = (n: number): string => `$${Math.round(n).toLocaleString()}`;
    const ordinal = (n: number): string => {
      const s = ["th", "st", "nd", "rd"], v = n % 100;
      return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
    };
    const placements = finalPlacements(chip);
    const teamAtPlace = (place: number): string => {
      const p = placements.find((x) => x.place === place);
      const e = p ? entryById(p.entryId) : null;
      return e ? teamName(e) : "—";
    };
    // Payout pool basis = actual FIELD entrants (enteredField) — the same set the setup /
    // Review pool uses — not a raw paid count (which would count paid-but-not-Ready entries
    // that never entered the field and inflate the pool vs Review).
    const paidPlayers = chip.entries.filter(enteredField).length;
    const entryFee = Number(tournament.entry_fee) || 0;
    const addedMoney = Number(tournament.added_money) || 0;
    const ls: any = tournament.live_settings ?? {};
    const fees = (ls.fees ?? []).filter((f: any) => f.enabled);
    const cfg = ls.prizePool ?? null;
    const includeAdded = cfg?.includeAddedMoney ?? true;
    const pool = entryPoolTotal(paidPlayers, entryFee, feesPerPlayer(fees), !!ls.feesAddedOnTop, includeAdded, addedMoney);
    const payoutPlaces = cfg?.entryPlaces?.length ? computeBreakdown(pool, cfg.entryPlaces).places : null;
    // Side-pot payouts — same authoritative model the Setup/editor uses. Pool per pot
    // = active entrants who bought into it × its amount (mirrors [id].tsx prizeSidePots);
    // breakdown via the shared sidePotPayoutViews (empty/unconfigured pots are dropped).
    const sidePotPoolByName: Record<string, number> = {};
    for (const sp of parseSidePots(tournament?.side_pots)) {
      sidePotPoolByName[sp.name] = sidePotTotal(
        chip.entries.filter((e) => (e.paidSidePots ?? []).includes(sp.name)).length,
        sp.amount,
      );
    }
    const sidePots = sidePotPayoutViews(cfg, sidePotPoolByName);
    // Side-pot RESULTS ranking (item 30): eligibility = ONLY entrants who bought that pot.
    // Rank those buyers by their OVERALL finish order and assign side-pot placement among
    // them (5th overall who entered becomes 1st Side Pot). Singles AND teams both carry
    // paidSidePots, so one filter serves both. Returns the eligible finisher NAMES in
    // side-pot placement order (index 0 = 1st Side Pot).
    const sidePotFinishers = (name: string): string[] => {
      const buyers = new Set(
        chip.entries.filter((e) => (e.paidSidePots ?? []).includes(name)).map((e) => e.id),
      );
      return placements
        .filter((p) => buyers.has(p.entryId))
        .sort((a, b) => a.place - b.place)
        .map((p) => {
          const e = entryById(p.entryId);
          return e ? teamName(e) : "—";
        });
    };
    return (
      <View>
        <Text style={styles.sumHeader}>Payouts</Text>
        <Text style={styles.sumSubHeader}>Final placements → payout positions</Text>
        <SumGroup
          title="PRIZE POOL"
          rows={[
            ["Entry Fee", entryFee ? money(entryFee) : "—"],
            ["Added Money", addedMoney ? money(addedMoney) : "—"],
            ["Entries", String(paidPlayers)],
            ["Prize Pool", pool ? money(pool) : "—"],
          ]}
        />
        {payoutPlaces && payoutPlaces.length && pool > 0 ? (
          <View style={styles.sumGroup}>
            <Text style={styles.sumGroupTitle}>PAYOUT BREAKDOWN</Text>
            {payoutPlaces.map((row, i) => (
              <View key={row.place} style={[styles.sumRow, i > 0 && styles.sumRowDiv]}>
                <Text style={styles.payPlace}>{ordinal(row.place)}</Text>
                <Text style={styles.payName} numberOfLines={1}>{teamAtPlace(row.place)}</Text>
                <Text style={styles.payAmt}>{money(row.amount)}</Text>
              </View>
            ))}
          </View>
        ) : (
          <View style={styles.section}>
            <Text style={styles.hint}>
              Set up the prize structure in Setup → Prize Pool to populate payouts. Until then, payouts will be announced by the tournament director.
            </Text>
          </View>
        )}
        {sidePots.map((sp) => {
          const finishers = sidePotFinishers(sp.name);
          return (
            <View key={sp.name} style={styles.sumGroup}>
              <Text style={styles.sumGroupTitle}>{sp.name.toUpperCase()} — SIDE POT RESULTS</Text>
              <View style={[styles.sumRow, { justifyContent: "space-between" }]}>
                <Text style={styles.payName}>Pool</Text>
                <Text style={styles.payAmt}>{money(sp.pool)}</Text>
              </View>
              {sp.places.map((row, i) => (
                <View key={row.place} style={[styles.sumRow, styles.sumRowDiv]}>
                  <Text style={styles.payPlace}>{ordinal(row.place)}</Text>
                  {/* i-th configured side-pot place → i-th eligible finisher (buyers ranked
                      by overall finish). Falls back to the % when no eligible finisher yet. */}
                  <Text style={styles.payName} numberOfLines={1}>{finishers[i] ?? (row.custom ? "" : `${row.percent}%`)}</Text>
                  <Text style={styles.payAmt}>{money(row.amount)}</Text>
                </View>
              ))}
              <Text style={styles.hint}>Side pot payouts are based only on players who entered the Side Pot.</Text>
            </View>
          );
        })}
      </View>
    );
  };

  const renderSummary = () => {
    const alive = chip.entries.filter((e) => e.status !== "eliminated" && enteredField(e));
    const out = chip.entries.filter((e) => e.status === "eliminated");
    const winner = chip.winnerId ? entryById(chip.winnerId) : alive.length === 1 ? alive[0] : null;
    const d = dashboard(chip);
    const durs = chip.matches.filter((m) => m.endedAt).map((m) => new Date(m.endedAt as string).getTime() - new Date(m.startedAt).getTime()).filter((x) => x > 0);
    const fastest = durs.length ? Math.min(...durs) : null;
    const checkedIn = chip.entries.filter((e) => e.checkedIn).length;
    // Field-entrant basis for the recap's entry-fee math (see renderPayouts) — matches the
    // Review/setup pool; excludes paid-but-not-Ready entries that never entered the field.
    const paidCount = chip.entries.filter(enteredField).length;
    const totalChipChanges = chip.entries.reduce((s, e) => s + e.losses, 0);
    const tablesAdded = chip.events.filter((e) => e.type === "table_added").length;
    const tablesRemoved = chip.events.filter((e) => e.type === "table_removed").length;
    const entryFee = Number(tournament.entry_fee) || 0;
    const addedMoney = Number(tournament.added_money) || 0;
    const entryFees = entryFee * paidCount;
    const sidePots = tournament.side_pots ?? [];
    const gross = entryFees + addedMoney;
    // Performers
    const byWins = [...chip.entries].sort((a, b) => b.wins - a.wins);
    const byStreak = [...chip.entries].sort((a, b) => (b.bestStreak ?? 0) - (a.bestStreak ?? 0));
    const byChips = [...chip.entries].sort((a, b) => b.chips - a.chips || b.wins - a.wins);
    const bestFargo = [...chip.entries]
      .filter((e) => e.wins + e.losses >= 3)
      .sort((a, b) => (b.wins / Math.max(1, b.wins + b.losses)) - (a.wins / Math.max(1, a.wins + a.losses)))[0];
    // Standings: living by chips, then eliminated by most-recent elimination.
    const standings = [
      ...alive.sort((a, b) => b.chips - a.chips || b.wins - a.wins),
      ...out.sort((a, b) => new Date(b.eliminatedAt ?? 0).getTime() - new Date(a.eliminatedAt ?? 0).getTime()),
    ];
    return (
      <View>
        <Text style={styles.sumHeader}>{tournament.name || "Chip Tournament"}</Text>
        <Text style={styles.sumSubHeader}>Official Tournament Recap</Text>

        <SumGroup
          title="TOURNAMENT"
          rows={[
            ["Name", tournament.name || "—"],
            ["Date", tournament.tournament_date ? String(tournament.tournament_date) : "—"],
            ["Venue", tournament.venues?.venue ?? "—"],
            ["Format", `${doubles ? "Scotch Doubles" : "Singles"} · Winner-Stays Chips`],
            ["Buy-Backs", chip.settings.buyBacksAllowed ? "Allowed" : "Off"],
            ["Tables Used", String(chip.tables.length)],
          ]}
        />

        <SumGroup
          title="ATTENDANCE"
          rows={[
            [`Registered ${doubles ? "Teams" : "Players"}`, String(chip.entries.length)],
            ["Checked In", String(checkedIn)],
            ["Remaining", String(alive.length)],
            ["Eliminated", String(out.length)],
            ["Winner", winner ? teamName(winner) : "—"],
          ]}
        />

        <SumGroup
          title="FINANCIAL"
          rows={[
            ["Entry Fees", `$${entryFees}`],
            ["Added Money", `$${addedMoney}`],
            ["Side Pots", sidePots.length ? sidePots.map((p) => p.name).join(", ") : "—"],
            ["Gross Collected", `$${gross}`],
            ["Total Paid Out", "—"],
            ["Remaining Balance", "—"],
          ]}
        />

        <SumGroup
          title="TOURNAMENT STATISTICS"
          rows={[
            ["Matches Played", String(d.matchesPlayed)],
            ["Average Match", d.avgMatchMs ? fmtClock(d.avgMatchMs) : "—"],
            ["Fastest Match", fastest != null ? fmtClock(fastest) : "—"],
            ["Longest Match", d.longestMatchMs ? fmtClock(d.longestMatchMs) : "—"],
            ["Reshuffles", String(chip.reshuffleCount ?? 0)],
            ["Chip Changes", String(totalChipChanges)],
            ["Tables Added", String(tablesAdded)],
            ["Tables Removed", String(tablesRemoved)],
          ]}
        />

        <SumGroup
          title="TOP PERFORMERS"
          rows={[
            ["Chip Leader", winner ? teamName(winner) : byChips[0] ? `${teamName(byChips[0])} (${byChips[0].chips})` : "—"],
            ["Most Wins", byWins[0] && byWins[0].wins > 0 ? `${teamName(byWins[0])} (${byWins[0].wins})` : "—"],
            ["Longest Win Streak", byStreak[0] && (byStreak[0].bestStreak ?? 0) > 0 ? `${teamName(byStreak[0])} (${byStreak[0].bestStreak})` : "—"],
            ["Highest Fargo Performance", bestFargo ? teamName(bestFargo) : "—"],
          ]}
        />

        <View style={styles.sumGroup}>
          <Text style={styles.sumGroupTitle}>FINAL STANDINGS</Text>
          {standings.slice(0, resultsStandingsExpanded ? standings.length : 5).map((e, i) => (
            <TouchableOpacity key={e.id} style={[styles.sumRow, i > 0 && styles.sumRowDiv]} onPress={() => setProfileId(e.id)} activeOpacity={0.7}>
              <Text style={styles.sumMedal}>{i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : ordSuffix(i + 1)}</Text>
              <Text style={styles.sumStandName} numberOfLines={1}>{shortTeam(e)}</Text>
              <Text style={styles.sumRecord}>{e.wins}-{e.losses}</Text>
            </TouchableOpacity>
          ))}
          {standings.length > 5 && (
            <TouchableOpacity style={styles.sumStandToggle} onPress={() => setResultsStandingsExpanded((v) => !v)} activeOpacity={0.7}>
              <Text style={styles.sumStandToggleText}>{resultsStandingsExpanded ? "Hide Full Standings" : "View Full Standings"}</Text>
              <Ionicons name={resultsStandingsExpanded ? "chevron-up" : "chevron-down"} size={webMs(15)} color={COLORS.primary} />
            </TouchableOpacity>
          )}
        </View>

        <TouchableOpacity style={styles.exportBtn} onPress={() => Alert.alert("Export PDF", "Exporting the official tournament report as a PDF is coming soon.")}>
          <Text style={styles.exportBtnText}>📄 Export PDF</Text>
        </TouchableOpacity>
      </View>
    );
  };

  // ── Phase nav model (Setup / Live / Results dropdown buttons) ─────────────────
  const started = vm.phase === "live" || vm.phase === "results";
  const finished = vm.phase === "results";
  const mkPages = (keys: string[]) => keys.map((k) => ({ key: k, label: k, glyph: "○" }));
  const phases: PhaseNavPhase[] = [
    {
      key: "setup",
      label: "Setup",
      glyph: started ? "✓" : "●",
      state: started ? "done" : "current",
      locked: false,
      pages: mkPages(SETUP_PAGES),
    },
    {
      key: "live",
      label: "Live",
      glyph: vm.phase === "live" ? "⏺" : finished ? "✓" : "🔒",
      state: vm.phase === "live" ? "live" : finished ? "done" : "locked",
      locked: !started,
      pages: mkPages(LIVE_PAGES),
    },
    {
      key: "results",
      label: "Results",
      glyph: finished ? "✓" : started ? "●" : "🔒",
      state: finished ? "done" : started ? "current" : "locked",
      locked: !started,
      pages: mkPages(RESULTS_PAGES),
    },
  ];

  const content = () => {
    if (embedded) {
      switch (embeddedPage) {
        case "tables": return renderTablesSetup();
        case "review": return renderReview();
        case "live-dashboard": return renderLiveDashboard();
        case "live-tables": return renderLiveTables();
        case "live-queue": return renderLiveQueue();
        case "live-players": return renderLivePlayers();
        case "standings": return renderStandings();
        case "payouts": return renderPayouts();
        case "history": return renderHistory();
        case "summary": return renderSummary();
        default: return renderPlayersSetup();
      }
    }
    if (selectedPhase === "setup") {
      if (page === "Tables") return renderTablesSetup();
      if (page === "Review") return renderReview();
      return renderPlayersSetup();
    }
    if (selectedPhase === "live") {
      if (page === "Dashboard") return renderLiveDashboard();
      if (page === "Queue") return renderLiveQueue();
      if (page === "Players") return renderLivePlayers();
      return renderLiveTables();
    }
    if (page === "Payouts") return renderPayouts();
    if (page === "History") return renderHistory();
    if (page === "Summary") return renderSummary();
    return renderStandings();
  };

  // The two overlays (player picker + Fargo confirm) render in both modes.
  // Singles duplicate detection at point-of-selection: players.id is primary (covers
  // PENDING players, who have no id_auto); id_auto is the compatibility fallback for
  // older rows that only carry p1_profile_id. Plain compute (not a hook — this runs
  // after the loading early-return) over a small entries list.
  const isSinglesPlayerEntered = (r: PlayerSearchResult): boolean => {
    for (const e of chip.entries) {
      if (e.p1PlayerId === r.player_id || e.p2PlayerId === r.player_id) return true;
      if (r.id_auto != null && (e.p1ProfileId === r.id_auto || e.p2ProfileId === r.id_auto)) {
        return true;
      }
    }
    return false;
  };

  // Shuffle setup modal + cosmetic animation — rendered ONCE here (in `modals`) so a
  // single instance overlays EVERY live page. Both the Dashboard controls and the
  // Tables toolbar open this exact modal via openShuffleModal; confirmShuffle is the
  // ONLY path that calls beginShuffle.
  const shuffleModalActiveTables = chip.tables.filter((t) => !t.inactive);
  const shuffleRemoveCount = shuffleRemoveIds.size;
  const shuffleRemovedLabels = shuffleModalActiveTables
    .filter((t) => shuffleRemoveIds.has(t.id))
    .map((t) => t.label)
    .join(", ");
  // Fresh, per-open recommendation from the CURRENT field remaining (never a stale
  // value from a prior attempt) — guidance only; the TD still picks exact tables.
  const shuffleRecommended = recommendedActiveTables(dashboard(chip).playersRemaining);
  const shuffleTablesAfter = shuffleModalActiveTables.length - shuffleRemoveCount;
  // Hard safety guard: never remove the last table while players are still active.
  const shuffleHasActivePlayers = chip.entries.some((e) => e.status !== "eliminated" && enteredField(e));
  const shuffleWouldStrand = shuffleHasActivePlayers && shuffleTablesAfter < 1;
  // ONE Modal for the whole flow — its content swaps from the setup sheet to the
  // animation (never two Modals racing to present/dismiss on iOS). Visible while
  // either the setup is open OR the animation is playing; confirm flips setup→anim in
  // one tick (modal stays mounted), and onShuffleAnimDone closes it + routes.
  const shuffleFlowEl = (
    <Modal
      visible={shuffleModalOpen || shuffleAnimating}
      transparent
      animationType="fade"
      onRequestClose={() => { if (!shuffleAnimating) closeShuffleModal(); }}
    >
      {shuffleAnimating ? (
        <View style={styles.shufAnimBackdrop}>
          <ShuffleBallsAnimation onDone={onShuffleAnimDone} />
        </View>
      ) : (
        <View style={styles.centerRoot}>
          <Pressable style={styles.centerDim} onPress={closeShuffleModal} />
          <View style={styles.centerCard}>
            <Text style={styles.sheetTitle}>Shuffle</Text>
            <Text style={styles.shufMSub}>Shuffle the field for the next round.</Text>
            <View style={styles.shufMMetaRow}>
              <Text style={styles.shufMMeta}>Active Tables: {shuffleModalActiveTables.length}</Text>
              <Text style={styles.shufMRec}>Recommended after shuffle: {shuffleRecommended}</Text>
            </View>
            <Text style={styles.shufMSection}>Reduce tables for play after the shuffle?</Text>
            <Text style={styles.shufMHint}>Select any tables you want removed from active rotation.</Text>
            <ScrollView style={styles.reduceList} keyboardShouldPersistTaps="handled">
              {shuffleModalActiveTables.map((t) => {
                const on = shuffleRemoveIds.has(t.id);
                const stat = tableStatus(t);
                const isLiveMatch = stat === "playing";
                const stream = t.isStream || !!t.streamUrl;
                return (
                  <TouchableOpacity key={t.id} style={styles.reduceRow} onPress={() => selectRemoveTable(t)} activeOpacity={0.7}>
                    <View style={[styles.potCheckbox, on && styles.potCheckboxOn]}>
                      {on && <Text style={styles.potCheckMark}>✓</Text>}
                    </View>
                    <Text style={styles.reduceName} numberOfLines={1}>{t.label}</Text>
                    {stream && <Text style={styles.shufMStream} numberOfLines={1}>🔴 Stream</Text>}
                    <Text style={[styles.reduceStat, { color: on ? COLORS.warning : STATUS_TAG[stat].color }]} numberOfLines={1}>
                      {on ? (isLiveMatch ? "Removing after match" : "Removing immediately") : STATUS_TAG[stat].label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <View style={styles.shufMSummary}>
              {shuffleRemoveCount === 0 ? (
                <Text style={styles.shufMSummaryText}>Keeping all {shuffleModalActiveTables.length} table{shuffleModalActiveTables.length === 1 ? "" : "s"}</Text>
              ) : (
                <>
                  <Text style={styles.shufMSummaryText}>{shuffleModalActiveTables.length} active tables → {Math.max(0, shuffleTablesAfter)} after shuffle</Text>
                  <Text style={styles.shufMSummaryRemoving} numberOfLines={2}>Removing: {shuffleRemovedLabels}</Text>
                </>
              )}
              {shuffleWouldStrand && (
                <Text style={styles.shufMWarn}>At least one table must remain while players are still active.</Text>
              )}
            </View>
            <View style={styles.sheetBtns}>
              <TouchableOpacity style={styles.sheetCancel} onPress={closeShuffleModal}>
                <Text style={styles.sheetCancelText} numberOfLines={1}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.sheetAdd, shuffleWouldStrand && styles.btnDisabledLite]}
                onPress={confirmShuffle}
                disabled={shuffleWouldStrand}
              >
                <Text style={styles.sheetAddText} numberOfLines={1}>Shuffle</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
    </Modal>
  );

  const modals = (
    <>
      {shuffleFlowEl}
      {/* Phase 5: ONE unified search-first Add flow for BOTH formats (ACTIVE+PENDING,
          inline Create, inline Fargo). Doubles → Add Team (tournament_teams). Singles →
          Add Player directly into chip_entries via onAddSingles (players.id identity),
          NOT a tournament_players registration. Replaces the legacy picker + Fargo popup
          for singles too; the legacy picker below now only serves the doubles "Add
          Player 2" fallback for a team that has no teamId yet. */}
      <UnifiedRegisterModal
        visible={unifiedOpen != null || editPlayerId != null}
        onClose={() => {
          setUnifiedOpen(null);
          setEditPlayerId(null);
        }}
        tournamentId={id}
        mode={doubles ? "doubles" : "singles"}
        resumeTeam={editPlayerId ? null : unifiedOpen?.resumeTeam ?? null}
        editPlayer={editPlayerId ? { playerId: editPlayerId } : null}
        computeChips={(f1, f2) =>
          chipsForFargo(chip.settings.tiers, doubles ? (f1 ?? 0) + (f2 ?? 0) : f1 ?? 0)
        }
        entryFee={Number(tournament?.entry_fee) || 0}
        sidePots={tournamentSidePots}
        maxFargo={maxFargo}
        onTeamSaved={() => {
          setUnifiedOpen(null);
          vm.reload();
        }}
        onAddSingles={
          doubles
            ? undefined
            : async (player, fargo, paidSidePots, paidEntry) => {
                // Add straight to chip_entries. Store BOTH identities: players.id
                // (always) + id_auto (active only; null for pending). vm.addEntry has a
                // final duplicate guard. Modal stays open + resets so the TD adds more.
                // paidSidePots = side pots entered (membership); paid = entry fee
                // collected. Ready (checkedIn) uses the SAME gates as the card: payment
                // satisfied + Fargo present + NOT over the Fargo cap. An over-cap player is
                // added as Registered and must go through the override flow to be Ready.
                const ready =
                  readyGate({ paid: paidEntry, entryFeeRequired, hardBlocker: fargo == null }) &&
                  !isFargoOverCap(fargo, maxFargo);
                vm.addEntry({
                  p1Name: player.display_name,
                  p1ProfileId: player.id_auto ?? null,
                  p1PlayerId: player.player_id,
                  p1Fargo: fargo,
                  paidSidePots,
                  paid: paidEntry,
                  checkedIn: ready,
                });
                // A TD-entered Fargo is trusted → promote it to the player's global
                // verified rating. Non-blocking + retryable: the player is already on
                // the roster, so on failure we surface a clear warning rather than
                // duplicating the player or rolling the entry back.
                if (fargo != null) {
                  try {
                    await playerRegistrationService.verifyPlayerFargo(id, player.player_id, fargo);
                  } catch {
                    Alert.alert(
                      "Fargo not verified",
                      "Player added, but the Fargo verification could not be saved. Retry verification from the player card.",
                    );
                  }
                }
              }
        }
        isPlayerEntered={doubles ? undefined : isSinglesPlayerEntered}
        onEdited={(playerId, displayName) => {
          setEditPlayerId(null);
          if (doubles) {
            // Doubles: pending member name is resolved from the DB roster RPC on reload.
            vm.reload();
          } else if (displayName) {
            // Singles: chip_entries.p1_name is denormalized — resync it in place so the
            // roster shows the new name immediately (auto-save persists it).
            const ent = chip.entries.find(
              (e) => e.p1PlayerId === playerId || e.p2PlayerId === playerId,
            );
            if (ent) {
              vm.updateEntry(
                ent.id,
                ent.p1PlayerId === playerId ? { p1Name: displayName } : { p2Name: displayName },
              );
            }
          }
        }}
      />


      <Modal
        visible={picker != null}
        transparent
        animationType="slide"
        onRequestClose={() => {
          setPicker(null);
          playerSearch.reset();
        }}
      >
        <View style={styles.sheetRoot}>
          <Pressable
            style={styles.sheetDismiss}
            onPress={() => {
              setPicker(null);
              playerSearch.reset();
            }}
          />
          <Animated.View
            style={[styles.sheet, { bottom: Animated.add(kbHeight, SHEET_KB_GAP) }]}
          >
            <View style={styles.sheetHandle} />
              <Text style={styles.sheetTitle}>
                {picker?.mode === "partner" ? "Add Player 2" : doubles ? "Add Player 1" : "Add Player"}
              </Text>
              <TextInput
                allowFontScaling={false}
                style={styles.sheetSearch}
                value={playerSearch.query}
                onChangeText={playerSearch.setQuery}
                placeholder="Search name, @username, or ID…"
                placeholderTextColor={COLORS.textMuted}
                autoFocus
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="search"
              />
              {playerSearch.query.trim().length < 2 ? (
                <Text style={styles.sheetPrompt}>
                  Start typing to search for a {picker?.mode === "partner" ? "partner" : "player"}.
                </Text>
              ) : (
                <ScrollView style={styles.sheetResults} keyboardShouldPersistTaps="handled" keyboardDismissMode="none">
                  {playerSearch.isSearching && (
                    <ActivityIndicator color={COLORS.primary} style={{ marginVertical: 10 }} />
                  )}
                  {playerSearch.results.map((p) => (
                    <TouchableOpacity key={p.id_auto} style={styles.pickerRow} onPress={() => onPickProfile(p)}>
                      <Text style={styles.pickerName} numberOfLines={2}>{profileName(p)}</Text>
                      <Text style={styles.pickerMeta}>
                        <Text style={styles.pickerUser}>@{p.user_name}</Text> · <Text style={styles.pickerId}>#{p.id_auto}</Text>
                      </Text>
                    </TouchableOpacity>
                  ))}
                  {!playerSearch.isSearching && playerSearch.results.length === 0 && (
                    <Text style={styles.hint}>No players found.</Text>
                  )}
                </ScrollView>
              )}
          </Animated.View>
        </View>
      </Modal>

      <Modal
        visible={approve != null}
        transparent
        animationType="fade"
        onRequestClose={() => setApprove(null)}
      >
        <Pressable style={styles.pickerBackdrop} onPress={() => !approving && setApprove(null)}>
          <Pressable style={styles.pickerCard} onPress={() => {}}>
            <Text style={styles.pickerTitle}>{approve?.kind === "member" ? "Confirm Fargo" : "Approve player"}</Text>
            {approve && <Text style={styles.approveName}>{approve.name}</Text>}
            <Text style={styles.approveHelp}>
              Confirm this player&apos;s Fargo. It becomes their verified profile rating
              and the Fargo recorded for this tournament.
            </Text>
            <Text style={styles.approveFargoLabel}>Confirmed Fargo</Text>
            <TextInput
              allowFontScaling={false}
              style={styles.pickerInput}
              value={approveFargo}
              onChangeText={(v) => setApproveFargo(v.replace(/\D/g, ""))}
              keyboardType="number-pad"
              placeholder="e.g. 500"
              placeholderTextColor={COLORS.textMuted}
              maxLength={4}
              autoFocus
            />
            <View style={styles.approveActions}>
              <TouchableOpacity
                style={styles.approveCancel}
                onPress={() => setApprove(null)}
                disabled={approving}
              >
                <Text style={styles.approveCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.approveConfirm, approveFargo.trim() === "" && styles.approveConfirmOff]}
                onPress={submitApprove}
                disabled={approving || approveFargo.trim() === ""}
              >
                <Text style={styles.approveConfirmText}>
                  {approving ? "Approving…" : "Approve & verify"}
                </Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Actions menu = an IN-TREE anchored popover, NOT a Modal — a Modal renders in a
          separate window and blocks the host roster ScrollView underneath. This is a
          box-none overlay (taps/scrolls pass through to the roster, which closes it via
          the content wrapper's onTouchStart and keeps scrolling); only the popover
          itself captures touches. Positioned in the screen-root's coord space
          (window rect − root origin). Opens below the button with room, else above. */}
      {menuEntryId != null && menuAnchor != null && (() => {
        const e = entryById(menuEntryId);
        if (!e) return null;
        const MENU_W = webSc(210);
        const ITEM_H = webSc(48);
        const GAP = 6;
        const MARGIN = webSc(12);
        const extra =
          (e.isTeam && e.teamId != null && e.teamApproved ? 1 : 0) +
          (e.teamLocked && e.teamId != null ? 1 : 0);
        const estH = (4 + extra) * ITEM_H + webSc(8); // Edit, Pay, Check In, Remove + extras
        const spaceBelow = winH - (menuAnchor.y + menuAnchor.height);
        const openBelow = spaceBelow >= estH + GAP + MARGIN;
        const topWin = openBelow
          ? menuAnchor.y + menuAnchor.height + GAP
          : Math.max(MARGIN, menuAnchor.y - estH - GAP);
        const leftWin = Math.min(Math.max(menuAnchor.x, MARGIN), winW - MENU_W - MARGIN);
        return (
          <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
            <View style={[styles.popover, { top: topWin - menuRoot.y, left: leftWin - menuRoot.x, width: MENU_W }]}>
              <TouchableOpacity style={styles.menuItem} onPress={() => { setEditEntryId(e.id); closeMenu(); }}>
                <Text style={styles.menuItemText}>Edit {e.isTeam ? "Team" : "Player"}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.menuItem} onPress={() => { closeMenu(); confirmTogglePaid(e); }}>
                <Text style={styles.menuItemText}>{e.paid ? "Mark Unpaid" : "Mark Paid"}</Text>
              </TouchableOpacity>
              {lifecyclePhase === "setup" && entryState(e) === "ready" ? (
                <TouchableOpacity style={styles.menuItem} onPress={() => { closeMenu(); confirmMakeUnready(e); }}>
                  <Text style={styles.menuItemText}>Make Unready</Text>
                </TouchableOpacity>
              ) : lifecyclePhase === "setup" && entryState(e) !== "waiting" ? (
                <TouchableOpacity style={styles.menuItem} onPress={() => { closeMenu(); markReady(e); }}>
                  <Text style={styles.menuItemText}>Mark Ready</Text>
                </TouchableOpacity>
              ) : null}
              {e.isTeam && e.teamId != null && e.teamApproved && (
                <TouchableOpacity style={styles.menuItem} onPress={() => { vm.approveTeam(e.teamId as number, false); closeMenu(); }}>
                  <Text style={styles.menuItemText}>Unlock Fargo</Text>
                </TouchableOpacity>
              )}
              {e.teamLocked && e.teamId != null && (
                <TouchableOpacity style={styles.menuItem} onPress={() => { vm.unlockTeam(e.teamId as number); closeMenu(); }}>
                  <Text style={styles.menuItemText}>Unlock Registration</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[styles.menuItem, styles.menuItemLast]}
                onPress={() => { closeMenu(); confirmRemovePlayer(e); }}
              >
                <Text style={[styles.menuItemText, styles.menuItemDanger]}>Remove {e.isTeam ? "Team" : "Player"}</Text>
              </TouchableOpacity>
            </View>
          </View>
        );
      })()}

      <Modal
        visible={statusMenuOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setStatusMenuOpen(false)}
      >
        <Pressable style={styles.menuBackdrop} onPress={() => setStatusMenuOpen(false)}>
          <Pressable style={styles.menuCard} onPress={() => {}}>
            {(["all", "prereg", "registered", "ready", "no_show"] as const).map((key) => (
              <TouchableOpacity
                key={key}
                style={styles.menuItem}
                onPress={() => { setRosterFilter(key); setStatusMenuOpen(false); }}
              >
                <Text style={[styles.menuItemText, rosterFilter === key && styles.menuItemOn]}>
                  {rosterFilter === key ? "✓  " : ""}
                  {STATUS_LABELS[key]}
                </Text>
              </TouchableOpacity>
            ))}
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={sortMenuOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setSortMenuOpen(false)}
      >
        <Pressable style={styles.menuBackdrop} onPress={() => setSortMenuOpen(false)}>
          <Pressable style={styles.menuCard} onPress={() => {}}>
            {(["default", "status", "name", "fargoDesc", "fargoAsc", "chipsDesc", "recent"] as const).map((key) => (
              <TouchableOpacity
                key={key}
                style={styles.menuItem}
                onPress={() => { setRosterSort(key); setSortMenuOpen(false); }}
              >
                <Text style={[styles.menuItemText, rosterSort === key && styles.menuItemOn]}>
                  {rosterSort === key ? "✓  " : ""}
                  {SORT_LABELS[key]}
                </Text>
              </TouchableOpacity>
            ))}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Fargo cap — "Allow over cap?" confirm (from Mark Ready on an over-cap entry). */}
      <Modal visible={capConfirm != null} transparent animationType="fade" onRequestClose={() => setCapConfirm(null)}>
        <Pressable style={styles.capBackdrop} onPress={() => setCapConfirm(null)}>
          <Pressable style={styles.pickerCard} onPress={() => {}}>
            {(() => {
              const e = entryById(capConfirm?.entryId);
              if (!e) return null;
              return (
                <>
                  <Text style={styles.pickerTitle}>Allow Player Over Fargo Cap?</Text>
                  <Text style={styles.capBody}>{shortTeam(e)} has a Fargo rating of {ratingForCap(e)}.</Text>
                  <View style={styles.capStatRow}><Text style={styles.capStatLabel}>Tournament Maximum</Text><Text style={styles.capStatVal}>{maxFargo}</Text></View>
                  <View style={styles.capStatRow}><Text style={styles.capStatLabel}>Over Cap By</Text><Text style={[styles.capStatVal, { color: COLORS.warning }]}>{overByOf(e)}</Text></View>
                  <Text style={styles.capNote}>This {doubles ? "team" : "player"} exceeds the tournament Fargo limit.</Text>
                  <View style={styles.capBtnRow}>
                    <TouchableOpacity style={styles.capCancel} onPress={() => setCapConfirm(null)}><Text numberOfLines={1} style={styles.capCancelText}>Cancel</Text></TouchableOpacity>
                    <TouchableOpacity style={styles.capPrimary} onPress={() => { setCapReasonChoice("Point Cushion"); setCapReasonNotes(""); setCapReason({ entryId: e.id }); setCapConfirm(null); }}><Text numberOfLines={1} style={styles.capPrimaryText}>Allow Anyway</Text></TouchableOpacity>
                  </View>
                </>
              );
            })()}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Fargo cap — a Ready entry's rating/cap moved past its override: resolve. */}
      <Modal visible={capResolve != null} transparent animationType="fade" onRequestClose={() => setCapResolve(null)}>
        <Pressable style={styles.capCenterBackdrop} onPress={() => setCapResolve(null)}>
          <Pressable style={styles.pickerCard} onPress={() => {}}>
            {(() => {
              const e = entryById(capResolve?.entryId);
              if (!e) return null;
              return (
                <>
                  <Text style={styles.pickerTitle}>Fargo Now Over the Cap</Text>
                  <Text style={styles.capBody}>{shortTeam(e)} is now {ratingForCap(e)}, which is {overByOf(e)} above the tournament maximum of {maxFargo}. This {doubles ? "team" : "player"} is currently Ready.</Text>
                  <View style={styles.capBtnRow}>
                    <TouchableOpacity style={styles.capDanger} onPress={() => { setCapResolve(null); confirmRemovePlayer(e); }}><Text numberOfLines={1} style={styles.capDangerText}>Remove {e.isTeam ? "Team" : "Player"}</Text></TouchableOpacity>
                    <TouchableOpacity style={styles.capPrimary} onPress={() => { setCapReasonChoice(e.fargoCapOverrideReason ?? "Point Cushion"); setCapReasonNotes(e.fargoCapOverrideNotes ?? ""); setCapReason({ entryId: e.id }); setCapResolve(null); }}><Text numberOfLines={1} style={styles.capPrimaryText}>Allow Override</Text></TouchableOpacity>
                  </View>
                </>
              );
            })()}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Fargo cap — reason (single-select dropdown + optional notes) then apply + Ready. */}
      <Modal visible={capReason != null} transparent animationType="fade" onRequestClose={() => { setCapReasonMenuOpen(false); setCapReason(null); }}>
        <Pressable style={styles.capBackdrop} onPress={() => { setCapReasonMenuOpen(false); setCapReason(null); }}>
          <Pressable style={styles.pickerCard} onPress={() => setCapReasonMenuOpen(false)}>
            {(() => {
              const e = entryById(capReason?.entryId);
              if (!e) return null;
              return (
                <>
                  <Text style={styles.pickerTitle}>Reason for Override</Text>
                  <Text style={styles.capNotesLabel}>Reason</Text>
                  <TouchableOpacity style={styles.capSelect} onPress={() => setCapReasonMenuOpen((o) => !o)} activeOpacity={0.8}>
                    <Text style={styles.capSelectText}>{capReasonChoice}</Text>
                    <Text style={styles.capSelectChevron}>▾</Text>
                  </TouchableOpacity>
                  {capReasonMenuOpen && (
                    <View style={styles.capSelectMenu}>
                      {["Point Cushion", "Local Rule", "Rating Adjustment", "Other"].map((r, i) => (
                        <TouchableOpacity
                          key={r}
                          style={[styles.capSelectOption, i > 0 && styles.capSelectOptionDiv]}
                          onPress={() => { setCapReasonChoice(r); setCapReasonMenuOpen(false); }}
                        >
                          <Text style={[styles.capSelectOptionText, capReasonChoice === r && styles.capSelectOptionTextOn]}>{r}</Text>
                          {capReasonChoice === r ? <Text style={styles.capSelectCheck}>✓</Text> : null}
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                  <Text style={styles.capNotesLabel}>Notes (optional)</Text>
                  <TextInput
                    allowFontScaling={false}
                    style={styles.capNotesInput}
                    value={capReasonNotes}
                    onChangeText={setCapReasonNotes}
                    placeholder="e.g. house rule, agreed cushion…"
                    placeholderTextColor={COLORS.textMuted}
                    onFocus={() => setCapReasonMenuOpen(false)}
                    multiline
                  />
                  <View style={styles.capBtnRow}>
                    <TouchableOpacity style={styles.capCancel} onPress={() => { setCapReasonMenuOpen(false); setCapReason(null); }}><Text numberOfLines={1} style={styles.capCancelText}>Cancel</Text></TouchableOpacity>
                    <TouchableOpacity style={styles.capPrimary} onPress={() => { void applyOverrideAndReady(e, capReasonChoice, capReasonNotes); setCapReasonMenuOpen(false); setCapReason(null); }}><Text numberOfLines={1} style={styles.capPrimaryText}>Confirm</Text></TouchableOpacity>
                  </View>
                </>
              );
            })()}
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={addFargo != null}
        transparent
        animationType="fade"
        onRequestClose={() => setAddFargo(null)}
      >
        <Pressable style={styles.pickerBackdrop} onPress={() => setAddFargo(null)}>
          <Pressable style={styles.pickerCard} onPress={() => {}}>
            <Text style={styles.pickerTitle}>{addFargo?.mode === "partner" ? "Add Player 2" : doubles ? "Add Player 1" : "Add Player"}</Text>
            {addFargo && <Text style={styles.approveName}>{profileName(addFargo.player)}</Text>}
            <Text style={styles.approveHelp}>Enter their Fargo. You can Verify it after adding.</Text>
            <Text style={styles.approveFargoLabel}>Fargo</Text>
            <TextInput
              allowFontScaling={false}
              style={styles.pickerInput}
              value={addFargoVal}
              onChangeText={(v) => setAddFargoVal(v.replace(/\D/g, ""))}
              keyboardType="number-pad"
              placeholder="e.g. 500"
              placeholderTextColor={COLORS.textMuted}
              maxLength={4}
              autoFocus
            />
            <View style={styles.approveActions}>
              <TouchableOpacity style={styles.approveCancel} onPress={() => setAddFargo(null)}>
                <Text style={styles.approveCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.approveConfirm} onPress={submitAddFargo}>
                <Text style={styles.approveConfirmText}>Add Player</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Rename Table */}
      <Modal
        visible={renameTbl != null}
        transparent
        animationType="fade"
        onRequestClose={() => setRenameTbl(null)}
      >
        <Pressable style={styles.pickerBackdrop} onPress={() => setRenameTbl(null)}>
          <Pressable style={styles.pickerCard} onPress={() => {}}>
            <Text style={styles.renameTitle}>Rename Table</Text>
            <TextInput
              allowFontScaling={false}
              style={styles.renameInput}
              value={renameVal}
              onChangeText={setRenameVal}
              placeholder="e.g. Diamond 1, Front Table, VIP Table"
              placeholderTextColor={COLORS.textMuted}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={saveRename}
            />
            <View style={styles.renameBtns}>
              <TouchableOpacity style={styles.renameCancel} onPress={() => setRenameTbl(null)}>
                <Text style={styles.renameCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.renameSave} onPress={saveRename}>
                <Text style={styles.renameSaveText}>Save</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Stream link (live tables) — enable a stream + paste the URL */}
      <Modal visible={streamLinkId != null} transparent animationType="fade" onRequestClose={() => setStreamLinkId(null)}>
        <Pressable style={styles.pickerBackdrop} onPress={() => setStreamLinkId(null)}>
          <Pressable style={styles.pickerCard} onPress={() => {}}>
            <Text style={styles.renameTitle}>
              {chip.tables.find((x) => x.id === streamLinkId)?.label ?? "Table"} · Stream Link
            </Text>
            <Text style={styles.reduceHint}>Paste the live stream URL for this table. Leaving it blank turns streaming off.</Text>
            <TextInput
              allowFontScaling={false}
              style={styles.renameInput}
              value={streamLinkVal}
              onChangeText={setStreamLinkVal}
              placeholder="e.g. twitch.tv/yourchannel"
              placeholderTextColor={COLORS.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              autoFocus
              returnKeyType="done"
              onSubmitEditing={saveStreamLink}
            />
            <View style={styles.renameBtns}>
              <TouchableOpacity style={styles.renameCancel} onPress={() => setStreamLinkId(null)}>
                <Text style={styles.renameCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.renameSave} onPress={saveStreamLink}>
                <Text style={styles.renameSaveText}>Save</Text>
              </TouchableOpacity>
            </View>
            {chip.tables.find((x) => x.id === streamLinkId)?.isStream && (
              <TouchableOpacity style={styles.streamRemoveBtn} onPress={clearStreamLink}>
                <Text style={styles.streamRemoveText}>Turn Off Streaming</Text>
              </TouchableOpacity>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Add Tables (bulk) bottom sheet */}
      <Modal
        visible={addTblOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setAddTblOpen(false)}
      >
        <View style={styles.sheetRoot}>
          <Pressable style={styles.sheetDismiss} onPress={() => setAddTblOpen(false)} />
          <View style={[styles.addSheet, { bottom: isWeb ? SHEET_KB_GAP : kbPx }]}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Add Tables</Text>

            <View style={styles.addStepRow}>
              <Text style={styles.addStepLabel}>How many?</Text>
              <View style={styles.addStepper}>
                <TouchableOpacity style={styles.addStepBtn} onPress={() => setAddTblCount((n) => Math.max(1, n - 1))}>
                  <Text style={styles.addStepBtnText}>−</Text>
                </TouchableOpacity>
                <Text style={styles.addStepCount}>{addTblCount}</Text>
                <TouchableOpacity style={styles.addStepBtn} onPress={() => setAddTblCount((n) => Math.min(50, n + 1))}>
                  <Text style={styles.addStepBtnText}>+</Text>
                </TouchableOpacity>
              </View>
            </View>

            <Text style={[styles.addCustomLabel, { marginTop: webSc(SPACING.md) }]}>
              Custom label (optional)
            </Text>
            <TextInput
              allowFontScaling={false}
              style={[styles.addNameInput, { marginTop: webSc(SPACING.xs) }]}
              value={addTblLabel}
              onChangeText={setAddTblLabel}
              placeholder="e.g. Diamond — optional"
              placeholderTextColor={COLORS.textMuted}
              autoCapitalize="words"
              autoCorrect={false}
            />

            {(() => {
              const base = addTblLabel.trim() || "Table";
              const start = nextTableNumber(chip.tables, base);
              const shown = Array.from(
                { length: Math.min(addTblCount, 3) },
                (_, i) => `${base} ${start + i}`,
              ).join(", ");
              return (
                <Text style={styles.addPreview}>
                  Adds {shown}
                  {addTblCount > 3 ? `, … (+${addTblCount - 3} more)` : ""}
                </Text>
              );
            })()}

            <View style={styles.sheetBtns}>
              <TouchableOpacity style={styles.sheetCancel} onPress={() => setAddTblOpen(false)}>
                <Text style={styles.sheetCancelText} numberOfLines={1}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.sheetAdd} onPress={confirmAddTables}>
                <Text style={styles.sheetAddText} numberOfLines={1} adjustsFontSizeToFit>Add {addTblCount} Table{addTblCount === 1 ? "" : "s"}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Reduce tables — select which tables to close */}
      <Modal visible={reduceOpen} transparent animationType="fade" onRequestClose={() => setReduceOpen(false)}>
        <View style={styles.centerRoot}>
          <Pressable style={styles.centerDim} onPress={() => setReduceOpen(false)} />
          <View style={styles.centerCard}>
            <Text style={styles.sheetTitle}>Select tables to remove</Text>
            {(() => {
              const active = chip.tables.filter((t) => !t.inactive);
              const rec = recommendedActiveTables(dashboard(chip).playersRemaining);
              const suggest = Math.max(0, active.length - rec);
              return (
                <>
                  <Text style={styles.reduceHint}>Recommended removal: {suggest} table{suggest === 1 ? "" : "s"}</Text>
                  <ScrollView style={styles.reduceList} keyboardShouldPersistTaps="handled">
                    {active.map((t) => {
                      const stat = tableStatus(t);
                      const on = reduceSel.includes(t.id);
                      return (
                        <TouchableOpacity key={t.id} style={styles.reduceRow} onPress={() => toggleReduceSel(t.id)} activeOpacity={0.7}>
                          <View style={[styles.potCheckbox, on && styles.potCheckboxOn]}>
                            {on && <Text style={styles.potCheckMark}>✓</Text>}
                          </View>
                          <Text style={styles.reduceName}>{t.label}</Text>
                          <Text style={[styles.reduceStat, { color: STATUS_TAG[stat].color }]}>{STATUS_TAG[stat].label}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </>
              );
            })()}
            <View style={styles.sheetBtns}>
              <TouchableOpacity style={styles.sheetCancel} onPress={() => setReduceOpen(false)}>
                <Text style={styles.sheetCancelText} numberOfLines={1}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.sheetAdd, reduceSel.length === 0 && styles.btnDisabledLite]} disabled={reduceSel.length === 0} onPress={confirmReduce}>
                <Text style={styles.sheetAddText} numberOfLines={1} adjustsFontSizeToFit>Remove {reduceSel.length || 0} {reduceSel.length === 1 ? "Table" : "Tables"}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ⚡ Tournament Actions — compact command center (fixed header + footer) */}
      <Modal visible={actionsOpen} transparent animationType="fade" onRequestClose={() => setActionsOpen(false)}>
        <View style={styles.centerRoot}>
          <Pressable style={styles.centerDim} onPress={() => setActionsOpen(false)} />
          <View style={styles.actionsCard}>
            {/* Fixed header */}
            <View style={styles.actHeader}>
              <Text style={styles.actTitle}>Tournament Actions</Text>
              <TouchableOpacity style={styles.actClose} onPress={() => setActionsOpen(false)} activeOpacity={0.8} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                <Ionicons name="close" size={webMs(20)} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </View>

            {/* Scrollable action content — keyed so each open starts at the top */}
            <ScrollView key={actionsOpen ? "act-open" : "act-closed"} style={styles.actScroll} contentContainerStyle={styles.actScrollInner} showsVerticalScrollIndicator={false}>
              {(() => {
                const printDisabled = !chip.matches.some((m) => m.status !== "in_progress" && m.endedAt);
                // Lock All / Unlock All toggle over the ACTIVE (non-inactive) tables.
                const activeTbls = chip.tables.filter((t) => !t.inactive);
                const allTablesLocked = activeTbls.length > 0 && activeTbls.every((t) => t.locked);
                const openSettings = () => {
                  setActionsOpen(false);
                  if (onOpenSettings) onOpenSettings();
                  else if (router.canGoBack()) router.back();
                  else router.replace(`/(tabs)/admin/manage-tournament/${id}` as any);
                };
                type Act = { icon: string; label: string; onPress: () => void; full?: boolean; active?: boolean; badge?: string; disabled?: boolean; tint?: string };
                const sections: { title: string; items: Act[] }[] = [
                  {
                    title: "Tournament Controls",
                    items: [
                      { icon: "play-circle-outline", label: "Auto Run", full: true, onPress: () => soon("Auto Run", "Automatic table assignment, queue management, and eliminations are coming soon.") },
                      { icon: "time-outline", label: "Audit Log", onPress: () => { setActionsOpen(false); setAuditOpen(true); } },
                      { icon: "settings-outline", label: "Settings", onPress: openSettings },
                      {
                        icon: "shuffle",
                        label: "Shuffle Mode",
                        badge: chip.shuffleMode ? "ON" : "OFF",
                        active: !!chip.shuffleMode,
                        full: true,
                        onPress: () => {
                          setActionsOpen(false);
                          // Unified entry: OFF → open the setup modal (no direct enable);
                          // ON/active → disable shuffle mode (engine reseats).
                          if (chip.shuffleMode || shuffleActive) {
                            vm.setShuffleMode(false);
                          } else {
                            openShuffleModal();
                          }
                        },
                      },
                      {
                        // Pure availability toggle over all active tables — never seats /
                        // starts / cancels a match; a live table locks after its match.
                        icon: allTablesLocked ? "lock-open-outline" : "lock-closed-outline",
                        label: allTablesLocked ? "Unlock All Tables" : "Lock All Tables",
                        full: true,
                        disabled: activeTbls.length === 0,
                        onPress: () => {
                          setActionsOpen(false);
                          vm.setAllTablesLocked(!allTablesLocked, actorId);
                        },
                      },
                    ],
                  },
                  {
                    title: "Manual Adjustments",
                    items: [
                      { icon: "add-circle-outline", label: "Add Chip", onPress: () => soon("Add Chip", "Open the ⋮ menu next to a team on the Players tab to add, remove, or forfeit chips.") },
                      { icon: "remove-circle-outline", label: "Remove Chip", onPress: () => soon("Remove Chip", "Open the ⋮ menu next to a team on the Players tab to add, remove, or forfeit chips.") },
                      { icon: "arrow-undo-outline", label: "Undo Last Action", full: true, tint: COLORS.primaryLight, disabled: !vm.canUndo, onPress: () => doUndoLast(1) },
                    ],
                  },
                  {
                    title: "Utilities",
                    items: [
                      { icon: "share-outline", label: "Export", onPress: () => soon("Export Tournament", "Exporting the full tournament report is coming soon.") },
                      { icon: "print-outline", label: "Print Summary", disabled: printDisabled, onPress: () => soon("Print Summary", "Printing the official tournament summary is coming soon.") },
                    ],
                  },
                ];
                return sections.map((sec) => (
                  <View key={sec.title} style={styles.actSectionBlock}>
                    <Text style={styles.actSection}>{sec.title}</Text>
                    <View style={styles.actGrid}>
                      {sec.items.map((a) => (
                        <TouchableOpacity
                          key={a.label}
                          style={[styles.actItem, a.full && styles.actCardFull, a.active && styles.actCardActive, a.disabled && styles.actCardDisabled]}
                          onPress={a.onPress}
                          disabled={a.disabled}
                          activeOpacity={0.6}
                        >
                          <Ionicons name={a.icon as keyof typeof Ionicons.glyphMap} size={webMs(18)} color={a.disabled ? COLORS.textMuted : a.active ? COLORS.primary : a.tint ?? COLORS.textSecondary} />
                          <Text style={[styles.actCardLabel, a.active && styles.actCardLabelActive, a.tint ? { color: a.tint } : null, a.disabled && styles.actCardTextDisabled]} numberOfLines={a.badge ? 1 : 2}>{a.label}</Text>
                          {a.badge && (
                            <View style={[styles.actBadge, a.active && styles.actBadgeOn]}>
                              <Text allowFontScaling={false} style={[styles.actBadgeText, a.active && styles.actBadgeTextOn]}>{a.badge}</Text>
                            </View>
                          )}
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                ));
              })()}

              {/* Danger zone */}
              <View style={styles.actSectionBlock}>
                <Text style={styles.actSectionDanger}>Danger Zone</Text>
                <TouchableOpacity style={styles.actDanger} onPress={() => { setActionsOpen(false); confirmEndTournament(); }} activeOpacity={0.75}>
                  <Ionicons name="stop-circle-outline" size={webMs(18)} color={COLORS.error} />
                  <Text style={styles.actDangerText}>End Tournament</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>

            {/* Fixed footer — divider separates it from the scrolling content */}
            <View style={styles.actFooter}>
              <TouchableOpacity style={styles.actCancel} onPress={() => setActionsOpen(false)} activeOpacity={0.8}>
                <Text style={styles.actCancelText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Tournament Audit Log — activity timeline */}
      <Modal visible={auditOpen} transparent animationType="fade" onRequestClose={() => setAuditOpen(false)}>
        <View style={styles.centerRoot}>
          <Pressable style={styles.centerDim} onPress={() => setAuditOpen(false)} />
          <View style={styles.auditCard}>
            {/* Fixed header — title + count, Close X top-right */}
            <View style={styles.auditHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.auditTitle}>Audit Log</Text>
                <Text style={styles.auditSub}>{chip.events.length} action{chip.events.length === 1 ? "" : "s"} recorded</Text>
              </View>
              <TouchableOpacity style={styles.auditIconBtn} onPress={() => setAuditOpen(false)} activeOpacity={0.8} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                <Ionicons name="close" size={webMs(20)} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </View>

            {/* Compact controls — search, then filter + sort dropdowns */}
            <View style={styles.auditSearchRow}>
              <Ionicons name="search" size={webMs(15)} color={COLORS.textMuted} />
              <TextInput
                style={styles.auditSearchInput}
                value={auditSearch}
                onChangeText={setAuditSearch}
                placeholder="Search actions, names, tables…"
                placeholderTextColor={COLORS.textMuted}
                returnKeyType="search"
              />
              {auditSearch.length > 0 && (
                <TouchableOpacity onPress={() => setAuditSearch("")} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="close-circle" size={webMs(16)} color={COLORS.textMuted} />
                </TouchableOpacity>
              )}
            </View>
            <View style={styles.auditDropRow}>
              <TouchableOpacity style={styles.auditDrop} onPress={() => setAuditDropdown("filter")} activeOpacity={0.85}>
                <Text style={styles.auditDropText} numberOfLines={1}>
                  {AUDIT_FILTER_OPTS.find((o) => o.value === auditFilter)?.label ?? "All Actions"}
                </Text>
                <Ionicons name="chevron-down" size={webMs(15)} color={COLORS.textSecondary} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.auditDrop} onPress={() => setAuditDropdown("sort")} activeOpacity={0.85}>
                <Ionicons name="swap-vertical" size={webMs(14)} color={COLORS.textSecondary} />
                <Text style={styles.auditDropText} numberOfLines={1}>
                  {AUDIT_SORT_OPTS.find((o) => o.value === auditSort)?.label ?? "Newest"}
                </Text>
                <Ionicons name="chevron-down" size={webMs(15)} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </View>

            {/* Scrolling timeline (only this scrolls) */}
            <ScrollView
              style={styles.auditList}
              contentContainerStyle={styles.auditListInner}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              onScrollBeginDrag={() => Keyboard.dismiss()}
            >
              {chip.events.length === 0 ? (
                <Text style={styles.auditEmpty}>No actions recorded yet.</Text>
              ) : auditGroups.length === 0 ? (
                <Text style={styles.auditEmpty}>No actions match this filter.</Text>
              ) : (
                auditGroups.map((g, i) => {
                  const ev = g.rep;
                  const meta = auditMeta(ev);
                  const matchInfo = ev.type === "match_result" ? auditMatchInfo(ev) : null;
                  const detail = auditDetailLines(ev);
                  const isUndoRedo = ev.type === "undo" || ev.type === "redo";
                  const isRestore = ev.type === "restore";
                  const superseded = !!ev.superseded;
                  const p = ev.payload ?? {};
                  const last = i === auditGroups.length - 1;
                  return (
                    <View key={ev.id} style={[styles.auditRow, !last && styles.auditRowDivider, superseded && styles.auditItemDim]}>
                      {/* Icon */}
                      <View style={[styles.auditBadge, { backgroundColor: meta.color + "1A" }]}>
                        <Ionicons name={meta.icon} size={webMs(15)} color={meta.color} />
                      </View>

                      {/* Content */}
                      <View style={styles.auditBody}>
                        <View style={styles.auditBodyTop}>
                          <Text style={[styles.auditType, { color: meta.color }]} numberOfLines={1}>
                            {meta.title}{g.count > 1 ? ` (${g.count})` : ""}
                          </Text>
                          <Text style={styles.auditStampText}>{auditStamp(ev.at)}</Text>
                          <TouchableOpacity
                            style={styles.auditDots}
                            onPress={(e) => setAuditMenu({ ev, targetId: g.targetId, x: e.nativeEvent.pageX, y: e.nativeEvent.pageY })}
                            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                          >
                            <Ionicons name="ellipsis-horizontal" size={webMs(18)} color={COLORS.primaryLight} />
                          </TouchableOpacity>
                        </View>

                        {isRestore ? (
                          <View style={styles.auditDetail}>
                            <Text style={styles.auditDetailLine}>
                              Restored to {typeof p.restoredTo === "string" ? fmtRestoreStamp(p.restoredTo) : "an earlier point"}
                            </Text>
                            <Text style={styles.auditDetailLine}>
                              {(typeof p.revertedCount === "number" ? p.revertedCount : 0)} action{p.revertedCount === 1 ? "" : "s"} reverted
                            </Text>
                            {!!p.reason && <Text style={styles.auditReason}>Reason: {String(p.reason)}</Text>}
                          </View>
                        ) : matchInfo && matchInfo.winner && matchInfo.loser ? (
                          <View style={styles.auditDetail}>
                            <Text style={styles.auditDetailTeam} numberOfLines={1}>{shortTeam(matchInfo.winner)}</Text>
                            <Text style={styles.auditDef}>def.</Text>
                            <Text style={styles.auditLoser} numberOfLines={1}>{shortTeam(matchInfo.loser)}</Text>
                            {matchInfo.tableLabel && (
                              <Text style={styles.auditDetailLine}>
                                {matchInfo.tableLabel}{matchInfo.dur ? ` • ${fmtDur(matchInfo.dur)}` : ""}
                              </Text>
                            )}
                          </View>
                        ) : detail ? (
                          <View style={styles.auditDetail}>
                            {detail.team && <Text style={styles.auditDetailTeam} numberOfLines={1}>{detail.team}</Text>}
                            {detail.lines.map((ln, k) => (
                              <Text key={k} style={styles.auditDetailLine} numberOfLines={2}>{ln}</Text>
                            ))}
                          </View>
                        ) : isUndoRedo ? (
                          <View style={styles.auditDetail}>
                            <Text style={styles.auditDetailMuted}>{ev.type === "undo" ? "Reverted:" : "Restored:"}</Text>
                            <Text style={styles.auditDetailLine} numberOfLines={2}>{stripAuditPrefix(shortenAudit(ev.text))}</Text>
                          </View>
                        ) : (
                          <Text style={styles.auditDetailLine} numberOfLines={2}>{auditSystemDetail(ev)}</Text>
                        )}

                        {g.children.length > 0 && (
                          <Text style={styles.auditSummary} numberOfLines={2}>
                            {g.children.map(childPhrase).join("  •  ")}
                          </Text>
                        )}

                        {superseded && (
                          <View style={styles.auditSupersededTag}>
                            <Text style={styles.auditSupersededText}>Reverted by Tournament Restore</Text>
                          </View>
                        )}
                      </View>
                    </View>
                  );
                })
              )}
            </ScrollView>

            {/* Sticky footer — Export + Close */}
            <View style={styles.auditFooter}>
              <TouchableOpacity style={styles.auditFooterBtn} onPress={exportAudit} activeOpacity={0.85}>
                <Ionicons name="download-outline" size={webMs(16)} color={COLORS.text} />
                <Text style={styles.auditFooterText}>Export Log</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.auditFooterBtn, styles.auditFooterPrimary]} onPress={() => setAuditOpen(false)} activeOpacity={0.85}>
                <Text style={[styles.auditFooterText, styles.auditFooterPrimaryText]}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Filter / Sort dropdown menus — sibling overlays (no nested modal) */}
          {auditDropdown && (
            <Pressable style={styles.auditMenuBackdrop} onPress={() => setAuditDropdown(null)}>
              <Pressable style={styles.auditMenuCard} onPress={() => {}}>
                <Text style={styles.auditMenuHead}>{auditDropdown === "filter" ? "Filter" : "Sort By"}</Text>
                {(auditDropdown === "filter" ? AUDIT_FILTER_OPTS : AUDIT_SORT_OPTS).map((o) => {
                  const on = auditDropdown === "filter" ? auditFilter === o.value : auditSort === o.value;
                  return (
                    <TouchableOpacity
                      key={o.value}
                      style={styles.auditMenuItem}
                      onPress={() => {
                        if (auditDropdown === "filter") setAuditFilter(o.value as "All" | AuditCategory);
                        else setAuditSort(o.value as AuditSort);
                        setAuditDropdown(null);
                      }}
                    >
                      <Text style={[styles.auditMenuText, { flex: 1 }, on && { color: COLORS.primaryLight, fontWeight: "800" }]}>{o.label}</Text>
                      {on && <Ionicons name="checkmark" size={webMs(16)} color={COLORS.primaryLight} />}
                    </TouchableOpacity>
                  );
                })}
              </Pressable>
            </Pressable>
          )}

          {/* Per-row ⋯ action menu — anchored to the tapped ⋯ button, always kept
              fully on-screen (opens leftward near the right edge; lifts above the
              bottom safe area / footer; long labels wrap with the icon top-aligned) */}
          {auditMenu && (() => {
            const { ev, targetId, x, y } = auditMenu;
            const canRestore = vm.restorableEventIds.has(targetId) && !ev.superseded;
            const close = () => setAuditMenu(null);
            const win = Dimensions.get("window");
            const PAD = webSc(12);
            const SAFE_BOTTOM = webSc(48); // home-indicator + breathing room
            const MENU_W = Math.min(webSc(260), win.width - PAD * 2);
            const rows = canRestore ? 3 : 2;
            const MENU_H = rows * webSc(52) + webSc(SPACING.sm); // generous (wrapped rows)
            // Prefer opening with the menu's right edge at the tap, then clamp fully
            // inside the screen with padding on both sides.
            const left = Math.max(PAD, Math.min(x - MENU_W + webSc(16), win.width - MENU_W - PAD));
            // Open downward from the tap, but lift up if it would clip the bottom.
            const top = Math.max(PAD, Math.min(y + webSc(6), win.height - MENU_H - SAFE_BOTTOM));
            return (
              <Pressable style={styles.auditAnchorBackdrop} onPress={close}>
                <View style={[styles.auditAnchorMenu, { left, top, width: MENU_W }]}>
                  {canRestore && (
                    <TouchableOpacity style={[styles.auditMenuItem, styles.auditMenuItemTop]} onPress={() => { close(); openRestore(targetId); }} activeOpacity={0.7}>
                      <Ionicons name="arrow-undo-circle" size={webMs(16)} color={AUDIT_ORANGE} style={styles.auditMenuIcon} />
                      <Text style={[styles.auditMenuText, { color: AUDIT_ORANGE, flex: 1 }]}>Restore to This Point</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity style={[styles.auditMenuItem, styles.auditMenuItemTop]} onPress={() => { close(); setDetailEv(ev); }} activeOpacity={0.7}>
                    <Ionicons name="information-circle-outline" size={webMs(16)} color={COLORS.text} style={styles.auditMenuIcon} />
                    <Text style={[styles.auditMenuText, { flex: 1 }]}>View Details</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.auditMenuItem, styles.auditMenuItemTop]} onPress={() => { close(); copyAudit(ev); }} activeOpacity={0.7}>
                    <Ionicons name="copy-outline" size={webMs(16)} color={COLORS.text} style={styles.auditMenuIcon} />
                    <Text style={[styles.auditMenuText, { flex: 1 }]}>Copy Event</Text>
                  </TouchableOpacity>
                </View>
              </Pressable>
            );
          })()}

          {/* View Details — full breakdown of one event + its resulting changes */}
          {detailEv && (() => {
            const meta = auditMeta(detailEv);
            const fields = buildDetailFields(detailEv);
            const kids = detailEv.txId
              ? chip.events.filter((e) => e.txId === detailEv.txId && e.id !== detailEv.id)
              : [];
            return (
              <Pressable style={styles.auditMenuBackdrop} onPress={() => setDetailEv(null)}>
                <Pressable style={styles.detailCard} onPress={() => {}}>
                  <View style={styles.detailHead}>
                    <View style={[styles.auditBadge, { backgroundColor: meta.color + "1A" }]}>
                      <Ionicons name={meta.icon} size={webMs(16)} color={meta.color} />
                    </View>
                    <Text style={[styles.detailTitle, { color: meta.color }]} numberOfLines={1}>{meta.title}</Text>
                    <TouchableOpacity onPress={() => setDetailEv(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Ionicons name="close" size={webMs(20)} color={COLORS.textSecondary} />
                    </TouchableOpacity>
                  </View>
                  <ScrollView style={styles.detailList} keyboardShouldPersistTaps="handled">
                    {fields.map((f, k) => (
                      <View key={k} style={styles.detailField}>
                        <Text style={styles.detailLabel}>{f.label}</Text>
                        <Text style={styles.detailValue}>{f.value}</Text>
                      </View>
                    ))}
                    {kids.length > 0 && (
                      <View style={styles.detailField}>
                        <Text style={styles.detailLabel}>Resulting Changes</Text>
                        {kids.map((k) => (
                          <Text key={k.id} style={styles.detailChange}>• {childPhrase(k)}</Text>
                        ))}
                      </View>
                    )}
                  </ScrollView>
                  <TouchableOpacity style={styles.detailCopy} onPress={() => { copyAudit(detailEv); }} activeOpacity={0.85}>
                    <Ionicons name="copy-outline" size={webMs(15)} color={COLORS.text} />
                    <Text style={styles.detailCopyText}>Copy</Text>
                  </TouchableOpacity>
                </Pressable>
              </Pressable>
            );
          })()}

          {/* Restore Tournament — a keyboard-aware overlay INSIDE this modal (a
              second native Modal would fail to present over the Audit Log). Sits
              above the log, blocks it, and lifts its footer above the keyboard. */}
          {restoreTargetId && (
            <KeyboardAvoidingView
              style={styles.restoreRoot}
              behavior={Platform.OS === "ios" ? "padding" : undefined}
            >
              <Pressable style={styles.restoreBackdrop} onPress={closeRestore} />
              <View style={styles.restoreCard}>
            <ScrollView
              style={styles.restoreScroll}
              contentContainerStyle={styles.restoreScrollInner}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              onScrollBeginDrag={() => Keyboard.dismiss()}
              showsVerticalScrollIndicator={false}
            >
              <Text style={styles.restoreTitle}>Restore Tournament</Text>

              <View style={styles.restoreRow}>
                <View style={styles.restoreCol}>
                  <Text style={styles.restoreFieldLabel}>Return to</Text>
                  <Text style={styles.restoreValue}>{restoreMeta?.at ? fmtRestoreWhen(restoreMeta.at) : "an earlier point"}</Text>
                </View>
                <View style={styles.restoreColRight}>
                  <Text style={styles.restoreFieldLabel}>Actions</Text>
                  <Text style={styles.restoreValueBig}>{restoreMeta?.count ?? 0}</Text>
                </View>
              </View>

              <Text style={styles.restoreFieldLabel}>Reason</Text>
              <TouchableOpacity style={styles.restoreDropField} onPress={() => { Keyboard.dismiss(); setRestoreReasonOpen((o) => !o); }} activeOpacity={0.85}>
                <Text style={[styles.restoreDropText, !restoreReason && styles.restoreDropPlaceholder]} numberOfLines={1}>
                  {restoreReason ?? "Select a reason"}
                </Text>
                <Ionicons name={restoreReasonOpen ? "chevron-up" : "chevron-down"} size={webMs(15)} color={COLORS.textSecondary} />
              </TouchableOpacity>
              {restoreReasonOpen && (
                <View style={styles.restoreDropList}>
                  {RESTORE_REASONS.map((r) => {
                    const on = restoreReason === r;
                    return (
                      <TouchableOpacity key={r} style={styles.restoreDropItem} onPress={() => { setRestoreReason(r); setRestoreReasonOpen(false); }}>
                        <Text style={[styles.restoreDropItemText, on && { color: COLORS.primaryLight, fontWeight: "800" }]}>{r}</Text>
                        {on && <Ionicons name="checkmark" size={webMs(15)} color={COLORS.primaryLight} />}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}

              <Text style={styles.restoreFieldLabel}>Additional notes{restoreReason === "Other" ? " (required)" : " (optional)"}</Text>
              <TextInput
                style={styles.restoreInput}
                value={restoreNotes}
                onChangeText={setRestoreNotes}
                placeholder={restoreReason === "Other" ? "Explain what happened" : "Optional context"}
                placeholderTextColor={COLORS.textMuted}
                multiline
                blurOnSubmit
                returnKeyType="done"
                onSubmitEditing={() => Keyboard.dismiss()}
                onFocus={() => setRestoreReasonOpen(false)}
              />

              {restoreNotesMissing && (
                <Text style={styles.restoreValidation}>Additional notes are required when the reason is “Other”.</Text>
              )}
            </ScrollView>

            {/* Sticky footer — always above the keyboard */}
            <View style={styles.restoreBtns}>
              <TouchableOpacity style={styles.restoreCancel} onPress={closeRestore} activeOpacity={0.85}>
                <Text style={styles.restoreCancelText} numberOfLines={1}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.restoreConfirm, !restoreReady && styles.restoreConfirmDisabled]}
                disabled={!restoreReady}
                onPress={confirmRestore}
                activeOpacity={0.85}
              >
                <Text style={styles.restoreConfirmText} numberOfLines={1}>Restore</Text>
              </TouchableOpacity>
            </View>
              </View>
            </KeyboardAvoidingView>
          )}
        </View>
      </Modal>

      {/* Team / player Tournament Profile */}
      <Modal visible={profileId != null} transparent animationType="fade" onRequestClose={closeProfile}>
        <View style={styles.centerRoot}>
          <Pressable style={styles.centerDim} onPress={() => (profMenuOpen ? setProfMenuOpen(false) : closeProfile())} />
          <View style={styles.profCard}>
            {(() => {
              const entry = chip.entries.find((x) => x.id === profileId);
              if (!entry) return <Text style={styles.hint}>Not found.</Text>;
              const p = buildTeamProfile(entry);
              const statusMeta =
                p.status === "eliminated" ? { label: "Eliminated", color: COLORS.error }
                  : p.status === "playing" ? { label: "Playing", color: COLORS.primary }
                    : p.status === "next" ? { label: "Next Up", color: COLORS.primary }
                      : { label: "Waiting", color: COLORS.warning };
              return (
                <>
                  {/* Header — name, Fargo, status + a contextual ⋯ action button */}
                  <View style={styles.pHeaderRow}>
                    <Text style={[styles.pName, { flex: 1 }]} numberOfLines={2}>{teamName(entry)}</Text>
                    <TouchableOpacity
                      style={styles.pMenuBtn}
                      onPress={() => setProfMenuOpen((v) => !v)}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                      <Ionicons name="ellipsis-horizontal" size={webMs(20)} color={COLORS.textSecondary} />
                    </TouchableOpacity>
                  </View>
                  <View style={styles.pHeaderMeta}>
                    {entry.teamFargo != null && (
                      <Text style={styles.pFargo}>{doubles ? "Team " : ""}Fargo {entry.teamFargo}</Text>
                    )}
                    <View style={[styles.pStatusPill, { backgroundColor: statusMeta.color + "22" }]}>
                      <Text style={[styles.pStatusPillText, { color: statusMeta.color }]}>{statusMeta.label}</Text>
                    </View>
                  </View>

                  {/* The three numbers that answer everything at a glance */}
                  <View style={styles.pStats}>
                    <View style={styles.pStat}>
                      <Text style={[styles.pStatVal, { color: chipStatusColor(entry.chips, entry.startChips) }]}>{entry.chips}</Text>
                      <Text style={styles.pStatLbl}>CHIPS</Text>
                    </View>
                    <View style={styles.pStat}>
                      <Text style={styles.pStatVal}>{entry.wins}-{entry.losses}</Text>
                      <Text style={styles.pStatLbl}>RECORD</Text>
                    </View>
                    <View style={styles.pStat}>
                      <Text style={styles.pStatVal}>{p.matchesPlayed ? `${Math.round(p.winPct * 100)}%` : "--"}</Text>
                      <Text style={styles.pStatLbl}>WIN %</Text>
                    </View>
                  </View>

                  <ScrollView ref={profScrollRef} style={{ maxHeight: Dimensions.get("window").height * 0.42 }} contentContainerStyle={{ paddingBottom: webSc(SPACING.sm) }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                    {/* One compact tournament card — labels explain themselves */}
                    <View style={styles.pInfoCard}>
                      <Text style={styles.pInfoTitle}>Tournament</Text>
                      <View style={styles.pRow}><Text style={styles.pRowLabel}>Starting Chips</Text><Text style={styles.pRowValue}>{entry.startChips}</Text></View>
                      <View style={styles.pRow}><Text style={styles.pRowLabel}>Remaining</Text><Text style={[styles.pRowValue, { color: chipStatusColor(entry.chips, entry.startChips) }]}>{entry.chips}</Text></View>
                    </View>

                    {/* Small performance highlight card */}
                    {p.performanceRating != null && (
                      <View style={styles.pPerfCard}>
                        <Text style={styles.pPerfLabel}>Performance Rating</Text>
                        <Text style={styles.pPerfRating}>{p.performanceRating}</Text>
                        {p.performanceDelta != null && (
                          <Text style={[styles.pPerfDelta, { color: p.performanceDelta > 0 ? COLORS.success : p.performanceDelta < 0 ? COLORS.error : COLORS.textSecondary }]}>
                            {p.performanceDelta > 0 ? "+" : ""}{p.performanceDelta} vs Fargo
                          </Text>
                        )}
                        {p.avgOpp != null && (
                          <>
                            <Text style={styles.pPerfAvgLabel}>Average Opponent</Text>
                            <Text style={styles.pPerfAvgVal}>{p.avgOpp}</Text>
                          </>
                        )}
                      </View>
                    )}

                    {/* Recent matches — the section people actually read */}
                    {p.history.length === 0 ? (
                      <Text style={styles.pEmpty}>No completed matches yet.</Text>
                    ) : (
                      p.history.map((h) => (
                        <View key={h.id} style={styles.pMatchCard}>
                          <View style={styles.pMatchResult}>
                            <View style={[styles.pMatchDot, { backgroundColor: h.won ? COLORS.success : COLORS.error }]} />
                            <Text style={[styles.pMatchResultText, { color: h.won ? COLORS.success : COLORS.error }]}>{h.won ? "Win" : "Loss"}</Text>
                          </View>
                          <Text style={styles.pMatchOpp} numberOfLines={1}>vs {h.opp}</Text>
                          <Text style={styles.pMatchMeta}>{h.table ?? ""}{h.dur ? ` • ${fmtClock(h.dur)}` : ""}</Text>
                        </View>
                      ))
                    )}
                  </ScrollView>

                  <TouchableOpacity style={styles.pClose} onPress={closeProfile} activeOpacity={0.85}>
                    <Text style={styles.pCloseText}>Close</Text>
                  </TouchableOpacity>

                  {/* Contextual action menu — floats in-place, anchored under ⋯ */}
                  {profMenuOpen && (() => {
                    const close = () => setProfMenuOpen(false);
                    const liveMatch = chip.matches.find(
                      (m) => m.status === "in_progress" && (m.aId === entry.id || m.bId === entry.id),
                    );
                    const Item = ({ icon, label, onPress, danger }: { icon: React.ComponentProps<typeof Ionicons>["name"]; label: string; onPress: () => void; danger?: boolean }) => (
                      <TouchableOpacity style={styles.pMenuItem} onPress={onPress} activeOpacity={0.6}>
                        <Ionicons name={icon} size={webMs(16)} color={danger ? COLORS.error : COLORS.textSecondary} />
                        <Text style={[styles.pMenuItemText, danger && { color: COLORS.error }]} numberOfLines={1}>{label}</Text>
                      </TouchableOpacity>
                    );
                    const viewHistory = () => { close(); profScrollRef.current?.scrollToEnd({ animated: true }); };
                    return (
                      <>
                        <Pressable style={StyleSheet.absoluteFill} onPress={close} />
                        <View style={styles.pMenu}>
                          {p.status === "playing" && (
                            <>
                              {liveMatch && (
                                <Item icon="flag-outline" label="End Match" onPress={() => { close(); closeProfile(); setCompleteMatch({ matchId: liveMatch.id, aId: liveMatch.aId, bId: liveMatch.bId }); }} />
                              )}
                              <Item icon="add-circle-outline" label="Add Chip" onPress={() => { close(); openChipAdjust(entry, 1); }} />
                              <Item icon="remove-circle-outline" label="Remove Chip" onPress={() => { close(); openChipAdjust(entry, -1); }} />
                              {entry.tableId && (
                                <Item icon="time-outline" label="Reset Match Timer" onPress={() => { close(); vm.resetTableTimer(entry.tableId as string); }} />
                              )}
                            </>
                          )}
                          {(p.status === "waiting" || p.status === "next") && (
                            <>
                              <Item icon="add-circle-outline" label="Add Chip" onPress={() => { close(); openChipAdjust(entry, 1); }} />
                              <Item icon="remove-circle-outline" label="Remove Chip" onPress={() => { close(); openChipAdjust(entry, -1); }} />
                              <Item icon="arrow-down-circle-outline" label="Send to Back of Queue" onPress={() => { close(); vm.reorderQueue(entry.id, "bottom"); }} />
                              <Item icon="exit-outline" danger label="Eliminate Team" onPress={() => { close(); confirmRemoveFromQueue(entry); }} />
                            </>
                          )}
                          {p.status === "eliminated" && (
                            <>
                              <Item icon="refresh-outline" label="Restore Chip" onPress={() => { close(); vm.restoreEntry(entry.id); }} />
                              <Item icon="return-up-back-outline" label="Re-enter Tournament" onPress={() => { close(); vm.buyBack(entry.id); }} />
                            </>
                          )}
                          <Item icon="document-text-outline" label="View History" onPress={viewHistory} />
                        </View>
                      </>
                    );
                  })()}
                </>
              );
            })()}
          </View>
        </View>
      </Modal>


      {/* Complete Match — pick the winner */}
      <Modal visible={completeMatch != null} transparent animationType="fade" onRequestClose={() => setCompleteMatch(null)}>
        <Pressable style={styles.centerBackdrop} onPress={() => setCompleteMatch(null)}>
          <Pressable style={styles.pickerCard} onPress={() => {}}>
            <Text style={styles.renameTitle}>Who won?</Text>
            <Text style={styles.reduceHint}>The winner stays on the table; the loser drops a chip.</Text>
            {completeMatch && [completeMatch.aId, completeMatch.bId].map((id) => {
              const e = chip.entries.find((x) => x.id === id);
              if (!e) return null;
              return (
                <TouchableOpacity
                  key={id}
                  style={styles.winPickBtn}
                  onPress={() => { vm.recordWinner(completeMatch.matchId, id); setCompleteMatch(null); }}
                >
                  <Text style={styles.winPickName} numberOfLines={2}>{teamName(e)}</Text>
                  {/* Chip count here uses the button's fixed muted-white (winPickMeta) — NOT
                      the dynamic chip-health color, which would blend into the green button. */}
                  <Text style={styles.winPickMeta}>{e.chips} chips · won</Text>
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity style={[styles.renameCancel, { alignSelf: "stretch", alignItems: "center", marginTop: webSc(SPACING.sm) }]} onPress={() => setCompleteMatch(null)}>
              <Text style={styles.renameCancelText}>Cancel</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Manual chip override — reason-gated (director action, live) */}
      <Modal visible={chipAdjust != null} transparent animationType="fade" onRequestClose={() => setChipAdjust(null)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <Pressable style={styles.centerBackdrop} onPress={() => setChipAdjust(null)}>
          <Pressable style={styles.pickerCard} onPress={() => {}}>
            {chipAdjust && (() => {
              const floor = chipAdjust.playing ? 1 : 0;
              const diff = chipAdjustNew - chipAdjust.current;
              const canConfirm = !!chipAdjustReason && diff !== 0;
              const stepBtnStyle = {
                width: webSc(44),
                height: webSc(44),
                borderRadius: RADIUS.md,
                borderWidth: 1,
                borderColor: COLORS.border,
                alignItems: "center" as const,
                justifyContent: "center" as const,
                backgroundColor: COLORS.surface,
              };
              return (
                // Body scrolls inside the height-capped card so the reason chips + Notes +
                // Cancel/Save stay reachable on small screens and when the keyboard is up.
                <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: webSc(SPACING.xs) }}>
                  <Text style={styles.renameTitle}>Adjust Player Chips</Text>
                  <Text style={styles.reduceHint}>Manual chip changes affect the live tournament and will be recorded.</Text>
                  <Text style={{ color: COLORS.text, fontSize: webMs(FONT_SIZES.md), fontWeight: "800", marginTop: webSc(SPACING.sm), textAlign: "center" }}>{chipAdjust.name}</Text>
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: webSc(SPACING.lg), marginVertical: webSc(SPACING.md) }}>
                    <TouchableOpacity onPress={() => setChipAdjustNew((n) => Math.max(floor, n - 1))} disabled={chipAdjustNew <= floor} style={[stepBtnStyle, chipAdjustNew <= floor && { opacity: 0.4 }]}>
                      <Ionicons name="remove" size={webMs(22)} color={COLORS.text} />
                    </TouchableOpacity>
                    <View style={{ alignItems: "center", minWidth: webSc(70) }}>
                      <Text style={{ color: COLORS.primaryLight, fontSize: webMs(FONT_SIZES.xxl), fontWeight: "800" }}>{chipAdjustNew}</Text>
                      <Text style={{ color: COLORS.textMuted, fontSize: webMs(FONT_SIZES.xs) }}>new chips</Text>
                    </View>
                    <TouchableOpacity onPress={() => setChipAdjustNew((n) => n + 1)} style={stepBtnStyle}>
                      <Ionicons name="add" size={webMs(22)} color={COLORS.text} />
                    </TouchableOpacity>
                  </View>
                  <Text style={{ textAlign: "center", color: COLORS.textSecondary, fontSize: webMs(FONT_SIZES.sm) }}>
                    Current: {chipAdjust.current}   ·   Change: {diff > 0 ? "+" : ""}{diff}
                  </Text>
                  {chipAdjust.playing ? (
                    <Text style={{ textAlign: "center", color: COLORS.textMuted, fontSize: webMs(FONT_SIZES.xs), marginTop: 4 }}>
                      In an active match — can&apos;t be reduced to 0 while playing.
                    </Text>
                  ) : chipAdjustNew === 0 ? (
                    <Text style={{ textAlign: "center", color: COLORS.warning, fontSize: webMs(FONT_SIZES.xs), marginTop: 4 }}>
                      Setting to 0 will eliminate this player.
                    </Text>
                  ) : null}
                  <Text style={{ color: COLORS.text, fontSize: webMs(FONT_SIZES.sm), fontWeight: "700", marginTop: webSc(SPACING.md), marginBottom: webSc(SPACING.xs) }}>Reason *</Text>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: webSc(SPACING.sm) }}>
                    {["Score / result correction", "Starting chips entered incorrectly", "Director mistake", "Other"].map((r) => {
                      const active = chipAdjustReason === r;
                      return (
                        <TouchableOpacity key={r} onPress={() => setChipAdjustReason(r)} activeOpacity={0.8}
                          style={{ paddingHorizontal: webSc(SPACING.md), paddingVertical: webSc(SPACING.sm), borderRadius: RADIUS.md, borderWidth: 1, borderColor: active ? COLORS.primary : COLORS.border, backgroundColor: active ? COLORS.primary + "22" : "transparent" }}>
                          <Text style={{ color: active ? COLORS.primary : COLORS.textSecondary, fontSize: webMs(FONT_SIZES.sm), fontWeight: active ? "700" : "500" }}>{r}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  <TextInput allowFontScaling={false} value={chipAdjustNotes} onChangeText={setChipAdjustNotes} placeholder="Notes (optional)" placeholderTextColor={COLORS.textMuted}
                    style={{ marginTop: webSc(SPACING.md), borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, paddingHorizontal: webSc(SPACING.md), paddingVertical: webSc(SPACING.sm), color: COLORS.text, backgroundColor: COLORS.surface }} multiline />
                  <View style={{ flexDirection: "row", gap: webSc(SPACING.sm), marginTop: webSc(SPACING.md) }}>
                    <TouchableOpacity style={[styles.renameCancel, { flex: 1, alignItems: "center" }]} onPress={() => setChipAdjust(null)}>
                      <Text style={styles.renameCancelText}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[{ flex: 2, alignItems: "center", paddingVertical: webSc(SPACING.md), borderRadius: RADIUS.md, backgroundColor: COLORS.primary }, !canConfirm && { opacity: 0.5 }]} onPress={commitChipAdjust} disabled={!canConfirm}>
                      <Text style={{ color: COLORS.white, fontWeight: "700", fontSize: webMs(FONT_SIZES.md) }}>Save Change</Text>
                    </TouchableOpacity>
                  </View>
                </ScrollView>
              );
            })()}
          </Pressable>
        </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      {/* Forfeit decision — reason-gated. Forfeit Match (only with a live match) vs
          Forfeit Tournament. Both write a public spectator-visible audit event. */}
      <Modal visible={forfeit != null} transparent animationType="fade" onRequestClose={() => setForfeit(null)}>
        <Pressable style={styles.centerBackdrop} onPress={() => setForfeit(null)}>
          <Pressable style={styles.pickerCard} onPress={() => {}}>
            {forfeit && (() => {
              const canConfirm = !!forfeitReason;
              const hasMatch = !!forfeit.matchId;
              return (
                <>
                  <Text style={styles.renameTitle}>Forfeit</Text>
                  <Text style={{ color: COLORS.text, fontSize: webMs(FONT_SIZES.md), fontWeight: "800", marginTop: webSc(SPACING.xs), textAlign: "center" }}>{forfeit.name}</Text>
                  {hasMatch ? (
                    <Text style={styles.reduceHint}>
                      Forfeit Match: {forfeit.oppName ? `${forfeit.oppName} wins` : "the opponent wins"}, this team loses 1 chip and goes to the back of the queue (eliminated if it reaches 0). Forfeit Tournament removes them entirely.
                    </Text>
                  ) : (
                    <Text style={styles.reduceHint}>Forfeit Tournament removes this team from the tournament. This is recorded.</Text>
                  )}
                  <Text style={{ color: COLORS.text, fontSize: webMs(FONT_SIZES.sm), fontWeight: "700", marginTop: webSc(SPACING.md), marginBottom: webSc(SPACING.xs) }}>Reason *</Text>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: webSc(SPACING.sm) }}>
                    {["No-show", "Player left", "Rule violation", "Injury / emergency", "Other"].map((r) => {
                      const active = forfeitReason === r;
                      return (
                        <TouchableOpacity key={r} onPress={() => setForfeitReason(r)} activeOpacity={0.8}
                          style={{ paddingHorizontal: webSc(SPACING.md), paddingVertical: webSc(SPACING.sm), borderRadius: RADIUS.md, borderWidth: 1, borderColor: active ? COLORS.primary : COLORS.border, backgroundColor: active ? COLORS.primary + "22" : "transparent" }}>
                          <Text style={{ color: active ? COLORS.primary : COLORS.textSecondary, fontSize: webMs(FONT_SIZES.sm), fontWeight: active ? "700" : "500" }}>{r}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  <TextInput allowFontScaling={false} value={forfeitNotes} onChangeText={setForfeitNotes} placeholder="Notes (optional, shown to spectators)" placeholderTextColor={COLORS.textMuted}
                    style={{ marginTop: webSc(SPACING.md), borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, paddingHorizontal: webSc(SPACING.md), paddingVertical: webSc(SPACING.sm), color: COLORS.text, backgroundColor: COLORS.surface }} multiline />
                  {hasMatch && (
                    <TouchableOpacity style={[{ alignItems: "center", paddingVertical: webSc(SPACING.md), borderRadius: RADIUS.md, backgroundColor: COLORS.warning, marginTop: webSc(SPACING.md) }, !canConfirm && { opacity: 0.5 }]} onPress={() => commitForfeit("match")} disabled={!canConfirm}>
                      <Text style={{ color: COLORS.white, fontWeight: "700", fontSize: webMs(FONT_SIZES.md) }}>Forfeit Match</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity style={[{ alignItems: "center", paddingVertical: webSc(SPACING.md), borderRadius: RADIUS.md, backgroundColor: COLORS.error, marginTop: webSc(SPACING.sm) }, !canConfirm && { opacity: 0.5 }]} onPress={() => commitForfeit("tournament")} disabled={!canConfirm}>
                    <Text style={{ color: COLORS.white, fontWeight: "700", fontSize: webMs(FONT_SIZES.md) }}>Forfeit Tournament</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.renameCancel, { alignSelf: "stretch", alignItems: "center", marginTop: webSc(SPACING.sm) }]} onPress={() => setForfeit(null)}>
                    <Text style={styles.renameCancelText}>Cancel</Text>
                  </TouchableOpacity>
                </>
              );
            })()}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Table Details — information first; actions layered in-modal (no nesting) */}
      <Modal visible={tableDetailId != null} transparent animationType="fade" onRequestClose={() => { setDetailActions(false); setTableDetailId(null); }}>
        <View style={styles.centerRoot}>
          {/* Backdrop sits BEHIND the card (sibling, not parent) so nothing wraps
              the ScrollView and steals its scroll gesture. */}
          <Pressable style={styles.centerDim} onPress={() => { setDetailActions(false); setTableDetailId(null); }} />
          <View style={styles.centerCard}>
              {(() => {
                const t = chip.tables.find((x) => x.id === tableDetailId);
                if (!t) return <Text style={styles.hint}>Table not found.</Text>;
                const si = tableStatusInfo(t);
                const match = chip.matches.find((m) => m.id === t.matchId && m.status === "in_progress");
                const a = match ? entryById(match.aId) : null;
                const b = match ? entryById(match.bId) : null;
                const holder = entryById(t.holderId);
                const pend = !match && t.pendingChallengerId ? entryById(t.pendingChallengerId) : null;
                const holderWin = holder
                  ? chip.matches.filter((m) => m.tableId === t.id && m.winnerId === holder.id && m.endedAt).sort((x, y) => new Date(y.endedAt as string).getTime() - new Date(x.endedAt as string).getTime())[0]
                  : null;
                const waitMs = holderWin?.endedAt ? now - new Date(holderWin.endedAt).getTime() : null;
                const matchMs = match ? matchElapsedMs(match, now) : null;
                const allHist = chip.matches.filter((m) => m.tableId === t.id && m.status !== "in_progress" && m.winnerId).slice().reverse();
                const hist = allHist.slice(0, 3);
                // Per-player mini-card for the detail matchup: name (anchor) + tournament
                // Fargo snapshot (teamFargo = combined for doubles / p1 for singles, never
                // a live profile value) + current live chips. One card per entry, so a
                // team renders as its single team card (not two singles cards).
                const renderDetailPlayer = (e: ChipEntry) => {
                  const fg = e.teamFargo != null ? e.teamFargo : e.p1Fargo;
                  return (
                    <View style={styles.tdpCard}>
                      <Text style={styles.tdpName} numberOfLines={1}>{shortTeam(e)}</Text>
                      <View style={styles.tdpMetaRow}>
                        <Text style={styles.tdpFargo}>{fargoLabel} {fg ?? "—"}</Text>
                        <Text style={[styles.tdpChips, { color: chipStatusColor(e.chips, e.startChips) }]}>{e.chips} {e.chips === 1 ? "Chip" : "Chips"}</Text>
                      </View>
                    </View>
                  );
                };
                return (
                  <>
                    {/* Fixed header — title left, live status badge top-right */}
                    <View style={styles.tdHeadRow}>
                      <Text style={styles.tdName}>{t.label}</Text>
                      <View style={styles.tdStatusBadge}>
                        <View style={[styles.tCardDot, { backgroundColor: si.color }]} />
                        <Text style={[styles.tdStatusText, { color: si.color }]} numberOfLines={1}>
                          {si.label}{matchMs != null ? `  ${fmtClock(matchMs)}` : ""}
                        </Text>
                      </View>
                    </View>

                    {/* Current matchup — the focal point */}
                    <View style={styles.tdMatch}>
                      {match && a && b ? (
                        <>
                          {renderDetailPlayer(a)}
                          <View style={styles.tdVsWrap}><Text style={styles.tdVsText}>VS</Text></View>
                          {renderDetailPlayer(b)}
                        </>
                      ) : holder && pend ? (
                        <>
                          {renderDetailPlayer(holder)}
                          <View style={styles.tdVsWrap}><Text style={styles.tdVsText}>VS</Text></View>
                          {renderDetailPlayer(pend)}
                        </>
                      ) : holder ? (
                        <>
                          {renderDetailPlayer(holder)}
                          <View style={styles.tdVsWrap}><Text style={styles.tdVsText}>VS</Text></View>
                          <Text style={styles.tdMatchWaiting}>Waiting for Opponent</Text>
                        </>
                      ) : (
                        <Text style={styles.tdEmpty}>No team assigned</Text>
                      )}
                    </View>

                    {/* Scrollable information */}
                    <ScrollView style={{ maxHeight: webSc(340) }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                      {/* Stat cards — full labels, never truncated */}
                      <View style={styles.tdStatRow}>
                        {([
                          holder && holder.teamFargo != null ? { lbl: fargoLabel, val: String(holder.teamFargo) } : null,
                          holder ? { lbl: "Current Chips", val: String(holder.chips), color: chipStatusColor(holder.chips, holder.startChips) } : null,
                          waitMs != null ? { lbl: "Waiting Time", val: fmtDur(waitMs) } : null,
                          matchMs != null ? { lbl: "Match Time", val: fmtDur(matchMs) } : null,
                        ].filter(Boolean) as { lbl: string; val: string; color?: string }[]).map((s) => (
                          <View key={s.lbl} style={styles.tdStatCard}>
                            <Text style={styles.tdStatLbl}>{s.lbl}</Text>
                            <Text style={[styles.tdStatVal, s.color ? { color: s.color } : null]} numberOfLines={1}>{s.val}</Text>
                          </View>
                        ))}
                      </View>

                      <Text style={styles.tdSubhead}>{t.label} Match History</Text>
                      {hist.length === 0 && <Text style={styles.tdEmpty}>No matches on this table yet.</Text>}
                      {hist.map((m) => {
                        const w = entryById(m.winnerId);
                        const l = entryById(m.loserId);
                        return (
                          <Text key={m.id} style={styles.tdRecent}>
                            <Text style={styles.tdRecentWin}>{w ? shortTeam(w) : "?"}</Text>
                            <Text style={styles.tdRecentLose}> def. {l ? shortTeam(l) : "?"}</Text>
                          </Text>
                        );
                      })}
                    </ScrollView>

                    {/* Always-visible history link (kept out of the scroll area) */}
                    {allHist.length > 0 && (
                      <TouchableOpacity style={styles.tdViewFullBtn} onPress={() => { setDetailActions(false); setHistOpenIds([]); setTableDetailId(null); setTableHistoryId(t.id); }} activeOpacity={0.7}>
                        <Text style={styles.tdViewFull}>View {t.label} Match History  ›</Text>
                      </TouchableOpacity>
                    )}

                    {/* Persistent footer */}
                    {match && (
                      <TouchableOpacity style={styles.tdCompleteBtn} onPress={() => { setDetailActions(false); setTableDetailId(null); setCompleteMatch({ matchId: match.id, aId: match.aId, bId: match.bId }); }}>
                        <Text style={styles.tdCompleteText}>Complete Match</Text>
                      </TouchableOpacity>
                    )}
                    {!match && pend && (
                      <TouchableOpacity style={styles.tdCompleteBtn} onPress={() => vm.startPendingMatch(t.id)}>
                        <Text style={styles.tdCompleteText}>Start Match</Text>
                      </TouchableOpacity>
                    )}
                    <View style={styles.tdFooterRow}>
                      <TouchableOpacity style={styles.tdActionsBtnSm} onPress={() => setDetailActions(true)}>
                        <Ionicons name="flash" size={webMs(15)} color={COLORS.text} />
                        <Text style={styles.tdActionsBtnText}>Actions</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.tdCloseBtnSm} onPress={() => { setDetailActions(false); setTableDetailId(null); }}>
                        <Text style={styles.tdCloseBtnText}>Close</Text>
                      </TouchableOpacity>
                    </View>
                  </>
                );
              })()}
          </View>

          {/* Actions sheet — layered ON TOP of the dimmed Details modal (same native
              modal, so there's never a second overlay left capturing touches) */}
          {detailActions && (() => {
            const t = chip.tables.find((x) => x.id === tableDetailId);
            if (!t) return null;
            const match = chip.matches.find((m) => m.id === t.matchId && m.status === "in_progress");
            const holder = entryById(t.holderId);
            const occupied = !!match || !!holder;
            const canMove = chip.tables.some((x) => x.id !== t.id && !x.inactive && !x.locked && !x.matchId && !x.holderId);
            const close = () => setDetailActions(false);
            const leaveTo = (fn: () => void) => { setDetailActions(false); setTableDetailId(null); fn(); };
            const Row = ({ label, icon, onPress, danger, disabled }: { label: string; icon: React.ComponentProps<typeof Ionicons>["name"]; onPress: () => void; danger?: boolean; disabled?: boolean }) => (
              <TouchableOpacity style={[styles.actRow2, disabled && styles.btnDisabledLite]} disabled={disabled} onPress={onPress} activeOpacity={0.6}>
                <Ionicons name={icon} size={webMs(17)} color={danger ? COLORS.error : COLORS.textSecondary} />
                <Text style={[styles.actRow2Text, danger && styles.actRow2Danger]}>{label}</Text>
              </TouchableOpacity>
            );
            return (
              <Pressable style={styles.tdSheetOverlay} onPress={close}>
                <Pressable style={styles.actSheet} onPress={() => {}}>
                  <Text style={styles.actSheetTitle}>{t.label} Actions</Text>
                  <View style={styles.actSheetGroup}>
                    {occupied && <Row icon="refresh-outline" label="Clear Table" onPress={() => { close(); confirmClearTable(t); }} />}
                    {!match && <Row icon="play-forward-outline" label="Assign Next Team" disabled={t.locked || (!holder && chip.queue.length < 2) || (!!holder && chip.queue.length < 1)} onPress={() => { close(); vm.assignNextTeam(t.id); }} />}
                    {!match && <Row icon="hand-left-outline" label="Manually Assign" disabled={t.locked || chip.queue.length === 0} onPress={() => leaveTo(() => setManualAssignId(t.id))} />}
                    {occupied && canMove && <Row icon="swap-horizontal-outline" label="Move Team" onPress={() => leaveTo(() => setMoveFromId(t.id))} />}
                    <Row icon="create-outline" label="Rename Table" onPress={() => leaveTo(() => openRename(t))} />
                    <Row icon={t.locked ? "lock-open-outline" : "lock-closed-outline"} label={t.locked ? "Unlock Table" : "Lock Table"} onPress={() => { close(); toggleTableLock(t); }} />
                    <Row icon="videocam-outline" label={t.isStream ? "Edit Stream Link" : "Add Stream Link"} onPress={() => leaveTo(() => openStreamLink(t))} />
                  </View>
                  <View style={styles.actSheetGroup}>
                    {t.closing ? (
                      <Row icon="refresh-outline" label="Cancel Removal" onPress={() => { close(); vm.reactivateTable(t.id); }} />
                    ) : (
                      <Row icon="trash-outline" danger label="Remove Table" onPress={() => { close(); confirmRemoveTableSmart(t); }} />
                    )}
                  </View>
                  <TouchableOpacity style={styles.actSheetCancel} onPress={close}>
                    <Text style={styles.actSheetCancelText}>Cancel</Text>
                  </TouchableOpacity>
                </Pressable>
              </Pressable>
            );
          })()}
        </View>
      </Modal>

      {/* Table actions (⋮) — anchored dropdown. Standalone Modal for the DASHBOARD
          PREVIEW ⋮ only (dashTablesOpen === false); when the Active Tables modal is
          open, the menu is rendered inside THAT layer instead (see activeTablesEl),
          because a second RN Modal can't present over it on iOS. */}
      <Modal visible={tableMenu != null && !dashTablesOpen} transparent animationType="none" onRequestClose={() => setTableMenu(null)}>
        {renderTableMenu(() => setTableMenu(null))}
      </Modal>

      {/* Next Match assignment popup (winner-stays → confirm to start) */}
      <Modal visible={assignPopupTableId != null} transparent animationType="fade" onRequestClose={dismissAssignPopup}>
        <View style={styles.centerRoot}>
          <Pressable style={styles.centerDim} onPress={dismissAssignPopup} />
          <View style={styles.centerCard}>
            {(() => {
              const t = chip.tables.find((x) => x.id === assignPopupTableId);
              if (!t) return null;
              const holder = entryById(t.holderId);
              const inc = entryById(t.pendingChallengerId);
              if (!holder || !inc) return null;
              const streak = holder.streak ?? 0;
              return (
                <>
                  <Text style={styles.npTable}>{t.label}</Text>
                  <Text style={styles.npHeading}>Next Match on {t.label}</Text>
                  <View style={styles.npMatch}>
                    <View style={styles.npStayRow}>
                      <Text style={styles.npStayName} numberOfLines={1}>{shortTeam(holder)}</Text>
                      {streak >= 2 && <Text style={styles.npStreak}>🔥 {streak}</Text>}
                    </View>
                    <View style={styles.npVsWrap}><Text style={styles.npVs}>VS</Text></View>
                    {(t.rematchSkipped ?? []).length > 0 && (
                      <Text style={styles.npSkipNote} numberOfLines={1}>
                        ⚠ Rematch skipped
                        {t.rematchSkipped!.length === 1
                          ? ` · ${(() => { const e = entryById(t.rematchSkipped![0]); return e ? shortTeam(e) : ""; })()}`
                          : ""}
                      </Text>
                    )}
                    <Text style={styles.npIncomingLabel}>INCOMING TEAM</Text>
                    <View style={styles.npIncomingBox}>
                      <Text style={styles.npIncomingName} numberOfLines={1}>{shortTeam(inc)}</Text>
                    </View>
                  </View>
                  <TouchableOpacity style={styles.npStartBtn} onPress={() => { ackPending(t); vm.startPendingMatch(t.id); setAssignPopupTableId(null); }} activeOpacity={0.85}>
                    <Text style={styles.npStartText}>Start Match</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.npNotYet} onPress={dismissAssignPopup} activeOpacity={0.7}>
                    <Text style={styles.npNotYetText}>Not Yet</Text>
                  </TouchableOpacity>
                </>
              );
            })()}
          </View>
        </View>
      </Modal>

      {/* Champion confirmation — shown once a winner is decided (still pending
          completion until the TD taps Finish). Winner only; no prize amounts. */}
      <Modal visible={championModalOpen} transparent animationType="fade" onRequestClose={() => setChampionModalOpen(false)}>
        <View style={styles.centerRoot}>
          <Pressable style={styles.centerDim} onPress={() => setChampionModalOpen(false)} />
          <View style={styles.centerCard}>
            {(() => {
              const champ = chip.winnerId ? entryById(chip.winnerId) : null;
              return (
                <>
                  <Text style={styles.champWinTrophy}>🏆</Text>
                  <Text style={styles.champWinKicker}>TOURNAMENT WINNER</Text>
                  <Text style={styles.champWinName} numberOfLines={2}>{champ ? teamName(champ) : "—"}</Text>
                  <Text style={styles.champWinSub}>has won the tournament.</Text>
                  <TouchableOpacity style={styles.champWinPrimary} onPress={doFinishTournament} activeOpacity={0.85}>
                    <Text style={styles.champWinPrimaryText}>Finish Tournament</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.champWinSecondary} onPress={() => setChampionModalOpen(false)} activeOpacity={0.7}>
                    <Text style={styles.champWinSecondaryText}>Review Results</Text>
                  </TouchableOpacity>
                </>
              );
            })()}
          </View>
        </View>
      </Modal>
      <ConfettiBurst ref={confettiRef} />

      {/* Queue manager — centered floating modal */}
      <Modal visible={queueModalOpen} transparent animationType="fade" onRequestClose={() => setQueueModalOpen(false)}>
        <View style={styles.centerRoot}>
          <Pressable style={styles.centerDim} onPress={() => { setQueueMenuId(null); setQueueModalOpen(false); }} />
          <View style={styles.qFloatCard}>
          {/* Fixed header */}
          <View style={styles.qModalHeader}>
            <TouchableOpacity onPress={() => { setQueueMenuId(null); setQueueModalOpen(false); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={styles.qModalCancel}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.qModalTitle} numberOfLines={1}>Queue ({chip.queue.length})</Text>
            <TouchableOpacity onPress={() => { setQueueMenuId(null); setQueueModalOpen(false); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={styles.qModalDone}>Done</Text>
            </TouchableOpacity>
          </View>
          {/* Up Next (fixed) — who gets the next open table */}
          {(() => {
            const up = chip.queue[0] ? entryById(chip.queue[0]) : null;
            if (!up) return null;
            return (
              <View style={styles.qUpNext}>
                <Text style={styles.qUpNextLabel}>Up Next</Text>
                <Text style={styles.qUpNextName} numberOfLines={1}>{shortTeam(up)}</Text>
              </View>
            );
          })()}
          {chip.queue.length > 0 && (
            <View style={styles.qSectionHead}>
              <Text style={styles.qSectionHeadText}>Queue ({chip.queue.length})</Text>
            </View>
          )}
          {/* Scrollable list */}
          {chip.queue.length === 0 ? (
            <View style={styles.qEmptyFull}>
              <Ionicons name="list-outline" size={webMs(34)} color={COLORS.textMuted} />
              <Text style={styles.qEmptyTitle}>Queue is empty</Text>
              <Text style={styles.qEmptySub}>Teams will appear here when they are waiting for a table.</Text>
            </View>
          ) : (
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: webSc(SPACING.md) }} showsVerticalScrollIndicator>
              {chip.queue.map((qid, i) => {
                const e = entryById(qid);
                if (!e) return null;
                return (
                  <View key={qid} style={styles.qmRow}>
                    <Text style={styles.qmPos}>{i + 1}</Text>
                    <View style={styles.qmMain}>
                      <View style={styles.qmLine1}>
                        <Text style={styles.qmName} numberOfLines={1}>{shortTeam(e)}</Text>
                        <Text style={[styles.qmChips, { color: chipStatusColor(e.chips, e.startChips) }]}>{e.chips} {e.chips === 1 ? "chip" : "chips"}</Text>
                      </View>
                      <Text style={styles.qmMeta} numberOfLines={1}>
                        <Text style={styles.qmMetaFargo}>Fargo {e.teamFargo != null ? e.teamFargo : "—"}</Text>
                        <Text style={styles.qmMetaDot}>  •  </Text>
                        <Text style={styles.qmWin}>W{e.wins}</Text>
                        <Text style={styles.qmMetaDot}>  •  </Text>
                        <Text style={styles.qmLoss}>L{e.losses}</Text>
                      </Text>
                      {(() => { const rs = queueRoundStatus(qid); return rs ? <Text style={[styles.qRoundStatus, { color: rs.color }]} numberOfLines={1}>{rs.label}</Text> : null; })()}
                    </View>
                    <TouchableOpacity style={styles.qmMenuBtn} onPress={() => setQueueMenuId(e.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Ionicons name="ellipsis-vertical" size={webMs(18)} color={COLORS.textSecondary} />
                    </TouchableOpacity>
                  </View>
                );
              })}
            </ScrollView>
          )}

          {/* Per-team action sheet (layered inside this modal — no nesting) */}
          {queueMenuId && (() => {
            const e = entryById(queueMenuId);
            if (!e) return null;
            const idx = chip.queue.indexOf(e.id);
            const isFirst = idx <= 0;
            const isLast = idx === chip.queue.length - 1;
            const close = () => setQueueMenuId(null);
            const Row = ({ label, icon, onPress, danger, disabled }: { label: string; icon: React.ComponentProps<typeof Ionicons>["name"]; onPress: () => void; danger?: boolean; disabled?: boolean }) => (
              <TouchableOpacity style={[styles.actRow2, disabled && styles.btnDisabledLite]} disabled={disabled} onPress={onPress} activeOpacity={0.6}>
                <Ionicons name={icon} size={webMs(17)} color={danger ? COLORS.error : COLORS.textSecondary} />
                <Text style={[styles.actRow2Text, danger && styles.actRow2Danger]}>{label}</Text>
              </TouchableOpacity>
            );
            return (
              <Pressable style={styles.tdSheetOverlay} onPress={close}>
                <Pressable style={styles.actSheet} onPress={() => {}}>
                  <Text style={styles.actSheetTitle}>{shortTeam(e)}</Text>
                  <View style={styles.actSheetGroup}>
                    <Row icon="person-outline" label="View Team Details" onPress={() => { close(); setQueueModalOpen(false); setProfileId(e.id); }} />
                    <Row icon="arrow-up-outline" label="Move Up" disabled={isFirst} onPress={() => { close(); vm.reorderQueue(e.id, "up"); }} />
                    <Row icon="arrow-down-outline" label="Move Down" disabled={isLast} onPress={() => { close(); vm.reorderQueue(e.id, "down"); }} />
                    <Row icon="arrow-up-circle-outline" label="Move to Top" disabled={isFirst} onPress={() => { close(); vm.reorderQueue(e.id, "top"); }} />
                    <Row icon="arrow-down-circle-outline" label="Move to Bottom" disabled={isLast} onPress={() => { close(); vm.reorderQueue(e.id, "bottom"); }} />
                  </View>
                  <View style={styles.actSheetGroup}>
                    <Row icon="trash-outline" danger label="Remove From Queue" onPress={() => { close(); confirmRemoveFromQueue(e); }} />
                  </View>
                  <TouchableOpacity style={styles.actSheetCancel} onPress={close}>
                    <Text style={styles.actSheetCancelText}>Cancel</Text>
                  </TouchableOpacity>
                </Pressable>
              </Pressable>
            );
          })()}
          </View>
        </View>
      </Modal>

      {/* Player / team actions (⋮) — anchored dropdown */}
      <Modal visible={playerMenu != null} transparent animationType="none" onRequestClose={() => setPlayerMenu(null)}>
        <Pressable style={styles.ddBackdrop} onPress={() => setPlayerMenu(null)}>
          {(() => {
            const e = playerMenu ? entryById(playerMenu.id) : null;
            if (!e || !playerMenu) return null;
            const close = () => setPlayerMenu(null);
            const eliminated = e.status === "eliminated";
            const startCt = e.startChips || 1;
            const Row = ({ label, icon, onPress, danger, last }: { label: string; icon: React.ComponentProps<typeof Ionicons>["name"]; onPress: () => void; danger?: boolean; last?: boolean }) => (
              <TouchableOpacity style={[styles.ddRow, last && styles.ddRowLast]} onPress={onPress} activeOpacity={0.6}>
                <Ionicons name={icon} size={webMs(17)} color={danger ? COLORS.error : COLORS.textSecondary} />
                <Text style={[styles.ddRowText, danger && { color: COLORS.error }]} numberOfLines={1}>{label}</Text>
              </TouchableOpacity>
            );
            const confirmForfeit = () => {
              close();
              openForfeit(e.id);
            };
            const confirmRestore = () => {
              close();
              const buttons: { text: string; style?: "cancel" | "destructive"; onPress?: () => void }[] = [
                { text: "Cancel", style: "cancel" },
                { text: "1 Chip", onPress: () => vm.restoreEntry(e.id) },
              ];
              if (startCt > 1) buttons.push({ text: `${startCt} Chips`, onPress: () => vm.buyBack(e.id) });
              Alert.alert(
                "Restore Team",
                `Bring ${teamName(e)} back into the tournament? Choose how many chips they return with.`,
                buttons,
              );
            };
            return (
              // Cap to the computed usable space (playerMenu.maxH) and scroll internally so
              // the bottom-most card's menu never overflows below the tab bar (mirrors
              // renderTableMenu). placeMenu already decides open-up vs open-down.
              <Pressable style={[styles.ddCard, { left: playerMenu.left, top: playerMenu.top, bottom: playerMenu.bottom, maxHeight: playerMenu.maxH }]} onPress={() => {}}>
                <Text style={styles.ddName} numberOfLines={1}>{teamName(e)}</Text>
                <ScrollView style={{ flexShrink: 1 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                  {eliminated ? (
                    <Row icon="refresh-outline" label="Restore Team" onPress={confirmRestore} last />
                  ) : (
                    <>
                      <Row icon="add-circle-outline" label="Add Chip" onPress={() => { close(); openChipAdjust(e, 1); }} />
                      <Row icon="remove-circle-outline" label="Remove Chip" onPress={() => { close(); openChipAdjust(e, -1); }} />
                      <Row icon="exit-outline" label="Forfeit" onPress={confirmForfeit} danger last />
                    </>
                  )}
                </ScrollView>
              </Pressable>
            );
          })()}
        </Pressable>
      </Modal>

      {/* Full match history for a table — a complete, scannable log */}
      <Modal visible={tableHistoryId != null} transparent animationType="fade" onRequestClose={() => setTableHistoryId(null)}>
        <View style={styles.centerRoot}>
          <Pressable style={styles.centerDim} onPress={() => setTableHistoryId(null)} />
          <View style={styles.centerCard}>
            {(() => {
              const t = chip.tables.find((x) => x.id === tableHistoryId);
              const all = t ? chip.matches.filter((m) => m.tableId === t.id && m.status !== "in_progress" && m.winnerId).slice().reverse() : [];
              const durs = all
                .map((m) => (m.endedAt ? new Date(m.endedAt).getTime() - new Date(m.startedAt).getTime() : 0))
                .filter((x) => x > 0);
              const avgMs = durs.length ? durs.reduce((s, x) => s + x, 0) / durs.length : null;
              return (
                <>
                  {/* Fixed header + summary */}
                  <Text style={styles.tdName}>{t?.label ?? "Table"} • Match History</Text>
                  <View style={styles.mhSummary}>
                    <Text style={styles.mhSummaryStrong}>{all.length} {all.length === 1 ? "Match" : "Matches"} Played</Text>
                    <Text style={styles.mhSummaryMuted}>Average Match Time: {avgMs != null ? fmtDur(avgMs) : "—"}</Text>
                  </View>

                  <ScrollView style={{ maxHeight: webSc(430), marginTop: webSc(SPACING.sm) }} showsVerticalScrollIndicator={false}>
                    {all.length === 0 && <Text style={styles.mhEmpty}>No completed matches on this table yet.</Text>}
                    {all.map((m, i) => {
                      const w = entryById(m.winnerId);
                      const l = entryById(m.loserId);
                      const dur = m.endedAt ? new Date(m.endedAt).getTime() - new Date(m.startedAt).getTime() : null;
                      const open = histOpenIds.includes(m.id);
                      const toggle = () => setHistOpenIds((prev) => (prev.includes(m.id) ? prev.filter((x) => x !== m.id) : [...prev, m.id]));
                      return (
                        <View key={m.id} style={[styles.mhEntry, i > 0 && styles.mhEntryDivider]}>
                          <TouchableOpacity style={styles.mhSnippet} onPress={toggle} activeOpacity={0.7}>
                            <View style={styles.mhTeams}>
                              <Text style={styles.mhWinner}>{w ? shortTeam(w) : "?"}</Text>
                              <Text style={styles.mhDef}>def.</Text>
                              <Text style={styles.mhLoser}>{l ? shortTeam(l) : "?"}</Text>
                            </View>
                            <Ionicons name={open ? "chevron-up" : "chevron-down"} size={webMs(16)} color={COLORS.textMuted} />
                          </TouchableOpacity>
                          {open && (
                            <View style={styles.mhDetail}>
                              {dur != null && (
                                <View style={styles.mhDetailRow}><Text style={styles.mhDetailLbl}>Duration</Text><Text style={styles.mhDetailVal}>{fmtDur(dur)}</Text></View>
                              )}
                              {m.endedAt && (
                                <View style={styles.mhDetailRow}><Text style={styles.mhDetailLbl}>Completed</Text><Text style={styles.mhDetailVal}>{fmtEventTime(m.endedAt)}</Text></View>
                              )}
                            </View>
                          )}
                        </View>
                      );
                    })}
                  </ScrollView>
                  <TouchableOpacity style={styles.modalClose} onPress={() => setTableHistoryId(null)}>
                    <Text style={styles.modalCloseText}>Close</Text>
                  </TouchableOpacity>
                </>
              );
            })()}
          </View>
        </View>
      </Modal>

      {/* Move team → pick a destination table */}
      <Modal visible={moveFromId != null} transparent animationType="fade" onRequestClose={() => setMoveFromId(null)}>
        <Pressable style={styles.centerBackdrop} onPress={() => setMoveFromId(null)}>
          <Pressable style={styles.pickerCard} onPress={() => {}}>
            <Text style={styles.renameTitle}>Move to which table?</Text>
            <Text style={styles.reduceHint}>Pick an empty, unlocked table.</Text>
            {chip.tables.filter((x) => x.id !== moveFromId && !x.inactive && !x.locked && !x.matchId && !x.holderId).map((dest) => (
              <TouchableOpacity key={dest.id} style={styles.moveDestRow} onPress={() => { if (moveFromId) vm.moveTable(moveFromId, dest.id); setMoveFromId(null); }}>
                <Text style={styles.moveDestText}>🎱 {dest.label}</Text>
              </TouchableOpacity>
            ))}
            {chip.tables.filter((x) => x.id !== moveFromId && !x.inactive && !x.locked && !x.matchId && !x.holderId).length === 0 && (
              <Text style={styles.hint}>No empty tables available.</Text>
            )}
            <TouchableOpacity style={[styles.renameCancel, { alignSelf: "stretch", alignItems: "center", marginTop: webSc(SPACING.sm) }]} onPress={() => setMoveFromId(null)}>
              <Text style={styles.renameCancelText}>Cancel</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Manually assign a team from the queue to a table */}
      <Modal visible={manualAssignId != null} transparent animationType="fade" onRequestClose={() => setManualAssignId(null)}>
        <View style={styles.centerRoot}>
          <Pressable style={styles.centerDim} onPress={() => setManualAssignId(null)} />
          <View style={styles.centerCard}>
            <Text style={styles.renameTitle}>Assign which team?</Text>
            <Text style={styles.reduceHint}>Pick a team from the queue to seat on this table.</Text>
            <ScrollView style={{ maxHeight: webSc(360) }} keyboardShouldPersistTaps="handled">
              {chip.queue.length === 0 && <Text style={styles.hint}>The queue is empty.</Text>}
              {chip.queue.map((qid, i) => {
                const e = entryById(qid);
                if (!e) return null;
                return (
                  <TouchableOpacity key={qid} style={styles.moveDestRow} onPress={() => { if (manualAssignId) vm.assignSpecificTeam(manualAssignId, qid); setManualAssignId(null); }}>
                    <Text style={styles.moveDestText}>{i + 1}. {teamName(e)}</Text>
                    <Text style={styles.tCardFargo}>{e.teamFargo != null ? `(${e.teamFargo}) · ` : ""}<Text style={{ color: chipStatusColor(e.chips, e.startChips) }}>{e.chips} chips</Text></Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <TouchableOpacity style={styles.modalClose} onPress={() => setManualAssignId(null)}>
              <Text style={styles.modalCloseText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );

  // Embedded: just the page content + overlays; the host manager supplies the header
  // and phase nav. onTouchStart on the content wrapper is a PASSIVE handler — any
  // touch (tap or scroll-start) closes an open Actions popover WITHOUT consuming the
  // gesture, so scrolling continues.
  //
  // Scroll ownership differs by page:
  //  • Chip LIVE pages get a fill-height slot from the host (see the manager's page
  //    switch), so they own their own scrolling here. Live → Tables brings its OWN
  //    scroll (renderLiveTables — sticky toolbar), so it is rendered flush in the
  //    flex slot; the other live pages (Dashboard/Queue/Players) are flat content, so
  //    we wrap them in a ScrollView that reproduces the host's page padding.
  //  • Chip SETUP/RESULTS pages stay inside the host's shared page ScrollView, so they
  //    render flat (no nested scroll).
  if (embedded) {
    const closeOnTouch = () => { if (menuEntryId != null) closeMenu(); };
    const isEmbeddedLive =
      embeddedPage === "live-dashboard" ||
      embeddedPage === "live-tables" ||
      embeddedPage === "live-queue" ||
      embeddedPage === "live-players";
    if (isEmbeddedLive) {
      // Tables owns its scroll (sticky header); render it directly in the flex slot.
      if (embeddedPage === "live-tables") {
        return (
          <View style={styles.embeddedLiveFlex} ref={rootRef}>
            <View style={styles.embeddedLiveFlex} onTouchStart={closeOnTouch}>{content()}</View>
            {modals}
          </View>
        );
      }
      return (
        <View style={styles.embeddedLiveFlex} ref={rootRef}>
          <ScrollView
            ref={liveScrollRef}
            style={styles.embeddedLiveFlex}
            contentContainerStyle={styles.embeddedLiveScrollInner}
            showsVerticalScrollIndicator={false}
            onTouchStart={closeOnTouch}
            refreshControl={liveRefreshControl}
          >
            {content()}
          </ScrollView>
          {modals}
        </View>
      );
    }
    return (
      <View ref={rootRef}>
        <View onTouchStart={closeOnTouch}>{content()}</View>
        {modals}
      </View>
    );
  }

  return (
    <View style={styles.container} ref={rootRef}>
      <View style={[styles.header, isWeb && styles.headerWeb]}>
        <TouchableOpacity onPress={() => router.back()}><Text style={styles.back}>‹ Back</Text></TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle} numberOfLines={1}>{tournament.name || "Chip Tournament"}</Text>
          <View style={styles.phaseBadge}>
            <Text allowFontScaling={false} style={styles.phaseBadgeText}>
              {tournament.live_state === "in_progress"
                ? "LIVE"
                : tournament.live_state === "finished" || tournament.status === "completed"
                  ? "Completed"
                  : tournament.live_state === "registration_open"
                    ? "Registration Open"
                    : "Setup"}
            </Text>
          </View>
        </View>
        <View style={{ width: webSc(44) }} />
      </View>

      <PhaseNav
        phases={phases}
        selectedKey={selectedPhase}
        activePageKey={page}
        onSelectPage={(phaseKey, pageKey) => {
          // Settings lives on the Compete form — pop back to it (it's still mounted
          // below, so this is a clean back transition, not a re-mount).
          if (phaseKey === "setup" && pageKey === "Settings") {
            if (router.canGoBack()) router.back();
            else router.replace(`/(tabs)/admin/manage-tournament/${id}` as any);
            return;
          }
          setSelectedPhase(phaseKey as "setup" | "live" | "results");
          // Leaving the Live → Tables page resets its view to Card (default). Staying
          // on the page (toggling Card/List) keeps the choice for the session.
          if (pageKey !== "Tables") setTablesView("card");
          setPage(pageKey);
        }}
        onLockedPress={(phaseKey) =>
          Alert.alert(
            "Not yet",
            phaseKey === "live"
              ? "Start the tournament from Setup → Review first."
              : "Results open once the tournament is running.",
          )
        }
      />

      {/* Scroll-area wrapper — measured (window rect) to get the usable band between the
          fixed header and the pinned footer for card-focused Edit Player positioning. */}
      <View style={styles.scroll} ref={scrollAreaRef}>
        <KeyboardAwareScrollView
          ref={rosterScrollRef}
          style={styles.scroll}
          contentContainerStyle={[
            styles.content,
            isWeb && styles.contentWeb,
            showReviewCta && styles.contentWithCta,
            // While editing, reserve keyboard-sized bottom room so a tall card can be
            // scrolled far enough to keep its footer (Done / Mark Ready) above the keyboard.
            editEntryId != null ? { paddingBottom: webSc(320) } : null,
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          enableOnAndroid
          // ONE source of truth = positionEditingCard (absolute content target). Neuter
          // ALL of the library's keyboard scrolling so nothing competes:
          //  • enableAutomaticScroll=false → no scroll-to-focused-input on focus.
          //  • enableResetScrollToCoords=false → no scroll-back (toward y=0) on keyboard
          //    HIDE. That built-in reset was fighting our blur snap and causing the
          //    jump-to-top while Fargo was being edited.
          enableAutomaticScroll={false}
          enableResetScrollToCoords={false}
        >
          <View onTouchStart={() => { if (menuEntryId != null) closeMenu(); }}>{content()}</View>
        </KeyboardAwareScrollView>
      </View>

      {showReviewCta && reviewCta}
      {modals}
    </View>
  );
};

// ── presentational helpers ──────────────────────────────────────────────────────
const Section = ({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) => (
  <View style={styles.section}>
    <View style={styles.sectionHead}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {action}
    </View>
    {children}
  </View>
);
const HeaderBtn = ({ label, onPress }: { label: string; onPress: () => void }) => (
  <TouchableOpacity style={styles.headerBtn} onPress={onPress}><Text style={styles.headerBtnText}>{label}</Text></TouchableOpacity>
);
// A dashboard section with a colored left accent bar + icon chip so each one is
// visually distinct at a glance.
// Consistent neutral section: [small icon] Title  …  optional action. Same card
// style for every section (subtle 1px border, no colored side bar / tint).
const DashSection = ({ icon, iconColor, title, action, children }: { icon: React.ComponentProps<typeof Ionicons>["name"]; iconColor?: string; title: string; action?: React.ReactNode; children: React.ReactNode }) => (
  <View style={[styles.dashSection, isWeb && styles.dashSectionWeb]}>
    <View style={styles.dashSectionHead}>
      <View style={styles.dashSectionTitleWrap}>
        <Ionicons name={icon} size={webMs(15)} color={iconColor ?? COLORS.textSecondary} />
        <Text style={styles.dashSectionTitle}>{title}</Text>
      </View>
      {action}
    </View>
    {children}
  </View>
);
const styles = StyleSheet.create({
  container: {
    ...Platform.select({
      web: { maxWidth: 860, width: "100%" as any, alignSelf: "center" as any },
    }),
    flex: 1,
    backgroundColor: COLORS.background,
  },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.background },
  errorText: { color: COLORS.error, fontSize: webMs(FONT_SIZES.md) },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: webSc(SPACING.md), paddingTop: webSc(SPACING.xl + SPACING.sm), paddingBottom: webSc(SPACING.sm), backgroundColor: COLORS.background },
  headerWeb: { paddingTop: webSc(SPACING.lg) },
  back: { color: COLORS.primary, fontSize: webMs(FONT_SIZES.md), fontWeight: "600" },
  headerCenter: { flex: 1, alignItems: "center" },
  headerTitle: { color: COLORS.text, fontSize: webMs(FONT_SIZES.lg), fontWeight: "700" },
  phaseBadge: { marginTop: 2, backgroundColor: COLORS.primary + "22", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
  phaseBadgeText: { color: COLORS.primary, fontSize: webMs(FONT_SIZES.xs), fontWeight: "800", letterSpacing: 1 },

  tabBar: { flexDirection: "row", backgroundColor: COLORS.surface, borderBottomWidth: 1, borderBottomColor: COLORS.border, paddingHorizontal: webSc(SPACING.sm) },
  tab: { paddingVertical: webSc(SPACING.sm), paddingHorizontal: webSc(SPACING.md), borderBottomWidth: 2, borderBottomColor: "transparent" },
  tabOn: { borderBottomColor: COLORS.primary },
  tabText: { color: COLORS.textSecondary, fontSize: webMs(FONT_SIZES.sm), fontWeight: "600" },
  tabTextOn: { color: COLORS.primary, fontWeight: "700" },

  scroll: { flex: 1 },
  content: { padding: webSc(SPACING.md), paddingBottom: webSc(SPACING.xl * 2) },
  contentWithCta: { paddingBottom: webSc(96) }, // clear the pinned Review & Start bar
  contentWeb: { width: "100%" as any },

  section: { backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.border, padding: webSc(SPACING.md), marginBottom: webSc(SPACING.md) },
  sectionHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: webSc(SPACING.sm) },
  sectionTitle: { color: COLORS.text, fontSize: webMs(FONT_SIZES.md), fontWeight: "700" },
  hint: { color: COLORS.textMuted, fontSize: webMs(FONT_SIZES.sm), marginBottom: webSc(SPACING.sm) },

  fieldWrap: { marginBottom: webSc(SPACING.sm) },
  fieldLabel: { color: COLORS.textSecondary, fontSize: webMs(FONT_SIZES.sm), marginBottom: webSc(SPACING.xs), fontWeight: "500" },
  input: { backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.sm, paddingVertical: webSc(SPACING.sm), paddingHorizontal: 10, color: COLORS.text, fontSize: webMs(FONT_SIZES.sm), ...(isWeb ? ({ outlineStyle: "none" } as object) : null) },
  flex1: { flex: 1 },
  flex2: { flex: 2 },

  toggleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: webSc(SPACING.xs), gap: webSc(SPACING.md) },
  toggleLabel: { color: COLORS.text, fontSize: webMs(FONT_SIZES.sm), fontWeight: "500" },
  readonlyVal: { color: COLORS.textSecondary, fontSize: webMs(FONT_SIZES.sm), fontWeight: "700" },
  toggleSub: { color: COLORS.textMuted, fontSize: webMs(FONT_SIZES.xs), marginTop: 1 },

  headerBtn: { borderWidth: 1, borderColor: COLORS.primary, borderRadius: RADIUS.sm, paddingVertical: 4, paddingHorizontal: 10 },
  headerBtnText: { color: COLORS.primary, fontSize: webMs(FONT_SIZES.sm), fontWeight: "600" },

  seedBtn: { borderWidth: 1, borderColor: COLORS.border, borderStyle: "dashed", borderRadius: RADIUS.sm, padding: webSc(SPACING.md), alignItems: "center" },
  seedBtnText: { color: COLORS.primary, fontSize: webMs(FONT_SIZES.sm), fontWeight: "600" },
  tierHead: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  tierHeadText: { color: COLORS.textMuted, fontSize: webMs(FONT_SIZES.xs), fontWeight: "700" },
  tierRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 },
  tierInput: { backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.sm, paddingVertical: webSc(SPACING.xs), paddingHorizontal: 8, color: COLORS.text, fontSize: webMs(FONT_SIZES.sm), textAlign: "center", ...(isWeb ? ({ outlineStyle: "none" } as object) : null) },
  tierMin: { flex: 1 },
  tierMax: { flex: 1 },
  tierChips: { flex: 1 },
  tierDel: { width: 28, alignItems: "center" },
  delX: { color: COLORS.error, fontSize: webMs(FONT_SIZES.md), fontWeight: "700" },

  entryCard: { backgroundColor: COLORS.background, borderRadius: RADIUS.md, padding: webSc(SPACING.sm), marginBottom: webSc(SPACING.sm), gap: webSc(SPACING.xs) },
  entryTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  entryNum: { color: COLORS.textSecondary, fontSize: webMs(FONT_SIZES.sm), fontWeight: "700" },
  entryChipPill: { backgroundColor: COLORS.primary + "22", borderRadius: 4, paddingHorizontal: 8, paddingVertical: 2 },
  entryChipText: { color: COLORS.primary, fontSize: webMs(FONT_SIZES.xs), fontWeight: "700" },
  entryRow: { flexDirection: "row", gap: 8 },
  entryToggles: { flexDirection: "row", gap: 8, marginTop: 2 },
  miniToggle: { borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.sm, paddingVertical: 4, paddingHorizontal: 10 },
  miniToggleOn: { borderColor: COLORS.success, backgroundColor: COLORS.success + "22" },
  miniToggleText: { color: COLORS.textSecondary, fontSize: webMs(FONT_SIZES.sm) },
  miniToggleTextOn: { color: COLORS.success, fontWeight: "700" },

  tableSetupRow: { paddingVertical: webSc(SPACING.sm), borderBottomWidth: 1, borderBottomColor: COLORS.border, gap: webSc(SPACING.xs) },
  tableSetupTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  tblNameBtn: { flexDirection: "row", alignItems: "center", gap: 5, flexShrink: 1 },
  tableLabel: { color: COLORS.text, fontSize: webMs(FONT_SIZES.md), fontWeight: "600" },
  tblEditIcon: { color: COLORS.textMuted, fontSize: webMs(FONT_SIZES.sm) },
  flexSpacer: { flex: 1 },
  // Stream: "+ Add Stream" → inline URL editor → "🔴 Stream Linked" + Edit.
  addStreamPill: { borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.sm, paddingVertical: 4, paddingHorizontal: 10 },
  addStreamText: { color: COLORS.textSecondary, fontSize: webMs(FONT_SIZES.xs), fontWeight: "700" },
  streamLinkedWrap: { flexDirection: "row", alignItems: "center", gap: 8 },
  streamLinkedText: { color: COLORS.error, fontSize: webMs(FONT_SIZES.xs), fontWeight: "800" },
  streamEditLink: { color: COLORS.primary, fontSize: webMs(FONT_SIZES.xs), fontWeight: "700" },
  streamEditor: { marginTop: webSc(SPACING.xs), gap: webSc(SPACING.xs) },
  streamEditorBtns: { flexDirection: "row", justifyContent: "flex-end", gap: webSc(SPACING.sm) },
  streamCancel: { paddingVertical: 6, paddingHorizontal: webSc(SPACING.md), borderRadius: RADIUS.sm, borderWidth: 1, borderColor: COLORS.border },
  streamCancelText: { color: COLORS.textSecondary, fontSize: webMs(FONT_SIZES.sm), fontWeight: "700" },
  streamSave: { paddingVertical: 6, paddingHorizontal: webSc(SPACING.md), borderRadius: RADIUS.sm, backgroundColor: COLORS.primary },
  streamSaveText: { color: COLORS.white, fontSize: webMs(FONT_SIZES.sm), fontWeight: "800" },
  streamRemoveBtn: { marginTop: webSc(SPACING.sm), alignItems: "center", paddingVertical: webSc(SPACING.sm) },
  streamRemoveText: { color: COLORS.error, fontSize: webMs(FONT_SIZES.sm), fontWeight: "700" },

  reviewRow: { flexDirection: "row", gap: webSc(SPACING.sm), marginBottom: webSc(SPACING.md) },
  reviewLead: { color: COLORS.text, fontSize: webMs(FONT_SIZES.sm), fontWeight: "600", marginBottom: webSc(SPACING.sm), lineHeight: webMs(FONT_SIZES.sm + 5) },
  // Per-bucket unallocated/over-allocated flag + the payout-incomplete warning on Review.
  payoutMismatch: { color: COLORS.warning, fontSize: webMs(FONT_SIZES.xs), fontWeight: "700", marginTop: -2, marginBottom: webSc(SPACING.xs), textAlign: "right" },
  payoutWarn: { color: COLORS.warning, fontSize: webMs(FONT_SIZES.xs), fontWeight: "600", marginTop: webSc(SPACING.xs), lineHeight: webMs(FONT_SIZES.xs + 4) },
  // Blocking over-cap panel (red) — must be resolved before Start.
  reviewBlock: { backgroundColor: COLORS.error + "18", borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.error, padding: webSc(SPACING.md), marginBottom: webSc(SPACING.md) },
  reviewBlockHead: { color: COLORS.error, fontSize: webMs(FONT_SIZES.sm), fontWeight: "800", marginBottom: webSc(SPACING.sm), lineHeight: webMs(FONT_SIZES.sm + 5) },
  reviewBlockRow: { marginTop: webSc(SPACING.sm), paddingTop: webSc(SPACING.sm), borderTopWidth: 1, borderTopColor: COLORS.border },
  reviewBlockName: { color: COLORS.text, fontSize: webMs(FONT_SIZES.sm), fontWeight: "700", marginBottom: webSc(SPACING.xs) },
  reviewBlockBtns: { flexDirection: "row", gap: webSc(SPACING.sm) },
  reviewFixSecondary: { flex: 1, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.sm, paddingVertical: webSc(SPACING.sm), alignItems: "center" },
  reviewFixSecondaryText: { color: COLORS.textSecondary, fontSize: webMs(FONT_SIZES.sm), fontWeight: "700" },
  reviewFixPrimary: { flex: 1, backgroundColor: COLORS.warning, borderRadius: RADIUS.sm, paddingVertical: webSc(SPACING.sm), alignItems: "center" },
  reviewFixPrimaryText: { color: COLORS.white, fontSize: webMs(FONT_SIZES.sm), fontWeight: "800" },
  reviewWarn: { backgroundColor: COLORS.warning + "18", borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.warning, padding: webSc(SPACING.md), marginBottom: webSc(SPACING.md) },
  reviewWarnHead: { color: COLORS.warning, fontSize: webMs(FONT_SIZES.sm), fontWeight: "800", marginBottom: webSc(SPACING.xs) },
  reviewWarnRow: { color: COLORS.text, fontSize: webMs(FONT_SIZES.sm), marginTop: 2 },
  reviewWarnNote: { color: COLORS.textSecondary, fontSize: webMs(FONT_SIZES.xs), marginTop: webSc(SPACING.sm), lineHeight: webMs(FONT_SIZES.xs + 4) },
  reviewExcluded: { backgroundColor: COLORS.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, padding: webSc(SPACING.md), marginBottom: webSc(SPACING.md) },
  reviewExcludedHead: { color: COLORS.textSecondary, fontSize: webMs(FONT_SIZES.xs), fontWeight: "800", textTransform: "uppercase", letterSpacing: 1, marginBottom: webSc(SPACING.xs) },
  reviewExcludedRow: { color: COLORS.text, fontSize: webMs(FONT_SIZES.sm), marginTop: 2 },
  reviewExcludedNote: { color: COLORS.textMuted, fontSize: webMs(FONT_SIZES.xs), marginTop: webSc(SPACING.sm), lineHeight: webMs(FONT_SIZES.xs + 4) },
  reviewCard: { flex: 1, backgroundColor: COLORS.background, borderRadius: RADIUS.md, padding: webSc(SPACING.md), alignItems: "center" },
  reviewValue: { color: COLORS.text, fontSize: webMs(FONT_SIZES.xl), fontWeight: "800" },
  reviewLabel: { color: COLORS.textSecondary, fontSize: webMs(FONT_SIZES.sm) },
  reviewSub: { color: COLORS.textMuted, fontSize: webMs(FONT_SIZES.xs) },

  // Review & Start — compact top summary
  revTop: { flexDirection: "row", backgroundColor: COLORS.background, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, paddingVertical: webSc(SPACING.sm), marginBottom: webSc(SPACING.md) },
  revStat: { flex: 1, alignItems: "center", gap: 2 },
  revStatNum: { color: COLORS.text, fontSize: webMs(FONT_SIZES.xl), fontWeight: "800" },
  revStatLbl: { color: COLORS.textSecondary, fontSize: webMs(FONT_SIZES.xs) },
  revStatSub: { color: COLORS.textMuted, fontSize: webMs(FONT_SIZES.xs) },
  // Review & Start — collapsible summary sections
  revSec: { backgroundColor: COLORS.background, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: webSc(SPACING.md), paddingVertical: webSc(SPACING.sm), marginBottom: webSc(SPACING.sm) },
  revSecHead: { flexDirection: "row", alignItems: "center", gap: webSc(SPACING.sm) },
  revSecMain: { flex: 1 },
  revSecTitleRow: { flexDirection: "row", alignItems: "center", gap: webSc(SPACING.xs) },
  revCaret: { color: COLORS.textMuted, fontSize: webMs(FONT_SIZES.sm) },
  revSecTitle: { color: COLORS.text, fontSize: webMs(FONT_SIZES.md), fontWeight: "700" },
  revSecSummary: { color: COLORS.textSecondary, fontSize: webMs(FONT_SIZES.sm), marginTop: 2 },
  revBadge: { paddingHorizontal: webSc(SPACING.sm), paddingVertical: 2, borderRadius: RADIUS.sm },
  revBadgeWarn: { backgroundColor: COLORS.warning + "22" },
  revBadgeError: { backgroundColor: COLORS.error + "22" },
  revBadgeText: { fontSize: webMs(FONT_SIZES.xs), fontWeight: "800" },
  revBadgeTextWarn: { color: COLORS.warning },
  revBadgeTextError: { color: COLORS.error },
  revActionBtn: { borderWidth: 1, borderColor: COLORS.primary, borderRadius: RADIUS.sm, paddingHorizontal: webSc(SPACING.sm), paddingVertical: webSc(SPACING.xs) },
  revActionText: { color: COLORS.primary, fontSize: webMs(FONT_SIZES.sm), fontWeight: "700" },
  revSecBody: { marginTop: webSc(SPACING.sm), paddingTop: webSc(SPACING.sm), borderTopWidth: 1, borderTopColor: COLORS.border },
  revKV: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: webSc(SPACING.md), paddingVertical: webSc(SPACING.xs) },
  revKVLabel: { color: COLORS.textSecondary, fontSize: webMs(FONT_SIZES.sm), flexShrink: 1 },
  revKVVal: { color: COLORS.text, fontSize: webMs(FONT_SIZES.sm), fontWeight: "600", flexShrink: 0 },
  revEmpty: { color: COLORS.textMuted, fontSize: webMs(FONT_SIZES.sm) },

  startBtn: { backgroundColor: COLORS.primary, borderRadius: RADIUS.md, paddingVertical: webSc(SPACING.md), alignItems: "center" },
  startBtnDisabled: { backgroundColor: COLORS.border },
  startBtnText: { color: "#fff", fontSize: webMs(FONT_SIZES.md), fontWeight: "700" },

  cardGrid: { flexDirection: "row", flexWrap: "wrap", gap: webSc(SPACING.sm) },

  // Dashboard control-center.
  dashTop: { flexDirection: "row", gap: webSc(SPACING.sm), marginBottom: webSc(SPACING.sm) },
  statBtn: { flex: 1, borderWidth: 1, borderRadius: RADIUS.lg, paddingVertical: webSc(SPACING.md), alignItems: "center", gap: 2 },
  statBtnIcon: { fontSize: webMs(FONT_SIZES.lg) },
  statBtnVal: { fontSize: webMs(FONT_SIZES.xxl), fontWeight: "900" },
  statBtnLbl: { color: COLORS.textSecondary, fontSize: 10, fontWeight: "800", textAlign: "center", textTransform: "uppercase", letterSpacing: 0.3 },
  // Chip Leader long card.
  leaderCard: { flexDirection: "row", alignItems: "center", gap: webSc(SPACING.md), backgroundColor: COLORS.warning + "14", borderWidth: 1, borderColor: COLORS.warning + "44", borderRadius: RADIUS.lg, paddingHorizontal: webSc(SPACING.md), paddingVertical: webSc(SPACING.md), marginBottom: webSc(SPACING.md) },
  leaderCrown: { fontSize: webMs(FONT_SIZES.xxl) },
  leaderKicker: { color: COLORS.warning, fontSize: 10, fontWeight: "900", letterSpacing: 0.5 },
  leaderName: { color: COLORS.text, fontSize: webMs(FONT_SIZES.md), fontWeight: "800", marginTop: 1 },
  leaderMeta: { color: COLORS.textSecondary, fontSize: webMs(FONT_SIZES.xs), fontWeight: "600", marginTop: 1 },
  leaderChev: { color: COLORS.warning, fontSize: webMs(FONT_SIZES.xl), fontWeight: "900" },
  // Distinct dashboard section wrapper (left accent bar + icon chip).
  dashSection: { backgroundColor: COLORS.backgroundCard, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, paddingHorizontal: webSc(SPACING.md), paddingBottom: webSc(SPACING.sm), marginBottom: webSc(SPACING.md) },
  dashSectionWeb: { marginBottom: SPACING.lg },
  dashSectionHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: webSc(SPACING.sm) },
  dashSectionTitleWrap: { flexDirection: "row", alignItems: "center", gap: 6 },
  dashSectionTitle: { color: COLORS.text, fontSize: webMs(FONT_SIZES.sm), fontWeight: "700" },
  noBorder: { borderBottomWidth: 0 },
  noBorderTop: { borderTopWidth: 0 },
  // Summary cards (3 equal).
  sumCardsRow: { flexDirection: "row", gap: webSc(SPACING.sm), marginBottom: webSc(SPACING.md) },
  // Desktop two-column dashboard: main content + fixed side column.
  dashCols: { flexDirection: "row", alignItems: "flex-start", gap: webSc(SPACING.md) },
  dashMain: { flex: 1, minWidth: 0 },
  dashSide: { width: 360 },
  sumCard: { flex: 1, backgroundColor: COLORS.backgroundCard, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, paddingVertical: webSc(SPACING.md), alignItems: "center", gap: 3 },
  sumCardVal: { color: COLORS.primary, fontSize: webMs(FONT_SIZES.xl), fontWeight: "800" },
  sumCardLbl: { color: COLORS.textMuted, fontSize: 10, fontWeight: "600", textAlign: "center", paddingHorizontal: 2 },
  // Chip leader neutral card.
  leaderCardN: { backgroundColor: COLORS.backgroundCard, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, paddingHorizontal: webSc(SPACING.md), paddingVertical: webSc(SPACING.sm), marginBottom: webSc(SPACING.md) },
  leaderHeadN: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 3 },
  leaderKickerN: { color: COLORS.textMuted, fontSize: 10, fontWeight: "700", letterSpacing: 0.3, textTransform: "uppercase" },
  leaderLinkN: { color: COLORS.primary, fontSize: webMs(FONT_SIZES.xs), fontWeight: "600" },
  leaderNameN: { color: COLORS.text, fontSize: webMs(FONT_SIZES.md), fontWeight: "700" },
  leaderMetaRowN: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 1 },
  leaderMetaN: { flex: 1, color: COLORS.textSecondary, fontSize: webMs(FONT_SIZES.xs) },
  leaderChipsN: { color: COLORS.primary, fontSize: webMs(FONT_SIZES.xs), fontWeight: "700" },
  // Champion + reshuffle-pending (neutral).
  champCard: { flexDirection: "row", alignItems: "center", gap: webSc(SPACING.sm), backgroundColor: COLORS.primary + "12", borderWidth: 1, borderColor: COLORS.primary + "40", borderRadius: RADIUS.md, paddingHorizontal: webSc(SPACING.md), paddingVertical: webSc(SPACING.md), marginBottom: webSc(SPACING.md) },
  completedStandingsBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: COLORS.primary + "14", borderWidth: 1, borderColor: COLORS.primary + "40", borderRadius: RADIUS.md, paddingVertical: webSc(SPACING.md), marginTop: webSc(SPACING.md) },
  completedStandingsText: { color: COLORS.primary, fontSize: webMs(FONT_SIZES.sm), fontWeight: "800" },
  completedWrap: { alignItems: "center", justifyContent: "center", paddingVertical: webSc(SPACING.xl), paddingHorizontal: webSc(SPACING.lg) },
  completedTitle: { color: COLORS.text, fontSize: webMs(FONT_SIZES.lg), fontWeight: "900", marginTop: webSc(SPACING.sm) },
  completedSub: { color: COLORS.textMuted, fontSize: webMs(FONT_SIZES.sm), marginTop: 2, textAlign: "center" },
  readOnlyNote: { color: COLORS.textMuted, fontSize: webMs(FONT_SIZES.xs), fontStyle: "italic", marginBottom: webSc(SPACING.sm), paddingHorizontal: webSc(SPACING.xs) },
  champTextWrap: { flex: 1, minWidth: 0 },
  champKicker: { color: COLORS.primary, fontSize: webMs(FONT_SIZES.xs), fontWeight: "800", letterSpacing: 0.5 },
  champText: { color: COLORS.text, fontSize: webMs(FONT_SIZES.md), fontWeight: "700" },
  champBtn: { backgroundColor: COLORS.primary, borderRadius: RADIUS.sm, paddingHorizontal: webSc(SPACING.md), paddingVertical: webSc(SPACING.sm) },
  champBtnDisabled: { opacity: 0.6 },
  champBtnText: { color: COLORS.white, fontSize: webMs(FONT_SIZES.sm), fontWeight: "700" },
  pendCard: { flexDirection: "row", alignItems: "center", gap: webSc(SPACING.md), backgroundColor: COLORS.backgroundCard, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, paddingHorizontal: webSc(SPACING.md), paddingVertical: webSc(SPACING.md), marginBottom: webSc(SPACING.md) },
  pendCardTitle: { color: COLORS.text, fontSize: webMs(FONT_SIZES.sm), fontWeight: "700" },
  pendCardSub: { color: COLORS.textMuted, fontSize: webMs(FONT_SIZES.xs), marginTop: 1 },
  secBtnSm: { borderWidth: 1, borderColor: COLORS.primary, borderRadius: RADIUS.sm, paddingHorizontal: webSc(SPACING.md), paddingVertical: 6 },
  secBtnSmText: { color: COLORS.primary, fontSize: webMs(FONT_SIZES.xs), fontWeight: "700" },
  // Alerts (no per-row icons).
  alertRow2: { flexDirection: "row", alignItems: "center", gap: webSc(SPACING.sm), paddingVertical: webSc(SPACING.sm), borderBottomWidth: 1, borderBottomColor: COLORS.border },
  alertText2: { color: COLORS.textSecondary, fontSize: webMs(FONT_SIZES.sm) },
  alertSub2: { color: COLORS.textMuted, fontSize: webMs(FONT_SIZES.xs), marginTop: 1 },
  alertUrgent: { color: COLORS.error, fontWeight: "600" },
  // Queue rows.
  qRow2: { flexDirection: "row", alignItems: "center", gap: webSc(SPACING.md), paddingVertical: webSc(SPACING.sm), borderTopWidth: 1, borderTopColor: COLORS.border },
  qPos2: { color: COLORS.textMuted, fontSize: webMs(FONT_SIZES.md), fontWeight: "700", width: webSc(22) },
  qNameCol: { flex: 1 },
  qName2: { color: COLORS.text, fontSize: webMs(FONT_SIZES.sm), fontWeight: "600" },
  qFargo2: { color: COLORS.textMuted, fontSize: webMs(FONT_SIZES.xs), marginTop: 1 },
  qRematchSkip: { color: COLORS.warning, fontSize: webMs(FONT_SIZES.xs), fontWeight: "700", marginTop: 1 },
  qRoundStatus: { fontSize: webMs(FONT_SIZES.xs), fontWeight: "700", marginTop: 1 },
  npSkipNote: { color: COLORS.warning, fontSize: webMs(FONT_SIZES.xs), fontWeight: "700", textAlign: "center", marginBottom: webSc(SPACING.xs) },
  qChipsRight: { color: COLORS.primary, fontSize: webMs(FONT_SIZES.sm), fontWeight: "700" },
  // Dashboard queue empty state + "View Full Queue" footer.
  qEmpty: { paddingVertical: webSc(SPACING.md) },
  qEmptyTitle: { color: COLORS.text, fontSize: webMs(FONT_SIZES.sm), fontWeight: "700", marginTop: webSc(SPACING.xs) },
  qEmptySub: { color: COLORS.textMuted, fontSize: webMs(FONT_SIZES.xs), marginTop: 2, lineHeight: webMs(FONT_SIZES.xs) * 1.4 },
  qViewAll: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: webSc(SPACING.md), marginTop: webSc(SPACING.xs), borderTopWidth: 1, borderTopColor: COLORS.border },
  qViewAllPressed: { opacity: 0.5 },
  qViewAllText: { color: COLORS.primary, fontSize: webMs(FONT_SIZES.sm), fontWeight: "800" },
  // Full-screen Queue modal.
  qModalRoot: { flex: 1, backgroundColor: COLORS.background },
  qFloatCard: { width: "100%", maxWidth: webSc(600), height: "82%", backgroundColor: COLORS.backgroundCard, borderRadius: 22, borderWidth: 1, borderColor: COLORS.borderLight, overflow: "hidden" },
  qModalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: webSc(SPACING.md), paddingVertical: webSc(SPACING.md), borderBottomWidth: 1, borderBottomColor: COLORS.border },
  qModalCancel: { color: COLORS.textSecondary, fontSize: webMs(FONT_SIZES.md), fontWeight: "600" },
  qModalTitle: { flex: 1, textAlign: "center", color: COLORS.text, fontSize: webMs(FONT_SIZES.md), fontWeight: "800" },
  qModalDone: { color: COLORS.primary, fontSize: webMs(FONT_SIZES.md), fontWeight: "800" },
  // Up Next + Queue section heading.
  qUpNext: { flexDirection: "row", alignItems: "center", gap: webSc(SPACING.sm), paddingHorizontal: webSc(SPACING.md), paddingVertical: webSc(SPACING.sm), backgroundColor: COLORS.surface },
  qUpNextLabel: { color: COLORS.textMuted, fontSize: webMs(FONT_SIZES.xs - 1), fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.4 },
  qUpNextName: { flex: 1, color: COLORS.text, fontSize: webMs(FONT_SIZES.md), fontWeight: "800" },
  qSectionHead: { paddingHorizontal: webSc(SPACING.md), paddingTop: webSc(SPACING.md), paddingBottom: webSc(SPACING.xs) },
  qSectionHeadText: { color: COLORS.textMuted, fontSize: webMs(FONT_SIZES.xs), fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.3 },
  qEmptyFull: { alignItems: "center", justifyContent: "center", gap: webSc(SPACING.sm), paddingHorizontal: webSc(SPACING.xl), paddingVertical: webSc(SPACING.xl) },
  // Compact native-style queue row (two lines).
  qmRow: { flexDirection: "row", alignItems: "center", gap: webSc(SPACING.sm), paddingHorizontal: webSc(SPACING.md), paddingVertical: webSc(SPACING.sm), borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.border },
  qmPos: { color: COLORS.textSecondary, fontSize: webMs(FONT_SIZES.lg), fontWeight: "800", width: webSc(24), textAlign: "center" },
  qmMain: { flex: 1 },
  qmLine1: { flexDirection: "row", alignItems: "center", gap: webSc(SPACING.sm) },
  qmName: { flex: 1, color: COLORS.text, fontSize: webMs(FONT_SIZES.sm), fontWeight: "700" },
  qmChips: { color: COLORS.primary, fontSize: webMs(FONT_SIZES.sm), fontWeight: "800" },
  qmMeta: { fontSize: webMs(FONT_SIZES.xs), marginTop: 1 },
  qmMetaFargo: { color: COLORS.textMuted },
  qmMetaDot: { color: COLORS.textMuted },
  qmWin: { color: COLORS.success, fontWeight: "800" },
  qmLoss: { color: COLORS.error, fontWeight: "800" },
  qmMenuBtn: { width: webSc(30), alignItems: "center", justifyContent: "center", alignSelf: "stretch" },
  // Active table rows.
  atCard: { paddingTop: webSc(SPACING.sm), paddingBottom: webSc(SPACING.md), borderBottomWidth: 1, borderBottomColor: COLORS.border },
  atGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", alignItems: "flex-start", overflow: "visible" },
  atCardWeb: {
    width: "48.5%",
    // Own all four borders explicitly so the base atCard's borderBottomColor
    // can't linger and leave the bottom edge a different color on hover.
    borderWidth: 1,
    borderColor: COLORS.border,
    borderTopWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderLeftWidth: 1,
    borderTopColor: COLORS.border,
    borderRightColor: COLORS.border,
    borderBottomColor: COLORS.border,
    borderLeftColor: COLORS.border,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.surface,
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.sm,
    marginBottom: SPACING.sm,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    ...(isWeb ? ({ cursor: "pointer", transitionProperty: "box-shadow,border-color", transitionDuration: "120ms" } as object) : null),
  },
  atCardUltra: { width: "32%" },
  atCardHover: {
    borderColor: COLORS.primary,
    borderTopColor: COLORS.primary,
    borderRightColor: COLORS.primary,
    borderBottomColor: COLORS.primary,
    borderLeftColor: COLORS.primary,
    shadowOpacity: 0.16,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  atNameRow: { flexDirection: "row", alignItems: "center" },
  atStreamIcon: { marginLeft: 4 },
  atHeader: { flexDirection: "row", alignItems: "center", gap: webSc(SPACING.sm) },
  atHeaderMain: { flex: 1 },
  atTableName: { color: COLORS.primary, fontSize: webMs(FONT_SIZES.md), fontWeight: "800" },
  atBadge: { flexDirection: "row", alignItems: "center", gap: 5 },
  atDot: { width: 8, height: 8, borderRadius: 4 },
  atBadgeText: { fontSize: webMs(FONT_SIZES.xs), fontWeight: "800", fontVariant: ["tabular-nums"] },
  atMatch: { alignItems: "center", marginTop: webSc(SPACING.sm) },
  atMatchTeam: { color: COLORS.text, fontSize: webMs(FONT_SIZES.sm), fontWeight: "700", textAlign: "center", lineHeight: webMs(FONT_SIZES.sm) * 1.3 },
  atVs: { color: COLORS.textMuted, fontSize: webMs(FONT_SIZES.xs - 1), fontWeight: "800", letterSpacing: 0.5, marginVertical: 2 },
  atMatchWaiting: { color: COLORS.textMuted, fontSize: webMs(FONT_SIZES.sm), fontWeight: "600", textAlign: "center" },
  // Pending future table-state note under the match (Removal/Locks after match).
  atPendingNote: { marginTop: webSc(SPACING.sm), alignSelf: "center", color: COLORS.warning, fontSize: webMs(FONT_SIZES.xs), fontWeight: "700" },
  atStartBtn: { marginTop: webSc(SPACING.sm), backgroundColor: COLORS.primary, borderRadius: RADIUS.md, paddingVertical: webSc(SPACING.sm), alignItems: "center" },
  atStartBtnText: { color: COLORS.white, fontSize: webMs(FONT_SIZES.sm), fontWeight: "800" },
  // Dashboard "View All Tables" row + the full-list modal shell.
  atViewAll: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, paddingVertical: webSc(SPACING.sm), marginTop: webSc(SPACING.xs) },
  atViewAllText: { color: COLORS.primary, fontSize: webMs(FONT_SIZES.sm), fontWeight: "800" },
  dashTablesCard: { backgroundColor: COLORS.backgroundCard, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.border, overflow: "hidden", maxWidth: 460, width: "100%" as any, maxHeight: "82%" as any, alignSelf: "center" as any },
  // Full-layer overlay for the in-modal table ⋮ menu (screen-absolute coords).
  dashMenuOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  dashTablesHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: webSc(SPACING.md), paddingVertical: webSc(SPACING.md), borderBottomWidth: 1, borderBottomColor: COLORS.border },
  dashTablesTitle: { color: COLORS.text, fontSize: webMs(FONT_SIZES.md), fontWeight: "800" },
  dashTablesDone: { color: COLORS.primary, fontSize: webMs(FONT_SIZES.md), fontWeight: "800" },
  // Next Match assignment popup.
  npTable: { color: COLORS.primary, fontSize: webMs(FONT_SIZES.lg), fontWeight: "900", textAlign: "center" },
  npHeading: { color: COLORS.textMuted, fontSize: webMs(FONT_SIZES.xs), fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.4, textAlign: "center", marginTop: 2 },
  npMatch: { alignItems: "center", marginTop: webSc(SPACING.md) },
  npStayRow: { flexDirection: "row", alignItems: "center", gap: webSc(SPACING.sm), maxWidth: "100%" },
  npStayName: { color: COLORS.text, fontSize: webMs(FONT_SIZES.md), fontWeight: "700", textAlign: "center", flexShrink: 1 },
  npStreak: { color: COLORS.warning, fontSize: webMs(FONT_SIZES.sm), fontWeight: "800" },
  npVsWrap: { width: webSc(34), height: webSc(34), borderRadius: webSc(17), borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface, alignItems: "center", justifyContent: "center", marginVertical: webSc(SPACING.sm) },
  npVs: { color: COLORS.textMuted, fontSize: webMs(FONT_SIZES.xs - 1), fontWeight: "800", letterSpacing: 0.5 },
  npIncomingLabel: { color: COLORS.primary, fontSize: webMs(FONT_SIZES.xs - 1), fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: webSc(SPACING.xs) },
  npIncomingBox: { alignSelf: "stretch", backgroundColor: COLORS.primary + "14", borderWidth: 1, borderColor: COLORS.primary + "44", borderRadius: RADIUS.md, paddingVertical: webSc(SPACING.sm), paddingHorizontal: webSc(SPACING.md), alignItems: "center" },
  npIncomingName: { color: COLORS.text, fontSize: webMs(FONT_SIZES.lg), fontWeight: "900", textAlign: "center" },
  npStartBtn: { marginTop: webSc(SPACING.lg), backgroundColor: COLORS.primary, borderRadius: RADIUS.md, paddingVertical: webSc(SPACING.md), alignItems: "center" },
  npStartText: { color: COLORS.white, fontSize: webMs(FONT_SIZES.md), fontWeight: "800" },
  npNotYet: { marginTop: webSc(SPACING.sm), paddingVertical: webSc(SPACING.sm), alignItems: "center" },
  npNotYetText: { color: COLORS.textSecondary, fontSize: webMs(FONT_SIZES.sm), fontWeight: "700" },
  // Champion confirmation modal
  champWinTrophy: { fontSize: webMs(40), textAlign: "center" },
  champWinKicker: { color: COLORS.primary, fontSize: webMs(FONT_SIZES.xs), fontWeight: "800", letterSpacing: 0.6, textAlign: "center", marginTop: webSc(SPACING.sm) },
  champWinName: { color: COLORS.text, fontSize: webMs(FONT_SIZES.xl), fontWeight: "900", textAlign: "center", marginTop: webSc(SPACING.xs) },
  champWinSub: { color: COLORS.textMuted, fontSize: webMs(FONT_SIZES.sm), textAlign: "center", marginTop: 2 },
  champWinPrimary: { marginTop: webSc(SPACING.lg), backgroundColor: COLORS.primary, borderRadius: RADIUS.md, paddingVertical: webSc(SPACING.md), alignItems: "center" },
  champWinPrimaryText: { color: COLORS.white, fontSize: webMs(FONT_SIZES.md), fontWeight: "800" },
  champWinSecondary: { marginTop: webSc(SPACING.sm), paddingVertical: webSc(SPACING.sm), alignItems: "center" },
  champWinSecondaryText: { color: COLORS.textSecondary, fontSize: webMs(FONT_SIZES.sm), fontWeight: "700" },
  // Chip leaders rows.
  clRow: { flexDirection: "row", alignItems: "center", gap: webSc(SPACING.sm), paddingVertical: webSc(SPACING.sm), borderTopWidth: 1, borderTopColor: COLORS.border, paddingHorizontal: webSc(SPACING.xs) },
  clRowTop: { borderTopWidth: 0, backgroundColor: COLORS.surface, borderRadius: RADIUS.sm },
  clRank: { color: COLORS.textMuted, fontSize: webMs(FONT_SIZES.sm), fontWeight: "700", width: webSc(22) },
  clName: { flex: 1, color: COLORS.text, fontSize: webMs(FONT_SIZES.sm), fontWeight: "600" },
  clChips: { color: COLORS.primary, fontSize: webMs(FONT_SIZES.sm), fontWeight: "700" },
  // Queue team rows (full names).
  qTeamRow: { flexDirection: "row", gap: webSc(SPACING.md), paddingVertical: webSc(SPACING.sm), borderBottomWidth: 1, borderBottomColor: COLORS.border },
  qTeamPos: { color: COLORS.primaryLight, fontSize: webMs(FONT_SIZES.lg), fontWeight: "900", width: webSc(24) },
  qTeamInfo: { flex: 1 },
  qTeamP1: { color: COLORS.text, fontSize: webMs(FONT_SIZES.sm), fontWeight: "800" },
  qTeamP2: { color: COLORS.text, fontSize: webMs(FONT_SIZES.sm), fontWeight: "800" },
  qTeamFargo: { color: COLORS.textSecondary, fontSize: webMs(FONT_SIZES.xs), marginTop: 1 },
  qTeamChips: { color: COLORS.primaryLight, fontWeight: "800" },
  qTeamSkip: { color: COLORS.warning, fontSize: webMs(FONT_SIZES.xs), fontWeight: "700", marginTop: 3 },
  dashTableLive: { borderColor: COLORS.success + "66" },
  alertRow: { flexDirection: "row", alignItems: "center", gap: webSc(SPACING.sm), paddingVertical: webSc(SPACING.sm), borderBottomWidth: 1, borderBottomColor: COLORS.border },
  alertIcon: { fontSize: webMs(FONT_SIZES.md), width: webSc(24), textAlign: "center" },
  alertText: { flex: 1, color: COLORS.textSecondary, fontSize: webMs(FONT_SIZES.sm) },
  alertWarn: { color: COLORS.warning, fontWeight: "700" },
  alertCta: { borderWidth: 1, borderColor: COLORS.warning, borderRadius: RADIUS.sm, paddingHorizontal: webSc(SPACING.sm), paddingVertical: 4 },
  alertCtaText: { color: COLORS.warning, fontSize: webMs(FONT_SIZES.xs), fontWeight: "800" },
  dashRow: { flexDirection: "row", alignItems: "center", gap: webSc(SPACING.sm), paddingVertical: webSc(SPACING.sm), borderBottomWidth: 1, borderBottomColor: COLORS.border },
  dashRowNum: { color: COLORS.textMuted, fontSize: webMs(FONT_SIZES.sm), fontWeight: "800", width: webSc(24) },
  dashRowTop: { color: COLORS.warning },
  dashRowName: { flex: 1, color: COLORS.text, fontSize: webMs(FONT_SIZES.sm), fontWeight: "700" },
  dashRowMeta: { color: COLORS.textSecondary, fontSize: webMs(FONT_SIZES.xs), fontWeight: "700" },
  dashRowChips: { color: COLORS.primaryLight },
  dashMore: { paddingVertical: webSc(SPACING.sm), alignItems: "center" },
  dashMoreText: { color: COLORS.primary, fontSize: webMs(FONT_SIZES.sm), fontWeight: "800" },
  dashTable: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, paddingHorizontal: webSc(SPACING.md), paddingVertical: webSc(SPACING.sm), marginBottom: webSc(SPACING.xs) },
  dashTableHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  dashTableLabel: { color: COLORS.text, fontSize: webMs(FONT_SIZES.sm), fontWeight: "800" },
  dashLive: { color: COLORS.error, fontSize: webMs(FONT_SIZES.sm), fontWeight: "800", fontVariant: ["tabular-nums"] },
  dashTableVs: { color: COLORS.textSecondary, fontSize: webMs(FONT_SIZES.sm), marginTop: 2 },
  actCard: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, paddingHorizontal: webSc(SPACING.md) },
  actRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: webSc(SPACING.sm) },
  actRowDiv: { borderTopWidth: 1, borderTopColor: COLORS.border },
  actStatGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" },
  actItemWeb: { width: "48%", borderBottomWidth: 1, borderBottomColor: COLORS.border },
  actLbl: { color: COLORS.textSecondary, fontSize: webMs(FONT_SIZES.sm) },
  actVal: { color: COLORS.text, fontSize: webMs(FONT_SIZES.sm), fontWeight: "800" },

  // Summary recap (grouped cards).
  sumHeader: { color: COLORS.text, fontSize: webMs(FONT_SIZES.xl), fontWeight: "900", textAlign: "center", marginTop: webSc(SPACING.sm) },
  sumSubHeader: { color: COLORS.textMuted, fontSize: webMs(FONT_SIZES.sm), textAlign: "center", marginBottom: webSc(SPACING.md) },
  sumGroup: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.lg, paddingHorizontal: webSc(SPACING.md), paddingVertical: webSc(SPACING.xs), marginBottom: webSc(SPACING.md) },
  sumGroupTitle: { color: COLORS.primaryLight, fontSize: webMs(FONT_SIZES.xs), fontWeight: "800", letterSpacing: 0.5, paddingVertical: webSc(SPACING.sm) },
  sumRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: webSc(SPACING.sm), paddingVertical: webSc(SPACING.sm) },
  sumRowDiv: { borderTopWidth: 1, borderTopColor: COLORS.border },
  sumLbl: { flexShrink: 1, color: COLORS.textSecondary, fontSize: webMs(FONT_SIZES.sm) },
  sumVal: { flex: 1, minWidth: 0, color: COLORS.text, fontSize: webMs(FONT_SIZES.sm), fontWeight: "800", textAlign: "right" },
  sumMedal: { color: COLORS.text, fontSize: webMs(FONT_SIZES.md), fontWeight: "800", width: webSc(34) },
  sumStandName: { flex: 1, minWidth: 0, color: COLORS.text, fontSize: webMs(FONT_SIZES.sm), fontWeight: "700" },
  sumRecord: { color: COLORS.text, fontSize: webMs(FONT_SIZES.sm), fontWeight: "800", flexShrink: 0, textAlign: "right" },
  // Payout breakdown: fixed place + fixed amount, flexible truncating team name.
  payPlace: { width: webSc(40), color: COLORS.textSecondary, fontSize: webMs(FONT_SIZES.sm), fontWeight: "800" },
  payName: { flex: 1, minWidth: 0, color: COLORS.text, fontSize: webMs(FONT_SIZES.sm), fontWeight: "700" },
  payAmt: { color: COLORS.primary, fontSize: webMs(FONT_SIZES.md), fontWeight: "900", flexShrink: 0, textAlign: "right" },
  sumStandToggle: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, paddingVertical: webSc(SPACING.sm), marginTop: webSc(SPACING.xs) },
  sumStandToggleText: { color: COLORS.primary, fontSize: webMs(FONT_SIZES.sm), fontWeight: "700" },
  exportBtn: { backgroundColor: COLORS.primary, borderRadius: RADIUS.md, paddingVertical: webSc(SPACING.md), alignItems: "center", marginTop: webSc(SPACING.xs), marginBottom: webSc(SPACING.lg) },
  exportBtnText: { color: COLORS.white, fontSize: webMs(FONT_SIZES.md), fontWeight: "800" },
  statCard: { backgroundColor: COLORS.background, borderRadius: RADIUS.md, padding: webSc(SPACING.md), alignItems: "center", minWidth: 90, flexGrow: 1 },
  statValue: { color: COLORS.text, fontSize: webMs(FONT_SIZES.xl), fontWeight: "800" },
  statLabel: { color: COLORS.textSecondary, fontSize: webMs(FONT_SIZES.xs) },

  liveTable: { backgroundColor: COLORS.background, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, padding: webSc(SPACING.sm), marginBottom: webSc(SPACING.sm) },
  liveTableLong: { borderColor: COLORS.error, backgroundColor: COLORS.error + "11" },
  liveTableHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: webSc(SPACING.xs) },
  timer: { color: COLORS.textSecondary, fontSize: webMs(FONT_SIZES.md), fontWeight: "700", fontVariant: ["tabular-nums"] },
  timerLong: { color: COLORS.error },
  openTag: { color: COLORS.textMuted, fontSize: webMs(FONT_SIZES.sm) },
  matchBody: { flexDirection: "row", alignItems: "center", gap: 8 },
  vs: { color: COLORS.textMuted, fontSize: webMs(FONT_SIZES.sm), fontWeight: "700" },
  winnerBtn: { flex: 1, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.primary, borderRadius: RADIUS.md, padding: webSc(SPACING.sm), alignItems: "center" },
  winnerName: { color: COLORS.text, fontSize: webMs(FONT_SIZES.sm), fontWeight: "700", textAlign: "center" },
  winnerMeta: { color: COLORS.textSecondary, fontSize: webMs(FONT_SIZES.xs), marginTop: 2 },
  winnerTap: { color: COLORS.primary, fontSize: webMs(FONT_SIZES.xs), marginTop: 2 },

  queueRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: webSc(SPACING.xs), borderBottomWidth: 1, borderBottomColor: COLORS.border },
  queuePos: { color: COLORS.textMuted, fontSize: webMs(FONT_SIZES.sm), fontWeight: "700", width: 22 },
  queueName: { color: COLORS.text, fontSize: webMs(FONT_SIZES.sm), fontWeight: "600", flex: 1 },
  queueMeta: { color: COLORS.textSecondary, fontSize: webMs(FONT_SIZES.xs) },

  // Live Players row: two-line stack (name / scannable stats) with generous
  // vertical rhythm; the ⋮ stays centered and never collides with a long name.
  playerRow: { flexDirection: "row", alignItems: "center", gap: webSc(SPACING.sm), paddingVertical: webSc(SPACING.sm), borderBottomWidth: 1, borderBottomColor: COLORS.border },
  playerName: { color: COLORS.text, fontSize: webMs(FONT_SIZES.md), fontWeight: "700" },
  playerOut: { color: COLORS.error, textDecorationLine: "line-through" },
  playerMeta: { color: COLORS.textSecondary, fontSize: webMs(FONT_SIZES.xs), marginTop: webSc(4) },
  playerMetaOut: { color: COLORS.error, opacity: 0.8 },
  // Meta segments — chips emphasized, record neutral, status colour-coded so the
  // three values are quick to scan without turning the row into a card.
  playerChips: { color: COLORS.text, fontWeight: "700" },
  playerRecord: { color: COLORS.textSecondary, fontWeight: "600", fontVariant: ["tabular-nums"] },
  playerMetaSep: { color: COLORS.textMuted },
  playerStatusPlaying: { color: COLORS.success, fontWeight: "700" },
  playerStatusIdle: { color: COLORS.textMuted, fontWeight: "600" },
  chipStep: { width: 28, height: 28, borderRadius: 14, borderWidth: 1, borderColor: COLORS.border, alignItems: "center", justifyContent: "center" },
  chipStepText: { color: COLORS.text, fontSize: webMs(FONT_SIZES.md), fontWeight: "700" },
  playerMenuBtn: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  // Active Table card kebab: the hit target and the visible chip are separated.
  // atMenuHit is an invisible ~40×40 click area (negative margin keeps the compact
  // header height); atMenuBg is the small 24×24 chip that actually shows — faint by
  // default, lighter on hover, blue on press. Secondary control, not the focus.
  atMenuHit: { width: 40, height: 40, alignItems: "center", justifyContent: "center", marginVertical: -8, marginRight: -6, ...(isWeb ? ({ cursor: "pointer" } as object) : null) },
  atMenuBg: { width: 24, height: 24, borderRadius: 7, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.text + "0D", ...(isWeb ? ({ transitionProperty: "background-color", transitionDuration: "120ms" } as object) : null) },
  atMenuBgHover: { backgroundColor: COLORS.text + "1A" },
  atMenuBgPressed: { backgroundColor: COLORS.primary + "26" },
  // Anchored ⋮ dropdown
  ddBackdrop: { flex: 1 },
  // Wider so table-level labels ("Close After Current Match") fit on one line; still
  // safely on-screen on small iPhones (placeMenu clamps using this same width, 270).
  ddCard: { position: "absolute", width: webSc(270), backgroundColor: COLORS.backgroundCard, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.borderLight, paddingVertical: webSc(SPACING.xs), shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 8 },
  ddName: { color: COLORS.textMuted, fontSize: webMs(FONT_SIZES.xs - 1), fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.3, paddingHorizontal: webSc(SPACING.md), paddingTop: webSc(SPACING.xs), paddingBottom: webSc(SPACING.xs) },
  ddRow: { flexDirection: "row", alignItems: "center", gap: webSc(SPACING.sm), paddingVertical: webSc(SPACING.sm), paddingHorizontal: webSc(SPACING.md), borderTopWidth: 1, borderTopColor: COLORS.border },
  ddRowLast: {},
  ddRowText: { color: COLORS.text, fontSize: webMs(FONT_SIZES.sm), fontWeight: "600", flex: 1 },
  buyBackBtn: { borderWidth: 1, borderColor: COLORS.success, borderRadius: RADIUS.sm, paddingVertical: 4, paddingHorizontal: 10 },
  buyBackText: { color: COLORS.success, fontSize: webMs(FONT_SIZES.sm), fontWeight: "700" },
  restoreBtn: { borderWidth: 1, borderColor: COLORS.primary, borderRadius: RADIUS.sm, paddingVertical: 4, paddingHorizontal: 10 },
  restoreText: { color: COLORS.primary, fontSize: webMs(FONT_SIZES.sm), fontWeight: "700" },

  secondaryBtn: { flex: 1, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, paddingVertical: webSc(SPACING.sm), alignItems: "center" },
  secondaryBtnText: { color: COLORS.text, fontSize: webMs(FONT_SIZES.sm), fontWeight: "600" },
  dangerBtn: { borderColor: COLORS.error },
  dangerText: { color: COLORS.error },
  champ: { color: COLORS.warning, fontSize: webMs(FONT_SIZES.lg), fontWeight: "800", textAlign: "center", marginVertical: webSc(SPACING.sm) },
  // Winner-decided finish banner (Live dashboard) + Reopen (Results).
  finishBanner: { backgroundColor: COLORS.warning + "1A", borderWidth: 1, borderColor: COLORS.warning + "55", borderRadius: RADIUS.lg, paddingHorizontal: webSc(SPACING.md), paddingVertical: webSc(SPACING.md), marginBottom: webSc(SPACING.md), gap: webSc(SPACING.sm) },
  finishBtn: { backgroundColor: COLORS.success, borderRadius: RADIUS.md, paddingVertical: webSc(SPACING.md), alignItems: "center" },
  finishBtnText: { color: COLORS.white, fontSize: webMs(FONT_SIZES.md), fontWeight: "800" },
  reopenBtn: { marginTop: webSc(SPACING.sm), borderWidth: 1, borderColor: COLORS.primary, borderRadius: RADIUS.md, paddingVertical: webSc(SPACING.md), alignItems: "center" },
  reopenBtnText: { color: COLORS.primary, fontSize: webMs(FONT_SIZES.md), fontWeight: "800" },

  // Reshuffle-pending banner + inline note.
  pendBanner: { backgroundColor: COLORS.primary + "18", borderWidth: 1, borderColor: COLORS.primary + "55", borderRadius: RADIUS.lg, padding: webSc(SPACING.md), marginBottom: webSc(SPACING.md), gap: webSc(SPACING.xs) },
  pendTitle: { color: COLORS.primaryLight, fontSize: webMs(FONT_SIZES.md), fontWeight: "800" },
  pendSub: { color: COLORS.textSecondary, fontSize: webMs(FONT_SIZES.sm) },
  pendCancel: { alignSelf: "flex-start", marginTop: webSc(SPACING.xs), borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, paddingHorizontal: webSc(SPACING.md), paddingVertical: webSc(SPACING.sm) },
  pendCancelText: { color: COLORS.textSecondary, fontSize: webMs(FONT_SIZES.sm), fontWeight: "700" },
  pendInline: { backgroundColor: COLORS.primary + "14", borderRadius: RADIUS.md, padding: webSc(SPACING.sm), marginBottom: webSc(SPACING.sm) },
  pendInlineText: { color: COLORS.primaryLight, fontSize: webMs(FONT_SIZES.sm), fontWeight: "600" },

  // Reduce-tables recommendation banner.
  recBanner: { backgroundColor: COLORS.warning + "14", borderWidth: 1, borderColor: COLORS.warning + "55", borderRadius: RADIUS.lg, padding: webSc(SPACING.md), marginBottom: webSc(SPACING.md), gap: webSc(SPACING.sm) },
  recBannerText: { color: COLORS.text, fontSize: webMs(FONT_SIZES.sm), lineHeight: webMs(FONT_SIZES.md) * 1.3 },
  recBannerNum: { color: COLORS.warning, fontWeight: "900" },
  recBannerBtns: { flexDirection: "row", gap: webSc(SPACING.sm) },
  recKeep: { flex: 1, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, paddingVertical: webSc(SPACING.sm), alignItems: "center" },
  recKeepText: { color: COLORS.textSecondary, fontSize: webMs(FONT_SIZES.sm), fontWeight: "700" },
  recReduce: { flex: 1, backgroundColor: COLORS.warning, borderRadius: RADIUS.md, paddingVertical: webSc(SPACING.sm), alignItems: "center" },
  recReduceText: { color: COLORS.white, fontSize: webMs(FONT_SIZES.sm), fontWeight: "800" },

  btnDisabledLite: { opacity: 0.45 },

  // ── Tables master/detail ─────────────────────────────────────────────────────
  // Two equal columns per row → a clean 2×2 grid. Every control is flex:1 with the
  // same height/radius/padding; only the colors differ (purpose/state).
  // ── Shared 2-column toolbar layout ─────────────────────────────────────────
  // The COLUMN WIDTHS are owned here, one level above the controls. Both toolbar
  // rows use the exact same tbRow (two cells + one gap) and tbCol (equal flex
  // cell), so Row 1 (Add Table | Shuffle) and Row 2 (Card/List | Sort) split at
  // the identical point. The controls never participate in the flex split — each
  // just fills its cell via tbCtrl (width:100%), so their differing content can no
  // longer skew the geometry.
  tbRow: { flexDirection: "row", alignSelf: "stretch", gap: webSc(SPACING.sm), marginBottom: webSc(SPACING.sm) },
  // Row 2 has no bottom margin: the gap to the list + the divider are owned by the
  // sticky wrapper (stickyToolbar), so the pinned bar ends cleanly under Row 2.
  tbRow2: { marginBottom: 0 },
  // Pinned toolbar wrapper (sticky header in embedded mode). Solid page-colored bg +
  // hairline divider so scrolling table rows never bleed through; zIndex keeps it
  // above the list. Standalone reuses it purely as a static wrapper (same look).
  stickyToolbar: { backgroundColor: COLORS.background, paddingBottom: webSc(SPACING.sm), borderBottomWidth: 1, borderBottomColor: COLORS.border, zIndex: 10 },
  // Live → Tables self-owned scroll (embedded): fills the host's fill-height slot and
  // reproduces the page padding the shared host ScrollView used to supply.
  liveTablesFlex: { flex: 1 },
  liveTablesScrollInner: { paddingHorizontal: webSc(SPACING.md), paddingTop: webSc(SPACING.md), paddingBottom: webSc(SPACING.xl * 2) },
  liveTablesList: { paddingTop: webSc(SPACING.md) },
  // Embedded chip LIVE pages own their scrolling in the host's fill-height slot.
  embeddedLiveFlex: { flex: 1 },
  // Dashboard/Queue/Players (flat content) scroll wrapper — same padding the shared
  // host page ScrollView used to supply via its content contentContainerStyle.
  embeddedLiveScrollInner: { paddingHorizontal: webSc(SPACING.md), paddingTop: webSc(SPACING.md), paddingBottom: webSc(SPACING.xl * 2) },
  // Shuffle confirm modal.
  shufMSub: { color: COLORS.textSecondary, fontSize: webMs(FONT_SIZES.sm), marginTop: webSc(4) },
  shufMMetaRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: webSc(SPACING.xs), marginTop: webSc(SPACING.sm) },
  shufMMeta: { color: COLORS.text, fontSize: webMs(FONT_SIZES.sm), fontWeight: "700" },
  shufMRec: { color: COLORS.primary, fontSize: webMs(FONT_SIZES.sm), fontWeight: "700" },
  shufMWarn: { color: COLORS.warning, fontSize: webMs(FONT_SIZES.xs), fontWeight: "700", marginTop: webSc(SPACING.xs) },
  shufMSection: { color: COLORS.text, fontSize: webMs(FONT_SIZES.md), fontWeight: "800", marginTop: webSc(SPACING.md) },
  shufMHint: { color: COLORS.textMuted, fontSize: webMs(FONT_SIZES.xs), marginTop: webSc(2), marginBottom: webSc(SPACING.xs) },
  shufMStream: { color: COLORS.error, fontSize: webMs(FONT_SIZES.xs), fontWeight: "700" },
  shufMSummary: { marginTop: webSc(SPACING.sm), borderTopWidth: 1, borderTopColor: COLORS.border, paddingTop: webSc(SPACING.sm), gap: webSc(2) },
  shufMSummaryText: { color: COLORS.text, fontSize: webMs(FONT_SIZES.sm), fontWeight: "700" },
  shufMSummaryRemoving: { color: COLORS.warning, fontSize: webMs(FONT_SIZES.xs), fontWeight: "600" },
  // Shuffle animation (cosmetic) — 9-ball rack on a FULLY OPAQUE dark surface that
  // completely hides (and blocks taps to) the dashboard/queue/tables behind it while
  // the redraw happens; only the balls + "Shuffling…" show until it finishes.
  shufAnimBackdrop: { flex: 1, backgroundColor: COLORS.background, alignItems: "center", justifyContent: "center" },
  shufAnimRoot: { alignItems: "center", justifyContent: "center" },
  shufBallCluster: { width: 160, height: 160 },
  shufBall: { position: "absolute", width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  shufBallDot: { width: 16, height: 16, borderRadius: 8, backgroundColor: "rgba(255,255,255,0.94)", alignItems: "center", justifyContent: "center" },
  shufBallNum: { color: "#111", fontSize: 9, fontWeight: "900" },
  shufAnimLabel: { color: COLORS.white, fontSize: webMs(FONT_SIZES.md), fontWeight: "800", marginTop: webSc(SPACING.xl), letterSpacing: 0.5 },
  // Column cell owns the width: each is (rowWidth − gap) / 2. Plain View, no
  // border/bg/padding; minWidth:0 so a control's content can never widen it.
  tbCol: { flexGrow: 1, flexBasis: 0, flexShrink: 1, minWidth: 0 },
  // Control shell: fills its cell (width:100%) at one fixed height, so all four
  // controls are geometrically identical regardless of their content.
  tbCtrl: {
    width: "100%",
    height: webSc(46),
    borderWidth: 1,
    borderRadius: RADIUS.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingHorizontal: webSc(SPACING.sm),
  },
  // Segmented wrapper: fills its cell; two halves sit flush (gap:0) and stretch to
  // full control height so each splits the inner width evenly and taps anywhere.
  tblSeg: { backgroundColor: COLORS.surface, borderColor: COLORS.border, overflow: "hidden", alignItems: "stretch", gap: 0, paddingHorizontal: 0 },
  tblSegBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingHorizontal: webSc(SPACING.sm) },
  tblSegBtnOn: { backgroundColor: COLORS.primary + "22" },
  tblSegText: { color: COLORS.textSecondary, fontSize: webMs(FONT_SIZES.sm), fontWeight: "700" },
  tblSegTextOn: { color: COLORS.primary },
  // Sort trigger: fills the full shared cell (not content-sized); icon/text/chevron
  // centered via the cell's justifyContent:"center".
  tblSortBtn: { backgroundColor: COLORS.surface, borderColor: COLORS.border },
  tblSortText: { color: COLORS.text, fontSize: webMs(FONT_SIZES.sm), fontWeight: "700" },
  // List View thin row.
  tlRow: { flexDirection: "row", alignItems: "center", gap: webSc(SPACING.sm), paddingVertical: webSc(SPACING.sm), borderBottomWidth: 1, borderBottomColor: COLORS.border },
  tlName: { color: COLORS.primaryLight, fontSize: webMs(FONT_SIZES.sm), fontWeight: "800", width: webSc(72) },
  tlMid: { flex: 1, minWidth: 0 },
  tlStatus: { fontSize: webMs(FONT_SIZES.xs), fontWeight: "700" },
  tlMatch: { color: COLORS.text, fontSize: webMs(FONT_SIZES.sm), fontWeight: "600", marginTop: 2 },
  tlMenu: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  // Clean toolbar buttons — colors only; the outer box comes from the shared
  // tbCtrl shell so these line up exactly with the Card/List + Sort row beneath.
  tbAddBtn: { backgroundColor: COLORS.primary + "18", borderColor: COLORS.primary },
  tbAddText: { color: COLORS.primary, fontSize: webMs(FONT_SIZES.sm), fontWeight: "700" },
  tbReshufBtn: { backgroundColor: COLORS.surface, borderColor: COLORS.border },
  tbReshufBtnOn: { borderColor: COLORS.primary, backgroundColor: COLORS.primary + "18" },
  tbReshufText: { color: COLORS.text, fontSize: webMs(FONT_SIZES.sm), fontWeight: "700" },
  // "Start All" (opening kickoff) — a prominent filled button that replaces the
  // Shuffle Mode control until the tournament's first matches have started.
  tbStartAllBtn: { borderColor: COLORS.success, backgroundColor: COLORS.success },
  tbStartAllText: { color: COLORS.white },

  // Shuffle Mode banner
  shufBanner: { backgroundColor: COLORS.backgroundCard, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, paddingHorizontal: webSc(SPACING.md), paddingVertical: webSc(SPACING.md), marginBottom: webSc(SPACING.md) },
  shufHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  shufTitleWrap: { flexDirection: "row", alignItems: "center", gap: 6 },
  shufTitle: { color: COLORS.text, fontSize: webMs(FONT_SIZES.md), fontWeight: "800" },
  shufState: { fontSize: webMs(FONT_SIZES.sm), fontWeight: "700", marginTop: webSc(SPACING.xs) },
  shufCount: { color: COLORS.text, fontSize: webMs(FONT_SIZES.md), fontWeight: "800", marginTop: webSc(SPACING.xs) },
  shufSub: { color: COLORS.textMuted, fontSize: webMs(FONT_SIZES.xs), marginTop: 2, lineHeight: webMs(FONT_SIZES.xs) * 1.4 },
  shufRec: { color: COLORS.primary, fontSize: webMs(FONT_SIZES.sm), fontWeight: "700", marginTop: webSc(SPACING.sm) },
  shufPrimary: { marginTop: webSc(SPACING.sm), minHeight: webSc(44), borderRadius: RADIUS.md, backgroundColor: COLORS.primary, alignItems: "center", justifyContent: "center" },
  shufPrimaryWeb: { alignSelf: "center", width: 260, marginTop: SPACING.xs, ...(isWeb ? ({ cursor: "pointer" } as object) : null) },
  shufPrimarySm: { flex: 1, minHeight: webSc(44), borderRadius: RADIUS.md, backgroundColor: COLORS.primary, alignItems: "center", justifyContent: "center", paddingHorizontal: webSc(SPACING.sm) },
  shufPrimaryText: { color: COLORS.white, fontSize: webMs(FONT_SIZES.sm), fontWeight: "800" },
  shufBtnRow: { flexDirection: "row", alignItems: "stretch", gap: webSc(SPACING.sm), marginTop: webSc(SPACING.sm) },
  shufGhost: { flex: 1, minHeight: webSc(44), borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, alignItems: "center", justifyContent: "center", paddingHorizontal: webSc(SPACING.sm) },
  shufGhostText: { color: COLORS.text, fontSize: webMs(FONT_SIZES.sm), fontWeight: "700" },
  shufCancel: { marginTop: webSc(SPACING.sm), alignItems: "center", paddingVertical: webSc(SPACING.xs) },
  shufCancelText: { color: COLORS.error, fontSize: webMs(FONT_SIZES.xs), fontWeight: "700" },
  // Compact neutral recommendation banner.
  recNeutral: { flexDirection: "row", alignItems: "center", gap: webSc(SPACING.md), backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderLeftWidth: 3, borderLeftColor: COLORS.warning, borderRadius: RADIUS.md, paddingHorizontal: webSc(SPACING.md), paddingVertical: webSc(SPACING.sm), marginBottom: webSc(SPACING.md) },
  recNeutralTitle: { color: COLORS.text, fontSize: webMs(FONT_SIZES.sm), fontWeight: "700" },
  recNeutralSub: { color: COLORS.textMuted, fontSize: webMs(FONT_SIZES.xs), marginTop: 1 },
  recNeutralAction: { color: COLORS.warning, fontSize: webMs(FONT_SIZES.sm), fontWeight: "800" },
  // Compact table card.
  tCard: { backgroundColor: COLORS.backgroundCard, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, paddingHorizontal: webSc(SPACING.md), paddingVertical: webSc(SPACING.sm), marginBottom: webSc(SPACING.sm) },
  tCardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: webSc(SPACING.sm) },
  tCardName: { flex: 1, color: COLORS.text, fontSize: webMs(FONT_SIZES.md), fontWeight: "800" },
  tCardStatus: { flexDirection: "row", alignItems: "center", gap: 5 },
  tCardDot: { width: 8, height: 8, borderRadius: 4 },
  tCardStatusText: { fontSize: webMs(FONT_SIZES.xs), fontWeight: "700", fontVariant: ["tabular-nums"] },
  tCardTeam: { marginTop: webSc(SPACING.xs) },
  tCardPlayer: { color: COLORS.text, fontSize: webMs(FONT_SIZES.sm), fontWeight: "600", lineHeight: webMs(FONT_SIZES.sm) * 1.35 },
  tCardFargo: { color: COLORS.textMuted, fontSize: webMs(FONT_SIZES.xs), marginTop: 2 },
  tCardEmpty: { color: COLORS.textMuted, fontSize: webMs(FONT_SIZES.sm), fontStyle: "italic", marginTop: webSc(SPACING.xs) },
  tCardSub: { color: COLORS.textSecondary, fontSize: webMs(FONT_SIZES.xs), marginTop: webSc(SPACING.xs) },
  tCardDelete: { alignSelf: "flex-end", marginTop: webSc(SPACING.xs), padding: 4 },

  // ── Table detail (info-first) ────────────────────────────────────────────────
  tdName: { color: COLORS.text, fontSize: webMs(FONT_SIZES.lg), fontWeight: "800" },
  tdHeadRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: webSc(SPACING.sm) },
  tdStatusBadge: { flexShrink: 1, flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.full, paddingHorizontal: webSc(SPACING.sm), paddingVertical: 4 },
  tdStatusText: { flexShrink: 1, fontSize: webMs(FONT_SIZES.xs), fontWeight: "800", fontVariant: ["tabular-nums"] },
  // Current matchup
  tdMatch: { alignItems: "center", marginTop: webSc(SPACING.md), marginBottom: webSc(SPACING.sm) },
  // Per-player mini-card in the table-detail matchup: name (anchor), Fargo (secondary),
  // chips (right, accent). Compact — one short row of meta under the name.
  tdpCard: { alignSelf: "stretch", backgroundColor: COLORS.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: webSc(SPACING.md), paddingVertical: webSc(SPACING.sm) },
  tdpName: { color: COLORS.text, fontSize: webMs(FONT_SIZES.md), fontWeight: "800" },
  tdpMetaRow: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", marginTop: 2 },
  tdpFargo: { color: COLORS.textMuted, fontSize: webMs(FONT_SIZES.xs), fontWeight: "600", fontVariant: ["tabular-nums"] },
  tdpChips: { color: COLORS.primaryLight, fontSize: webMs(FONT_SIZES.sm), fontWeight: "800", fontVariant: ["tabular-nums"] },
  tdMatchTeam: { color: COLORS.text, fontSize: webMs(FONT_SIZES.md), fontWeight: "800", textAlign: "center" },
  tdMatchWaiting: { color: COLORS.textMuted, fontSize: webMs(FONT_SIZES.md), fontWeight: "600", textAlign: "center" },
  tdVsWrap: { width: webSc(34), height: webSc(34), borderRadius: webSc(17), borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface, alignItems: "center", justifyContent: "center", marginVertical: webSc(SPACING.xs) },
  tdVsText: { color: COLORS.textMuted, fontSize: webMs(FONT_SIZES.xs - 1), fontWeight: "800", letterSpacing: 0.5 },
  // Stat cards — clearly separated label/value pairs
  tdStatRow: { flexDirection: "row", flexWrap: "wrap", gap: webSc(SPACING.sm), marginTop: webSc(SPACING.md) },
  tdStatCard: { flexGrow: 1, flexBasis: "47%", minWidth: webSc(140), backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, paddingHorizontal: webSc(SPACING.md), paddingVertical: webSc(SPACING.sm) },
  tdStatLbl: { color: COLORS.textMuted, fontSize: webMs(FONT_SIZES.xs), fontWeight: "600" },
  tdStatVal: { color: COLORS.text, fontSize: webMs(FONT_SIZES.lg), fontWeight: "800", marginTop: 2 },
  tdSubhead: { color: COLORS.textSecondary, fontSize: webMs(FONT_SIZES.sm), fontWeight: "700", marginTop: webSc(SPACING.md), marginBottom: webSc(SPACING.xs) },
  tdRecent: { color: COLORS.textSecondary, fontSize: webMs(FONT_SIZES.sm), paddingVertical: 3, lineHeight: webMs(FONT_SIZES.sm) * 1.35 },
  tdRecentWin: { color: COLORS.text, fontWeight: "700" },
  tdRecentLose: { color: COLORS.error },
  tdViewFull: { color: COLORS.primary, fontSize: webMs(FONT_SIZES.sm), fontWeight: "700" },
  tdViewFullBtn: { paddingTop: webSc(SPACING.sm), paddingBottom: webSc(SPACING.xs) },
  tdCompleteBtn: { backgroundColor: COLORS.success, borderRadius: RADIUS.md, paddingVertical: webSc(SPACING.md), alignItems: "center", marginTop: webSc(SPACING.md) },
  tdCompleteText: { color: COLORS.white, fontSize: webMs(FONT_SIZES.md), fontWeight: "800" },
  tdFooterRow: { flexDirection: "row", alignItems: "stretch", gap: webSc(SPACING.sm), marginTop: webSc(SPACING.md) },
  tdActionsBtnSm: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, minHeight: webSc(44), borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md },
  tdActionsBtnText: { color: COLORS.text, fontSize: webMs(FONT_SIZES.sm), fontWeight: "800" },
  tdCloseBtnSm: { flex: 1, alignItems: "center", justifyContent: "center", minHeight: webSc(44), borderRadius: RADIUS.md, backgroundColor: COLORS.surfaceLight, borderWidth: 1, borderColor: COLORS.borderLight },
  tdCloseBtnText: { color: COLORS.text, fontSize: webMs(FONT_SIZES.sm), fontWeight: "800" },
  tdHistRow: { flexDirection: "row", gap: webSc(SPACING.sm), paddingVertical: webSc(SPACING.sm), borderBottomWidth: 1, borderBottomColor: COLORS.border },
  tdHistTime: { color: COLORS.textMuted, fontSize: webMs(FONT_SIZES.xs), fontWeight: "700", width: webSc(64) },
  tdHistText: { flex: 1, color: COLORS.text, fontSize: webMs(FONT_SIZES.sm) },
  // Actions sheet layered inside the Details modal.
  tdSheetOverlay: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" },
  // Table Match History modal.
  mhSummary: { marginTop: webSc(SPACING.xs), paddingBottom: webSc(SPACING.sm), borderBottomWidth: 1, borderBottomColor: COLORS.border },
  mhSummaryStrong: { color: COLORS.text, fontSize: webMs(FONT_SIZES.md), fontWeight: "800" },
  mhSummaryMuted: { color: COLORS.textMuted, fontSize: webMs(FONT_SIZES.sm), marginTop: 2 },
  mhEmpty: { color: COLORS.textMuted, fontSize: webMs(FONT_SIZES.sm), paddingVertical: webSc(SPACING.lg), textAlign: "center" },
  mhEntry: { paddingVertical: webSc(SPACING.md) },
  mhEntryDivider: { borderTopWidth: 1, borderTopColor: COLORS.border },
  mhSnippet: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: webSc(SPACING.sm) },
  mhTeams: { flex: 1 },
  mhWinner: { color: COLORS.text, fontSize: webMs(FONT_SIZES.md), fontWeight: "800", lineHeight: webMs(FONT_SIZES.md) * 1.3 },
  mhDef: { color: COLORS.error, fontSize: webMs(FONT_SIZES.xs), fontWeight: "700", marginVertical: 1 },
  mhLoser: { color: COLORS.error, fontSize: webMs(FONT_SIZES.md), fontWeight: "600", lineHeight: webMs(FONT_SIZES.md) * 1.3 },
  mhDetail: { marginTop: webSc(SPACING.sm), backgroundColor: COLORS.surface, borderRadius: RADIUS.md, paddingHorizontal: webSc(SPACING.md), paddingVertical: webSc(SPACING.sm) },
  mhDetailRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3 },
  mhDetailLbl: { color: COLORS.textMuted, fontSize: webMs(FONT_SIZES.sm) },
  mhDetailVal: { color: COLORS.text, fontSize: webMs(FONT_SIZES.sm), fontWeight: "700" },
  // Actions bottom sheet.
  actSheetRoot: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.5)" },
  actSheet: { backgroundColor: COLORS.backgroundCard, borderTopLeftRadius: 22, borderTopRightRadius: 22, borderWidth: 1, borderColor: COLORS.borderLight, paddingHorizontal: webSc(SPACING.md), paddingTop: webSc(SPACING.md), paddingBottom: webSc(SPACING.lg) },
  actSheetTitle: { color: COLORS.textSecondary, fontSize: webMs(FONT_SIZES.sm), fontWeight: "700", textAlign: "center", marginBottom: webSc(SPACING.sm) },
  actSheetGroup: { backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, overflow: "hidden", marginBottom: webSc(SPACING.sm) },
  actRow2: { flexDirection: "row", alignItems: "center", gap: webSc(SPACING.sm), paddingVertical: webSc(SPACING.md), paddingHorizontal: webSc(SPACING.md), borderBottomWidth: 1, borderBottomColor: COLORS.border },
  actRow2Text: { color: COLORS.text, fontSize: webMs(FONT_SIZES.md), fontWeight: "600" },
  actRow2Danger: { color: COLORS.error },
  actSheetCancel: { backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, paddingVertical: webSc(SPACING.md), alignItems: "center" },
  actSheetCancelText: { color: COLORS.text, fontSize: webMs(FONT_SIZES.md), fontWeight: "800" },
  toolBtn: { flex: 1, borderWidth: 1.5, borderRadius: RADIUS.md, paddingVertical: webSc(SPACING.sm), alignItems: "center" },
  toolBtnText: { fontSize: webMs(FONT_SIZES.sm), fontWeight: "800" },
  // Slim recommendation banner.
  recSlim: { flexDirection: "row", alignItems: "center", gap: webSc(SPACING.sm), backgroundColor: COLORS.warning + "14", borderRadius: RADIUS.md, paddingHorizontal: webSc(SPACING.md), paddingVertical: webSc(SPACING.sm), marginBottom: webSc(SPACING.md) },
  recSlimText: { flex: 1, color: COLORS.textSecondary, fontSize: webMs(FONT_SIZES.xs) },
  recSlimNum: { color: COLORS.warning, fontWeight: "900" },
  recSlimBtn: { borderWidth: 1, borderColor: COLORS.warning, borderRadius: RADIUS.sm, paddingHorizontal: webSc(SPACING.sm), paddingVertical: 4 },
  recSlimBtnText: { color: COLORS.warning, fontSize: webMs(FONT_SIZES.xs), fontWeight: "800" },
  // Compact table list rows.
  tListRow: { flexDirection: "row", alignItems: "center", gap: webSc(SPACING.sm), backgroundColor: COLORS.backgroundCard, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, paddingHorizontal: webSc(SPACING.md), paddingVertical: webSc(SPACING.sm), marginBottom: webSc(SPACING.sm) },
  tListMain: { flex: 1 },
  tListTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: webSc(SPACING.sm) },
  tListTitle: { flex: 1, color: COLORS.text, fontSize: webMs(FONT_SIZES.md), fontWeight: "800" },
  tListBadge: { borderWidth: 1, borderRadius: RADIUS.full, paddingHorizontal: webSc(SPACING.sm), paddingVertical: 2 },
  tListBadgeText: { fontSize: webMs(FONT_SIZES.xs), fontWeight: "800" },
  tListTeam: { color: COLORS.textSecondary, fontSize: webMs(FONT_SIZES.sm), fontWeight: "600", marginTop: 3 },
  tListEmpty: { color: COLORS.textMuted, fontStyle: "italic" },
  tListSub: { color: COLORS.textMuted, fontSize: webMs(FONT_SIZES.xs), marginTop: 1 },
  tListDelete: { padding: webSc(SPACING.xs) },
  tListDeleteText: { fontSize: webMs(FONT_SIZES.md) },
  // Table detail.
  tdHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: webSc(SPACING.sm) },
  tdTitle: { color: COLORS.text, fontSize: webMs(FONT_SIZES.lg), fontWeight: "900" },
  tdStreamNote: { color: COLORS.error, fontSize: webMs(FONT_SIZES.xs), fontWeight: "700", marginTop: 2 },
  tdSection: { color: COLORS.textSecondary, fontSize: webMs(FONT_SIZES.xs), fontWeight: "800", letterSpacing: 0.5, marginTop: webSc(SPACING.md), marginBottom: webSc(SPACING.xs) },
  tdTeamRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: webSc(SPACING.sm) },
  tdTeamName: { color: COLORS.text, fontSize: webMs(FONT_SIZES.sm), fontWeight: "800" },
  tdTeamStats: { alignItems: "flex-end" },
  tdFargo: { color: COLORS.textSecondary, fontSize: webMs(FONT_SIZES.xs), fontWeight: "700" },
  tdChips: { color: COLORS.primaryLight, fontSize: webMs(FONT_SIZES.sm), fontWeight: "900" },
  tdVs: { color: COLORS.textMuted, fontSize: webMs(FONT_SIZES.xs), fontWeight: "800", marginVertical: 2 },
  tdEmpty: { color: COLORS.textMuted, fontSize: webMs(FONT_SIZES.sm), fontStyle: "italic" },
  tdMetaRow: { flexDirection: "row", justifyContent: "space-between", marginTop: webSc(SPACING.sm) },
  tdMetaLbl: { color: COLORS.textSecondary, fontSize: webMs(FONT_SIZES.sm) },
  tdMetaVal: { color: COLORS.text, fontSize: webMs(FONT_SIZES.sm), fontWeight: "800", fontVariant: ["tabular-nums"] },
  tdNext: { color: COLORS.text, fontSize: webMs(FONT_SIZES.sm), fontWeight: "700" },
  tdActions: { gap: webSc(SPACING.xs) },
  tdAction: { borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, paddingVertical: webSc(SPACING.md), alignItems: "center" },
  tdActionText: { color: COLORS.text, fontSize: webMs(FONT_SIZES.sm), fontWeight: "700" },
  tdActionPrimary: { backgroundColor: COLORS.success, borderColor: COLORS.success },
  tdActionPrimaryText: { color: COLORS.white, fontSize: webMs(FONT_SIZES.sm), fontWeight: "800" },
  tdActionDanger: { borderColor: COLORS.error },
  tdActionDangerText: { color: COLORS.error, fontSize: webMs(FONT_SIZES.sm), fontWeight: "800" },
  moveDestRow: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, paddingVertical: webSc(SPACING.md), paddingHorizontal: webSc(SPACING.md), marginTop: webSc(SPACING.sm) },
  moveDestText: { color: COLORS.text, fontSize: webMs(FONT_SIZES.md), fontWeight: "700" },
  tcTable: { backgroundColor: COLORS.backgroundCard, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.lg, padding: webSc(SPACING.md), marginBottom: webSc(SPACING.md) },
  tcLive: { borderColor: COLORS.success + "66" },
  tcLong: { borderColor: COLORS.error },
  tcLocked: { opacity: 0.75 },
  tcHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: webSc(SPACING.sm) },
  tcTitleWrap: { flexDirection: "row", alignItems: "center", gap: 5 },
  tcTitle: { color: COLORS.text, fontSize: webMs(FONT_SIZES.md), fontWeight: "900" },
  tcBadges: { flexDirection: "row", gap: webSc(SPACING.xs), flexWrap: "wrap", justifyContent: "flex-end" },
  tcBadge: { borderRadius: RADIUS.sm, paddingHorizontal: webSc(SPACING.sm), paddingVertical: 2 },
  tcBadgeText: { fontSize: 10, fontWeight: "900", letterSpacing: 0.3 },
  tcLiveTag: { color: COLORS.error, fontSize: webMs(FONT_SIZES.sm), fontWeight: "900", marginTop: webSc(SPACING.xs), fontVariant: ["tabular-nums"] },
  tcStatus: { color: COLORS.textSecondary, fontSize: webMs(FONT_SIZES.sm), fontWeight: "700", marginTop: webSc(SPACING.xs) },
  tcMatch: { flexDirection: "row", alignItems: "center", marginTop: webSc(SPACING.sm) },
  tcTeam: { flex: 1 },
  tcTeamName: { color: COLORS.text, fontSize: webMs(FONT_SIZES.sm), fontWeight: "800" },
  tcTeamFargo: { color: COLORS.textSecondary, fontSize: webMs(FONT_SIZES.xs), marginTop: 1 },
  tcVs: { color: COLORS.textMuted, fontSize: webMs(FONT_SIZES.sm), fontWeight: "800", paddingHorizontal: webSc(SPACING.md) },
  tcNote: { color: COLORS.textMuted, fontSize: webMs(FONT_SIZES.xs), fontStyle: "italic", marginTop: webSc(SPACING.xs) },
  tcNext: { marginTop: webSc(SPACING.sm), backgroundColor: COLORS.surface, borderRadius: RADIUS.sm, paddingHorizontal: webSc(SPACING.sm), paddingVertical: webSc(SPACING.xs) },
  tcNextLabel: { color: COLORS.primaryLight, fontSize: 9, fontWeight: "900", letterSpacing: 0.5 },
  tcNextName: { color: COLORS.text, fontSize: webMs(FONT_SIZES.sm), fontWeight: "700", marginTop: 1 },
  tcBtns: { flexDirection: "row", gap: webSc(SPACING.xs), marginTop: webSc(SPACING.md) },
  tcBtn: { flex: 1, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, paddingVertical: webSc(SPACING.sm), alignItems: "center" },
  tcBtnText: { color: COLORS.textSecondary, fontSize: webMs(FONT_SIZES.xs), fontWeight: "800" },
  tcBtnPrimary: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  tcBtnPrimaryText: { color: COLORS.white, fontSize: webMs(FONT_SIZES.xs), fontWeight: "800" },
  tcHist: { marginTop: webSc(SPACING.sm), borderTopWidth: 1, borderTopColor: COLORS.border, paddingTop: webSc(SPACING.xs) },
  tcHistLabel: { color: COLORS.textMuted, fontSize: 9, fontWeight: "900", letterSpacing: 0.5, marginBottom: 2 },
  tcHistRow: { color: COLORS.textSecondary, fontSize: webMs(FONT_SIZES.xs), paddingVertical: 1 },
  tblSummary: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, paddingHorizontal: webSc(SPACING.md), marginBottom: webSc(SPACING.lg) },
  winPickBtn: { backgroundColor: COLORS.success, borderRadius: RADIUS.md, paddingVertical: webSc(SPACING.md), paddingHorizontal: webSc(SPACING.md), alignItems: "center", marginTop: webSc(SPACING.sm) },
  winPickName: { color: COLORS.white, fontSize: webMs(FONT_SIZES.md), fontWeight: "800", textAlign: "center" },
  winPickMeta: { color: COLORS.white, fontSize: webMs(FONT_SIZES.xs), opacity: 0.85, marginTop: 1 },

  // Live table status + inactive/reactivate.
  liveTableClosing: { borderColor: COLORS.warning },
  tblStatusTag: { fontSize: webMs(FONT_SIZES.xs), fontWeight: "800" },
  manageTables: { marginTop: webSc(SPACING.md), borderTopWidth: 1, borderTopColor: COLORS.border, paddingTop: webSc(SPACING.md) },
  manageHead: { color: COLORS.textSecondary, fontSize: webMs(FONT_SIZES.xs), fontWeight: "800", letterSpacing: 0.5, marginBottom: webSc(SPACING.sm) },
  inactiveRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: webSc(SPACING.sm) },
  inactiveLabel: { color: COLORS.textMuted, fontSize: webMs(FONT_SIZES.sm), fontWeight: "600" },
  reactivateBtn: { borderWidth: 1, borderColor: COLORS.primary, borderRadius: RADIUS.sm, paddingHorizontal: webSc(SPACING.md), paddingVertical: 6 },
  reactivateText: { color: COLORS.primary, fontSize: webMs(FONT_SIZES.xs), fontWeight: "800" },

  // Reduce-tables sheet + reshuffle sheet.
  reduceHint: { color: COLORS.textMuted, fontSize: webMs(FONT_SIZES.sm), marginTop: webSc(SPACING.sm), marginBottom: webSc(SPACING.xs) },
  reduceList: { maxHeight: webSc(280) },
  reduceRow: { flexDirection: "row", alignItems: "center", gap: webSc(SPACING.sm), paddingVertical: webSc(SPACING.sm), borderBottomWidth: 1, borderBottomColor: COLORS.border },
  reduceName: { flex: 1, color: COLORS.text, fontSize: webMs(FONT_SIZES.sm), fontWeight: "700" },
  reduceStat: { fontSize: webMs(FONT_SIZES.xs), fontWeight: "700" },
  reshufStats: { flexDirection: "row", marginTop: webSc(SPACING.sm), backgroundColor: COLORS.surface, borderRadius: RADIUS.md, paddingVertical: webSc(SPACING.md) },
  reshufStat: { flex: 1, alignItems: "center" },
  reshufStatVal: { color: COLORS.text, fontSize: webMs(FONT_SIZES.xl), fontWeight: "900" },
  reshufStatLbl: { color: COLORS.textMuted, fontSize: webMs(FONT_SIZES.xs), marginTop: 2 },

  standRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: webSc(SPACING.xs), borderBottomWidth: 1, borderBottomColor: COLORS.border },
  standRank: { color: COLORS.textMuted, fontSize: webMs(FONT_SIZES.sm), fontWeight: "700", minWidth: webSc(30), flexShrink: 0 },
  standName: { color: COLORS.text, fontSize: webMs(FONT_SIZES.sm), fontWeight: "600", flex: 1 },
  standMeta: { color: COLORS.textSecondary, fontSize: webMs(FONT_SIZES.xs) },

  histRow: { paddingVertical: webSc(SPACING.xs), borderBottomWidth: 1, borderBottomColor: COLORS.border },
  histText: { color: COLORS.textSecondary, fontSize: webMs(FONT_SIZES.sm) },

  linkedTag: { color: COLORS.success, fontSize: webMs(FONT_SIZES.xs), fontWeight: "600", marginTop: 2 },

  approvalRow: { flexDirection: "row", alignItems: "center", gap: webSc(SPACING.sm), marginTop: webSc(SPACING.xs) },
  statusPill: { borderRadius: RADIUS.sm, paddingHorizontal: 8, paddingVertical: 3 },
  statusPillText: { fontSize: webMs(FONT_SIZES.xs), fontWeight: "700" },
  statusPillPending: { backgroundColor: COLORS.warning + "22" },
  statusPillPendingText: { color: COLORS.warning },
  statusPillOk: { backgroundColor: COLORS.success + "22" },
  statusPillOkText: { color: COLORS.success },
  approveBtn: { backgroundColor: COLORS.primary, borderRadius: RADIUS.sm, paddingHorizontal: webSc(SPACING.md), paddingVertical: 5 },
  approveBtnText: { color: COLORS.white, fontSize: webMs(FONT_SIZES.xs), fontWeight: "700" },
  teamActions: { flexDirection: "row", flexWrap: "wrap", gap: webSc(SPACING.sm), marginTop: webSc(SPACING.sm) },
  confirmMiniBtn: { backgroundColor: COLORS.primary, borderRadius: RADIUS.sm, paddingHorizontal: webSc(SPACING.md), paddingVertical: 6 },
  confirmMiniBtnOk: { backgroundColor: COLORS.success + "33", borderWidth: 1, borderColor: COLORS.success },
  confirmMiniText: { color: COLORS.white, fontSize: webMs(FONT_SIZES.xs), fontWeight: "700" },
  unlockBtn: { borderWidth: 1, borderColor: COLORS.borderLight, borderRadius: RADIUS.sm, paddingHorizontal: webSc(SPACING.md), paddingVertical: 6 },
  unlockText: { color: COLORS.textSecondary, fontSize: webMs(FONT_SIZES.xs), fontWeight: "700" },

  // ── Players manager (redesign) ───────────────────────────────────────────────
  filterRow: { flexDirection: "row", flexWrap: "wrap", gap: webSc(SPACING.sm), marginBottom: webSc(SPACING.sm) },
  filterChip: { paddingHorizontal: webSc(SPACING.md), paddingVertical: 7, borderRadius: 999, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  filterChipOn: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  filterChipText: { color: COLORS.textSecondary, fontSize: webMs(FONT_SIZES.xs), fontWeight: "700" },
  filterChipTextOn: { color: COLORS.white },
  searchRow: { flexDirection: "row", gap: webSc(SPACING.sm), marginBottom: webSc(SPACING.md), alignItems: "center" },
  searchInput: { flex: 1, height: webSc(42), backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, paddingHorizontal: webSc(SPACING.md), color: COLORS.text, fontSize: webMs(FONT_SIZES.sm), ...(isWeb ? ({ outlineStyle: "none" } as object) : null) },
  addBtn: { backgroundColor: COLORS.primary, borderRadius: RADIUS.md, paddingHorizontal: webSc(SPACING.md), height: webSc(42), justifyContent: "center" },
  addBtnText: { color: COLORS.white, fontSize: webMs(FONT_SIZES.sm), fontWeight: "700" },

  tcard: { backgroundColor: COLORS.backgroundCard, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: webSc(SPACING.md), paddingVertical: webSc(SPACING.sm), marginBottom: webSc(SPACING.sm) },
  tcardHead: { flexDirection: "row", alignItems: "center", gap: webSc(SPACING.sm), marginBottom: webSc(SPACING.xs) },
  tcardNum: { color: COLORS.textSecondary, fontSize: webMs(FONT_SIZES.xs), fontWeight: "800" },
  tcardName: { color: COLORS.text, fontSize: webMs(FONT_SIZES.lg), fontWeight: "800", marginTop: 1, marginBottom: webSc(SPACING.xs), lineHeight: webMs(FONT_SIZES.lg + 3) },
  tbadge: { borderRadius: 999, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3 },
  tstatusRow: { flexDirection: "row", alignItems: "center", gap: webSc(SPACING.sm), marginTop: 3, marginBottom: webSc(SPACING.xs) },
  tbadgeText: { fontSize: webMs(FONT_SIZES.xs - 1), fontWeight: "800" },
  tchipPill: { backgroundColor: COLORS.primary + "22", borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  tchipText: { color: COLORS.primaryLight, fontSize: webMs(FONT_SIZES.xs - 1), fontWeight: "800" },
  tmenuBtn: { paddingHorizontal: 6, paddingVertical: 2 },
  tmenuDots: { color: COLORS.textSecondary, fontSize: webMs(FONT_SIZES.lg), fontWeight: "800" },

  prow: { flexDirection: "row", alignItems: "center", gap: webSc(SPACING.sm), paddingVertical: 6, borderTopWidth: 1, borderTopColor: COLORS.border },
  pavatar: { width: webSc(30), height: webSc(30), borderRadius: webSc(15), backgroundColor: COLORS.surfaceLight, alignItems: "center", justifyContent: "center" },
  pavatarText: { color: COLORS.textSecondary, fontSize: webMs(FONT_SIZES.sm), fontWeight: "800" },
  pname: { color: COLORS.text, fontSize: webMs(FONT_SIZES.sm), fontWeight: "700" },
  pid: { color: COLORS.textMuted, fontSize: webMs(FONT_SIZES.xs), marginTop: 1 },
  pfargoCol: { alignItems: "flex-end", minWidth: webSc(96) },
  pfargo: { color: COLORS.text, fontSize: webMs(FONT_SIZES.sm), fontWeight: "700" },
  pverified: { color: COLORS.success, fontSize: webMs(FONT_SIZES.xs), fontWeight: "800", marginTop: 2 },
  pneeds: { color: COLORS.warning, fontSize: webMs(FONT_SIZES.xs), fontWeight: "700", marginTop: 2 },
  pverifyBtn: { paddingVertical: 2, paddingHorizontal: 2 },
  pverifyText: { color: COLORS.warning, fontSize: webMs(FONT_SIZES.xs), fontWeight: "800", textDecorationLine: "underline" },
  peditName: { color: COLORS.text, fontSize: webMs(FONT_SIZES.sm), fontWeight: "600", borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.sm, paddingHorizontal: 8, paddingVertical: 5, backgroundColor: COLORS.surfaceLight, ...(isWeb ? ({ outlineStyle: "none" } as object) : null) },
  peditFargoWrap: { flexDirection: "row", alignItems: "center", gap: 4, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.sm, paddingHorizontal: 8, backgroundColor: COLORS.surfaceLight, height: webSc(34), minWidth: webSc(88) },
  phash: { color: COLORS.textMuted, fontSize: webMs(FONT_SIZES.sm), fontWeight: "700" },
  peditFargo: { flex: 1, color: COLORS.text, fontSize: webMs(FONT_SIZES.sm), fontWeight: "600", ...(isWeb ? ({ outlineStyle: "none" } as object) : null) },
  premoveBtn: { paddingHorizontal: 4, paddingVertical: 4, alignItems: "center", justifyContent: "center" },
  premoveText: { color: COLORS.error, fontSize: webMs(FONT_SIZES.md), fontWeight: "800" },
  editChipRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: webSc(SPACING.sm), gap: webSc(SPACING.sm) },
  editChipLabel: { color: COLORS.textSecondary, fontSize: webMs(FONT_SIZES.xs), fontWeight: "700" },
  editChipInput: { width: webSc(96), height: webSc(38), backgroundColor: COLORS.surfaceLight, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.sm, paddingHorizontal: webSc(SPACING.md), color: COLORS.text, fontSize: webMs(FONT_SIZES.sm), fontWeight: "700", textAlign: "center", ...(isWeb ? ({ outlineStyle: "none" } as object) : null) },

  tteamFargo: { color: COLORS.textSecondary, fontSize: webMs(FONT_SIZES.sm), fontWeight: "700", marginTop: webSc(SPACING.sm) },

  // ── Players tab — compact desktop table (web ≥760) ────────────────────────
  ptHeadingRow: { flexDirection: "row", alignItems: "baseline", gap: 6, marginBottom: SPACING.md },
  ptTitle: { color: COLORS.text, fontSize: 22, fontWeight: "800" },
  ptCount: { color: COLORS.textMuted, fontSize: FONT_SIZES.sm, fontWeight: "600" },
  ptToolbar: { flexDirection: "row", alignItems: "center", gap: SPACING.sm, marginBottom: SPACING.md },
  ptSearch: { flex: 1, flexDirection: "row", alignItems: "center", gap: SPACING.sm, height: 40, paddingHorizontal: SPACING.md, borderRadius: RADIUS.md, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  ptSearchInput: { flex: 1, color: COLORS.text, fontSize: FONT_SIZES.sm, ...(isWeb ? ({ outlineStyle: "none" } as object) : null) },
  ptFilterBtn: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: SPACING.xs, width: 168, height: 40, paddingHorizontal: SPACING.md, borderRadius: RADIUS.md, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  ptFilterText: { flex: 1, color: COLORS.text, fontSize: FONT_SIZES.sm, fontWeight: "700" },
  ptAddBtn: { flexDirection: "row", alignItems: "center", gap: 6, height: 40, paddingHorizontal: SPACING.md, borderRadius: RADIUS.md, backgroundColor: COLORS.primary, ...(isWeb ? ({ cursor: "pointer" } as object) : null) },
  ptAddText: { color: "#FFFFFF", fontSize: FONT_SIZES.sm, fontWeight: "800" },
  ptTable: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.lg, overflow: "hidden" },
  ptRow: { flexDirection: "row", alignItems: "center", gap: SPACING.sm, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, ...(isWeb ? ({ cursor: "pointer" } as object) : null) },
  ptHeadRow: { backgroundColor: COLORS.background, paddingVertical: SPACING.sm },
  ptRowDiv: { borderTopWidth: 1, borderTopColor: COLORS.border },
  ptRowHover: { backgroundColor: COLORS.surfaceLight },
  ptHcell: { color: COLORS.textMuted, fontSize: FONT_SIZES.xs, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.4 },
  ptCell: { color: COLORS.textSecondary, fontSize: FONT_SIZES.sm },
  ptNum: { color: COLORS.textMuted, fontSize: FONT_SIZES.sm, fontWeight: "700" },
  ptName: { color: COLORS.text, fontSize: FONT_SIZES.md, fontWeight: "700" },
  ptNameSub: { color: COLORS.textMuted, fontSize: FONT_SIZES.xs, marginTop: 1 },
  ptChips: { color: COLORS.primaryLight, fontSize: FONT_SIZES.sm, fontWeight: "800" },
  ptBadge: { alignSelf: "flex-start", borderRadius: RADIUS.full, borderWidth: 1, borderColor: "transparent", paddingHorizontal: SPACING.sm, paddingVertical: 2 },
  ptBadgeGood: { backgroundColor: COLORS.success + "22", borderColor: COLORS.success + "88" },
  ptBadgeMuted: { backgroundColor: COLORS.surfaceLight, borderColor: COLORS.border },
  ptBadgeText: { fontSize: FONT_SIZES.xs, fontWeight: "700" },
  ptBadgeTextGood: { color: COLORS.success },
  ptBadgeTextMuted: { color: COLORS.textSecondary },
  ptCheckBtn: { alignSelf: "flex-start", backgroundColor: COLORS.primary, borderRadius: RADIUS.sm, paddingHorizontal: SPACING.md, paddingVertical: 6, ...(isWeb ? ({ cursor: "pointer" } as object) : null) },
  ptCheckBtnText: { color: "#FFFFFF", fontSize: FONT_SIZES.xs, fontWeight: "800" },
  ptDots: { width: 32, height: 32, alignItems: "center", justifyContent: "center", borderRadius: RADIUS.sm },
  ptExpand: { paddingHorizontal: SPACING.md, paddingBottom: SPACING.md, paddingTop: SPACING.xs, backgroundColor: COLORS.background, borderTopWidth: 1, borderTopColor: COLORS.border },
  ptApprove: { alignSelf: "flex-start", marginTop: SPACING.sm, backgroundColor: COLORS.primary, borderRadius: RADIUS.md, paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm },
  ptApproveText: { color: "#FFFFFF", fontSize: FONT_SIZES.sm, fontWeight: "800" },
  // Column widths.
  ptcNum: { width: 34 },
  ptcTeam: { flex: 2.4, minWidth: 0 },
  ptcFargo: { width: 90 },
  ptcChips: { width: 70 },
  ptcPay: { width: 100 },
  ptcStatus: { width: 120 },
  ptcActions: { width: 84, flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: SPACING.xs },

  // Recommended-setup card (compact, tinted).
  // Recommended setup — a compact, CENTERED informational section INSIDE the Tables
  // card (a subtle top divider separates it from the header; no nested-card box).
  recBox: { borderTopWidth: 1, borderTopColor: COLORS.border, marginTop: webSc(SPACING.xs), paddingTop: webSc(SPACING.sm), alignItems: "center", gap: webSc(SPACING.xs) },
  recTitle: { color: COLORS.textSecondary, fontSize: webMs(FONT_SIZES.xs), fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.6, textAlign: "center" },
  recLine: { color: COLORS.text, fontSize: webMs(FONT_SIZES.md), fontWeight: "600", textAlign: "center" },
  recNum: { color: COLORS.primaryLight, fontWeight: "800" },
  recSub: { color: COLORS.textMuted, fontSize: webMs(FONT_SIZES.xs), textAlign: "center" },
  recBtn: { alignSelf: "center", marginTop: webSc(SPACING.xs), backgroundColor: COLORS.primary, borderRadius: RADIUS.sm, paddingHorizontal: webSc(SPACING.lg), paddingVertical: webSc(SPACING.xs) },
  recBtnText: { color: COLORS.white, fontSize: webMs(FONT_SIZES.sm), fontWeight: "700", textAlign: "center" },
  // Helper line under the recommendation — centered, with extra top spacing so it
  // doesn't look attached to the Use N Table button.
  recHelper: { color: COLORS.textMuted, fontSize: webMs(FONT_SIZES.sm), textAlign: "center", marginTop: webSc(SPACING.md) },

  // Rename-table dialog.
  renameTitle: { color: COLORS.text, fontSize: webMs(FONT_SIZES.md), fontWeight: "800", marginBottom: webSc(SPACING.sm) },
  renameInput: { height: webSc(44), backgroundColor: COLORS.surfaceLight, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, paddingHorizontal: webSc(SPACING.md), color: COLORS.text, fontSize: webMs(FONT_SIZES.sm), ...(isWeb ? ({ outlineStyle: "none" } as object) : null) },
  renameBtns: { flexDirection: "row", justifyContent: "flex-end", gap: webSc(SPACING.sm), marginTop: webSc(SPACING.md) },
  renameCancel: { paddingVertical: webSc(SPACING.sm), paddingHorizontal: webSc(SPACING.lg), borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border },
  renameCancelText: { color: COLORS.textSecondary, fontSize: webMs(FONT_SIZES.sm), fontWeight: "700" },
  renameSave: { paddingVertical: webSc(SPACING.sm), paddingHorizontal: webSc(SPACING.lg), borderRadius: RADIUS.md, backgroundColor: COLORS.primary },
  renameSaveText: { color: COLORS.white, fontSize: webMs(FONT_SIZES.sm), fontWeight: "800" },

  // Add-tables sheet — floats a fixed gap above the keyboard (reuses sheetRoot /
  // sheetDismiss; bottom is animated to the keyboard height inline).
  addSheet: { position: "absolute", left: 0, right: 0, backgroundColor: COLORS.backgroundCard, borderRadius: 22, borderWidth: 1, borderColor: COLORS.borderLight, paddingHorizontal: webSc(SPACING.md), paddingTop: webSc(SPACING.sm), paddingBottom: webSc(SPACING.lg) },
  // Centered dialog (default for prompts/boxes without a keyboard).
  centerBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", alignItems: "center", padding: webSc(SPACING.lg) },
  centerRoot: { flex: 1, justifyContent: "center", alignItems: "center", padding: webSc(SPACING.lg) },
  centerDim: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(0,0,0,0.6)" },
  centerCard: { width: "100%", maxWidth: webSc(460), maxHeight: "82%", backgroundColor: COLORS.backgroundCard, borderRadius: 22, borderWidth: 1, borderColor: COLORS.borderLight, paddingHorizontal: webSc(SPACING.md), paddingTop: webSc(SPACING.md), paddingBottom: webSc(SPACING.lg) },
  // Clearly-visible standalone modal Close button.
  modalClose: { marginTop: webSc(SPACING.md), alignSelf: "center", backgroundColor: COLORS.surfaceLight, borderWidth: 1, borderColor: COLORS.borderLight, borderRadius: RADIUS.full, paddingVertical: webSc(SPACING.sm), paddingHorizontal: webSc(SPACING.xl), alignItems: "center" },
  modalCloseText: { color: COLORS.text, fontSize: webMs(FONT_SIZES.sm), fontWeight: "800" },

  // ⚡ Tournament Actions — compact command center (fixed header/footer, 2-col cards).
  actionsCard: { width: "100%", maxWidth: webSc(460), maxHeight: "86%", backgroundColor: COLORS.backgroundCard, borderRadius: 22, borderWidth: 1, borderColor: COLORS.borderLight, paddingHorizontal: webSc(SPACING.md), paddingTop: webSc(SPACING.md), paddingBottom: webSc(SPACING.sm) },
  actHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: webSc(20) },
  actTitle: { color: COLORS.text, fontSize: webMs(FONT_SIZES.lg), fontWeight: "800" },
  actClose: { width: webSc(32), height: webSc(32), borderRadius: RADIUS.full, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  actScroll: { flexGrow: 0, flexShrink: 1 },
  actScrollInner: { paddingBottom: webSc(SPACING.xs) },
  actSectionBlock: { marginBottom: webSc(20) },
  actSection: { color: COLORS.textMuted, fontSize: webMs(FONT_SIZES.xs), fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: webSc(10) },
  actSectionDanger: { color: COLORS.error, fontSize: webMs(FONT_SIZES.xs), fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: webSc(10) },
  // 2-col grid: space-between so the two columns' OUTER edges align exactly with
  // the full-width rows (Undo / End Tournament); rowGap spaces wrapped lines.
  actGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", alignItems: "stretch", rowGap: webSc(10) },
  actItem: { flexDirection: "row", alignItems: "center", gap: webSc(SPACING.sm), width: "48%", minHeight: webSc(48), paddingHorizontal: webSc(SPACING.md), paddingVertical: webSc(10), borderRadius: RADIUS.md, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  actCardFull: { width: "100%" },
  actCardActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primary + "14" },
  actCardDisabled: { opacity: 0.45 },
  actCardLabel: { flex: 1, color: COLORS.text, fontSize: webMs(FONT_SIZES.sm), fontWeight: "700", lineHeight: webMs(FONT_SIZES.sm) * 1.25 },
  actCardLabelActive: { color: COLORS.primaryLight },
  actCardTextDisabled: { color: COLORS.textMuted },
  actBadge: { paddingHorizontal: webSc(6), paddingVertical: webSc(2), borderRadius: RADIUS.sm, backgroundColor: COLORS.border },
  actBadgeOn: { backgroundColor: COLORS.primary },
  actBadgeText: { color: COLORS.textSecondary, fontSize: webMs(FONT_SIZES.xs - 1), fontWeight: "800", letterSpacing: 0.5 },
  actBadgeTextOn: { color: "#FFFFFF" },
  actDanger: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: webSc(SPACING.sm), width: "100%", minHeight: webSc(48), borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.error + "80", backgroundColor: COLORS.error + "14" },
  actDangerText: { color: COLORS.error, fontSize: webMs(FONT_SIZES.sm), fontWeight: "800" },
  actFooter: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLORS.border, paddingTop: webSc(SPACING.sm), marginTop: webSc(SPACING.xs), paddingBottom: webSc(SPACING.xs) },
  actCancel: { width: "100%", minHeight: webSc(50), alignItems: "center", justifyContent: "center", borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.borderLight, backgroundColor: COLORS.surfaceLight },
  actCancelText: { color: COLORS.text, fontSize: webMs(FONT_SIZES.md), fontWeight: "800" },

  // Audit log — activity timeline.
  auditCard: { width: "100%", maxWidth: webSc(480), height: "88%", backgroundColor: COLORS.backgroundCard, borderRadius: 22, borderWidth: 1, borderColor: COLORS.borderLight, paddingHorizontal: webSc(SPACING.md), paddingTop: webSc(SPACING.md), paddingBottom: webSc(SPACING.md) },
  auditHeader: { flexDirection: "row", alignItems: "flex-start", gap: webSc(SPACING.sm) },
  auditTitle: { color: COLORS.text, fontSize: webMs(FONT_SIZES.lg), fontWeight: "800" },
  auditSub: { color: COLORS.textMuted, fontSize: webMs(FONT_SIZES.xs), fontWeight: "500", marginTop: webSc(1) },
  auditIconBtn: { width: webSc(32), height: webSc(32), borderRadius: RADIUS.full, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  auditSearchRow: { flexDirection: "row", alignItems: "center", gap: webSc(SPACING.xs), marginTop: webSc(SPACING.sm), paddingHorizontal: webSc(SPACING.sm), height: webSc(40), borderRadius: RADIUS.md, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  auditSearchInput: { flex: 1, color: COLORS.text, fontSize: webMs(FONT_SIZES.sm), paddingVertical: 0, ...(isWeb ? ({ outlineStyle: "none" } as object) : null) },
  auditDropRow: { flexDirection: "row", gap: webSc(SPACING.sm), marginTop: webSc(SPACING.sm) },
  auditDrop: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: webSc(SPACING.xs), paddingHorizontal: webSc(SPACING.md), height: webSc(38), borderRadius: RADIUS.md, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  auditDropText: { flex: 1, color: COLORS.text, fontSize: webMs(FONT_SIZES.sm), fontWeight: "700" },
  auditList: { flex: 1, marginTop: webSc(SPACING.md) },
  auditListInner: { paddingBottom: webSc(SPACING.md) },
  auditEmpty: { color: COLORS.textMuted, fontSize: webMs(FONT_SIZES.sm), textAlign: "center", paddingVertical: webSc(SPACING.xl) },
  // One row = icon + body, generous horizontal gap, subtle divider between rows.
  auditRow: { flexDirection: "row", gap: webSc(SPACING.md), paddingVertical: webSc(SPACING.md) },
  auditRowDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.border },
  auditBadge: { width: webSc(30), height: webSc(30), borderRadius: RADIUS.full, alignItems: "center", justifyContent: "center" },
  auditBody: { flex: 1 },
  auditBodyTop: { flexDirection: "row", alignItems: "center", gap: webSc(SPACING.sm) },
  auditType: { flex: 1, fontSize: webMs(FONT_SIZES.sm), fontWeight: "800" },
  auditStampText: { color: COLORS.textMuted, fontSize: webMs(FONT_SIZES.xs), fontWeight: "500" },
  auditDots: { paddingLeft: webSc(SPACING.xs), paddingVertical: webSc(2) },
  auditDetail: { marginTop: webSc(3) },
  auditDetailTeam: { color: COLORS.text, fontSize: webMs(FONT_SIZES.sm), fontWeight: "700" },
  auditDetailLine: { color: COLORS.textSecondary, fontSize: webMs(FONT_SIZES.sm), lineHeight: webMs(FONT_SIZES.sm) * 1.35, marginTop: webSc(1) },
  auditDetailMuted: { color: COLORS.textMuted, fontSize: webMs(FONT_SIZES.xs), fontWeight: "600", marginTop: webSc(2) },
  auditWinner: { color: COLORS.text, fontSize: webMs(FONT_SIZES.sm), fontWeight: "800" },
  auditDef: { color: COLORS.textMuted, fontSize: webMs(FONT_SIZES.xs), fontWeight: "700", fontStyle: "italic", marginVertical: webSc(1) },
  auditLoser: { color: COLORS.textSecondary, fontSize: webMs(FONT_SIZES.sm), fontWeight: "600" },
  auditReason: { color: COLORS.textSecondary, fontSize: webMs(FONT_SIZES.sm), fontStyle: "italic", marginTop: webSc(2) },
  auditSummary: { color: COLORS.textMuted, fontSize: webMs(FONT_SIZES.xs), lineHeight: webMs(FONT_SIZES.xs) * 1.4, marginTop: webSc(SPACING.xs) },
  auditItemDim: { opacity: 0.42 },
  auditSupersededTag: { marginTop: webSc(SPACING.xs), alignSelf: "flex-start" },
  auditSupersededText: { color: COLORS.textMuted, fontSize: webMs(FONT_SIZES.xs), fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.3 },
  auditMenuHead: { color: COLORS.textMuted, fontSize: webMs(FONT_SIZES.xs), fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.5, paddingHorizontal: webSc(SPACING.lg), paddingTop: webSc(SPACING.sm), paddingBottom: webSc(SPACING.xs) },
  auditFooter: { flexDirection: "row", gap: webSc(SPACING.sm), marginTop: webSc(SPACING.md) },
  auditFooterBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: webSc(SPACING.xs), paddingVertical: webSc(SPACING.md), borderRadius: RADIUS.md, backgroundColor: COLORS.surfaceLight, borderWidth: 1, borderColor: COLORS.borderLight },
  auditFooterPrimary: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  auditFooterText: { color: COLORS.text, fontSize: webMs(FONT_SIZES.sm), fontWeight: "800" },
  auditFooterPrimaryText: { color: "#FFFFFF" },
  auditMenuBackdrop: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center", padding: webSc(SPACING.lg) },
  auditMenuCard: { width: "100%", maxWidth: webSc(300), backgroundColor: COLORS.backgroundCard, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.borderLight, paddingVertical: webSc(SPACING.xs), overflow: "hidden" },
  auditMenuItem: { flexDirection: "row", alignItems: "center", gap: webSc(SPACING.sm), paddingHorizontal: webSc(SPACING.md), paddingVertical: webSc(SPACING.sm), minHeight: webSc(44) },
  auditMenuItemTop: { alignItems: "flex-start" },
  auditMenuIcon: { marginTop: webSc(2) },
  auditMenuText: { color: COLORS.text, fontSize: webMs(FONT_SIZES.sm), fontWeight: "700", lineHeight: webMs(FONT_SIZES.sm) * 1.3 },
  // Anchored ⋯ menu (compact, positioned at the tap).
  auditAnchorBackdrop: { ...StyleSheet.absoluteFill },
  auditAnchorMenu: { position: "absolute", backgroundColor: COLORS.backgroundCard, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.borderLight, paddingVertical: webSc(SPACING.xs), overflow: "hidden", shadowColor: "#000", shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.3, shadowRadius: 14, elevation: 10 },
  // Restore-confirmation — keyboard-aware modal (own layer, sticky footer).
  restoreRoot: { ...StyleSheet.absoluteFill, justifyContent: "center", alignItems: "center", padding: webSc(SPACING.lg) },
  restoreBackdrop: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(0,0,0,0.78)" },
  restoreCard: { width: "100%", maxWidth: webSc(420), maxHeight: "86%", backgroundColor: COLORS.backgroundCard, borderRadius: 22, borderWidth: 1, borderColor: COLORS.borderLight, paddingHorizontal: webSc(SPACING.lg), paddingTop: webSc(SPACING.lg), paddingBottom: webSc(SPACING.md) },
  restoreScroll: { flexGrow: 0, flexShrink: 1 },
  restoreScrollInner: { paddingBottom: webSc(SPACING.xs) },
  restoreTitle: { color: COLORS.text, fontSize: webMs(FONT_SIZES.lg), fontWeight: "800", marginBottom: webSc(SPACING.md) },
  restoreRow: { flexDirection: "row", alignItems: "flex-start", gap: webSc(SPACING.md) },
  restoreCol: { flex: 1 },
  restoreColRight: { alignItems: "flex-start", minWidth: webSc(70) },
  restoreFieldLabel: { color: COLORS.textMuted, fontSize: webMs(FONT_SIZES.xs), fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.5, marginTop: webSc(SPACING.sm), marginBottom: webSc(2) },
  restoreValue: { color: COLORS.text, fontSize: webMs(FONT_SIZES.md), fontWeight: "700" },
  restoreValueBig: { color: COLORS.warning, fontSize: webMs(FONT_SIZES.lg), fontWeight: "900" },
  restoreDropField: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: webSc(SPACING.sm), height: webSc(46), paddingHorizontal: webSc(SPACING.md), borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface },
  restoreDropText: { flex: 1, color: COLORS.text, fontSize: webMs(FONT_SIZES.sm), fontWeight: "700" },
  restoreDropPlaceholder: { color: COLORS.textMuted, fontWeight: "500" },
  restoreDropList: { marginTop: webSc(SPACING.xs), backgroundColor: COLORS.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, overflow: "hidden" },
  restoreDropItem: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: webSc(SPACING.md), paddingVertical: webSc(SPACING.sm), minHeight: webSc(44) },
  restoreDropItemText: { color: COLORS.textSecondary, fontSize: webMs(FONT_SIZES.sm), fontWeight: "600" },
  restoreInput: { marginTop: webSc(2), minHeight: webSc(52), backgroundColor: COLORS.surfaceLight, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, paddingHorizontal: webSc(SPACING.md), paddingTop: webSc(SPACING.sm), paddingBottom: webSc(SPACING.sm), color: COLORS.text, fontSize: webMs(FONT_SIZES.sm), textAlignVertical: "top", ...(isWeb ? ({ outlineStyle: "none" } as object) : null) },
  restoreValidation: { color: COLORS.error, fontSize: webMs(FONT_SIZES.xs), fontWeight: "700", marginTop: webSc(SPACING.xs) },
  restoreBtns: { flexDirection: "row", gap: webSc(SPACING.sm), marginTop: webSc(SPACING.md), paddingTop: webSc(SPACING.sm), borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLORS.border },
  restoreCancel: { flex: 1, minHeight: webSc(48), alignItems: "center", justifyContent: "center", paddingHorizontal: webSc(SPACING.md), borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.borderLight, backgroundColor: COLORS.surfaceLight },
  restoreCancelText: { color: COLORS.text, fontSize: webMs(FONT_SIZES.sm), fontWeight: "800", textAlign: "center" },
  restoreConfirm: { flex: 1, minHeight: webSc(48), alignItems: "center", justifyContent: "center", paddingHorizontal: webSc(SPACING.md), borderRadius: RADIUS.md, backgroundColor: COLORS.error },
  restoreConfirmDisabled: { backgroundColor: COLORS.error + "66" },
  restoreConfirmText: { color: "#FFFFFF", fontSize: webMs(FONT_SIZES.sm), fontWeight: "800", textAlign: "center" },
  // View Details modal.
  detailCard: { width: "100%", maxWidth: webSc(420), maxHeight: "82%", backgroundColor: COLORS.backgroundCard, borderRadius: 22, borderWidth: 1, borderColor: COLORS.borderLight, paddingHorizontal: webSc(SPACING.lg), paddingTop: webSc(SPACING.lg), paddingBottom: webSc(SPACING.md) },
  detailHead: { flexDirection: "row", alignItems: "center", gap: webSc(SPACING.sm), marginBottom: webSc(SPACING.sm) },
  detailTitle: { flex: 1, fontSize: webMs(FONT_SIZES.lg), fontWeight: "800" },
  detailList: { flexGrow: 0 },
  detailField: { paddingVertical: webSc(SPACING.sm), borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.border },
  detailLabel: { color: COLORS.textMuted, fontSize: webMs(FONT_SIZES.xs), fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.5 },
  detailValue: { color: COLORS.text, fontSize: webMs(FONT_SIZES.md), fontWeight: "600", marginTop: webSc(2) },
  detailChange: { color: COLORS.textSecondary, fontSize: webMs(FONT_SIZES.sm), lineHeight: webMs(FONT_SIZES.sm) * 1.4, marginTop: webSc(2) },
  detailCopy: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: webSc(SPACING.xs), marginTop: webSc(SPACING.md), paddingVertical: webSc(SPACING.md), borderRadius: RADIUS.md, backgroundColor: COLORS.surfaceLight, borderWidth: 1, borderColor: COLORS.borderLight },
  detailCopyText: { color: COLORS.text, fontSize: webMs(FONT_SIZES.sm), fontWeight: "800" },

  // Tappable player rows → profile.
  playerTap: { flex: 1, paddingRight: webSc(SPACING.xs) },
  playerChevron: { color: COLORS.textMuted, fontWeight: "800" },

  // Team/player Tournament Profile modal — premium redesign.
  profCard: { width: "100%", maxWidth: webSc(460), maxHeight: "86%", backgroundColor: COLORS.backgroundCard, borderRadius: 24, paddingHorizontal: webSc(SPACING.lg), paddingTop: webSc(SPACING.lg), paddingBottom: webSc(SPACING.lg), shadowColor: "#000", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.28, shadowRadius: 24, elevation: 12 },
  // Header — name (Large), Fargo + status pill (Tiny), ⋯ action button
  pHeaderRow: { flexDirection: "row", alignItems: "flex-start", gap: webSc(SPACING.sm) },
  pMenuBtn: { width: webSc(32), height: webSc(32), borderRadius: webSc(16), alignItems: "center", justifyContent: "center", backgroundColor: COLORS.surface },
  // Floating contextual menu, anchored under the ⋯ button (in-place, no modal)
  pMenu: { position: "absolute", top: webSc(60), right: webSc(SPACING.lg), minWidth: webSc(210), backgroundColor: COLORS.backgroundCard, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.borderLight, paddingVertical: webSc(SPACING.xs), shadowColor: "#000", shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.35, shadowRadius: 16, elevation: 14 },
  pMenuItem: { flexDirection: "row", alignItems: "center", gap: webSc(SPACING.sm), paddingHorizontal: webSc(SPACING.md), paddingVertical: webSc(SPACING.sm) },
  pMenuItemText: { color: COLORS.text, fontSize: webMs(FONT_SIZES.sm), fontWeight: "600" },
  pName: { color: COLORS.text, fontSize: webMs(FONT_SIZES.xxl), fontWeight: "700", lineHeight: webMs(FONT_SIZES.xxl) * 1.18 },
  pHeaderMeta: { flexDirection: "row", alignItems: "center", gap: webSc(SPACING.sm), marginTop: webSc(SPACING.xs) },
  pFargo: { color: COLORS.textSecondary, fontSize: webMs(FONT_SIZES.sm) },
  pStatusPill: { borderRadius: RADIUS.full, paddingHorizontal: webSc(SPACING.sm), paddingVertical: 3 },
  pStatusPillText: { fontSize: webMs(FONT_SIZES.xs), fontWeight: "700", letterSpacing: 0.3 },
  // The hero numbers — biggest elements on screen
  pStats: { flexDirection: "row", marginTop: webSc(SPACING.xl), marginBottom: webSc(SPACING.xl) },
  pStat: { flex: 1, alignItems: "center", gap: webSc(SPACING.xs) },
  pStatVal: { color: COLORS.text, fontSize: webMs(FONT_SIZES.xxxl), fontWeight: "700" },
  pStatLbl: { color: COLORS.textMuted, fontSize: webMs(FONT_SIZES.xs - 1), fontWeight: "600", letterSpacing: 0.8 },
  pScroll: { flexGrow: 0 },
  // Compact info card (labels explain themselves — no section header needed)
  pInfoCard: { backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, paddingHorizontal: webSc(SPACING.md), paddingVertical: webSc(SPACING.sm), marginBottom: webSc(SPACING.lg) },
  pInfoTitle: { color: COLORS.textMuted, fontSize: webMs(FONT_SIZES.xs), fontWeight: "600", marginBottom: webSc(SPACING.xs) },
  pRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: webSc(SPACING.xs) },
  pRowLabel: { color: COLORS.textSecondary, fontSize: webMs(FONT_SIZES.sm) },
  pRowValue: { color: COLORS.text, fontSize: webMs(FONT_SIZES.sm), fontWeight: "600" },
  pBody: { color: COLORS.textSecondary, fontSize: webMs(FONT_SIZES.sm), lineHeight: webMs(FONT_SIZES.md) * 1.4 },
  pEmpty: { color: COLORS.textMuted, fontSize: webMs(FONT_SIZES.sm), paddingVertical: webSc(SPACING.md) },
  // Small performance highlight card
  pPerfCard: { backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, paddingHorizontal: webSc(SPACING.md), paddingVertical: webSc(SPACING.md), marginBottom: webSc(SPACING.xl) },
  pPerfLabel: { color: COLORS.textMuted, fontSize: webMs(FONT_SIZES.xs) },
  pPerfRating: { color: COLORS.text, fontSize: webMs(FONT_SIZES.xxl), fontWeight: "700", marginTop: 2 },
  pPerfDelta: { fontSize: webMs(FONT_SIZES.sm), fontWeight: "600", marginTop: 2 },
  pPerfAvgLabel: { color: COLORS.textMuted, fontSize: webMs(FONT_SIZES.xs), marginTop: webSc(SPACING.md) },
  pPerfAvgVal: { color: COLORS.text, fontSize: webMs(FONT_SIZES.md), fontWeight: "600", marginTop: 1 },
  // Match history — each match its own airy card
  pMatchCard: { backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, paddingHorizontal: webSc(SPACING.md), paddingVertical: webSc(SPACING.md), marginBottom: webSc(SPACING.md) },
  pMatchResult: { flexDirection: "row", alignItems: "center", gap: 6 },
  pMatchDot: { width: 9, height: 9, borderRadius: 5 },
  pMatchResultText: { fontSize: webMs(FONT_SIZES.sm), fontWeight: "700" },
  pMatchOpp: { color: COLORS.text, fontSize: webMs(FONT_SIZES.md), fontWeight: "600", marginTop: webSc(SPACING.xs) },
  pMatchMeta: { color: COLORS.textMuted, fontSize: webMs(FONT_SIZES.xs), marginTop: webSc(SPACING.xs) },
  // Close (pinned, compact pill)
  pClose: { marginTop: webSc(SPACING.lg), alignSelf: "center", minHeight: webSc(46), justifyContent: "center", backgroundColor: COLORS.surfaceLight, borderRadius: RADIUS.full, paddingHorizontal: webSc(SPACING.xl) },
  pCloseText: { color: COLORS.text, fontSize: webMs(FONT_SIZES.sm), fontWeight: "800" },
  addStepRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: webSc(SPACING.sm) },
  addStepLabel: { color: COLORS.text, fontSize: webMs(FONT_SIZES.md), fontWeight: "700" },
  addStepper: { flexDirection: "row", alignItems: "center", gap: webSc(SPACING.md) },
  addStepBtn: { width: webSc(40), height: webSc(40), borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surfaceLight, alignItems: "center", justifyContent: "center" },
  addStepBtnText: { color: COLORS.text, fontSize: webMs(FONT_SIZES.xl), fontWeight: "900" },
  addStepCount: { color: COLORS.text, fontSize: webMs(FONT_SIZES.lg), fontWeight: "900", minWidth: webSc(28), textAlign: "center" },
  addCustomRow: { flexDirection: "row", alignItems: "center", gap: webSc(SPACING.sm), marginTop: webSc(SPACING.md) },
  addCustomLabel: { color: COLORS.text, fontSize: webMs(FONT_SIZES.sm), fontWeight: "600" },
  addNamesScroll: { maxHeight: webSc(240), marginTop: webSc(SPACING.sm) },
  addNameInput: { height: webSc(42), backgroundColor: COLORS.surfaceLight, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, paddingHorizontal: webSc(SPACING.md), color: COLORS.text, fontSize: webMs(FONT_SIZES.sm), marginBottom: webSc(SPACING.xs), ...(isWeb ? ({ outlineStyle: "none" } as object) : null) },
  addPreview: { color: COLORS.textMuted, fontSize: webMs(FONT_SIZES.sm), marginTop: webSc(SPACING.md) },
  sheetBtns: { flexDirection: "row", alignItems: "stretch", gap: webSc(SPACING.sm), marginTop: webSc(SPACING.lg) },
  sheetCancel: { flex: 1, minHeight: webSc(50), paddingHorizontal: webSc(SPACING.sm), borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, alignItems: "center", justifyContent: "center" },
  sheetCancelText: { color: COLORS.textSecondary, fontSize: webMs(FONT_SIZES.md), fontWeight: "700" },
  sheetAdd: { flex: 1, minHeight: webSc(50), paddingHorizontal: webSc(SPACING.sm), borderRadius: RADIUS.md, backgroundColor: COLORS.primary, alignItems: "center", justifyContent: "center" },
  sheetAddText: { color: COLORS.white, fontSize: webMs(FONT_SIZES.md), fontWeight: "800" },

  // Side-pot entry — real checkboxes on the team card, matching the single/double
  // elim Players tab.
  tpotsBlock: { marginTop: 4, paddingTop: webSc(SPACING.xs), borderTopWidth: 1, borderTopColor: COLORS.border },
  tpotsHead: { color: COLORS.textSecondary, fontSize: webMs(FONT_SIZES.xs), fontWeight: "700", marginBottom: 2 },
  potRow: { flexDirection: "row", alignItems: "center", gap: webSc(SPACING.sm), paddingVertical: webSc(SPACING.xs) },
  potCheckbox: { width: webSc(22), height: webSc(22), borderRadius: RADIUS.sm, borderWidth: 1.5, borderColor: COLORS.border, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.background },
  potCheckboxOn: { backgroundColor: COLORS.success, borderColor: COLORS.success },
  potCheckMark: { color: COLORS.white, fontSize: webMs(FONT_SIZES.sm), fontWeight: "800" },
  potLabel: { fontSize: webMs(FONT_SIZES.sm), color: COLORS.text },
  potLabelOn: { color: COLORS.success, fontWeight: "600" },
  tteamFargoVal: { color: COLORS.primaryLight, fontWeight: "800" },
  tchipsAssigned: { color: COLORS.success, fontWeight: "800" },

  tfooter: { flexDirection: "row", alignItems: "flex-start", gap: webSc(SPACING.sm), marginTop: webSc(SPACING.sm) },
  tpaid: { borderWidth: 1, borderColor: COLORS.borderLight, borderRadius: RADIUS.sm, paddingHorizontal: webSc(SPACING.md), paddingVertical: 8 },
  tpaidOn: { borderColor: COLORS.success, backgroundColor: COLORS.success + "1F" },
  tpaidText: { color: COLORS.textSecondary, fontSize: webMs(FONT_SIZES.xs), fontWeight: "700" },
  tpaidTextOn: { color: COLORS.success },
  // Primary fills its footer slot (width:100%, NO flex) with the SAME chrome + height
  // as the Actions button (TeamCard's footerButton: width 100%, minHeight 46, radius
  // md). Hierarchy is the GREEN TEXT, not a fill or a wider size.
  tprimary: { width: "100%", minHeight: webSc(46), backgroundColor: COLORS.transparent, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.borderLight, alignItems: "center", justifyContent: "center" },
  tprimaryText: { color: COLORS.success, fontSize: webMs(FONT_SIZES.sm), fontWeight: "800" },
  tprimaryOff: { opacity: 0.4 },
  tprimaryDim: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.warning },
  tprimaryDimText: { color: COLORS.warning, fontSize: webMs(FONT_SIZES.sm), fontWeight: "700" },
  // Live "In Field" state — quiet neutral outline (participation is already established).
  tprimaryDone: { backgroundColor: COLORS.transparent, borderWidth: 1, borderColor: COLORS.borderLight },
  tprimaryDoneText: { color: COLORS.textSecondary, fontSize: webMs(FONT_SIZES.sm), fontWeight: "700" },
  // Setup Ready state — green outlined ✓ Ready: clearly Ready without a loud filled button
  // (the subtle green card border reinforces it).
  tprimaryReady: { backgroundColor: COLORS.transparent, borderWidth: 1, borderColor: COLORS.success },
  tprimaryReadyText: { color: COLORS.success, fontSize: webMs(FONT_SIZES.sm), fontWeight: "800" },

  menuBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", padding: webSc(SPACING.xl) },
  menuCard: { backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.border, overflow: "hidden", maxWidth: 360, width: "100%" as any, alignSelf: "center" as any },
  menuItem: { paddingVertical: webSc(SPACING.md), paddingHorizontal: webSc(SPACING.lg), borderBottomWidth: 1, borderBottomColor: COLORS.border },
  menuItemLast: { borderBottomWidth: 0 }, // last popover row — no trailing divider
  menuItemText: { color: COLORS.text, fontSize: webMs(FONT_SIZES.md), fontWeight: "600" },
  menuItemDanger: { color: COLORS.error },
  menuItemDisabled: { color: COLORS.textMuted },
  // Anchored Actions popover: a compact dark card positioned at the button, rendered
  // in-tree as a box-none overlay (no full-screen touch layer). Elevation/shadow so it
  // reads above the roster; the roster stays scrollable underneath.
  popover: {
    position: "absolute",
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  menuItemOn: { color: COLORS.primaryLight, fontWeight: "800" },

  // Status dropdown + refined card internals
  statusDrop: { alignSelf: "flex-start", paddingVertical: 6, paddingHorizontal: webSc(SPACING.md), borderRadius: RADIUS.sm, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, marginBottom: webSc(SPACING.md) },
  // Balanced 2-column filter row: Status + Sort (each an equal-width dropdown).
  // Pinned bar sits below the ScrollView (flex sibling) so it floats above the roster and
  // the app's bottom nav. contentWithCta reserves matching space so the last card clears it.
  reviewCtaBar: { paddingHorizontal: webSc(SPACING.md), paddingTop: webSc(SPACING.sm), paddingBottom: webSc(SPACING.lg), backgroundColor: COLORS.background, borderTopWidth: 1, borderTopColor: COLORS.border },
  reviewCta: { backgroundColor: COLORS.primary, borderRadius: RADIUS.md, paddingVertical: webSc(SPACING.md), alignItems: "center" },
  reviewCtaText: { color: COLORS.white, fontSize: webMs(FONT_SIZES.md), fontWeight: "800" },
  counterRow: { flexDirection: "row", gap: webSc(SPACING.sm), marginBottom: webSc(SPACING.sm) },
  counterChip: { flex: 1, alignItems: "center", paddingVertical: webSc(SPACING.sm), borderRadius: RADIUS.md, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  counterChipActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primary + "18" },
  counterNum: { color: COLORS.text, fontSize: webMs(FONT_SIZES.lg), fontWeight: "800" },
  counterNumActive: { color: COLORS.primaryLight },
  counterLabel: { color: COLORS.textMuted, fontSize: webMs(FONT_SIZES.xs), fontWeight: "700", marginTop: 1 },
  counterLabelActive: { color: COLORS.primaryLight },
  rosterFilterRow: { flexDirection: "row", gap: webSc(SPACING.sm), marginBottom: webSc(SPACING.md) },
  rosterFilterCol: { flex: 1, paddingVertical: 8, paddingHorizontal: webSc(SPACING.md), borderRadius: RADIUS.sm, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  statusDropText: { color: COLORS.textSecondary, fontSize: webMs(FONT_SIZES.sm), fontWeight: "700" },
  statusDropVal: { color: COLORS.text, fontWeight: "800" },
  flexSpacer2: { flex: 1 },
  pmeta: { color: COLORS.textMuted, fontSize: webMs(FONT_SIZES.xs), marginTop: 1 },
  pverifyCol: { alignItems: "flex-end", justifyContent: "center", minWidth: webSc(70) },
  peditRow: { flexDirection: "row", gap: webSc(SPACING.sm), alignItems: "center" },
  tsummary: { marginTop: webSc(SPACING.sm), backgroundColor: COLORS.surface, borderRadius: RADIUS.md, paddingHorizontal: webSc(SPACING.md), paddingVertical: 2 },
  tsumRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 3 },
  actionsBtn: { paddingVertical: webSc(SPACING.sm), paddingHorizontal: webSc(SPACING.md), borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.borderLight, alignItems: "center", justifyContent: "center" },
  actionsBtnText: { color: COLORS.textSecondary, fontSize: webMs(FONT_SIZES.sm), fontWeight: "700" },
  tsumLabel: { color: COLORS.textSecondary, fontSize: webMs(FONT_SIZES.xs), fontWeight: "600" },
  tsumVal: { color: COLORS.text, fontSize: webMs(FONT_SIZES.sm), fontWeight: "800" },
  tprimaryHint: { color: COLORS.warning, fontSize: webMs(FONT_SIZES.xs), fontWeight: "600", marginTop: 4, textAlign: "center" },
  approveName: { color: COLORS.text, fontSize: webMs(FONT_SIZES.md), fontWeight: "700", marginBottom: 2 },
  approveHelp: { color: COLORS.textSecondary, fontSize: webMs(FONT_SIZES.sm), lineHeight: webMs(18), marginBottom: webSc(SPACING.sm) },
  approveFargoLabel: { color: COLORS.textSecondary, fontSize: webMs(FONT_SIZES.xs), fontWeight: "600", marginBottom: 4 },
  approveActions: { flexDirection: "row", gap: webSc(SPACING.sm), marginTop: webSc(SPACING.md) },
  approveCancel: { flex: 1, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.sm, paddingVertical: webSc(SPACING.sm), alignItems: "center" },
  approveCancelText: { color: COLORS.textSecondary, fontSize: webMs(FONT_SIZES.sm), fontWeight: "600" },
  approveConfirm: { flex: 2, backgroundColor: COLORS.primary, borderRadius: RADIUS.sm, paddingVertical: webSc(SPACING.sm), alignItems: "center" },
  approveConfirmOff: { opacity: 0.5 },
  approveConfirmText: { color: COLORS.white, fontSize: webMs(FONT_SIZES.sm), fontWeight: "700" },
  teamFargoLine: { color: COLORS.textSecondary, fontSize: webMs(FONT_SIZES.xs), fontWeight: "700", marginTop: 2 },
  partnerBtn: { flex: 1, borderWidth: 1, borderStyle: "dashed", borderColor: COLORS.primary, borderRadius: RADIUS.sm, paddingVertical: webSc(SPACING.sm), alignItems: "center" },
  partnerBtnText: { color: COLORS.primary, fontSize: webMs(FONT_SIZES.sm), fontWeight: "600" },
  partnerActionsRow: { flexDirection: "row", gap: webSc(SPACING.sm) },
  invitePartnerBtn: { flex: 1, borderWidth: 1, borderColor: COLORS.primary, backgroundColor: COLORS.primary, borderRadius: RADIUS.sm, paddingVertical: webSc(SPACING.sm), alignItems: "center" },
  invitePartnerBtnText: { color: COLORS.white, fontSize: webMs(FONT_SIZES.sm), fontWeight: "700" },

  pickerBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-start", paddingHorizontal: webSc(SPACING.lg), paddingTop: webSc(70) },
  pickerCard: { backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.border, padding: webSc(SPACING.md), maxWidth: 460, width: "100%" as any, alignSelf: "center" as any, maxHeight: "70%" as any },
  pickerTitle: { color: COLORS.text, fontSize: webMs(FONT_SIZES.md), fontWeight: "700", marginBottom: webSc(SPACING.sm) },
  // Fargo-cap override modals. Sit a little lower than the picker so they don't feel
  // pushed against the top (and clear the notch/header comfortably).
  capBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-start", paddingHorizontal: webSc(SPACING.lg), paddingTop: webSc(150) },
  // Vertically centered variant for the short, keyboard-less confirm modals (e.g. Fargo
  // Now Over the Cap) so they don't sit high with empty space below.
  capCenterBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", alignItems: "center", paddingHorizontal: webSc(SPACING.lg) },
  capBody: { color: COLORS.text, fontSize: webMs(FONT_SIZES.sm), lineHeight: webMs(FONT_SIZES.sm + 5), marginBottom: webSc(SPACING.sm) },
  capStatRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: webSc(SPACING.xs), borderTopWidth: 1, borderTopColor: COLORS.border },
  capStatLabel: { color: COLORS.textSecondary, fontSize: webMs(FONT_SIZES.sm), fontWeight: "600" },
  capStatVal: { color: COLORS.text, fontSize: webMs(FONT_SIZES.md), fontWeight: "800" },
  capNote: { color: COLORS.textMuted, fontSize: webMs(FONT_SIZES.xs), marginTop: webSc(SPACING.sm), lineHeight: webMs(FONT_SIZES.xs + 4) },
  // Balanced two-up buttons: equal width (flex:1) + equal height (minHeight), one line.
  capBtnRow: { flexDirection: "row", gap: webSc(SPACING.sm), marginTop: webSc(SPACING.md) },
  capCancel: { flex: 1, minHeight: webSc(48), borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, paddingHorizontal: webSc(SPACING.sm), alignItems: "center", justifyContent: "center" },
  capCancelText: { color: COLORS.textSecondary, fontSize: webMs(FONT_SIZES.sm), fontWeight: "700" },
  capDanger: { flex: 1, minHeight: webSc(48), borderWidth: 1, borderColor: COLORS.error, borderRadius: RADIUS.md, paddingHorizontal: webSc(SPACING.sm), alignItems: "center", justifyContent: "center" },
  capDangerText: { color: COLORS.error, fontSize: webMs(FONT_SIZES.sm), fontWeight: "800" },
  capPrimary: { flex: 1, minHeight: webSc(48), backgroundColor: COLORS.warning, borderRadius: RADIUS.md, paddingHorizontal: webSc(SPACING.sm), alignItems: "center", justifyContent: "center" },
  capPrimaryText: { color: COLORS.white, fontSize: webMs(FONT_SIZES.sm), fontWeight: "800" },
  // Reason single-select dropdown (replaces the reason chips — one reason only).
  capSelect: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, backgroundColor: COLORS.surface, paddingHorizontal: webSc(SPACING.md), paddingVertical: webSc(SPACING.sm), marginBottom: webSc(SPACING.md) },
  capSelectText: { color: COLORS.text, fontSize: webMs(FONT_SIZES.sm), fontWeight: "700" },
  capSelectChevron: { color: COLORS.textSecondary, fontSize: webMs(FONT_SIZES.md), fontWeight: "700" },
  capSelectMenu: { borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, backgroundColor: COLORS.surface, marginTop: webSc(-SPACING.sm), marginBottom: webSc(SPACING.md), overflow: "hidden" },
  capSelectOption: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: webSc(SPACING.md), paddingVertical: webSc(SPACING.md) },
  capSelectOptionDiv: { borderTopWidth: 1, borderTopColor: COLORS.border },
  capSelectOptionText: { color: COLORS.textSecondary, fontSize: webMs(FONT_SIZES.sm), fontWeight: "600" },
  capSelectOptionTextOn: { color: COLORS.primaryLight, fontWeight: "800" },
  capSelectCheck: { color: COLORS.primaryLight, fontSize: webMs(FONT_SIZES.sm), fontWeight: "800" },
  capNotesLabel: { color: COLORS.textSecondary, fontSize: webMs(FONT_SIZES.xs), fontWeight: "700", marginBottom: webSc(SPACING.xs) },
  capNotesInput: { minHeight: webSc(64), backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, paddingHorizontal: webSc(SPACING.md), paddingVertical: webSc(SPACING.sm), color: COLORS.text, fontSize: webMs(FONT_SIZES.sm), textAlignVertical: "top", ...(isWeb ? ({ outlineStyle: "none" } as object) : null) },
  pickerInput: { backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.sm, paddingVertical: webSc(SPACING.sm), paddingHorizontal: 10, color: COLORS.text, fontSize: webMs(FONT_SIZES.sm), ...(isWeb ? ({ outlineStyle: "none" } as object) : null) },
  pickerResults: { marginTop: webSc(SPACING.sm), maxHeight: webSc(320) },
  pickerRow: { paddingVertical: webSc(SPACING.sm), borderBottomWidth: 1, borderBottomColor: COLORS.border },
  pickerName: { color: COLORS.text, fontSize: webMs(FONT_SIZES.md), fontWeight: "600" },
  pickerMeta: { color: COLORS.textSecondary, fontSize: webMs(FONT_SIZES.xs), marginTop: 1 },
  pickerId: { color: COLORS.primaryLight, fontWeight: "800" },
  pickerUser: { color: COLORS.warning, fontWeight: "800" },

  // Bottom-sheet player picker (autocomplete)
  sheetRoot: { flex: 1 },
  sheetDismiss: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.5)" },
  sheet: { position: "absolute", left: 0, right: 0, backgroundColor: COLORS.backgroundCard, borderRadius: 22, borderWidth: 1, borderColor: COLORS.borderLight, paddingHorizontal: webSc(SPACING.md), paddingTop: webSc(SPACING.sm), paddingBottom: webSc(SPACING.lg) },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: COLORS.borderLight, alignSelf: "center", marginBottom: webSc(SPACING.sm) },
  sheetTitle: { color: COLORS.text, fontSize: webMs(FONT_SIZES.md), fontWeight: "800", marginBottom: webSc(SPACING.sm) },
  sheetSearch: { height: webSc(44), backgroundColor: COLORS.surfaceLight, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, paddingHorizontal: webSc(SPACING.md), color: COLORS.text, fontSize: webMs(FONT_SIZES.sm), ...(isWeb ? ({ outlineStyle: "none" } as object) : null) },
  sheetPrompt: { color: COLORS.textMuted, fontSize: webMs(FONT_SIZES.sm), textAlign: "center", paddingVertical: webSc(SPACING.lg) },
  sheetResults: { maxHeight: webSc(300), marginTop: webSc(SPACING.sm) },
  pickerManual: { paddingVertical: webSc(SPACING.md), alignItems: "center" },
  pickerManualText: { color: COLORS.textMuted, fontSize: webMs(FONT_SIZES.sm) },
});
