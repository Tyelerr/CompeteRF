import {
  CreateFeaturedBarData,
  PlacePrediction,
  getGooglePlaceDetails,
  searchGooglePlaces,
} from "@/src/models/services/featured-content.service";
import { useCreateFeaturedBar } from "@/src/viewmodels/useFeaturedContent";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

interface CreateBarModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function CreateBarModal({
  visible,
  onClose,
  onSuccess,
}: CreateBarModalProps) {
  const { createBar, loading } = useCreateFeaturedBar();

  // Google Places search state
  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [predictions, setPredictions] = useState<PlacePrediction[]>([]);
  const [placeSelected, setPlaceSelected] = useState(false);

  // Form data
  const [formData, setFormData] = useState<CreateFeaturedBarData>({
    name: "",
    description: "",
    location: "",
    address: "",
    phone: "",
    hours_of_operation: "",
    special_features: "",
    google_place_id: "",
    latitude: undefined,
    longitude: undefined,
  });

  // Image state
  const [selectedImageUri, setSelectedImageUri] = useState<string | null>(null);

  // ─────────────────────────────────────────────────
  // Google Places Search
  // ─────────────────────────────────────────────────
  const handleSearch = async (query: string) => {
    setSearchQuery(query);
    if (query.length < 3) {
      setPredictions([]);
      return;
    }
    setSearching(true);
    const results = await searchGooglePlaces(query);
    setPredictions(results);
    setSearching(false);
  };

  const handleSelectPlace = async (placeId: string) => {
    setSearching(true);
    const details = await getGooglePlaceDetails(placeId);
    setSearching(false);

    if (details) {
      const location = [details.city, details.state].filter(Boolean).join(", ");

      setFormData({
        ...formData,
        name: details.name,
        location,
        address: details.address
          ? `${details.address}, ${details.city}, ${details.state} ${details.zip_code}`
          : "",
        phone: details.phone,
        hours_of_operation: details.hours,
        google_place_id: details.google_place_id,
        latitude: details.latitude ?? undefined,
        longitude: details.longitude ?? undefined,
      });

      setPlaceSelected(true);
      setPredictions([]);
      setSearchQuery("");
    } else {
      Alert.alert("Error", "Failed to get place details");
    }
  };

  const handleClearSelection = () => {
    setPlaceSelected(false);
    setFormData({
      name: "",
      description: "",
      location: "",
      address: "",
      phone: "",
      hours_of_operation: "",
      special_features: "",
      google_place_id: "",
      latitude: undefined,
      longitude: undefined,
    });
  };

  // ─────────────────────────────────────────────────
  // Image Picker
  // ─────────────────────────────────────────────────
  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(
        "Permission Required",
        "Please allow access to your photo library.",
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      setSelectedImageUri(result.assets[0].uri);
    }
  };

  // ─────────────────────────────────────────────────
  // Submit
  // ─────────────────────────────────────────────────
  const handleCreate = async () => {
    if (!formData.name.trim()) {
      Alert.alert("Error", "Please enter a bar name or search for one");
      return;
    }

    try {
      const success = await createBar(formData);
      if (success) {
        resetForm();
        onSuccess?.();
        onClose();
      }
    } catch (err) {
      Alert.alert("Error", "Failed to create featured bar");
    }
  };

  const resetForm = () => {
    setFormData({
      name: "",
      description: "",
      location: "",
      address: "",
      phone: "",
      hours_of_operation: "",
      special_features: "",
      google_place_id: "",
      latitude: undefined,
      longitude: undefined,
    });
    setSelectedImageUri(null);
    setSearchQuery("");
    setPredictions([]);
    setPlaceSelected(false);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <KeyboardAvoidingView
        style={styles.modalOverlay}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.modalContent}>
          {/* Header */}
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Add Featured Bar</Text>
            <TouchableOpacity
              onPress={() => {
                resetForm();
                onClose();
              }}
            >
              <Ionicons name="close" size={24} color="#999" />
            </TouchableOpacity>
          </View>

          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* ─────────────────────────────────── */}
            {/* STEP 1: Google Places Search        */}
            {/* ─────────────────────────────────── */}
            {!placeSelected && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Search for a Bar</Text>
                <Text style={styles.sectionHint}>
                  Search Google to auto-fill name, address, phone & hours
                </Text>

                <TextInput
                  style={styles.input}
                  value={searchQuery}
                  onChangeText={handleSearch}
                  placeholder="Type bar or venue name..."
                  placeholderTextColor="#555"
                  autoFocus
                />

                {searching && (
                  <ActivityIndicator color="#3B82F6" style={{ marginTop: 8 }} />
                )}

                {predictions.length > 0 && (
                  <View style={styles.predictions}>
                    {predictions.map((prediction) => (
                      <TouchableOpacity
                        key={prediction.place_id}
                        style={styles.predictionItem}
                        onPress={() => handleSelectPlace(prediction.place_id)}
                      >
                        <Ionicons
                          name="location-outline"
                          size={16}
                          color="#3B82F6"
                          style={{ marginRight: 10, marginTop: 2 }}
                        />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.predictionMain}>
                            {prediction.structured_formatting.main_text}
                          </Text>
                          <Text style={styles.predictionSecondary}>
                            {prediction.structured_formatting.secondary_text}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}

                {/* OR divider */}
                <View style={styles.dividerRow}>
                  <View style={styles.dividerLine} />
                  <Text style={styles.dividerText}>OR</Text>
                  <View style={styles.dividerLine} />
                </View>

                <TouchableOpacity
                  style={styles.manualButton}
                  onPress={() => setPlaceSelected(true)}
                >
                  <Ionicons name="create-outline" size={16} color="#3B82F6" />
                  <Text style={styles.manualButtonText}>
                    Enter details manually
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {/* ─────────────────────────────────── */}
            {/* STEP 2: Form (after search/manual)  */}
            {/* ─────────────────────────────────── */}
            {placeSelected && (
              <>
                {/* Selected Place Banner */}
                {formData.google_place_id ? (
                  <View style={styles.selectedBanner}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.selectedName}>{formData.name}</Text>
                      <Text style={styles.selectedAddress}>
                        {formData.address || formData.location}
                      </Text>
                      {formData.phone ? (
                        <Text style={styles.selectedDetail}>
                          📞 {formData.phone}
                        </Text>
                      ) : null}
                      {formData.hours_of_operation ? (
                        <Text style={styles.selectedDetail} numberOfLines={2}>
                          🕒 {formData.hours_of_operation}
                        </Text>
                      ) : null}
                    </View>
                    <TouchableOpacity onPress={handleClearSelection}>
                      <Text style={styles.changeText}>Change</Text>
                    </TouchableOpacity>
                  </View>
                ) : null}

                <View style={styles.divider} />

                {/* Editable fields */}
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Bar Details</Text>

                  <View style={styles.field}>
                    <Text style={styles.fieldLabel}>Name</Text>
                    <TextInput
                      style={styles.input}
                      value={formData.name}
                      onChangeText={(t) =>
                        setFormData({ ...formData, name: t })
                      }
                      placeholder="Bar name"
                      placeholderTextColor="#555"
                    />
                  </View>

                  <View style={styles.field}>
                    <Text style={styles.fieldLabel}>Location</Text>
                    <TextInput
                      style={styles.input}
                      value={formData.location}
                      onChangeText={(t) =>
                        setFormData({ ...formData, location: t })
                      }
                      placeholder="City, State"
                      placeholderTextColor="#555"
                    />
                  </View>

                  <View style={styles.field}>
                    <Text style={styles.fieldLabel}>Address</Text>
                    <TextInput
                      style={styles.input}
                      value={formData.address}
                      onChangeText={(t) =>
                        setFormData({ ...formData, address: t })
                      }
                      placeholder="Full street address"
                      placeholderTextColor="#555"
                    />
                  </View>

                  <View style={styles.inlineRow}>
                    <View style={styles.halfField}>
                      <Text style={styles.fieldLabel}>Phone</Text>
                      <TextInput
                        style={styles.input}
                        value={formData.phone}
                        onChangeText={(t) =>
                          setFormData({ ...formData, phone: t })
                        }
                        placeholder="(555) 555-5555"
                        placeholderTextColor="#555"
                        keyboardType="phone-pad"
                      />
                    </View>
                    <View style={styles.halfField}>
                      <Text style={styles.fieldLabel}>Priority</Text>
                      <TextInput
                        style={styles.input}
                        value={String(formData.featured_priority || 0)}
                        onChangeText={(t) =>
                          setFormData({
                            ...formData,
                            featured_priority: parseInt(t) || 0,
                          })
                        }
                        placeholder="0"
                        placeholderTextColor="#555"
                        keyboardType="numeric"
                      />
                    </View>
                  </View>

                  <View style={styles.field}>
                    <Text style={styles.fieldLabel}>Hours</Text>
                    <TextInput
                      style={styles.input}
                      value={formData.hours_of_operation}
                      onChangeText={(t) =>
                        setFormData({ ...formData, hours_of_operation: t })
                      }
                      placeholder="e.g. Mon-Sun 10am-2am"
                      placeholderTextColor="#555"
                    />
                  </View>
                </View>

                <View style={styles.divider} />

                {/* Description & Features */}
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>About</Text>

                  <View style={styles.field}>
                    <Text style={styles.fieldLabel}>Description</Text>
                    <TextInput
                      style={[styles.input, styles.textArea]}
                      value={formData.description}
                      onChangeText={(t) =>
                        setFormData({ ...formData, description: t })
                      }
                      placeholder="Describe this bar..."
                      placeholderTextColor="#555"
                      multiline
                      numberOfLines={3}
                    />
                  </View>

                  <View style={styles.field}>
                    <Text style={styles.fieldLabel}>Special Features</Text>
                    <TextInput
                      style={[styles.input, styles.textArea]}
                      value={formData.special_features}
                      onChangeText={(t) =>
                        setFormData({ ...formData, special_features: t })
                      }
                      placeholder="What makes this bar special..."
                      placeholderTextColor="#555"
                      multiline
                      numberOfLines={2}
                    />
                  </View>
                </View>

                {/* Action Buttons */}
                <View style={styles.actions}>
                  <TouchableOpacity
                    style={styles.createBtn}
                    onPress={handleCreate}
                    disabled={loading}
                  >
                    {loading ? (
                      <ActivityIndicator size="small" color="#FFF" />
                    ) : (
                      <>
                        <Ionicons
                          name="add-circle-outline"
                          size={18}
                          color="#FFF"
                        />
                        <Text style={styles.createBtnText}>
                          Create Featured Bar
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.cancelBtn}
                    onPress={() => {
                      resetForm();
                      onClose();
                    }}
                    disabled={loading}
                  >
                    <Text style={styles.cancelBtnText}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#1A1A1A",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: "90%",
    paddingBottom: 40,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#2A2A2A",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#FFF",
  },

  section: { padding: 16, gap: 12 },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: "#3B82F6",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  sectionHint: {
    fontSize: 13,
    color: "#888",
    marginTop: -4,
  },

  field: { gap: 5 },
  fieldLabel: { fontSize: 13, fontWeight: "600", color: "#CCC" },
  input: {
    backgroundColor: "#111",
    borderWidth: 1,
    borderColor: "#333",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: "#FFF",
  },
  textArea: { minHeight: 70, textAlignVertical: "top" },

  inlineRow: { flexDirection: "row", gap: 12 },
  halfField: { flex: 1, gap: 5 },

  divider: { height: 1, backgroundColor: "#2A2A2A", marginHorizontal: 16 },

  // Google Places predictions
  predictions: {
    backgroundColor: "#111",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#333",
    marginTop: 8,
  },
  predictionItem: {
    flexDirection: "row",
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#2A2A2A",
  },
  predictionMain: {
    fontSize: 14,
    fontWeight: "600",
    color: "#FFF",
  },
  predictionSecondary: {
    fontSize: 12,
    color: "#888",
    marginTop: 2,
  },

  // OR divider
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 16,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: "#333",
  },
  dividerText: {
    marginHorizontal: 12,
    fontSize: 12,
    color: "#666",
    fontWeight: "600",
  },
  manualButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
  },
  manualButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#3B82F6",
  },

  // Selected place banner
  selectedBanner: {
    backgroundColor: "#111",
    borderRadius: 10,
    padding: 14,
    marginHorizontal: 16,
    marginTop: 12,
    flexDirection: "row",
    alignItems: "flex-start",
    borderWidth: 1,
    borderColor: "#3B82F6",
  },
  selectedName: {
    fontSize: 15,
    fontWeight: "700",
    color: "#FFF",
    marginBottom: 2,
  },
  selectedAddress: {
    fontSize: 12,
    color: "#AAA",
    marginBottom: 2,
  },
  selectedDetail: {
    fontSize: 12,
    color: "#888",
    marginTop: 2,
  },
  changeText: {
    fontSize: 13,
    color: "#3B82F6",
    fontWeight: "600",
    marginLeft: 12,
  },

  // Actions
  actions: { padding: 16, gap: 10 },
  createBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#10B981",
    paddingVertical: 14,
    borderRadius: 10,
  },
  createBtnText: { fontSize: 15, fontWeight: "700", color: "#FFF" },
  cancelBtn: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#333",
    backgroundColor: "#111",
  },
  cancelBtnText: { fontSize: 14, fontWeight: "600", color: "#999" },
});
