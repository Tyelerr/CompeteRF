// src/views/screens/auth/register.screen.tsx

import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useState } from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-aware-scroll-view";
import { useCheckUsername } from "../../../../hooks/use-profile";
import { supabase } from "../../../lib/supabase";
import { profileService } from "../../../models/services/profile.service";
import { useAuthContext } from "../../../providers/AuthProvider";
import { COLORS } from "../../../theme/colors";
import { SPACING } from "../../../theme/spacing";
import { FONT_SIZES } from "../../../theme/typography";
import { US_STATES } from "../../../utils/constants";
import { toTitleCase } from "../../../utils/helpers";
import { containsBadWord, isValidUsername } from "../../../utils/validation";
import { useAuthStore } from "../../../viewmodels/stores/auth.store";
import { Button } from "../../components/common/button";
import { Dropdown } from "../../components/common/dropdown";
import { Input } from "../../components/common/input";

// ─── Spacing constants ────────────────────────────────────────────────────────

const SECTION_GAP = 28; // above each section title
const FIELD_GAP = 18; // between every field group
const PASSWORD_GAP = 22; // between Password → Confirm Password

// ─── Data ─────────────────────────────────────────────────────────────────────

const IS_IOS = Platform.OS === "ios";

const GAME_OPTIONS = [
  "8-Ball",
  "9-Ball",
  "10-Ball",
  "One Pocket",
  "Straight Pool",
  "Banks",
  "Carom",
  "Snooker",
];

// ─── PasswordField ────────────────────────────────────────────────────────────
//
//  Inline password field built directly on TextInput rather than the shared
//  <Input> component. This is intentional: it's the only way to guarantee the
//  SHOW/HIDE toggle is flex-centered inside the input row on every device,
//  because absolute-positioning inside a third-party component whose internal
//  label height we cannot control is inherently fragile.
//
//  Visually it matches the app's Input component exactly:
//   - same label style (COLORS.text, FONT_SIZES.sm, fontWeight 500, mb 6)
//   - same input box (INPUT_BG, INPUT_RADIUS, INPUT_PADDING_V / H)
//   - same placeholder color (COLORS.textSecondary)
//   - same font size for typed text (FONT_SIZES.md)
//
//  If the shared Input component is ever updated (border, radius, bg color),
//  update the PW_ constants below to match.
//
const INPUT_BG = "#1C1C1C"; // match Input component background
const INPUT_RADIUS = 10; // match Input component border radius
const INPUT_PAD_V = 15; // vertical padding inside the box
const INPUT_PAD_H = 14; // horizontal padding inside the box
const PH_COLOR = "#555555"; // placeholder — dimmer than body text

type PasswordFieldProps = {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  visible: boolean;
  onToggleVisible: () => void;
};

