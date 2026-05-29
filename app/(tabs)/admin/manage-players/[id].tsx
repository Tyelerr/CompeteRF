import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
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
import { SPACING } from "../../../../src/theme/spacing";
import { FONT_SIZES } from "../../../../src/theme/typography";
import { moderateScale, scale } from "../../../../src/utils/scaling";
import { usePlayerSearch } from "../../../../src/viewmodels/hooks/use.player.search";
import { useRegistrations } from "../../../../src/viewmodels/hooks/use.registrations";
import { Registration } from "../../../../src/models/types/registration.types";
import { RegistrationStatus } from "../../../../src/models/types/common.types";
import { Profile } from "../../../../src/models/types/profile.types";
import { EmptyState } from "../../../../src/views/components/dashboard/empty-state";

const isWeb = Platform.OS === "web";

// Statuses that still need a TD approval tap. Self-preregistered / queued
// players land here; TD-added players are inserted as "approved" already.
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

// ── Add Player Modal ────────────────────────────────────────────────────────
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
                  🔍
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
                        @{profile.user_name} · #{profile.id_auto}
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

// ── Registration Row ────────────────────────────────────────────────────────
const RegistrationRow = ({
  registration,
  onApprove,
  isProcessing,
}: {
  registration: Registration;
  onApprove: () => void;
  isProcessing: boolean;
}) => {
  const statusColor = getStatusColor(registration.status);
  const isGuest = !registration.player_id;
  const needsApproval = NEEDS_APPROVAL.includes(registration.status);

  return (
    <View style={styles.card}>
      <View style={styles.cardMain}>
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

      {needsApproval && (
        <TouchableOpacity
          style={styles.approveButton}
          onPress={onApprove}
          disabled={isProcessing}
        >
          <Text allowFontScaling={false} style={styles.approveButtonText}>
            {isProcessing ? "..." : "✓ Approve"}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

// ── Screen ──────────────────────────────────────────────────────────────────
export default function ManagePlayersScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string; name?: string }>();
  const tournamentId = Number(params.id);
  const tournamentName = params.name || "";

  const { registrations, isLoading, addPlayer, approve } =
    useRegistrations(tournamentId);

  const [addModalVisible, setAddModalVisible] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [processingId, setProcessingId] = useState<number | null>(null);

  const handleAddPlayer = async (profile: Profile) => {
    // Guard against re-adding a player who is already in this tournament.
    const existing = registrations.find(
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
      await addPlayer({
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
      await addPlayer({
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
      await approve(registration.id);
    } catch {
      Alert.alert("Error", "Failed to approve registration.");
    } finally {
      setProcessingId(null);
    }
  };

  const playerCount = registrations.filter(
    (r) => r.status !== "cancelled",
  ).length;

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
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Text allowFontScaling={false} style={styles.backText}>
            ← Back
          </Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text allowFontScaling={false} style={styles.headerTitle}>
            MANAGE PLAYERS
          </Text>
          <Text
            allowFontScaling={false}
            style={styles.headerSubtitle}
            numberOfLines={1}
          >
            {tournamentName || `${playerCount} registered`}
          </Text>
        </View>
        <View style={styles.placeholder} />
      </View>

      {/* Add Player Button */}
      <View style={styles.addContainer}>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => setAddModalVisible(true)}
        >
          <Text allowFontScaling={false} style={styles.addButtonText}>
            ➕ Add Player
          </Text>
        </TouchableOpacity>
      </View>

      {/* Registration List */}
      {isLoading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text allowFontScaling={false} style={styles.loadingText}>
            Loading players...
          </Text>
        </View>
      ) : (
        <FlatList
          data={registrations}
          keyExtractor={(item) => item.id.toString()}
          contentContainerStyle={[
            styles.listContent,
            isWeb && styles.scrollContentWeb,
          ]}
          renderItem={({ item }) => (
            <RegistrationRow
              registration={item}
              onApprove={() => handleApprove(item)}
              isProcessing={processingId === item.id}
            />
          )}
          ListEmptyComponent={
            <EmptyState
              message="No players registered yet"
              submessage="Tap Add Player to register someone."
            />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  scrollContentWeb: {
    alignItems: "center",
    paddingBottom: SPACING.xl,
  },
  container: {
    ...Platform.select({
      web: {
        maxWidth: 860,
        width: "100%" as any,
        alignSelf: "center" as any,
      },
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
  loadingText: {
    fontSize: moderateScale(FONT_SIZES.md),
    color: COLORS.textSecondary,
    marginTop: SPACING.sm,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.xl + SPACING.sm,
    paddingBottom: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerWeb: {
    paddingTop: SPACING.lg,
  },
  backButton: {
    padding: SPACING.xs,
  },
  backText: {
    fontSize: moderateScale(FONT_SIZES.sm),
    color: COLORS.primary,
    fontWeight: "500",
  },
  headerCenter: {
    alignItems: "center",
    flex: 1,
    marginHorizontal: SPACING.sm,
  },
  headerTitle: {
    fontSize: moderateScale(FONT_SIZES.lg),
    fontWeight: "600",
    color: COLORS.text,
    letterSpacing: 0.5,
  },
  headerSubtitle: {
    fontSize: moderateScale(FONT_SIZES.xs),
    color: COLORS.textSecondary,
    opacity: 0.7,
    marginTop: scale(2),
  },
  placeholder: {
    width: scale(50),
  },
  addContainer: {
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.sm,
  },
  addButton: {
    backgroundColor: COLORS.primary,
    borderRadius: scale(8),
    paddingVertical: SPACING.md,
    alignItems: "center",
    justifyContent: "center",
  },
  addButtonText: {
    color: "#FFFFFF",
    fontSize: moderateScale(FONT_SIZES.md),
    fontWeight: "700",
  },
  listContent: {
    padding: SPACING.md,
    paddingBottom: SPACING.xl * 2,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: scale(12),
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: SPACING.sm,
  },
  cardMain: {
    flex: 1,
    gap: scale(6),
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
  },
  playerName: {
    fontSize: moderateScale(FONT_SIZES.md),
    fontWeight: "600",
    color: COLORS.text,
    flexShrink: 1,
  },
  playerId: {
    fontSize: moderateScale(FONT_SIZES.xs),
    color: COLORS.textSecondary,
  },
  guestTag: {
    backgroundColor: COLORS.textSecondary + "20",
    paddingHorizontal: SPACING.sm,
    paddingVertical: scale(2),
    borderRadius: scale(8),
  },
  guestTagText: {
    fontSize: moderateScale(FONT_SIZES.xs),
    color: COLORS.textSecondary,
    fontWeight: "600",
  },
  statusBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: SPACING.sm,
    paddingVertical: scale(2),
    borderRadius: scale(12),
  },
  statusText: {
    fontSize: moderateScale(FONT_SIZES.xs),
    fontWeight: "600",
    textTransform: "capitalize",
  },
  approveButton: {
    backgroundColor: COLORS.success + "20",
    borderColor: COLORS.success,
    borderWidth: 1,
    borderRadius: scale(8),
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    alignItems: "center",
    justifyContent: "center",
    minWidth: scale(90),
  },
  approveButtonText: {
    color: COLORS.success,
    fontSize: moderateScale(FONT_SIZES.sm),
    fontWeight: "600",
  },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "center",
    alignItems: "center",
    padding: SPACING.lg,
  },
  modalContent: {
    backgroundColor: COLORS.surface,
    borderRadius: scale(12),
    padding: SPACING.lg,
    width: "100%",
    maxWidth: scale(400),
  },
  modalTitle: {
    fontSize: moderateScale(FONT_SIZES.lg),
    fontWeight: "700",
    color: COLORS.text,
    marginBottom: SPACING.md,
  },
  modalLabel: {
    fontSize: moderateScale(FONT_SIZES.sm),
    color: COLORS.text,
    marginBottom: SPACING.xs,
    fontWeight: "500",
  },
  modalHint: {
    fontSize: moderateScale(FONT_SIZES.xs),
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
    fontStyle: "italic",
  },
  modalInput: {
    backgroundColor: COLORS.background,
    borderRadius: scale(8),
    padding: SPACING.sm,
    fontSize: moderateScale(FONT_SIZES.sm),
    color: COLORS.text,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  searchInputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.background,
    borderRadius: scale(8),
    paddingHorizontal: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    height: scale(40),
  },
  searchIcon: {
    fontSize: moderateScale(14),
    marginRight: SPACING.sm,
    opacity: 0.6,
  },
  searchInput: {
    flex: 1,
    fontSize: moderateScale(FONT_SIZES.sm),
    color: COLORS.text,
    height: scale(40),
  },
  resultsList: {
    maxHeight: scale(240),
    marginTop: SPACING.sm,
  },
  noResults: {
    fontSize: moderateScale(FONT_SIZES.sm),
    color: COLORS.textSecondary,
    textAlign: "center",
    paddingVertical: SPACING.md,
  },
  resultRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    gap: SPACING.sm,
  },
  resultInfo: {
    flex: 1,
  },
  resultName: {
    fontSize: moderateScale(FONT_SIZES.sm),
    fontWeight: "600",
    color: COLORS.text,
  },
  resultMeta: {
    fontSize: moderateScale(FONT_SIZES.xs),
    color: COLORS.textSecondary,
    marginTop: scale(2),
  },
  resultAdd: {
    fontSize: moderateScale(FONT_SIZES.sm),
    color: COLORS.primary,
    fontWeight: "600",
  },
  modalButtons: {
    flexDirection: "row",
    marginTop: SPACING.lg,
    gap: SPACING.sm,
  },
  modalButtonCancel: {
    flex: 1,
    paddingVertical: SPACING.sm,
    borderRadius: scale(8),
    alignItems: "center",
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  modalButtonCancelText: {
    color: COLORS.text,
    fontSize: moderateScale(FONT_SIZES.sm),
    fontWeight: "600",
  },
  modalButtonConfirm: {
    flex: 1,
    paddingVertical: SPACING.sm,
    borderRadius: scale(8),
    alignItems: "center",
    backgroundColor: COLORS.primary,
  },
  modalButtonConfirmText: {
    color: "#FFFFFF",
    fontSize: moderateScale(FONT_SIZES.sm),
    fontWeight: "600",
  },
  modalButtonGuest: {
    flex: 1,
    paddingVertical: SPACING.sm,
    borderRadius: scale(8),
    alignItems: "center",
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  modalButtonGuestText: {
    color: COLORS.primary,
    fontSize: moderateScale(FONT_SIZES.sm),
    fontWeight: "600",
  },
});
