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

import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  InputAccessoryView,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
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
import { COLORS } from "../../../../src/theme/colors";
import { RADIUS, SPACING } from "../../../../src/theme/spacing";
import { FONT_SIZES } from "../../../../src/theme/typography";
import { webMs, webSc } from "../../../../src/utils/scaling";
import {
  EQUIPMENT_OPTIONS,
  GAME_TYPES,
  RECURRENCE_TYPES,
  START_TIMES,
  TOURNAMENT_FORMATS,
} from "../../../../src/utils/tournament-form-data";
import { GAME_TYPE_MAP } from "../../../../src/utils/game-type.utils";
import {
  GameType,
  RegistrationStatus,
  TableSize,
  TableStatus,
  TournamentFormat,
} from "../../../../src/models/types/common.types";
import { Profile } from "../../../../src/models/types/profile.types";
import { Registration } from "../../../../src/models/types/registration.types";
import { Tournament } from "../../../../src/models/types/tournament.types";
import {
  AutoAssignMode,
  BracketMatch,
  DrawLogEntry,
  FeeCategory,
  GeneratedBracket,
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
  reconcileSidePots,
  sidePotTotal,
} from "../../../../src/utils/prize-pool";
import {
  DrawPlayer,
  RaceConfig,
  STANDARD_SIZES,
  averageRace,
  computeBracketStats,
  minutesPerGameForType,
  recommendedBracketSize,
  round1FromSeeds,
  seedPlayers,
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
import { TournamentActionsModal } from "../../../../src/views/components/tournament/live/TournamentActionsModal";
import { buildLiveMatches, LiveMatch } from "../../../../src/utils/match.utils";
import { usePlayerSearch } from "../../../../src/viewmodels/hooks/use.player.search";
import { smsNotificationService } from "../../../../src/models/services/sms-notification.service";
import {
  useVenuesByDirector,
  useVenuesByOwner,
} from "../../../../src/viewmodels/hooks/use.venues";
import { venueTableService } from "../../../../src/models/services/venue-table.service";
import { TournamentSettingsPreview } from "../../../../src/views/components/tournament/TournamentSettingsPreview";
import {
  ManagePhase,
  useManageTournament,
} from "../../../../src/viewmodels/hooks/use.manage.tournament";

const isWeb = Platform.OS === "web";
// iOS numeric keypads have no return key — attach this accessory's Done bar so
// the keyboard can be dismissed.
const KB_DONE = "kbDoneAccessory";

// Unicode-escaped glyphs (raw emoji in the source corrupt under our toolchain).
const GLYPH = { back: "\u2190", search: "\uD83D\uDD0D", lock: "\uD83D\uDD12", bolt: "\u26A1", check: "\u2713" };

// ── Tabs ─────────────────────────────────────────────────────────────────────
type TabKey =
  | "settings"
  | "players"
  | "tables"
  | "prizepool"
  | "bracket"
  | "review"
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
const SETUP_ORDER: TabKey[] = [
  "settings",
  "players",
  "tables",
  "bracket",
  "review",
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
type DisplayStatus = "prereg" | "ready" | "no_show" | "removed";

const displayStatusOf = (s: RegistrationStatus): DisplayStatus => {
  if (s === "checked_in") return "ready";
  if (s === "no_show") return "no_show";
  if (s === "cancelled") return "removed";
  return "prereg"; // preregistered / queued / approved
};

const DISPLAY_META: Record<DisplayStatus, { label: string; color: string }> = {
  prereg: { label: "Pre-Registered", color: "#EAB308" }, // yellow
  ready: { label: "Ready", color: COLORS.success }, // green
  no_show: { label: "No Show", color: COLORS.error }, // red
  removed: { label: "Removed", color: COLORS.textMuted }, // gray
};

// Display order for the player list: confirmed first, then those needing
// action, then no-shows, then removed.
const STATUS_RANK: Record<DisplayStatus, number> = {
  ready: 0,
  prereg: 1,
  no_show: 2,
  removed: 3,
};

const PLAYER_FILTERS = [
  { label: "All", value: "all" },
  { label: "Pre-Registered", value: "prereg" },
  { label: "Ready", value: "ready" },
  { label: "No Show", value: "no_show" },
  { label: "Removed", value: "removed" },
];

const getDisplayName = (r: Registration): string => {
  if (r.player_id && r.profiles) return r.profiles.name || r.profiles.user_name;
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
  venueId: number | null;
  recurrenceType: string;
  raceMode: RaceMode;
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
  { label: "9 Foot (Pro)", value: "9ft" },
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
    entryFee: numStr(t.entry_fee),
    addedMoney: numStr(t.added_money),
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
      amount: numStr(p.amount as number),
    })),
    raceMode: ls.raceMode ?? "fixed",
    raceGroups: (ls.raceGroups ?? []).map((g) => ({
      id: g.id,
      label: g.label,
      minFargo: numStr(g.minFargo),
      maxFargo: numStr(g.maxFargo),
      raceTo: numStr(g.raceTo),
    })),
    fees: feesToForm(ls.fees ?? []),
    feesOnTop: !!ls.feesAddedOnTop,
  };
};

// Build the unified fee list: the 3 built-in types are ALWAYS present (seeded
// from saved state if it exists), followed by any custom fee types. A saved fee
// with no `enabled` flag predates this field and was therefore applied → treat
// it as enabled.
const feesToForm = (saved: TournamentFee[]): FeeForm[] => {
  const builtIns: FeeForm[] = FEE_PRESETS.map((p) => {
    const s = saved.find((f) => f.category === p.category);
    return {
      id: s?.id ?? `fee-${p.category}`,
      category: p.category,
      name: p.label,
      amount: numStr(s?.amount),
      enabled: s ? (s.enabled ?? true) : false,
    };
  });
  const customs: FeeForm[] = saved
    .filter((f) => f.category === "custom")
    .map((f) => ({
      id: f.id,
      category: "custom" as FeeCategory,
      name: f.name ?? "",
      amount: numStr(f.amount),
      enabled: f.enabled ?? true,
    }));
  return [...builtIns, ...customs];
};

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
  venue_id: f.venueId ?? undefined,
  recurrence_type: f.isRecurring ? f.recurrenceType.trim() || undefined : undefined,
  // Any save commits the tournament — it's no longer an unsaved draft.
  is_draft: false,
  side_pots: f.sidePots
    .filter((p) => p.name.trim())
    .map((p) => ({ name: p.name.trim(), amount: numOrNull(p.amount) ?? 0 })),
  live_settings: {
    raceMode: f.raceMode,
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
    // Persist every custom fee type (so it survives even when unchecked) and any
    // enabled built-in. Unchecked, empty built-ins are dropped and re-seeded.
    fees: f.fees
      .filter((fee) => fee.category === "custom" || fee.enabled)
      .map((fee) => ({
        id: fee.id,
        category: fee.category,
        name: fee.name.trim() || feePresetLabel(fee.category),
        amount: numOrNull(fee.amount) ?? 0,
        enabled: fee.enabled,
      })),
    feesAddedOnTop: f.feesOnTop,
  },
  };
};

