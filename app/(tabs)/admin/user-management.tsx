import { moderateScale, scale } from "../../../src/utils/scaling";
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
  Platform,
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

const isWeb = Platform.OS === "web";

const formatLastLogin = (dateString: string | null | undefined): string => {
  if (!dateString) return "Never";
  return new Date(dateString).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export default function UserManagementScreen() {
  const router = useRouter();
  const vm = useAdminUsers();

  if (vm.loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text allowFontScaling={false} style={styles.loadingText}>Loading users...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, isWeb && styles.headerWeb]}>
        <Text allowFontScaling={false} style={styles.headerTitle}>USER MANAGEMENT</Text>
        <Text allowFontScaling={false} style={styles.headerSubtitle}>{vm.totalCount} total users</Text>
      </View>

      {/* Search & Filters */}
      <View style={styles.filtersContainer}>
        <View style={styles.searchContainer}>
          <Text allowFontScaling={false} style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Search users..."
            placeholderTextColor={COLORS.textSecondary}
            value={vm.searchQuery}
            onChangeText={vm.setSearchQuery}
          />
        </View>

        <View style={styles.dropdownRow}>
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

          <View style={styles.dropdownWrapper}>
            <Dropdown
              options={vm.sortOptions}
              value={vm.sortOption}
              onSelect={(value) => vm.setSortOption(value as any)}
              placeholder="Sort by"
            />
          </View>

          <View style={styles.viewToggle}>
            <TouchableOpacity
              style={[
                styles.viewToggleButton,
                vm.viewMode === "compact" && styles.viewToggleButtonActive,
              ]}
              onPress={() => vm.setViewMode("compact")}
            >
              <Text allowFontScaling={false} style={styles.viewToggleIcon}>☰</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.viewToggleButton,
                vm.viewMode === "full" && styles.viewToggleButtonActive,
              ]}
              onPress={() => vm.setViewMode("full")}
            >
              <Text allowFontScaling={false} style={styles.viewToggleIcon}>▦</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* User List */}
      <FlatList
        data={vm.users}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[styles.listContent, isWeb && styles.scrollContentWeb]}
        style={styles.listContainer}
        refreshControl={
          isWeb ? undefined : (
            <RefreshControl
              refreshing={vm.refreshing}
              onRefresh={vm.onRefresh}
              tintColor={COLORS.primary}
            />
          )
        }
        renderItem={({ item }) =>
          vm.viewMode === "compact" ? (
            <CompactUserCard
              user={item}
              canEdit={vm.canEditUser(item.role)}
              canDelete={vm.canDeleteUser(item.role)}
              onEdit={() => router.push(`/(tabs)/admin/edit-user/${item.id}` as any)}
              onDelete={() => vm.deleteUser(item.id, item.name)}
            />
          ) : (
            <FullUserCard
              user={item}
              canEdit={vm.canEditUser(item.role)}
              canDelete={vm.canDeleteUser(item.role)}
              onEdit={() => router.push(`/(tabs)/admin/edit-user/${item.id}` as any)}
              onDelete={() => vm.deleteUser(item.id, item.name)}
            />
          )
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text allowFontScaling={false} style={styles.emptyIcon}>👥</Text>
            <Text allowFontScaling={false} style={styles.emptyText}>No users found</Text>
          </View>
        }
      />
    </View>
  );
}

interface UserCardProps {
  user: AdminUser;
  canEdit: boolean;
  canDelete: boolean;
  onEdit: () => void;
  onDelete: () => void;
}

