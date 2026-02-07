import {
  CreateFeaturedBarData,
  FeaturedBar,
  PlacePrediction,
  featuredImageService,
  getGooglePlaceDetails,
  searchGooglePlaces,
} from "@/src/models/services/featured-content.service";
import { useFeaturedContent } from "@/src/viewmodels/useFeaturedContent";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

interface BarCardProps {
  bar: FeaturedBar;
}

export function BarCard({ bar }: BarCardProps) {
  const { toggleBarStatus, updateBar } = useFeaturedContent();
  const [editing, setEditing] = useState(false);
  const [editData, setEditData] = useState<Partial<CreateFeaturedBarData>>({});
  const [selectedImageUri, setSelectedImageUri] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);

  // Google Places search state
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [predictions, setPredictions] = useState<PlacePrediction[]>([]);

  const venueName = bar.venues?.venue || bar.name || "Unknown Bar";

  const handleEdit = () => {
    setEditing(true);
    setSelectedImageUri(null);
    setShowSearch(false);
    setEditData({
      name: bar.name,
      description: bar.description,
      photo_url: bar.photo_url,
      location: bar.location,
      address: bar.address,
      phone: bar.phone,
      hours_of_operation: bar.hours_of_operation,
      special_features: bar.special_features,
      google_place_id: bar.google_place_id,
      latitude: bar.latitude,
      longitude: bar.longitude,
      featured_priority: bar.featured_priority,
    });
  };

  const handleSave = async () => {
    try {
      if (selectedImageUri) {
        setUploadingImage(true);
        const publicUrl = await featuredImageService.uploadBarImage(
          selectedImageUri,
          bar.id,
        );
        setUploadingImage(false);

        if (publicUrl) {
          editData.photo_url = publicUrl;
        } else {
          Alert.alert(
            "Warning",
            "Image upload failed, but other changes will still be saved.",
          );
        }
      }

      const success = await updateBar(bar.id, editData);
      if (success) {
        setEditing(false);
        setEditData({});
        setSelectedImageUri(null);
        setShowSearch(false);
      }
    } catch (err) {
      setUploadingImage(false);
      Alert.alert("Error", "Failed to update bar");
    }
  };

  const handleCancel = () => {
    setEditing(false);
    setEditData({});
    setSelectedImageUri(null);
    setShowSearch(false);
    setPredictions([]);
    setSearchQuery("");
  };

  // ─────────────────────────────────────────────────
  // Google Places
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

      setEditData({
        ...editData,
        name: details.name,
        location,
        address: details.address
          ? `${details.address}, ${details.city}, ${details.state} ${details.zip_code}`
          : "",
        phone: details.phone,
        hours_of_operation: details.hours || editData.hours_of_operation,
        google_place_id: details.google_place_id,
        latitude: details.latitude ?? undefined,
        longitude: details.longitude ?? undefined,
      });

      setShowSearch(false);
      setPredictions([]);
      setSearchQuery("");
    }
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
      allowsEditing: false,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      setSelectedImageUri(result.assets[0].uri);
    }
  };

  const removeImage = () => {
    setSelectedImageUri(null);
    setEditData((prev) => ({ ...prev, photo_url: "" }));
  };

  const currentImageUrl = bar.photo_url;
  const isLoading = uploadingImage;

  // ─────────────────────────────────────────────────
  // DISPLAY MODE
  // ─────────────────────────────────────────────────
  if (!editing) {
    return (
      <View style={styles.card}>
        <View style={styles.displayHeader}>
          <View style={styles.displayHeaderLeft}>
            {currentImageUrl ? (
              <View style={styles.thumbGlow}>
                <View style={styles.thumbBorder}>
                  <Image
                    source={{ uri: currentImageUrl }}
                    style={styles.thumbImage}
                  />
                </View>
              </View>
            ) : (
              <View style={styles.thumbGlow}>
                <View style={styles.thumbBorder}>
                  <View style={styles.thumbPlaceholder}>
                    <Ionicons name="business" size={18} color="#666" />
                  </View>
                </View>
              </View>
            )}
            <View style={styles.displayHeaderInfo}>
              <Text style={styles.displayName}>{venueName}</Text>
              <Text style={styles.displaySub}>ID: {bar.id}</Text>
            </View>
          </View>
          <Switch
            value={bar.is_active || false}
            onValueChange={() => toggleBarStatus(bar.id)}
            trackColor={{ false: "#333", true: "#3B82F6" }}
            thumbColor={bar.is_active ? "#FFF" : "#9CA3AF"}
          />
        </View>

        <View style={styles.statsGrid}>
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>Location</Text>
            <Text style={styles.statValue}>
              {bar.location ||
                (bar.venues ? `${bar.venues.city}, ${bar.venues.state}` : "—")}
            </Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>Hours</Text>
            <Text style={styles.statValue} numberOfLines={1}>
              {bar.hours_of_operation || "—"}
            </Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>Phone</Text>
            <Text style={styles.statValue}>{bar.phone || "—"}</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>Priority</Text>
            <Text style={styles.statValue}>{bar.featured_priority || 0}</Text>
          </View>
        </View>

        {bar.address ? (
          <View style={styles.addressDisplay}>
            <Text style={styles.addressLabel}>📍 Address</Text>
            <Text style={styles.addressText}>{bar.address}</Text>
          </View>
        ) : null}

        {bar.description ? (
          <View style={styles.bioDisplay}>
            <Text style={styles.bioLabel}>Description</Text>
            <Text style={styles.bioText} numberOfLines={3}>
              {bar.description}
            </Text>
          </View>
        ) : null}

        {bar.highlights && bar.highlights.length > 0 && (
          <View style={styles.bioDisplay}>
            <Text style={styles.bioLabel}>Highlights</Text>
            <Text style={styles.bioText}>{bar.highlights.join(" • ")}</Text>
          </View>
        )}

        <TouchableOpacity style={styles.editTrigger} onPress={handleEdit}>
          <Ionicons name="create-outline" size={16} color="#3B82F6" />
          <Text style={styles.editTriggerText}>Edit Bar</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ─────────────────────────────────────────────────
  // EDIT MODE
  // ─────────────────────────────────────────────────
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.editCard}>
        {/* Header */}
        <View style={styles.editHeader}>
          <View>
            <Text style={styles.editTitle}>Edit Bar</Text>
            <Text style={styles.editSubtitle}>
              ID: {bar.id} • {venueName}
            </Text>
          </View>
          <Switch
            value={bar.is_active || false}
            onValueChange={() => toggleBarStatus(bar.id)}
            trackColor={{ false: "#333", true: "#3B82F6" }}
            thumbColor={bar.is_active ? "#FFF" : "#9CA3AF"}
          />
        </View>

        <View style={styles.divider} />

        {/* GOOGLE PLACES SEARCH (toggle) */}
        <View style={styles.section}>
          <TouchableOpacity
            style={styles.searchToggle}
            onPress={() => setShowSearch(!showSearch)}
          >
            <Ionicons name="search" size={16} color="#3B82F6" />
            <Text style={styles.searchToggleText}>
              {showSearch ? "Hide Search" : "Search Google Maps"}
            </Text>
          </TouchableOpacity>

          {showSearch && (
            <View style={styles.searchContainer}>
              <TextInput
                style={styles.fieldInput}
                value={searchQuery}
                onChangeText={handleSearch}
                placeholder="Type bar name to search..."
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
                        size={14}
                        color="#3B82F6"
                        style={{ marginRight: 8, marginTop: 2 }}
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

              <Text style={styles.searchHint}>
                Selecting a result will auto-fill name, address, phone & hours
              </Text>
            </View>
          )}
        </View>

        <View style={styles.divider} />

        {/* PHOTO SECTION */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Bar Photo</Text>
          <View style={styles.photoRow}>
            <View style={styles.photoGlow}>
              <View style={styles.photoBorder}>
                {selectedImageUri ? (
                  <Image
                    source={{ uri: selectedImageUri }}
                    style={styles.photoImg}
                  />
                ) : editData.photo_url ? (
                  <Image
                    source={{ uri: editData.photo_url }}
                    style={styles.photoImg}
                  />
                ) : (
                  <View style={styles.photoPlaceholder}>
                    <Ionicons name="business" size={28} color="#666" />
                  </View>
                )}
              </View>
            </View>

            <View style={styles.photoButtons}>
              <TouchableOpacity style={styles.photoBtnBlue} onPress={pickImage}>
                <Ionicons name="camera" size={14} color="#3B82F6" />
                <Text style={styles.photoBtnBlueText}>
                  {editData.photo_url || selectedImageUri
                    ? "Change Photo"
                    : "Add Photo"}
                </Text>
              </TouchableOpacity>

              {(editData.photo_url || selectedImageUri) && (
                <TouchableOpacity
                  style={styles.photoBtnRed}
                  onPress={removeImage}
                >
                  <Ionicons name="trash-outline" size={14} color="#EF4444" />
                  <Text style={styles.photoBtnRedText}>Remove</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          {uploadingImage && (
            <View style={styles.uploadRow}>
              <ActivityIndicator size="small" color="#3B82F6" />
              <Text style={styles.uploadText}>Uploading photo...</Text>
            </View>
          )}
        </View>

        <View style={styles.divider} />

        {/* BASIC INFO SECTION */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Basic Info</Text>

          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Name</Text>
            <TextInput
              style={styles.fieldInput}
              value={editData.name || ""}
              onChangeText={(t) => setEditData({ ...editData, name: t })}
              placeholder="Bar name"
              placeholderTextColor="#555"
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Location</Text>
            <TextInput
              style={styles.fieldInput}
              value={editData.location || ""}
              onChangeText={(t) => setEditData({ ...editData, location: t })}
              placeholder="City, State"
              placeholderTextColor="#555"
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Address</Text>
            <TextInput
              style={styles.fieldInput}
              value={editData.address || ""}
              onChangeText={(t) => setEditData({ ...editData, address: t })}
              placeholder="Full street address"
              placeholderTextColor="#555"
            />
          </View>

          <View style={styles.inlineRow}>
            <View style={styles.halfField}>
              <Text style={styles.fieldLabel}>Phone</Text>
              <TextInput
                style={styles.fieldInput}
                value={editData.phone || ""}
                onChangeText={(t) => setEditData({ ...editData, phone: t })}
                placeholder="(555) 555-5555"
                placeholderTextColor="#555"
                keyboardType="phone-pad"
              />
            </View>
            <View style={styles.halfField}>
              <Text style={styles.fieldLabel}>Hours</Text>
              <TextInput
                style={styles.fieldInput}
                value={editData.hours_of_operation || ""}
                onChangeText={(t) =>
                  setEditData({ ...editData, hours_of_operation: t })
                }
                placeholder="10am-2am"
                placeholderTextColor="#555"
              />
            </View>
          </View>
        </View>

        <View style={styles.divider} />

        {/* DETAILS SECTION */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Details</Text>

          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Description</Text>
            <TextInput
              style={[styles.fieldInput, styles.textArea]}
              value={editData.description || ""}
              onChangeText={(t) => setEditData({ ...editData, description: t })}
              placeholder="Tell us about this bar..."
              placeholderTextColor="#555"
              multiline
              numberOfLines={3}
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Special Features</Text>
            <TextInput
              style={[styles.fieldInput, styles.textArea]}
              value={editData.special_features || ""}
              onChangeText={(t) =>
                setEditData({ ...editData, special_features: t })
              }
              placeholder="What makes this bar special..."
              placeholderTextColor="#555"
              multiline
              numberOfLines={2}
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Priority</Text>
            <TextInput
              style={styles.fieldInput}
              value={String(editData.featured_priority || 0)}
              onChangeText={(t) =>
                setEditData({
                  ...editData,
                  featured_priority: parseInt(t) || 0,
                })
              }
              placeholder="0"
              placeholderTextColor="#555"
              keyboardType="numeric"
            />
          </View>
        </View>

        {/* ACTION BUTTONS */}
        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.saveBtn}
            onPress={handleSave}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <>
                <Ionicons
                  name="checkmark-circle-outline"
                  size={18}
                  color="#FFF"
                />
                <Text style={styles.saveBtnText}>Save Changes</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.cancelBtn}
            onPress={handleCancel}
            disabled={isLoading}
          >
            <Text style={styles.cancelBtnText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  // ═══════════════════════════════════════════
  // DISPLAY MODE
  // ═══════════════════════════════════════════
  card: {
    backgroundColor: "#1A1A1A",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#2A2A2A",
  },
  displayHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  displayHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    gap: 12,
  },
  displayHeaderInfo: { flex: 1 },
  displayName: {
    fontSize: 17,
    fontWeight: "600",
    color: "#FFF",
    marginBottom: 2,
  },
  displaySub: { fontSize: 12, color: "#888" },

  thumbGlow: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#3B82F6",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
    elevation: 4,
  },
  thumbBorder: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#3B82F6",
    alignItems: "center",
    justifyContent: "center",
  },
  thumbImage: { width: 42, height: 42, borderRadius: 21 },
  thumbPlaceholder: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#2A2A2A",
    alignItems: "center",
    justifyContent: "center",
  },

  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 12,
  },
  statItem: {
    backgroundColor: "#111",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flex: 1,
    minWidth: "47%" as any,
  },
  statLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: "#666",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: 2,
  },
  statValue: { fontSize: 14, fontWeight: "500", color: "#FFF" },

  addressDisplay: { marginBottom: 12 },
  addressLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#888",
    marginBottom: 3,
  },
  addressText: { fontSize: 13, color: "#AAA" },

  bioDisplay: { marginBottom: 12 },
  bioLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: "#666",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: 4,
  },
  bioText: { fontSize: 13, color: "#AAA", lineHeight: 19 },

  editTrigger: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(59,130,246,0.3)",
    backgroundColor: "rgba(59,130,246,0.06)",
  },
  editTriggerText: { fontSize: 14, fontWeight: "600", color: "#3B82F6" },

  // ═══════════════════════════════════════════
  // EDIT MODE
  // ═══════════════════════════════════════════
  editCard: {
    backgroundColor: "#1A1A1A",
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 1.5,
    borderColor: "#3B82F6",
    overflow: "hidden",
  },
  editHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    paddingBottom: 12,
  },
  editTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#FFF",
    marginBottom: 2,
  },
  editSubtitle: { fontSize: 12, color: "#888" },

  divider: { height: 1, backgroundColor: "#2A2A2A", marginHorizontal: 16 },

  section: { padding: 16, gap: 12 },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: "#3B82F6",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 2,
  },

  // Google search toggle
  searchToggle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(59,130,246,0.3)",
    backgroundColor: "rgba(59,130,246,0.06)",
  },
  searchToggleText: { fontSize: 14, fontWeight: "600", color: "#3B82F6" },
  searchContainer: { marginTop: 8, gap: 8 },
  searchHint: {
    fontSize: 11,
    color: "#666",
    fontStyle: "italic",
    textAlign: "center",
  },

  predictions: {
    backgroundColor: "#111",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#333",
  },
  predictionItem: {
    flexDirection: "row",
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#2A2A2A",
  },
  predictionMain: { fontSize: 13, fontWeight: "600", color: "#FFF" },
  predictionSecondary: { fontSize: 11, color: "#888", marginTop: 1 },

  field: { gap: 5 },
  fieldLabel: { fontSize: 13, fontWeight: "600", color: "#CCC" },
  fieldInput: {
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

  // Photo
  photoRow: { flexDirection: "row", alignItems: "center", gap: 16 },
  photoGlow: {
    width: 78,
    height: 78,
    borderRadius: 39,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#3B82F6",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
  },
  photoBorder: {
    width: 74,
    height: 74,
    borderRadius: 37,
    backgroundColor: "#3B82F6",
    alignItems: "center",
    justifyContent: "center",
  },
  photoImg: { width: 66, height: 66, borderRadius: 33 },
  photoPlaceholder: {
    width: 66,
    height: 66,
    borderRadius: 33,
    backgroundColor: "#2A2A2A",
    alignItems: "center",
    justifyContent: "center",
  },
  photoButtons: { gap: 8 },
  photoBtnBlue: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(59,130,246,0.1)",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(59,130,246,0.3)",
  },
  photoBtnBlueText: { fontSize: 13, fontWeight: "600", color: "#3B82F6" },
  photoBtnRed: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(239,68,68,0.08)",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.25)",
  },
  photoBtnRedText: { fontSize: 13, fontWeight: "600", color: "#EF4444" },
  uploadRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingTop: 6,
  },
  uploadText: { fontSize: 12, color: "#3B82F6" },

  // Actions
  actions: { padding: 16, gap: 10 },
  saveBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#10B981",
    paddingVertical: 14,
    borderRadius: 10,
  },
  saveBtnText: { fontSize: 15, fontWeight: "700", color: "#FFF" },
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
