import { useCreateFeaturedBar } from "@/src/viewmodels/useFeaturedContent";
import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import {
  Alert,
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

  const [formData, setFormData] = useState({
    venue_id: undefined as number | undefined,
    name: "",
    description: "",
    location: "",
    hours_of_operation: "",
    special_features: "",
    highlights: [] as string[],
    featured_priority: 0,
    is_active: true,
  });

  const handleCreate = async () => {
    if (!formData.venue_id) {
      Alert.alert("Error", "Please select a venue");
      return;
    }
    if (!formData.name.trim()) {
      Alert.alert("Error", "Please enter a name");
      return;
    }

    const success = await createBar(formData);
    if (success) {
      resetForm();
      onClose();
      onSuccess();
      Alert.alert("Success", "Featured bar created successfully!");
    }
  };

  const resetForm = () => {
    setFormData({
      venue_id: undefined,
      name: "",
      description: "",
      location: "",
      hours_of_operation: "",
      special_features: "",
      highlights: [],
      featured_priority: 0,
      is_active: true,
    });
    setCurrentHighlight("");
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
              disabled={creating}
              style={[styles.saveButton, creating && styles.disabledButton]}
            >
              <Text style={styles.saveButtonText}>
                {creating ? "Creating..." : "Create"}
              </Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.content}>
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
