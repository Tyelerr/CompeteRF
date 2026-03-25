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
export type SortOption = "name_asc" | "name_desc" | "date_newest" | "date_oldest";

export interface AdminUser {
  id: string;
  id_auto: number;
  name: string;
  email: string;
  role: UserRole;
  created_at: string;
  last_active_at: string | null;
  last_login_at: string | null;
  venue_count: number;
  director_count: number;
}

export interface RoleOption {
  label: string;
  value: UserRole | "all";
  color: string;
}

const ROLE_HIERARCHY: Record<UserRole, number> = {
  basic_user: 1,
  tournament_director: 2,
  bar_owner: 3,
  compete_admin: 4,
  super_admin: 5,
};

export const ROLE_COLORS: Record<UserRole, string> = {
  super_admin: "#ef4444",
  compete_admin: "#f97316",
  bar_owner: "#a855f7",
  tournament_director: "#22c55e",
  basic_user: "#3b82f6",
};

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

  useEffect(() => { loadUsers(); }, []);

  const loadUsers = async () => {
    try {
      // ── Step 1: all profiles in one query ─────────────────────────────────
      const { data: profilesData, error: profilesError } = await supabase
        .from("profiles")
        .select("id, id_auto, name, email, role, created_at, status, last_active_at, last_login_at")
        .neq("status", "deleted")
        .order("created_at", { ascending: false });

      if (profilesError) { console.error("Error loading users:", profilesError); return; }
      if (!profilesData || profilesData.length === 0) { setUsers([]); return; }

      const allIdAutos = profilesData.map((u: any) => u.id_auto);

      // ── Step 2: batch venue owner counts (1 query) ────────────────────────
      const { data: venueOwnerData } = await supabase
        .from("venue_owners")
        .select("owner_id, venue_id")
        .in("owner_id", allIdAutos)
        .is("archived_at", null);

      // venue count per owner
      const venueCountByOwner: Record<number, number> = {};
      // venue IDs per owner — needed to count directors under bar owner venues
      const venueIdsByOwner: Record<number, number[]> = {};
      for (const r of venueOwnerData || []) {
        venueCountByOwner[r.owner_id] = (venueCountByOwner[r.owner_id] || 0) + 1;
        if (!venueIdsByOwner[r.owner_id]) venueIdsByOwner[r.owner_id] = [];
        venueIdsByOwner[r.owner_id].push(r.venue_id);
      }

      // ── Step 3: batch venue director counts (1 query) ─────────────────────
      // We need:
      //   • venue_count for tournament directors = venues they direct
      //   • director_count for bar owners = unique directors across their venues
      const allOwnedVenueIds = Object.values(venueIdsByOwner).flat();
      const { data: venueDirectorData } = await supabase
        .from("venue_directors")
        .select("director_id, venue_id")
        .is("archived_at", null);

      // venues directed per TD
      const venueCountByDirector: Record<number, number> = {};
      // directors per venue (used to aggregate bar owner director counts)
      const directorsByVenue: Record<number, Set<number>> = {};
      for (const r of venueDirectorData || []) {
        venueCountByDirector[r.director_id] = (venueCountByDirector[r.director_id] || 0) + 1;
        if (!directorsByVenue[r.venue_id]) directorsByVenue[r.venue_id] = new Set();
        directorsByVenue[r.venue_id].add(r.director_id);
      }

      // For each bar owner, count unique directors across all their venues
      const directorCountByOwner: Record<number, number> = {};
      for (const [ownerIdStr, venueIds] of Object.entries(venueIdsByOwner)) {
        const ownerId = Number(ownerIdStr);
        const allDirectors = new Set<number>();
        for (const venueId of venueIds) {
          for (const dirId of directorsByVenue[venueId] ?? []) {
            allDirectors.add(dirId);
          }
        }
        directorCountByOwner[ownerId] = allDirectors.size;
      }

      // ── Step 4: map into final shape (pure JS) ────────────────────────────
      const usersWithStats: AdminUser[] = profilesData.map((user: any) => {
        const role = user.role as UserRole;
        let venueCount = 0;
        let directorCount = 0;

        if (role === "bar_owner") {
          venueCount = venueCountByOwner[user.id_auto] || 0;
          directorCount = directorCountByOwner[user.id_auto] || 0;
        } else if (role === "tournament_director") {
          venueCount = venueCountByDirector[user.id_auto] || 0;
        }

        return {
          id: user.id,
          id_auto: user.id_auto,
          name: user.name || "Unknown",
          email: user.email || "",
          role,
          created_at: user.created_at,
          last_active_at: user.last_active_at || null,
          last_login_at: user.last_login_at || null,
          venue_count: venueCount,
          director_count: directorCount,
        };
      });

      setUsers(usersWithStats);
    } catch (error) {
      console.error("Error loading admin users:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const canEditUser = useCallback((targetRole: UserRole): boolean => {
    if (currentUserRole === "super_admin") return true;
    if (currentUserRole === "compete_admin") return ROLE_HIERARCHY[targetRole] < ROLE_HIERARCHY["compete_admin"];
    return false;
  }, [currentUserRole]);

  const canDeleteUser = useCallback((targetRole: UserRole): boolean => {
    if (currentUserRole === "super_admin") return true;
    if (currentUserRole === "compete_admin") return ROLE_HIERARCHY[targetRole] < ROLE_HIERARCHY["compete_admin"];
    return false;
  }, [currentUserRole]);

  const deleteUser = useCallback(async (userId: string, userName: string) => {
    Alert.alert("Delete User", `Are you sure you want to delete ${userName}? This action cannot be undone.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete", style: "destructive",
        onPress: async () => {
          try {
            const { error } = await supabase.from("profiles").update({
              status: "deleted", deleted_by: profile?.id_auto,
              deleted_at: new Date().toISOString(),
            }).eq("id", userId);
            if (error) { Alert.alert("Error", `Failed to delete user: ${error.message}`); return; }
            setUsers((prev) => prev.filter((u) => u.id !== userId));
            Alert.alert("Success", "User deleted successfully");
          } catch {
            Alert.alert("Error", "Failed to delete user");
          }
        },
      },
    ]);
  }, [profile?.id_auto]);

  const filteredUsers = useMemo(() => {
    let result = [...users];
    if (roleFilter !== "all") result = result.filter((u) => u.role === roleFilter);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter((u) =>
        u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q),
      );
    }
    switch (sortOption) {
      case "name_asc": result.sort((a, b) => a.name.localeCompare(b.name)); break;
      case "name_desc": result.sort((a, b) => b.name.localeCompare(a.name)); break;
      case "date_newest": result.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()); break;
      case "date_oldest": result.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()); break;
    }
    return result;
  }, [users, roleFilter, searchQuery, sortOption]);

  const onRefresh = useCallback(() => { setRefreshing(true); loadUsers(); }, []);

  const roleFilterOptions: RoleOption[] = [
    { label: "All Roles", value: "all", color: "#888" },
    { label: "Super Admin", value: "super_admin", color: ROLE_COLORS.super_admin },
    { label: "Compete Admin", value: "compete_admin", color: ROLE_COLORS.compete_admin },
    { label: "Bar Owner", value: "bar_owner", color: ROLE_COLORS.bar_owner },
    { label: "TD", value: "tournament_director", color: ROLE_COLORS.tournament_director },
    { label: "Basic", value: "basic_user", color: ROLE_COLORS.basic_user },
  ];

  const sortOptions = [
    { label: "Newest", value: "date_newest" },
    { label: "Oldest", value: "date_oldest" },
    { label: "A-Z", value: "name_asc" },
    { label: "Z-A", value: "name_desc" },
  ];

  return {
    loading, refreshing,
    users: filteredUsers,
    totalCount: users.length,
    searchQuery, roleFilter, viewMode, sortOption,
    roleFilterOptions, sortOptions,
    canEditUser, canDeleteUser,
    onRefresh, setSearchQuery, setRoleFilter, setViewMode, setSortOption,
    deleteUser,
  };
};
