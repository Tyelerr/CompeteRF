import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import {
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Platform,
} from "react-native";
import { COLORS } from "../../../src/theme/colors";
import { SPACING } from "../../../src/theme/spacing";
import { FONT_SIZES } from "../../../src/theme/typography";
import { useAuthContext } from "../../../src/providers/AuthProvider";
import { useBarOwnerVenues } from "../../../src/viewmodels/useBarOwnerVenues";
import { AdminHeader, AdminSearchBar } from "../../../src/views/components/admin/AdminControls";
import { EmptyState } from "../../../src/views/components/dashboard";
import { BarOwnerVenueCard } from "../../../src/views/components/venues";
import { VenueTeamModal } from "../../../src/views/components/venues/VenueTeamModal";
import { VenueSection, VenueWorkspace } from "../../../src/views/components/venues/VenueWorkspace";

const isWeb = Platform.OS === "web";

export default function BarOwnerVenuesScreen() {
  const router = useRouter();
  const vm = useBarOwnerVenues();
  const { profile } = useAuthContext();
  // Web workspace selection (venue + section) lives in the URL.
  const params = useLocalSearchParams<{ venue?: string; section?: string }>();

  const [teamModalVenueId, setTeamModalVenueId] = useState<number | null>(null);
  const [teamModalVenueName, setTeamModalVenueName] = useState("");

  const handleVenuePress = (venueId: number) => {
    router.push(`/(tabs)/admin/edit-venue/${venueId}` as any);
  };

  const handleManageTables = (venueId: number) => {
    router.push(`/(tabs)/admin/edit-venue/${venueId}?tab=tables` as any);
  };

  const handleManageTeam = (venueId: number, venueName: string) => {
    setTeamModalVenueName(venueName);
    setTeamModalVenueId(venueId);
  };

  const handleCreateVenue = () => {
    router.push("/(tabs)/admin/create-venue" as any);
  };

  if (vm.loading) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.loadingText}>Loading venues...</Text>
      </View>
    );
  }

  // Web: the venue control panel. One venue → straight into its workspace (no search /
  // list / pagination); several → the same workspace with a venue picker in the sidebar.
  // Details / Tables / Directors are the existing components + viewmodels (edit-venue).
  if (isWeb && vm.venues.length > 0 && !vm.searchQuery) {
    const wantId = Number(params.venue);
    const selected = vm.venues.find((v) => v.id === wantId) ?? vm.venues[0];
    const section: VenueSection =
      params.section === "tables" || params.section === "directors" ? params.section : "details";
    return (
      <View style={[styles.container, styles.containerWorkspaceWeb]}>
        <VenueTeamModal
          visible={teamModalVenueId !== null}
          venueId={teamModalVenueId}
          venueName={teamModalVenueName}
          currentUserId={profile?.id_auto ?? 0}
          onClose={() => { setTeamModalVenueId(null); vm.onRefresh(); }}
        />
        <VenueWorkspace
          venues={vm.venues}
          selected={selected}
          onSelectVenue={(vid) => router.setParams({ venue: String(vid), section })}
          section={section}
          onSelectSection={(s) => router.setParams({ venue: String(selected.id), section: s })}
          backLabel="Back"
          onBack={() => router.back()}
          topAction={{ label: "+ Add Venue", onPress: handleCreateVenue }}
          actions={[
            { label: "Manage Team", icon: "people-circle-outline", tone: "primary", onPress: () => handleManageTeam(selected.id, selected.venue) },
          ]}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <VenueTeamModal
        visible={teamModalVenueId !== null}
        venueId={teamModalVenueId}
        venueName={teamModalVenueName}
        currentUserId={profile?.id_auto ?? 0}
        onClose={() => { setTeamModalVenueId(null); vm.onRefresh(); }}
      />

      <AdminHeader
        title="My Venues"
        subtitle={`${vm.venues.length} venue${vm.venues.length === 1 ? "" : "s"}`}
        onBack={() => router.back()}
      />

      <AdminSearchBar
        value={vm.searchQuery}
        onChangeText={vm.setSearchQuery}
        placeholder="Search venues..."
      />

      <TouchableOpacity style={styles.addButton} onPress={handleCreateVenue}>
        <Text style={styles.addButtonText}>+ Add Venue</Text>
      </TouchableOpacity>

      {/* Venue List */}
      <FlatList
        data={vm.venues}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={[styles.listContent, isWeb && styles.scrollContentWeb]}
        refreshControl={
          isWeb ? undefined : (
            <RefreshControl refreshing={vm.refreshing} onRefresh={vm.onRefresh} tintColor={COLORS.primary} />
          )
        }
        renderItem={({ item }) => (
          <BarOwnerVenueCard
            venue={item}
            onPress={() => handleVenuePress(item.id)}
            onManageTables={() => handleManageTables(item.id)}
            onManageTeam={() => handleManageTeam(item.id, item.venue)}
          />
        )}
        ListEmptyComponent={
          <EmptyState
            message="No venues yet"
            submessage="Add your first venue to start managing tournaments"
          />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  scrollContentWeb: { paddingBottom: SPACING.xl },
  containerWorkspaceWeb: { maxWidth: 1240 },
  container: {
    ...Platform.select({ web: { maxWidth: 860, width: "100%" as any, alignSelf: "center" as any } }),
    flex: 1,
    backgroundColor: COLORS.background,
  },
  centerContainer: {
    flex: 1,
    backgroundColor: COLORS.background,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: { fontSize: FONT_SIZES.md, color: COLORS.textSecondary },
  addButton: {
    marginHorizontal: SPACING.md,
    marginTop: SPACING.sm,
    marginBottom: SPACING.sm,
    backgroundColor: COLORS.primary,
    paddingVertical: SPACING.sm,
    borderRadius: 8,
    alignItems: "center",
  },
  addButtonText: { fontSize: FONT_SIZES.md, fontWeight: "600", color: COLORS.white },
  listContent: { padding: SPACING.md, paddingBottom: SPACING.xl * 2 },
});