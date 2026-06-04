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
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
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
  TournamentFormat,
} from "../../../../src/models/types/common.types";
import { Profile } from "../../../../src/models/types/profile.types";
import { Registration } from "../../../../src/models/types/registration.types";
import { Tournament } from "../../../../src/models/types/tournament.types";
import {
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
  | "matches"
  | "bracket"
  | "results";

const TABS: { key: TabKey; label: string }[] = [
  { key: "settings", label: "Settings" },
  { key: "players", label: "Players" },
  { key: "tables", label: "Tables" },
  { key: "matches", label: "Matches" },
  { key: "bracket", label: "Bracket" },
  { key: "results", label: "Results" },
];

// Matches/Bracket unlock at Running; Results at Running or later.
const tabEnabled = (key: TabKey, phase: ManagePhase): boolean => {
  if (key === "matches" || key === "bracket") return phase === "running";
  if (key === "results") return phase === "running" || phase === "completed";
  return true; // settings / players / tables
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
const NEEDS_APPROVAL: RegistrationStatus[] = ["preregistered", "queued"];

const getRegStatusColor = (status: RegistrationStatus): string => {
  switch (status) {
    case "approved":
      return COLORS.success;
    case "checked_in":
      return COLORS.primary;
    case "preregistered":
    case "queued":
      return COLORS.textSecondary;
    case "no_show":
    case "cancelled":
      return COLORS.error;
    default:
      return COLORS.textSecondary;
  }
};

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
  raceWinners: string;
  raceLosers: string;
  raceFinals: string;
  sidePots: SidePotForm[];
  bracketSize: string;
  maxPlayers: string;
  tableCount: string;
  qrCheckIn: boolean;
  spectatorView: boolean;
  liveBracket: boolean;
  autoAdvanceWinners: boolean;
  autoAssignTables: boolean;
  autoGenerateNextRound: boolean;
  matchTimer: boolean;
  raceMode: RaceMode;
  raceGroups: RaceGroupForm[];
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
    startTime: t.start_time ?? "",
    raceWinners: numStr(ls.fixedRaceWinners ?? parseRaceNumber(t.race)),
    raceLosers: numStr(ls.fixedRaceLosers),
    raceFinals: numStr(ls.fixedRaceFinals),
    sidePots: (t.side_pots ?? []).map((p) => ({
      name: p.name ?? "",
      amount: numStr(p.amount as number),
    })),
    bracketSize: numStr(ls.bracketSize),
    maxPlayers: numStr(ls.maxPlayers),
    tableCount: numStr(ls.tableCount),
    qrCheckIn: !!ls.qrCheckIn,
    spectatorView: !!ls.spectatorView,
    liveBracket: !!ls.liveBracket,
    autoAdvanceWinners: !!ls.autoAdvanceWinners,
    autoAssignTables: !!ls.autoAssignTables,
    autoGenerateNextRound: !!ls.autoGenerateNextRound,
    matchTimer: !!ls.matchTimer,
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
  const winners = intOrNull(f.raceWinners);
  const losers = intOrNull(f.raceLosers);
  const finals = intOrNull(f.raceFinals);
  const hasLosers = formatHasLosersSide(f.tournamentFormat);
  // Keep the legacy `race` text column readable for cards/detail. In fixed mode
  // it summarises the per-bracket races; in groups mode it's left untouched.
  const fixedSummary = [
    winners != null
      ? hasLosers
        ? `Winners ${winners}`
        : `Race to ${winners}`
      : null,
    hasLosers && losers != null ? `Losers ${losers}` : null,
    finals != null ? `Finals ${finals}` : null,
  ]
    .filter(Boolean)
    .join(" / ");

  return {
  name: f.name.trim(),
  game_type: f.gameType as GameType,
  tournament_format: f.tournamentFormat as TournamentFormat,
  game_spot: f.gameSpot.trim(),
  race: f.raceMode === "fixed" ? fixedSummary : f.race.trim(),
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
    bracketSize: intOrNull(f.bracketSize),
    maxPlayers: intOrNull(f.maxPlayers),
    tableCount: intOrNull(f.tableCount),
    qrCheckIn: f.qrCheckIn,
    spectatorView: f.spectatorView,
    liveBracket: f.liveBracket,
    autoAdvanceWinners: f.autoAdvanceWinners,
    autoAssignTables: f.autoAssignTables,
    autoGenerateNextRound: f.autoGenerateNextRound,
    matchTimer: f.matchTimer,
    raceMode: f.raceMode,
    fixedRaceWinners: winners,
    fixedRaceLosers: hasLosers ? losers : null,
    fixedRaceFinals: finals,
    raceGroups: f.raceGroups.map((g) => ({
      id: g.id,
      label: g.label.trim(),
      minFargo: intOrNull(g.minFargo) ?? 0,
      maxFargo: intOrNull(g.maxFargo) ?? 0,
      raceTo: intOrNull(g.raceTo) ?? 0,
    })),
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
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  keyboardType?: "default" | "numeric" | "decimal-pad" | "phone-pad";
  multiline?: boolean;
}) => (
  <View style={styles.field}>
    <Text allowFontScaling={false} style={styles.fieldLabel}>
      {label}
    </Text>
    <TextInput
      allowFontScaling={false}
      style={[styles.input, multiline && styles.inputMultiline]}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={COLORS.textMuted}
      keyboardType={keyboardType ?? "default"}
      multiline={multiline}
    />
  </View>
);

const FieldLabel = ({ label }: { label: string }) => (
  <Text allowFontScaling={false} style={styles.fieldLabel}>
    {label}
  </Text>
);

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

// ── Registration Row ─────────────────────────────────────────────────────────
const RegistrationRow = ({
  registration,
  onApprove,
  onCheckIn,
  onNoShow,
  onRemove,
  isProcessing,
}: {
  registration: Registration;
  onApprove: () => void;
  onCheckIn: () => void;
  onNoShow: () => void;
  onRemove: () => void;
  isProcessing: boolean;
}) => {
  const statusColor = getRegStatusColor(registration.status);
  const isGuest = !registration.player_id;
  const needsApproval = NEEDS_APPROVAL.includes(registration.status);
  const canCheckIn = registration.status === "approved";
  const isClosed =
    registration.status === "cancelled" || registration.status === "no_show";
  const fargo = registration.fargo_rating;

  return (
    <View style={styles.regCard}>
      <View style={styles.regMain}>
        <View style={styles.nameRow}>
          <Text
            allowFontScaling={false}
            style={styles.playerName}
            numberOfLines={1}
          >
            {getDisplayName(registration)}
          </Text>
          {isGuest ? (
            <View style={styles.guestTag}>
              <Text allowFontScaling={false} style={styles.guestTagText}>
                Guest
              </Text>
            </View>
          ) : (
            registration.profiles && (
              <Text allowFontScaling={false} style={styles.playerId}>
                #{registration.profiles.id_auto}
              </Text>
            )
          )}
        </View>
        <View style={styles.regMeta}>
          <Text allowFontScaling={false} style={styles.fargoText}>
            {fargo != null ? `Fargo ${fargo}` : "No Fargo"}
          </Text>
          <View
            style={[
              styles.statusBadge,
              { backgroundColor: statusColor + "20" },
            ]}
          >
            <Text
              allowFontScaling={false}
              style={[styles.statusText, { color: statusColor }]}
            >
              {registration.status.replace("_", " ")}
            </Text>
          </View>
        </View>
      </View>

      {!isClosed && (
        <View style={styles.regActions}>
          {needsApproval && (
            <TouchableOpacity
              style={[styles.regActionBtn, styles.approveBtn]}
              onPress={onApprove}
              disabled={isProcessing}
            >
              <Text allowFontScaling={false} style={styles.approveBtnText}>
                {isProcessing ? "..." : "Approve"}
              </Text>
            </TouchableOpacity>
          )}
          {canCheckIn && (
            <TouchableOpacity
              style={[styles.regActionBtn, styles.checkInBtn]}
              onPress={onCheckIn}
              disabled={isProcessing}
            >
              <Text allowFontScaling={false} style={styles.checkInBtnText}>
                {isProcessing ? "..." : "Check In"}
              </Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[styles.regActionBtn, styles.noShowBtn]}
            onPress={onNoShow}
            disabled={isProcessing}
          >
            <Text allowFontScaling={false} style={styles.noShowBtnText}>
              No Show
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.regActionBtn, styles.removeBtn]}
            onPress={onRemove}
            disabled={isProcessing}
          >
            <Text allowFontScaling={false} style={styles.removeBtnText}>
              Remove
            </Text>
          </TouchableOpacity>
        </View>
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
  const [checkedInFilter, setCheckedInFilter] = useState<
    "all" | "checked" | "unchecked"
  >("all");

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

  const handleApprove = (r: Registration) =>
    withProcessing(r.id, () => hub.approve(r.id), "Failed to approve.");
  const handleCheckIn = (r: Registration) =>
    withProcessing(r.id, () => hub.checkIn(r.id), "Failed to check in.");

  const handleNoShow = (r: Registration) =>
    Alert.alert("Mark No-Show", `Mark ${getDisplayName(r)} as a no-show?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Mark No-Show",
        style: "destructive",
        onPress: () =>
          withProcessing(r.id, () => hub.markNoShow(r.id), "Failed to mark no-show."),
      },
    ]);

  const handleRemove = (r: Registration) =>
    Alert.alert("Remove Player", `Remove ${getDisplayName(r)} from this tournament?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: () =>
          withProcessing(
            r.id,
            // TD "remove" = soft-cancel the registration row.
            () => hub.updateRegistration({ id: r.id, updates: { status: "cancelled" } }),
            "Failed to remove player.",
          ),
      },
    ]);

  // ---- Derived player lists ----------------------------------------------
  const activeRegs = useMemo(
    () => hub.registrations.filter((r) => r.status !== "cancelled"),
    [hub.registrations],
  );
  const filteredRegs = useMemo(() => {
    const q = playerSearch.trim().toLowerCase();
    return activeRegs.filter((r) => {
      if (checkedInFilter === "checked" && r.status !== "checked_in") return false;
      if (checkedInFilter === "unchecked" && r.status === "checked_in") return false;
      if (q && !getDisplayName(r).toLowerCase().includes(q)) return false;
      return true;
    });
  }, [activeRegs, playerSearch, checkedInFilter]);

  const checkedInCount = activeRegs.filter((r) => r.status === "checked_in").length;
  const bracketSize = hub.tournament?.live_settings?.bracketSize ?? null;
  const onlineCap = bracketSize ? Math.floor(bracketSize * 0.75) : null;

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

        <Section title="Race">
          <View style={styles.segmentRow}>
            {(["fixed", "groups"] as RaceMode[]).map((mode) => (
              <TouchableOpacity
                key={mode}
                style={[
                  styles.segment,
                  form.raceMode === mode && styles.segmentActive,
                ]}
                onPress={() => patchForm({ raceMode: mode })}
              >
                <Text
                  allowFontScaling={false}
                  style={[
                    styles.segmentText,
                    form.raceMode === mode && styles.segmentTextActive,
                  ]}
                >
                  {mode === "fixed" ? "Fixed Race" : "A/B/C Race Groups"}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {form.raceMode === "fixed" ? (
            <View>
              <LabeledInput
                label={
                  formatHasLosersSide(form.tournamentFormat)
                    ? "Winners side race to"
                    : "Single Elimination race to"
                }
                value={form.raceWinners}
                onChangeText={(v) => patchForm({ raceWinners: v })}
                placeholder="e.g., 7"
                keyboardType="numeric"
              />
              {formatHasLosersSide(form.tournamentFormat) && (
                <LabeledInput
                  label="Losers side race to"
                  value={form.raceLosers}
                  onChangeText={(v) => patchForm({ raceLosers: v })}
                  placeholder="e.g., 5"
                  keyboardType="numeric"
                />
              )}
              <LabeledInput
                label="Finals race to"
                value={form.raceFinals}
                onChangeText={(v) => patchForm({ raceFinals: v })}
                placeholder="e.g., 9"
                keyboardType="numeric"
              />
              {!formatHasLosersSide(form.tournamentFormat) && (
                <Text allowFontScaling={false} style={styles.hint}>
                  Single elimination has no losers bracket.
                </Text>
              )}
            </View>
          ) : (
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
            </View>
          )}
        </Section>

        <Section title="Fargo">
          <LabeledInput
            label="Maximum Fargo"
            value={form.maxFargo}
            onChangeText={(v) => patchForm({ maxFargo: v })}
            placeholder="e.g., 550 (blank = open)"
            keyboardType="numeric"
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
          />
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

        <Section title="Capacity & Tables">
          <LabeledInput
            label="Bracket Size"
            value={form.bracketSize}
            onChangeText={(v) => patchForm({ bracketSize: v })}
            placeholder="Blank = unlimited"
            keyboardType="numeric"
          />
          <LabeledInput
            label="Max Players"
            value={form.maxPlayers}
            onChangeText={(v) => patchForm({ maxPlayers: v })}
            placeholder="Blank = unlimited"
            keyboardType="numeric"
          />
          <LabeledInput
            label="Table Count"
            value={form.tableCount}
            onChangeText={(v) => patchForm({ tableCount: v })}
            placeholder="e.g., 8"
            keyboardType="numeric"
          />
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

        <Section title="Live Features">
          <ToggleSwitch
            label="QR Check-In"
            value={form.qrCheckIn}
            onValueChange={(v) => patchForm({ qrCheckIn: v })}
          />
          <ToggleSwitch
            label="Spectator View"
            value={form.spectatorView}
            onValueChange={(v) => patchForm({ spectatorView: v })}
          />
          <ToggleSwitch
            label="Live Bracket / View Tournament"
            value={form.liveBracket}
            onValueChange={(v) => patchForm({ liveBracket: v })}
          />
          <ToggleSwitch
            label="Auto-Advance Winners"
            value={form.autoAdvanceWinners}
            onValueChange={(v) => patchForm({ autoAdvanceWinners: v })}
          />
          <ToggleSwitch
            label="Auto-Assign Tables"
            value={form.autoAssignTables}
            onValueChange={(v) => patchForm({ autoAssignTables: v })}
          />
          <ToggleSwitch
            label="Auto-Generate Next Round"
            value={form.autoGenerateNextRound}
            onValueChange={(v) => patchForm({ autoGenerateNextRound: v })}
          />
          <ToggleSwitch
            label="Match Timer"
            value={form.matchTimer}
            onValueChange={(v) => patchForm({ matchTimer: v })}
          />
          <Text allowFontScaling={false} style={styles.hint}>
            Some live features activate when the tournament is running.
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

  const renderPlayers = () => (
    <View>
      <View style={styles.playersTopRow}>
        <View style={styles.countPills}>
          <Text allowFontScaling={false} style={styles.countPill}>
            {activeRegs.length} registered
          </Text>
          <Text allowFontScaling={false} style={styles.countPill}>
            {checkedInCount} checked in
          </Text>
          {onlineCap != null && (
            <Text allowFontScaling={false} style={styles.countPill}>
              online cap {onlineCap}
            </Text>
          )}
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
          placeholder="Filter registered players..."
          placeholderTextColor={COLORS.textMuted}
          value={playerSearch}
          onChangeText={setPlayerSearch}
        />
      </View>

      <View style={styles.segmentRow}>
        {(
          [
            { key: "all", label: "All" },
            { key: "unchecked", label: "Not Checked In" },
            { key: "checked", label: "Checked In" },
          ] as { key: "all" | "checked" | "unchecked"; label: string }[]
        ).map((opt) => (
          <TouchableOpacity
            key={opt.key}
            style={[
              styles.segment,
              checkedInFilter === opt.key && styles.segmentActive,
            ]}
            onPress={() => setCheckedInFilter(opt.key)}
          >
            <Text
              allowFontScaling={false}
              style={[
                styles.segmentText,
                checkedInFilter === opt.key && styles.segmentTextActive,
              ]}
            >
              {opt.label}
            </Text>
          </TouchableOpacity>
        ))}
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
            onApprove={() => handleApprove(item)}
            onCheckIn={() => handleCheckIn(item)}
            onNoShow={() => handleNoShow(item)}
            onRemove={() => handleRemove(item)}
            isProcessing={processingId === item.id}
          />
        ))
      )}
    </View>
  );

  const renderTab = () => {
    switch (activeTab) {
      case "settings":
        return renderSettings();
      case "players":
        return renderPlayers();
      case "tables":
        return (
          <TabPlaceholder
            locked={false}
            title="Tables"
            body="Add tables one at a time or in bulk (e.g. 1-15), set Available / In Use / Unavailable, and flag a streaming table with a stream link. UI lands next; the data layer is ready."
          />
        );
      case "matches":
        return (
          <TabPlaceholder
            locked={hub.phase !== "running"}
            title="Matches"
            body="Live matches, scores, and TD controls appear here once the tournament is running (Phase 2)."
          />
        );
      case "bracket":
        return (
          <TabPlaceholder
            locked={hub.phase !== "running"}
            title="Bracket"
            body="The single / double elimination bracket appears here once the tournament is running (Phase 2)."
          />
        );
      case "results":
        return (
          <TabPlaceholder
            locked={hub.phase !== "running" && hub.phase !== "completed"}
            title="Results"
            body="Final placements and payouts appear here after play begins (Phase 3)."
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
          {TABS.map((tab) => {
            const active = tab.key === activeTab;
            const enabled = tabEnabled(tab.key, hub.phase);
            return (
              <TouchableOpacity
                key={tab.key}
                style={[styles.tab, active && styles.tabActive]}
                onPress={() => setActiveTab(tab.key)}
              >
                <Text
                  allowFontScaling={false}
                  style={[
                    styles.tabText,
                    active && styles.tabTextActive,
                    !enabled && styles.tabTextLocked,
                  ]}
                >
                  {tab.label}
                  {!enabled ? ` ${GLYPH.lock}` : ""}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, isWeb && styles.contentWeb]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {renderTab()}
      </ScrollView>
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
    paddingVertical: webSc(SPACING.sm),
    paddingHorizontal: webSc(SPACING.md),
    borderRadius: webSc(RADIUS.sm),
    borderWidth: 1,
    alignItems: "center",
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
