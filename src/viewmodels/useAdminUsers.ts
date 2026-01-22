import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert } from "react-native";
import { supabase } from "../lib/supabase";
import { useAuthContext } from "../providers/AuthProvider";

export type UserRole =
  | "basic_user"
  | "tournament_director"
  | "bar_owner"
  | "compete_admin"
  | "super_admin";

export type ViewMode = "compact" | "full";
export type SortOption =
  | "name_asc"
  | "name_desc"
  | "date_newest"
  | "date_oldest";

export interface AdminUser {
  id: string;
  id_auto: number;
  name: string;
  email: string;
  role: UserRole;
  created_at: string;
  venue_count: number;
  director_count: number;
}

export interface RoleOption {
  label: string;
  value: UserRole | "all";
  color: string;
}

// Role hierarchy for permissions
const ROLE_HIERARCHY: Record<UserRole, number> = {
  basic_user: 1,
  tournament_director: 2,
  bar_owner: 3,
  compete_admin: 4,
  super_admin: 5,
};

// Role colors
export const ROLE_COLORS: Record<UserRole, string> = {
  super_admin: "#ef4444", // Red
  compete_admin: "#f97316", // Orange
  bar_owner: "#a855f7", // Purple
  tournament_director: "#22c55e", // Green
  basic_user: "#3b82f6", // Blue
};

// Role labels
export const ROLE_LABELS: Record<UserRole, string> = {
  super_admin: "Super Admin",
  compete_admin: "Compete Admin",
  bar_owner: "Bar Owner",
  tournament_director: "TD",
  basic_user: "Basic",
};

