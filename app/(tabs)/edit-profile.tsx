import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { COLORS } from "../../src/theme/colors";
import { RADIUS, SPACING } from "../../src/theme/spacing";
import { FONT_SIZES } from "../../src/theme/typography";
import { useEditProfile } from "../../src/viewmodels/useEditProfile";
import { Button } from "../../src/views/components/common/button";
import { Dropdown } from "../../src/views/components/common/dropdown";
import { Loading } from "../../src/views/components/common/loading";

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

          {/* Action Buttons */}
          <View style={styles.buttonContainer}>
            <Button
              title={vm.saving ? "Saving..." : "Save Changes"}
              onPress={vm.handleSave}
              disabled={!vm.isValid || !vm.hasChanges || vm.saving}
              loading={vm.saving}
              fullWidth
            />

            {vm.hasChanges && <View style={styles.spacerSm} />}

            {vm.hasChanges && (
              <Button
                title="Reset Changes"
                onPress={vm.handleReset}
                variant="outline"
                disabled={vm.saving}
                fullWidth
              />
            )}
          </View>

          {/* Changes Indicator */}
          {vm.hasChanges && (
            <View style={styles.changesIndicator}>
              <Text style={styles.changesText}>
                ✏️ You have unsaved changes
              </Text>
            </View>
          )}

          {/* Bottom Spacer */}
          <View style={styles.bottomSpacer} />
        </View>
      </ScrollView>
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
  buttonContainer: {
    marginTop: SPACING.xl,
  },
  spacerSm: {
    height: SPACING.sm,
  },
  changesIndicator: {
    marginTop: SPACING.md,
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
  bottomSpacer: {
    height: SPACING.xl * 2,
  },
});
