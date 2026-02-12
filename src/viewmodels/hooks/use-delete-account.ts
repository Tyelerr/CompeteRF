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
    if (deleting) return; // prevent closing mid-deletion
    setConfirmText("");
    setModalVisible(false);
  }, [deleting]);

  const handleDelete = useCallback(async () => {
    if (!isConfirmed || deleting) return;

    setDeleting(true);
    try {
      await accountService.deleteAccount();
      await accountService.signOut();

      setModalVisible(false);
      setConfirmText("");

      // Navigate to auth screen — use replace so they can't go back
      router.replace("/auth/login");
    } catch (err: any) {
      const message = err.message || "Failed to delete account";

      // Surface last-admin-block error clearly
      if (message.includes("Cannot delete the last admin")) {
        Alert.alert(
          "Cannot Delete",
          "You are the last admin account. Promote another user to admin first, then try again.",
        );
      } else {
        Alert.alert("Deletion Failed", message);
      }
    } finally {
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