export const useAdminUsers = () => {
  const { profile } = useAuthContext();
  const currentUserRole = profile?.role as UserRole;

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<UserRole | "all">("all");
  const [viewMode, setViewMode] = useState<ViewMode>("compact");
  const [sortOption, setSortOption] = useState<SortOption>("date_newest");

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      // Get all active users (exclude deleted)
      const { data: profilesData, error: profilesError } = await supabase
        .from("profiles")
        .select("id, id_auto, name, email, role, created_at, status")
        .neq("status", "deleted")
        .order("created_at", { ascending: false });

      if (profilesError) {
        console.error("Error loading users:", profilesError);
        return;
      }

      if (!profilesData) {
        setUsers([]);
        return;
      }

      // Get venue counts for bar owners
      const usersWithStats: AdminUser[] = await Promise.all(
        profilesData.map(async (user: any) => {
          let venueCount = 0;
          let directorCount = 0;

          if (user.role === "bar_owner") {
            // Count venues owned
            const { count: vCount } = await supabase
              .from("venue_owners")
              .select("id", { count: "exact", head: true })
              .eq("owner_id", user.id_auto)
              .is("archived_at", null);

            venueCount = vCount || 0;

            // Count directors under their venues
            const { data: venueIds } = await supabase
              .from("venue_owners")
              .select("venue_id")
              .eq("owner_id", user.id_auto)
              .is("archived_at", null);

            if (venueIds && venueIds.length > 0) {
              const ids = venueIds.map((v: any) => v.venue_id);
              const { count: dCount } = await supabase
                .from("venue_directors")
                .select("id", { count: "exact", head: true })
                .in("venue_id", ids)
                .is("archived_at", null);

              directorCount = dCount || 0;
            }
          }

          if (user.role === "tournament_director") {
            // Count venues they direct
            const { count: vCount } = await supabase
              .from("venue_directors")
              .select("id", { count: "exact", head: true })
              .eq("director_id", user.id_auto)
              .is("archived_at", null);

            venueCount = vCount || 0;
          }

          return {
            id: user.id,
            id_auto: user.id_auto,
            name: user.name || "Unknown",
            email: user.email || "",
            role: user.role as UserRole,
            created_at: user.created_at,
            venue_count: venueCount,
            director_count: directorCount,
          };
        }),
      );

      setUsers(usersWithStats);
    } catch (error) {
      console.error("Error loading admin users:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Check if current user can edit target user
  const canEditUser = useCallback(
    (targetRole: UserRole): boolean => {
      if (currentUserRole === "super_admin") {
        return true; // Super admin can edit anyone
      }
      if (currentUserRole === "compete_admin") {
        // Compete admin can only edit users below compete_admin level
        return ROLE_HIERARCHY[targetRole] < ROLE_HIERARCHY["compete_admin"];
      }
      return false;
    },
    [currentUserRole],
  );

  // Check if current user can delete target user
  const canDeleteUser = useCallback(
    (targetRole: UserRole): boolean => {
      if (currentUserRole === "super_admin") {
        return true; // Super admin can delete anyone
      }
      if (currentUserRole === "compete_admin") {
        // Compete admin can only delete users below compete_admin level
        return ROLE_HIERARCHY[targetRole] < ROLE_HIERARCHY["compete_admin"];
      }
      return false;
    },
    [currentUserRole],
  );

  // Delete user (soft delete)
  const deleteUser = useCallback(
    async (userId: string, userName: string) => {
      Alert.alert(
        "Delete User",
        `Are you sure you want to delete ${userName}? This action cannot be undone.`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: async () => {
              try {
                const { error } = await supabase
                  .from("profiles")
                  .update({
                    status: "deleted",
                    deleted_by: profile?.id_auto,
                    deleted_at: new Date().toISOString(),
                  })
                  .eq("id", userId);

                if (error) {
                  console.error("Delete error:", error);
                  Alert.alert(
                    "Error",
                    `Failed to delete user: ${error.message}`,
                  );
                  return;
                }

                // Remove from local state
                setUsers((prev) => prev.filter((u) => u.id !== userId));
                Alert.alert("Success", "User deleted successfully");
              } catch (error) {
                console.error("Error deleting user:", error);
                Alert.alert("Error", "Failed to delete user");
              }
            },
          },
        ],
      );
    },
    [profile?.id_auto],
  );

  // Edit user - navigate to edit screen
  const editUser = useCallback((userId: string) => {
    // This will be handled by the view's navigation
    return userId;
  }, []);

  // Filter and sort users
  const filteredUsers = useMemo(() => {
    let result = [...users];

    // Role filter
    if (roleFilter !== "all") {
      result = result.filter((u) => u.role === roleFilter);
    }

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      result = result.filter(
        (u) =>
          u.name.toLowerCase().includes(query) ||
          u.email.toLowerCase().includes(query),
      );
    }

    // Sort
    switch (sortOption) {
      case "name_asc":
        result.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case "name_desc":
        result.sort((a, b) => b.name.localeCompare(a.name));
        break;
      case "date_newest":
        result.sort(
          (a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
        );
        break;
      case "date_oldest":
        result.sort(
          (a, b) =>
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
        );
        break;
    }

    return result;
  }, [users, roleFilter, searchQuery, sortOption]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadUsers();
  }, []);

  // Role filter options
  const roleFilterOptions: RoleOption[] = [
    { label: "All Roles", value: "all", color: "#888" },
    {
      label: "Super Admin",
      value: "super_admin",
      color: ROLE_COLORS.super_admin,
    },
    {
      label: "Compete Admin",
      value: "compete_admin",
      color: ROLE_COLORS.compete_admin,
    },
    { label: "Bar Owner", value: "bar_owner", color: ROLE_COLORS.bar_owner },
    {
      label: "TD",
      value: "tournament_director",
      color: ROLE_COLORS.tournament_director,
    },
    { label: "Basic", value: "basic_user", color: ROLE_COLORS.basic_user },
  ];

  // Sort options
  const sortOptions = [
    { label: "Newest", value: "date_newest" },
    { label: "Oldest", value: "date_oldest" },
    { label: "A-Z", value: "name_asc" },
    { label: "Z-A", value: "name_desc" },
  ];

  return {
    // State
    loading,
    refreshing,
    users: filteredUsers,
    totalCount: users.length,
    searchQuery,
    roleFilter,
    viewMode,
    sortOption,

    // Options
    roleFilterOptions,
    sortOptions,

    // Permission checks
    canEditUser,
    canDeleteUser,

    // Actions
    onRefresh,
    setSearchQuery,
    setRoleFilter,
    setViewMode,
    setSortOption,
    deleteUser,
  };
};
