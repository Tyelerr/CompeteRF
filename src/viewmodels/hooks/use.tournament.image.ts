// use.tournament.image.ts
// Shared viewmodel hook for picking + uploading a custom tournament image.
// Wraps the photo picker, content scan, and upload (via tournamentImageService)
// so every creation/edit flow gets identical behavior. Returns the stored value
// ready to drop into a form's `thumbnail` field (`custom:<publicUrl>`), or null
// if the TD cancelled / the image was rejected.

import * as ImagePicker from "expo-image-picker";
import { useState } from "react";
import { Alert } from "react-native";
import { tournamentImageService } from "../../models/services/tournament-image.service";

export const useTournamentImage = (userId?: string) => {
  const [uploading, setUploading] = useState(false);

  const pickAndUploadCustomImage = async (): Promise<string | null> => {
    try {
      const { status: existingStatus } =
        await ImagePicker.getMediaLibraryPermissionsAsync();
      if (existingStatus === "denied") {
        Alert.alert(
          "Photo Access Disabled",
          "Compete needs access to your photo library to upload images. Please enable it in Settings.",
        );
        return null;
      }
      const { status } =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          "Permission needed",
          "Please grant photo library access to upload images.",
        );
        return null;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"], // SDK 57: MediaTypeOptions is deprecated
        allowsEditing: false,
        aspect: [16, 9],
        quality: 0.8,
        exif: false,
      });
      if (result.canceled || !result.assets[0]) return null;

      setUploading(true);
      const asset = result.assets[0];
      // TEMP diagnostics for the image payload (HEIC vs JPEG, size, extension).
      console.log("🖼️ picked asset:", {
        uri: asset.uri,
        mimeType: asset.mimeType,
        fileName: asset.fileName,
        fileSize: asset.fileSize,
        ext: asset.uri.split(".").pop()?.toLowerCase(),
      });
      const outcome = await tournamentImageService.scanAndUpload(
        asset.uri,
        userId,
        asset.mimeType,
      );

      if (!outcome.ok) {
        if (outcome.reason === "error") {
          // FAIL CLOSED: scanner/config unavailable — keep the previous image.
          Alert.alert("Image review unavailable", outcome.message);
        } else {
          Alert.alert(
            "Image Not Allowed",
            `This image was rejected by content moderation:\n\n${outcome.violations.join("\n")}`,
          );
        }
        return null;
      }

      return `custom:${outcome.publicUrl}`;
    } catch (error: any) {
      Alert.alert("Upload Error", error?.message || "Failed to upload image.");
      return null;
    } finally {
      setUploading(false);
    }
  };

  return { uploading, pickAndUploadCustomImage };
};
