import { featuredImageService } from "@/src/models/services/featured-content.service";
import { useCreateFeaturedPlayer } from "@/src/viewmodels/useFeaturedContent";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

interface CreatePlayerModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function CreatePlayerModal({
  visible,
  onClose,
  onSuccess,
}: CreatePlayerModalProps) {
  const {
    availableProfiles,
    createPlayer,
    loading: creating,
  } = useCreateFeaturedPlayer();
  const [showProfileDropdown, setShowProfileDropdown] = useState(false);
  const [currentAchievement, setCurrentAchievement] = useState("");

  // Image state
  const [selectedImageUri, setSelectedImageUri] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);

  const [formData, setFormData] = useState({
    user_id: undefined as number | undefined,
    name: "",
    nickname: "",
    photo_url: "",
    location: "",
    bio: "",
    fargo_rating: undefined as number | undefined,
    achievements: [] as string[],
    featured_priority: 0,
    is_active: true,
  });

  // ─────────────────────────────────────────────────
  // Image Picker
  // ─────────────────────────────────────────────────
  const pickImage = async () => {
    // Request permission
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(
        "Permission Required",
        "Please allow access to your photo library to upload player images.",
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: false,
      aspect: [1, 1], // Square crop for circular display
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      setSelectedImageUri(result.assets[0].uri);
    }
  };

  const removeImage = () => {
    setSelectedImageUri(null);
    setFormData((prev) => ({ ...prev, photo_url: "" }));
  };

  // ─────────────────────────────────────────────────
  // Create handler (with image upload)
  // ─────────────────────────────────────────────────
  const handleCreate = async () => {
    if (!formData.user_id) {
      Alert.alert("Error", "Please select a profile");
      return;
    }
    if (!formData.name.trim()) {
      Alert.alert("Error", "Please enter a name");
      return;
    }

    try {
      // Step 1: Create the player record first (to get the ID)
      const success = await createPlayer(formData);

      if (success) {
        // Step 2: If we have a selected image, upload it
        // Note: Since createPlayer doesn't return the ID directly,
        // we upload with a temp ID. For a cleaner approach, you could
        // modify createPlayer to return the created record.
        if (selectedImageUri) {
          setUploadingImage(true);
          // Upload using the user_id as identifier since we don't have
          // the featured_player ID yet. Alternatively, modify your
          // createPlayer to return the new record's ID.
          const publicUrl = await featuredImageService.uploadImage(
            selectedImageUri,
            "players",
            formData.user_id || Date.now(),
          );

          if (publicUrl) {
            // The photo_url was set during upload via the service
            console.log("✅ Player image uploaded:", publicUrl);
          } else {
            Alert.alert(
              "Note",
              "Player created but image upload failed. You can add the image later from the edit screen.",
            );
          }
          setUploadingImage(false);
        }

        resetForm();
        onClose();
        onSuccess();
        Alert.alert("Success", "Featured player created successfully!");
      }
    } catch (error) {
      setUploadingImage(false);
      Alert.alert("Error", "Failed to create player");
    }
  };

  const resetForm = () => {
    setFormData({
      user_id: undefined,
      name: "",
      nickname: "",
      photo_url: "",
      location: "",
      bio: "",
      fargo_rating: undefined,
      achievements: [],
      featured_priority: 0,
      is_active: true,
    });
    setCurrentAchievement("");
    setSelectedImageUri(null);
  };

  const addAchievement = () => {
    if (
      currentAchievement.trim() &&
      !formData.achievements.includes(currentAchievement.trim())
    ) {
      setFormData((prev) => ({
        ...prev,
        achievements: [...prev.achievements, currentAchievement.trim()],
      }));
      setCurrentAchievement("");
    }
  };

  const removeAchievement = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      achievements: prev.achievements.filter((_, i) => i !== index),
    }));
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const isLoading = creating || uploadingImage;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
    >
      <SafeAreaView style={styles.container}>
        <KeyboardAvoidingView
          style={styles.keyboardView}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={handleClose}>
              <Ionicons name="close" size={24} color="#FFFFFF" />
            </TouchableOpacity>
            <Text style={styles.title}>Create Featured Player</Text>
            <TouchableOpacity
              onPress={handleCreate}
              disabled={isLoading}
              style={[styles.saveButton, isLoading && styles.disabledButton]}
            >
              <Text style={styles.saveButtonText}>
                {isLoading ? "Creating..." : "Create"}
              </Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.content}>
            {/* ─────────────────────────────────────── */}
            {/* Player Photo Upload Section             */}
            {/* ─────────────────────────────────────── */}
            <View style={styles.formRow}>
              <Text style={styles.label}>Player Photo</Text>
              <Text style={styles.labelHint}>
                Square image recommended for circular display
              </Text>

              <View style={styles.imagePickerContainer}>
                {selectedImageUri ? (
                  <View style={styles.imagePreviewContainer}>
                    {/* Circular preview mimicking the home page style */}
                    <View style={styles.imagePreviewGlow}>
                      <View style={styles.imagePreviewBorder}>
                        <Image
                          source={{ uri: selectedImageUri }}
                          style={styles.imagePreview}
                        />
                      </View>
                    </View>

                    <View style={styles.imageActions}>
                      <TouchableOpacity
                        style={styles.changeImageButton}
                        onPress={pickImage}
                      >
                        <Ionicons name="camera" size={16} color="#3B82F6" />
                        <Text style={styles.changeImageText}>Change</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.removeImageButton}
                        onPress={removeImage}
                      >
                        <Ionicons name="trash" size={16} color="#EF4444" />
                        <Text style={styles.removeImageText}>Remove</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={styles.uploadButton}
                    onPress={pickImage}
                  >
                    <View style={styles.uploadIconContainer}>
                      <Ionicons
                        name="camera-outline"
                        size={32}
                        color="#3B82F6"
                      />
                    </View>
                    <Text style={styles.uploadText}>Tap to add photo</Text>
                    <Text style={styles.uploadHint}>
                      JPG, PNG or WebP • Max 5MB
                    </Text>
                  </TouchableOpacity>
                )}

                {uploadingImage && (
                  <View style={styles.uploadingOverlay}>
                    <ActivityIndicator size="small" color="#3B82F6" />
                    <Text style={styles.uploadingText}>Uploading photo...</Text>
                  </View>
                )}
              </View>
            </View>

            {/* Profile Selection */}
            <View style={styles.formRow}>
              <Text style={styles.label}>Select Profile</Text>
              <TouchableOpacity
                style={[styles.input, styles.dropdown]}
                onPress={() => setShowProfileDropdown(!showProfileDropdown)}
              >
                <Text
                  style={[
                    styles.dropdownText,
                    !formData.user_id && styles.placeholderText,
                  ]}
                >
                  {formData.user_id
                    ? availableProfiles.find(
                        (p) => p.id_auto === formData.user_id,
                      )?.name || "Select Profile"
                    : "Select Profile"}
                </Text>
                <Ionicons name="chevron-down" size={20} color="#999999" />
              </TouchableOpacity>

              {showProfileDropdown && (
                <View style={styles.dropdownList}>
                  <ScrollView
                    style={styles.dropdownScrollView}
                    nestedScrollEnabled
                  >
                    {availableProfiles.map((profile) => (
                      <TouchableOpacity
                        key={profile.id_auto}
                        style={styles.dropdownItem}
                        onPress={() => {
                          setFormData((prev) => ({
                            ...prev,
                            user_id: profile.id_auto,
                          }));
                          setShowProfileDropdown(false);
                        }}
                      >
                        <Text style={styles.dropdownItemText}>
                          {profile.name}
                        </Text>
                        <Text style={styles.dropdownItemSubtext}>
                          @{profile.user_name}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}
            </View>

            {/* Form Fields */}
            <View style={styles.formRow}>
              <Text style={styles.label}>Name</Text>
              <TextInput
                style={styles.input}
                value={formData.name}
                onChangeText={(text) =>
                  setFormData((prev) => ({ ...prev, name: text }))
                }
                placeholder="Player display name"
                placeholderTextColor="#666666"
              />
            </View>

            <View style={styles.formRow}>
              <Text style={styles.label}>Nickname</Text>
              <TextInput
                style={styles.input}
                value={formData.nickname}
                onChangeText={(text) =>
                  setFormData((prev) => ({ ...prev, nickname: text }))
                }
                placeholder="Player nickname"
                placeholderTextColor="#666666"
              />
            </View>

            <View style={styles.formRow}>
              <Text style={styles.label}>Location</Text>
              <TextInput
                style={styles.input}
                value={formData.location}
                onChangeText={(text) =>
                  setFormData((prev) => ({ ...prev, location: text }))
                }
                placeholder="Player location"
                placeholderTextColor="#666666"
              />
            </View>

            <View style={styles.formRow}>
              <Text style={styles.label}>Bio</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={formData.bio}
                onChangeText={(text) =>
                  setFormData((prev) => ({ ...prev, bio: text }))
                }
                placeholder="Tell us about this player..."
                placeholderTextColor="#666666"
                multiline
                numberOfLines={4}
              />
            </View>

            <View style={styles.formRow}>
              <Text style={styles.label}>Fargo Rating</Text>
              <TextInput
                style={styles.input}
                value={
                  formData.fargo_rating ? String(formData.fargo_rating) : ""
                }
                onChangeText={(text) =>
                  setFormData((prev) => ({
                    ...prev,
                    fargo_rating: parseInt(text) || undefined,
                  }))
                }
                placeholder="e.g. 625"
                placeholderTextColor="#666666"
                keyboardType="numeric"
              />
            </View>

            {/* Achievements */}
            <View style={styles.formRow}>
              <Text style={styles.label}>Achievements</Text>
              <View style={styles.achievementsContainer}>
                <View style={styles.addAchievementContainer}>
                  <TextInput
                    style={[styles.input, { flex: 1 }]}
                    value={currentAchievement}
                    onChangeText={setCurrentAchievement}
                    placeholder="Add an achievement..."
                    placeholderTextColor="#666666"
                    onSubmitEditing={addAchievement}
                  />
                  <TouchableOpacity
                    style={styles.addButton}
                    onPress={addAchievement}
                  >
                    <Ionicons name="add" size={20} color="#3B82F6" />
                  </TouchableOpacity>
                </View>

                {formData.achievements.map((achievement, index) => (
                  <View key={index} style={styles.achievementChip}>
                    <Text style={styles.achievementText}>{achievement}</Text>
                    <TouchableOpacity onPress={() => removeAchievement(index)}>
                      <Ionicons name="close" size={16} color="#999999" />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            </View>

            <View style={styles.formRow}>
              <Text style={styles.label}>Priority</Text>
              <TextInput
                style={styles.input}
                value={String(formData.featured_priority)}
                onChangeText={(text) =>
                  setFormData((prev) => ({
                    ...prev,
                    featured_priority: parseInt(text) || 0,
                  }))
                }
                placeholder="0"
                placeholderTextColor="#666666"
                keyboardType="numeric"
              />
            </View>

            <View style={styles.formRow}>
              <View style={styles.toggleContainer}>
                <Text style={styles.label}>Active</Text>
                <Switch
                  value={formData.is_active}
                  onValueChange={(value) =>
                    setFormData((prev) => ({
                      ...prev,
                      is_active: value,
                    }))
                  }
                  trackColor={{ false: "#D1D5DB", true: "#3B82F6" }}
                  thumbColor="#FFFFFF"
                />
              </View>
            </View>

            <View style={{ height: 100 }} />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000000",
  },
  keyboardView: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#333333",
  },
  title: {
    fontSize: 18,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  saveButton: {
    backgroundColor: "#10B981",
    borderRadius: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  saveButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  disabledButton: {
    backgroundColor: "#666666",
  },
  content: {
    flex: 1,
    padding: 20,
  },
  formRow: {
    gap: 8,
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  labelHint: {
    fontSize: 12,
    color: "#666666",
    marginTop: -4,
  },
  input: {
    backgroundColor: "#2A2A2A",
    borderWidth: 1,
    borderColor: "#444444",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: "#FFFFFF",
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: "top",
  },

  // ─────────────────────────────────────────
  // Image Picker Styles
  // ─────────────────────────────────────────
  imagePickerContainer: {
    marginTop: 4,
  },
  uploadButton: {
    backgroundColor: "#1A1A1A",
    borderWidth: 1.5,
    borderColor: "#333333",
    borderStyle: "dashed",
    borderRadius: 12,
    paddingVertical: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  uploadIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "rgba(59, 130, 246, 0.1)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  uploadText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#3B82F6",
    marginBottom: 4,
  },
  uploadHint: {
    fontSize: 12,
    color: "#666666",
  },
  imagePreviewContainer: {
    alignItems: "center",
    gap: 12,
  },
  // Circular preview with blue glow (matches home page style)
  imagePreviewGlow: {
    width: 108,
    height: 108,
    borderRadius: 54,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#3B82F6",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  imagePreviewBorder: {
    width: 104,
    height: 104,
    borderRadius: 52,
    backgroundColor: "#3B82F6",
    alignItems: "center",
    justifyContent: "center",
  },
  imagePreview: {
    width: 98,
    height: 98,
    borderRadius: 49,
  },
  imageActions: {
    flexDirection: "row",
    gap: 16,
  },
  changeImageButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(59, 130, 246, 0.1)",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(59, 130, 246, 0.3)",
  },
  changeImageText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#3B82F6",
  },
  removeImageButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.3)",
  },
  removeImageText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#EF4444",
  },
  uploadingOverlay: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 8,
    paddingVertical: 8,
    backgroundColor: "rgba(59, 130, 246, 0.08)",
    borderRadius: 8,
  },
  uploadingText: {
    fontSize: 13,
    color: "#3B82F6",
  },

  // ─────────────────────────────────────────
  // Dropdown & Form Styles (unchanged)
  // ─────────────────────────────────────────
  dropdown: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  dropdownText: {
    fontSize: 14,
    color: "#FFFFFF",
    flex: 1,
  },
  placeholderText: {
    color: "#666666",
  },
  dropdownList: {
    backgroundColor: "#2A2A2A",
    borderWidth: 1,
    borderColor: "#444444",
    borderRadius: 8,
    marginTop: 8,
    maxHeight: 200,
  },
  dropdownScrollView: {
    maxHeight: 200,
  },
  dropdownItem: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#444444",
  },
  dropdownItemText: {
    fontSize: 14,
    color: "#FFFFFF",
    fontWeight: "500",
  },
  dropdownItemSubtext: {
    fontSize: 12,
    color: "#999999",
    marginTop: 2,
  },
  achievementsContainer: {
    gap: 12,
  },
  addAchievementContainer: {
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
  },
  addButton: {
    backgroundColor: "#F3F4F6",
    padding: 8,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  achievementChip: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#1E40AF",
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  achievementText: {
    fontSize: 12,
    color: "#FFFFFF",
    flex: 1,
  },
  toggleContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
});
