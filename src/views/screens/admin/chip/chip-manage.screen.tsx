// src/views/screens/admin/chip/chip-manage.screen.tsx
// Chip Tournament manage flow (TD / Bar Owner). Structured like the bracket hub:
// a Setup / Live / Results phase with sub-page tabs. Setup pages = Settings (name,
// format, buy-backs, Fargo chip table), Players (registration), Tables (add/remove
// + mark stream), Review & Start. Live pages = Dashboard, Tables (winner buttons +
// timers), Queue, Players (chips/records + buy-back). Results = Standings.
// Rules in chip.engine.ts; persistence (real tables) in chip.service.ts.

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Keyboard,
  KeyboardAvoidingView,
  LayoutAnimation,
  Linking,
  Modal,
  Platform,
  Pressable,
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
import { COLORS } from "../../../../theme/colors";
import { RADIUS, SPACING } from "../../../../theme/spacing";
import { FONT_SIZES } from "../../../../theme/typography";
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
  finalPlacements,
  LONG_MATCH_MS,
  matchElapsedMs,
  recommendedActiveTables,
  teamFargoOf,
  teamName,
} from "../../../../models/services/chip.engine";
import { computeBreakdown, entryPoolTotal, feesPerPlayer } from "../../../../utils/prize-pool";
import { ChipEntry, ChipEvent, ChipTable } from "../../../../models/types/chip.types";
import { usePlayerSearch } from "../../../../viewmodels/hooks/use.player.search";
import { UnifiedRegisterModal } from "../../../components/tournament/UnifiedRegisterModal";
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
type EntryState = "waiting" | "pending" | "approved" | "checkedin";

const fmtClock = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  // h:mm:ss once past an hour (e.g. 1:25:33); m:ss below that (e.g. 8:42).
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
};
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
  onNavigate?: (tab: "players" | "tables" | "queue") => void;
  // Ask the host page to scroll its ScrollView to the top (host owns scrolling).
  onRequestScrollTop?: () => void;
  // Open the tournament's Settings page (the host owns tab nav in embedded mode).
  onOpenSettings?: () => void;
  // Open the Results → Standings page (host owns tab nav in embedded mode).
  onOpenResults?: () => void;
}

