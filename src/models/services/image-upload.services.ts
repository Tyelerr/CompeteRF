import * as ImagePicker from "expo-image-picker";
import { Alert, Linking } from "react-native";
import { supabase } from "../../lib/supabase";

export const imageUploadService = {
  /**
   * Pick an image from the device library.
   * Returns null if the user cancels or permission is unavailable.
   * Shows an actionable alert guiding the user to Settings if access was previously denied.
   */
  async pickImage(): Promise<string | null> {
    // Check existing status before requesting — iOS silently ignores
    // requestMediaLibraryPermissionsAsync() once status is "denied"
    const { status: existingStatus } =
      await ImagePicker.getMediaLibraryPermissionsAsync();

    if (existingStatus === "denied") {
      Alert.alert(
        "Photo Access Disabled",
        "Compete needs access to your photo library to upload images. Please enable it in Settings.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Open Settings", onPress: () => Linking.openSettings() },
        ],
      );
      return null;
    }

    // Either undetermined or already granted — request/confirm
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (status !== "granted") {
      Alert.alert(
        "Permission Required",
        "Please allow access to your photo library to upload images.",
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
   * Upload an image to Supabase storage
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
   * Delete an image from Supabase storage
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
