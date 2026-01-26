import * as ImagePicker from "expo-image-picker";
import { supabase } from "../../lib/supabase";

export const imageUploadService = {
  /**
   * Pick an image from the device library
   */
  async pickImage(): Promise<string | null> {
    // Request permission
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      throw new Error("Permission to access media library was denied");
    }

    // Launch image picker
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
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
      // Get file extension
      const ext = uri.split(".").pop()?.toLowerCase() || "jpg";
      const fileName = `${folder ? folder + "/" : ""}${Date.now()}.${ext}`;

      // Fetch the image and convert to blob
      const response = await fetch(uri);
      const blob = await response.blob();

      // Convert blob to array buffer
      const arrayBuffer = await new Response(blob).arrayBuffer();

      // Upload to Supabase
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

      // Get public URL
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
      // Extract file path from URL
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
