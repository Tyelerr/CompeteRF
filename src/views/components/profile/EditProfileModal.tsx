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
import { moderateScale, scale } from "../../../utils/scaling";
import { useDeleteAccount } from "../../../viewmodels/hooks/use-delete-account";
import { useEditProfile } from "../../../viewmodels/useEditProfile";
import { Dropdown } from "../common/dropdown";
import { DeleteAccountModal } from "./DeleteAccountModal";

const isWeb = Platform.OS === "web";
const wxMs = (v: number) => isWeb ? v : moderateScale(v);
const wxSc = (v: number) => isWeb ? v : scale(v);

interface EditProfileModalProps {
  visible: boolean;
  onClose: () => void;
}

export function EditProfileModal({ visible, onClose }: EditProfileModalProps) {
  const vm = useEditProfile();
  const { modalVisible, confirmText, setConfirmText, deleting, isConfirmed, openModal, closeModal, handleDelete } = useDeleteAccount();

  if (!visible) return null;

  const handleClose = () => { onClose(); };

  const handleSaveAndClose = async () => {
    await vm.handleSave();
    if (!vm.error) onClose();
  };

  const innerContent = vm.loading ? (
    <View style={s.loadingWrap}>
      <ActivityIndicator size="large" color={COLORS.primary} />
      <Text allowFontScaling={false} style={s.loadingText}>Loading profile...</Text>
    </View>
  ) : (
    <>
      <View style={s.header}>
        <TouchableOpacity style={s.closeButton} onPress={handleClose}>
          <Text allowFontScaling={false} style={s.closeButtonText}>&#x2715;</Text>
        </TouchableOpacity>
        <Text allowFontScaling={false} style={s.headerTitle}>EDIT PROFILE</Text>
        <View style={{ width: 40 }} />
      </View>
      <View style={s.divider} />

      <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
        {vm.error ? (
          <View style={s.errorContainer}>
            <Text allowFontScaling={false} style={s.errorText}>{vm.error}</Text>
          </View>
        ) : null}

        <View style={s.avatarSection}>
          <TouchableOpacity onPress={vm.handlePickAvatar} disabled={vm.uploadingAvatar || vm.saving} style={s.avatarTouchable} activeOpacity={0.7}>
            {vm.uploadingAvatar ? (
              <View style={s.avatarContainer}><ActivityIndicator size="large" color={COLORS.primary} /></View>
            ) : vm.avatarUrl ? (
              <Image source={{ uri: vm.avatarUrl }} style={s.avatarImage} />
            ) : (
              <View style={s.avatarContainer}>
                <Text allowFontScaling={false} style={s.avatarPlaceholderIcon}>📷</Text>
                <Text allowFontScaling={false} style={s.avatarPlaceholderText}>Add Photo</Text>
              </View>
            )}
          </TouchableOpacity>
          <View style={s.avatarActions}>
            <TouchableOpacity onPress={vm.handlePickAvatar} disabled={vm.uploadingAvatar || vm.saving} style={s.avatarActionButton}>
              <Text allowFontScaling={false} style={s.avatarActionText}>{vm.avatarUrl ? "Change Photo" : "Upload Photo"}</Text>
            </TouchableOpacity>
            {vm.avatarUrl && (
              <TouchableOpacity onPress={vm.handleRemoveAvatar} disabled={vm.uploadingAvatar || vm.saving} style={s.avatarActionButton}>
                <Text allowFontScaling={false} style={s.avatarRemoveText}>Remove</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        <View style={s.form}>
          {vm.username ? (
            <View style={s.fieldContainer}>
              <Text allowFontScaling={false} style={s.fieldLabel}>Username</Text>
              <TextInput allowFontScaling={false} style={[s.textInput, s.disabledInput]} value={"@" + vm.username.charAt(0).toUpperCase() + vm.username.slice(1).toLowerCase()} editable={false} />
              <Text allowFontScaling={false} style={s.disabledHint}>Username cannot be changed</Text>
            </View>
          ) : null}

          <View style={s.nameRow}>
            <View style={s.nameField}>
              <View style={s.fieldContainer}>
                <Text allowFontScaling={false} style={s.fieldLabel}>First Name <Text style={s.required}>*</Text></Text>
                <TextInput allowFontScaling={false} style={[s.textInput, !vm.profileData.first_name.trim() && vm.profileData.first_name.length > 0 && s.inputError]} placeholder="First Name" placeholderTextColor={COLORS.textMuted} value={vm.profileData.first_name} onChangeText={(v) => vm.updateField("first_name", v)} editable={!vm.saving} autoCapitalize="words" autoCorrect={false} />
              </View>
            </View>
            <View style={s.nameField}>
              <View style={s.fieldContainer}>
                <Text allowFontScaling={false} style={s.fieldLabel}>Last Name <Text style={s.required}>*</Text></Text>
                <TextInput allowFontScaling={false} style={[s.textInput, !vm.profileData.last_name.trim() && vm.profileData.last_name.length > 0 && s.inputError]} placeholder="Last Name" placeholderTextColor={COLORS.textMuted} value={vm.profileData.last_name} onChangeText={(v) => vm.updateField("last_name", v)} editable={!vm.saving} autoCapitalize="words" autoCorrect={false} />
              </View>
            </View>
          </View>
          {!vm.isValid && (vm.profileData.first_name.length > 0 || vm.profileData.last_name.length > 0) && (
            <Text allowFontScaling={false} style={s.fieldError}>Both first and last name are required</Text>
          )}

          <View style={s.fieldContainer}>
            <Text allowFontScaling={false} style={s.fieldLabel}>Home State</Text>
            <Dropdown placeholder="Select your home state" options={vm.stateOptions} value={vm.profileData.home_state} onSelect={(v: string) => vm.updateField("home_state", v)} disabled={vm.saving} />
          </View>

          <View style={s.fieldContainer}>
            <Text allowFontScaling={false} style={s.fieldLabel}>Favorite Player</Text>
            <TextInput allowFontScaling={false} style={s.textInput} placeholder="Who's your favorite billiards player?" placeholderTextColor={COLORS.textMuted} value={vm.profileData.favorite_player} onChangeText={(v) => vm.updateField("favorite_player", v)} editable={!vm.saving} autoCapitalize="words" autoCorrect={false} />
          </View>

          <View style={s.fieldContainer}>
            <Text allowFontScaling={false} style={s.fieldLabel}>Favorite Game</Text>
            <Dropdown placeholder="Select your favorite billiards game" options={vm.gameOptions} value={vm.profileData.preferred_game} onSelect={(v: string) => vm.updateField("preferred_game", v)} disabled={vm.saving} />
          </View>

          <View style={s.infoContainer}>
            <Text allowFontScaling={false} style={s.infoIcon}>ℹ️</Text>
            <Text allowFontScaling={false} style={s.infoText}>First and last name are required. Other fields help personalize your experience.</Text>
          </View>
        </View>

        {vm.hasChanges && (
          <View style={s.changesIndicator}>
            <Text allowFontScaling={false} style={s.changesText}>✏️ You have unsaved changes</Text>
          </View>
        )}

        <View style={s.deleteSection}>
          <View style={s.deleteDivider} />
          <Text allowFontScaling={false} style={s.deleteSectionTitle}>Danger Zone</Text>
          <Text allowFontScaling={false} style={s.deleteSectionDescription}>Permanently delete your account and all associated data. This action cannot be undone.</Text>
          <TouchableOpacity style={s.deleteAccountButton} onPress={openModal}>
            <Text allowFontScaling={false} style={s.deleteAccountText}>Delete Account</Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: wxSc(SPACING.xl) }} />
      </ScrollView>

      <View style={s.divider} />
      <View style={s.footer}>
        <TouchableOpacity style={[s.saveButton, (!vm.isValid || !vm.hasChanges || vm.saving) && s.buttonDisabled]} onPress={handleSaveAndClose} disabled={!vm.isValid || !vm.hasChanges || vm.saving}>
          {vm.saving ? <ActivityIndicator size="small" color={COLORS.white} /> : <Text allowFontScaling={false} style={s.saveButtonText}>Save Changes</Text>}
        </TouchableOpacity>
        <TouchableOpacity style={s.cancelButton} onPress={handleClose} disabled={vm.saving}>
          <Text allowFontScaling={false} style={s.cancelButtonText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </>
  );

  if (isWeb) {
    return (
      <>
        <TouchableOpacity style={s.backdrop} activeOpacity={1} onPress={handleClose} />
        <View style={s.dialogWrap} pointerEvents="box-none">
          <View style={s.dialog}>{innerContent}</View>
        </View>
        <DeleteAccountModal visible={modalVisible} confirmText={confirmText} onChangeConfirmText={setConfirmText} isConfirmed={isConfirmed} deleting={deleting} onCancel={closeModal} onDelete={handleDelete} />
      </>
    );
  }

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={handleClose}>
      <View style={s.mobileOverlay}>
        <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={handleClose} />
        <View style={s.mobileContainer}>{innerContent}</View>
      </View>
      <DeleteAccountModal visible={modalVisible} confirmText={confirmText} onChangeConfirmText={setConfirmText} isConfirmed={isConfirmed} deleting={deleting} onCancel={closeModal} onDelete={handleDelete} />
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { position: "fixed" as any, top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.75)", zIndex: 2000 },
  dialogWrap: { position: "fixed" as any, top: 0, left: 0, right: 0, bottom: 0, zIndex: 2001, alignItems: "center", justifyContent: "center", padding: 24 },
  dialog: { width: 700, maxWidth: "92%" as any, height: "82vh" as any, backgroundColor: COLORS.black, borderRadius: RADIUS.xl, borderWidth: 1, borderColor: COLORS.border, overflow: "hidden" as any, shadowColor: COLORS.black, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.5, shadowRadius: 24, display: "flex" as any, flexDirection: "column" },
  mobileOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.75)", justifyContent: "center", alignItems: "center", paddingHorizontal: wxSc(24), paddingTop: wxSc(60), paddingBottom: wxSc(100) },
  mobileContainer: { backgroundColor: COLORS.background, borderRadius: wxSc(20), width: "100%" as any, maxWidth: 500, height: "82%" as any, overflow: "hidden" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: wxSc(SPACING.lg), paddingTop: wxSc(SPACING.lg), paddingBottom: wxSc(SPACING.md) },
  closeButton: { width: 40, height: 40, justifyContent: "center", alignItems: "center" },
  closeButtonText: { color: COLORS.text, fontSize: wxMs(20), fontWeight: "700" },
  headerTitle: { color: COLORS.text, fontSize: wxMs(FONT_SIZES.lg), fontWeight: "700", letterSpacing: 1 },
  divider: { height: 1, backgroundColor: COLORS.border },
  scroll: { flex: 1, minHeight: 0 },
  scrollContent: { padding: wxSc(SPACING.md) },
  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: wxSc(SPACING.xl) },
  loadingText: { color: COLORS.textSecondary, fontSize: wxMs(FONT_SIZES.md), marginTop: wxSc(SPACING.md) },
  footer: { flexDirection: "row", gap: wxSc(SPACING.sm), padding: wxSc(SPACING.md) },
  saveButton: { flex: 1, paddingVertical: wxSc(SPACING.md), borderRadius: RADIUS.md, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.primary },
  saveButtonText: { fontSize: wxMs(FONT_SIZES.md), color: COLORS.white, fontWeight: "600" },
  cancelButton: { flex: 1, paddingVertical: wxSc(SPACING.md), borderRadius: RADIUS.md, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  cancelButtonText: { fontSize: wxMs(FONT_SIZES.md), color: COLORS.text, fontWeight: "600" },
  buttonDisabled: { opacity: 0.5 },
  errorContainer: { backgroundColor: COLORS.error + "20", borderColor: COLORS.error, borderWidth: 1, borderRadius: RADIUS.md, padding: wxSc(SPACING.md), marginBottom: wxSc(SPACING.md) },
  errorText: { color: COLORS.error, fontSize: wxMs(FONT_SIZES.sm), textAlign: "center" },
  avatarSection: { alignItems: "center", marginBottom: wxSc(SPACING.lg), paddingVertical: wxSc(SPACING.md) },
  avatarTouchable: { marginBottom: wxSc(SPACING.sm) },
  avatarImage: { width: wxSc(120), height: wxSc(120), borderRadius: wxSc(60), borderWidth: 3, borderColor: COLORS.primary },
  avatarContainer: { width: wxSc(120), height: wxSc(120), borderRadius: wxSc(60), backgroundColor: COLORS.surface, borderWidth: 2, borderColor: COLORS.border, borderStyle: "dashed", justifyContent: "center", alignItems: "center" },
  avatarPlaceholderIcon: { fontSize: wxMs(32), marginBottom: wxSc(SPACING.xs) },
  avatarPlaceholderText: { fontSize: wxMs(FONT_SIZES.xs), color: COLORS.textSecondary, fontWeight: "500" },
  avatarActions: { flexDirection: "row", gap: wxSc(SPACING.md), marginTop: wxSc(SPACING.xs) },
  avatarActionButton: { paddingVertical: wxSc(SPACING.xs), paddingHorizontal: wxSc(SPACING.sm) },
  avatarActionText: { color: COLORS.primary, fontSize: wxMs(FONT_SIZES.sm), fontWeight: "600" },
  avatarRemoveText: { color: COLORS.error, fontSize: wxMs(FONT_SIZES.sm), fontWeight: "600" },
  form: { gap: wxSc(SPACING.lg) },
  nameRow: { flexDirection: "row", gap: wxSc(SPACING.sm) },
  nameField: { flex: 1 },
  fieldContainer: { gap: wxSc(SPACING.sm) },
  fieldLabel: { fontSize: wxMs(FONT_SIZES.sm), color: COLORS.text, fontWeight: "500" },
  required: { color: COLORS.error },
  textInput: { backgroundColor: COLORS.surface, borderColor: COLORS.border, borderWidth: 1, borderRadius: RADIUS.md, paddingVertical: wxSc(SPACING.md), paddingHorizontal: wxSc(SPACING.md), fontSize: wxMs(FONT_SIZES.md), color: COLORS.text },
  disabledInput: { opacity: 0.5, color: COLORS.textMuted },
  disabledHint: { fontSize: wxMs(FONT_SIZES.xs), color: COLORS.textMuted, marginTop: -wxSc(SPACING.xs) },
  inputError: { borderColor: COLORS.error, backgroundColor: COLORS.error + "10" },
  fieldError: { color: COLORS.error, fontSize: wxMs(FONT_SIZES.xs), marginTop: -wxSc(SPACING.sm) },
  infoContainer: { flexDirection: "row", backgroundColor: COLORS.surface, borderRadius: RADIUS.md, padding: wxSc(SPACING.md), borderWidth: 1, borderColor: COLORS.border, alignItems: "flex-start" },
  infoIcon: { fontSize: wxMs(FONT_SIZES.md), marginRight: wxSc(SPACING.sm), marginTop: 2 },
  infoText: { flex: 1, fontSize: wxMs(FONT_SIZES.sm), color: COLORS.textSecondary, lineHeight: wxMs(18) },
  changesIndicator: { marginTop: wxSc(SPACING.lg), backgroundColor: COLORS.primary + "20", borderColor: COLORS.primary, borderWidth: 1, borderRadius: RADIUS.md, padding: wxSc(SPACING.sm), alignItems: "center" },
  changesText: { color: COLORS.primary, fontSize: wxMs(FONT_SIZES.sm), fontWeight: "500" },
  deleteSection: { marginTop: wxSc(SPACING.xl), paddingTop: wxSc(SPACING.md) },
  deleteDivider: { height: 1, backgroundColor: COLORS.error + "30", marginBottom: wxSc(SPACING.lg) },
  deleteSectionTitle: { fontSize: wxMs(FONT_SIZES.md), fontWeight: "600", color: COLORS.error, marginBottom: wxSc(SPACING.xs) },
  deleteSectionDescription: { fontSize: wxMs(FONT_SIZES.sm), color: COLORS.textSecondary, lineHeight: wxMs(18), marginBottom: wxSc(SPACING.md) },
  deleteAccountButton: { alignItems: "center", paddingVertical: wxSc(SPACING.md), borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.error + "40", backgroundColor: COLORS.error + "10" },
  deleteAccountText: { color: COLORS.error, fontSize: wxMs(FONT_SIZES.sm), fontWeight: "600" },
});
