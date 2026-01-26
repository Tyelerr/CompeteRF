import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { supabase } from "../../src/lib/supabase";
import { COLORS } from "../../src/theme/colors";
import { RADIUS, SPACING } from "../../src/theme/spacing";
import { FONT_SIZES } from "../../src/theme/typography";
import { US_STATES } from "../../src/utils/constants";
import { Dropdown } from "../../src/views/components/common/dropdown";
import { Loading } from "../../src/views/components/common/loading";

const GAME_TYPES = [
  { label: "Select Game Type", value: "" },
  { label: "8-Ball", value: "8-Ball" },
  { label: "9-Ball", value: "9-Ball" },
  { label: "10-Ball", value: "10-Ball" },
  { label: "One Pocket", value: "One Pocket" },
  { label: "Straight Pool", value: "Straight Pool" },
  { label: "Bank Pool", value: "Bank Pool" },
  { label: "3-Cushion Billiards", value: "3-Cushion Billiards" },
];

export default function EditProfileScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);

  // Form fields
  const [name, setName] = useState("");
  const [homeState, setHomeState] = useState("");
  const [favoritePlayer, setFavoritePlayer] = useState("");
  const [favoriteGame, setFavoriteGame] = useState("");

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.user) {
        router.replace("/auth/login");
        return;
      }

      setUser(session.user);

      const { data: profileData } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", session.user.id)
        .single();

      if (profileData) {
        setProfile(profileData);
        setName(profileData.name || "");
        setHomeState(profileData.home_state || "");
        setFavoritePlayer(profileData.favorite_player || "");
        setFavoriteGame(profileData.preferred_game || "");

        // Load existing avatar if available
        if (profileData.avatar_url) {
          setImageUri(profileData.avatar_url);
        }
      }
    } catch (error) {
      console.error("Error loading profile:", error);
      Alert.alert("Error", "Failed to load profile");
    } finally {
      setLoading(false);
    }
  };

  const pickImage = async () => {
    try {
      const permissionResult =
        await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permissionResult.granted) {
        Alert.alert(
          "Permission needed",
          "Please allow access to your photo library",
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: "images" as any,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
        base64: false,
      });

      if (!result.canceled && result.assets[0]) {
        setImageUri(result.assets[0].uri);
        await uploadImage(result.assets[0].uri);
      }
    } catch (error) {
      console.error("Error picking image:", error);
      Alert.alert("Error", "Failed to select image");
    }
  };

  const takePhoto = async () => {
    try {
      const permissionResult =
        await ImagePicker.requestCameraPermissionsAsync();

      if (!permissionResult.granted) {
        Alert.alert("Permission needed", "Please allow camera access");
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
        base64: false,
      });

      if (!result.canceled && result.assets[0]) {
        setImageUri(result.assets[0].uri);
        await uploadImage(result.assets[0].uri);
      }
    } catch (error) {
      console.error("Error taking photo:", error);
      Alert.alert("Error", "Failed to take photo");
    }
  };

  const uploadImage = async (uri: string) => {
    if (!user) return;

    setUploadingImage(true);
    try {
      // Get file info
      const response = await fetch(uri);
      const blob = await response.blob();
      const fileName = `avatar-${Date.now()}.jpg`;
      const filePath = `${user.id}/${fileName}`;

      // Upload to Supabase storage
      const { data, error } = await supabase.storage
        .from("profile-images")
        .upload(filePath, blob, {
          cacheControl: "3600",
          upsert: true,
        });

      if (error) throw error;

      // Get public URL
      const { data: publicUrlData } = supabase.storage
        .from("profile-images")
        .getPublicUrl(filePath);

      // Update profile with new avatar URL
      const { error: updateError } = await supabase
        .from("profiles")
        .update({ avatar_url: publicUrlData.publicUrl })
        .eq("id", user.id);

      if (updateError) throw updateError;

      Alert.alert("Success", "Profile picture updated!");
    } catch (error) {
      console.error("Error uploading image:", error);
      Alert.alert("Error", "Failed to upload image");
    } finally {
      setUploadingImage(false);
    }
  };

  const removeImage = async () => {
    if (!user) return;

    try {
      // Remove from storage
      const filePath = `${user.id}/avatar.jpg`;
      await supabase.storage.from("profile-images").remove([filePath]);

      // Update profile to remove avatar URL
      const { error } = await supabase
        .from("profiles")
        .update({ avatar_url: null })
        .eq("id", user.id);

      if (error) throw error;

      setImageUri(null);
      Alert.alert("Success", "Profile picture removed");
    } catch (error) {
      console.error("Error removing image:", error);
      Alert.alert("Error", "Failed to remove image");
    }
  };

  const handleSave = async () => {
    if (!name.trim() || !homeState) {
      Alert.alert("Error", "Please fill in all required fields");
      return;
    }

    setSaving(true);
    try {
      const updateData = {
        name: name.trim(),
        home_state: homeState,
        favorite_player: favoritePlayer.trim() || null,
        preferred_game: favoriteGame || null,
      };

      const { error } = await supabase
        .from("profiles")
        .update(updateData)
        .eq("id", user.id);

      if (error) throw error;

      Alert.alert("Success", "Profile updated successfully!", [
        {
          text: "OK",
          onPress: () => router.back(),
        },
      ]);
    } catch (error) {
      console.error("Error saving profile:", error);
      Alert.alert("Error", "Failed to save profile");
    } finally {
      setSaving(false);
    }
  };

  const renderBilliardAvatar = () => (
    <View style={styles.billiardAvatar}>
      <View style={styles.ballRow}>
        <View style={[styles.ball, styles.ball8]} />
        <View style={[styles.ball, styles.ball9]} />
        <View style={[styles.ball, styles.ball1]} />
      </View>
      <View style={styles.ballRow}>
        <View style={[styles.ball, styles.ball15]} />
        <View style={[styles.ball, styles.ball2]} />
        <View style={[styles.ball, styles.ball10]} />
      </View>
      <View style={styles.ballRow}>
        <View style={[styles.ball, styles.ball7]} />
        <View style={[styles.ball, styles.ball3]} />
        <View style={[styles.ball, styles.ball12]} />
      </View>
    </View>
  );

  if (loading) {
    return <Loading fullScreen message="Loading profile..." />;
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
    >
      <View style={styles.header}>
        <Text style={styles.headerTitle}>COMPLETE PROFILE</Text>
        <Text style={styles.headerSubtitle}>Tell us a bit about yourself</Text>
      </View>

      <ScrollView
        style={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.scrollContentContainer}
      >
        <View style={styles.form}>
          {/* Profile Picture Section */}
          <View style={styles.section}>
            <Text style={styles.label}>Profile Picture</Text>
            <View style={styles.avatarSection}>
              <View style={styles.avatarContainer}>
                {imageUri ? (
                  <Image source={{ uri: imageUri }} style={styles.avatar} />
                ) : (
                  renderBilliardAvatar()
                )}
                {uploadingImage && (
                  <View style={styles.uploadingOverlay}>
                    <Text style={styles.uploadingText}>Uploading...</Text>
                  </View>
                )}
              </View>
              <View style={styles.avatarButtons}>
                <TouchableOpacity
                  style={styles.avatarButton}
                  onPress={pickImage}
                >
                  <Text style={styles.avatarButtonText}>Choose Photo</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.avatarButton}
                  onPress={takePhoto}
                >
                  <Text style={styles.avatarButtonText}>Take Photo</Text>
                </TouchableOpacity>
                {imageUri && (
                  <TouchableOpacity
                    style={[styles.avatarButton, styles.removeButton]}
                    onPress={removeImage}
                  >
                    <Text style={styles.removeButtonText}>Remove</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </View>

          {/* Name Field */}
          <View style={styles.section}>
            <Text style={styles.label}>Full Name *</Text>
            <TextInput
              style={styles.input}
              placeholder="Your Name"
              placeholderTextColor={COLORS.textMuted}
              value={name}
              onChangeText={setName}
              returnKeyType="next"
            />
          </View>

          {/* Username Display (Read-only) */}
          <View style={styles.section}>
            <Text style={styles.usernameLabel}>
              Username: @{profile?.user_name || "username"}
            </Text>
            <Text style={styles.usernameNote}>(Cannot be changed)</Text>
          </View>

          {/* Home State */}
          <View style={styles.section}>
            <Text style={styles.label}>Home State *</Text>
            <Dropdown
              placeholder="Select State"
              options={US_STATES}
              value={homeState}
              onSelect={setHomeState}
            />
          </View>

          {/* Favorite Player */}
          <View style={styles.section}>
            <Text style={styles.label}>Favorite Player</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g., Shane Van Boening, Earl Strickland"
              placeholderTextColor={COLORS.textMuted}
              value={favoritePlayer}
              onChangeText={setFavoritePlayer}
              returnKeyType="next"
            />
          </View>

          {/* Favorite Game */}
          <View style={styles.section}>
            <Text style={styles.label}>Favorite Game</Text>
            <Dropdown
              placeholder="Select Game Type"
              options={GAME_TYPES}
              value={favoriteGame}
              onSelect={setFavoriteGame}
            />
          </View>
        </View>
      </ScrollView>

      {/* Persistent Action Buttons */}
      <View style={styles.actionButtons}>
        <TouchableOpacity
          style={[
            styles.saveButton,
            (!name.trim() || !homeState || saving) && styles.saveButtonDisabled,
          ]}
          onPress={handleSave}
          disabled={saving || !name.trim() || !homeState}
        >
          <Text style={styles.saveButtonText}>
            {saving ? "Saving..." : "Save Changes"}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.cancelButton}
          onPress={() => router.back()}
          disabled={saving}
        >
          <Text style={styles.cancelButtonText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    padding: SPACING.md,
    paddingTop: SPACING.xl + SPACING.lg,
    paddingBottom: SPACING.sm,
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerTitle: {
    fontSize: FONT_SIZES.xl,
    fontWeight: "700",
    color: COLORS.text,
    textAlign: "center",
  },
  headerSubtitle: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    textAlign: "center",
    marginTop: SPACING.xs,
  },
  scrollContent: {
    flex: 1,
  },
  scrollContentContainer: {
    paddingBottom: SPACING.xl, // Extra padding at bottom when keyboard is visible
  },
  form: {
    padding: SPACING.md,
    paddingBottom: SPACING.xl, // Extra padding at bottom for better scrolling
  },
  section: {
    marginBottom: SPACING.lg,
  },
  label: {
    fontSize: FONT_SIZES.md,
    fontWeight: "600",
    color: COLORS.text,
    marginBottom: SPACING.sm,
  },
  input: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md - 2, // Reduce horizontal padding to make it narrower
    fontSize: FONT_SIZES.md,
    color: COLORS.text,
    height: 47,
    marginHorizontal: 2, // Add small margin to make it slightly narrower than container
  },
  usernameLabel: {
    fontSize: FONT_SIZES.md,
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },
  usernameNote: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textMuted,
  },
  avatarSection: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
  },
  avatarContainer: {
    position: "relative",
    marginRight: SPACING.md,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  billiardAvatar: {
    width: 80,
    height: 80,
  },
  ballRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 2,
  },
  ball: {
    width: 24,
    height: 24,
    borderRadius: 12,
    marginHorizontal: 1,
  },
  ball1: { backgroundColor: "#FFD700" },
  ball2: { backgroundColor: "#0066FF" },
  ball3: { backgroundColor: "#FF0000" },
  ball7: { backgroundColor: "#8B0000" },
  ball8: { backgroundColor: "#000000" },
  ball9: { backgroundColor: "#FFD700", borderWidth: 2, borderColor: "#FFF" },
  ball10: { backgroundColor: "#0066FF", borderWidth: 2, borderColor: "#FFF" },
  ball12: { backgroundColor: "#800080" },
  ball15: { backgroundColor: "#8B0000", borderWidth: 2, borderColor: "#FFF" },
  uploadingOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.7)",
    borderRadius: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  uploadingText: {
    color: COLORS.white,
    fontSize: FONT_SIZES.xs,
  },
  avatarButtons: {
    flex: 1,
  },
  avatarButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.sm,
    marginBottom: SPACING.xs,
    alignItems: "center",
  },
  avatarButtonText: {
    color: COLORS.white,
    fontSize: FONT_SIZES.sm,
    fontWeight: "600",
  },
  removeButton: {
    backgroundColor: COLORS.error,
  },
  removeButtonText: {
    color: COLORS.white,
    fontSize: FONT_SIZES.sm,
    fontWeight: "600",
  },
  // Persistent action buttons at bottom
  actionButtons: {
    flexDirection: "row",
    padding: SPACING.md,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.xl + SPACING.md, // More space from bottom edge
    marginBottom: SPACING.lg, // Additional margin to lift buttons up
    backgroundColor: COLORS.background,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    gap: SPACING.md,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.error,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelButtonText: {
    fontSize: FONT_SIZES.md,
    fontWeight: "600",
    color: COLORS.white,
  },
  saveButton: {
    flex: 1,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  saveButtonDisabled: {
    backgroundColor: COLORS.textMuted,
  },
  saveButtonText: {
    fontSize: FONT_SIZES.md,
    fontWeight: "600",
    color: COLORS.white,
  },
});
