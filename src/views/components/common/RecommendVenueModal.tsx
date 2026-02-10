// src/views/components/common/RecommendVenueModal.tsx
// ═══════════════════════════════════════════════════════════
// "Know a spot that hosts pool tournaments?" modal
// Bottom sheet that hugs content — dock stays visible
// ═══════════════════════════════════════════════════════════

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
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { COLORS } from "../../../theme/colors";
import { SPACING } from "../../../theme/spacing";
import { FONT_SIZES } from "../../../theme/typography";
import { UseRecommendVenueReturn } from "../../../viewmodels/hooks/use.recommend.venue";

interface Props {
  vm: UseRecommendVenueReturn;
}

export const RecommendVenueModal = ({ vm }: Props) => {
  return (
    <Modal
      visible={vm.visible}
      animationType="slide"
      transparent
      onRequestClose={vm.close}
    >
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        {/* Tap backdrop to dismiss */}
        <TouchableWithoutFeedback onPress={vm.close}>
          <View style={styles.backdrop} />
        </TouchableWithoutFeedback>

        {/* Sheet — wraps to content size */}
        <View style={styles.sheet}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Recommend a Venue</Text>
            <TouchableOpacity onPress={vm.close} style={styles.closeButton}>
              <Text style={styles.closeText}>✕</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.description}>
            Know a bar or pool hall that hosts tournaments? Let us know and we
            will reach out to them!
          </Text>

          {/* Content */}
          <View style={styles.content}>
            {/* Search Input */}
            <Text style={styles.label}>Search for a venue</Text>
            <View style={styles.searchWrapper}>
              <TextInput
                style={styles.searchInput}
                placeholder="Type a bar or pool hall name..."
                placeholderTextColor={COLORS.textMuted}
                value={vm.venueSelected ? vm.venue.venue_name : vm.searchQuery}
                onChangeText={vm.venueSelected ? undefined : vm.searchPlaces}
                editable={!vm.venueSelected}
                onFocus={vm.venueSelected ? vm.clearSelection : undefined}
                autoFocus
              />

              {vm.searching && (
                <ActivityIndicator
                  color={COLORS.primary}
                  style={styles.searchSpinner}
                />
              )}

              {/* Predictions dropdown */}
              {!vm.venueSelected && vm.predictions.length > 0 && (
                <View style={styles.predictionsDropdown}>
                  <ScrollView
                    keyboardShouldPersistTaps="handled"
                    style={styles.predictionsScroll}
                    nestedScrollEnabled
                  >
                    {vm.predictions.map((prediction) => (
                      <TouchableOpacity
                        key={prediction.place_id}
                        style={styles.predictionItem}
                        onPress={() => vm.selectPlace(prediction.place_id)}
                      >
                        <Text style={styles.predictionMain}>
                          {prediction.structured_formatting.main_text}
                        </Text>
                        <Text style={styles.predictionSecondary}>
                          {prediction.structured_formatting.secondary_text}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}

              {!vm.venueSelected &&
                vm.searchQuery.length >= 3 &&
                !vm.searching &&
                vm.predictions.length === 0 && (
                  <View style={styles.predictionsDropdown}>
                    <Text style={styles.noResults}>
                      No results found. Try a different search.
                    </Text>
                  </View>
                )}
            </View>

            {/* Selected Venue Card */}
            {vm.venueSelected && (
              <View style={styles.selectedCard}>
                <View style={styles.selectedHeader}>
                  <Text style={styles.selectedName}>{vm.venue.venue_name}</Text>
                  <TouchableOpacity onPress={vm.clearSelection}>
                    <Text style={styles.changeText}>Change</Text>
                  </TouchableOpacity>
                </View>
                {vm.venue.address ? (
                  <Text style={styles.selectedDetail}>
                    📍 {vm.venue.address}
                  </Text>
                ) : null}
                {vm.venue.city && vm.venue.state ? (
                  <Text style={styles.selectedDetail}>
                    {vm.venue.city}, {vm.venue.state} {vm.venue.zip_code}
                  </Text>
                ) : null}
                {vm.venue.phone ? (
                  <Text style={styles.selectedDetail}>📞 {vm.venue.phone}</Text>
                ) : null}
              </View>
            )}

            {/* Notes */}
            <Text style={styles.label}>
              Anything we should know? (optional)
            </Text>
            <TextInput
              style={styles.notesInput}
              placeholder="e.g. They have 9-ball tournaments on Thursdays, ask for Mike..."
              placeholderTextColor={COLORS.textMuted}
              value={vm.notes}
              onChangeText={vm.setNotes}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />

            {/* Buttons Row */}
            <View style={styles.buttonsRow}>
              <TouchableOpacity
                style={[
                  styles.submitButton,
                  (!vm.venueSelected || vm.submitting) &&
                    styles.submitButtonDisabled,
                ]}
                onPress={vm.handleSubmit}
                disabled={!vm.venueSelected || vm.submitting}
              >
                {vm.submitting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.submitButtonText}>Submit</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity style={styles.cancelButton} onPress={vm.close}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
  },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.3)",
  },
  sheet: {
    backgroundColor: COLORS.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: Platform.OS === "ios" ? 34 : SPACING.md,
    maxHeight: "80%",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  title: {
    fontSize: FONT_SIZES.lg,
    fontWeight: "700",
    color: COLORS.text,
  },
  closeButton: {
    padding: SPACING.xs,
  },
  closeText: {
    fontSize: 20,
    color: COLORS.textSecondary,
  },
  description: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.xs,
  },
  content: {
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.xs,
  },
  label: {
    fontSize: FONT_SIZES.sm,
    fontWeight: "600",
    color: COLORS.text,
    marginBottom: SPACING.xs,
    marginTop: SPACING.sm,
  },
  searchWrapper: {
    position: "relative",
    zIndex: 10,
  },
  searchInput: {
    backgroundColor: COLORS.surface,
    borderRadius: 10,
    padding: SPACING.sm,
    fontSize: FONT_SIZES.md,
    color: COLORS.text,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  searchSpinner: {
    position: "absolute",
    right: 12,
    top: 12,
  },
  predictionsDropdown: {
    position: "absolute",
    top: "100%",
    left: 0,
    right: 0,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: COLORS.border,
    borderBottomLeftRadius: 10,
    borderBottomRightRadius: 10,
    zIndex: 20,
    elevation: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  predictionsScroll: {
    maxHeight: 200,
  },
  predictionItem: {
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  predictionMain: {
    fontSize: FONT_SIZES.md,
    fontWeight: "600",
    color: COLORS.text,
  },
  predictionSecondary: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  noResults: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textMuted,
    textAlign: "center",
    padding: SPACING.md,
  },
  selectedCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.primary + "40",
    marginTop: SPACING.sm,
  },
  selectedHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: SPACING.xs,
  },
  selectedName: {
    fontSize: FONT_SIZES.md,
    fontWeight: "700",
    color: COLORS.text,
    flex: 1,
  },
  changeText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.primary,
    fontWeight: "600",
  },
  selectedDetail: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    marginTop: 4,
  },
  notesInput: {
    backgroundColor: COLORS.surface,
    borderRadius: 10,
    padding: SPACING.sm,
    fontSize: FONT_SIZES.md,
    color: COLORS.text,
    borderWidth: 1,
    borderColor: COLORS.border,
    minHeight: 70,
  },
  buttonsRow: {
    flexDirection: "row",
    gap: SPACING.sm,
    marginTop: SPACING.md,
  },
  submitButton: {
    flex: 1,
    backgroundColor: COLORS.primary,
    borderRadius: 10,
    padding: SPACING.md,
    alignItems: "center",
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitButtonText: {
    color: "#fff",
    fontSize: FONT_SIZES.md,
    fontWeight: "700",
  },
  cancelButton: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: 10,
    padding: SPACING.md,
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cancelButtonText: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZES.md,
    fontWeight: "600",
  },
});
