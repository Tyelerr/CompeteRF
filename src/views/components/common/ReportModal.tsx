import {
  CONTENT_TYPE_LABELS,
  REPORT_REASON_LABELS,
  ReportContentType,
  ReportReason,
} from "@/src/models/types/report.types";
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import {
  ActivityIndicator,
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

const isWeb = Platform.OS === "web";

interface ReportModalProps {
  asOverlay?: boolean;
  visible: boolean;
  onClose: () => void;
  contentType: ReportContentType | null;
  reason: ReportReason | null;
  onReasonChange: (reason: ReportReason) => void;
  details: string;
  onDetailsChange: (text: string) => void;
  onSubmit: () => void;
  isSubmitting: boolean;
}

const REASON_OPTIONS: ReportReason[] = [
  "inappropriate",
  "spam",
  "misleading",
  "other",
];

export default function ReportModal({
  visible,
  onClose,
  contentType,
  reason,
  onReasonChange,
  details,
  onDetailsChange,
  onSubmit,
  isSubmitting,
}: ReportModalProps) {
  const title = contentType
    ? `Report ${CONTENT_TYPE_LABELS[contentType]}`
    : "Report Content";

  const dialog = (
    <View style={styles.dialog}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Ionicons name="flag" size={20} color="#E53935" />
            <Text style={styles.title}>{title}</Text>
          </View>
          <TouchableOpacity
            onPress={onClose}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            disabled={isSubmitting}
          >
            <Ionicons name="close" size={24} color="#999" />
          </TouchableOpacity>
        </View>

        <Text style={styles.subtitle}>Why are you reporting this content?</Text>

        <View style={styles.reasonContainer}>
          {REASON_OPTIONS.map((option) => {
            const isSelected = reason === option;
            return (
              <TouchableOpacity
                key={option}
                style={[
                  styles.reasonOption,
                  isSelected && styles.reasonOptionSelected,
                ]}
                onPress={() => onReasonChange(option)}
                disabled={isSubmitting}
                activeOpacity={0.7}
              >
                <View style={[styles.radio, isSelected && styles.radioSelected]}>
                  {isSelected && <View style={styles.radioInner} />}
                </View>
                <Text style={[styles.reasonText, isSelected && styles.reasonTextSelected]}>
                  {REPORT_REASON_LABELS[option]}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={styles.detailsLabel}>Additional details (optional)</Text>
        <TextInput
          style={styles.detailsInput}
          placeholder="Provide any additional context..."
          placeholderTextColor="#666"
          value={details}
          onChangeText={onDetailsChange}
          multiline
          numberOfLines={4}
          maxLength={500}
          textAlignVertical="top"
          editable={!isSubmitting}
          blurOnSubmit
        />
        <Text style={styles.charCount}>{details.length}/500</Text>
      </ScrollView>

      <View style={styles.buttonRow}>
        <TouchableOpacity
          style={[
            styles.submitButton,
            (!reason || isSubmitting) && styles.submitButtonDisabled,
          ]}
          onPress={onSubmit}
          disabled={!reason || isSubmitting}
        >
          {isSubmitting ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.submitButtonText}>Submit Report</Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.cancelButton}
          onPress={onClose}
          disabled={isSubmitting}
        >
          <Text style={styles.cancelButtonText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  if (isWeb) {
    return (
      <Modal
        visible={visible}
        animationType="fade"
        transparent
        onRequestClose={onClose}
      >
        <TouchableOpacity
          style={wStyles.backdrop}
          activeOpacity={1}
          onPress={onClose}
        />
        <View style={wStyles.overlay}>{dialog}</View>
      </Modal>
    );
  }

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <TouchableOpacity
          style={StyleSheet.absoluteFillObject}
          activeOpacity={1}
          onPress={onClose}
        />
        {dialog}
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  // Full-screen dimmed backdrop, centers the dialog
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.65)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  // The actual popup card
  dialog: {
    width: "100%",
    maxHeight: "80%",
    backgroundColor: "#1C1C1E",
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: Platform.OS === "ios" ? 32 : 24,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  title: { fontSize: 20, fontWeight: "700", color: "#FFFFFF" },
  subtitle: { fontSize: 14, color: "#AAAAAA", marginBottom: 16 },
  reasonContainer: { gap: 8, marginBottom: 20 },
  reasonOption: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#333",
    backgroundColor: "#2C2C2E",
  },
  reasonOptionSelected: {
    borderColor: "#E53935",
    backgroundColor: "rgba(229,57,53,0.1)",
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: "#666",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  radioSelected: { borderColor: "#E53935" },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#E53935",
  },
  reasonText: { fontSize: 15, color: "#CCCCCC" },
  reasonTextSelected: { color: "#FFFFFF", fontWeight: "600" },
  detailsLabel: { fontSize: 14, color: "#AAAAAA", marginBottom: 8 },
  detailsInput: {
    backgroundColor: "#2C2C2E",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#333",
    padding: 12,
    fontSize: 14,
    color: "#FFFFFF",
    minHeight: 100,
  },
  charCount: {
    fontSize: 12,
    color: "#666",
    textAlign: "right",
    marginTop: 4,
    marginBottom: 8,
  },
  buttonRow: {
    flexDirection: "row",
    gap: 12,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "#333",
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#444",
    alignItems: "center",
  },
  cancelButtonText: { fontSize: 15, color: "#CCCCCC", fontWeight: "600" },
  submitButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: "#E53935",
    alignItems: "center",
    justifyContent: "center",
  },
  submitButtonDisabled: { backgroundColor: "#5C1A1A", opacity: 0.6 },
  submitButtonText: { fontSize: 15, color: "#FFFFFF", fontWeight: "700" },
});

const wStyles = StyleSheet.create({
  backdrop: {
    position: "fixed" as any,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.75)",
    zIndex: 3000,
  },
  overlay: {
    position: "fixed" as any,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 3001,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    pointerEvents: "box-none" as any,
  },
});



