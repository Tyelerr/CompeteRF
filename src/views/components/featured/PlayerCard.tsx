import { CreateFeaturedPlayerData, featuredImageService, FeaturedPlayer } from "@/src/models/services/featured-content.service";
import { useFeaturedContent } from "@/src/viewmodels/useFeaturedContent";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import React, { useState } from "react";
import { ActivityIndicator, Alert, Linking, Image, KeyboardAvoidingView, Platform, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from "react-native";
import { moderateScale, scale } from "@/src/utils/scaling";

interface PlayerCardProps { player: FeaturedPlayer; }

export function PlayerCard({ player }: PlayerCardProps) {
  const { togglePlayerStatus, updatePlayer } = useFeaturedContent();
  const [editing, setEditing] = useState(false);
  const [editData, setEditData] = useState<Partial<CreateFeaturedPlayerData>>({});
  const [selectedImageUri, setSelectedImageUri] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);

  const displayName = player.profiles?.name || player.profiles?.user_name || player.name || "Unknown Player";

  const handleEdit = () => {
    setEditing(true); setSelectedImageUri(null);
    setEditData({ name: player.name, nickname: player.nickname, photo_url: player.photo_url, location: player.location, bio: player.bio, fargo_rating: player.fargo_rating, preferred_game: player.preferred_game, years_playing: player.years_playing, featured_priority: player.featured_priority });
  };

  const handleSave = async () => {
    try {
      if (selectedImageUri) {
        setUploadingImage(true);
        const publicUrl = await featuredImageService.uploadPlayerImage(selectedImageUri, player.id);
        setUploadingImage(false);
        if (publicUrl) { editData.photo_url = publicUrl; } else { Alert.alert("Warning", "Image upload failed, but other changes will still be saved."); }
      }
      const success = await updatePlayer(player.id, editData);
      if (success) { setEditing(false); setEditData({}); setSelectedImageUri(null); }
    } catch (err) { setUploadingImage(false); Alert.alert("Error", "Failed to update player"); }
  };

  const handleCancel = () => { setEditing(false); setEditData({}); setSelectedImageUri(null); };

  const pickImage = async () => {
    const { status: existingStatus } = await ImagePicker.getMediaLibraryPermissionsAsync();
    if (existingStatus === "denied") { Alert.alert("Photo Access Disabled", "Compete needs access to your photo library to upload images. Please enable it in Settings.", [{ text: "Cancel", style: "cancel" }, { text: "Open Settings", onPress: () => Linking.openSettings() }]); return; }
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") { Alert.alert("Permission Required", "Please allow access to your photo library.", [{ text: "Cancel", style: "cancel" }, { text: "Open Settings", onPress: () => Linking.openSettings() }]); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: false, aspect: [1, 1], quality: 0.8 });
    if (!result.canceled && result.assets[0]) setSelectedImageUri(result.assets[0].uri);
  };

  const removeImage = () => { setSelectedImageUri(null); setEditData((prev) => ({ ...prev, photo_url: "" })); };
  const currentImageUrl = player.photo_url;
  const isLoading = uploadingImage;

  if (!editing) {
    return (
      <View style={styles.card}>
        <View style={styles.displayHeader}>
          <View style={styles.displayHeaderLeft}>
            <View style={styles.thumbGlow}>
              <View style={styles.thumbBorder}>
                {currentImageUrl ? <Image source={{ uri: currentImageUrl }} style={styles.thumbImage} /> : <View style={styles.thumbPlaceholder}><Ionicons name="person" size={18} color="#666" /></View>}
              </View>
            </View>
            <View style={styles.displayHeaderInfo}>
              <Text allowFontScaling={false} style={styles.displayName}>{displayName}</Text>
              <Text allowFontScaling={false} style={styles.displaySub}>{player.nickname ? `"${player.nickname}" • ` : ""}ID: {player.id}</Text>
            </View>
          </View>
          <Switch value={player.is_active || false} onValueChange={() => togglePlayerStatus(player.id)} trackColor={{ false: "#333", true: "#3B82F6" }} thumbColor={player.is_active ? "#FFF" : "#9CA3AF"} />
        </View>
        <View style={styles.statsGrid}>
          <View style={styles.statItem}><Text allowFontScaling={false} style={styles.statLabel}>Location</Text><Text allowFontScaling={false} style={styles.statValue}>{player.location || "—"}</Text></View>
          <View style={styles.statItem}><Text allowFontScaling={false} style={styles.statLabel}>Fargo Rating</Text><Text allowFontScaling={false} style={styles.statValue}>{player.fargo_rating || "—"}</Text></View>
          <View style={styles.statItem}><Text allowFontScaling={false} style={styles.statLabel}>Favorite Game</Text><Text allowFontScaling={false} style={styles.statValue}>{player.preferred_game || "—"}</Text></View>
          <View style={styles.statItem}><Text allowFontScaling={false} style={styles.statLabel}>Years Playing</Text><Text allowFontScaling={false} style={styles.statValue}>{player.years_playing || "—"}</Text></View>
          <View style={styles.statItem}><Text allowFontScaling={false} style={styles.statLabel}>Priority</Text><Text allowFontScaling={false} style={styles.statValue}>{player.featured_priority || 0}</Text></View>
        </View>
        {player.bio ? <View style={styles.bioDisplay}><Text allowFontScaling={false} style={styles.bioLabel}>Bio</Text><Text allowFontScaling={false} style={styles.bioText} numberOfLines={3}>{player.bio}</Text></View> : null}
        {player.achievements && player.achievements.length > 0 && <View style={styles.bioDisplay}><Text allowFontScaling={false} style={styles.bioLabel}>Achievements</Text><Text allowFontScaling={false} style={styles.bioText}>{player.achievements.join(" • ")}</Text></View>}
        <TouchableOpacity style={styles.editTrigger} onPress={handleEdit}>
          <Ionicons name="create-outline" size={16} color="#3B82F6" />
          <Text allowFontScaling={false} style={styles.editTriggerText}>Edit Player</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={styles.editCard}>
        <View style={styles.editHeader}>
          <View>
            <Text allowFontScaling={false} style={styles.editTitle}>Edit Player</Text>
            <Text allowFontScaling={false} style={styles.editSubtitle}>ID: {player.id} • {displayName}</Text>
          </View>
          <Switch value={player.is_active || false} onValueChange={() => togglePlayerStatus(player.id)} trackColor={{ false: "#333", true: "#3B82F6" }} thumbColor={player.is_active ? "#FFF" : "#9CA3AF"} />
        </View>
        <View style={styles.divider} />
        <View style={styles.section}>
          <Text allowFontScaling={false} style={styles.sectionTitle}>Player Photo</Text>
          <View style={styles.photoRow}>
            <View style={styles.photoGlow}>
              <View style={styles.photoBorder}>
                {selectedImageUri ? <Image source={{ uri: selectedImageUri }} style={styles.photoImg} /> : editData.photo_url ? <Image source={{ uri: editData.photo_url }} style={styles.photoImg} /> : <View style={styles.photoPlaceholder}><Ionicons name="person" size={28} color="#666" /></View>}
              </View>
            </View>
            <View style={styles.photoButtons}>
              <TouchableOpacity style={styles.photoBtnBlue} onPress={pickImage}>
                <Ionicons name="camera" size={14} color="#3B82F6" />
                <Text allowFontScaling={false} style={styles.photoBtnBlueText}>{editData.photo_url || selectedImageUri ? "Change Photo" : "Add Photo"}</Text>
              </TouchableOpacity>
              {(editData.photo_url || selectedImageUri) && (
                <TouchableOpacity style={styles.photoBtnRed} onPress={removeImage}>
                  <Ionicons name="trash-outline" size={14} color="#EF4444" />
                  <Text allowFontScaling={false} style={styles.photoBtnRedText}>Remove</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
          {uploadingImage && <View style={styles.uploadRow}><ActivityIndicator size="small" color="#3B82F6" /><Text allowFontScaling={false} style={styles.uploadText}>Uploading photo...</Text></View>}
        </View>
        <View style={styles.divider} />
        <View style={styles.section}>
          <Text allowFontScaling={false} style={styles.sectionTitle}>Basic Info</Text>
          <View style={styles.field}><Text allowFontScaling={false} style={styles.fieldLabel}>Name</Text><TextInput allowFontScaling={false} style={styles.fieldInput} value={editData.name || ""} onChangeText={(t) => setEditData({ ...editData, name: t })} placeholder="Player name" placeholderTextColor="#555" /></View>
          <View style={styles.field}><Text allowFontScaling={false} style={styles.fieldLabel}>Nickname</Text><TextInput allowFontScaling={false} style={styles.fieldInput} value={editData.nickname || ""} onChangeText={(t) => setEditData({ ...editData, nickname: t })} placeholder="e.g. Cambodian Killa" placeholderTextColor="#555" /></View>
          <View style={styles.field}><Text allowFontScaling={false} style={styles.fieldLabel}>Location</Text><TextInput allowFontScaling={false} style={styles.fieldInput} value={editData.location || ""} onChangeText={(t) => setEditData({ ...editData, location: t })} placeholder="City, State" placeholderTextColor="#555" /></View>
        </View>
        <View style={styles.divider} />
        <View style={styles.section}>
          <Text allowFontScaling={false} style={styles.sectionTitle}>Player Stats</Text>
          <View style={styles.inlineRow}>
            <View style={styles.halfField}><Text allowFontScaling={false} style={styles.fieldLabel}>Fargo Rating</Text><TextInput allowFontScaling={false} style={styles.fieldInput} value={editData.fargo_rating ? String(editData.fargo_rating) : ""} onChangeText={(t) => setEditData({ ...editData, fargo_rating: parseInt(t) || undefined })} placeholder="e.g. 625" placeholderTextColor="#555" keyboardType="numeric" /></View>
            <View style={styles.halfField}><Text allowFontScaling={false} style={styles.fieldLabel}>Favorite Game</Text><TextInput allowFontScaling={false} style={styles.fieldInput} value={editData.preferred_game || ""} onChangeText={(t) => setEditData({ ...editData, preferred_game: t })} placeholder="e.g. 9-Ball" placeholderTextColor="#555" /></View>
          </View>
          <View style={styles.field}><Text allowFontScaling={false} style={styles.fieldLabel}>Years Playing</Text><TextInput allowFontScaling={false} style={styles.fieldInput} value={editData.years_playing ? String(editData.years_playing) : ""} onChangeText={(t) => setEditData({ ...editData, years_playing: parseInt(t) || undefined })} placeholder="e.g. 8" placeholderTextColor="#555" keyboardType="numeric" /></View>
          <View style={styles.field}><Text allowFontScaling={false} style={styles.fieldLabel}>Priority</Text><TextInput allowFontScaling={false} style={styles.fieldInput} value={String(editData.featured_priority || 0)} onChangeText={(t) => setEditData({ ...editData, featured_priority: parseInt(t) || 0 })} placeholder="0" placeholderTextColor="#555" keyboardType="numeric" /></View>
        </View>
        <View style={styles.divider} />
        <View style={styles.section}>
          <Text allowFontScaling={false} style={styles.sectionTitle}>About</Text>
          <TextInput allowFontScaling={false} style={[styles.fieldInput, styles.textArea]} value={editData.bio || ""} onChangeText={(t) => setEditData({ ...editData, bio: t })} placeholder="Tell us about this player..." placeholderTextColor="#555" multiline numberOfLines={4} />
        </View>
        <View style={styles.actions}>
          <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={isLoading}>
            {isLoading ? <ActivityIndicator size="small" color="#FFF" /> : <><Ionicons name="checkmark-circle-outline" size={18} color="#FFF" /><Text allowFontScaling={false} style={styles.saveBtnText}>Save Changes</Text></>}
          </TouchableOpacity>
          <TouchableOpacity style={styles.cancelBtn} onPress={handleCancel} disabled={isLoading}>
            <Text allowFontScaling={false} style={styles.cancelBtnText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: "#1A1A1A", borderRadius: scale(12), padding: scale(16), marginBottom: scale(16), borderWidth: 1, borderColor: "#2A2A2A" },
  displayHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: scale(14) },
  displayHeaderLeft: { flexDirection: "row", alignItems: "center", flex: 1, gap: scale(12) },
  displayHeaderInfo: { flex: 1 },
  displayName: { fontSize: moderateScale(17), fontWeight: "600", color: "#FFF", marginBottom: 2 },
  displaySub: { fontSize: moderateScale(12), color: "#888" },
  thumbGlow: { width: scale(50), height: scale(50), borderRadius: scale(25), alignItems: "center", justifyContent: "center", shadowColor: "#3B82F6", shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.2, shadowRadius: 5, elevation: 4 },
  thumbBorder: { width: scale(48), height: scale(48), borderRadius: scale(24), backgroundColor: "#3B82F6", alignItems: "center", justifyContent: "center" },
  thumbImage: { width: scale(42), height: scale(42), borderRadius: scale(21) },
  thumbPlaceholder: { width: scale(42), height: scale(42), borderRadius: scale(21), backgroundColor: "#2A2A2A", alignItems: "center", justifyContent: "center" },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: scale(8), marginBottom: scale(12) },
  statItem: { backgroundColor: "#111", borderRadius: scale(8), paddingHorizontal: scale(12), paddingVertical: scale(8), flex: 1, minWidth: "47%" as any },
  statLabel: { fontSize: moderateScale(11), fontWeight: "600", color: "#666", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 2 },
  statValue: { fontSize: moderateScale(14), fontWeight: "500", color: "#FFF" },
  bioDisplay: { marginBottom: scale(12) },
  bioLabel: { fontSize: moderateScale(11), fontWeight: "600", color: "#666", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 4 },
  bioText: { fontSize: moderateScale(13), color: "#AAA", lineHeight: moderateScale(19) },
  editTrigger: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: scale(10), borderRadius: scale(8), borderWidth: 1, borderColor: "rgba(59,130,246,0.3)", backgroundColor: "rgba(59,130,246,0.06)" },
  editTriggerText: { fontSize: moderateScale(14), fontWeight: "600", color: "#3B82F6" },
  editCard: { backgroundColor: "#1A1A1A", borderRadius: scale(12), marginBottom: scale(16), borderWidth: 1.5, borderColor: "#3B82F6", overflow: "hidden" },
  editHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: scale(16), paddingBottom: scale(12) },
  editTitle: { fontSize: moderateScale(18), fontWeight: "700", color: "#FFF", marginBottom: 2 },
  editSubtitle: { fontSize: moderateScale(12), color: "#888" },
  divider: { height: 1, backgroundColor: "#2A2A2A", marginHorizontal: scale(16) },
  section: { padding: scale(16), gap: scale(12) },
  sectionTitle: { fontSize: moderateScale(12), fontWeight: "700", color: "#3B82F6", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 2 },
  field: { gap: 5 },
  fieldLabel: { fontSize: moderateScale(13), fontWeight: "600", color: "#CCC" },
  fieldInput: { backgroundColor: "#111", borderWidth: 1, borderColor: "#333", borderRadius: scale(8), paddingHorizontal: scale(12), paddingVertical: scale(10), fontSize: moderateScale(14), color: "#FFF" },
  textArea: { minHeight: 80, textAlignVertical: "top" },
  inlineRow: { flexDirection: "row", gap: scale(12) },
  halfField: { flex: 1, gap: 5 },
  photoRow: { flexDirection: "row", alignItems: "center", gap: scale(16) },
  photoGlow: { width: scale(78), height: scale(78), borderRadius: scale(39), alignItems: "center", justifyContent: "center", shadowColor: "#3B82F6", shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.25, shadowRadius: 8, elevation: 6 },
  photoBorder: { width: scale(74), height: scale(74), borderRadius: scale(37), backgroundColor: "#3B82F6", alignItems: "center", justifyContent: "center" },
  photoImg: { width: scale(66), height: scale(66), borderRadius: scale(33) },
  photoPlaceholder: { width: scale(66), height: scale(66), borderRadius: scale(33), backgroundColor: "#2A2A2A", alignItems: "center", justifyContent: "center" },
  photoButtons: { gap: scale(8) },
  photoBtnBlue: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(59,130,246,0.1)", paddingHorizontal: scale(14), paddingVertical: scale(8), borderRadius: scale(8), borderWidth: 1, borderColor: "rgba(59,130,246,0.3)" },
  photoBtnBlueText: { fontSize: moderateScale(13), fontWeight: "600", color: "#3B82F6" },
  photoBtnRed: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(239,68,68,0.08)", paddingHorizontal: scale(14), paddingVertical: scale(8), borderRadius: scale(8), borderWidth: 1, borderColor: "rgba(239,68,68,0.25)" },
  photoBtnRedText: { fontSize: moderateScale(13), fontWeight: "600", color: "#EF4444" },
  uploadRow: { flexDirection: "row", alignItems: "center", gap: scale(8), paddingTop: 6 },
  uploadText: { fontSize: moderateScale(12), color: "#3B82F6" },
  actions: { padding: scale(16), gap: scale(10) },
  saveBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#10B981", paddingVertical: scale(14), borderRadius: scale(10) },
  saveBtnText: { fontSize: moderateScale(15), fontWeight: "700", color: "#FFF" },
  cancelBtn: { alignItems: "center", justifyContent: "center", paddingVertical: scale(12), borderRadius: scale(10), borderWidth: 1, borderColor: "#333", backgroundColor: "#111" },
  cancelBtnText: { fontSize: moderateScale(14), fontWeight: "600", color: "#999" },
});



