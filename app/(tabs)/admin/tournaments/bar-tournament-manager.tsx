// app/(tabs)/admin/tournaments/bar-tournament-manager.tsx
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../../../../src/lib/supabase";
import { useAuthContext } from "../../../../src/providers/AuthProvider";
import { COLORS } from "../../../../src/theme/colors";
import { RADIUS, SPACING } from "../../../../src/theme/spacing";
import { FONT_SIZES } from "../../../../src/theme/typography";
import { moderateScale, scale } from "../../../../src/utils/scaling";
import { usePagination } from "../../../../src/viewmodels/hooks/use.pagination";
import { DirectorSearchResult } from "../../../../src/viewmodels/useAdminTournaments";
import {
  BarTournamentWithStats,
  SortOption,
  TournamentStatusFilter,
  useBarTournamentManager,
} from "../../../../src/viewmodels/useBarTournamentManager";
import { Pagination } from "../../../../src/views/components/common/pagination";
import { ReassignDirectorModal } from "../../../../src/views/components/common/reassign-director-modal";
import { EmptyState } from "../../../../src/views/components/dashboard/empty-state";
import { TournamentCard } from "../../../../src/views/components/tournament";
import { ActionMenu, ActionMenuItem } from "../../../../src/views/components/admin/ActionMenu";
import { AdminHeader, AdminSearchBar, AdminFilterRow } from "../../../../src/views/components/admin/AdminControls";
import { TournamentSoftwareModal } from "../../../../src/views/components/tournament/TournamentSoftwareModal";
import { Dropdown } from "../../../../src/views/components/common/dropdown";

const isWeb = Platform.OS === "web";
const wxMs = (v: number) => isWeb ? v : moderateScale(v);
const wxSc = (v: number) => isWeb ? v : scale(v);

// ── desktop-table helpers ──────────────────────────────────────────────────────
const fmtDate = (d: string): string => {
  if (!d) return "—";
  const [y, m, day] = d.split("-").map(Number);
  return new Date(y, m - 1, day).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};
const fmtTime = (t: string): string => {
  if (!t) return "";
  const [h, min] = t.split(":");
  const hr = parseInt(h, 10);
  return `${hr % 12 || 12}:${min} ${hr >= 12 ? "PM" : "AM"}`;
};
const statusColor = (s: string): string =>
  s === "active" ? COLORS.success
    : s === "completed" ? COLORS.primary
      : s === "cancelled" ? COLORS.error
        : COLORS.textSecondary;

// One desktop table row (web only): scannable columns + Open Manager + ⋯ menu,
// with a subtle hover state. Mobile keeps the TournamentCard.
const DesktopRow = ({
  t,
  actions,
  processing,
  onOpen,
}: {
  t: BarTournamentWithStats;
  actions: ActionMenuItem[];
  processing: boolean;
  onOpen: () => void;
}) => {
  const sc = statusColor(t.status);
  return (
    <Pressable
      onPress={onOpen}
      style={(st: any) => [styles.dtRow, st.hovered && styles.dtRowHover]}
    >
      <View style={styles.colName}>
        <Text allowFontScaling={false} style={styles.dtName} numberOfLines={1}>{t.name}</Text>
        <Text allowFontScaling={false} style={styles.dtNameSub} numberOfLines={1}>{t.game_type}</Text>
      </View>
      <Text allowFontScaling={false} style={[styles.dtCell, styles.colDate]} numberOfLines={2}>
        {fmtDate(t.tournament_date)}{t.start_time ? `\n${fmtTime(t.start_time)}` : ""}
      </Text>
      <Text allowFontScaling={false} style={[styles.dtCell, styles.colVenue]} numberOfLines={2}>{t.venue_name}</Text>
      <Text allowFontScaling={false} style={[styles.dtCell, styles.colDir]} numberOfLines={2}>{t.director_name}</Text>
      <View style={styles.colFmt}>
        <View style={styles.dtFmtBadge}>
          <Text allowFontScaling={false} style={styles.dtFmtText} numberOfLines={1}>
            {t.tournament_format.replace(/_/g, " ")}
          </Text>
        </View>
      </View>
      <View style={styles.colStatus}>
        <View style={[styles.dtStatusBadge, { backgroundColor: sc + "22" }]}>
          <Text allowFontScaling={false} style={[styles.dtStatusText, { color: sc }]}>{t.status}</Text>
        </View>
      </View>
      <View style={styles.colActions}>
        <TouchableOpacity
          style={[styles.dtOpenBtn, processing && styles.newBtnDisabled]}
          onPress={(e) => { e.stopPropagation(); onOpen(); }}
          disabled={processing}
          activeOpacity={0.85}
        >
          <Text allowFontScaling={false} style={styles.dtOpenText}>Open Manager</Text>
        </TouchableOpacity>
        {actions.length > 0 && <ActionMenu items={actions} compact disabled={processing} />}
      </View>
    </Pressable>
  );
};

