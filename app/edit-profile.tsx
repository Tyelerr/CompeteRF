import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { COLORS } from "../src/theme/colors";
import { RADIUS, SPACING } from "../src/theme/spacing";
import { FONT_SIZES } from "../src/theme/typography";
import { useEditProfile } from "../src/viewmodels/useEditProfile";
import { Dropdown } from "../src/views/components/common/dropdown";
import { Loading } from "../src/views/components/common/loading";

export default function EditProfileScreen() {
  const vm = useEditProfile();

  if (vm.loading) {
    return <Loading fullScreen message="Loading profile..." />;
  }

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContentContainer}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={vm.goBack} style={styles.backButton}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>EDIT PROFILE</Text>
          <Text style={styles.headerSubtitle}>
            Update your profile information
          </Text>
        </View>

        <View style={styles.content}>
          {/* Error Message */}
          {vm.error ? (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>{vm.error}</Text>
            </View>
          ) : null}

          {/* Avatar Section */}
          <View style={styles.avatarSection}>
            <TouchableOpacity
              onPress={vm.handlePickAvatar}
              disabled={vm.uploadingAvatar || vm.saving}
              style={styles.avatarTouchable}
              activeOpacity={0.7}
            >
              {vm.uploadingAvatar ? (
                <View style={styles.avatarContainer}>
                  <ActivityIndicator size="large" color={COLORS.primary} />
                </View>
              ) : vm.avatarUrl ? (
                <Image
                  source={{ uri: vm.avatarUrl }}
                  style={styles.avatarImage}
                />
              ) : (
                <View style={styles.avatarContainer}>
                  <Text style={styles.avatarPlaceholderIcon}>📷</Text>
                  <Text style={styles.avatarPlaceholderText}>Add Photo</Text>
                </View>
              )}
            </TouchableOpacity>

            <View style={styles.avatarActions}>
              <TouchableOpacity
                onPress={vm.handlePickAvatar}
                disabled={vm.uploadingAvatar || vm.saving}
                style={styles.avatarActionButton}
              >
                <Text style={styles.avatarActionText}>
                  {vm.avatarUrl ? "Change Photo" : "Upload Photo"}
                </Text>
              </TouchableOpacity>

              {vm.avatarUrl && (
                <TouchableOpacity
                  onPress={vm.handleRemoveAvatar}
                  disabled={vm.uploadingAvatar || vm.saving}
                  style={styles.avatarActionButton}
                >
                  <Text style={styles.avatarRemoveText}>Remove</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Form */}
          <View style={styles.form}>
            {/* Name Field - Required */}
            <View style={styles.fieldContainer}>
              <Text style={styles.fieldLabel}>
                Full Name <Text style={styles.required}>*</Text>
              </Text>
              <TextInput
                style={[
                  styles.textInput,
                  !vm.isValid &&
                    vm.profileData.name.length > 0 &&
                    styles.inputError,
                ]}
                placeholder="Enter your full name"
                placeholderTextColor={COLORS.textMuted}
                value={vm.profileData.name}
                onChangeText={(value) => vm.updateField("name", value)}
                editable={!vm.saving}
                autoCapitalize="words"
                autoCorrect={false}
              />
              {!vm.isValid && vm.profileData.name.length > 0 && (
                <Text style={styles.fieldError}>
                  Name must be at least 2 characters
                </Text>
              )}
            </View>

            {/* Home State Field */}
            <View style={styles.fieldContainer}>
              <Text style={styles.fieldLabel}>Home State</Text>
              <Dropdown
                placeholder="Select your home state"
                options={vm.stateOptions}
                value={vm.profileData.home_state}
                onSelect={(value: string) =>
                  vm.updateField("home_state", value)
                }
                disabled={vm.saving}
              />
            </View>

            {/* Favorite Player Field */}
            <View style={styles.fieldContainer}>
              <Text style={styles.fieldLabel}>Favorite Player</Text>
              <TextInput
                style={styles.textInput}
                placeholder="Who's your favorite billiards player?"
                placeholderTextColor={COLORS.textMuted}
                value={vm.profileData.favorite_player}
                onChangeText={(value) =>
                  vm.updateField("favorite_player", value)
                }
                editable={!vm.saving}
                autoCapitalize="words"
                autoCorrect={false}
              />
            </View>

            {/* Preferred Game Field */}
            <View style={styles.fieldContainer}>
              <Text style={styles.fieldLabel}>Favorite Game</Text>
              <Dropdown
                placeholder="Select your favorite billiards game"
                options={vm.gameOptions}
                value={vm.profileData.preferred_game}
                onSelect={(value: string) =>
                  vm.updateField("preferred_game", value)
                }
                disabled={vm.saving}
              />
            </View>

            {/* Info Note */}
            <View style={styles.infoContainer}>
              <Text style={styles.infoIcon}>ℹ️</Text>
              <Text style={styles.infoText}>
                Only your name is required. Other fields help personalize your
                experience.
              </Text>
            </View>
          </View>

          {/* Changes Indicator */}
          {vm.hasChanges && (
            <View style={styles.changesIndicator}>
              <Text style={styles.changesText}>
                ✏️ You have unsaved changes
              </Text>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Fixed Bottom Buttons */}
      <View style={styles.bottomBar}>
        <TouchableOpacity
          style={styles.cancelButton}
          onPress={vm.goBack}
          disabled={vm.saving}
        >
          <Text style={styles.cancelButtonText}>Cancel</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.saveButton,
            (!vm.isValid || !vm.hasChanges || vm.saving) &&
              styles.buttonDisabled,
          ]}
          onPress={vm.handleSave}
          disabled={!vm.isValid || !vm.hasChanges || vm.saving}
        >
          {vm.saving ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.saveButtonText}>Save Changes</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scrollContent: {
    flex: 1,
  },
  scrollContentContainer: {
    paddingBottom: SPACING.xl,
  },
  header: {
    padding: SPACING.md,
    paddingTop: SPACING.xl + SPACING.lg,
    alignItems: "center",
  },
  backButton: {
    alignSelf: "flex-start",
    paddingVertical: SPACING.sm,
    marginBottom: SPACING.md,
  },
  backText: {
    color: COLORS.primary,
    fontSize: FONT_SIZES.md,
  },
  headerTitle: {
    fontSize: FONT_SIZES.xl,
    fontWeight: "700",
    color: COLORS.text,
    textAlign: "center",
    marginBottom: SPACING.xs,
  },
  headerSubtitle: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    textAlign: "center",
    lineHeight: 20,
  },
  content: {
    padding: SPACING.md,
    paddingTop: 0,
  },
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
  // Avatar styles
  avatarSection: {
    alignItems: "center",
    marginBottom: SPACING.lg,
    paddingVertical: SPACING.md,
  },
  avatarTouchable: {
    marginBottom: SPACING.sm,
  },
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
  avatarPlaceholderIcon: {
    fontSize: 32,
    marginBottom: SPACING.xs,
  },
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
  // Form styles
  form: {
    gap: SPACING.lg,
  },
  fieldContainer: {
    gap: SPACING.sm,
  },
  fieldLabel: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.text,
    fontWeight: "500",
  },
  required: {
    color: COLORS.error,
  },
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
  inputError: {
    borderColor: COLORS.error,
    backgroundColor: COLORS.error + "10",
  },
  fieldError: {
    color: COLORS.error,
    fontSize: FONT_SIZES.xs,
    marginTop: SPACING.xs,
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
  infoIcon: {
    fontSize: FONT_SIZES.md,
    marginRight: SPACING.sm,
    marginTop: 2,
  },
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
  // Fixed bottom bar
  bottomBar: {
    flexDirection: "row",
    gap: SPACING.sm,
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.xl + SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    backgroundColor: COLORS.background,
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
    color: "#fff",
    fontWeight: "600",
  },
  buttonDisabled: {
    opacity: 0.5,
  },
});
