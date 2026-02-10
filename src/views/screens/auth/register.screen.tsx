// src/views/screens/auth/register.screen.tsx

import { useRouter } from "expo-router";
import { useCallback, useState } from "react";
import {
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
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

const IS_IOS = Platform.OS === "ios";

const PASSWORD_RULES =
  "minlength: 8; required: lower; required: upper; required: digit;";

export const RegisterScreen = () => {
  const router = useRouter();

  // Auth fields
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // Profile fields
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [username, setUsername] = useState("");
  const [homeState, setHomeState] = useState("");
  const [preferredGame, setPreferredGame] = useState("");
  const [favoritePlayer, setFavoritePlayer] = useState("");

  // Form state
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [agreeAge, setAgreeAge] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // iOS-only: toggle between strong password and manual entry.
  const [useAutoPassword, setUseAutoPassword] = useState(IS_IOS);
  const [formKey, setFormKey] = useState(() => Date.now());

  // Check availability using lowercase version
  const { isAvailable, isChecking } = useCheckUsername(username.toLowerCase());

  const togglePasswordMode = useCallback(() => {
    setPassword("");
    setConfirmPassword("");
    setUseAutoPassword((prev) => !prev);
    setFormKey(Date.now());
  }, []);

  const resetForm = useCallback(() => {
    setEmail("");
    setPassword("");
    setConfirmPassword("");
    setFirstName("");
    setLastName("");
    setUsername("");
    setHomeState("");
    setPreferredGame("");
    setFavoritePlayer("");
    setAgreeTerms(false);
    setAgreeAge(false);
    setError("");
    setUseAutoPassword(IS_IOS);
    setFormKey(Date.now());
  }, []);

  // Password mismatch check (only show after user starts typing confirm)
  const passwordsMatch = password === confirmPassword;
  const showPasswordMismatch = confirmPassword.length > 0 && !passwordsMatch;

  const validateForm = () => {
    setError("");

    if (!email.includes("@")) {
      setError("Please enter a valid email");
      return false;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return false;
    }

    if (!passwordsMatch) {
      setError("Passwords do not match");
      return false;
    }

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

  const handleRegister = async () => {
    if (!validateForm()) return;

    setLoading(true);
    try {
      const { data: authData, error: signUpError } = await supabase.auth.signUp(
        {
          email,
          password,
        },
      );

      if (signUpError) {
        setError(signUpError.message);
        return;
      }

      if (!authData.user) {
        setError("Account creation failed");
        return;
      }

      const trimmedFirst = toTitleCase(firstName.trim());
      const trimmedLast = toTitleCase(lastName.trim());

      const profileData = {
        id: authData.user.id,
        email: authData.user.email!,
        name: `${trimmedFirst} ${trimmedLast}`,
        first_name: trimmedFirst,
        last_name: trimmedLast,
        user_name: username.toLowerCase(), // always store lowercase
        home_state: homeState,
        preferred_game: preferredGame || undefined,
        favorite_player: favoritePlayer || undefined,
      };

      await profileService.createProfile(profileData);

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
        } catch (profileError) {
          console.log(
            `Profile check attempt ${attempts + 1} failed:`,
            profileError,
          );
        }

        attempts++;
      }

      router.replace("/(tabs)");
    } catch (err: any) {
      setError(err.message || "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  // Green/red username helper
  const getUsernameHelper = () => {
    if (username.length < 3)
      return {
        text: "Username cannot be changed later",
        color: COLORS.textSecondary,
      };
    if (isChecking)
      return { text: "Checking availability...", color: COLORS.textSecondary };
    if (isAvailable) return { text: "✓ Username available", color: "#22C55E" };
    return { text: "✗ Username taken", color: "#EF4444" };
  };

  const isFormValid =
    email &&
    password &&
    confirmPassword &&
    passwordsMatch &&
    firstName.trim() &&
    lastName.trim() &&
    username &&
    homeState &&
    agreeTerms &&
    agreeAge &&
    username.length >= 3 &&
    isAvailable &&
    !isChecking;

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingTitle}>Creating Your Account</Text>
        <Text style={styles.loadingSubtitle}>Setting up your profile...</Text>
        <View style={styles.loadingSpinner}>
          <Text style={styles.loadingText}>⏳</Text>
        </View>
      </View>
    );
  }

  const passwordProps = useAutoPassword
    ? {
        textContentType: "newPassword" as const,
        autoComplete: "new-password" as const,
        passwordRules: PASSWORD_RULES,
      }
    : {
        textContentType: "none" as const,
        autoComplete: "off" as const,
        passwordRules: undefined,
      };

  const usernameHelper = getUsernameHelper();

  return (
    <KeyboardAwareScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      enableOnAndroid={true}
      keyboardShouldPersistTaps="handled"
      extraScrollHeight={20}
    >
      <TouchableOpacity onPress={() => router.back()} style={styles.back}>
        <Text style={styles.backText}>← Back</Text>
      </TouchableOpacity>

      <Text style={styles.title}>CREATE ACCOUNT</Text>
      <Text style={styles.subtitle}>Complete registration in one step</Text>

      <View style={styles.form}>
        <Text style={styles.sectionTitle}>Account Information</Text>

        <Input
          label="Email *"
          value={email}
          onChangeText={setEmail}
          placeholder="your.email@example.com"
          keyboardType="email-address"
          autoCapitalize="none"
          textContentType={IS_IOS ? "username" : undefined}
          autoComplete="email"
        />

        <Input
          key={`password-${formKey}`}
          label="Password *"
          value={password}
          onChangeText={setPassword}
          placeholder={
            useAutoPassword
              ? "Tap to generate strong password"
              : "Enter your password"
          }
          secureTextEntry
          textContentType={passwordProps.textContentType}
          autoComplete={passwordProps.autoComplete}
          passwordRules={passwordProps.passwordRules}
          autoFillActive={useAutoPassword && password.length > 0}
        />

        {/* Confirm password with red border on mismatch */}
        <View>
          <Input
            key={`confirm-${formKey}`}
            label="Confirm Password *"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            placeholder={
              useAutoPassword
                ? "Auto-filled with strong password"
                : "Confirm your password"
            }
            secureTextEntry
            textContentType={passwordProps.textContentType}
            autoComplete={passwordProps.autoComplete}
            passwordRules={passwordProps.passwordRules}
            autoFillActive={useAutoPassword && confirmPassword.length > 0}
          />
          {showPasswordMismatch && (
            <Text style={styles.mismatchText}>Passwords do not match</Text>
          )}
        </View>

        {/* Only show the toggle on iOS */}
        {IS_IOS && (
          <TouchableOpacity
            onPress={togglePasswordMode}
            style={styles.toggleButton}
          >
            <Text style={styles.toggleText}>
              {useAutoPassword
                ? "✏️  Enter password manually instead"
                : "🔐  Use suggested strong password"}
            </Text>
          </TouchableOpacity>
        )}

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
              textContentType={IS_IOS ? "givenName" : undefined}
              autoComplete="given-name"
            />
          </View>
          <View style={styles.nameField}>
            <Input
              label="Last Name *"
              value={lastName}
              onChangeText={setLastName}
              placeholder="Last Name"
              autoCapitalize="words"
              textContentType={IS_IOS ? "familyName" : undefined}
              autoComplete="family-name"
            />
          </View>
        </View>

        {/* Username — user can type mixed case, stored as lowercase */}
        <View>
          <Input
            label="Username *"
            value={username}
            onChangeText={setUsername}
            placeholder="username"
            autoCapitalize="none"
            textContentType={IS_IOS ? "nickname" : undefined}
            autoComplete="username-new"
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

        <TouchableOpacity
          style={styles.checkbox}
          onPress={() => setAgreeTerms(!agreeTerms)}
        >
          <Text style={styles.checkboxIcon}>{agreeTerms ? "☑" : "☐"}</Text>
          <Text style={styles.checkboxText}>
            I agree to the Terms of Service and Privacy Policy
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.checkbox}
          onPress={() => setAgreeAge(!agreeAge)}
        >
          <Text style={styles.checkboxIcon}>{agreeAge ? "☑" : "☐"}</Text>
          <Text style={styles.checkboxText}>I am 18 years or older</Text>
        </TouchableOpacity>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Button
          title="Create Account & Complete Setup"
          onPress={handleRegister}
          loading={loading}
          disabled={!isFormValid}
          fullWidth
        />
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>Already have an account? </Text>
        <TouchableOpacity onPress={() => router.push("/auth/login")}>
          <Text style={styles.footerLink}>Log In</Text>
        </TouchableOpacity>
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
  back: {
    marginTop: SPACING.xl,
    marginBottom: SPACING.lg,
  },
  backText: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZES.md,
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
  inputError: {
    borderColor: "#EF4444",
    borderWidth: 1,
  },
  mismatchText: {
    color: "#EF4444",
    fontSize: FONT_SIZES.xs,
    marginTop: 4,
    marginLeft: 4,
    fontWeight: "500",
  },
  toggleButton: {
    paddingVertical: SPACING.xs,
    marginBottom: SPACING.sm,
  },
  toggleText: {
    color: COLORS.primary,
    fontSize: FONT_SIZES.sm,
    fontWeight: "500",
  },
  checkbox: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: SPACING.md,
  },
  checkboxIcon: {
    fontSize: 32,
    color: COLORS.primary,
    marginRight: SPACING.md,
  },
  checkboxText: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZES.sm,
    flex: 1,
    textAlignVertical: "center",
    lineHeight: 28,
  },
  error: {
    color: COLORS.error,
    fontSize: FONT_SIZES.sm,
    marginBottom: SPACING.md,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "center",
    paddingVertical: SPACING.xl,
  },
  footerText: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZES.md,
  },
  footerLink: {
    color: COLORS.primary,
    fontSize: FONT_SIZES.md,
    fontWeight: "600",
  },
});
