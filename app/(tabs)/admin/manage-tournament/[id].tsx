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
} from "react-native";
import { COLORS } from "../../../../src/theme/colors";
import { RADIUS, SPACING } from "../../../../src/theme/spacing";
import { FONT_SIZES } from "../../../../src/theme/typography";
import { webMs, webSc } from "../../../../src/utils/scaling";
import {
  GAME_TYPES,
  START_TIMES,
  TOURNAMENT_FORMATS,
} from "../../../../src/utils/tournament-form-data";
import { GAME_TYPE_MAP } from "../../../../src/utils/game-type.utils";
import {
  GameType,
  RegistrationStatus,
  TableStatus,
  TournamentFormat,
} from "../../../../src/models/types/common.types";
import { Profile } from "../../../../src/models/types/profile.types";
import { Registration } from "../../../../src/models/types/registration.types";
import { Tournament } from "../../../../src/models/types/tournament.types";
import {
  BracketMatch,
  DrawLogEntry,
  GeneratedBracket,
  RaceGroup,
  RaceMode,
} from "../../../../src/models/types/tournament-settings.types";
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
import { useAuthContext } from "../../../../src/providers/AuthProvider";
import { Dropdown } from "../../../../src/views/components/common/dropdown";
import { ToggleSwitch } from "../../../../src/views/components/common/toggle-switch";
import { DatePicker } from "../../../../src/views/components/common/date-picker";
import { EmptyState } from "../../../../src/views/components/dashboard/empty-state";
import { MatchesView } from "../../../../src/views/components/tournament/live/MatchesView";
import { PhaseNav } from "../../../../src/views/components/tournament/live/PhaseNav";
import { TournamentActionsModal } from "../../../../src/views/components/tournament/live/TournamentActionsModal";
import { buildLiveMatches, LiveMatch } from "../../../../src/utils/match.utils";
import { usePlayerSearch } from "../../../../src/viewmodels/hooks/use.player.search";
import {
  ManagePhase,
  useManageTournament,
} from "../../../../src/viewmodels/hooks/use.manage.tournament";

const isWeb = Platform.OS === "web";

// Unicode-escaped glyphs (raw emoji in the source corrupt under our toolchain).
const GLYPH = { back: "\u2190", search: "\uD83D\uDD0D", lock: "\uD83D\uDD12", bolt: "\u26A1" };