const CompactUserCard = ({ user, canEdit, canDelete, onEdit, onDelete }: UserCardProps) => {
  const roleColor = ROLE_COLORS[user.role];
  const roleLabel = ROLE_LABELS[user.role];
  const initial = user.name.charAt(0).toUpperCase();

  return (
    <View style={styles.compactCard}>
      <View style={styles.compactContent}>
        <View style={[styles.avatar, { backgroundColor: roleColor }]}>
          <Text allowFontScaling={false} style={styles.avatarText}>{initial}</Text>
        </View>
        <View style={styles.userInfo}>
          <Text allowFontScaling={false} style={styles.userName}>{user.name}</Text>
          <View style={[styles.roleBadge, { backgroundColor: `${roleColor}20` }]}>
            <Text allowFontScaling={false} style={[styles.roleBadgeText, { color: roleColor }]}>{roleLabel}</Text>
          </View>
        </View>
        <View style={styles.statsContainer}>
          {user.venue_count > 0 && (
            <View style={styles.statItem}>
              <Text allowFontScaling={false} style={styles.statIcon}>🏢</Text>
              <Text allowFontScaling={false} style={styles.statText}>{user.venue_count}</Text>
            </View>
          )}
          {user.director_count > 0 && (
            <View style={styles.statItem}>
              <Text allowFontScaling={false} style={styles.statIcon}>👤</Text>
              <Text allowFontScaling={false} style={styles.statText}>{user.director_count}</Text>
            </View>
          )}
        </View>
        <View style={styles.actionsContainer}>
          {canEdit && (
            <TouchableOpacity style={styles.iconButton} onPress={onEdit}>
              <Text allowFontScaling={false} style={styles.iconButtonText}>✏️</Text>
            </TouchableOpacity>
          )}
          {canDelete && (
            <TouchableOpacity style={styles.iconButton} onPress={onDelete}>
              <Text allowFontScaling={false} style={styles.iconButtonText}>🗑️</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
};

const FullUserCard = ({ user, canEdit, canDelete, onEdit, onDelete }: UserCardProps) => {
  const roleColor = ROLE_COLORS[user.role];
  const roleLabel = ROLE_LABELS[user.role];
  const initial = user.name.charAt(0).toUpperCase();
  const joinedDate = new Date(user.created_at).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <View style={styles.fullCard}>
      <View style={styles.fullTopRow}>
        <View style={[styles.avatar, { backgroundColor: roleColor }]}>
          <Text allowFontScaling={false} style={styles.avatarText}>{initial}</Text>
        </View>
        <View style={styles.fullUserInfo}>
          <Text allowFontScaling={false} style={styles.userName}>{user.name}</Text>
          <View style={[styles.roleBadge, { backgroundColor: `${roleColor}20` }]}>
            <Text allowFontScaling={false} style={[styles.roleBadgeText, { color: roleColor }]}>{roleLabel}</Text>
          </View>
        </View>
      </View>

      <View style={styles.fullDetails}>
        {(user.venue_count > 0 || user.director_count > 0) && (
          <View style={styles.fullStatsRow}>
            {user.venue_count > 0 && (
              <Text allowFontScaling={false} style={styles.fullDetailText}>🏢 Venues: {user.venue_count}</Text>
            )}
            {user.director_count > 0 && (
              <Text allowFontScaling={false} style={styles.fullDetailText}>👤 Directors: {user.director_count}</Text>
            )}
          </View>
        )}
        <Text allowFontScaling={false} style={styles.fullDetailText}>📅 Joined: {joinedDate}</Text>
        <Text allowFontScaling={false} style={styles.fullDetailText}>
          🕐 Last Active: {formatLastLogin(user.last_active_at)}
        </Text>
        <Text allowFontScaling={false} style={styles.fullDetailText}>
          🔑 Last Login: {formatLastLogin(user.last_login_at)}
        </Text>
        <Text allowFontScaling={false} style={styles.fullDetailText}>🆔 User ID: {user.id_auto}</Text>
      </View>

      {(canEdit || canDelete) && (
        <View style={styles.fullActions}>
          {canEdit && (
            <TouchableOpacity style={styles.actionButton} onPress={onEdit}>
              <Text allowFontScaling={false} style={styles.actionButtonText}>✏️ Edit</Text>
            </TouchableOpacity>
          )}
          {canDelete && (
            <TouchableOpacity style={[styles.actionButton, styles.deleteButton]} onPress={onDelete}>
              <Text allowFontScaling={false} style={[styles.actionButtonText, styles.deleteButtonText]}>🗑️ Delete</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  scrollContentWeb: { alignItems: "center", paddingBottom: SPACING.xl },
  container: {
    ...Platform.select({ web: { maxWidth: 860, width: "100%" as any, alignSelf: "center" as any } }),
    flex: 1,
    backgroundColor: COLORS.background,
  },
  centerContainer: {
    flex: 1, backgroundColor: COLORS.background,
    justifyContent: "center", alignItems: "center",
  },
  loadingText: { marginTop: SPACING.sm, fontSize: moderateScale(FONT_SIZES.sm), color: COLORS.textSecondary },
  header: {
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.xl + SPACING.sm,
    paddingBottom: SPACING.md,
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerWeb: { paddingTop: SPACING.lg },
  headerTitle: { fontSize: moderateScale(FONT_SIZES.lg), fontWeight: "600", color: COLORS.text, letterSpacing: 0.5 },
  headerSubtitle: { fontSize: moderateScale(FONT_SIZES.xs), color: COLORS.textSecondary, opacity: 0.7, marginTop: scale(4) },
  filtersContainer: { padding: SPACING.md, gap: SPACING.md },
  searchContainer: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: COLORS.surface, borderRadius: scale(8),
    paddingHorizontal: SPACING.sm, borderWidth: 1,
    borderColor: COLORS.border, height: scale(40),
  },
  searchIcon: { fontSize: moderateScale(14), marginRight: SPACING.sm, opacity: 0.6 },
  searchInput: { flex: 1, height: scale(40), fontSize: moderateScale(FONT_SIZES.sm), color: COLORS.text },
  dropdownRow: { flexDirection: "row", alignItems: "center", gap: SPACING.sm },
  dropdownWrapper: { flex: 1 },
  viewToggle: {
    flexDirection: "row", backgroundColor: COLORS.surface,
    borderRadius: scale(6), borderWidth: 1, borderColor: COLORS.border,
    height: scale(38), alignItems: "center", paddingHorizontal: scale(2),
  },
  viewToggleButton: {
    paddingHorizontal: SPACING.sm, paddingVertical: scale(6),
    height: scale(32), justifyContent: "center", alignItems: "center",
  },
  viewToggleButtonActive: { backgroundColor: COLORS.primary, borderRadius: scale(4) },
  viewToggleIcon: { fontSize: moderateScale(14), color: COLORS.text },
  listContainer: {
    flex: 1, marginHorizontal: SPACING.md, marginBottom: SPACING.md,
    borderWidth: 1, borderColor: COLORS.border, borderRadius: scale(8),
    backgroundColor: COLORS.background,
  },
  listContent: { padding: SPACING.sm, paddingBottom: SPACING.xl },
  emptyContainer: { alignItems: "center", paddingVertical: SPACING.xl * 2 },
  emptyIcon: { fontSize: moderateScale(40), marginBottom: SPACING.md, opacity: 0.5 },
  emptyText: { fontSize: moderateScale(FONT_SIZES.sm), color: COLORS.textSecondary },

  // Compact card
  compactCard: {
    backgroundColor: COLORS.surface, borderRadius: scale(6),
    padding: SPACING.sm, marginBottom: SPACING.xs,
  },
  compactContent: { flexDirection: "row", alignItems: "center" },
  avatar: { width: scale(38), height: scale(38), borderRadius: scale(19), justifyContent: "center", alignItems: "center" },
  avatarText: { fontSize: moderateScale(FONT_SIZES.md), fontWeight: "600", color: "#fff" },
  userInfo: { flex: 1, marginLeft: SPACING.sm },
  userName: { fontSize: moderateScale(FONT_SIZES.sm), fontWeight: "600", color: COLORS.text, marginBottom: scale(3) },
  roleBadge: { alignSelf: "flex-start", paddingHorizontal: scale(8), paddingVertical: scale(2), borderRadius: scale(6) },
  roleBadgeText: { fontSize: moderateScale(11), fontWeight: "600" },
  statsContainer: { flexDirection: "row", alignItems: "center", marginRight: SPACING.sm },
  statItem: { flexDirection: "row", alignItems: "center", marginLeft: SPACING.sm },
  statIcon: { fontSize: moderateScale(12), marginRight: scale(3), opacity: 0.7 },
  statText: { fontSize: moderateScale(FONT_SIZES.xs), color: COLORS.textSecondary, fontWeight: "500" },
  actionsContainer: { flexDirection: "row", alignItems: "center", gap: scale(4) },
  iconButton: { padding: scale(6) },
  iconButtonText: { fontSize: moderateScale(16), opacity: 0.6 },

  // Full card
  fullCard: {
    backgroundColor: COLORS.surface, borderRadius: scale(6),
    padding: SPACING.sm, marginBottom: SPACING.xs,
  },
  fullTopRow: { flexDirection: "row", alignItems: "center", marginBottom: SPACING.sm },
  fullUserInfo: { marginLeft: SPACING.sm },
  fullDetails: { marginLeft: scale(38) + SPACING.sm, marginBottom: SPACING.sm, gap: scale(4) },
  fullStatsRow: { flexDirection: "row", gap: SPACING.md },
  fullDetailText: { fontSize: moderateScale(FONT_SIZES.xs), color: COLORS.textSecondary },
  fullActions: { flexDirection: "row", gap: SPACING.sm, marginLeft: scale(38) + SPACING.sm },
  actionButton: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: COLORS.background, paddingHorizontal: SPACING.md,
    paddingVertical: scale(8), borderRadius: scale(6), borderWidth: 1, borderColor: COLORS.border,
  },
  actionButtonText: { fontSize: moderateScale(FONT_SIZES.xs), color: COLORS.text, fontWeight: "500" },
  deleteButton: { borderColor: "rgba(239,68,68,0.4)", backgroundColor: "rgba(239,68,68,0.08)" },
  deleteButtonText: { color: "#ef4444" },
});
