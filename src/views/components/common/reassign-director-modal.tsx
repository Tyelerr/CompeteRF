// src/views/components/common/reassign-director-modal.tsx

import { useState } from "react";
import {
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
import { COLORS } from "../../../theme/colors";
import { SPACING } from "../../../theme/spacing";
import { FONT_SIZES } from "../../../theme/typography";
import { DirectorSearchResult } from "../../../viewmodels/useAdminTournaments";

export const ReassignDirectorModal = ({
  visible,
  tournamentName,
  currentDirector,
  directors,
  loadingDirectors,
  onSearch,
  onCancel,
  onConfirm,
}: {
  visible: boolean;
  tournamentName: string;
  currentDirector: string;
  directors: DirectorSearchResult[];
  loadingDirectors: boolean;
  onSearch: (query: string) => void;
  onCancel: () => void;
  onConfirm: (directorId: number, directorName: string, reason: string) => void;
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [selected, setSelected] = useState<DirectorSearchResult | null>(null);
  const [reason, setReason] = useState("");

  const handleSearch = (q: string) => {
    setSearchQuery(q);
    onSearch(q);
  };

  const handleConfirm = () => {
    if (!selected) {
      Alert.alert("Required", "Please select a director.");
      return;
    }
    if (!reason.trim()) {
      Alert.alert("Required", "Please enter a reason.");
      return;
    }

    // Confirmation before executing
    Alert.alert(
      "Confirm Reassignment",
      `Reassign director for "${tournamentName}"?\n\nFrom: ${currentDirector}\nTo: ${selected.name}\n\nReason: ${reason.trim()}`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Confirm",
          style: "destructive",
          onPress: () => {
            onConfirm(selected.id, selected.name, reason.trim());
            reset();
          },
        },
      ],
    );
  };

  const reset = () => {
    setSearchQuery("");
    setSelected(null);
    setReason("");
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <KeyboardAvoidingView
        style={s.overlay}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          contentContainerStyle={s.scrollContent}
          keyboardShouldPersistTaps="handled"
          bounces={false}
        >
          <View style={s.content}>
            <Text style={s.title}>{"\uD83D\uDD04"} Reassign Director</Text>
            <Text style={s.subtitle}>{`"${tournamentName}"`}</Text>

            <View style={s.currentRow}>
              <Text style={s.currentLabel}>Current TD:</Text>
              <Text style={s.currentValue}>{currentDirector}</Text>
            </View>

            <Text style={s.label}>Search New Director *</Text>
            <TextInput
              style={s.searchInput}
              placeholder="Type name or email..."
              placeholderTextColor={COLORS.textSecondary}
              value={searchQuery}
              onChangeText={handleSearch}
            />

            {directors.length > 0 && (
              <View style={s.resultsBox}>
                {directors.slice(0, 10).map((item) => (
                  <TouchableOpacity
                    key={item.id}
                    style={[
                      s.resultItem,
                      selected?.id === item.id && s.resultItemActive,
                    ]}
                    onPress={() => setSelected(item)}
                  >
                    <Text
                      style={[
                        s.resultName,
                        selected?.id === item.id && s.resultNameActive,
                      ]}
                    >
                      {item.name}
                    </Text>
                    <Text style={s.resultDetail}>{item.email}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {loadingDirectors && <Text style={s.hint}>Searching...</Text>}
            {searchQuery.length > 0 &&
              searchQuery.length < 2 &&
              !loadingDirectors && (
                <Text style={s.hint}>Type at least 2 characters</Text>
              )}

            {selected && (
              <View style={s.selectedBadge}>
                <Text style={s.selectedText}>
                  {"\u2713"} {selected.name}
                </Text>
                <TouchableOpacity onPress={() => setSelected(null)}>
                  <Text style={s.selectedClear}>{"\u2715"}</Text>
                </TouchableOpacity>
              </View>
            )}

            <Text style={[s.label, { marginTop: SPACING.md }]}>Reason *</Text>
            <TextInput
              style={s.textArea}
              placeholder="Enter reason for reassignment..."
              placeholderTextColor={COLORS.textSecondary}
              value={reason}
              onChangeText={setReason}
              multiline
              numberOfLines={3}
            />

            <View style={s.buttons}>
              <TouchableOpacity
                style={s.btnCancel}
                onPress={() => {
                  reset();
                  onCancel();
                }}
              >
                <Text style={s.btnCancelText}>Back</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.btnConfirm} onPress={handleConfirm}>
                <Text style={s.btnConfirmText}>Reassign</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)" },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: SPACING.lg,
  },
  content: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: SPACING.lg,
    width: "100%",
    maxWidth: 400,
  },
  title: {
    fontSize: FONT_SIZES.lg,
    fontWeight: "700",
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },
  subtitle: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textSecondary,
    marginBottom: SPACING.xs,
  },
  currentRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.background,
    borderRadius: 8,
    padding: SPACING.sm,
    marginBottom: SPACING.md,
    borderLeftWidth: 3,
    borderLeftColor: "#FF9800",
  },
  currentLabel: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    marginRight: SPACING.xs,
  },
  currentValue: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.text,
    fontWeight: "600",
    flex: 1,
  },
  label: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.text,
    marginBottom: SPACING.xs,
    fontWeight: "500",
  },
  searchInput: {
    backgroundColor: COLORS.background,
    borderRadius: 8,
    padding: SPACING.sm,
    fontSize: FONT_SIZES.sm,
    color: COLORS.text,
    borderWidth: 1,
    borderColor: COLORS.border,
    height: 40,
  },
  resultsBox: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    marginTop: SPACING.xs,
    overflow: "hidden",
    maxHeight: 160,
  },
  resultItem: {
    padding: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  resultItemActive: { backgroundColor: COLORS.primary + "20" },
  resultName: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.text,
    fontWeight: "500",
  },
  resultNameActive: { color: COLORS.primary, fontWeight: "700" },
  resultDetail: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  hint: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
    fontStyle: "italic",
  },
  selectedBadge: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: COLORS.success + "20",
    borderRadius: 8,
    padding: SPACING.sm,
    marginTop: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.success,
  },
  selectedText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.success,
    fontWeight: "600",
    flex: 1,
  },
  selectedClear: {
    fontSize: FONT_SIZES.md,
    color: COLORS.success,
    paddingLeft: SPACING.sm,
  },
  textArea: {
    backgroundColor: COLORS.background,
    borderRadius: 8,
    padding: SPACING.sm,
    fontSize: FONT_SIZES.sm,
    color: COLORS.text,
    borderWidth: 1,
    borderColor: COLORS.border,
    minHeight: 80,
    textAlignVertical: "top",
  },
  buttons: { flexDirection: "row", marginTop: SPACING.lg, gap: SPACING.sm },
  btnCancel: {
    flex: 1,
    paddingVertical: SPACING.sm,
    borderRadius: 8,
    alignItems: "center",
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  btnCancelText: {
    color: COLORS.text,
    fontSize: FONT_SIZES.sm,
    fontWeight: "600",
  },
  btnConfirm: {
    flex: 1,
    paddingVertical: SPACING.sm,
    borderRadius: 8,
    alignItems: "center",
    backgroundColor: "#FF9800",
  },
  btnConfirmText: {
    color: "#FFFFFF",
    fontSize: FONT_SIZES.sm,
    fontWeight: "600",
  },
});
