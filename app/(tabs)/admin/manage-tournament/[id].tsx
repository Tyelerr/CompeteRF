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
  Modal,
  Platform,
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
  RaceGroup,
  RaceMode,
} from "../../../../src/models/types/tournament-settings.types";
import { Dropdown } from "../../../../src/views/components/common/dropdown";
import { ToggleSwitch } from "../../../../src/views/components/common/toggle-switch";
import { DatePicker } from "../../../../src/views/components/common/date-picker";
import { EmptyState } from "../../../../src/views/components/dashboard/empty-state";
import { usePlayerSearch } from "../../../../src/viewmodels/hooks/use.player.search";
import {
  ManagePhase,
  useManageTournament,
} from "../../../../src/viewmodels/hooks/use.manage.tournament";

const isWeb = Platform.OS === "web";

// Unicode-escaped glyphs (raw emoji in the source corrupt under our toolchain).
const GLYPH = { back: "\u2190", search: "\uD83D\uDD0D", lock: "\uD83D\uDD12" };

// ── Tabs ─────────────────────────────────────────────────────────────────────
type TabKey =
  | "settings"
  | "players"
  | "tables"
  | "bracket"
  | "review"
  | "matches"
  | "results";

const TAB_LABELS: Record<TabKey, string> = {
  settings: "Settings",
  players: "Players",
  tables: "Tables",
  bracket: "Bracket / Draw",
  review: "Review",
  matches: "Matches",
  results: "Results",
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

// Which tabs are visible for a phase. No lock icons: the live tabs simply
// aren't shown until usable. Matches appears once Running; Results once Completed.
const visibleTabs = (phase: ManagePhase): TabKey[] => {
  const tabs: TabKey[] = [...SETUP_ORDER];
  if (phase === "running") tabs.push("matches");
  if (phase === "completed") tabs.push("matches", "results");
  return tabs;
};

// ── Phase presentation ───────────────────────────────────────────────────────
const PHASE_META: Record<ManagePhase, { label: string; color: string }> = {
  setup_incomplete: { label: "Setup Incomplete", color: COLORS.warning },
  ready_to_open: { label: "Ready to Start Registration", color: COLORS.primary },
  registration_open: { label: "Registration Open", color: COLORS.success },
  registration_closed: { label: "Registration Closed", color: COLORS.warning },
  running: { label: "Running", color: COLORS.primary },
  completed: { label: "Completed", color: COLORS.textSecondary },
  archived: { label: "Archived", color: COLORS.textSecondary },
};

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

// Pull the first number out of a legacy free-text race (e.g. "Race to 5" -> 5)
// so existing tournaments pre-fill the Winners race.
const parseRaceNumber = (race: string | null | undefined): number | null => {
  if (!race) return null;
  const m = race.match(/\d+/);
  return m ? parseInt(m[0], 10) : null;
};

const RACE_MODE_OPTIONS = [
  { label: "Fixed Race", value: "fixed" },
  { label: "A/B/C Race Groups", value: "groups" },
  { label: "Fargo Differential", value: "differential" },
];

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
    raceWinners: ls.fixedRaceWinners ?? parseRaceNumber(t.race) ?? 5,
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
const groupRep = (g: RaceGroup): number =>
  g.maxFargo && g.maxFargo >= g.minFargo
    ? Math.round((g.minFargo + g.maxFargo) / 2)
    : g.minFargo;

// ── Registration Row ─────────────────────────────────────────────────────────
const RegistrationRow = ({
  registration,
  sidePots,
  raceMode,
  raceGroups,
  onReady,
  onSaveEdit,
  onNoShow,
  onRemove,
  onUndo,
  onRestore,
  isProcessing,
}: {
  registration: Registration;
  sidePots: { name: string; amount: number }[];
  raceMode: RaceMode;
  raceGroups: RaceGroup[];
  onReady: (
    fargo: number,
    isStarter: boolean,
    paidEntry: boolean,
    paidPots: string[],
  ) => void;
  onSaveEdit: (
    fargo: number,
    isStarter: boolean,
    paidEntry: boolean,
    paidPots: string[],
  ) => void;
  onNoShow: () => void;
  onRemove: () => void;
  onUndo: () => void;
  onRestore: () => void;
  isProcessing: boolean;
}) => {
  const d = displayStatusOf(registration.status);
  const meta = DISPLAY_META[d];
  const isGuest = !registration.player_id;
  const isGroups = raceMode === "groups";

  const [editing, setEditing] = useState(false);
  const [paidEntry, setPaidEntry] = useState(!!registration.paid_entry);
  const [paidPots, setPaidPots] = useState<string[]>(
    registration.paid_side_pots ?? [],
  );
  const [fargoInput, setFargoInput] = useState(
    registration.fargo_rating != null ? String(registration.fargo_rating) : "",
  );

  const reseed = () => {
    setPaidEntry(!!registration.paid_entry);
    setPaidPots(registration.paid_side_pots ?? []);
    setFargoInput(
      registration.fargo_rating != null ? String(registration.fargo_rating) : "",
    );
  };

  const togglePot = (name: string) =>
    setPaidPots((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name],
    );
  const potLabel = (p: { name: string; amount: number }) =>
    p.amount ? `${p.name} ($${p.amount})` : p.name;

  const fargoNum = parseInt(fargoInput, 10);
  const fargoValid = !isNaN(fargoNum) && fargoNum > 0;
  const selectedGroup = isGroups ? groupForFargo(fargoNum, raceGroups) : null;
  const assignReady = isGroups ? !!selectedGroup : fargoValid;
  // Ready requires the rating/group AND the entry fee paid.
  const canBeReady = assignReady && paidEntry;

  const groupOptions = raceGroups.map((g) => ({
    label: `${g.label || "?"} (${g.minFargo}-${g.maxFargo || "+"}) - Race ${g.raceTo}`,
    value: g.id,
  }));

  const assignmentDisplay = () => {
    if (isGroups) {
      const g = groupForFargo(registration.fargo_rating ?? null, raceGroups);
      return g ? `Group ${g.label || "?"} · Race to ${g.raceTo}` : "No group set";
    }
    return registration.fargo_rating != null
      ? `Fargo ${registration.fargo_rating}`
      : "No Fargo set";
  };

  const renderGroupInput = () => (
    <View style={styles.field}>
      <FieldLabel label="Race Group" />
      <Dropdown
        placeholder="Select group"
        options={groupOptions}
        value={selectedGroup?.id ?? ""}
        onSelect={(gid) => {
          const g = raceGroups.find((x) => x.id === gid);
          if (g) setFargoInput(String(groupRep(g)));
        }}
      />
    </View>
  );

  const renderEditableBody = (onCommit: () => void, commitLabel: string, onCancel?: () => void) => (
    <>
      {isGroups && renderGroupInput()}
      <View style={styles.assignPayRow}>
        <View style={styles.payCol}>
          <PayCheckbox
            label="Entry Fee"
            checked={paidEntry}
            onToggle={() => setPaidEntry((v) => !v)}
          />
          {sidePots.map((p) => (
            <PayCheckbox
              key={p.name}
              label={potLabel(p)}
              checked={paidPots.includes(p.name)}
              onToggle={() => togglePot(p.name)}
            />
          ))}
        </View>
        {!isGroups && (
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
        )}
      </View>
      {!canBeReady && (
        <Text allowFontScaling={false} style={styles.hint}>
          {!paidEntry
            ? "Mark the entry fee paid to make this player ready."
            : isGroups
              ? "Select a race group to mark this player ready."
              : "Enter a Fargo rating to mark this player ready."}
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

      {d === "prereg" &&
        renderEditableBody(
          () => onReady(fargoNum, isGroups, paidEntry, paidPots),
          "Ready",
        )}

      {d === "ready" && editing &&
        renderEditableBody(
          () => {
            onSaveEdit(fargoNum, isGroups, paidEntry, paidPots);
            setEditing(false);
          },
          "Save",
          () => {
            reseed();
            setEditing(false);
          },
        )}

      {d === "ready" && !editing && (
        <>
          <Text allowFontScaling={false} style={styles.assignText}>
            {assignmentDisplay()}
          </Text>
          <PayCheckbox
            label={registration.paid_entry ? "Entry Fee Paid" : "Entry Fee not marked"}
            checked={!!registration.paid_entry}
            readOnly
          />
          {(registration.paid_side_pots ?? []).map((name) => (
            <PayCheckbox key={name} label={`${name} Entered`} checked readOnly />
          ))}
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

      {(d === "no_show" || d === "removed") && (
        <>
          <Text allowFontScaling={false} style={styles.assignText}>
            {assignmentDisplay()}
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

  // Settings form (seeded once from the record).
  const [form, setForm] = useState<SettingsForm | null>(null);
  const seededRef = useRef(false);
  useEffect(() => {
    if (!seededRef.current && hub.tournament) {
      setForm(toForm(hub.tournament));
      seededRef.current = true;
    }
  }, [hub.tournament]);

  // Players tab state
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [processingId, setProcessingId] = useState<number | null>(null);
  const [playerSearch, setPlayerSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | DisplayStatus>("all");

  // Tables tab state
  const [singleTableNum, setSingleTableNum] = useState("");
  const [bulkFrom, setBulkFrom] = useState("");
  const [bulkTo, setBulkTo] = useState("");
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
  const handleTabPress = (target: TabKey) => {
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

  // ---- Tables handlers ----------------------------------------------------
  const handleAddTable = async () => {
    const n = parseInt(singleTableNum, 10);
    if (isNaN(n)) {
      Alert.alert("Required", "Enter a table number.");
      return;
    }
    setTableBusy(true);
    try {
      await hub.createTable({ tableNumber: n });
      setSingleTableNum("");
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
      await hub.createTablesBulk({ from, to });
      setBulkFrom("");
      setBulkTo("");
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
  const handleCloseRegistration = () =>
    Alert.alert(
      "Close Registration",
      "Lock the player field and stop new registrations?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Close & Lock",
          onPress: () =>
            hub
              .closeRegistration()
              .catch(() => Alert.alert("Error", "Failed to close registration.")),
        },
      ],
    );
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

  // ---- Settings handlers --------------------------------------------------
  const patchForm = (patch: Partial<SettingsForm>) =>
    setForm((f) => (f ? { ...f, ...patch } : f));

  const handleSave = async () => {
    if (!form) return;
    try {
      await hub.saveSettings(toPatch(form));
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
            try {
              await hub.saveSettings(toPatch(form));
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
  ) =>
    withProcessing(
      r.id,
      () =>
        hub.updateRegistration({
          id: r.id,
          updates: {
            fargo_rating: fargo,
            is_starter_rating: isStarter,
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
    return hub.registrations.filter((r) => {
      const d = displayStatusOf(r.status);
      if (statusFilter === "all") {
        if (d === "removed") return false; // hide removed in the default view
      } else if (statusFilter !== d) {
        return false;
      }
      if (q && !getDisplayName(r).toLowerCase().includes(q)) return false;
      return true;
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
    const canStart = hub.phase === "ready_to_open";
    // Max Fargo and Open Tournament are mutually exclusive — each greys the other.
    const maxFargoDisabled = form.openTournament;
    const openTournamentDisabled = !!form.maxFargo.trim();

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
                    placeholder="Race"
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
              {form.raceGroups.length > 0 &&
                (() => {
                  const g = form.raceGroups[0];
                  const mn = parseInt(g.minFargo, 10);
                  const mx = parseInt(g.maxFargo, 10);
                  const sample = Number.isFinite(mn)
                    ? Number.isFinite(mx)
                      ? Math.round((mn + mx) / 2)
                      : mn + 10
                    : 600;
                  return (
                    <View style={styles.exampleBox}>
                      <Text allowFontScaling={false} style={styles.exampleTitle}>
                        Example
                      </Text>
                      <Text allowFontScaling={false} style={styles.exampleText}>
                        A player rated {sample} falls in Group{" "}
                        {g.label || "A"} ({g.minFargo || "0"}-{g.maxFargo || "+"}
                        ) and races to {g.raceTo || "?"}.
                      </Text>
                    </View>
                  );
                })()}
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

        <View style={styles.saveRow}>
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
              (!canStart || hub.isMutatingLive) && styles.btnDisabled,
            ]}
            onPress={handleStartRegistration}
            disabled={!canStart || hub.isMutatingLive}
          >
            <Text allowFontScaling={false} style={styles.startBtnText}>
              Start Registration
            </Text>
          </TouchableOpacity>
        </View>
        {!canStart && hub.phase === "setup_incomplete" && (
          <Text allowFontScaling={false} style={styles.startHint}>
            Complete the required fields (name, game, format, venue, date, time)
            to start registration.
          </Text>
        )}
      </View>
    );
  };

  const renderPlayers = () => {
    const sidePots = (hub.tournament?.side_pots ?? []).map((p) => ({
      name: p.name,
      amount: Number(p.amount) || 0,
    }));
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
              raceMode={raceMode}
              raceGroups={raceGroups}
              onReady={(fargo, isStarter, paidEntry, paidPots) =>
                handleReady(item, fargo, isStarter, paidEntry, paidPots)
              }
              onSaveEdit={(fargo, isStarter, paidEntry, paidPots) =>
                handleSaveEdit(item, fargo, isStarter, paidEntry, paidPots)
              }
              onNoShow={() => handleNoShow(item)}
              onRemove={() => handleRemove(item)}
              onUndo={() => handleUndoReady(item)}
              onRestore={() => handleRestore(item)}
              isProcessing={processingId === item.id}
            />
          ))
        )}
      </View>
    );
  };

  const renderTables = () => (
    <View>
      {!hub.tablesReady && (
        <View style={styles.section}>
          <Text allowFontScaling={false} style={styles.hint}>
            Tables need the database update applied before they can be saved.
          </Text>
        </View>
      )}

      <Section title="Add Tables">
        <View style={styles.tableAddRow}>
          <TextInput
            allowFontScaling={false}
            style={[styles.input, { flex: 1 }]}
            value={singleTableNum}
            onChangeText={setSingleTableNum}
            placeholder="Table #"
            placeholderTextColor={COLORS.textMuted}
            keyboardType="numeric"
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
            value={bulkFrom}
            onChangeText={setBulkFrom}
            placeholder="From"
            placeholderTextColor={COLORS.textMuted}
            keyboardType="numeric"
          />
          <TextInput
            allowFontScaling={false}
            style={[styles.input, { flex: 1 }]}
            value={bulkTo}
            onChangeText={setBulkTo}
            placeholder="To"
            placeholderTextColor={COLORS.textMuted}
            keyboardType="numeric"
          />
          <TouchableOpacity
            style={styles.tableAddBtn}
            onPress={handleBulkAddTables}
            disabled={tableBusy}
          >
            <Text allowFontScaling={false} style={styles.tableAddBtnText}>
              Bulk Add
            </Text>
          </TouchableOpacity>
        </View>
      </Section>

      <Section title={`Tables (${hub.tables.length})`}>
        {hub.tables.length === 0 ? (
          <Text allowFontScaling={false} style={styles.hint}>
            No tables yet. Add tables above.
          </Text>
        ) : (
          hub.tables.map((tbl) => {
            const draft = streamDrafts[tbl.id] ?? tbl.stream_link ?? "";
            return (
              <View key={tbl.id} style={styles.tableCard}>
                <View style={styles.tableCardHead}>
                  <Text allowFontScaling={false} style={styles.tableName}>
                    Table {tbl.table_number}
                    {tbl.label ? ` — ${tbl.label}` : ""}
                  </Text>
                  <TouchableOpacity onPress={() => handleDeleteTable(tbl.id)}>
                    <Text allowFontScaling={false} style={styles.tableDelete}>
                      Remove
                    </Text>
                  </TouchableOpacity>
                </View>
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
                        tbl.status === o.s && styles.tableStatusBtnActive,
                      ]}
                      onPress={() => handleSetTableStatus(tbl.id, o.s)}
                    >
                      <Text
                        allowFontScaling={false}
                        style={[
                          styles.tableStatusBtnText,
                          tbl.status === o.s && styles.tableStatusBtnTextActive,
                        ]}
                      >
                        {o.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <ToggleSwitch
                  label="Streaming Table"
                  value={tbl.is_streaming}
                  onValueChange={(on) =>
                    handleToggleStreaming(tbl.id, on, draft)
                  }
                />
                {tbl.is_streaming && (
                  <TextInput
                    allowFontScaling={false}
                    style={[styles.input, { marginTop: webSc(SPACING.sm) }]}
                    value={draft}
                    onChangeText={(v) =>
                      setStreamDrafts((m) => ({ ...m, [tbl.id]: v }))
                    }
                    onEndEditing={() =>
                      handleToggleStreaming(tbl.id, true, draft)
                    }
                    placeholder="Stream link URL"
                    placeholderTextColor={COLORS.textMuted}
                    autoCapitalize="none"
                  />
                )}
              </View>
            );
          })
        )}
      </Section>
    </View>
  );

  const renderReview = () => {
    const checks = [
      { key: "settings" as TabKey, label: "Settings completed", ok: stepComplete.settings },
      { key: "players" as TabKey, label: "Players ready (2+)", ok: stepComplete.players },
      { key: "tables" as TabKey, label: "Tables configured", ok: stepComplete.tables },
      { key: "bracket" as TabKey, label: "Bracket generated", ok: stepComplete.bracket },
    ];
    const allOk = checks.every((c) => c.ok);
    return (
      <View>
        <Section title="Review & Start">
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
              {!c.ok && (
                <TouchableOpacity onPress={() => setActiveTab(c.key)}>
                  <Text allowFontScaling={false} style={styles.reviewGo}>
                    Go to {TAB_LABELS[c.key]}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          ))}
        </Section>
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
        return (
          <TabPlaceholder
            locked={false}
            title="Bracket / Draw"
            body="Build the draw here: checked-in players, bracket size, byes, race-assignment preview, and Generate Bracket. Arriving in the next update."
          />
        );
      case "review":
        return renderReview();
      case "matches":
        return (
          <TabPlaceholder
            locked={false}
            title="Matches"
            body="Live matches, scores, and TD controls. Full live scoring arrives in the Phase 2 engine."
          />
        );
      case "results":
        return (
          <TabPlaceholder
            locked={false}
            title="Results"
            body="Final placements and payouts appear here after play completes (Phase 3)."
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
                Please finish {TAB_LABELS[gatePrompt.blocking]} before moving to{" "}
                {TAB_LABELS[gatePrompt.target]}.
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
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
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

      {/* Tabs */}
      <View style={styles.tabBarWrap}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabBar}
        >
          {visibleTabs(hub.phase).map((tab) => {
            const active = tab === activeTab;
            return (
              <TouchableOpacity
                key={tab}
                style={[styles.tab, active && styles.tabActive]}
                onPress={() => handleTabPress(tab)}
              >
                <Text
                  allowFontScaling={false}
                  style={[styles.tabText, active && styles.tabTextActive]}
                >
                  {TAB_LABELS[tab]}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

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

      {/* Fixed footer: Close Registration stays pinned while the list scrolls */}
      {activeTab === "players" && hub.liveState === "registration_open" && (
        <View style={styles.playersFooter}>
          <TouchableOpacity
            style={[styles.lockBtn, styles.lockBtnFooter]}
            onPress={handleCloseRegistration}
          >
            <Text allowFontScaling={false} style={styles.lockBtnText}>
              Close Registration / Lock Players
            </Text>
          </TouchableOpacity>
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

  // Tabs
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
    paddingHorizontal: webSc(SPACING.md),
    paddingVertical: webSc(SPACING.sm),
    borderRadius: webSc(RADIUS.full),
    backgroundColor: COLORS.background,
  },
  tabActive: { backgroundColor: COLORS.primary },
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
    paddingHorizontal: webSc(SPACING.md),
    paddingTop: webSc(SPACING.sm),
    paddingBottom: Platform.OS === "ios" ? webSc(SPACING.lg) : webSc(SPACING.md),
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    backgroundColor: COLORS.surface,
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
  tableStatusRow: {
    flexDirection: "row",
    gap: webSc(SPACING.xs),
    marginBottom: webSc(SPACING.xs),
  },
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
