// app/(tabs)/admin/edit-user/[id].tsx

import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { COLORS } from "../../../../src/theme/colors";
import { SPACING } from "../../../../src/theme/spacing";
import { FONT_SIZES } from "../../../../src/theme/typography";
import { useEditUser } from "../../../../src/viewmodels/useEditUser";
import { Dropdown } from "../../../../src/views/components/common/dropdown";

const isWeb = Platform.OS === "web";

export default function EditUserScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const vm = useEditUser(id || "");

  if (vm.loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading user...</Text>
      </View>
    );
  }

  if (!vm.user) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorIcon}>❌</Text>
        <Text style={styles.errorText}>User not found</Text>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Text style={styles.backButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!vm.canEdit) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorIcon}>🔒</Text>
        <Text style={styles.errorText}>
          You do not have permission to edit this user
        </Text>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Text style={styles.backButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const handleSave = async () => {
    const success = await vm.saveUser();
    if (success) router.back();
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "Never";
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, isWeb && styles.headerWeb]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.headerBack}
        >
          <Text style={styles.headerBackText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>EDIT USER</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={isWeb ? styles.scrollContentWeb : undefined}
        showsVerticalScrollIndicator={false}
      >
        <View style={isWeb ? styles.webInner : styles.mobileInner}>
          {vm.user.is_disabled && (
            <View style={styles.disabledBanner}>
              <Ionicons name="ban-outline" size={16} color="#fff" />
              <Text style={styles.disabledBannerText}>
                This user account is currently disabled
              </Text>
            </View>
          )}

          {/* Read-only Info */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>User Info</Text>
            <View style={styles.infoCard}>
              <InfoRow label="User ID" value={`#${vm.user.id_auto}`} />
              <InfoRow label="Email" value={vm.user.email} />
              <InfoRow label="Username" value={`@${vm.user.user_name}`} />
              <InfoRow label="Created" value={formatDate(vm.user.created_at)} />
              <InfoRow
                label="Last Login"
                value={formatDate(vm.user.last_login_at)}
              />
              <InfoRow
                label="Account"
                value={vm.user.is_disabled ? "DISABLED" : "Active"}
                valueColor={vm.user.is_disabled ? "#E53935" : "#4CAF50"}
                isLast
              />
            </View>
          </View>

          {/* Editable Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Edit Details</Text>
            <View style={styles.editCard}>
              <View style={styles.nameRow}>
                <View style={styles.nameField}>
                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>First Name</Text>
                    <TextInput
                      style={styles.textInput}
                      value={vm.firstName}
                      onChangeText={vm.setFirstName}
                      placeholder="First Name"
                      placeholderTextColor={COLORS.textSecondary}
                      autoCapitalize="words"
                    />
                  </View>
                </View>
                <View style={styles.nameField}>
                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>Last Name</Text>
                    <TextInput
                      style={styles.textInput}
                      value={vm.lastName}
                      onChangeText={vm.setLastName}
                      placeholder="Last Name"
                      placeholderTextColor={COLORS.textSecondary}
                      autoCapitalize="words"
                    />
                  </View>
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Role</Text>
                <Dropdown
                  options={vm.roleOptions}
                  value={vm.role}
                  onSelect={(value) => vm.setRole(value as any)}
                  placeholder="Select role"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Status</Text>
                <Dropdown
                  options={vm.statusOptions}
                  value={vm.status}
                  onSelect={(value) => vm.setStatus(value as any)}
                  placeholder="Select status"
                />
              </View>
            </View>
          </View>

          {/* Account Access */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Account Access</Text>
            <View style={styles.disableCard}>
              <View style={styles.disableInfo}>
                <Ionicons
                  name={
                    vm.user.is_disabled
                      ? "lock-closed-outline"
                      : "shield-checkmark-outline"
                  }
                  size={20}
                  color={vm.user.is_disabled ? "#E53935" : "#4CAF50"}
                />
                <View style={styles.disableTextContainer}>
                  <Text style={styles.disableTitle}>
                    {vm.user.is_disabled
                      ? "Account Disabled"
                      : "Account Active"}
                  </Text>
                  <Text style={styles.disableDescription}>
                    {vm.user.is_disabled
                      ? "This user cannot log in or submit content. They will see a disabled message."
                      : "This user can log in and use the app normally."}
                  </Text>
                </View>
              </View>

              <TouchableOpacity
                style={[
                  styles.disableButton,
                  vm.user.is_disabled
                    ? styles.enableButtonStyle
                    : styles.disableButtonStyle,
                ]}
                onPress={vm.toggleDisabled}
                disabled={vm.togglingDisable}
              >
                {vm.togglingDisable ? (
                  <ActivityIndicator
                    size="small"
                    color={vm.user.is_disabled ? "#4CAF50" : "#fff"}
                  />
                ) : (
                  <>
                    <Ionicons
                      name={
                        vm.user.is_disabled
                          ? "checkmark-circle-outline"
                          : "ban-outline"
                      }
                      size={16}
                      color={vm.user.is_disabled ? "#4CAF50" : "#fff"}
                    />
                    <Text
                      style={[
                        styles.disableButtonText,
                        vm.user.is_disabled
                          ? styles.enableButtonText
                          : styles.disableButtonTextWhite,
                      ]}
                    >
                      {vm.user.is_disabled ? "Enable User" : "Disable User"}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>

          {/* Action Buttons */}
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.button, styles.cancelButton]}
              onPress={() => router.back()}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.button,
                styles.saveButton,
                (!vm.hasChanges || vm.saving) && styles.buttonDisabled,
              ]}
              onPress={handleSave}
              disabled={!vm.hasChanges || vm.saving}
            >
              {vm.saving ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.saveButtonText}>Save Changes</Text>
              )}
            </TouchableOpacity>
          </View>

          <View style={styles.bottomSpacer} />
        </View>
      </ScrollView>
    </View>
  );
}