// ── Tabs ─────────────────────────────────────────────────────────────────────
type TabKey =
  | "settings"
  | "players"
  | "tables"
  | "bracket"
  | "review"
  | "matches"
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
  bracket: "Bracket / Draw",
  review: "Review",
  matches: "Matches",
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
      { tab: "bracket", label: "Draw Bracket", lead: "⚡", divider: true },
    ],
  },
  live: {
    label: "Live",
    tabs: [
      { tab: "matches", label: "Matches / Bracket" },
      { tab: "tables", label: "Tables" },
      { tab: "actions", label: "Actions", lead: "⚡", divider: true },
    ],
  },
  results: {
    label: "Results",
    tabs: [
      { tab: "standings", label: "Standings" },
      { tab: "payouts", label: "Payouts" },
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
  reportsToFargo: boolean;
  openTournament: boolean;
  isRecurring: boolean;
  tournamentDate: string;
  startTime: string;
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
    reportsToFargo: !!t.reports_to_fargo,
    openTournament: !!t.open_tournament,
    isRecurring: !!t.is_recurring,
    tournamentDate: t.tournament_date ?? "",
    startTime: toStartTime(t.start_time),
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
  };
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
  reports_to_fargo: f.reportsToFargo,
  open_tournament: f.openTournament,
  is_recurring: f.isRecurring,
  tournament_date: f.tournamentDate,
  start_time: f.startTime,
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
  },
  };
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
}) => (
  <View style={styles.field}>
    <Text
      allowFontScaling={false}
      style={[styles.fieldLabel, disabled && styles.labelDisabled]}
    >
      {label}
    </Text>
    <TextInput
      allowFontScaling={false}
      editable={!disabled}
      style={[
        styles.input,
        multiline && styles.inputMultiline,
        narrow && styles.inputNarrow,
        disabled && styles.inputDisabled,
      ]}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={COLORS.textMuted}
      keyboardType={keyboardType ?? "default"}
      multiline={multiline}
      maxLength={maxLength}
    />
    {hint ? (
      <Text allowFontScaling={false} style={styles.hint}>
        {hint}
      </Text>
    ) : null}
  </View>
);

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
}: {
  visible: boolean;
  onClose: () => void;
  onAddPlayer: (profile: Profile) => void;
  onAddGuest: (guestName: string) => void;
  isAdding: boolean;
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
                {search.results.map((profile) => (
                  <TouchableOpacity
                    key={profile.id_auto}
                    style={styles.resultRow}
                    onPress={() => onAddPlayer(profile)}
                    disabled={isAdding}
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
                    <Text allowFontScaling={false} style={styles.resultAdd}>
                      + Add
                    </Text>
                  </TouchableOpacity>
                ))}
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
              {livePaidPots().map((name, i) => {
                const pot = sidePots.find((p) => p.name === name);
                if (!pot) return null;
                return (
                  <PayCheckbox
                    key={`${name}-${i}`}
                    label={`${potLabel(pot)} Entered`}
                    checked
                    readOnly
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
    goToTab(target);
  };

  const handleBack = () => {
    if (activeTab === "settings" && settingsDirty) {
      confirmLeaveSettings(() => router.back());
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
  const resultsUnlocked = (["completed", "archived"] as ManagePhase[]).includes(
    hub.phase,
  );
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
  const navPhases = PHASE_ORDER.map((pk) => {
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
            ? (stepComplete as Record<string, boolean>)[t.tab]
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
  const [bracketSizeSel, setBracketSizeSel] = useState<number | null>(null);
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
    Alert.alert(
      "Draw Bracket",
      "This closes registration and locks the player field. Continue?",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Draw Bracket", onPress: () => handleDrawBracket(reason) },
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
      Alert.alert("Saved", "Tournament settings updated.");
    } catch {
      Alert.alert("Error", "Failed to save settings. Please try again.");
    }
  };

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
      setAddModalVisible(false);
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
      setAddModalVisible(false);
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
  const renderSettings = () => {
    if (!form) {
      return (
        <View style={styles.centerBlock}>
          <ActivityIndicator color={COLORS.primary} />
        </View>
      );
    }
    const venue = hub.tournament?.venues;
    // Max Fargo and Open Tournament are mutually exclusive — each greys the other.
    const maxFargoDisabled = form.openTournament;
    const openTournamentDisabled = !!form.maxFargo.trim();

    return (
      <View>
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
          />
          <LabeledInput
            label="Money Added"
            value={form.addedMoney}
            onChangeText={(v) => patchForm({ addedMoney: v })}
            placeholder="$0.00"
            keyboardType="decimal-pad"
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
          <Text allowFontScaling={false} style={styles.hint}>
            Venue and tournament image are changed on the Edit Tournament screen.
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
            Add Tables
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
      </View>

      <Section title={`Tables (${hub.tables.length})`}>
        {hub.tables.length === 0 ? (
          <Text allowFontScaling={false} style={styles.hint}>
            No tables yet. Add tables above.
          </Text>
        ) : (
          hub.tables.map((tbl) => {
            const occupiedBy = tableMatch[tbl.id] ?? null;
            const effStatus: TableStatus = occupiedBy ? "in_use" : tbl.status;
            const color = tableStatusColor(effStatus);
            return (
              <TouchableOpacity
                key={tbl.id}
                style={styles.tableRow}
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
                    <View style={styles.streamBadge}>
                      <Text allowFontScaling={false} style={styles.streamBadgeText}>
                        LIVE
                      </Text>
                    </View>
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
            );
          })
        )}
      </Section>

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
      case "results":
      case "standings":
        return (
          <TabPlaceholder
            locked={false}
            title="Standings"
            body="Final placements appear here after play completes (Phase 3)."
          />
        );
      case "payouts":
        return (
          <TabPlaceholder
            locked={false}
            title="Payouts"
            body="Prize pool breakdown and payouts will appear here (Phase 3)."
          />
        );
      case "history":
        return (
          <TabPlaceholder
            locked={false}
            title="Match History"
            body="A full record of every completed match will appear here (Phase 3)."
          />
        );
      case "summary":
        return (
          <TabPlaceholder
            locked={false}
            title="Tournament Summary"
            body="A recap of the event — entries, duration, and key stats (Phase 3)."
          />
        );
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

  return (
    <View style={styles.container}>
      <AddPlayerModal
        visible={addModalVisible}
        onClose={() => setAddModalVisible(false)}
        onAddPlayer={handleAddPlayer}
        onAddGuest={handleAddGuest}
        isAdding={isAdding}
      />

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
      />

      {/* Lifecycle navigation — Setup / Live / Results phase dropdowns */}
      <PhaseNav
        phases={navPhases}
        selectedKey={selectedPhase}
        activePageKey={activeTab}
        onSelectPage={handleSelectPage}
        onLockedPress={(p) => handlePhasePress(p as PhaseKey)}
      />

      {activeTab === "matches" ? (
        // Matches owns its own scrolling (cards) / gestures (bracket) and fills
        // the available height, so it lives outside the page ScrollView.
        <View style={styles.scrollFlex}>{renderTab()}</View>
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
          {hub.phase === "setup_incomplete" && (
            <Text allowFontScaling={false} style={styles.startHintFooter}>
              Complete the required fields (name, game, format, venue, date,
              time) to start registration.
            </Text>
          )}
          <View style={[styles.saveRow, styles.settingsFooterInner]}>
            <TouchableOpacity
              style={[styles.saveBtn, hub.isSaving && styles.btnDisabled]}
              onPress={handleSave}
              disabled={hub.isSaving}
            >
              <Text allowFontScaling={false} style={styles.saveBtnText}>
                {hub.isSaving ? "Saving..." : "Save Settings"}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.startBtn,
                (hub.phase !== "ready_to_open" || hub.isMutatingLive) &&
                  styles.btnDisabled,
              ]}
              onPress={handleStartRegistration}
              disabled={hub.phase !== "ready_to_open" || hub.isMutatingLive}
            >
              <Text allowFontScaling={false} style={styles.startBtnText}>
                Start Registration
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Fixed footer: Draw / Reopen & Redraw / Start Tournament (bracket tab) */}
      {activeTab === "bracket" && readyPlayers.length >= 2 && (
        <View style={styles.settingsFooter}>
          {!settingsLocked ? (
            <View style={[styles.saveRow, styles.settingsFooterInner]}>
              <TouchableOpacity
                style={[styles.startBtn, hub.isDrawing && styles.btnDisabled]}
                onPress={handleDrawPress}
                disabled={hub.isDrawing}
              >
                <Text allowFontScaling={false} style={styles.startBtnText}>
                  {hub.isDrawing
                    ? "Drawing..."
                    : hub.bracket
                      ? "Redraw Bracket"
                      : "Draw Bracket"}
                </Text>
              </TouchableOpacity>
            </View>
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
  headerWeb: { paddingTop: webSc(SPACING.lg) },
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
    justifyContent: "space-between",
    gap: webSc(SPACING.sm),
    backgroundColor: COLORS.surface,
    borderRadius: webSc(RADIUS.md),
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: webSc(SPACING.md),
    paddingVertical: webSc(SPACING.md),
    marginBottom: webSc(SPACING.sm),
  },
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
  streamBadge: {
    backgroundColor: COLORS.error,
    borderRadius: webSc(RADIUS.sm),
    paddingHorizontal: webSc(SPACING.xs),
    paddingVertical: 1,
  },
  streamBadgeText: { color: "#fff", fontSize: 9, fontWeight: "900", letterSpacing: 0.5 },

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
