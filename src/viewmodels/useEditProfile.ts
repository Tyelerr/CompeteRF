// src/viewmodels/useEditProfile.ts

import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Alert } from "react-native";
import { supabase } from "../lib/supabase";
import { imageUploadService } from "../models/services/image-upload.services";
import { useAuthContext } from "../providers/AuthProvider";
import { US_STATES } from "../utils/constants";
import { buildFullName } from "../utils/name.utils";

interface ProfileData {
  first_name: string;
  last_name: string;
  home_state: string;
  favorite_player: string;
  preferred_game: string;
}

interface UseEditProfileReturn {
  profileData: ProfileData;
  loading: boolean;
  saving: boolean;
  error: string;
  username: string;
  avatarUrl: string | null;
  uploadingAvatar: boolean;
  handlePickAvatar: () => Promise<void>;
  handleRemoveAvatar: () => void;
  isValid: boolean;
  hasChanges: boolean;
  stateOptions: { label: string; value: string }[];
  gameOptions: { label: string; value: string }[];
  updateField: (field: keyof ProfileData, value: string) => void;
  handleSave: () => Promise<void>;
  handleReset: () => void;
  goBack: () => void;
}

export const useEditProfile = (): UseEditProfileReturn => {
  const router = useRouter();

  // Use the already-hydrated context profile as the source of truth.
  // This avoids a race condition where a fresh DB fetch on mount fires
  // before the store has propagated after signup, incorrectly showing
  // "No Profile Found" when the profile actually exists.
  const { profile: contextProfile } = useAuthContext();

  const [originalData, setOriginalData] = useState<ProfileData>({
    first_name: "",
    last_name: "",
    home_state: "",
    favorite_player: "",
    preferred_game: "",
  });

  const [profileData, setProfileData] = useState<ProfileData>({
    first_name: "",
    last_name: "",
    home_state: "",
    favorite_player: "",
    preferred_game: "",
  });

  const [username, setUsername] = useState("");
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
      // ── Fast path: context profile is already loaded ──────────────────
      // The AuthProvider hydrates the Zustand store before this screen
      // mounts in normal usage. Seeding from context avoids a redundant
      // DB round-trip and eliminates the signup race condition where a
      // fresh fetch would find nothing during the brief post-signup window.
      if (contextProfile) {
        seedFromProfileData(contextProfile);
        setLoading(false);
        return;
      }

      // ── Slow path: context hasn't hydrated yet — fetch directly ───────
      // This covers edge cases like deep-linking directly to the edit
      // screen before the provider has initialised.
      const { data: { session } } = await supabase.auth.getSession();

      if (!session?.user) {
        setError("Please log in to continue");
        setLoading(false);
        return;
      }

      const { data: profileData } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", session.user.id)
        .maybeSingle(); // maybeSingle never throws on zero rows

      if (profileData) {
        seedFromProfileData(profileData);
      } else {
        // Only show the alert on the slow path — if we reach here
        // contextProfile was null AND the DB returned nothing, which
        // is a genuine "no profile" state (not a timing issue).
        Alert.alert(
          "No Profile Found",
          "You need to create a profile first.",
          [{ text: "OK", onPress: () => router.back() }],
        );
      }
    } catch (err: any) {
      setError(err.message || "Failed to load profile");
    } finally {
      setLoading(false);
    }
  };

  // ── Helper: seed local state from any profile-shaped object ──────────
  const seedFromProfileData = (p: any) => {
    let firstName = p.first_name || "";
    let lastName  = p.last_name  || "";

    if (!firstName && !lastName && p.name) {
      const parts = p.name.trim().split(/\s+/);
      firstName = parts[0] || "";
      lastName  = parts.slice(1).join(" ") || "";
    }

    const data: ProfileData = {
      first_name:      firstName,
      last_name:       lastName,
      home_state:      p.home_state      || "",
      favorite_player: p.favorite_player || "",
      preferred_game:  p.preferred_game  || "",
    };

    setOriginalData(data);
    setProfileData(data);
    setUsername(p.user_name || "");
    setAvatarUrl(p.avatar_url || null);
    setOriginalAvatarUrl(p.avatar_url || null);
  };

  // ── Avatar ────────────────────────────────────────────────────────────

  const handlePickAvatar = async () => {
    try {
      setUploadingAvatar(true);
      const uri = await imageUploadService.pickImage();
      if (!uri) return;

      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) throw new Error("No authenticated user found");

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

  const handleRemoveAvatar = () => {
    Alert.alert(
      "Remove Photo",
      "Are you sure you want to remove your profile photo?",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Remove", style: "destructive", onPress: () => setAvatarUrl(null) },
      ],
    );
  };

  // ── Options ───────────────────────────────────────────────────────────

  const stateOptions = [
    { label: "Select State", value: "" },
    ...US_STATES,
  ];

  const gameOptions = [
    { label: "Select Game", value: "" },
    { label: "8-Ball",       value: "8-ball"        },
    { label: "9-Ball",       value: "9-ball"        },
    { label: "10-Ball",      value: "10-ball"       },
    { label: "One Pocket",   value: "one-pocket"    },
    { label: "Straight Pool",value: "straight-pool" },
    { label: "Banks",        value: "banks"         },
    { label: "Carom",        value: "carom"         },
    { label: "Snooker",      value: "snooker"       },
  ];

  // ── Derived ───────────────────────────────────────────────────────────

  const isValid =
    profileData.first_name.trim().length >= 1 &&
    profileData.last_name.trim().length >= 1;

  const hasChanges =
    profileData.first_name     !== originalData.first_name     ||
    profileData.last_name      !== originalData.last_name      ||
    profileData.home_state     !== originalData.home_state     ||
    profileData.favorite_player !== originalData.favorite_player ||
    profileData.preferred_game !== originalData.preferred_game ||
    avatarUrl !== originalAvatarUrl;

  const updateField = (field: keyof ProfileData, value: string) => {
    setProfileData(prev => ({ ...prev, [field]: value }));
    if (error) setError("");
  };

  // ── Save ──────────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!isValid) {
      setError("Please enter both first and last name");
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
      if (!session?.user) throw new Error("No authenticated user found");

      if (originalAvatarUrl && avatarUrl !== originalAvatarUrl) {
        await imageUploadService.deleteImage(originalAvatarUrl, "profile-images");
      }

      const trimmedFirst = profileData.first_name.trim();
      const trimmedLast  = profileData.last_name.trim();

      const { data, error: updateError } = await supabase
        .from("profiles")
        .update({
          name:            buildFullName(trimmedFirst, trimmedLast),
          first_name:      trimmedFirst,
          last_name:       trimmedLast,
          home_state:      profileData.home_state || null,
          favorite_player: profileData.favorite_player.trim() || null,
          preferred_game:  profileData.preferred_game || null,
          avatar_url:      avatarUrl,
          updated_at:      new Date().toISOString(),
        })
        .eq("id", session.user.id)
        .select()
        .single();

      if (updateError) throw updateError;
      if (!data) throw new Error("Update failed — no rows were modified.");

      setOriginalData({ ...profileData });
      setOriginalAvatarUrl(avatarUrl);

      Alert.alert("Success", "Profile updated successfully!", [
        { text: "OK", onPress: () => router.back() },
      ]);
    } catch (err: any) {
      setError(err.message || "Failed to update profile");
    } finally {
      setSaving(false);
    }
  };

  // ── Reset / nav ───────────────────────────────────────────────────────

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
            },
          },
        ],
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
          { text: "Save", onPress: handleSave },
        ],
      );
    } else {
      router.back();
    }
  };

  return {
    profileData,
    loading,
    saving,
    error,
    username,
    avatarUrl,
    uploadingAvatar,
    handlePickAvatar,
    handleRemoveAvatar,
    isValid,
    hasChanges,
    stateOptions,
    gameOptions,
    updateField,
    handleSave,
    handleReset,
    goBack,
  };
};
