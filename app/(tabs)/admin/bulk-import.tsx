// ─── Bulk Import Screen ──────────────────────────────────────────────────────
// app/(tabs)/admin/bulk-import.tsx

import { useRouter } from "expo-router";
import {
  ActivityIndicator,
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Platform,
} from "react-native";
import { useAuthContext } from "../../../src/providers/AuthProvider";
import { COLORS } from "../../../src/theme/colors";
import { SPACING } from "../../../src/theme/spacing";
import { FONT_SIZES } from "../../../src/theme/typography";
import { useBulkImport } from "../../../src/viewmodels/hooks/useBulkImport";

const isWeb = Platform.OS === "web";

export default function BulkImportScreen() {
  const router = useRouter();
  const { profile } = useAuthContext();
  const vm = useBulkImport();

  // ── Guard: Super Admin only ──
  if (profile?.role !== "super_admin") {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.emoji}>🔒</Text>
        <Text style={styles.title}>Access Denied</Text>
        <Text style={styles.subtitle}>
          Bulk import is only available for Super Admins.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}
      contentContainerStyle={isWeb ? styles.scrollContentWeb : undefined}
    >
      {/* Header */}
      <View style={[styles.header, isWeb && styles.headerWeb]}>
        <Text style={styles.headerTitle}>BULK IMPORT</Text>
        <Text style={styles.headerSubtitle}>Import tournaments from CSV</Text>
      </View>

      <View style={styles.content}>
        {/* ── Phase: Idle ── */}
        {vm.state.phase === "idle" && (
          <View>
            <View style={styles.infoCard}>
              <Text style={styles.infoTitle}>How it works</Text>
              <Text style={styles.infoText}>
                1. Fill out the tournament CSV template{"\n"}
                2. Export as .csv file{"\n"}
                3. Upload it here{"\n"}
                4. Review validation results{"\n"}
                5. Import valid tournaments
              </Text>
              <Text style={styles.infoNote}>
                Only the 7 required fields need to be filled in (venue_id,
                director_id, name, game_type, tournament_format, date, time).
                Everything else can be left blank — bar owners can fill in
                details later.
              </Text>
            </View>

            <TouchableOpacity style={styles.primaryButton} onPress={vm.pickFile}>
              <Text style={styles.primaryButtonText}>📄 Select CSV File</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Phase: Parsing ── */}
        {vm.state.phase === "parsing" && (
          <View style={styles.centerContent}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={styles.statusText}>
              Parsing and validating {vm.state.fileName}...
            </Text>
          </View>
        )}

        {/* ── Phase: Validated ── */}
        {vm.state.phase === "validated" && (
          <View>
            {/* Summary Card */}
            <View style={styles.summaryCard}>
              <Text style={styles.summaryTitle}>
                📋 {vm.state.totalRows} rows found
              </Text>
              <View style={styles.summaryRow}>
                <View style={styles.summaryItem}>
                  <Text style={styles.summaryCount}>
                    {vm.state.validRows.length}
                  </Text>
                  <Text style={styles.summaryLabelGreen}>Valid</Text>
                </View>
                <View style={styles.summaryItem}>
                  <Text style={styles.summaryCountError}>
                    {vm.state.errorRows.length}
                  </Text>
                  <Text style={styles.summaryLabelRed}>Errors</Text>
                </View>
              </View>
            </View>

            {/* Error List */}
            {vm.state.errorRows.length > 0 && (
              <View style={styles.errorSection}>
                <Text style={styles.errorSectionTitle}>
                  ⚠️ Rows with errors (will be skipped)
                </Text>
                {vm.state.errorRows.map((row) => (
                  <View key={row.rowNumber} style={styles.errorRow}>
                    <Text style={styles.errorRowNumber}>Row {row.rowNumber}</Text>
                    {row.errors.map((err, idx) => (
                      <Text key={idx} style={styles.errorMessage}>
                        • {err}
                      </Text>
                    ))}
                  </View>
                ))}
              </View>
            )}

            {/* Action Buttons */}
            <View style={styles.buttonRow}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={vm.reset}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.primaryButton,
                  styles.importButton,
                  !vm.canImport && styles.disabledButton,
                ]}
                onPress={vm.startImport}
                disabled={!vm.canImport}
              >
                <Text style={styles.primaryButtonText}>
                  Import {vm.state.validRows.length} Tournaments
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ── Phase: Importing ── */}
        {vm.state.phase === "importing" && (
          <View style={styles.centerContent}>
            <Text style={styles.importingTitle}>Importing...</Text>

            {/* Progress Bar */}
            <View style={styles.progressBarContainer}>
              <View
                style={[styles.progressBarFill, { width: `${vm.progress * 100}%` }]}
              />
            </View>

            <Text style={styles.statusText}>
              Tournament {vm.state.currentRow} of {vm.state.validRows.length}
            </Text>

            <ActivityIndicator
              size="small"
              color={COLORS.primary}
              style={{ marginTop: SPACING.md }}
            />
          </View>
        )}

        {/* ── Phase: Complete ── */}
        {vm.state.phase === "complete" && (
          <View>
            {/* Success Card */}
            <View style={styles.successCard}>
              <Text style={styles.successEmoji}>✅</Text>
              <Text style={styles.successTitle}>Import Complete</Text>
              <Text style={styles.successCount}>
                {vm.state.importedCount} tournaments created
              </Text>
            </View>

            {/* Import Failures */}
            {vm.state.failedDuringImport.length > 0 && (
              <View style={styles.errorSection}>
                <Text style={styles.errorSectionTitle}>
                  ❌ {vm.state.failedDuringImport.length} failed during import
                </Text>
                {vm.state.failedDuringImport.map((fail, idx) => (
                  <View key={idx} style={styles.errorRow}>
                    <Text style={styles.errorRowNumber}>Row {fail.rowNumber}</Text>
                    <Text style={styles.errorMessage}>• {fail.error}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* Skipped Rows Reminder */}
            {vm.state.errorRows.length > 0 && (
              <View style={styles.reminderCard}>
                <Text style={styles.reminderText}>
                  💡 {vm.state.errorRows.length} rows were skipped during
                  validation. Fix them in your CSV and re-import if needed.
                </Text>
              </View>
            )}

            {/* Action Buttons */}
            <View style={styles.buttonRow}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => router.back()}
              >
                <Text style={styles.cancelButtonText}>Back to Dashboard</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.primaryButton, styles.importButton]}
                onPress={vm.reset}
              >
                <Text style={styles.primaryButtonText}>Import More</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>

      <View style={styles.bottomSpacer} />
    </ScrollView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // Web centering
  scrollContentWeb: {
    alignItems: "center",
    paddingBottom: SPACING.xl,
  },
  container: {
    ...Platform.select({ web: { maxWidth: 860, width: "100%" as any, alignSelf: "center" as any } }),
    flex: 1,
    backgroundColor: COLORS.background,
  },
  centerContainer: {
    flex: 1,
    backgroundColor: COLORS.background,
    justifyContent: "center",
    alignItems: "center",
    padding: SPACING.lg,
  },
  header: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.xl + SPACING.lg,
    paddingBottom: SPACING.md,
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerWeb: {
    paddingTop: SPACING.lg,
  },
  headerTitle: {
    fontSize: FONT_SIZES.xl,
    fontWeight: "700",
    color: COLORS.text,
    letterSpacing: 1,
  },
  headerSubtitle: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
  },
  content: {
    padding: SPACING.md,
  },
  centerContent: {
    alignItems: "center",
    paddingVertical: SPACING.xl * 2,
  },
  emoji: {
    fontSize: 60,
    marginBottom: SPACING.md,
  },
  title: {
    fontSize: FONT_SIZES.xl,
    fontWeight: "700",
    color: COLORS.text,
    marginBottom: SPACING.sm,
    textAlign: "center",
  },
  subtitle: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textSecondary,
    textAlign: "center",
  },

  // ── Info Card ──
  infoCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: SPACING.lg,
  },
  infoTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: "700",
    color: COLORS.text,
    marginBottom: SPACING.sm,
  },
  infoText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    lineHeight: 22,
  },
  infoNote: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.primary,
    marginTop: SPACING.sm,
    lineHeight: 18,
  },

  // ── Buttons ──
  primaryButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    padding: SPACING.md,
    alignItems: "center",
  },
  primaryButtonText: {
    fontSize: FONT_SIZES.md,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  importButton: {
    flex: 1,
  },
  cancelButton: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: SPACING.md,
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
    marginRight: SPACING.sm,
  },
  cancelButtonText: {
    fontSize: FONT_SIZES.md,
    fontWeight: "600",
    color: COLORS.textSecondary,
  },
  disabledButton: {
    opacity: 0.5,
  },
  buttonRow: {
    flexDirection: "row",
    marginTop: SPACING.lg,
  },

  // ── Summary Card ──
  summaryCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
    marginBottom: SPACING.md,
  },
  summaryTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: "700",
    color: COLORS.text,
    marginBottom: SPACING.md,
  },
  summaryRow: {
    flexDirection: "row",
    gap: SPACING.xl * 2,
  },
  summaryItem: {
    alignItems: "center",
  },
  summaryCount: {
    fontSize: 32,
    fontWeight: "700",
    color: "#4CAF50",
  },
  summaryCountError: {
    fontSize: 32,
    fontWeight: "700",
    color: "#F44336",
  },
  summaryLabelGreen: {
    fontSize: FONT_SIZES.sm,
    color: "#4CAF50",
    fontWeight: "600",
  },
  summaryLabelRed: {
    fontSize: FONT_SIZES.sm,
    color: "#F44336",
    fontWeight: "600",
  },

  // ── Error Section ──
  errorSection: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: "#F4433633",
    marginTop: SPACING.sm,
  },
  errorSectionTitle: {
    fontSize: FONT_SIZES.sm,
    fontWeight: "700",
    color: "#F44336",
    marginBottom: SPACING.sm,
  },
  errorRow: {
    paddingVertical: SPACING.xs,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  errorRowNumber: {
    fontSize: FONT_SIZES.sm,
    fontWeight: "700",
    color: COLORS.text,
  },
  errorMessage: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    marginLeft: SPACING.sm,
    marginTop: 2,
  },

  // ── Progress Bar ──
  importingTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: "700",
    color: COLORS.text,
    marginBottom: SPACING.lg,
  },
  progressBarContainer: {
    width: "100%",
    height: 12,
    backgroundColor: COLORS.surface,
    borderRadius: 6,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  progressBarFill: {
    height: "100%",
    backgroundColor: COLORS.primary,
    borderRadius: 6,
  },
  statusText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    marginTop: SPACING.sm,
  },

  // ── Success Card ──
  successCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: SPACING.xl,
    borderWidth: 1,
    borderColor: "#4CAF5033",
    alignItems: "center",
    marginBottom: SPACING.md,
  },
  successEmoji: {
    fontSize: 48,
    marginBottom: SPACING.sm,
  },
  successTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: "700",
    color: COLORS.text,
  },
  successCount: {
    fontSize: FONT_SIZES.md,
    color: "#4CAF50",
    fontWeight: "600",
    marginTop: SPACING.xs,
  },

  // ── Reminder Card ──
  reminderCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: "#FF980033",
    marginTop: SPACING.sm,
  },
  reminderText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    lineHeight: 18,
  },

  bottomSpacer: {
    height: SPACING.xl * 2,
  },
});