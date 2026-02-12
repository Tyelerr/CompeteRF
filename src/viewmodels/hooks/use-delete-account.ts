// src/viewmodels/hooks/use-delete-account.ts

import { useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Alert } from "react-native";
import { accountService } from "../../models/services/account.service";

export function useDeleteAccount() {
  const router = useRouter();

  const [modalVisible, setModalVisible] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);

  const isConfirmed = confirmText.trim().toUpperCase() === "DELETE";

  const openModal = useCallback(() => {
    setConfirmText("");
    setModalVisible(true);
  }, []);

  const closeModal = useCallback(() => {
    if (deleting) return;
    setConfirmText("");
    setModalVisible(false);
  }, [deleting]);

  const handleDelete = useCallback(async () => {
    if (!isConfirmed || deleting) return;

    setDeleting(true);
    try {
      await accountService.deleteAccount();

      // Close modal and navigate BEFORE clearing the local session.
      // Go to the profile tab specifically so the user sees the
      // logged-out Welcome view, not the home tab.
      setModalVisible(false);
      setConfirmText("");
      router.replace("/(tabs)/profile" as any);

      // Delay local signOut so navigation settles first.
      // The auth user is already deleted server-side by the RPC,
      // this just clears the cached token on the client.
      setTimeout(() => {
        accountService.signOut().catch(() => {});
      }, 500);
    } catch (err: any) {
      const message = err.message || "Failed to delete account";

      if (message.includes("Cannot delete the last admin")) {
        Alert.alert(
          "Cannot Delete",
          "You are the last admin account. Promote another user to admin first, then try again.",
        );
      } else {
        Alert.alert("Deletion Failed", message);
      }
      setDeleting(false);
    }
  }, [isConfirmed, deleting, router]);

  return {
    modalVisible,
    confirmText,
    setConfirmText,
    deleting,
    isConfirmed,
    openModal,
    closeModal,
    handleDelete,
  };
}
