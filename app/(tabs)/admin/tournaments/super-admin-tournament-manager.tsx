// app/(tabs)/admin/tournaments/super-admin-tournament-manager.tsx

import { useRouter } from "expo-router";
import { useState } from "react";
import {
  Alert,
  FlatList,
  Modal,
  RefreshControl,
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
import { usePagination } from "../../../../src/viewmodels/hooks/use.pagination";
import {
  AdminTournamentWithStats,
  TournamentStatusFilter,
  useAdminTournaments,
} from "../../../../src/viewmodels/useAdminTournaments";
import { Pagination } from "../../../../src/views/components/common/pagination";
import { ReassignDirectorModal } from "../../../../src/views/components/common/reassign-director-modal";
import { EmptyState } from "../../../../src/views/components/dashboard/empty-state";

type SASortOption = "newest" | "oldest" | "a-z" | "z-a";
const SORT_OPTIONS: { key: SASortOption; label: string }[] = [
  { key: "newest", label: "Newest" },
  { key: "oldest", label: "Oldest" },
  { key: "a-z", label: "A → Z" },
  { key: "z-a", label: "Z → A" },
];

const formatDate = (d: string) =>
  new Date(d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
const formatDateTime = (d: string | null) =>
  d
    ? new Date(d).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "";
const formatTime = (t: string) => {
  if (!t) return "";
  const [h, m] = t.split(":");
  const hr = parseInt(h, 10);
  return `${hr % 12 || 12}:${m} ${hr >= 12 ? "PM" : "AM"}`;
};
const getStatusColor = (s: string) => {
  switch (s) {
    case "active":
      return COLORS.success;
    case "completed":
      return COLORS.primary;
    case "cancelled":
      return COLORS.error;
    default:
      return COLORS.textSecondary;
  }
};

// Cancel Modal
const CancelModal = ({
  visible,
  tournamentName,
  onCancel,
  onConfirm,
}: {
  visible: boolean;
  tournamentName: string;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}) => {
  const [reason, setReason] = useState("");
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <Text style={styles.modalTitle}>Cancel Tournament</Text>
          <Text style={styles.modalSubtitle}>{`"${tournamentName}"`}</Text>
          <Text style={styles.modalLabel}>Cancellation Reason *</Text>
          <TextInput
            style={styles.modalInput}
            placeholder="Enter reason..."
            placeholderTextColor={COLORS.textSecondary}
            value={reason}
            onChangeText={setReason}
            multiline
            numberOfLines={3}
          />
          <View style={styles.modalButtons}>
            <TouchableOpacity
              style={styles.modalBtnCancel}
              onPress={() => {
                setReason("");
                onCancel();
              }}
            >
              <Text style={styles.modalBtnCancelText}>Back</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.modalBtnConfirm}
              onPress={() => {
                if (!reason.trim()) {
                  Alert.alert("Required", "Please enter a reason.");
                  return;
                }
                onConfirm(reason.trim());
                setReason("");
              }}
            >
              <Text style={styles.modalBtnConfirmText}>Cancel Tournament</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

// Tournament Card — adds ID badge + Reassign
const TournamentCard = ({
  tournament: t,
  onPress,
  onEdit,
  onArchive,
  onCancel,
  onRestore,
  onReassign,
  isProcessing,
}: {
  tournament: AdminTournamentWithStats;
  onPress: () => void;
  onEdit: () => void;
  onArchive: () => void;
  onCancel: () => void;
  onRestore: () => void;
  onReassign: () => void;
  isProcessing: boolean;
}) => {
  const sc = getStatusColor(t.status);
  const arch = t.status === "archived";
  const canc = t.status === "cancelled";
  const act = t.status === "active";
  const comp = t.status === "completed";

  return (
    <TouchableOpacity
      style={[styles.card, arch && styles.cardArchived]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <View style={styles.cardHeader}>
        <Text style={[styles.name, arch && styles.dimText]} numberOfLines={1}>
          {t.name}
        </Text>
        <View style={styles.badges}>
          <View style={styles.idBadge}>
            <Text style={styles.idBadgeText}>ID: {t.id}</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: sc + "20" }]}>
            <Text style={[styles.statusText, { color: sc }]}>{t.status}</Text>
          </View>
        </View>
      </View>

      <Text style={[styles.gameType, arch && styles.dimText]}>
        {t.game_type} • {t.tournament_format.replace("_", " ")}
      </Text>

      <View style={styles.infoRow}>
        <Text style={styles.infoIcon}>📅</Text>
        <Text style={[styles.infoText, arch && styles.dimText]}>
          {formatDate(t.tournament_date)}
          {t.start_time && ` at ${formatTime(t.start_time)}`}
        </Text>
      </View>
      <View style={styles.infoRow}>
        <Text style={styles.infoIcon}>📍</Text>
        <Text
          style={[styles.infoText, arch && styles.dimText]}
          numberOfLines={1}
        >
          {t.venue_name}
        </Text>
      </View>
      <View style={styles.infoRow}>
        <Text style={styles.infoIcon}>👤</Text>
        <Text style={[styles.infoText, arch && styles.dimText]}>
          TD: {t.director_name}
        </Text>
      </View>

      {canc && t.cancelled_at && (
        <View style={styles.infoBox}>
          <Text style={styles.infoBoxTitle}>❌ Cancelled</Text>
          <Text style={styles.infoBoxText}>
            By: {t.cancelled_by_name || "Unknown"}
          </Text>
          <Text style={styles.infoBoxText}>
            On: {formatDateTime(t.cancelled_at)}
          </Text>
          {t.cancellation_reason && (
            <Text style={styles.infoBoxReason}>
              Reason: {t.cancellation_reason}
            </Text>
          )}
        </View>
      )}
      {arch && t.archived_at && (
        <View style={[styles.infoBox, styles.infoBoxArchived]}>
          <Text style={styles.infoBoxTitle}>📦 Archived</Text>
          <Text style={styles.infoBoxText}>
            By: {t.archived_by_name || "Unknown"}
          </Text>
          <Text style={styles.infoBoxText}>
            On: {formatDateTime(t.archived_at)}
          </Text>
        </View>
      )}

      <View style={styles.statsRow}>
        <View style={styles.stat}>
          <Text style={[styles.statVal, arch && styles.dimText]}>
            {t.views_count}
          </Text>
          <Text style={styles.statLbl}>Views</Text>
        </View>
        <View style={styles.stat}>
          <Text style={[styles.statVal, arch && styles.dimText]}>
            {t.favorites_count}
          </Text>
          <Text style={styles.statLbl}>Favorites</Text>
        </View>
      </View>

      <View style={styles.actionRow}>
        <TouchableOpacity
          style={[styles.btn, styles.reassignBtn]}
          onPress={(e) => {
            e.stopPropagation();
            onReassign();
          }}
          disabled={isProcessing}
        >
          <Text style={styles.reassignBtnText}>
            {isProcessing ? "..." : "🔄 Reassign"}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.btn, styles.editBtn]}
          onPress={(e) => {
            e.stopPropagation();
            onEdit();
          }}
          disabled={isProcessing}
        >
          <Text style={styles.editBtnText}>✏️ Edit</Text>
        </TouchableOpacity>
        {act && (
          <>
            <TouchableOpacity
              style={[styles.btn, styles.cancelBtn]}
              onPress={(e) => {
                e.stopPropagation();
                onCancel();
              }}
              disabled={isProcessing}
            >
              <Text style={styles.cancelBtnText}>
                {isProcessing ? "..." : "❌ Cancel"}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btn, styles.archiveBtn]}
              onPress={(e) => {
                e.stopPropagation();
                onArchive();
              }}
              disabled={isProcessing}
            >
              <Text style={styles.archiveBtnText}>
                {isProcessing ? "..." : "📦 Archive"}
              </Text>
            </TouchableOpacity>
          </>
        )}
        {comp && (
          <TouchableOpacity
            style={[styles.btn, styles.archiveBtn]}
            onPress={(e) => {
              e.stopPropagation();
              onArchive();
            }}
            disabled={isProcessing}
          >
            <Text style={styles.archiveBtnText}>
              {isProcessing ? "..." : "📦 Archive"}
            </Text>
          </TouchableOpacity>
        )}
        {(canc || arch) && (
          <TouchableOpacity
            style={[styles.btn, styles.restoreBtn]}
            onPress={(e) => {
              e.stopPropagation();
              onRestore();
            }}
            disabled={isProcessing}
          >
            <Text style={styles.restoreBtnText}>
              {isProcessing ? "..." : "♻️ Restore"}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </TouchableOpacity>
  );
};

