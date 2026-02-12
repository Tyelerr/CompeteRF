// src/viewmodels/useEditUser.ts
// ═══════════════════════════════════════════════════════════
// UPDATED: Split "name" into "first_name" + "last_name"
// UPDATED: Added disable/enable user toggle (App Store compliance)
// ═══════════════════════════════════════════════════════════

import { useCallback, useEffect, useState } from "react";
import { Alert } from "react-native";
import { supabase } from "../lib/supabase";
import { useAuthContext } from "../providers/AuthProvider";
import { buildFullName } from "../utils/name.utils"; // NAME CHANGE

export type UserRole =
  | "basic_user"
  | "tournament_director"
  | "bar_owner"
  | "compete_admin"
  | "super_admin";

export type UserStatus = "active" | "suspended" | "banned";

// NAME CHANGE: Added first_name and last_name
export interface EditableUser {
  id: string;
  id_auto: number;
  email: string;
  name: string;           // kept for display fallback
  first_name: string;     // NEW
  last_name: string;      // NEW
  user_name: string;
  role: UserRole;
  status: UserStatus;
  is_disabled: boolean;   // ← NEW: App Store compliance
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
  const [togglingDisable, setTogglingDisable] = useState(false); // ← NEW
  const [user, setUser] = useState<EditableUser | null>(null);

  // NAME CHANGE: Two name fields instead of one
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [role, setRole] = useState<UserRole>("basic_user");
  const [status, setStatus] = useState<UserStatus>("active");

  // Track if form has changes
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    if (userId) {
      loadUser();
    }
  }, [userId]);

  // NAME CHANGE: Track changes on both name fields
  useEffect(() => {
    if (user) {
      const changed =
        firstName !== user.first_name ||
        lastName !== user.last_name ||
        role !== user.role ||
        status !== user.status;
      setHasChanges(changed);
    }
  }, [firstName, lastName, role, status, user]);

  const loadUser = async () => {
    try {
      // NAME CHANGE: Select first_name and last_name too
      // NEW: Also select is_disabled
      const { data, error } = await supabase
        .from("profiles")
        .select(
          "id, id_auto, email, name, first_name, last_name, user_name, role, status, is_disabled, created_at, last_login_at",
        )
        .eq("id", userId)
        .single();

      if (error) {
        console.error("Error loading user:", error);
        Alert.alert("Error", "Failed to load user");
        return;
      }

      if (data) {
        // NAME CHANGE: Read first_name/last_name, fall back to splitting name
        let first = data.first_name || "";
        let last = data.last_name || "";

        if (!first && !last && data.name) {
          const parts = data.name.trim().split(/\s+/);
          first = parts[0] || "";
          last = parts.slice(1).join(" ") || "";
        }

        const userData: EditableUser = {
          id: data.id,
          id_auto: data.id_auto,
          email: data.email,
          name: data.name,
          first_name: first,
          last_name: last,
          user_name: data.user_name,
          role: data.role as UserRole,
          status: data.status as UserStatus,
          is_disabled: data.is_disabled ?? false,   // ← NEW
          created_at: data.created_at,
          last_login_at: data.last_login_at,
        };

        setUser(userData);
        setFirstName(userData.first_name);
        setLastName(userData.last_name);
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
      return true;
    }
    if (currentUserRole === "compete_admin") {
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
      return allRoles;
    }

    if (currentUserRole === "compete_admin") {
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
      Alert.alert("Error", "You do not have permission to edit this user");
      return false;
    }

    setSaving(true);

    try {
      // NAME CHANGE: Save first_name, last_name, AND name (backward compat)
      const trimmedFirst = firstName.trim();
      const trimmedLast = lastName.trim();

      const { data, error } = await supabase
        .from("profiles")
        .update({
          name: buildFullName(trimmedFirst, trimmedLast), // backward compat
          first_name: trimmedFirst,
          last_name: trimmedLast,
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
              name: buildFullName(trimmedFirst, trimmedLast),
              first_name: trimmedFirst,
              last_name: trimmedLast,
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
  }, [user, userId, firstName, lastName, role, status, canEdit]);

  // ═══════════════════════════════════════════════════════
  // NEW: Toggle disable/enable user (App Store compliance)
  // ═══════════════════════════════════════════════════════
  const toggleDisabled = useCallback(async () => {
    if (!user || !canEdit()) {
      Alert.alert("Error", "You do not have permission to modify this user.");
      return;
    }

    const newDisabledState = !user.is_disabled;
    const actionLabel = newDisabledState ? "Disable" : "Enable";
    const confirmMessage = newDisabledState
      ? `This will immediately prevent "${user.first_name || user.user_name}" from logging in or using the app. They will see a "disabled" message on their next login attempt.`
      : `This will re-enable "${user.first_name || user.user_name}"'s account. They will be able to log in and use the app normally.`;

    Alert.alert(
      `${actionLabel} User?`,
      confirmMessage,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: actionLabel,
          style: newDisabledState ? "destructive" : "default",
          onPress: async () => {
            setTogglingDisable(true);
            try {
              const { data, error } = await supabase
                .from("profiles")
                .update({
                  is_disabled: newDisabledState,
                  updated_at: new Date().toISOString(),
                })
                .eq("id", userId)
                .select()
                .single();

              if (error) {
                console.error("Error toggling disabled:", error);
                Alert.alert("Error", `Failed to ${actionLabel.toLowerCase()} user: ${error.message}`);
                return;
              }

              if (!data) {
                Alert.alert("Error", "Update failed — no rows modified. Check database permissions.");
                return;
              }

              // Update local state
              setUser((prev) =>
                prev ? { ...prev, is_disabled: newDisabledState } : null,
              );

              Alert.alert(
                "Success",
                newDisabledState
                  ? `User has been disabled. They will be signed out on their next action.`
                  : `User has been re-enabled. They can now log in normally.`,
              );
            } catch (error) {
              console.error("Error toggling disabled:", error);
              Alert.alert("Error", `Failed to ${actionLabel.toLowerCase()} user.`);
            } finally {
              setTogglingDisable(false);
            }
          },
        },
      ],
    );
  }, [user, userId, canEdit]);

  // Reset form to original values
  const resetForm = useCallback(() => {
    if (user) {
      setFirstName(user.first_name);
      setLastName(user.last_name);
      setRole(user.role);
      setStatus(user.status);
    }
  }, [user]);

  return {
    // State
    loading,
    saving,
    togglingDisable,           // ← NEW
    user,
    hasChanges,

    // NAME CHANGE: Two name fields
    firstName,
    lastName,
    role,
    status,

    // NAME CHANGE: Two setters
    setFirstName,
    setLastName,
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
    toggleDisabled,            // ← NEW

    // DEPRECATED: kept for any code still using "name"
    name: buildFullName(firstName, lastName),
    setName: (fullName: string) => {
      const parts = fullName.trim().split(/\s+/);
      setFirstName(parts[0] || "");
      setLastName(parts.slice(1).join(" ") || "");
    },
  };
};