export const ChipManageScreen = ({ id, embedded, embeddedPage, onGoLive, actionsOpen: actionsOpenProp, onActionsOpenChange, onNavigate, onRequestScrollTop, onOpenSettings, onOpenResults }: ChipManageProps) => {
  const vm = useChipTournament(id);
  // Shared completed-tournament lock. Every manager page reads this: when true the
  // pages are historical/read-only — all mutating controls are hidden. The engine
  // guards (see the viewmodel) enforce the same lock so stale UI can't change it.
  const readOnly = vm.isFinished;
  const router = useRouter();
  // Acting Tournament Director — recorded on restores as "Performed by".
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
  const { width: winW } = useWindowDimensions();
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
  const [addTblCustom, setAddTblCustom] = useState(false);
  const [addTblNames, setAddTblNames] = useState<string[]>([]);
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
  // Tables master/detail: open detail for a table, and the move-destination picker.
  const [tableDetailId, setTableDetailId] = useState<string | null>(null);
  const [moveFromId, setMoveFromId] = useState<string | null>(null);
  const [manualAssignId, setManualAssignId] = useState<string | null>(null);
  const [tableHistoryId, setTableHistoryId] = useState<string | null>(null);
  // Player ⋮ actions: an anchored dropdown that drops from the tapped button and
  // opens leftward. We measure the button in the window, then place the menu.
  const [playerMenu, setPlayerMenu] = useState<{ id: string; top: number; left: number } | null>(null);
  const playerMenuRefs = useRef<Record<string, any>>({});
  // Table ⋮ actions: same anchored-dropdown pattern for the Active Tables rows.
  const [tableMenu, setTableMenu] = useState<{ id: string; top: number; left: number } | null>(null);
  const tableMenuRefs = useRef<Record<string, any>>({});
  // Actions sheet layered INSIDE the Table Details modal (one native modal, no
  // nesting) + which history rows are expanded in the Match History modal.
  const [detailActions, setDetailActions] = useState(false);
  const [histOpenIds, setHistOpenIds] = useState<string[]>([]);
  // Full-screen queue manager + the per-team action sheet inside it.
  const [queueModalOpen, setQueueModalOpen] = useState(false);
  const [queueMenuId, setQueueMenuId] = useState<string | null>(null);
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
  const [rosterQuery, setRosterQuery] = useState("");
  const [rosterFilter, setRosterFilter] = useState<"all" | "pending" | "approved" | "checkedin">("all");
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  const [editEntryId, setEditEntryId] = useState<string | null>(null);
  const [menuEntryId, setMenuEntryId] = useState<string | null>(null);

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
    const pend = vm.chip?.tables?.find(
      (t) => t.pendingChallengerId && t.holderId && !t.matchId && !ackedPendingRef.current.has(`${t.id}:${t.pendingChallengerId}`),
    );
    if (pend) setAssignPopupTableId(pend.id);
  }, [vm.chip, assignPopupTableId]);

  // When a shuffle round completes (→ "Ready to Shuffle"), jump the page to the
  // top so the Shuffle Mode banner / Start Shuffle button is right there.
  const prevReadyRef = useRef(false);
  useEffect(() => {
    const ready = !!vm.chip?.shuffleReady;
    if (ready && !prevReadyRef.current) onRequestScrollTop?.();
    prevReadyRef.current = ready;
  }, [vm.chip?.shuffleReady, onRequestScrollTop]);

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

  if (vm.loading) {
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
  const tournamentSidePots = (tournament?.side_pots ?? []).filter((p) =>
    (p.name ?? "").trim(),
  );
  const toggleSidePot = (e: ChipEntry, name: string) => {
    if (e.teamId == null) return;
    const cur = e.paidSidePots ?? [];
    const next = cur.includes(name)
      ? cur.filter((n) => n !== name)
      : [...cur, name];
    vm.setTeamSidePots(e.teamId, next);
  };

  // ── Setup · Players (registration) ───────────────────────────────────────────
  const fargoOf = (n: number | null | undefined) => (n == null ? "" : String(n));
  const setFargo = (entryId: string, key: "p1Fargo" | "p2Fargo", v: string) => {
    const d = v.replace(/\D/g, "");
    vm.updateEntry(entryId, { [key]: d === "" ? null : parseInt(d, 10) } as any);
  };
  // ── Players page: state machine + card renderers ─────────────────────────────
  const hasPartner = (e: ChipEntry) =>
    !e.isTeam || e.p2MemberId != null || (!!e.p2Name && e.p2Name !== "") || e.p2ProfileId != null;
  const allVerified = (e: ChipEntry) =>
    e.isTeam ? !!e.p1FargoVerified && !!e.p2FargoVerified : e.regStatus === "approved";
  const isApproved = (e: ChipEntry) => (e.isTeam ? !!e.teamApproved : e.regStatus === "approved");
  const entryState = (e: ChipEntry): EntryState => {
    if (e.isTeam && !hasPartner(e)) return "waiting";
    if (e.checkedIn) return "checkedin";
    if (isApproved(e)) return "approved";
    return "pending";
  };
  const STATE_META: Record<EntryState, { label: string; color: string }> = {
    waiting: { label: "Waiting", color: COLORS.warning },
    pending: { label: "Pending", color: COLORS.warning },
    approved: { label: "Approved", color: COLORS.success },
    checkedin: { label: "Checked In", color: COLORS.success },
  };
  const approveEntry = async (e: ChipEntry) => {
    try {
      if (e.isTeam && e.teamId != null) await vm.approveTeam(e.teamId, true);
      else if (!e.isTeam && e.regId != null && e.p1Fargo != null) await vm.approveRegistration(e.regId, e.p1Fargo);
    } catch {
      Alert.alert("Error", "Couldn't approve. Please try again.");
    }
  };
  // Check-in / paid persist on the team (survives roster reloads); singles stay
  // local. Both are optimistic, so the card updates in place.
  const setCheckIn = (e: ChipEntry, next: boolean) => {
    if (e.teamId != null) vm.setTeamCheckedIn(e.teamId, next);
    else vm.updateEntry(e.id, { checkedIn: next });
  };
  const setPaid = (e: ChipEntry, next: boolean) => {
    if (e.teamId != null) vm.setTeamPaid(e.teamId, next);
    else vm.updateEntry(e.id, { paid: next });
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
  // Delete a table with the right confirmation for its state.
  const confirmDeleteTable = (t: ChipTable) => {
    const liveMatch = t.matchId && chip.matches.some((m) => m.id === t.matchId && m.status === "in_progress");
    const msg = liveMatch
      ? `${t.label} has a match in progress. Removing it will interrupt that match and return both teams to the queue.`
      : t.holderId
        ? `${t.label} has a waiting winner — they'll be returned to the front of the queue.`
        : `Remove ${t.label}?`;
    Alert.alert(`Remove ${t.label}?`, msg, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: () => { vm.removeTable(t.id); setTableDetailId(null); },
      },
    ]);
  };
  // Smart remove: empty/waiting → remove now; live match → remove AFTER the match.
  const confirmRemoveTableSmart = (t: ChipTable) => {
    const m = chip.matches.find((mm) => mm.id === t.matchId && mm.status === "in_progress");
    if (m) {
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
    } else {
      Alert.alert(`Remove ${t.label}?`, `${t.label} will be removed from the tournament.`, [
        { text: "Cancel", style: "cancel" },
        { text: "Remove", style: "destructive", onPress: () => vm.closeTables([t.id]) },
      ]);
    }
  };
  const confirmForfeitTeam = (t: ChipTable) => {
    const m = chip.matches.find((mm) => mm.id === t.matchId && mm.status === "in_progress");
    if (m) {
      const a = entryById(m.aId);
      const b = entryById(m.bId);
      Alert.alert("Forfeit Team", "Which team is forfeiting the tournament?", [
        { text: "Cancel", style: "cancel" },
        { text: a ? teamName(a) : "Team A", style: "destructive", onPress: () => vm.forfeitEntry(m.aId) },
        { text: b ? teamName(b) : "Team B", style: "destructive", onPress: () => vm.forfeitEntry(m.bId) },
      ]);
    } else if (t.holderId) {
      const h = entryById(t.holderId);
      Alert.alert(
        "Forfeit Team",
        `Are you sure you want to remove ${h ? teamName(h) : "this team"} from this tournament?`,
        [
          { text: "Cancel", style: "cancel" },
          { text: "Forfeit", style: "destructive", onPress: () => t.holderId && vm.forfeitEntry(t.holderId) },
        ],
      );
    }
  };
  const confirmClearTable = (t: ChipTable) => {
    Alert.alert(
      `Clear ${t.label}?`,
      "The current team(s) return to the queue and the table is emptied.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Clear Table", style: "destructive", onPress: () => vm.clearTable(t.id) },
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
    Alert.alert(
      "Remove From Queue",
      `Remove ${shortTeam(e)} from the queue? They will be eliminated from the tournament.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Remove", style: "destructive", onPress: () => vm.forfeitEntry(e.id) },
      ],
    );
  };
  const saveRename = () => {
    if (!renameTbl) return;
    const v = renameVal.trim();
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
    setAddTblCustom(false);
    setAddTblNames([]);
    setAddTblOpen(true);
  };
  const setAddName = (i: number, v: string) =>
    setAddTblNames((prev) => {
      const next = [...prev];
      next[i] = v;
      return next;
    });
  // Toggling Customize lifts the sheet to reserve keyboard space (so the keyboard
  // opens underneath it, not pushing it); animate the shift smoothly.
  const toggleCustomize = () => {
    if (!isWeb) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setAddTblCustom((v) => !v);
  };
  const confirmAddTables = () => {
    const names = addTblCustom
      ? Array.from({ length: addTblCount }, (_, i) => addTblNames[i]?.trim() || null)
      : undefined;
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
    // Tournament Performance Rating — SAME formula as the standard tournament
    // (utils/tournament.stats.ts): rating = weighted avg opponent Fargo shifted
    // by win rate. Each chip match counts as one game, weighted by the opponent's
    // team Fargo. Positive delta vs your own Fargo = overperforming.
    const TPR_K = -100 / Math.log(2);
    let wins = 0;
    let games = 0;
    let oppFargoSum = 0;
    let weightedGames = 0;
    for (const m of finished) {
      const oppId = m.aId === e.id ? m.bId : m.aId;
      const opp = chip.entries.find((x) => x.id === oppId);
      games += 1;
      if (m.winnerId === e.id) wins += 1;
      const of = opp?.teamFargo ?? null;
      if (of != null) {
        oppFargoSum += of;
        weightedGames += 1;
      }
    }
    const avgOpp = weightedGames > 0 ? Math.round(oppFargoSum / weightedGames) : null;
    let performanceRating: number | null = null;
    if (games > 0 && weightedGames > 0) {
      const cap = Math.min(0.99, Math.max(0.01, wins / games));
      performanceRating = Math.round(oppFargoSum / weightedGames + TPR_K * Math.log((1 - cap) / cap));
    }
    const ownFargo = e.teamFargo ?? null;
    const performanceDelta =
      performanceRating != null && ownFargo != null ? performanceRating - ownFargo : null;
    const perfLabel =
      performanceDelta == null ? null
        : performanceDelta > 50 ? "Exceptional"
          : performanceDelta > 15 ? "Above expectation"
            : performanceDelta >= -15 ? "As expected"
              : performanceDelta >= -50 ? "Below expectation"
                : "Underperforming";
    // Timeline: chip events that name this team.
    const nm = teamName(e);
    const timeline = chip.events.filter((ev) => ev.text.includes(nm)).slice(0, 40);
    return { e, history, opponents, qi, status, table, matchesPlayed, winPct, performanceRating, performanceDelta, avgOpp, perfLabel, timeline };
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
    const verified = which === 1 ? (e.isTeam ? !!e.p1FargoVerified : e.regStatus === "approved") : !!e.p2FargoVerified;
    const memberId = which === 1 ? e.p1MemberId : e.p2MemberId;
    const canVerify = (e.isTeam && memberId != null) || (!e.isTeam && e.regId != null);
    const onVerify = () => {
      if (e.isTeam && memberId != null) openConfirmMember(memberId, name || "Player", fargo ?? null);
      else if (!e.isTeam && e.regId != null) openApprove(e.regId, name || "Player", fargo ?? null);
    };
    const onRemovePlayer = () => {
      if (memberId != null) {
        Alert.alert("Remove player", `Remove ${name || "this player"} from the team?`, [
          { text: "Cancel", style: "cancel" },
          { text: "Remove", style: "destructive", onPress: () => vm.removeTeamMember(memberId) },
        ]);
      } else if (which === 2) {
        vm.updateEntry(e.id, { p2Name: null, p2Fargo: null, p2ProfileId: null });
      } else {
        vm.removeEntry(e.id);
      }
    };
    return (
      <View style={styles.prow}>
        <View style={styles.pavatar}><Text style={styles.pavatarText}>{(name || "?").charAt(0).toUpperCase()}</Text></View>
        <View style={{ flex: 1 }}>
          {editing ? (
            <View style={styles.peditRow}>
              <TextInput allowFontScaling={false} style={[styles.peditName, { flex: 1 }]} value={name} onChangeText={(v) => vm.updateEntry(e.id, which === 1 ? { p1Name: v } : { p2Name: v })} placeholder={`Player ${which}`} placeholderTextColor={COLORS.textMuted} />
              <View style={styles.peditFargoWrap}>
                <Text style={styles.phash}>#</Text>
                <TextInput allowFontScaling={false} style={styles.peditFargo} value={fargoOf(fargo)} onChangeText={(v) => setFargo(e.id, which === 1 ? "p1Fargo" : "p2Fargo", v)} keyboardType="number-pad" placeholder="Fargo" placeholderTextColor={COLORS.textMuted} maxLength={4} />
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
            ) : canVerify && !readOnly ? (
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

  // The single large workflow button (+ a hint when approval is still blocked).
  const renderPrimary = (e: ChipEntry, st: EntryState) => {
    // Completed: no workflow action — just a static final status badge.
    if (readOnly)
      return <View style={[styles.tprimary, styles.tprimaryDone]}><Text style={styles.tprimaryDoneText}>{e.checkedIn ? "✓ Checked In" : "Registered"}</Text></View>;
    if (st === "waiting")
      return <View style={[styles.tprimary, styles.tprimaryDim]}><Text style={styles.tprimaryDimText}>Waiting for Partner</Text></View>;
    if (st === "checkedin")
      return <TouchableOpacity style={[styles.tprimary, styles.tprimaryDone]} onPress={() => setCheckIn(e, false)}><Text style={styles.tprimaryDoneText}>✓ Checked In · Ready</Text></TouchableOpacity>;
    if (st === "approved")
      return <TouchableOpacity style={styles.tprimary} onPress={() => setCheckIn(e, true)}><Text style={styles.tprimaryText}>Check In {doubles ? "Team" : "Player"}</Text></TouchableOpacity>;
    const verified = allVerified(e);
    return (
      <View style={{ flex: 1 }}>
        <TouchableOpacity style={[styles.tprimary, !verified && styles.tprimaryOff]} disabled={!verified} onPress={() => approveEntry(e)}>
          <Text style={styles.tprimaryText}>Approve {doubles ? "Team" : "Player"}</Text>
        </TouchableOpacity>
        {!verified && <Text style={styles.tprimaryHint}>Verify both Fargo ratings before approving.</Text>}
      </View>
    );
  };

  // Attention first: Pending → Approved → Checked In (applies even under "All").
  const rank = (st: EntryState) => (st === "checkedin" ? 2 : st === "approved" ? 1 : 0);
  const rosterFiltered = chip.entries
    .filter((e) => {
      const st = entryState(e);
      if (rosterFilter === "pending" && !(st === "pending" || st === "waiting")) return false;
      if (rosterFilter === "approved" && st !== "approved") return false;
      if (rosterFilter === "checkedin" && st !== "checkedin") return false;
      const q = rosterQuery.trim().toLowerCase();
      if (q) {
        const hay = `${e.p1Name} ${e.p2Name ?? ""} ${e.p1ProfileId ?? ""} ${e.p2ProfileId ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    })
    .sort((a, b) => rank(entryState(a)) - rank(entryState(b)));
  const STATUS_LABELS: Record<typeof rosterFilter, string> = {
    all: "All",
    pending: "Pending Approval",
    approved: "Approved",
    checkedin: "Checked In",
  };

  // Expanded detail body for the desktop players table — reuses the existing
  // player rows (verify / Fargo / IDs), chip-override edit, side pots, and the
  // approve control. No new logic; just the collapsible detail region.
  const renderTeamExpanded = (e: ChipEntry, st: EntryState, editing: boolean) => (
    <View style={styles.ptExpand}>
      {renderPlayerRow(e, 1)}
      {doubles &&
        (hasPartner(e) ? (
          renderPlayerRow(e, 2)
        ) : readOnly ? null : (
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
      {editing && !readOnly && e.teamId != null && (
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
              <TouchableOpacity key={name} disabled={readOnly} style={styles.potRow} onPress={() => toggleSidePot(e, name)} activeOpacity={0.7}>
                <View style={[styles.potCheckbox, inPot && styles.potCheckboxOn]}>{inPot && <Text style={styles.potCheckMark}>✓</Text>}</View>
                <Text style={[styles.potLabel, inPot && styles.potLabelOn]}>{name}{amt}{inPot ? " · Entered" : ""}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}
      {st === "pending" && !readOnly && (
        <>
          <TouchableOpacity style={[styles.ptApprove, !allVerified(e) && styles.tprimaryOff]} disabled={!allVerified(e)} onPress={() => approveEntry(e)}>
            <Text style={styles.ptApproveText}>Approve {doubles ? "Team" : "Player"}</Text>
          </TouchableOpacity>
          {!allVerified(e) && <Text style={styles.tprimaryHint}>Verify both Fargo ratings before approving.</Text>}
        </>
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
        {readOnly && (
          <Text style={styles.readOnlyNote}>Tournament completed — player registration is locked.</Text>
        )}
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
          {!readOnly && (
            <TouchableOpacity style={styles.ptAddBtn} onPress={() => (doubles ? setUnifiedOpen({ resumeTeam: null }) : setPicker({ mode: "new" }))} activeOpacity={0.85}>
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
              const meta = STATE_META[st];
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
                        <TouchableOpacity disabled={readOnly} onPress={() => setPaid(e, !e.paid)} style={[styles.ptBadge, e.paid ? styles.ptBadgeGood : styles.ptBadgeMuted]} activeOpacity={0.7}>
                          <Text allowFontScaling={false} style={[styles.ptBadgeText, e.paid ? styles.ptBadgeTextGood : styles.ptBadgeTextMuted]}>{e.paid ? "Paid" : "Unpaid"}</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                    <View style={styles.ptcStatus}>
                      {readOnly ? (
                        <View style={[styles.ptBadge, e.checkedIn ? styles.ptBadgeGood : { borderColor: meta.color + "88", backgroundColor: meta.color + "22" }]}>
                          <Text allowFontScaling={false} style={[styles.ptBadgeText, e.checkedIn ? styles.ptBadgeTextGood : { color: meta.color }]}>{e.checkedIn ? "Checked In" : meta.label}</Text>
                        </View>
                      ) : st === "checkedin" ? (
                        <TouchableOpacity onPress={() => setCheckIn(e, false)} style={[styles.ptBadge, styles.ptBadgeGood]} activeOpacity={0.7}>
                          <Text allowFontScaling={false} style={[styles.ptBadgeText, styles.ptBadgeTextGood]}>Checked In</Text>
                        </TouchableOpacity>
                      ) : st === "approved" ? (
                        <TouchableOpacity onPress={() => setCheckIn(e, true)} style={styles.ptCheckBtn} activeOpacity={0.85}>
                          <Text allowFontScaling={false} style={styles.ptCheckBtnText}>Check In</Text>
                        </TouchableOpacity>
                      ) : (
                        <View style={[styles.ptBadge, { borderColor: meta.color + "88", backgroundColor: meta.color + "22" }]}>
                          <Text allowFontScaling={false} style={[styles.ptBadgeText, { color: meta.color }]}>{meta.label}</Text>
                        </View>
                      )}
                    </View>
                    <View style={styles.ptcActions}>
                      {!readOnly && (
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

  const renderPlayersSetup = () => {
    if (isWeb && winW >= 760) return renderPlayersSetupDesktop();
    return (
    <View>
      {readOnly && (
        <Text style={styles.readOnlyNote}>Tournament completed — player registration is locked.</Text>
      )}
      <View style={styles.searchRow}>
        <TextInput allowFontScaling={false} style={styles.searchInput} value={rosterQuery} onChangeText={setRosterQuery} placeholder="Search by player or team name…" placeholderTextColor={COLORS.textMuted} autoCapitalize="none" autoCorrect={false} />
        {!readOnly && (
          <TouchableOpacity style={styles.addBtn} onPress={() => (doubles ? setUnifiedOpen({ resumeTeam: null }) : setPicker({ mode: "new" }))}>
            <Text style={styles.addBtnText}>+ Add {doubles ? "Team" : "Player"}</Text>
          </TouchableOpacity>
        )}
      </View>
      <TouchableOpacity style={styles.statusDrop} onPress={() => setStatusMenuOpen(true)}>
        <Text style={styles.statusDropText}>Status: <Text style={styles.statusDropVal}>{STATUS_LABELS[rosterFilter]}</Text>  ▾</Text>
      </TouchableOpacity>

      {rosterFiltered.length === 0 && (
        <Text style={styles.hint}>
          {chip.entries.length === 0
            ? `No ${doubles ? "teams" : "players"} yet. Tap “+ Add ${doubles ? "Team" : "Player"}”.`
            : "No matches for this filter."}
        </Text>
      )}

      {rosterFiltered.map((e, i) => {
        const st = entryState(e);
        const meta = STATE_META[st];
        const editing = editEntryId === e.id;
        return (
          <View key={e.id} style={styles.tcard}>
            <View style={styles.tcardHead}>
              <Text style={styles.tcardNum}>{doubles ? "Team" : "Player"} #{i + 1}</Text>
              <View style={styles.flexSpacer2} />
              <View style={[styles.tbadge, { borderColor: meta.color, backgroundColor: meta.color + "22" }]}>
                <Text style={[styles.tbadgeText, { color: meta.color }]}>{meta.label}</Text>
              </View>
              <View style={styles.tchipPill}><Text style={styles.tchipText}>{chipPreview(e)} Chips</Text></View>
            </View>
            {/* Only a custom team name (e.g. "Desert Sharks") — the player rows below
                already show who's on the team, so we never repeat their names here. */}
            {e.teamName ? <Text style={styles.tcardName} numberOfLines={2}>{e.teamName}</Text> : null}

            {renderPlayerRow(e, 1)}
            {doubles &&
              (hasPartner(e) ? (
                renderPlayerRow(e, 2)
              ) : (
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

            {editing && e.teamId != null && (
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

            <View style={styles.tsummary}>
              {doubles && hasPartner(e) && (
                <View style={styles.tsumRow}>
                  <Text style={styles.tsumLabel}>Team Fargo</Text>
                  <Text style={styles.tsumVal}>{(e.p1Fargo ?? 0) + (e.p2Fargo ?? 0)}</Text>
                </View>
              )}
              <View style={styles.tsumRow}>
                <Text style={styles.tsumLabel}>Assigned Chips</Text>
                <Text style={[styles.tsumVal, { color: COLORS.primaryLight }]}>{chipPreview(e)}{e.chipOverride != null ? " · manual" : ""}</Text>
              </View>
              <TouchableOpacity style={styles.tsumRow} onPress={() => setPaid(e, !e.paid)}>
                <Text style={styles.tsumLabel}>Payment</Text>
                <Text style={[styles.tsumVal, { color: e.paid ? COLORS.success : COLORS.textSecondary }]}>{e.paid ? "Paid ✓" : "Unpaid"}</Text>
              </TouchableOpacity>
              <View style={styles.tsumRow}>
                <Text style={styles.tsumLabel}>Check In</Text>
                <Text style={[styles.tsumVal, { color: e.checkedIn ? COLORS.success : COLORS.textSecondary }]}>{e.checkedIn ? "Checked In ✓" : "Not Checked In"}</Text>
              </View>
              {tournamentSidePots.length > 0 && e.teamId != null && (
                <View style={styles.tpotsBlock}>
                  <Text style={styles.tpotsHead}>Side Pots</Text>
                  {tournamentSidePots.map((p) => {
                    const name = p.name.trim();
                    const inPot = (e.paidSidePots ?? []).includes(name);
                    const amt = Number(p.amount) ? ` ($${Number(p.amount)})` : "";
                    return (
                      <TouchableOpacity
                        key={name}
                        style={styles.potRow}
                        onPress={() => toggleSidePot(e, name)}
                        activeOpacity={0.7}
                      >
                        <View style={[styles.potCheckbox, inPot && styles.potCheckboxOn]}>
                          {inPot && <Text style={styles.potCheckMark}>✓</Text>}
                        </View>
                        <Text style={[styles.potLabel, inPot && styles.potLabelOn]}>
                          {name}{amt}{inPot ? " · Entered" : ""}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </View>

            <View style={styles.tfooter}>
              {!readOnly && (
                <TouchableOpacity style={styles.actionsBtn} onPress={() => (editing ? setEditEntryId(null) : setMenuEntryId(e.id))}>
                  <Text style={styles.actionsBtnText}>{editing ? "Done" : "Actions"}</Text>
                </TouchableOpacity>
              )}
              {renderPrimary(e, st)}
            </View>
          </View>
        );
      })}
    </View>
    );
  };

  // ── Setup · Tables (incl. stream marking) ────────────────────────────────────
  const renderTablesSetup = () => {
    // Recommend roughly one table per 3 entrants — with winner-stays, ~2 seats
    // per table means a third of the field plays at once and the rest queue.
    const entrantWord = doubles ? "teams" : "players";
    const entrantCount = chip.entries.length;
    const recommendedTables = Math.max(1, Math.round(entrantCount / 3));
    const perLow = Math.floor(entrantCount / recommendedTables);
    const perHigh = Math.ceil(entrantCount / recommendedTables);
    const perLabel = perLow === perHigh ? `${perLow}` : `${perLow}–${perHigh}`;

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
      {entrantCount > 0 && (
        <View style={styles.recCard}>
          <View style={styles.recTop}>
            <Text style={styles.recIcon}>🎱</Text>
            <Text style={styles.recTitle}>Recommended setup</Text>
          </View>
          <Text style={styles.recLine}>
            For {entrantCount} {entrantWord}, we recommend{" "}
            <Text style={styles.recNum}>{recommendedTables} table{recommendedTables === 1 ? "" : "s"}</Text>
          </Text>
          <Text style={styles.recSub}>Approximately {perLabel} {entrantWord} per table</Text>
          {chip.tables.length !== recommendedTables && (
            <TouchableOpacity style={styles.recBtn} onPress={useRecommended}>
              <Text style={styles.recBtnText}>Use {recommendedTables} Table{recommendedTables === 1 ? "" : "s"}</Text>
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
      {chip.tables.length === 0 && <Text style={styles.hint}>Add at least one table to run the queue.</Text>}
    </Section>
    );
  };

  // ── Setup · Review & Start ───────────────────────────────────────────────────
  const renderReview = () => {
    const started = vm.phase !== "setup";
    const ready = chip.entries.filter((e) => e.checkedIn).length >= 2 && chip.tables.length >= 1 && chip.settings.tiers.length >= 1;
    return (
      <Section title={started ? "Tournament" : "Review & Start"}>
        <View style={styles.reviewRow}>
          <Review label="Checked in" value={chip.entries.filter((e) => e.checkedIn).length} sub={`${chip.entries.length} registered`} />
          <Review label="Tables" value={chip.tables.length} />
          <Review label="Tiers" value={chip.settings.tiers.length} />
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
          <TouchableOpacity style={[styles.startBtn, !ready && styles.startBtnDisabled]} disabled={!ready || vm.starting} onPress={vm.start}>
            {vm.starting ? <ActivityIndicator color="#fff" /> : <Text style={styles.startBtnText}>{ready ? "Start Tournament" : "Need 2+ checked-in players, a table, and a chip tier"}</Text>}
          </TouchableOpacity>
        )}
      </Section>
    );
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
    const round = !!chip.shuffleRound && !draining && !ready;
    const roundNum = chip.reshuffleCount ?? 0;
    const aliveTeams = chip.entries.filter((e) => e.status !== "eliminated");
    const remainingSet = new Set(chip.roundRemaining ?? []);
    const totalCount = aliveTeams.length;
    // Countdown toward the next shuffle: alive teams still waiting to play their
    // round match (i.e. still in roundRemaining). Ticks down as each is seated.
    const remainingCount = aliveTeams.filter((e) => remainingSet.has(e.id)).length;
    const stateLabel = ready
      ? roundNum > 0 ? "Round Complete — Ready to Shuffle" : "Ready to Shuffle"
      : round
      ? `Round ${roundNum} in Progress`
      : draining
      ? "Finishing the Round"
      : "Normal Play — Shuffle Mode Available";
    const accent = ready ? COLORS.primary : round ? COLORS.success : draining ? COLORS.warning : COLORS.textSecondary;
    return (
      <View style={[styles.shufBanner, { borderColor: ready || round || draining ? accent : COLORS.border }]}>
        <View style={styles.shufHead}>
          <View style={styles.shufTitleWrap}>
            <Ionicons name="shuffle" size={webMs(16)} color={accent} />
            <Text style={styles.shufTitle}>Shuffle Mode</Text>
          </View>
          <Switch
            value={!!chip.shuffleMode}
            onValueChange={(v) => vm.setShuffleMode(v)}
            trackColor={{ true: COLORS.primary, false: COLORS.border }}
            thumbColor={COLORS.white}
          />
        </View>
        <Text style={[styles.shufState, { color: accent }]}>{stateLabel}</Text>
        {round && (
          <>
            <Text style={styles.shufCount}>
              {remainingCount} of {totalCount} Team{remainingCount === 1 ? "" : "s"} Remaining
            </Text>
            <Text style={styles.shufSub}>Every team plays once before the next shuffle.</Text>
          </>
        )}
        {draining && (
          <Text style={styles.shufSub}>
            {live} match{live === 1 ? "" : "es"} still in progress. Each table clears as its match finishes.
          </Text>
        )}
        {ready && (
          <Text style={styles.shufSub}>
            {roundNum > 0 ? "This round is complete. " : "All tables are clear. "}Adjust the table layout if needed, then start the next round.
          </Text>
        )}
        {!draining && !ready && !round && (
          <TouchableOpacity style={[styles.shufPrimary, isWeb && styles.shufPrimaryWeb]} onPress={vm.beginShuffle} activeOpacity={0.85}>
            <Text style={styles.shufPrimaryText}>Begin Shuffle</Text>
          </TouchableOpacity>
        )}
        {ready && (
          <View style={styles.shufBtnRow}>
            <TouchableOpacity style={styles.shufGhost} onPress={() => setReduceOpen(true)} activeOpacity={0.85}>
              <Text style={styles.shufGhostText} numberOfLines={1}>Manage Tables</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.shufPrimarySm} onPress={() => vm.startShuffle()} activeOpacity={0.85}>
              <Text style={styles.shufPrimaryText} numberOfLines={1}>Start Shuffle</Text>
            </TouchableOpacity>
          </View>
        )}
        {(draining || ready || round) && (
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

  // ── Live · Dashboard (live control center) ───────────────────────────────────
  const renderLiveDashboard = () => {
    const d = dashboard(chip);
    const alive = chip.entries.filter((e) => e.status !== "eliminated");
    const activeTables = chip.tables.filter((t) => !t.inactive);
    const activeCount = activeTables.length;
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
    const alerts: { text: string; sub?: string; onPress?: () => void; cta?: string; urgent?: boolean }[] = [];
    if (overStaffed) alerts.push({ text: `Recommended tables: ${rec}`, sub: `Currently active: ${activeCount}`, onPress: openReduce, cta: "Reduce" });
    if (streamAvail) alerts.push({ text: "Stream table available" });
    for (const lm of longNow) alerts.push({ text: `Long match: ${lm.clock} on ${lm.label}`, urgent: true });

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
          <TouchableOpacity onPress={() => setShowFullStandings(true)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={styles.leaderLinkN}>View Standings</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity onPress={() => setProfileId(chipLeader.id)} activeOpacity={0.7}>
          <Text style={styles.leaderNameN} numberOfLines={1}>{shortTeam(chipLeader)}</Text>
          <View style={styles.leaderMetaRowN}>
            <Text style={styles.leaderMetaN} numberOfLines={1}>{chipLeader.teamFargo != null ? `Combined Fargo: ${chipLeader.teamFargo}` : ""}</Text>
            <Text style={styles.leaderChipsN}>{chipLeader.chips} chips</Text>
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

    const alertsEl = alerts.length > 0 ? (
      <DashSection icon="warning-outline" iconColor={COLORS.warning} title="Alerts">
        {alerts.map((a, i) => (
          <View key={i} style={[styles.alertRow2, i === alerts.length - 1 && styles.noBorder]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.alertText2, a.urgent && styles.alertUrgent]}>{a.text}</Text>
              {a.sub ? <Text style={styles.alertSub2}>{a.sub}</Text> : null}
            </View>
            {a.onPress && (
              <TouchableOpacity style={styles.secBtnSm} onPress={a.onPress}><Text style={styles.secBtnSmText}>{a.cta}</Text></TouchableOpacity>
            )}
          </View>
        ))}
      </DashSection>
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
                    {e.teamFargo != null ? <Text style={styles.qFargo2}>Combined Fargo: {e.teamFargo}</Text> : null}
                  </View>
                  <Text style={styles.qChipsRight}>{e.chips} {e.chips === 1 ? "chip" : "chips"}</Text>
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

    const activeTablesEl = (
        <DashSection icon="grid-outline" title="Active Tables" action={!chip.shuffleMode ? <HeaderBtn label="Shuffle Mode" onPress={() => vm.setShuffleMode(true)} /> : undefined}>
          {activeTables.length === 0 && <Text style={styles.hint}>No active tables.</Text>}
          <View style={dashTwoCol ? styles.atGrid : undefined}>
          {activeTables.map((t) => {
            const m = chip.matches.find((mm) => mm.id === t.matchId && mm.status === "in_progress");
            const a = m ? entryById(m.aId) : null;
            const b = m ? entryById(m.bId) : null;
            const elapsed = m ? matchElapsedMs(m, now) : 0;
            const holder = entryById(t.holderId);
            const pending = !m && t.pendingChallengerId ? entryById(t.pendingChallengerId) : null;
            const dotColor = m || holder ? COLORS.success : COLORS.textMuted; // dot stays green even past 7:00
            const badgeColor = m ? timerColor(elapsed) : pending ? COLORS.primary : COLORS.textMuted;
            const statusLbl = m ? `Live ${fmtClock(elapsed)}` : pending ? "Waiting to Start" : holder ? "Waiting" : "Available";
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
                    ref={(r) => { tableMenuRefs.current[t.id] = r; }}
                    style={styles.atMenuHit}
                    onPress={() => openTableMenu(t.id)}
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
                      <Text style={styles.atMatchTeam}>{shortTeam(a)}</Text>
                      <Text style={styles.atVs}>VS</Text>
                      <Text style={styles.atMatchTeam}>{shortTeam(b)}</Text>
                    </>
                  ) : holder && pending ? (
                    <>
                      <Text style={styles.atMatchTeam}>{shortTeam(holder)}</Text>
                      <Text style={styles.atVs}>VS</Text>
                      <Text style={styles.atMatchTeam}>{shortTeam(pending)}</Text>
                    </>
                  ) : holder ? (
                    <>
                      <Text style={styles.atMatchTeam}>{shortTeam(holder)}</Text>
                      <Text style={styles.atVs}>VS</Text>
                      <Text style={styles.atMatchWaiting}>Waiting for Opponent</Text>
                    </>
                  ) : (
                    <Text style={styles.atMatchWaiting}>No team assigned</Text>
                  )}
                </TouchableOpacity>
                {pending && (
                  <TouchableOpacity style={styles.atStartBtn} onPress={() => vm.startPendingMatch(t.id)} activeOpacity={0.85}>
                    <Text style={styles.atStartBtnText}>Start Match</Text>
                  </TouchableOpacity>
                )}
              </Pressable>
            );
          })}
          </View>
        </DashSection>
    );

    const chipLeadersEl = (
        <DashSection icon="trophy-outline" title="Chip Leaders" action={<HeaderBtn label={showFullStandings ? "Show less" : "View Standings"} onPress={() => setShowFullStandings((v) => !v)} />}>
          {leaderList.map((e, i) => (
            <TouchableOpacity key={e.id} style={[styles.clRow, i === 0 && styles.clRowTop]} onPress={() => setProfileId(e.id)} activeOpacity={0.7}>
              <Text style={styles.clRank}>{i + 1}.</Text>
              <Text style={styles.clName} numberOfLines={1}>{shortTeam(e)}</Text>
              <Text style={styles.clChips}>{e.chips} chips</Text>
            </TouchableOpacity>
          ))}
        </DashSection>
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
    return (
      <View>
        {renderShuffleBanner()}

        {/* Header buttons */}
        <View style={styles.tblToolbar}>
          <TouchableOpacity style={styles.tbAddBtn} onPress={openAddTables} activeOpacity={0.85}>
            <Ionicons name="add" size={webMs(16)} color={COLORS.white} />
            <Text style={styles.tbAddText}>Add Table</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tbReshufBtn, chip.shuffleMode && styles.tbReshufBtnOn]}
            onPress={() => vm.setShuffleMode(!chip.shuffleMode)}
            activeOpacity={0.85}
          >
            <Ionicons name="shuffle" size={webMs(16)} color={chip.shuffleMode ? COLORS.primary : COLORS.text} />
            <Text style={[styles.tbReshufText, chip.shuffleMode && { color: COLORS.primary }]}>
              {chip.shuffleMode ? "Shuffle On" : "Shuffle Mode"}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Compact recommendation banner */}
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

        {/* Compact table cards */}
        {activeTables.map((table) => {
          const match = chip.matches.find((m) => m.id === table.matchId && m.status === "in_progress");
          const a = match ? entryById(match.aId) : null;
          const b = match ? entryById(match.bId) : null;
          const holder = entryById(table.holderId);
          const elapsed = match ? matchElapsedMs(match, now) : 0;
          const current = match ? a : holder;
          const status =
            match ? { color: COLORS.error, label: "Live • " + fmtClock(elapsed) }
              : table.locked ? { color: COLORS.warning, label: "Locked" }
                : table.isStream ? { color: COLORS.primary, label: "Stream" }
                  : holder ? { color: COLORS.success, label: "Waiting for Opponent" }
                    : chip.reshufflePending ? { color: COLORS.warning, label: "Pending" }
                      : { color: COLORS.textMuted, label: "Empty" };
          return (
            <TouchableOpacity key={table.id} style={styles.tCard} onPress={() => setTableDetailId(table.id)} activeOpacity={0.7}>
              <View style={styles.tCardTop}>
                <Text style={styles.tCardName} numberOfLines={1}>{table.label}</Text>
                <View style={styles.tCardStatus}>
                  <View style={[styles.tCardDot, { backgroundColor: status.color }]} />
                  <Text style={[styles.tCardStatusText, { color: status.color }]}>{status.label}</Text>
                </View>
              </View>

              {current ? (
                <View style={styles.tCardTeam}>
                  <Text style={styles.tCardPlayer} numberOfLines={1}>{current.p1Name || "—"}</Text>
                  {doubles && current.p2Name ? <Text style={styles.tCardPlayer} numberOfLines={1}>{current.p2Name}</Text> : null}
                  {current.teamFargo != null && <Text style={styles.tCardFargo}>Combined Fargo: {current.teamFargo}</Text>}
                </View>
              ) : (
                <Text style={styles.tCardEmpty}>No team assigned</Text>
              )}

              {match && b ? (
                <Text style={styles.tCardSub} numberOfLines={1}>vs. {shortTeam(b)}</Text>
              ) : holder ? (
                <Text style={styles.tCardSub}>Waiting for challenger</Text>
              ) : null}

              <TouchableOpacity style={styles.tCardDelete} onPress={() => confirmDeleteTable(table)} hitSlop={10}>
                <Ionicons name="trash-outline" size={webMs(18)} color={COLORS.textMuted} />
              </TouchableOpacity>
            </TouchableOpacity>
          );
        })}

        {activeTables.length === 0 && <Text style={styles.hint}>No active tables. Add one above.</Text>}

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
            <Text style={styles.queueName} numberOfLines={1}>{shortTeam(e)}</Text>
            <Text style={styles.queueMeta}>{e.chips} chip{e.chips === 1 ? "" : "s"} · {e.wins}-{e.losses}</Text>
          </View>
        );
      })}
      {chip.queue.length === 0 && <Text style={styles.hint}>Queue is empty.</Text>}
    </Section>
  );

  // Measure an anchor node in the window and place a dropdown just below it,
  // right-edge aligned (opens left), clamped to stay on-screen.
  const placeMenu = (
    node: any,
    id: string,
    setter: (v: { id: string; top: number; left: number }) => void,
    estH = webSc(300),
  ) => {
    const MENU_W = webSc(210);
    const screen = Dimensions.get("window");
    if (node && node.measureInWindow) {
      node.measureInWindow((x: number, y: number, w: number, h: number) => {
        let left = x + w - MENU_W;
        left = Math.max(webSc(8), Math.min(left, screen.width - MENU_W - webSc(8)));
        let top = y + h + webSc(4);
        if (top + estH > screen.height) top = Math.max(webSc(40), screen.height - estH - webSc(8));
        setter({ id, top, left });
      });
    } else {
      setter({ id, top: webSc(120), left: Math.max(webSc(8), screen.width - MENU_W - webSc(8)) });
    }
  };
  const openPlayerMenu = (id: string) => placeMenu(playerMenuRefs.current[id], id, setPlayerMenu);
  const openTableMenu = (id: string) => placeMenu(tableMenuRefs.current[id], id, setTableMenu, webSc(360));

  // ── Live · Players (records + buy-back) ──────────────────────────────────────

  const renderLivePlayers = () => {
    const alive = chip.entries.filter((e) => e.status !== "eliminated");
    const out = chip.entries.filter((e) => e.status === "eliminated");
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
        <Section title={`Players (${alive.length})`}>
          {alive.map((e) => (
            <View key={e.id} style={styles.playerRow}>
              <TouchableOpacity style={styles.playerTap} onPress={() => setProfileId(e.id)} activeOpacity={0.7}>
                <Text style={styles.playerName} numberOfLines={1}>{shortTeam(e)} <Text style={styles.playerChevron}>›</Text></Text>
                <Text style={styles.playerMeta}>{e.chips} chips · {e.wins}-{e.losses} · {readOnly ? finalLabel(e) : e.status}</Text>
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
      </>
    );
  };

  // ── Results · Standings ──────────────────────────────────────────────────────
  const renderStandings = () => {
    const alive = [...chip.entries].filter((e) => e.status !== "eliminated").sort((a, b) => b.chips - a.chips || b.wins - a.wins);
    const out = [...chip.entries].filter((e) => e.status === "eliminated").sort((a, b) => b.wins - a.wins);
    const row = (e: ChipEntry, rank: number) => {
      const isOut = e.status === "eliminated";
      return (
        <TouchableOpacity key={e.id} style={styles.standRow} onPress={() => setProfileId(e.id)} activeOpacity={0.7}>
          <Text style={styles.standRank}>{rank}</Text>
          <Text style={[styles.standName, isOut && styles.playerOut]} numberOfLines={1}>{shortTeam(e)}</Text>
          <Text style={styles.standMeta}>{e.chips} · {e.wins}-{e.losses} · {e.eliminations}K</Text>
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
    const paidPlayers = chip.entries.filter((e) => e.paid).length;
    const entryFee = Number(tournament.entry_fee) || 0;
    const addedMoney = Number(tournament.added_money) || 0;
    const ls: any = tournament.live_settings ?? {};
    const fees = (ls.fees ?? []).filter((f: any) => f.enabled);
    const cfg = ls.prizePool ?? null;
    const includeAdded = cfg?.includeAddedMoney ?? true;
    const pool = entryPoolTotal(paidPlayers, entryFee, feesPerPlayer(fees), !!ls.feesAddedOnTop, includeAdded, addedMoney);
    const payoutPlaces = cfg?.entryPlaces?.length ? computeBreakdown(pool, cfg.entryPlaces).places : null;
    return (
      <View>
        <Text style={styles.sumHeader}>Payouts</Text>
        <Text style={styles.sumSubHeader}>Final placements → payout positions</Text>
        <SumGroup
          title="PRIZE POOL"
          rows={[
            ["Entry Fee", entryFee ? money(entryFee) : "—"],
            ["Added Money", addedMoney ? money(addedMoney) : "—"],
            ["Paid Entries", String(paidPlayers)],
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
      </View>
    );
  };

  const renderSummary = () => {
    const alive = chip.entries.filter((e) => e.status !== "eliminated");
    const out = chip.entries.filter((e) => e.status === "eliminated");
    const winner = chip.winnerId ? entryById(chip.winnerId) : alive.length === 1 ? alive[0] : null;
    const d = dashboard(chip);
    const durs = chip.matches.filter((m) => m.endedAt).map((m) => new Date(m.endedAt as string).getTime() - new Date(m.startedAt).getTime()).filter((x) => x > 0);
    const fastest = durs.length ? Math.min(...durs) : null;
    const checkedIn = chip.entries.filter((e) => e.checkedIn).length;
    const paidCount = chip.entries.filter((e) => e.paid).length;
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
  const modals = (
    <>
      {/* Phase 5: unified Scotch-Doubles Add Team flow (search-first, ACTIVE+PENDING,
          inline Create, inline Fargo, Continue/Save-as-Waiting, Team Review). Replaces
          the legacy picker + Fargo popup for doubles; singles still uses the picker
          below. onTeamSaved reloads the roster so chip calcs/status recompute. */}
      {doubles && (
        <UnifiedRegisterModal
          visible={unifiedOpen != null}
          onClose={() => setUnifiedOpen(null)}
          tournamentId={id}
          mode="doubles"
          resumeTeam={unifiedOpen?.resumeTeam ?? null}
          computeChips={(f1, f2) => chipsForFargo(chip.settings.tiers, (f1 ?? 0) + (f2 ?? 0))}
          onTeamSaved={() => {
            setUnifiedOpen(null);
            vm.reload();
          }}
        />
      )}

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
                  {picker?.mode === "new" && (
                    <TouchableOpacity
                      style={styles.pickerManual}
                      onPress={() => {
                        vm.addEntry();
                        setPicker(null);
                        playerSearch.reset();
                      }}
                    >
                      <Text style={styles.pickerManualText}>+ Add walk-in (no account — type manually)</Text>
                    </TouchableOpacity>
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

      <Modal
        visible={menuEntryId != null}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuEntryId(null)}
      >
        <Pressable style={styles.menuBackdrop} onPress={() => setMenuEntryId(null)}>
          <Pressable style={styles.menuCard} onPress={() => {}}>
            {(() => {
              const e = entryById(menuEntryId);
              if (!e) return null;
              return (
                <>
                  <TouchableOpacity style={styles.menuItem} onPress={() => { setEditEntryId(e.id); setMenuEntryId(null); }}>
                    <Text style={styles.menuItemText}>Edit {e.isTeam ? "Team" : "Player"}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.menuItem} onPress={() => { setPaid(e, !e.paid); setMenuEntryId(null); }}>
                    <Text style={styles.menuItemText}>{e.paid ? "Mark Unpaid" : "Mark Paid"}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.menuItem} onPress={() => { setCheckIn(e, !e.checkedIn); setMenuEntryId(null); }}>
                    <Text style={styles.menuItemText}>{e.checkedIn ? "Undo Check In" : "Check In"}</Text>
                  </TouchableOpacity>
                  {e.isTeam && e.teamId != null && e.teamApproved && (
                    <TouchableOpacity style={styles.menuItem} onPress={() => { vm.approveTeam(e.teamId as number, false); setMenuEntryId(null); }}>
                      <Text style={styles.menuItemText}>Unlock Fargo</Text>
                    </TouchableOpacity>
                  )}
                  {e.teamLocked && e.teamId != null && (
                    <TouchableOpacity style={styles.menuItem} onPress={() => { vm.unlockTeam(e.teamId as number); setMenuEntryId(null); }}>
                      <Text style={styles.menuItemText}>Unlock Registration</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    style={styles.menuItem}
                    onPress={() => {
                      const label = e.isTeam ? "team" : "player";
                      Alert.alert("Remove", `Remove this ${label} from the tournament?`, [
                        { text: "Cancel", style: "cancel" },
                        { text: "Remove", style: "destructive", onPress: () => vm.removeEntry(e.id) },
                      ]);
                      setMenuEntryId(null);
                    }}
                  >
                    <Text style={[styles.menuItemText, styles.menuItemDanger]}>Remove {e.isTeam ? "Team" : "Player"}</Text>
                  </TouchableOpacity>
                </>
              );
            })()}
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={statusMenuOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setStatusMenuOpen(false)}
      >
        <Pressable style={styles.menuBackdrop} onPress={() => setStatusMenuOpen(false)}>
          <Pressable style={styles.menuCard} onPress={() => {}}>
            {(["all", "pending", "approved", "checkedin"] as const).map((key) => (
              <TouchableOpacity
                key={key}
                style={styles.menuItem}
                onPress={() => { setRosterFilter(key); setStatusMenuOpen(false); }}
              >
                <Text style={[styles.menuItemText, rosterFilter === key && styles.menuItemOn]}>
                  {rosterFilter === key ? "✓  " : ""}
                  {{ all: "All", pending: "Pending Approval", approved: "Approved", checkedin: "Checked In" }[key]}
                </Text>
              </TouchableOpacity>
            ))}
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

            <TouchableOpacity style={styles.addCustomRow} onPress={toggleCustomize}>
              <View style={[styles.potCheckbox, addTblCustom && styles.potCheckboxOn]}>
                {addTblCustom && <Text style={styles.potCheckMark}>✓</Text>}
              </View>
              <Text style={styles.addCustomLabel}>Customize Names</Text>
            </TouchableOpacity>

            {addTblCustom ? (
              <ScrollView style={styles.addNamesScroll} keyboardShouldPersistTaps="handled">
                {Array.from({ length: addTblCount }).map((_, i) => (
                  <TextInput
                    key={i}
                    allowFontScaling={false}
                    style={styles.addNameInput}
                    value={addTblNames[i] ?? `Table ${chip.tables.length + i + 1}`}
                    onChangeText={(v) => setAddName(i, v)}
                    selectTextOnFocus
                    placeholderTextColor={COLORS.textMuted}
                  />
                ))}
              </ScrollView>
            ) : (
              <Text style={styles.addPreview}>
                Adds{" "}
                {Array.from({ length: Math.min(addTblCount, 3) }, (_, i) => `Table ${chip.tables.length + i + 1}`).join(", ")}
                {addTblCount > 3 ? `, … (+${addTblCount - 3} more)` : ""}
              </Text>
            )}

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
                          const turningOn = !chip.shuffleMode;
                          setActionsOpen(false);
                          vm.setShuffleMode(turningOn);
                          // Enabling shows the "Begin Shuffle" banner at the top — jump to it.
                          if (turningOn) onRequestScrollTop?.();
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
              const perfColor =
                p.perfLabel === "Exceptional" || p.perfLabel === "Above expectation" ? COLORS.success
                  : p.perfLabel === "As expected" ? COLORS.textSecondary
                    : COLORS.error;
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
                      <Text style={[styles.pStatVal, { color: COLORS.primaryLight }]}>{entry.chips}</Text>
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
                      <View style={styles.pRow}><Text style={styles.pRowLabel}>Remaining</Text><Text style={styles.pRowValue}>{entry.chips}</Text></View>
                      {p.perfLabel && (
                        <View style={styles.pRow}>
                          <Text style={styles.pRowLabel}>Performance</Text>
                          <Text style={[styles.pRowValue, { color: perfColor }]}>{p.perfLabel}</Text>
                        </View>
                      )}
                    </View>

                    {/* Small performance highlight card */}
                    {p.performanceRating != null && (
                      <View style={styles.pPerfCard}>
                        <Text style={styles.pPerfLabel}>Performance Rating</Text>
                        <Text style={styles.pPerfRating}>{p.performanceRating}</Text>
                        {p.performanceDelta != null && (
                          <Text style={[styles.pPerfDelta, { color: p.performanceDelta > 0 ? COLORS.success : p.performanceDelta < 0 ? COLORS.error : COLORS.textSecondary }]}>
                            {p.performanceDelta >= 0 ? "▲" : "▼"} {Math.abs(p.performanceDelta)} {p.performanceDelta >= 0 ? "Above" : "Below"} Fargo
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
                              <Item icon="add-circle-outline" label="Add Chip" onPress={() => { close(); vm.adjustChips(entry.id, 1); }} />
                              <Item icon="remove-circle-outline" label="Remove Chip" onPress={() => { close(); vm.adjustChips(entry.id, -1); }} />
                              {entry.tableId && (
                                <Item icon="time-outline" label="Reset Match Timer" onPress={() => { close(); vm.resetTableTimer(entry.tableId as string); }} />
                              )}
                            </>
                          )}
                          {(p.status === "waiting" || p.status === "next") && (
                            <>
                              <Item icon="add-circle-outline" label="Add Chip" onPress={() => { close(); vm.adjustChips(entry.id, 1); }} />
                              <Item icon="remove-circle-outline" label="Remove Chip" onPress={() => { close(); vm.adjustChips(entry.id, -1); }} />
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
                          <Text style={styles.tdMatchTeam}>{shortTeam(a)}</Text>
                          <View style={styles.tdVsWrap}><Text style={styles.tdVsText}>VS</Text></View>
                          <Text style={styles.tdMatchTeam}>{shortTeam(b)}</Text>
                        </>
                      ) : holder && pend ? (
                        <>
                          <Text style={styles.tdMatchTeam}>{shortTeam(holder)}</Text>
                          <View style={styles.tdVsWrap}><Text style={styles.tdVsText}>VS</Text></View>
                          <Text style={styles.tdMatchTeam}>{shortTeam(pend)}</Text>
                        </>
                      ) : holder ? (
                        <>
                          <Text style={styles.tdMatchTeam}>{shortTeam(holder)}</Text>
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
                          holder && holder.teamFargo != null ? { lbl: "Combined Fargo", val: String(holder.teamFargo) } : null,
                          holder ? { lbl: "Current Chips", val: String(holder.chips) } : null,
                          waitMs != null ? { lbl: "Waiting Time", val: fmtDur(waitMs) } : null,
                          matchMs != null ? { lbl: "Match Time", val: fmtDur(matchMs) } : null,
                        ].filter(Boolean) as { lbl: string; val: string }[]).map((s) => (
                          <View key={s.lbl} style={styles.tdStatCard}>
                            <Text style={styles.tdStatLbl}>{s.lbl}</Text>
                            <Text style={styles.tdStatVal} numberOfLines={1}>{s.val}</Text>
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
                    <Row icon={t.locked ? "lock-open-outline" : "lock-closed-outline"} label={t.locked ? "Unlock Table" : "Lock Table"} onPress={() => { close(); vm.setTableLocked(t.id, !t.locked); }} />
                    <Row icon="videocam-outline" label={t.isStream ? "Edit Stream Link" : "Add Stream Link"} onPress={() => leaveTo(() => openStreamLink(t))} />
                  </View>
                  <View style={styles.actSheetGroup}>
                    <Row icon="trash-outline" danger label="Remove Table" onPress={() => { close(); confirmRemoveTableSmart(t); }} />
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

      {/* Table actions (⋮) — anchored dropdown */}
      <Modal visible={tableMenu != null} transparent animationType="none" onRequestClose={() => setTableMenu(null)}>
        <Pressable style={styles.ddBackdrop} onPress={() => setTableMenu(null)}>
          {(() => {
            const t = tableMenu ? chip.tables.find((x) => x.id === tableMenu.id) : null;
            if (!t || !tableMenu) return null;
            const close = () => setTableMenu(null);
            const match = chip.matches.find((m) => m.id === t.matchId && m.status === "in_progress");
            const holder = entryById(t.holderId);
            const occupied = !!match || !!holder;
            const canMove = chip.tables.some((x) => x.id !== t.id && !x.inactive && !x.locked && !x.matchId && !x.holderId);
            const Row = ({ label, icon, onPress, danger, disabled }: { label: string; icon: React.ComponentProps<typeof Ionicons>["name"]; onPress: () => void; danger?: boolean; disabled?: boolean }) => (
              <TouchableOpacity style={[styles.ddRow, disabled && styles.btnDisabledLite]} disabled={disabled} onPress={onPress} activeOpacity={0.6}>
                <Ionicons name={icon} size={webMs(17)} color={danger ? COLORS.error : COLORS.textSecondary} />
                <Text style={[styles.ddRowText, danger && { color: COLORS.error }]} numberOfLines={1}>{label}</Text>
              </TouchableOpacity>
            );
            return (
              <Pressable style={[styles.ddCard, { top: tableMenu.top, left: tableMenu.left }]} onPress={() => {}}>
                <Text style={styles.ddName} numberOfLines={1}>{t.label}</Text>
                <ScrollView style={{ maxHeight: webSc(320) }} showsVerticalScrollIndicator={false}>
                  {match && <Row icon="trophy-outline" label="Set Winner" onPress={() => { close(); setCompleteMatch({ matchId: match.id, aId: match.aId, bId: match.bId }); }} />}
                  {occupied && <Row icon="exit-outline" label="Forfeit Team" onPress={() => { close(); confirmForfeitTeam(t); }} />}
                  {occupied && <Row icon="time-outline" label="Reset Match Timer" onPress={() => { close(); vm.resetTableTimer(t.id); }} />}
                  {occupied && <Row icon="refresh-outline" label="Clear Table" onPress={() => { close(); confirmClearTable(t); }} />}
                  {!match && <Row icon="play-forward-outline" label="Assign Next Team" disabled={t.locked || (!holder && chip.queue.length < 2) || (!!holder && chip.queue.length < 1)} onPress={() => { close(); vm.assignNextTeam(t.id); }} />}
                  {!match && <Row icon="hand-left-outline" label="Manually Assign" disabled={t.locked || chip.queue.length === 0} onPress={() => { close(); setManualAssignId(t.id); }} />}
                  {occupied && <Row icon="swap-horizontal-outline" label="Move Team" disabled={!canMove} onPress={() => { close(); setMoveFromId(t.id); }} />}
                  <Row icon="create-outline" label="Rename Table" onPress={() => { close(); openRename(t); }} />
                  <Row icon={t.locked ? "lock-open-outline" : "lock-closed-outline"} label={t.locked ? "Unlock Table" : "Lock Table"} onPress={() => { close(); vm.setTableLocked(t.id, !t.locked); }} />
                  <Row icon="videocam-outline" label={t.isStream ? "Edit Stream Link" : "Add Stream Link"} onPress={() => { close(); openStreamLink(t); }} />
                  <Row icon="trash-outline" label="Remove Table" danger onPress={() => { close(); confirmRemoveTableSmart(t); }} />
                </ScrollView>
              </Pressable>
            );
          })()}
        </Pressable>
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
                        <Text style={styles.qmChips}>{e.chips} {e.chips === 1 ? "chip" : "chips"}</Text>
                      </View>
                      <Text style={styles.qmMeta} numberOfLines={1}>
                        <Text style={styles.qmMetaFargo}>Fargo {e.teamFargo != null ? e.teamFargo : "—"}</Text>
                        <Text style={styles.qmMetaDot}>  •  </Text>
                        <Text style={styles.qmWin}>W{e.wins}</Text>
                        <Text style={styles.qmMetaDot}>  •  </Text>
                        <Text style={styles.qmLoss}>L{e.losses}</Text>
                      </Text>
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
              Alert.alert(
                "Forfeit",
                `Are you sure you want to remove ${teamName(e)} from this tournament?`,
                [
                  { text: "Cancel", style: "cancel" },
                  { text: "Forfeit", style: "destructive", onPress: () => vm.forfeitEntry(e.id) },
                ],
              );
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
              <Pressable style={[styles.ddCard, { top: playerMenu.top, left: playerMenu.left }]} onPress={() => {}}>
                <Text style={styles.ddName} numberOfLines={1}>{teamName(e)}</Text>
                {eliminated ? (
                  <Row icon="refresh-outline" label="Restore Team" onPress={confirmRestore} last />
                ) : (
                  <>
                    <Row icon="add-circle-outline" label="Add Chip" onPress={() => { close(); vm.adjustChips(e.id, 1); }} />
                    <Row icon="remove-circle-outline" label="Remove Chip" onPress={() => { close(); vm.adjustChips(e.id, -1); }} />
                    <Row icon="exit-outline" label="Forfeit" onPress={confirmForfeit} danger last />
                  </>
                )}
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
                    <Text style={styles.tCardFargo}>{e.teamFargo != null ? `(${e.teamFargo}) · ` : ""}{e.chips} chips</Text>
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

  // Embedded: just the page content + overlays; the host manager supplies the
  // header, phase nav, and scroll container.
  if (embedded) {
    return (
      <View>
        {content()}
        {modals}
      </View>
    );
  }

  return (
    <View style={styles.container}>
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

      <ScrollView style={styles.scroll} contentContainerStyle={[styles.content, isWeb && styles.contentWeb]} keyboardShouldPersistTaps="handled">
        {content()}
      </ScrollView>

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
const Review = ({ label, value, sub }: { label: string; value: number; sub?: string }) => (
  <View style={styles.reviewCard}>
    <Text style={styles.reviewValue}>{value}</Text>
    <Text style={styles.reviewLabel}>{label}</Text>
    {sub ? <Text style={styles.reviewSub}>{sub}</Text> : null}
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
  reviewCard: { flex: 1, backgroundColor: COLORS.background, borderRadius: RADIUS.md, padding: webSc(SPACING.md), alignItems: "center" },
  reviewValue: { color: COLORS.text, fontSize: webMs(FONT_SIZES.xl), fontWeight: "800" },
  reviewLabel: { color: COLORS.textSecondary, fontSize: webMs(FONT_SIZES.sm) },
  reviewSub: { color: COLORS.textMuted, fontSize: webMs(FONT_SIZES.xs) },

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
  atStartBtn: { marginTop: webSc(SPACING.sm), backgroundColor: COLORS.primary, borderRadius: RADIUS.md, paddingVertical: webSc(SPACING.sm), alignItems: "center" },
  atStartBtnText: { color: COLORS.white, fontSize: webMs(FONT_SIZES.sm), fontWeight: "800" },
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

  playerRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: webSc(SPACING.xs), borderBottomWidth: 1, borderBottomColor: COLORS.border },
  playerName: { color: COLORS.text, fontSize: webMs(FONT_SIZES.sm), fontWeight: "600", flex: 1 },
  playerOut: { color: COLORS.error, textDecorationLine: "line-through" },
  playerMeta: { color: COLORS.textSecondary, fontSize: webMs(FONT_SIZES.xs) },
  playerMetaOut: { color: COLORS.error, opacity: 0.8 },
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
  ddCard: { position: "absolute", width: webSc(210), backgroundColor: COLORS.backgroundCard, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.borderLight, paddingVertical: webSc(SPACING.xs), shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 8 },
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
  tblToolbar: { flexDirection: "row", gap: webSc(SPACING.sm), marginBottom: webSc(SPACING.md) },
  // Clean toolbar buttons (filled primary + secondary outline, same height).
  tbAddBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, backgroundColor: COLORS.primary, borderRadius: RADIUS.md, paddingVertical: webSc(SPACING.sm), paddingHorizontal: webSc(SPACING.md) },
  tbAddText: { color: COLORS.white, fontSize: webMs(FONT_SIZES.sm), fontWeight: "700" },
  tbReshufBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, paddingVertical: webSc(SPACING.sm), paddingHorizontal: webSc(SPACING.md) },
  tbReshufBtnOn: { borderColor: COLORS.primary, backgroundColor: COLORS.primary + "18" },
  tbReshufText: { color: COLORS.text, fontSize: webMs(FONT_SIZES.sm), fontWeight: "700" },

  // Shuffle Mode banner
  shufBanner: { backgroundColor: COLORS.backgroundCard, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, paddingHorizontal: webSc(SPACING.md), paddingVertical: webSc(SPACING.md), marginBottom: webSc(SPACING.md) },
  shufHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  shufTitleWrap: { flexDirection: "row", alignItems: "center", gap: 6 },
  shufTitle: { color: COLORS.text, fontSize: webMs(FONT_SIZES.md), fontWeight: "800" },
  shufState: { fontSize: webMs(FONT_SIZES.sm), fontWeight: "700", marginTop: webSc(SPACING.xs) },
  shufCount: { color: COLORS.text, fontSize: webMs(FONT_SIZES.md), fontWeight: "800", marginTop: webSc(SPACING.xs) },
  shufSub: { color: COLORS.textMuted, fontSize: webMs(FONT_SIZES.xs), marginTop: 2, lineHeight: webMs(FONT_SIZES.xs) * 1.4 },
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
  tdSheetOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" },
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
  standRank: { color: COLORS.textMuted, fontSize: webMs(FONT_SIZES.sm), fontWeight: "700", width: 22 },
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
  recCard: { backgroundColor: COLORS.primary + "14", borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.primary + "44", paddingHorizontal: webSc(SPACING.md), paddingVertical: webSc(SPACING.sm), marginBottom: webSc(SPACING.md), gap: 2 },
  recTop: { flexDirection: "row", alignItems: "center", gap: 6 },
  recIcon: { fontSize: webMs(FONT_SIZES.sm) },
  recTitle: { color: COLORS.text, fontSize: webMs(FONT_SIZES.xs), fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.5 },
  recLine: { color: COLORS.textSecondary, fontSize: webMs(FONT_SIZES.sm) },
  recNum: { color: COLORS.primaryLight, fontSize: webMs(FONT_SIZES.md), fontWeight: "900" },
  recSub: { color: COLORS.textMuted, fontSize: webMs(FONT_SIZES.xs) },
  recBtn: { alignSelf: "flex-start", marginTop: webSc(SPACING.xs), backgroundColor: COLORS.primary, borderRadius: RADIUS.md, paddingHorizontal: webSc(SPACING.md), paddingVertical: 7 },
  recBtnText: { color: COLORS.white, fontSize: webMs(FONT_SIZES.sm), fontWeight: "800" },

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
  centerDim: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.6)" },
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
  auditMenuBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center", padding: webSc(SPACING.lg) },
  auditMenuCard: { width: "100%", maxWidth: webSc(300), backgroundColor: COLORS.backgroundCard, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.borderLight, paddingVertical: webSc(SPACING.xs), overflow: "hidden" },
  auditMenuItem: { flexDirection: "row", alignItems: "center", gap: webSc(SPACING.sm), paddingHorizontal: webSc(SPACING.md), paddingVertical: webSc(SPACING.sm), minHeight: webSc(44) },
  auditMenuItemTop: { alignItems: "flex-start" },
  auditMenuIcon: { marginTop: webSc(2) },
  auditMenuText: { color: COLORS.text, fontSize: webMs(FONT_SIZES.sm), fontWeight: "700", lineHeight: webMs(FONT_SIZES.sm) * 1.3 },
  // Anchored ⋯ menu (compact, positioned at the tap).
  auditAnchorBackdrop: { ...StyleSheet.absoluteFillObject },
  auditAnchorMenu: { position: "absolute", backgroundColor: COLORS.backgroundCard, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.borderLight, paddingVertical: webSc(SPACING.xs), overflow: "hidden", shadowColor: "#000", shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.3, shadowRadius: 14, elevation: 10 },
  // Restore-confirmation — keyboard-aware modal (own layer, sticky footer).
  restoreRoot: { ...StyleSheet.absoluteFillObject, justifyContent: "center", alignItems: "center", padding: webSc(SPACING.lg) },
  restoreBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.78)" },
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
  playerTap: { flex: 1 },
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
  tprimary: { flex: 1, backgroundColor: COLORS.success, borderRadius: RADIUS.md, paddingVertical: webSc(SPACING.sm), alignItems: "center" },
  tprimaryText: { color: COLORS.white, fontSize: webMs(FONT_SIZES.sm), fontWeight: "800" },
  tprimaryOff: { opacity: 0.4 },
  tprimaryDim: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.warning },
  tprimaryDimText: { color: COLORS.warning, fontSize: webMs(FONT_SIZES.sm), fontWeight: "700" },
  tprimaryDone: { backgroundColor: COLORS.transparent, borderWidth: 1, borderColor: COLORS.success },
  tprimaryDoneText: { color: COLORS.success, fontSize: webMs(FONT_SIZES.sm), fontWeight: "800" },

  menuBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", padding: webSc(SPACING.xl) },
  menuCard: { backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.border, overflow: "hidden", maxWidth: 360, width: "100%" as any, alignSelf: "center" as any },
  menuItem: { paddingVertical: webSc(SPACING.md), paddingHorizontal: webSc(SPACING.lg), borderBottomWidth: 1, borderBottomColor: COLORS.border },
  menuItemText: { color: COLORS.text, fontSize: webMs(FONT_SIZES.md), fontWeight: "600" },
  menuItemDanger: { color: COLORS.error },
  menuItemOn: { color: COLORS.primaryLight, fontWeight: "800" },

  // Status dropdown + refined card internals
  statusDrop: { alignSelf: "flex-start", paddingVertical: 6, paddingHorizontal: webSc(SPACING.md), borderRadius: RADIUS.sm, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, marginBottom: webSc(SPACING.md) },
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
