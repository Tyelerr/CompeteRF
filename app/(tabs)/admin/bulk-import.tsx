// app/(tabs)/admin/bulk-import.tsx

import { useRouter } from "expo-router";
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useAuthContext } from "../../../src/providers/AuthProvider";
import { COLORS } from "../../../src/theme/colors";
import { SPACING } from "../../../src/theme/spacing";
import { FONT_SIZES } from "../../../src/theme/typography";
import { moderateScale, scale } from "../../../src/utils/scaling";
import { useBulkImport } from "../../../src/viewmodels/hooks/useBulkImport";

const isWeb = Platform.OS === "web";

export default function BulkImportScreen() {
  const router = useRouter();
  const { profile } = useAuthContext();
  const vm = useBulkImport();

  if (profile?.role !== "super_admin") {
    return (
      <View style={styles.centerContainer}>
        <Text allowFontScaling={false} style={styles.emoji}>{"\uD83D\uDD12"}</Text>
        <Text allowFontScaling={false} style={styles.title}>Access Denied</Text>
        <Text allowFontScaling={false} style={styles.subtitle}>Bulk import is only available for Super Admins.</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={isWeb ? styles.scrollContentWeb : undefined}
    >
      <View style={[styles.header, isWeb && styles.headerWeb]}>
        <Text allowFontScaling={false} style={styles.headerTitle}>BULK IMPORT</Text>
        <Text allowFontScaling={false} style={styles.headerSubtitle}>Import tournaments from CSV</Text>
      </View>

      <View style={styles.content}>

        {/* Idle */}
        {vm.state.phase === "idle" && (
          <View>
            <View style={styles.infoCard}>
              <Text allowFontScaling={false} style={styles.infoTitle}>How it works</Text>
              <Text allowFontScaling={false} style={styles.infoText}>
                {"1. Fill out the tournament CSV template\n2. Export as .csv file\n3. (Optional) Select flyer images\n4. Upload the CSV here\n5. Review validation results\n6. Import valid tournaments"}
              </Text>
              <Text allowFontScaling={false} style={styles.infoNote}>
                Only the 7 required fields need to be filled in (venue_id, director_id, name, game_type, tournament_format, date, time). Everything else can be left blank {"\u2013"} bar owners can fill in details later.
              </Text>
            </View>

            <View style={styles.imagePickerCard}>
              <View style={styles.imagePickerHeader}>
                <Text allowFontScaling={false} style={styles.imagePickerTitle}>{"\uD83D\uDDBC\uFE0F"} Flyer Images</Text>
                <Text allowFontScaling={false} style={styles.imagePickerSubtitle}>Optional</Text>
              </View>
              <Text allowFontScaling={false} style={styles.imagePickerHint}>
                If your CSV has image filenames in the thumbnail column (e.g.{" "}
                <Text allowFontScaling={false} style={styles.code}>rusty-9ball.jpg</Text>), select those files here. They will be uploaded to Supabase automatically during import.
              </Text>
              <View style={styles.imagePickerRow}>
                <TouchableOpacity style={styles.secondaryButton} onPress={vm.pickImages}>
                  <Text allowFontScaling={false} style={styles.secondaryButtonText}>{"\uD83D\uDCC2"} Select Images</Text>
                </TouchableOpacity>
                {vm.imageCount > 0 && (
                  <View style={styles.imageCountBadge}>
                    <Text allowFontScaling={false} style={styles.imageCountText}>
                      {"\u2705"} {vm.imageCount} image{vm.imageCount !== 1 ? "s" : ""} loaded
                    </Text>
                    <TouchableOpacity onPress={vm.clearImages}>
                      <Text allowFontScaling={false} style={styles.clearText}>Clear</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            </View>

            <TouchableOpacity style={styles.primaryButton} onPress={vm.pickFile}>
              <Text allowFontScaling={false} style={styles.primaryButtonText}>{"\uD83D\uDCC4"} Select CSV File</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Parsing */}
        {vm.state.phase === "parsing" && (
          <View style={styles.centerContent}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text allowFontScaling={false} style={styles.statusText}>Parsing and validating {vm.state.fileName}...</Text>
          </View>
        )}

        {/* Validated */}
        {vm.state.phase === "validated" && (
          <View>
            <View style={styles.summaryCard}>
              <Text allowFontScaling={false} style={styles.summaryTitle}>{"\uD83D\uDCCB"} {vm.state.totalRows} rows found</Text>
              <View style={styles.summaryRow}>
                <View style={styles.summaryItem}>
                  <Text allowFontScaling={false} style={styles.summaryCount}>{vm.state.validRows.length}</Text>
                  <Text allowFontScaling={false} style={styles.summaryLabelGreen}>Valid</Text>
                </View>
                <View style={styles.summaryItem}>
                  <Text allowFontScaling={false} style={styles.summaryCountError}>{vm.state.errorRows.length}</Text>
                  <Text allowFontScaling={false} style={styles.summaryLabelRed}>Errors</Text>
                </View>
              </View>
              {vm.imageCount > 0 && (
                <Text allowFontScaling={false} style={styles.imageSummaryNote}>
                  {"\uD83D\uDDBC\uFE0F"} {vm.imageCount} flyer image{vm.imageCount !== 1 ? "s" : ""} ready to upload
                </Text>
              )}
            </View>

            {vm.state.errorRows.length > 0 && (
              <View style={styles.errorSection}>
                <Text allowFontScaling={false} style={styles.errorSectionTitle}>{"\u26A0\uFE0F"} Rows with errors (will be skipped)</Text>
                {vm.state.errorRows.map((row) => (
                  <View key={row.rowNumber} style={styles.errorRow}>
                    <Text allowFontScaling={false} style={styles.errorRowNumber}>Row {row.rowNumber}</Text>
                    {row.errors.map((err, idx) => (
                      <Text allowFontScaling={false} key={idx} style={styles.errorMessage}>{"\u2022"} {err}</Text>
                    ))}
                  </View>
                ))}
              </View>
            )}

            <View style={styles.buttonRow}>
              <TouchableOpacity style={styles.cancelButton} onPress={vm.reset}>
                <Text allowFontScaling={false} style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.primaryButton, styles.importButton, !vm.canImport && styles.disabledButton]}
                onPress={vm.startImport}
                disabled={!vm.canImport}
              >
                <Text allowFontScaling={false} style={styles.primaryButtonText}>Import {vm.state.validRows.length} Tournaments</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Importing */}
        {vm.state.phase === "importing" && (
          <View style={styles.centerContent}>
            <Text allowFontScaling={false} style={styles.importingTitle}>Importing...</Text>
            <View style={styles.progressBarContainer}>
              <View style={[styles.progressBarFill, { width: `${vm.progress * 100}%` as any }]} />
            </View>
            <Text allowFontScaling={false} style={styles.statusText}>Tournament {vm.state.currentRow} of {vm.state.validRows.length}</Text>
            {vm.imageCount > 0 && (
              <Text allowFontScaling={false} style={styles.uploadingNote}>Uploading flyer images as needed...</Text>
            )}
            <ActivityIndicator size="small" color={COLORS.primary} style={{ marginTop: scale(SPACING.md) }} />
          </View>
        )}

        {/* Complete */}
        {vm.state.phase === "complete" && (
          <View>
            <View style={styles.successCard}>
              <Text allowFontScaling={false} style={styles.successEmoji}>{"\u2705"}</Text>
              <Text allowFontScaling={false} style={styles.successTitle}>Import Complete</Text>
              <Text allowFontScaling={false} style={styles.successCount}>{vm.state.importedCount} tournaments created</Text>
            </View>

            {vm.state.failedDuringImport.length > 0 && (
              <View style={styles.errorSection}>
                <Text allowFontScaling={false} style={styles.errorSectionTitle}>{"\u274C"} {vm.state.failedDuringImport.length} failed during import</Text>
                {vm.state.failedDuringImport.map((fail, idx) => (
                  <View key={idx} style={styles.errorRow}>
                    <Text allowFontScaling={false} style={styles.errorRowNumber}>Row {fail.rowNumber}</Text>
                    <Text allowFontScaling={false} style={styles.errorMessage}>{"\u2022"} {fail.error}</Text>
                  </View>
                ))}
              </View>
            )}

            {vm.state.errorRows.length > 0 && (
              <View style={styles.reminderCard}>
                <Text allowFontScaling={false} style={styles.reminderText}>
                  {"\uD83D\uDCA1"} {vm.state.errorRows.length} rows were skipped during validation. Fix them in your CSV and re-import if needed.
                </Text>
              </View>
            )}

            <View style={styles.buttonRow}>
              <TouchableOpacity style={styles.cancelButton} onPress={() => router.back()}>
                <Text allowFontScaling={false} style={styles.cancelButtonText}>Back to Dashboard</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.primaryButton, styles.importButton]} onPress={vm.reset}>
                <Text allowFontScaling={false} style={styles.primaryButtonText}>Import More</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>

      <View style={styles.bottomSpacer} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContentWeb: { alignItems: "center", paddingBottom: scale(SPACING.xl) },
  container: {
    ...Platform.select({ web: { maxWidth: 860, width: "100%" as any, alignSelf: "center" as any } }),
    flex: 1,
    backgroundColor: COLORS.background,
  },
  centerContainer: { flex: 1, backgroundColor: COLORS.background, justifyContent: "center", alignItems: "center", padding: scale(SPACING.lg) },
  header: { paddingHorizontal: scale(SPACING.lg), paddingTop: scale(SPACING.xl + SPACING.lg), paddingBottom: scale(SPACING.md), alignItems: "center", borderBottomWidth: 1, borderBottomColor: COLORS.border },
  headerWeb: { paddingTop: scale(SPACING.lg) },
  headerTitle: { fontSize: moderateScale(FONT_SIZES.xl), fontWeight: "700", color: COLORS.text, letterSpacing: 1 },
  headerSubtitle: { fontSize: moderateScale(FONT_SIZES.sm), color: COLORS.textSecondary, marginTop: scale(SPACING.xs) },
  content: { padding: scale(SPACING.md) },
  centerContent: { alignItems: "center", paddingVertical: scale(SPACING.xl * 2) },
  emoji: { fontSize: moderateScale(60), marginBottom: scale(SPACING.md) },
  title: { fontSize: moderateScale(FONT_SIZES.xl), fontWeight: "700", color: COLORS.text, marginBottom: scale(SPACING.sm), textAlign: "center" },
  subtitle: { fontSize: moderateScale(FONT_SIZES.md), color: COLORS.textSecondary, textAlign: "center" },
  infoCard: { backgroundColor: COLORS.surface, borderRadius: scale(12), padding: scale(SPACING.md), borderWidth: 1, borderColor: COLORS.border, marginBottom: scale(SPACING.md) },
  infoTitle: { fontSize: moderateScale(FONT_SIZES.md), fontWeight: "700", color: COLORS.text, marginBottom: scale(SPACING.sm) },
  infoText: { fontSize: moderateScale(FONT_SIZES.sm), color: COLORS.textSecondary, lineHeight: moderateScale(22) },
  infoNote: { fontSize: moderateScale(FONT_SIZES.xs), color: COLORS.primary, marginTop: scale(SPACING.sm), lineHeight: moderateScale(18) },
  imagePickerCard: { backgroundColor: COLORS.surface, borderRadius: scale(12), padding: scale(SPACING.md), borderWidth: 1, borderColor: COLORS.border, marginBottom: scale(SPACING.md) },
  imagePickerHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: scale(SPACING.xs) },
  imagePickerTitle: { fontSize: moderateScale(FONT_SIZES.md), fontWeight: "700", color: COLORS.text },
  imagePickerSubtitle: { fontSize: moderateScale(FONT_SIZES.xs), color: COLORS.textSecondary, fontStyle: "italic" },
  imagePickerHint: { fontSize: moderateScale(FONT_SIZES.xs), color: COLORS.textSecondary, lineHeight: moderateScale(18), marginBottom: scale(SPACING.sm) },
  code: { fontFamily: Platform.OS === "ios" ? "Courier" : "monospace", color: COLORS.primary },
  imagePickerRow: { flexDirection: "row", alignItems: "center", gap: scale(SPACING.sm), flexWrap: "wrap" },
  imageCountBadge: { flexDirection: "row", alignItems: "center", backgroundColor: "#4CAF5015", borderRadius: scale(8), paddingHorizontal: scale(SPACING.sm), paddingVertical: scale(SPACING.xs), gap: scale(SPACING.sm), borderWidth: 1, borderColor: "#4CAF5033" },
  imageCountText: { fontSize: moderateScale(FONT_SIZES.xs), color: "#4CAF50", fontWeight: "600" },
  clearText: { fontSize: moderateScale(FONT_SIZES.xs), color: COLORS.textSecondary, textDecorationLine: "underline" },
  imageSummaryNote: { fontSize: moderateScale(FONT_SIZES.xs), color: COLORS.primary, marginTop: scale(SPACING.sm), textAlign: "center" },
  uploadingNote: { fontSize: moderateScale(FONT_SIZES.xs), color: COLORS.textSecondary, marginTop: scale(SPACING.xs), fontStyle: "italic" },
  primaryButton: { backgroundColor: COLORS.primary, borderRadius: scale(12), padding: scale(SPACING.md), alignItems: "center" },
  primaryButtonText: { fontSize: moderateScale(FONT_SIZES.md), fontWeight: "700", color: "#FFFFFF" },
  secondaryButton: { backgroundColor: COLORS.surface, borderRadius: scale(12), padding: scale(SPACING.sm), alignItems: "center", borderWidth: 1, borderColor: COLORS.primary },
  secondaryButtonText: { fontSize: moderateScale(FONT_SIZES.sm), fontWeight: "600", color: COLORS.primary },
  importButton: { flex: 1 },
  cancelButton: { backgroundColor: COLORS.surface, borderRadius: scale(12), padding: scale(SPACING.md), alignItems: "center", borderWidth: 1, borderColor: COLORS.border, marginRight: scale(SPACING.sm) },
  cancelButtonText: { fontSize: moderateScale(FONT_SIZES.md), fontWeight: "600", color: COLORS.textSecondary },
  disabledButton: { opacity: 0.5 },
  buttonRow: { flexDirection: "row", marginTop: scale(SPACING.lg) },
  summaryCard: { backgroundColor: COLORS.surface, borderRadius: scale(12), padding: scale(SPACING.lg), borderWidth: 1, borderColor: COLORS.border, alignItems: "center", marginBottom: scale(SPACING.md) },
  summaryTitle: { fontSize: moderateScale(FONT_SIZES.lg), fontWeight: "700", color: COLORS.text, marginBottom: scale(SPACING.md) },
  summaryRow: { flexDirection: "row", gap: scale(SPACING.xl * 2) },
  summaryItem: { alignItems: "center" },
  summaryCount: { fontSize: moderateScale(32), fontWeight: "700", color: "#4CAF50" },
  summaryCountError: { fontSize: moderateScale(32), fontWeight: "700", color: "#F44336" },
  summaryLabelGreen: { fontSize: moderateScale(FONT_SIZES.sm), color: "#4CAF50", fontWeight: "600" },
  summaryLabelRed: { fontSize: moderateScale(FONT_SIZES.sm), color: "#F44336", fontWeight: "600" },
  errorSection: { backgroundColor: COLORS.surface, borderRadius: scale(12), padding: scale(SPACING.md), borderWidth: 1, borderColor: "#F4433633", marginTop: scale(SPACING.sm) },
  errorSectionTitle: { fontSize: moderateScale(FONT_SIZES.sm), fontWeight: "700", color: "#F44336", marginBottom: scale(SPACING.sm) },
  errorRow: { paddingVertical: scale(SPACING.xs), borderBottomWidth: 1, borderBottomColor: COLORS.border },
  errorRowNumber: { fontSize: moderateScale(FONT_SIZES.sm), fontWeight: "700", color: COLORS.text },
  errorMessage: { fontSize: moderateScale(FONT_SIZES.xs), color: COLORS.textSecondary, marginLeft: scale(SPACING.sm), marginTop: scale(2) },
  importingTitle: { fontSize: moderateScale(FONT_SIZES.lg), fontWeight: "700", color: COLORS.text, marginBottom: scale(SPACING.lg) },
  progressBarContainer: { width: "100%", height: scale(12), backgroundColor: COLORS.surface, borderRadius: scale(6), overflow: "hidden", borderWidth: 1, borderColor: COLORS.border },
  progressBarFill: { height: "100%", backgroundColor: COLORS.primary, borderRadius: scale(6) },
  statusText: { fontSize: moderateScale(FONT_SIZES.sm), color: COLORS.textSecondary, marginTop: scale(SPACING.sm) },
  successCard: { backgroundColor: COLORS.surface, borderRadius: scale(12), padding: scale(SPACING.xl), borderWidth: 1, borderColor: "#4CAF5033", alignItems: "center", marginBottom: scale(SPACING.md) },
  successEmoji: { fontSize: moderateScale(48), marginBottom: scale(SPACING.sm) },
  successTitle: { fontSize: moderateScale(FONT_SIZES.lg), fontWeight: "700", color: COLORS.text },
  successCount: { fontSize: moderateScale(FONT_SIZES.md), color: "#4CAF50", fontWeight: "600", marginTop: scale(SPACING.xs) },
  reminderCard: { backgroundColor: COLORS.surface, borderRadius: scale(12), padding: scale(SPACING.md), borderWidth: 1, borderColor: "#FF980033", marginTop: scale(SPACING.sm) },
  reminderText: { fontSize: moderateScale(FONT_SIZES.xs), color: COLORS.textSecondary, lineHeight: moderateScale(18) },
  bottomSpacer: { height: scale(SPACING.xl * 2) },
});
