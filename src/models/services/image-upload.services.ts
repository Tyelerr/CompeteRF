import * as ImagePicker from "expo-image-picker";
import { Alert, Linking } from "react-native";
import { supabase } from "../../lib/supabase";

export const imageUploadService = {
  /**
   * Pick an image from the device library.
   * Returns null if the user cancels or permission is unavailable.
   *
   * IMPORTANT: Do NOT call getMediaLibraryPermissionsAsync() first and
   * early-exit on "denied". On iOS, the OS can grant access in Settings
   * after a prior denial, but the get() call may return a stale "denied"
   * within the same app session. requestMediaLibraryPermissionsAsync()
   * always reflects the true current OS state and never re-prompts the
   * user if they previously denied — it just returns the live status.
   */
  async pickImage(): Promise<string | null> {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (status !== "granted") {
      Alert.alert(
        "Photo Access Required",
        "Compete needs access to your photo library. Please enable it in Settings.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Open Settings", onPress: () => Linking.openSettings() },
        ],
      );
      return null;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: false,
      quality: 0.8,
    });

    if (result.canceled || !result.assets[0]) {
      return null;
    }

    return result.assets[0].uri;
  },

  /**
   * Upload an image to Supabase storage.
   */
  async uploadImage(
    uri: string,
    bucket: string,
    folder?: string,
  ): Promise<{ success: boolean; url?: string; error?: string }> {
    try {
      let ext = uri.split(".").pop()?.toLowerCase() || "jpg";
      if (ext === "heic" || ext === "heif") {
        ext = "jpg";
      }
      const fileName = `${folder ? folder + "/" : ""}${Date.now()}.${ext}`;

      const response = await fetch(uri);
      const blob = await response.blob();
      const arrayBuffer = await new Response(blob).arrayBuffer();

      const { data, error } = await supabase.storage
        .from(bucket)
        .upload(fileName, arrayBuffer, {
          contentType: `image/${ext === "jpg" ? "jpeg" : ext}`,
          upsert: false,
        });

      if (error) {
        console.error("Upload error:", error);
        return { success: false, error: error.message };
      }

      const { data: urlData } = supabase.storage
        .from(bucket)
        .getPublicUrl(data.path);

      return { success: true, url: urlData.publicUrl };
    } catch (error) {
      console.error("Image upload error:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Upload failed",
      };
    }
  },

  /**
   * Delete an image from Supabase storage.
   */
  async deleteImage(
    url: string,
    bucket: string,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const urlParts = url.split(`${bucket}/`);
      if (urlParts.length < 2) {
        return { success: false, error: "Invalid URL format" };
      }

      const filePath = urlParts[1];
      const { error } = await supabase.storage.from(bucket).remove([filePath]);

      if (error) {
        console.error("Delete error:", error);
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (error) {
      console.error("Image delete error:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Delete failed",
      };
    }
  },
};
