// src/viewmodels/useEditUser.ts
// ═══════════════════════════════════════════════════════════
// UPDATED: Split "name" into "first_name" + "last_name"
// UPDATED: Added disable/enable user toggle (App Store compliance)
// UPDATED: last_active_at replaces last_login_at — sourced from profiles
// ═══════════════════════════════════════════════════════════

import { useCallback, useEffect, useState } from "react";
import { Alert } from "react-native";
import { supabase } from "../lib/supabase";
import { useAuthContext } from "../providers/AuthProvider";
import { buildFullName } from "../utils/name.utils";

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
  first_name: string;
  last_name: string;
  user_name: string;
  role: UserRole;
  status: UserStatus;
  is_disabled: boolean;
  created_at: string;
  // last_active_at: written by AuthProvider on every app foreground.
  // Much more meaningful than last_sign_in_at which only updates on auth.
  last_active_at: string | null;
  // last_login_at: from profiles, backfilled from auth.users.last_sign_in_at.
  // Tells you when they last authenticated, not just when they used the app.
  last_login_at: string | null;
}

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
  const [togglingDisable, setTogglingDisable] = useState(false);
  const [user, setUser] = useState<EditableUser | null>(null);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [role, setRole] = useState<UserRole>("basic_user");
  const [status, setStatus] = useState<UserStatus>("active");
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    if (userId) loadUser();
  }, [userId]);

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
      // last_active_at lives on profiles and is updated by AuthProvider
      // on every app foreground — no auth.admin or RPC needed.
      const { data, error } = await supabase
        .from("profiles")
        .select(
          "id, id_auto, email, name, first_name, last_name, user_name, role, status, is_disabled, created_at, last_active_at, last_login_at",
        )
        .eq("id", userId)
        .single();

      if (error) {
        console.error("Error loading user:", error);
        Alert.alert("Error", "Failed to load user");
        return;
      }

      if (data) {
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
          is_disabled: data.is_disabled ?? false,
          created_at: data.created_at,
          last_active_at: data.last_active_at || null,
          last_login_at: await (async () => {
            // profiles.last_login_at is rarely populated — the real value
            // lives in auth.users.last_sign_in_at, readable via the
            // get_user_last_sign_in RPC (SECURITY DEFINER).
            try {
              const { data: rpcData, error: rpcError } = await supabase
                .rpc("get_user_last_sign_in", { user_id: userId });
              if (!rpcError && rpcData) return rpcData as string;
            } catch {}
            return data.last_login_at || null;
          })(),
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

  const canEdit = useCallback((): boolean => {
    if (!user) return false;
    if (currentUserRole === "super_admin") return true;
    if (currentUserRole === "compete_admin") {
      return ROLE_HIERARCHY[user.role] < ROLE_HIERARCHY["compete_admin"];
    }
    return false;
  }, [currentUserRole, user]);

  const getRoleOptions = useCallback(() => {
    const allRoles = [
      { label: "Basic User", value: "basic_user" },
      { label: "Tournament Director", value: "tournament_director" },
      { label: "Bar Owner", value: "bar_owner" },
      { label: "Compete Admin", value: "compete_admin" },
      { label: "Super Admin", value: "super_admin" },
    ];
    if (currentUserRole === "super_admin") return allRoles;
    if (currentUserRole === "compete_admin") {
      return allRoles.filter(
        (r) => ROLE_HIERARCHY[r.value as UserRole] < ROLE_HIERARCHY["compete_admin"],
      );
    }
    return [];
  }, [currentUserRole]);

  const statusOptions = [
    { label: "Active", value: "active" },
    { label: "Suspended", value: "suspended" },
    { label: "Banned", value: "banned" },
  ];

  const saveUser = useCallback(async (): Promise<boolean> => {
    if (!user || !canEdit()) {
      Alert.alert("Error", "You do not have permission to edit this user");
      return false;
    }
    setSaving(true);
    try {
      const trimmedFirst = firstName.trim();
      const trimmedLast = lastName.trim();
      const { data, error } = await supabase
        .from("profiles")
        .update({
          name: buildFullName(trimmedFirst, trimmedLast),
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
        Alert.alert("Error", `Failed to save: ${error.message}`);
        return false;
      }
      if (!data) {
        Alert.alert("Error", "Update failed — no rows were modified.");
        return false;
      }

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
    } catch {
      Alert.alert("Error", "Failed to save user");
      return false;
    } finally {
      setSaving(false);
    }
  }, [user, userId, firstName, lastName, role, status, canEdit]);

  const toggleDisabled = useCallback(async () => {
    if (!user || !canEdit()) {
      Alert.alert("Error", "You do not have permission to modify this user.");
      return;
    }
    const newDisabledState = !user.is_disabled;
    const actionLabel = newDisabledState ? "Disable" : "Enable";
    const confirmMessage = newDisabledState
      ? `This will immediately prevent "${user.first_name || user.user_name}" from logging in or using the app.`
      : `This will re-enable "${user.first_name || user.user_name}"'s account. They will be able to log in normally.`;

    Alert.alert(`${actionLabel} User?`, confirmMessage, [
      { text: "Cancel", style: "cancel" },
      {
        text: actionLabel,
        style: newDisabledState ? "destructive" : "default",
        onPress: async () => {
          setTogglingDisable(true);
          try {
            const { data, error } = await supabase
              .from("profiles")
              .update({ is_disabled: newDisabledState, updated_at: new Date().toISOString() })
              .eq("id", userId)
              .select()
              .single();

            if (error) {
              Alert.alert("Error", `Failed to ${actionLabel.toLowerCase()} user: ${error.message}`);
              return;
            }
            if (!data) {
              Alert.alert("Error", "Update failed — no rows modified.");
              return;
            }
            setUser((prev) => prev ? { ...prev, is_disabled: newDisabledState } : null);
            Alert.alert(
              "Success",
              newDisabledState
                ? "User has been disabled. They will be signed out on their next action."
                : "User has been re-enabled. They can now log in normally.",
            );
          } catch {
            Alert.alert("Error", `Failed to ${actionLabel.toLowerCase()} user.`);
          } finally {
            setTogglingDisable(false);
          }
        },
      },
    ]);
  }, [user, userId, canEdit]);

  const resetForm = useCallback(() => {
    if (user) {
      setFirstName(user.first_name);
      setLastName(user.last_name);
      setRole(user.role);
      setStatus(user.status);
    }
  }, [user]);

  return {
    loading,
    saving,
    togglingDisable,
    user,
    hasChanges,
    firstName,
    lastName,
    role,
    status,
    setFirstName,
    setLastName,
    setRole,
    setStatus,
    roleOptions: getRoleOptions(),
    statusOptions,
    canEdit: canEdit(),
    saveUser,
    resetForm,
    toggleDisabled,
    name: buildFullName(firstName, lastName),
    setName: (fullName: string) => {
      const parts = fullName.trim().split(/\s+/);
      setFirstName(parts[0] || "");
      setLastName(parts.slice(1).join(" ") || "");
    },
  };
};