const InfoRow = ({
  label,
  value,
  valueColor,
  isLast = false,
}: {
  label: string;
  value: string;
  valueColor?: string;
  isLast?: boolean;
}) => (
  <View style={[styles.infoRow, !isLast && styles.infoRowBorder]}>
    <Text style={styles.infoLabel}>{label}</Text>
    <Text
      style={[
        styles.infoValue,
        valueColor ? { color: valueColor, fontWeight: "700" } : undefined,
      ]}
    >
      {value}
    </Text>
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  centerContainer: {
    flex: 1,
    backgroundColor: COLORS.background,
    justifyContent: "center",
    alignItems: "center",
    padding: SPACING.lg,
  },
  loadingText: {
    marginTop: SPACING.md,
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
  },
  errorIcon: { fontSize: 48, marginBottom: SPACING.md },
  errorText: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textSecondary,
    textAlign: "center",
    marginBottom: SPACING.lg,
  },
  backButton: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    backgroundColor: COLORS.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  backButtonText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.text,
    fontWeight: "500",
  },

  // ── Header ────────────────────────────────────────────────────────────────
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.xl + SPACING.sm,
    paddingBottom: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerWeb: {
    paddingTop: SPACING.lg, // nav handles safe area
  },
  headerBack: { padding: SPACING.xs },
  headerBackText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.primary,
    fontWeight: "500",
  },
  headerTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: "600",
    color: COLORS.text,
    letterSpacing: 0.5,
  },
  headerSpacer: { width: 60 },

  // ── Web centering ─────────────────────────────────────────────────────────
  scrollView: { flex: 1 },
  scrollContentWeb: { alignItems: "center", paddingBottom: SPACING.xl },
  webInner: { width: "100%" as any, maxWidth: 860, padding: SPACING.md },
  mobileInner: { flex: 1, padding: SPACING.md },

  // ── Disabled banner ───────────────────────────────────────────────────────
  disabledBanner: {
    backgroundColor: "#E53935",
    borderRadius: 8,
    padding: SPACING.sm,
    marginBottom: SPACING.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: SPACING.xs,
  },
  disabledBannerText: {
    color: "#fff",
    fontSize: FONT_SIZES.sm,
    fontWeight: "600",
  },

  // ── Sections ──────────────────────────────────────────────────────────────
  section: { marginBottom: SPACING.lg },
  sectionTitle: {
    fontSize: FONT_SIZES.xs,
    fontWeight: "600",
    color: COLORS.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: SPACING.sm,
    marginLeft: SPACING.xs,
  },
  infoCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: "hidden",
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  infoRowBorder: { borderBottomWidth: 1, borderBottomColor: COLORS.border },
  infoLabel: { fontSize: FONT_SIZES.sm, color: COLORS.textSecondary },
  infoValue: { fontSize: FONT_SIZES.sm, color: COLORS.text, fontWeight: "500" },
  editCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
    gap: SPACING.md,
  },
  nameRow: { flexDirection: "row", gap: SPACING.sm },
  nameField: { flex: 1 },
  inputGroup: { gap: SPACING.xs },
  inputLabel: {
    fontSize: FONT_SIZES.xs,
    fontWeight: "500",
    color: COLORS.textSecondary,
    marginLeft: SPACING.xs,
  },
  textInput: {
    backgroundColor: COLORS.background,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.sm,
    fontSize: FONT_SIZES.sm,
    color: COLORS.text,
    height: 40,
  },

  // ── Disable/Enable ────────────────────────────────────────────────────────
  disableCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
    gap: SPACING.md,
  },
  disableInfo: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: SPACING.sm,
  },
  disableTextContainer: { flex: 1 },
  disableTitle: {
    fontSize: FONT_SIZES.sm,
    fontWeight: "600",
    color: COLORS.text,
    marginBottom: 2,
  },
  disableDescription: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    lineHeight: 18,
  },
  disableButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: SPACING.xs,
    paddingVertical: SPACING.sm,
    borderRadius: 8,
    height: 44,
  },
  disableButtonStyle: { backgroundColor: "#E53935" },
  enableButtonStyle: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: "#4CAF50",
  },
  disableButtonText: { fontSize: FONT_SIZES.sm, fontWeight: "600" },
  disableButtonTextWhite: { color: "#fff" },
  enableButtonText: { color: "#4CAF50" },

  // ── Action buttons ────────────────────────────────────────────────────────
  actions: { flexDirection: "row", gap: SPACING.sm, marginTop: SPACING.md },
  button: {
    flex: 1,
    paddingVertical: SPACING.sm,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    height: 44,
  },
  cancelButton: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cancelButtonText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.text,
    fontWeight: "500",
  },
  saveButton: { backgroundColor: COLORS.primary },
  saveButtonText: { fontSize: FONT_SIZES.sm, color: "#fff", fontWeight: "600" },
  buttonDisabled: { opacity: 0.5 },
  bottomSpacer: { height: SPACING.xl * 2 },
});
