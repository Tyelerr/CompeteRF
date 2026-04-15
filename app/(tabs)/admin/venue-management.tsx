// app/(tabs)/admin/venue-management.tsx
// Tabs: Venues | Audit Log | Billing

import { moderateScale, scale } from "../../../src/utils/scaling";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
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
import { RADIUS, SPACING } from "../../../src/theme/spacing";
import { FONT_SIZES } from "../../../src/theme/typography";
import { useAdminVenues } from "../../../src/viewmodels/useAdminVenues";
import { useVenueAudit, VenueAuditRecord } from "../../../src/viewmodels/useVenueAudit";
import { Dropdown } from "../../../src/views/components/common/dropdown";
import { Pagination } from "../../../src/views/components/common/pagination";
import { EmptyState } from "../../../src/views/components/dashboard";
import { BarOwnerVenueCard } from "../../../src/views/components/venues";

const isWeb = Platform.OS === "web";

type AdminVenueTab = "venues" | "audit" | "billing";

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
    if (q.length < 2) { setResults([]); return; }
    setSearching(true);
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("id_auto, name, email")
        .or(`name.ilike.%${q}%,email.ilike.%${q}%`)
        .limit(10);
      if (error) { setResults([]); return; }
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
    setQuery(""); setResults([]); setSelected(null); setReason("");
  };

  const handleConfirm = () => {
    if (!selected) { Alert.alert("Required", "Please select an owner."); return; }
    if (!reason.trim()) { Alert.alert("Required", "Please enter a reason."); return; }
    Alert.alert(
      "Confirm Reassignment",
      `Reassign ownership of "${venueName}"?\n\nFrom: ${currentOwnerName || "Current owner(s)"}\nTo: ${selected.name}\n\nReason: ${reason.trim()}\n\nAll previous owners will be removed from this venue.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Confirm",
          style: "destructive",
          onPress: () => { onConfirm(selected.id, selected.name, reason.trim()); reset(); },
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
            <Text allowFontScaling={false} style={ms.title}>{"\uD83D\uDD04"} Reassign Venue Owner</Text>
            <Text allowFontScaling={false} style={ms.subtitle}>{`"${venueName}"`}</Text>
            {currentOwnerName ? (
              <View style={ms.currentRow}>
                <Text allowFontScaling={false} style={ms.currentLabel}>Current Owner:</Text>
                <Text allowFontScaling={false} style={ms.currentValue}>{currentOwnerName}</Text>
              </View>
            ) : null}
            <Text allowFontScaling={false} style={ms.label}>Search New Owner *</Text>
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
                    style={[ms.resultItem, selected?.id === item.id && ms.resultItemActive]}
                    onPress={() => setSelected(item)}
                  >
                    <Text allowFontScaling={false} style={[ms.resultName, selected?.id === item.id && ms.resultNameActive]}>
                      {item.name}
                    </Text>
                    <Text allowFontScaling={false} style={ms.resultDetail}>{item.email}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
            {searching && <Text allowFontScaling={false} style={ms.hint}>Searching...</Text>}
            {query.length > 0 && query.length < 2 && !searching && (
              <Text allowFontScaling={false} style={ms.hint}>Type at least 2 characters</Text>
            )}
            {selected && (
              <View style={ms.selectedBadge}>
                <Text allowFontScaling={false} style={ms.selectedText}>{"\u2713"} {selected.name}</Text>
                <TouchableOpacity onPress={() => setSelected(null)}>
                  <Text allowFontScaling={false} style={ms.selectedClear}>{"\u2715"}</Text>
                </TouchableOpacity>
              </View>
            )}
            <Text allowFontScaling={false} style={[ms.label, { marginTop: SPACING.md }]}>Reason *</Text>
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
              <TouchableOpacity style={ms.btnCancel} onPress={() => { reset(); onCancel(); }}>
                <Text allowFontScaling={false} style={ms.btnCancelText}>Back</Text>
              </TouchableOpacity>
              <TouchableOpacity style={ms.btnConfirm} onPress={handleConfirm}>
                <Text allowFontScaling={false} style={ms.btnConfirmText}>Reassign</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
};

// ── Audit Log Tab ─────────────────────────────────────────────────────
const AuditLogTab = ({
  records,
  loading,
}: {
  records: VenueAuditRecord[];
  loading: boolean;
}) => {
  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator color={COLORS.primary} />
        <Text allowFontScaling={false} style={[styles.loadingText, { marginTop: SPACING.sm }]}>
          Loading audit records...
        </Text>
      </View>
    );
  }

  if (records.length === 0) {
    return (
      <EmptyState
        message="No audit records yet"
        submessage="Bar owners will be prompted to verify their venue info on first login and every 6 months"
      />
    );
  }

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    } catch {
      return iso;
    }
  };

  return (
    <FlatList
      data={records}
      keyExtractor={(item) => item.id.toString()}
      contentContainerStyle={styles.listContent}
      renderItem={({ item }) => (
        <View style={styles.auditCard}>
          <View style={styles.auditCardHeader}>
            <View style={styles.auditCardLeft}>
              <Text allowFontScaling={false} style={styles.auditVenueName}>
                {"\uD83C\uDFE2"} {item.venue_name}
              </Text>
              <Text allowFontScaling={false} style={styles.auditOwnerName}>
                {"\uD83D\uDC64"} {item.owner_name}
              </Text>
            </View>
            <View style={styles.auditCardRight}>
              <View
                style={[
                  styles.auditTypeBadge,
                  item.audit_type === "initial"
                    ? styles.auditTypeBadgeInitial
                    : styles.auditTypeBadgePeriodic,
                ]}
              >
                <Text
                  allowFontScaling={false}
                  style={[
                    styles.auditTypeBadgeText,
                    item.audit_type === "initial"
                      ? styles.auditTypeBadgeTextInitial
                      : styles.auditTypeBadgeTextPeriodic,
                  ]}
                >
                  {item.audit_type === "initial" ? "Initial" : "Periodic"}
                </Text>
              </View>
              <Text allowFontScaling={false} style={styles.auditDate}>
                {formatDate(item.completed_at)}
              </Text>
            </View>
          </View>

          <View style={styles.auditMeta}>
            <View style={styles.auditMetaItem}>
              <Text allowFontScaling={false} style={styles.auditMetaIcon}>
                {item.has_leagues ? "\u2705" : "\u274C"}
              </Text>
              <Text allowFontScaling={false} style={styles.auditMetaText}>Leagues</Text>
            </View>
            <View style={styles.auditMetaItem}>
              <Text allowFontScaling={false} style={styles.auditMetaIcon}>
                {item.has_tournaments ? "\u2705" : "\u274C"}
              </Text>
              <Text allowFontScaling={false} style={styles.auditMetaText}>Tournaments</Text>
            </View>
            <View style={styles.auditMetaItem}>
              <Text allowFontScaling={false} style={styles.auditMetaIcon}>{"\uD83C\uDFB1"}</Text>
              <Text allowFontScaling={false} style={styles.auditMetaText}>
                {item.table_count} {item.table_count === 1 ? "table" : "tables"}
              </Text>
            </View>
            <View style={styles.auditMetaItem}>
              <Text allowFontScaling={false} style={styles.auditMetaIcon}>
                {item.website ? "\uD83C\uDF10" : "\u2014"}
              </Text>
              <Text allowFontScaling={false} style={styles.auditMetaText}>
                {item.website ? "Has website" : "No website"}
              </Text>
            </View>
          </View>

          {item.brands && item.brands.length > 0 && (
            <View style={styles.auditBrands}>
              {item.brands.map((b) => (
                <View key={b} style={styles.auditBrandChip}>
                  <Text allowFontScaling={false} style={styles.auditBrandChipText}>{b}</Text>
                </View>
              ))}
            </View>
          )}

          {item.notes ? (
            <Text allowFontScaling={false} style={styles.auditNotes}>
              {"\uD83D\uDCDD"} {item.notes}
            </Text>
          ) : null}
        </View>
      )}
    />
  );
};

// ── Billing Placeholder Tab ───────────────────────────────────────────
const BillingTab = () => (
  <ScrollView contentContainerStyle={styles.billingContainer}>
    <Text allowFontScaling={false} style={styles.billingEmoji}>{"\uD83D\uDCB3"}</Text>
    <Text allowFontScaling={false} style={styles.billingTitle}>Billing</Text>
    <Text allowFontScaling={false} style={styles.billingSubtitle}>Coming Soon</Text>
    <Text allowFontScaling={false} style={styles.billingBody}>
      Subscription management, invoice history, payment methods, and billing
      settings will be available here.
    </Text>

    <View style={styles.billingPlaceholderCard}>
      <Text allowFontScaling={false} style={styles.billingPlaceholderRow}>
        {"\uD83D\uDCCB"} Subscription plans
      </Text>
      <Text allowFontScaling={false} style={styles.billingPlaceholderRow}>
        {"\uD83E\uDDFE"} Invoice history
      </Text>
      <Text allowFontScaling={false} style={styles.billingPlaceholderRow}>
        {"\uD83D\uDD12"} Secure payment methods
      </Text>
      <Text allowFontScaling={false} style={styles.billingPlaceholderRow}>
        {"\uD83D\uDCCA"} Usage analytics per venue
      </Text>
    </View>
  </ScrollView>
);

// ── Main Screen ───────────────────────────────────────────────────────
export default function VenueManagementScreen() {
  const router = useRouter();
  const vm = useAdminVenues();
  const { profile } = useAuthContext();
  const auditVM = useVenueAudit();

  const [activeTab, setActiveTab] = useState<AdminVenueTab>("venues");
  const [reassignVis, setReassignVis] = useState(false);
  const [venueToReassign, setVenueToReassign] = useState<any>(null);
  const [currentOwnerName, setCurrentOwnerName] = useState("");
  const listRef = useRef<any>(null);

  useEffect(() => {
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
  }, [vm.currentPage]);

  useEffect(() => {
    if (activeTab === "audit") auditVM.loadAuditRecords();
  }, [activeTab]);

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

  const openReassignModal = useCallback(async (venue: any) => {
    setVenueToReassign(venue);
    try {
      const { data } = await supabase
        .from("venue_owners")
        .select("owner_id, profiles!venue_owners_owner_id_fkey(name)")
        .eq("venue_id", venue.id)
        .is("archived_at", null);
      if (data && data.length > 0) {
        const names = data.map((d: any) => d.profiles?.name || "Unknown").join(", ");
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
        const { data: currentOwners } = await supabase
          .from("venue_owners")
          .select("id, owner_id, profiles!venue_owners_owner_id_fkey(name)")
          .eq("venue_id", venueToReassign.id)
          .is("archived_at", null);

        const previousOwnerNames =
          currentOwners?.map((o: any) => o.profiles?.name || "Unknown").join(", ") || "None";
        const previousOwnerId = currentOwners?.[0]?.owner_id || profile.id_auto;

        await supabase.from("venue_owners").delete().eq("venue_id", venueToReassign.id);

        const { error: insertError } = await supabase.from("venue_owners").insert({
          venue_id: venueToReassign.id,
          owner_id: newOwnerId,
          assigned_by: profile.id_auto,
        });
        if (insertError) throw insertError;

        const { data: newOwnerProfile } = await supabase
          .from("profiles").select("role").eq("id_auto", newOwnerId).single();
        if (newOwnerProfile && newOwnerProfile.role === "basic_user") {
          await supabase.from("profiles").update({ role: "bar_owner" }).eq("id_auto", newOwnerId);
        }

        if (currentOwners) {
          for (const oldOwner of currentOwners) {
            const oid = oldOwner.owner_id;
            if (oid === newOwnerId) continue;
            const { count: remainingVenues } = await supabase
              .from("venue_owners").select("id", { count: "exact", head: true })
              .eq("owner_id", oid).is("archived_at", null);
            const { count: activeTournaments } = await supabase
              .from("tournaments").select("id", { count: "exact", head: true })
              .eq("director_id", oid).eq("status", "active");
            const { count: directedVenues } = await supabase
              .from("venue_directors").select("id", { count: "exact", head: true })
              .eq("director_id", oid).is("archived_at", null);
            if ((remainingVenues || 0) === 0 && (activeTournaments || 0) === 0 && (directedVenues || 0) === 0) {
              await supabase.from("profiles").update({ role: "basic_user" }).eq("id_auto", oid);
            }
          }
        }

        await supabase.from("reassignment_logs").insert({
          entity_type: "venue_owner",
          entity_id: venueToReassign.id,
          entity_name: venueToReassign.venue || venueToReassign.name || "Unknown",
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
        <Text allowFontScaling={false} style={styles.loadingText}>Loading venues...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ReassignOwnerModal
        visible={reassignVis}
        venueName={venueToReassign?.venue || venueToReassign?.name || ""}
        currentOwnerName={currentOwnerName}
        onCancel={() => { setReassignVis(false); setVenueToReassign(null); setCurrentOwnerName(""); }}
        onConfirm={handleReassignOwner}
      />

      {/* Header */}
      <View style={[styles.header, isWeb && styles.headerWeb]}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text allowFontScaling={false} style={styles.backText}>{"\u2190"} Back</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text allowFontScaling={false} style={styles.headerTitle}>VENUE MANAGEMENT</Text>
          <Text allowFontScaling={false} style={styles.headerSubtitle}>
            {activeTab === "venues"
              ? `${vm.totalCount} total venues`
              : activeTab === "audit"
              ? "Bar owner audit history"
              : "Billing & subscriptions"}
          </Text>
        </View>
        <View style={styles.placeholder} />
      </View>

      {/* Tab Bar */}
      <View style={styles.tabBar}>
        {(["venues", "audit", "billing"] as AdminVenueTab[]).map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, activeTab === tab && styles.tabActive]}
            onPress={() => setActiveTab(tab)}
          >
            <Text
              allowFontScaling={false}
              style={[styles.tabText, activeTab === tab && styles.tabTextActive]}
            >
              {tab === "venues"
                ? `\uD83C\uDFE2 Venues`
                : tab === "audit"
                ? `\uD83D\uDCCB Audit Log`
                : `\uD83D\uDCB3 Billing`}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── Venues Tab ────────────────────────────────────── */}
      {activeTab === "venues" && (
        <>
          <View style={styles.searchRow}>
            <View style={styles.searchContainer}>
              <Text allowFontScaling={false} style={styles.searchIcon}>{"\uD83D\uDD0D"}</Text>
              <TextInput
                style={styles.searchInput}
                placeholder="Search venues..."
                placeholderTextColor={COLORS.textSecondary}
                value={vm.searchQuery}
                onChangeText={vm.setSearchQuery}
              />
            </View>
            <TouchableOpacity style={styles.addButton} onPress={handleCreateVenue}>
              <Text allowFontScaling={false} style={styles.addButtonText}>+ Add Venue</Text>
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
            ref={listRef}
            data={vm.venues}
            keyExtractor={(item) => item.id.toString()}
            contentContainerStyle={[styles.listContent, isWeb && styles.scrollContentWeb]}
            refreshControl={
              isWeb ? undefined : (
                <RefreshControl
                  refreshing={vm.refreshing}
                  onRefresh={vm.onRefresh}
                  tintColor={COLORS.primary}
                />
              )
            }
            renderItem={({ item }) => (
              <View>
                <View style={styles.idBadgeRow}>
                  <View style={styles.idBadge}>
                    <Text allowFontScaling={false} style={styles.idBadgeText}>ID: {item.id}</Text>
                  </View>
                </View>
                <BarOwnerVenueCard
                  venue={item}
                  onPress={() => handleVenuePress(item.id)}
                  onManageTables={() => handleManageTables(item.id)}
                  onManageDirectors={() => handleManageDirectors(item.id)}
                />
                {(profile?.role === "super_admin" || profile?.role === "compete_admin") && (
                  <TouchableOpacity
                    style={styles.reassignOwnerBtn}
                    onPress={() => openReassignModal(item)}
                  >
                    <Text allowFontScaling={false} style={styles.reassignOwnerText}>
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
        </>
      )}

      {/* ── Audit Log Tab ─────────────────────────────────── */}
      {activeTab === "audit" && (
        <AuditLogTab records={auditVM.auditRecords} loading={auditVM.auditLoading} />
      )}

      {/* ── Billing Tab ───────────────────────────────────── */}
      {activeTab === "billing" && <BillingTab />}
    </View>
  );
}

const styles = StyleSheet.create({
  scrollContentWeb: { alignItems: "center", paddingBottom: SPACING.xl },
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
  loadingText: {
    fontSize: moderateScale(FONT_SIZES.md),
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
    fontSize: moderateScale(FONT_SIZES.sm),
    color: COLORS.primary,
    fontWeight: "500",
  },
  headerCenter: { alignItems: "center" },
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
  placeholder: { width: scale(50) },
  // ── Tab bar ──────────────────────────────────────────────
  tabBar: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.background,
  },
  tab: {
    flex: 1,
    paddingVertical: SPACING.md,
    alignItems: "center",
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabActive: {
    borderBottomColor: COLORS.primary,
  },
  tabText: {
    fontSize: moderateScale(FONT_SIZES.xs),
    color: COLORS.textSecondary,
    fontWeight: "500",
  },
  tabTextActive: {
    color: COLORS.primary,
    fontWeight: "700",
  },
  // ── Venues tab ───────────────────────────────────────────
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.md,
    gap: SPACING.md,
  },
  searchContainer: {
    flex: 0.7,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.surface,
    borderRadius: scale(8),
    paddingHorizontal: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    height: scale(40),
  },
  searchIcon: { fontSize: moderateScale(14), marginRight: SPACING.sm, opacity: 0.6 },
  searchInput: {
    flex: 1,
    fontSize: moderateScale(FONT_SIZES.sm),
    color: COLORS.text,
    height: scale(40),
  },
  addButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: scale(8),
    height: scale(40),
    justifyContent: "center",
  },
  addButtonText: {
    fontSize: moderateScale(FONT_SIZES.sm),
    fontWeight: "600",
    color: "#fff",
  },
  sortRow: {
    flexDirection: "row",
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.sm,
  },
  sortContainer: { width: scale(120) },
  listContent: { padding: SPACING.md, paddingBottom: SPACING.xl * 2 },
  idBadgeRow: { flexDirection: "row", marginBottom: SPACING.xs },
  idBadge: {
    backgroundColor: COLORS.textSecondary + "30",
    paddingHorizontal: SPACING.sm,
    paddingVertical: scale(2),
    borderRadius: scale(8),
  },
  idBadgeText: {
    fontSize: moderateScale(FONT_SIZES.xs),
    fontWeight: "600",
    color: COLORS.textSecondary,
  },
  reassignOwnerBtn: {
    backgroundColor: "#FF980020",
    borderWidth: 1,
    borderColor: "#FF9800",
    borderRadius: scale(8),
    paddingVertical: SPACING.sm,
    alignItems: "center",
    marginTop: -SPACING.sm,
    marginBottom: SPACING.md,
    marginHorizontal: SPACING.xs,
  },
  reassignOwnerText: {
    color: "#FF9800",
    fontSize: moderateScale(FONT_SIZES.sm),
    fontWeight: "600",
  },
  // ── Audit log ────────────────────────────────────────────
  auditCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  auditCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: SPACING.sm,
  },
  auditCardLeft: { flex: 1, marginRight: SPACING.sm },
  auditVenueName: {
    fontSize: moderateScale(FONT_SIZES.md),
    fontWeight: "700",
    color: COLORS.text,
  },
  auditOwnerName: {
    fontSize: moderateScale(FONT_SIZES.sm),
    color: COLORS.textSecondary,
    marginTop: scale(2),
  },
  auditCardRight: { alignItems: "flex-end", gap: scale(4) },
  auditTypeBadge: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: scale(2),
    borderRadius: scale(10),
  },
  auditTypeBadgeInitial: { backgroundColor: COLORS.primary + "20" },
  auditTypeBadgePeriodic: { backgroundColor: COLORS.success + "20" },
  auditTypeBadgeText: { fontSize: moderateScale(FONT_SIZES.xs), fontWeight: "700" },
  auditTypeBadgeTextInitial: { color: COLORS.primary },
  auditTypeBadgeTextPeriodic: { color: COLORS.success },
  auditDate: {
    fontSize: moderateScale(FONT_SIZES.xs),
    color: COLORS.textMuted,
  },
  auditMeta: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: SPACING.md,
    paddingVertical: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    marginTop: SPACING.xs,
  },
  auditMetaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: scale(4),
  },
  auditMetaIcon: { fontSize: moderateScale(FONT_SIZES.sm) },
  auditMetaText: {
    fontSize: moderateScale(FONT_SIZES.xs),
    color: COLORS.textSecondary,
  },
  auditBrands: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: SPACING.xs,
    marginTop: SPACING.xs,
  },
  auditBrandChip: {
    backgroundColor: COLORS.background,
    borderRadius: scale(10),
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: SPACING.sm,
    paddingVertical: scale(2),
  },
  auditBrandChipText: {
    fontSize: moderateScale(FONT_SIZES.xs),
    color: COLORS.textSecondary,
  },
  auditNotes: {
    fontSize: moderateScale(FONT_SIZES.xs),
    color: COLORS.textMuted,
    marginTop: SPACING.xs,
    fontStyle: "italic",
  },
  // ── Billing placeholder ──────────────────────────────────
  billingContainer: {
    alignItems: "center",
    justifyContent: "center",
    padding: SPACING.xl,
    paddingTop: SPACING.xl * 2,
  },
  billingEmoji: {
    fontSize: moderateScale(64),
    marginBottom: SPACING.md,
  },
  billingTitle: {
    fontSize: moderateScale(FONT_SIZES.xl),
    fontWeight: "700",
    color: COLORS.text,
  },
  billingSubtitle: {
    fontSize: moderateScale(FONT_SIZES.md),
    color: COLORS.primary,
    fontWeight: "600",
    marginTop: scale(4),
    marginBottom: SPACING.md,
  },
  billingBody: {
    fontSize: moderateScale(FONT_SIZES.md),
    color: COLORS.textSecondary,
    textAlign: "center",
    lineHeight: moderateScale(FONT_SIZES.md) * 1.6,
    marginBottom: SPACING.xl,
  },
  billingPlaceholderCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.lg,
    width: "100%",
    maxWidth: scale(340),
    gap: SPACING.md,
  },
  billingPlaceholderRow: {
    fontSize: moderateScale(FONT_SIZES.md),
    color: COLORS.textSecondary,
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
    borderRadius: scale(12),
    padding: SPACING.lg,
    width: "100%",
    maxWidth: scale(400),
  },
  title: {
    fontSize: moderateScale(FONT_SIZES.lg),
    fontWeight: "700",
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },
  subtitle: {
    fontSize: moderateScale(FONT_SIZES.md),
    color: COLORS.textSecondary,
    marginBottom: SPACING.xs,
  },
  currentRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.background,
    borderRadius: scale(8),
    padding: SPACING.sm,
    marginBottom: SPACING.md,
    borderLeftWidth: 3,
    borderLeftColor: "#FF9800",
  },
  currentLabel: {
    fontSize: moderateScale(FONT_SIZES.sm),
    color: COLORS.textSecondary,
    marginRight: SPACING.xs,
  },
  currentValue: {
    fontSize: moderateScale(FONT_SIZES.sm),
    color: COLORS.text,
    fontWeight: "600",
    flex: 1,
  },
  label: {
    fontSize: moderateScale(FONT_SIZES.sm),
    color: COLORS.text,
    marginBottom: SPACING.xs,
    fontWeight: "500",
  },
  searchInput: {
    backgroundColor: COLORS.background,
    borderRadius: scale(8),
    padding: SPACING.sm,
    fontSize: moderateScale(FONT_SIZES.sm),
    color: COLORS.text,
    borderWidth: 1,
    borderColor: COLORS.border,
    height: scale(40),
  },
  resultsBox: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: scale(8),
    marginTop: SPACING.xs,
    overflow: "hidden",
    maxHeight: scale(160),
  },
  resultItem: {
    padding: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  resultItemActive: { backgroundColor: COLORS.primary + "20" },
  resultName: {
    fontSize: moderateScale(FONT_SIZES.sm),
    color: COLORS.text,
    fontWeight: "500",
  },
  resultNameActive: { color: COLORS.primary, fontWeight: "700" },
  resultDetail: {
    fontSize: moderateScale(FONT_SIZES.xs),
    color: COLORS.textSecondary,
    marginTop: scale(2),
  },
  hint: {
    fontSize: moderateScale(FONT_SIZES.xs),
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
    fontStyle: "italic",
  },
  selectedBadge: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: COLORS.success + "20",
    borderRadius: scale(8),
    padding: SPACING.sm,
    marginTop: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.success,
  },
  selectedText: {
    fontSize: moderateScale(FONT_SIZES.sm),
    color: COLORS.success,
    fontWeight: "600",
    flex: 1,
  },
  selectedClear: {
    fontSize: moderateScale(FONT_SIZES.md),
    color: COLORS.success,
    paddingLeft: SPACING.sm,
  },
  textArea: {
    backgroundColor: COLORS.background,
    borderRadius: scale(8),
    padding: SPACING.sm,
    fontSize: moderateScale(FONT_SIZES.sm),
    color: COLORS.text,
    borderWidth: 1,
    borderColor: COLORS.border,
    minHeight: scale(80),
    textAlignVertical: "top",
  },
  buttons: { flexDirection: "row", marginTop: SPACING.lg, gap: SPACING.sm },
  btnCancel: {
    flex: 1,
    paddingVertical: SPACING.sm,
    borderRadius: scale(8),
    alignItems: "center",
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  btnCancelText: {
    color: COLORS.text,
    fontSize: moderateScale(FONT_SIZES.sm),
    fontWeight: "600",
  },
  btnConfirm: {
    flex: 1,
    paddingVertical: SPACING.sm,
    borderRadius: scale(8),
    alignItems: "center",
    backgroundColor: "#FF9800",
  },
  btnConfirmText: {
    color: "#FFFFFF",
    fontSize: moderateScale(FONT_SIZES.sm),
    fontWeight: "600",
  },
});