import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { COLORS } from "../../../src/theme/colors";
import { SPACING } from "../../../src/theme/spacing";
import { FONT_SIZES } from "../../../src/theme/typography";
import { useEditVenue } from "../../../src/viewmodels/useEditVenue";
import { useVenueTables } from "../../../src/viewmodels/useVenueTables";
import { DetailsTab } from "../../../src/views/components/venues/DetailsTab";
import { DirectorsTab } from "../../../src/views/components/venues/DirectorsTab";
import { TablesTab } from "../../../src/views/components/venues/TablesTab";

type TabType = "details" | "tables" | "directors";

export default function EditVenueScreen() {
  const router = useRouter();
  const { id, tab } = useLocalSearchParams<{ id: string; tab?: string }>();
  const venueId = parseInt(id, 10);

  const [activeTab, setActiveTab] = useState<TabType>(
    (tab as TabType) || "details",
  );

  // ViewModels
  const venueVM = useEditVenue(venueId);
  const tablesVM = useVenueTables(venueId);

  const handleRefresh = () => {
    venueVM.onRefresh();
    tablesVM.loadTables();
  };

  if (venueVM.loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading venue...</Text>
      </View>
    );
  }

  if (!venueVM.venue) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>Venue not found</Text>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.linkText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {venueVM.venue.venue}
        </Text>
        <View style={styles.placeholder} />
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, activeTab === "details" && styles.activeTab]}
          onPress={() => setActiveTab("details")}
        >
          <Text
            style={[
              styles.tabText,
              activeTab === "details" && styles.activeTabText,
            ]}
          >
            Details
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === "tables" && styles.activeTab]}
          onPress={() => setActiveTab("tables")}
        >
          <Text
            style={[
              styles.tabText,
              activeTab === "tables" && styles.activeTabText,
            ]}
          >
            Tables ({tablesVM.tables.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === "directors" && styles.activeTab]}
          onPress={() => setActiveTab("directors")}
        >
          <Text
            style={[
              styles.tabText,
              activeTab === "directors" && styles.activeTabText,
            ]}
          >
            Directors ({venueVM.directors.length})
          </Text>
        </TouchableOpacity>
      </View>

      {/* Content */}
      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={venueVM.refreshing}
            onRefresh={handleRefresh}
            tintColor={COLORS.primary}
          />
        }
      >
        {activeTab === "details" && (
          <DetailsTab
            venue={venueVM.editedVenue!}
            onChange={venueVM.setEditedVenue}
            onSave={venueVM.saveDetails}
            saving={venueVM.saving}
          />
        )}

        {activeTab === "tables" && (
          <TablesTab
            tables={tablesVM.tables}
            newTable={tablesVM.newTable}
            loading={tablesVM.loading}
            saving={tablesVM.saving}
            tableSizeOptions={tablesVM.tableSizeOptions}
            brandOptions={tablesVM.brandOptions}
            onAddTable={tablesVM.addTable}
            onUpdateTable={tablesVM.updateTable}
            onDeleteTable={tablesVM.deleteTable}
            onUpdateNewTable={tablesVM.updateNewTable}
          />
        )}

        {activeTab === "directors" && (
          <DirectorsTab
            directors={venueVM.directors}
            searchQuery={venueVM.searchQuery}
            searchResults={venueVM.searchResults}
            searching={venueVM.searching}
            onSearch={venueVM.searchDirectors}
            onAddDirector={venueVM.addDirector}
            onRemoveDirector={venueVM.removeDirector}
          />
        )}

        <View style={styles.bottomSpacer} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  centerContainer: {
    flex: 1,
    backgroundColor: COLORS.background,
    justifyContent: "center",
    alignItems: "center",
    padding: SPACING.lg,
  },
  loadingText: {
    marginTop: SPACING.md,
    fontSize: FONT_SIZES.md,
    color: COLORS.textSecondary,
  },
  errorText: {
    fontSize: FONT_SIZES.lg,
    color: COLORS.error,
    marginBottom: SPACING.md,
  },
  linkText: {
    fontSize: FONT_SIZES.md,
    color: COLORS.primary,
    fontWeight: "600",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.xl + SPACING.lg,
    paddingBottom: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  backButton: {
    padding: SPACING.xs,
  },
  backText: {
    fontSize: FONT_SIZES.md,
    color: COLORS.primary,
    fontWeight: "600",
  },
  headerTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: "700",
    color: COLORS.text,
    flex: 1,
    textAlign: "center",
    marginHorizontal: SPACING.sm,
  },
  placeholder: {
    width: 50,
  },
  tabs: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  tab: {
    flex: 1,
    paddingVertical: SPACING.md,
    alignItems: "center",
  },
  activeTab: {
    borderBottomWidth: 2,
    borderBottomColor: COLORS.primary,
  },
  tabText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    fontWeight: "600",
  },
  activeTabText: {
    color: COLORS.primary,
  },
  content: {
    flex: 1,
  },
  bottomSpacer: {
    height: SPACING.xl * 2,
  },
});