// ── Main Screen ───────────────────────────────────────────────────────
export default function SuperAdminTournamentManager() {
  const router = useRouter();
  const vm = useAdminTournaments();
  const [sortOption, setSortOption] = useState<SASortOption>("newest");
  const [cancelVis, setCancelVis] = useState(false);
  const [cancelTarget, setCancelTarget] =
    useState<AdminTournamentWithStats | null>(null);
  const [reassignVis, setReassignVis] = useState(false);
  const [reassignTarget, setReassignTarget] =
    useState<AdminTournamentWithStats | null>(null);

  const sorted = [...vm.filteredTournaments].sort((a, b) => {
    switch (sortOption) {
      case "newest":
        return (
          new Date(b.tournament_date).getTime() -
          new Date(a.tournament_date).getTime()
        );
      case "oldest":
        return (
          new Date(a.tournament_date).getTime() -
          new Date(b.tournament_date).getTime()
        );
      case "a-z":
        return a.name.localeCompare(b.name);
      case "z-a":
        return b.name.localeCompare(a.name);
      default:
        return 0;
    }
  });
  const pg = usePagination(sorted, { itemsPerPage: 20 });

  const handleFilter = (f: TournamentStatusFilter) => {
    vm.setStatusFilter(f);
    pg.resetPage();
  };
  const handleSearch = (q: string) => {
    vm.setSearchQuery(q);
    pg.resetPage();
  };

  const confirmCancel = async (reason: string) => {
    if (!cancelTarget) return;
    const ok = await vm.cancelTournament(cancelTarget.id, reason);
    setCancelVis(false);
    setCancelTarget(null);
    Alert.alert(ok ? "Success" : "Error", ok ? "Cancelled." : "Failed.");
  };

  const confirmReassign = async (id: number, name: string, reason: string) => {
    if (!reassignTarget) return;
    const ok = await vm.reassignDirector(reassignTarget.id, id, name, reason);
    setReassignVis(false);
    setReassignTarget(null);
    vm.clearDirectorResults();
    Alert.alert(
      ok ? "Success" : "Error",
      ok ? `Reassigned to ${name}.` : "Failed.",
    );
  };

  if (vm.loading)
    return (
      <View style={styles.center}>
        <Text style={styles.loadingText}>Loading tournaments...</Text>
      </View>
    );

  return (
    <View style={styles.container}>
      <CancelModal
        visible={cancelVis}
        tournamentName={cancelTarget?.name || ""}
        onCancel={() => {
          setCancelVis(false);
          setCancelTarget(null);
        }}
        onConfirm={confirmCancel}
      />
      <ReassignDirectorModal
        visible={reassignVis}
        tournamentName={reassignTarget?.name || ""}
        currentDirector={reassignTarget?.director_name || ""}
        directors={vm.directorResults}
        loadingDirectors={vm.searchingDirectors}
        onSearch={vm.searchDirectors}
        onCancel={() => {
          setReassignVis(false);
          setReassignTarget(null);
          vm.clearDirectorResults();
        }}
        onConfirm={confirmReassign}
      />

      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>TOURNAMENTS</Text>
          <Text style={styles.headerSub}>
            {vm.totalCount} total • Super Admin
          </Text>
        </View>
        <View style={styles.placeholder} />
      </View>

      <View style={styles.searchWrap}>
        <View style={styles.searchRow}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Search by ID, name, venue, or director..."
            placeholderTextColor={COLORS.textSecondary}
            value={vm.searchQuery}
            onChangeText={handleSearch}
          />
          {vm.searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => handleSearch("")}>
              <Text style={styles.searchClear}>✕</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      <View style={styles.tabsWrap}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabsContent}
        >
          {[
            {
              key: "active" as const,
              label: "Active",
              count: vm.statusCounts.active,
            },
            {
              key: "completed" as const,
              label: "Completed",
              count: vm.statusCounts.completed,
            },
            {
              key: "cancelled" as const,
              label: "Cancelled",
              count: vm.statusCounts.cancelled,
            },
            {
              key: "archived" as const,
              label: "Archived",
              count: vm.statusCounts.archived,
            },
            { key: "all" as const, label: "All", count: vm.statusCounts.all },
          ].map((tab) => (
            <TouchableOpacity
              key={tab.key}
              style={[
                styles.tab,
                vm.statusFilter === tab.key && styles.tabActive,
              ]}
              onPress={() => handleFilter(tab.key)}
            >
              <Text
                style={[
                  styles.tabText,
                  vm.statusFilter === tab.key && styles.tabTextActive,
                ]}
              >
                {tab.label}
                {tab.count > 0 ? ` (${tab.count})` : ""}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <View style={styles.sortWrap}>
        <Text style={styles.sortLabel}>Sort:</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.sortRow}
        >
          {SORT_OPTIONS.map((o) => (
            <TouchableOpacity
              key={o.key}
              style={[
                styles.sortPill,
                sortOption === o.key && styles.sortPillActive,
              ]}
              onPress={() => {
                setSortOption(o.key);
                pg.resetPage();
              }}
            >
              <Text
                style={[
                  styles.sortPillText,
                  sortOption === o.key && styles.sortPillTextActive,
                ]}
              >
                {o.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <Pagination
        totalCount={pg.totalCount}
        displayStart={pg.displayRange.start}
        displayEnd={pg.displayRange.end}
        currentPage={pg.currentPage}
        totalPages={pg.totalPages}
        onPrevPage={pg.prevPage}
        onNextPage={pg.nextPage}
        canGoPrev={pg.canGoPrev}
        canGoNext={pg.canGoNext}
      />

      <FlatList
        data={pg.paginatedItems}
        keyExtractor={(i) => i.id.toString()}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={vm.refreshing}
            onRefresh={vm.onRefresh}
            tintColor={COLORS.primary}
          />
        }
        renderItem={({ item }) => (
          <TournamentCard
            tournament={item}
            onPress={() =>
              router.push({
                pathname: "/(tabs)/admin/tournament-detail",
                params: { id: item.id.toString() },
              } as any)
            }
            onEdit={() =>
              router.push({
                pathname: "/(tabs)/admin/edit-tournament/[id]",
                params: { id: item.id.toString() },
              } as any)
            }
            onArchive={() =>
              Alert.alert("Archive", `Archive "${item.name}"?`, [
                { text: "No", style: "cancel" },
                {
                  text: "Yes",
                  style: "destructive",
                  onPress: () => vm.archiveTournament(item.id),
                },
              ])
            }
            onCancel={() => {
              setCancelTarget(item);
              setCancelVis(true);
            }}
            onRestore={() =>
              Alert.alert("Restore", `Restore "${item.name}"?`, [
                { text: "No", style: "cancel" },
                { text: "Yes", onPress: () => vm.restoreTournament(item.id) },
              ])
            }
            onReassign={() => {
              setReassignTarget(item);
              setReassignVis(true);
            }}
            isProcessing={vm.processing === item.id}
          />
        )}
        ListEmptyComponent={
          <EmptyState
            message={
              vm.searchQuery
                ? `No results for "${vm.searchQuery}"`
                : "No tournaments found"
            }
            submessage="Try adjusting your search or filters"
          />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  center: {
    flex: 1,
    backgroundColor: COLORS.background,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: { fontSize: FONT_SIZES.md, color: COLORS.textSecondary },
  // Header
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
  backBtn: { padding: SPACING.xs },
  backText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.primary,
    fontWeight: "500",
  },
  headerCenter: { alignItems: "center" },
  headerTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: "600",
    color: COLORS.text,
    letterSpacing: 0.5,
  },
  headerSub: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    opacity: 0.7,
    marginTop: 2,
  },
  placeholder: { width: 50 },
  // Search
  searchWrap: {
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.sm,
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.surface,
    borderRadius: 8,
    paddingHorizontal: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    height: 40,
  },
  searchIcon: { fontSize: 14, marginRight: SPACING.sm, opacity: 0.6 },
  searchInput: {
    flex: 1,
    fontSize: FONT_SIZES.sm,
    color: COLORS.text,
    height: 40,
  },
  searchClear: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textSecondary,
    paddingLeft: SPACING.sm,
  },
  // Tabs
  tabsWrap: {
    minHeight: 48,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  tabsContent: {
    paddingHorizontal: SPACING.md,
    gap: SPACING.xs,
    alignItems: "center",
    minHeight: 48,
  },
  tab: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabActive: { borderBottomColor: COLORS.primary },
  tabText: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textSecondary,
    fontWeight: "500",
  },
  tabTextActive: { color: COLORS.primary, fontWeight: "600" },
  // Sort
  sortWrap: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  sortLabel: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    marginRight: SPACING.sm,
  },
  sortRow: { flexDirection: "row", gap: SPACING.xs },
  sortPill: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: 16,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  sortPillActive: {
    backgroundColor: COLORS.primary + "20",
    borderColor: COLORS.primary,
  },
  sortPillText: { fontSize: FONT_SIZES.sm, color: COLORS.textSecondary },
  sortPillTextActive: { color: COLORS.primary, fontWeight: "600" },
  // List
  list: { padding: SPACING.md, paddingBottom: SPACING.xl * 2 },
  // Card
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cardArchived: { opacity: 0.7, borderColor: COLORS.textSecondary },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: SPACING.xs,
  },
  badges: { flexDirection: "row", gap: SPACING.xs, alignItems: "center" },
  name: {
    fontSize: FONT_SIZES.md,
    fontWeight: "700",
    color: COLORS.text,
    flex: 1,
    marginRight: SPACING.sm,
  },
  dimText: { color: COLORS.textSecondary },
  idBadge: {
    backgroundColor: COLORS.textSecondary + "30",
    paddingHorizontal: SPACING.xs + 2,
    paddingVertical: 2,
    borderRadius: 8,
  },
  idBadgeText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: "600",
    color: COLORS.textSecondary,
  },
  statusBadge: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: 12,
  },
  statusText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: "600",
    textTransform: "capitalize",
  },
  gameType: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.primary,
    marginBottom: SPACING.sm,
    textTransform: "capitalize",
  },
  infoRow: { flexDirection: "row", alignItems: "center", marginBottom: 4 },
  infoIcon: { fontSize: FONT_SIZES.sm, marginRight: SPACING.xs, width: 20 },
  infoText: { fontSize: FONT_SIZES.sm, color: COLORS.textSecondary, flex: 1 },
  infoBox: {
    backgroundColor: COLORS.background,
    borderRadius: 8,
    padding: SPACING.sm,
    marginTop: SPACING.sm,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.error,
  },
  infoBoxArchived: { borderLeftColor: COLORS.textSecondary },
  infoBoxTitle: {
    fontSize: FONT_SIZES.sm,
    fontWeight: "600",
    color: COLORS.text,
    marginBottom: 4,
  },
  infoBoxText: { fontSize: FONT_SIZES.xs, color: COLORS.textSecondary },
  infoBoxReason: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.text,
    marginTop: 4,
    fontStyle: "italic",
  },
  statsRow: {
    flexDirection: "row",
    marginTop: SPACING.sm,
    paddingTop: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    gap: SPACING.lg,
  },
  stat: { alignItems: "center" },
  statVal: { fontSize: FONT_SIZES.lg, fontWeight: "700", color: COLORS.text },
  statLbl: { fontSize: FONT_SIZES.xs, color: COLORS.textSecondary },
  // Actions
  actionRow: {
    flexDirection: "row",
    marginTop: SPACING.md,
    paddingTop: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    gap: SPACING.xs,
    flexWrap: "wrap",
  },
  btn: {
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.sm,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    minWidth: 80,
  },
  reassignBtn: { backgroundColor: "#FF980020", borderColor: "#FF9800" },
  reassignBtnText: {
    color: "#FF9800",
    fontSize: FONT_SIZES.sm,
    fontWeight: "600",
  },
  editBtn: {
    backgroundColor: COLORS.primary + "20",
    borderColor: COLORS.primary,
  },
  editBtnText: {
    color: COLORS.primary,
    fontSize: FONT_SIZES.sm,
    fontWeight: "600",
  },
  cancelBtn: {
    backgroundColor: COLORS.error + "20",
    borderColor: COLORS.error,
  },
  cancelBtnText: {
    color: COLORS.error,
    fontSize: FONT_SIZES.sm,
    fontWeight: "600",
  },
  archiveBtn: {
    backgroundColor: COLORS.textSecondary + "20",
    borderColor: COLORS.textSecondary,
  },
  archiveBtnText: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZES.sm,
    fontWeight: "600",
  },
  restoreBtn: {
    backgroundColor: COLORS.success + "20",
    borderColor: COLORS.success,
  },
  restoreBtnText: {
    color: COLORS.success,
    fontSize: FONT_SIZES.sm,
    fontWeight: "600",
  },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    alignItems: "center",
    padding: SPACING.lg,
  },
  modalContent: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: SPACING.lg,
    width: "100%",
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: "700",
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },
  modalSubtitle: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textSecondary,
    marginBottom: SPACING.lg,
  },
  modalLabel: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.text,
    marginBottom: SPACING.xs,
    fontWeight: "500",
  },
  modalInput: {
    backgroundColor: COLORS.background,
    borderRadius: 8,
    padding: SPACING.sm,
    fontSize: FONT_SIZES.sm,
    color: COLORS.text,
    borderWidth: 1,
    borderColor: COLORS.border,
    minHeight: 80,
    textAlignVertical: "top",
  },
  modalButtons: {
    flexDirection: "row",
    marginTop: SPACING.lg,
    gap: SPACING.sm,
  },
  modalBtnCancel: {
    flex: 1,
    paddingVertical: SPACING.sm,
    borderRadius: 8,
    alignItems: "center",
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  modalBtnCancelText: {
    color: COLORS.text,
    fontSize: FONT_SIZES.sm,
    fontWeight: "600",
  },
  modalBtnConfirm: {
    flex: 1,
    paddingVertical: SPACING.sm,
    borderRadius: 8,
    alignItems: "center",
    backgroundColor: COLORS.error,
  },
  modalBtnConfirmText: {
    color: "#FFFFFF",
    fontSize: FONT_SIZES.sm,
    fontWeight: "600",
  },
});
