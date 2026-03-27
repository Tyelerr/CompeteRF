import { CreateFeaturedBarData, PlacePrediction, getGooglePlaceDetails, searchGooglePlaces } from "@/src/models/services/featured-content.service";
import { useCreateFeaturedBar } from "@/src/viewmodels/useFeaturedContent";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import React, { useState } from "react";
import { ActivityIndicator, Alert, Linking, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { moderateScale, scale } from "@/src/utils/scaling";

interface CreateBarModalProps { visible: boolean; onClose: () => void; onSuccess?: () => void; }

export function CreateBarModal({ visible, onClose, onSuccess }: CreateBarModalProps) {
  const { createBar, loading } = useCreateFeaturedBar();
  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [predictions, setPredictions] = useState<PlacePrediction[]>([]);
  const [placeSelected, setPlaceSelected] = useState(false);
  const [formData, setFormData] = useState<CreateFeaturedBarData>({ name: "", description: "", location: "", address: "", phone: "", hours_of_operation: "", special_features: "", google_place_id: "", latitude: undefined, longitude: undefined });
  const [selectedImageUri, setSelectedImageUri] = useState<string | null>(null);

  const handleSearch = async (query: string) => {
    setSearchQuery(query);
    if (query.length < 3) { setPredictions([]); return; }
    setSearching(true);
    const results = await searchGooglePlaces(query);
    setPredictions(results); setSearching(false);
  };

  const handleSelectPlace = async (placeId: string) => {
    setSearching(true);
    const details = await getGooglePlaceDetails(placeId);
    setSearching(false);
    if (details) {
      const location = [details.city, details.state].filter(Boolean).join(", ");
      setFormData({ ...formData, name: details.name, location, address: details.address ? `${details.address}, ${details.city}, ${details.state} ${details.zip_code}` : "", phone: details.phone, hours_of_operation: details.hours, google_place_id: details.google_place_id, latitude: details.latitude ?? undefined, longitude: details.longitude ?? undefined });
      setPlaceSelected(true); setPredictions([]); setSearchQuery("");
    } else { Alert.alert("Error", "Failed to get place details"); }
  };

  const handleClearSelection = () => {
    setPlaceSelected(false);
    setFormData({ name: "", description: "", location: "", address: "", phone: "", hours_of_operation: "", special_features: "", google_place_id: "", latitude: undefined, longitude: undefined });
  };

  const pickImage = async () => {
    const { status: existingStatus } = await ImagePicker.getMediaLibraryPermissionsAsync();
    if (existingStatus === "denied") { Alert.alert("Photo Access Disabled", "Compete needs access to your photo library to upload images. Please enable it in Settings.", [{ text: "Cancel", style: "cancel" }, { text: "Open Settings", onPress: () => Linking.openSettings() }]); return; }
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") { Alert.alert("Permission Required", "Please allow access to your photo library.", [{ text: "Cancel", style: "cancel" }, { text: "Open Settings", onPress: () => Linking.openSettings() }]); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: false, aspect: [1, 1], quality: 0.8 });
    if (!result.canceled && result.assets[0]) setSelectedImageUri(result.assets[0].uri);
  };

  const handleCreate = async () => {
    if (!formData.name.trim()) { Alert.alert("Error", "Please enter a bar name or search for one"); return; }
    try {
      const success = await createBar(formData);
      if (success) { resetForm(); onSuccess?.(); onClose(); }
    } catch (err) { Alert.alert("Error", "Failed to create featured bar"); }
  };

  const resetForm = () => {
    setFormData({ name: "", description: "", location: "", address: "", phone: "", hours_of_operation: "", special_features: "", google_place_id: "", latitude: undefined, longitude: undefined });
    setSelectedImageUri(null); setSearchQuery(""); setPredictions([]); setPlaceSelected(false);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text allowFontScaling={false} style={styles.modalTitle}>Add Featured Bar</Text>
            <TouchableOpacity onPress={() => { resetForm(); onClose(); }}><Ionicons name="close" size={24} color="#999" /></TouchableOpacity>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {!placeSelected && (
              <View style={styles.section}>
                <Text allowFontScaling={false} style={styles.sectionTitle}>Search for a Bar</Text>
                <Text allowFontScaling={false} style={styles.sectionHint}>Search Google to auto-fill name, address, phone & hours</Text>
                <TextInput allowFontScaling={false} style={styles.input} value={searchQuery} onChangeText={handleSearch} placeholder="Type bar or venue name..." placeholderTextColor="#555" autoFocus />
                {searching && <ActivityIndicator color="#3B82F6" style={{ marginTop: 8 }} />}
                {predictions.length > 0 && (
                  <View style={styles.predictions}>
                    {predictions.map((prediction) => (
                      <TouchableOpacity key={prediction.place_id} style={styles.predictionItem} onPress={() => handleSelectPlace(prediction.place_id)}>
                        <Ionicons name="location-outline" size={16} color="#3B82F6" style={{ marginRight: 10, marginTop: 2 }} />
                        <View style={{ flex: 1 }}>
                          <Text allowFontScaling={false} style={styles.predictionMain}>{prediction.structured_formatting.main_text}</Text>
                          <Text allowFontScaling={false} style={styles.predictionSecondary}>{prediction.structured_formatting.secondary_text}</Text>
                        </View>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
                <View style={styles.dividerRow}>
                  <View style={styles.dividerLine} />
                  <Text allowFontScaling={false} style={styles.dividerText}>OR</Text>
                  <View style={styles.dividerLine} />
                </View>
                <TouchableOpacity style={styles.manualButton} onPress={() => setPlaceSelected(true)}>
                  <Ionicons name="create-outline" size={16} color="#3B82F6" />
                  <Text allowFontScaling={false} style={styles.manualButtonText}>Enter details manually</Text>
                </TouchableOpacity>
              </View>
            )}
            {placeSelected && (
              <>
                {formData.google_place_id ? (
                  <View style={styles.selectedBanner}>
                    <View style={{ flex: 1 }}>
                      <Text allowFontScaling={false} style={styles.selectedName}>{formData.name}</Text>
                      <Text allowFontScaling={false} style={styles.selectedAddress}>{formData.address || formData.location}</Text>
                      {formData.phone ? <Text allowFontScaling={false} style={styles.selectedDetail}>📞 {formData.phone}</Text> : null}
                      {formData.hours_of_operation ? <Text allowFontScaling={false} style={styles.selectedDetail} numberOfLines={2}>🕒 {formData.hours_of_operation}</Text> : null}
                    </View>
                    <TouchableOpacity onPress={handleClearSelection}><Text allowFontScaling={false} style={styles.changeText}>Change</Text></TouchableOpacity>
                  </View>
                ) : null}
                <View style={styles.divider} />
                <View style={styles.section}>
                  <Text allowFontScaling={false} style={styles.sectionTitle}>Bar Details</Text>
                  <View style={styles.field}><Text allowFontScaling={false} style={styles.fieldLabel}>Name</Text><TextInput allowFontScaling={false} style={styles.input} value={formData.name} onChangeText={(t) => setFormData({ ...formData, name: t })} placeholder="Bar name" placeholderTextColor="#555" /></View>
                  <View style={styles.field}><Text allowFontScaling={false} style={styles.fieldLabel}>Location</Text><TextInput allowFontScaling={false} style={styles.input} value={formData.location} onChangeText={(t) => setFormData({ ...formData, location: t })} placeholder="City, State" placeholderTextColor="#555" /></View>
                  <View style={styles.field}><Text allowFontScaling={false} style={styles.fieldLabel}>Address</Text><TextInput allowFontScaling={false} style={styles.input} value={formData.address} onChangeText={(t) => setFormData({ ...formData, address: t })} placeholder="Full street address" placeholderTextColor="#555" /></View>
                  <View style={styles.inlineRow}>
                    <View style={styles.halfField}><Text allowFontScaling={false} style={styles.fieldLabel}>Phone</Text><TextInput allowFontScaling={false} style={styles.input} value={formData.phone} onChangeText={(t) => setFormData({ ...formData, phone: t })} placeholder="(555) 555-5555" placeholderTextColor="#555" keyboardType="phone-pad" /></View>
                    <View style={styles.halfField}><Text allowFontScaling={false} style={styles.fieldLabel}>Priority</Text><TextInput allowFontScaling={false} style={styles.input} value={String(formData.featured_priority || 0)} onChangeText={(t) => setFormData({ ...formData, featured_priority: parseInt(t) || 0 })} placeholder="0" placeholderTextColor="#555" keyboardType="numeric" /></View>
                  </View>
                  <View style={styles.field}><Text allowFontScaling={false} style={styles.fieldLabel}>Hours</Text><TextInput allowFontScaling={false} style={styles.input} value={formData.hours_of_operation} onChangeText={(t) => setFormData({ ...formData, hours_of_operation: t })} placeholder="e.g. Mon-Sun 10am-2am" placeholderTextColor="#555" /></View>
                </View>
                <View style={styles.divider} />
                <View style={styles.section}>
                  <Text allowFontScaling={false} style={styles.sectionTitle}>About</Text>
                  <View style={styles.field}><Text allowFontScaling={false} style={styles.fieldLabel}>Description</Text><TextInput allowFontScaling={false} style={[styles.input, styles.textArea]} value={formData.description} onChangeText={(t) => setFormData({ ...formData, description: t })} placeholder="Describe this bar..." placeholderTextColor="#555" multiline numberOfLines={3} /></View>
                  <View style={styles.field}><Text allowFontScaling={false} style={styles.fieldLabel}>Special Features</Text><TextInput allowFontScaling={false} style={[styles.input, styles.textArea]} value={formData.special_features} onChangeText={(t) => setFormData({ ...formData, special_features: t })} placeholder="What makes this bar special..." placeholderTextColor="#555" multiline numberOfLines={2} /></View>
                </View>
                <View style={styles.actions}>
                  <TouchableOpacity style={styles.createBtn} onPress={handleCreate} disabled={loading}>
                    {loading ? <ActivityIndicator size="small" color="#FFF" /> : <><Ionicons name="add-circle-outline" size={18} color="#FFF" /><Text allowFontScaling={false} style={styles.createBtnText}>Create Featured Bar</Text></>}
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.cancelBtn} onPress={() => { resetForm(); onClose(); }} disabled={loading}>
                    <Text allowFontScaling={false} style={styles.cancelBtnText}>Cancel</Text>
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
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  modalContent: { backgroundColor: "#1A1A1A", borderTopLeftRadius: scale(16), borderTopRightRadius: scale(16), maxHeight: "90%", paddingBottom: scale(40) },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: scale(16), borderBottomWidth: 1, borderBottomColor: "#2A2A2A" },
  modalTitle: { fontSize: moderateScale(18), fontWeight: "700", color: "#FFF" },
  section: { padding: scale(16), gap: scale(12) },
  sectionTitle: { fontSize: moderateScale(12), fontWeight: "700", color: "#3B82F6", textTransform: "uppercase", letterSpacing: 0.8 },
  sectionHint: { fontSize: moderateScale(13), color: "#888", marginTop: -4 },
  field: { gap: 5 },
  fieldLabel: { fontSize: moderateScale(13), fontWeight: "600", color: "#CCC" },
  input: { backgroundColor: "#111", borderWidth: 1, borderColor: "#333", borderRadius: scale(8), paddingHorizontal: scale(12), paddingVertical: scale(10), fontSize: moderateScale(14), color: "#FFF" },
  textArea: { minHeight: 70, textAlignVertical: "top" },
  inlineRow: { flexDirection: "row", gap: scale(12) },
  halfField: { flex: 1, gap: 5 },
  divider: { height: 1, backgroundColor: "#2A2A2A", marginHorizontal: scale(16) },
  predictions: { backgroundColor: "#111", borderRadius: scale(8), borderWidth: 1, borderColor: "#333", marginTop: scale(8) },
  predictionItem: { flexDirection: "row", padding: scale(12), borderBottomWidth: 1, borderBottomColor: "#2A2A2A" },
  predictionMain: { fontSize: moderateScale(14), fontWeight: "600", color: "#FFF" },
  predictionSecondary: { fontSize: moderateScale(12), color: "#888", marginTop: 2 },
  dividerRow: { flexDirection: "row", alignItems: "center", marginVertical: scale(16) },
  dividerLine: { flex: 1, height: 1, backgroundColor: "#333" },
  dividerText: { marginHorizontal: scale(12), fontSize: moderateScale(12), color: "#666", fontWeight: "600" },
  manualButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: scale(10) },
  manualButtonText: { fontSize: moderateScale(14), fontWeight: "600", color: "#3B82F6" },
  selectedBanner: { backgroundColor: "#111", borderRadius: scale(10), padding: scale(14), marginHorizontal: scale(16), marginTop: scale(12), flexDirection: "row", alignItems: "flex-start", borderWidth: 1, borderColor: "#3B82F6" },
  selectedName: { fontSize: moderateScale(15), fontWeight: "700", color: "#FFF", marginBottom: 2 },
  selectedAddress: { fontSize: moderateScale(12), color: "#AAA", marginBottom: 2 },
  selectedDetail: { fontSize: moderateScale(12), color: "#888", marginTop: 2 },
  changeText: { fontSize: moderateScale(13), color: "#3B82F6", fontWeight: "600", marginLeft: scale(12) },
  actions: { padding: scale(16), gap: scale(10) },
  createBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#10B981", paddingVertical: scale(14), borderRadius: scale(10) },
  createBtnText: { fontSize: moderateScale(15), fontWeight: "700", color: "#FFF" },
  cancelBtn: { alignItems: "center", justifyContent: "center", paddingVertical: scale(12), borderRadius: scale(10), borderWidth: 1, borderColor: "#333", backgroundColor: "#111" },
  cancelBtnText: { fontSize: moderateScale(14), fontWeight: "600", color: "#999" },
});