const PasswordField = ({
  label,
  value,
  onChangeText,
  placeholder,
  visible,
  onToggleVisible,
}: PasswordFieldProps) => (
  <View>
    <Text style={pwStyles.label}>{label}</Text>
    {/* Row: TextInput + SHOW/HIDE button are flex siblings → perfect centering */}
    <View style={pwStyles.row}>
      <TextInput
        style={pwStyles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={PH_COLOR}
        secureTextEntry={!visible}
        autoCapitalize="none"
        autoComplete="off"
        // "oneTimeCode" is a deliberate workaround: it suppresses iOS's
        // "Use Strong Password" prompt which fires for any secureTextEntry
        // field near an email field, even with textContentType="none".
        textContentType={IS_IOS ? "oneTimeCode" : "none"}
      />
      <Pressable style={pwStyles.toggle} onPress={onToggleVisible} hitSlop={12}>
        <Text style={pwStyles.toggleText}>{visible ? "HIDE" : "SHOW"}</Text>
      </Pressable>
    </View>
  </View>
);

const pwStyles = StyleSheet.create({
  label: {
    fontSize: FONT_SIZES.sm,
    fontWeight: "500",
    color: COLORS.text,
    marginBottom: 6,
  },
  // The row IS the input box — it wraps both the TextInput and the toggle.
  // alignItems: "center" vertically centers both children in the box.
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: INPUT_BG,
    borderRadius: INPUT_RADIUS,
    paddingVertical: INPUT_PAD_V,
    paddingLeft: INPUT_PAD_H,
    paddingRight: 8, // tighter right pad so toggle button fills the gap
  },
  input: {
    flex: 1,
    fontSize: FONT_SIZES.md,
    color: COLORS.text,
    // Remove default TextInput padding so it sits flush in the row
    padding: 0,
    margin: 0,
  },
  // Toggle sits flush on the right edge of the row, padded for tap target
  toggle: {
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  toggleText: {
    fontSize: 10,
    fontWeight: "600",
    color: "#888888",
    letterSpacing: 0.8,
  },
});

// ─── RegisterScreen ───────────────────────────────────────────────────────────

export const RegisterScreen = () => {
  const router = useRouter();
  const { refreshSession } = useAuthContext();

  // Auth fields
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

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

  // Username has its first letter capitalized on input — pass directly
  const { isAvailable, isChecking } = useCheckUsername(username);

  // ─── Derived ──────────────────────────────────────────────────────────────

  const passwordsMatch = password === confirmPassword;

  // Email: show hint once the field is long enough to know @ is missing
  // (avoids firing while the user is still typing the local-part)
  const showEmailHint = email.length >= 6 && !email.includes("@");

  // Password length hint fires while actively too short
  const showPasswordHint = password.length > 0 && password.length < 8;

  // Mismatch: only flag once confirm is as long as password (not mid-entry)
  const showPasswordMismatch =
    confirmPassword.length > 0 &&
    confirmPassword.length >= password.length &&
    !passwordsMatch;

  // Positive confirmation: both fields match and password is long enough
  const showPasswordMatch =
    confirmPassword.length > 0 &&
    confirmPassword.length >= password.length &&
    passwordsMatch &&
    password.length >= 8;

  // ─── Validation ───────────────────────────────────────────────────────────

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
      setError("Username must be 3–20 letters or numbers");
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

  // ─── Submit ───────────────────────────────────────────────────────────────

  const handleRegister = async () => {
    if (!validateForm()) return;
    setLoading(true);
    try {
      const { data: authData, error: signUpError } = await supabase.auth.signUp(
        { email, password },
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

      await profileService.createProfile({
        id: authData.user.id,
        email: authData.user.email!,
        name: `${trimmedFirst} ${trimmedLast}`,
        first_name: trimmedFirst,
        last_name: trimmedLast,
        user_name: username,
        home_state: homeState,
        preferred_game: preferredGame || undefined,
        favorite_player: favoritePlayer || undefined,
      });

      // Poll until profile is confirmed in DB (max 10s)
      let attempts = 0;
      let profileFound = false;
      while (attempts < 10 && !profileFound) {
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

      // Hydrate the store with the freshly created profile.
      // We pass authData.user.id directly because the `user` React state
      // inside AuthProvider hasn't updated yet (stale closure on signup).
      try {
        await refreshSession(authData.user.id);
      } catch (refreshErr) {
        console.warn("refreshSession after register failed:", refreshErr);
      }

      // Wait until the Zustand store has a non-null profile before navigating.
      // We use a Zustand subscription rather than polling — it resolves the
      // instant the store profile changes to non-null, with no missed updates
      // and no fixed interval delay. A 5s safety timeout prevents blocking
      // forever if something unexpected goes wrong.
      await new Promise<void>((resolve) => {
        if (useAuthStore.getState().profile) {
          resolve();
          return;
        }
        const timeout = setTimeout(resolve, 5000);
        const unsub = useAuthStore.subscribe((state) => {
          if (state.profile) {
            clearTimeout(timeout);
            unsub();
            resolve();
          }
        });
      });

      router.replace("/(tabs)");
    } catch (err: any) {
      setError(err.message || "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  // ─── Helpers ──────────────────────────────────────────────────────────────

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

  const isFormValid = !!(
    email &&
    password &&
    confirmPassword &&
    passwordsMatch &&
    password.length >= 8 &&
    firstName.trim() &&
    lastName.trim() &&
    username &&
    username.length >= 3 &&
    homeState &&
    agreeTerms &&
    agreeAge &&
    isAvailable &&
    !isChecking
  );

  const usernameHelper = getUsernameHelper();

  // ─── Loading ──────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingTitle}>Creating Your Account</Text>
        <Text style={styles.loadingSubtitle}>Setting up your profile…</Text>
        <Text style={styles.loadingIcon}>{"\u23F3"}</Text>
      </View>
    );
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <KeyboardAwareScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      enableOnAndroid
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      enableResetScrollToCoords={false}
      extraScrollHeight={20}
    >
      {/* Back */}
      <TouchableOpacity onPress={() => router.back()} style={styles.back}>
        <Text style={styles.backText}>{"\u2190"} Back</Text>
      </TouchableOpacity>

      {/* Header */}
      <Text style={styles.title}>CREATE ACCOUNT</Text>
      <Text style={styles.subtitle}>Complete registration in one step</Text>

      <View style={styles.form}>
        {/* ══ ACCOUNT ══════════════════════════════════════════════════════ */}

        <Text style={[styles.sectionTitle, styles.sectionTitleFirst]}>
          Account
        </Text>

        {/* Email */}
        <View style={styles.fieldGroup}>
          <Input
            label="Email"
            value={email}
            onChangeText={setEmail}
            placeholder="your@email.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            textContentType="emailAddress"
          />
          {showEmailHint && (
            <Text style={[styles.fieldHint, styles.fieldHintError]}>
              Enter a valid email address
            </Text>
          )}
        </View>

        {/* Password — uses PasswordField (inline TextInput) so SHOW/HIDE
            is a true flex sibling of the input and centers perfectly      */}
        <View style={{ marginBottom: PASSWORD_GAP }}>
          <PasswordField
            label="Password"
            value={password}
            onChangeText={setPassword}
            placeholder="At least 8 characters"
            visible={showPassword}
            onToggleVisible={() => setShowPassword((v) => !v)}
          />
          {showPasswordHint && (
            <Text style={styles.fieldHint}>Must be at least 8 characters</Text>
          )}
        </View>

        {/* Confirm Password */}
        <View style={styles.fieldGroup}>
          <PasswordField
            label="Confirm Password"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            placeholder="Re-enter your password"
            visible={showConfirmPassword}
            onToggleVisible={() => setShowConfirmPassword((v) => !v)}
          />
          {showPasswordMismatch && (
            <Text style={[styles.fieldHint, styles.fieldHintError]}>
              Passwords do not match
            </Text>
          )}
          {showPasswordMatch && (
            <Text style={[styles.fieldHint, styles.fieldHintSuccess]}>
              ✓ Passwords match
            </Text>
          )}
        </View>

        {/* ══ PROFILE ══════════════════════════════════════════════════════ */}

        <Text style={styles.sectionTitle}>Profile</Text>

        {/* First Name + Last Name — side by side */}
        <View style={[styles.fieldGroup, styles.nameRow]}>
          <View style={styles.nameField}>
            <Input
              label="First Name"
              value={firstName}
              onChangeText={setFirstName}
              placeholder="First"
              autoCapitalize="words"
              textContentType={IS_IOS ? "givenName" : undefined}
              autoComplete="given-name"
            />
          </View>
          <View style={styles.nameField}>
            <Input
              label="Last Name"
              value={lastName}
              onChangeText={setLastName}
              placeholder="Last"
              autoCapitalize="words"
              textContentType={IS_IOS ? "familyName" : undefined}
              autoComplete="family-name"
            />
          </View>
        </View>

        {/* Username */}
        <View style={styles.fieldGroup}>
          <Input
            label="Username"
            value={username}
            onChangeText={(text) => {
              // Strip anything that isn't a letter or digit before capitalizing,
              // so the user never hits the validation error silently.
              const clean = text.replace(/[^a-zA-Z0-9]/g, "");
              setUsername(clean.charAt(0).toUpperCase() + clean.slice(1));
            }}
            placeholder="Username"
            autoCapitalize="sentences"
            textContentType={IS_IOS ? "nickname" : undefined}
            autoComplete="username-new"
          />
          {username.length > 0 && (
            <Text style={[styles.fieldHint, { color: usernameHelper.color }]}>
              {usernameHelper.text}
            </Text>
          )}
        </View>

        {/* Home State */}
        <View style={styles.fieldGroup}>
          <Dropdown
            label="Home State"
            placeholder="Select your state"
            options={US_STATES}
            value={homeState}
            onSelect={setHomeState}
          />
        </View>

        {/* Preferred Game — chip selector */}
        <View style={styles.fieldGroup}>
          <Text style={styles.chipLabel}>Preferred Game</Text>
          <View style={styles.chipsRow}>
            {GAME_OPTIONS.map((game) => {
              const selected = preferredGame === game;
              return (
                <Pressable
                  key={game}
                  style={[styles.chip, selected && styles.chipSelected]}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setPreferredGame(selected ? "" : game);
                  }}
                >
                  <Text
                    style={[
                      styles.chipText,
                      selected && styles.chipTextSelected,
                    ]}
                  >
                    {game}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Favorite Player */}
        <View style={styles.fieldGroup}>
          <Input
            label="Favorite Player"
            value={favoritePlayer}
            onChangeText={setFavoritePlayer}
            placeholder="Your Favorite Player (optional)"
            autoCapitalize="words"
          />
        </View>

        {/* ══ TERMS ════════════════════════════════════════════════════════ */}

        <Text style={styles.sectionTitle}>Terms & Conditions</Text>

        <Pressable
          style={styles.checkboxRow}
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
          style={[styles.checkboxRow, styles.checkboxRowLast]}
          onPress={() => setAgreeAge(!agreeAge)}
        >
          <View
            style={[styles.checkboxBox, agreeAge && styles.checkboxBoxChecked]}
          >
            {agreeAge && <Text style={styles.checkboxCheck}>{"\u2713"}</Text>}
          </View>
          <Text style={styles.checkboxText}>I am 18 years or older</Text>
        </Pressable>

        {/* Error banner */}
        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        {/* CTA */}
        <View style={styles.ctaWrapper}>
          <Button
            title="Create Account & Complete Setup"
            onPress={handleRegister}
            loading={loading}
            disabled={!isFormValid}
            fullWidth
          />
        </View>
      </View>

      {/* Log In link */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>Already have an account? </Text>
        <TouchableOpacity onPress={() => router.push("/auth/login")}>
          <Text style={styles.footerLink}>Log In</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAwareScrollView>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // ── Containers ────────────────────────────────────────────────────────────

  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scrollContent: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.xl * 2,
  },

  // ── Loading ───────────────────────────────────────────────────────────────

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
  loadingIcon: {
    fontSize: 40,
    textAlign: "center",
  },

  // ── Header ────────────────────────────────────────────────────────────────

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
    marginBottom: 4,
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    marginBottom: SPACING.xl,
  },

  // ── Form ──────────────────────────────────────────────────────────────────

  form: {
    flex: 1,
  },
  fieldGroup: {
    marginBottom: FIELD_GAP,
  },

  // ── Section titles ────────────────────────────────────────────────────────

  sectionTitle: {
    fontSize: FONT_SIZES.xs,
    fontWeight: "700",
    color: COLORS.textSecondary,
    opacity: 0.55,
    letterSpacing: 0.7,
    textTransform: "uppercase",
    marginTop: SECTION_GAP,
    marginBottom: 16,
  },
  sectionTitleFirst: {
    marginTop: 0,
  },

  // ── Field hints ───────────────────────────────────────────────────────────

  fieldHint: {
    fontSize: FONT_SIZES.xs,
    marginTop: 5,
    marginLeft: 2,
    fontWeight: "500",
    color: COLORS.textSecondary,
  },
  fieldHintError: {
    color: "#EF4444",
  },
  fieldHintSuccess: {
    color: "#22C55E",
  },

  // ── Name row ──────────────────────────────────────────────────────────────

  nameRow: {
    flexDirection: "row",
    gap: 12,
  },
  nameField: {
    flex: 1,
  },

  // ── Preferred game chips ──────────────────────────────────────────────────

  chipLabel: {
    fontSize: FONT_SIZES.sm,
    fontWeight: "500",
    color: COLORS.textSecondary,
    marginBottom: 10,
  },
  chipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    columnGap: 8,
    rowGap: 9,
    alignItems: "flex-start",
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "#242424",
    borderWidth: 1.5,
    borderColor: "#383838",
  },
  chipSelected: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  chipText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: "500",
    color: "#888888",
  },
  chipTextSelected: {
    color: "#FFFFFF",
    fontWeight: "700",
  },

  // ── Terms & Conditions ────────────────────────────────────────────────────

  checkboxRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 14,
  },
  checkboxRowLast: {
    marginBottom: 0,
  },
  checkboxBox: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: COLORS.textSecondary,
    marginRight: 12,
    marginTop: 3,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  checkboxBoxChecked: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  checkboxCheck: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },
  checkboxText: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZES.sm,
    flex: 1,
    lineHeight: 22,
  },
  policyLink: {
    color: COLORS.primary,
    textDecorationLine: "underline",
    fontWeight: "600",
  },

  // ── Error ─────────────────────────────────────────────────────────────────

  errorText: {
    color: COLORS.error,
    fontSize: FONT_SIZES.sm,
    fontWeight: "500",
    marginTop: 16,
    marginBottom: 4,
  },

  // ── CTA ───────────────────────────────────────────────────────────────────

  ctaWrapper: {
    marginTop: 20,
  },

  // ── Footer ────────────────────────────────────────────────────────────────

  footer: {
    flexDirection: "row",
    justifyContent: "center",
    paddingTop: SPACING.xl,
    paddingBottom: SPACING.lg,
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
