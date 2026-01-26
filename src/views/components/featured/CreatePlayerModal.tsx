import { useCreateFeaturedPlayer } from "@/src/viewmodels/useFeaturedContent";
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

  const [formData, setFormData] = useState({
    user_id: undefined as number | undefined,
    name: "",
    nickname: "",
    location: "",
    bio: "",
    achievements: [] as string[],
    featured_priority: 0,
    is_active: true,
  });

  const handleCreate = async () => {
    if (!formData.user_id) {
      Alert.alert("Error", "Please select a profile");
      return;
    }
    if (!formData.name.trim()) {
      Alert.alert("Error", "Please enter a name");
      return;
    }

    const success = await createPlayer(formData);
    if (success) {
      resetForm();
      onClose();
      onSuccess();
      Alert.alert("Success", "Featured player created successfully!");
    }
  };

  const resetForm = () => {
    setFormData({
      user_id: undefined,
      name: "",
      nickname: "",
      location: "",
      bio: "",
      achievements: [],
      featured_priority: 0,
      is_active: true,
    });
    setCurrentAchievement("");
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
              disabled={creating}
              style={[styles.saveButton, creating && styles.disabledButton]}
            >
              <Text style={styles.saveButtonText}>
                {creating ? "Creating..." : "Create"}
              </Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.content}>
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
