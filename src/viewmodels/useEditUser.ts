import { useCallback, useEffect, useState } from "react";
import { Alert } from "react-native";
import { supabase } from "../lib/supabase";
import { useAuthContext } from "../providers/AuthProvider";

export type UserRole =
  | "basic_user"
  | "tournament_director"
  | "bar_owner"
  | "compete_admin"
  | "super_admin";

export type UserStatus = "active" | "suspended" | "banned";

export interface EditableUser {
  id: string;
  id_auto: number;
  email: string;
  name: string;
  user_name: string;
  role: UserRole;
  status: UserStatus;
  created_at: string;
  last_login_at: string | null;
}

// Role hierarchy for permissions
const ROLE_HIERARCHY: Record<UserRole, number> = {
  basic_user: 1,
  tournament_director: 2,
  bar_owner: 3,
  compete_admin: 4,
  super_admin: 5,
};

export const useEditUser = (userId: string) => {
  const { profile: currentUserProfile } = useAuthContext();
  const currentUserRole = currentUserProfile?.role as UserRole;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [user, setUser] = useState<EditableUser | null>(null);

  // Form state
  const [name, setName] = useState("");
  const [role, setRole] = useState<UserRole>("basic_user");
  const [status, setStatus] = useState<UserStatus>("active");

  // Track if form has changes
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    if (userId) {
      loadUser();
    }
  }, [userId]);

  // Track changes
  useEffect(() => {
    if (user) {
      const changed =
        name !== user.name || role !== user.role || status !== user.status;
      setHasChanges(changed);
    }
  }, [name, role, status, user]);

  const loadUser = async () => {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select(
          "id, id_auto, email, name, user_name, role, status, created_at, last_login_at",
        )
        .eq("id", userId)
        .single();

      if (error) {
        console.error("Error loading user:", error);
        Alert.alert("Error", "Failed to load user");
        return;
      }

      if (data) {
        const userData: EditableUser = {
          id: data.id,
          id_auto: data.id_auto,
          email: data.email,
          name: data.name,
          user_name: data.user_name,
          role: data.role as UserRole,
          status: data.status as UserStatus,
          created_at: data.created_at,
          last_login_at: data.last_login_at,
        };

        setUser(userData);
        setName(userData.name);
        setRole(userData.role);
        setStatus(userData.status);
      }
    } catch (error) {
      console.error("Error loading user:", error);
      Alert.alert("Error", "Failed to load user");
    } finally {
      setLoading(false);
    }
  };

  // Check if current user can edit this user
  const canEdit = useCallback((): boolean => {
    if (!user) return false;

    if (currentUserRole === "super_admin") {
      return true; // Super admin can edit anyone
    }
    if (currentUserRole === "compete_admin") {
      // Compete admin can only edit users below compete_admin level
      return ROLE_HIERARCHY[user.role] < ROLE_HIERARCHY["compete_admin"];
    }
    return false;
  }, [currentUserRole, user]);

  // Get available role options based on current user's permissions
  const getRoleOptions = useCallback(() => {
    const allRoles = [
      { label: "Basic User", value: "basic_user" },
      { label: "Tournament Director", value: "tournament_director" },
      { label: "Bar Owner", value: "bar_owner" },
      { label: "Compete Admin", value: "compete_admin" },
      { label: "Super Admin", value: "super_admin" },
    ];

    if (currentUserRole === "super_admin") {
      return allRoles; // Super admin can assign any role
    }

    if (currentUserRole === "compete_admin") {
      // Compete admin can only assign roles below their level
      return allRoles.filter(
        (r) =>
          ROLE_HIERARCHY[r.value as UserRole] < ROLE_HIERARCHY["compete_admin"],
      );
    }

    return [];
  }, [currentUserRole]);

  // Status options
  const statusOptions = [
    { label: "Active", value: "active" },
    { label: "Suspended", value: "suspended" },
    { label: "Banned", value: "banned" },
  ];

  // Save changes
  const saveUser = useCallback(async (): Promise<boolean> => {
    if (!user || !canEdit()) {
      Alert.alert("Error", "You don't have permission to edit this user");
      return false;
    }

    setSaving(true);

    try {
      const { data, error } = await supabase
  .from("profiles")
  .update({
    name,
    role,
    status,
    updated_at: new Date().toISOString(),
  })
  .eq("id", userId)
  .select()
  .single();

if (error) {
  console.error("Error saving user:", error);
  Alert.alert("Error", `Failed to save: ${error.message}`);
  return false;
}

if (!data) {
  Alert.alert("Error", "Update failed — no rows were modified. Check database permissions.");
  return false;
}

      // Update local state
      setUser((prev) =>
        prev
          ? {
              ...prev,
              name,
              role,
              status,
            }
          : null,
      );

      setHasChanges(false);
      Alert.alert("Success", "User updated successfully");
      return true;
    } catch (error) {
      console.error("Error saving user:", error);
      Alert.alert("Error", "Failed to save user");
      return false;
    } finally {
      setSaving(false);
    }
  }, [user, userId, name, role, status, canEdit]);

  // Reset form to original values
  const resetForm = useCallback(() => {
    if (user) {
      setName(user.name);
      setRole(user.role);
      setStatus(user.status);
    }
  }, [user]);

  return {
    // State
    loading,
    saving,
    user,
    hasChanges,

    // Form values
    name,
    role,
    status,

    // Setters
    setName,
    setRole,
    setStatus,

    // Options
    roleOptions: getRoleOptions(),
    statusOptions,

    // Permissions
    canEdit: canEdit(),

    // Actions
    saveUser,
    resetForm,
  };
};