const DeleteModal = ({
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

  const handleConfirm = () => {
    if (!reason.trim()) {
      Alert.alert("Required", "Please enter a deletion reason.");
      return;
    }
    onConfirm(reason.trim());
    setReason("");
  };

  const handleCancel = () => {
    setReason("");
    onCancel();
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <Text allowFontScaling={false} style={styles.modalTitle}>Delete Tournament</Text>
          <Text allowFontScaling={false} style={styles.modalSubtitle}>{`"${tournamentName}"`}</Text>
          <Text allowFontScaling={false} style={styles.modalLabel}>Deletion Reason *</Text>
          <TextInput
            style={styles.modalInput}
            placeholder="Enter reason for deletion..."
            placeholderTextColor={COLORS.textSecondary}
            value={reason}
            onChangeText={setReason}
            multiline
            numberOfLines={3}
          />
          <View style={styles.modalButtons}>
            <TouchableOpacity style={styles.modalButtonCancel} onPress={handleCancel}>
              <Text allowFontScaling={false} style={styles.modalButtonCancelText}>Back</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.modalButtonConfirm} onPress={handleConfirm}>
              <Text allowFontScaling={false} style={styles.modalButtonConfirmText}>Delete Tournament</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

export default function BarTournamentManagerScreen() {
  const router = useRouter();
  const vm = useBarTournamentManager();
  const { profile } = useAuthContext();

  // Cancel modal state
  const [cancelModalVisible, setCancelModalVisible] = useState(false);
  const [tournamentToCancel, setTournamentToCancel] = useState<BarTournamentWithStats | null>(null);

  // Reassign modal state
  const [reassignModalVisible, setReassignModalVisible] = useState(false);
  const [tournamentToReassign, setTournamentToReassign] = useState<BarTournamentWithStats | null>(null);
  const [directorResults, setDirectorResults] = useState<DirectorSearchResult[]>([]);
  const [searchingDirectors, setSearchingDirectors] = useState(false);

  // Pagination
  const [softwareOpen, setSoftwareOpen] = useState(false);
  const pagination = usePagination(vm.tournaments, { itemsPerPage: 10 });
  const listRef = useRef<any>(null);
  const { width: winW } = useWindowDimensions();
  const isDesktop = isWeb && winW >= 900;

  useEffect(() => {
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
  }, [pagination.currentPage]);

  const handleStatusFilter = (filter: TournamentStatusFilter) => {
    vm.setStatusFilter(filter);
    pagination.resetPage();
  };

  const handleSortSelect = (v: string) => {
    const [opt, dir] = v.split("-") as [SortOption, "asc" | "desc"];
    vm.setSortOption(opt);
    vm.setSortDirection(dir);
    pagination.resetPage();
  };

  const handleSearch = (query: string) => {
    vm.setSearchQuery(query);
    pagination.resetPage();
  };

  // "New Tournament" — ask which software, then create the draft and open it.
  const handleSelectSoftware = async (source: "compete" | "external") => {
    const newId = await vm.createDraftTournament(source);
    setSoftwareOpen(false);
    if (newId != null) {
      router.push(`/(tabs)/admin/manage-tournament/${newId}` as any);
    }
  };

  const handleEditTournament = (tournamentId: number) => {
    router.push({
      pathname: "/(tabs)/admin/edit-tournament/[id]",
      params: { id: tournamentId.toString() },
    } as any);
  };

  // Tapping the card opens the full Manage Tournament hub (same screen TDs use).
  const handleTournamentPress = (tournament: BarTournamentWithStats) => {
    router.push({
      pathname: "/(tabs)/admin/manage-tournament/[id]",
      params: { id: String(tournament.id), name: tournament.name },
    } as any);
  };

  const handleArchiveTournament = (tournament: BarTournamentWithStats) => {
    Alert.alert(
      "Archive Tournament",
      `Are you sure you want to archive "${tournament.name}"? It will be hidden from public view but can be restored later.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Archive",
          style: "destructive",
          onPress: async () => {
            const success = await vm.archiveTournament(tournament.id);
            if (success) {
              Alert.alert("Success", "Tournament archived successfully.");
            } else {
              Alert.alert("Error", "Failed to archive tournament.");
            }
          },
        },
      ],
    );
  };

  const handleDeleteTournament = (tournament: BarTournamentWithStats) => {
    setTournamentToCancel(tournament);
    setCancelModalVisible(true);
  };

  const handleConfirmDelete = async (reason: string) => {
    if (!tournamentToCancel) return;
    const success = await vm.cancelTournament(tournamentToCancel.id, reason);
    setCancelModalVisible(false);
    setTournamentToCancel(null);
    if (success) {
      Alert.alert("Success", "Tournament deleted successfully.");
    } else {
      Alert.alert("Error", "Failed to delete tournament.");
    }
  };

  const handleRestoreTournament = (tournament: BarTournamentWithStats) => {
    Alert.alert(
      "Restore Tournament",
      `Are you sure you want to restore "${tournament.name}" to active status?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Restore",
          onPress: async () => {
            const success = await vm.restoreTournament(tournament.id);
            if (success) {
              Alert.alert("Success", "Tournament restored successfully.");
            } else {
              Alert.alert("Error", "Failed to restore tournament.");
            }
          },
        },
      ],
    );
  };

  const handleSearchDirectors = useCallback(async (query: string) => {
    if (query.length < 2) { setDirectorResults([]); return; }
    setSearchingDirectors(true);
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("id_auto, name, email")
        .or(`name.ilike.%${query}%,email.ilike.%${query}%`)
        .limit(10);
      if (error) { setDirectorResults([]); return; }
      setDirectorResults(
        (data || []).map((u: any) => ({ id: u.id_auto, name: u.name || u.email, email: u.email })),
      );
    } catch {
      setDirectorResults([]);
    } finally {
      setSearchingDirectors(false);
    }
  }, []);

  const handleConfirmReassign = useCallback(
    async (newDirectorId: number, newDirectorName: string, reason: string) => {
      if (!tournamentToReassign || !profile?.id_auto) return;
      try {
        const { error: updateError } = await supabase
          .from("tournaments")
          .update({ director_id: newDirectorId })
          .eq("id", tournamentToReassign.id);
        if (updateError) throw updateError;

        await supabase.from("reassignment_logs").insert({
          entity_type: "tournament_director",
          entity_id: tournamentToReassign.id,
          entity_name: tournamentToReassign.name,
          previous_user_id: tournamentToReassign.director_id,
          previous_user_name: tournamentToReassign.director_name,
          new_user_id: newDirectorId,
          new_user_name: newDirectorName,
          reason,
          reassigned_by: profile.id_auto,
          reassigned_by_name: profile.name || null,
        });

        await supabase.from("venue_directors").upsert(
          { venue_id: tournamentToReassign.venue_id, director_id: newDirectorId, assigned_by: profile.id_auto },
          { onConflict: "venue_id,director_id" },
        );

        const { data: newDirProfile } = await supabase
          .from("profiles")
          .select("role")
          .eq("id_auto", newDirectorId)
          .single();
        if (newDirProfile && newDirProfile.role === "basic_user") {
          await supabase.from("profiles").update({ role: "tournament_director" }).eq("id_auto", newDirectorId);
        }

        setReassignModalVisible(false);
        setTournamentToReassign(null);
        setDirectorResults([]);
        Alert.alert("Reassignment Complete", `"${tournamentToReassign.name}" has been reassigned to ${newDirectorName}.`);
        vm.onRefresh();
      } catch (error) {
        console.error("Error reassigning director:", error);
        Alert.alert("Error", "Failed to reassign director.");
      }
    },
    [tournamentToReassign, profile?.id_auto, profile?.name],
  );

  // Build the ⋯ action list for a tournament (same gating as the mobile card).
  const buildActions = (t: BarTournamentWithStats): ActionMenuItem[] => {
    const a: ActionMenuItem[] = [];
    if (t.can_edit) a.push({ label: "Edit", onPress: () => handleEditTournament(t.id) });
    a.push({ label: "Reassign Director", onPress: () => { setTournamentToReassign(t); setReassignModalVisible(true); } });
    if (t.can_delete) {
      if (t.status === "active") a.push({ label: "Delete", destructive: true, onPress: () => handleDeleteTournament(t) });
      if (t.status === "active" || t.status === "completed") a.push({ label: "Archive", onPress: () => handleArchiveTournament(t) });
      if (t.status === "cancelled" || t.status === "archived") a.push({ label: "Restore", onPress: () => handleRestoreTournament(t) });
    }
    return a;
  };

  const emptyMessage =
    vm.statusFilter === "active" ? "No active tournaments at your venues"
      : vm.statusFilter === "completed" ? "No completed tournaments"
        : vm.statusFilter === "cancelled" ? "No cancelled tournaments"
          : vm.statusFilter === "archived" ? "No archived tournaments"
            : "No tournaments found";

  if (vm.loading) {
    return (
      <View style={styles.centerContainer}>
        <Text allowFontScaling={false} style={styles.loadingText}>Loading tournaments...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <TournamentSoftwareModal
        visible={softwareOpen}
        busy={vm.creating}
        onClose={() => setSoftwareOpen(false)}
        onSelect={handleSelectSoftware}
      />
      {/* Delete Modal */}
      <DeleteModal
        visible={cancelModalVisible}
        tournamentName={tournamentToCancel?.name || ""}
        onCancel={() => { setCancelModalVisible(false); setTournamentToCancel(null); }}
        onConfirm={handleConfirmDelete}
      />

      {/* Reassign Director Modal */}
      <ReassignDirectorModal
        visible={reassignModalVisible}
        tournamentName={tournamentToReassign?.name || ""}
        currentDirector={tournamentToReassign?.director_name || ""}
        directors={directorResults}
        loadingDirectors={searchingDirectors}
        onSearch={handleSearchDirectors}
        onCancel={() => { setReassignModalVisible(false); setTournamentToReassign(null); setDirectorResults([]); }}
        onConfirm={handleConfirmReassign}
      />

      {isDesktop ? (
        /* \u2500\u2500 Desktop workspace: header + toolbar + table \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
        <ScrollView contentContainerStyle={styles.dtScroll} showsVerticalScrollIndicator={false}>
          <View style={styles.dtInner}>
            <View style={styles.dtHeader}>
              <View style={styles.dtHeaderText}>
                <TouchableOpacity onPress={() => router.back()} style={styles.dtBack} activeOpacity={0.7}>
                  <Ionicons name="arrow-back" size={15} color={COLORS.primary} />
                  <Text allowFontScaling={false} style={styles.dtBackText}>Back</Text>
                </TouchableOpacity>
                <Text allowFontScaling={false} style={styles.dtTitle}>Tournament Manager</Text>
                <Text allowFontScaling={false} style={styles.dtSubtitle}>Managing tournaments at your venues</Text>
              </View>
              <TouchableOpacity style={[styles.dtNewBtn, vm.creating && styles.newBtnDisabled]} onPress={() => setSoftwareOpen(true)} disabled={vm.creating} activeOpacity={0.85}>
                <Ionicons name="add" size={18} color="#FFFFFF" />
                <Text allowFontScaling={false} style={styles.dtNewText}>New Tournament</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.dtToolbar}>
              <View style={styles.dtSearch}>
                <Ionicons name="search" size={16} color={COLORS.textMuted} />
                <TextInput
                  allowFontScaling={false}
                  style={styles.dtSearchInput}
                  value={vm.searchQuery}
                  onChangeText={handleSearch}
                  placeholder="Search name, game type, venue, or director\u2026"
                  placeholderTextColor={COLORS.textMuted}
                />
                {vm.searchQuery.length > 0 && (
                  <TouchableOpacity onPress={() => handleSearch("")} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons name="close-circle" size={16} color={COLORS.textMuted} />
                  </TouchableOpacity>
                )}
              </View>
              <View style={styles.dtFilter}>
                <Dropdown
                  placeholder="Status"
                  value={vm.statusFilter}
                  onSelect={(v) => handleStatusFilter(v as TournamentStatusFilter)}
                  options={[
                    { label: `Active (${vm.statusCounts.active})`, value: "active" },
                    { label: `Completed (${vm.statusCounts.completed})`, value: "completed" },
                    { label: `Cancelled (${vm.statusCounts.cancelled})`, value: "cancelled" },
                    { label: `Archived (${vm.statusCounts.archived})`, value: "archived" },
                    { label: `All (${vm.statusCounts.all})`, value: "all" },
                  ]}
                />
              </View>
              <View style={styles.dtFilter}>
                <Dropdown
                  placeholder="Sort"
                  value={`${vm.sortOption}-${vm.sortDirection}`}
                  onSelect={handleSortSelect}
                  options={[
                    { label: "Newest", value: "date-desc" },
                    { label: "Oldest", value: "date-asc" },
                    { label: "A\u2013Z", value: "name-asc" },
                    { label: "Z\u2013A", value: "name-desc" },
                  ]}
                />
              </View>
            </View>

            {pagination.paginatedItems.length === 0 ? (
              <View style={styles.dtEmpty}>
                <EmptyState message={emptyMessage} submessage="Try adjusting your search or filters" />
              </View>
            ) : (
              <View style={styles.dtTable}>
                <View style={[styles.dtRow, styles.dtHeadRow]}>
                  <Text allowFontScaling={false} style={[styles.dtHcell, styles.colName]}>Tournament</Text>
                  <Text allowFontScaling={false} style={[styles.dtHcell, styles.colDate]}>Date &amp; Time</Text>
                  <Text allowFontScaling={false} style={[styles.dtHcell, styles.colVenue]}>Venue</Text>
                  <Text allowFontScaling={false} style={[styles.dtHcell, styles.colDir]}>Director</Text>
                  <Text allowFontScaling={false} style={[styles.dtHcell, styles.colFmt]}>Format</Text>
                  <Text allowFontScaling={false} style={[styles.dtHcell, styles.colStatus]}>Status</Text>
                  <Text allowFontScaling={false} style={[styles.dtHcell, styles.colActions]}>Actions</Text>
                </View>
                {pagination.paginatedItems.map((t) => (
                  <DesktopRow
                    key={t.id}
                    t={t}
                    actions={buildActions(t)}
                    processing={vm.processing === t.id}
                    onOpen={() => handleTournamentPress(t)}
                  />
                ))}
              </View>
            )}

            <View style={styles.dtPagination}>
              <Pagination
                totalCount={pagination.totalCount}
                displayStart={pagination.displayRange.start}
                displayEnd={pagination.displayRange.end}
                currentPage={pagination.currentPage}
                totalPages={pagination.totalPages}
                onPrevPage={pagination.prevPage}
                onNextPage={pagination.nextPage}
                canGoPrev={pagination.canGoPrev}
                canGoNext={pagination.canGoNext}
                noun="tournaments"
              />
            </View>
          </View>
        </ScrollView>
      ) : (
        /* \u2500\u2500 Mobile / narrow: unchanged card list \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
        <>
          <AdminHeader
            title="Tournament Manager"
            subtitle="Managing tournaments at your venues"
            onBack={() => router.back()}
          />

          <AdminSearchBar
            value={vm.searchQuery}
            onChangeText={handleSearch}
            placeholder="Search name, game type, venue, or director..."
            topFraction={0.04}
          />

          <AdminFilterRow>
            <Dropdown
              placeholder="Status"
              value={vm.statusFilter}
              onSelect={(v) => handleStatusFilter(v as TournamentStatusFilter)}
              options={[
                { label: `Active (${vm.statusCounts.active})`, value: "active" },
                { label: `Completed (${vm.statusCounts.completed})`, value: "completed" },
                { label: `Cancelled (${vm.statusCounts.cancelled})`, value: "cancelled" },
                { label: `Archived (${vm.statusCounts.archived})`, value: "archived" },
                { label: `All (${vm.statusCounts.all})`, value: "all" },
              ]}
            />
            <Dropdown
              placeholder="Sort"
              value={`${vm.sortOption}-${vm.sortDirection}`}
              onSelect={handleSortSelect}
              options={[
                { label: "Newest", value: "date-desc" },
                { label: "Oldest", value: "date-asc" },
                { label: "A\u2013Z", value: "name-asc" },
                { label: "Z\u2013A", value: "name-desc" },
              ]}
            />
          </AdminFilterRow>

          <View style={styles.newTournamentWrap}>
            <TouchableOpacity
              style={[styles.newTournamentBtn, vm.creating && styles.newBtnDisabled]}
              onPress={() => setSoftwareOpen(true)}
              disabled={vm.creating}
            >
              <Text allowFontScaling={false} style={styles.newTournamentBtnText}>
                + New Tournament
              </Text>
            </TouchableOpacity>
          </View>

          {/* Pagination */}
          <Pagination
            totalCount={pagination.totalCount}
            displayStart={pagination.displayRange.start}
            displayEnd={pagination.displayRange.end}
            currentPage={pagination.currentPage}
            totalPages={pagination.totalPages}
            onPrevPage={pagination.prevPage}
            onNextPage={pagination.nextPage}
            canGoPrev={pagination.canGoPrev}
            canGoNext={pagination.canGoNext}
          />

          <FlatList
            ref={listRef}
            data={pagination.paginatedItems}
            keyExtractor={(item) => item.id.toString()}
            contentContainerStyle={[styles.listContent, isWeb && styles.scrollContentWeb]}
            refreshControl={
              isWeb ? undefined : (
                <RefreshControl refreshing={vm.refreshing} onRefresh={vm.onRefresh} tintColor={COLORS.primary} />
              )
            }
            renderItem={({ item }) => (
              <TournamentCard
                tournament={item}
                onPress={() => handleTournamentPress(item)}
                onEdit={() => handleEditTournament(item.id)}
                onArchive={() => handleArchiveTournament(item)}
                onCancel={() => handleDeleteTournament(item)}
                onRestore={() => handleRestoreTournament(item)}
                onReassign={() => { setTournamentToReassign(item); setReassignModalVisible(true); }}
                isProcessing={vm.processing === item.id}
                showActions={true}
              />
            )}
            ListEmptyComponent={
              <EmptyState message={emptyMessage} submessage="Try adjusting your search or filters" />
            }
          />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  scrollContentWeb: { paddingBottom: SPACING.xl },
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },

  // ── Desktop workspace (web, ≥900px) ───────────────────────────────────────
  dtScroll: { alignItems: "center", paddingHorizontal: SPACING.xl, paddingVertical: SPACING.xl },
  dtInner: { width: "100%" as any, maxWidth: 1240 },
  dtHeader: { flexDirection: "row", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: SPACING.md, marginBottom: SPACING.lg },
  dtHeaderText: { flexGrow: 1, flexShrink: 1, minWidth: 240 },
  dtBack: { flexDirection: "row", alignItems: "center", gap: 4, marginBottom: SPACING.sm },
  dtBackText: { color: COLORS.primary, fontSize: FONT_SIZES.sm, fontWeight: "600" },
  dtTitle: { color: COLORS.text, fontSize: 26, fontWeight: "800" },
  dtSubtitle: { color: COLORS.textMuted, fontSize: FONT_SIZES.sm, marginTop: 2 },
  dtNewBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: COLORS.primary, borderRadius: RADIUS.md, paddingHorizontal: SPACING.md, height: 42, ...(isWeb ? ({ cursor: "pointer" } as object) : null) },
  dtNewText: { color: "#FFFFFF", fontSize: FONT_SIZES.sm, fontWeight: "800" },
  dtToolbar: { flexDirection: "row", alignItems: "center", gap: SPACING.sm, marginBottom: SPACING.lg },
  dtSearch: { flex: 1, flexDirection: "row", alignItems: "center", gap: SPACING.sm, height: 42, paddingHorizontal: SPACING.md, borderRadius: RADIUS.md, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  dtSearchInput: { flex: 1, color: COLORS.text, fontSize: FONT_SIZES.sm, ...(isWeb ? ({ outlineStyle: "none" } as object) : null) },
  dtFilter: { width: 180 },
  dtEmpty: { paddingVertical: SPACING.xl },
  dtTable: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.lg, overflow: "hidden" },
  dtRow: { flexDirection: "row", alignItems: "center", gap: SPACING.md, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, borderTopWidth: 1, borderTopColor: COLORS.border, ...(isWeb ? ({ cursor: "pointer" } as object) : null) },
  dtHeadRow: { borderTopWidth: 0, backgroundColor: COLORS.background, paddingVertical: SPACING.sm },
  dtRowHover: { backgroundColor: COLORS.surfaceLight },
  dtHcell: { color: COLORS.textMuted, fontSize: FONT_SIZES.xs, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.4 },
  dtCell: { color: COLORS.textSecondary, fontSize: FONT_SIZES.sm, lineHeight: FONT_SIZES.sm * 1.35 },
  dtName: { color: COLORS.text, fontSize: FONT_SIZES.md, fontWeight: "700" },
  dtNameSub: { color: COLORS.textMuted, fontSize: FONT_SIZES.xs, marginTop: 1, textTransform: "capitalize" },
  dtFmtBadge: { alignSelf: "flex-start", backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.sm, paddingHorizontal: SPACING.sm, paddingVertical: 2 },
  dtFmtText: { color: COLORS.textSecondary, fontSize: FONT_SIZES.xs, fontWeight: "700", textTransform: "capitalize" },
  dtStatusBadge: { alignSelf: "flex-start", borderRadius: RADIUS.full, paddingHorizontal: SPACING.sm, paddingVertical: 2 },
  dtStatusText: { fontSize: FONT_SIZES.xs, fontWeight: "700", textTransform: "capitalize" },
  dtOpenBtn: { backgroundColor: COLORS.primary, borderRadius: RADIUS.sm, paddingHorizontal: SPACING.sm, height: 34, alignItems: "center", justifyContent: "center", ...(isWeb ? ({ cursor: "pointer" } as object) : null) },
  dtOpenText: { color: "#FFFFFF", fontSize: FONT_SIZES.xs, fontWeight: "700" },
  dtPagination: { marginTop: SPACING.md },
  colName: { flex: 2.4, minWidth: 0 },
  colDate: { flex: 1.4 },
  colVenue: { flex: 1.5 },
  colDir: { flex: 1.3 },
  colFmt: { flex: 1.1 },
  colStatus: { flex: 0.9 },
  colActions: { width: 188, flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: SPACING.xs },
  centerContainer: {
    flex: 1,
    backgroundColor: COLORS.background,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    fontSize: wxMs(FONT_SIZES.md),
    color: COLORS.textSecondary,
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
  headerWeb: { paddingTop: SPACING.lg },
  backButton: { padding: SPACING.xs },
  backText: {
    fontSize: wxMs(FONT_SIZES.sm),
    color: COLORS.primary,
    fontWeight: "500",
  },
  headerCenter: { alignItems: "center" },
  headerTitle: {
    fontSize: wxMs(FONT_SIZES.lg),
    fontWeight: "600",
    color: COLORS.text,
    letterSpacing: 0.5,
  },
  headerSubtitle: {
    fontSize: wxMs(FONT_SIZES.xs),
    color: COLORS.textSecondary,
    opacity: 0.7,
    marginTop: wxSc(2),
  },
  placeholder: { width: wxSc(50) },
  newBtnDisabled: { opacity: 0.6 },
  newTournamentWrap: {
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.sm,
  },
  newTournamentBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.primary,
    borderRadius: wxSc(8),
    paddingVertical: wxSc(SPACING.sm),
  },
  newTournamentBtnText: { fontSize: wxMs(FONT_SIZES.sm), fontWeight: "800", color: COLORS.white },
  searchContainer: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    backgroundColor: COLORS.background,
  },
  searchInputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.surface,
    borderRadius: wxSc(8),
    paddingHorizontal: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    height: wxSc(40),
  },
  searchIcon: {
    fontSize: wxMs(14),
    marginRight: SPACING.sm,
    opacity: 0.6,
  },
  searchInput: {
    flex: 1,
    fontSize: wxMs(FONT_SIZES.sm),
    color: COLORS.text,
    height: wxSc(40),
  },
  tabsContainer: {
    backgroundColor: COLORS.background,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  tabsContent: {
    paddingHorizontal: SPACING.md,
    flexDirection: "row",
    alignItems: "center",
    minHeight: wxSc(48),
  },
  tab: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
    marginRight: SPACING.xs,
  },
  tabActive: { borderBottomColor: COLORS.primary },
  tabText: {
    fontSize: wxMs(FONT_SIZES.md),
    color: COLORS.textSecondary,
    fontWeight: "500",
  },
  tabTextActive: {
    color: COLORS.primary,
    fontWeight: "600",
  },
  sortContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    backgroundColor: COLORS.background,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  sortLabel: {
    fontSize: wxMs(FONT_SIZES.sm),
    color: COLORS.textSecondary,
    marginRight: SPACING.sm,
  },
  sortOptions: {
    flexDirection: "row",
    gap: SPACING.xs,
  },
  sortPill: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: wxSc(16),
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  sortPillActive: {
    backgroundColor: COLORS.primary + "20",
    borderColor: COLORS.primary,
  },
  sortPillText: {
    fontSize: wxMs(FONT_SIZES.sm),
    color: COLORS.textSecondary,
  },
  sortPillTextActive: {
    color: COLORS.primary,
    fontWeight: "600",
  },
  listContent: {
    padding: SPACING.md,
    paddingBottom: SPACING.xl * 2,
  },
  reassignBtn: {
    backgroundColor: "#FF980020",
    borderWidth: 1,
    borderColor: "#FF9800",
    borderRadius: wxSc(8),
    paddingVertical: SPACING.sm,
    alignItems: "center",
    marginTop: -SPACING.sm,
    marginBottom: SPACING.md,
    marginHorizontal: SPACING.xs,
  },
  reassignBtnText: {
    color: "#FF9800",
    fontSize: wxMs(FONT_SIZES.sm),
    fontWeight: "600",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "center",
    alignItems: "center",
    padding: SPACING.lg,
  },
  modalContent: {
    backgroundColor: COLORS.surface,
    borderRadius: wxSc(12),
    padding: SPACING.lg,
    width: "100%",
    maxWidth: wxSc(400),
  },
  modalTitle: {
    fontSize: wxMs(FONT_SIZES.lg),
    fontWeight: "700",
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },
  modalSubtitle: {
    fontSize: wxMs(FONT_SIZES.md),
    color: COLORS.textSecondary,
    marginBottom: SPACING.lg,
  },
  modalLabel: {
    fontSize: wxMs(FONT_SIZES.sm),
    color: COLORS.text,
    marginBottom: SPACING.xs,
    fontWeight: "500",
  },
  modalInput: {
    backgroundColor: COLORS.background,
    borderRadius: wxSc(8),
    padding: SPACING.sm,
    fontSize: wxMs(FONT_SIZES.sm),
    color: COLORS.text,
    borderWidth: 1,
    borderColor: COLORS.border,
    minHeight: wxSc(80),
    textAlignVertical: "top",
  },
  modalButtons: {
    flexDirection: "row",
    marginTop: SPACING.lg,
    gap: SPACING.sm,
  },
  modalButtonCancel: {
    flex: 1,
    paddingVertical: SPACING.sm,
    borderRadius: wxSc(8),
    alignItems: "center",
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  modalButtonCancelText: {
    color: COLORS.text,
    fontSize: wxMs(FONT_SIZES.sm),
    fontWeight: "600",
  },
  modalButtonConfirm: {
    flex: 1,
    paddingVertical: SPACING.sm,
    borderRadius: wxSc(8),
    alignItems: "center",
    backgroundColor: COLORS.error,
  },
  modalButtonConfirmText: {
    color: "#FFFFFF",
    fontSize: wxMs(FONT_SIZES.sm),
    fontWeight: "600",
  },
});