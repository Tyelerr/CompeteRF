// app/(tabs)/admin/venue-management.tsx
// UPDATED: Venue ID badges, DELETE old owners on reassign

import { useRouter } from "expo-router";
import { useCallback, useState } from "react";
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { supabase } from "../../../src/lib/supabase";
import { useAuthContext } from "../../../src/providers/AuthProvider";
import { COLORS } from "../../../src/theme/colors";
import { SPACING } from "../../../src/theme/spacing";
import { FONT_SIZES } from "../../../src/theme/typography";
import { useAdminVenues } from "../../../src/viewmodels/useAdminVenues";
import { Dropdown } from "../../../src/views/components/common/dropdown";
import { Pagination } from "../../../src/views/components/common/pagination";
import { EmptyState } from "../../../src/views/components/dashboard";
import { BarOwnerVenueCard } from "../../../src/views/components/venues";

const isWeb = Platform.OS === "web";

// ── Reassign Owner Modal ──────────────────────────────────────────────
interface UserSearchResult {
  id: number;
  name: string;
  email: string;
}

const ReassignOwnerModal = ({
  visible,
  venueName,
  currentOwnerName,
  onCancel,
  onConfirm,
}: {
  visible: boolean;
  venueName: string;
  currentOwnerName: string;
  onCancel: () => void;
  onConfirm: (userId: number, userName: string, reason: string) => void;
}) => {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UserSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<UserSearchResult | null>(null);
  const [reason, setReason] = useState("");

  const handleSearch = async (q: string) => {
    setQuery(q);
    if (q.length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("id_auto, name, email")
        .or(`name.ilike.%${q}%,email.ilike.%${q}%`)
        .limit(10);
      if (error) {
        setResults([]);
        return;
      }
      setResults(
        (data || []).map((u: any) => ({
          id: u.id_auto,
          name: u.name || u.email,
          email: u.email,
        })),
      );
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  };

  const reset = () => {
    setQuery("");
    setResults([]);
    setSelected(null);
    setReason("");
  };

  const handleConfirm = () => {
    if (!selected) {
      Alert.alert("Required", "Please select an owner.");
      return;
    }
    if (!reason.trim()) {
      Alert.alert("Required", "Please enter a reason.");
      return;
    }

    Alert.alert(
      "Confirm Reassignment",
      `Reassign ownership of "${venueName}"?\n\nFrom: ${currentOwnerName || "Current owner(s)"}\nTo: ${selected.name}\n\nReason: ${reason.trim()}\n\nAll previous owners will be removed from this venue.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Confirm",
          style: "destructive",
          onPress: () => {
            onConfirm(selected.id, selected.name, reason.trim());
            reset();
          },
        },
      ],
    );
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <KeyboardAvoidingView
        style={ms.overlay}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          contentContainerStyle={ms.scrollContent}
          keyboardShouldPersistTaps="handled"
          bounces={false}
        >
          <View style={ms.content}>
            <Text style={ms.title}>{"\uD83D\uDD04"} Reassign Venue Owner</Text>
            <Text style={ms.subtitle}>{`"${venueName}"`}</Text>

            {currentOwnerName ? (
              <View style={ms.currentRow}>
                <Text style={ms.currentLabel}>Current Owner:</Text>
                <Text style={ms.currentValue}>{currentOwnerName}</Text>
              </View>
            ) : null}

            <Text style={ms.label}>Search New Owner *</Text>
            <TextInput
              style={ms.searchInput}
              placeholder="Type name or email..."
              placeholderTextColor={COLORS.textSecondary}
              value={query}
              onChangeText={handleSearch}
            />

            {results.length > 0 && (
              <View style={ms.resultsBox}>
                {results.slice(0, 10).map((item) => (
                  <TouchableOpacity
                    key={item.id}
                    style={[
                      ms.resultItem,
                      selected?.id === item.id && ms.resultItemActive,
                    ]}
                    onPress={() => setSelected(item)}
                  >
                    <Text
                      style={[
                        ms.resultName,
                        selected?.id === item.id && ms.resultNameActive,
                      ]}
                    >
                      {item.name}
                    </Text>
                    <Text style={ms.resultDetail}>{item.email}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
            {searching && <Text style={ms.hint}>Searching...</Text>}
            {query.length > 0 && query.length < 2 && !searching && (
              <Text style={ms.hint}>Type at least 2 characters</Text>
            )}

            {selected && (
              <View style={ms.selectedBadge}>
                <Text style={ms.selectedText}>
                  {"\u2713"} {selected.name}
                </Text>
                <TouchableOpacity onPress={() => setSelected(null)}>
                  <Text style={ms.selectedClear}>{"\u2715"}</Text>
                </TouchableOpacity>
              </View>
            )}

            <Text style={[ms.label, { marginTop: SPACING.md }]}>Reason *</Text>
            <TextInput
              style={ms.textArea}
              placeholder="Enter reason for reassignment..."
              placeholderTextColor={COLORS.textSecondary}
              value={reason}
              onChangeText={setReason}
              multiline
              numberOfLines={3}
            />

            <View style={ms.buttons}>
              <TouchableOpacity
                style={ms.btnCancel}
                onPress={() => {
                  reset();
                  onCancel();
                }}
      >
                <Text style={ms.btnCancelText}>Back</Text>
              </TouchableOpacity>
              <TouchableOpacity style={ms.btnConfirm} onPress={handleConfirm}>
                <Text style={ms.btnConfirmText}>Reassign</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
};

// ── Main Screen ───────────────────────────────────────────────────────
export default function VenueManagementScreen() {
  const router = useRouter();
  const vm = useAdminVenues();
  const { profile } = useAuthContext();

  const [reassignVis, setReassignVis] = useState(false);
  const [venueToReassign, setVenueToReassign] = useState<any>(null);
  const [currentOwnerName, setCurrentOwnerName] = useState("");

  const handleVenuePress = (venueId: number) => {
    router.push(`/(tabs)/admin/edit-venue/${venueId}` as any);
  };
  const handleManageTables = (venueId: number) => {
    router.push(`/(tabs)/admin/edit-venue/${venueId}?tab=tables` as any);
  };
  const handleManageDirectors = (venueId: number) => {
    router.push(`/(tabs)/admin/edit-venue/${venueId}?tab=directors` as any);
  };
  const handleCreateVenue = () => {
    router.push("/(tabs)/admin/create-venue" as any);
  };

  // Look up current owner(s) when opening modal
  const openReassignModal = useCallback(async (venue: any) => {
    setVenueToReassign(venue);
    try {
      const { data } = await supabase
        .from("venue_owners")
        .select("owner_id, profiles!venue_owners_owner_id_fkey(name)")
        .eq("venue_id", venue.id)
        .is("archived_at", null);

      if (data && data.length > 0) {
        const names = data
          .map((d: any) => d.profiles?.name || "Unknown")
          .join(", ");
        setCurrentOwnerName(names);
      } else {
        setCurrentOwnerName("No current owner");
      }
    } catch {
      setCurrentOwnerName("Unknown");
    }
    setReassignVis(true);
  }, []);

  const handleReassignOwner = useCallback(
    async (newOwnerId: number, newOwnerName: string, reason: string) => {
      if (!venueToReassign || !profile?.id_auto) return;

      try {
        // 1. Get current owners for logging
        const { data: currentOwners } = await supabase
          .from("venue_owners")
          .select("id, owner_id, profiles!venue_owners_owner_id_fkey(name)")
          .eq("venue_id", venueToReassign.id)
          .is("archived_at", null);

        const previousOwnerNames =
          currentOwners
            ?.map((o: any) => o.profiles?.name || "Unknown")
            .join(", ") || "None";
        const previousOwnerId = currentOwners?.[0]?.owner_id || profile.id_auto;

        // 2. DELETE all current owners for this venue
        await supabase
          .from("venue_owners")
          .delete()
          .eq("venue_id", venueToReassign.id);

        // 3. Insert new owner
        const { error: insertError } = await supabase
          .from("venue_owners")
          .insert({
            venue_id: venueToReassign.id,
            owner_id: newOwnerId,
            assigned_by: profile.id_auto,
          });

        if (insertError) throw insertError;

        // 4. Promote new owner to bar_owner if basic_user
        const { data: newOwnerProfile } = await supabase
          .from("profiles")
          .select("role")
          .eq("id_auto", newOwnerId)
          .single();

        if (newOwnerProfile && newOwnerProfile.role === "basic_user") {
          await supabase
            .from("profiles")
            .update({ role: "bar_owner" })
            .eq("id_auto", newOwnerId);
        }

        // 5. Demote old owners to basic_user if they have no remaining venues or tournaments
        if (currentOwners) {
          for (const oldOwner of currentOwners) {
            const oid = oldOwner.owner_id;
            if (oid === newOwnerId) continue; // skip if reassigning to same person

            const { count: remainingVenues } = await supabase
              .from("venue_owners")
              .select("id", { count: "exact", head: true })
              .eq("owner_id", oid)
              .is("archived_at", null);

            const { count: activeTournaments } = await supabase
              .from("tournaments")
              .select("id", { count: "exact", head: true })
              .eq("director_id", oid)
              .eq("status", "active");

            const { count: directedVenues } = await supabase
              .from("venue_directors")
              .select("id", { count: "exact", head: true })
              .eq("director_id", oid)
              .is("archived_at", null);

            if (
              (remainingVenues || 0) === 0 &&
              (activeTournaments || 0) === 0 &&
              (directedVenues || 0) === 0
            ) {
              await supabase
                .from("profiles")
                .update({ role: "basic_user" })
                .eq("id_auto", oid);
            }
          }
        }

        // 6. Log the reassignment
        await supabase.from("reassignment_logs").insert({
          entity_type: "venue_owner",
          entity_id: venueToReassign.id,
          entity_name:
            venueToReassign.venue || venueToReassign.name || "Unknown",
          previous_user_id: previousOwnerId,
          previous_user_name: previousOwnerNames,
          new_user_id: newOwnerId,
          new_user_name: newOwnerName,
          reason,
          reassigned_by: profile.id_auto,
          reassigned_by_name: profile.name || null,
        });

        setReassignVis(false);
        setVenueToReassign(null);
        setCurrentOwnerName("");
        Alert.alert(
          "Reassignment Complete",
          `"${venueToReassign.venue || venueToReassign.name}" is now owned by ${newOwnerName}.\n\nAll previous owners have been removed.`,
        );
        vm.onRefresh();
      } catch (error) {
        console.error("Error reassigning venue owner:", error);
        Alert.alert("Error", "Failed to reassign venue owner.");
      }
    },
    [venueToReassign, profile?.id_auto, profile?.name],
  );

  if (vm.loading) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.loadingText}>Loading venues...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ReassignOwnerModal
        visible={reassignVis}
        venueName={venueToReassign?.venue || venueToReassign?.name || ""}
        currentOwnerName={currentOwnerName}
        onCancel={() => {
          setReassignVis(false);
          setVenueToReassign(null);
          setCurrentOwnerName("");
        }}
        onConfirm={handleReassignOwner}
      />

      <View style={[styles.header, isWeb && styles.headerWeb]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Text style={styles.backText}>{"\u2190"} Back</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>VENUE MANAGEMENT</Text>
          <Text style={styles.headerSubtitle}>
            {vm.totalCount} total venues
          </Text>
        </View>
        <View style={styles.placeholder} />
      </View>

      <View style={styles.searchRow}>
        <View style={styles.searchContainer}>
          <Text style={styles.searchIcon}>{"\uD83D\uDD0D"}</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Search venues..."
            placeholderTextColor={COLORS.textSecondary}
            value={vm.searchQuery}
            onChangeText={vm.setSearchQuery}
          />
        </View>
        <TouchableOpacity style={styles.addButton} onPress={handleCreateVenue}>
          <Text style={styles.addButtonText}>+ Add Venue</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.sortRow}>
        <View style={styles.sortContainer}>
          <Dropdown
            options={vm.sortOptions}
            value={vm.sortOption}
            onSelect={(value) => vm.setSortOption(value as any)}
            placeholder="Sort"
          />
        </View>
      </View>

      <Pagination
        totalCount={vm.totalCount}
        displayStart={vm.displayStart}
        displayEnd={vm.displayEnd}
        currentPage={vm.currentPage}
        totalPages={vm.totalPages}
        onPrevPage={vm.goToPrevPage}
        onNextPage={vm.goToNextPage}
        canGoPrev={vm.canGoPrev}
        canGoNext={vm.canGoNext}
      />

      <FlatList
        data={vm.venues}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={[styles.listContent, isWeb && styles.scrollContentWeb]}
        refreshControl={
          isWeb ? undefined : (
            <RefreshControl refreshing={vm.refreshing}
            onRefresh={vm.onRefresh}
            tintColor={COLORS.primary}/>
          )
        }
        renderItem={({ item }) => (
          <View>
            {/* Venue ID badge */}
            <View style={styles.idBadgeRow}>
              <View style={styles.idBadge}>
                <Text style={styles.idBadgeText}>ID: {item.id}</Text>
              </View>
            </View>
            <BarOwnerVenueCard
              venue={item}
              onPress={() => handleVenuePress(item.id)}
              onManageTables={() => handleManageTables(item.id)}
              onManageDirectors={() => handleManageDirectors(item.id)}
            />
            {(profile?.role === "super_admin" ||
              profile?.role === "compete_admin") && (
              <TouchableOpacity
                style={styles.reassignOwnerBtn}
                onPress={() => openReassignModal(item)}
              >
                <Text style={styles.reassignOwnerText}>
                  {"\uD83D\uDD04"} Reassign Owner
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}
        ListEmptyComponent={
          <EmptyState
            message="No venues found"
            submessage="Try a different search or add a new venue"
          />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  // Web centering
  scrollContentWeb: {
    alignItems: "center",
    paddingBottom: SPACING.xl,
  },
  container: {
    ...Platform.select({ web: { maxWidth: 860, width: "100%" as any, alignSelf: "center" as any } }), flex: 1, backgroundColor: COLORS.background },
  centerContainer: {
    flex: 1,
    backgroundColor: COLORS.background,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: { fontSize: FONT_SIZES.md, color: COLORS.textSecondary },
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
  backButton: { padding: SPACING.xs },
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
  headerSubtitle: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    opacity: 0.7,
    marginTop: 2,
  },
  placeholder: { width: 50 },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.xl,
    gap: SPACING.md,
  },
  searchContainer: {
    flex: 0.7,
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
  addButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: 8,
    height: 40,
    justifyContent: "center",
  },
  addButtonText: { fontSize: FONT_SIZES.sm, fontWeight: "600", color: "#fff" },
  sortRow: {
    flexDirection: "row",
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.sm,
  },
  sortContainer: { width: 120 },
  listContent: { padding: SPACING.md, paddingBottom: SPACING.xl * 2 },
  // ID Badge
  idBadgeRow: { flexDirection: "row", marginBottom: SPACING.xs },
  idBadge: {
    backgroundColor: COLORS.textSecondary + "30",
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: 8,
  },
  idBadgeText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: "600",
    color: COLORS.textSecondary,
  },
  // Reassign button
  reassignOwnerBtn: {
    backgroundColor: "#FF980020",
    borderWidth: 1,
    borderColor: "#FF9800",
    borderRadius: 8,
    paddingVertical: SPACING.sm,
    alignItems: "center",
    marginTop: -SPACING.sm,
    marginBottom: SPACING.md,
    marginHorizontal: SPACING.xs,
  },
  reassignOwnerText: {
    color: "#FF9800",
    fontSize: FONT_SIZES.sm,
    fontWeight: "600",
  },
});

const ms = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)" },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: SPACING.lg,
  },
  content: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: SPACING.lg,
    width: "100%",
    maxWidth: 400,
  },
  title: {
    fontSize: FONT_SIZES.lg,
    fontWeight: "700",
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },
  subtitle: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textSecondary,
    marginBottom: SPACING.xs,
  },
  currentRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.background,
    borderRadius: 8,
    padding: SPACING.sm,
    marginBottom: SPACING.md,
    borderLeftWidth: 3,
    borderLeftColor: "#FF9800",
  },
  currentLabel: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    marginRight: SPACING.xs,
  },
  currentValue: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.text,
    fontWeight: "600",
    flex: 1,
  },
  label: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.text,
    marginBottom: SPACING.xs,
    fontWeight: "500",
  },
  searchInput: {
    backgroundColor: COLORS.background,
    borderRadius: 8,
    padding: SPACING.sm,
    fontSize: FONT_SIZES.sm,
    color: COLORS.text,
    borderWidth: 1,
    borderColor: COLORS.border,
    height: 40,
  },
  resultsBox: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    marginTop: SPACING.xs,
    overflow: "hidden",
    maxHeight: 160,
  },
  resultItem: {
    padding: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  resultItemActive: { backgroundColor: COLORS.primary + "20" },
  resultName: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.text,
    fontWeight: "500",
  },
  resultNameActive: { color: COLORS.primary, fontWeight: "700" },
  resultDetail: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  hint: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
    fontStyle: "italic",
  },
  selectedBadge: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: COLORS.success + "20",
    borderRadius: 8,
    padding: SPACING.sm,
    marginTop: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.success,
  },
  selectedText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.success,
    fontWeight: "600",
    flex: 1,
  },
  selectedClear: {
    fontSize: FONT_SIZES.md,
    color: COLORS.success,
    paddingLeft: SPACING.sm,
  },
  textArea: {
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
  buttons: { flexDirection: "row", marginTop: SPACING.lg, gap: SPACING.sm },
  btnCancel: {
    flex: 1,
    paddingVertical: SPACING.sm,
    borderRadius: 8,
    alignItems: "center",
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  btnCancelText: {
    color: COLORS.text,
    fontSize: FONT_SIZES.sm,
    fontWeight: "600",
  },
  btnConfirm: {
    flex: 1,
    paddingVertical: SPACING.sm,
    borderRadius: 8,
    alignItems: "center",
    backgroundColor: "#FF9800",
  },
  btnConfirmText: {
    color: "#FFFFFF",
    fontSize: FONT_SIZES.sm,
    fontWeight: "600",
  },
});