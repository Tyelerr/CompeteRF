// src/views/screens/auth/complete-profile.screen.tsx
// ═══════════════════════════════════════════════════════════
// Profile completion for Apple Sign In users.
// Collects required profile fields (no email/password needed).
// ═══════════════════════════════════════════════════════════

import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-aware-scroll-view";
import { useCheckUsername } from "../../../../hooks/use-profile";
import { supabase } from "../../../lib/supabase";
import { profileService } from "../../../models/services/profile.service";
import { COLORS } from "../../../theme/colors";
import { SPACING } from "../../../theme/spacing";
import { FONT_SIZES } from "../../../theme/typography";
import { US_STATES } from "../../../utils/constants";
import { toTitleCase } from "../../../utils/helpers";
import { containsBadWord, isValidUsername } from "../../../utils/validation";
import { Button } from "../../components/common/button";
import { Dropdown } from "../../components/common/dropdown";
import { Input } from "../../components/common/input";

export const CompleteProfileScreen = () => {
  const router = useRouter();
  const params = useLocalSearchParams<{
    firstName?: string;
    lastName?: string;
  }>();

  // Profile fields — pre-fill from Apple if available
  const [firstName, setFirstName] = useState(params.firstName || "");
  const [lastName, setLastName] = useState(params.lastName || "");
  const [username, setUsername] = useState("");
  const [homeState, setHomeState] = useState("");
  const [preferredGame, setPreferredGame] = useState("");
  const [favoritePlayer, setFavoritePlayer] = useState("");

  // Terms
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [agreeAge, setAgreeAge] = useState(false);

  // Form state
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Check username availability
  const { isAvailable, isChecking } = useCheckUsername(username.toLowerCase());

  const validateForm = () => {
    setError("");

    if (!firstName.trim()) {
      setError("Please enter your first name");
      return false;
    }

    if (!lastName.trim()) {
      setError("Please enter your last name");
      return false;
    }

    if (!isValidUsername(username)) {
      setError("Username must be 3-20 letters or numbers");
      return false;
    }

    if (containsBadWord(username)) {
      setError("This username is not allowed");
      return false;
    }

    if (!isAvailable) {
      setError("This username is already taken");
      return false;
    }

    if (!homeState) {
      setError("Please select your home state");
      return false;
    }

    if (!agreeTerms || !agreeAge) {
      setError("Please agree to the terms and confirm your age");
      return false;
    }

    return true;
  };

  const handleComplete = async () => {
    if (!validateForm()) return;

    setLoading(true);
    try {
      // Get the current authenticated user (from Apple Sign In)
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setError("Session expired. Please sign in again.");
        router.replace("/auth/login");
        return;
      }

      const trimmedFirst = toTitleCase(firstName.trim());
      const trimmedLast = toTitleCase(lastName.trim());

      const profileData = {
        id: user.id,
        email: user.email!,
        name: `${trimmedFirst} ${trimmedLast}`,
        first_name: trimmedFirst,
        last_name: trimmedLast,
        user_name: username.toLowerCase(),
        home_state: homeState,
        preferred_game: preferredGame || undefined,
        favorite_player: favoritePlayer || undefined,
      };

      await profileService.createProfile(profileData);

      // Wait for profile to be available (same pattern as register screen)
      let attempts = 0;
      const maxAttempts = 10;
      let profileFound = false;

      while (attempts < maxAttempts && !profileFound) {
        await new Promise((resolve) => setTimeout(resolve, 1000));

        try {
          const session = await supabase.auth.getSession();
          if (session.data.session?.user) {
            const profile = await profileService.getProfile(
              session.data.session.user.id,
            );
            if (profile) {
              profileFound = true;
              break;
            }
          }
        } catch {
          // Profile not ready yet, keep waiting
        }

        attempts++;
      }

      router.replace("/(tabs)");
    } catch (err: any) {
      setError(err.message || "Failed to create profile");
    } finally {
      setLoading(false);
    }
  };

  // Username helper
  const getUsernameHelper = () => {
    if (username.length < 3)
      return {
        text: "Username cannot be changed later",
        color: COLORS.textSecondary,
      };
    if (isChecking)
      return { text: "Checking availability...", color: COLORS.textSecondary };
    if (isAvailable)
      return { text: "\u2713 Username available", color: "#22C55E" };
    return { text: "\u2717 Username taken", color: "#EF4444" };
  };

  const isFormValid =
    firstName.trim() &&
    lastName.trim() &&
    username &&
    homeState &&
    agreeTerms &&
    agreeAge &&
    username.length >= 3 &&
    isAvailable &&
    !isChecking;

  const usernameHelper = getUsernameHelper();

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingTitle}>Setting Up Your Profile</Text>
        <Text style={styles.loadingSubtitle}>Almost there...</Text>
        <View style={styles.loadingSpinner}>
          <Text style={styles.loadingText}>{"\u23F3"}</Text>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAwareScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      enableOnAndroid={true}
      keyboardShouldPersistTaps="handled"
      extraScrollHeight={20}
    >
      <Text style={styles.title}>COMPLETE YOUR PROFILE</Text>
      <Text style={styles.subtitle}>
        Just a few more details to get you started
      </Text>

      <View style={styles.form}>
        <Text style={styles.sectionTitle}>Profile Information</Text>

        {/* First Name + Last Name side by side */}
        <View style={styles.nameRow}>
          <View style={styles.nameField}>
            <Input
              label="First Name *"
              value={firstName}
              onChangeText={setFirstName}
              placeholder="First Name"
              autoCapitalize="words"
            />
          </View>
          <View style={styles.nameField}>
            <Input
              label="Last Name *"
              value={lastName}
              onChangeText={setLastName}
              placeholder="Last Name"
              autoCapitalize="words"
            />
          </View>
        </View>

        {/* Username */}
        <View>
          <Input
            label="Username *"
            value={username}
            onChangeText={setUsername}
            placeholder="username"
            autoCapitalize="none"
          />
          {username.length > 0 && (
            <Text
              style={[styles.usernameHelper, { color: usernameHelper.color }]}
            >
              {usernameHelper.text}
            </Text>
          )}
        </View>

        <Dropdown
          label="Home State *"
          placeholder="Select State"
          options={US_STATES}
          value={homeState}
          onSelect={setHomeState}
        />

        <Input
          label="Preferred Game"
          value={preferredGame}
          onChangeText={setPreferredGame}
          placeholder="e.g., 8-Ball, 9-Ball (optional)"
          autoCapitalize="words"
        />

        <Input
          label="Favorite Player"
          value={favoritePlayer}
          onChangeText={setFavoritePlayer}
          placeholder="Your favorite pro player (optional)"
          autoCapitalize="words"
        />

        <Text style={styles.sectionTitle}>Terms & Conditions</Text>

        <Pressable
          style={styles.checkbox}
          onPress={() => setAgreeTerms(!agreeTerms)}
        >
          <View
            style={[
              styles.checkboxBox,
              agreeTerms && styles.checkboxBoxChecked,
            ]}
          >
            {agreeTerms && <Text style={styles.checkboxCheck}>{"\u2713"}</Text>}
          </View>
          <Text style={styles.checkboxText}>
            I agree to the{" "}
            <Text
              style={styles.policyLink}
              onPress={() => router.push("/legal/terms")}
            >
              Terms of Service
            </Text>
            ,{" "}
            <Text
              style={styles.policyLink}
              onPress={() => router.push("/legal/privacy")}
            >
              Privacy Policy
            </Text>
            , and{" "}
            <Text
              style={styles.policyLink}
              onPress={() => router.push("/legal/terms")}
            >
              Content Policy
            </Text>
          </Text>
        </Pressable>

        <Pressable
          style={styles.checkbox}
          onPress={() => setAgreeAge(!agreeAge)}
        >
          <View
            style={[styles.checkboxBox, agreeAge && styles.checkboxBoxChecked]}
          >
            {agreeAge && <Text style={styles.checkboxCheck}>{"\u2713"}</Text>}
          </View>
          <Text style={styles.checkboxText}>I am 18 years or older</Text>
        </Pressable>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Button
          title="Complete Setup"
          onPress={handleComplete}
          loading={loading}
          disabled={!isFormValid}
          fullWidth
        />
      </View>
    </KeyboardAwareScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scrollContent: {
    padding: SPACING.lg,
    paddingTop: SPACING.xl * 2,
    paddingBottom: SPACING.xl * 2,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: COLORS.background,
    justifyContent: "center",
    alignItems: "center",
    padding: SPACING.xl,
  },
  loadingTitle: {
    fontSize: FONT_SIZES.xl,
    fontWeight: "700",
    color: COLORS.text,
    marginBottom: SPACING.sm,
    textAlign: "center",
  },
  loadingSubtitle: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textSecondary,
    marginBottom: SPACING.xl,
    textAlign: "center",
  },
  loadingSpinner: {
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    fontSize: 40,
    marginBottom: SPACING.md,
  },
  title: {
    fontSize: FONT_SIZES.xxl,
    fontWeight: "700",
    color: COLORS.text,
    marginBottom: SPACING.sm,
  },
  subtitle: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textSecondary,
    marginBottom: SPACING.xl,
  },
  sectionTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: "600",
    color: COLORS.text,
    marginTop: SPACING.lg,
    marginBottom: SPACING.md,
  },
  form: {
    flex: 1,
  },
  nameRow: {
    flexDirection: "row",
    gap: SPACING.sm,
  },
  nameField: {
    flex: 1,
  },
  usernameHelper: {
    fontSize: FONT_SIZES.xs,
    marginTop: 4,
    marginLeft: 4,
    fontWeight: "500",
  },
  checkbox: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: SPACING.md,
    minHeight: 40,
  },
  checkboxBox: {
    width: 24,
    height: 24,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: COLORS.textSecondary,
    marginRight: SPACING.md,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxBoxChecked: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  checkboxCheck: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },
  checkboxText: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZES.sm,
    flex: 1,
    textAlignVertical: "center",
    lineHeight: 28,
  },
  policyLink: {
    color: COLORS.primary,
    textDecorationLine: "underline",
    fontWeight: "600",
  },
  error: {
    color: COLORS.error,
    fontSize: FONT_SIZES.sm,
    marginBottom: SPACING.md,
  },
});
