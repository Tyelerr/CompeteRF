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
import { COLORS } from "../../../theme/colors";
import { SPACING } from "../../../theme/spacing";
import { FONT_SIZES } from "../../../theme/typography";
import { moderateScale, scale } from "../../../utils/scaling";
import { UseRecommendVenueReturn } from "../../../viewmodels/hooks/use.recommend.venue";

const isWeb = Platform.OS === "web";

interface Props {
  vm: UseRecommendVenueReturn;
}

export const RecommendVenueModal = ({ vm }: Props) => {
  const inner = (
    <View style={[styles.sheet, isWeb && wStyles.sheet]}>
      <View style={styles.header}>
        <Text allowFontScaling={false} style={styles.title}>Recommend a Venue</Text>
        <TouchableOpacity onPress={vm.close} style={styles.closeButton}>
          <Text allowFontScaling={false} style={styles.closeText}>✕</Text>
        </TouchableOpacity>
      </View>
      <Text allowFontScaling={false} style={styles.description}>
        Know a bar or pool hall that hosts tournaments? Let us know and we will reach out to them!
      </Text>
      <View style={styles.content}>
        <Text allowFontScaling={false} style={styles.label}>Search for a venue</Text>
        <View style={styles.searchWrapper}>
          <TextInput
            allowFontScaling={false}
            style={styles.searchInput}
            placeholder="Type a bar or pool hall name..."
            placeholderTextColor={COLORS.textMuted}
            value={vm.venueSelected ? vm.venue.venue_name : vm.searchQuery}
            onChangeText={vm.venueSelected ? undefined : vm.searchPlaces}
            editable={!vm.venueSelected}
            onFocus={vm.venueSelected ? vm.clearSelection : undefined}
            autoFocus
          />
          {vm.searching && <ActivityIndicator color={COLORS.primary} style={styles.searchSpinner} />}
          {!vm.venueSelected && vm.predictions.length > 0 && (
            <View style={styles.predictionsDropdown}>
              <ScrollView keyboardShouldPersistTaps="handled" style={styles.predictionsScroll} nestedScrollEnabled>
                {vm.predictions.map((prediction) => (
                  <TouchableOpacity key={prediction.place_id} style={styles.predictionItem} onPress={() => vm.selectPlace(prediction.place_id)}>
                    <Text allowFontScaling={false} style={styles.predictionMain}>{prediction.structured_formatting.main_text}</Text>
                    <Text allowFontScaling={false} style={styles.predictionSecondary}>{prediction.structured_formatting.secondary_text}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}
          {!vm.venueSelected && vm.searchQuery.length >= 3 && !vm.searching && vm.predictions.length === 0 && (
            <View style={styles.predictionsDropdown}>
              <Text allowFontScaling={false} style={styles.noResults}>No results found. Try a different search.</Text>
            </View>
          )}
        </View>
        {vm.venueSelected && (
          <View style={styles.selectedCard}>
            <View style={styles.selectedHeader}>
              <Text allowFontScaling={false} style={styles.selectedName}>{vm.venue.venue_name}</Text>
              <TouchableOpacity onPress={vm.clearSelection}>
                <Text allowFontScaling={false} style={styles.changeText}>Change</Text>
              </TouchableOpacity>
            </View>
            {vm.venue.address ? <Text allowFontScaling={false} style={styles.selectedDetail}>📍 {vm.venue.address}</Text> : null}
            {vm.venue.city && vm.venue.state ? <Text allowFontScaling={false} style={styles.selectedDetail}>{vm.venue.city}, {vm.venue.state} {vm.venue.zip_code}</Text> : null}
            {vm.venue.phone ? <Text allowFontScaling={false} style={styles.selectedDetail}>📞 {vm.venue.phone}</Text> : null}
          </View>
        )}
        <Text allowFontScaling={false} style={styles.label}>Anything we should know? (optional)</Text>
        <TextInput
          allowFontScaling={false}
          style={styles.notesInput}
          placeholder="e.g. They have 9-ball tournaments on Thursdays, ask for Mike..."
          placeholderTextColor={COLORS.textMuted}
          value={vm.notes}
          onChangeText={vm.setNotes}
          multiline
          numberOfLines={3}
          textAlignVertical="top"
        />
        <View style={styles.buttonsRow}>
          <TouchableOpacity style={[styles.submitButton, (!vm.venueSelected || vm.submitting) && styles.submitButtonDisabled]} onPress={vm.handleSubmit} disabled={!vm.venueSelected || vm.submitting}>
            {vm.submitting ? <ActivityIndicator color="#fff" /> : <Text allowFontScaling={false} style={styles.submitButtonText}>Submit</Text>}
          </TouchableOpacity>
          <TouchableOpacity style={styles.cancelButton} onPress={vm.close}>
            <Text allowFontScaling={false} style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );

  return (
    <Modal visible={vm.visible} animationType="fade" transparent onRequestClose={vm.close}>
      {isWeb ? (
        <>
          <TouchableOpacity style={wStyles.backdrop} activeOpacity={1} onPress={vm.close} />
          <View style={wStyles.overlay}>{inner}</View>
        </>
      ) : (
        <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={vm.close} />
          <View style={styles.cardWrapper}>
            <View style={styles.card}>{inner}</View>
          </View>
        </KeyboardAvoidingView>
      )}
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)" },
  cardWrapper: { flex: 1, justifyContent: "center", alignItems: "center", padding: scale(20) },
  card: { width: "100%" as any, maxWidth: 480, maxHeight: "85%" as any, backgroundColor: COLORS.background, borderRadius: scale(20), borderWidth: 1, borderColor: COLORS.border, overflow: "hidden", shadowColor: "#000", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.5, shadowRadius: 24 },
  sheet: { backgroundColor: COLORS.background, paddingBottom: Platform.OS === "ios" ? 34 : scale(SPACING.md) },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: scale(SPACING.md), paddingTop: scale(SPACING.md), paddingBottom: scale(SPACING.sm), borderBottomWidth: 1, borderBottomColor: COLORS.border },
  title: { fontSize: moderateScale(FONT_SIZES.lg), fontWeight: "700", color: COLORS.text },
  closeButton: { padding: scale(SPACING.xs) },
  closeText: { fontSize: moderateScale(20), color: COLORS.textSecondary },
  description: { fontSize: moderateScale(FONT_SIZES.sm), color: COLORS.textSecondary, paddingHorizontal: scale(SPACING.md), paddingTop: scale(SPACING.sm), paddingBottom: scale(SPACING.xs) },
  content: { paddingHorizontal: scale(SPACING.md), paddingTop: scale(SPACING.xs) },
  label: { fontSize: moderateScale(FONT_SIZES.sm), fontWeight: "600", color: COLORS.text, marginBottom: scale(SPACING.xs), marginTop: scale(SPACING.sm) },
  searchWrapper: { position: "relative", zIndex: 10 },
  searchInput: { backgroundColor: COLORS.surface, borderRadius: scale(10), padding: scale(SPACING.sm), fontSize: moderateScale(FONT_SIZES.md), color: COLORS.text, borderWidth: 1, borderColor: COLORS.border },
  searchSpinner: { position: "absolute", right: 12, top: 12 },
  predictionsDropdown: { position: "absolute", top: "100%", left: 0, right: 0, backgroundColor: COLORS.surface, borderWidth: 1, borderTopWidth: 0, borderColor: COLORS.border, borderBottomLeftRadius: scale(10), borderBottomRightRadius: scale(10), zIndex: 20, elevation: 10, shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8 },
  predictionsScroll: { maxHeight: 200 },
  predictionItem: { paddingVertical: scale(SPACING.sm), paddingHorizontal: scale(SPACING.sm), borderBottomWidth: 1, borderBottomColor: COLORS.border },
  predictionMain: { fontSize: moderateScale(FONT_SIZES.md), fontWeight: "600", color: COLORS.text },
  predictionSecondary: { fontSize: moderateScale(FONT_SIZES.sm), color: COLORS.textSecondary, marginTop: 2 },
  noResults: { fontSize: moderateScale(FONT_SIZES.sm), color: COLORS.textMuted, textAlign: "center", padding: scale(SPACING.md) },
  selectedCard: { backgroundColor: COLORS.surface, borderRadius: scale(12), padding: scale(SPACING.md), borderWidth: 1, borderColor: COLORS.primary + "40", marginTop: scale(SPACING.sm) },
  selectedHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: scale(SPACING.xs) },
  selectedName: { fontSize: moderateScale(FONT_SIZES.md), fontWeight: "700", color: COLORS.text, flex: 1 },
  changeText: { fontSize: moderateScale(FONT_SIZES.sm), color: COLORS.primary, fontWeight: "600" },
  selectedDetail: { fontSize: moderateScale(FONT_SIZES.sm), color: COLORS.textSecondary, marginTop: 4 },
  notesInput: { backgroundColor: COLORS.surface, borderRadius: scale(10), padding: scale(SPACING.sm), fontSize: moderateScale(FONT_SIZES.md), color: COLORS.text, borderWidth: 1, borderColor: COLORS.border, minHeight: 70 },
  buttonsRow: { flexDirection: "row", gap: scale(SPACING.sm), marginTop: scale(SPACING.md) },
  submitButton: { flex: 1, backgroundColor: COLORS.primary, borderRadius: scale(10), padding: scale(SPACING.md), alignItems: "center" },
  submitButtonDisabled: { opacity: 0.5 },
  submitButtonText: { color: "#fff", fontSize: moderateScale(FONT_SIZES.md), fontWeight: "700" },
  cancelButton: { flex: 1, backgroundColor: COLORS.surface, borderRadius: scale(10), padding: scale(SPACING.md), alignItems: "center", borderWidth: 1, borderColor: COLORS.border },
  cancelButtonText: { color: COLORS.textSecondary, fontSize: moderateScale(FONT_SIZES.md), fontWeight: "600" },
});

const wStyles = StyleSheet.create({
  backdrop: { position: "fixed" as any, top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.75)", zIndex: 3000 },
  overlay: { position: "fixed" as any, top: 0, left: 0, right: 0, bottom: 0, zIndex: 3001, alignItems: "center", justifyContent: "center", padding: 24, pointerEvents: "box-none" as any },
  sheet: { width: 520, maxWidth: "90%" as any, maxHeight: "85vh" as any, borderRadius: scale(16), borderTopLeftRadius: scale(16), borderTopRightRadius: scale(16), shadowColor: "#000", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.5, shadowRadius: 24 },
});
