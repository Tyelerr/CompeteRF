import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Switch,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  FeaturedPlayer,
  CreateFeaturedPlayerData,
} from "@/src/models/services/featured-content.service";
import { useFeaturedContent } from "@/src/viewmodels/useFeaturedContent";

interface PlayerCardProps {
  player: FeaturedPlayer;
}

export function PlayerCard({ player }: PlayerCardProps) {
  const { togglePlayerStatus, updatePlayer } = useFeaturedContent();
  const [editing, setEditing] = useState(false);
  const [editData, setEditData] = useState<Partial<CreateFeaturedPlayerData>>(
    {},
  );

  const displayName =
    player.profiles?.name ||
    player.profiles?.user_name ||
    player.name ||
    "Unknown Player";

  const handleEdit = () => {
    setEditing(true);
    setEditData({
      name: player.name,
      nickname: player.nickname,
      location: player.location,
      bio: player.bio,
      featured_priority: player.featured_priority,
    });
  };

  const handleSave = async () => {
    try {
      const success = await updatePlayer(player.id, editData);
      if (success) {
        setEditing(false);
        setEditData({});
      }
    } catch (error) {
      Alert.alert("Error", "Failed to update player");
    }
  };

  const handleCancel = () => {
    setEditing(false);
    setEditData({});
  };

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.cardInfo}>
          <Text style={styles.cardTitle}>
            {editing ? "Editing Player" : displayName}
          </Text>
          <Text style={styles.cardSubtitle}>
            ID: {player.id} • Priority: {player.featured_priority || 0}
          </Text>
        </View>

        <View style={styles.cardActions}>
          <Switch
            value={player.is_active || false}
            onValueChange={() => togglePlayerStatus(player.id)}
            trackColor={{ false: "#D1D5DB", true: "#3B82F6" }}
            thumbColor={player.is_active ? "#FFFFFF" : "#9CA3AF"}
          />

          <TouchableOpacity
            style={[styles.actionButton, editing && styles.saveButton]}
            onPress={editing ? handleSave : handleEdit}
          >
            <Ionicons
              name={editing ? "checkmark" : "create"}
              size={18}
              color={editing ? "#FFFFFF" : "#3B82F6"}
            />
          </TouchableOpacity>

          {editing && (
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={handleCancel}
            >
              <Ionicons name="close" size={18} color="#EF4444" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {editing ? (
        <View style={styles.editForm}>
          <View style={styles.formRow}>
            <Text style={styles.label}>Name</Text>
            <TextInput
              style={styles.input}
              value={editData.name || ""}
              onChangeText={(text) => setEditData({ ...editData, name: text })}
              placeholder="Player name"
              placeholderTextColor="#666666"
            />
          </View>

          <View style={styles.formRow}>
            <Text style={styles.label}>Nickname</Text>
            <TextInput
              style={styles.input}
              value={editData.nickname || ""}
              onChangeText={(text) =>
                setEditData({ ...editData, nickname: text })
              }
              placeholder="Player nickname"
              placeholderTextColor="#666666"
            />
          </View>

          <View style={styles.formRow}>
            <Text style={styles.label}>Location</Text>
            <TextInput
              style={styles.input}
              value={editData.location || ""}
              onChangeText={(text) =>
                setEditData({ ...editData, location: text })
              }
              placeholder="Player location"
              placeholderTextColor="#666666"
            />
          </View>

          <View style={styles.formRow}>
            <Text style={styles.label}>Bio</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={editData.bio || ""}
              onChangeText={(text) => setEditData({ ...editData, bio: text })}
              placeholder="Player biography"
              placeholderTextColor="#666666"
              multiline
              numberOfLines={3}
            />
          </View>

          <View style={styles.formRow}>
            <Text style={styles.label}>Priority</Text>
            <TextInput
              style={styles.input}
              value={String(editData.featured_priority || 0)}
              onChangeText={(text) =>
                setEditData({
                  ...editData,
                  featured_priority: parseInt(text) || 0,
                })
              }
              placeholder="0"
              placeholderTextColor="#666666"
              keyboardType="numeric"
            />
          </View>
        </View>
      ) : (
        <View style={styles.displayInfo}>
          <Text style={styles.infoText}>
            <Text style={styles.infoLabel}>Nickname: </Text>
            {player.nickname || "None"}
          </Text>
          <Text style={styles.infoText}>
            <Text style={styles.infoLabel}>Location: </Text>
            {player.location || "None"}
          </Text>
          <Text style={styles.infoText}>
            <Text style={styles.infoLabel}>Bio: </Text>
            {player.bio || "None"}
          </Text>
          {player.achievements && player.achievements.length > 0 && (
            <Text style={styles.infoText}>
              <Text style={styles.infoLabel}>Achievements: </Text>
              {player.achievements.join(", ")}
            </Text>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#1A1A1A",
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#333333",
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 16,
  },
  cardInfo: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#FFFFFF",
    marginBottom: 4,
  },
  cardSubtitle: {
    fontSize: 12,
    color: "#999999",
  },
  cardActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  actionButton: {
    backgroundColor: "#F3F4F6",
    padding: 8,
    borderRadius: 6,
  },
  saveButton: {
    backgroundColor: "#10B981",
  },
  cancelButton: {
    backgroundColor: "#FEE2E2",
    padding: 8,
    borderRadius: 6,
  },
  editForm: {
    gap: 16,
  },
  formRow: {
    gap: 8,
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
  displayInfo: {
    gap: 8,
  },
  infoText: {
    fontSize: 14,
    color: "#CCCCCC",
    lineHeight: 20,
  },
  infoLabel: {
    fontWeight: "600",
    color: "#FFFFFF",
  },
});
