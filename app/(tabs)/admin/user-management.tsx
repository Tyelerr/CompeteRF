import { useRouter } from "expo-router";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { COLORS } from "../../../src/theme/colors";
import { SPACING } from "../../../src/theme/spacing";
import { FONT_SIZES } from "../../../src/theme/typography";
import {
  AdminUser,
  ROLE_COLORS,
  ROLE_LABELS,
  useAdminUsers,
} from "../../../src/viewmodels/useAdminUsers";
import { Dropdown } from "../../../src/views/components/common/dropdown";

export default function UserManagementScreen() {
  const router = useRouter();
  const vm = useAdminUsers();

  if (vm.loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading users...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>USER MANAGEMENT</Text>
        <Text style={styles.headerSubtitle}>{vm.totalCount} total users</Text>
      </View>

      {/* Search & Filters */}
      <View style={styles.filtersContainer}>
        {/* Search Bar */}
        <View style={styles.searchContainer}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Search users..."
            placeholderTextColor={COLORS.textSecondary}
            value={vm.searchQuery}
            onChangeText={vm.setSearchQuery}
          />
        </View>

        {/* Dropdowns Row */}
        <View style={styles.dropdownRow}>
          {/* Role Filter Dropdown */}
          <View style={styles.dropdownWrapper}>
            <Dropdown
              options={vm.roleFilterOptions.map((r) => ({
                label: r.label,
                value: r.value,
              }))}
              value={vm.roleFilter}
              onSelect={(value) => vm.setRoleFilter(value as any)}
              placeholder="All Roles"
            />
          </View>

          {/* Sort Dropdown */}
          <View style={styles.dropdownWrapper}>
            <Dropdown
              options={vm.sortOptions}
              value={vm.sortOption}
              onSelect={(value) => vm.setSortOption(value as any)}
              placeholder="Sort by"
            />
          </View>

          {/* View Mode Toggle */}
          <View style={styles.viewToggle}>
            <TouchableOpacity
              style={[
                styles.viewToggleButton,
                vm.viewMode === "compact" && styles.viewToggleButtonActive,
              ]}
              onPress={() => vm.setViewMode("compact")}
            >
              <Text style={styles.viewToggleIcon}>☰</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.viewToggleButton,
                vm.viewMode === "full" && styles.viewToggleButtonActive,
              ]}
              onPress={() => vm.setViewMode("full")}
            >
              <Text style={styles.viewToggleIcon}>▦</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* User List */}
      <FlatList
        data={vm.users}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        style={styles.listContainer}
        refreshControl={
          <RefreshControl
            refreshing={vm.refreshing}
            onRefresh={vm.onRefresh}
            tintColor={COLORS.primary}
          />
        }
        renderItem={({ item }) =>
          vm.viewMode === "compact" ? (
            <CompactUserCard
              user={item}
              canEdit={vm.canEditUser(item.role)}
              canDelete={vm.canDeleteUser(item.role)}
              onEdit={() =>
                router.push(`/(tabs)/admin/edit-user/${item.id}` as any)
              }
              onDelete={() => vm.deleteUser(item.id, item.name)}
            />
          ) : (
            <FullUserCard
              user={item}
              canEdit={vm.canEditUser(item.role)}
              canDelete={vm.canDeleteUser(item.role)}
              onEdit={() =>
                router.push(`/(tabs)/admin/edit-user/${item.id}` as any)
              }
              onDelete={() => vm.deleteUser(item.id, item.name)}
            />
          )
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>👥</Text>
            <Text style={styles.emptyText}>No users found</Text>
          </View>
        }
      />
    </View>
  );
}

// ============================================
// COMPACT USER CARD
// ============================================
interface UserCardProps {
  user: AdminUser;
  canEdit: boolean;
  canDelete: boolean;
  onEdit: () => void;
  onDelete: () => void;
}

