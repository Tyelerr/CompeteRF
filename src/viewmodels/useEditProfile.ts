import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Alert } from "react-native";
import { supabase } from "../lib/supabase";
import { imageUploadService } from "../models/services/image-upload.services";
import { useAuthContext } from "../providers/AuthProvider";
import { US_STATES } from "../utils/constants";

interface ProfileData {
  name: string;
  home_state: string;
  favorite_player: string;
  preferred_game: string;
}

interface UseEditProfileReturn {
  // Form state
  profileData: ProfileData;
  loading: boolean;
  saving: boolean;
  error: string;

  // Avatar
  avatarUrl: string | null;
  uploadingAvatar: boolean;
  handlePickAvatar: () => Promise<void>;
  handleRemoveAvatar: () => void;

  // Computed
  isValid: boolean;
  hasChanges: boolean;

  // Options
  stateOptions: { label: string; value: string }[];
  gameOptions: { label: string; value: string }[];

  // Actions
  updateField: (field: keyof ProfileData, value: string) => void;
  handleSave: () => Promise<void>;
  handleReset: () => void;
  goBack: () => void;
}

export const useEditProfile = (): UseEditProfileReturn => {
  const router = useRouter();
  const { profile } = useAuthContext();

  const [originalData, setOriginalData] = useState<ProfileData>({
    name: "",
    home_state: "",
    favorite_player: "",
    preferred_game: "",
  });

  const [profileData, setProfileData] = useState<ProfileData>({
    name: "",
    home_state: "",
    favorite_player: "",
    preferred_game: "",
  });

  // Avatar state
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [originalAvatarUrl, setOriginalAvatarUrl] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.user) {
        setError("Please log in to continue");
        setLoading(false);
        return;
      }

      // Load current profile data
      const { data: profileData } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", session.user.id)
        .single();

      if (profileData) {
        const data: ProfileData = {
          name: profileData.name || "",
          home_state: profileData.home_state || "",
          favorite_player: profileData.favorite_player || "",
          preferred_game: profileData.preferred_game || "",
        };
        
        setOriginalData(data);
        setProfileData(data);
        setAvatarUrl(profileData.avatar_url || null);
        setOriginalAvatarUrl(profileData.avatar_url || null);
      } else {
        // No profile exists - redirect to create one
        Alert.alert(
          "No Profile Found",
          "You need to create a profile first.",
          [{ text: "OK", onPress: () => router.back() }]
        );
      }
    } catch (err: any) {
      setError(err.message || "Failed to load profile");
    } finally {
      setLoading(false);
    }
  };

  // Pick and upload avatar
  const handlePickAvatar = async () => {
    try {
      setUploadingAvatar(true);
      const uri = await imageUploadService.pickImage();
      
      if (!uri) {
        setUploadingAvatar(false);
        return;
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        throw new Error("No authenticated user found");
      }

      // Upload to profile-images bucket with user-specific folder
      const result = await imageUploadService.uploadImage(
        uri,
        "profile-images",
        `avatars/${session.user.id}`,
      );

      if (!result.success || !result.url) {
        throw new Error(result.error || "Upload failed");
      }

      setAvatarUrl(result.url);
    } catch (err: any) {
      console.error("Avatar upload error:", err);
      Alert.alert("Error", err.message || "Failed to upload image");
    } finally {
      setUploadingAvatar(false);
    }
  };

  // Remove avatar
  const handleRemoveAvatar = () => {
    Alert.alert(
      "Remove Photo",
      "Are you sure you want to remove your profile photo?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => setAvatarUrl(null),
        },
      ],
    );
  };

  // Options for dropdowns
  const stateOptions = [
    { label: "Select State", value: "" },
    ...US_STATES
  ];

  const gameOptions = [
    { label: "Select Game", value: "" },
    { label: "8-Ball", value: "8-ball" },
    { label: "9-Ball", value: "9-ball" },
    { label: "10-Ball", value: "10-ball" },
    { label: "One Pocket", value: "one-pocket" },
    { label: "Straight Pool", value: "straight-pool" },
    { label: "Banks", value: "banks" },
  ];

  // Computed values
  const isValid = profileData.name.trim().length >= 2;
  
  const hasChanges = 
    profileData.name !== originalData.name ||
    profileData.home_state !== originalData.home_state ||
    profileData.favorite_player !== originalData.favorite_player ||
    profileData.preferred_game !== originalData.preferred_game ||
    avatarUrl !== originalAvatarUrl;

  // Actions
  const updateField = (field: keyof ProfileData, value: string) => {
    setProfileData(prev => ({
      ...prev,
      [field]: value
    }));
    if (error) setError("");
  };

  const handleSave = async () => {
    if (!isValid) {
      setError("Please enter a name (at least 2 characters)");
      return;
    }

    if (!hasChanges) {
      Alert.alert("No Changes", "No changes were made to save.");
      return;
    }

    setSaving(true);
    setError("");

    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.user) {
        throw new Error("No authenticated user found");
      }

      // Delete old avatar from storage if it was replaced or removed
      if (originalAvatarUrl && avatarUrl !== originalAvatarUrl) {
        await imageUploadService.deleteImage(originalAvatarUrl, "profile-images");
      }

      const { data, error: updateError } = await supabase
        .from("profiles")
        .update({
          name: profileData.name.trim(),
          home_state: profileData.home_state || null,
          favorite_player: profileData.favorite_player.trim() || null,
          preferred_game: profileData.preferred_game || null,
          avatar_url: avatarUrl,
          updated_at: new Date().toISOString(),
        })
        .eq("id", session.user.id)
        .select()
        .single();

      if (updateError) {
        throw updateError;
      }

      if (!data) {
        throw new Error("Update failed — no rows were modified.");
      }

      // Update original data to reflect saved state
      setOriginalData({ ...profileData });
      setOriginalAvatarUrl(avatarUrl);

      Alert.alert(
        "Success",
        "Profile updated successfully!",
        [
          {
            text: "OK",
            onPress: () => router.back()
          }
        ]
      );

    } catch (err: any) {
      setError(err.message || "Failed to update profile");
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    if (hasChanges) {
      Alert.alert(
        "Reset Changes",
        "Are you sure you want to discard your changes?",
        [
          { text: "Cancel", style: "cancel" },
          { 
            text: "Reset", 
            style: "destructive",
            onPress: () => {
              setProfileData({ ...originalData });
              setAvatarUrl(originalAvatarUrl);
            }
          }
        ]
      );
    }
  };

  const goBack = () => {
    if (hasChanges) {
      Alert.alert(
        "Unsaved Changes",
        "You have unsaved changes. Do you want to save them before leaving?",
        [
          { text: "Discard", style: "destructive", onPress: () => router.back() },
          { text: "Cancel", style: "cancel" },
          { text: "Save", onPress: handleSave }
        ]
      );
    } else {
      router.back();
    }
  };

  return {
    // Form state
    profileData,
    loading,
    saving,
    error,

    // Avatar
    avatarUrl,
    uploadingAvatar,
    handlePickAvatar,
    handleRemoveAvatar,

    // Computed
    isValid,
    hasChanges,

    // Options
    stateOptions,
    gameOptions,

    // Actions
    updateField,
    handleSave,
    handleReset,
    goBack,
  };
};
