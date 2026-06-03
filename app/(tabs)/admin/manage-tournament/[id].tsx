// app/(tabs)/admin/manage-tournament/[id].tsx
// "Manage Tournament" command-center hub. Reached by tapping a tournament card
// in tournament-director-manager.tsx. Local-state segmented tabs (no deep nav):
// Overview | Players | Tables | Matches | Bracket | Results.
//
// Players tab folds in the AddPlayerModal + RegistrationRow that previously
// lived in app/(tabs)/admin/manage-players/[id].tsx (now retired). Emoji are
// written as Unicode escapes (the old file's literals were encoding-corrupted).

import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
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
  RegistrationStatus,
  TournamentLiveState,
} from "../../../../src/models/types/common.types";
import { Profile } from "../../../../src/models/types/profile.types";
import { Registration } from "../../../../src/models/types/registration.types";
import { usePlayerSearch } from "../../../../src/viewmodels/hooks/use.player.search";
import { useManageTournament } from "../../../../src/viewmodels/hooks/use.manage.tournament";
import { EmptyState } from "../../../../src/views/components/dashboard/empty-state";

const isWeb = Platform.OS === "web";

// Unicode-escaped glyphs (raw emoji in the source corrupt under our toolchain).
const GLYPH = {
  back: "\u2190", // left arrow
  search: "\uD83D\uDD0D", // magnifying glass
  add: "\u2795", // heavy plus
  check: "\u2713", // check mark
  people: "\uD83D\uDC65", // busts in silhouette
  table: "\uD83C\uDFB1", // billiards
  bracket: "\uD83C\uDF1F", // glowing star
  trophy: "\uD83C\uDFC6", // trophy
  clipboard: "\uD83D\uDCCB", // clipboard
  pause: "\u23F8", // pause symbol
  play: "\u25B6", // play triangle
};

type TabKey =
  | "overview"
  | "players"
  | "tables"
  | "matches"
  | "bracket"
  | "results";

const TABS: { key: TabKey; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "players", label: "Players" },
  { key: "tables", label: "Tables" },
  { key: "matches", label: "Matches" },
  { key: "bracket", label: "Bracket" },
  { key: "results", label: "Results" },
];

// ── Live-state presentation ─────────────────────────────────────────────────
const LIVE_STATE_META: Record<
  TournamentLiveState,
  { label: string; color: string }
> = {
  not_started: { label: "Not Started", color: COLORS.textMuted },
  registration_open: { label: "Registration Open", color: COLORS.success },
  registration_closed: { label: "Registration Closed", color: COLORS.warning },
  in_progress: { label: "In Progress", color: COLORS.primary },
  finished: { label: "Finished", color: COLORS.textSecondary },
};

// ── Registration presentation ───────────────────────────────────────────────
const NEEDS_APPROVAL: RegistrationStatus[] = ["preregistered", "queued"];