const CompactUserCard = ({
  user,
  canEdit,
  canDelete,
  onEdit,
  onDelete,
}: UserCardProps) => {
  const roleColor = ROLE_COLORS[user.role];
  const roleLabel = ROLE_LABELS[user.role];
  const initial = user.name.charAt(0).toUpperCase();

  return (
    <View style={styles.compactCard}>
      <View style={styles.compactContent}>
        {/* Avatar */}
        <View style={[styles.avatar, { backgroundColor: roleColor }]}>
          <Text style={styles.avatarText}>{initial}</Text>
        </View>

        {/* User Info */}
        <View style={styles.userInfo}>
          <Text style={styles.userName}>{user.name}</Text>
          <View
            style={[styles.roleBadge, { backgroundColor: `${roleColor}20` }]}
          >
            <Text style={[styles.roleBadgeText, { color: roleColor }]}>
              {roleLabel}
            </Text>
          </View>
        </View>

        {/* Stats */}
        <View style={styles.statsContainer}>
          {user.venue_count > 0 && (
            <View style={styles.statItem}>
              <Text style={styles.statIcon}>🏢</Text>
              <Text style={styles.statText}>{user.venue_count}</Text>
            </View>
          )}
          {user.director_count > 0 && (
            <View style={styles.statItem}>
              <Text style={styles.statIcon}>👤</Text>
              <Text style={styles.statText}>{user.director_count}</Text>
            </View>
          )}
        </View>

        {/* Actions */}
        <View style={styles.actionsContainer}>
          {canEdit && (
            <TouchableOpacity style={styles.iconButton} onPress={onEdit}>
              <Text style={styles.iconButtonText}>✏️</Text>
            </TouchableOpacity>
          )}
          {canDelete && (
            <TouchableOpacity style={styles.iconButton} onPress={onDelete}>
              <Text style={styles.iconButtonText}>🗑️</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
};

// ============================================
// FULL USER CARD
// ============================================
const FullUserCard = ({
  user,
  canEdit,
  canDelete,
  onEdit,
  onDelete,
}: UserCardProps) => {
  const roleColor = ROLE_COLORS[user.role];
  const roleLabel = ROLE_LABELS[user.role];
  const initial = user.name.charAt(0).toUpperCase();
  const joinedDate = new Date(user.created_at).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <View style={styles.fullCard}>
      {/* Top Row: Avatar + Name + Badge */}
      <View style={styles.fullTopRow}>
        <View style={[styles.avatar, { backgroundColor: roleColor }]}>
          <Text style={styles.avatarText}>{initial}</Text>
        </View>
        <View style={styles.fullUserInfo}>
          <Text style={styles.userName}>{user.name}</Text>
          <View
            style={[styles.roleBadge, { backgroundColor: `${roleColor}20` }]}
          >
            <Text style={[styles.roleBadgeText, { color: roleColor }]}>
              {roleLabel}
            </Text>
          </View>
        </View>
      </View>

      {/* Details */}
      <View style={styles.fullDetails}>
        {(user.venue_count > 0 || user.director_count > 0) && (
          <View style={styles.fullStatsRow}>
            {user.venue_count > 0 && (
              <Text style={styles.fullStatText}>
                🏢 Venues: {user.venue_count}
              </Text>
            )}
            {user.director_count > 0 && (
              <Text style={styles.fullStatText}>
                👤 Directors: {user.director_count}
              </Text>
            )}
          </View>
        )}
        <Text style={styles.fullDetailText}>📅 Joined: {joinedDate}</Text>
        <Text style={styles.fullDetailText}>🆔 User ID: {user.id_auto}</Text>
      </View>

      {/* Action Buttons */}
      {(canEdit || canDelete) && (
        <View style={styles.fullActions}>
          {canEdit && (
            <TouchableOpacity style={styles.actionButton} onPress={onEdit}>
              <Text style={styles.actionButtonText}>✏️ Edit</Text>
            </TouchableOpacity>
          )}
          {canDelete && (
            <TouchableOpacity
              style={[styles.actionButton, styles.deleteButton]}
              onPress={onDelete}
            >
              <Text style={[styles.actionButtonText, styles.deleteButtonText]}>
                🗑️ Delete
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
};

// ============================================
// STYLES
// ============================================
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
  },
  loadingText: {
    marginTop: SPACING.sm,
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
  },
  header: {
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.xl + SPACING.sm,
    paddingBottom: SPACING.md,
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
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
    marginTop: 4,
  },
  filtersContainer: {
    padding: SPACING.md,
    gap: SPACING.md,
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.surface,
    borderRadius: 8,
    paddingHorizontal: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    height: 40,
  },
  searchIcon: {
    fontSize: 14,
    marginRight: SPACING.sm,
    opacity: 0.6,
  },
  searchInput: {
    flex: 1,
    height: 40,
    fontSize: FONT_SIZES.sm,
    color: COLORS.text,
  },
  dropdownRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
  },
  dropdownWrapper: {
    flex: 1,
  },
  viewToggle: {
    flexDirection: "row",
    backgroundColor: COLORS.surface,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: COLORS.border,
    height: 38,
    alignItems: "center",
    paddingHorizontal: 2,
  },
  viewToggleButton: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 6,
    height: 32,
    justifyContent: "center",
    alignItems: "center",
  },
  viewToggleButtonActive: {
    backgroundColor: COLORS.primary,
    borderRadius: 4,
  },
  viewToggleIcon: {
    fontSize: 14,
    color: COLORS.text,
  },
  listContainer: {
    flex: 1,
    marginHorizontal: SPACING.md,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    backgroundColor: COLORS.background,
  },
  listContent: {
    padding: SPACING.sm,
    paddingBottom: SPACING.xl,
  },
  emptyContainer: {
    alignItems: "center",
    paddingVertical: SPACING.xl * 2,
  },
  emptyIcon: {
    fontSize: 40,
    marginBottom: SPACING.md,
    opacity: 0.5,
  },
  emptyText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
  },

  // Compact Card Styles
  compactCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 6,
    padding: SPACING.sm,
    marginBottom: SPACING.xs,
    borderWidth: 0,
  },
  compactContent: {
    flexDirection: "row",
    alignItems: "center",
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: {
    fontSize: FONT_SIZES.md,
    fontWeight: "600",
    color: "#fff",
  },
  userInfo: {
    flex: 1,
    marginLeft: SPACING.sm,
  },
  userName: {
    fontSize: FONT_SIZES.sm,
    fontWeight: "600",
    color: COLORS.text,
    marginBottom: 3,
  },
  roleBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  roleBadgeText: {
    fontSize: 11,
    fontWeight: "600",
  },
  statsContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginRight: SPACING.sm,
  },
  statItem: {
    flexDirection: "row",
    alignItems: "center",
    marginLeft: SPACING.sm,
  },
  statIcon: {
    fontSize: 12,
    marginRight: 3,
    opacity: 0.7,
  },
  statText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    fontWeight: "500",
  },
  actionsContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  iconButton: {
    padding: 6,
  },
  iconButtonText: {
    fontSize: 16,
    opacity: 0.6,
  },

  // Full Card Styles
  fullCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 6,
    padding: SPACING.sm,
    marginBottom: SPACING.xs,
    borderWidth: 0,
  },
  fullTopRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: SPACING.sm,
  },
  fullUserInfo: {
    marginLeft: SPACING.sm,
  },
  fullDetails: {
    marginLeft: 38 + SPACING.sm,
    marginBottom: SPACING.sm,
    gap: 4,
  },
  fullStatsRow: {
    flexDirection: "row",
    gap: SPACING.md,
  },
  fullStatText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
  },
  fullDetailText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
  },
  fullActions: {
    flexDirection: "row",
    gap: SPACING.sm,
    marginLeft: 38 + SPACING.sm,
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.background,
    paddingHorizontal: SPACING.md,
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  actionButtonText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.text,
    fontWeight: "500",
  },
  deleteButton: {
    borderColor: "rgba(239, 68, 68, 0.4)",
    backgroundColor: "rgba(239, 68, 68, 0.08)",
  },
  deleteButtonText: {
    color: "#ef4444",
  },
});
