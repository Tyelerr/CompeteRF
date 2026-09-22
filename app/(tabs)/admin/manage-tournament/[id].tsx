// app/(tabs)/admin/manage-tournament/[id].tsx
// "Manage Tournament" command-center hub. Reached by tapping a tournament card
// in tournament-director-manager.tsx. Local-state tabs (no deep nav):
// Settings | Players | Tables | Matches | Bracket | Results.
//
// The tournament's derived lifecycle phase gates the tabs: Settings/Players/
// Tables are always available; Matches/Bracket/Results unlock at "Running".
//
// Settings is a PRE-FILLED review form (not re-entry) seeded from the record.
// Players reuses the registration data layer (add / approve / check-in / remove
// / no-show / search). Glyphs are Unicode escapes (raw emoji corrupt here).

import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRegistrationRealtime } from "../../../../src/viewmodels/hooks/use.registration.realtime";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  InputAccessoryView,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  findNodeHandle,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
  useWindowDimensions,
} from "react-native";
import { KeyboardAwareScroll } from "../../../../src/views/components/common/keyboard-aware-scroll";
import { COLORS } from "../../../../src/theme/colors";
import { RADIUS, SPACING } from "../../../../src/theme/spacing";
import { FONT_SIZES } from "../../../../src/theme/typography";
import { webMs, webSc } from "../../../../src/utils/scaling";
import { UnifiedRegisterModal } from "../../../../src/views/components/tournament/UnifiedRegisterModal";
import { playerRegistrationService } from "../../../../src/models/services/player.registration.service";
import {
  EQUIPMENT_OPTIONS,
  GAME_TYPES,
  RECURRENCE_TYPES,
  START_TIMES,
  THUMBNAIL_OPTIONS,
  TOURNAMENT_FORMATS,
} from "../../../../src/utils/tournament-form-data";
import {
  defaultThumbnailIdForGameType,
  getTournamentImageUrl,
} from "../../../../src/utils/tournament-helpers";
import { useTournamentImage } from "../../../../src/viewmodels/hooks/use.tournament.image";
import { GAME_TYPE_MAP } from "../../../../src/utils/game-type.utils";
import { formatDate, formatTime } from "../../../../src/utils/formatters";
import { usePagination } from "../../../../src/viewmodels/usePagination";
import { Pagination } from "../../../../src/views/components/common/pagination";
import {
  GameType,
  RegistrationStatus,
  TableSize,
  TableStatus,
  TournamentFormat,
  TournamentLiveState,
} from "../../../../src/models/types/common.types";
import { Profile } from "../../../../src/models/types/profile.types";
import { Registration } from "../../../../src/models/types/registration.types";
import { Tournament } from "../../../../src/models/types/tournament.types";
import {
  AutoAssignMode,
  BracketMatch,
  DrawLogEntry,
  ElimLiveOp,
  ElimLiveOpResult,
  FeeCategory,
  GeneratedBracket,
  MatchLiveState,
  PrizePoolConfig,
  RaceGroup,
  RaceMode,
  TournamentFee,
} from "../../../../src/models/types/tournament-settings.types";
import {
  defaultPrizePoolConfig,
  entryPoolTotal,
  feesPerPlayer,
  feesValid,
  isPrizePoolComplete,
  payoutAllocations,
  payoutsFullyAllocated,
  reconcileSidePots,
  sidePotTotal,
} from "../../../../src/utils/prize-pool";
import {
  detectSidePotRenames,
  parseAmount,
  parseSidePots,
  reconcileSidePotMembership,
} from "../../../../src/utils/side-pots";
import {
  DrawPlayer,
  RaceConfig,
  STANDARD_SIZES,
  averageRace,
  computeBracketStats,
  estimateTournamentDuration,
  minutesPerGameForType,
  recommendedBracketSize,
  round1FromSeeds,
  seedPlayers,
  validateRaceGroups,
  RaceGroupRange,
} from "../../../../src/utils/bracket.utils";
import { buildBracketGraph } from "../../../../src/utils/bracket.double";
import { simulateBracket } from "../../../../src/utils/bracket.simulate";
import { useAuthContext } from "../../../../src/providers/AuthProvider";
import { Dropdown } from "../../../../src/views/components/common/dropdown";
import { ToggleSwitch } from "../../../../src/views/components/common/toggle-switch";
import { DatePicker } from "../../../../src/views/components/common/date-picker";
import { EmptyState } from "../../../../src/views/components/dashboard/empty-state";
import { MatchesView } from "../../../../src/views/components/tournament/live/MatchesView";
import { PrizePoolView } from "../../../../src/views/components/tournament/live/PrizePoolView";
import { QueueView } from "../../../../src/views/components/tournament/live/QueueView";
import { StatsView } from "../../../../src/views/components/tournament/live/StatsView";
import { StandingsView } from "../../../../src/views/components/tournament/live/StandingsView";
import { MatchHistoryView } from "../../../../src/views/components/tournament/live/MatchHistoryView";
import { SummaryView } from "../../../../src/views/components/tournament/live/SummaryView";
import { PayoutsView } from "../../../../src/views/components/tournament/live/PayoutsView";
import { SettingsTemplates } from "../../../../src/views/components/tournament/SettingsTemplates";
import { useSettingsTemplates } from "../../../../src/viewmodels/hooks/use.settings.templates";
import { PhaseNav } from "../../../../src/views/components/tournament/live/PhaseNav";
import { ChipManageScreen, ChipBodyPage } from "../../../../src/views/screens/admin/chip/chip-manage.screen";
import { TournamentActionsModal } from "../../../../src/views/components/tournament/live/TournamentActionsModal";
import { buildLiveMatches, computeEliminatedRegIds, formatClock, LiveMatch, MatchActionStep } from "../../../../src/utils/match.utils";
import {
  buildQueueEntries,
  computeReadyAtMap,
  orderQueue,
  planAutoAssign,
  freeTables,
  isStartable,
  bracketLocation,
  AssignmentPlan,
} from "../../../../src/utils/queue.utils";
import { liveOpErrorText, summarizeOpResults } from "../../../../src/utils/elim-live-ops";
import { EliminationDashboard, DashboardKpis } from "../../../../src/views/components/tournament/live/EliminationDashboard";
import { MatchActionsModal } from "../../../../src/views/components/tournament/live/MatchActionsModal";
import { tournamentEventService, TournamentEvent } from "../../../../src/models/services/tournament-event.service";
import { tournamentService } from "../../../../src/models/services/tournament.service";
import { usePlayerSearch } from "../../../../src/viewmodels/hooks/use.player.search";
import { smsNotificationService } from "../../../../src/models/services/sms-notification.service";
import { teamService } from "../../../../src/models/services/team.service";
import { chipService } from "../../../../src/models/services/chip.service";
import { chipReadyEntries, chipActiveEntries } from "../../../../src/utils/chip-lifecycle";
import { buildReadinessSummary, needsReadinessWarning, blocksLeavingPlayers, ReadinessRow, PlayerReadinessSummary } from "../../../../src/utils/player-readiness";
import { missingSettingsItems, settingsComplete, isSettingsFieldRequired, SettingsCompleteInput, SettingsFieldKey } from "../../../../src/utils/settings-complete";
import { isScheduleStale, scheduleStaleError, SCHEDULE_STALE_MESSAGE } from "../../../../src/utils/schedule";
import { LifecyclePhase, deriveLifecycle, paymentSatisfied, isFargoVerified } from "../../../../src/utils/registration-lifecycle";
import { useQuery } from "@tanstack/react-query";
import {
  useVenuesByDirector,
  useVenuesByOwner,
} from "../../../../src/viewmodels/hooks/use.venues";
import { venueTableService } from "../../../../src/models/services/venue-table.service";
import { normalizeTableLabel, tableIdentityKey } from "../../../../src/models/services/tournament-table.service";
import { TournamentSettingsPreview } from "../../../../src/views/components/tournament/TournamentSettingsPreview";
import { CHECK_INSET, FieldCheck } from "../../../../src/views/components/common/field-check";
import { MoneyInput, formatCurrency, sanitizeCurrencyInput } from "../../../../src/views/components/common/money-input";
import {
  ManagePhase,
  useManageTournament,
} from "../../../../src/viewmodels/hooks/use.manage.tournament";
import { useProjectedSchedule } from "../../../../src/viewmodels/hooks/use.projected.schedule";

const isWeb = Platform.OS === "web";
// Web desktop shell: the centered content column width shared by every tournament-admin
// screen (header/breadcrumb/phase-nav AND the scrolled body). The OUTER container is now
// full-viewport-width so the page's vertical scroll surface spans the whole width — wheel
// events over the empty left/right gutters scroll the page — while this constraint keeps
// the actual content centered. See `webShellCenter` (applied to the persistent header
// block and to each scroll content container).
const WEB_MAXW = 1240;
// iOS numeric keypads have no return key — attach this accessory's Done bar so
// the keyboard can be dismissed.
const KB_DONE = "kbDoneAccessory";

// Unicode-escaped glyphs (raw emoji in the source corrupt under our toolchain).
const GLYPH = { back: "\u2190", search: "\uD83D\uDD0D", lock: "\uD83D\uDD12", bolt: "\u26A1", check: "\u2713", link: "\uD83D\uDD17", pool: "\uD83C\uDFB1", trash: "\uD83D\uDDD1\uFE0F" };
// Current epoch ms via a module-level indirection so the derived-stats render path (queue wait
// times) doesn't call the impure Date.now() builtin directly inside the component render.
const nowMs = (): number => Date.now();

// ── Tabs ─────────────────────────────────────────────────────────────────────
type TabKey =
  | "settings"
  | "players"
  | "tables"
  | "prizepool"
  | "bracket"
  | "review"
  | "dashboard"
  | "matches"
  | "queue"
  | "stats"
  | "results"
  | "standings"
  | "payouts"
  | "history"
  | "summary"
  | "actions";

const TAB_LABELS: Record<TabKey, string> = {
  settings: "Settings",
  players: "Players",
  tables: "Tables",
  prizepool: "Prize Pool",
  bracket: "Bracket / Draw",
  review: "Review",
  dashboard: "Dashboard",
  matches: "Matches",
  queue: "Queue",
  stats: "Stats",
  results: "Results",
  standings: "Standings",
  payouts: "Payouts",
  history: "Match History",
  summary: "Summary",
  actions: "Actions",
};

// The ordered setup flow the TD must complete in sequence. A later step can't
// be opened until every earlier step is complete (gated with a friendly prompt).
// Elimination (bracket) setup order. Mirrors PHASE_DEFS.setup: Prize Pool is a
// real gate before Generate Bracket (the terminal). Chip uses its own order (it
// ends at Review & Start) — see setupOrder in the component.
const SETUP_ORDER: TabKey[] = [
  "settings",
  "players",
  "tables",
  "prizepool",
  "bracket",
];

// ── Phase presentation ───────────────────────────────────────────────────────
const PHASE_META: Record<ManagePhase, { label: string; color: string }> = {
  setup_incomplete: { label: "Setup Incomplete", color: COLORS.warning },
  ready_to_open: { label: "Ready to Start Registration", color: COLORS.primary },
  registration_open: { label: "Registration Open", color: COLORS.success },
  registration_closed: { label: "Registration Closed", color: COLORS.warning },
  bracket_drawn: { label: "Bracket Drawn", color: COLORS.primary },
  running: { label: "Running", color: COLORS.primary },
  completed: { label: "Completed", color: COLORS.textSecondary },
  archived: { label: "Archived", color: COLORS.textSecondary },
};

// ── Lifecycle phases (Setup / Live / Results) ────────────────────────────────
// Top-level navigation groups the per-phase sub-tabs so the bar never grows past
// three items. A tab can appear in two phases (Bracket = "Draw" in Setup and the
// live bracket in Live; Tables is configured in Setup, assigned in Live).
type PhaseKey = "setup" | "live" | "results";
const PHASE_ORDER: PhaseKey[] = ["setup", "live", "results"];
type PhasePage = { tab: TabKey; label: string; lead?: string; divider?: boolean };
const PHASE_DEFS: Record<PhaseKey, { label: string; tabs: PhasePage[] }> = {
  setup: {
    label: "Setup",
    tabs: [
      { tab: "settings", label: "Settings" },
      { tab: "players", label: "Players" },
      { tab: "tables", label: "Tables" },
      { tab: "prizepool", label: "Prize Pool" },
      { tab: "bracket", label: "Generate Bracket", lead: "⚡", divider: true },
    ],
  },
  live: {
    label: "Live",
    tabs: [
      { tab: "dashboard", label: "Dashboard" },
      { tab: "matches", label: "Matches / Bracket" },
      { tab: "tables", label: "Tables" },
      { tab: "queue", label: "Queue" },
      { tab: "stats", label: "Stats" },
      { tab: "actions", label: "Actions", lead: "⚡", divider: true },
    ],
  },
  results: {
    label: "Results",
    tabs: [
      { tab: "standings", label: "Standings" },
      { tab: "payouts", label: "Payouts" },
      { tab: "stats", label: "Stats" },
      { tab: "history", label: "Match History" },
      { tab: "summary", label: "Summary" },
    ],
  },
};

// Chip tournaments use the SAME shell but different pages: no bracket — Setup has
// Players/Tables/Review, Live is the chip engine (Dashboard/Tables/Queue/Players),
// Results is Standings/History. (Tab keys are reused; the chip body renders the
// right content per (phase, tab) — see chipPageForTab.)
const CHIP_PHASE_DEFS: Record<PhaseKey, { label: string; tabs: PhasePage[] }> = {
  setup: {
    label: "Setup",
    tabs: [
      { tab: "settings", label: "Settings" },
      { tab: "players", label: "Players" },
      { tab: "tables", label: "Tables" },
      { tab: "prizepool", label: "Prize Pool" },
      { tab: "review", label: "Review & Start", lead: "⚡", divider: true },
    ],
  },
  live: {
    label: "Live",
    tabs: [
      { tab: "matches", label: "Dashboard" },
      { tab: "tables", label: "Tables" },
      { tab: "queue", label: "Queue" },
      { tab: "players", label: "Players" },
    ],
  },
  results: {
    label: "Results",
    tabs: [
      { tab: "summary", label: "Summary" },
      { tab: "standings", label: "Standings" },
      { tab: "payouts", label: "Payouts" },
      { tab: "history", label: "Match History" },
    ],
  },
};

// Map a chip tournament's (phase, tab) to the embedded chip body page. Returns
// null for the pages the standard manager owns (Settings = the Compete form,
// Prize Pool = the shared prize view), which are rendered normally.
const chipPageForTab = (phase: PhaseKey, tab: TabKey): ChipBodyPage | null => {
  if (tab === "settings" || tab === "prizepool") return null;
  if (phase === "live") {
    if (tab === "tables") return "live-tables";
    if (tab === "queue") return "live-queue";
    if (tab === "players") return "live-players";
    return "live-dashboard"; // "matches" tab
  }
  if (phase === "results") {
    if (tab === "payouts") return "payouts";
    if (tab === "history") return "history";
    if (tab === "summary") return "summary";
    return "standings";
  }
  // setup
  if (tab === "tables") return "tables";
  if (tab === "review") return "review";
  return "players";
};

// Which lifecycle phase the tournament is currently in. Drawing the bracket is the
// last Setup step; the tournament enters Live only when it actually starts.
const phaseGroupOf = (phase: ManagePhase): PhaseKey =>
  phase === "completed" || phase === "archived"
    ? "results"
    : phase === "running"
      ? "live"
      : "setup";

const TABLE_STATUS_LABEL: Record<TableStatus, string> = {
  available: "Available",
  in_use: "In Use",
  unavailable: "Unavailable",
};
const tableStatusColor = (s: TableStatus): string =>
  s === "available" ? COLORS.success : s === "in_use" ? COLORS.primary : COLORS.error;

// ── Registration presentation ────────────────────────────────────────────────
// The DB has six raw statuses; the Players tab collapses them to four display
// states. "Ready" = checked_in (confirmed + paid -> eligible for the bracket).
type DisplayStatus = "prereg" | "registered" | "ready" | "no_show" | "removed";

const displayStatusOf = (s: RegistrationStatus): DisplayStatus => {
  if (s === "checked_in") return "ready";
  if (s === "no_show") return "no_show";
  if (s === "cancelled") return "removed";
  // "approved" = a TD-processed entry (manual add / approve) that isn't Ready yet →
  // Registered. Only an untouched self-signup (preregistered / queued) is Pre-Registered.
  if (s === "approved") return "registered";
  return "prereg"; // preregistered / queued
};

const DISPLAY_META: Record<DisplayStatus, { label: string; color: string }> = {
  prereg: { label: "Pre-Registered", color: "#EAB308" }, // yellow — untouched self-signup
  registered: { label: "Registered", color: COLORS.primary }, // blue — TD-processed, not Ready
  ready: { label: "Ready", color: COLORS.success }, // green
  no_show: { label: "No Show", color: COLORS.error }, // red
  removed: { label: "Removed", color: COLORS.textMuted }, // gray
};

// Display order for the player list: confirmed first, then those needing
// action, then no-shows, then removed.
const STATUS_RANK: Record<DisplayStatus, number> = {
  ready: 0,
  registered: 1,
  prereg: 2,
  no_show: 3,
  removed: 4,
};

const PLAYER_FILTERS = [
  { label: "All", value: "all" },
  { label: "Registered", value: "registered" },
  { label: "Pre-Registered", value: "prereg" },
  { label: "Ready", value: "ready" },
  { label: "No Show", value: "no_show" },
  { label: "Removed", value: "removed" },
];

const getDisplayName = (
  r: Registration,
  pendingNames?: Map<string, string>,
): string => {
  if (r.player_id && r.profiles) return r.profiles.name || r.profiles.user_name;
  // Phase 5: a PENDING registration has only player_uuid (no id_auto/profile) —
  // resolve its name from the roster-display map (RLS-locked players table).
  if (r.player_uuid && pendingNames?.get(r.player_uuid)) {
    return pendingNames.get(r.player_uuid)!;
  }
  return r.guest_name || "Unnamed guest";
};

// ── Settings form state ──────────────────────────────────────────────────────
interface SidePotForm {
  name: string;
  amount: string;
}
interface FeeForm {
  id: string;
  category: FeeCategory;
  name: string;
  amount: string;
  enabled: boolean;
}
// Built-in (always-present, non-deletable) fee types. They live in the same list
// as custom fees and look identical; the only difference is they can't be
// deleted or renamed. "custom" fees are user-added types appended to the list.
const FEE_PRESETS: { category: FeeCategory; label: string }[] = [
  { category: "green", label: "Green Fee" },
  { category: "td", label: "TD Fee" },
  { category: "admin", label: "Admin Fee" },
];
const feePresetLabel = (c: FeeCategory): string =>
  FEE_PRESETS.find((p) => p.category === c)?.label ?? "Fee";
interface RaceGroupForm {
  id: string;
  label: string;
  minFargo: string;
  maxFargo: string;
  raceTo: string;
}
// One Fargo→chips tier for a Chip Tournament (edited under the Fargo section).
// Stored on the tournament row in chip_ranges; the chip engine reads it from there.
interface ChipTierForm {
  id: string;
  minFargo: string;
  maxFargo: string; // blank = no upper bound ("& above")
  chips: string;
}
const CHIP_DEFAULTS_SINGLES: [number, number | null, number][] = [
  [701, null, 3], [641, 700, 4], [581, 640, 5], [521, 580, 6], [461, 520, 7], [0, 460, 8],
];
const CHIP_DEFAULTS_DOUBLES: [number, number | null, number][] = [
  [1241, null, 3], [1181, 1240, 4], [1121, 1180, 5], [1061, 1120, 6], [1001, 1060, 7], [0, 1000, 8],
];
const defaultChipTiers = (gameType: string): ChipTierForm[] =>
  (gameType.includes("scotch-doubles") ? CHIP_DEFAULTS_DOUBLES : CHIP_DEFAULTS_SINGLES).map(
    ([mn, mx, c], i) => ({
      id: `seed_${i}`,
      minFargo: String(mn),
      maxFargo: mx == null ? "" : String(mx),
      chips: String(c),
    }),
  );
// True if the tiers are empty or exactly one of the default sets (not customized),
// so we can safely swap defaults when the game type changes.
const chipTiersAreDefault = (tiers: ChipTierForm[]): boolean => {
  const matches = (def: [number, number | null, number][]) =>
    tiers.length === def.length &&
    tiers.every((t, i) => {
      const [mn, mx, c] = def[i];
      const tMax = t.maxFargo.trim() === "" ? null : parseInt(t.maxFargo, 10);
      return (
        (parseInt(t.minFargo, 10) || 0) === mn &&
        tMax === mx &&
        (parseInt(t.chips, 10) || 0) === c
      );
    });
  return tiers.length === 0 || matches(CHIP_DEFAULTS_SINGLES) || matches(CHIP_DEFAULTS_DOUBLES);
};
interface SettingsForm {
  name: string;
  gameType: string;
  tournamentFormat: string;
  gameSpot: string;
  race: string;
  description: string;
  maxFargo: string;
  entryFee: string;
  addedMoney: string;
  calcutta: boolean;
  reportsToFargo: boolean;
  openTournament: boolean;
  isRecurring: boolean;
  tournamentDate: string;
  startTime: string;
  tableSize: string;
  equipment: string;
  phoneNumber: string;
  contactName: string;
  externalBracketUrl: string;
  // Image: a THUMBNAIL_OPTIONS id (game-type default) or "custom:<publicUrl>".
  thumbnail: string;
  venueId: number | null;
  recurrenceType: string;
  // "" = unconfigured (TD has not picked a Race Type yet). Never persisted as a
  // real race mode — the save omits raceMode entirely while it is "".
  raceMode: RaceMode | "";
  // Fixed race (numbers — driven by steppers)
  raceWinners: number; // also the single-elim "Match Race To"
  raceLosers: number;
  raceFinals: number;
  raceGroups: RaceGroupForm[];
  // Fargo Differential
  diffMinRace: number;
  diffPerGame: number;
  diffMaxRace: number;
  diffMaxEnabled: boolean;
  sidePots: SidePotForm[];
  fees: FeeForm[];
  feesOnTop: boolean;
  chipTiers: ChipTierForm[]; // Chip Tournament Fargo→chips table (under Fargo)
  chipBuyBacks: boolean; // Chip Tournament: allow eliminated players to buy back
}

const numOrNull = (s: string): number | null => {
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
};
const intOrNull = (s: string): number | null => {
  const n = parseInt(s, 10);
  return isNaN(n) ? null : n;
};
const numStr = (n: number | null | undefined): string =>
  n === null || n === undefined ? "" : String(n);

// getTournament() normalizes game_type to its DISPLAY LABEL (e.g.
// "9 Ball Scotch Doubles"), but the GAME_TYPES dropdown matches on the SLUG
// ("9-ball-scotch-doubles"). Convert back to the slug so the dropdown pre-fills.
const gameTypeSlug = (value: string | null | undefined): string => {
  if (!value) return "";
  const lower = value.toLowerCase();
  if (GAME_TYPE_MAP[lower]) return lower; // already a slug
  const match = Object.entries(GAME_TYPE_MAP).find(
    ([, label]) => label === value,
  );
  return match ? match[0] : value;
};

// Single-elimination formats have no losers bracket, so the Losers race is hidden.
const SINGLE_ELIM_FORMATS = ["single-elimination", "single-elim"];
const formatHasLosersSide = (format: string): boolean =>
  !SINGLE_ELIM_FORMATS.includes((format || "").toLowerCase());

const RACE_MODE_OPTIONS = [
  { label: "Fixed Race", value: "fixed" },
  { label: "A/B/C Race Groups", value: "groups" },
  { label: "Fargo Differential", value: "differential" },
];

// Standard table sizes (values match the TableSize union). Venues can hold
// custom sizes, but the manage form offers the three standard picks.
const TABLE_SIZE_OPTIONS = [
  { label: "Select table size", value: "" },
  { label: "7 Foot (Bar Box)", value: "7ft" },
  { label: "8 Foot", value: "8ft" },
  { label: "9 Foot", value: "9ft" },
];

// paid_side_pots should always be a string[], but legacy/seed rows may store a
// non-array value (e.g. an empty JSONB object). Coerce defensively so the UI
// never crashes on `.filter`/`.length`/`.map`.
const safePaidSidePots = (value: unknown): string[] =>
  Array.isArray(value) ? (value as string[]) : [];

// A Postgres `time` column reads back as "HH:MM:SS", but the START_TIMES
// dropdown matches "HH:MM". Trim to HH:MM so the saved time pre-fills.
const toStartTime = (t: string | null | undefined): string => {
  if (!t) return "";
  const [h, m] = t.split(":");
  if (h == null || m == null) return t;
  return `${h.padStart(2, "0")}:${m.padStart(2, "0")}`;
};

const toForm = (t: Tournament): SettingsForm => {
  const ls = t.live_settings ?? {};
  return {
    name: t.name ?? "",
    gameType: gameTypeSlug(t.game_type),
    tournamentFormat: t.tournament_format ?? "",
    gameSpot: t.game_spot ?? "",
    race: t.race ?? "",
    description: t.description ?? "",
    maxFargo: numStr(t.max_fargo),
    entryFee: formatMoney(numStr(t.entry_fee)),
    addedMoney: formatMoney(numStr(t.added_money)),
    calcutta: !!t.calcutta,
    reportsToFargo: !!t.reports_to_fargo,
    openTournament: !!t.open_tournament,
    isRecurring: !!t.is_recurring,
    tournamentDate: t.tournament_date ?? "",
    startTime: toStartTime(t.start_time),
    tableSize: t.table_size ?? "",
    equipment: t.equipment ?? "",
    phoneNumber: t.phone_number ?? "",
    contactName: t.contact_name ?? "",
    externalBracketUrl: t.external_bracket_url ?? "",
    // Existing image wins; otherwise fall back to the game-type default so a
    // preview always shows immediately (mirrors the submit flow).
    thumbnail:
      t.thumbnail ?? defaultThumbnailIdForGameType(t.game_type) ?? "",
    venueId: t.venue_id ?? null,
    recurrenceType: t.recurrence_type ?? "",
    // Race is configured fresh in the hub — do NOT inherit the free-text race
    // entered on the submit page. Only a previously-saved live setting pre-fills.
    raceWinners: ls.fixedRaceWinners ?? 5,
    raceLosers: ls.fixedRaceLosers ?? 4,
    raceFinals: ls.fixedRaceFinals ?? 7,
    diffMinRace: ls.fargoDiffMinRace ?? 0,
    diffPerGame: ls.fargoDiffPerGame ?? 40,
    diffMaxRace: ls.fargoDiffMaxRace ?? 8,
    diffMaxEnabled: ls.fargoDiffMaxRace != null,
    sidePots: (t.side_pots ?? []).map((p) => ({
      name: p.name ?? "",
      amount: formatMoney(numStr(p.amount as number)),
    })),
    // NO fallback to "fixed": an unsaved race mode must hydrate as "" (unconfigured)
    // so the dropdown shows "Select Race Type" and no race-specific controls render.
    // Existing tournaments with a saved raceMode load exactly as before.
    raceMode: ls.raceMode ?? "",
    raceGroups: (ls.raceGroups ?? []).map((g) => ({
      id: g.id,
      label: g.label,
      minFargo: numStr(g.minFargo),
      maxFargo: numStr(g.maxFargo),
      raceTo: numStr(g.raceTo),
    })),
    // Pass the RAW value so feesToForm can tell "property absent" (never
    // configured → seed defaults) apart from "[]" (intentionally empty).
    fees: feesToForm(ls.fees),
    feesOnTop: !!ls.feesAddedOnTop,
    chipTiers:
      t.tournament_format !== "chip-tournament"
        ? []
        : t.chip_ranges && t.chip_ranges.length
          ? t.chip_ranges.map((r: any, i: number) => {
              const max = r.maxRating ?? r.maxFargo;
              return {
                id: `t_${i}`,
                minFargo: String(r.minRating ?? r.minFargo ?? 0),
                maxFargo: max == null || max >= 9000 ? "" : String(max),
                chips: String(r.chips ?? 0),
              };
            })
          : defaultChipTiers(t.game_type ?? ""),
    chipBuyBacks: !!(ls as any).chipBuyBacks,
  };
};

// Build the unified fee list. The distinction that matters is NEVER-CONFIGURED vs
// INTENTIONALLY-EMPTY, and it is carried by the presence of the `fees` property in
// live_settings — NOT by array length:
//   • `undefined` (property absent)  → never configured → seed the 3 convenience
//     defaults (disabled) so a brand-new tournament has something to enable.
//   • `[]` (present, empty)          → the TD saved with zero fees on purpose →
//     honor it and show no fees.
//   • non-empty array                → load exactly what was saved.
// Once present, built-in and custom fees are treated identically (one model), so
// deletions of Green/TD/Admin persist. A saved fee with no `enabled` flag predates
// that field and was therefore applied → treat it as enabled.
const feesToForm = (saved: TournamentFee[] | undefined | null): FeeForm[] => {
  if (saved == null) {
    // Never configured: seed the built-in presets, disabled until the TD enables them.
    return FEE_PRESETS.map((p) => ({
      id: `fee-${p.category}`,
      category: p.category,
      name: p.label,
      amount: formatCurrency(numStr(undefined)),
      enabled: false,
    }));
  }
  return saved.map((f) => ({
    id: f.id,
    category: f.category,
    name: f.name ?? (f.category === "custom" ? "" : feePresetLabel(f.category)),
    amount: formatCurrency(numStr(f.amount)),
    enabled: f.enabled ?? true,
  }));
};

// Map the live Settings form to the SHARED completion-check shape (utils/settings-
// complete). Venue can be set on the saved tournament, so fall back to it.
// Resolve the form's group rows into numeric ranges (blank min ⇒ null⇒0, blank max ⇒
// null⇒open) for the shared validator, and compute the tournament max / open context.
const formGroupRanges = (f: SettingsForm): RaceGroupRange[] =>
  f.raceGroups.map((g) => ({
    label: g.label,
    min: g.minFargo.trim() === "" ? null : intOrNull(g.minFargo),
    max: g.maxFargo.trim() === "" ? null : intOrNull(g.maxFargo),
    raceTo: g.raceTo.trim() === "" ? null : intOrNull(g.raceTo),
  }));
const formRaceGroupValidation = (f: SettingsForm) =>
  validateRaceGroups(formGroupRanges(f), {
    tournamentMax: f.maxFargo.trim() === "" ? null : intOrNull(f.maxFargo),
    open: f.openTournament,
  });

const formToSettingsInput = (
  f: SettingsForm,
  fallbackVenueId?: number | null,
): SettingsCompleteInput => ({
  name: f.name,
  gameType: f.gameType,
  format: f.tournamentFormat,
  venueId: f.venueId ?? fallbackVenueId ?? null,
  date: f.tournamentDate,
  time: f.startTime,
  tableSize: f.tableSize,
  equipment: f.equipment,
  entryFee: f.entryFee,
  maxFargo: f.maxFargo,
  open: f.openTournament,
  raceMode: f.raceMode, // "" while unconfigured → flagged missing by settings-complete
  // Groups mode only: report range validity so invalid A/B/C groups block Start Registration.
  raceGroupsValid: f.raceMode === "groups" ? formRaceGroupValidation(f).ok : undefined,
});

const toPatch = (f: SettingsForm): Partial<Tournament> => {
  const hasLosers = formatHasLosersSide(f.tournamentFormat);
  // Keep the legacy `race` text column readable for cards/detail.
  const fixedSummary = [
    hasLosers ? `Winners ${f.raceWinners}` : `Race to ${f.raceWinners}`,
    hasLosers ? `Losers ${f.raceLosers}` : null,
    `Finals ${f.raceFinals}`,
  ]
    .filter(Boolean)
    .join(" / ");
  const diffSummary = `Fargo Differential (min ${f.diffMinRace}, +1/${f.diffPerGame}, max ${f.diffMaxRace})`;
  const raceColumn =
    f.raceMode === "fixed"
      ? fixedSummary
      : f.raceMode === "differential"
        ? diffSummary
        : f.race.trim();

  return {
  name: f.name.trim(),
  game_type: f.gameType as GameType,
  tournament_format: f.tournamentFormat as TournamentFormat,
  game_spot: f.gameSpot.trim(),
  race: raceColumn,
  description: f.description.trim(),
  max_fargo: intOrNull(f.maxFargo) ?? undefined,
  entry_fee: numOrNull(f.entryFee) ?? undefined,
  added_money: numOrNull(f.addedMoney) ?? undefined,
  calcutta: f.calcutta,
  reports_to_fargo: f.reportsToFargo,
  open_tournament: f.openTournament,
  is_recurring: f.isRecurring,
  tournament_date: f.tournamentDate,
  start_time: f.startTime,
  table_size: (f.tableSize || undefined) as TableSize | undefined,
  equipment: f.equipment.trim() || undefined,
  phone_number: f.phoneNumber.trim() || undefined,
  contact_name: f.contactName.trim() || undefined,
  external_bracket_url: f.externalBracketUrl.trim() || undefined,
  thumbnail: f.thumbnail.trim() || undefined,
  venue_id: f.venueId ?? undefined,
  recurrence_type: f.isRecurring ? f.recurrenceType.trim() || undefined : undefined,
  // Any save commits the tournament — it's no longer an unsaved draft.
  is_draft: false,
  side_pots: f.sidePots
    .filter((p) => p.name.trim())
    .map((p) => ({ name: p.name.trim(), amount: numOrNull(p.amount) ?? 0 })),
  // Chip Tournament Fargo→chips table. Stored in the shared ChipRange shape
  // (minRating/maxRating/chips/label) so the tournament-detail "Chip Chart" and
  // the chip engine both read it. Open-ended top tier uses maxRating 9999.
  chip_ranges:
    f.tournamentFormat === "chip-tournament"
      ? (f.chipTiers.map((t) => {
          const min = intOrNull(t.minFargo) ?? 0;
          const maxStr = t.maxFargo.trim();
          const max = maxStr === "" ? 9999 : intOrNull(maxStr) ?? 9999;
          const label =
            maxStr === "" ? `${min} & Above` : min === 0 ? `${max} & Under` : `${min}-${max}`;
          return { minRating: min, maxRating: max, chips: intOrNull(t.chips) ?? 0, label };
        }) as any)
      : undefined,
  live_settings: {
    // Persist the chosen mode only. While unconfigured ("") write undefined so the
    // key is dropped from the JSONB blob (the shallow-merge in writeLiveSettings +
    // JSON serialization omit undefined) — an unrelated Settings save therefore never
    // silently persists "fixed". Existing saved modes always round-trip unchanged.
    raceMode: f.raceMode || undefined,
    fixedRaceWinners: f.raceWinners,
    fixedRaceLosers: hasLosers ? f.raceLosers : null,
    fixedRaceFinals: f.raceFinals,
    raceGroups: f.raceGroups.map((g) => ({
      id: g.id,
      label: g.label.trim(),
      minFargo: intOrNull(g.minFargo) ?? 0,
      maxFargo: intOrNull(g.maxFargo) ?? 0,
      raceTo: intOrNull(g.raceTo) ?? 0,
    })),
    fargoDiffMinRace: f.diffMinRace,
    fargoDiffPerGame: f.diffPerGame,
    fargoDiffMaxRace: f.diffMaxEnabled ? f.diffMaxRace : null,
    fargoDiffRounding: "down",
    // Persist the full uniform fee list exactly as edited. Every fee that exists
    // is saved (enabled or not); a fee the TD deleted is simply absent, so the
    // deletion persists — built-in and custom are treated identically.
    fees: f.fees.map((fee) => ({
      id: fee.id,
      category: fee.category,
      name: fee.name.trim() || feePresetLabel(fee.category),
      amount: numOrNull(fee.amount) ?? 0,
      enabled: fee.enabled,
    })),
    feesAddedOnTop: f.feesOnTop,
    chipBuyBacks: f.chipBuyBacks,
  } as any,
  };
};

// Settings columns surfaced in the chip Activity Log when a director edits while the
// tournament is running. Column name → human label, used to build "Label: from → to"
// change summaries. Only fields toPatch actually writes are listed.
const SETTINGS_AUDIT_FIELDS: { key: keyof Tournament; label: string }[] = [
  { key: "name", label: "Name" },
  { key: "game_type", label: "Game" },
  { key: "tournament_format", label: "Format" },
  { key: "description", label: "Description" },
  { key: "max_fargo", label: "Max Fargo" },
];
// Diff two settings patches over the audited fields → structured changes (for the event
// payload) + a human-readable one-line summary (for the event text). Only changed fields
// are included, so unchanged fields are never logged.
const diffSettingsPatches = (
  before: Partial<Tournament>,
  after: Partial<Tournament>,
): { changes: Record<string, { from: unknown; to: unknown }>; summary: string } => {
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  const parts: string[] = [];
  const fmt = (v: unknown) => (v === null || v === undefined || v === "" ? "—" : String(v));
  for (const { key, label } of SETTINGS_AUDIT_FIELDS) {
    const from = (before as Record<string, unknown>)[key as string] ?? null;
    const to = (after as Record<string, unknown>)[key as string] ?? null;
    if (JSON.stringify(from) !== JSON.stringify(to)) {
      changes[key as string] = { from, to };
      parts.push(`${label}: ${fmt(from)} → ${fmt(to)}`);
    }
  }
  return { changes, summary: parts.join(" · ") };
};

// Fields that belong to THIS event (not a reusable template) — excluded when
// saving / applying a settings template so the TD keeps their own name + schedule.
const TEMPLATE_EXCLUDED_KEYS: (keyof SettingsForm)[] = [
  "name",
  "tournamentDate",
  "startTime",
  "description",
  "phoneNumber",
  // Added Money is per-event prize money — never carry it over from a template;
  // the TD must re-enter it for each tournament.
  "addedMoney",
];
const templatableSettings = (f: SettingsForm): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  (Object.keys(f) as (keyof SettingsForm)[]).forEach((k) => {
    if (!TEMPLATE_EXCLUDED_KEYS.includes(k)) out[k] = f[k];
  });
  return out;
};

const prettifySlug = (s: string): string =>
  s
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");

// Short "Using: …" summary for a saved template — game type, format, race mode.
const summarizeTemplate = (s: Record<string, unknown>): string[] => {
  const out: string[] = [];
  const gt = typeof s.gameType === "string" ? s.gameType : "";
  if (gt) out.push(GAME_TYPE_MAP[gt.toLowerCase()] ?? prettifySlug(gt));
  const fmt = typeof s.tournamentFormat === "string" ? s.tournamentFormat : "";
  if (fmt) out.push(prettifySlug(fmt));
  const rm = typeof s.raceMode === "string" ? s.raceMode : "";
  if (rm)
    out.push(
      rm === "groups"
        ? "Race Groups"
        : rm === "differential"
          ? "Fargo Differential"
          : "Fixed Race",
    );
  return out;
};

// ── Small building blocks ────────────────────────────────────────────────────
const Section = ({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) => (
  <View style={styles.section}>
    <Text allowFontScaling={false} style={styles.sectionTitle}>
      {title}
    </Text>
    {children}
  </View>
);

// Tap-outside-to-dismiss-keyboard wrapper for modal overlays.
// NATIVE: wraps children in a TouchableWithoutFeedback that calls Keyboard.dismiss,
// so tapping the backdrop / card padding hides the soft keyboard (existing behavior).
// WEB: renders children directly. On react-native-web a click ANYWHERE inside the
// Touchable — including on a TextInput — bubbles to its onPress, and Keyboard.dismiss()
// resolves to TextInputState.blurTextInput(currentlyFocusedField()), which blurs the
// input the user just clicked (the reported focus-steal). There is no soft keyboard on
// web, so the wrapper is unnecessary and is skipped there.
const DismissKeyboardWrap = ({ children }: { children: React.ReactElement }) =>
  Platform.OS === "web" ? (
    children
  ) : (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      {children}
    </TouchableWithoutFeedback>
  );

// Web: suppress the inner <input>'s own focus ring so only the wrapper highlights.
const INPUT_NO_OUTLINE = { outlineStyle: "none", outlineWidth: 0 };

// Per-requirement red error copy shown under a missing field after the TD attempts Start
// Registration. Keyed by the shared SettingsFieldKey so wording stays tied to the rules.
// Composite requirements (fargo) get either/or wording, not a single-field message.
const FIELD_ERROR_MESSAGE: Record<SettingsFieldKey, string> = {
  name: "Tournament Name is required",
  gameType: "Game Type is required",
  format: "Format is required",
  entryFee: "Entry Fee is required (enter 0 for free)",
  fargo: "Set a Maximum Fargo or turn on Open Tournament",
  raceMode: "Race Type is required",
  date: "Date is required",
  time: "Start Time is required",
  venue: "Venue is required",
  tableSize: "Table Size is required",
  equipment: "Equipment is required",
  raceGroups: "Fix the race group ranges before continuing",
};

// Wraps a required Settings field: registers a scroll anchor (by key) and — once the TD
// has attempted Start Registration with this field still missing — draws a red box around
// the control/section plus a short red helper message. `error` is derived live from the
// shared missing-items result, so the red state clears the instant the requirement is met
// (no need to press Start Registration again). No control internals are modified.
const FieldAnchor = ({
  anchorKey,
  error,
  register,
  style,
  children,
}: {
  anchorKey: string;
  error?: string;
  register: (key: string, node: View | null) => void;
  style?: object; // preserve host layout (e.g. a flex column) when wrapping
  children: React.ReactNode;
}) => (
  <View
    ref={(n) => register(anchorKey, n)}
    style={[style, error ? styles.fieldErrorWrap : undefined]}
  >
    {children}
    {error ? (
      <Text allowFontScaling={false} style={styles.fieldErrorText}>
        {error}
      </Text>
    ) : null}
  </View>
);

// Money fields hold whole dollars typed left-to-right with a fixed ".00" suffix
// (type 5 -> 5.00, type 590 -> 590.00). The input box shows just the dollars;
// ".00" is rendered as a separate suffix so typing never fights the decimals.
// moneyDollars = the editable dollar digits; moneyFromInput = stored "<n>.00".
const moneyDollars = (stored: string): string =>
  stored ? stored.split(".")[0] : "";
const moneyFromInput = (typed: string): string => {
  const digits = typed.replace(/\D/g, "");
  return digits ? String(parseInt(digits, 10)) + ".00" : "";
};
// Normalize an already-stored value (e.g. 50 or 50.5) to two decimals for display.
const formatMoney = (text: string): string => {
  const trimmed = String(text ?? "").trim();
  if (!trimmed) return "";
  const n = parseFloat(trimmed);
  return isNaN(n) ? "" : n.toFixed(2);
};
// Web-only inline styles (transition/boxShadow aren't in RN's StyleSheet types).
const INPUT_WRAP_WEB =
  Platform.OS === "web"
    ? { transition: "border-color 0.18s ease, box-shadow 0.18s ease" }
    : null;
const INPUT_WRAP_FOCUS_RING =
  Platform.OS === "web"
    ? { boxShadow: "0 0 0 3px " + COLORS.primary + "33" }
    : null;

const LabeledInput = ({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  multiline,
  narrow,
  maxLength,
  disabled,
  hint,
  accessoryId,
  noCheck,
  money,
  error,
  containerRef,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  keyboardType?: "default" | "numeric" | "decimal-pad" | "phone-pad";
  multiline?: boolean;
  narrow?: boolean; // compact width for short numeric values (e.g. race-to)
  maxLength?: number;
  disabled?: boolean;
  hint?: string;
  accessoryId?: string; // iOS keyboard Done bar
  noCheck?: boolean; // opt out of the completion check (e.g. free-text description)
  money?: boolean; // numbers-only; format to two decimals on blur
  error?: string; // required-field error copy (red border + message); undefined = no error
  containerRef?: (n: View | null) => void; // scroll anchor for validation
}) => {
  // Complete when the field holds data; FieldCheck renders nothing otherwise.
  const showCheck = !disabled && !noCheck && !!value.trim();
  // The wrapper owns the border + focus highlight so the whole field reads as one
  // smooth control; the inner input draws no outline of its own.
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.field} ref={containerRef}>
      <Text
        allowFontScaling={false}
        style={[styles.fieldLabel, disabled && styles.labelDisabled]}
      >
        {label}
      </Text>
      <View
        style={[
          styles.inputWrap,
          INPUT_WRAP_WEB as object,
          multiline && styles.inputWrapMultiline,
          narrow && styles.inputWrapNarrow,
          focused && !disabled && styles.inputWrapFocused,
          focused && !disabled && (INPUT_WRAP_FOCUS_RING as object),
          disabled && styles.inputDisabled,
          !!error && styles.inputWrapError,
        ]}
      >
        <FieldCheck complete={showCheck} />
        <TextInput
          allowFontScaling={false}
          editable={!disabled}
          style={[
            styles.inputInner,
            money && styles.inputInnerMoney,
            multiline && styles.inputMultiline,
            Platform.OS === "web" ? (INPUT_NO_OUTLINE as object) : null,
          ]}
          value={money ? moneyDollars(value) : value}
          onChangeText={(v) => onChangeText(money ? moneyFromInput(v) : v)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={placeholder}
          placeholderTextColor={COLORS.textMuted}
          keyboardType={keyboardType ?? "default"}
          multiline={multiline}
          maxLength={maxLength}
          inputAccessoryViewID={Platform.OS === "ios" ? accessoryId : undefined}
        />
        {money && !!value && (
          <Text allowFontScaling={false} style={styles.moneySuffix}>
            .00
          </Text>
        )}
      </View>
      {hint ? (
        <Text allowFontScaling={false} style={styles.hint}>
          {hint}
        </Text>
      ) : null}
      {error ? (
        <Text allowFontScaling={false} style={styles.fieldErrorText}>
          {error}
        </Text>
      ) : null}
    </View>
  );
};

const FieldLabel = ({ label }: { label: string }) => (
  <Text allowFontScaling={false} style={styles.fieldLabel}>
    {label}
  </Text>
);

// Full-width +/- stepper. Center reads e.g. "Race to 7". Press-and-hold on a
// button repeats and accelerates. No keyboard needed.
const Stepper = ({
  value,
  onChange,
  prefix,
  suffix,
  min = 0,
  max = 99,
  step = 1,
}: {
  value: number;
  onChange: (v: number) => void;
  prefix?: string;
  suffix?: string;
  min?: number;
  max?: number;
  step?: number;
}) => {
  const safe = Number.isFinite(value) ? value : min;
  const valueRef = useRef(safe);
  valueRef.current = safe;
  const holdRef = useRef<{
    t?: ReturnType<typeof setTimeout>;
    i?: ReturnType<typeof setInterval>;
  }>({});

  const stop = () => {
    if (holdRef.current.t) clearTimeout(holdRef.current.t);
    if (holdRef.current.i) clearInterval(holdRef.current.i);
    holdRef.current = {};
  };
  useEffect(() => stop, []);

  const bump = (dir: number, mult = 1) => {
    const next = Math.min(max, Math.max(min, valueRef.current + dir * step * mult));
    if (next !== valueRef.current) {
      valueRef.current = next;
      onChange(next);
    }
  };
  const startHold = (dir: number) => {
    bump(dir); // immediate tap
    holdRef.current.t = setTimeout(() => {
      let count = 0;
      holdRef.current.i = setInterval(() => {
        count += 1;
        bump(dir, count > 25 ? 10 : count > 12 ? 3 : 1); // accelerate
      }, 70);
    }, 350);
  };

  const center = [prefix, safe, suffix]
    .filter((p) => p !== undefined && p !== "")
    .join(" ");

  return (
    <View style={styles.stepperRow}>
      <TouchableOpacity
        style={styles.stepBtn}
        onPressIn={() => startHold(-1)}
        onPressOut={stop}
      >
        <Text allowFontScaling={false} style={styles.stepBtnText}>
          -
        </Text>
      </TouchableOpacity>
      <Text allowFontScaling={false} style={styles.stepCenter}>
        {center}
      </Text>
      <TouchableOpacity
        style={styles.stepBtn}
        onPressIn={() => startHold(1)}
        onPressOut={stop}
      >
        <Text allowFontScaling={false} style={styles.stepBtnText}>
          +
        </Text>
      </TouchableOpacity>
    </View>
  );
};

// ── Add Player Modal (reused from the retired manage-players screen) ──────────
const AddPlayerModal = ({
  visible,
  onClose,
  onAddPlayer,
  onAddGuest,
  isAdding,
  addedPlayerIds,
}: {
  visible: boolean;
  onClose: () => void;
  onAddPlayer: (profile: Profile) => void;
  onAddGuest: (guestName: string) => void;
  isAdding: boolean;
  addedPlayerIds: Set<number>;
}) => {
  const search = usePlayerSearch();
  const [guestMode, setGuestMode] = useState(false);
  const [guestName, setGuestName] = useState("");

  const handleClose = () => {
    search.reset();
    setGuestMode(false);
    setGuestName("");
    onClose();
  };

  const handleAddGuest = () => {
    const trimmed = guestName.trim();
    if (!trimmed) {
      Alert.alert("Required", "Please enter the guest's name.");
      return;
    }
    onAddGuest(trimmed);
    setGuestName("");
    setGuestMode(false);
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <Text allowFontScaling={false} style={styles.modalTitle}>
            Add Player
          </Text>

          {guestMode ? (
            <>
              <FieldLabel label="Guest Name *" />
              <TextInput
                style={styles.input}
                placeholder="Enter guest name..."
                placeholderTextColor={COLORS.textMuted}
                value={guestName}
                onChangeText={setGuestName}
                autoFocus
              />
              <Text allowFontScaling={false} style={styles.modalHint}>
                Guests don&apos;t need an app account. They&apos;re added with a
                name only.
              </Text>
              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={styles.modalButtonCancel}
                  onPress={() => {
                    setGuestMode(false);
                    setGuestName("");
                  }}
                  disabled={isAdding}
                >
                  <Text
                    allowFontScaling={false}
                    style={styles.modalButtonCancelText}
                  >
                    Back
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.modalButtonConfirm}
                  onPress={handleAddGuest}
                  disabled={isAdding}
                >
                  <Text
                    allowFontScaling={false}
                    style={styles.modalButtonConfirmText}
                  >
                    {isAdding ? "Adding..." : "Add Guest"}
                  </Text>
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <>
              <View style={styles.searchInputWrapper}>
                <Text allowFontScaling={false} style={styles.searchIcon}>
                  {GLYPH.search}
                </Text>
                <TextInput
                  style={styles.searchInput}
                  placeholder="Search by name or username..."
                  placeholderTextColor={COLORS.textMuted}
                  value={search.query}
                  onChangeText={search.setQuery}
                  autoFocus
                />
                {search.isSearching && (
                  <ActivityIndicator size="small" color={COLORS.primary} />
                )}
              </View>

              <ScrollView
                style={styles.resultsList}
                keyboardShouldPersistTaps="handled"
              >
                {search.query.trim().length >= 2 &&
                  !search.isSearching &&
                  search.results.length === 0 && (
                    <Text allowFontScaling={false} style={styles.noResults}>
                      No players found. Use &quot;No Account&quot; to add a guest.
                    </Text>
                  )}
                {search.results.map((profile) => {
                  const already = addedPlayerIds.has(profile.id_auto);
                  return (
                    <TouchableOpacity
                      key={profile.id_auto}
                      style={[styles.resultRow, already && styles.resultRowAdded]}
                      onPress={() => onAddPlayer(profile)}
                      disabled={isAdding || already}
                    >
                      <View style={styles.resultInfo}>
                        <Text
                          allowFontScaling={false}
                          style={styles.resultName}
                          numberOfLines={1}
                        >
                          {profile.name || profile.user_name}
                        </Text>
                        <Text
                          allowFontScaling={false}
                          style={styles.resultMeta}
                          numberOfLines={1}
                        >
                          @{profile.user_name} {"\u00B7"} #{profile.id_auto}
                        </Text>
                      </View>
                      {already ? (
                        <Text
                          allowFontScaling={false}
                          style={styles.resultAdded}
                        >
                          {GLYPH.check} Added
                        </Text>
                      ) : (
                        <Text allowFontScaling={false} style={styles.resultAdd}>
                          + Add
                        </Text>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={styles.modalButtonCancel}
                  onPress={handleClose}
                  disabled={isAdding}
                >
                  <Text
                    allowFontScaling={false}
                    style={styles.modalButtonCancelText}
                  >
                    Close
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.modalButtonGuest}
                  onPress={() => setGuestMode(true)}
                  disabled={isAdding}
                >
                  <Text
                    allowFontScaling={false}
                    style={styles.modalButtonGuestText}
                  >
                    No Account
                  </Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
};

// ── Payment checkbox ─────────────────────────────────────────────────────────
const PayCheckbox = ({
  label,
  checked,
  onToggle,
  readOnly,
}: {
  label: string;
  checked: boolean;
  onToggle?: () => void;
  readOnly?: boolean;
}) => (
  <TouchableOpacity
    style={styles.payRow}
    onPress={onToggle}
    disabled={readOnly || !onToggle}
    activeOpacity={0.7}
  >
    <View style={[styles.checkbox, checked && styles.checkboxOn]}>
      {checked && (
        <Text allowFontScaling={false} style={styles.checkboxMark}>
          ✓
        </Text>
      )}
    </View>
    <Text
      allowFontScaling={false}
      style={[styles.payLabel, readOnly && checked && styles.payLabelPaid]}
    >
      {label}
    </Text>
  </TouchableOpacity>
);

// Race-group helpers (group mode). Each player's group/race is derived from
// their Fargo against the configured ranges; selecting a group stores a
// representative Fargo (midpoint) so there is no extra column.
const groupForFargo = (
  fargo: number | null,
  groups: RaceGroup[],
): RaceGroup | null => {
  if (fargo == null || isNaN(fargo)) return null;
  return (
    groups.find(
      (g) => fargo >= g.minFargo && (g.maxFargo <= 0 || fargo <= g.maxFargo),
    ) ?? null
  );
};

// ── Bracket helpers ──────────────────────────────────────────────────────────
const prettyFormat = (f: string): string =>
  (f || "")
    .split("-")
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(" ");

// Compact format for the narrow summary card: "Double Elimination" -> "Double Elim".
const shortFormat = (f: string): string =>
  prettyFormat(f).replace(/Elimination/i, "Elim");

// Draw types. V1 only generates a random draw; the others are placeholders so
// the dropdown is forward-ready (selecting them shows a "coming soon" note).
type DrawType = "random" | "seeded" | "manual";
const DRAW_TYPE_OPTIONS: { label: string; value: DrawType }[] = [
  { label: "Random Draw", value: "random" },
  { label: "Seeded Draw (Coming Soon)", value: "seeded" },
  { label: "Manual Draw (Coming Soon)", value: "manual" },
];
const DRAW_TYPE_SUPPORTED: DrawType[] = ["random"];

const matchLabel = (m: BracketMatch): string => {
  const n1 = m.p1?.name;
  const n2 = m.p2?.name;
  if (m.bye) return `${n1 ?? n2 ?? "TBD"} — BYE`;
  const race =
    m.raceTo != null
      ? `Race to ${m.raceTo}`
      : `${n1} to ${m.p1?.raceTo ?? "?"} / ${n2} to ${m.p2?.raceTo ?? "?"}`;
  return `${n1} vs ${n2} · ${race}`;
};

const BracketSum = ({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) => (
  <View style={styles.sumCard}>
    <Text allowFontScaling={false} style={styles.sumValue} numberOfLines={1}>
      {value}
    </Text>
    <Text allowFontScaling={false} style={styles.sumLabel} numberOfLines={2}>
      {label}
    </Text>
  </View>
);

const BracketCalc = ({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) => (
  <View style={styles.calcRow}>
    <Text allowFontScaling={false} style={styles.calcLabel}>
      {label}
    </Text>
    <Text allowFontScaling={false} style={styles.calcVal}>
      {value}
    </Text>
  </View>
);

// ── Registration Row ─────────────────────────────────────────────────────────
const RegistrationRow = ({
  registration,
  sidePots,
  entryFee,
  raceMode,
  raceGroups,
  onReady,
  onSaveEdit,
  onTogglePaidPot,
  onNoShow,
  onRemove,
  onUndo,
  onRestore,
  isProcessing,
  locked,
  pendingNames,
  initialEditing,
}: {
  registration: Registration;
  sidePots: { name: string; amount: number }[];
  entryFee: number;
  raceMode: RaceMode;
  raceGroups: RaceGroup[];
  onReady: (
    fargo: number,
    isStarter: boolean,
    paidEntry: boolean,
    paidPots: string[],
    raceOverride: number | null,
    verified: boolean,
  ) => void;
  onSaveEdit: (
    fargo: number,
    isStarter: boolean,
    paidEntry: boolean,
    paidPots: string[],
    raceOverride: number | null,
    verified: boolean,
    stillReady: boolean,
  ) => void;
  onTogglePaidPot: (name: string, paid: boolean) => void;
  onNoShow: () => void;
  onRemove: () => void;
  onUndo: () => void;
  onRestore: () => void;
  isProcessing: boolean;
  locked?: boolean;
  pendingNames?: Map<string, string>;
  initialEditing?: boolean; // list view "Edit" expands a Ready row straight into edit mode
}) => {
  const d = displayStatusOf(registration.status);
  const meta = DISPLAY_META[d];
  // Phase 5: a pending player (player_uuid, no id_auto) is a real player, NOT a
  // guest — only a name-only row (no player_id AND no player_uuid) is a guest.
  const isGuest = !registration.player_id && !registration.player_uuid;
  const isGroups = raceMode === "groups";

  // Current pots are the source of truth: a player's stored paid_side_pots may
  // still list pots the TD has since removed. Filter those out so removed pots
  // never display and never get re-saved when the row is edited.
  const potExists = (name: string) => sidePots.some((p) => p.name === name);
  // Filter to pots that still exist AND drop duplicates (stale data could hold
  // the same pot name twice). Self-heals on the next edit/save.
  const livePaidPots = () => [
    ...new Set(safePaidSidePots(registration.paid_side_pots).filter(potExists)),
  ];

  const [editing, setEditing] = useState(!!initialEditing);
  const [paidEntry, setPaidEntry] = useState(!!registration.paid_entry);
  const [paidPots, setPaidPots] = useState<string[]>(livePaidPots());
  const [fargoInput, setFargoInput] = useState(
    registration.fargo_rating != null ? String(registration.fargo_rating) : "",
  );
  const [overrideOn, setOverrideOn] = useState(
    registration.race_override != null,
  );
  const [overrideRace, setOverrideRace] = useState(
    registration.race_override ?? 5,
  );
  // Elimination-only: TD-verified Fargo (per-event). Derived-persisted via
  // fargo_at_registration === fargo_rating; here it's the local intent that persists on
  // Ready/Save. Editing the Fargo away from the verified snapshot auto-clears it.
  const [verified, setVerified] = useState(
    isFargoVerified(registration.fargo_rating, registration.fargo_at_registration),
  );

  const reseed = () => {
    setPaidEntry(!!registration.paid_entry);
    setPaidPots(livePaidPots());
    setFargoInput(
      registration.fargo_rating != null ? String(registration.fargo_rating) : "",
    );
    setOverrideOn(registration.race_override != null);
    setOverrideRace(registration.race_override ?? 5);
    setVerified(isFargoVerified(registration.fargo_rating, registration.fargo_at_registration));
  };

  // Confirm before turning OFF a previously-set verified/paid item (never when turning on).
  const confirmOff = (title: string, message: string, onConfirm: () => void) =>
    Alert.alert(title, message, [
      { text: "Cancel", style: "cancel" },
      { text: "Confirm", style: "destructive", onPress: onConfirm },
    ]);
  // Ready-card side-pot quick toggle: confirm on removal (turning off), immediate on add.
  const toggleReadyPot = (name: string, paid: boolean) =>
    paid
      ? confirmOff("Remove side pot?", `Remove ${name} from this player?`, () => onTogglePaidPot(name, false))
      : onTogglePaidPot(name, true);

  const togglePot = (name: string) =>
    setPaidPots((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name],
    );
  const potLabel = (p: { name: string; amount: number }) =>
    p.amount ? `${p.name} ($${p.amount})` : p.name;
  const entryLabel = entryFee ? `Entry Fee ($${entryFee})` : "Entry Fee";

  const fargoNum = parseInt(fargoInput, 10);
  const fargoValid = !isNaN(fargoNum) && fargoNum > 0;
  const selectedGroup = isGroups ? groupForFargo(fargoNum, raceGroups) : null;
  const overrideValid = !overrideOn || overrideRace >= 1;
  const committedOverride = overrideOn && overrideValid ? overrideRace : null;
  // A manual override stands in for the group requirement. Otherwise (groups
  // mode) the Fargo must land in a group. Ready always needs a valid Fargo and
  // the entry fee paid.
  const assignReady = overrideOn
    ? fargoValid && overrideValid
    : isGroups
      ? fargoValid && !!selectedGroup
      : fargoValid;
  // Ready requires: valid Fargo, TD-verified Fargo, entry paid, and race/group satisfied.
  // Side pots are optional and never gate Ready.
  const canBeReady = assignReady && paidEntry && verified;

  // Single Actions menu (replaces the permanent Edit/Undo/Remove buttons). Only shows the
  // actions valid for the current state; destructive/reversal actions confirm first.
  const openActions = () => {
    const opts: { text: string; style?: "cancel" | "destructive"; onPress?: () => void }[] = [];
    if (d === "ready") {
      opts.push({ text: "Edit", onPress: () => { reseed(); setEditing(true); } });
      opts.push({ text: "Undo Ready", onPress: () => confirmOff("Undo Ready?", "This moves the player back to Registered.", onUndo) });
      opts.push({ text: "Mark No Show", style: "destructive", onPress: () => confirmOff("Mark No Show?", "This marks the player as a no-show.", onNoShow) });
      opts.push({ text: "Remove Player", style: "destructive", onPress: () => confirmOff("Remove player?", "This removes the player from the tournament registration.", onRemove) });
    } else {
      opts.push({ text: "Mark No Show", style: "destructive", onPress: () => confirmOff("Mark No Show?", "This marks the player as a no-show.", onNoShow) });
      opts.push({ text: "Remove Player", style: "destructive", onPress: () => confirmOff("Remove player?", "This removes the player from the tournament registration.", onRemove) });
    }
    opts.push({ text: "Cancel", style: "cancel" });
    Alert.alert("Actions", getDisplayName(registration, pendingNames), opts);
  };

  // "Group A · Race to 5" line derived from a Fargo rating (groups mode).
  const groupLineFor = (fargo: number | null): string => {
    const g = groupForFargo(fargo, raceGroups);
    return g
      ? `Group ${g.label || "?"} · Race to ${g.raceTo}`
      : "No matching race group";
  };
  // Race line shown on read-only / locked cards. A manual override wins.
  const raceLine = (): string | null => {
    if (registration.race_override != null)
      return `Race to ${registration.race_override} (manual)`;
    if (isGroups) return groupLineFor(registration.fargo_rating ?? null);
    return null;
  };
  // Read-only states show the Fargo number in the compact header (right side); editable
  // states (prereg/registered/editing) put the Fargo INPUT in the body instead.
  const showReadFargo =
    locked || d === "no_show" || d === "removed" || (d === "ready" && !editing);

  const renderEditableBody = (onCommit: () => void, commitLabel: string, onCancel?: () => void) => (
    <>
      <View style={styles.assignPayRow}>
        <View style={styles.payCol}>
          <PayCheckbox
            label={entryLabel}
            checked={paidEntry}
            onToggle={() =>
              paidEntry
                ? confirmOff("Mark entry fee unpaid?", "This player was marked paid.", () => setPaidEntry(false))
                : setPaidEntry(true)
            }
          />
          {sidePots.map((p, i) => (
            <PayCheckbox
              key={`${p.name}-${i}`}
              label={potLabel(p)}
              checked={paidPots.includes(p.name)}
              onToggle={() =>
                paidPots.includes(p.name)
                  ? confirmOff("Remove side pot?", `Remove ${p.name} from this player?`, () => togglePot(p.name))
                  : togglePot(p.name)
              }
            />
          ))}
        </View>
        <View style={styles.fargoRight}>
          <FieldLabel label="Fargo" />
          <TextInput
            allowFontScaling={false}
            style={[styles.input, styles.inputNarrow]}
            value={fargoInput}
            onChangeText={(v) => {
              const clean = v.replace(/[^0-9]/g, "");
              setFargoInput(clean);
              // Editing the rating auto-clears verification unless it matches the saved
              // verified snapshot (typing the exact verified value keeps it verified).
              const n = parseInt(clean, 10);
              setVerified(
                !isNaN(n) && registration.fargo_at_registration === n,
              );
            }}
            placeholder="e.g., 525"
            placeholderTextColor={COLORS.textMuted}
            keyboardType="numeric"
            maxLength={3}
          />
          {fargoValid &&
            (verified ? (
              <TouchableOpacity
                onPress={() => confirmOff("Un-verify Fargo?", "This player's Fargo will need to be verified again before they can be Ready.", () => setVerified(false))}
                style={styles.fargoVerifyTag}
              >
                <Text allowFontScaling={false} style={styles.fargoVerifiedText}>✓ Verified</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity onPress={() => setVerified(true)} style={styles.fargoVerifyBtn}>
                <Text allowFontScaling={false} style={styles.fargoVerifyBtnText}>Verify</Text>
              </TouchableOpacity>
            ))}
        </View>
      </View>
      {isGroups && !overrideOn && (
        <Text allowFontScaling={false} style={styles.assignText}>
          {fargoValid
            ? groupLineFor(fargoNum)
            : "Enter a Fargo to assign a race group."}
        </Text>
      )}
      <ToggleSwitch
        label="Set race manually"
        value={overrideOn}
        onValueChange={setOverrideOn}
      />
      {overrideOn && (
        <Stepper
          prefix="Race to"
          value={overrideRace}
          onChange={setOverrideRace}
          min={1}
          max={50}
        />
      )}
      {!canBeReady && (
        <Text allowFontScaling={false} style={styles.hint}>
          {!fargoValid
            ? "Enter a Fargo rating to mark this player ready."
            : isGroups && !overrideOn && !selectedGroup
              ? 'Fargo is outside all race groups — turn on "Set race manually" to continue.'
              : !verified
                ? "Verify the Fargo to mark this player ready."
                : !paidEntry
                  ? "Mark the entry fee paid to make this player ready."
                  : ""}
        </Text>
      )}
      <View style={styles.regActions}>
        <TouchableOpacity
          style={[styles.regActionBtn, styles.readyBtn, !canBeReady && styles.btnDisabled]}
          onPress={onCommit}
          disabled={isProcessing || !canBeReady}
        >
          <Text allowFontScaling={false} style={styles.readyBtnText}>
            {isProcessing ? "..." : commitLabel}
          </Text>
        </TouchableOpacity>
        {onCancel ? (
          <TouchableOpacity
            style={[styles.regActionBtn, styles.undoBtn]}
            onPress={onCancel}
            disabled={isProcessing}
          >
            <Text allowFontScaling={false} style={styles.undoBtnText}>Cancel</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.regActionBtn, styles.rowActionsBtn]}
            onPress={openActions}
            disabled={isProcessing}
          >
            <Text allowFontScaling={false} style={styles.rowActionsBtnText}>Actions ▾</Text>
          </TouchableOpacity>
        )}
      </View>
    </>
  );

  return (
    <View style={styles.regCard}>
      {/* Compact header: name · #id · status pill on the left; Fargo (read states) on the
          right — one row instead of name-row + a separate status line + a big Fargo block. */}
      <View style={styles.regTopRow}>
        <View style={styles.regTopLeft}>
          <Text allowFontScaling={false} style={styles.playerName} numberOfLines={1}>
            {getDisplayName(registration, pendingNames)}
          </Text>
          {isGuest ? (
            <View style={styles.guestTag}>
              <Text allowFontScaling={false} style={styles.guestTagText}>Guest</Text>
            </View>
          ) : (
            registration.profiles && (
              <Text allowFontScaling={false} style={styles.playerIdInline}>
                #{registration.profiles.id_auto}
              </Text>
            )
          )}
          <View
            style={[
              styles.statusPill,
              { borderColor: meta.color, backgroundColor: meta.color + "22" },
            ]}
          >
            <View style={[styles.statusDotSm, { backgroundColor: meta.color }]} />
            <Text
              allowFontScaling={false}
              style={[styles.statusPillText, { color: meta.color }]}
            >
              {meta.label}
            </Text>
          </View>
        </View>
        {showReadFargo && (
          <View style={styles.fargoInline}>
            <Text allowFontScaling={false} style={styles.fargoInlineLabel}>Fargo</Text>
            <Text allowFontScaling={false} style={styles.fargoInlineValue}>
              {registration.fargo_rating ?? "—"}
            </Text>
            {isFargoVerified(registration.fargo_rating, registration.fargo_at_registration) && (
              <Text allowFontScaling={false} style={styles.fargoVerifiedText}>✓</Text>
            )}
          </View>
        )}
      </View>

      {locked && (
        <>
          {raceLine() && (
            <Text allowFontScaling={false} style={styles.assignText}>
              {raceLine()}
            </Text>
          )}
          {/* Side-pot entries stay visible (grayed) once locked, so a player who
              forgot which pots they're in can just ask. */}
          {sidePots.length > 0 && (
            <View style={styles.lockedPotsRow}>
              <Text allowFontScaling={false} style={styles.lockedPotsLabel}>
                Side pots:
              </Text>
              {livePaidPots().length === 0 ? (
                <Text allowFontScaling={false} style={styles.lockedPotsNone}>
                  None
                </Text>
              ) : (
                livePaidPots().map((name) => (
                  <View key={name} style={styles.lockedPotChip}>
                    <Text allowFontScaling={false} style={styles.lockedPotChipText}>
                      {name}
                    </Text>
                  </View>
                ))
              )}
            </View>
          )}
          <Text allowFontScaling={false} style={styles.hint}>
            Player list locked — reopen &amp; redraw to change.
          </Text>
        </>
      )}

      {!locked && (d === "prereg" || d === "registered") &&
        renderEditableBody(
          () => onReady(fargoNum, false, paidEntry, paidPots, committedOverride, verified),
          "Ready",
        )}

      {!locked && d === "ready" && editing &&
        renderEditableBody(
          () => {
            onSaveEdit(fargoNum, false, paidEntry, paidPots, committedOverride, verified, canBeReady);
            setEditing(false);
          },
          "Save",
          () => {
            reseed();
            setEditing(false);
          },
        )}

      {!locked && d === "ready" && !editing && (
        <>
          {/* Compact payment: entry (read) + tappable side-pot chips. Fargo is in the
              header. WEB uses dense chips; native keeps the checkbox rows (touch-friendly).
              Side pots remain one-tap toggleable so a newly added pot applies instantly. */}
          {isWeb ? (
            <View style={styles.payChipRow}>
              <View style={[styles.payChip, !!registration.paid_entry && styles.payChipOn]}>
                {!!registration.paid_entry && (
                  <Text allowFontScaling={false} style={styles.payChipCheck}>✓</Text>
                )}
                <Text
                  allowFontScaling={false}
                  style={[styles.payChipText, !!registration.paid_entry && styles.payChipTextOn]}
                >
                  {registration.paid_entry ? `${entryLabel} Paid` : `${entryLabel} Unpaid`}
                </Text>
              </View>
              {sidePots.map((pot, i) => {
                const paid = safePaidSidePots(registration.paid_side_pots).includes(pot.name);
                return (
                  <TouchableOpacity
                    key={`${pot.name}-${i}`}
                    style={[styles.payChip, paid && styles.payChipOn]}
                    onPress={isProcessing ? undefined : () => toggleReadyPot(pot.name, paid)}
                    disabled={isProcessing}
                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                    activeOpacity={0.7}
                  >
                    {paid && <Text allowFontScaling={false} style={styles.payChipCheck}>✓</Text>}
                    <Text
                      allowFontScaling={false}
                      style={[styles.payChipText, paid && styles.payChipTextOn]}
                    >
                      {potLabel(pot)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : (
            <View style={styles.payCol}>
              <PayCheckbox
                label={
                  registration.paid_entry
                    ? `${entryLabel} Paid`
                    : `${entryLabel} not marked`
                }
                checked={!!registration.paid_entry}
                readOnly
              />
              {sidePots.map((pot, i) => {
                const paid = safePaidSidePots(registration.paid_side_pots).includes(
                  pot.name,
                );
                return (
                  <PayCheckbox
                    key={`${pot.name}-${i}`}
                    label={paid ? `${potLabel(pot)} Entered` : potLabel(pot)}
                    checked={paid}
                    onToggle={
                      isProcessing
                        ? undefined
                        : () => toggleReadyPot(pot.name, paid)
                    }
                  />
                );
              })}
            </View>
          )}
          {raceLine() && (
            <Text allowFontScaling={false} style={styles.assignText}>
              {raceLine()}
            </Text>
          )}
          <View style={styles.regActions}>
            <TouchableOpacity
              style={[styles.regActionBtn, styles.rowActionsBtn]}
              onPress={openActions}
              disabled={isProcessing}
            >
              <Text allowFontScaling={false} style={styles.rowActionsBtnText}>
                {isProcessing ? "..." : "Actions ▾"}
              </Text>
            </TouchableOpacity>
          </View>
        </>
      )}

      {!locked && (d === "no_show" || d === "removed") && (
        <>
          {raceLine() && (
            <Text allowFontScaling={false} style={styles.assignText}>
              {raceLine()}
            </Text>
          )}
          <View style={styles.regActions}>
            <TouchableOpacity
              style={[styles.regActionBtn, styles.restoreBtn]}
              onPress={onRestore}
              disabled={isProcessing}
            >
              <Text allowFontScaling={false} style={styles.restoreBtnText}>
                {isProcessing ? "..." : "Restore"}
              </Text>
            </TouchableOpacity>
          </View>
        </>
      )}
    </View>
  );
};

// ── Web List View: single Actions menu (Alert) shared by list rows ────────────
// UI orchestration only — every option calls the SAME registration handlers the card
// view uses; destructive/reversal actions confirm first. Matches RegistrationRow's menu.
// ── Web Actions popover ───────────────────────────────────────────────────────
// Small dark menu anchored under the tapped Actions button (portaled to document.body),
// closes on outside click / after a selection. Same design language + anchoring technique as
// the shared Dropdown's WebPopover. Confirmations/handlers are supplied by the caller (via
// actionItemsFor) so behavior is unchanged — this only replaces the centered Alert modal.
const ACTIONS_MENU_FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const WebActionsMenu = ({
  anchorRef,
  items,
  onClose,
}: {
  anchorRef: React.RefObject<any>;
  items: { label: string; danger?: boolean; onPress: () => void }[];
  onClose: () => void;
}) => {
  // Anchor rect in VIEWPORT coords (position:fixed) so flip/clamp math is straightforward.
  const [rect, setRect] = useState<{ top: number; bottom: number; left: number; width: number } | null>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = anchorRef.current as HTMLElement | null;
    if (el && typeof el.getBoundingClientRect === "function") {
      const r = el.getBoundingClientRect();
      setRect({ top: r.top, bottom: r.bottom, left: r.left, width: r.width });
    }
  }, [anchorRef]);
  // Measure the rendered menu so we can flip up / clamp against its ACTUAL size (not a guess).
  useLayoutEffect(() => {
    if (menuRef.current) {
      setSize({ w: menuRef.current.offsetWidth, h: menuRef.current.offsetHeight });
    }
  }, [rect, items.length]);
  if (!rect || typeof document === "undefined") return null;

  const MARGIN = 8;
  const vw = typeof window !== "undefined" ? window.innerWidth : 1024;
  const vh = typeof window !== "undefined" ? window.innerHeight : 768;
  const menuW = size?.w ?? Math.max(rect.width, 180);
  const menuH = size?.h ?? 0;
  const spaceBelow = vh - rect.bottom;
  const spaceAbove = rect.top;
  // Prefer below when it fits; otherwise flip up if there's more room above.
  const placeBelow = menuH === 0 || spaceBelow >= menuH + MARGIN || spaceBelow >= spaceAbove;
  let top = placeBelow ? rect.bottom + 4 : rect.top - menuH - 4;
  if (menuH > 0) top = Math.max(MARGIN, Math.min(top, vh - menuH - MARGIN));
  const left = Math.max(MARGIN, Math.min(rect.left, vw - menuW - MARGIN));

  const overlayStyle: React.CSSProperties = { position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 999998 };
  const menuStyle: React.CSSProperties = {
    position: "fixed", top, left, minWidth: Math.max(rect.width, 180), maxHeight: vh - 2 * MARGIN, overflowY: "auto",
    backgroundColor: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 8,
    zIndex: 999999, boxShadow: "0 8px 24px rgba(0,0,0,0.5)", fontFamily: ACTIONS_MENU_FONT,
    // Hide the first paint until measured so it never flashes in the wrong place.
    opacity: size ? 1 : 0,
  };
  const rowStyle = (danger?: boolean, last?: boolean): React.CSSProperties => ({
    padding: "9px 14px", fontSize: 13, fontWeight: 600,
    color: danger ? COLORS.error : COLORS.primary, backgroundColor: "transparent",
    cursor: "pointer", borderBottom: last ? "none" : `1px solid ${COLORS.border}`,
    whiteSpace: "nowrap", transition: "background-color 0.12s ease",
  });

  const { createPortal } = require("react-dom");
  return createPortal(
    <>
      <div style={overlayStyle} onClick={onClose} />
      <div ref={menuRef} style={menuStyle}>
        {items.map((it, i) => (
          <div
            key={i}
            style={rowStyle(it.danger, i === items.length - 1)}
            onMouseEnter={(e) => ((e.currentTarget as HTMLDivElement).style.backgroundColor = COLORS.background)}
            onMouseLeave={(e) => ((e.currentTarget as HTMLDivElement).style.backgroundColor = "transparent")}
            onClick={() => { onClose(); it.onPress(); }}
          >
            {it.label}
          </div>
        ))}
      </div>
    </>,
    document.body,
  );
};

// ── Web List View: one compact table row per player ───────────────────────────
// DISPLAY + inline Entry/side-pot quick toggles (immediate persist, confirm on turn-off)
// + a single Actions menu. Fargo VERIFICATION status is shown here; verifying/editing the
// Fargo happens via Actions → Edit (which expands the full RegistrationRow). Reuses the
// same handlers/state as the cards — no separate registration logic.
const EliminationPlayerListRow = ({
  registration,
  sidePots,
  entryFee,
  isProcessing,
  onToggleEntry,
  onToggleSidePot,
  onActions,
  pendingNames,
  groupLabel,
}: {
  registration: Registration;
  sidePots: { name: string; amount: number }[];
  entryFee: number;
  isProcessing: boolean;
  onToggleEntry: (nextPaid: boolean) => void;
  onToggleSidePot: (name: string, entered: boolean) => void;
  onActions: (anchor: React.RefObject<any>) => void;
  pendingNames?: Map<string, string>;
  groupLabel?: string;
}) => {
  const actionsAnchor = useRef<any>(null);
  const d = displayStatusOf(registration.status);
  const meta = DISPLAY_META[d];
  const verified = isFargoVerified(registration.fargo_rating, registration.fargo_at_registration);
  const paid = !!registration.paid_entry;
  const entered = new Set(safePaidSidePots(registration.paid_side_pots));
  const pots = sidePots.filter((p) => (p.name ?? "").trim());
  const idText = registration.profiles ? `Player ID #${registration.profiles.id_auto}` : (!registration.player_id && !registration.player_uuid ? "Guest" : "");
  return (
    <View style={[styles.listRow, isProcessing && styles.btnDisabled]}>
      {/* Player */}
      <View style={styles.lcPlayer}>
        <Text allowFontScaling={false} style={styles.listName} numberOfLines={1}>
          {getDisplayName(registration, pendingNames)}
        </Text>
        {!!idText && <Text allowFontScaling={false} style={styles.listSub} numberOfLines={1}>{idText}</Text>}
        {!!groupLabel && <Text allowFontScaling={false} style={styles.listGroupLabel} numberOfLines={1}>{`Group ${groupLabel}`}</Text>}
      </View>
      {/* Fargo + verification status */}
      <View style={styles.lcFargo}>
        <Text allowFontScaling={false} style={styles.listFargoNum}>{registration.fargo_rating ?? "—"}</Text>
        {registration.fargo_rating != null && (
          <Text allowFontScaling={false} style={verified ? styles.listVerified : styles.listUnverified}>
            {verified ? "✓ Verified" : "Needs Verification"}
          </Text>
        )}
      </View>
      {/* Entry — tap toggles; confirm on turn-off handled by caller */}
      <View style={styles.lcEntry}>
        <TouchableOpacity
          style={[styles.listChip, paid && styles.listChipOn]}
          onPress={isProcessing ? undefined : () => onToggleEntry(!paid)}
          disabled={isProcessing}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          activeOpacity={0.7}
        >
          <Text allowFontScaling={false} style={[styles.listChipText, paid && styles.listChipTextOn]}>
            {paid ? "✓ Paid" : "Unpaid"}
          </Text>
        </TouchableOpacity>
      </View>
      {/* Side pots — dynamic chips; "—" when none configured */}
      <View style={styles.lcPots}>
        {pots.length === 0 ? (
          <Text allowFontScaling={false} style={styles.listSub}>—</Text>
        ) : (
          pots.map((p, i) => {
            const on = entered.has(p.name);
            return (
              <TouchableOpacity
                key={`${p.name}-${i}`}
                style={[styles.listPotChip, on && styles.listChipOn]}
                onPress={isProcessing ? undefined : () => onToggleSidePot(p.name, !on)}
                disabled={isProcessing}
                hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                activeOpacity={0.7}
              >
                <Text allowFontScaling={false} style={[styles.listPotText, on && styles.listChipTextOn]} numberOfLines={1}>
                  {on ? "✓ " : ""}{p.name}
                </Text>
              </TouchableOpacity>
            );
          })
        )}
      </View>
      {/* Status */}
      <View style={styles.lcStatus}>
        <View style={[styles.statusPill, { borderColor: meta.color, backgroundColor: meta.color + "22" }]}>
          <View style={[styles.statusDotSm, { backgroundColor: meta.color }]} />
          <Text allowFontScaling={false} style={[styles.statusPillText, { color: meta.color }]}>{meta.label}</Text>
        </View>
      </View>
      {/* Actions */}
      <View style={styles.lcActions}>
        {/* @ts-ignore web ref → DOM node for popover anchoring */}
        <TouchableOpacity ref={actionsAnchor} style={styles.listActionsBtn} onPress={() => onActions(actionsAnchor)} disabled={isProcessing}>
          <Text allowFontScaling={false} style={styles.rowActionsBtnText}>Actions ▾</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

// ── Web Card View: one vertical, sectioned player card (Chip-style hierarchy) ──
// DISPLAY + inline quick actions only (immediate persist, confirm on turn-off). Full Fargo /
// race editing happens via Actions → Edit (which expands the shared RegistrationRow), exactly
// like the List View. Reuses the SAME handlers/state as the rows — no separate logic. Sections:
//   header (avatar + name + muted Player ID) → status row → divider → Fargo row (rating +
//   verify state) → divider → Entry Fee row → one full row per configured Side Pot →
//   divider → footer [Actions] + [✓ Ready / current-state control].
const EliminationPlayerCard = ({
  registration,
  sidePots,
  entryFee,
  raceMode,
  raceGroups,
  groupLabel,
  isProcessing,
  pendingNames,
  onToggleEntry,
  onToggleSidePot,
  onVerify,
  onUnverify,
  onReady,
  onUndo,
  onActions,
}: {
  registration: Registration;
  sidePots: { name: string; amount: number }[];
  entryFee: number;
  raceMode: RaceMode;
  raceGroups: RaceGroup[];
  groupLabel?: string;
  isProcessing: boolean;
  pendingNames?: Map<string, string>;
  onToggleEntry: (nextPaid: boolean) => void;
  onToggleSidePot: (name: string, entered: boolean) => void;
  onVerify: () => void;
  onUnverify: () => void;
  onReady: () => void;
  onUndo: () => void;
  onActions: (anchor: React.RefObject<any>) => void;
}) => {
  const actionsAnchor = useRef<any>(null);
  const d = displayStatusOf(registration.status);
  const meta = DISPLAY_META[d];
  const isGuest = !registration.player_id && !registration.player_uuid;
  const name = getDisplayName(registration, pendingNames);
  const fargo = registration.fargo_rating;
  const fargoValid = fargo != null && fargo > 0;
  const verified = isFargoVerified(fargo, registration.fargo_at_registration);
  const paid = !!registration.paid_entry;
  const entered = new Set(safePaidSidePots(registration.paid_side_pots));
  const pots = sidePots.filter((p) => (p.name ?? "").trim());
  // Ready eligibility from PERSISTED state — same rule as RegistrationRow.canBeReady. Side
  // pots never gate Ready; a manual race override stands in for the group requirement.
  const isGroups = raceMode === "groups";
  const overrideOn = registration.race_override != null;
  const inGroup = isGroups && fargoValid ? !!groupForFargo(fargo, raceGroups) : false;
  const assignReady = overrideOn ? fargoValid : isGroups ? fargoValid && inGroup : fargoValid;
  const canReady = assignReady && paid && verified;
  const idText = registration.profiles
    ? `Player ID #${registration.profiles.id_auto}`
    : isGuest
      ? "Guest"
      : "";
  const initial = (name.trim()[0] ?? "?").toUpperCase();
  const entryLabel = entryFee ? `Entry Fee ($${entryFee})` : "Entry Fee";
  const potLabel = (p: { name: string; amount: number }) =>
    p.amount ? `${p.name} ($${p.amount})` : p.name;

  const payRow = (
    key: string,
    on: boolean,
    label: string,
    onPress: () => void,
  ) => (
    <TouchableOpacity
      key={key}
      style={styles.epPayRow}
      onPress={isProcessing ? undefined : onPress}
      disabled={isProcessing}
      activeOpacity={0.7}
    >
      <View style={[styles.epCheck, on && styles.epCheckOn]}>
        {on && <Text allowFontScaling={false} style={styles.epCheckMark}>✓</Text>}
      </View>
      <Text allowFontScaling={false} style={styles.epPayLabel} numberOfLines={1}>{label}</Text>
      <Text allowFontScaling={false} style={[styles.epPayStatus, on && styles.epPayStatusOn]}>
        {on ? "Paid" : "Unpaid"}
      </Text>
    </TouchableOpacity>
  );

  return (
    <View style={[styles.epCard, isProcessing && styles.btnDisabled]}>
      {/* Header — avatar initial + prominent name + muted Player ID */}
      <View style={styles.epHeader}>
        <View style={styles.epAvatar}>
          <Text allowFontScaling={false} style={styles.epAvatarText}>{initial}</Text>
        </View>
        <View style={styles.epHeaderText}>
          <Text allowFontScaling={false} style={styles.epName} numberOfLines={1}>{name}</Text>
          {!!idText && <Text allowFontScaling={false} style={styles.epId} numberOfLines={1}>{idText}</Text>}
        </View>
        {!!groupLabel && (
          <View style={styles.epGroupTag}>
            <Text allowFontScaling={false} style={styles.epGroupLabel} numberOfLines={1}>{`Group ${groupLabel}`}</Text>
          </View>
        )}
      </View>

      {/* Status — its own row */}
      <View style={styles.epStatusRow}>
        <View style={[styles.statusDotSm, { backgroundColor: meta.color }]} />
        <Text allowFontScaling={false} style={[styles.epStatusText, { color: meta.color }]}>{meta.label}</Text>
      </View>

      <View style={styles.epDivider} />

      {/* Fargo — label left, bold rating + verification state right */}
      <View style={styles.epFargoRow}>
        <Text allowFontScaling={false} style={styles.epRowLabel}>Fargo</Text>
        <View style={styles.epFargoRight}>
          <Text allowFontScaling={false} style={styles.epFargoNum}>{fargo ?? "—"}</Text>
          {fargoValid ? (
            verified ? (
              <TouchableOpacity onPress={isProcessing ? undefined : onUnverify} disabled={isProcessing} activeOpacity={0.7}>
                <Text allowFontScaling={false} style={styles.epVerified}>✓ Verified</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={styles.epVerifyBtn}
                onPress={isProcessing ? undefined : onVerify}
                disabled={isProcessing}
                activeOpacity={0.7}
              >
                <Text allowFontScaling={false} style={styles.epVerifyBtnText}>Verify</Text>
              </TouchableOpacity>
            )
          ) : (
            <Text allowFontScaling={false} style={styles.epUnrated}>Unrated</Text>
          )}
        </View>
      </View>

      <View style={styles.epDivider} />

      {/* Entry Fee + one full row per configured Side Pot (same visual pattern) */}
      {payRow("entry", paid, entryLabel, () => onToggleEntry(!paid))}
      {pots.map((p) =>
        payRow(`pot-${p.name}`, entered.has(p.name), potLabel(p), () =>
          onToggleSidePot(p.name, !entered.has(p.name)),
        ),
      )}

      <View style={styles.epDivider} />

      {/* Footer — compact [Actions] + current-state control side by side */}
      <View style={styles.epFooter}>
        {/* @ts-ignore web ref → DOM node for popover anchoring */}
        <TouchableOpacity ref={actionsAnchor} style={styles.epActionsBtn} onPress={() => onActions(actionsAnchor)} disabled={isProcessing} activeOpacity={0.7}>
          <Text allowFontScaling={false} style={styles.epActionsText}>Actions</Text>
        </TouchableOpacity>
        {d === "ready" ? (
          <TouchableOpacity style={[styles.epStateBtn, styles.epStateReady]} onPress={onUndo} disabled={isProcessing} activeOpacity={0.7}>
            <Text allowFontScaling={false} style={styles.epStateReadyText}>✓ Ready</Text>
          </TouchableOpacity>
        ) : d === "no_show" || d === "removed" ? (
          <TouchableOpacity style={styles.epStateBtn} onPress={() => onActions(actionsAnchor)} disabled={isProcessing} activeOpacity={0.7}>
            <Text allowFontScaling={false} style={styles.epStateMutedText}>{meta.label}</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.epStateBtn, canReady ? styles.epStateReadyFill : styles.epStateDisabled]}
            onPress={canReady && !isProcessing ? onReady : undefined}
            disabled={isProcessing || !canReady}
            activeOpacity={0.7}
          >
            <Text allowFontScaling={false} style={canReady ? styles.epStateReadyFillText : styles.epStateMutedText}>
              ✓ Ready
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

// ── Web Pool Table card ───────────────────────────────────────────────────────
// Compact card: header (icon + name + status pill), a COLLAPSED stream-link section, and a
// bottom-right Actions button anchoring the shared WebActionsMenu popover. Stream section:
//   • no link, collapsed → "+ Add Stream Link" (tap → expand, parent-controlled)
//   • expanded → inline input + Save/Update (+ Cancel); persists then collapses
//   • link saved, collapsed → "✓ Stream Link" + View Stream (edit/remove via Actions)
// Expansion is driven by the parent (`expanded`) so Actions → Edit Stream Link can open it.
const PoolTableCard = ({
  name,
  statusLabel,
  statusColor,
  streamLink,
  expanded,
  disabled,
  onEdit,
  onCancelEdit,
  onSaveStream,
  onViewStream,
  onActions,
}: {
  name: string;
  statusLabel: string;
  statusColor: string;
  streamLink: string;
  expanded: boolean;
  disabled?: boolean;
  onEdit: () => void;
  onCancelEdit: () => void;
  onSaveStream: (url: string) => void;
  onViewStream: (url: string) => void;
  onActions: (anchor: React.RefObject<any>) => void;
}) => {
  const anchor = useRef<any>(null);
  // Seeded from the persisted link. The parent keys this card by table id + stream_link, so a
  // saved change remounts it with a fresh draft; typing (prop unchanged) never gets clobbered.
  const [draft, setDraft] = useState(streamLink);
  const hasStream = !!streamLink.trim();
  const trimmed = draft.trim();
  const dirty = trimmed !== streamLink.trim();
  return (
    <View style={[styles.ptCard, disabled && styles.btnDisabled]}>
      <View style={styles.ptCardTop}>
        <Text allowFontScaling={false} style={styles.ptCardIcon}>{GLYPH.pool}</Text>
        <Text allowFontScaling={false} style={styles.ptCardName} numberOfLines={1}>{name}</Text>
        <View style={[styles.ptStatusPill, { backgroundColor: statusColor + "22", borderColor: statusColor }]}>
          <Text allowFontScaling={false} style={[styles.ptStatusPillText, { color: statusColor }]}>{statusLabel}</Text>
        </View>
      </View>

      {expanded ? (
        <View style={styles.ptStreamRow}>
          <Text allowFontScaling={false} style={styles.ptStreamIcon}>{GLYPH.link}</Text>
          <TextInput
            allowFontScaling={false}
            style={styles.ptStreamInput}
            value={draft}
            onChangeText={setDraft}
            placeholder="Paste stream link..."
            placeholderTextColor={COLORS.textMuted}
            autoCapitalize="none"
            editable={!disabled}
            autoFocus
          />
          <TouchableOpacity style={styles.ptStreamViewBtn} onPress={onCancelEdit} disabled={disabled} activeOpacity={0.7}>
            <Text allowFontScaling={false} style={styles.ptStreamViewText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.ptStreamSaveBtn, (!dirty || disabled) && styles.btnDisabled]}
            onPress={() => onSaveStream(trimmed)}
            disabled={!dirty || disabled}
            activeOpacity={0.7}
          >
            <Text allowFontScaling={false} style={styles.ptStreamSaveText}>{hasStream ? "Update" : "Save"}</Text>
          </TouchableOpacity>
        </View>
      ) : hasStream ? (
        <View style={styles.ptStreamRow}>
          <Text allowFontScaling={false} style={styles.ptStreamSaved}>{GLYPH.check} Stream Link</Text>
          <View style={{ flex: 1 }} />
          <TouchableOpacity onPress={() => onViewStream(streamLink)} disabled={disabled} activeOpacity={0.7} hitSlop={6}>
            <Text allowFontScaling={false} style={styles.ptStreamViewLink}>View Stream</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity style={styles.ptStreamRow} onPress={onEdit} disabled={disabled} activeOpacity={0.7}>
          <Text allowFontScaling={false} style={styles.ptStreamIcon}>{GLYPH.link}</Text>
          <Text allowFontScaling={false} style={styles.ptStreamAdd}>+ Add Stream Link</Text>
        </TouchableOpacity>
      )}

      <View style={styles.ptCardFooter}>
        {/* @ts-ignore web ref → DOM node for popover anchoring */}
        <TouchableOpacity ref={anchor} style={styles.ptActionsBtn} onPress={() => onActions(anchor)} disabled={disabled} activeOpacity={0.7}>
          <Text allowFontScaling={false} style={styles.ptActionsBtnText}>Actions ▾</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

// ── Locked / placeholder tab ─────────────────────────────────────────────────
const TabPlaceholder = ({
  locked,
  title,
  body,
}: {
  locked: boolean;
  title: string;
  body: string;
}) => (
  <View style={styles.placeholder}>
    <Text allowFontScaling={false} style={styles.placeholderGlyph}>
      {locked ? GLYPH.lock : ""}
    </Text>
    <Text allowFontScaling={false} style={styles.placeholderTitle}>
      {title}
    </Text>
    <Text allowFontScaling={false} style={styles.placeholderBody}>
      {body}
    </Text>
  </View>
);

// ── Screen ───────────────────────────────────────────────────────────────────
export default function ManageTournamentScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string; name?: string }>();
  const tournamentId = Number(params.id);
  const paramName = params.name || "";
  const insets = useSafeAreaInsets();
  // Global ⚡ Actions button (header) for chip tournaments → drives the embedded
  // chip manager's Actions modal.
  const [chipActionsOpen, setChipActionsOpen] = useState(false);

  const hub = useManageTournament(tournamentId);

  // Cross-client roster freshness (B1 follow-up): while THIS director is actively on
  // this tournament's manage screen, subscribe (tournament-scoped) to registration
  // changes and refresh the roster. Active = screen focused; blur/unmount tears it down
  // so only directors currently managing a tournament hold a channel. `chipRosterTick`
  // is bumped so the embedded chip roster (VM-driven, not React Query) reloads too.
  const [screenActive, setScreenActive] = useState(true);
  const [chipRosterTick, setChipRosterTick] = useState(0);
  useFocusEffect(
    useCallback(() => {
      setScreenActive(true);
      return () => setScreenActive(false);
    }, []),
  );
  const bumpChipRoster = useCallback(() => setChipRosterTick((t) => t + 1), []);
  useRegistrationRealtime(tournamentId, screenActive, bumpChipRoster);

  const isChipTournament =
    hub.tournament?.tournament_format === "chip-tournament";
  // Elimination Live Dashboard: durable activity feed + a focused match-action sheet + Start All
  // busy flag. All elimination-only; chip has its own engine and never uses these.
  const [tournamentEvents, setTournamentEvents] = useState<TournamentEvent[]>([]);
  const [dashboardSheet, setDashboardSheet] = useState<{ match: LiveMatch; step: MatchActionStep } | null>(null);
  const [dashBusy, setDashBusy] = useState(false);
  // Chip Prize Pool counts come from the SAME unified roster the chip Players tab and
  // Review & Start use — chipService.load() owns the dedupe across chip_entries +
  // tournament_players (self-reg singles) + tournament_teams (doubles). Counting a single
  // source here (e.g. tournament_teams only) is what made a singles event read 0 players.
  const chipRosterQuery = useQuery({
    queryKey: ["chip-roster", tournamentId],
    queryFn: () => chipService.load(tournamentId),
    enabled: !!tournamentId && isChipTournament,
  });
  // Phase mirrors use.chip.tournament: finished → completed, in_progress → live, else setup.
  // deriveLifecycle treats live/completed identically, so a Ready entry counts the same in
  // setup (paid + eligible + explicitly Ready) and once the field is live.
  const chipRosterPhase: LifecyclePhase =
    hub.tournament?.status === "completed" || hub.tournament?.live_state === "finished"
      ? "completed"
      : hub.tournament?.live_state === "in_progress"
        ? "live"
        : "setup";
  // Ready-only entrants — the prize pool reflects players actually paid/eligible and
  // entering the live field (Registered-not-Ready, Pre-Reg, Waiting, No-Show, Removed are
  // all excluded; an approved Fargo-cap-override Ready entry still counts).
  const chipLifecycleCtx = useMemo(
    () => ({
      phase: chipRosterPhase,
      doubles: chipRosterQuery.data?.chip.settings.format === "scotch_doubles",
      entryFeeRequired: (Number(hub.tournament?.entry_fee) || 0) > 0,
    }),
    [chipRosterQuery.data, chipRosterPhase, hub.tournament?.entry_fee],
  );
  const chipReady = useMemo(() => {
    const chip = chipRosterQuery.data?.chip;
    if (!chip) return [];
    return chipReadyEntries(chip.entries, chipLifecycleCtx);
  }, [chipRosterQuery.data, chipLifecycleCtx]);
  // Active roster (excludes cancelled / no-show / removed) — the basis for side-pot counts,
  // which reflect collected buy-in money and so do NOT require Ready.
  const chipActive = useMemo(() => {
    const chip = chipRosterQuery.data?.chip;
    if (!chip) return [];
    return chipActiveEntries(chip.entries, chipLifecycleCtx);
  }, [chipRosterQuery.data, chipLifecycleCtx]);
  // Still fetched for doubles-only paths (side-pot payout keys below). Not a count source.
  const chipTeamsQuery = useQuery({
    queryKey: ["tournament-teams", tournamentId],
    queryFn: () => teamService.getTeams(tournamentId),
    enabled: !!tournamentId && isChipTournament,
  });
  const chipTeams = useMemo(
    () => (chipTeamsQuery.data ?? []).filter((t) => t.status !== "pending_partner"),
    [chipTeamsQuery.data],
  );

  // Chip Tournaments are set up here (in the Compete form — settings + the Fargo
  // chip table under Fargo). The live winner-stays queue engine is its own screen,
  // opened from the footer once setup is saved.

  const [activeTab, setActiveTab] = useState<TabKey>("settings");
  // External "Submit Tournament" cancellable countdown (null = not submitting).
  const [submitCountdown, setSubmitCountdown] = useState<number | null>(null);
  // Wide web → two-column event-builder layout (form + sticky live preview).
  const { width: winW } = useWindowDimensions();
  // Which side pot (if any) is in inline-edit mode; others show as a compact list.
  const [editingSidePot, setEditingSidePot] = useState<number | null>(null);
  // Top-level lifecycle phase currently shown (Setup / Live / Results).
  const [selectedPhase, setSelectedPhase] = useState<PhaseKey>("setup");
  const lastGroupRef = useRef<PhaseKey | null>(null);

  // Settings form (seeded once from the record). savedSnapshot tracks the
  // last-saved form so we can warn about unsaved changes when leaving.
  const [form, setForm] = useState<SettingsForm | null>(null);
  const seededRef = useRef(false);
  const savedSnapshotRef = useRef<string | null>(null);
  useEffect(() => {
    if (!seededRef.current && hub.tournament) {
      const seeded = toForm(hub.tournament);
      setForm(seeded);
      savedSnapshotRef.current = JSON.stringify(seeded);
      seededRef.current = true;
    }
  }, [hub.tournament]);
  const settingsDirty =
    !!form &&
    savedSnapshotRef.current !== null &&
    JSON.stringify(form) !== savedSnapshotRef.current;

  // Players who entered a side pot store its name in paid_side_pots. When a pot
  // is renamed or removed in Settings, those stored names go stale (the Players
  // tab keeps showing the old/removed pot). Reconcile each player's entries
  // against the new pot list on save. Pass the form snapshot captured *before*
  // the save. Identity is name-only (no stable id), so we use a set diff:
  //  - a single removed + single added name is treated as a rename;
  //  - any other removed name is dropped from players' records.
  const propagateSidePotChanges = async (prevForm: SettingsForm | null) => {
    if (!prevForm || !form) return;
    // Detect renames (amount-aware; side pots have no stable id, membership is name-keyed)
    // and genuine removals between the last-saved and current pot lists.
    const toDef = (rows: SidePotForm[]) =>
      rows.map((p) => ({ name: p.name.trim(), amount: parseAmount(p.amount) }));
    const { renameMap, removed } = detectSidePotRenames(
      toDef(prevForm.sidePots),
      toDef(form.sidePots),
    );
    // A pure addition changes no existing membership — nothing to reconcile.
    if (Object.keys(renameMap).length === 0 && removed.length === 0) return;
    const curNames = form.sidePots.map((p) => p.name.trim()).filter(Boolean);
    const tasks: Promise<unknown>[] = [];
    // 1) tournament_players (elim / self-reg singles) — reconcile changed rows in memory.
    for (const reg of hub.registrations) {
      const current = safePaidSidePots(reg.paid_side_pots);
      const next = reconcileSidePotMembership(current, renameMap, curNames);
      if (next.length !== current.length || next.some((n, i) => n !== current[i])) {
        tasks.push(
          hub.updateRegistration({ id: reg.id, updates: { paid_side_pots: next } }),
        );
      }
    }
    // 2) chip_entries (owned singles) and 3) tournament_teams — reconciled server-side so
    // a rename/remove propagates across ALL three membership stores, not just registrations.
    tasks.push(chipService.reconcileSidePots(tournamentId, renameMap, curNames));
    tasks.push(teamService.reconcileSidePots(tournamentId, renameMap, curNames));
    await Promise.all(tasks);
  };

  // Snapshot of the last-saved form, used to detect side-pot renames on save.
  const prevFormSnapshot = (): SettingsForm | null =>
    savedSnapshotRef.current
      ? (JSON.parse(savedSnapshotRef.current) as SettingsForm)
      : null;

  // Add Fee modal (Settings → Fees Deducted From Entry)
  const [feeModalVisible, setFeeModalVisible] = useState(false);
  const [feeModalName, setFeeModalName] = useState("");
  const [feeModalAmount, setFeeModalAmount] = useState("");
  // Edit Fees mode: toggle rows between quick-config (normal) and fully-editable (rename/amount/delete any fee).
  const [feesEditMode, setFeesEditMode] = useState(false);

  // Players tab state
  const [addModalVisible, setAddModalVisible] = useState(false);
  // Phase 5: uuid -> display name for PENDING registrations (no id_auto/profile).
  const [pendingNames, setPendingNames] = useState<Map<string, string>>(new Map());
  const [isAdding, setIsAdding] = useState(false);
  const [processingId, setProcessingId] = useState<number | null>(null);
  const [playerSearch, setPlayerSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | DisplayStatus>("all");

  // Tables tab state
  const [singleTableNum, setSingleTableNum] = useState("");
  const [singleTableLabel, setSingleTableLabel] = useState("");
  const [bulkFrom, setBulkFrom] = useState("");
  const [bulkTo, setBulkTo] = useState("");
  const [bulkLabel, setBulkLabel] = useState("");
  const [streamDrafts, setStreamDrafts] = useState<Record<number, string>>({});
  const [tableBusy, setTableBusy] = useState(false);
  // Web Pool Tables redesign: single-add optional stream field + Bulk Add modal visibility.
  const [singleTableStream, setSingleTableStream] = useState("");
  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  // Web pool-table card interactions: anchored Actions popover + focused stream/rename modals.
  const [tableActionsMenu, setTableActionsMenu] = useState<{ anchor: React.RefObject<any>; id: number } | null>(null);
  // Which pool-table card currently has its inline stream editor expanded (collapsed default).
  const [editingStreamId, setEditingStreamId] = useState<number | null>(null);
  const [renameModalTableId, setRenameModalTableId] = useState<number | null>(null);
  const [renameLabel, setRenameLabel] = useState("");
  const [renameNum, setRenameNum] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await hub.refetch();
    } finally {
      setRefreshing(false);
    }
  };

  // Re-fetch registrations whenever the Players tab is opened, so self-service
  // registrations/removals made elsewhere show up without a manual refresh.
  useEffect(() => {
    if (activeTab === "players") hub.refetchRegistrations();
    // Chip entries/Ready state are edited on the (embedded) chip Players tab — refresh the
    // unified roster (and teams) when the Prize Pool tab opens so its entry pool + side-pot
    // counts reflect the latest entries.
    if (isChipTournament && activeTab === "prizepool") {
      chipRosterQuery.refetch();
      chipTeamsQuery.refetch();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  // Phase 5: resolve display names for any PENDING registrations (player_uuid but
  // no id_auto/profile), since the players table is RLS-locked. Only fetches when
  // a pending row is present.
  useEffect(() => {
    const hasPending = hub.registrations.some((r) => r.player_uuid && !r.player_id);
    if (!hasPending || !tournamentId) return;
    let cancelled = false;
    playerRegistrationService
      .getRegistrationDisplay(tournamentId)
      .then((rows) => {
        if (!cancelled) setPendingNames(new Map(rows.map((x) => [x.player_id, x.display_name])));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [hub.registrations, tournamentId]);

  // Live Ready count published by the embedded chip screen (authoritative roster).
  // Drives chip Players-step gating so it updates the instant a player is marked
  // Ready, instead of waiting on a stale roster refetch.
  const [embeddedChipReady, setEmbeddedChipReady] = useState<number | null>(null);
  // Live table count published by the embedded chip screen (chip tables live in the
  // chip state, NOT hub.tables) — drives chip Tables-step gating live.
  const [embeddedChipTables, setEmbeddedChipTables] = useState<number | null>(null);
  // Live readiness summary published by the embedded chip screen (its VM owns the
  // authoritative chip edits) — the readiness modal reads THIS, not the stale query.
  const [embeddedChipReadiness, setEmbeddedChipReadiness] = useState<PlayerReadinessSummary | null>(null);

  // Guided-setup prompt shown when the TD jumps ahead of an incomplete step.
  const [gatePrompt, setGatePrompt] = useState<{
    blocking: TabKey;
    target: TabKey;
  } | null>(null);
  // Player-readiness summary prompt shown when leaving Players forward with some
  // players/teams not yet Ready (informational — the TD can continue anyway).
  const [readinessPrompt, setReadinessPrompt] = useState<{ target: TabKey } | null>(null);

  // Per-step completion — drives the sequential gating + the Review checklist.
  const stepComplete = useMemo(() => {
    const t = hub.tournament;
    const ls = t?.live_settings ?? {};
    // Settings completeness = the SHARED source of truth (utils/settings-complete),
    // so the badge, this gate, and Begin Registration never disagree.
    const settings = !!t && settingsComplete({
      name: t.name,
      gameType: t.game_type,
      format: t.tournament_format,
      venueId: t.venue_id,
      date: t.tournament_date,
      time: t.start_time,
      tableSize: t.table_size,
      equipment: t.equipment,
      entryFee: t.entry_fee,
      maxFargo: t.max_fargo,
      open: t.open_tournament,
      raceMode: ls.raceMode ?? null,
    });
    const checkedIn = hub.registrations.filter(
      (r) => r.status === "checked_in",
    ).length;
    return {
      settings,
      players: checkedIn >= 2,
      tables: hub.tablesReady && hub.tables.length >= 1,
      bracket: !!ls.bracket,
    };
  }, [hub.tournament, hub.registrations, hub.tablesReady, hub.tables]);

  // ---- Prize Pool (Setup phase) ------------------------------------------
  // Locked once the bracket is drawn (mirrors settingsLocked, computed inline to
  // avoid referencing a const declared later in the component body).
  const prizeLocked = (
    ["bracket_drawn", "running", "completed", "archived"] as ManagePhase[]
  ).includes(hub.phase);

  const readyCount = useMemo(
    () => hub.registrations.filter((r) => r.status === "checked_in").length,
    [hub.registrations],
  );
  // Live Ready count while open; the drawn field once locked (so a closed field's pool
  // stops moving). Chip events count READY entrants from the unified roster (singles,
  // self-reg and doubles alike) — the pool reflects players actually paid/eligible and
  // entering the live field, matching the chip Players tab's Ready counter.
  const prizePlayers = isChipTournament
    ? chipReady.length
    : prizeLocked
      ? hub.bracket?.players ?? readyCount
      : readyCount;
  const prizeEntryFee = Number(hub.tournament?.entry_fee) || 0;
  const prizeAddedMoney = Number(hub.tournament?.added_money) || 0;

  // Entry fees come from the SAVED tournament (defined in Settings). Only
  // enabled fees deduct (a fee with no `enabled` flag predates the field and
  // was therefore applied).
  const prizeFees = useMemo(
    () =>
      (hub.tournament?.live_settings?.fees ?? [])
        .filter((f) => f.enabled ?? true)
        .map((f) => ({
          name: f.name || "Fee",
          perPlayer: Number(f.amount) || 0,
        })),
    [hub.tournament],
  );
  const prizeFeesOnTop = !!hub.tournament?.live_settings?.feesAddedOnTop;
  const prizeFeePerPlayer = feesPerPlayer(
    prizeFees.map((f) => ({ amount: f.perPlayer })),
  );
  // Included fees can't carve out more than the entry fee; on-top fees are fine.
  const prizeFeesOk = feesValid(
    prizeEntryFee,
    prizeFees.map((f) => ({ amount: f.perPlayer })),
    prizeFeesOnTop,
  );

  // Side pots come from the tournament; entrant counts from paid_side_pots. Chip events read
  // side-pot membership from the SAME unified roster — but from the ACTIVE set (not Ready):
  // a side-pot buy-in is money already collected, so it counts even for a Registered player
  // who is not Ready yet (e.g. still missing a Fargo). paidSidePots is populated uniformly
  // for singles chip_entries, self-reg tournament_players, and doubles teams by
  // chipService.load, so all three formats count identically. Cancelled / no-show / removed
  // entries are excluded by chipActive.
  const prizeSidePots = useMemo(() => {
    const pots = (hub.tournament?.side_pots ?? []).filter((p) =>
      (p.name ?? "").trim(),
    );
    if (isChipTournament) {
      return pots.map((p) => ({
        name: p.name.trim(),
        amount: Number(p.amount) || 0,
        players: chipActive.filter((e) =>
          (e.paidSidePots ?? []).includes(p.name.trim()),
        ).length,
      }));
    }
    const active = hub.registrations.filter(
      (r) => r.status !== "cancelled" && r.status !== "no_show",
    );
    return pots.map((p) => ({
      name: p.name.trim(),
      amount: Number(p.amount) || 0,
      players: active.filter((r) =>
        safePaidSidePots(r.paid_side_pots).includes(p.name.trim()),
      ).length,
    }));
  }, [hub.tournament, hub.registrations, isChipTournament, chipActive]);
  const sidePotNames = useMemo(
    () => prizeSidePots.map((s) => s.name),
    [prizeSidePots],
  );

  // Working copy of the payout config, seeded from live_settings (or a fresh
  // default) and reconciled to the CURRENT side pots.
  const [prizeForm, setPrizeForm] = useState<PrizePoolConfig | null>(null);
  const prizeSeededRef = useRef(false);
  const prizeSavedRef = useRef<string | null>(null);
  // The page ScrollView — chip pages ask to jump to the top (e.g. when a shuffle
  // round completes) so the Shuffle Mode banner / Start Shuffle is in reach.
  const pageScrollRef = useRef<ScrollView>(null);

  // Required-field validation UX: flips true the first time the TD taps Start Registration
  // with setup incomplete; drives the red field errors. fieldAnchors maps a SettingsFieldKey
  // to its FieldAnchor wrapper View so we can scroll the first missing requirement into view.
  const [settingsValidationAttempted, setSettingsValidationAttempted] = useState(false);
  const fieldAnchors = useRef<Record<string, View | null>>({});
  const registerFieldAnchor = useCallback((key: string, node: View | null) => {
    fieldAnchors.current[key] = node;
  }, []);
  // Visual top-to-bottom order of the required fields (for scroll-to-first-missing).
  const FIELD_ANCHOR_ORDER: SettingsFieldKey[] = [
    "name", "gameType", "format", "fargo", "raceMode", "entryFee",
    "date", "time", "tableSize", "equipment",
  ];
  // Scroll the first still-missing required field into view (no forced keyboard focus — on
  // mobile that would pop the keyboard unexpectedly; scroll-into-view is the safe signal).
  const scrollToFirstMissing = (keys: Set<SettingsFieldKey>) => {
    const firstKey = FIELD_ANCHOR_ORDER.find((k) => keys.has(k));
    if (!firstKey) return;
    const node = fieldAnchors.current[firstKey];
    const scroller = pageScrollRef.current;
    if (!node || !scroller) return;
    const handle = findNodeHandle(scroller);
    if (handle == null) return;
    try {
      // measureLayout gives the anchor's y within the ScrollView content on native + web.
      // @ts-ignore host component method
      node.measureLayout(
        handle,
        (_x: number, y: number) => {
          pageScrollRef.current?.scrollTo({ y: Math.max(0, y - webSc(24)), animated: true });
        },
        () => {},
      );
    } catch {
      // Non-fatal: scroll is a convenience; the red errors + summary still guide the TD.
    }
  };
  // Item 1(B): the setup pages share ONE persistent page ScrollView, so switching subtabs
  // (e.g. tapping "Review & Start" from the longer Players/Tables page) would inherit the
  // previous page's scroll offset and open mid-page. Reset to top on every setup subtab
  // change. Scoped to the setup phase — live/results own their scroll via onRequestScrollTop.
  useEffect(() => {
    if (selectedPhase === "setup") pageScrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [activeTab, selectedPhase]);
  useEffect(() => {
    if (prizeSeededRef.current || !hub.tournament) return;
    const base = hub.prizePool ?? defaultPrizePoolConfig(sidePotNames);
    const seeded: PrizePoolConfig = {
      ...base,
      sidePots: reconcileSidePots(base, sidePotNames),
    };
    setPrizeForm(seeded);
    prizeSavedRef.current = JSON.stringify(seeded);
    prizeSeededRef.current = true;
  }, [hub.tournament, hub.prizePool, sidePotNames]);

  // Keep side-pot payouts aligned if the TD edits side pots in Settings after
  // the prize form was seeded (add / remove / rename pots).
  useEffect(() => {
    setPrizeForm((f) => {
      if (!f) return f;
      if (f.sidePots.map((s) => s.name).join("|") === sidePotNames.join("|"))
        return f;
      return { ...f, sidePots: reconcileSidePots(f, sidePotNames) };
    });
  }, [sidePotNames]);

  const prizeDirty =
    !!prizeForm &&
    prizeSavedRef.current !== null &&
    JSON.stringify(prizeForm) !== prizeSavedRef.current;

  const prizeEntryPool = entryPoolTotal(
    prizePlayers,
    prizeEntryFee,
    prizeFeePerPlayer,
    prizeFeesOnTop,
    prizeForm?.includeAddedMoney ?? true,
    prizeAddedMoney,
  );
  const prizeSidePotPools = useMemo(() => {
    const map: Record<string, number> = {};
    for (const s of prizeSidePots) map[s.name] = sidePotTotal(s.players, s.amount);
    return map;
  }, [prizeSidePots]);
  // Which entrants (by standings key) entered each side pot, so a side pot only
  // pays its entrants — a non-entrant who finishes higher is skipped and the
  // money falls to the next-best entrant. Elim keys players as r<registrationId>;
  // chip keys teams as team<teamId>.
  const sidePotEntrants = useMemo(() => {
    const map: Record<string, string[]> = {};
    if (isChipTournament) {
      for (const t of chipTeams) {
        for (const name of t.paid_side_pots ?? []) {
          (map[name] ??= []).push(`team${t.id}`);
        }
      }
      return map;
    }
    for (const r of hub.registrations) {
      for (const name of safePaidSidePots(r.paid_side_pots)) {
        (map[name] ??= []).push(`r${r.id}`);
      }
    }
    return map;
  }, [hub.registrations, isChipTournament, chipTeams]);
  const prizeComplete =
    prizeFeesOk &&
    isPrizePoolComplete(prizeForm, prizeEntryPool, prizeSidePotPools);

  // Compact Prize Pool summary handed to the chip Review & Start screen (the split +
  // fee math lives here, so the embedded review reads it rather than recomputing).
  // Per-bucket payout allocation (entry + each enabled side pot) — the authoritative
  // source the Review & Start gate reads to block Start on any under/over-allocated pool.
  const chipPayoutBuckets = useMemo(
    () => payoutAllocations(prizeForm, prizeEntryPool, prizeSidePotPools),
    [prizeForm, prizeEntryPool, prizeSidePotPools],
  );
  const chipReviewPrize = useMemo(
    () => ({
      total:
        prizeEntryPool +
        Object.values(prizeSidePotPools).reduce((a, b) => a + b, 0),
      paidPlaces: prizeForm?.entryPlaces.length ?? 0,
      complete: prizeComplete,
      buckets: chipPayoutBuckets,
      balanced: payoutsFullyAllocated(chipPayoutBuckets),
    }),
    [prizeEntryPool, prizeSidePotPools, prizeForm, prizeComplete, chipPayoutBuckets],
  );

  // ── Guided setup sequence ───────────────────────────────────────────────────
  // Per-step completion for the guided flow (Settings → Players → Tables → Prize
  // Pool → Review/Bracket). Derived from LIVE state, so editing an earlier step
  // (clearing a required Setting, an invalid payout, etc.) instantly re-locks the
  // later steps — no parallel state to keep in sync. The terminal step
  // (review for chip, bracket for elimination) carries no flag of its own; it
  // unlocks once everything before it is complete.
  // Chip Ready count: prefer the LIVE value published by the embedded chip screen
  // (updates the instant the TD marks a player Ready). Fall back to the roster
  // query only before that screen has mounted. Both the guided-flow footer and the
  // Setup dropdown read setupStepComplete.players, so they share this one source.
  const chipReadyCount = embeddedChipReady ?? chipReady.length;
  // Chip tables live in the chip state (embedded screen), not hub.tables — prefer the
  // live count it publishes, falling back to the roster query before it mounts. Both
  // the Tables footer and the dropdown read setupStepComplete.tables, so they share it.
  const chipTableCount =
    embeddedChipTables ?? chipRosterQuery.data?.chip.tables.length ?? 0;
  const setupStepComplete: Record<string, boolean> = {
    settings: stepComplete.settings,
    players: isChipTournament ? chipReadyCount >= 2 : stepComplete.players,
    tables: isChipTournament ? chipTableCount >= 1 : stepComplete.tables,
    prizepool: prizeComplete,
    bracket: stepComplete.bracket,
  };
  // The ordered flow for THIS tournament kind. Chip ends at Review & Start with
  // Prize Pool as the last gate; elimination keeps its existing registration-driven
  // order (Prize Pool stays ungated there, as before).
  const setupOrder: TabKey[] = isChipTournament
    ? ["settings", "players", "tables", "prizepool", "review"]
    : SETUP_ORDER;
  // The final setup step for this format: chip → Review & Start; elimination →
  // Generate Bracket. Same guided sequence, different terminal page.
  const terminalTab: TabKey = isChipTournament ? "review" : "bracket";
  // Whether the terminal step is reachable (every earlier step complete).
  const reviewUnlocked = setupOrder
    .slice(0, Math.max(0, setupOrder.length - 1))
    .every((s) => setupStepComplete[s]);
  // Dropdown glyph for a setup page: 🔒 while an earlier step is incomplete, then
  // the page's own lead (⚡ terminal) or ✓ / ○ by completion.
  const setupPageGlyph = (tab: TabKey, lead?: string): string | undefined => {
    const idx = setupOrder.indexOf(tab);
    if (idx > 0 && setupOrder.slice(0, idx).some((s) => !setupStepComplete[s])) {
      return GLYPH.lock;
    }
    if (lead) return lead;
    return setupStepComplete[tab] ? GLYPH.check : "○"; // ○
  };

  const handleSavePrizePool = async () => {
    if (!prizeForm) return;
    try {
      await hub.savePrizePool(prizeForm);
      prizeSavedRef.current = JSON.stringify(prizeForm);
      Alert.alert("Saved", "Prize pool updated.");
    } catch {
      Alert.alert("Error", "Failed to save the prize pool.");
    }
  };

  const confirmLeavePrize = (proceed: () => void) =>
    Alert.alert(
      "Unsaved Prize Pool",
      "You have unsaved prize pool changes. Save them before leaving?",
      [
        { text: "Keep Editing", style: "cancel" },
        {
          text: "Discard",
          style: "destructive",
          onPress: () => {
            if (prizeSavedRef.current)
              setPrizeForm(JSON.parse(prizeSavedRef.current));
            proceed();
          },
        },
        {
          text: "Save",
          onPress: async () => {
            await handleSavePrizePool();
            proceed();
          },
        },
      ],
    );

  // Gate forward navigation: a setup step can't open until earlier ones are done.
  // Backward moves are always allowed — an earlier step's own predecessors are, by
  // definition, already complete, so editing a finished step is never blocked.
  const goToTab = (target: TabKey) => {
    if (!setupOrder.includes(target)) {
      setActiveTab(target);
      return;
    }
    // The predecessor-completeness gate (e.g. "finish Prize Pool before Review") is a
    // PRE-START check only. Once the tournament has already started (running/live/finished),
    // the setup steps are intentionally LOCKED, not "incomplete", so this gate must not
    // block simply opening a setup page like Review (which is read-only past start and can't
    // restart the event). Skip the gate when started; the pre-start flow is unchanged.
    const started =
      hub.tournament?.live_state === "in_progress" ||
      hub.tournament?.live_state === "finished" ||
      (["bracket_drawn", "running", "completed", "archived"] as ManagePhase[]).includes(hub.phase);
    if (!started) {
      const idx = setupOrder.indexOf(target);
      for (let i = 0; i < idx; i++) {
        const step = setupOrder[i];
        if (!setupStepComplete[step]) {
          setGatePrompt({ blocking: step, target });
          return;
        }
      }
    }
    setActiveTab(target);
  };

  // Warn about unsaved Settings edits before leaving the Settings tab / screen.
  const confirmLeaveSettings = (proceed: () => void) => {
    Alert.alert(
      "Unsaved Changes",
      "You have unsaved settings changes. Save them before leaving?",
      [
        { text: "Keep Editing", style: "cancel" },
        {
          text: "Discard Changes",
          style: "destructive",
          onPress: () => {
            if (hub.tournament) {
              const seeded = toForm(hub.tournament);
              setForm(seeded);
              savedSnapshotRef.current = JSON.stringify(seeded);
            }
            proceed();
          },
        },
        {
          text: "Save",
          onPress: async () => {
            if (!form) {
              proceed();
              return;
            }
            const prevForm = prevFormSnapshot();
            try {
              await hub.saveSettings(toPatch(form));
              savedSnapshotRef.current = JSON.stringify(form);
              await propagateSidePotChanges(prevForm);
              proceed();
            } catch {
              Alert.alert("Error", "Failed to save — your changes were kept.");
            }
          },
        },
      ],
    );
  };

  // ── Centralized Setup navigation ────────────────────────────────────────────
  // Two clearly different paths (never disable the dirty guard globally):
  //   • advanceToNextStep()      — the page's OWN forward CTA (Continue / Review &
  //     Start): save the dirty page, await it, and only navigate on success. Never
  //     shows the unsaved prompt; on save failure it stays put and shows the error.
  //   • attemptExternalNavigation() — leaving another way (Back, Setup dropdown,
  //     phase switch, close): keep the Save / Discard / Keep Editing prompt.

  // Save whichever Setup page is currently dirty. Returns false if a save failed (the
  // caller must NOT navigate). Silent success (no "Saved" popup) so a forward CTA
  // flows straight through. Players/Tables/Bracket have no deferred save (their edits
  // persist immediately), so they report clean.
  const saveCurrentPage = async (): Promise<boolean> => {
    if (activeTab === "settings" && settingsDirty && form) {
      const prevForm = prevFormSnapshot();
      try {
        await hub.saveSettings(toPatch(form));
        savedSnapshotRef.current = JSON.stringify(form);
        await propagateSidePotChanges(prevForm);
        return true;
      } catch {
        Alert.alert("Error", "Failed to save — your changes were kept.");
        return false;
      }
    }
    if (activeTab === "prizepool" && prizeDirty && prizeForm) {
      try {
        await hub.savePrizePool(prizeForm);
        prizeSavedRef.current = JSON.stringify(prizeForm);
        return true;
      } catch {
        Alert.alert("Error", "Failed to save the prize pool.");
        return false;
      }
    }
    return true;
  };

  // Forward CTA: save-and-advance. Save succeeds → mark clean (done inside save) and
  // move on; save fails → stay on the page, error already shown.
  const advanceToNextStep = async (target: TabKey) => {
    const ok = await saveCurrentPage();
    if (ok) goToTab(target);
  };

  // Settings' own forward CTA (Begin Registration / Start Registration / View Players):
  // validate the LIVE form → save → mark clean → open registration (badge flips
  // immediately via the optimistic live-state update) → go straight to Players. It
  // validates from the form (not stale saved state) and navigates with setActiveTab
  // (not goToTab), so it never trips the "You're almost there / Go to Settings" gate.
  const beginRegistration = async () => {
    if (!form) return;
    const items = missingSettingsItems(
      formToSettingsInput(form, hub.tournament?.venue_id ?? null),
    );
    if (items.length) {
      // Incomplete: do NOT start. Turn on the red field-error state, scroll the first
      // missing requirement into view, and show a concise message. The reds live-clear as
      // each field is fixed (they derive from the same shared missing-items result).
      setSettingsValidationAttempted(true);
      scrollToFirstMissing(new Set(items.map((m) => m.key)));
      Alert.alert(
        "Complete required setup",
        "Complete the required fields before starting registration.",
      );
      return; // stay on Settings, no save, no navigate
    }
    try {
      const prevForm = prevFormSnapshot();
      await hub.saveSettings(toPatch(form));
      savedSnapshotRef.current = JSON.stringify(form); // mark Settings clean
      await propagateSidePotChanges(prevForm);
      if (hub.phase !== "registration_open") await hub.startRegistration();
      setSelectedPhase("setup");
      setActiveTab("players"); // validated here → bypass the predecessor gate
    } catch {
      Alert.alert("Error", "Failed to open registration — your changes were kept.");
    }
  };

  // External navigation guard: prompt only when leaving a DIRTY page another way.
  const attemptExternalNavigation = (proceed: () => void) => {
    // An open unlock session takes priority: relock (discarding unsaved edits) instead of
    // the normal Save/Discard prompt — an unlock session must never save on exit.
    if (activeTab === "settings" && settingsUnlocked) confirmLeaveUnlocked(proceed);
    else if (activeTab === "settings" && settingsDirty) confirmLeaveSettings(proceed);
    else if (activeTab === "prizepool" && prizeDirty) confirmLeavePrize(proceed);
    else proceed();
  };

  // Tab changes from the Setup dropdown / other tabs are EXTERNAL navigation.
  const handleTabPress = (target: TabKey) => {
    if (target === activeTab) return;
    attemptExternalNavigation(() => goToTab(target));
  };

  const handleBack = () => attemptExternalNavigation(() => router.back());

  // ---- Tables handlers ----------------------------------------------------
  const handleAddTable = async () => {
    const n = parseInt(singleTableNum, 10);
    if (isNaN(n)) {
      Alert.alert("Required", "Enter a table number.");
      return;
    }
    setTableBusy(true);
    try {
      await hub.createTable({
        tableNumber: n,
        label: singleTableLabel.trim() || null,
      });
      setSingleTableNum("");
      setSingleTableLabel("");
    } catch {
      Alert.alert("Error", "Couldn't add the table — that number may already exist.");
    } finally {
      setTableBusy(false);
    }
  };
  const handleBulkAddTables = async () => {
    const from = parseInt(bulkFrom, 10);
    const to = parseInt(bulkTo, 10);
    if (isNaN(from) || isNaN(to) || to < from) {
      Alert.alert("Invalid range", "Enter a valid From / To range.");
      return;
    }
    if (to - from > 100) {
      Alert.alert("Too many", "Add at most 100 tables at once.");
      return;
    }
    setTableBusy(true);
    try {
      await hub.createTablesBulk({ from, to, label: bulkLabel.trim() || null });
      setBulkFrom("");
      setBulkTo("");
      setBulkLabel("");
    } catch {
      Alert.alert("Error", "Couldn't add tables — some numbers may already exist.");
    } finally {
      setTableBusy(false);
    }
  };
  const handleSetTableStatus = (id: number, status: TableStatus) =>
    hub
      .setTableStatus({ id, status })
      .catch(() => Alert.alert("Error", "Failed to update the table."));
  const handleToggleStreaming = (id: number, on: boolean, link: string) =>
    hub
      .setTableStreaming({ id, isStreaming: on, streamLink: link })
      .catch(() => Alert.alert("Error", "Failed to update streaming."));
  const handleDeleteTable = (id: number) =>
    Alert.alert("Remove Pool Table", "Remove this pool table?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: () =>
          hub
            .deleteTable(id)
            .catch(() => Alert.alert("Error", "Failed to remove the pool table.")),
      },
    ]);

  // Shared pool-table identity helpers (used by single add, bulk add, and the bulk preview).
  // Duplicate = same NORMALIZED label + number as an existing table — the SAME rule as the DB
  // unique index (tableIdentityKey mirrors it). Catches dupes in the UI before the DB errors.
  const poolTableDisplayName = (t: { table_number: number; label?: string | null }) =>
    t.label && t.label.trim() ? `${t.label.trim()} ${t.table_number}` : `Pool Table ${t.table_number}`;
  const findTableConflict = (label: string, tableNumber: number) => {
    const key = tableIdentityKey(label, tableNumber);
    return hub.tables.find((t) => tableIdentityKey(t.label, t.table_number) === key) ?? null;
  };

  // Web Pool Tables redesign — single add with optional stream link. Reuses the SAME
  // persistence (createTable → returns the row; setTableStreaming for the optional link),
  // so numbering/label semantics are unchanged; native keeps handleAddTable above.
  const handleAddPoolTable = async () => {
    const n = parseInt(singleTableNum, 10);
    if (isNaN(n)) {
      Alert.alert("Required", "Enter a pool table number.");
      return;
    }
    const conflict = findTableConflict(singleTableLabel, n);
    if (conflict) {
      Alert.alert("Duplicate pool table", `${poolTableDisplayName(conflict)} already exists.`);
      return;
    }
    setTableBusy(true);
    try {
      const created = await hub.createTable({
        tableNumber: n,
        label: singleTableLabel.trim() || null,
      });
      const url = singleTableStream.trim();
      if (url && created?.id) {
        await hub.setTableStreaming({ id: created.id, isStreaming: true, streamLink: url });
      }
      setSingleTableNum("");
      setSingleTableLabel("");
      setSingleTableStream("");
    } catch {
      Alert.alert("Error", "Couldn't add the pool table — that number may already exist.");
    } finally {
      setTableBusy(false);
    }
  };
  // Web Bulk Add modal submit — same range logic + persistence as handleBulkAddTables, then
  // closes the modal on success.
  const handleBulkAddPoolTables = async () => {
    const from = parseInt(bulkFrom, 10);
    const to = parseInt(bulkTo, 10);
    if (isNaN(from) || isNaN(to) || to < from) {
      Alert.alert("Invalid range", "Enter a valid From / To range.");
      return;
    }
    if (to - from > 100) {
      Alert.alert("Too many", "Add at most 100 pool tables at once.");
      return;
    }
    // Pre-check the whole range against existing tables under the shared identity rule.
    const conflicts: string[] = [];
    for (let n = from; n <= to; n++) {
      const c = findTableConflict(bulkLabel, n);
      if (c) conflicts.push(poolTableDisplayName(c));
    }
    if (conflicts.length) {
      Alert.alert(
        "Duplicate pool tables",
        conflicts.length === 1
          ? `${conflicts[0]} already exists.`
          : `These already exist: ${conflicts.slice(0, 6).join(", ")}${conflicts.length > 6 ? ", …" : ""}.`,
      );
      return;
    }
    setTableBusy(true);
    try {
      await hub.createTablesBulk({ from, to, label: bulkLabel.trim() || null });
      setBulkFrom("");
      setBulkTo("");
      setBulkLabel("");
      setBulkModalOpen(false);
    } catch {
      Alert.alert("Error", "One or more pool tables already exist with the same label and number.");
    } finally {
      setTableBusy(false);
    }
  };

  // Inline stream-link save (web cards): reuses the existing setTableStreaming persistence
  // (streaming on ⇔ a link is present). Only touches is_streaming + stream_link.
  const handleSaveStreamInline = (id: number, url: string) => {
    const u = url.trim();
    return withProcessing(
      id,
      () => hub.setTableStreaming({ id, isStreaming: !!u, streamLink: u || null }),
      "Failed to save the stream link.",
    );
  };
  const handleRemoveStreamLink = (id: number) =>
    Alert.alert("Remove stream link?", "Spectators will no longer see a stream for this table.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: () =>
          withProcessing(
            id,
            () => hub.setTableStreaming({ id, isStreaming: false, streamLink: null }),
            "Failed to remove the stream link.",
          ),
      },
    ]);
  // Open a stream URL in a new tab (web); tolerate links pasted without a protocol.
  const openStreamUrl = (url: string) => {
    const u = /^https?:\/\//i.test(url.trim()) ? url.trim() : `https://${url.trim()}`;
    if (typeof window !== "undefined") window.open(u, "_blank", "noopener,noreferrer");
  };

  // Focused Rename modal (web cards): edits BOTH label and number, reusing updateTable
  // persistence. Duplicate-checked under the shared identity rule (excluding the row itself).
  const openRenameModal = (id: number) => {
    const t = hub.tables.find((x) => x.id === id);
    setRenameLabel(t?.label ?? "");
    setRenameNum(t?.table_number != null ? String(t.table_number) : "");
    setRenameModalTableId(id);
  };
  const handleSaveRename = async () => {
    if (renameModalTableId == null) return;
    const id = renameModalTableId;
    const n = parseInt(renameNum, 10);
    if (isNaN(n)) {
      Alert.alert("Required", "Enter a pool table number.");
      return;
    }
    const key = tableIdentityKey(renameLabel, n);
    const conflict = hub.tables.find(
      (t) => t.id !== id && tableIdentityKey(t.label, t.table_number) === key,
    );
    if (conflict) {
      Alert.alert("Duplicate pool table", `${poolTableDisplayName(conflict)} already exists.`);
      return;
    }
    setRenameModalTableId(null);
    await withProcessing(
      id,
      () => hub.updateTable({ id, updates: { label: renameLabel.trim() || null, table_number: n } }),
      "Failed to rename the pool table.",
    );
  };

  // ---- Status-flow actions ------------------------------------------------
  const handleStartTournament = () => {
    // Stale-schedule gate (shared helper — same rule everywhere, no bypass): a
    // not-yet-started tournament whose saved date/time is already in the past must
    // be corrected first. Keep the TD on Setup so they can fix Date/Start Time.
    const staleErr = scheduleStaleError(hub.tournament);
    if (staleErr) {
      Alert.alert("Update the schedule", staleErr, [
        { text: "OK", onPress: () => setActiveTab("settings") },
      ]);
      return;
    }
    Alert.alert(
      "Start Tournament",
      "Start the tournament now? Status changes to Running and the Matches tab becomes the live control area.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Start Tournament",
          onPress: () =>
            hub
              .start()
              .catch(() => Alert.alert("Error", "Failed to start the tournament.")),
        },
      ],
    );
  };

  const isExternal = hub.tournament?.bracket_source === "external";
  // Chip Tournament format: no game spot, and the race is a simple "Race To" (1+).
  const isChip = form?.tournamentFormat === "chip-tournament";

  // Setup UX flag: the CURRENT form schedule (live edits) is stale — pre-start and in
  // the past (combined date+time, tournament timezone). Drives the inline warning on
  // the Schedule card so the TD sees Date/Time needs attention while editing. The
  // authoritative block lives in the start actions (shared helper), not this flag.
  const scheduleNeedsAttention = isScheduleStale({
    tournament_date: form?.tournamentDate || null,
    start_time: form?.startTime || null,
    timezone: hub.tournament?.timezone,
    live_state: hub.tournament?.live_state,
    status: hub.tournament?.status,
  });

  // Shared player-readiness summary (utils/player-readiness), derived from the SAME
  // authoritative roster/lifecycle logic each format's Players screen uses — chip via
  // chipEntryLifecycle, elimination via deriveLifecycle — so the modal never disagrees.
  const readinessSummary = useMemo<PlayerReadinessSummary | null>(() => {
    const feeRequired = (Number(hub.tournament?.entry_fee) || 0) > 0;
    const hasSidePots = (form?.sidePots?.length ?? 0) > 0;
    if (isChip) {
      // Chip's Players tab is the EMBEDDED ChipManageScreen with its own VM; use the
      // summary IT publishes live (the host's chipRosterQuery is a separate, stale copy).
      return embeddedChipReadiness;
    }
    // Elimination (single/double/scotch): tournament_players registrations.
    const isTeam = String(hub.tournament?.game_type ?? "").includes("scotch-doubles");
    const rows: ReadinessRow[] = hub.registrations.map((r) => ({
      status: deriveLifecycle({
        phase: "setup",
        exception:
          r.status === "no_show" ? "no_show" : r.status === "cancelled" ? "removed" : null,
        waiting: false,
        processed: r.status === "approved" || r.status === "checked_in",
        paymentSatisfied: paymentSatisfied(!!r.paid_entry, feeRequired),
        hardBlocker: false,
        checkedIn: r.status === "checked_in",
      }),
      paid: !!r.paid_entry,
      entryFeeRequired: feeRequired,
      inAnySidePot: (r.paid_side_pots?.length ?? 0) > 0,
    }));
    return buildReadinessSummary(rows, isTeam, hasSidePots);
  }, [
    isChip,
    embeddedChipReadiness,
    hub.registrations,
    hub.tournament?.entry_fee,
    hub.tournament?.game_type,
    form?.sidePots,
  ]);

  // Players page forward CTA: if any playable player/team is Not Ready, show the
  // informational summary first (never hard-blocks); otherwise advance in one tap.
  // Item 4: hard block leaving Players while any paid-but-not-Ready entrant exists — the TD
  // collected an entry fee then left the player out of the field. Marking Ready (or removing
  // them) must happen first. Shown as an actionable message, not just a disabled control; the
  // Review & Start warning remains as the final safety net.
  // Side-pot conflict: entry fee required + unpaid + ≥1 side pot selected is an incomplete
  // state the TD may configure freely while editing, but must resolve before progressing —
  // same shared predicate (blocksLeavingPlayers → hasSidePotPaymentConflict) as the card warning.
  const chipPlayersBlocked =
    isChipTournament && !!readinessSummary && blocksLeavingPlayers(readinessSummary);
  const alertLeavingPlayersBlocked = () => {
    // Side-pot conflict takes priority in the message (it's the newer, less obvious rule).
    const conflicts = readinessSummary?.sidePotConflicts ?? 0;
    if (conflicts > 0) {
      const noun =
        conflicts === 1
          ? readinessSummary?.entitySingular ?? "player"
          : readinessSummary?.entityLabel ?? "players";
      Alert.alert(
        "Resolve side pot entries first",
        `${conflicts} ${(noun as string).toLowerCase()} ${conflicts === 1 ? "has" : "have"} a side pot selected but ${conflicts === 1 ? "their" : "their"} tournament entry is unpaid. Mark entry paid/waived — or remove the side pot — before continuing to Tables.`,
      );
      return;
    }
    const n = readinessSummary?.paidNotReady ?? 0;
    const noun = n === 1 ? readinessSummary?.entitySingular ?? "player" : readinessSummary?.entityLabel ?? "players";
    Alert.alert(
      "Resolve paid players first",
      `${n} ${(noun as string).toLowerCase()} paid the entry fee but ${n === 1 ? "is" : "are"} not marked Ready. Mark ${n === 1 ? "them" : "each"} Ready — or remove ${n === 1 ? "them" : "them"} — before continuing to Tables. (Tap the "Paid · Not Ready" filter on the Players step to find ${n === 1 ? "them" : "them"}.)`,
    );
  };
  const advanceFromPlayers = (target: TabKey) => {
    if (activeTab === "players" && chipPlayersBlocked) {
      alertLeavingPlayersBlocked();
      return;
    }
    if (
      activeTab === "players" &&
      readinessSummary &&
      needsReadinessWarning(readinessSummary)
    ) {
      setReadinessPrompt({ target });
      return;
    }
    advanceToNextStep(target);
  };
  // Whether a chip tournament has already begun registration (drives Begin vs View).
  const chipRegistrationStarted =
    isChip &&
    ["registration_open", "registration_closed", "in_progress", "finished"].includes(
      hub.tournament?.live_state ?? "not_started",
    );
  const tournamentName =
    hub.tournament?.name ||
    paramName ||
    (isExternal ? "Tournament Submission" : "Tournament");
  // External (other-software) tournaments have no Compete registration/bracket
  // lifecycle, so the saved-state phase badge ("Setup Incomplete" / "Ready to
  // Start Registration") doesn't apply. Show submission readiness from the LIVE
  // form instead so it flips to "Ready to Submit" the moment everything's filled.
  const externalComplete =
    !!form &&
    !!form.name.trim() &&
    !!form.gameType &&
    !!form.tournamentFormat &&
    !!form.tournamentDate &&
    !!form.startTime &&
    !!form.venueId;
  const phaseMeta = isExternal
    ? externalComplete
      ? { label: "Ready to Submit", color: COLORS.success }
      : { label: "Setup Incomplete", color: COLORS.warning }
    : PHASE_META[hub.phase];

  // ── Lifecycle phase navigation ──────────────────────────────────────────────
  // Chip lifecycle follows the tournament's live_state (there's no bracket phase).
  const chipLiveState = hub.tournament?.live_state ?? "not_started";
  const chipFinished = chipLiveState === "finished" || hub.tournament?.status === "completed";
  const tournamentGroup: PhaseKey = isChip
    ? chipFinished
      ? "results"
      : chipLiveState === "in_progress"
        ? "live"
        : "setup"
    : phaseGroupOf(hub.phase);
  const liveUnlocked = isChip
    ? ["in_progress", "finished"].includes(chipLiveState)
    : (["bracket_drawn", "running", "completed", "archived"] as ManagePhase[]).includes(hub.phase);
  // Results is read-only (standings / payouts / stats / history / summary), so it
  // is viewable as soon as there's a bracket to report on — not gated on finishing.
  const resultsUnlocked = isChip ? chipFinished : liveUnlocked;
  const phaseUnlocked = (p: PhaseKey) =>
    p === "setup" ||
    (p === "live" && liveUnlocked) ||
    (p === "results" && resultsUnlocked);
  // Progress glyph for each phase pill: ✓ done · ● current · ⏺ live · 🔒 locked.
  const phaseStateOf = (p: PhaseKey): "done" | "current" | "live" | "locked" => {
    const i = PHASE_ORDER.indexOf(p);
    const cur = PHASE_ORDER.indexOf(tournamentGroup);
    if (i < cur) return "done";
    if (i === cur) return p === "live" && (isChip ? chipLiveState === "in_progress" : hub.phase === "running") ? "live" : "current";
    // An unlocked future phase (e.g. Live once the bracket is drawn) reads as
    // available rather than locked.
    if (phaseUnlocked(p)) return "current";
    return "locked";
  };
  const defaultTabForPhase = (p: PhaseKey): TabKey =>
    p === "live"
      ? (!isChip && isWeb ? "dashboard" : "matches") // elimination web Live lands on the Dashboard; native keeps Matches
      : p === "results"
        ? "standings"
        : isChip
          ? "players" // chip Setup opens on the registration list
          : hub.phase === "bracket_drawn"
            ? "bracket" // land on Draw Bracket (where Start lives) once drawn
            : "settings";

  // Build the lifecycle nav model (phase buttons + their page menus).
  // External (other-software) tournaments get a basic manager — just the details
  // page, no live-engine phases/tabs. (isExternal is computed above for the title.)
  const navPhases = isExternal
    ? [
        {
          key: "setup" as PhaseKey,
          label: "Manage",
          glyph: "●",
          state: "current" as "done" | "current" | "live" | "locked",
          locked: false,
          pages: [{ key: "settings" as TabKey, label: "Details" }],
        },
      ]
    : PHASE_ORDER.map((pk) => {
    const def = (isChip ? CHIP_PHASE_DEFS : PHASE_DEFS)[pk];
    const st = phaseStateOf(pk);
    return {
      key: pk,
      label: def.label,
      glyph: st === "done" ? "✓" : st === "live" ? "⏺" : st === "locked" ? GLYPH.lock : "●",
      state: st,
      locked: st === "locked",
      pages: def.tabs.map((t) => ({
        key: t.tab,
        label: t.label,
        divider: t.divider,
        // Setup pages reflect completed (✓) / locked (🔒) / terminal (⚡) / todo (○).
        // Other phases keep their lead glyph (⚡ Actions) or none.
        glyph: pk === "setup" ? setupPageGlyph(t.tab, t.lead) : t.lead,
      })),
    };
  });

  const handleSelectPage = (phaseKey: string, pageKey: string) => {
    // "Actions" is an operation, not a page — it opens the control-center modal.
    if (pageKey === "actions") {
      setActionsOpen(true);
      return;
    }
    setSelectedPhase(phaseKey as PhaseKey);
    handleTabPress(pageKey as TabKey);
  };

  // The header ⚡ Actions button is shown in the SAME place on every page (Setup /
  // Live / Results). Before the tournament starts it explains the controls are
  // locked and offers to jump to Review/Start; once started it opens the full chip
  // Actions modal from anywhere in the manager. The modal lives inside the embedded
  // chip screen, so on pages that don't render it (Settings / Prize Pool) we hop to
  // the live/results view first — the modal then appears when that page mounts.
  const onActionsPress = () => {
    if (!isChip) {
      setActionsOpen(true);
      return;
    }
    if (!liveUnlocked) {
      Alert.alert(
        "Tournament Not Started",
        "Finish setup and start the tournament to unlock live tournament controls.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Start Tournament", onPress: () => handleSelectPage("setup", "review") },
        ],
      );
      return;
    }
    if (chipPageForTab(selectedPhase, activeTab) == null) {
      const grp: PhaseKey = tournamentGroup === "results" ? "results" : "live";
      setSelectedPhase(grp);
      setActiveTab(defaultTabForPhase(grp));
    }
    setChipActionsOpen(true);
  };

  // Auto-advance the selected phase when the tournament's lifecycle moves
  // (e.g. drawing the bracket flips Setup → Live and lands on the bracket).
  useEffect(() => {
    if (lastGroupRef.current === tournamentGroup) return;
    lastGroupRef.current = tournamentGroup;
    setSelectedPhase(tournamentGroup);
    setActiveTab(defaultTabForPhase(tournamentGroup));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tournamentGroup]);

  // External tournaments only have the details page — keep them on it.
  useEffect(() => {
    if (isExternal && activeTab !== "settings") setActiveTab("settings");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isExternal]);

  const handlePhasePress = (p: PhaseKey) => {
    if (!phaseUnlocked(p)) {
      Alert.alert(
        "Not yet",
        p === "live"
          ? "Draw the bracket to move the tournament into Live."
          : "Finish the tournament to view Results.",
      );
      return;
    }
    if (p === selectedPhase) return;
    // Switching Setup ↔ Live ↔ Results is EXTERNAL navigation — guard unsaved
    // Settings AND Prize Pool edits (both, via the shared helper).
    attemptExternalNavigation(() => {
      setSelectedPhase(p);
      setActiveTab(defaultTabForPhase(p));
    });
  };

  // Settings unlock-with-reason (chip, running): a controlled escape hatch. Flipping
  // this local flag makes `settingsLocked` false so the Tournament Details form becomes
  // editable and the Save footer reappears — WITHOUT touching live_state or the chip
  // roster (that stays locked via its own gate). Gated behind a required-reason modal
  // whose reason/notes are audit-logged to chip_events with the director's id_auto.
  const [settingsUnlocked, setSettingsUnlocked] = useState(false);
  const [unlockVisible, setUnlockVisible] = useState(false);
  const [unlockReason, setUnlockReason] = useState<string | null>(null);
  const [unlockNotes, setUnlockNotes] = useState("");
  // Active unlock EDIT SESSION (chip, running). Held in a ref so the relock-on-exit and
  // unmount cleanup can read it without stale-closure issues. Set on unlock, cleared on
  // Save & Lock or relock. `baseline` is the settings patch captured at unlock so Save &
  // Lock can diff exactly what changed. `sessionId` links the unlock → save/relock events.
  const unlockSessionRef = useRef<{
    sessionId: string;
    reason: string;
    notes: string;
    actorName: string;
    baseline: Partial<Tournament>;
  } | null>(null);
  // Settings lock once the bracket is drawn — editing format/race/entry after a
  // draw would desync the bracket. Editing requires undoing the draw (reopen). A
  // director may deliberately unlock while running via the reason-gated flow above
  // (settingsUnlocked); that unlocks ONLY settings, never the chip Players roster.
  const settingsLocked =
    (["bracket_drawn", "running", "completed", "archived"] as ManagePhase[]).includes(hub.phase) &&
    !settingsUnlocked;

  const handleUndoDraw = () =>
    Alert.alert(
      "Undo Draw",
      "This reopens registration so you can edit settings. You'll need to draw the bracket again afterward. Continue?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Undo Draw",
          style: "destructive",
          onPress: () =>
            hub
              .reopenRegistration()
              .catch(() => Alert.alert("Error", "Failed to reopen registration.")),
        },
      ],
    );

  // ---- Bracket / Draw state ----------------------------------------------
  const { profile: tdProfile } = useAuthContext();

  // The current user's venues (as director and/or owner) for the "My Venues"
  // picker, plus the table sizes configured at the selected venue.
  const dirVenues = useVenuesByDirector(tdProfile?.id_auto);
  const ownerVenues = useVenuesByOwner(tdProfile?.id_auto);
  const myVenueOptions = useMemo(() => {
    const map = new Map<number, string>();
    [...dirVenues.venues, ...ownerVenues.venues].forEach((v) => {
      if (v?.id != null) map.set(v.id, v.venue);
    });
    return Array.from(map.entries()).map(([id, name]) => ({
      label: name,
      value: String(id),
    }));
  }, [dirVenues.venues, ownerVenues.venues]);
  const [venueTableSizes, setVenueTableSizes] = useState<
    { label: string; value: string }[]
  >([]);
  const selectedVenueId = form?.venueId ?? null;
  useEffect(() => {
    if (!selectedVenueId) {
      setVenueTableSizes([]);
      return;
    }
    let alive = true;
    venueTableService
      .getTableSizeOptions(selectedVenueId)
      .then((opts) => alive && setVenueTableSizes(opts))
      .catch(() => alive && setVenueTableSizes([]));
    return () => {
      alive = false;
    };
  }, [selectedVenueId]);

  // Contact name: defaults to the director's own name (from their profile) with a
  // custom option. contactMode tracks which the dropdown is on.
  const tdFullName =
    [tdProfile?.first_name, tdProfile?.last_name]
      .filter(Boolean)
      .join(" ")
      .trim() ||
    tdProfile?.name ||
    "";
  const [contactMode, setContactMode] = useState<"profile" | "custom">("profile");
  const contactSyncedRef = useRef(false);
  useEffect(() => {
    if (!form || contactSyncedRef.current) return;
    contactSyncedRef.current = true;
    setContactMode(
      form.contactName && form.contactName !== tdFullName ? "custom" : "profile",
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form]);
  const [bracketSizeSel, setBracketSizeSel] = useState<number | null>(null);

  // ---- Settings templates (save/apply the whole settings form, max 5) ----
  const settingsTemplates = useSettingsTemplates(tdProfile?.id_auto);
  // Shared image picker/upload (same behavior as the submit flow).
  const tournamentImage = useTournamentImage(tdProfile?.id_auto?.toString());
  const [tplSaveOpen, setTplSaveOpen] = useState(false);
  const applyTemplate = (settings: Record<string, unknown>) =>
    // Added Money is intentionally excluded from templates (see
    // TEMPLATE_EXCLUDED_KEYS). Force it blank on apply so a template can never
    // reintroduce stale prize money — the TD re-enters it per event.
    patchForm({ ...(settings as Partial<SettingsForm>), addedMoney: "" });
  const [drawType, setDrawType] = useState<DrawType>("random");
  const [redrawVisible, setRedrawVisible] = useState(false);
  const [redrawReason, setRedrawReason] = useState("");
  const [showDrawHistory, setShowDrawHistory] = useState(false);
  const pendingRedrawReason = useRef<string | null>(null);

  const readyPlayers: DrawPlayer[] = useMemo(
    () =>
      hub.registrations
        .filter((r) => r.status === "checked_in")
        .map((r) => ({
          registrationId: r.id,
          name: getDisplayName(r, pendingNames),
          fargo: r.fargo_rating ?? null,
          raceOverride: r.race_override ?? null,
        })),
    [hub.registrations],
  );

  // Live matches for the Matches tab: bracket round 1 + per-match state + tables.
  const raceConfig: RaceConfig = useMemo(() => {
    const ls = hub.tournament?.live_settings ?? {};
    return {
      mode: ls.raceMode ?? "fixed",
      fixedWinners: ls.fixedRaceWinners ?? 5,
      groups: ls.raceGroups ?? [],
      diffMin: ls.fargoDiffMinRace ?? 3,
      diffPerGame: ls.fargoDiffPerGame ?? 40,
      diffMax: ls.fargoDiffMaxRace ?? null,
    };
  }, [hub.tournament]);

  const liveMatches = useMemo(
    () =>
      buildLiveMatches(
        hub.bracket,
        hub.matchState,
        hub.tables,
        hub.tournament?.game_type ?? "",
        raceConfig,
      ),
    [hub.bracket, hub.matchState, hub.tables, hub.tournament?.game_type, raceConfig],
  );

  // Shared projected elimination schedule (Phase 1): Queue → On Tables / Scheduled
  // Matches and the Dashboard's Match Schedule all read this one derivation.
  const projectedSchedule = useProjectedSchedule(
    hub.bracket,
    liveMatches,
    hub.matchState,
    hub.autoAssignMode as AutoAssignMode,
    hub.queueOrder ?? [],
  );

  // Operator-side persistence of the bracket engine's elimination set (covers the case where
  // the TD runs the event on this screen and no participant is viewing their own Tournament
  // View). Idempotent + self-correcting server-side; guarded per session so it only writes when
  // the set actually changes. Elimination-format only (chip uses its own eliminated status).
  const elimSyncRef = useRef<string>("");
  useEffect(() => {
    if (isChipTournament || !tournamentId || hub.tournament?.live_state !== "in_progress") return;
    const ids = computeEliminatedRegIds(liveMatches);
    const key = [...ids].sort((a, b) => a - b).join(",");
    if (key === elimSyncRef.current) return;
    elimSyncRef.current = key;
    tournamentService.syncEliminations(tournamentId, ids).catch(() => {});
  }, [liveMatches, isChipTournament, tournamentId, hub.tournament?.live_state]);

  // Which active (assigned or in-progress, not yet completed) match each table is
  // on (tableId -> match). A table is "in use" while such a match sits on it; this
  // is the source of truth for the Tables tab status + the assign-table guard (so a
  // table can't be double-booked). Completing/moving a match frees its table.
  const tableMatch = useMemo(() => {
    const map: Record<number, LiveMatch> = {};
    for (const m of liveMatches) {
      if (m.tableId != null && m.status !== "completed" && !m.bye && !m.empty)
        map[m.tableId] = m;
    }
    return map;
  }, [liveMatches]);
  const tableOccupancy = useMemo(() => {
    const map: Record<number, string> = {};
    for (const id of Object.keys(tableMatch)) map[Number(id)] = tableMatch[Number(id)].label;
    return map;
  }, [tableMatch]);

  // ── Tournament-complete detection ────────────────────────────────────────
  // The event is decided once every playable match is completed — i.e. the TD
  // has entered the final score. Byes/empties auto-resolve and a skipped GF2
  // drops out of the list, so this holds for both single- and double-elim.
  // (Chip has no bracket, so decidableMatches is empty and this stays false.)
  const decidableMatches = useMemo(
    () => liveMatches.filter((m) => !m.empty && !m.bye),
    [liveMatches],
  );
  const allMatchesDecided =
    !isChip &&
    decidableMatches.length > 0 &&
    decidableMatches.every((m) => m.status === "completed");
  // The championship match is the one whose winner advances nowhere.
  const championName = useMemo(() => {
    if (!allMatchesDecided) return null;
    const finalM = decidableMatches.find((m) => m.winnerToLabel == null);
    if (!finalM || finalM.winner == null) return null;
    return finalM.winner === 1 ? finalM.p1Name : finalM.p2Name;
  }, [allMatchesDecided, decidableMatches]);

  // When the last score lands, nudge the TD to finish the event (once per
  // completion — dismissing won't nag, but editing a score and re-completing
  // re-arms it). Finishing flips live_state to "finished", which is what stops
  // the tournament from showing as live everywhere it's reported.
  const finishPromptedRef = useRef(false);
  useEffect(() => {
    if (!allMatchesDecided || hub.phase !== "running") {
      finishPromptedRef.current = false;
      return;
    }
    if (finishPromptedRef.current) return;
    finishPromptedRef.current = true;
    Alert.alert(
      "Tournament Complete",
      championName
        ? `${championName} takes the title! 🏆\n\nEvery match is finished — mark this tournament completed?`
        : "Every match is finished — mark this tournament completed?",
      [
        { text: "Not Yet", style: "cancel" },
        {
          text: "Finish Tournament",
          onPress: () =>
            hub
              .complete()
              .catch(() =>
                Alert.alert("Error", "Failed to finish the tournament."),
              ),
        },
      ],
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allMatchesDecided, hub.phase, championName]);

  // ---- Queue Manager handlers --------------------------------------------
  // When a match goes live, text both players that it's their turn — but only
  // those who opted into SMS match alerts (the service checks prefs). Best-effort:
  // never blocks or fails the start. tableIdOverride covers assign+start, where
  // liveMatches hasn't re-rendered with the new table yet.
  const notifyMatchPlayers = (matchId: string, tableIdOverride?: number) => {
    const m = liveMatches.find((x) => x.id === matchId);
    if (!m) return;
    // Server-authorized: pass only identifiers. The Edge Function resolves the
    // recipient/opponent/table, checks verification + consent, and dedupes.
    const tournamentId = hub.tournament?.id;
    if (tournamentId == null) return;
    const regToPlayer = new Map(
      hub.registrations.map((r) => [r.id, r.player_id]),
    );
    for (const regId of [m.p1RegId, m.p2RegId]) {
      const playerId = regId != null ? regToPlayer.get(regId) : null;
      if (playerId == null) continue;
      smsNotificationService.notifyMatchReady({
        tournamentId,
        matchId: m.id,
        recipientIdAuto: playerId,
      });
    }
  };

  // Assigning a table PARKS the match on it (table set, still "scheduled") — the
  // TD then starts it separately. This keeps a table reserved without the clock
  // running until play actually begins.
  // Refresh the durable activity feed (elimination only). Newest-first via the service.
  const refreshEvents = useCallback(() => {
    if (!tournamentId || isChipTournament) return;
    tournamentEventService.list(tournamentId).then(setTournamentEvents).catch(() => {});
  }, [tournamentId, isChipTournament]);
  // Load the activity feed when the elimination Dashboard is opened.
  useEffect(() => {
    if (activeTab === "dashboard") refreshEvents();
  }, [activeTab, refreshEvents]);

  // Derive + write the durable activity event(s) for a match mutation, from the resolved
  // LiveMatch (names/round/side/table) + the patch. Structured payload; fire-and-forget so an
  // audit-log failure never affects the real mutation. tournament_started is emitted here when
  // the live_state was not yet Running (matches the Phase 1 atomic flip in setMatchState).
  const logMatchDerivedEvent = (
    prev: LiveMatch | null,
    patch: Partial<MatchLiveState>,
    prevLiveState: TournamentLiveState | undefined,
  ) => {
    if (!tournamentId || isChipTournament) return;
    const actor = tdProfile?.id_auto ?? null;
    const tableId = "tableId" in patch ? patch.tableId ?? null : prev?.tableId ?? null;
    const tbl = tableId != null ? hub.tables.find((t) => t.id === tableId) : undefined;
    const tableLabel = tbl ? tbl.label?.trim() || `Table ${tbl.table_number}` : null;
    const base: Record<string, unknown> = prev
      ? {
          matchId: prev.id,
          label: prev.label,
          side: prev.side,
          round: prev.round,
          location: bracketLocation(prev),
          p1Name: prev.p1Name,
          p2Name: prev.p2Name,
        }
      : {};
    const emit = (type: Parameters<typeof tournamentEventService.log>[1], extra: Record<string, unknown>) =>
      tournamentEventService.log(tournamentId, type, { ...base, ...extra }, "", actor).catch(() => {});
    if (patch.status === "in_progress") {
      if (prevLiveState && prevLiveState !== "in_progress" && prevLiveState !== "finished")
        emit("tournament_started", {});
      emit("match_started", { tableId, tableLabel });
    } else if (patch.status === "completed") {
      const winner = patch.winner ?? prev?.winner ?? null;
      const winnerName = winner === 1 ? prev?.p1Name : winner === 2 ? prev?.p2Name : null;
      const loserName = winner === 1 ? prev?.p2Name : winner === 2 ? prev?.p1Name : null;
      emit("match_completed", { winner, winnerName, loserName, tableLabel });
    } else if (patch.status === "scheduled") {
      if (prev?.status === "completed") emit("match_reopened", {});
      else if ("tableId" in patch) {
        if (patch.tableId == null) emit("table_unassigned", {});
        else if (prev?.tableId == null) emit("table_assigned", { tableId, tableLabel });
        else if (prev?.tableId !== patch.tableId) emit("table_changed", { tableId, tableLabel });
      }
    } else if (patch.status === undefined && "startedAt" in patch && prev?.status === "in_progress") {
      // Elapsed-timer correction/reset (startedAt-only patch on a live match).
      const nowT = Date.now();
      const prevEl = prev?.startedAt ? Math.max(0, (nowT - Date.parse(prev.startedAt)) / 1000) : 0;
      const newEl = patch.startedAt ? Math.max(0, (nowT - Date.parse(patch.startedAt)) / 1000) : 0;
      emit("match_timer_adjusted", {
        reset: newEl < 2,
        prevElapsed: formatClock(prevEl),
        newElapsed: formatClock(newEl),
        prevStartedAt: prev?.startedAt ?? null,
        newStartedAt: patch.startedAt ?? null,
      });
    }
  };

  // One authoritative match-mutation path for the Live screen (web + native): persist via the
  // hub (which also flips live_state → Running on the first start), then write the durable
  // event(s) and refresh the feed. Every Live match action routes through this.
  const runMatchPatch = async (matchId: string, patch: Partial<MatchLiveState>) => {
    const prev = liveMatches.find((m) => m.id === matchId) ?? null;
    const prevLiveState = hub.tournament?.live_state;
    await hub.setMatchState({ matchId, patch });
    logMatchDerivedEvent(prev, patch, prevLiveState);
    refreshEvents();
  };

  // ── Elimination typed-op writes (Phase 3) ──────────────────────────────────────────────
  // Queue/table actions go through the server-side elim_live_apply ops (row-locked, validated,
  // touch only the targeted match). Batches are ONE call with per-op results; activity events
  // and player notifications are sent ONLY for ops the server accepted.
  // `eventPatch` is the equivalent MatchLiveState change, used for the durable activity log.
  const runLiveOps = async (
    items: { op: ElimLiveOp; eventPatch: Partial<MatchLiveState> }[],
  ): Promise<ElimLiveOpResult[]> => {
    const prevById = new Map(liveMatches.map((m) => [m.id, m]));
    const prevLiveState = hub.tournament?.live_state;
    const res = await hub.applyLiveOps(items.map((x) => x.op));
    let firstStart = true;
    res.results.forEach((r) => {
      if (!r.ok) return;
      const it = items[r.i];
      const mid = "matchId" in it.op ? it.op.matchId : null;
      if (!mid) return;
      // Only the first successful start may emit "tournament_started".
      const lsForEvent = it.eventPatch.status === "in_progress" && !firstStart ? "in_progress" : prevLiveState;
      if (it.eventPatch.status === "in_progress") firstStart = false;
      logMatchDerivedEvent(prevById.get(mid) ?? null, it.eventPatch, lsForEvent);
    });
    refreshEvents();
    return res.results;
  };
  // Single op → throws on rejection so the existing error alerts still fire.
  const runLiveOp = async (op: ElimLiveOp, eventPatch: Partial<MatchLiveState>) => {
    const [r] = await runLiveOps([{ op, eventPatch }]);
    if (!r?.ok) throw new Error(liveOpErrorText(r?.error));
  };
  const assignItem = (matchId: string, tableId: number, start: boolean) => ({
    op: { op: "assign", matchId, tableId, start } as ElimLiveOp,
    eventPatch: start
      ? ({ tableId, status: "in_progress" } as Partial<MatchLiveState>)
      : ({ tableId, status: "scheduled", startedAt: null } as Partial<MatchLiveState>),
  });

  const handleQueueAssign = (matchId: string, tableId: number) =>
    runLiveOp(assignItem(matchId, tableId, false).op, assignItem(matchId, tableId, false).eventPatch).catch(
      (e: Error) => Alert.alert("Error", `Failed to assign the table (${e.message}).`),
    );
  // Assign + start in one step (server stamps startedAt).
  const handleQueueAssignStart = (matchId: string, tableId: number) =>
    runLiveOp(assignItem(matchId, tableId, true).op, assignItem(matchId, tableId, true).eventPatch)
      .then(() => notifyMatchPlayers(matchId, tableId))
      .catch((e: Error) => Alert.alert("Error", `Failed to assign and start the match (${e.message}).`));
  // Start a match already parked on a table (keeps its table; server stamps startedAt).
  const handleQueueStart = (matchId: string) =>
    runLiveOp({ op: "start", matchId }, { status: "in_progress" })
      .then(() => notifyMatchPlayers(matchId))
      .catch((e: Error) => Alert.alert("Error", `Failed to start the match (${e.message}).`));
  // Send a match back to the queue: clear its table and revert to scheduled.
  const handleQueueUnassign = (matchId: string) =>
    runLiveOp({ op: "unassign", matchId }, { tableId: null, status: "scheduled", startedAt: null }).catch(
      (e: Error) => Alert.alert("Error", `Failed to update the match (${e.message}).`),
    );
  // Queue Auto Assign "Assign All" / "Assign & Start All": ONE batch call (was an un-awaited
  // loop). Returns per-match results so the preview can list only what actually landed.
  const handleQueueAssignMany = async (
    plan: AssignmentPlan[],
    start: boolean,
  ): Promise<{ matchId: string; ok: boolean; error?: string }[]> => {
    if (plan.length === 0) return [];
    try {
      const results = await runLiveOps(plan.map((p) => assignItem(p.matchId, p.tableId, start)));
      if (start) results.forEach((r) => r.ok && notifyMatchPlayers(plan[r.i].matchId, plan[r.i].tableId));
      return results.map((r) => ({ matchId: plan[r.i].matchId, ok: r.ok, error: r.error }));
    } catch (e) {
      Alert.alert("Auto Assign", `Could not assign matches (${(e as Error).message}).`);
      return plan.map((p) => ({ matchId: p.matchId, ok: false }));
    }
  };
  // Recently Applied "Undo All": one batch unassign.
  const handleQueueUnassignMany = async (matchIds: string[]) => {
    if (matchIds.length === 0) return;
    try {
      const results = await runLiveOps(
        matchIds.map((matchId) => ({
          op: { op: "unassign", matchId } as ElimLiveOp,
          eventPatch: { tableId: null, status: "scheduled", startedAt: null } as Partial<MatchLiveState>,
        })),
      );
      if (results.some((r) => !r.ok)) Alert.alert("Undo All", summarizeOpResults(results, "sent back"));
    } catch (e) {
      Alert.alert("Undo All", `Could not send matches back (${(e as Error).message}).`);
    }
  };

  // Start All (Dashboard): start ONLY matches already assigned to a table and waiting to start
  // (isStartable — the same condition an individual Start Match satisfies). Does NOT auto-assign.
  // ONE batch call; partial failures reported; notifications only for matches that started.
  const handleStartAll = () => {
    const startable = liveMatches.filter(isStartable);
    if (startable.length === 0) return;
    const run = async () => {
      setDashBusy(true);
      try {
        const results = await runLiveOps(
          startable.map((m) => ({
            op: { op: "start", matchId: m.id } as ElimLiveOp,
            eventPatch: { status: "in_progress", tableId: m.tableId } as Partial<MatchLiveState>,
          })),
        );
        results.forEach((r) => r.ok && notifyMatchPlayers(startable[r.i].id, startable[r.i].tableId ?? undefined));
        if (results.some((r) => !r.ok)) Alert.alert("Start All", summarizeOpResults(results, "started"));
      } catch (e) {
        Alert.alert("Start All", `Could not start matches (${(e as Error).message}).`);
      } finally {
        setDashBusy(false);
      }
    };
    if (startable.length > 1) {
      Alert.alert("Start assigned matches?", `Start ${startable.length} assigned matches?`, [
        { text: "Cancel", style: "cancel" },
        { text: "Start All", onPress: run },
      ]);
    } else {
      run();
    }
  };

  // Auto Assign (Dashboard): reuse the authoritative planner — order the ready (unassigned)
  // queue by the current mode and pair the front with free tables. Distinct from Start All.
  // The plan is unchanged; it is now applied as ONE batch call with per-op results.
  const handleDashAutoAssign = async () => {
    const readyAtMap = computeReadyAtMap(hub.bracket, hub.matchState);
    const entries = buildQueueEntries(liveMatches, readyAtMap, Date.now());
    const ordered = orderQueue(entries, hub.autoAssignMode as AutoAssignMode, hub.queueOrder ?? []);
    const plan = planAutoAssign(ordered, freeTables(hub.tables, tableOccupancy));
    if (plan.length === 0) {
      Alert.alert("Auto Assign", "No ready matches or free tables to assign.");
      return;
    }
    setDashBusy(true);
    try {
      const results = await runLiveOps(plan.map((p) => assignItem(p.matchId, p.tableId, false)));
      if (results.some((r) => !r.ok)) Alert.alert("Auto Assign", summarizeOpResults(results, "assigned"));
    } catch (e) {
      Alert.alert("Auto Assign", `Could not assign matches (${(e as Error).message}).`);
    } finally {
      setDashBusy(false);
    }
  };
  const handleSetAutoMode = (m: AutoAssignMode) =>
    hub
      .saveQueueSettings({ autoAssignMode: m })
      .catch((e: Error) => Alert.alert("Queue", `Could not change the mode (${e.message}).`));
  // A manual reorder takes the TD into Manual mode with the new order.
  const handleSetQueueOrder = (ids: string[]) =>
    hub
      .saveQueueSettings({ queueOrder: ids, autoAssignMode: "manual" })
      .catch((e: Error) => Alert.alert("Queue", `Could not save the new order (${e.message}).`));

  // Finish the event: marks it completed (live_state finished) which unlocks the
  // Results phase. Confirmed first since it stops live editing.
  const handleFinishTournament = () => {
    Alert.alert(
      "Finish Tournament",
      "Mark this tournament completed? This unlocks the Results phase and stops live editing.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Finish",
          style: "destructive",
          onPress: () => {
            hub
              .complete()
              .then(() => setActionsOpen(false))
              .catch(() =>
                Alert.alert("Error", "Failed to finish the tournament."),
              );
          },
        },
      ],
    );
  };
  // The table being edited in the table edit sheet (status / streaming / remove).
  const [editingTableId, setEditingTableId] = useState<number | null>(null);
  // "Add Tables" collapses once the tournament is live (you rarely add mid-event).
  const [addTablesOpen, setAddTablesOpen] = useState(true);
  const tablesAutoCollapsedRef = useRef(false);
  // ⚡ Tournament Actions modal (Live phase). Placeholder UI for now.
  const [actionsOpen, setActionsOpen] = useState(false);

  // Auto-collapse "Add Tables" once the tournament leaves Setup (re-expandable).
  useEffect(() => {
    const live = tournamentGroup !== "setup";
    if (live && !tablesAutoCollapsedRef.current) {
      tablesAutoCollapsedRef.current = true;
      setAddTablesOpen(false);
    }
    if (!live) tablesAutoCollapsedRef.current = false;
  }, [tournamentGroup]);

  const handleDrawBracket = (reason: string) => {
    if (readyPlayers.length < 2) {
      Alert.alert(
        "Not Enough Players",
        "You need at least 2 Ready players to draw the bracket.",
      );
      return;
    }
    const size = bracketSizeSel ?? recommendedBracketSize(readyPlayers.length);
    const format = hub.tournament?.tournament_format ?? "single-elimination";
    const doubleElim = format.toLowerCase().includes("double");
    const seeds = seedPlayers(readyPlayers, size);
    const round1 = round1FromSeeds(seeds, raceConfig);
    const graph = buildBracketGraph(size, doubleElim);
    const drawNumber = (hub.drawLog?.length ?? 0) + 1;
    const now = new Date().toISOString();
    const bracket: GeneratedBracket = {
      generatedAt: now,
      drawType: "random",
      format,
      drawNumber,
      players: readyPlayers.length,
      bracketSize: size,
      byes: Math.max(0, size - readyPlayers.length),
      round1,
      doubleElim,
      graph,
      seeds: seeds.map((p) =>
        p
          ? {
              registrationId: p.registrationId,
              name: p.name,
              fargo: p.fargo,
              raceOverride: p.raceOverride ?? null,
            }
          : null,
      ),
    };
    const logEntry: DrawLogEntry = {
      drawNumber,
      tdUserId: tdProfile?.id_auto ?? null,
      tdName: tdProfile?.name,
      timestamp: now,
      reason,
      players: readyPlayers.length,
      bracketSize: size,
      drawType: "random",
    };
    const wasRedraw = !!hub.bracket;
    hub
      .drawBracket({ bracket, logEntry })
      .then(() => {
        pendingRedrawReason.current = null;
        // Durable activity: record a redraw (a fresh draw over an existing bracket).
        if (wasRedraw && tournamentId && !isChipTournament) {
          tournamentEventService
            .log(
              tournamentId,
              "bracket_redrawn",
              { drawNumber: logEntry.drawNumber, reason },
              "",
              tdProfile?.id_auto ?? null,
            )
            .catch(() => {});
          refreshEvents();
        }
      })
      .catch(() => Alert.alert("Error", "Failed to draw the bracket."));
  };

  const handleDrawPress = () => {
    const reason = pendingRedrawReason.current ?? "Initial draw";
    // Prize pool must be completed before the bracket can be drawn.
    if (!prizeComplete) {
      Alert.alert(
        "Finish the Prize Pool",
        "Complete the prize pool payouts before drawing the bracket.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Go to Prize Pool",
            onPress: () => handleTabPress("prizepool"),
          },
        ],
      );
      return;
    }
    Alert.alert(
      "Generate Bracket",
      "This closes registration and locks the player field and prize pool. Continue?",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Generate Bracket", onPress: () => handleDrawBracket(reason) },
      ],
    );
  };

  // DEV-only: play the drawn bracket to ~50% (both sides) and start it, so a mock
  // tournament lands in a realistic mid-event state for testing Queue/Matches.
  const handleSimulateHalf = () => {
    if (!hub.bracket) return;
    Alert.alert(
      "Simulate ~50%",
      "Play this bracket to about halfway on both sides and start the tournament? (dev/testing)",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Simulate",
          onPress: () => {
            const ms = simulateBracket(hub.bracket!, raceConfig, 0.5, Date.now());
            hub
              .bulkSetMatchState({ matchState: ms, start: true })
              .catch(() => Alert.alert("Error", "Simulation failed."));
          },
        },
      ],
    );
  };

  const handleConfirmReopen = () => {
    if (!redrawReason.trim()) {
      Alert.alert("Reason Required", "Enter a reason to reopen and redraw.");
      return;
    }
    pendingRedrawReason.current = redrawReason.trim();
    setRedrawVisible(false);
    setActiveTab("bracket");
    hub
      .reopenRegistration()
      .catch(() => Alert.alert("Error", "Failed to reopen registration."));
  };

  // Confirm the reason-gated Settings unlock (chip, running). Requires a reason; writes
  // an audit row to chip_events with the acting director threaded as actor_id (id_auto),
  // then flips the local unlock flag so the Tournament Details form + Save footer become
  // editable. Never touches live_state or the chip Players roster (separate lock).
  const handleConfirmUnlock = () => {
    const reason = unlockReason;
    if (!reason) {
      Alert.alert("Reason Required", "Choose a reason to unlock settings.");
      return;
    }
    if (!form) return;
    const notes = unlockNotes.trim();
    const sessionId = `unl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    // Open the edit session: snapshot the current (clean) settings so Save & Lock can diff
    // exactly what changed, and remember the reason/notes/actor for the linked events.
    unlockSessionRef.current = {
      sessionId,
      reason,
      notes,
      actorName: tdFullName || "Tournament Director",
      baseline: toPatch(form),
    };
    chipService
      .logEvent(
        tournamentId,
        "settings_unlocked",
        `Settings unlocked for editing — reason: ${reason}`,
        {
          sessionId,
          reason,
          notes: notes || null,
          actorName: tdFullName || null,
          at: new Date().toISOString(),
        },
        tdProfile?.id_auto ?? null,
      )
      .catch(() => {});
    setUnlockVisible(false);
    setSettingsUnlocked(true);
  };

  // Save & Lock: persist the edited settings, log the change diff (old → new) linked to
  // the unlock session, then IMMEDIATELY relock. Does NOT touch live_state / registration
  // / the chip roster — only the settings form is saved. Relocks even if nothing changed.
  const handleSaveAndLock = async () => {
    if (!form) return;
    const session = unlockSessionRef.current;
    const prevForm = prevFormSnapshot();
    try {
      const after = toPatch(form);
      const { changes, summary } = session
        ? diffSettingsPatches(session.baseline, after)
        : { changes: {}, summary: "" };
      await hub.saveSettings(after);
      savedSnapshotRef.current = JSON.stringify(form);
      await propagateSidePotChanges(prevForm);
      const hasChanges = Object.keys(changes).length > 0;
      chipService
        .logEvent(
          tournamentId,
          "settings_updated_locked",
          hasChanges
            ? `Settings updated and relocked — ${summary}`
            : "Settings saved and relocked with no field changes",
          {
            sessionId: session?.sessionId ?? null,
            reason: session?.reason ?? null,
            notes: session?.notes || null,
            actorName: tdFullName || null,
            changes,
            at: new Date().toISOString(),
          },
          tdProfile?.id_auto ?? null,
        )
        .catch(() => {});
      unlockSessionRef.current = null;
      setSettingsUnlocked(false);
    } catch {
      Alert.alert("Error", "Failed to save settings. Please try again.");
    }
  };

  // Relock WITHOUT saving (leaving the settings context mid-session): discard in-progress
  // edits back to the last saved snapshot, log a "no changes saved" row linked to the
  // session, and clear it. An unlock session must never persist edits on the way out.
  const relockSettingsNoSave = () => {
    const session = unlockSessionRef.current;
    if (!session) return;
    unlockSessionRef.current = null;
    if (hub.tournament) {
      const seeded = toForm(hub.tournament);
      setForm(seeded);
      savedSnapshotRef.current = JSON.stringify(seeded);
    }
    setSettingsUnlocked(false);
    chipService
      .logEvent(
        tournamentId,
        "settings_relocked_no_save",
        "Settings relocked — no changes saved this session",
        {
          sessionId: session.sessionId,
          reason: session.reason,
          notes: session.notes || null,
          actorName: tdFullName || null,
          at: new Date().toISOString(),
        },
        tdProfile?.id_auto ?? null,
      )
      .catch(() => {});
  };

  // Leaving the Settings tab/screen with an unlock session open: discard + relock (a
  // confirm guards accidental loss when there are unsaved edits). Never saves on exit.
  const confirmLeaveUnlocked = (proceed: () => void) => {
    // Dirtiness measured against the session baseline (not the ref-derived settingsDirty)
    // so an unsaved edit prompts, but leaving a session with no edits relocks silently.
    const session = unlockSessionRef.current;
    const hasEdits =
      !!session && !!form && diffSettingsPatches(session.baseline, toPatch(form)).summary !== "";
    if (!hasEdits) {
      relockSettingsNoSave();
      proceed();
      return;
    }
    Alert.alert(
      "Discard unsaved changes?",
      "Your unlocked settings changes haven't been saved. Leaving will discard them and relock settings.",
      [
        { text: "Keep Editing", style: "cancel" },
        {
          text: "Discard & Relock",
          style: "destructive",
          onPress: () => {
            relockSettingsNoSave();
            proceed();
          },
        },
      ],
    );
  };

  // Safety net: if the screen unmounts (hardware back, route change) with an unlock
  // session still open — bypassing the tab/back guards — audit a "no changes saved"
  // relock. Fire-and-forget (the component is gone; no state update, edits are discarded
  // by unmount anyway since they were never saved).
  useEffect(() => {
    return () => {
      const session = unlockSessionRef.current;
      if (!session) return;
      unlockSessionRef.current = null;
      chipService
        .logEvent(
          tournamentId,
          "settings_relocked_no_save",
          "Settings relocked — no changes saved this session",
          {
            sessionId: session.sessionId,
            reason: session.reason,
            notes: session.notes || null,
            actorName: session.actorName || null,
            at: new Date().toISOString(),
          },
          tdProfile?.id_auto ?? null,
        )
        .catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Settings handlers --------------------------------------------------
  const patchForm = (patch: Partial<SettingsForm>) =>
    setForm((f) => (f ? { ...f, ...patch } : f));

  // Pick + upload a custom tournament image, then store it on the form.
  const handleUploadCustomImage = async () => {
    const value = await tournamentImage.pickAndUploadCustomImage();
    if (value) patchForm({ thumbnail: value });
  };

  const handleSave = async () => {
    if (!form) return;
    const prevForm = prevFormSnapshot();
    try {
      await hub.saveSettings(toPatch(form));
      savedSnapshotRef.current = JSON.stringify(form);
      await propagateSidePotChanges(prevForm);
      // Settings saved — offer to keep them as a reusable template.
      setTplSaveOpen(true);
    } catch {
      Alert.alert("Error", "Failed to save settings. Please try again.");
    }
  };

  // External tournaments: save + list, no live engine. Shown after the countdown.
  const submitExternalTournament = async () => {
    if (!form) return;
    try {
      await hub.saveSettings(toPatch(form));
      savedSnapshotRef.current = JSON.stringify(form);
      Alert.alert("Submitted", "Your tournament is now listed on Billiards.");
    } catch {
      Alert.alert("Error", "Failed to submit the tournament. Please try again.");
    }
  };
  // Tick the cancellable submit countdown; fire the submit at 0.
  useEffect(() => {
    if (submitCountdown === null) return;
    if (submitCountdown <= 0) {
      setSubmitCountdown(null);
      submitExternalTournament();
      return;
    }
    const t = setTimeout(
      () => setSubmitCountdown((n) => (n === null ? null : n - 1)),
      1000,
    );
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submitCountdown]);

  // Side pots
  const addSidePot = () =>
    patchForm({ sidePots: [...(form?.sidePots ?? []), { name: "", amount: "" }] });
  const updateSidePot = (i: number, key: keyof SidePotForm, v: string) =>
    patchForm({
      sidePots: (form?.sidePots ?? []).map((p, idx) =>
        idx === i ? { ...p, [key]: v } : p,
      ),
    });
  const removeSidePot = (i: number) =>
    patchForm({ sidePots: (form?.sidePots ?? []).filter((_, idx) => idx !== i) });

  // Fees Deducted From Entry (Settings). All fees — built-in and custom — share
  // one list and one row UI. The checkbox toggles `enabled`; only enabled fees
  // deduct from the pool. Built-ins can't be deleted/renamed; customs can.
  const toggleFeeEnabled = (id: string) =>
    patchForm({
      fees: (form?.fees ?? []).map((f) =>
        f.id === id ? { ...f, enabled: !f.enabled } : f,
      ),
    });
  const updateFee = (id: string, key: "name" | "amount", value: string) =>
    patchForm({
      fees: (form?.fees ?? []).map((f) =>
        f.id === id ? { ...f, [key]: value } : f,
      ),
    });
  const removeFee = (id: string) =>
    patchForm({ fees: (form?.fees ?? []).filter((f) => f.id !== id) });
  // Add a custom fee from the modal: appended already ENABLED so it immediately
  // applies to the fee/prize-pool calculation — no second step to check it.
  const addCustomFee = (name: string, amount: string) => {
    const id = `fee-custom-${tournamentId}-${Date.now()}`;
    patchForm({
      fees: [
        ...(form?.fees ?? []),
        { id, category: "custom", name: name.trim(), amount, enabled: true },
      ],
    });
  };

  // Race groups
  const addRaceGroup = () =>
    patchForm({
      raceGroups: [
        ...(form?.raceGroups ?? []),
        {
          id: `g${(form?.raceGroups?.length ?? 0) + 1}-${tournamentId}`,
          label: "",
          minFargo: "",
          maxFargo: "",
          raceTo: "",
        },
      ],
    });
  const updateRaceGroup = (i: number, key: keyof RaceGroupForm, v: string) =>
    patchForm({
      raceGroups: (form?.raceGroups ?? []).map((g, idx) =>
        idx === i ? { ...g, [key]: v } : g,
      ),
    });
  const removeRaceGroup = (i: number) =>
    patchForm({
      raceGroups: (form?.raceGroups ?? []).filter((_, idx) => idx !== i),
    });

  // ---- Chip Tournament tier table (under Fargo) --------------------------------
  const addChipTier = () =>
    patchForm({
      chipTiers: [
        ...(form?.chipTiers ?? []),
        { id: `ct-${Date.now()}-${(form?.chipTiers?.length ?? 0)}`, minFargo: "0", maxFargo: "", chips: "1" },
      ],
    });
  const updateChipTier = (id: string, key: keyof ChipTierForm, v: string) =>
    patchForm({
      chipTiers: (form?.chipTiers ?? []).map((t) => (t.id === id ? { ...t, [key]: v } : t)),
    });
  const removeChipTier = (id: string) =>
    patchForm({ chipTiers: (form?.chipTiers ?? []).filter((t) => t.id !== id) });
  const prefillChipDefaults = () =>
    patchForm({ chipTiers: defaultChipTiers(form?.gameType ?? "") });

  // ---- Players handlers ---------------------------------------------------
  const handleAddPlayer = async (profile: Profile) => {
    const existing = hub.registrations.find(
      (r) => r.player_id === profile.id_auto && r.status !== "cancelled",
    );
    if (existing) {
      Alert.alert(
        "Already Registered",
        `${profile.name || profile.user_name} is already in this tournament.`,
      );
      return;
    }
    setIsAdding(true);
    try {
      await hub.addPlayer({
        tournament_id: tournamentId,
        player_id: profile.id_auto,
        status: "approved",
      });
      // Keep the modal open so the TD can add several players in a row — the
      // just-added one flips to "Added" in the results as confirmation.
    } catch {
      Alert.alert("Error", "Failed to add player. Please try again.");
    } finally {
      setIsAdding(false);
    }
  };

  const handleAddGuest = async (guestName: string) => {
    setIsAdding(true);
    try {
      await hub.addPlayer({
        tournament_id: tournamentId,
        guest_name: guestName,
        status: "approved",
      });
      // Modal stays open (back at search) so several guests can be added in a row.
    } catch {
      Alert.alert("Error", "Failed to add guest. Please try again.");
    } finally {
      setIsAdding(false);
    }
  };

  const withProcessing = async (id: number, fn: () => Promise<unknown>, err: string) => {
    setProcessingId(id);
    try {
      await fn();
    } catch {
      Alert.alert("Error", err);
    } finally {
      setProcessingId(null);
    }
  };

  // Mark a player Ready (= confirmed + rated + paid -> eligible for the bracket).
  const handleReady = (
    r: Registration,
    fargo: number,
    isStarter: boolean,
    paidEntry: boolean,
    paidPots: string[],
    raceOverride: number | null,
    verified: boolean,
  ) =>
    withProcessing(
      r.id,
      () =>
        hub.updateRegistration({
          id: r.id,
          updates: {
            status: "checked_in",
            fargo_rating: fargo,
            is_starter_rating: isStarter,
            race_override: raceOverride,
            paid_entry: paidEntry,
            paid_side_pots: paidPots,
            // Persist the per-event Fargo verification as the snapshot (verified ⇔ snapshot
            // === rating). Ready is gated on `verified` upstream, so this is always the rating.
            fargo_at_registration: verified ? fargo : null,
            checked_in_at: new Date().toISOString(),
          },
        }),
      "Failed to mark the player ready.",
    );

  // Edit a player's rating/payment/verification. Reconciles status: if the player was Ready
  // (checked_in) but the edit leaves them not-Ready (e.g. Fargo changed → unverified, or
  // entry marked unpaid), demote to Registered (approved) so persisted state never claims
  // Ready with a stale/unverified Fargo.
  const handleSaveEdit = (
    r: Registration,
    fargo: number,
    isStarter: boolean,
    paidEntry: boolean,
    paidPots: string[],
    raceOverride: number | null,
    verified: boolean,
    stillReady: boolean,
  ) =>
    withProcessing(
      r.id,
      () =>
        hub.updateRegistration({
          id: r.id,
          updates: {
            fargo_rating: fargo,
            is_starter_rating: isStarter,
            race_override: raceOverride,
            paid_entry: paidEntry,
            paid_side_pots: paidPots,
            fargo_at_registration: verified ? fargo : null,
            ...(r.status === "checked_in" && !stillReady
              ? { status: "approved" as RegistrationStatus, checked_in_at: null }
              : {}),
          },
        }),
      "Failed to save changes.",
    );

  // Quick-toggle a single side pot on a Ready player (no full edit needed). Lets
  // a newly added side pot be applied to players with one tap.
  const handleTogglePaidPot = (r: Registration, name: string, paid: boolean) => {
    const current = safePaidSidePots(r.paid_side_pots);
    const next = paid
      ? [...new Set([...current, name])]
      : current.filter((n) => n !== name);
    return withProcessing(
      r.id,
      () => hub.updateRegistration({ id: r.id, updates: { paid_side_pots: next } }),
      "Failed to update side pots.",
    );
  };

  // Card/List inline Fargo verification (per-event snapshot). Requires a Fargo rating.
  const handleVerifyFargo = (r: Registration) => {
    if (r.fargo_rating == null) {
      Alert.alert("Add a Fargo first", "Enter a Fargo rating (Actions → Edit) before verifying.");
      return;
    }
    return withProcessing(
      r.id,
      () => hub.updateRegistration({ id: r.id, updates: { fargo_at_registration: r.fargo_rating } }),
      "Failed to verify Fargo.",
    );
  };
  // Un-verify (clears the snapshot). If the player was Ready, reconcile to Registered.
  const handleUnverifyFargo = (r: Registration) =>
    withProcessing(
      r.id,
      () =>
        hub.updateRegistration({
          id: r.id,
          updates: {
            fargo_at_registration: null,
            ...(r.status === "checked_in"
              ? { status: "approved" as RegistrationStatus, checked_in_at: null }
              : {}),
          },
        }),
      "Failed to update Fargo verification.",
    );

  // List-view quick toggle of the entry-fee-paid flag (immediate persist). Marking a Ready
  // player's entry UNPAID reconciles them back to Registered (payment gate fails), so status
  // never claims Ready with an unpaid entry.
  const handleTogglePaidEntry = (r: Registration, paid: boolean) =>
    withProcessing(
      r.id,
      () =>
        hub.updateRegistration({
          id: r.id,
          updates: {
            paid_entry: paid,
            ...(r.status === "checked_in" && !paid
              ? { status: "approved" as RegistrationStatus, checked_in_at: null }
              : {}),
          },
        }),
      "Failed to update entry payment.",
    );

  const handleNoShow = (r: Registration) =>
    withProcessing(r.id, () => hub.markNoShow(r.id), "Failed to mark no-show.");

  const handleRemove = (r: Registration) =>
    Alert.alert("Remove Player", `Remove ${getDisplayName(r, pendingNames)} from this tournament?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: () =>
          withProcessing(
            r.id,
            () => hub.updateRegistration({ id: r.id, updates: { status: "cancelled" } }),
            "Failed to remove player.",
          ),
      },
    ]);

  const handleUndoReady = (r: Registration) =>
    withProcessing(
      r.id,
      () => hub.updateRegistration({ id: r.id, updates: { status: "preregistered" } }),
      "Failed to undo.",
    );

  const handleRestore = (r: Registration) =>
    withProcessing(
      r.id,
      () => hub.updateRegistration({ id: r.id, updates: { status: "preregistered" } }),
      "Failed to restore.",
    );

  // ---- Derived player lists ----------------------------------------------
  // Profile ids already registered (non-cancelled) — used to mark search
  // results "Added" in the Add Player modal so the TD knows the add stuck.
  const addedPlayerIds = useMemo(
    () =>
      new Set(
        hub.registrations
          .filter((r) => r.status !== "cancelled" && r.player_id != null)
          .map((r) => r.player_id as number),
      ),
    [hub.registrations],
  );

  const statusCounts = useMemo(() => {
    const c: Record<DisplayStatus, number> = {
      prereg: 0,
      registered: 0,
      ready: 0,
      no_show: 0,
      removed: 0,
    };
    hub.registrations.forEach((r) => {
      c[displayStatusOf(r.status)] += 1;
    });
    return c;
  }, [hub.registrations]);

  const filteredRegs = useMemo(() => {
    const q = playerSearch.trim().toLowerCase();
    return hub.registrations
      .filter((r) => {
        const d = displayStatusOf(r.status);
        if (statusFilter === "all") {
          if (d === "removed") return false; // hide removed in the default view
        } else if (statusFilter !== d) {
          return false;
        }
        if (q && !getDisplayName(r, pendingNames).toLowerCase().includes(q)) return false;
        return true;
      })
      .sort((a, b) => {
        const ra = STATUS_RANK[displayStatusOf(a.status)];
        const rb = STATUS_RANK[displayStatusOf(b.status)];
        if (ra !== rb) return ra - rb;
        return getDisplayName(a, pendingNames).localeCompare(getDisplayName(b, pendingNames));
      });
  }, [hub.registrations, playerSearch, statusFilter]);

  // Players roster pagination (shared by the top + bottom controls) + Card/List view.
  // Paginate AFTER filtering/sorting so pages reflect the current result set.
  const [playersView, setPlayersView] = useState<"cards" | "list">("cards");
  // List View: which row is expanded into the full editor (Actions → Edit). Card view
  // is unaffected. Cleared on save/ready/cancel/remove so it collapses back to the row.
  const [editingListId, setEditingListId] = useState<number | null>(null);
  // Web Actions popover: which row's menu is open + the button it's anchored to.
  const [actionsMenu, setActionsMenu] = useState<{ anchor: React.RefObject<any>; item: Registration } | null>(null);
  const playersPagination = usePagination(filteredRegs, { itemsPerPage: 20 });
  const resetPlayersPage = playersPagination.resetPage;
  useEffect(() => {
    resetPlayersPage();
  }, [playerSearch, statusFilter, resetPlayersPage]);

  // ---- Tab renderers ------------------------------------------------------
  // Contact name picker: the director's profile name or a custom one. Shared by
  // the Compete (Venue) and external (My Venues) forms.
  const renderContactName = () => {
    if (!form) return null;
    return (
      <>
        <View style={styles.field}>
          <FieldLabel label="Contact Name" />
          <Dropdown
            placeholder="Select contact name"
            options={[
              { label: tdFullName || "My name", value: "profile" },
              { label: "Custom / Other", value: "custom" },
            ]}
            value={contactMode}
            onSelect={(v) => {
              setContactMode(v as "profile" | "custom");
              patchForm({ contactName: v === "profile" ? tdFullName : "" });
            }}
          />
        </View>
        {contactMode === "custom" && (
          <LabeledInput
            label="Custom Contact Name"
            value={form.contactName}
            onChangeText={(v) => patchForm({ contactName: v })}
            placeholder="Enter contact name"
          />
        )}
      </>
    );
  };

  // Shared race configuration (Fixed / A-B-C Groups / Fargo Differential) so the
  // external "Other Software" form uses the identical UI as the Compete form.
  const renderRaceSection = () => {
    if (!form) return null;
    // Chip tournaments use a single short race (usually race to 1) — no race
    // modes, no losers/finals races.
    if (isChip) {
      return (
        <Section title={"Race" + reqStar("raceMode")}>
          <Stepper
            prefix="Race to"
            value={form.raceWinners || 1}
            onChange={(v) => patchForm({ raceWinners: v })}
            min={1}
            max={15}
          />
          <Text allowFontScaling={false} style={styles.hint}>
            Each chip match is short — race to 1 means a single game decides the
            match. Raise it for longer chip matches.
          </Text>
        </Section>
      );
    }
    return (
        <Section title={"Race" + reqStar("raceMode")}>
          <View style={styles.field} ref={(n) => registerFieldAnchor("raceMode", n)}>
            <Dropdown
              error={errFor("raceMode")}
              placeholder="Select Race Type"
              options={RACE_MODE_OPTIONS}
              value={form.raceMode}
              onSelect={(v) => patchForm({ raceMode: v as RaceMode })}
            />
          </View>

          {form.raceMode === "fixed" && (
            <View>
              <Stepper
                prefix={
                  formatHasLosersSide(form.tournamentFormat)
                    ? "Winners race to"
                    : "Race to"
                }
                value={form.raceWinners}
                onChange={(v) => patchForm({ raceWinners: v })}
                min={0}
                max={50}
              />
              {formatHasLosersSide(form.tournamentFormat) && (
                <Stepper
                  prefix="Losers race to"
                  value={form.raceLosers}
                  onChange={(v) => patchForm({ raceLosers: v })}
                  min={0}
                  max={50}
                />
              )}
              <Stepper
                prefix="Finals race to"
                value={form.raceFinals}
                onChange={(v) => patchForm({ raceFinals: v })}
                min={0}
                max={50}
              />
            </View>
          )}

          {form.raceMode === "differential" && (
            <View>
              <Text allowFontScaling={false} style={styles.hint}>
                Races are calculated automatically from each pair&apos;s Fargo
                gap. The lower-rated player races to the minimum; the higher gets
                one extra game per the point difference (rounded down).
              </Text>
              <Stepper
                prefix="Min race to"
                value={form.diffMinRace}
                onChange={(v) => patchForm({ diffMinRace: v })}
                min={0}
                max={50}
              />
              <Stepper
                prefix="Point difference"
                value={form.diffPerGame}
                onChange={(v) => patchForm({ diffPerGame: v })}
                min={1}
                max={300}
                step={1}
              />
              <ToggleSwitch
                label="Limit maximum race"
                value={form.diffMaxEnabled}
                onValueChange={(v) => patchForm({ diffMaxEnabled: v })}
              />
              {form.diffMaxEnabled && (
                <Stepper
                  prefix="Max race to"
                  value={form.diffMaxRace}
                  onChange={(v) => patchForm({ diffMaxRace: v })}
                  min={1}
                  max={50}
                />
              )}
              {(() => {
                const per = Math.max(1, form.diffPerGame);
                const higher = 500 + per;
                const capped = form.diffMaxEnabled
                  ? Math.min(form.diffMaxRace, form.diffMinRace + 1)
                  : form.diffMinRace + 1;
                return (
                  <View style={styles.exampleBox}>
                    <Text allowFontScaling={false} style={styles.exampleTitle}>
                      Example
                    </Text>
                    <Text allowFontScaling={false} style={styles.exampleText}>
                      A player rated 500 races to {form.diffMinRace}.
                    </Text>
                    <Text allowFontScaling={false} style={styles.exampleText}>
                      A player rated {higher} (a {per}-point gap = 1 game) races
                      to {capped}.
                    </Text>
                  </View>
                );
              })()}
            </View>
          )}

          {form.raceMode === "groups" && (() => {
            const gv = formRaceGroupValidation(form);
            const invalid = (i: number) => gv.invalidIndices.includes(i);
            return (
            <View>
              <Text allowFontScaling={false} style={styles.hint}>
                Group labels are custom — use A/B/C, APA skill levels, SL7, Advanced,
                or any label that fits your tournament.
              </Text>
              <Text allowFontScaling={false} style={styles.hint}>
                Leave Min blank for 0; leave Max blank for no upper limit.
              </Text>
              {form.raceGroups.length > 0 && (
                <View style={styles.groupHeaderRow}>
                  <Text allowFontScaling={false} style={[styles.groupHeaderText, styles.groupLabel]}>Group Label</Text>
                  <Text allowFontScaling={false} style={[styles.groupHeaderText, styles.groupNum]}>Min Fargo</Text>
                  <Text allowFontScaling={false} style={[styles.groupHeaderText, styles.groupNum]}>Max Fargo</Text>
                  <Text allowFontScaling={false} style={[styles.groupHeaderText, styles.groupNum]}>Race To</Text>
                  <View style={styles.groupHeaderSpacer} />
                </View>
              )}
              {form.raceGroups.map((g, i) => (
                <View key={g.id} style={styles.groupRow}>
                  <TextInput
                    allowFontScaling={false}
                    style={[styles.input, styles.groupLabel]}
                    value={g.label}
                    onChangeText={(v) => updateRaceGroup(i, "label", v)}
                    placeholder="A, APA 5, SL7..."
                    placeholderTextColor={COLORS.textMuted}
                  />
                  <TextInput
                    allowFontScaling={false}
                    style={[styles.input, styles.groupNum, invalid(i) && styles.groupInputError]}
                    value={g.minFargo}
                    onChangeText={(v) => updateRaceGroup(i, "minFargo", v)}
                    placeholder="Min"
                    placeholderTextColor={COLORS.textMuted}
                    keyboardType="numeric"
                  />
                  <TextInput
                    allowFontScaling={false}
                    style={[styles.input, styles.groupNum, invalid(i) && styles.groupInputError]}
                    value={g.maxFargo}
                    onChangeText={(v) => updateRaceGroup(i, "maxFargo", v)}
                    placeholder="Max"
                    placeholderTextColor={COLORS.textMuted}
                    keyboardType="numeric"
                  />
                  <TextInput
                    allowFontScaling={false}
                    style={[styles.input, styles.groupNum, invalid(i) && styles.groupInputError]}
                    value={g.raceTo}
                    onChangeText={(v) => updateRaceGroup(i, "raceTo", v)}
                    placeholder="Race to"
                    placeholderTextColor={COLORS.textMuted}
                    keyboardType="numeric"
                  />
                  <TouchableOpacity
                    style={styles.groupRemove}
                    onPress={() => removeRaceGroup(i)}
                  >
                    <Text allowFontScaling={false} style={styles.groupRemoveText}>
                      {"✕"}
                    </Text>
                  </TouchableOpacity>
                </View>
              ))}
              <TouchableOpacity style={styles.addRowBtn} onPress={addRaceGroup}>
                <Text allowFontScaling={false} style={styles.addRowBtnText}>
                  + Add Group
                </Text>
              </TouchableOpacity>
              {!gv.ok && (
                <View style={styles.groupErrorBox}>
                  {gv.errors.map((e, idx) => (
                    <Text key={idx} allowFontScaling={false} style={styles.groupErrorText}>{e}</Text>
                  ))}
                </View>
              )}
              {form.raceGroups.length > 0 && (
                <View style={styles.exampleBox}>
                  <Text allowFontScaling={false} style={styles.exampleTitle}>
                    Group Settings
                  </Text>
                  {form.raceGroups.map((g, i) => {
                    const mn = g.minFargo.trim() || "0";
                    const mx = g.maxFargo.trim();
                    const range = mx === "" ? `${mn}+` : `${mn}–${mx}`;
                    return (
                      <Text key={g.id} allowFontScaling={false} style={styles.exampleText}>
                        Group {g.label || String.fromCharCode(65 + i)}: {range} · Race to {g.raceTo.trim() || "?"}
                      </Text>
                    );
                  })}
                  <Text allowFontScaling={false} style={styles.exampleText}>
                    A blank minimum counts as 0; a blank maximum has no upper
                    limit.
                  </Text>
                </View>
              )}
            </View>
            );
          })()}
        </Section>
    );
  };

  // Compact dashboard pieces shared by both forms. renderMoneyRow = Entry Fee /
  // Added Money on one row; renderSidePots = a tidy list with inline edit/delete
  // and a right-aligned "+ Add Side Pot". The external form uses both back-to-back;
  // the Compete form slots its fees/Calcutta block between them.
  const renderMoneyRow = () => {
    if (!form) return null;
    return (
      <View style={styles.entryRow}>
        <FieldAnchor anchorKey="entryFee" error={errFor("entryFee")} register={registerFieldAnchor} style={styles.entryCol}>
          <FieldLabel label={"Entry Fee" + reqStar("entryFee")} />
          <MoneyInput
            value={form.entryFee}
            onChange={(v) => patchForm({ entryFee: v })}
          />
        </FieldAnchor>
        <View style={styles.entryCol}>
          <FieldLabel label="Added Money" />
          <MoneyInput
            value={form.addedMoney}
            onChange={(v) => patchForm({ addedMoney: v })}
          />
        </View>
      </View>
    );
  };

  const renderSidePots = () => {
    if (!form) return null;
    return (
      <>
        <View style={styles.sidePotHeader}>
          <FieldLabel label="Side Pots" />
          <TouchableOpacity
            style={styles.addRowBtnSm}
            onPress={() => {
              const newIdx = form.sidePots.length;
              addSidePot();
              setEditingSidePot(newIdx);
            }}
          >
            <Text allowFontScaling={false} style={styles.addRowBtnText}>
              + Add Side Pot
            </Text>
          </TouchableOpacity>
        </View>

        {form.sidePots.map((pot, i) =>
          editingSidePot === i ? (
            <View key={i} style={styles.sidePotEditRow}>
              <TextInput
                allowFontScaling={false}
                style={[
                  styles.sidePotEditName,
                  Platform.OS === "web" ? (INPUT_NO_OUTLINE as object) : null,
                ]}
                value={pot.name}
                onChangeText={(v) => updateSidePot(i, "name", v)}
                placeholder="Pot name"
                placeholderTextColor={COLORS.textMuted}
              />
              <MoneyInput
                value={pot.amount}
                onChange={(v) => updateSidePot(i, "amount", v)}
              />
              <TouchableOpacity
                style={styles.sidePotDoneBtn}
                onPress={() => setEditingSidePot(null)}
              >
                <Text allowFontScaling={false} style={styles.sidePotDoneText}>
                  Done
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View key={i} style={styles.sidePotListItem}>
              <View style={styles.sidePotListInfo}>
                <Text allowFontScaling={false} style={styles.sidePotListName} numberOfLines={1}>
                  {pot.name.trim() || "Untitled pot"}
                </Text>
                <Text allowFontScaling={false} style={styles.sidePotListAmt} numberOfLines={1}>
                  {pot.amount ? `$${pot.amount}` : "No amount set"}
                </Text>
              </View>
              <View style={styles.sidePotListActions}>
                <TouchableOpacity onPress={() => setEditingSidePot(i)} hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}>
                  <Text allowFontScaling={false} style={styles.sidePotLink}>
                    Edit
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => removeSidePot(i)} hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}>
                  <Text allowFontScaling={false} style={styles.sidePotLinkDanger}>
                    Delete
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          ),
        )}
      </>
    );
  };

  // External form: money row directly above the side-pots list.
  const renderEntryFields = () => (
    <>
      {renderMoneyRow()}
      {renderSidePots()}
    </>
  );

  const renderSettings = () => {
    if (!form) {
      return (
        <View style={styles.centerBlock}>
          <ActivityIndicator color={COLORS.primary} />
        </View>
      );
    }

    // External (other-software) tournaments: a basic listing form — no live-engine
    // fields. Just the details, the external bracket link, schedule, entry, venue.
    if (isExternal) {
      return (
        <View>
          <Section title="Tournament Details">
            <LabeledInput
              label="Name *"
              value={form.name}
              onChangeText={(v) => patchForm({ name: v })}
              placeholder="Tournament name"
            />
            <View style={styles.field}>
              <FieldLabel label="Game Type *" />
              <Dropdown
                placeholder="Select game type"
                options={GAME_TYPES}
                value={form.gameType}
                onSelect={(v) => patchForm({ gameType: v })}
              />
            </View>
            <View style={styles.field}>
              <FieldLabel label="Tournament Format *" />
              <Dropdown
                placeholder="Select format"
                options={TOURNAMENT_FORMATS}
                value={form.tournamentFormat}
                onSelect={(v) => patchForm({ tournamentFormat: v })}
              />
            </View>
            <LabeledInput
              label="Description"
              value={form.description}
              onChangeText={(v) => patchForm({ description: v })}
              placeholder="Describe the tournament..."
              multiline
              noCheck
            />
          </Section>

          {renderRaceSection()}

          <Section title="Schedule">
            <View style={styles.field}>
              <FieldLabel label="Date *" />
              <DatePicker
                value={form.tournamentDate}
                onChange={(v) => patchForm({ tournamentDate: v })}
                placeholder="Select date"
              />
            </View>
            <View style={styles.field}>
              <FieldLabel label="Start Time *" />
              <Dropdown
                placeholder="Select start time"
                options={START_TIMES}
                value={form.startTime}
                onSelect={(v) => patchForm({ startTime: v })}
              />
            </View>
            {scheduleNeedsAttention && (
              <Text allowFontScaling={false} style={styles.scheduleStaleWarn}>
                ⚠ {SCHEDULE_STALE_MESSAGE}
              </Text>
            )}
            <ToggleSwitch
              label="Recurring Tournament"
              value={form.isRecurring}
              onValueChange={(v) => patchForm({ isRecurring: v })}
            />
            {form.isRecurring && (
              <View style={styles.field}>
                <FieldLabel label="Recurring Frequency *" />
                <Dropdown
                  placeholder="How often does it repeat?"
                  options={RECURRENCE_TYPES}
                  value={form.recurrenceType}
                  onSelect={(v) => patchForm({ recurrenceType: v })}
                />
              </View>
            )}
          </Section>

          <Section title="Entry & Payouts">{renderEntryFields()}</Section>

          <Section title="My Venues">
            <View style={styles.field}>
              <FieldLabel label="Venue *" />
              <Dropdown
                placeholder="Select a venue"
                options={myVenueOptions}
                value={form.venueId != null ? String(form.venueId) : ""}
                onSelect={(v) =>
                  patchForm({ venueId: v ? Number(v) : null, tableSize: "" })
                }
              />
            </View>
            <View style={styles.field}>
              <FieldLabel label="Table Size" />
              <Dropdown
                placeholder={
                  selectedVenueId
                    ? venueTableSizes.length
                      ? "Select table size"
                      : "No table sizes set for this venue"
                    : "Pick a venue first"
                }
                options={venueTableSizes}
                value={form.tableSize}
                onSelect={(v) => patchForm({ tableSize: v })}
              />
            </View>
            {renderContactName()}
          </Section>

          <Section title="External Bracket">
            <LabeledInput
              label="Bracket Link"
              value={form.externalBracketUrl}
              onChangeText={(v) => patchForm({ externalBracketUrl: v })}
              placeholder="https://..."
            />
            <Text allowFontScaling={false} style={styles.hint}>
              Players tap &quot;View Bracket&quot; on the tournament to open this link.
            </Text>
            <Text allowFontScaling={false} style={styles.hintAmber}>
              Tip: link your bracket-software profile/page rather than a single
              bracket — that way it always shows your latest event, and you
              don&apos;t have to wait for a per-tournament link to generate.
            </Text>
          </Section>
        </View>
      );
    }

    const venue = hub.tournament?.venues;
    // Max Fargo and Open Tournament are mutually exclusive — each greys the other.
    const maxFargoDisabled = form.openTournament;
    const openTournamentDisabled = !!form.maxFargo.trim();

    // Live entry-fee breakdown. Only CHECKED fees count. Included mode subtracts
    // them from the entry; on-top mode collects them in addition to the entry.
    const feeEntryNum = parseFloat(form.entryFee) || 0;
    const enabledFees = (form.fees ?? []).filter((f) => f.enabled);
    const feeSum = enabledFees.reduce(
      (s, f) => s + (parseFloat(f.amount) || 0),
      0,
    );
    const feesOnTop = form.feesOnTop;
    const feePerPlayerToPool = feesOnTop ? feeEntryNum : feeEntryNum - feeSum;
    const feeCollectedPerPlayer = feesOnTop ? feeEntryNum + feeSum : feeEntryNum;
    const feeOver = !feesOnTop && feeSum > feeEntryNum + 0.001;
    const fmtMoney = (n: number) =>
      n % 1 === 0 ? `$${n}` : `$${n.toFixed(2)}`;

    return (
      <View>
        {!settingsLocked && (
          <SettingsTemplates
            templates={settingsTemplates.templates}
            count={settingsTemplates.count}
            atLimit={settingsTemplates.atLimit}
            saving={settingsTemplates.saving}
            onApply={applyTemplate}
            onSave={(nm) => settingsTemplates.save(nm, templatableSettings(form))}
            onRename={settingsTemplates.rename}
            onDelete={settingsTemplates.remove}
            saveOpen={tplSaveOpen}
            onSaveOpenChange={setTplSaveOpen}
            currentSettings={templatableSettings(form)}
            summarize={summarizeTemplate}
          />
        )}
        {settingsLocked && (
          <View style={styles.settingsLockBanner}>
            <Text allowFontScaling={false} style={styles.settingsLockTitle}>
              {GLYPH.lock} Settings locked
            </Text>
            <Text allowFontScaling={false} style={styles.settingsLockBody}>
              {isChipTournament && hub.phase === "running"
                ? "This tournament is already running, so settings are locked to protect the live tournament. You can unlock them with a reason to make a correction — this does not change the live roster or queue."
                : "The bracket has been drawn, so settings are locked to keep it in sync. To make changes, undo the draw — this reopens registration and you'll re-draw the bracket afterward."}
            </Text>
            {hub.phase === "bracket_drawn" && (
              <TouchableOpacity
                style={styles.settingsLockBtn}
                onPress={handleUndoDraw}
                disabled={hub.isMutatingLive}
              >
                <Text allowFontScaling={false} style={styles.settingsLockBtnText}>
                  Undo Draw &amp; Edit
                </Text>
              </TouchableOpacity>
            )}
            {isChipTournament && hub.phase === "running" && (
              <TouchableOpacity
                style={styles.settingsLockBtn}
                onPress={() => {
                  setUnlockReason(null);
                  setUnlockNotes("");
                  setUnlockVisible(true);
                }}
              >
                <Text allowFontScaling={false} style={styles.settingsLockBtnText}>
                  Unlock Settings
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}
        <View
          pointerEvents={settingsLocked ? "none" : "auto"}
          style={settingsLocked ? styles.lockedDim : undefined}
        >
        <Section title="Tournament Details">
          <LabeledInput
            label={"Name" + reqStar("name")}
            value={form.name}
            onChangeText={(v) => patchForm({ name: v })}
            placeholder="Tournament name"
            error={errFor("name")}
            containerRef={(n) => registerFieldAnchor("name", n)}
          />
          <View style={styles.field} ref={(n) => registerFieldAnchor("gameType", n)}>
            <FieldLabel label={"Game Type" + reqStar("gameType")} />
            <Dropdown
              error={errFor("gameType")}
              placeholder="Select game type"
              options={GAME_TYPES}
              value={form.gameType}
              onSelect={(v) =>
                patchForm({
                  gameType: v,
                  // For chip tournaments, swap the default chip table to match the
                  // game type (singles vs scotch doubles) unless the TD customized it.
                  ...(isChip && chipTiersAreDefault(form.chipTiers)
                    ? { chipTiers: defaultChipTiers(v) }
                    : {}),
                  // Keep the auto-selected image in sync with the game type, but
                  // never clobber a custom upload or a deliberate image pick — only
                  // swap while the TD is still on the auto default.
                  ...(!form.thumbnail.startsWith("custom:") &&
                  (!form.thumbnail ||
                    form.thumbnail === defaultThumbnailIdForGameType(form.gameType))
                    ? {
                        thumbnail:
                          defaultThumbnailIdForGameType(v) ?? form.thumbnail,
                      }
                    : {}),
                })
              }
            />
          </View>
          <View style={styles.field} ref={(n) => registerFieldAnchor("format", n)}>
            <FieldLabel label={"Format" + reqStar("format")} />
            <Dropdown
              error={errFor("format")}
              placeholder="Select format"
              options={TOURNAMENT_FORMATS}
              value={form.tournamentFormat}
              onSelect={(v) =>
                patchForm({
                  tournamentFormat: v,
                  // Chip matches default to a single short race.
                  ...(v === "chip-tournament" ? { raceWinners: 1 } : {}),
                  // Populate the Fargo chip table with defaults the moment the TD
                  // switches INTO chip format (so tiers are visible immediately),
                  // unless they've already customized the table.
                  ...(v === "chip-tournament" && chipTiersAreDefault(form.chipTiers)
                    ? { chipTiers: defaultChipTiers(form.gameType) }
                    : {}),
                })
              }
            />
          </View>
          {!isChip && (
            <LabeledInput
              label="Game Spot"
              value={form.gameSpot}
              onChangeText={(v) => patchForm({ gameSpot: v })}
              placeholder="e.g., The Ball"
            />
          )}
          <LabeledInput
            label="Description"
            value={form.description}
            onChangeText={(v) => patchForm({ description: v })}
            placeholder="Describe the tournament..."
            multiline
            noCheck
          />
        </Section>

        <Section title={"Fargo" + reqStar("fargo")}>
          <LabeledInput
            label={"Maximum Fargo" + reqStar("fargo")}
            error={errFor("fargo")}
            containerRef={(n) => registerFieldAnchor("fargo", n)}
            value={form.maxFargo}
            onChangeText={(v) =>
              patchForm({ maxFargo: v.replace(/[^0-9]/g, "") })
            }
            placeholder={
              maxFargoDisabled
                ? "Disabled (Open Tournament is on)"
                : "e.g., 550 (blank = open)"
            }
            keyboardType="numeric"
            maxLength={3}
            disabled={maxFargoDisabled}
            hint={
              maxFargoDisabled
                ? "Turn off Open Tournament to set a maximum Fargo."
                : undefined
            }
          />
          <ToggleSwitch
            label="Reports to Fargo"
            value={form.reportsToFargo}
            onValueChange={(v) => patchForm({ reportsToFargo: v })}
          />
          <ToggleSwitch
            label="Open Tournament"
            value={form.openTournament}
            onValueChange={(v) => patchForm({ openTournament: v })}
            disabled={openTournamentDisabled}
          />
          {openTournamentDisabled && (
            <Text allowFontScaling={false} style={styles.hint}>
              Clear the maximum Fargo to allow an open tournament.
            </Text>
          )}
        </Section>

        {isChip && (
          <Section title="Fargo Chip Table">
            <View style={styles.chipTableActions}>
              <TouchableOpacity style={styles.addRowBtnSm} onPress={prefillChipDefaults}>
                <Text allowFontScaling={false} style={styles.addRowBtnText}>Use defaults</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.addRowBtnSm} onPress={addChipTier}>
                <Text allowFontScaling={false} style={styles.addRowBtnText}>+ Add Tier</Text>
              </TouchableOpacity>
            </View>
            <Text allowFontScaling={false} style={styles.hint}>
              {form.gameType.includes("scotch-doubles")
                ? "Combined team Fargo (P1 + P2) → starting chips. Leave Max blank for the top tier."
                : "Player Fargo → starting chips. Leave Max blank for the top tier."}
            </Text>
            <View style={styles.chipTierHead}>
              <Text allowFontScaling={false} style={[styles.chipTierHeadText, styles.chipCol]}>Min</Text>
              <Text allowFontScaling={false} style={[styles.chipTierHeadText, styles.chipCol]}>Max</Text>
              <Text allowFontScaling={false} style={[styles.chipTierHeadText, styles.chipCol]}>Chips</Text>
              <View style={styles.chipColDel} />
            </View>
            {form.chipTiers.map((t) => (
              <View key={t.id} style={styles.chipTierRow}>
                <TextInput
                  allowFontScaling={false}
                  style={[styles.chipTierInput, styles.chipCol]}
                  value={t.minFargo}
                  onChangeText={(v) => updateChipTier(t.id, "minFargo", v.replace(/[^0-9]/g, ""))}
                  keyboardType="numeric"
                  placeholder="0"
                  placeholderTextColor={COLORS.textMuted}
                />
                <TextInput
                  allowFontScaling={false}
                  style={[styles.chipTierInput, styles.chipCol]}
                  value={t.maxFargo}
                  onChangeText={(v) => updateChipTier(t.id, "maxFargo", v.replace(/[^0-9]/g, ""))}
                  keyboardType="numeric"
                  placeholder="∞"
                  placeholderTextColor={COLORS.textMuted}
                />
                <TextInput
                  allowFontScaling={false}
                  style={[styles.chipTierInput, styles.chipCol]}
                  value={t.chips}
                  onChangeText={(v) => updateChipTier(t.id, "chips", v.replace(/[^0-9]/g, ""))}
                  keyboardType="numeric"
                  placeholder="1"
                  placeholderTextColor={COLORS.textMuted}
                />
                <TouchableOpacity style={styles.chipColDel} onPress={() => removeChipTier(t.id)}>
                  <Text allowFontScaling={false} style={styles.groupRemoveText}>{"✕"}</Text>
                </TouchableOpacity>
              </View>
            ))}
            <ToggleSwitch
              label="Allow Buy-Backs"
              value={form.chipBuyBacks}
              onValueChange={(v) => patchForm({ chipBuyBacks: v })}
            />
            <Text allowFontScaling={false} style={styles.hint}>
              Eliminated players can buy back into the queue.
            </Text>
          </Section>
        )}

        {renderRaceSection()}

        <Section title="Entry & Payouts">
          {renderMoneyRow()}

          <ToggleSwitch
            label="Calcutta"
            value={form.calcutta}
            onValueChange={(v) => patchForm({ calcutta: v })}
          />

          {/* Fees — built-in + custom, one uniform list */}
          <View style={styles.feeBlock}>
            <FieldLabel label="Fees (per player)" />

            {/* How fees relate to the entry fee */}
            <View style={styles.feeModeRow}>
              <TouchableOpacity
                style={[
                  styles.feeModePill,
                  !form.feesOnTop && styles.feeModePillOn,
                ]}
                onPress={() => patchForm({ feesOnTop: false })}
              >
                <Text
                  allowFontScaling={false}
                  style={[
                    styles.feeModeText,
                    !form.feesOnTop && styles.feeModeTextOn,
                  ]}
                >
                  Included in entry
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.feeModePill,
                  form.feesOnTop && styles.feeModePillOn,
                ]}
                onPress={() => patchForm({ feesOnTop: true })}
              >
                <Text
                  allowFontScaling={false}
                  style={[
                    styles.feeModeText,
                    form.feesOnTop && styles.feeModeTextOn,
                  ]}
                >
                  Added on top
                </Text>
              </TouchableOpacity>
            </View>

            {(form.fees ?? []).map((fee) =>
              feesEditMode ? (
                /* EDIT mode: every fee — built-in or custom — is fully editable
                   (rename, change amount, delete). No separate model per category. */
                <View key={fee.id} style={styles.feeRow}>
                  <TextInput
                    allowFontScaling={false}
                    style={[styles.input, styles.feeNameInput]}
                    value={fee.name}
                    onChangeText={(v) => updateFee(fee.id, "name", v)}
                    placeholder="Fee name"
                    placeholderTextColor={COLORS.textMuted}
                  />
                  <MoneyInput
                    value={fee.amount}
                    onChange={(v) => updateFee(fee.id, "amount", v)}
                    compact
                  />
                  <TouchableOpacity
                    style={styles.feeTrash}
                    onPress={() => removeFee(fee.id)}
                  >
                    <Text allowFontScaling={false} style={styles.feeTrashText}>
                      {"🗑"}
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : (
                /* NORMAL mode: quick config — enable/disable + see the amount.
                   No rename, no delete. */
                <TouchableOpacity
                  key={fee.id}
                  style={styles.feeRow}
                  activeOpacity={0.7}
                  onPress={() => toggleFeeEnabled(fee.id)}
                >
                  <View style={styles.feeBox2}>
                    <View style={[styles.feeBox, fee.enabled && styles.feeBoxOn]}>
                      {fee.enabled && (
                        <Text allowFontScaling={false} style={styles.feeBoxCheck}>
                          {"✓"}
                        </Text>
                      )}
                    </View>
                  </View>

                  <View style={styles.feeNameStaticWrap}>
                    <Text allowFontScaling={false} style={styles.feeLabel}>
                      {fee.name}
                    </Text>
                  </View>

                  <Text
                    allowFontScaling={false}
                    style={[
                      styles.feeAmountStatic,
                      !fee.enabled && styles.feeAmountStaticOff,
                    ]}
                  >
                    {fmtMoney(parseFloat(fee.amount) || 0)}
                  </Text>
                </TouchableOpacity>
              ),
            )}

            {(form.fees ?? []).length === 0 && (
              <Text allowFontScaling={false} style={styles.feeEmptyText}>
                No fees configured.
              </Text>
            )}

            {/* Action row: Add Fee is always available; Edit Fees appears only
                when there is at least one fee to edit (or while editing). */}
            <View style={styles.feeActionRow}>
              <TouchableOpacity
                style={[styles.feeBtn, styles.feeBtnFull]}
                onPress={() => {
                  setFeeModalName("");
                  setFeeModalAmount("");
                  setFeeModalVisible(true);
                }}
              >
                <Text allowFontScaling={false} style={styles.feeBtnText}>
                  + Add Fee
                </Text>
              </TouchableOpacity>

              {((form.fees ?? []).length > 0 || feesEditMode) && (
                <TouchableOpacity
                  style={[
                    styles.feeBtn,
                    styles.feeBtnFull,
                    feesEditMode && styles.feeBtnActive,
                  ]}
                  onPress={() => setFeesEditMode((v) => !v)}
                >
                  <Text
                    allowFontScaling={false}
                    style={[
                      styles.feeBtnText,
                      feesEditMode && styles.feeBtnTextActive,
                    ]}
                  >
                    {feesEditMode ? "Done" : "Edit Fees"}
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Breakdown: entry ± each enabled fee = per-player to pool */}
            {feeEntryNum > 0 && (
              <View style={styles.feeBreakdown}>
                <View style={styles.feeBreakRow}>
                  <Text allowFontScaling={false} style={styles.feeBreakLabel}>
                    Entry
                  </Text>
                  <Text allowFontScaling={false} style={styles.feeBreakValue}>
                    {fmtMoney(feeEntryNum)}
                  </Text>
                </View>
                {enabledFees.map((f) => (
                  <View key={f.id} style={styles.feeBreakRow}>
                    <Text allowFontScaling={false} style={styles.feeBreakLabel}>
                      {feesOnTop ? "+" : "−"} {f.name || "Fee"}
                    </Text>
                    <Text allowFontScaling={false} style={styles.feeBreakValue}>
                      {fmtMoney(parseFloat(f.amount) || 0)}
                    </Text>
                  </View>
                ))}
                {feeOver ? (
                  <Text
                    allowFontScaling={false}
                    style={[styles.feeRemainder, styles.feeRemainderWarn]}
                  >
                    Fees exceed the entry fee
                  </Text>
                ) : (
                  <View style={[styles.feeBreakRow, styles.feeBreakTotalRow]}>
                    <Text allowFontScaling={false} style={styles.feeRemainder}>
                      = {fmtMoney(feePerPlayerToPool)}/player to prize pool
                    </Text>
                  </View>
                )}
                {feesOnTop && !feeOver && (
                  <Text allowFontScaling={false} style={styles.feeBreakSub}>
                    {fmtMoney(feeCollectedPerPlayer)}/player collected total
                  </Text>
                )}
                {/* Player/spectator payouts show the entry fee + prize pool total
                    (verified: chip-live PayoutsTab), never this per-fee split. */}
                <Text allowFontScaling={false} style={styles.feeBreakNote}>
                  Internal fee breakdown — players see the entry fee and prize pool, not this organizer fee split.
                </Text>
              </View>
            )}
          </View>

          {renderSidePots()}
        </Section>


        <Section title="Schedule">
          <FieldAnchor anchorKey="date" error={errFor("date")} register={registerFieldAnchor} style={styles.field}>
            <FieldLabel label={"Date" + reqStar("date")} />
            <DatePicker
              value={form.tournamentDate}
              onChange={(v) => patchForm({ tournamentDate: v })}
              placeholder="Select date"
            />
          </FieldAnchor>
          <View style={styles.field} ref={(n) => registerFieldAnchor("time", n)}>
            <FieldLabel label={"Start Time" + reqStar("time")} />
            <Dropdown
              error={errFor("time")}
              placeholder="Select start time"
              options={START_TIMES}
              value={form.startTime}
              onSelect={(v) => patchForm({ startTime: v })}
            />
          </View>
          <Text allowFontScaling={false} style={styles.hint}>
            Timezone: {hub.tournament?.timezone || "—"}
          </Text>
          {scheduleNeedsAttention && (
            <Text allowFontScaling={false} style={styles.scheduleStaleWarn}>
              ⚠ {SCHEDULE_STALE_MESSAGE}
            </Text>
          )}
          <ToggleSwitch
            label="Recurring Tournament"
            value={form.isRecurring}
            onValueChange={(v) => patchForm({ isRecurring: v })}
          />
          {form.isRecurring && (
            <View style={styles.field}>
              <FieldLabel label="Recurring Frequency *" />
              <Dropdown
                placeholder="How often does it repeat?"
                options={RECURRENCE_TYPES}
                value={form.recurrenceType}
                onSelect={(v) => patchForm({ recurrenceType: v })}
              />
            </View>
          )}
        </Section>

        <Section title="Venue">
          {venue ? (
            <View style={styles.readOnlyCard}>
              <Text allowFontScaling={false} style={styles.readOnlyName}>
                {venue.venue}
              </Text>
              <Text allowFontScaling={false} style={styles.readOnlySub}>
                {venue.address}
              </Text>
              <Text allowFontScaling={false} style={styles.readOnlySub}>
                {venue.city}, {venue.state} {venue.zip_code}
              </Text>
            </View>
          ) : (
            <Text allowFontScaling={false} style={styles.hint}>
              No venue on record.
            </Text>
          )}
          <View style={styles.field} ref={(n) => registerFieldAnchor("tableSize", n)}>
            <FieldLabel label={"Table Size" + reqStar("tableSize")} />
            <Dropdown
              error={errFor("tableSize")}
              placeholder="Select table size"
              options={TABLE_SIZE_OPTIONS}
              value={form.tableSize}
              onSelect={(v) => patchForm({ tableSize: v })}
            />
          </View>
          <View style={styles.field} ref={(n) => registerFieldAnchor("equipment", n)}>
            <FieldLabel label={"Equipment" + reqStar("equipment")} />
            <Dropdown
              error={errFor("equipment")}
              placeholder="Select equipment"
              options={EQUIPMENT_OPTIONS}
              value={form.equipment}
              onSelect={(v) => patchForm({ equipment: v })}
            />
          </View>
          {renderContactName()}
          <LabeledInput
            label="Contact Phone"
            value={form.phoneNumber}
            onChangeText={(v) => patchForm({ phoneNumber: v })}
            placeholder="Contact phone number"
            keyboardType="phone-pad"
          />
          <View style={styles.field}>
            <FieldLabel label="Tournament Image" />
            {(() => {
              const previewUri = getTournamentImageUrl({
                thumbnail: form.thumbnail || undefined,
                game_type: form.gameType,
              } as Tournament);
              // Custom uploads/flyers: show the WHOLE image (contain + black
              // letterbox) so nothing is cropped. Default game-type images keep cover.
              const isCustom = form.thumbnail.startsWith("custom:");
              return previewUri ? (
                <Image
                  source={{ uri: previewUri }}
                  style={[
                    styles.tournamentImagePreview,
                    isCustom && styles.tournamentImagePreviewContain,
                  ]}
                  resizeMode={isCustom ? "contain" : "cover"}
                />
              ) : (
                <View style={styles.tournamentImagePlaceholder}>
                  <Text
                    allowFontScaling={false}
                    style={styles.tournamentImageEmoji}
                  >
                    🎱
                  </Text>
                </View>
              );
            })()}
            <View style={styles.imageActions}>
              <View style={styles.imageDropdown}>
                <Dropdown
                  placeholder="Default by game type"
                  options={THUMBNAIL_OPTIONS.filter(
                    (o) => o.id !== "upload-custom",
                  ).map((o) => ({ label: o.name, value: o.id }))}
                  value={
                    form.thumbnail.startsWith("custom:") ? "" : form.thumbnail
                  }
                  onSelect={(v) => patchForm({ thumbnail: v })}
                />
              </View>
              <TouchableOpacity
                style={[styles.imageUploadBtn, tournamentImage.uploading && styles.btnDisabled]}
                onPress={handleUploadCustomImage}
                disabled={tournamentImage.uploading}
              >
                <Text allowFontScaling={false} style={styles.addRowBtnText}>
                  {tournamentImage.uploading ? "Uploading…" : "Upload Image"}
                </Text>
              </TouchableOpacity>
            </View>
            <Text allowFontScaling={false} style={styles.hint}>
              A default image is chosen from the game type. Upload a custom image
              to override it.
            </Text>
          </View>
          <Text allowFontScaling={false} style={styles.hint}>
            To change the venue, use the Edit Tournament screen.
          </Text>
        </Section>
        </View>
      </View>
    );
  };

  // Export the current roster as CSV (reads existing registration data only — no service
  // or DB change). Web downloads a file; native shows a brief notice (web-focused).
  const handleExportPlayers = () => {
    const esc = (v: string) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const header = "Name,Player ID,Status,Fargo,Entry Paid,Side Pots";
    const rows = hub.registrations.map((r) =>
      [
        esc(getDisplayName(r, pendingNames)),
        esc(r.profiles?.id_auto != null ? String(r.profiles.id_auto) : ""),
        esc(DISPLAY_META[displayStatusOf(r.status)].label),
        esc(r.fargo_rating != null ? String(r.fargo_rating) : ""),
        esc(r.paid_entry ? "Yes" : "No"),
        esc(safePaidSidePots(r.paid_side_pots).join("; ")),
      ].join(","),
    );
    const csv = [header, ...rows].join("\n");
    if (isWeb && typeof document !== "undefined") {
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `players-${tournamentId}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } else {
      Alert.alert("Export Player List", "Player list export is available on the web app.");
    }
  };

  // Right-side Tournament Summary (sticky on wide web; stacked below the roster on
  // narrow/mobile). Read-only — reuses data already on the page (hub.tournament,
  // statusCounts). Entry/Payout intentionally excluded per the design.
  const renderTournamentSummary = () => {
    const t = hub.tournament;
    const fmt = t?.tournament_format ? prettyFormat(t.tournament_format) : "—";
    const gameLabel = t?.game_type
      ? (GAME_TYPE_MAP[t.game_type.toLowerCase()] ?? prettifySlug(t.game_type))
      : "—";
    const activePlayers =
      statusCounts.ready + statusCounts.registered + statusCounts.prereg;
    const bracketSize =
      activePlayers <= 1 ? 2 : Math.pow(2, Math.ceil(Math.log2(activePlayers)));
    const regLabel =
      hub.liveState === "registration_open"
        ? "Open"
        : hub.liveState === "registration_closed"
          ? "Closed"
          : hub.liveState === "in_progress"
            ? "Running"
            : hub.liveState === "finished"
              ? "Completed"
              : "Setup";
    const whenStr =
      [t?.tournament_date ? formatDate(t.tournament_date) : "", t?.start_time ? formatTime(t.start_time) : ""]
        .filter(Boolean)
        .join(" · ") || "—";
    const venue = t?.venues;
    const venueSub = venue ? [venue.city, venue.state].filter(Boolean).join(", ") : "";
    const breakdown = [
      { label: "Ready", n: statusCounts.ready, color: DISPLAY_META.ready.color },
      { label: "Registered", n: statusCounts.registered, color: DISPLAY_META.registered.color },
      { label: "Pre-Registered", n: statusCounts.prereg, color: DISPLAY_META.prereg.color },
      { label: "No Show", n: statusCounts.no_show, color: DISPLAY_META.no_show.color },
    ];
    const totalPlayers = breakdown.reduce((s, b) => s + b.n, 0);
    const sumRow = (label: string, value: string, valueColor?: string) => (
      <View style={styles.sumRow}>
        <Text allowFontScaling={false} style={styles.tsLabel}>{label}</Text>
        <Text allowFontScaling={false} style={[styles.tsValue, valueColor ? { color: valueColor } : null]} numberOfLines={1}>
          {value}
        </Text>
      </View>
    );
    return (
      <View style={styles.summaryCard}>
        <Text allowFontScaling={false} style={styles.summaryTitle}>Tournament Summary</Text>
        <View style={styles.sumDivider} />
        {sumRow("Format", fmt)}
        {sumRow("Game", gameLabel)}
        {sumRow("Players", `${activePlayers} / ${bracketSize}`)}
        {sumRow("Registration", regLabel, regLabel === "Open" ? COLORS.success : undefined)}
        {sumRow("Start Date", whenStr)}
        <View style={styles.sumRow}>
          <Text allowFontScaling={false} style={styles.tsLabel}>Venue</Text>
          <View style={styles.sumVenueVal}>
            <Text allowFontScaling={false} style={styles.tsValue} numberOfLines={1}>{venue?.venue ?? "—"}</Text>
            {!!venueSub && (
              <Text allowFontScaling={false} style={styles.sumValueSub} numberOfLines={1}>{venueSub}</Text>
            )}
          </View>
        </View>

        <View style={styles.sumDivider} />
        <Text allowFontScaling={false} style={styles.breakdownTitle}>Player Breakdown</Text>
        <View style={styles.breakdownWrap}>
          <View style={styles.breakdownList}>
            {breakdown.map((b) => (
              <View key={b.label} style={styles.breakdownRow}>
                <View style={[styles.breakdownDot, { backgroundColor: b.color }]} />
                <Text allowFontScaling={false} style={styles.breakdownLabel}>{b.label}</Text>
                <Text allowFontScaling={false} style={styles.breakdownCount}>{b.n}</Text>
              </View>
            ))}
          </View>
          <View style={styles.donutRing}>
            <Text allowFontScaling={false} style={styles.donutNum}>{totalPlayers}</Text>
            <Text allowFontScaling={false} style={styles.donutLbl}>Players</Text>
          </View>
        </View>

        <View style={styles.sumDivider} />
        <Text allowFontScaling={false} style={styles.breakdownTitle}>Quick Actions</Text>
        <TouchableOpacity style={styles.qaBtn} onPress={() => router.push("/compose-message" as any)}>
          <Text allowFontScaling={false} style={styles.qaBtnText}>✉  Message Players</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.qaBtn} onPress={handleExportPlayers}>
          <Text allowFontScaling={false} style={styles.qaBtnText}>⬇  Export Player List</Text>
        </TouchableOpacity>
      </View>
    );
  };

  const renderPlayers = () => {
    const sidePots = (hub.tournament?.side_pots ?? []).map((p) => ({
      name: p.name,
      amount: Number(p.amount) || 0,
    }));
    const entryFee = Number(hub.tournament?.entry_fee) || 0;
    const raceMode = hub.tournament?.live_settings?.raceMode ?? "fixed";
    const raceGroups = hub.tournament?.live_settings?.raceGroups ?? [];
    // A/B/C groups only: the player's assigned group LABEL, via the SAME groupForFargo matcher
    // the race assignment uses. Undefined when not groups mode, no rating, or no matching group.
    const groupLabelFor = (r: Registration): string | undefined => {
      if (raceMode !== "groups") return undefined;
      const g = groupForFargo(r.fargo_rating ?? null, raceGroups);
      return g ? (g.label?.trim() || undefined) : undefined;
    };
    const summary = [
      { key: "prereg" as DisplayStatus, short: "Pre-Reg", n: statusCounts.prereg },
      { key: "registered" as DisplayStatus, short: "Registered", n: statusCounts.registered },
      { key: "ready" as DisplayStatus, short: "Ready", n: statusCounts.ready },
      { key: "no_show" as DisplayStatus, short: "No Show", n: statusCounts.no_show },
    ];
    const chipsNode = (
      <View style={[styles.summaryPills, isWeb && styles.summaryPillsWeb]}>
        {summary.map((sp) => (
          <View key={sp.key} style={styles.summaryPill}>
            <View style={[styles.statusDotSm, { backgroundColor: DISPLAY_META[sp.key].color }]} />
            <Text allowFontScaling={false} style={styles.summaryPillText}>
              {sp.short} {sp.n}
            </Text>
          </View>
        ))}
      </View>
    );
    const searchNode = (
      <View style={styles.searchInputWrapper}>
        <Text allowFontScaling={false} style={styles.searchIcon}>{GLYPH.search}</Text>
        <TextInput
          allowFontScaling={false}
          style={styles.searchInput}
          placeholder="Search players..."
          placeholderTextColor={COLORS.textMuted}
          value={playerSearch}
          onChangeText={setPlayerSearch}
        />
      </View>
    );
    const filterNode = (
      <Dropdown
        placeholder="All Players"
        options={PLAYER_FILTERS}
        value={statusFilter}
        selectedBlueText
        hideCheck={isWeb}
        onSelect={(v) => setStatusFilter(v as "all" | DisplayStatus)}
      />
    );
    const addNode = (
      <TouchableOpacity style={styles.addButton} onPress={() => setAddModalVisible(true)}>
        <Text allowFontScaling={false} style={styles.addButtonText}>+ Add Player</Text>
      </TouchableOpacity>
    );
    // Search / All Players filter / Add Player grouped in one control row. Web: single row
    // (chips · search · filter · add). Mobile: chips, search, then filter + add together.
    const controls = isWeb ? (
      <View style={styles.controlsRowWeb}>
        {chipsNode}
        <View style={styles.controlsSearchWeb}>{searchNode}</View>
        <View style={styles.controlsFilterWeb}>{filterNode}</View>
        {addNode}
      </View>
    ) : (
      <>
        {chipsNode}
        {searchNode}
        <View style={styles.controlsFilterRowMobile}>
          <View style={styles.controlsFilterFlex}>{filterNode}</View>
          {addNode}
        </View>
      </>
    );
    const renderRow = (item: Registration) => (
      <RegistrationRow
        key={item.id}
        registration={item}
        pendingNames={pendingNames}
        sidePots={sidePots}
        entryFee={entryFee}
        raceMode={raceMode}
        raceGroups={raceGroups}
        onReady={(fargo, isStarter, paidEntry, paidPots, raceOverride, verified) =>
          handleReady(item, fargo, isStarter, paidEntry, paidPots, raceOverride, verified)
        }
        onSaveEdit={(fargo, isStarter, paidEntry, paidPots, raceOverride, verified, stillReady) =>
          handleSaveEdit(item, fargo, isStarter, paidEntry, paidPots, raceOverride, verified, stillReady)
        }
        onTogglePaidPot={(name, paid) => handleTogglePaidPot(item, name, paid)}
        onNoShow={() => handleNoShow(item)}
        onRemove={() => handleRemove(item)}
        onUndo={() => handleUndoReady(item)}
        onRestore={() => handleRestore(item)}
        isProcessing={processingId === item.id}
        locked={settingsLocked}
      />
    );
    const loadingOrEmpty = hub.registrationsLoading ? (
      <View style={styles.centerBlock}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    ) : filteredRegs.length === 0 ? (
      <EmptyState message="No players to show" submessage="Add players or adjust the filter." />
    ) : null;
    // Wide web: paginated (20/page) with SYNCED pagination above + below, a Cards (2-col
    // grid) / List (single column) toggle, and a sticky Tournament Summary aligned to the
    // first player card. Narrow/mobile: single column, all players, summary stacked below.
    if (isWeb && winW >= 980) {
      const cardsView = playersView === "cards";
      // Cards/List toggle — lives on the RIGHT of the (top) pagination row, next to the page
      // selector, instead of the top controls row.
      const viewToggleNode = (
        <View style={styles.viewToggle}>
          <TouchableOpacity
            style={[styles.viewToggleBtn, cardsView && styles.viewToggleBtnOn]}
            onPress={() => setPlayersView("cards")}
          >
            <Text allowFontScaling={false} style={[styles.viewToggleText, cardsView && styles.viewToggleTextOn]}>Cards</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.viewToggleBtn, !cardsView && styles.viewToggleBtnOn]}
            onPress={() => setPlayersView("list")}
          >
            <Text allowFontScaling={false} style={[styles.viewToggleText, !cardsView && styles.viewToggleTextOn]}>List</Text>
          </TouchableOpacity>
        </View>
      );
      const makePager = (rightAccessory?: React.ReactNode) => (
        <Pagination
          totalCount={playersPagination.totalCount}
          displayStart={playersPagination.displayRange.start}
          displayEnd={playersPagination.displayRange.end}
          currentPage={playersPagination.currentPage}
          totalPages={playersPagination.totalPages}
          onPrevPage={playersPagination.prevPage}
          onNextPage={playersPagination.nextPage}
          canGoPrev={playersPagination.canGoPrev}
          canGoNext={playersPagination.canGoNext}
          noun="players"
          rightAccessory={rightAccessory}
        />
      );
      const pagerTop = makePager(viewToggleNode);
      const pager = makePager();
      const confirmOff = (title: string, msg: string, fn: () => void) =>
        Alert.alert(title, msg, [
          { text: "Cancel", style: "cancel" },
          { text: "Confirm", style: "destructive", onPress: fn },
        ]);
      // State-appropriate Actions-menu items for a row (same set + confirmations as the old
      // Alert menu). Selecting an item closes the popover (handled by WebActionsMenu) first.
      const actionItemsFor = (item: Registration): { label: string; danger?: boolean; onPress: () => void }[] => {
        const dd = displayStatusOf(item.status);
        if (dd === "no_show" || dd === "removed") {
          return [{ label: "Restore", onPress: () => handleRestore(item) }];
        }
        const out: { label: string; danger?: boolean; onPress: () => void }[] = [
          { label: "Edit", onPress: () => setEditingListId(item.id) },
        ];
        if (dd === "ready")
          out.push({ label: "Undo Ready", onPress: () => confirmOff("Undo Ready?", "This moves the player back to Registered.", () => handleUndoReady(item)) });
        out.push({ label: "Mark No Show", danger: true, onPress: () => confirmOff("Mark No Show?", "This marks the player as a no-show.", () => handleNoShow(item)) });
        out.push({ label: "Remove Player", danger: true, onPress: () => confirmOff("Remove player?", "This removes the player from the tournament registration.", () => handleRemove(item)) });
        return out;
      };
      const listHeader = (
        <View style={styles.listHead}>
          <Text allowFontScaling={false} style={[styles.listHeadText, styles.lcPlayer]}>Player</Text>
          <Text allowFontScaling={false} style={[styles.listHeadText, styles.lcFargo]}>Fargo</Text>
          <Text allowFontScaling={false} style={[styles.listHeadText, styles.lcEntry]}>Entry</Text>
          <Text allowFontScaling={false} style={[styles.listHeadText, styles.lcPots]}>Side Pots</Text>
          <Text allowFontScaling={false} style={[styles.listHeadText, styles.lcStatus]}>Status</Text>
          <Text allowFontScaling={false} style={[styles.listHeadText, styles.lcActions]}>Actions</Text>
        </View>
      );
      const roster =
        loadingOrEmpty ??
        (cardsView ? (
          <>
            {pagerTop}
            <View style={styles.rosterGrid}>
              {playersPagination.paginatedItems.map((item) => (
                <View key={item.id} style={styles.rosterCardCell}>
                  {editingListId === item.id ? (
                    // Actions → Edit expands the card into the SAME full editor (Fargo input +
                    // Verify + race controls + entry/pots) the List View uses. Callbacks clear
                    // the editing id so it collapses back to the compact card after commit.
                    <View style={styles.listEditWrap}>
                      <RegistrationRow
                        registration={item}
                        pendingNames={pendingNames}
                        sidePots={sidePots}
                        entryFee={entryFee}
                        raceMode={raceMode}
                        raceGroups={raceGroups}
                        initialEditing
                        onReady={(fargo, isStarter, paidEntry, paidPots, raceOverride, verified) => {
                          handleReady(item, fargo, isStarter, paidEntry, paidPots, raceOverride, verified);
                          setEditingListId(null);
                        }}
                        onSaveEdit={(fargo, isStarter, paidEntry, paidPots, raceOverride, verified, stillReady) => {
                          handleSaveEdit(item, fargo, isStarter, paidEntry, paidPots, raceOverride, verified, stillReady);
                          setEditingListId(null);
                        }}
                        onTogglePaidPot={(name, paid) => handleTogglePaidPot(item, name, paid)}
                        onNoShow={() => { handleNoShow(item); setEditingListId(null); }}
                        onRemove={() => { handleRemove(item); setEditingListId(null); }}
                        onUndo={() => { handleUndoReady(item); setEditingListId(null); }}
                        onRestore={() => { handleRestore(item); setEditingListId(null); }}
                        isProcessing={processingId === item.id}
                        locked={settingsLocked}
                      />
                      <TouchableOpacity style={styles.listDoneBtn} onPress={() => setEditingListId(null)}>
                        <Text allowFontScaling={false} style={styles.listDoneText}>Done editing</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <EliminationPlayerCard
                      registration={item}
                      sidePots={sidePots}
                      entryFee={entryFee}
                      raceMode={raceMode}
                      raceGroups={raceGroups}
                      groupLabel={groupLabelFor(item)}
                      isProcessing={processingId === item.id}
                      pendingNames={pendingNames}
                      onToggleEntry={(next) =>
                        next
                          ? handleTogglePaidEntry(item, true)
                          : confirmOff("Mark entry fee unpaid?", "This player was marked paid.", () => handleTogglePaidEntry(item, false))
                      }
                      onToggleSidePot={(name, ent) =>
                        ent
                          ? handleTogglePaidPot(item, name, true)
                          : confirmOff("Remove side pot?", `Remove ${name} from this player?`, () => handleTogglePaidPot(item, name, false))
                      }
                      onVerify={() => handleVerifyFargo(item)}
                      onUnverify={() =>
                        confirmOff("Un-verify Fargo?", "This clears the verified Fargo for this event.", () => handleUnverifyFargo(item))
                      }
                      onReady={() =>
                        handleReady(
                          item,
                          item.fargo_rating as number,
                          !!item.is_starter_rating,
                          !!item.paid_entry,
                          safePaidSidePots(item.paid_side_pots).filter((n) => sidePots.some((p) => p.name === n)),
                          item.race_override ?? null,
                          true,
                        )
                      }
                      onUndo={() =>
                        confirmOff("Undo Ready?", "This moves the player back to Registered.", () => handleUndoReady(item))
                      }
                      onActions={(anchor) => setActionsMenu({ anchor, item })}
                    />
                  )}
                </View>
              ))}
            </View>
            {pager}
          </>
        ) : (
          <>
            {pagerTop}
            <View style={styles.listTable}>
              {listHeader}
              {playersPagination.paginatedItems.map((item) =>
                editingListId === item.id ? (
                  // Actions → Edit expands the row into the SAME full editor the cards use
                  // (Fargo input + Verify + race controls + entry/pots). Callbacks clear the
                  // editing id so it collapses back to the compact row after commit.
                  <View key={item.id} style={styles.listEditWrap}>
                    <RegistrationRow
                      registration={item}
                      pendingNames={pendingNames}
                      sidePots={sidePots}
                      entryFee={entryFee}
                      raceMode={raceMode}
                      raceGroups={raceGroups}
                      initialEditing
                      onReady={(fargo, isStarter, paidEntry, paidPots, raceOverride, verified) => {
                        handleReady(item, fargo, isStarter, paidEntry, paidPots, raceOverride, verified);
                        setEditingListId(null);
                      }}
                      onSaveEdit={(fargo, isStarter, paidEntry, paidPots, raceOverride, verified, stillReady) => {
                        handleSaveEdit(item, fargo, isStarter, paidEntry, paidPots, raceOverride, verified, stillReady);
                        setEditingListId(null);
                      }}
                      onTogglePaidPot={(name, paid) => handleTogglePaidPot(item, name, paid)}
                      onNoShow={() => { handleNoShow(item); setEditingListId(null); }}
                      onRemove={() => { handleRemove(item); setEditingListId(null); }}
                      onUndo={() => { handleUndoReady(item); setEditingListId(null); }}
                      onRestore={() => { handleRestore(item); setEditingListId(null); }}
                      isProcessing={processingId === item.id}
                      locked={settingsLocked}
                    />
                    <TouchableOpacity style={styles.listDoneBtn} onPress={() => setEditingListId(null)}>
                      <Text allowFontScaling={false} style={styles.listDoneText}>Done editing</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <EliminationPlayerListRow
                    key={item.id}
                    registration={item}
                    sidePots={sidePots}
                    entryFee={entryFee}
                    isProcessing={processingId === item.id}
                    pendingNames={pendingNames}
                    groupLabel={groupLabelFor(item)}
                    onToggleEntry={(next) =>
                      next
                        ? handleTogglePaidEntry(item, true)
                        : confirmOff("Mark entry fee unpaid?", "This player was marked paid.", () => handleTogglePaidEntry(item, false))
                    }
                    onToggleSidePot={(name, ent) =>
                      ent
                        ? handleTogglePaidPot(item, name, true)
                        : confirmOff("Remove side pot?", `Remove ${name} from this player?`, () => handleTogglePaidPot(item, name, false))
                    }
                    onActions={(anchor) => setActionsMenu({ anchor, item })}
                  />
                ),
              )}
            </View>
            {pager}
          </>
        ));
      return (
        <View style={styles.playersPaneWeb}>
          {/* Controls live ABOVE the scroll region (fixed), so the two-column area starts at
              the very top of the scroll content. That lets the Tournament Summary stick from
              the first scrolled pixel with zero drift — no travel down to a sticky threshold. */}
          <View style={styles.playersControlsBarWeb}>
            <View style={styles.controlsRowWeb}>
              {/* Status count chips removed on desktop — the Tournament Summary's Player
                  Breakdown already shows these totals. Cards/List moved to the pagination row.
                  Search is a compact fixed width so it doesn't consume the row; controls pack left. */}
              <View style={styles.controlsSearchDesktop}>{searchNode}</View>
              <View style={styles.controlsFilterWeb}>{filterNode}</View>
              {addNode}
            </View>
          </View>
          <ScrollView
            style={styles.scrollFlex}
            contentContainerStyle={styles.playersPageWeb}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.playersTwoCol}>
              <View style={styles.playersRosterCol}>{roster}</View>
              <View style={styles.playersSummaryCol}>
                {/* No pager spacer here: the summary starts at the scroll-content top so it
                    aligns with the pagination row on the left, and (matching the sticky top)
                    is already at its sticky position → zero drift on first scroll. */}
                {renderTournamentSummary()}
                {/* Continue to Tables lives with the sticky summary (not a bottom footer),
                    matching the summary column width and keeping its gold styling. */}
                {!isChip && hub.liveState === "registration_open" && (
                  <TouchableOpacity
                    style={[styles.lockBtn, styles.summaryContinueBtn, !setupStepComplete.players && styles.btnDisabled]}
                    onPress={() => advanceFromPlayers("tables")}
                    disabled={!setupStepComplete.players}
                  >
                    <Text allowFontScaling={false} style={styles.lockBtnText}>
                      Continue to Tables →
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </ScrollView>
          {actionsMenu && (
            <WebActionsMenu
              anchorRef={actionsMenu.anchor}
              items={actionItemsFor(actionsMenu.item)}
              onClose={() => setActionsMenu(null)}
            />
          )}
        </View>
      );
    }
    return (
      <View>
        {controls}
        {loadingOrEmpty ?? filteredRegs.map(renderRow)}
        <View style={styles.summaryStackedMobile}>{renderTournamentSummary()}</View>
      </View>
    );
  };

  const renderTables = () => {
    const editingTable =
      editingTableId != null
        ? (hub.tables.find((t) => t.id === editingTableId) ?? null)
        : null;
    const editOcc = editingTable ? (tableMatch[editingTable.id] ?? null) : null;
    const editStatus: TableStatus = editOcc
      ? "in_use"
      : (editingTable?.status ?? "available");
    const editDraft = editingTable
      ? (streamDrafts[editingTable.id] ?? editingTable.stream_link ?? "")
      : "";

    // Display naming (UI only — persistence stays table_number + optional label):
    //   label present → "<label> <number>" (e.g. "Diamond 1"); none → "Pool Table <number>".
    // The Bulk Add preview uses this SAME logic so the preview matches what's created.
    const poolTableName = (t: { table_number: number; label?: string | null }) =>
      t.label && t.label.trim() ? `${t.label.trim()} ${t.table_number}` : `Pool Table ${t.table_number}`;

    // Edit sheet, reused by native (pool=false → "Table N — label", unchanged) and the web
    // redesign (pool=true → "Pool Table N" / "Label N"). Status / streaming / remove identical.
    const editModalNode = (pool: boolean) => (
      <Modal
        transparent
        visible={editingTable != null}
        animationType="fade"
        onRequestClose={() => setEditingTableId(null)}
      >
        <Pressable style={styles.tableInfoBackdrop} onPress={() => setEditingTableId(null)}>
          <Pressable style={styles.tableInfoCard} onPress={() => {}}>
            {editingTable && (
              <>
                <View style={styles.editHead}>
                  <Text allowFontScaling={false} style={styles.editTitle} numberOfLines={1}>
                    {pool
                      ? poolTableName(editingTable)
                      : `Table ${editingTable.table_number}${editingTable.label ? ` — ${editingTable.label}` : ""}`}
                  </Text>
                  <TouchableOpacity onPress={() => setEditingTableId(null)} hitSlop={10}>
                    <Text allowFontScaling={false} style={styles.editClose}>
                      ✕
                    </Text>
                  </TouchableOpacity>
                </View>

                {editOcc && (
                  <View style={styles.editOccBanner}>
                    <Text allowFontScaling={false} style={styles.editOccLabel} numberOfLines={1}>
                      In use · {editOcc.label}
                    </Text>
                    <Text allowFontScaling={false} style={styles.editOccNames} numberOfLines={1}>
                      {(editOcc.p1Name ?? "TBD")} vs {(editOcc.p2Name ?? "TBD")}
                    </Text>
                    <TouchableOpacity
                      onPress={() => {
                        setEditingTableId(null);
                        setSelectedPhase("live");
                        setActiveTab("matches");
                      }}
                    >
                      <Text allowFontScaling={false} style={styles.editOccLink}>
                        View in Matches ›
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}

                <Text allowFontScaling={false} style={styles.fieldLabel}>
                  Status
                </Text>
                <View style={styles.tableStatusRow}>
                  {(
                    [
                      { s: "available", label: "Available" },
                      { s: "in_use", label: "In Use" },
                      { s: "unavailable", label: "Unavailable" },
                    ] as { s: TableStatus; label: string }[]
                  ).map((o) => (
                    <TouchableOpacity
                      key={o.s}
                      style={[
                        styles.tableStatusBtn,
                        editStatus === o.s && styles.tableStatusBtnActive,
                        editOcc && o.s !== "in_use" && styles.tableStatusBtnLocked,
                      ]}
                      disabled={!!editOcc && o.s !== "in_use"}
                      onPress={() => {
                        if (!editOcc) handleSetTableStatus(editingTable.id, o.s);
                      }}
                    >
                      <Text
                        allowFontScaling={false}
                        style={[
                          styles.tableStatusBtnText,
                          editStatus === o.s && styles.tableStatusBtnTextActive,
                        ]}
                      >
                        {o.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                {editOcc && (
                  <Text allowFontScaling={false} style={styles.editLockHint}>
                    Finish or move this match to change the status.
                  </Text>
                )}

                <View style={styles.editStreamWrap}>
                  <ToggleSwitch
                    label="Streaming Table"
                    value={editingTable.is_streaming}
                    onValueChange={(on) =>
                      handleToggleStreaming(editingTable.id, on, editDraft)
                    }
                  />
                  {editingTable.is_streaming && (
                    <TextInput
                      allowFontScaling={false}
                      style={[styles.input, { marginTop: webSc(SPACING.sm) }]}
                      value={editDraft}
                      onChangeText={(v) =>
                        setStreamDrafts((m) => ({ ...m, [editingTable.id]: v }))
                      }
                      onEndEditing={() =>
                        handleToggleStreaming(editingTable.id, true, editDraft)
                      }
                      placeholder="Stream link URL"
                      placeholderTextColor={COLORS.textMuted}
                      autoCapitalize="none"
                    />
                  )}
                </View>

                <View style={styles.tableInfoBtns}>
                  <TouchableOpacity
                    style={[styles.tableInfoBtn, styles.editRemoveBtn]}
                    onPress={() => {
                      const id = editingTable.id;
                      setEditingTableId(null);
                      handleDeleteTable(id);
                    }}
                  >
                    <Text allowFontScaling={false} style={styles.editRemoveText}>
                      {pool ? "Remove Pool Table" : "Remove Table"}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.tableInfoBtn, styles.tableInfoBtnPrimary]}
                    onPress={() => setEditingTableId(null)}
                  >
                    <Text allowFontScaling={false} style={styles.tableInfoBtnPrimaryText}>
                      Done
                    </Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    );

    // Bulk Add preview — same naming + identity logic that will be persisted, incl. duplicate
    // detection (so the preview flags conflicts and the Add button disables before submit).
    const bulkFromN = parseInt(bulkFrom, 10);
    const bulkToN = parseInt(bulkTo, 10);
    const bulkValid =
      !isNaN(bulkFromN) && !isNaN(bulkToN) && bulkToN >= bulkFromN && bulkToN - bulkFromN <= 100;
    const bulkPreview = bulkValid
      ? Array.from({ length: bulkToN - bulkFromN + 1 }, (_, i) => {
          const num = bulkFromN + i;
          const lbl = bulkLabel.trim();
          const conflict = findTableConflict(bulkLabel, num);
          return { name: lbl ? `${lbl} ${num}` : `Pool Table ${num}`, conflict: !!conflict };
        })
      : [];
    const bulkPreviewNames = bulkPreview.map((p) => p.name);
    const bulkConflictNames = bulkPreview.filter((p) => p.conflict).map((p) => p.name);
    const bulkHasConflict = bulkConflictNames.length > 0;
    const bulkModalNode = (
      <Modal
        transparent
        visible={bulkModalOpen}
        animationType="fade"
        onRequestClose={() => setBulkModalOpen(false)}
      >
        <Pressable style={styles.tableInfoBackdrop} onPress={() => setBulkModalOpen(false)}>
          <Pressable style={styles.ptBulkModalCard} onPress={() => {}}>
            <View style={styles.editHead}>
              <Text allowFontScaling={false} style={styles.editTitle}>Bulk Add Pool Tables</Text>
              <TouchableOpacity onPress={() => setBulkModalOpen(false)} hitSlop={10}>
                <Text allowFontScaling={false} style={styles.editClose}>✕</Text>
              </TouchableOpacity>
            </View>
            <Text allowFontScaling={false} style={styles.ptModalSub}>
              Create multiple pool tables at once using a number range.
            </Text>
            <Text allowFontScaling={false} style={styles.fieldLabel}>Pool Table Label / Prefix (optional)</Text>
            <TextInput
              allowFontScaling={false}
              style={styles.input}
              value={bulkLabel}
              onChangeText={setBulkLabel}
              placeholder="e.g. Diamond, 7ft"
              placeholderTextColor={COLORS.textMuted}
            />
            <View style={styles.ptBulkRangeRow}>
              <View style={styles.ptBulkRangeCol}>
                <Text allowFontScaling={false} style={styles.fieldLabel}>From</Text>
                <TextInput
                  allowFontScaling={false}
                  style={styles.input}
                  value={bulkFrom}
                  onChangeText={(v) => setBulkFrom(v.replace(/[^0-9]/g, ""))}
                  placeholder="1"
                  placeholderTextColor={COLORS.textMuted}
                  keyboardType="numeric"
                  maxLength={3}
                />
              </View>
              <View style={styles.ptBulkRangeCol}>
                <Text allowFontScaling={false} style={styles.fieldLabel}>To</Text>
                <TextInput
                  allowFontScaling={false}
                  style={styles.input}
                  value={bulkTo}
                  onChangeText={(v) => setBulkTo(v.replace(/[^0-9]/g, ""))}
                  placeholder="4"
                  placeholderTextColor={COLORS.textMuted}
                  keyboardType="numeric"
                  maxLength={3}
                />
              </View>
            </View>
            <Text allowFontScaling={false} style={styles.fieldLabel}>Preview</Text>
            <View style={styles.ptPreviewBox}>
              {bulkPreviewNames.length === 0 ? (
                <Text allowFontScaling={false} style={styles.ptPreviewEmpty}>
                  Enter a valid From / To range to preview names.
                </Text>
              ) : (
                <Text allowFontScaling={false} style={styles.ptPreviewText}>
                  {bulkPreviewNames.slice(0, 8).join(", ")}
                  {bulkPreviewNames.length > 8 ? `, … (${bulkPreviewNames.length} total)` : ""}
                </Text>
              )}
            </View>
            {bulkHasConflict && (
              <Text allowFontScaling={false} style={styles.ptConflictText}>
                {bulkConflictNames.length === 1
                  ? `${bulkConflictNames[0]} already exists.`
                  : `Already exist: ${bulkConflictNames.slice(0, 6).join(", ")}${bulkConflictNames.length > 6 ? ", …" : ""}.`}
              </Text>
            )}
            <View style={styles.tableInfoBtns}>
              <TouchableOpacity
                style={[styles.tableInfoBtn, styles.ptModalCancelBtn]}
                onPress={() => setBulkModalOpen(false)}
              >
                <Text allowFontScaling={false} style={styles.ptModalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tableInfoBtn, styles.tableInfoBtnPrimary, (!bulkValid || bulkHasConflict || tableBusy) && styles.btnDisabled]}
                onPress={handleBulkAddPoolTables}
                disabled={!bulkValid || bulkHasConflict || tableBusy}
              >
                <Text allowFontScaling={false} style={styles.tableInfoBtnPrimaryText}>Add Pool Tables</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    );

    // Focused Rename modal (web) — edits label + number; reuses updateTable.
    const renameModalNode = (
      <Modal
        transparent
        visible={renameModalTableId != null}
        animationType="fade"
        onRequestClose={() => setRenameModalTableId(null)}
      >
        <Pressable style={styles.tableInfoBackdrop} onPress={() => setRenameModalTableId(null)}>
          <Pressable style={styles.ptSmallModalCard} onPress={() => {}}>
            <View style={styles.editHead}>
              <Text allowFontScaling={false} style={styles.editTitle}>Rename Pool Table</Text>
              <TouchableOpacity onPress={() => setRenameModalTableId(null)} hitSlop={10}>
                <Text allowFontScaling={false} style={styles.editClose}>✕</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.ptBulkRangeRow}>
              <View style={styles.ptRenameLabelCol}>
                <Text allowFontScaling={false} style={styles.fieldLabel}>Label</Text>
                <TextInput
                  allowFontScaling={false}
                  style={styles.input}
                  value={renameLabel}
                  onChangeText={setRenameLabel}
                  placeholder="e.g. Diamond, Front Room"
                  placeholderTextColor={COLORS.textMuted}
                />
              </View>
              <View style={styles.ptRenameNumCol}>
                <Text allowFontScaling={false} style={styles.fieldLabel}>Number</Text>
                <TextInput
                  allowFontScaling={false}
                  style={styles.input}
                  value={renameNum}
                  onChangeText={(v) => setRenameNum(v.replace(/[^0-9]/g, ""))}
                  placeholder="#"
                  placeholderTextColor={COLORS.textMuted}
                  keyboardType="numeric"
                  maxLength={3}
                />
              </View>
            </View>
            <View style={styles.tableInfoBtns}>
              <TouchableOpacity style={[styles.tableInfoBtn, styles.ptModalCancelBtn]} onPress={() => setRenameModalTableId(null)}>
                <Text allowFontScaling={false} style={styles.ptModalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.tableInfoBtn, styles.tableInfoBtnPrimary]} onPress={handleSaveRename}>
                <Text allowFontScaling={false} style={styles.tableInfoBtnPrimaryText}>Save</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    );

    // ── Web/desktop redesign: Pool Table Management (two-column, sticky sidebar) ──
    if (isWeb && winW >= 980) {
      const signedUp = statusCounts.ready + statusCounts.registered + statusCounts.prereg;
      const poolTablesCount = hub.tables.length;
      // Available = not currently occupied by a match AND status "available" (existing data).
      const availableCount = hub.tables.filter(
        (t) => !tableMatch[t.id] && t.status === "available",
      ).length;
      // Presentation-only stable sort (label → number) so same-numbered tables with different
      // labels group cleanly now that numbers can repeat. Does not affect persistence/native.
      const sortedTables = [...hub.tables].sort(
        (a, b) =>
          normalizeTableLabel(a.label).localeCompare(normalizeTableLabel(b.label)) ||
          a.table_number - b.table_number,
      );
      return (
        <View style={styles.ptPaneWeb}>
          <ScrollView
            style={styles.scrollFlex}
            contentContainerStyle={styles.ptScrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.ptTwoCol}>
              {/* LEFT — management */}
              <View style={styles.ptMainCol}>
                <View style={styles.ptHeaderText}>
                  <Text allowFontScaling={false} style={styles.ptTitle}>Pool Table Management</Text>
                  <Text allowFontScaling={false} style={styles.ptSubtitle}>
                    Add and manage pool tables for this tournament.
                  </Text>
                </View>

                {!hub.tablesReady && (
                  <Text allowFontScaling={false} style={styles.hint}>
                    Pool tables need the database update applied before they can be saved.
                  </Text>
                )}

                {/* Add a Pool Table — single compact row */}
                <View style={styles.ptAddCard}>
                  <Text allowFontScaling={false} style={styles.ptCardTitle}>Add a Pool Table</Text>
                  <View style={styles.ptAddRowOne}>
                    <View style={styles.ptFieldLabelCol}>
                      <Text allowFontScaling={false} style={styles.fieldLabel}>Label</Text>
                      <TextInput
                        allowFontScaling={false}
                        style={styles.input}
                        value={singleTableLabel}
                        onChangeText={setSingleTableLabel}
                        placeholder="e.g. Diamond, Front Room"
                        placeholderTextColor={COLORS.textMuted}
                      />
                    </View>
                    <View style={styles.ptFieldNumCol}>
                      <Text allowFontScaling={false} style={styles.fieldLabel}>Number</Text>
                      <TextInput
                        allowFontScaling={false}
                        style={styles.input}
                        value={singleTableNum}
                        onChangeText={(v) => setSingleTableNum(v.replace(/[^0-9]/g, ""))}
                        placeholder="#"
                        placeholderTextColor={COLORS.textMuted}
                        keyboardType="numeric"
                        maxLength={3}
                      />
                    </View>
                    <View style={styles.ptFieldStreamCol}>
                      <Text allowFontScaling={false} style={styles.fieldLabel}>Stream Link — optional</Text>
                      <TextInput
                        allowFontScaling={false}
                        style={styles.input}
                        value={singleTableStream}
                        onChangeText={setSingleTableStream}
                        placeholder="YouTube, Twitch, Facebook, etc."
                        placeholderTextColor={COLORS.textMuted}
                        autoCapitalize="none"
                      />
                    </View>
                    <TouchableOpacity
                      style={[styles.ptPrimaryBtn, styles.ptAddBtnInline, tableBusy && styles.btnDisabled]}
                      onPress={handleAddPoolTable}
                      disabled={tableBusy}
                    >
                      <Text allowFontScaling={false} style={styles.ptPrimaryBtnText}>Add Pool Table</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Bulk Add — compact horizontal callout */}
                <View style={styles.ptBulkCalloutRow}>
                  <View style={styles.ptBulkCalloutText}>
                    <Text allowFontScaling={false} style={styles.ptCalloutTitle}>Add Multiple Pool Tables</Text>
                    <Text allowFontScaling={false} style={styles.ptSubtitle}>
                      Need to add a bunch of pool tables at once?
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.ptBulkBtn}
                    onPress={() => setBulkModalOpen(true)}
                    disabled={tableBusy}
                  >
                    <Text allowFontScaling={false} style={styles.ptBulkBtnText}>+ Bulk Add Pool Tables</Text>
                  </TouchableOpacity>
                </View>

                <Text allowFontScaling={false} style={styles.ptListTitle}>
                  Pool Tables ({poolTablesCount})
                </Text>
                <Text allowFontScaling={false} style={styles.ptListHelp}>
                  Manage your tournament pool tables.
                </Text>
                {poolTablesCount === 0 ? (
                  <Text allowFontScaling={false} style={styles.hint}>
                    No pool tables yet. Add one above or use Bulk Add.
                  </Text>
                ) : (
                  <View style={styles.ptGrid}>
                    {sortedTables.map((tbl) => {
                      const occupiedBy = tableMatch[tbl.id] ?? null;
                      const effStatus: TableStatus = occupiedBy ? "in_use" : tbl.status;
                      const color = tableStatusColor(effStatus);
                      return (
                        <PoolTableCard
                          key={`${tbl.id}:${tbl.stream_link ?? ""}`}
                          name={poolTableName(tbl)}
                          statusLabel={TABLE_STATUS_LABEL[effStatus]}
                          statusColor={color}
                          streamLink={tbl.stream_link ?? ""}
                          expanded={editingStreamId === tbl.id}
                          disabled={processingId === tbl.id}
                          onEdit={() => setEditingStreamId(tbl.id)}
                          onCancelEdit={() => setEditingStreamId(null)}
                          onSaveStream={(url) => {
                            setEditingStreamId(null);
                            handleSaveStreamInline(tbl.id, url);
                          }}
                          onViewStream={(url) => openStreamUrl(url)}
                          onActions={(anchor) => setTableActionsMenu({ anchor, id: tbl.id })}
                        />
                      );
                    })}
                  </View>
                )}
              </View>

              {/* RIGHT — sticky Tournament Summary + tools */}
              <View style={styles.ptSummaryCol}>
                <View style={styles.summaryCard}>
                  <Text allowFontScaling={false} style={styles.summaryTitle}>Tournament Summary</Text>
                  <Text allowFontScaling={false} style={styles.ptSummarySub}>
                    Quick overview and tools for this tournament.
                  </Text>
                  <View style={styles.sumDivider} />
                  <View style={styles.ptSumRow}>
                    <Text allowFontScaling={false} style={styles.ptSumLabel}>Players Signed Up</Text>
                    <Text allowFontScaling={false} style={styles.ptSumValue}>{signedUp}</Text>
                  </View>
                  <View style={styles.ptSumRow}>
                    <Text allowFontScaling={false} style={styles.ptSumLabel}>Pool Tables</Text>
                    <Text allowFontScaling={false} style={styles.ptSumValue}>{poolTablesCount}</Text>
                  </View>
                  <View style={styles.ptSumRow}>
                    <Text allowFontScaling={false} style={styles.ptSumLabel}>Available Tables</Text>
                    <Text allowFontScaling={false} style={styles.ptSumValue}>{availableCount}</Text>
                  </View>

                  <View style={styles.sumDivider} />
                  <Text allowFontScaling={false} style={styles.ptSumSection}>Quick Actions</Text>
                  <TouchableOpacity
                    style={styles.ptBulkBtnFull}
                    onPress={() => setBulkModalOpen(true)}
                    disabled={tableBusy}
                  >
                    <Text allowFontScaling={false} style={styles.ptBulkBtnText}>+ Bulk Add Pool Tables</Text>
                  </TouchableOpacity>

                  <View style={styles.ptHelpCard}>
                    <Text allowFontScaling={false} style={styles.ptHelpTitle}>Need help?</Text>
                    <Text allowFontScaling={false} style={styles.ptHelpText}>
                      Each pool table can have an optional stream link for spectators (YouTube,
                      Twitch, etc.). You can also bulk add multiple pool tables at once.
                    </Text>
                  </View>

                  <TouchableOpacity
                    style={[styles.lockBtn, styles.summaryContinueBtn, !setupStepComplete.tables && styles.btnDisabled]}
                    onPress={() => advanceToNextStep("prizepool")}
                    disabled={!setupStepComplete.tables}
                  >
                    <Text allowFontScaling={false} style={styles.lockBtnText}>Continue to Prize Pool →</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </ScrollView>

          {bulkModalNode}
          {renameModalNode}
          {tableActionsMenu &&
            (() => {
              const tbl = hub.tables.find((t) => t.id === tableActionsMenu.id);
              if (!tbl) return null;
              const occupied = !!tableMatch[tbl.id];
              const hasStream = !!(tbl.stream_link && tbl.stream_link.trim());
              const items: { label: string; danger?: boolean; onPress: () => void }[] = [
                { label: "Rename Pool Table", onPress: () => openRenameModal(tbl.id) },
              ];
              // Manual status is Available / Unavailable only; "In Use" is automatic and its
              // status is locked while a match is assigned (occupied).
              if (!occupied) {
                if (tbl.status !== "available")
                  items.push({ label: "Mark Available", onPress: () => handleSetTableStatus(tbl.id, "available") });
                if (tbl.status !== "unavailable")
                  items.push({ label: "Mark Unavailable", onPress: () => handleSetTableStatus(tbl.id, "unavailable") });
              }
              // Stream link is added inline on the card; when one exists, Actions can reopen the
              // inline editor (prefilled) or remove it.
              if (hasStream) {
                items.push({ label: "Edit Stream Link", onPress: () => setEditingStreamId(tbl.id) });
                items.push({ label: "Remove Stream Link", danger: true, onPress: () => handleRemoveStreamLink(tbl.id) });
              }
              // Remove Pool Table is offered only when not occupied (preserves the prior
              // in-use delete safety), and keeps its existing confirmation.
              if (!occupied)
                items.push({ label: "Remove Pool Table", danger: true, onPress: () => handleDeleteTable(tbl.id) });
              return (
                <WebActionsMenu
                  anchorRef={tableActionsMenu.anchor}
                  items={items}
                  onClose={() => setTableActionsMenu(null)}
                />
              );
            })()}
        </View>
      );
    }

    return (
    <View>
      <View style={styles.readyBanner}>
        <Text allowFontScaling={false} style={styles.readyBannerNum}>
          {readyPlayers.length}
        </Text>
        <Text allowFontScaling={false} style={styles.readyBannerLabel}>
          Players Signed Up
        </Text>
      </View>

      {!hub.tablesReady && (
        <View style={styles.section}>
          <Text allowFontScaling={false} style={styles.hint}>
            Tables need the database update applied before they can be saved.
          </Text>
        </View>
      )}

      {/* Add Tables — collapsible (auto-minimized once the tournament is live) */}
      <View style={styles.section}>
        <TouchableOpacity
          style={styles.collapseHead}
          activeOpacity={0.7}
          onPress={() => setAddTablesOpen((o) => !o)}
        >
          <Text allowFontScaling={false} style={styles.sectionTitle}>
            Add and Remove Tables
          </Text>
          <Text allowFontScaling={false} style={styles.collapseCaret}>
            {addTablesOpen ? "▾" : "▸"}
          </Text>
        </TouchableOpacity>
        {addTablesOpen && (
          <>
          <View style={styles.tableAddRow}>
          <TextInput
            allowFontScaling={false}
            style={[styles.input, { flex: 1 }]}
            value={singleTableLabel}
            onChangeText={setSingleTableLabel}
            placeholder="Label (e.g. 9ft) — optional"
            placeholderTextColor={COLORS.textMuted}
          />
          <TextInput
            allowFontScaling={false}
            style={[styles.input, { width: webSc(60) }]}
            value={singleTableNum}
            onChangeText={(v) => setSingleTableNum(v.replace(/[^0-9]/g, ""))}
            placeholder="#"
            placeholderTextColor={COLORS.textMuted}
            keyboardType="numeric"
            maxLength={3}
          />
          <TouchableOpacity
            style={styles.tableAddBtn}
            onPress={handleAddTable}
            disabled={tableBusy}
          >
            <Text allowFontScaling={false} style={styles.tableAddBtnText}>
              Add
            </Text>
          </TouchableOpacity>
        </View>

        <Text allowFontScaling={false} style={styles.fieldLabel}>
          Bulk add (range)
        </Text>
        <View style={styles.tableAddRow}>
          <TextInput
            allowFontScaling={false}
            style={[styles.input, { flex: 1 }]}
            value={bulkLabel}
            onChangeText={setBulkLabel}
            placeholder="Label (e.g. 7ft) — optional"
            placeholderTextColor={COLORS.textMuted}
          />
        </View>
        <View style={styles.tableAddRow}>
          <TextInput
            allowFontScaling={false}
            style={[styles.input, { width: webSc(70) }]}
            value={bulkFrom}
            onChangeText={(v) => setBulkFrom(v.replace(/[^0-9]/g, ""))}
            placeholder="From"
            placeholderTextColor={COLORS.textMuted}
            keyboardType="numeric"
            maxLength={3}
          />
          <TextInput
            allowFontScaling={false}
            style={[styles.input, { width: webSc(70) }]}
            value={bulkTo}
            onChangeText={(v) => setBulkTo(v.replace(/[^0-9]/g, ""))}
            placeholder="To"
            placeholderTextColor={COLORS.textMuted}
            keyboardType="numeric"
            maxLength={3}
          />
          <TouchableOpacity
            style={[styles.tableAddBtn, { flex: 1 }]}
            onPress={handleBulkAddTables}
            disabled={tableBusy}
          >
            <Text allowFontScaling={false} style={styles.tableAddBtnText}>
              Bulk Add
            </Text>
          </TouchableOpacity>
        </View>
          </>
        )}

        {/* Tables list — always visible. Tap a row to edit; X to remove. */}
        <Text allowFontScaling={false} style={styles.tablesListLabel}>
          Tables ({hub.tables.length})
        </Text>
        {hub.tables.length === 0 ? (
          <Text allowFontScaling={false} style={styles.hint}>
            No tables yet. Add tables above.
          </Text>
        ) : (
          <View style={isWeb ? styles.tableGrid : undefined}>
          {hub.tables.map((tbl) => {
            const occupiedBy = tableMatch[tbl.id] ?? null;
            const effStatus: TableStatus = occupiedBy ? "in_use" : tbl.status;
            const color = tableStatusColor(effStatus);
            return (
              <View key={tbl.id} style={[styles.tableRow, isWeb && styles.tableRowWeb]}>
                <TouchableOpacity
                  style={styles.tableRowMain}
                  activeOpacity={0.75}
                  onPress={() => setEditingTableId(tbl.id)}
                >
                  <View style={styles.tableRowLeft}>
                    <Text allowFontScaling={false} style={styles.tableRowName} numberOfLines={1}>
                      Table {tbl.table_number}
                      {tbl.label ? ` — ${tbl.label}` : ""}
                    </Text>
                    {occupiedBy && (
                      <>
                        <Text allowFontScaling={false} style={styles.tableRowSub} numberOfLines={1}>
                          In use · {occupiedBy.label}
                        </Text>
                        <Text allowFontScaling={false} style={styles.tableRowNames} numberOfLines={1}>
                          {occupiedBy.p1Name ?? "TBD"} vs {occupiedBy.p2Name ?? "TBD"}
                        </Text>
                      </>
                    )}
                  </View>
                  <View style={styles.tableRowRight}>
                    {tbl.is_streaming && (
                      <Text allowFontScaling={false} style={styles.streamLive}>
                        ● LIVE
                      </Text>
                    )}
                    <View
                      style={[
                        styles.statusChip,
                        { backgroundColor: color + "22", borderColor: color },
                      ]}
                    >
                      <Text allowFontScaling={false} style={[styles.statusChipText, { color }]}>
                        {TABLE_STATUS_LABEL[effStatus]}
                      </Text>
                    </View>
                    <Text allowFontScaling={false} style={styles.tableRowChevron}>
                      ›
                    </Text>
                  </View>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.tableRemoveBtn}
                  onPress={() => handleDeleteTable(tbl.id)}
                  disabled={!!occupiedBy}
                  hitSlop={8}
                >
                  <Text
                    allowFontScaling={false}
                    style={[styles.tableRemoveText, occupiedBy && styles.tableRemoveOff]}
                  >
                    ✕
                  </Text>
                </TouchableOpacity>
              </View>
            );
          })}
          </View>
        )}
      </View>

      {/* Table edit sheet — tap a table card to change status / streaming / remove */}
      {editModalNode(false)}
    </View>
    );
  };

  const renderReview = () => {
    const started = hub.phase === "running";
    const finished = hub.phase === "completed" || hub.phase === "archived";
    const checks = [
      { key: "settings" as TabKey, label: "Settings completed", ok: stepComplete.settings },
      {
        key: "players" as TabKey,
        label: `Players ready (${readyPlayers.length})`,
        ok: stepComplete.players,
      },
      { key: "tables" as TabKey, label: "Tables configured", ok: stepComplete.tables },
      { key: "bracket" as TabKey, label: "Bracket generated", ok: stepComplete.bracket },
    ];
    const allOk = checks.every((c) => c.ok);

    const t = hub.tournament;
    const raceSummary =
      raceConfig.mode === "fixed"
        ? `Fixed · Race to ${raceConfig.fixedWinners}`
        : raceConfig.mode === "groups"
          ? `Groups · ${raceConfig.groups.length} group${raceConfig.groups.length === 1 ? "" : "s"}`
          : `Fargo differential · min ${raceConfig.diffMin}`;
    const entryFee = Number(t?.entry_fee) || 0;
    const addedMoney = Number(t?.added_money) || 0;
    const potCount = (t?.side_pots ?? []).length;
    const tablesCount = hub.tables.length;
    const bracket = hub.bracket;

    return (
      <View>
        <Section title="Overview">
          <BracketCalc label="Tournament" value={t?.name ?? "—"} />
          <BracketCalc label="Game" value={t?.game_type ?? "—"} />
          <BracketCalc label="Format" value={prettyFormat(t?.tournament_format ?? "—")} />
          <BracketCalc
            label="Date"
            value={`${t?.tournament_date ?? "—"}${t?.start_time ? ` · ${t.start_time}` : ""}`}
          />
          <BracketCalc label="Venue" value={t?.venues?.venue ?? "—"} />
          <BracketCalc label="Race" value={raceSummary} />
          <BracketCalc
            label="Entry / Added"
            value={`$${entryFee}${addedMoney ? ` · +$${addedMoney}` : ""}`}
          />
          {potCount > 0 && (
            <BracketCalc label="Side pots" value={potCount} />
          )}
          <BracketCalc
            label="Prize payouts"
            value={prizeComplete ? "Set" : "Incomplete"}
          />
          <BracketCalc
            label="Players"
            value={`${readyPlayers.length} ready · ${statusCounts.prereg} pre-reg · ${statusCounts.no_show} no-show`}
          />
          <BracketCalc label="Tables" value={tablesCount} />
          <BracketCalc
            label="Bracket"
            value={
              bracket
                ? `${bracket.bracketSize}-player · ${bracket.byes} bye${bracket.byes === 1 ? "" : "s"} · Draw #${bracket.drawNumber}`
                : "Not drawn"
            }
          />
        </Section>

        <Section title={started || finished ? "Review" : "Review & Start"}>
          <Text allowFontScaling={false} style={styles.hint}>
            Settings define the rules · Players define the field · Tables define
            the room · Bracket builds the draw.
          </Text>
          {checks.map((c) => (
            <View key={c.key} style={styles.reviewRow}>
              <View
                style={[
                  styles.reviewDot,
                  { backgroundColor: c.ok ? COLORS.success : COLORS.border },
                ]}
              />
              <Text allowFontScaling={false} style={styles.reviewLabel}>
                {c.label}
              </Text>
              {!c.ok && !started && !finished && (
                <TouchableOpacity onPress={() => setActiveTab(c.key)}>
                  <Text allowFontScaling={false} style={styles.reviewGo}>
                    Go to {TAB_LABELS[c.key]}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          ))}
        </Section>

        {started ? (
          <>
            <Text allowFontScaling={false} style={styles.reviewStatus}>
              Tournament is running
            </Text>
            <TouchableOpacity
              style={[styles.startBtn, isWeb && styles.stepBtnWeb]}
              onPress={() => setActiveTab("matches")}
            >
              <Text allowFontScaling={false} style={styles.startBtnText}>
                Go to Matches
              </Text>
            </TouchableOpacity>
          </>
        ) : finished ? (
          <Text allowFontScaling={false} style={styles.reviewStatus}>
            Tournament completed
          </Text>
        ) : (
          <>
            <TouchableOpacity
              style={[
                styles.startBtn,
                (!allOk || hub.isMutatingLive) && styles.btnDisabled,
                isWeb && styles.stepBtnWeb,
              ]}
              onPress={handleStartTournament}
              disabled={!allOk || hub.isMutatingLive}
            >
              <Text allowFontScaling={false} style={styles.startBtnText}>
                Start Tournament
              </Text>
            </TouchableOpacity>
            {!allOk && (
              <Text allowFontScaling={false} style={styles.startHint}>
                Finish the unchecked steps above to start the tournament.
              </Text>
            )}
          </>
        )}
      </View>
    );
  };

  const renderBracket = () => {
    const ready = readyPlayers;
    if (ready.length < 2) {
      return (
        <TabPlaceholder
          locked={false}
          title="Bracket / Draw"
          body="You need at least 2 Ready players to build the bracket. Mark players Ready on the Players tab first."
        />
      );
    }
    const recommended = recommendedBracketSize(ready.length);
    const size = bracketSizeSel ?? hub.bracket?.bracketSize ?? recommended;
    const format = hub.tournament?.tournament_format ?? "single-elimination";
    const tablesAvail = Math.max(
      1,
      hub.tables.filter((t) => t.status !== "unavailable").length ||
        hub.tables.length,
    );
    const avg = averageRace(ready, raceConfig);
    const minPerGame = minutesPerGameForType(hub.tournament?.game_type ?? "");
    const stats = computeBracketStats(
      ready.length,
      size,
      format,
      avg,
      tablesAvail,
      minPerGame,
    );
    // Locked whenever a bracket exists (drawn / running / completed). Drawing is
    // only available pre-bracket; after that, redraw goes through Reopen & Redraw.
    const locked = settingsLocked;
    const bracket = hub.bracket;
    const sizeOptions = STANDARD_SIZES.filter((s) => s >= ready.length);
    const fmtHours = (h: number) => `${h.toFixed(1)} hr`;

    const racePreview = () => {
      if (raceConfig.mode === "groups") {
        if (raceConfig.groups.length === 0)
          return (
            <Text allowFontScaling={false} style={styles.hint}>
              No race groups configured.
            </Text>
          );
        return raceConfig.groups.map((g) => {
          const count = ready.filter(
            (p) =>
              p.fargo != null &&
              p.fargo >= g.minFargo &&
              (g.maxFargo <= 0 || p.fargo <= g.maxFargo),
          ).length;
          const range = g.maxFargo > 0 ? `${g.minFargo}–${g.maxFargo}` : `${g.minFargo}+`;
          return (
            <Text key={g.id} allowFontScaling={false} style={styles.raceAssignRow}>
              {`Group ${g.label || "?"} (${range}) — ${count} ${count === 1 ? "player" : "players"} • Race to ${g.raceTo}`}
            </Text>
          );
        });
      }
      if (raceConfig.mode === "differential")
        return (
          <Text allowFontScaling={false} style={styles.hint}>
            Each match races by Fargo gap: lower player to {raceConfig.diffMin},
            higher +1 game per {raceConfig.diffPerGame} pts
            {raceConfig.diffMax != null ? `, capped at ${raceConfig.diffMax}` : ""}
            .
          </Text>
        );
      return (
        <Text allowFontScaling={false} style={styles.hint}>
          Everyone races to {raceConfig.fixedWinners}.
        </Text>
      );
    };

    // Shared building blocks so the wide-web two-column and the native single-column reuse the
    // SAME control sections (no divergence). Summary/Calculation content is consolidated into
    // the right sidebar on wide web, and kept as full-width cards on native.
    const staleBanner = bracket && !locked ? (
      <View style={styles.staleBanner}>
        <Text allowFontScaling={false} style={styles.staleBannerText}>
          Showing a previous draw (Draw #{bracket.drawNumber}). Draw again to apply changes.
        </Text>
      </View>
    ) : null;
    const bracketSizeSection = !locked ? (
      <Section title="Bracket Size">
        <Text allowFontScaling={false} style={styles.hint}>
          Recommended {recommended} for {ready.length} Ready players.
        </Text>
        <Dropdown
          hideCheck={isWeb}
          options={[
            ...sizeOptions.map((s) => ({ label: `${s} players`, value: String(s) })),
            { label: "256 players (Coming Soon)", value: "256" },
          ]}
          value={String(size)}
          onSelect={(v) => {
            if (v === "256") {
              Alert.alert("Coming Soon", "256-player brackets aren't available yet.");
              return;
            }
            setBracketSizeSel(Number(v));
          }}
        />
      </Section>
    ) : null;
    const drawTypeSection = !locked ? (
      <Section title="Draw Type">
        <Text allowFontScaling={false} style={styles.hint}>
          How first-round pairings are set.
        </Text>
        <Dropdown
          hideCheck={isWeb}
          options={DRAW_TYPE_OPTIONS}
          value={drawType}
          onSelect={(v) => {
            const dt = v as DrawType;
            if (!DRAW_TYPE_SUPPORTED.includes(dt)) {
              Alert.alert("Coming Soon", "Only Random Draw is available in this version.");
              return;
            }
            setDrawType(dt);
          }}
        />
      </Section>
    ) : null;
    const raceSection = <Section title="Race Assignment">{racePreview()}</Section>;
    const round1Section = bracket ? (
      <Section title={`Round 1 — ${bracket.round1.length} matches`}>
        {bracket.round1.map((m) => (
          <View key={m.matchNumber} style={styles.matchRow}>
            <Text allowFontScaling={false} style={styles.matchNum}>M{m.matchNumber}</Text>
            <Text allowFontScaling={false} style={styles.matchText} numberOfLines={2}>{matchLabel(m)}</Text>
          </View>
        ))}
      </Section>
    ) : null;
    const historyBtn = (hub.drawLog?.length ?? 0) > 0 ? (
      <TouchableOpacity style={styles.historyBtn} onPress={() => setShowDrawHistory(true)}>
        <Text allowFontScaling={false} style={styles.historyBtnText}>
          View Draw History ({hub.drawLog.length})
        </Text>
      </TouchableOpacity>
    ) : null;
    const simBtn = __DEV__ && hub.bracket ? (
      <TouchableOpacity style={styles.simBtn} onPress={handleSimulateHalf}>
        <Text allowFontScaling={false} style={styles.simBtnText}>{"🧪"} Simulate ~50% &amp; Start (dev)</Text>
      </TouchableOpacity>
    ) : null;

    // Wide-web: two-column with ONE consolidated sticky summary + Generate actions on the right.
    if (isWeb && winW >= 980) {
      const sumRow = (label: string, value: React.ReactNode) => (
        <View style={styles.ptSumRow}>
          <Text allowFontScaling={false} style={styles.ptSumLabel}>{label}</Text>
          <Text allowFontScaling={false} style={styles.ptSumValue}>{value}</Text>
        </View>
      );
      // Race-aware, dependency-respecting elapsed-time estimate (pure util). Reads per-side
      // fixed races from the persisted live_settings; groups/differential derive from the field.
      const ls = hub.tournament?.live_settings ?? {};
      const dur = estimateTournamentDuration({
        players: ready.length,
        format,
        tables: tablesAvail,
        minPerGame,
        cfg: raceConfig,
        field: ready,
        fixedLosers: ls.fixedRaceLosers,
        fixedFinals: ls.fixedRaceFinals,
      });
      const durText = dur.estElapsedHours == null ? "—" : fmtHours(dur.estElapsedHours);
      // Race Configuration rows — derived from the SAME raceConfig the left panel uses.
      const hasLosers = formatHasLosersSide(format);
      const raceModeLabel =
        raceConfig.mode === "groups"
          ? "A/B/C Race Groups"
          : raceConfig.mode === "differential"
            ? "Fargo Differential"
            : "Fixed Race";
      return (
        <View style={styles.ptPaneWeb}>
          <ScrollView
            style={styles.scrollFlex}
            contentContainerStyle={styles.ptScrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.ptTwoCol}>
              {/* LEFT — configuration only. Bracket Size + Draw Type share one row on wide web. */}
              <View style={styles.ptMainCol}>
                {staleBanner}
                {!locked ? (
                  <View style={styles.bracketConfigRow}>
                    <View style={styles.bracketConfigCol}>{bracketSizeSection}</View>
                    <View style={styles.bracketConfigCol}>{drawTypeSection}</View>
                  </View>
                ) : null}
                {raceSection}
                {round1Section}
                {historyBtn}
                {simBtn}
              </View>

              {/* RIGHT — one consolidated sticky Tournament Summary + Generate action */}
              <View style={styles.ptSummaryCol}>
                <View style={styles.summaryCard}>
                  <Text allowFontScaling={false} style={styles.summaryTitle}>Tournament Summary</Text>
                  <View style={styles.sumDivider} />
                  {sumRow("Players Added", ready.length)}
                  {sumRow("Recommended Size", recommended)}
                  {sumRow("Bracket Size", size)}
                  {sumRow("Byes", stats.byes)}
                  {sumRow("Format", shortFormat(format))}
                  {sumRow("Tables Available", tablesAvail)}
                  {sumRow("Estimated Matches", stats.totalMatches)}
                  {sumRow("Est. Min / Game", stats.minPerGame)}
                  {sumRow("Est. Tournament Time", durText)}
                  <View style={styles.sumDivider} />
                  {sumRow("Winner Side", stats.winnerSideMatches)}
                  {sumRow("Loser Side", stats.loserSideMatches)}

                  {/* Race Configuration — reflects the ACTIVE race mode (same raceConfig as
                      the left Race Assignment panel). */}
                  <View style={styles.sumDivider} />
                  <Text allowFontScaling={false} style={styles.ptSumSection}>Race Configuration</Text>
                  {sumRow("Race", raceModeLabel)}
                  {raceConfig.mode === "fixed" && (
                    hasLosers ? (
                      <>
                        {sumRow("Winners", `Race to ${raceConfig.fixedWinners}`)}
                        {sumRow("Losers", `Race to ${ls.fixedRaceLosers ?? raceConfig.fixedWinners}`)}
                        {sumRow("Finals", `Race to ${ls.fixedRaceFinals ?? raceConfig.fixedWinners}`)}
                      </>
                    ) : (
                      <>
                        {sumRow("Match", `Race to ${raceConfig.fixedWinners}`)}
                        {ls.fixedRaceFinals != null && ls.fixedRaceFinals !== raceConfig.fixedWinners &&
                          sumRow("Finals", `Race to ${ls.fixedRaceFinals}`)}
                      </>
                    )
                  )}
                  {raceConfig.mode === "groups" && (
                    raceConfig.groups.length > 0 ? (
                      <>
                        {raceConfig.groups.map((g) => (
                          <View key={g.id} style={styles.ptSumRow}>
                            <Text allowFontScaling={false} style={styles.ptSumLabel}>
                              {g.label || "?"}
                              {g.minFargo > 0 || g.maxFargo > 0 ? (
                                <Text style={styles.ptSumRange}>{`  ${g.minFargo}–${g.maxFargo > 0 ? g.maxFargo : "+"}`}</Text>
                              ) : null}
                            </Text>
                            <Text allowFontScaling={false} style={styles.ptSumValue}>{`Race to ${g.raceTo}`}</Text>
                          </View>
                        ))}
                      </>
                    ) : (
                      <Text allowFontScaling={false} style={styles.startHintSidebar}>No race groups configured.</Text>
                    )
                  )}
                  {raceConfig.mode === "differential" && (
                    <>
                      {sumRow("Minimum Race", raceConfig.diffMin)}
                      {sumRow("Points / Game", raceConfig.diffPerGame)}
                      {sumRow("Maximum Race", raceConfig.diffMax ?? "No Limit")}
                    </>
                  )}

                  <View style={styles.ppSidebarActions}>
                    {!settingsLocked ? (
                      <>
                        {!prizeComplete && (
                          <Text allowFontScaling={false} style={styles.startHintSidebar}>
                            Complete the prize pool before drawing the bracket.
                          </Text>
                        )}
                        <View style={styles.ppSidebarBtnRow}>
                          <TouchableOpacity
                            style={[styles.startBtn, hub.isDrawing && styles.startBtnRunning, !hub.isDrawing && !prizeComplete && styles.btnDisabled]}
                            onPress={handleDrawPress}
                            disabled={hub.isDrawing || !prizeComplete}
                          >
                            {hub.isDrawing ? (
                              <View style={styles.btnRow}>
                                <ActivityIndicator size="small" color={COLORS.white} />
                                <Text allowFontScaling={false} style={styles.startBtnText}>Generating…</Text>
                              </View>
                            ) : (
                              <Text allowFontScaling={false} style={styles.startBtnText}>
                                {hub.bracket ? "Regenerate Bracket" : "Generate Bracket"}
                              </Text>
                            )}
                          </TouchableOpacity>
                        </View>
                      </>
                    ) : (
                      <View style={styles.ppSidebarBtnRow}>
                        <TouchableOpacity
                          style={[styles.reopenBtn]}
                          onPress={() => {
                            setRedrawReason("");
                            setRedrawVisible(true);
                          }}
                        >
                          <Text allowFontScaling={false} style={styles.reopenBtnText}>Reopen &amp; Redraw</Text>
                        </TouchableOpacity>
                        {hub.phase === "bracket_drawn" && (
                          <TouchableOpacity
                            style={[styles.startBtn, styles.ppSidebarBtnWide, hub.isMutatingLive && styles.btnDisabled]}
                            onPress={handleStartTournament}
                            disabled={hub.isMutatingLive}
                          >
                            <Text allowFontScaling={false} style={styles.startBtnText}>Start Tournament</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    )}
                  </View>
                </View>
              </View>
            </View>
          </ScrollView>
        </View>
      );
    }

    return (
      <View>
        {staleBanner}

        <Section title="Summary">
          <View style={styles.sumGrid}>
            <BracketSum label="Players Added" value={ready.length} />
            <BracketSum label="Recommended Size" value={recommended} />
            <BracketSum label="Bracket Size" value={size} />
            <BracketSum label="Byes" value={stats.byes} />
            <BracketSum label="Format" value={shortFormat(format)} />
            <BracketSum label="Tables Available" value={tablesAvail} />
            <BracketSum label="Est. Matches" value={stats.totalMatches} />
            <BracketSum label="Est. Time" value={fmtHours(stats.estCompletionHours)} />
          </View>
        </Section>

        {bracketSizeSection}
        {drawTypeSection}
        {raceSection}

        <Section title="Calculation Summary">
          <BracketCalc label="Players" value={stats.players} />
          <BracketCalc label="Bracket Size" value={stats.bracketSize} />
          <BracketCalc label="Total Byes" value={stats.byes} />
          <BracketCalc label="Total Matches" value={stats.totalMatches} />
          <BracketCalc label="Winner Side" value={stats.winnerSideMatches} />
          <BracketCalc label="Loser Side" value={stats.loserSideMatches} />
          <BracketCalc label="Estimated Games" value={stats.estGames} />
          <BracketCalc label="Avg Min / Game" value={stats.minPerGame} />
          <BracketCalc label="Tables Available" value={tablesAvail} />
          <BracketCalc label="Est. Completion" value={fmtHours(stats.estCompletionHours)} />
          <Text allowFontScaling={false} style={[styles.hint, { marginTop: webSc(SPACING.sm) }]}>
            Estimated time by table count
          </Text>
          {stats.byTable.map((b) => (
            <BracketCalc key={b.tables} label={`Using ${b.tables} tables`} value={fmtHours(b.hours)} />
          ))}
        </Section>

        {round1Section}
        {historyBtn}
        {simBtn}
      </View>
    );
  };

  // ── Elimination Live Dashboard (web/desktop control center) ──────────────────
  const renderEliminationDashboard = () => {
    const now = nowMs();
    const readyAtMap = computeReadyAtMap(hub.bracket, hub.matchState);
    const entries = buildQueueEntries(liveMatches, readyAtMap, now);
    const tblNum = (id: number | null | undefined) =>
      id == null ? 0 : hub.tables.find((t) => t.id === id)?.table_number ?? 0;
    const activeMatches = liveMatches
      .filter((m) => m.tableId != null && m.status !== "completed" && !m.bye && !m.empty)
      .sort((a, b) => tblNum(a.tableId) - tblNum(b.tableId));
    const startableCount = liveMatches.filter(isStartable).length;

    const eliminated = computeEliminatedRegIds(liveMatches).length;
    const durations = liveMatches
      .filter((m) => m.status === "completed" && !m.bye && m.startedAt && m.completedAt)
      .map((m) => (new Date(m.completedAt as string).getTime() - new Date(m.startedAt as string).getTime()) / 60000)
      .filter((d) => d >= 0);
    const kpis: DashboardKpis = {
      playersRemaining: Math.max(0, readyPlayers.length - eliminated),
      activeMatches: liveMatches.filter((m) => m.status === "in_progress").length,
      waiting: entries.length,
      tablesInUse: hub.tables.filter((t) => tableOccupancy[t.id]).length,
      tablesAvailable: freeTables(hub.tables, tableOccupancy).length,
      completed: liveMatches.filter((m) => m.status === "completed" && !m.bye && !m.empty).length,
      avgMatchText: durations.length
        ? `${Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)}m`
        : "—",
    };

    return (
      <>
        <EliminationDashboard
          kpis={kpis}
          activeMatches={activeMatches}
          schedule={projectedSchedule.scheduled}
          mode={hub.autoAssignMode as AutoAssignMode}
          events={tournamentEvents}
          startableCount={startableCount}
          busy={dashBusy}
          onSetMode={handleSetAutoMode}
          onAutoAssign={handleDashAutoAssign}
          onStartAll={handleStartAll}
          onAction={(m, step) => setDashboardSheet({ match: m, step })}
          onOpenPage={(tab) => setActiveTab(tab)}
        />
        {dashboardSheet && (
          <MatchActionsModal
            match={dashboardSheet.match}
            initialStep={dashboardSheet.step}
            tables={hub.tables}
            occupancy={tableOccupancy}
            onPatch={(matchId, patch) => runMatchPatch(matchId, patch)}
            onClose={() => setDashboardSheet(null)}
            busy={dashBusy}
          />
        )}
      </>
    );
  };

  const renderTab = () => {
    // Chip tournaments render the chip engine inline for their pages (Settings /
    // Prize Pool still use the shared views below).
    if (isChip) {
      const cp = chipPageForTab(selectedPhase, activeTab);
      if (cp) {
        return (
          <ChipManageScreen
            embedded
            id={tournamentId}
            embeddedPage={cp}
            actionsOpen={chipActionsOpen}
            onActionsOpenChange={setChipActionsOpen}
            onRequestScrollTop={() => pageScrollRef.current?.scrollTo({ x: 0, y: 0, animated: true })}
            onNavigate={(tab) => {
              setSelectedPhase("live");
              // "dashboard" is the Live "matches" tab (the shuffle-transition hub).
              handleTabPress(tab === "dashboard" ? "matches" : tab);
            }}
            onGoLive={() => {
              setSelectedPhase("live");
              handleTabPress("matches");
            }}
            onOpenSettings={() => handleSelectPage("setup", "settings")}
            onOpenResults={() => handleSelectPage("results", "standings")}
            onOpenPayouts={() => handleSelectPage("results", "payouts")}
            onOpenSetupPage={(tab) => handleSelectPage("setup", tab)}
            reviewPrize={chipReviewPrize}
            onReadyCountChange={setEmbeddedChipReady}
            onReadinessChange={setEmbeddedChipReadiness}
            onStarted={() => hub.setLiveStateLocal("in_progress")}
            onFinished={() => hub.setLiveStateLocal("finished")}
            onReopened={() => hub.setLiveStateLocal("in_progress")}
            onTableCountChange={setEmbeddedChipTables}
            reloadSignal={chipRosterTick}
          />
        );
      }
    }
    switch (activeTab) {
      case "settings":
        return renderSettings();
      case "players":
        return renderPlayers();
      case "tables":
        return renderTables();
      case "prizepool":
        return prizeForm ? (
          <PrizePoolView
            config={prizeForm}
            onChange={setPrizeForm}
            locked={prizeLocked}
            players={prizePlayers}
            entryFee={prizeEntryFee}
            addedMoney={prizeAddedMoney}
            sidePots={prizeSidePots}
            fees={prizeFees}
            feesAddedOnTop={prizeFeesOnTop}
            summaryFooter={prizeSummaryFooter}
          />
        ) : null;
      case "bracket":
        return renderBracket();
      case "review":
        return renderReview();
      case "dashboard":
        return renderEliminationDashboard();
      case "matches":
        return (
          <MatchesView
            matches={liveMatches}
            tables={hub.tables}
            onSetMatchState={(vars) => runMatchPatch(vars.matchId, vars.patch)}
            occupancy={tableOccupancy}
          />
        );
      case "queue":
        return (
          <>
            <QueueView
              matches={liveMatches}
              tables={hub.tables}
              schedule={projectedSchedule}
              occupancy={tableOccupancy}
              mode={hub.autoAssignMode as AutoAssignMode}
              queueOrder={hub.queueOrder}
              onAssign={handleQueueAssign}
              onAssignStart={handleQueueAssignStart}
              onStart={handleQueueStart}
              onUnassign={handleQueueUnassign}
              onAssignMany={handleQueueAssignMany}
              onUnassignMany={handleQueueUnassignMany}
              onSetMode={handleSetAutoMode}
              onSetQueueOrder={handleSetQueueOrder}
              onManageMatch={(m, step) => setDashboardSheet({ match: m, step })}
              playersTotal={readyPlayers.length}
              playersRemaining={readyPlayers.length - computeEliminatedRegIds(liveMatches).length}
            />
            {dashboardSheet && (
              <MatchActionsModal
                match={dashboardSheet.match}
                initialStep={dashboardSheet.step}
                tables={hub.tables}
                occupancy={tableOccupancy}
                onPatch={(matchId, patch) => runMatchPatch(matchId, patch)}
                onClose={() => setDashboardSheet(null)}
                busy={dashBusy}
              />
            )}
          </>
        );
      case "stats":
        return <StatsView matches={liveMatches} />;
      case "standings":
        return <StandingsView matches={liveMatches} />;
      case "results":
        return (
          <TabPlaceholder
            locked={false}
            title="Standings"
            body="Final placements appear here after play completes (Phase 3)."
          />
        );
      case "payouts":
        return (
          <PayoutsView
            matches={liveMatches}
            config={hub.prizePool}
            entryPool={prizeEntryPool}
            sidePotPools={prizeSidePotPools}
            sidePotEntrants={sidePotEntrants}
          />
        );
      case "history":
        return <MatchHistoryView matches={liveMatches} />;
      case "summary":
        return <SummaryView matches={liveMatches} tournament={hub.tournament} />;
      default:
        return null;
    }
  };

  if (hub.isLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text allowFontScaling={false} style={styles.loadingText}>
          Loading tournament...
        </Text>
      </View>
    );
  }

  // "Start Registration" should reflect the LIVE form, not just the last-saved
  // tournament — the button saves first, so a fully-filled form can open
  // registration without a separate Save + refresh. Venue is set at creation
  // (not in this form), so it comes from the loaded tournament.
  // SHARED completion check on the LIVE form (same rules as the badge / Players gate).
  // missingSettingsItems is the single rule set; keys drive the red field errors + scroll,
  // labels drive the "Still needed…" summary. Both recompute from the LIVE form each render,
  // so a fixed field clears its error immediately (no need to re-tap Start Registration).
  const formMissingItems = form
    ? missingSettingsItems(formToSettingsInput(form, hub.tournament?.venue_id ?? null))
    : [{ key: "name" as SettingsFieldKey, label: "Tournament Name" }];
  const formMissingFields = formMissingItems.map((m) => m.label);
  const missingKeys = new Set<SettingsFieldKey>(formMissingItems.map((m) => m.key));
  const formRequiredComplete = !!form && formMissingItems.length === 0;

  // Setup sidebar actions (wide-web elimination): Settings under the Live Preview, Prize Pool
  // under the Summary. Precomputed so the render path stays simple. Same handlers + disabled
  // logic as the removed footers; chip/native keep their footers.
  const settingsSidebarActions =
    !isChip && form && !settingsLocked ? (
      <View style={styles.ppSidebarActions}>
        {!isExternal && !formRequiredComplete && (
          <Text allowFontScaling={false} style={styles.startHintSidebar}>
            Still needed to open registration: {formMissingFields.join(", ")}.
          </Text>
        )}
        <View style={styles.ppSidebarBtnRow}>
          {settingsUnlocked ? (
            <>
              <TouchableOpacity
                style={[styles.saveBtn, hub.isSaving && styles.btnDisabled]}
                onPress={relockSettingsNoSave}
                disabled={hub.isSaving}
              >
                <Text allowFontScaling={false} style={styles.saveBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.startBtn, styles.ppSidebarBtnWide, hub.isSaving && styles.btnDisabled]}
                onPress={handleSaveAndLock}
                disabled={hub.isSaving}
              >
                <Text allowFontScaling={false} style={styles.startBtnText}>
                  {hub.isSaving ? "Saving..." : "Save & Lock"}
                </Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <TouchableOpacity
                style={[styles.saveBtn, hub.isSaving && styles.btnDisabled]}
                onPress={isExternal ? () => setSubmitCountdown(5) : handleSave}
                disabled={hub.isSaving}
              >
                <Text allowFontScaling={false} style={styles.saveBtnText}>
                  {isExternal ? "Submit Tournament" : hub.isSaving ? "Saving..." : "Save Settings"}
                </Text>
              </TouchableOpacity>
              {!isExternal && (
                <TouchableOpacity
                  style={[styles.startBtn, styles.ppSidebarBtnWide, (hub.isSaving || hub.isMutatingLive) && styles.btnDisabled]}
                  onPress={beginRegistration}
                  disabled={hub.isSaving || hub.isMutatingLive}
                >
                  <Text allowFontScaling={false} style={styles.startBtnText}>Start Registration</Text>
                </TouchableOpacity>
              )}
            </>
          )}
        </View>
      </View>
    ) : null;
  const prizeSummaryFooter =
    isWeb && winW >= 980 && !isChip && !prizeLocked ? (
      <View style={styles.ppSidebarActions}>
        {!prizeComplete && (
          <Text allowFontScaling={false} style={styles.startHintSidebar}>
            Keep each pool&apos;s payouts within the available money to save.
          </Text>
        )}
        <View style={styles.ppSidebarBtnRow}>
          <TouchableOpacity
            style={[styles.saveBtn, (hub.isSavingPrizePool || !prizeComplete) && styles.btnDisabled]}
            onPress={handleSavePrizePool}
            disabled={hub.isSavingPrizePool || !prizeComplete}
          >
            <Text allowFontScaling={false} style={styles.saveBtnText}>
              {hub.isSavingPrizePool ? "Saving..." : "Save Prize Pool"}
            </Text>
          </TouchableOpacity>
          {!isExternal && (
            <TouchableOpacity
              style={[styles.startBtn, styles.ppSidebarBtnWide, !reviewUnlocked && styles.btnDisabled]}
              onPress={() => advanceToNextStep(terminalTab)}
              disabled={!reviewUnlocked}
            >
              <Text allowFontScaling={false} style={styles.startBtnText}>Continue to Bracket →</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    ) : undefined;

  // Red error for a required field: shown only AFTER the TD attempts Start Registration
  // (settingsValidationAttempted) AND the field is currently missing. Derived live, so it
  // disappears the moment the requirement is satisfied.
  const errFor = (key: SettingsFieldKey): string | undefined =>
    settingsValidationAttempted && missingKeys.has(key)
      ? FIELD_ERROR_MESSAGE[key]
      : undefined;
  // `*` marker for a required field, derived from the shared rules (format-aware for Race Type).
  const reqStar = (key: SettingsFieldKey): string =>
    isSettingsFieldRequired(key, form?.tournamentFormat) ? " *" : "";

  return (
    <View style={styles.container}>
      {Platform.OS === "ios" && (
        <InputAccessoryView nativeID={KB_DONE}>
          <View style={styles.kbDoneBar}>
            <TouchableOpacity onPress={() => Keyboard.dismiss()}>
              <Text allowFontScaling={false} style={styles.kbDoneText}>
                Done
              </Text>
            </TouchableOpacity>
          </View>
        </InputAccessoryView>
      )}

      {/* Phase 5: unified search-first Add Player flow (singles/elimination).
          The legacy AddPlayerModal component + handleAddPlayer/handleAddGuest are
          intentionally kept in this file (unrendered) until the new flow is verified
          on device, per the integration plan. */}
      <UnifiedRegisterModal
        visible={addModalVisible}
        onClose={() => setAddModalVisible(false)}
        tournamentId={tournamentId}
        mode="singles"
        entryFee={hub.tournament?.entry_fee ?? null}
        sidePots={parseSidePots(hub.tournament?.side_pots)}
        // Elimination Ready now requires EXPLICIT TD Fargo verification, which the Add modal
        // does not offer. So a newly-added player is never auto-Ready — they enter as
        // Registered and the TD verifies + marks Ready from the roster. Always false here.
        readyEval={() => false}
        onRegistered={() => hub.refetchRegistrations()}
        // Persist the TD's Entry-collected + side-pot selections onto the just-created
        // registration via the SAME authoritative field/path the Ready/Edit flow uses
        // (paid_entry / paid_side_pots, and — when markReady — the same checked_in
        // transition handleReady performs). No RPC or schema change. The modal only calls
        // this AFTER register_player_for_tournament succeeds, and surfaces a clear warning
        // (without a duplicate re-register) if this update fails.
        onPersistSelections={async (registrationId, sel) => {
          const updates = sel.markReady
            ? {
                status: "checked_in" as RegistrationStatus,
                checked_in_at: new Date().toISOString(),
                fargo_rating: sel.fargo,
                is_starter_rating: false,
                race_override: null,
                paid_entry: sel.paidEntry,
                paid_side_pots: sel.paidSidePots,
              }
            : { paid_entry: sel.paidEntry, paid_side_pots: sel.paidSidePots };
          await hub.updateRegistration({ id: registrationId, updates });
        }}
      />

      {/* External submit countdown — cancellable before it lists */}
      <Modal visible={submitCountdown !== null} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text allowFontScaling={false} style={styles.modalTitle}>
              Submitting Tournament…
            </Text>
            <Text allowFontScaling={false} style={styles.countdownNum}>
              {submitCountdown}
            </Text>
            <Text allowFontScaling={false} style={styles.modalHint}>
              Listing your tournament on Billiards. Tap cancel to make changes.
            </Text>
            <TouchableOpacity
              style={styles.modalButtonCancel}
              onPress={() => setSubmitCountdown(null)}
            >
              <Text allowFontScaling={false} style={styles.modalButtonCancelText}>
                Cancel
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Add Fee modal (Settings → Fees Deducted From Entry) */}
      {feeModalVisible && (
        <Modal
          transparent
          visible
          animationType="fade"
          onRequestClose={() => setFeeModalVisible(false)}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            style={styles.flexOne}
          >
            <DismissKeyboardWrap>
              <View style={styles.modalOverlay}>
                <DismissKeyboardWrap>
                  <View style={styles.modalContent}>
                    <Text allowFontScaling={false} style={styles.modalTitle}>
                      Add Fee
                    </Text>
                    <Text allowFontScaling={false} style={styles.fieldLabel}>
                      Fee Name *
                    </Text>
                    <TextInput
                      allowFontScaling={false}
                      style={styles.input}
                      value={feeModalName}
                      onChangeText={setFeeModalName}
                      placeholder="e.g. League Fee"
                      placeholderTextColor={COLORS.textMuted}
                      autoFocus
                    />
                    <Text
                      allowFontScaling={false}
                      style={[styles.fieldLabel, { marginTop: webSc(SPACING.md) }]}
                    >
                      Default amount (optional)
                    </Text>
                    <TextInput
                      allowFontScaling={false}
                      style={styles.input}
                      value={feeModalAmount}
                      onChangeText={(t) =>
                        setFeeModalAmount(sanitizeCurrencyInput(t))
                      }
                      placeholder="$0.00"
                      placeholderTextColor={COLORS.textMuted}
                      keyboardType="decimal-pad"
                      inputAccessoryViewID={
                        Platform.OS === "ios" ? KB_DONE : undefined
                      }
                    />
                    <View style={styles.modalButtons}>
                      <TouchableOpacity
                        style={styles.modalButtonCancel}
                        onPress={() => setFeeModalVisible(false)}
                      >
                        <Text
                          allowFontScaling={false}
                          style={styles.modalButtonCancelText}
                        >
                          Cancel
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[
                          styles.modalButtonConfirm,
                          !feeModalName.trim() && styles.btnDisabled,
                        ]}
                        disabled={!feeModalName.trim()}
                        onPress={() => {
                          // Normalize on Add (2 -> 2.00, .5 -> 0.50) to match the
                          // shared MoneyInput format used by every other fee.
                          addCustomFee(
                            feeModalName,
                            formatCurrency(feeModalAmount),
                          );
                          setFeeModalVisible(false);
                        }}
                      >
                        <Text
                          allowFontScaling={false}
                          style={styles.modalButtonConfirmText}
                        >
                          Add Fee
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </DismissKeyboardWrap>
              </View>
            </DismissKeyboardWrap>
          </KeyboardAvoidingView>
        </Modal>
      )}

      {/* Reopen & Redraw (big warning + required reason) */}
      {redrawVisible && (
        <Modal
          transparent
          visible
          animationType="fade"
          onRequestClose={() => setRedrawVisible(false)}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            style={styles.flexOne}
          >
            <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
              <View style={styles.modalOverlay}>
                <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
                  <View style={styles.modalContent}>
              <Text allowFontScaling={false} style={styles.redrawTitle}>
                Reopen &amp; Redraw?
              </Text>
              <Text allowFontScaling={false} style={styles.gateBody}>
                This reopens registration so you can change the field, then
                rebuild the bracket. Redrawing replaces the seeding and{" "}
                <Text style={{ fontWeight: "800", color: COLORS.warning }}>
                  clears all match results, scores, and timers
                </Text>
                . The current draw stays visible until you draw again. This is
                logged and requires a reason.
              </Text>
              <Text
                allowFontScaling={false}
                style={[styles.fieldLabel, { marginTop: webSc(SPACING.md) }]}
              >
                Reason for redraw *
              </Text>
              <TextInput
                allowFontScaling={false}
                style={[styles.input, styles.inputMultiline]}
                value={redrawReason}
                onChangeText={setRedrawReason}
                placeholder="e.g., Late player added before start"
                placeholderTextColor={COLORS.textMuted}
                multiline
              />
              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={styles.modalButtonCancel}
                  onPress={() => setRedrawVisible(false)}
                >
                  <Text
                    allowFontScaling={false}
                    style={styles.modalButtonCancelText}
                  >
                    Cancel
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.modalButtonConfirm}
                  onPress={handleConfirmReopen}
                >
                  <Text
                    allowFontScaling={false}
                    style={styles.modalButtonConfirmText}
                  >
                    Reopen &amp; Redraw
                  </Text>
                </TouchableOpacity>
              </View>
                  </View>
                </TouchableWithoutFeedback>
              </View>
            </TouchableWithoutFeedback>
          </KeyboardAvoidingView>
        </Modal>
      )}

      {/* Unlock Settings (chip, running) — required reason + optional notes, audited */}
      {unlockVisible && (
        <Modal
          transparent
          visible
          animationType="fade"
          onRequestClose={() => setUnlockVisible(false)}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            style={styles.flexOne}
          >
            <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
              <View style={styles.modalOverlay}>
                <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
                  <View style={styles.modalContent}>
                    <Text allowFontScaling={false} style={styles.redrawTitle}>
                      Unlock Tournament Settings?
                    </Text>
                    <Text allowFontScaling={false} style={styles.gateBody}>
                      This tournament is already running. Changes may affect the live
                      tournament. Unlocking is logged with your name and reason, and does
                      not change the live roster or queue.
                    </Text>
                    <Text
                      allowFontScaling={false}
                      style={[styles.fieldLabel, { marginTop: webSc(SPACING.md) }]}
                    >
                      Reason for unlocking *
                    </Text>
                    <View
                      style={{
                        flexDirection: "row",
                        flexWrap: "wrap",
                        gap: webSc(SPACING.sm),
                        marginTop: webSc(SPACING.sm),
                      }}
                    >
                      {["Correction", "Tournament rule change", "Venue change", "Other"].map((r) => {
                        const active = unlockReason === r;
                        return (
                          <TouchableOpacity
                            key={r}
                            onPress={() => setUnlockReason(r)}
                            activeOpacity={0.8}
                            style={{
                              paddingHorizontal: webSc(SPACING.md),
                              paddingVertical: webSc(SPACING.sm),
                              borderRadius: RADIUS.md,
                              borderWidth: 1,
                              borderColor: active ? COLORS.primary : COLORS.border,
                              backgroundColor: active ? COLORS.primary + "22" : "transparent",
                            }}
                          >
                            <Text
                              allowFontScaling={false}
                              style={{
                                fontSize: webMs(FONT_SIZES.sm),
                                color: active ? COLORS.primary : COLORS.textSecondary,
                                fontWeight: active ? "700" : "500",
                              }}
                            >
                              {r}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                    <Text
                      allowFontScaling={false}
                      style={[styles.fieldLabel, { marginTop: webSc(SPACING.md) }]}
                    >
                      Notes (optional)
                    </Text>
                    <TextInput
                      allowFontScaling={false}
                      style={[styles.input, styles.inputMultiline]}
                      value={unlockNotes}
                      onChangeText={setUnlockNotes}
                      placeholder="Add any details for the record"
                      placeholderTextColor={COLORS.textMuted}
                      multiline
                    />
                    <View style={styles.modalButtons}>
                      <TouchableOpacity
                        style={styles.modalButtonCancel}
                        onPress={() => setUnlockVisible(false)}
                      >
                        <Text allowFontScaling={false} style={styles.modalButtonCancelText}>
                          Cancel
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.modalButtonConfirm, !unlockReason && { opacity: 0.5 }]}
                        onPress={handleConfirmUnlock}
                        disabled={!unlockReason}
                      >
                        <Text allowFontScaling={false} style={styles.modalButtonConfirmText}>
                          Unlock Settings
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </TouchableWithoutFeedback>
              </View>
            </TouchableWithoutFeedback>
          </KeyboardAvoidingView>
        </Modal>
      )}

      {/* Draw history */}
      {showDrawHistory && (
        <Modal
          transparent
          visible
          animationType="fade"
          onRequestClose={() => setShowDrawHistory(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text allowFontScaling={false} style={styles.modalTitle}>
                Draw History
              </Text>
              <ScrollView style={{ maxHeight: webSc(360) }}>
                {[...(hub.drawLog ?? [])].reverse().map((e) => (
                  <View key={e.drawNumber} style={styles.drawLogRow}>
                    <Text allowFontScaling={false} style={styles.drawLogTitle}>
                      Draw #{e.drawNumber} · {e.players} players · {e.bracketSize}{" "}
                      bracket
                    </Text>
                    <Text allowFontScaling={false} style={styles.drawLogSub}>
                      {e.drawType} draw · {e.tdName ?? "TD"}
                    </Text>
                    <Text allowFontScaling={false} style={styles.drawLogSub}>
                      {new Date(e.timestamp).toLocaleString()}
                    </Text>
                    {e.reason ? (
                      <Text allowFontScaling={false} style={styles.drawLogReason}>
                        Reason: {e.reason}
                      </Text>
                    ) : null}
                  </View>
                ))}
              </ScrollView>
              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={styles.modalButtonConfirm}
                  onPress={() => setShowDrawHistory(false)}
                >
                  <Text
                    allowFontScaling={false}
                    style={styles.modalButtonConfirmText}
                  >
                    Close
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}

      {/* Guided-setup prompt (sequential gating) */}
      {gatePrompt && (
        <Modal
          transparent
          visible
          animationType="fade"
          onRequestClose={() => setGatePrompt(null)}
        >
          <TouchableWithoutFeedback onPress={() => setGatePrompt(null)}>
            <View style={styles.modalOverlay}>
              <View style={styles.modalContent}>
                <Text allowFontScaling={false} style={styles.modalTitle}>
                  You&apos;re almost there
                </Text>
              <Text allowFontScaling={false} style={styles.gateBody}>
                {gatePrompt.blocking === "tables" &&
                gatePrompt.target === "bracket"
                  ? "Finish tables first before building the bracket."
                  : `Please finish ${TAB_LABELS[gatePrompt.blocking]} before moving to ${TAB_LABELS[gatePrompt.target]}.`}
              </Text>
              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={styles.modalButtonCancel}
                  onPress={() => setGatePrompt(null)}
                >
                  <Text
                    allowFontScaling={false}
                    style={styles.modalButtonCancelText}
                  >
                    Not now
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.modalButtonConfirm}
                  onPress={() => {
                    const b = gatePrompt.blocking;
                    setGatePrompt(null);
                    setActiveTab(b);
                  }}
                >
                  <Text
                    allowFontScaling={false}
                    style={styles.modalButtonConfirmText}
                  >
                    Go to {TAB_LABELS[gatePrompt.blocking]}
                  </Text>
                </TouchableOpacity>
              </View>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </Modal>
      )}

      {/* Player-readiness summary (Players → next step). Informational; never blocks. */}
      {readinessPrompt && readinessSummary && (
        <Modal
          transparent
          visible
          animationType="fade"
          onRequestClose={() => setReadinessPrompt(null)}
        >
          <TouchableWithoutFeedback onPress={() => setReadinessPrompt(null)}>
            <View style={styles.modalOverlay}>
              <View style={styles.modalContent}>
                <Text allowFontScaling={false} style={styles.modalTitle}>
                  {readinessSummary.entityLabel} Not Ready
                </Text>
                <View style={styles.readinessRows}>
                  <Text allowFontScaling={false} style={styles.readinessLine}>
                    {readinessSummary.total}{" "}
                    {readinessSummary.total === 1
                      ? readinessSummary.entitySingular
                      : readinessSummary.entityLabel}
                  </Text>
                  <Text allowFontScaling={false} style={[styles.readinessLine, { color: COLORS.success }]}>
                    {readinessSummary.ready} Ready
                  </Text>
                  <Text allowFontScaling={false} style={[styles.readinessLine, { color: COLORS.warning }]}>
                    {readinessSummary.notReady} Not Ready
                  </Text>
                  {readinessSummary.unpaid > 0 && (
                    <Text allowFontScaling={false} style={styles.readinessSub}>
                      {readinessSummary.unpaid} Entry {readinessSummary.unpaid === 1 ? "Fee" : "Fees"} Unpaid
                    </Text>
                  )}
                  {readinessSummary.waitingForPartner > 0 && (
                    <Text allowFontScaling={false} style={styles.readinessSub}>
                      {readinessSummary.waitingForPartner} Waiting for Partner
                    </Text>
                  )}
                  {readinessSummary.noShows > 0 && (
                    <Text allowFontScaling={false} style={styles.readinessSub}>
                      {readinessSummary.noShows} No Show{readinessSummary.noShows === 1 ? "" : "s"}
                    </Text>
                  )}
                  {readinessSummary.sidePotNotEntered != null &&
                    readinessSummary.sidePotNotEntered > 0 && (
                      <Text allowFontScaling={false} style={styles.readinessSub}>
                        {readinessSummary.sidePotNotEntered} Side Pot Not Entered
                      </Text>
                    )}
                </View>
                <Text allowFontScaling={false} style={styles.gateBody}>
                  You can continue setting up the tournament. {readinessSummary.entityLabel}{" "}
                  must be Ready before they can play.
                </Text>
                <View style={styles.modalButtons}>
                  <TouchableOpacity
                    style={styles.modalButtonCancel}
                    onPress={() => setReadinessPrompt(null)}
                  >
                    <Text allowFontScaling={false} style={styles.modalButtonCancelText}>
                      Review {readinessSummary.entityLabel}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.modalButtonConfirm}
                    onPress={() => {
                      const target = readinessPrompt.target;
                      setReadinessPrompt(null);
                      advanceToNextStep(target);
                    }}
                  >
                    <Text allowFontScaling={false} style={styles.modalButtonConfirmText}>
                      Continue Anyway
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </Modal>
      )}

      {/* Header */}
      {/* Web: the browser handles Back, so the in-page Back is replaced by a subtle
          breadcrumb. Mobile keeps the Back button (unchanged). */}
      {isWeb && (
        <View style={[styles.breadcrumbRow, styles.webShellCenter]}>
          <Text allowFontScaling={false} style={styles.breadcrumbText} numberOfLines={1}>
            Admin / Tournaments / <Text style={styles.breadcrumbCurrent}>{tournamentName}</Text>
          </Text>
        </View>
      )}
      <View style={[styles.header, isWeb && styles.headerWeb, isWeb && styles.webShellCenter, !isWeb && { paddingTop: insets.top + webSc(SPACING.sm) }]}>
        {!isWeb && (
          <TouchableOpacity style={styles.backButton} onPress={handleBack}>
            <Text allowFontScaling={false} style={styles.backText}>
              {GLYPH.back} Back
            </Text>
          </TouchableOpacity>
        )}
        {/* Web: large left-aligned title with the status pill inline beside it. */}
        <View style={[styles.headerCenter, isWeb && styles.headerCenterWeb]}>
          <Text
            allowFontScaling={false}
            style={[styles.headerTitle, isWeb && styles.headerTitleWeb]}
            numberOfLines={1}
          >
            {tournamentName}
          </Text>
          <View
            style={[
              styles.phaseBadge,
              { backgroundColor: phaseMeta.color + "20" },
            ]}
          >
            <Text
              allowFontScaling={false}
              style={[styles.phaseBadgeText, { color: phaseMeta.color }]}
            >
              {phaseMeta.label}
              {hub.isPaused ? " · Paused" : ""}
            </Text>
          </View>
        </View>
        {isChip ? (
          <TouchableOpacity style={styles.headerActionBtn} onPress={onActionsPress}>
            <Text allowFontScaling={false} style={styles.headerActionText}>⚡ Actions</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.placeholderSpace} />
        )}
      </View>

      <TournamentActionsModal
        visible={actionsOpen}
        onClose={() => setActionsOpen(false)}
        onFinish={handleFinishTournament}
        finishing={hub.isMutatingLive}
      />

      {/* Lifecycle navigation — Setup / Live / Results phase dropdowns. External
          tournaments have only the details page, so no phase nav is shown. */}
      {!isExternal && (
        <View style={isWeb ? styles.webShellCenter : undefined}>
          <PhaseNav
            phases={navPhases}
            selectedKey={selectedPhase}
            activePageKey={activeTab}
            onSelectPage={handleSelectPage}
            onLockedPress={(p) => handlePhasePress(p as PhaseKey)}
          />
        </View>
      )}

      {(!isChip &&
        (activeTab === "dashboard" ||
          activeTab === "matches" ||
          activeTab === "queue" ||
          activeTab === "stats" ||
          activeTab === "standings" ||
          activeTab === "payouts" ||
          activeTab === "history" ||
          activeTab === "summary")) ||
      // Wide-web elimination Players owns its scrolling: renderPlayers returns a bounded
      // ScrollView (roster + controls) so its right-hand Tournament Summary column can use
      // position:sticky and stay pinned while the roster scrolls. Narrow/mobile Players keeps
      // the page KeyboardAwareScroll path below (a plain View, no inner ScrollView).
      (!isChip && isWeb && winW >= 980 && (activeTab === "players" || activeTab === "tables" || activeTab === "bracket")) ||
      // Chip LIVE pages own their scrolling and fill the available height. Keeping ALL
      // of them (Dashboard/Tables/Queue/Players) in this ONE stable slot preserves the
      // single embedded ChipManageScreen instance across live-tab switches (no reload
      // flash), and lets Live → Tables pin its 2×2 toolbar as a sticky header.
      (isChip &&
        selectedPhase === "live" &&
        (activeTab === "matches" ||
          activeTab === "tables" ||
          activeTab === "queue" ||
          activeTab === "players")) ? (
        // These own their scrolling and fill the available height, so they live
        // outside the page ScrollView. (Chip setup/results pages use it below.)
        <View style={styles.scrollFlex}>{renderTab()}</View>
      ) : isWeb && winW >= 980 && activeTab === "settings" && form ? (
        // Wide web: event-builder two-column. The whole page scrolls (so you can
        // scroll from anywhere, including over the preview) and the preview is
        // sticky so it stays in view as the form scrolls.
        <ScrollView
          style={styles.scrollFlex}
          contentContainerStyle={styles.builderRow}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.builderForm}>{renderSettings()}</View>
          <View style={styles.builderPreview}>
            <TournamentSettingsPreview
              form={form}
              venue={hub.tournament?.venues}
              tablesCount={hub.tables.length}
              isExternal={isExternal}
            />
            {/* Settings actions live UNDER the Live Preview (footer removed below on wide web).
                Same handlers + disabled logic as the old footer; chip keeps its footer. */}
            {settingsSidebarActions}
          </View>
        </ScrollView>
      ) : (
        <KeyboardAwareScroll
          ref={pageScrollRef}
          style={styles.scrollFlex}
          contentContainerStyle={[styles.content, isWeb && styles.contentWeb]}
          // Keyboard inset avoidance is only needed on the SETUP pages (the ones with
          // text inputs). On the LIVE/RESULTS pages there are no page-scroll inputs, and
          // iOS's automaticallyAdjustKeyboardInsets mishandles content-size changes there
          // — after a queue reorder / recorded winner the scroll view could blank until a
          // full remount (all chip live subpages share this one ScrollView instance, so
          // they all went black). Scoping the flag to setup fixes that without touching
          // the keyboard behavior forms rely on.
          automaticallyAdjustKeyboardInsets={
            Platform.OS === "ios" && selectedPhase === "setup"
          }
          // Item 1(A): a fast overscroll that coincides with a content-size change (a field
          // expanding, the keyboard inset re-applying) re-triggers iOS's
          // automaticallyAdjustKeyboardInsets blanking on Fabric — the setup page goes black
          // until remount. Disabling the rubber-band overscroll on setup/iOS removes that
          // trigger without disabling scrolling; content still scrolls normally. Android is
          // unaffected (overScrollMode kept "never" for parity).
          bounces={!(Platform.OS === "ios" && selectedPhase === "setup")}
          overScrollMode={selectedPhase === "setup" ? "never" : "auto"}
          // Item 3A: the Players "Mark Ready" tap re-renders the roster (optimistic flip +
          // silent reload) which changes content height; if that lands mid-fling while the
          // keyboard-inset flag is active, Fabric can blank the shared scroll view. Anchor the
          // visible content across content-size changes so the offset can't jump/blank — this
          // fixes it without disabling scrolling or the keyboard behavior. Setup/iOS only.
          maintainVisibleContentPosition={
            Platform.OS === "ios" && selectedPhase === "setup" ? { minIndexForVisible: 0 } : undefined
          }
          refreshControl={
            isWeb ? undefined : (
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={COLORS.primary}
              />
            )
          }
        >
          {renderTab()}
        </KeyboardAwareScroll>
      )}

      {/* Guided flow — Players step. Both formats advance to Tables once the field
          is valid (≥2 Ready/checked-in); disabled until then so the sequence stays
          in order. Elimination shows it while registration is open (when players
          are actually added); chip shows it throughout the setup Players page.
          Wide-web elimination moves this CTA into the sticky summary column (below), so the
          full-width bottom footer is suppressed there; narrow/mobile keep the footer. */}
      {!isChip && activeTab === "players" && hub.liveState === "registration_open" && !(isWeb && winW >= 980) && (
        <View style={styles.playersFooter}>
          <TouchableOpacity
            style={[
              styles.lockBtn,
              styles.lockBtnFooter,
              styles.lockBtnFooterInner,
              !setupStepComplete.players && styles.btnDisabled,
              isWeb && styles.stepBtnWeb,
            ]}
            onPress={() => advanceFromPlayers("tables")}
            disabled={!setupStepComplete.players}
          >
            <Text allowFontScaling={false} style={styles.lockBtnText}>
              Continue to Tables →
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {isChip && selectedPhase === "setup" && activeTab === "players" && (
        <View style={styles.playersFooter}>
          <TouchableOpacity
            style={[
              styles.lockBtn,
              styles.lockBtnFooter,
              styles.lockBtnFooterInner,
              !setupStepComplete.players && styles.btnDisabled,
              isWeb && styles.stepBtnWeb,
            ]}
            onPress={() => advanceFromPlayers("tables")}
            disabled={!setupStepComplete.players}
          >
            <Text allowFontScaling={false} style={styles.lockBtnText}>
              Continue to Tables →
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Guided flow — Tables step advances to Prize Pool once tables are
          configured (both formats). Wide-web elimination moves this CTA into the sticky
          summary sidebar (below), so the full-width footer is suppressed there. */}
      {selectedPhase === "setup" && activeTab === "tables" && !(isWeb && winW >= 980 && !isChip) && (
        <View style={styles.playersFooter}>
          <TouchableOpacity
            style={[
              styles.lockBtn,
              styles.lockBtnFooter,
              styles.lockBtnFooterInner,
              !setupStepComplete.tables && styles.btnDisabled,
              isWeb && styles.stepBtnWeb,
            ]}
            onPress={() => advanceToNextStep("prizepool")}
            disabled={!setupStepComplete.tables}
          >
            <Text allowFontScaling={false} style={styles.lockBtnText}>
              Continue to Prize Pool →
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Fixed footer: Save Settings / Start Registration.
          Wide-web elimination moves these under the Live Preview (above); footer suppressed. */}
      {activeTab === "settings" && form && !settingsLocked && !(isWeb && winW >= 980 && !isChip) && (
        <View style={styles.settingsFooter}>
          {!isExternal && !formRequiredComplete && (
            <Text allowFontScaling={false} style={styles.startHintFooter}>
              Still needed to open registration: {formMissingFields.join(", ")}.
            </Text>
          )}
          <View style={[styles.saveRow, styles.settingsFooterInner]}>
            {settingsUnlocked ? (
              // Temporary unlock edit session: the footer focuses only on completing or
              // cancelling it. Cancel (secondary/outline) discards unsaved edits + relocks
              // (existing "relocked — no changes saved" audit; never saves). Save & Lock
              // (primary blue, larger) persists + relocks. No View Players here.
              <>
                <TouchableOpacity
                  style={[styles.saveBtn, { flex: 1 }, hub.isSaving && styles.btnDisabled, isWeb && styles.stepBtnWeb]}
                  onPress={relockSettingsNoSave}
                  disabled={hub.isSaving}
                >
                  <Text allowFontScaling={false} style={styles.saveBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.startBtn, { flex: 2 }, hub.isSaving && styles.btnDisabled, isWeb && styles.stepBtnWeb]}
                  onPress={handleSaveAndLock}
                  disabled={hub.isSaving}
                >
                  <Text allowFontScaling={false} style={styles.startBtnText}>
                    {hub.isSaving ? "Saving..." : "Save & Lock"}
                  </Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <TouchableOpacity
                  style={[styles.saveBtn, { flex: 1 }, hub.isSaving && styles.btnDisabled, isWeb && styles.stepBtnWeb]}
                  onPress={isExternal ? () => setSubmitCountdown(5) : handleSave}
                  disabled={hub.isSaving}
                >
                  <Text allowFontScaling={false} style={styles.saveBtnText}>
                    {isExternal
                      ? "Submit Tournament"
                      : hub.isSaving
                        ? "Saving..."
                        : "Save Settings"}
                  </Text>
                </TouchableOpacity>
                {!isExternal && isChip && (
                  // Stays clickable while setup is incomplete so tapping reveals the missing
                  // requirements (beginRegistration guards + highlights). Only truly disabled
                  // during an in-flight save.
                  <TouchableOpacity
                    style={[styles.startBtn, hub.isSaving && styles.btnDisabled, isWeb && styles.stepBtnWeb]}
                    onPress={beginRegistration}
                    disabled={hub.isSaving}
                  >
                    <Text allowFontScaling={false} style={styles.startBtnText}>
                      {chipRegistrationStarted ? "View Players →" : "Begin Registration →"}
                    </Text>
                  </TouchableOpacity>
                )}
                {!isExternal && !isChip && (
                  // Stays clickable while setup is incomplete — tapping runs beginRegistration,
                  // which shows the incomplete-setup message, highlights every missing field,
                  // and scrolls to the first. Only disabled during an in-flight save/mutation.
                  <TouchableOpacity
                    style={[styles.startBtn, (hub.isSaving || hub.isMutatingLive) && styles.btnDisabled, isWeb && styles.stepBtnWeb]}
                    onPress={beginRegistration}
                    disabled={hub.isSaving || hub.isMutatingLive}
                  >
                    <Text allowFontScaling={false} style={styles.startBtnText}>
                      Start Registration
                    </Text>
                  </TouchableOpacity>
                )}
              </>
            )}
          </View>
        </View>
      )}

      {/* Fixed footer: Save Prize Pool (prizepool tab, pre-lock).
          Wide-web elimination moves these under the Summary (via PrizePoolView summaryFooter). */}
      {activeTab === "prizepool" && prizeForm && !prizeLocked && !(isWeb && winW >= 980 && !isChip) && (
        <View style={styles.settingsFooter}>
          {!prizeComplete && (
            <Text allowFontScaling={false} style={styles.startHintFooter}>
              Keep each pool&apos;s payouts within the available money to save.
            </Text>
          )}
          <View style={[styles.saveRow, styles.settingsFooterInner]}>
            <TouchableOpacity
              style={[
                styles.saveBtn,
                { flex: 1 },
                (hub.isSavingPrizePool || !prizeComplete) && styles.btnDisabled,
                isWeb && styles.stepBtnWeb,
              ]}
              onPress={handleSavePrizePool}
              disabled={hub.isSavingPrizePool || !prizeComplete}
            >
              <Text allowFontScaling={false} style={styles.saveBtnText}>
                {hub.isSavingPrizePool ? "Saving..." : "Save Prize Pool"}
              </Text>
            </TouchableOpacity>
            {/* Guided flow: advance to the terminal step once payouts are valid and
                every earlier step is complete — Review & Start (chip) or Generate
                Bracket (elimination). */}
            {!isExternal && (
              <TouchableOpacity
                style={[styles.startBtn, !reviewUnlocked && styles.btnDisabled, isWeb && styles.stepBtnWeb]}
                onPress={() => advanceToNextStep(terminalTab)}
                disabled={!reviewUnlocked}
              >
                <Text allowFontScaling={false} style={styles.startBtnText}>
                  {isChip ? "Review & Start →" : "Continue to Bracket →"}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

      {/* Fixed footer: Draw / Reopen & Redraw / Start Tournament (bracket tab).
          Wide-web elimination moves these into the sticky summary sidebar; footer suppressed. */}
      {activeTab === "bracket" && readyPlayers.length >= 2 && !(isWeb && winW >= 980 && !isChip) && (
        <View style={styles.settingsFooter}>
          {!settingsLocked ? (
            <>
              {!prizeComplete && (
                <Text allowFontScaling={false} style={styles.startHintFooter}>
                  Complete the prize pool before drawing the bracket.
                </Text>
              )}
              <View style={[styles.saveRow, styles.settingsFooterInner]}>
                <TouchableOpacity
                  style={[
                    styles.startBtn,
                    hub.isDrawing && styles.startBtnRunning,
                    !hub.isDrawing && !prizeComplete && styles.btnDisabled,
                    isWeb && styles.stepBtnWeb,
                  ]}
                  onPress={handleDrawPress}
                  disabled={hub.isDrawing || !prizeComplete}
                >
                  {hub.isDrawing ? (
                    <View style={styles.btnRow}>
                      <ActivityIndicator size="small" color={COLORS.white} />
                      <Text allowFontScaling={false} style={styles.startBtnText}>
                        Generating…
                      </Text>
                    </View>
                  ) : (
                    <Text allowFontScaling={false} style={styles.startBtnText}>
                      {hub.bracket ? "Regenerate Bracket" : "Generate Bracket"}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <View style={[styles.saveRow, styles.settingsFooterInner]}>
              <TouchableOpacity
                style={[styles.reopenBtn, { flex: 1 }, isWeb && styles.stepBtnWeb]}
                onPress={() => {
                  setRedrawReason("");
                  setRedrawVisible(true);
                }}
              >
                <Text allowFontScaling={false} style={styles.reopenBtnText}>
                  Reopen &amp; Redraw
                </Text>
              </TouchableOpacity>
              {hub.phase === "bracket_drawn" && (
                <TouchableOpacity
                  style={[styles.startBtn, hub.isMutatingLive && styles.btnDisabled, isWeb && styles.stepBtnWeb]}
                  onPress={handleStartTournament}
                  disabled={hub.isMutatingLive}
                >
                  <Text allowFontScaling={false} style={styles.startBtnText}>
                    Start Tournament
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>
      )}

      {/* Fixed footer: Finish Tournament — appears once the final score is in,
          so the TD always has a clear way to close the event out (in addition to
          the auto-prompt). Not shown on the bracket tab, which has its own footer. */}
      {hub.phase === "running" &&
        allMatchesDecided &&
        (activeTab === "matches" ||
          activeTab === "queue" ||
          activeTab === "stats" ||
          activeTab === "standings") && (
          <View style={styles.settingsFooter}>
            <Text allowFontScaling={false} style={styles.startHintFooter}>
              {championName
                ? `${championName} wins! All matches are complete.`
                : "All matches are complete."}
            </Text>
            <View style={[styles.saveRow, styles.settingsFooterInner]}>
              <TouchableOpacity
                style={[
                  styles.startBtn,
                  { flex: 1 },
                  hub.isMutatingLive && styles.btnDisabled,
                  isWeb && styles.stepBtnWeb,
                ]}
                onPress={handleFinishTournament}
                disabled={hub.isMutatingLive}
              >
                <Text allowFontScaling={false} style={styles.startBtnText}>
                  Finish Tournament
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    // Web: full viewport width so the page scroll surface (and its wheel target) spans
    // the whole width — empty gutters scroll the page. Content is centered separately via
    // `webShellCenter`. Native unchanged (flex fill).
    flex: 1,
    backgroundColor: COLORS.background,
  },
  // Web: centers a block at the shared shell width. Applied to the persistent header
  // block and to each scroll content container so the visible column stays centered while
  // the scroll surface itself is full-width. No-op on native (gated by isWeb at usage).
  webShellCenter: { width: "100%" as any, maxWidth: WEB_MAXW, alignSelf: "center" as any },
  centerContainer: {
    flex: 1,
    backgroundColor: COLORS.background,
    justifyContent: "center",
    alignItems: "center",
  },
  centerBlock: { paddingVertical: webSc(SPACING.xl), alignItems: "center" },
  loadingText: {
    fontSize: webMs(FONT_SIZES.md),
    color: COLORS.textSecondary,
    marginTop: webSc(SPACING.sm),
  },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: webSc(SPACING.md),
    paddingTop: webSc(SPACING.xl + SPACING.sm),
    paddingBottom: webSc(SPACING.md),
    backgroundColor: COLORS.surface,
  },
  // Web: minimal top spacing so the dashboard starts noticeably higher (mobile unchanged).
  headerWeb: { paddingTop: 2, paddingBottom: SPACING.xs, backgroundColor: COLORS.background },
  // Web-only breadcrumb (replaces the in-page Back button on web).
  breadcrumbRow: { paddingTop: SPACING.xs, paddingBottom: 0, paddingHorizontal: webSc(SPACING.md), backgroundColor: COLORS.background },
  breadcrumbText: { fontSize: webMs(FONT_SIZES.xs), color: COLORS.textMuted },
  breadcrumbCurrent: { color: COLORS.textSecondary, fontWeight: "600" },
  backButton: { padding: webSc(SPACING.xs) },
  backText: {
    fontSize: webMs(FONT_SIZES.sm),
    color: COLORS.primary,
    fontWeight: "600",
  },
  headerCenter: {
    alignItems: "center",
    flex: 1,
    marginHorizontal: webSc(SPACING.sm),
  },
  // Web/desktop: title + status pill inline, left-aligned (native stays centered).
  headerCenterWeb: { flexDirection: "row", alignItems: "center", justifyContent: "flex-start", gap: webSc(SPACING.sm), marginHorizontal: 0 },
  headerTitleWeb: { fontSize: webMs(FONT_SIZES.xxl), fontWeight: "800" },
  headerTitle: {
    fontSize: webMs(FONT_SIZES.lg),
    fontWeight: "700",
    color: COLORS.text,
  },
  phaseBadge: {
    marginTop: webSc(4),
    paddingHorizontal: webSc(SPACING.sm),
    paddingVertical: webSc(2),
    borderRadius: webSc(RADIUS.full),
  },
  phaseBadgeText: { fontSize: webMs(FONT_SIZES.xs), fontWeight: "700" },
  placeholderSpace: { width: webSc(50) },
  headerActionBtn: { backgroundColor: COLORS.primary, borderRadius: webSc(RADIUS.md), paddingHorizontal: webSc(SPACING.sm), paddingVertical: webSc(SPACING.xs) },
  headerActionText: { color: COLORS.white, fontSize: webMs(FONT_SIZES.xs), fontWeight: "800" },
  actionsBtn: {
    width: webSc(50),
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: webSc(SPACING.xs),
  },
  actionsBtnText: { fontSize: webMs(FONT_SIZES.xl) },

  // Phase row (Setup / Live / Results)
  phaseRow: {
    flexDirection: "row",
    gap: webSc(SPACING.xs),
    paddingHorizontal: webSc(SPACING.md),
    paddingTop: webSc(SPACING.sm),
  },
  phasePill: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: webSc(SPACING.xs),
    paddingVertical: webSc(SPACING.sm),
    borderRadius: webSc(RADIUS.md),
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  phasePillActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  phasePillLocked: { opacity: 0.55 },
  phaseGlyph: { fontSize: webMs(FONT_SIZES.xs), color: COLORS.textSecondary, fontWeight: "900" },
  phaseGlyphDone: { color: COLORS.success },
  phaseGlyphLive: { color: COLORS.error },
  phaseOnPrimary: { color: COLORS.white },
  phaseText: { fontSize: webMs(FONT_SIZES.sm), fontWeight: "800", color: COLORS.textSecondary },

  // Page selector (dropdown of the selected phase's pages)
  pageNavWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: webSc(SPACING.sm),
    paddingHorizontal: webSc(SPACING.md),
    paddingVertical: webSc(SPACING.sm),
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  pageNavLabel: {
    fontSize: webMs(FONT_SIZES.xs),
    fontWeight: "800",
    color: COLORS.textMuted,
    letterSpacing: 0.5,
  },
  pageDropdown: { flex: 1, maxWidth: webSc(280) },

  // Tabs (sub-tab row)
  tabBarWrap: {
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  tabBar: {
    paddingHorizontal: webSc(SPACING.sm),
    paddingVertical: webSc(SPACING.sm),
    gap: webSc(SPACING.xs),
  },
  tab: {
    flexDirection: "row",
    alignItems: "center",
    gap: webSc(4),
    paddingHorizontal: webSc(SPACING.md),
    paddingVertical: webSc(SPACING.sm),
    borderRadius: webSc(RADIUS.full),
    backgroundColor: COLORS.background,
  },
  tabActive: { backgroundColor: COLORS.primary },
  subGlyph: { fontSize: webMs(FONT_SIZES.xs), color: COLORS.textMuted, fontWeight: "800" },
  tabText: {
    fontSize: webMs(FONT_SIZES.sm),
    fontWeight: "600",
    color: COLORS.textSecondary,
  },
  tabTextActive: { color: COLORS.white },
  tabTextLocked: { opacity: 0.6 },

  // Content
  content: {
    padding: webSc(SPACING.md),
    paddingBottom: webSc(SPACING.xl * 2),
  },
  contentWeb: { alignItems: "stretch", width: "100%" as any, maxWidth: WEB_MAXW, alignSelf: "center" as any },
  scrollFlex: { flex: 1 },
  // Web event-builder two-column: the page scrolls; the preview is sticky.
  builderRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    width: "100%" as any,
    // Match the shared Setup content shell (WEB_MAXW) so the Settings two-column layout's
    // LEFT edge lines up with Tables / Players / Prize Pool instead of sitting inset from a
    // narrower centered box.
    maxWidth: WEB_MAXW,
    alignSelf: "center" as any,
    gap: SPACING.lg,
    padding: SPACING.md,
    paddingBottom: SPACING.xl * 2,
  },
  builderForm: { flex: 1 },
  builderPreview: {
    width: 360,
    position: "sticky" as any,
    top: SPACING.md,
    alignSelf: "flex-start",
  },

  // Sections / fields
  section: {
    backgroundColor: COLORS.surface,
    borderRadius: webSc(RADIUS.md),
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: webSc(SPACING.md),
    marginBottom: webSc(SPACING.md),
  },
  sectionTitle: {
    fontSize: webMs(FONT_SIZES.md),
    fontWeight: "700",
    color: COLORS.text,
    marginBottom: webSc(SPACING.sm),
  },
  field: { marginBottom: webSc(SPACING.sm) },
  fieldLabel: {
    fontSize: webMs(FONT_SIZES.sm),
    color: COLORS.text,
    fontWeight: "500",
    marginBottom: webSc(SPACING.xs),
  },
  input: {
    backgroundColor: COLORS.background,
    borderRadius: webSc(RADIUS.sm),
    paddingVertical: webSc(SPACING.sm),
    paddingHorizontal: webSc(SPACING.sm),
    fontSize: webMs(FONT_SIZES.sm),
    color: COLORS.text,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  inputMultiline: { minHeight: webSc(80), textAlignVertical: "top" },
  inputNarrow: { width: webSc(96), alignSelf: "flex-start" },
  inputDisabled: { opacity: 0.4 },
  // Bordered wrapper so the green ✓ can sit inside the box on the left while the
  // text input fills the rest (shorter typing area, checks aligned left).
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.background,
    borderRadius: webSc(RADIUS.sm),
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: CHECK_INSET,
  },
  inputWrapFocused: { borderColor: COLORS.primary },
  inputWrapError: { borderColor: COLORS.error },
  inputWrapMultiline: { alignItems: "flex-start" },
  inputWrapNarrow: { width: webSc(120), alignSelf: "flex-start" },
  inputInner: {
    flex: 1,
    paddingVertical: webSc(SPACING.sm),
    fontSize: webMs(FONT_SIZES.sm),
    color: COLORS.text,
  },
  // Money: right-align the dollars so the fixed ".00" suffix hugs the number.
  inputInnerMoney: { textAlign: "right" },
  moneySuffix: { fontSize: webMs(FONT_SIZES.sm), color: COLORS.text },
  // Side-pot amount cell: the bordered box (styles.input) becomes a row holding a
  // borderless dollars input + the ".00" suffix.
  moneyCell: { flexDirection: "row", alignItems: "center" },
  moneyCellInput: {
    flex: 1,
    paddingVertical: 0,
    fontSize: webMs(FONT_SIZES.sm),
    color: COLORS.text,
    textAlign: "right",
  },
  labelDisabled: { color: COLORS.textMuted },

  // +/- stepper (full width: [-]  centered text  [+])
  stepperRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: COLORS.background,
    borderRadius: webSc(RADIUS.sm),
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: webSc(SPACING.sm),
  },
  stepBtn: {
    width: webSc(52),
    height: webSc(46),
    alignItems: "center",
    justifyContent: "center",
  },
  stepBtnText: {
    fontSize: webMs(FONT_SIZES.xxl),
    fontWeight: "700",
    color: COLORS.primary,
    lineHeight: webMs(FONT_SIZES.xxl) + 2,
  },
  stepCenter: {
    flex: 1,
    textAlign: "center",
    fontSize: webMs(FONT_SIZES.md),
    fontWeight: "700",
    color: COLORS.text,
  },
  // Worked-example box (differential + groups)
  exampleBox: {
    backgroundColor: COLORS.background,
    borderRadius: webSc(RADIUS.sm),
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: webSc(SPACING.sm),
    marginTop: webSc(SPACING.xs),
  },
  exampleTitle: {
    fontSize: webMs(FONT_SIZES.xs),
    fontWeight: "700",
    color: COLORS.primary,
    marginBottom: webSc(SPACING.xs),
    textTransform: "uppercase",
  },
  exampleText: {
    fontSize: webMs(FONT_SIZES.sm),
    color: COLORS.textSecondary,
    lineHeight: webMs(FONT_SIZES.sm) * 1.4,
  },
  hint: {
    fontSize: webMs(FONT_SIZES.xs),
    color: COLORS.textMuted,
    fontStyle: "italic",
    marginTop: webSc(SPACING.xs),
    marginBottom: webSc(SPACING.xs),
  },
  // Post-attempt required-field error: red box around the missing control/section + red
  // helper line. Applied by FieldAnchor only after Start Registration is attempted.
  fieldErrorWrap: {
    borderWidth: 1,
    borderColor: COLORS.error,
    borderRadius: webSc(RADIUS.md),
    backgroundColor: COLORS.error + "0D",
    padding: webSc(SPACING.sm),
    marginBottom: webSc(SPACING.sm),
  },
  fieldErrorText: {
    color: COLORS.error,
    fontSize: webMs(FONT_SIZES.xs),
    fontWeight: "600",
    marginTop: webSc(SPACING.xs),
  },
  hintAmber: {
    fontSize: webMs(FONT_SIZES.xs),
    color: COLORS.warning,
    fontStyle: "italic",
    marginTop: webSc(SPACING.sm),
    paddingHorizontal: webSc(SPACING.sm),
  },
  lockedPotsRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: webSc(SPACING.xs),
    marginTop: webSc(SPACING.xs),
  },
  lockedPotsLabel: {
    fontSize: webMs(FONT_SIZES.xs),
    color: COLORS.textMuted,
    fontWeight: "700",
  },
  lockedPotsNone: { fontSize: webMs(FONT_SIZES.xs), color: COLORS.textMuted },
  lockedPotChip: {
    paddingHorizontal: webSc(SPACING.sm),
    paddingVertical: webSc(2),
    borderRadius: webSc(RADIUS.sm),
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.background,
  },
  lockedPotChipText: {
    fontSize: webMs(FONT_SIZES.xs),
    color: COLORS.textSecondary,
    fontWeight: "700",
  },

  // Segmented control (race mode + player filter)
  segmentRow: {
    flexDirection: "row",
    gap: webSc(SPACING.xs),
    marginBottom: webSc(SPACING.sm),
    flexWrap: "wrap",
  },
  segment: {
    paddingHorizontal: webSc(SPACING.md),
    paddingVertical: webSc(SPACING.sm),
    borderRadius: webSc(RADIUS.full),
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  segmentActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  segmentText: {
    fontSize: webMs(FONT_SIZES.xs),
    fontWeight: "600",
    color: COLORS.textSecondary,
  },
  segmentTextActive: { color: COLORS.white },

  // Race groups
  groupRow: {
    flexDirection: "row",
    gap: webSc(SPACING.xs),
    marginBottom: webSc(SPACING.xs),
    alignItems: "center",
  },
  // Group Label is a CUSTOM name (not just A/B/C) — wider on desktop, still responsive.
  groupLabel: { width: isWeb ? 160 : webSc(48), flexShrink: 0 as any },
  groupNum: { flex: 1, minWidth: webSc(48) },
  groupHeaderRow: { flexDirection: "row", alignItems: "center", gap: webSc(SPACING.xs), marginBottom: webSc(SPACING.xs) },
  groupHeaderText: { fontSize: webMs(FONT_SIZES.xs), color: COLORS.textSecondary, fontWeight: "700" },
  groupHeaderSpacer: { width: webSc(32) },
  groupInputError: { borderColor: COLORS.error },
  groupErrorBox: {
    marginTop: webSc(SPACING.sm),
    borderLeftWidth: 3,
    borderLeftColor: COLORS.error,
    paddingLeft: webSc(SPACING.sm),
    paddingVertical: webSc(SPACING.xs),
    gap: webSc(2),
  },
  groupErrorText: { fontSize: webMs(FONT_SIZES.xs), color: COLORS.error, fontWeight: "600" },
  groupRemove: {
    width: webSc(32),
    height: webSc(32),
    alignItems: "center",
    justifyContent: "center",
  },
  groupRemoveText: { color: COLORS.error, fontSize: webMs(FONT_SIZES.md) },
  flex1: { flex: 1 },
  chipTableActions: { flexDirection: "row", justifyContent: "flex-end", gap: webSc(SPACING.xs), marginBottom: webSc(SPACING.sm) },
  chipTierHead: { flexDirection: "row", alignItems: "center", gap: webSc(SPACING.xs), marginBottom: 2 },
  chipTierHeadText: { color: COLORS.textMuted, fontSize: webMs(FONT_SIZES.xs), fontWeight: "700", textAlign: "center" },
  chipTierRow: { flexDirection: "row", alignItems: "center", gap: webSc(SPACING.xs), marginBottom: webSc(SPACING.xs) },
  chipCol: { flex: 1, minWidth: 0 },
  chipColDel: { width: webSc(28), alignItems: "center", justifyContent: "center" },
  chipTierInput: {
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: webSc(RADIUS.sm),
    paddingVertical: webSc(6),
    paddingHorizontal: webSc(4),
    fontSize: webMs(FONT_SIZES.sm),
    color: COLORS.text,
    textAlign: "center",
    ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : null),
  },
  addRowBtn: {
    borderWidth: 1,
    borderColor: COLORS.primary,
    borderRadius: webSc(RADIUS.sm),
    paddingVertical: webSc(SPACING.sm),
    alignItems: "center",
    marginTop: webSc(SPACING.xs),
  },
  addRowBtnSm: {
    borderWidth: 1,
    borderColor: COLORS.primary,
    borderRadius: webSc(RADIUS.sm),
    paddingVertical: webSc(SPACING.xs),
    paddingHorizontal: webSc(SPACING.md),
  },
  // Upload Image button — sized to match the Game Type dropdown selector beside it
  // (fixed height, centered, same radius) so the two controls align.
  imageUploadBtn: {
    height: webSc(44),
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.primary,
    borderRadius: webSc(RADIUS.md),
    paddingHorizontal: webSc(SPACING.md),
  },
  addRowBtnText: {
    color: COLORS.primary,
    fontSize: webMs(FONT_SIZES.sm),
    fontWeight: "600",
  },

  // Tournament image
  tournamentImagePreview: {
    width: "100%",
    height: webSc(200),
    borderRadius: webSc(RADIUS.md),
    backgroundColor: COLORS.surface,
    marginBottom: webSc(SPACING.sm),
  },
  // Custom uploads use contain; a black ground shows as clean letterboxing when the
  // image's aspect ratio doesn't fill the preview.
  tournamentImagePreviewContain: {
    backgroundColor: COLORS.background,
  },
  tournamentImagePlaceholder: {
    width: "100%",
    height: webSc(160),
    borderRadius: webSc(RADIUS.md),
    backgroundColor: COLORS.surface,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: webSc(SPACING.sm),
  },
  tournamentImageEmoji: { fontSize: webMs(48) },
  imageActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: webSc(SPACING.sm),
  },
  imageDropdown: { flex: 1 },

  // Side pots
  sidePotHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: webSc(SPACING.xs),
  },
  sidePotRow: {
    flexDirection: "row",
    gap: webSc(SPACING.xs),
    marginBottom: webSc(SPACING.xs),
    alignItems: "center",
  },
  sidePotName: { flex: 2 },
  sidePotAmount: { flex: 1 },
  // Compact Entry & Payouts dashboard layout
  entryRow: { flexDirection: "row", gap: webSc(SPACING.md), marginBottom: webSc(SPACING.md) },
  entryCol: { flex: 1 },
  sidePotEditRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: webSc(SPACING.xs),
    marginBottom: webSc(SPACING.xs),
  },
  sidePotEditName: {
    flex: 1,
    minWidth: 0,
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: webSc(RADIUS.sm),
    paddingVertical: webSc(SPACING.sm),
    paddingHorizontal: 10,
    fontSize: webMs(FONT_SIZES.sm),
    color: COLORS.text,
  },
  sidePotDoneBtn: {
    paddingVertical: webSc(SPACING.xs),
    paddingHorizontal: webSc(SPACING.sm),
  },
  sidePotDoneText: {
    color: COLORS.primary,
    fontWeight: "700",
    fontSize: webMs(FONT_SIZES.sm),
  },
  // Configured side pot: a proper rounded dark row (not one thin text line) with a
  // clear name/amount hierarchy and accessible Edit/Delete.
  sidePotListItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: webSc(SPACING.sm),
    paddingVertical: webSc(SPACING.md),
    paddingHorizontal: webSc(SPACING.md),
    borderRadius: webSc(RADIUS.md),
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: webSc(SPACING.sm),
  },
  sidePotListInfo: { flex: 1, minWidth: 0, gap: webSc(2) },
  sidePotListName: {
    fontSize: webMs(FONT_SIZES.md),
    color: COLORS.text,
    fontWeight: "700",
  },
  sidePotListAmt: {
    fontSize: webMs(FONT_SIZES.sm),
    color: COLORS.success,
    fontWeight: "700",
  },
  sidePotListActions: {
    flexDirection: "row",
    gap: webSc(SPACING.md),
    alignItems: "center",
  },
  sidePotLink: {
    color: COLORS.primary,
    fontSize: webMs(FONT_SIZES.sm),
    fontWeight: "600",
  },
  sidePotLinkDanger: {
    color: COLORS.error,
    fontSize: webMs(FONT_SIZES.sm),
    fontWeight: "600",
  },

  // Keyboard Done accessory (iOS)
  kbDoneBar: {
    backgroundColor: COLORS.surface,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingVertical: webSc(SPACING.sm),
    paddingHorizontal: webSc(SPACING.md),
    alignItems: "flex-end",
  },
  kbDoneText: {
    fontSize: webMs(FONT_SIZES.md),
    color: COLORS.primary,
    fontWeight: "700",
    paddingHorizontal: webSc(SPACING.sm),
  },

  // Built-in fees (entry-fee breakdown)
  feeBlock: {
    backgroundColor: COLORS.background,
    borderRadius: webSc(RADIUS.sm),
    padding: webSc(SPACING.sm),
    marginBottom: webSc(SPACING.md),
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  feeEmptyText: {
    fontSize: webMs(FONT_SIZES.sm),
    color: COLORS.textMuted,
    fontStyle: "italic",
    marginTop: webSc(SPACING.sm),
  },
  // Secondary/outlined action buttons (Add Fee / Edit Fees), side by side.
  feeActionRow: {
    flexDirection: "row",
    gap: webSc(SPACING.sm),
    marginTop: webSc(SPACING.sm),
  },
  feeBtn: {
    paddingVertical: webSc(SPACING.sm),
    paddingHorizontal: webSc(SPACING.md),
    borderRadius: webSc(RADIUS.sm),
    borderWidth: 1,
    borderColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  feeBtnFull: { flex: 1 },
  feeBtnActive: { backgroundColor: COLORS.primary },
  feeBtnText: {
    fontSize: webMs(FONT_SIZES.sm),
    color: COLORS.primary,
    fontWeight: "700",
  },
  feeBtnTextActive: { color: COLORS.white },
  feeAmountStatic: {
    fontSize: webMs(FONT_SIZES.sm),
    color: COLORS.text,
    fontWeight: "600",
    paddingVertical: webSc(SPACING.xs),
  },
  feeAmountStaticOff: { color: COLORS.textMuted },
  feeRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: webSc(SPACING.xs),
    gap: webSc(SPACING.xs),
  },
  feeBox2: { paddingVertical: webSc(SPACING.xs) },
  feeBox: {
    width: webSc(22),
    height: webSc(22),
    borderRadius: webSc(RADIUS.sm),
    borderWidth: 1.5,
    borderColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
  },
  feeBoxOn: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  feeBoxCheck: {
    color: COLORS.white,
    fontSize: webMs(FONT_SIZES.sm),
    fontWeight: "800",
  },
  feeNameStaticWrap: { flex: 1, paddingVertical: webSc(SPACING.xs) },
  feeNameInput: { flex: 1, paddingVertical: webSc(SPACING.xs) },
  feeLabel: {
    fontSize: webMs(FONT_SIZES.sm),
    color: COLORS.text,
    fontWeight: "500",
  },
  feeAmtWrap: { flexDirection: "row", alignItems: "center" },
  feeDollar: {
    fontSize: webMs(FONT_SIZES.sm),
    color: COLORS.textSecondary,
    marginRight: webSc(2),
  },
  feeAmtInput: {
    minWidth: webSc(70),
    textAlign: "right",
    paddingVertical: webSc(SPACING.xs),
  },
  feeTrash: { padding: webSc(SPACING.xs) },
  feeTrashText: { fontSize: webMs(FONT_SIZES.md) },
  // Fee mode segmented control
  feeModeRow: {
    flexDirection: "row",
    gap: webSc(SPACING.xs),
    marginTop: webSc(SPACING.xs),
    marginBottom: webSc(SPACING.sm),
  },
  feeModePill: {
    flex: 1,
    paddingVertical: webSc(SPACING.xs),
    borderRadius: webSc(RADIUS.sm),
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
  },
  feeModePillOn: {
    backgroundColor: COLORS.primary + "20",
    borderColor: COLORS.primary,
  },
  feeModeText: {
    fontSize: webMs(FONT_SIZES.xs),
    color: COLORS.textSecondary,
    fontWeight: "600",
  },
  feeModeTextOn: { color: COLORS.primary, fontWeight: "700" },
  // Fee breakdown
  feeBreakdown: {
    marginTop: webSc(SPACING.sm),
    paddingTop: webSc(SPACING.sm),
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  feeBreakRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: webSc(2),
  },
  feeBreakLabel: {
    fontSize: webMs(FONT_SIZES.sm),
    color: COLORS.textSecondary,
  },
  feeBreakValue: {
    fontSize: webMs(FONT_SIZES.sm),
    color: COLORS.text,
    fontWeight: "500",
  },
  feeBreakTotalRow: {
    marginTop: webSc(SPACING.xs),
    paddingTop: webSc(SPACING.xs),
    borderTopWidth: 1,
    borderTopColor: COLORS.border + "80",
  },
  feeBreakSub: {
    fontSize: webMs(FONT_SIZES.xs),
    color: COLORS.textSecondary,
    marginTop: webSc(2),
  },
  feeRemainder: {
    fontSize: webMs(FONT_SIZES.xs),
    color: COLORS.primary,
    fontWeight: "700",
    marginTop: webSc(SPACING.sm),
  },
  feeRemainderWarn: { color: COLORS.error },
  feeBreakNote: {
    fontSize: webMs(FONT_SIZES.xs),
    color: COLORS.warning,
    marginTop: webSc(SPACING.sm),
    lineHeight: webMs(FONT_SIZES.xs) * 1.4,
  },
  scheduleStaleWarn: {
    fontSize: webMs(FONT_SIZES.sm),
    color: COLORS.warning,
    fontWeight: "700",
    marginTop: webSc(SPACING.sm),
    lineHeight: webMs(FONT_SIZES.sm) * 1.4,
  },

  // Read-only cards (venue)
  readOnlyCard: {
    backgroundColor: COLORS.background,
    borderRadius: webSc(RADIUS.sm),
    padding: webSc(SPACING.sm),
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  readOnlyName: {
    fontSize: webMs(FONT_SIZES.sm),
    fontWeight: "700",
    color: COLORS.text,
  },
  readOnlySub: {
    fontSize: webMs(FONT_SIZES.xs),
    color: COLORS.textSecondary,
    marginTop: webSc(2),
  },

  // Save / start
  saveRow: {
    flexDirection: "row",
    gap: webSc(SPACING.sm),
    marginTop: webSc(SPACING.xs),
  },
  // Setup sidebar actions (Settings under Live Preview / Prize Pool under Summary): stacked
  // full-width buttons matching the Players/Pool Tables sidebar action pattern.
  ppSidebarActions: { marginTop: webSc(SPACING.md), gap: webSc(SPACING.sm) },
  // Side-by-side action row: Save (outline, flex 1) left, primary (blue, slightly wider) right.
  ppSidebarBtnRow: { flexDirection: "row", gap: webSc(SPACING.sm) },
  ppSidebarBtnWide: { flex: 1.4 as any },
  startHintSidebar: { fontSize: webMs(FONT_SIZES.xs), color: COLORS.warning, marginBottom: webSc(SPACING.xs) },
  saveBtn: {
    flex: 1,
    paddingVertical: webSc(SPACING.md),
    borderRadius: webSc(RADIUS.md),
    borderWidth: 1,
    borderColor: COLORS.primary,
    backgroundColor: COLORS.surface,
    alignItems: "center",
  },
  saveBtnText: {
    color: COLORS.primary,
    fontSize: webMs(FONT_SIZES.md),
    fontWeight: "700",
  },
  startBtn: {
    flex: 1,
    paddingVertical: webSc(SPACING.md),
    borderRadius: webSc(RADIUS.md),
    backgroundColor: COLORS.primary,
    alignItems: "center",
  },
  startBtnText: {
    color: COLORS.white,
    fontSize: webMs(FONT_SIZES.md),
    fontWeight: "700",
  },
  btnDisabled: { opacity: 0.5 },
  startBtnRunning: { backgroundColor: COLORS.warning },
  btnRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: webSc(SPACING.sm),
  },
  startHint: {
    fontSize: webMs(FONT_SIZES.xs),
    color: COLORS.textMuted,
    fontStyle: "italic",
    marginTop: webSc(SPACING.sm),
  },
  reviewStatus: {
    fontSize: webMs(FONT_SIZES.md),
    color: COLORS.success,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: webSc(SPACING.md),
  },

  // Close registration / lock players
  lockBtn: {
    borderWidth: 1,
    borderColor: COLORS.warning,
    backgroundColor: COLORS.warning + "20",
    borderRadius: webSc(RADIUS.sm),
    paddingVertical: webSc(SPACING.sm),
    alignItems: "center",
    marginBottom: webSc(SPACING.sm),
  },
  lockBtnText: {
    color: COLORS.warning,
    fontSize: webMs(FONT_SIZES.sm),
    fontWeight: "700",
  },
  lockBtnFooter: { marginBottom: 0, paddingVertical: webSc(SPACING.md) },
  playersFooter: {
    paddingHorizontal: webSc(5),
    paddingTop: webSc(18),
    paddingBottom: Platform.OS === "ios" ? webSc(15) : webSc(10),
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    backgroundColor: COLORS.background,
    alignItems: "center",
    // Web/desktop: a real footer action row — centered at the content width, right-aligned
    // CTA, compact padding (native/mobile keeps the full-width centered footer above).
    ...(isWeb ? { maxWidth: WEB_MAXW, width: "100%" as any, alignSelf: "center" as any, alignItems: "flex-end" as any, paddingHorizontal: webSc(SPACING.md), paddingTop: webSc(SPACING.md), paddingBottom: webSc(SPACING.md) } : null),
  },
  lockBtnFooterInner: { width: "95%" },
  settingsFooter: {
    paddingHorizontal: webSc(5),
    paddingTop: webSc(18),
    paddingBottom: Platform.OS === "ios" ? webSc(15) : webSc(10),
    backgroundColor: COLORS.background,
    alignItems: "center",
    ...(isWeb ? { maxWidth: WEB_MAXW, width: "100%" as any, alignSelf: "center" as any, alignItems: "stretch" as any, paddingHorizontal: webSc(SPACING.md), paddingTop: webSc(SPACING.md), paddingBottom: webSc(SPACING.md), borderTopWidth: 1, borderTopColor: COLORS.border } : null),
  },
  settingsFooterInner: { width: "95%", marginTop: 0, ...(isWeb ? { width: "100%" as any, justifyContent: "flex-end" as any } : null) },
  // Web/desktop footer button: content-sized (cancels the native flex:1 / 95% width),
  // sensible min-width, right-aligned. Appended last so it overrides base + inline flex.
  // Web/desktop footer button: content-sized, right-aligned, NEVER flex-grow. Must override
  // the base `flex: 1` (and inline {flex:1}/{flex:2}) on the SAME `flex` key: react-native-web
  // emits `flex: <n>` as a raw CSS shorthand (flex: 1 1 0%) that would otherwise win the
  // cascade over flexGrow:0 and stretch the button. `flex: -1` is the RN idiom RN-Web expands
  // to flexGrow:0 / flexShrink:1 / flexBasis:auto — content width, no growth, no shorthand.
  // width:"auto" is REQUIRED in addition to flex:-1 — some callers also carry an explicit
  // width (e.g. lockBtnFooterInner width:"95%") that flex:-1 alone wouldn't override, so the
  // step-nav "Continue to …" buttons would otherwise stay ~full width. auto → content width.
  stepBtnWeb: { flex: -1, width: "auto" as any, minWidth: webSc(180), paddingHorizontal: webSc(SPACING.xl), alignSelf: "flex-end" as any },
  startHintFooter: {
    fontSize: webMs(FONT_SIZES.xs),
    color: COLORS.textMuted,
    fontStyle: "italic",
    textAlign: "center",
    marginBottom: webSc(SPACING.xs),
    width: "95%",
  },

  // Tables
  tableAddRow: {
    flexDirection: "row",
    gap: webSc(SPACING.sm),
    alignItems: "center",
    marginBottom: webSc(SPACING.sm),
  },
  tableAddBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: webSc(RADIUS.sm),
    paddingVertical: webSc(SPACING.sm),
    paddingHorizontal: webSc(SPACING.md),
  },
  tableAddBtnText: {
    color: COLORS.white,
    fontSize: webMs(FONT_SIZES.sm),
    fontWeight: "700",
  },
  tableCard: {
    backgroundColor: COLORS.background,
    borderRadius: webSc(RADIUS.sm),
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: webSc(SPACING.sm),
    marginBottom: webSc(SPACING.sm),
  },
  tableCardHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: webSc(SPACING.sm),
  },
  tableName: {
    fontSize: webMs(FONT_SIZES.sm),
    fontWeight: "700",
    color: COLORS.text,
    flexShrink: 1,
  },
  tableDelete: {
    fontSize: webMs(FONT_SIZES.xs),
    color: COLORS.error,
    fontWeight: "600",
  },
  tableInUseBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: webSc(SPACING.xs),
    alignSelf: "flex-start",
    backgroundColor: COLORS.success + "22",
    borderColor: COLORS.success,
    borderWidth: 1,
    borderRadius: webSc(RADIUS.sm),
    paddingHorizontal: webSc(SPACING.sm),
    paddingVertical: webSc(2),
    marginBottom: webSc(SPACING.xs),
  },
  tableInUseDot: {
    width: webSc(7),
    height: webSc(7),
    borderRadius: webSc(4),
    backgroundColor: COLORS.success,
  },
  tableInUseText: { fontSize: webMs(FONT_SIZES.xs), color: COLORS.success, fontWeight: "800" },
  tableStatusRow: {
    flexDirection: "row",
    gap: webSc(SPACING.xs),
    marginBottom: webSc(SPACING.xs),
  },
  tableStatusBtnLocked: { opacity: 0.4 },
  tableInfoBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
    padding: webSc(SPACING.lg),
  },
  tableInfoCard: {
    width: "100%",
    maxWidth: webSc(420),
    backgroundColor: COLORS.surface,
    borderRadius: webSc(RADIUS.lg),
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: webSc(SPACING.lg),
  },
  tableInfoTitle: {
    fontSize: webMs(FONT_SIZES.xs),
    fontWeight: "900",
    color: COLORS.success,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  tableInfoLabel: {
    fontSize: webMs(FONT_SIZES.sm),
    fontWeight: "800",
    color: COLORS.primary,
    marginTop: webSc(SPACING.xs),
  },
  tableInfoNames: {
    fontSize: webMs(FONT_SIZES.lg),
    fontWeight: "800",
    color: COLORS.text,
    marginTop: webSc(2),
    marginBottom: webSc(SPACING.sm),
  },
  tableInfoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: webSc(SPACING.xs),
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  tableInfoRowLabel: { fontSize: webMs(FONT_SIZES.sm), color: COLORS.textSecondary },
  tableInfoRowVal: { fontSize: webMs(FONT_SIZES.sm), color: COLORS.text, fontWeight: "700" },
  tableInfoHint: {
    fontSize: webMs(FONT_SIZES.xs),
    color: COLORS.textMuted,
    marginTop: webSc(SPACING.sm),
  },
  tableInfoBtns: { flexDirection: "row", gap: webSc(SPACING.sm), marginTop: webSc(SPACING.md) },
  tableInfoBtn: {
    flex: 1,
    paddingVertical: webSc(SPACING.md),
    borderRadius: webSc(RADIUS.md),
    alignItems: "center",
  },
  tableInfoBtnGhost: { borderWidth: 1, borderColor: COLORS.border },
  tableInfoBtnGhostText: { color: COLORS.textSecondary, fontWeight: "700", fontSize: webMs(FONT_SIZES.sm) },
  tableInfoBtnPrimary: { backgroundColor: COLORS.primary },
  tableInfoBtnPrimaryText: { color: "#fff", fontWeight: "800", fontSize: webMs(FONT_SIZES.sm) },

  // Collapsible "Add Tables" header
  collapseHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  collapseCaret: { fontSize: webMs(FONT_SIZES.md), color: COLORS.textSecondary, fontWeight: "900" },

  // Compact table card (tap to edit)
  tableRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: webSc(SPACING.xs),
    backgroundColor: COLORS.surface,
    borderRadius: webSc(RADIUS.md),
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: webSc(SPACING.md),
    paddingVertical: webSc(SPACING.md),
    marginBottom: webSc(SPACING.sm),
  },
  // Web: two-up grid for the tables list.
  tableGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" },
  // ── Web/desktop Pool Table Management redesign (two-column, sticky sidebar) ──
  ptPaneWeb: { flex: 1 },
  ptScrollContent: {
    width: "100%" as any,
    maxWidth: WEB_MAXW,
    alignSelf: "center" as any,
    paddingHorizontal: webSc(SPACING.md),
    paddingTop: webSc(SPACING.sm),
    paddingBottom: webSc(SPACING.xl) * 2,
  },
  ptTwoCol: { flexDirection: "row", alignItems: "flex-start", gap: webSc(SPACING.lg) },
  // Generate Bracket: Bracket Size + Draw Type side by side (wraps at narrow desktop widths).
  bracketConfigRow: { flexDirection: "row", alignItems: "stretch", gap: webSc(SPACING.md), flexWrap: "wrap" },
  bracketConfigCol: { flex: 1, minWidth: webSc(240) },
  // Race Assignment: group · players · race as one compact inline line (wraps naturally).
  raceAssignRow: { fontSize: webMs(FONT_SIZES.sm), color: COLORS.text, paddingVertical: webSc(SPACING.xs) },
  ptMainCol: { flex: 1, minWidth: 0 as any, gap: webSc(SPACING.md) },
  ptSummaryCol: {
    width: 320,
    position: "sticky" as any,
    top: webSc(SPACING.sm),
    alignSelf: "flex-start" as any,
  },
  ptHeaderText: { minWidth: 0 as any },
  ptTitle: { fontSize: webMs(FONT_SIZES.xl), fontWeight: "800", color: COLORS.text },
  ptSubtitle: { fontSize: webMs(FONT_SIZES.sm), color: COLORS.textSecondary, marginTop: webSc(2) },
  ptAddCard: {
    backgroundColor: COLORS.surface,
    borderRadius: webSc(RADIUS.md),
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: webSc(SPACING.md),
  },
  ptCardTitle: { fontSize: webMs(FONT_SIZES.md), fontWeight: "800", color: COLORS.text, marginBottom: webSc(SPACING.sm) },
  ptAddRowOne: { flexDirection: "row", gap: webSc(SPACING.sm), alignItems: "flex-end", flexWrap: "wrap" },
  ptFieldLabelCol: { width: 280 },
  ptFieldNumCol: { width: 110 },
  ptFieldStreamCol: { flex: 1, minWidth: 240 },
  ptAddBtnInline: { marginTop: 0, alignSelf: "flex-end" as any },
  ptPrimaryBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: webSc(RADIUS.sm),
    paddingVertical: webSc(SPACING.sm),
    alignItems: "center",
    justifyContent: "center",
    marginTop: webSc(SPACING.xs),
    alignSelf: "flex-start" as any,
    paddingHorizontal: webSc(SPACING.lg),
  },
  ptPrimaryBtnText: { color: COLORS.white, fontSize: webMs(FONT_SIZES.sm), fontWeight: "700" },
  ptBulkCalloutRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: webSc(SPACING.md),
    backgroundColor: COLORS.surface,
    borderRadius: webSc(RADIUS.md),
    borderWidth: 1,
    borderColor: COLORS.border,
    borderStyle: "dashed" as any,
    padding: webSc(SPACING.md),
  },
  ptBulkCalloutText: { flex: 1, minWidth: 0 as any },
  ptCalloutTitle: { fontSize: webMs(FONT_SIZES.md), fontWeight: "800", color: COLORS.text },
  ptListHelp: { fontSize: webMs(FONT_SIZES.sm), color: COLORS.textSecondary, marginTop: webSc(-4), marginBottom: webSc(SPACING.sm) },
  ptBulkBtn: {
    backgroundColor: COLORS.primary + "22",
    borderWidth: 1,
    borderColor: COLORS.primary,
    borderRadius: webSc(RADIUS.sm),
    paddingVertical: webSc(SPACING.sm),
    paddingHorizontal: webSc(SPACING.md),
    alignItems: "center",
    marginTop: webSc(SPACING.xs),
    alignSelf: "flex-start" as any,
  },
  ptBulkBtnText: { color: COLORS.primary, fontSize: webMs(FONT_SIZES.sm), fontWeight: "700" },
  // Sticky sidebar (Tournament Summary + tools) — same design language as the Players summary.
  ptBulkBtnFull: {
    backgroundColor: COLORS.primary + "22",
    borderWidth: 1,
    borderColor: COLORS.primary,
    borderRadius: webSc(RADIUS.sm),
    paddingVertical: webSc(SPACING.sm),
    paddingHorizontal: webSc(SPACING.md),
    alignItems: "center",
    marginTop: webSc(SPACING.xs),
  },
  ptSummarySub: { fontSize: webMs(FONT_SIZES.xs), color: COLORS.textSecondary, marginTop: webSc(2) },
  ptSumRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: webSc(SPACING.xs),
  },
  ptSumLabel: { fontSize: webMs(FONT_SIZES.sm), color: COLORS.textSecondary },
  ptSumRange: { fontSize: webMs(FONT_SIZES.xs), color: COLORS.textMuted },
  ptSumValue: { fontSize: webMs(FONT_SIZES.md), fontWeight: "800", color: COLORS.text },
  ptSumSection: { fontSize: webMs(FONT_SIZES.sm), fontWeight: "800", color: COLORS.text, marginBottom: webSc(SPACING.xs) },
  ptHelpCard: {
    backgroundColor: COLORS.background,
    borderRadius: webSc(RADIUS.sm),
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: webSc(SPACING.sm),
    marginTop: webSc(SPACING.md),
  },
  ptHelpTitle: { fontSize: webMs(FONT_SIZES.sm), fontWeight: "800", color: COLORS.text, marginBottom: webSc(2) },
  ptHelpText: { fontSize: webMs(FONT_SIZES.xs), color: COLORS.textSecondary, lineHeight: webMs(FONT_SIZES.md) },
  ptListTitle: { fontSize: webMs(FONT_SIZES.md), fontWeight: "800", color: COLORS.text, marginBottom: webSc(SPACING.sm) },
  ptGrid: { flexDirection: "row", flexWrap: "wrap", gap: webSc(SPACING.md) },
  ptCard: {
    width: "48.5%" as any,
    backgroundColor: COLORS.surface,
    borderRadius: webSc(RADIUS.md),
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: webSc(SPACING.md),
    gap: webSc(SPACING.sm),
  },
  ptCardTop: { flexDirection: "row", alignItems: "center", gap: webSc(SPACING.sm) },
  ptCardIcon: { fontSize: webMs(FONT_SIZES.md) },
  ptCardNameWrap: { flex: 1, minWidth: 0 as any },
  ptCardName: { flex: 1, minWidth: 0 as any, fontSize: webMs(FONT_SIZES.md), fontWeight: "700", color: COLORS.text },
  ptCardFooter: { flexDirection: "row", justifyContent: "flex-end", marginTop: webSc(SPACING.xs) },
  ptActionsBtn: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: webSc(RADIUS.sm),
    paddingHorizontal: webSc(SPACING.md),
    paddingVertical: webSc(6),
    backgroundColor: COLORS.surface,
  },
  ptActionsBtnText: { fontSize: webMs(FONT_SIZES.sm), fontWeight: "700", color: COLORS.text },
  ptSmallModalCard: {
    width: "100%",
    maxWidth: webSc(440),
    backgroundColor: COLORS.surface,
    borderRadius: webSc(RADIUS.lg),
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: webSc(SPACING.lg),
    gap: webSc(SPACING.xs),
  },
  ptRenameLabelCol: { flex: 1 },
  ptRenameNumCol: { width: webSc(110) },
  ptStatusPill: {
    borderWidth: 1,
    borderRadius: webSc(RADIUS.full),
    paddingHorizontal: webSc(SPACING.sm),
    paddingVertical: webSc(2),
  },
  ptStatusPillText: { fontSize: webMs(FONT_SIZES.xs), fontWeight: "700" },
  ptTrashBtn: { paddingHorizontal: webSc(4), paddingVertical: webSc(2) },
  ptTrashText: { fontSize: webMs(FONT_SIZES.md), color: COLORS.error },
  ptStreamRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: webSc(SPACING.xs),
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: webSc(SPACING.sm),
  },
  ptStreamIcon: { fontSize: webMs(FONT_SIZES.sm) },
  ptStreamText: { flex: 1, minWidth: 0 as any, fontSize: webMs(FONT_SIZES.sm), color: COLORS.textSecondary },
  ptStreamAdd: { color: COLORS.primary, fontWeight: "600" },
  ptStreamLive: { fontSize: webMs(FONT_SIZES.xs), fontWeight: "800", color: COLORS.error },
  // Inline stream-link input row
  ptStreamInput: {
    flex: 1,
    minWidth: 0 as any,
    height: webSc(32),
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: webSc(RADIUS.sm),
    paddingHorizontal: webSc(SPACING.sm),
    fontSize: webMs(FONT_SIZES.sm),
    color: COLORS.text,
    ...(Platform.OS === "web" ? ({ outlineStyle: "none", outlineWidth: 0 } as object) : null),
  },
  ptStreamSaveBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: webSc(RADIUS.sm),
    paddingHorizontal: webSc(SPACING.md),
    height: webSc(32),
    alignItems: "center",
    justifyContent: "center",
  },
  ptStreamSaveText: { color: COLORS.white, fontSize: webMs(FONT_SIZES.xs), fontWeight: "700" },
  ptStreamViewBtn: {
    borderWidth: 1,
    borderColor: COLORS.primary,
    borderRadius: webSc(RADIUS.sm),
    paddingHorizontal: webSc(SPACING.sm),
    height: webSc(32),
    alignItems: "center",
    justifyContent: "center",
  },
  ptStreamViewText: { color: COLORS.primary, fontSize: webMs(FONT_SIZES.xs), fontWeight: "700" },
  ptStreamSaved: { fontSize: webMs(FONT_SIZES.sm), color: COLORS.success, fontWeight: "700" },
  ptStreamViewLink: { fontSize: webMs(FONT_SIZES.sm), color: COLORS.primary, fontWeight: "700" },
  ptBulkModalCard: {
    width: "100%",
    maxWidth: webSc(460),
    backgroundColor: COLORS.surface,
    borderRadius: webSc(RADIUS.lg),
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: webSc(SPACING.lg),
    gap: webSc(SPACING.xs),
  },
  ptModalSub: { fontSize: webMs(FONT_SIZES.sm), color: COLORS.textSecondary, marginBottom: webSc(SPACING.sm) },
  ptBulkRangeRow: { flexDirection: "row", gap: webSc(SPACING.md) },
  ptBulkRangeCol: { flex: 1 },
  ptPreviewBox: {
    backgroundColor: COLORS.background,
    borderRadius: webSc(RADIUS.sm),
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: webSc(SPACING.sm),
    marginBottom: webSc(SPACING.sm),
  },
  ptPreviewText: { fontSize: webMs(FONT_SIZES.sm), color: COLORS.text },
  ptPreviewEmpty: { fontSize: webMs(FONT_SIZES.sm), color: COLORS.textMuted },
  ptConflictText: { fontSize: webMs(FONT_SIZES.sm), color: COLORS.error, marginBottom: webSc(SPACING.sm), fontWeight: "600" },
  ptModalCancelBtn: { borderWidth: 1, borderColor: COLORS.border, backgroundColor: "transparent" },
  ptModalCancelText: { color: COLORS.text, fontSize: webMs(FONT_SIZES.sm), fontWeight: "700" },
  tableRowWeb: { width: "48.5%" },
  tableRowMain: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: webSc(SPACING.sm),
  },
  tablesListLabel: {
    fontSize: webMs(FONT_SIZES.sm),
    color: COLORS.textSecondary,
    fontWeight: "600",
    marginTop: webSc(SPACING.md),
    marginBottom: webSc(SPACING.sm),
  },
  tableRemoveBtn: { paddingHorizontal: webSc(SPACING.sm), paddingVertical: webSc(SPACING.xs) },
  tableRemoveText: { fontSize: webMs(FONT_SIZES.lg), color: COLORS.error, fontWeight: "800" },
  tableRemoveOff: { color: COLORS.textMuted, opacity: 0.4 },
  tableRowLeft: { flex: 1, gap: webSc(2) },
  tableRowName: { fontSize: webMs(FONT_SIZES.md), fontWeight: "800", color: COLORS.text },
  tableRowSub: { fontSize: webMs(FONT_SIZES.xs), color: COLORS.success, fontWeight: "700" },
  tableRowNames: { fontSize: webMs(FONT_SIZES.xs), color: COLORS.success, fontWeight: "700" },
  tableRowRight: { flexDirection: "row", alignItems: "center", gap: webSc(SPACING.sm) },
  statusChip: {
    paddingHorizontal: webSc(SPACING.sm),
    paddingVertical: webSc(3),
    borderRadius: webSc(RADIUS.full),
    borderWidth: 1,
  },
  statusChipText: { fontSize: webMs(FONT_SIZES.xs), fontWeight: "800" },
  tableRowChevron: { fontSize: webMs(FONT_SIZES.lg), color: COLORS.textMuted, fontWeight: "700" },
  streamLive: {
    color: COLORS.error,
    fontSize: webMs(FONT_SIZES.xs),
    fontWeight: "900",
    letterSpacing: 0.5,
  },

  // Table edit sheet
  editHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: webSc(SPACING.sm),
  },
  editTitle: { fontSize: webMs(FONT_SIZES.lg), fontWeight: "800", color: COLORS.text, flex: 1 },
  editClose: { fontSize: webMs(FONT_SIZES.lg), fontWeight: "700", color: COLORS.textSecondary },
  editOccBanner: {
    backgroundColor: COLORS.success + "18",
    borderWidth: 1,
    borderColor: COLORS.success,
    borderRadius: webSc(RADIUS.md),
    padding: webSc(SPACING.md),
    marginBottom: webSc(SPACING.md),
    gap: webSc(2),
  },
  editOccLabel: { fontSize: webMs(FONT_SIZES.sm), fontWeight: "800", color: COLORS.success },
  editOccNames: { fontSize: webMs(FONT_SIZES.sm), fontWeight: "700", color: COLORS.text },
  editOccLink: {
    fontSize: webMs(FONT_SIZES.sm),
    fontWeight: "800",
    color: COLORS.primary,
    marginTop: webSc(SPACING.xs),
  },
  editLockHint: {
    fontSize: webMs(FONT_SIZES.xs),
    color: COLORS.textMuted,
    marginTop: webSc(SPACING.xs),
  },
  editStreamWrap: { marginTop: webSc(SPACING.md) },
  editRemoveBtn: { borderWidth: 1, borderColor: COLORS.error },
  editRemoveText: { color: COLORS.error, fontWeight: "800", fontSize: webMs(FONT_SIZES.sm) },

  tableStatusBtn: {
    flex: 1,
    paddingVertical: webSc(SPACING.xs),
    borderRadius: webSc(RADIUS.sm),
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
  },
  tableStatusBtnActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  tableStatusBtnText: {
    fontSize: webMs(FONT_SIZES.xs),
    fontWeight: "600",
    color: COLORS.textSecondary,
  },
  tableStatusBtnTextActive: { color: COLORS.white },

  // Review
  reviewRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: webSc(SPACING.sm),
    paddingVertical: webSc(SPACING.sm),
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  reviewDot: {
    width: webSc(12),
    height: webSc(12),
    borderRadius: webSc(6),
  },
  reviewLabel: {
    flex: 1,
    fontSize: webMs(FONT_SIZES.sm),
    color: COLORS.text,
  },
  reviewGo: {
    fontSize: webMs(FONT_SIZES.xs),
    color: COLORS.primary,
    fontWeight: "700",
  },

  // Guided prompt
  gateBody: {
    fontSize: webMs(FONT_SIZES.sm),
    color: COLORS.textSecondary,
    lineHeight: webMs(FONT_SIZES.sm) * 1.5,
  },
  // Player-readiness summary rows.
  readinessRows: {
    marginVertical: webSc(SPACING.sm),
    gap: webSc(2),
  },
  readinessLine: {
    fontSize: webMs(FONT_SIZES.md),
    fontWeight: "800",
    color: COLORS.text,
  },
  readinessSub: {
    fontSize: webMs(FONT_SIZES.sm),
    fontWeight: "600",
    color: COLORS.textSecondary,
    marginTop: webSc(2),
  },

  // Players
  playersTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: webSc(SPACING.sm),
    gap: webSc(SPACING.sm),
    flexWrap: "wrap",
  },
  countPills: { flexDirection: "row", gap: webSc(SPACING.xs), flexWrap: "wrap" },
  countPill: {
    fontSize: webMs(FONT_SIZES.xs),
    color: COLORS.textSecondary,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: webSc(RADIUS.full),
    paddingHorizontal: webSc(SPACING.sm),
    paddingVertical: webSc(2),
    overflow: "hidden",
  },
  addButton: {
    backgroundColor: COLORS.primary,
    borderRadius: webSc(RADIUS.sm),
    paddingVertical: webSc(SPACING.sm),
    paddingHorizontal: webSc(SPACING.md),
    // Web: fixed 40px height + centered content so it matches the search input and status
    // dropdown exactly (all three align top/bottom). Native keeps its intrinsic sizing.
    ...(Platform.OS === "web" ? { height: 40, paddingVertical: 0, justifyContent: "center", alignItems: "center" } : null),
  },
  addButtonText: {
    color: COLORS.white,
    fontSize: webMs(FONT_SIZES.sm),
    fontWeight: "700",
  },

  regCard: {
    backgroundColor: COLORS.surface,
    borderRadius: webSc(RADIUS.md),
    // Web: tighter padding + gap for a dense roster; native keeps roomier spacing.
    padding: isWeb ? webSc(SPACING.sm) : webSc(SPACING.md),
    marginBottom: webSc(SPACING.sm),
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: isWeb ? webSc(SPACING.xs) : webSc(SPACING.sm),
  },
  regMain: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: webSc(SPACING.sm),
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: webSc(SPACING.sm),
    flex: 1,
  },
  playerName: {
    fontSize: webMs(FONT_SIZES.md),
    fontWeight: "600",
    color: COLORS.text,
    flexShrink: 1,
  },
  playerId: { fontSize: webMs(FONT_SIZES.xs), color: COLORS.textSecondary },
  regMeta: { alignItems: "flex-end", gap: webSc(2) },
  fargoText: { fontSize: webMs(FONT_SIZES.xs), color: COLORS.textSecondary },
  guestTag: {
    backgroundColor: COLORS.textSecondary + "20",
    paddingHorizontal: webSc(SPACING.sm),
    paddingVertical: webSc(2),
    borderRadius: webSc(RADIUS.sm),
  },
  guestTagText: {
    fontSize: webMs(FONT_SIZES.xs),
    color: COLORS.textSecondary,
    fontWeight: "600",
  },
  statusBadge: {
    paddingHorizontal: webSc(SPACING.sm),
    paddingVertical: webSc(2),
    borderRadius: webSc(RADIUS.md),
  },
  statusText: {
    fontSize: webMs(FONT_SIZES.xs),
    fontWeight: "600",
    textTransform: "capitalize",
  },
  regActions: { flexDirection: "row", flexWrap: "wrap", gap: webSc(SPACING.sm) },
  regActionBtn: {
    flex: 1,
    // Web: shorter buttons for a compact action row; native keeps a full touch target.
    paddingVertical: isWeb ? webSc(6) : webSc(SPACING.sm),
    paddingHorizontal: webSc(SPACING.sm),
    borderRadius: webSc(RADIUS.sm),
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  approveBtn: {
    backgroundColor: COLORS.success + "20",
    borderColor: COLORS.success,
  },
  approveBtnText: {
    color: COLORS.success,
    fontSize: webMs(FONT_SIZES.sm),
    fontWeight: "600",
  },
  checkInBtn: {
    backgroundColor: COLORS.primary + "20",
    borderColor: COLORS.primary,
  },
  checkInBtnText: {
    color: COLORS.primary,
    fontSize: webMs(FONT_SIZES.sm),
    fontWeight: "600",
  },
  noShowBtn: { backgroundColor: COLORS.surface, borderColor: COLORS.border },
  noShowBtnText: {
    color: COLORS.textSecondary,
    fontSize: webMs(FONT_SIZES.sm),
    fontWeight: "600",
  },
  removeBtn: { backgroundColor: COLORS.surface, borderColor: COLORS.error },
  removeBtnText: {
    color: COLORS.error,
    fontSize: webMs(FONT_SIZES.sm),
    fontWeight: "600",
  },
  readyBtn: { backgroundColor: COLORS.success, borderColor: COLORS.success },
  readyBtnText: {
    color: COLORS.white,
    fontSize: webMs(FONT_SIZES.sm),
    fontWeight: "700",
  },
  undoBtn: { backgroundColor: COLORS.surface, borderColor: COLORS.textSecondary },
  undoBtnText: {
    color: COLORS.textSecondary,
    fontSize: webMs(FONT_SIZES.sm),
    fontWeight: "600",
  },
  restoreBtn: { backgroundColor: COLORS.success + "20", borderColor: COLORS.success },
  restoreBtnText: {
    color: COLORS.success,
    fontSize: webMs(FONT_SIZES.sm),
    fontWeight: "600",
  },
  // Single Actions button (replaces permanent Edit/Undo/Remove) on a player card.
  rowActionsBtn: { backgroundColor: COLORS.surface, borderColor: COLORS.border },
  rowActionsBtnText: { color: COLORS.text, fontSize: webMs(FONT_SIZES.sm), fontWeight: "700" },
  // Fargo verification control (edit body).
  fargoVerifyTag: { marginTop: webSc(SPACING.xs) },
  fargoVerifiedText: { color: COLORS.success, fontSize: webMs(FONT_SIZES.xs), fontWeight: "800" },
  fargoVerifyBtn: {
    marginTop: webSc(SPACING.xs),
    borderWidth: 1,
    borderColor: COLORS.primary,
    borderRadius: webSc(RADIUS.sm),
    paddingHorizontal: webSc(SPACING.sm),
    paddingVertical: webSc(3),
    alignSelf: "flex-start",
  },
  fargoVerifyBtnText: { color: COLORS.primary, fontSize: webMs(FONT_SIZES.xs), fontWeight: "800" },
  // Player card — header / status / payment
  regHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: webSc(SPACING.sm),
  },
  statusLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: webSc(SPACING.xs),
    marginTop: webSc(SPACING.xs),
    marginBottom: webSc(SPACING.xs),
  },
  statusDotSm: { width: webSc(9), height: webSc(9), borderRadius: webSc(5) },
  statusLineText: { fontSize: webMs(FONT_SIZES.sm), fontWeight: "700" },
  // ── Compact roster card: single-row header (name · #id · status pill · Fargo) ──
  regTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: webSc(SPACING.sm),
  },
  regTopLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: webSc(SPACING.sm),
    flexShrink: 1,
    flexWrap: "wrap",
  },
  playerIdInline: { fontSize: webMs(FONT_SIZES.xs), color: COLORS.textMuted },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: webSc(5),
    paddingHorizontal: webSc(SPACING.sm),
    paddingVertical: webSc(2),
    borderRadius: webSc(RADIUS.full),
    borderWidth: 1,
  },
  statusPillText: { fontSize: webMs(FONT_SIZES.xs), fontWeight: "700" },
  fargoInline: { flexDirection: "row", alignItems: "baseline", gap: webSc(5) },
  fargoInlineLabel: { fontSize: webMs(FONT_SIZES.xs), color: COLORS.textSecondary, fontWeight: "500" },
  fargoInlineValue: { fontSize: webMs(FONT_SIZES.lg), color: COLORS.primary, fontWeight: "800" },
  // Compact payment chips (web Ready card): entry (read) + tappable side pots.
  payChipRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: webSc(SPACING.xs) },
  payChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: webSc(4),
    paddingHorizontal: webSc(SPACING.sm),
    paddingVertical: webSc(4),
    borderRadius: webSc(RADIUS.full),
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.background,
  },
  payChipOn: { borderColor: COLORS.success, backgroundColor: COLORS.success + "1A" },
  payChipText: { fontSize: webMs(FONT_SIZES.xs), color: COLORS.textSecondary, fontWeight: "600" },
  payChipTextOn: { color: COLORS.success },
  payChipCheck: { fontSize: webMs(FONT_SIZES.xs), fontWeight: "800", color: COLORS.success },
  payRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: webSc(SPACING.sm),
    paddingVertical: webSc(SPACING.xs),
  },
  checkbox: {
    width: webSc(22),
    height: webSc(22),
    borderRadius: webSc(RADIUS.sm),
    borderWidth: 1.5,
    borderColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.background,
  },
  checkboxOn: { backgroundColor: COLORS.success, borderColor: COLORS.success },
  checkboxMark: {
    color: COLORS.white,
    fontSize: webMs(FONT_SIZES.sm),
    fontWeight: "800",
  },
  payLabel: { fontSize: webMs(FONT_SIZES.sm), color: COLORS.text },
  payLabelPaid: { color: COLORS.success, fontWeight: "600" },
  // Left: Entry Fee + side pots stacked tightly. Right: the Fargo field.
  assignPayRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: webSc(SPACING.sm),
  },
  payCol: { flex: 1 },
  fargoRight: { alignItems: "flex-start" },
  assignText: {
    fontSize: webMs(FONT_SIZES.sm),
    color: COLORS.textSecondary,
    fontWeight: "600",
    marginBottom: webSc(SPACING.xs),
  },
  // Fargo readout on a Ready card: gray label, big blue number.
  fargoReadLabel: {
    fontSize: webMs(FONT_SIZES.sm),
    color: COLORS.textSecondary,
    fontWeight: "500",
  },
  fargoReadNumber: {
    fontSize: webMs(FONT_SIZES.xxl),
    color: COLORS.primary,
    fontWeight: "800",
    lineHeight: webMs(FONT_SIZES.xxl) + 2,
  },

  // Players-ready banner (Tables tab)
  readyBanner: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "center",
    gap: webSc(SPACING.xs),
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: webSc(RADIUS.md),
    padding: webSc(SPACING.md),
    marginBottom: webSc(SPACING.md),
  },
  readyBannerNum: {
    fontSize: webMs(FONT_SIZES.xxl),
    fontWeight: "800",
    color: COLORS.primary,
  },
  readyBannerLabel: {
    fontSize: webMs(FONT_SIZES.md),
    fontWeight: "600",
    color: COLORS.textSecondary,
  },

  // ── Bracket / Draw ──────────────────────────────────────────────────────────
  sumGrid: { flexDirection: "row", flexWrap: "wrap", gap: webSc(SPACING.sm) },
  sumCard: {
    flexGrow: 1,
    flexBasis: "47%",
    backgroundColor: COLORS.background,
    borderRadius: webSc(RADIUS.sm),
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: webSc(SPACING.sm),
  },
  sumValue: {
    fontSize: webMs(FONT_SIZES.lg),
    fontWeight: "800",
    color: COLORS.text,
  },
  sumLabel: {
    fontSize: webMs(FONT_SIZES.xs),
    color: COLORS.textSecondary,
    marginTop: webSc(2),
  },
  calcRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: webSc(SPACING.xs),
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    gap: webSc(SPACING.sm),
  },
  calcLabel: {
    fontSize: webMs(FONT_SIZES.sm),
    color: COLORS.textSecondary,
    flexShrink: 1,
  },
  calcVal: {
    fontSize: webMs(FONT_SIZES.sm),
    color: COLORS.text,
    fontWeight: "700",
  },
  matchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: webSc(SPACING.sm),
    paddingVertical: webSc(SPACING.xs),
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  matchNum: {
    fontSize: webMs(FONT_SIZES.xs),
    fontWeight: "800",
    color: COLORS.primary,
    width: webSc(36),
  },
  matchText: { flex: 1, fontSize: webMs(FONT_SIZES.sm), color: COLORS.text },
  staleBanner: {
    backgroundColor: COLORS.warning + "20",
    borderWidth: 1,
    borderColor: COLORS.warning,
    borderRadius: webSc(RADIUS.sm),
    padding: webSc(SPACING.sm),
    marginBottom: webSc(SPACING.md),
  },
  staleBannerText: { fontSize: webMs(FONT_SIZES.sm), color: COLORS.warning },
  historyBtn: {
    alignItems: "center",
    paddingVertical: webSc(SPACING.sm),
    marginBottom: webSc(SPACING.sm),
  },
  historyBtnText: {
    fontSize: webMs(FONT_SIZES.sm),
    color: COLORS.primary,
    fontWeight: "700",
  },
  simBtn: {
    alignItems: "center",
    paddingVertical: webSc(SPACING.sm),
    marginTop: webSc(SPACING.xs),
    borderRadius: webSc(RADIUS.sm),
    borderWidth: 1,
    borderColor: COLORS.warning,
    backgroundColor: COLORS.warning + "12",
  },
  simBtnText: {
    fontSize: webMs(FONT_SIZES.sm),
    color: COLORS.warning,
    fontWeight: "700",
  },
  bracketActions: { gap: webSc(SPACING.sm) },
  reopenBtn: {
    paddingVertical: webSc(SPACING.md),
    borderRadius: webSc(RADIUS.md),
    borderWidth: 1,
    borderColor: COLORS.warning,
    backgroundColor: COLORS.warning + "20",
    alignItems: "center",
  },
  lockedDim: { opacity: 0.5 },
  settingsLockBanner: {
    backgroundColor: COLORS.warning + "1A",
    borderWidth: 1,
    borderColor: COLORS.warning,
    borderRadius: webSc(RADIUS.lg),
    padding: webSc(SPACING.md),
    marginBottom: webSc(SPACING.md),
  },
  settingsLockTitle: {
    fontSize: webMs(FONT_SIZES.md),
    fontWeight: "800",
    color: COLORS.warning,
    marginBottom: webSc(SPACING.xs),
  },
  settingsLockBody: {
    fontSize: webMs(FONT_SIZES.sm),
    color: COLORS.textSecondary,
    lineHeight: webMs(FONT_SIZES.sm) + 6,
  },
  settingsLockBtn: {
    marginTop: webSc(SPACING.md),
    paddingVertical: webSc(SPACING.sm),
    borderRadius: webSc(RADIUS.md),
    backgroundColor: COLORS.warning,
    alignItems: "center",
  },
  settingsLockBtnText: {
    color: "#000",
    fontWeight: "800",
    fontSize: webMs(FONT_SIZES.sm),
  },
  reopenBtnText: {
    color: COLORS.warning,
    fontSize: webMs(FONT_SIZES.md),
    fontWeight: "700",
  },
  redrawTitle: {
    fontSize: webMs(FONT_SIZES.lg),
    fontWeight: "700",
    color: COLORS.warning,
    marginBottom: webSc(SPACING.sm),
  },
  drawLogRow: {
    paddingVertical: webSc(SPACING.sm),
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  drawLogTitle: {
    fontSize: webMs(FONT_SIZES.sm),
    fontWeight: "700",
    color: COLORS.text,
  },
  drawLogSub: {
    fontSize: webMs(FONT_SIZES.xs),
    color: COLORS.textSecondary,
    marginTop: webSc(2),
  },
  drawLogReason: {
    fontSize: webMs(FONT_SIZES.xs),
    color: COLORS.text,
    marginTop: webSc(2),
    fontStyle: "italic",
  },
  summaryPills: {
    flexDirection: "row",
    gap: webSc(SPACING.xs),
    flexWrap: "wrap",
    flex: 1,
  },
  summaryPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: webSc(SPACING.xs),
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: webSc(RADIUS.full),
    paddingHorizontal: webSc(SPACING.sm),
    paddingVertical: webSc(4),
  },
  summaryPillText: {
    fontSize: webMs(FONT_SIZES.xs),
    color: COLORS.text,
    fontWeight: "700",
  },

  // Search input (modal + players filter)
  searchInputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.background,
    borderRadius: webSc(RADIUS.sm),
    paddingHorizontal: webSc(SPACING.sm),
    borderWidth: 1,
    borderColor: COLORS.border,
    height: webSc(40),
    // Web keeps this in a single controls row (no bottom margin → aligns with the filter/Add
    // button); native stacks it above the filter row, where the bottom margin is the spacer.
    marginBottom: Platform.OS === "web" ? 0 : webSc(SPACING.sm),
  },
  searchIcon: {
    fontSize: webMs(14),
    marginRight: webSc(SPACING.sm),
    opacity: 0.6,
  },
  searchInput: {
    flex: 1,
    fontSize: webMs(FONT_SIZES.sm),
    color: COLORS.text,
    height: webSc(40),
    // Web: suppress the inner <input>'s native focus ring. The wrapper (searchInputWrapper)
    // is the visible field; without this the ring renders as a smaller box inset by the
    // wrapper's padding, so the focus area looks short and not full-width.
    ...(Platform.OS === "web" ? ({ outlineStyle: "none", outlineWidth: 0 } as object) : null),
  },
  // ── Players controls row + two-column (web) + Tournament Summary panel ──
  // Web: chips (content width) · search (flex) · filter · Add Player, all one row.
  summaryPillsWeb: { flex: -1 as any }, // override summaryPills' flex:1 → content width
  controlsRowWeb: {
    flexDirection: "row",
    alignItems: "center",
    gap: webSc(SPACING.sm),
    flexWrap: "wrap",
    marginBottom: webSc(SPACING.md),
  },
  controlsSearchWeb: { flex: 1, minWidth: 200 },
  controlsSearchDesktop: { width: 320 },
  controlsFilterWeb: { width: 170 },
  controlsFilterRowMobile: { flexDirection: "row", alignItems: "center", gap: webSc(SPACING.sm) },
  controlsFilterFlex: { flex: 1 },
  playersPageWeb: {
    width: "100%" as any,
    maxWidth: WEB_MAXW,
    alignSelf: "center" as any,
    paddingHorizontal: webSc(SPACING.md),
    paddingTop: webSc(SPACING.sm),
    paddingBottom: webSc(SPACING.xl) * 2,
  },
  // Sticky-summary layout: controls sit in a fixed bar; only the two-column area scrolls.
  playersPaneWeb: { flex: 1 },
  playersControlsBarWeb: {
    width: "100%" as any,
    maxWidth: WEB_MAXW,
    alignSelf: "center" as any,
    paddingHorizontal: webSc(SPACING.md),
    // A bit more breathing room above/below the search/filter/Add row so it isn't cramped
    // against the tabs above or the roster below. (controlsRowWeb adds its own marginBottom.)
    paddingTop: webSc(SPACING.md),
    paddingBottom: webSc(SPACING.xs),
  },
  playersTwoCol: { flexDirection: "row", alignItems: "flex-start", gap: webSc(SPACING.lg) },
  // Continue-to-Tables inside the sticky summary column: full column width, spaced below the
  // summary card. Reuses lockBtn's gold styling.
  summaryContinueBtn: { marginTop: webSc(SPACING.md), marginBottom: 0 },
  playersRosterCol: { flex: 1, minWidth: 0 as any },
  // Card view: 2-column grid (each cell ~half, small gutter). List view uses no grid.
  rosterGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" },
  rosterCardCell: { width: "49%" as any },
  // ── Card View player card: vertical, sectioned hierarchy (web/desktop only) ──
  epCard: {
    backgroundColor: COLORS.surface,
    borderRadius: webSc(RADIUS.md),
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: webSc(SPACING.md),
    marginBottom: webSc(SPACING.md),
    gap: webSc(SPACING.sm),
  },
  epHeader: { flexDirection: "row", alignItems: "center", gap: webSc(SPACING.sm) },
  epAvatar: {
    width: webSc(38),
    height: webSc(38),
    borderRadius: webSc(19),
    backgroundColor: COLORS.primary + "22",
    alignItems: "center",
    justifyContent: "center",
  },
  epAvatarText: { fontSize: webMs(FONT_SIZES.md), fontWeight: "800", color: COLORS.primary },
  epHeaderText: { flex: 1, minWidth: 0 as any },
  epName: { fontSize: webMs(FONT_SIZES.md), fontWeight: "800", color: COLORS.text },
  epId: { fontSize: webMs(FONT_SIZES.xs), color: COLORS.textMuted, marginTop: webSc(2) },
  epGroupTag: {
    backgroundColor: COLORS.primary + "1A",
    borderRadius: webSc(RADIUS.sm),
    paddingHorizontal: webSc(SPACING.sm),
    paddingVertical: webSc(2),
    alignSelf: "flex-start",
  },
  epGroupLabel: { fontSize: webMs(FONT_SIZES.sm), fontWeight: "800", color: COLORS.primary },
  epStatusRow: { flexDirection: "row", alignItems: "center", gap: webSc(SPACING.xs) },
  epStatusText: { fontSize: webMs(FONT_SIZES.sm), fontWeight: "700" },
  epDivider: { height: 1, backgroundColor: COLORS.border },
  epFargoRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  epRowLabel: { fontSize: webMs(FONT_SIZES.sm), color: COLORS.textSecondary, fontWeight: "600" },
  epFargoRight: { flexDirection: "row", alignItems: "center", gap: webSc(SPACING.sm) },
  epFargoNum: { fontSize: webMs(FONT_SIZES.lg), fontWeight: "800", color: COLORS.text },
  epVerified: { fontSize: webMs(FONT_SIZES.xs), fontWeight: "700", color: COLORS.success },
  epUnrated: { fontSize: webMs(FONT_SIZES.xs), color: COLORS.textMuted },
  epVerifyBtn: {
    paddingHorizontal: webSc(SPACING.sm),
    paddingVertical: webSc(4),
    borderRadius: webSc(RADIUS.sm),
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  epVerifyBtnText: { fontSize: webMs(FONT_SIZES.xs), fontWeight: "700", color: COLORS.primary },
  epPayRow: { flexDirection: "row", alignItems: "center", gap: webSc(SPACING.sm) },
  epCheck: {
    width: webSc(20),
    height: webSc(20),
    borderRadius: webSc(RADIUS.sm),
    borderWidth: 1.5,
    borderColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
  },
  epCheckOn: { backgroundColor: COLORS.success, borderColor: COLORS.success },
  epCheckMark: { fontSize: webMs(FONT_SIZES.xs), fontWeight: "900", color: COLORS.white },
  epPayLabel: { flex: 1, fontSize: webMs(FONT_SIZES.sm), color: COLORS.text },
  epPayStatus: { fontSize: webMs(FONT_SIZES.sm), fontWeight: "700", color: COLORS.textMuted },
  epPayStatusOn: { color: COLORS.success },
  epFooter: { flexDirection: "row", alignItems: "center", gap: webSc(SPACING.sm) },
  epActionsBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: webSc(SPACING.sm),
    borderRadius: webSc(RADIUS.sm),
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  epActionsText: { fontSize: webMs(FONT_SIZES.sm), fontWeight: "700", color: COLORS.text },
  epStateBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: webSc(SPACING.sm),
    borderRadius: webSc(RADIUS.sm),
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  epStateReady: { borderColor: COLORS.success, backgroundColor: COLORS.success + "1A" },
  epStateReadyText: { fontSize: webMs(FONT_SIZES.sm), fontWeight: "800", color: COLORS.success },
  epStateReadyFill: { borderColor: COLORS.success, backgroundColor: COLORS.success },
  epStateReadyFillText: { fontSize: webMs(FONT_SIZES.sm), fontWeight: "800", color: COLORS.white },
  epStateDisabled: { opacity: 0.5 },
  epStateMutedText: { fontSize: webMs(FONT_SIZES.sm), fontWeight: "700", color: COLORS.textMuted },
  // Cards / List segmented toggle in the controls row.
  viewToggle: { flexDirection: "row", borderWidth: 1, borderColor: COLORS.border, borderRadius: webSc(RADIUS.sm), overflow: "hidden" },
  viewToggleBtn: { paddingHorizontal: webSc(SPACING.md), paddingVertical: webSc(6) },
  viewToggleBtnOn: { backgroundColor: COLORS.primary },
  viewToggleText: { color: COLORS.textSecondary, fontSize: webMs(FONT_SIZES.xs), fontWeight: "700" },
  viewToggleTextOn: { color: COLORS.white },
  // ── True compact List/table view (wide web) ──
  listTable: { borderWidth: 1, borderColor: COLORS.border, borderRadius: webSc(RADIUS.md), overflow: "hidden", marginVertical: webSc(SPACING.sm) },
  listHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: webSc(SPACING.sm),
    paddingHorizontal: webSc(SPACING.sm),
    paddingVertical: webSc(SPACING.xs),
    backgroundColor: COLORS.background,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  listHeadText: { fontSize: webMs(FONT_SIZES.xs), color: COLORS.textMuted, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.5 },
  listRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: webSc(SPACING.sm),
    paddingHorizontal: webSc(SPACING.sm),
    paddingVertical: webSc(SPACING.sm),
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  lcPlayer: { flex: 3, minWidth: 0 as any },
  lcFargo: { flex: 1.6 as any },
  lcEntry: { flex: 1.3 as any },
  lcPots: { flex: 2.6 as any, flexDirection: "row", flexWrap: "wrap", gap: webSc(4) },
  lcStatus: { flex: 1.6 as any },
  lcActions: { flex: 1.4 as any, alignItems: "flex-end" },
  listName: { fontSize: webMs(FONT_SIZES.sm), fontWeight: "700", color: COLORS.text },
  listSub: { fontSize: webMs(FONT_SIZES.xs), color: COLORS.textMuted },
  listGroupLabel: { fontSize: webMs(FONT_SIZES.sm), color: COLORS.primary, fontWeight: "700", marginTop: webSc(1) },
  listFargoNum: { fontSize: webMs(FONT_SIZES.md), fontWeight: "800", color: COLORS.primary },
  listVerified: { fontSize: webMs(FONT_SIZES.xs), color: COLORS.success, fontWeight: "700" },
  listUnverified: { fontSize: webMs(FONT_SIZES.xs), color: COLORS.warning, fontWeight: "700" },
  listChip: { borderWidth: 1, borderColor: COLORS.border, borderRadius: webSc(RADIUS.full), paddingHorizontal: webSc(SPACING.sm), paddingVertical: webSc(3), alignSelf: "flex-start" },
  listChipOn: { borderColor: COLORS.success, backgroundColor: COLORS.success + "1A" },
  listChipText: { fontSize: webMs(FONT_SIZES.xs), color: COLORS.textSecondary, fontWeight: "700" },
  listChipTextOn: { color: COLORS.success },
  listPotChip: { borderWidth: 1, borderColor: COLORS.border, borderRadius: webSc(RADIUS.full), paddingHorizontal: webSc(SPACING.sm), paddingVertical: webSc(2) },
  listPotText: { fontSize: webMs(FONT_SIZES.xs), color: COLORS.textSecondary, fontWeight: "600" },
  listActionsBtn: { borderWidth: 1, borderColor: COLORS.border, borderRadius: webSc(RADIUS.sm), paddingHorizontal: webSc(SPACING.sm), paddingVertical: webSc(4), backgroundColor: COLORS.surface },
  listEditWrap: { padding: webSc(SPACING.sm), borderBottomWidth: 1, borderBottomColor: COLORS.border, backgroundColor: COLORS.background },
  listDoneBtn: { alignSelf: "flex-end", marginTop: webSc(SPACING.xs), paddingHorizontal: webSc(SPACING.md), paddingVertical: webSc(6), borderWidth: 1, borderColor: COLORS.primary, borderRadius: webSc(RADIUS.sm) },
  listDoneText: { color: COLORS.primary, fontSize: webMs(FONT_SIZES.sm), fontWeight: "700" },
  // Sticky right column (same pattern as the Settings builder preview).
  playersSummaryCol: {
    width: 320,
    position: "sticky" as any,
    // Match the scroll content's paddingTop so the column is ALREADY at its sticky position
    // on first render — it locks from the first scrolled pixel with no downward drift.
    top: webSc(SPACING.sm),
    alignSelf: "flex-start" as any,
  },
  summaryStackedMobile: { marginTop: webSc(SPACING.md) },
  summaryCard: {
    backgroundColor: COLORS.surface,
    borderRadius: webSc(RADIUS.lg),
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: webSc(SPACING.md),
    gap: webSc(SPACING.xs),
  },
  summaryTitle: { fontSize: webMs(FONT_SIZES.md), fontWeight: "800", color: COLORS.text },
  sumDivider: { height: 1, backgroundColor: COLORS.border, marginVertical: webSc(SPACING.xs) },
  sumRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: webSc(SPACING.sm),
    paddingVertical: webSc(3),
  },
  tsLabel: { fontSize: webMs(FONT_SIZES.sm), color: COLORS.textSecondary },
  tsValue: { fontSize: webMs(FONT_SIZES.sm), color: COLORS.text, fontWeight: "700", flexShrink: 1, textAlign: "right" },
  sumValueSub: { fontSize: webMs(FONT_SIZES.xs), color: COLORS.textSecondary, textAlign: "right" },
  sumVenueVal: { alignItems: "flex-end", flexShrink: 1 },
  breakdownTitle: { fontSize: webMs(FONT_SIZES.sm), fontWeight: "800", color: COLORS.text, marginBottom: webSc(SPACING.xs) },
  breakdownWrap: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: webSc(SPACING.md) },
  breakdownList: { flex: 1, gap: webSc(4) },
  breakdownRow: { flexDirection: "row", alignItems: "center", gap: webSc(SPACING.sm) },
  breakdownDot: { width: webSc(9), height: webSc(9), borderRadius: webSc(5) },
  breakdownLabel: { flex: 1, fontSize: webMs(FONT_SIZES.sm), color: COLORS.textSecondary },
  breakdownCount: { fontSize: webMs(FONT_SIZES.sm), color: COLORS.text, fontWeight: "800" },
  donutRing: {
    width: webSc(72),
    height: webSc(72),
    borderRadius: webSc(36),
    borderWidth: webSc(6),
    borderColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  donutNum: { fontSize: webMs(FONT_SIZES.lg), fontWeight: "900", color: COLORS.text },
  donutLbl: { fontSize: webMs(FONT_SIZES.xs), color: COLORS.textSecondary },
  qaBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: webSc(SPACING.sm),
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: webSc(RADIUS.md),
    paddingVertical: webSc(SPACING.sm),
    marginTop: webSc(SPACING.xs),
  },
  qaBtnText: { fontSize: webMs(FONT_SIZES.sm), color: COLORS.text, fontWeight: "700" },

  // Placeholders
  placeholder: { alignItems: "center", paddingVertical: webSc(SPACING.xl * 2) },
  placeholderGlyph: { fontSize: webMs(40), marginBottom: webSc(SPACING.sm) },
  placeholderTitle: {
    fontSize: webMs(FONT_SIZES.lg),
    fontWeight: "700",
    color: COLORS.text,
    marginBottom: webSc(SPACING.sm),
  },
  placeholderBody: {
    fontSize: webMs(FONT_SIZES.sm),
    color: COLORS.textSecondary,
    textAlign: "center",
    lineHeight: webMs(FONT_SIZES.sm) * 1.5,
    paddingHorizontal: webSc(SPACING.lg),
  },

  // Modal
  flexOne: { flex: 1 },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "center",
    alignItems: "center",
    padding: webSc(SPACING.lg),
  },
  modalContent: {
    backgroundColor: COLORS.surface,
    borderRadius: webSc(RADIUS.md),
    padding: webSc(SPACING.lg),
    width: "100%",
    maxWidth: webSc(400),
  },
  modalTitle: {
    fontSize: webMs(FONT_SIZES.lg),
    fontWeight: "700",
    color: COLORS.text,
    marginBottom: webSc(SPACING.md),
  },
  countdownNum: {
    fontSize: webMs(48),
    fontWeight: "900",
    color: COLORS.primary,
    textAlign: "center",
    fontVariant: ["tabular-nums"],
  },
  modalHint: {
    fontSize: webMs(FONT_SIZES.xs),
    color: COLORS.textSecondary,
    marginTop: webSc(SPACING.xs),
    fontStyle: "italic",
  },
  resultsList: { maxHeight: webSc(240), marginTop: webSc(SPACING.sm) },
  noResults: {
    fontSize: webMs(FONT_SIZES.sm),
    color: COLORS.textSecondary,
    textAlign: "center",
    paddingVertical: webSc(SPACING.md),
  },
  resultRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: webSc(SPACING.sm),
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    gap: webSc(SPACING.sm),
  },
  resultInfo: { flex: 1 },
  resultName: {
    fontSize: webMs(FONT_SIZES.sm),
    fontWeight: "600",
    color: COLORS.text,
  },
  resultMeta: {
    fontSize: webMs(FONT_SIZES.xs),
    color: COLORS.textSecondary,
    marginTop: webSc(2),
  },
  resultAdd: {
    fontSize: webMs(FONT_SIZES.sm),
    color: COLORS.primary,
    fontWeight: "600",
  },
  resultRowAdded: { opacity: 0.55 },
  resultAdded: {
    fontSize: webMs(FONT_SIZES.sm),
    color: COLORS.success,
    fontWeight: "700",
  },
  modalButtons: {
    flexDirection: "row",
    marginTop: webSc(SPACING.lg),
    gap: webSc(SPACING.sm),
  },
  modalButtonCancel: {
    flex: 1,
    paddingVertical: webSc(SPACING.sm),
    borderRadius: webSc(RADIUS.sm),
    alignItems: "center",
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  modalButtonCancelText: {
    color: COLORS.text,
    fontSize: webMs(FONT_SIZES.sm),
    fontWeight: "600",
  },
  modalButtonConfirm: {
    flex: 1,
    paddingVertical: webSc(SPACING.sm),
    borderRadius: webSc(RADIUS.sm),
    alignItems: "center",
    backgroundColor: COLORS.primary,
  },
  modalButtonConfirmText: {
    color: COLORS.white,
    fontSize: webMs(FONT_SIZES.sm),
    fontWeight: "600",
  },
  modalButtonGuest: {
    flex: 1,
    paddingVertical: webSc(SPACING.sm),
    borderRadius: webSc(RADIUS.sm),
    alignItems: "center",
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  modalButtonGuestText: {
    color: COLORS.primary,
    fontSize: webMs(FONT_SIZES.sm),
    fontWeight: "600",
  },
});
