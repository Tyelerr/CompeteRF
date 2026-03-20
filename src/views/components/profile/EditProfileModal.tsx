// src/views/components/profile/EditProfileModal.tsx

import {
  ActivityIndicator,
  Image,
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
import { RADIUS, SPACING } from "../../../theme/spacing";
import { FONT_SIZES } from "../../../theme/typography";
import { useDeleteAccount } from "../../../viewmodels/hooks/use-delete-account";
import { useEditProfile } from "../../../viewmodels/useEditProfile";
import { Dropdown } from "../common/dropdown";
import { DeleteAccountModal } from "./DeleteAccountModal";

const isWeb = Platform.OS === "web";

interface EditProfileModalProps {
  visible: boolean;
  onClose: () => void;
}

export function EditProfileModal({ visible, onClose }: EditProfileModalProps) {
  const vm = useEditProfile();

  const {
    modalVisible,
    confirmText,
    setConfirmText,
    deleting,
    isConfirmed,
    openModal,
    closeModal,
    handleDelete,
  } = useDeleteAccount();

  if (!visible) return null;

  const handleClose = () => {
    onClose();
  };

  const handleSaveAndClose = async () => {
    await vm.handleSave();
    // Only close if save succeeded (no error set)
    if (!vm.error) onClose();
  };

  const innerContent = vm.loading ? (
    <View style={s.loadingWrap}>
      <ActivityIndicator size="large" color={COLORS.primary} />
      <Text style={s.loadingText}>Loading profile...</Text>
    </View>
  ) : (
    <>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity style={s.closeButton} onPress={handleClose}>
          <Text style={s.closeButtonText}>&#x2715;</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>EDIT PROFILE</Text>
        <View style={{ width: 40 }} />
      </View>
      <View style={s.divider} />

      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Error */}
        {vm.error ? (
          <View style={s.errorContainer}>
            <Text style={s.errorText}>{vm.error}</Text>
          </View>
        ) : null}

        {/* Avatar */}
        <View style={s.avatarSection}>
          <TouchableOpacity
            onPress={vm.handlePickAvatar}
            disabled={vm.uploadingAvatar || vm.saving}
            style={s.avatarTouchable}
            activeOpacity={0.7}
          >
            {vm.uploadingAvatar ? (
              <View style={s.avatarContainer}>
                <ActivityIndicator size="large" color={COLORS.primary} />
              </View>
            ) : vm.avatarUrl ? (
              <Image source={{ uri: vm.avatarUrl }} style={s.avatarImage} />
            ) : (
              <View style={s.avatarContainer}>
                <Text style={s.avatarPlaceholderIcon}>&#x1F4F7;</Text>
                <Text style={s.avatarPlaceholderText}>Add Photo</Text>
              </View>
            )}
          </TouchableOpacity>
          <View style={s.avatarActions}>
            <TouchableOpacity
              onPress={vm.handlePickAvatar}
              disabled={vm.uploadingAvatar || vm.saving}
              style={s.avatarActionButton}
            >
              <Text style={s.avatarActionText}>
                {vm.avatarUrl ? "Change Photo" : "Upload Photo"}
              </Text>
            </TouchableOpacity>
            {vm.avatarUrl && (
              <TouchableOpacity
                onPress={vm.handleRemoveAvatar}
                disabled={vm.uploadingAvatar || vm.saving}
                style={s.avatarActionButton}
              >
                <Text style={s.avatarRemoveText}>Remove</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Form */}
        <View style={s.form}>
          {vm.username ? (
            <View style={s.fieldContainer}>
              <Text style={s.fieldLabel}>Username</Text>
              <TextInput
                style={[s.textInput, s.disabledInput, s.uppercaseInput]}
                value={"@" + vm.username.toUpperCase()}
                editable={false}
              />
              <Text style={s.disabledHint}>Username cannot be changed</Text>
            </View>
          ) : null}

          <View style={s.nameRow}>
            <View style={s.nameField}>
              <View style={s.fieldContainer}>
                <Text style={s.fieldLabel}>
                  First Name <Text style={s.required}>*</Text>
                </Text>
                <TextInput
                  style={[
                    s.textInput,
                    !vm.profileData.first_name.trim() &&
                      vm.profileData.first_name.length > 0 &&
                      s.inputError,
                  ]}
                  placeholder="First Name"
                  placeholderTextColor={COLORS.textMuted}
                  value={vm.profileData.first_name}
                  onChangeText={(v) => vm.updateField("first_name", v)}
                  editable={!vm.saving}
                  autoCapitalize="words"
                  autoCorrect={false}
                />
              </View>
            </View>
            <View style={s.nameField}>
              <View style={s.fieldContainer}>
                <Text style={s.fieldLabel}>
                  Last Name <Text style={s.required}>*</Text>
                </Text>
                <TextInput
                  style={[
                    s.textInput,
                    !vm.profileData.last_name.trim() &&
                      vm.profileData.last_name.length > 0 &&
                      s.inputError,
                  ]}
                  placeholder="Last Name"
                  placeholderTextColor={COLORS.textMuted}
                  value={vm.profileData.last_name}
                  onChangeText={(v) => vm.updateField("last_name", v)}
                  editable={!vm.saving}
                  autoCapitalize="words"
                  autoCorrect={false}
                />
              </View>
            </View>
          </View>
          {!vm.isValid &&
            (vm.profileData.first_name.length > 0 ||
              vm.profileData.last_name.length > 0) && (
              <Text style={s.fieldError}>
                Both first and last name are required
              </Text>
            )}

          <View style={s.fieldContainer}>
            <Text style={s.fieldLabel}>Home State</Text>
            <Dropdown
              placeholder="Select your home state"
              options={vm.stateOptions}
              value={vm.profileData.home_state}
              onSelect={(v: string) => vm.updateField("home_state", v)}
              disabled={vm.saving}
            />
          </View>

          <View style={s.fieldContainer}>
            <Text style={s.fieldLabel}>Favorite Player</Text>
            <TextInput
              style={s.textInput}
              placeholder="Who's your favorite billiards player?"
              placeholderTextColor={COLORS.textMuted}
              value={vm.profileData.favorite_player}
              onChangeText={(v) => vm.updateField("favorite_player", v)}
              editable={!vm.saving}
              autoCapitalize="words"
              autoCorrect={false}
            />
          </View>

          <View style={s.fieldContainer}>
            <Text style={s.fieldLabel}>Favorite Game</Text>
            <Dropdown
              placeholder="Select your favorite billiards game"
              options={vm.gameOptions}
              value={vm.profileData.preferred_game}
              onSelect={(v: string) => vm.updateField("preferred_game", v)}
              disabled={vm.saving}
            />
          </View>

          <View style={s.infoContainer}>
            <Text style={s.infoIcon}>&#x2139;&#xFE0F;</Text>
            <Text style={s.infoText}>
              First and last name are required. Other fields help personalize
              your experience.
            </Text>
          </View>
        </View>

        {vm.hasChanges && (
          <View style={s.changesIndicator}>
            <Text style={s.changesText}>
              &#x270F;&#xFE0F; You have unsaved changes
            </Text>
          </View>
        )}

        {/* Delete section */}
        <View style={s.deleteSection}>
          <View style={s.deleteDivider} />
          <Text style={s.deleteSectionTitle}>Danger Zone</Text>
          <Text style={s.deleteSectionDescription}>
            Permanently delete your account and all associated data. This action
            cannot be undone.
          </Text>
          <TouchableOpacity style={s.deleteAccountButton} onPress={openModal}>
            <Text style={s.deleteAccountText}>Delete Account</Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: SPACING.xl }} />
      </ScrollView>

      {/* Footer buttons */}
      <View style={s.divider} />
      <View style={s.footer}>
        <TouchableOpacity
          style={[
            s.saveButton,
            (!vm.isValid || !vm.hasChanges || vm.saving) && s.buttonDisabled,
          ]}
          onPress={handleSaveAndClose}
          disabled={!vm.isValid || !vm.hasChanges || vm.saving}
        >
          {vm.saving ? (
            <ActivityIndicator size="small" color={COLORS.white} />
          ) : (
            <Text style={s.saveButtonText}>Save Changes</Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={s.cancelButton}
          onPress={handleClose}
          disabled={vm.saving}
        >
          <Text style={s.cancelButtonText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </>
  );

  // Web: fixed overlay
  if (isWeb) {
    return (
      <>
        <TouchableOpacity
          style={s.backdrop}
          activeOpacity={1}
          onPress={handleClose}
        />
        <View style={s.dialogWrap} pointerEvents="box-none">
          <View style={s.dialog}>{innerContent}</View>
        </View>
        <DeleteAccountModal
          visible={modalVisible}
          confirmText={confirmText}
          onChangeConfirmText={setConfirmText}
          isConfirmed={isConfirmed}
          deleting={deleting}
          onCancel={closeModal}
          onDelete={handleDelete}
        />
      </>
    );
  }

  // Mobile: slide-up Modal
  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={handleClose}
    >
      <View style={s.mobileOverlay}>
        <TouchableOpacity
          style={StyleSheet.absoluteFillObject}
          activeOpacity={1}
          onPress={handleClose}
        />
        <View style={s.mobileContainer}>{innerContent}</View>
      </View>
      <DeleteAccountModal
        visible={modalVisible}
        confirmText={confirmText}
        onChangeConfirmText={setConfirmText}
        isConfirmed={isConfirmed}
        deleting={deleting}
        onCancel={closeModal}
        onDelete={handleDelete}
      />
    </Modal>
  );
}

const s = StyleSheet.create({
  // Web overlay
  backdrop: {
    position: "fixed" as any,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.75)",
    zIndex: 2000,
  },
  dialogWrap: {
    position: "fixed" as any,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 2001,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  dialog: {
    width: 700,
    maxWidth: "92%" as any,
    height: "82vh" as any,
    backgroundColor: COLORS.black,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: "hidden" as any,
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 24,
    display: "flex" as any,
    flexDirection: "column",
  },

  // Mobile overlay
  mobileOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.75)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingTop: 60,
    paddingBottom: 100,
  },
  mobileContainer: {
    backgroundColor: COLORS.background,
    borderRadius: 20,
    width: "100%" as any,
    maxWidth: 500,
    height: "82%" as any,
    overflow: "hidden",
  },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.md,
  },
  closeButton: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  closeButtonText: { color: COLORS.text, fontSize: 20, fontWeight: "700" },
  headerTitle: {
    color: COLORS.text,
    fontSize: FONT_SIZES.lg,
    fontWeight: "700",
    letterSpacing: 1,
  },
  divider: { height: 1, backgroundColor: COLORS.border },

  scroll: { flex: 1, minHeight: 0 },
  scrollContent: { padding: SPACING.md },

  loadingWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: SPACING.xl,
  },
  loadingText: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZES.md,
    marginTop: SPACING.md,
  },

  // Footer
  footer: { flexDirection: "row", gap: SPACING.sm, padding: SPACING.md },
  saveButton: {
    flex: 1,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.primary,
  },
  saveButtonText: {
    fontSize: FONT_SIZES.md,
    color: COLORS.white,
    fontWeight: "600",
  },
  cancelButton: {
    flex: 1,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cancelButtonText: {
    fontSize: FONT_SIZES.md,
    color: COLORS.text,
    fontWeight: "600",
  },
  buttonDisabled: { opacity: 0.5 },

  // Error
  errorContainer: {
    backgroundColor: COLORS.error + "20",
    borderColor: COLORS.error,
    borderWidth: 1,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  errorText: {
    color: COLORS.error,
    fontSize: FONT_SIZES.sm,
    textAlign: "center",
  },

  // Avatar
  avatarSection: {
    alignItems: "center",
    marginBottom: SPACING.lg,
    paddingVertical: SPACING.md,
  },
  avatarTouchable: { marginBottom: SPACING.sm },
  avatarImage: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 3,
    borderColor: COLORS.primary,
  },
  avatarContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: COLORS.surface,
    borderWidth: 2,
    borderColor: COLORS.border,
    borderStyle: "dashed",
    justifyContent: "center",
    alignItems: "center",
  },
  avatarPlaceholderIcon: { fontSize: 32, marginBottom: SPACING.xs },
  avatarPlaceholderText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    fontWeight: "500",
  },
  avatarActions: {
    flexDirection: "row",
    gap: SPACING.md,
    marginTop: SPACING.xs,
  },
  avatarActionButton: {
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.sm,
  },
  avatarActionText: {
    color: COLORS.primary,
    fontSize: FONT_SIZES.sm,
    fontWeight: "600",
  },
  avatarRemoveText: {
    color: COLORS.error,
    fontSize: FONT_SIZES.sm,
    fontWeight: "600",
  },

  // Form
  form: { gap: SPACING.lg },
  nameRow: { flexDirection: "row", gap: SPACING.sm },
  nameField: { flex: 1 },
  fieldContainer: { gap: SPACING.sm },
  fieldLabel: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.text,
    fontWeight: "500",
  },
  required: { color: COLORS.error },
  textInput: {
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    fontSize: FONT_SIZES.md,
    color: COLORS.text,
  },
  disabledInput: { opacity: 0.5, color: COLORS.textMuted },
  uppercaseInput: { textTransform: "uppercase" },
  disabledHint: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    marginTop: -SPACING.xs,
  },
  inputError: {
    borderColor: COLORS.error,
    backgroundColor: COLORS.error + "10",
  },
  fieldError: {
    color: COLORS.error,
    fontSize: FONT_SIZES.xs,
    marginTop: -SPACING.sm,
  },
  infoContainer: {
    flexDirection: "row",
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "flex-start",
  },
  infoIcon: { fontSize: FONT_SIZES.md, marginRight: SPACING.sm, marginTop: 2 },
  infoText: {
    flex: 1,
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    lineHeight: 18,
  },

  changesIndicator: {
    marginTop: SPACING.lg,
    backgroundColor: COLORS.primary + "20",
    borderColor: COLORS.primary,
    borderWidth: 1,
    borderRadius: RADIUS.md,
    padding: SPACING.sm,
    alignItems: "center",
  },
  changesText: {
    color: COLORS.primary,
    fontSize: FONT_SIZES.sm,
    fontWeight: "500",
  },

  // Delete
  deleteSection: { marginTop: SPACING.xl, paddingTop: SPACING.md },
  deleteDivider: {
    height: 1,
    backgroundColor: COLORS.error + "30",
    marginBottom: SPACING.lg,
  },
  deleteSectionTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: "600",
    color: COLORS.error,
    marginBottom: SPACING.xs,
  },
  deleteSectionDescription: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    lineHeight: 18,
    marginBottom: SPACING.md,
  },
  deleteAccountButton: {
    alignItems: "center",
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.error + "40",
    backgroundColor: COLORS.error + "10",
  },
  deleteAccountText: {
    color: COLORS.error,
    fontSize: FONT_SIZES.sm,
    fontWeight: "600",
  },
});