const getStatusColor = (status: RegistrationStatus): string => {
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

const getDisplayName = (registration: Registration): string => {
  if (registration.player_id && registration.profiles) {
    return registration.profiles.name || registration.profiles.user_name;
  }
  return registration.guest_name || "Unnamed guest";
};

const formatStart = (date?: string, time?: string): string => {
  if (!date) return "—";
  const [y, m, d] = date.split("-").map(Number);
  const label = new Date(y, m - 1, d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
  if (!time) return label;
  const [hRaw, min] = time.split(":");
  const hour = parseInt(hRaw, 10);
  const ampm = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 || 12;
  return `${label}, ${hour12}:${min} ${ampm}`;
};

// ── Add Player Modal (folded from manage-players/[id].tsx) ───────────────────
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
              <Text allowFontScaling={false} style={styles.modalLabel}>
                Guest Name *
              </Text>
              <TextInput
                style={styles.modalInput}
                placeholder="Enter guest name..."
                placeholderTextColor={COLORS.textSecondary}
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
                  placeholderTextColor={COLORS.textSecondary}
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
                        @{profile.user_name} {"·"} #{profile.id_auto}
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

// ── Registration Row (folded + expanded TD actions) ─────────────────────────
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
  const statusColor = getStatusColor(registration.status);
  const isGuest = !registration.player_id;
  const needsApproval = NEEDS_APPROVAL.includes(registration.status);
  const canCheckIn = registration.status === "approved";
  const isClosed =
    registration.status === "cancelled" || registration.status === "no_show";

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
        <View
          style={[styles.statusBadge, { backgroundColor: statusColor + "20" }]}
        >
          <Text
            allowFontScaling={false}
            style={[styles.statusText, { color: statusColor }]}
          >
            {registration.status.replace("_", " ")}
          </Text>
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
                {isProcessing ? "..." : `${GLYPH.check} Approve`}
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

// ── Generic metric card ──────────────────────────────────────────────────────
const MetricCard = ({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) => (
  <View style={styles.metricCard}>
    <Text allowFontScaling={false} style={styles.metricValue} numberOfLines={1}>
      {value}
    </Text>
    <Text allowFontScaling={false} style={styles.metricLabel} numberOfLines={2}>
      {label}
    </Text>
  </View>
);

// ── Placeholder for not-yet-built tabs ───────────────────────────────────────
const TabPlaceholder = ({
  glyph,
  title,
  body,
}: {
  glyph: string;
  title: string;
  body: string;
}) => (
  <View style={styles.placeholder}>
    <Text allowFontScaling={false} style={styles.placeholderGlyph}>
      {glyph}
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
  const [activeTab, setActiveTab] = useState<TabKey>("overview");

  const [addModalVisible, setAddModalVisible] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [processingId, setProcessingId] = useState<number | null>(null);

  const tournamentName = hub.tournament?.name || paramName || "Tournament";
  const stateMeta = LIVE_STATE_META[hub.liveState];

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

  const handleApprove = async (registration: Registration) => {
    setProcessingId(registration.id);
    try {
      await hub.approve(registration.id);
    } catch {
      Alert.alert("Error", "Failed to approve registration.");
    } finally {
      setProcessingId(null);
    }
  };

  const handleCheckIn = async (registration: Registration) => {
    setProcessingId(registration.id);
    try {
      await hub.checkIn(registration.id);
    } catch {
      Alert.alert("Error", "Failed to check the player in.");
    } finally {
      setProcessingId(null);
    }
  };

  const handleNoShow = (registration: Registration) => {
    Alert.alert(
      "Mark No-Show",
      `Mark ${getDisplayName(registration)} as a no-show?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Mark No-Show",
          style: "destructive",
          onPress: async () => {
            setProcessingId(registration.id);
            try {
              await hub.markNoShow(registration.id);
            } catch {
              Alert.alert("Error", "Failed to mark no-show.");
            } finally {
              setProcessingId(null);
            }
          },
        },
      ],
    );
  };

  const handleRemove = (registration: Registration) => {
    Alert.alert(
      "Remove Player",
      `Remove ${getDisplayName(registration)} from this tournament?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            setProcessingId(registration.id);
            try {
              // TD "remove" = soft-cancel the registration row.
              await hub.updateRegistration({
                id: registration.id,
                updates: { status: "cancelled" },
              });
            } catch {
              Alert.alert("Error", "Failed to remove player.");
            } finally {
              setProcessingId(null);
            }
          },
        },
      ],
    );
  };

  // ---- Quick-action handlers (Overview) -----------------------------------

  const runLive = async (fn: () => Promise<unknown>, errorMsg: string) => {
    try {
      await fn();
    } catch {
      Alert.alert("Error", errorMsg);
    }
  };

  const confirmThen = (
    title: string,
    message: string,
    confirmLabel: string,
    fn: () => void,
  ) =>
    Alert.alert(title, message, [
      { text: "Cancel", style: "cancel" },
      { text: confirmLabel, onPress: fn },
    ]);

  const handleStart = () =>
    confirmThen(
      "Start Tournament",
      "Confirm you want to start. Any later changes will notify all players.",
      "Start",
      () => runLive(hub.start, "Failed to start the tournament."),
    );

  const handleComplete = () =>
    confirmThen(
      "Complete Tournament",
      "Mark the live tournament as finished?",
      "Complete",
      () => runLive(hub.complete, "Failed to complete the tournament."),
    );

  const handleGenerateBracket = () =>
    Alert.alert(
      "Generate Bracket",
      "Bracket generation arrives in Phase 2 (the live engine). This button is a placeholder for now.",
    );

  // ---- Tab content --------------------------------------------------------

  const renderOverview = () => {
    const quickActions: {
      label: string;
      onPress: () => void;
      kind?: "primary" | "neutral" | "danger";
    }[] = [];

    if (hub.liveState === "not_started") {
      quickActions.push({
        label: "Open Registration",
        onPress: () =>
          runLive(hub.openRegistration, "Failed to open registration."),
        kind: "primary",
      });
    }
    if (hub.liveState === "registration_open") {
      quickActions.push({
        label: "Close Registration",
        onPress: () =>
          runLive(hub.closeRegistration, "Failed to close registration."),
        kind: "neutral",
      });
    }
    if (hub.liveState === "registration_closed") {
      quickActions.push({
        label: "Start Tournament",
        onPress: handleStart,
        kind: "primary",
      });
    }
    if (hub.liveState === "in_progress") {
      quickActions.push({
        label: "Generate Bracket",
        onPress: handleGenerateBracket,
        kind: "neutral",
      });
      quickActions.push(
        hub.isPaused
          ? {
              label: `${GLYPH.play} Resume`,
              onPress: () => runLive(hub.resume, "Failed to resume."),
              kind: "primary",
            }
          : {
              label: `${GLYPH.pause} Pause`,
              onPress: () => runLive(hub.pause, "Failed to pause."),
              kind: "neutral",
            },
      );
      quickActions.push({
        label: "Complete",
        onPress: handleComplete,
        kind: "danger",
      });
    }

    const dash = (v: number | null) => (v === null ? "—" : String(v));

    return (
      <View>
        <View style={styles.stateRow}>
          <View
            style={[
              styles.stateBadge,
              { backgroundColor: stateMeta.color + "20" },
            ]}
          >
            <Text
              allowFontScaling={false}
              style={[styles.stateBadgeText, { color: stateMeta.color }]}
            >
              {stateMeta.label}
            </Text>
          </View>
          {hub.isPaused && (
            <View
              style={[
                styles.stateBadge,
                { backgroundColor: COLORS.warning + "20" },
              ]}
            >
              <Text
                allowFontScaling={false}
                style={[styles.stateBadgeText, { color: COLORS.warning }]}
              >
                {GLYPH.pause} Paused
              </Text>
            </View>
          )}
        </View>

        <View style={styles.metricGrid}>
          <MetricCard label="Registered" value={hub.metrics.registered} />
          <MetricCard label="Checked In" value={hub.metrics.checkedIn} />
          <MetricCard
            label="Active Matches"
            value={dash(hub.metrics.activeMatches)}
          />
          <MetricCard
            label="Waiting Matches"
            value={dash(hub.metrics.waitingMatches)}
          />
          <MetricCard
            label="Tables Available"
            value={dash(hub.metrics.availableTables)}
          />
          <MetricCard
            label="Tables Unavailable"
            value={dash(hub.metrics.unavailableTables)}
          />
          <MetricCard label="Current Round" value={hub.metrics.currentRound} />
          <MetricCard
            label="Start"
            value={formatStart(
              hub.tournament?.tournament_date,
              hub.tournament?.start_time,
            )}
          />
        </View>

        <Text allowFontScaling={false} style={styles.sectionTitle}>
          Quick Actions
        </Text>
        {quickActions.length === 0 ? (
          <Text allowFontScaling={false} style={styles.noActions}>
            No actions available in this state.
          </Text>
        ) : (
          <View style={styles.actionsWrap}>
            {quickActions.map((a) => (
              <TouchableOpacity
                key={a.label}
                style={[
                  styles.actionBtn,
                  a.kind === "primary" && styles.actionBtnPrimary,
                  a.kind === "danger" && styles.actionBtnDanger,
                ]}
                onPress={a.onPress}
                disabled={hub.isMutatingLive}
              >
                <Text
                  allowFontScaling={false}
                  style={[
                    styles.actionBtnText,
                    a.kind === "primary" && styles.actionBtnTextOnFill,
                    a.kind === "danger" && styles.actionBtnTextOnFill,
                  ]}
                >
                  {a.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
        {hub.isMutatingLive && (
          <ActivityIndicator
            style={{ marginTop: webSc(SPACING.md) }}
            color={COLORS.primary}
          />
        )}
      </View>
    );
  };

  const renderPlayers = () => (
    <View>
      <TouchableOpacity
        style={styles.addButton}
        onPress={() => setAddModalVisible(true)}
      >
        <Text allowFontScaling={false} style={styles.addButtonText}>
          {GLYPH.add} Add Player
        </Text>
      </TouchableOpacity>

      {hub.registrationsLoading ? (
        <View style={styles.centerBlock}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text allowFontScaling={false} style={styles.loadingText}>
            Loading players...
          </Text>
        </View>
      ) : hub.registrations.length === 0 ? (
        <EmptyState
          message="No players registered yet"
          submessage="Tap Add Player to register someone."
        />
      ) : (
        hub.registrations.map((item) => (
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
      case "overview":
        return renderOverview();
      case "players":
        return renderPlayers();
      case "tables":
        return (
          <TabPlaceholder
            glyph={GLYPH.table}
            title="Tables"
            body="Add and assign playing tables here. Table status drives the Overview metrics. Full table management lands with the live engine (Phase 2)."
          />
        );
      case "matches":
        return (
          <TabPlaceholder
            glyph={GLYPH.people}
            title="Matches"
            body="Live matches, scores, and TD controls (forfeit, complete early, pause) will appear here once the engine is built (Phase 2)."
          />
        );
      case "bracket":
        return (
          <TabPlaceholder
            glyph={GLYPH.bracket}
            title="Bracket"
            body="The single- and double-elimination bracket view goes here. Generated from approved players with a random draw (Phase 2)."
          />
        );
      case "results":
        return (
          <TabPlaceholder
            glyph={GLYPH.trophy}
            title="Results"
            body="Final placements and payouts will be shown here, derived from elimination order (Phase 3)."
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
          <Text allowFontScaling={false} style={styles.headerSubtitle}>
            {GLYPH.clipboard} Manage Tournament
          </Text>
        </View>
        <View style={styles.placeholderSpace} />
      </View>

      {/* Segmented tabs */}
      <View style={styles.tabBarWrap}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabBar}
        >
          {TABS.map((tab) => {
            const active = tab.key === activeTab;
            return (
              <TouchableOpacity
                key={tab.key}
                style={[styles.tab, active && styles.tabActive]}
                onPress={() => setActiveTab(tab.key)}
              >
                <Text
                  allowFontScaling={false}
                  style={[styles.tabText, active && styles.tabTextActive]}
                >
                  {tab.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.content,
          isWeb && styles.contentWeb,
        ]}
        showsVerticalScrollIndicator={false}
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
  headerCenter: { alignItems: "center", flex: 1, marginHorizontal: webSc(SPACING.sm) },
  headerTitle: {
    fontSize: webMs(FONT_SIZES.lg),
    fontWeight: "700",
    color: COLORS.text,
  },
  headerSubtitle: {
    fontSize: webMs(FONT_SIZES.xs),
    color: COLORS.textSecondary,
    marginTop: webSc(2),
  },
  placeholderSpace: { width: webSc(50) },

  // Tab bar
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

  // Content shell
  content: {
    padding: webSc(SPACING.md),
    paddingBottom: webSc(SPACING.xl * 2),
  },
  contentWeb: { alignItems: "stretch" },

  // Overview — state badges
  stateRow: {
    flexDirection: "row",
    gap: webSc(SPACING.sm),
    marginBottom: webSc(SPACING.md),
  },
  stateBadge: {
    paddingHorizontal: webSc(SPACING.md),
    paddingVertical: webSc(SPACING.xs),
    borderRadius: webSc(RADIUS.full),
  },
  stateBadgeText: { fontSize: webMs(FONT_SIZES.sm), fontWeight: "700" },

  // Overview — metric grid
  metricGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: webSc(SPACING.sm),
  },
  metricCard: {
    flexGrow: 1,
    flexBasis: "47%",
    backgroundColor: COLORS.surface,
    borderRadius: webSc(RADIUS.md),
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: webSc(SPACING.md),
  },
  metricValue: {
    fontSize: webMs(FONT_SIZES.xxl),
    fontWeight: "700",
    color: COLORS.text,
  },
  metricLabel: {
    fontSize: webMs(FONT_SIZES.xs),
    color: COLORS.textSecondary,
    marginTop: webSc(2),
  },

  sectionTitle: {
    fontSize: webMs(FONT_SIZES.md),
    fontWeight: "700",
    color: COLORS.text,
    marginTop: webSc(SPACING.lg),
    marginBottom: webSc(SPACING.sm),
  },
  noActions: {
    fontSize: webMs(FONT_SIZES.sm),
    color: COLORS.textSecondary,
    fontStyle: "italic",
  },
  actionsWrap: { flexDirection: "row", flexWrap: "wrap", gap: webSc(SPACING.sm) },
  actionBtn: {
    flexGrow: 1,
    flexBasis: "47%",
    paddingVertical: webSc(SPACING.md),
    borderRadius: webSc(RADIUS.md),
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  actionBtnPrimary: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  actionBtnDanger: { backgroundColor: COLORS.error, borderColor: COLORS.error },
  actionBtnText: {
    fontSize: webMs(FONT_SIZES.sm),
    fontWeight: "700",
    color: COLORS.text,
  },
  actionBtnTextOnFill: { color: COLORS.white },

  // Players — add button
  addButton: {
    backgroundColor: COLORS.primary,
    borderRadius: webSc(RADIUS.sm),
    paddingVertical: webSc(SPACING.md),
    alignItems: "center",
    justifyContent: "center",
    marginBottom: webSc(SPACING.md),
  },
  addButtonText: {
    color: COLORS.white,
    fontSize: webMs(FONT_SIZES.md),
    fontWeight: "700",
  },

  // Players — registration row
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
    alignSelf: "flex-start",
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

  // Placeholders
  placeholder: { alignItems: "center", paddingVertical: webSc(SPACING.xl * 2) },
  placeholderGlyph: { fontSize: webMs(48), marginBottom: webSc(SPACING.md) },
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

  // Add Player modal
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
  modalLabel: {
    fontSize: webMs(FONT_SIZES.sm),
    color: COLORS.text,
    marginBottom: webSc(SPACING.xs),
    fontWeight: "500",
  },
  modalHint: {
    fontSize: webMs(FONT_SIZES.xs),
    color: COLORS.textSecondary,
    marginTop: webSc(SPACING.xs),
    fontStyle: "italic",
  },
  modalInput: {
    backgroundColor: COLORS.background,
    borderRadius: webSc(RADIUS.sm),
    padding: webSc(SPACING.sm),
    fontSize: webMs(FONT_SIZES.sm),
    color: COLORS.text,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  searchInputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.background,
    borderRadius: webSc(RADIUS.sm),
    paddingHorizontal: webSc(SPACING.sm),
    borderWidth: 1,
    borderColor: COLORS.border,
    height: webSc(40),
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
