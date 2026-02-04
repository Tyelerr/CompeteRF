import { useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
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

export const RegisterScreen = () => {
  const router = useRouter();

  // Auth fields
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // Profile fields
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [homeState, setHomeState] = useState("");
  const [homeCity, setHomeCity] = useState("");
  const [zipCode, setZipCode] = useState("");
  const [preferredGame, setPreferredGame] = useState("");
  const [favoritePlayer, setFavoritePlayer] = useState("");

  // Form state
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [agreeAge, setAgreeAge] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const { isAvailable, isChecking } = useCheckUsername(username);

  const validateForm = () => {
    setError("");

    // Email validation
    if (!email.includes("@")) {
      setError("Please enter a valid email");
      return false;
    }

    // Password validation
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return false;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return false;
    }

    // Profile validation
    if (!name.trim()) {
      setError("Please enter your full name");
      return false;
    }

    if (!isValidUsername(username)) {
      setError("Username must be 3-20 letters only (no numbers)");
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

    // Terms validation
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
      // Step 1: Create auth account
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

      // Step 2: Create profile immediately
      const profileData = {
        id: authData.user.id,
        email: authData.user.email!,
        name: toTitleCase(name),
        user_name: username.toLowerCase(),
        home_state: homeState,
        home_city: homeCity || undefined,
        zip_code: zipCode || undefined,
        preferred_game: preferredGame || undefined,
        favorite_player: favoritePlayer || undefined,
      };

      await profileService.createProfile(profileData);

      // Step 3: Wait for profile to be available in auth context
      let attempts = 0;
      const maxAttempts = 10;
      let profileFound = false;

      while (attempts < maxAttempts && !profileFound) {
        await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait 1 second

        try {
          // Check if profile is now available
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
          // Continue trying
          console.log(
            `Profile check attempt ${attempts + 1} failed:`,
            profileError,
          );
        }

        attempts++;
      }

      // Step 4: Navigate to main app (profile should be loaded now)
      router.replace("/(tabs)");
    } catch (err: any) {
      setError(err.message || "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  const getUsernameHelper = () => {
    if (username.length < 3) return "Username cannot be changed later";
    if (isChecking) return "Checking availability...";
    if (isAvailable) return "✓ Username available";
    return "✗ Username taken";
  };

  const isFormValid =
    email &&
    password &&
    confirmPassword &&
    name &&
    username &&
    homeState &&
    agreeTerms &&
    agreeAge &&
    username.length >= 3 &&
    isAvailable &&
    !isChecking;

  // Show simple loading screen during registration
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
        {/* Account Information */}
        <Text style={styles.sectionTitle}>Account Information</Text>

        <Input
          label="Email *"
          value={email}
          onChangeText={setEmail}
          placeholder="your.email@example.com"
          keyboardType="email-address"
          autoCapitalize="none"
        />

        <Input
          label="Password *"
          value={password}
          onChangeText={setPassword}
          placeholder="••••••••"
          secureTextEntry
        />

        <Input
          label="Confirm Password *"
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          placeholder="••••••••"
          secureTextEntry
        />

        {/* Profile Information */}
        <Text style={styles.sectionTitle}>Profile Information</Text>

        <Input
          label="Full Name *"
          value={name}
          onChangeText={setName}
          placeholder="Your Full Name"
          autoCapitalize="words"
        />

        <Input
          label="Username *"
          value={username}
          onChangeText={(text) => setUsername(text.toLowerCase())}
          placeholder="username"
          autoCapitalize="none"
          helper={getUsernameHelper()}
        />

        <Dropdown
          label="Home State *"
          placeholder="Select State"
          options={US_STATES}
          value={homeState}
          onSelect={setHomeState}
        />

        <Input
          label="Home City"
          value={homeCity}
          onChangeText={setHomeCity}
          placeholder="City (optional)"
          autoCapitalize="words"
        />

        <Input
          label="Zip Code"
          value={zipCode}
          onChangeText={setZipCode}
          placeholder="12345 (optional)"
          keyboardType="numeric"
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

        {/* Terms */}
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
