import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Alert } from "react-native";
import { supabase } from "../lib/supabase";
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

  // Computed
  isValid: boolean;
  hasChanges: boolean;

  // Options
  stateOptions: Array<{ label: string; value: string }>;
  gameOptions: Array<{ label: string; value: string }>;

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
    profileData.preferred_game !== originalData.preferred_game;

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

      const result = await supabase
        .from("profiles")
        .update({
          name: profileData.name.trim(),
          home_state: profileData.home_state || null,
          favorite_player: profileData.favorite_player.trim() || null,
          preferred_game: profileData.preferred_game || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", session.user.id);

      if (result.error) {
        throw result.error;
      }

      // Update original data to reflect saved state
      setOriginalData({ ...profileData });

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
            onPress: () => setProfileData({ ...originalData })
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