// Fields that belong to THIS event (not a reusable template) — excluded when
// saving / applying a settings template so the TD keeps their own name + schedule.
const TEMPLATE_EXCLUDED_KEYS: (keyof SettingsForm)[] = [
  "name",
  "tournamentDate",
  "startTime",
  "description",
  "phoneNumber",
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
}) => {
  // Show the green ✓ only after the user has filled the field and moved on, so
  // seeded/empty fields don't flash a phantom check.
  const [touched, setTouched] = useState(false);
  const showCheck = !disabled && touched && !!value.trim();
  return (
    <View style={styles.field}>
      <Text
        allowFontScaling={false}
        style={[styles.fieldLabel, disabled && styles.labelDisabled]}
      >
        {label}
      </Text>
      <View
        style={[
          styles.inputWrap,
          multiline && styles.inputWrapMultiline,
          narrow && styles.inputWrapNarrow,
          disabled && styles.inputDisabled,
        ]}
      >
        {showCheck && (
          <Text allowFontScaling={false} style={styles.inputCheck}>
            {"✓"}
          </Text>
        )}
        <TextInput
          allowFontScaling={false}
          editable={!disabled}
          style={[styles.inputInner, multiline && styles.inputMultiline]}
          value={value}
          onChangeText={onChangeText}
          onBlur={() => setTouched(true)}
          placeholder={placeholder}
          placeholderTextColor={COLORS.textMuted}
          keyboardType={keyboardType ?? "default"}
          multiline={multiline}
          maxLength={maxLength}
          inputAccessoryViewID={Platform.OS === "ios" ? accessoryId : undefined}
        />
      </View>
      {hint ? (
        <Text allowFontScaling={false} style={styles.hint}>
          {hint}
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
  ) => void;
  onSaveEdit: (
    fargo: number,
    isStarter: boolean,
    paidEntry: boolean,
    paidPots: string[],
    raceOverride: number | null,
  ) => void;
  onTogglePaidPot: (name: string, paid: boolean) => void;
  onNoShow: () => void;
  onRemove: () => void;
  onUndo: () => void;
  onRestore: () => void;
  isProcessing: boolean;
  locked?: boolean;
}) => {
  const d = displayStatusOf(registration.status);
  const meta = DISPLAY_META[d];
  const isGuest = !registration.player_id;
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

  const [editing, setEditing] = useState(false);
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

  const reseed = () => {
    setPaidEntry(!!registration.paid_entry);
    setPaidPots(livePaidPots());
    setFargoInput(
      registration.fargo_rating != null ? String(registration.fargo_rating) : "",
    );
    setOverrideOn(registration.race_override != null);
    setOverrideRace(registration.race_override ?? 5);
  };

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
  const canBeReady = assignReady && paidEntry;

  // "Group A · Race to 5" line derived from a Fargo rating (groups mode).
  const groupLineFor = (fargo: number | null): string => {
    const g = groupForFargo(fargo, raceGroups);
    return g
      ? `Group ${g.label || "?"} · Race to ${g.raceTo}`
      : "No matching race group";
  };
  const fargoText =
    registration.fargo_rating != null
      ? `Fargo ${registration.fargo_rating}`
      : "No Fargo set";
  // Race line shown on read-only / locked cards. A manual override wins.
  const raceLine = (): string | null => {
    if (registration.race_override != null)
      return `Race to ${registration.race_override} (manual)`;
    if (isGroups) return groupLineFor(registration.fargo_rating ?? null);
    return null;
  };

  const renderEditableBody = (onCommit: () => void, commitLabel: string, onCancel?: () => void) => (
    <>
      <View style={styles.assignPayRow}>
        <View style={styles.payCol}>
          <PayCheckbox
            label={entryLabel}
            checked={paidEntry}
            onToggle={() => setPaidEntry((v) => !v)}
          />
          {sidePots.map((p, i) => (
            <PayCheckbox
              key={`${p.name}-${i}`}
              label={potLabel(p)}
              checked={paidPots.includes(p.name)}
              onToggle={() => togglePot(p.name)}
            />
          ))}
        </View>
        <View style={styles.fargoRight}>
          <FieldLabel label="Fargo" />
          <TextInput
            allowFontScaling={false}
            style={[styles.input, styles.inputNarrow]}
            value={fargoInput}
            onChangeText={(v) => setFargoInput(v.replace(/[^0-9]/g, ""))}
            placeholder="e.g., 525"
            placeholderTextColor={COLORS.textMuted}
            keyboardType="numeric"
            maxLength={3}
          />
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
          {!paidEntry
            ? "Mark the entry fee paid to make this player ready."
            : !fargoValid
              ? "Enter a Fargo rating to mark this player ready."
              : 'Fargo is outside all race groups — turn on "Set race manually" to continue.'}
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
          <>
            <TouchableOpacity
              style={[styles.regActionBtn, styles.noShowBtn]}
              onPress={onNoShow}
              disabled={isProcessing}
            >
              <Text allowFontScaling={false} style={styles.noShowBtnText}>No Show</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.regActionBtn, styles.removeBtn]}
              onPress={onRemove}
              disabled={isProcessing}
            >
              <Text allowFontScaling={false} style={styles.removeBtnText}>Remove</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </>
  );

  return (
    <View style={styles.regCard}>
      <View style={styles.regHeader}>
        <View style={styles.nameRow}>
          <Text allowFontScaling={false} style={styles.playerName} numberOfLines={1}>
            {getDisplayName(registration)}
          </Text>
          {isGuest ? (
            <View style={styles.guestTag}>
              <Text allowFontScaling={false} style={styles.guestTagText}>Guest</Text>
            </View>
          ) : (
            registration.profiles && (
              <Text allowFontScaling={false} style={styles.playerId}>
                Player ID #{registration.profiles.id_auto}
              </Text>
            )
          )}
        </View>
      </View>

      <View style={styles.statusLine}>
        <View style={[styles.statusDotSm, { backgroundColor: meta.color }]} />
        <Text
          allowFontScaling={false}
          style={[styles.statusLineText, { color: meta.color }]}
        >
          {meta.label}
        </Text>
      </View>

      {locked && (
        <>
          <Text allowFontScaling={false} style={styles.assignText}>
            {fargoText}
            {raceLine() ? ` · ${raceLine()}` : ""}
          </Text>
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

      {!locked && d === "prereg" &&
        renderEditableBody(
          () => onReady(fargoNum, false, paidEntry, paidPots, committedOverride),
          "Ready",
        )}

      {!locked && d === "ready" && editing &&
        renderEditableBody(
          () => {
            onSaveEdit(fargoNum, false, paidEntry, paidPots, committedOverride);
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
          <View style={styles.assignPayRow}>
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
              {/* All current side pots, tappable: a newly added pot shows up
                  here instantly so the TD can add a player with one tap, no
                  edit cycle. */}
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
                        : () => onTogglePaidPot(pot.name, !paid)
                    }
                  />
                );
              })}
            </View>
            <View style={styles.fargoRight}>
              <Text allowFontScaling={false} style={styles.fargoReadLabel}>
                Fargo
              </Text>
              <Text allowFontScaling={false} style={styles.fargoReadNumber}>
                {registration.fargo_rating ?? "—"}
              </Text>
              {raceLine() && (
                <Text allowFontScaling={false} style={styles.assignText}>
                  {raceLine()}
                </Text>
              )}
            </View>
          </View>
          <View style={styles.regActions}>
            <TouchableOpacity
              style={[styles.regActionBtn, styles.checkInBtn]}
              onPress={() => {
                reseed();
                setEditing(true);
              }}
              disabled={isProcessing}
            >
              <Text allowFontScaling={false} style={styles.checkInBtnText}>Edit</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.regActionBtn, styles.undoBtn]}
              onPress={onUndo}
              disabled={isProcessing}
            >
              <Text allowFontScaling={false} style={styles.undoBtnText}>
                {isProcessing ? "..." : "Undo"}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.regActionBtn, styles.removeBtn]}
              onPress={onRemove}
              disabled={isProcessing}
            >
              <Text allowFontScaling={false} style={styles.removeBtnText}>Remove</Text>
            </TouchableOpacity>
          </View>
        </>
      )}

      {!locked && (d === "no_show" || d === "removed") && (
        <>
          <Text allowFontScaling={false} style={styles.assignText}>
            {fargoText}
            {raceLine() ? ` · ${raceLine()}` : ""}
          </Text>
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

  const hub = useManageTournament(tournamentId);
  const [activeTab, setActiveTab] = useState<TabKey>("settings");
  // External "Submit Tournament" cancellable countdown (null = not submitting).
  const [submitCountdown, setSubmitCountdown] = useState<number | null>(null);
  // Wide web → two-column event-builder layout (form + sticky live preview).
  const { width: winW } = useWindowDimensions();
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
    const prevNames = prevForm.sidePots
      .map((p) => p.name.trim())
      .filter(Boolean);
    const curNames = form.sidePots.map((p) => p.name.trim()).filter(Boolean);
    const removed = prevNames.filter((n) => !curNames.includes(n));
    const added = curNames.filter((n) => !prevNames.includes(n));
    if (removed.length === 0) return; // nothing stale to clean up
    const renameMap: Record<string, string> =
      removed.length === 1 && added.length === 1
        ? { [removed[0]]: added[0] }
        : {};
    const reconcile = (pots: string[]): string[] => {
      const out: string[] = [];
      for (const n of pots) {
        if (curNames.includes(n)) out.push(n);
        else if (n in renameMap) out.push(renameMap[n]);
        // otherwise: pot was removed — drop it
      }
      return out;
    };
    const tasks = hub.registrations
      .map((reg) => {
        const current = safePaidSidePots(reg.paid_side_pots);
        const next = reconcile(current);
        const changed =
          next.length !== current.length ||
          next.some((n, i) => n !== current[i]);
        return changed
          ? hub.updateRegistration({
              id: reg.id,
              updates: { paid_side_pots: next },
            })
          : null;
      })
      .filter(Boolean) as Promise<unknown>[];
    if (tasks.length > 0) await Promise.all(tasks);
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

  // Players tab state
  const [addModalVisible, setAddModalVisible] = useState(false);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  // Guided-setup prompt shown when the TD jumps ahead of an incomplete step.
  const [gatePrompt, setGatePrompt] = useState<{
    blocking: TabKey;
    target: TabKey;
  } | null>(null);

  // Per-step completion — drives the sequential gating + the Review checklist.
  const stepComplete = useMemo(() => {
    const t = hub.tournament;
    const ls = t?.live_settings ?? {};
    const raceMode = ls.raceMode ?? "fixed";
    const raceOk =
      raceMode === "groups"
        ? (ls.raceGroups?.length ?? 0) >= 1
        : raceMode === "differential"
          ? ls.fargoDiffMinRace != null && ls.fargoDiffPerGame != null
          : ls.fixedRaceWinners != null;
    const settings =
      !!(
        t &&
        t.name &&
        t.game_type &&
        t.tournament_format &&
        t.venue_id &&
        t.tournament_date &&
        t.start_time
      ) && raceOk;
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
  // Live Ready count while open; the drawn field once locked (so a closed
  // field's pool stops moving).
  const prizePlayers = prizeLocked
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

  // Side pots come from the tournament; entrant counts from paid_side_pots.
  const prizeSidePots = useMemo(() => {
    const pots = hub.tournament?.side_pots ?? [];
    const active = hub.registrations.filter(
      (r) => r.status !== "cancelled" && r.status !== "no_show",
    );
    return pots
      .filter((p) => (p.name ?? "").trim())
      .map((p) => ({
        name: p.name.trim(),
        amount: Number(p.amount) || 0,
        players: active.filter((r) =>
          safePaidSidePots(r.paid_side_pots).includes(p.name.trim()),
        ).length,
      }));
  }, [hub.tournament, hub.registrations]);
  const sidePotNames = useMemo(
    () => prizeSidePots.map((s) => s.name),
    [prizeSidePots],
  );

  // Working copy of the payout config, seeded from live_settings (or a fresh
  // default) and reconciled to the CURRENT side pots.
  const [prizeForm, setPrizeForm] = useState<PrizePoolConfig | null>(null);
  const prizeSeededRef = useRef(false);
  const prizeSavedRef = useRef<string | null>(null);
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
  // Which players (by standings key r<registrationId>) entered each side pot, so a
  // side pot only pays its entrants — a non-entrant who finishes higher is skipped
  // and the money falls to the next-best entrant.
  const sidePotEntrants = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const r of hub.registrations) {
      for (const name of safePaidSidePots(r.paid_side_pots)) {
        (map[name] ??= []).push(`r${r.id}`);
      }
    }
    return map;
  }, [hub.registrations]);
  const prizeComplete =
    prizeFeesOk &&
    isPrizePoolComplete(prizeForm, prizeEntryPool, prizeSidePotPools);

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
  const goToTab = (target: TabKey) => {
    if (!SETUP_ORDER.includes(target)) {
      setActiveTab(target);
      return;
    }
    const idx = SETUP_ORDER.indexOf(target);
    for (let i = 0; i < idx; i++) {
      const step = SETUP_ORDER[i];
      if (!(stepComplete as Record<string, boolean>)[step]) {
        setGatePrompt({ blocking: step, target });
        return;
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
          text: "Discard",
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

  const handleTabPress = (target: TabKey) => {
    if (activeTab === "settings" && target !== "settings" && settingsDirty) {
      confirmLeaveSettings(() => goToTab(target));
      return;
    }
    if (activeTab === "prizepool" && target !== "prizepool" && prizeDirty) {
      confirmLeavePrize(() => goToTab(target));
      return;
    }
    goToTab(target);
  };

  const handleBack = () => {
    if (activeTab === "settings" && settingsDirty) {
      confirmLeaveSettings(() => router.back());
    } else if (activeTab === "prizepool" && prizeDirty) {
      confirmLeavePrize(() => router.back());
    } else {
      router.back();
    }
  };

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
    Alert.alert("Remove Table", "Remove this table?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: () =>
          hub
            .deleteTable(id)
            .catch(() => Alert.alert("Error", "Failed to remove the table.")),
      },
    ]);

  // ---- Status-flow actions ------------------------------------------------
  const handleStartTournament = () =>
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

  const tournamentName = hub.tournament?.name || paramName || "Tournament";
  const phaseMeta = PHASE_META[hub.phase];

  // ── Lifecycle phase navigation ──────────────────────────────────────────────
  const tournamentGroup = phaseGroupOf(hub.phase);
  const liveUnlocked = (
    ["bracket_drawn", "running", "completed", "archived"] as ManagePhase[]
  ).includes(hub.phase);
  // Results is read-only (standings / payouts / stats / history / summary), so it
  // is viewable as soon as there's a bracket to report on — not gated on finishing.
  const resultsUnlocked = liveUnlocked;
  const phaseUnlocked = (p: PhaseKey) =>
    p === "setup" ||
    (p === "live" && liveUnlocked) ||
    (p === "results" && resultsUnlocked);
  // Progress glyph for each phase pill: ✓ done · ● current · ⏺ live · 🔒 locked.
  const phaseStateOf = (p: PhaseKey): "done" | "current" | "live" | "locked" => {
    const i = PHASE_ORDER.indexOf(p);
    const cur = PHASE_ORDER.indexOf(tournamentGroup);
    if (i < cur) return "done";
    if (i === cur) return p === "live" && hub.phase === "running" ? "live" : "current";
    // An unlocked future phase (e.g. Live once the bracket is drawn) reads as
    // available rather than locked.
    if (phaseUnlocked(p)) return "current";
    return "locked";
  };
  const defaultTabForPhase = (p: PhaseKey): TabKey =>
    p === "live"
      ? "matches"
      : p === "results"
        ? "standings"
        : hub.phase === "bracket_drawn"
          ? "bracket" // land on Draw Bracket (where Start lives) once drawn
          : "settings";

  // Build the lifecycle nav model (phase buttons + their page menus).
  // External (other-software) tournaments get a basic manager — just the details
  // page, no live-engine phases/tabs.
  const isExternal = hub.tournament?.bracket_source === "external";
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
    const def = PHASE_DEFS[pk];
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
        glyph:
          t.lead ??
          (pk === "setup"
            ? (
                t.tab === "prizepool"
                  ? prizeComplete
                  : (stepComplete as Record<string, boolean>)[t.tab]
              )
              ? "✓"
              : "○"
            : undefined),
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
    const proceed = () => {
      setSelectedPhase(p);
      setActiveTab(defaultTabForPhase(p));
    };
    if (activeTab === "settings" && settingsDirty) confirmLeaveSettings(proceed);
    else proceed();
  };

  // Settings lock once the bracket is drawn — editing format/race/entry after a
  // draw would desync the bracket. Editing requires undoing the draw (reopen).
  const settingsLocked = (
    ["bracket_drawn", "running", "completed", "archived"] as ManagePhase[]
  ).includes(hub.phase);

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
  const [tplSaveOpen, setTplSaveOpen] = useState(false);
  const applyTemplate = (settings: Record<string, unknown>) =>
    patchForm(settings as Partial<SettingsForm>);
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
          name: getDisplayName(r),
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

  // ---- Queue Manager handlers --------------------------------------------
  // When a match goes live, text both players that it's their turn — but only
  // those who opted into SMS match alerts (the service checks prefs). Best-effort:
  // never blocks or fails the start. tableIdOverride covers assign+start, where
  // liveMatches hasn't re-rendered with the new table yet.
  const notifyMatchPlayers = (matchId: string, tableIdOverride?: number) => {
    const m = liveMatches.find((x) => x.id === matchId);
    if (!m) return;
    const tableId = tableIdOverride ?? m.tableId ?? undefined;
    const table =
      tableId != null ? hub.tables.find((t) => t.id === tableId) : null;
    const tableLabel = table ? `Table ${table.table_number}` : null;
    const tournamentName = hub.tournament?.name ?? null;
    const regToPlayer = new Map(
      hub.registrations.map((r) => [r.id, r.player_id]),
    );
    const sides = [
      { regId: m.p1RegId, opp: m.p2Name },
      { regId: m.p2RegId, opp: m.p1Name },
    ];
    for (const s of sides) {
      const playerId = s.regId != null ? regToPlayer.get(s.regId) : null;
      if (playerId == null) continue;
      smsNotificationService.notifyMatchReady({
        playerId,
        opponentName: s.opp,
        tableLabel,
        tournamentName,
      });
    }
  };

  // Assigning a table PARKS the match on it (table set, still "scheduled") — the
  // TD then starts it separately. This keeps a table reserved without the clock
  // running until play actually begins.
  const handleQueueAssign = (matchId: string, tableId: number) =>
    hub
      .setMatchState({
        matchId,
        patch: { tableId, status: "scheduled", startedAt: null },
      })
      .catch(() => Alert.alert("Error", "Failed to assign the table."));
  // Assign + start in one step (table set + in_progress + startedAt).
  const handleQueueAssignStart = (matchId: string, tableId: number) =>
    hub
      .setMatchState({
        matchId,
        patch: { tableId, status: "in_progress", startedAt: new Date().toISOString() },
      })
      .then(() => notifyMatchPlayers(matchId, tableId))
      .catch(() => Alert.alert("Error", "Failed to assign and start the match."));
  // Start a match already parked on a table (keeps its table).
  const handleQueueStart = (matchId: string) =>
    hub
      .setMatchState({
        matchId,
        patch: { status: "in_progress", startedAt: new Date().toISOString() },
      })
      .then(() => notifyMatchPlayers(matchId))
      .catch(() => Alert.alert("Error", "Failed to start the match."));
  // Send a match back to the queue: clear its table and revert to scheduled.
  const handleQueueUnassign = (matchId: string) =>
    hub
      .setMatchState({
        matchId,
        patch: { tableId: null, status: "scheduled", startedAt: null },
      })
      .catch(() => Alert.alert("Error", "Failed to update the match."));
  const handleSetAutoMode = (m: AutoAssignMode) =>
    hub.saveQueueSettings({ autoAssignMode: m }).catch(() => {});
  // A manual reorder takes the TD into Manual mode with the new order.
  const handleSetQueueOrder = (ids: string[]) =>
    hub
      .saveQueueSettings({ queueOrder: ids, autoAssignMode: "manual" })
      .catch(() => {});

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
    hub
      .drawBracket({ bracket, logEntry })
      .then(() => {
        pendingRedrawReason.current = null;
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

  // ---- Settings handlers --------------------------------------------------
  const patchForm = (patch: Partial<SettingsForm>) =>
    setForm((f) => (f ? { ...f, ...patch } : f));

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

  const handleStartRegistration = () => {
    Alert.alert(
      "Start Registration",
      "Save settings and open registration? Players will be able to register once this is on.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Start Registration",
          onPress: async () => {
            if (!form) return;
            const prevForm = prevFormSnapshot();
            try {
              await hub.saveSettings(toPatch(form));
              savedSnapshotRef.current = JSON.stringify(form);
              await propagateSidePotChanges(prevForm);
              await hub.startRegistration();
            } catch {
              Alert.alert("Error", "Failed to start registration.");
            }
          },
        },
      ],
    );
  };

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
  // Add a custom fee from the modal: appended unchecked with the optional amount.
  const addCustomFee = (name: string, amount: string) => {
    const id = `fee-custom-${tournamentId}-${Date.now()}`;
    patchForm({
      fees: [
        ...(form?.fees ?? []),
        { id, category: "custom", name: name.trim(), amount, enabled: false },
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
            checked_in_at: new Date().toISOString(),
          },
        }),
      "Failed to mark the player ready.",
    );

  // Edit a Ready player's rating/payment without changing their status.
  const handleSaveEdit = (
    r: Registration,
    fargo: number,
    isStarter: boolean,
    paidEntry: boolean,
    paidPots: string[],
    raceOverride: number | null,
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

  const handleNoShow = (r: Registration) =>
    withProcessing(r.id, () => hub.markNoShow(r.id), "Failed to mark no-show.");

  const handleRemove = (r: Registration) =>
    Alert.alert("Remove Player", `Remove ${getDisplayName(r)} from this tournament?`, [
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
        if (q && !getDisplayName(r).toLowerCase().includes(q)) return false;
        return true;
      })
      .sort((a, b) => {
        const ra = STATUS_RANK[displayStatusOf(a.status)];
        const rb = STATUS_RANK[displayStatusOf(b.status)];
        if (ra !== rb) return ra - rb;
        return getDisplayName(a).localeCompare(getDisplayName(b));
      });
  }, [hub.registrations, playerSearch, statusFilter]);

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
    return (
        <Section title="Race">
          <View style={styles.field}>
            <Dropdown
              placeholder="Select race type"
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

          {form.raceMode === "groups" && (
            <View>
              <Text allowFontScaling={false} style={styles.hint}>
                Players are auto-assigned a race from the group their Fargo falls
                in (manual override per player later).
              </Text>
              {form.raceGroups.map((g, i) => (
                <View key={g.id} style={styles.groupRow}>
                  <TextInput
                    allowFontScaling={false}
                    style={[styles.input, styles.groupLabel]}
                    value={g.label}
                    onChangeText={(v) => updateRaceGroup(i, "label", v)}
                    placeholder="A"
                    placeholderTextColor={COLORS.textMuted}
                  />
                  <TextInput
                    allowFontScaling={false}
                    style={[styles.input, styles.groupNum]}
                    value={g.minFargo}
                    onChangeText={(v) => updateRaceGroup(i, "minFargo", v)}
                    placeholder="Min"
                    placeholderTextColor={COLORS.textMuted}
                    keyboardType="numeric"
                  />
                  <TextInput
                    allowFontScaling={false}
                    style={[styles.input, styles.groupNum]}
                    value={g.maxFargo}
                    onChangeText={(v) => updateRaceGroup(i, "maxFargo", v)}
                    placeholder="Max"
                    placeholderTextColor={COLORS.textMuted}
                    keyboardType="numeric"
                  />
                  <TextInput
                    allowFontScaling={false}
                    style={[styles.input, styles.groupNum]}
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
              {form.raceGroups.length > 0 && (
                <View style={styles.exampleBox}>
                  <Text allowFontScaling={false} style={styles.exampleTitle}>
                    Group Settings
                  </Text>
                  {form.raceGroups.map((g, i) => (
                    <Text
                      key={g.id}
                      allowFontScaling={false}
                      style={styles.exampleText}
                    >
                      Group {g.label || String.fromCharCode(65 + i)}:{" "}
                      {g.minFargo.trim() || "0"}-{g.maxFargo.trim() || "+"} · Race
                      to {g.raceTo.trim() || "?"}
                    </Text>
                  ))}
                  <Text allowFontScaling={false} style={styles.exampleText}>
                    A blank minimum counts as 0; a blank maximum has no upper
                    limit.
                  </Text>
                </View>
              )}
            </View>
          )}
        </Section>
    );
  };

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

          <Section title="Entry">
            <LabeledInput
              label="Entry Fee"
              value={form.entryFee}
              onChangeText={(v) => patchForm({ entryFee: v })}
              placeholder="$0.00"
              keyboardType="decimal-pad"
              accessoryId={KB_DONE}
            />
            <LabeledInput
              label="Added Money"
              value={form.addedMoney}
              onChangeText={(v) => patchForm({ addedMoney: v })}
              placeholder="$0.00"
              keyboardType="decimal-pad"
              accessoryId={KB_DONE}
            />
            <View style={styles.sidePotHeader}>
              <FieldLabel label="Side Pots" />
              <TouchableOpacity style={styles.addRowBtnSm} onPress={addSidePot}>
                <Text allowFontScaling={false} style={styles.addRowBtnText}>
                  + Add
                </Text>
              </TouchableOpacity>
            </View>
            {form.sidePots.map((pot, i) => (
              <View key={i} style={styles.sidePotRow}>
                <TextInput
                  allowFontScaling={false}
                  style={[styles.input, styles.sidePotName]}
                  value={pot.name}
                  onChangeText={(v) => updateSidePot(i, "name", v)}
                  placeholder="Name"
                  placeholderTextColor={COLORS.textMuted}
                />
                <TextInput
                  allowFontScaling={false}
                  style={[styles.input, styles.sidePotAmount]}
                  value={pot.amount}
                  onChangeText={(v) => updateSidePot(i, "amount", v)}
                  placeholder="$"
                  placeholderTextColor={COLORS.textMuted}
                  keyboardType="decimal-pad"
                  inputAccessoryViewID={Platform.OS === "ios" ? KB_DONE : undefined}
                />
                <TouchableOpacity
                  style={styles.groupRemove}
                  onPress={() => removeSidePot(i)}
                >
                  <Text allowFontScaling={false} style={styles.groupRemoveText}>
                    {"✕"}
                  </Text>
                </TouchableOpacity>
              </View>
            ))}
          </Section>

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
              The bracket has been drawn, so settings are locked to keep it in
              sync. To make changes, undo the draw — this reopens registration and
              you&apos;ll re-draw the bracket afterward.
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
          </View>
        )}
        <View
          pointerEvents={settingsLocked ? "none" : "auto"}
          style={settingsLocked ? styles.lockedDim : undefined}
        >
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
            <FieldLabel label="Format *" />
            <Dropdown
              placeholder="Select format"
              options={TOURNAMENT_FORMATS}
              value={form.tournamentFormat}
              onSelect={(v) => patchForm({ tournamentFormat: v })}
            />
          </View>
          <LabeledInput
            label="Game Spot"
            value={form.gameSpot}
            onChangeText={(v) => patchForm({ gameSpot: v })}
            placeholder="e.g., The Ball"
          />
          <LabeledInput
            label="Description"
            value={form.description}
            onChangeText={(v) => patchForm({ description: v })}
            placeholder="Describe the tournament..."
            multiline
          />
        </Section>

        <Section title="Fargo">
          <LabeledInput
            label="Maximum Fargo"
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

        <Section title="Race">
          <View style={styles.field}>
            <Dropdown
              placeholder="Select race type"
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

          {form.raceMode === "groups" && (
            <View>
              <Text allowFontScaling={false} style={styles.hint}>
                Players are auto-assigned a race from the group their Fargo falls
                in (manual override per player later).
              </Text>
              {form.raceGroups.map((g, i) => (
                <View key={g.id} style={styles.groupRow}>
                  <TextInput
                    allowFontScaling={false}
                    style={[styles.input, styles.groupLabel]}
                    value={g.label}
                    onChangeText={(v) => updateRaceGroup(i, "label", v)}
                    placeholder="A"
                    placeholderTextColor={COLORS.textMuted}
                  />
                  <TextInput
                    allowFontScaling={false}
                    style={[styles.input, styles.groupNum]}
                    value={g.minFargo}
                    onChangeText={(v) => updateRaceGroup(i, "minFargo", v)}
                    placeholder="Min"
                    placeholderTextColor={COLORS.textMuted}
                    keyboardType="numeric"
                  />
                  <TextInput
                    allowFontScaling={false}
                    style={[styles.input, styles.groupNum]}
                    value={g.maxFargo}
                    onChangeText={(v) => updateRaceGroup(i, "maxFargo", v)}
                    placeholder="Max"
                    placeholderTextColor={COLORS.textMuted}
                    keyboardType="numeric"
                  />
                  <TextInput
                    allowFontScaling={false}
                    style={[styles.input, styles.groupNum]}
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
                      {"\u2715"}
                    </Text>
                  </TouchableOpacity>
                </View>
              ))}
              <TouchableOpacity style={styles.addRowBtn} onPress={addRaceGroup}>
                <Text allowFontScaling={false} style={styles.addRowBtnText}>
                  + Add Group
                </Text>
              </TouchableOpacity>
              {form.raceGroups.length > 0 && (
                <View style={styles.exampleBox}>
                  <Text allowFontScaling={false} style={styles.exampleTitle}>
                    Group Settings
                  </Text>
                  {form.raceGroups.map((g, i) => (
                    <Text
                      key={g.id}
                      allowFontScaling={false}
                      style={styles.exampleText}
                    >
                      Group {g.label || String.fromCharCode(65 + i)}:{" "}
                      {g.minFargo.trim() || "0"}-{g.maxFargo.trim() || "+"} · Race
                      to {g.raceTo.trim() || "?"}
                    </Text>
                  ))}
                  <Text allowFontScaling={false} style={styles.exampleText}>
                    A blank minimum counts as 0; a blank maximum has no upper
                    limit.
                  </Text>
                </View>
              )}
            </View>
          )}
        </Section>

        <Section title="Entry & Money">
          <LabeledInput
            label="Entry Fee"
            value={form.entryFee}
            onChangeText={(v) => patchForm({ entryFee: v })}
            placeholder="$0.00"
            keyboardType="decimal-pad"
            accessoryId={KB_DONE}
          />

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

            {(form.fees ?? []).map((fee) => {
              const isCustom = fee.category === "custom";
              return (
                <View key={fee.id} style={styles.feeRow}>
                  <TouchableOpacity
                    style={styles.feeBox2}
                    onPress={() => toggleFeeEnabled(fee.id)}
                  >
                    <View style={[styles.feeBox, fee.enabled && styles.feeBoxOn]}>
                      {fee.enabled && (
                        <Text allowFontScaling={false} style={styles.feeBoxCheck}>
                          {"✓"}
                        </Text>
                      )}
                    </View>
                  </TouchableOpacity>

                  {isCustom ? (
                    <TextInput
                      allowFontScaling={false}
                      style={[styles.input, styles.feeNameInput]}
                      value={fee.name}
                      onChangeText={(v) => updateFee(fee.id, "name", v)}
                      placeholder="Fee name"
                      placeholderTextColor={COLORS.textMuted}
                    />
                  ) : (
                    <TouchableOpacity
                      style={styles.feeNameStaticWrap}
                      onPress={() => toggleFeeEnabled(fee.id)}
                    >
                      <Text allowFontScaling={false} style={styles.feeLabel}>
                        {fee.name}
                      </Text>
                    </TouchableOpacity>
                  )}

                  {fee.enabled && (
                    <View style={styles.feeAmtWrap}>
                      <Text allowFontScaling={false} style={styles.feeDollar}>
                        $
                      </Text>
                      <TextInput
                        allowFontScaling={false}
                        style={[styles.input, styles.feeAmtInput]}
                        value={fee.amount}
                        onChangeText={(v) => updateFee(fee.id, "amount", v)}
                        placeholder="0"
                        placeholderTextColor={COLORS.textMuted}
                        keyboardType="decimal-pad"
                        inputAccessoryViewID={
                          Platform.OS === "ios" ? KB_DONE : undefined
                        }
                      />
                    </View>
                  )}

                  {isCustom && (
                    <TouchableOpacity
                      style={styles.feeTrash}
                      onPress={() => removeFee(fee.id)}
                    >
                      <Text allowFontScaling={false} style={styles.feeTrashText}>
                        {"🗑"}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            })}

            <TouchableOpacity
              style={styles.feeAddRow}
              onPress={() => {
                setFeeModalName("");
                setFeeModalAmount("");
                setFeeModalVisible(true);
              }}
            >
              <Text allowFontScaling={false} style={styles.feeAddText}>
                + Add Fee
              </Text>
            </TouchableOpacity>

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
              </View>
            )}
          </View>

          <LabeledInput
            label="Money Added"
            value={form.addedMoney}
            onChangeText={(v) => patchForm({ addedMoney: v })}
            placeholder="$0.00"
            keyboardType="decimal-pad"
            accessoryId={KB_DONE}
          />
          <View style={styles.sidePotHeader}>
            <FieldLabel label="Side Pots" />
            <TouchableOpacity style={styles.addRowBtnSm} onPress={addSidePot}>
              <Text allowFontScaling={false} style={styles.addRowBtnText}>
                + Add
              </Text>
            </TouchableOpacity>
          </View>
          {form.sidePots.map((pot, i) => (
            <View key={i} style={styles.sidePotRow}>
              <TextInput
                allowFontScaling={false}
                style={[styles.input, styles.sidePotName]}
                value={pot.name}
                onChangeText={(v) => updateSidePot(i, "name", v)}
                placeholder="Name"
                placeholderTextColor={COLORS.textMuted}
              />
              <TextInput
                allowFontScaling={false}
                style={[styles.input, styles.sidePotAmount]}
                value={pot.amount}
                onChangeText={(v) => updateSidePot(i, "amount", v)}
                placeholder="$"
                placeholderTextColor={COLORS.textMuted}
                keyboardType="decimal-pad"
                inputAccessoryViewID={Platform.OS === "ios" ? KB_DONE : undefined}
              />
              <TouchableOpacity
                style={styles.groupRemove}
                onPress={() => removeSidePot(i)}
              >
                <Text allowFontScaling={false} style={styles.groupRemoveText}>
                  {"\u2715"}
                </Text>
              </TouchableOpacity>
            </View>
          ))}
        </Section>


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
          <Text allowFontScaling={false} style={styles.hint}>
            Timezone: {hub.tournament?.timezone || "—"}
          </Text>
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
          <View style={styles.field}>
            <FieldLabel label="Table Size" />
            <Dropdown
              placeholder="Select table size"
              options={TABLE_SIZE_OPTIONS}
              value={form.tableSize}
              onSelect={(v) => patchForm({ tableSize: v })}
            />
          </View>
          <View style={styles.field}>
            <FieldLabel label="Equipment" />
            <Dropdown
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
          <Text allowFontScaling={false} style={styles.hint}>
            To change the venue or tournament image, use the Edit Tournament
            screen.
          </Text>
        </Section>
        </View>
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
    const summary = [
      { key: "prereg" as DisplayStatus, short: "Pre-Reg", n: statusCounts.prereg },
      { key: "ready" as DisplayStatus, short: "Ready", n: statusCounts.ready },
      { key: "no_show" as DisplayStatus, short: "No Show", n: statusCounts.no_show },
    ];
    return (
      <View>
        <View style={styles.playersTopRow}>
          <View style={styles.summaryPills}>
            {summary.map((sp) => (
              <View key={sp.key} style={styles.summaryPill}>
                <View
                  style={[
                    styles.statusDotSm,
                    { backgroundColor: DISPLAY_META[sp.key].color },
                  ]}
                />
                <Text allowFontScaling={false} style={styles.summaryPillText}>
                  {sp.short} {sp.n}
                </Text>
              </View>
            ))}
          </View>
          <TouchableOpacity
            style={styles.addButton}
            onPress={() => setAddModalVisible(true)}
          >
            <Text allowFontScaling={false} style={styles.addButtonText}>
              + Add Player
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.searchInputWrapper}>
          <Text allowFontScaling={false} style={styles.searchIcon}>
            {GLYPH.search}
          </Text>
          <TextInput
            allowFontScaling={false}
            style={styles.searchInput}
            placeholder="Search players..."
            placeholderTextColor={COLORS.textMuted}
            value={playerSearch}
            onChangeText={setPlayerSearch}
          />
        </View>

        <View style={styles.field}>
          <Dropdown
            placeholder="Filter status"
            options={PLAYER_FILTERS}
            value={statusFilter}
            onSelect={(v) => setStatusFilter(v as "all" | DisplayStatus)}
          />
        </View>

        {hub.registrationsLoading ? (
          <View style={styles.centerBlock}>
            <ActivityIndicator size="large" color={COLORS.primary} />
          </View>
        ) : filteredRegs.length === 0 ? (
          <EmptyState
            message="No players to show"
            submessage="Add players or adjust the filter."
          />
        ) : (
          filteredRegs.map((item) => (
            <RegistrationRow
              key={item.id}
              registration={item}
              sidePots={sidePots}
              entryFee={entryFee}
              raceMode={raceMode}
              raceGroups={raceGroups}
              onReady={(fargo, isStarter, paidEntry, paidPots, raceOverride) =>
                handleReady(item, fargo, isStarter, paidEntry, paidPots, raceOverride)
              }
              onSaveEdit={(fargo, isStarter, paidEntry, paidPots, raceOverride) =>
                handleSaveEdit(item, fargo, isStarter, paidEntry, paidPots, raceOverride)
              }
              onTogglePaidPot={(name, paid) =>
                handleTogglePaidPot(item, name, paid)
              }
              onNoShow={() => handleNoShow(item)}
              onRemove={() => handleRemove(item)}
              onUndo={() => handleUndoReady(item)}
              onRestore={() => handleRestore(item)}
              isProcessing={processingId === item.id}
              locked={settingsLocked}
            />
          ))
        )}
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
                    Table {editingTable.table_number}
                    {editingTable.label ? ` — ${editingTable.label}` : ""}
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
                      Remove Table
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
              style={styles.startBtn}
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
          return (
            <BracketCalc
              key={g.id}
              label={`Group ${g.label || "?"} (${g.minFargo}-${g.maxFargo || "+"})`}
              value={`${count} players · Race ${g.raceTo}`}
            />
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

    return (
      <View>
        {bracket && !locked && (
          <View style={styles.staleBanner}>
            <Text allowFontScaling={false} style={styles.staleBannerText}>
              Showing a previous draw (Draw #{bracket.drawNumber}). Draw again to
              apply changes.
            </Text>
          </View>
        )}

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

        {!locked && (
          <Section title="Bracket Size">
            <Text allowFontScaling={false} style={styles.hint}>
              Recommended {recommended} for {ready.length} Ready players.
            </Text>
            <Dropdown
              options={[
                ...sizeOptions.map((s) => ({
                  label: `${s} players`,
                  value: String(s),
                })),
                { label: "256 players (Coming Soon)", value: "256" },
              ]}
              value={String(size)}
              onSelect={(v) => {
                if (v === "256") {
                  Alert.alert(
                    "Coming Soon",
                    "256-player brackets aren't available yet.",
                  );
                  return;
                }
                setBracketSizeSel(Number(v));
              }}
            />
          </Section>
        )}

        {!locked && (
          <Section title="Draw Type">
            <Dropdown
              options={DRAW_TYPE_OPTIONS}
              value={drawType}
              onSelect={(v) => {
                const dt = v as DrawType;
                if (!DRAW_TYPE_SUPPORTED.includes(dt)) {
                  Alert.alert(
                    "Coming Soon",
                    "Only Random Draw is available in this version.",
                  );
                  return;
                }
                setDrawType(dt);
              }}
            />
          </Section>
        )}

        <Section title="Race Assignment">{racePreview()}</Section>

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
          <BracketCalc
            label="Est. Completion"
            value={fmtHours(stats.estCompletionHours)}
          />
          <Text
            allowFontScaling={false}
            style={[styles.hint, { marginTop: webSc(SPACING.sm) }]}
          >
            Estimated time by table count
          </Text>
          {stats.byTable.map((b) => (
            <BracketCalc
              key={b.tables}
              label={`Using ${b.tables} tables`}
              value={fmtHours(b.hours)}
            />
          ))}
        </Section>

        {bracket && (
          <Section title={`Round 1 — ${bracket.round1.length} matches`}>
            {bracket.round1.map((m) => (
              <View key={m.matchNumber} style={styles.matchRow}>
                <Text allowFontScaling={false} style={styles.matchNum}>
                  M{m.matchNumber}
                </Text>
                <Text
                  allowFontScaling={false}
                  style={styles.matchText}
                  numberOfLines={2}
                >
                  {matchLabel(m)}
                </Text>
              </View>
            ))}
          </Section>
        )}

        {(hub.drawLog?.length ?? 0) > 0 && (
          <TouchableOpacity
            style={styles.historyBtn}
            onPress={() => setShowDrawHistory(true)}
          >
            <Text allowFontScaling={false} style={styles.historyBtnText}>
              View Draw History ({hub.drawLog.length})
            </Text>
          </TouchableOpacity>
        )}

        {__DEV__ && hub.bracket && (
          <TouchableOpacity style={styles.simBtn} onPress={handleSimulateHalf}>
            <Text allowFontScaling={false} style={styles.simBtnText}>
              {"🧪"} Simulate ~50% &amp; Start (dev)
            </Text>
          </TouchableOpacity>
        )}

      </View>
    );
  };

  const renderTab = () => {
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
          />
        ) : null;
      case "bracket":
        return renderBracket();
      case "review":
        return renderReview();
      case "matches":
        return (
          <MatchesView
            matches={liveMatches}
            tables={hub.tables}
            onSetMatchState={hub.setMatchState}
            occupancy={tableOccupancy}
          />
        );
      case "queue":
        return (
          <QueueView
            matches={liveMatches}
            tables={hub.tables}
            bracket={hub.bracket}
            matchState={hub.matchState}
            occupancy={tableOccupancy}
            mode={hub.autoAssignMode as AutoAssignMode}
            queueOrder={hub.queueOrder}
            onAssign={handleQueueAssign}
            onAssignStart={handleQueueAssignStart}
            onStart={handleQueueStart}
            onUnassign={handleQueueUnassign}
            onSetMode={handleSetAutoMode}
            onSetQueueOrder={handleSetQueueOrder}
          />
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
  const formRequiredComplete =
    !!form &&
    !!form.name.trim() &&
    !!form.gameType &&
    !!form.tournamentFormat &&
    !!form.tournamentDate &&
    !!form.startTime &&
    !!hub.tournament?.venue_id;
  const regNotYetOpen =
    hub.phase === "setup_incomplete" || hub.phase === "ready_to_open";
  const canStartRegistration =
    formRequiredComplete && regNotYetOpen && !hub.isMutatingLive;

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

      <AddPlayerModal
        visible={addModalVisible}
        onClose={() => setAddModalVisible(false)}
        onAddPlayer={handleAddPlayer}
        onAddGuest={handleAddGuest}
        isAdding={isAdding}
        addedPlayerIds={addedPlayerIds}
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
            <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
              <View style={styles.modalOverlay}>
                <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
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
                      onChangeText={setFeeModalAmount}
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
                          addCustomFee(feeModalName, feeModalAmount);
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
                </TouchableWithoutFeedback>
              </View>
            </TouchableWithoutFeedback>
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

      {/* Header */}
      <View style={[styles.header, isWeb && styles.headerWeb]}>
        <TouchableOpacity style={styles.backButton} onPress={handleBack}>
          <Text allowFontScaling={false} style={styles.backText}>
            {GLYPH.back} Back
          </Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text
            allowFontScaling={false}
            style={styles.headerTitle}
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
        <View style={styles.placeholderSpace} />
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
        <PhaseNav
          phases={navPhases}
          selectedKey={selectedPhase}
          activePageKey={activeTab}
          onSelectPage={handleSelectPage}
          onLockedPress={(p) => handlePhasePress(p as PhaseKey)}
        />
      )}

      {activeTab === "matches" ||
      activeTab === "queue" ||
      activeTab === "stats" ||
      activeTab === "standings" ||
      activeTab === "payouts" ||
      activeTab === "history" ||
      activeTab === "summary" ? (
        // These own their scrolling and fill the available height, so they live
        // outside the page ScrollView.
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
          </View>
        </ScrollView>
      ) : (
        <ScrollView
          style={styles.scrollFlex}
          contentContainerStyle={[styles.content, isWeb && styles.contentWeb]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          onScrollBeginDrag={() => Keyboard.dismiss()}
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
        </ScrollView>
      )}

      {/* Fixed footer: Close Registration stays pinned while the list scrolls */}
      {activeTab === "players" && hub.liveState === "registration_open" && (
        <View style={styles.playersFooter}>
          <TouchableOpacity
            style={[styles.lockBtn, styles.lockBtnFooter, styles.lockBtnFooterInner]}
            onPress={() => handleTabPress("bracket")}
          >
            <Text allowFontScaling={false} style={styles.lockBtnText}>
              Add Players to Bracket →
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Fixed footer: Save Settings / Start Registration */}
      {activeTab === "settings" && form && !settingsLocked && (
        <View style={styles.settingsFooter}>
          {!isExternal && !formRequiredComplete && (
            <Text allowFontScaling={false} style={styles.startHintFooter}>
              Complete the required fields (name, game, format, venue, date,
              time) to start registration.
            </Text>
          )}
          <View style={[styles.saveRow, styles.settingsFooterInner]}>
            <TouchableOpacity
              style={[styles.saveBtn, { flex: 1 }, hub.isSaving && styles.btnDisabled]}
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
            {!isExternal && (
              <TouchableOpacity
                style={[styles.startBtn, !canStartRegistration && styles.btnDisabled]}
                onPress={handleStartRegistration}
                disabled={!canStartRegistration}
              >
                <Text allowFontScaling={false} style={styles.startBtnText}>
                  Start Registration
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

      {/* Fixed footer: Save Prize Pool (prizepool tab, pre-lock) */}
      {activeTab === "prizepool" && prizeForm && !prizeLocked && (
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
              ]}
              onPress={handleSavePrizePool}
              disabled={hub.isSavingPrizePool || !prizeComplete}
            >
              <Text allowFontScaling={false} style={styles.saveBtnText}>
                {hub.isSavingPrizePool ? "Saving..." : "Save Prize Pool"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Fixed footer: Draw / Reopen & Redraw / Start Tournament (bracket tab) */}
      {activeTab === "bracket" && readyPlayers.length >= 2 && (
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
                style={[styles.reopenBtn, { flex: 1 }]}
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
                  style={[styles.startBtn, hub.isMutatingLive && styles.btnDisabled]}
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...Platform.select({
      web: { maxWidth: 860, width: "100%" as any, alignSelf: "center" as any },
    }),
    flex: 1,
    backgroundColor: COLORS.background,
  },
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
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  headerWeb: { paddingTop: webSc(SPACING.lg), backgroundColor: COLORS.background },
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
  contentWeb: { alignItems: "stretch" },
  scrollFlex: { flex: 1 },
  // Web event-builder two-column: the page scrolls; the preview is sticky.
  builderRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    width: "100%" as any,
    maxWidth: 1180,
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
  fieldLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: webSc(SPACING.xs),
  },
  fieldCheck: {
    fontSize: webMs(FONT_SIZES.sm),
    color: COLORS.success,
    fontWeight: "700",
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
    paddingHorizontal: webSc(SPACING.sm),
  },
  inputWrapMultiline: { alignItems: "flex-start" },
  inputWrapNarrow: { width: webSc(96), alignSelf: "flex-start" },
  inputInner: {
    flex: 1,
    paddingVertical: webSc(SPACING.sm),
    fontSize: webMs(FONT_SIZES.sm),
    color: COLORS.text,
  },
  inputCheck: {
    color: COLORS.success,
    fontWeight: "700",
    fontSize: webMs(FONT_SIZES.sm),
    marginRight: 6,
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
  groupLabel: { width: webSc(48) },
  groupNum: { flex: 1, minWidth: webSc(48) },
  groupRemove: {
    width: webSc(32),
    height: webSc(32),
    alignItems: "center",
    justifyContent: "center",
  },
  groupRemoveText: { color: COLORS.error, fontSize: webMs(FONT_SIZES.md) },
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
  addRowBtnText: {
    color: COLORS.primary,
    fontSize: webMs(FONT_SIZES.sm),
    fontWeight: "600",
  },

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
  feeAddRow: {
    marginTop: webSc(SPACING.sm),
    paddingVertical: webSc(SPACING.xs),
  },
  feeAddText: {
    fontSize: webMs(FONT_SIZES.sm),
    color: COLORS.primary,
    fontWeight: "700",
  },
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
  },
  lockBtnFooterInner: { width: "95%" },
  settingsFooter: {
    paddingHorizontal: webSc(5),
    paddingTop: webSc(18),
    paddingBottom: Platform.OS === "ios" ? webSc(15) : webSc(10),
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    backgroundColor: COLORS.background,
    alignItems: "center",
  },
  settingsFooterInner: { width: "95%", marginTop: 0 },
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
  },
  addButtonText: {
    color: COLORS.white,
    fontSize: webMs(FONT_SIZES.sm),
    fontWeight: "700",
  },

  regCard: {
    backgroundColor: COLORS.surface,
    borderRadius: webSc(RADIUS.md),
    padding: webSc(SPACING.md),
    marginBottom: webSc(SPACING.sm),
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: webSc(SPACING.sm),
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
    paddingVertical: webSc(SPACING.sm),
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
    marginBottom: webSc(SPACING.sm),
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
  },

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
