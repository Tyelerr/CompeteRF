import { featuredImageService } from "@/src/models/services/featured-content.service";
import { useCreateFeaturedBar } from "@/src/viewmodels/useFeaturedContent";
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

interface CreateBarModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function CreateBarModal({
  visible,
  onClose,
  onSuccess,
}: CreateBarModalProps) {
  const {
    availableVenues,
    createBar,
    loading: creating,
  } = useCreateFeaturedBar();
  const [showVenueDropdown, setShowVenueDropdown] = useState(false);
  const [currentHighlight, setCurrentHighlight] = useState("");

  // Image state
  const [selectedImageUri, setSelectedImageUri] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);

  const [formData, setFormData] = useState({
    venue_id: undefined as number | undefined,
    name: "",
    description: "",
    photo_url: "",
    location: "",
    hours_of_operation: "",
    special_features: "",
    highlights: [] as string[],
    featured_priority: 0,
    is_active: true,
  });

  // ─────────────────────────────────────────────────
  // Image Picker
  // ─────────────────────────────────────────────────
  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(
        "Permission Required",
        "Please allow access to your photo library to upload bar images.",
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
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
    if (!formData.venue_id) {
      Alert.alert("Error", "Please select a venue");
      return;
    }
    if (!formData.name.trim()) {
      Alert.alert("Error", "Please enter a name");
      return;
    }

    try {
      const success = await createBar(formData);

      if (success) {
        if (selectedImageUri) {
          setUploadingImage(true);
          const publicUrl = await featuredImageService.uploadImage(
            selectedImageUri,
            "bars",
            formData.venue_id || Date.now(),
          );

          if (publicUrl) {
            console.log("✅ Bar image uploaded:", publicUrl);
          } else {
            Alert.alert(
              "Note",
              "Bar created but image upload failed. You can add the image later from the edit screen.",
            );
          }
          setUploadingImage(false);
        }

        resetForm();
        onClose();
        onSuccess();
        Alert.alert("Success", "Featured bar created successfully!");
      }
    } catch (error) {
      setUploadingImage(false);
      Alert.alert("Error", "Failed to create bar");
    }
  };

  const resetForm = () => {
    setFormData({
      venue_id: undefined,
      name: "",
      description: "",
      photo_url: "",
      location: "",
      hours_of_operation: "",
      special_features: "",
      highlights: [],
      featured_priority: 0,
      is_active: true,
    });
    setCurrentHighlight("");
    setSelectedImageUri(null);
  };

  const addHighlight = () => {
    if (
      currentHighlight.trim() &&
      !formData.highlights.includes(currentHighlight.trim())
    ) {
      setFormData((prev) => ({
        ...prev,
        highlights: [...prev.highlights, currentHighlight.trim()],
      }));
      setCurrentHighlight("");
    }
  };

  const removeHighlight = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      highlights: prev.highlights.filter((_, i) => i !== index),
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
            <Text style={styles.title}>Create Featured Bar</Text>
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
            {/* Bar Photo Upload Section                */}
            {/* ─────────────────────────────────────── */}
            <View style={styles.formRow}>
              <Text style={styles.label}>Bar Photo</Text>
              <Text style={styles.labelHint}>
                Square image recommended for circular display
              </Text>

              <View style={styles.imagePickerContainer}>
                {selectedImageUri ? (
                  <View style={styles.imagePreviewContainer}>
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

            {/* Venue Selection */}
            <View style={styles.formRow}>
              <Text style={styles.label}>Select Venue</Text>
              <TouchableOpacity
                style={[styles.input, styles.dropdown]}
                onPress={() => setShowVenueDropdown(!showVenueDropdown)}
              >
                <Text
                  style={[
                    styles.dropdownText,
                    !formData.venue_id && styles.placeholderText,
                  ]}
                >
                  {formData.venue_id
                    ? availableVenues.find((v) => v.id === formData.venue_id)
                        ?.venue || "Select Venue"
                    : "Select Venue"}
                </Text>
                <Ionicons name="chevron-down" size={20} color="#999999" />
              </TouchableOpacity>

              {showVenueDropdown && (
                <View style={styles.dropdownList}>
                  <ScrollView
                    style={styles.dropdownScrollView}
                    nestedScrollEnabled
                  >
                    {availableVenues.map((venue) => (
                      <TouchableOpacity
                        key={venue.id}
                        style={styles.dropdownItem}
                        onPress={() => {
                          setFormData((prev) => ({
                            ...prev,
                            venue_id: venue.id,
                          }));
                          setShowVenueDropdown(false);
                        }}
                      >
                        <Text style={styles.dropdownItemText}>
                          {venue.venue}
                        </Text>
                        <Text style={styles.dropdownItemSubtext}>
                          {venue.city}, {venue.state}
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
                placeholder="Bar display name"
                placeholderTextColor="#666666"
              />
            </View>

            <View style={styles.formRow}>
              <Text style={styles.label}>Description</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={formData.description}
                onChangeText={(text) =>
                  setFormData((prev) => ({ ...prev, description: text }))
                }
                placeholder="Tell us about this bar..."
                placeholderTextColor="#666666"
                multiline
                numberOfLines={3}
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
                placeholder="Bar location"
                placeholderTextColor="#666666"
              />
            </View>

            <View style={styles.formRow}>
              <Text style={styles.label}>Hours of Operation</Text>
              <TextInput
                style={styles.input}
                value={formData.hours_of_operation}
                onChangeText={(text) =>
                  setFormData((prev) => ({ ...prev, hours_of_operation: text }))
                }
                placeholder="e.g., Mon-Sat 4PM-2AM"
                placeholderTextColor="#666666"
              />
            </View>

            <View style={styles.formRow}>
              <Text style={styles.label}>Special Features</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={formData.special_features}
                onChangeText={(text) =>
                  setFormData((prev) => ({ ...prev, special_features: text }))
                }
                placeholder="What makes this bar special?"
                placeholderTextColor="#666666"
                multiline
                numberOfLines={2}
              />
            </View>

            {/* Highlights */}
            <View style={styles.formRow}>
              <Text style={styles.label}>Highlights</Text>
              <View style={styles.highlightsContainer}>
                <View style={styles.addHighlightContainer}>
                  <TextInput
                    style={[styles.input, { flex: 1 }]}
                    value={currentHighlight}
                    onChangeText={setCurrentHighlight}
                    placeholder="Add a highlight..."
                    placeholderTextColor="#666666"
                    onSubmitEditing={addHighlight}
                  />
                  <TouchableOpacity
                    style={styles.addButton}
                    onPress={addHighlight}
                  >
                    <Ionicons name="add" size={20} color="#3B82F6" />
                  </TouchableOpacity>
                </View>

                {formData.highlights.map((highlight, index) => (
                  <View key={index} style={styles.highlightChip}>
                    <Text style={styles.highlightText}>{highlight}</Text>
                    <TouchableOpacity onPress={() => removeHighlight(index)}>
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
    minHeight: 60,
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
  // Dropdown & Form Styles
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
  highlightsContainer: {
    gap: 12,
  },
  addHighlightContainer: {
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
  highlightChip: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#9333EA",
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  highlightText: {
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
