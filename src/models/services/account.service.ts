// src/models/services/account.service.ts

import { supabase } from "../../lib/supabase";

class AccountService {
  /**
   * Deletes the current user's profile images from storage
   * using the Supabase Storage API (not direct SQL).
   */
  private async deleteProfileImages(): Promise<void> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // List all files in the user's profile-images folder
      const { data: files, error: listError } = await supabase.storage
        .from("profile-images")
        .list(user.id);

      if (listError || !files || files.length === 0) return;

      const filePaths = files.map((f) => `${user.id}/${f.name}`);

      const { error: removeError } = await supabase.storage
        .from("profile-images")
        .remove(filePaths);

      if (removeError) {
        console.warn("Failed to delete profile images:", removeError.message);
        // Non-fatal — continue with account deletion
      }
    } catch (err) {
      console.warn("Error cleaning up profile images:", err);
    }
  }

  /**
   * Deletes the user's account:
   * 1. Removes profile images from storage (via Storage API)
   * 2. Calls the `delete_user_account` RPC which handles all DB cleanup
   */
  async deleteAccount(): Promise<void> {
    // Step 1: Delete storage files via API
    await this.deleteProfileImages();

    // Step 2: Run the DB cascade + auth deletion
    const { error } = await supabase.rpc("delete_user_account");

    if (error) {
      console.error("delete_user_account RPC error:", error);
      throw new Error(error.message || "Failed to delete account");
    }
  }

  /**
   * Signs the user out locally after account deletion.
   */
  async signOut(): Promise<void> {
    await supabase.auth.signOut();
  }
}

export const accountService = new AccountService();
