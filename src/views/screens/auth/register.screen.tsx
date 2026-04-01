import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Platform, Pressable, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-aware-scroll-view";
import { useCheckUsername } from "../../../../hooks/use-profile";
import { supabase } from "../../../lib/supabase";
import { profileService } from "../../../models/services/profile.service";
import { useAuthContext } from "../../../providers/AuthProvider";
import { sendWelcomeEmail } from "../../../services/email/sendWelcomeEmail";
import { COLORS } from "../../../theme/colors";
import { SPACING } from "../../../theme/spacing";
import { FONT_SIZES } from "../../../theme/typography";
import { US_STATES } from "../../../utils/constants";
import { toTitleCase } from "../../../utils/helpers";
import { moderateScale, scale } from "../../../utils/scaling";
import { containsBadWord, isValidUsername } from "../../../utils/validation";
import { useAuthStore } from "../../../viewmodels/stores/auth.store";
import { Button } from "../../components/common/button";
import { Dropdown } from "../../components/common/dropdown";
import { Input } from "../../components/common/input";

const SECTION_GAP = 28;
const FIELD_GAP = 18;
const PASSWORD_GAP = 22;
const IS_IOS = Platform.OS === "ios";

const GAME_OPTIONS = ["8-Ball", "9-Ball", "10-Ball", "One Pocket", "Straight Pool", "Banks", "Carom", "Snooker"];

const INPUT_BG = "#1C1C1C";
const INPUT_RADIUS = 10;
const INPUT_PAD_V = 15;
const INPUT_PAD_H = 14;
const PH_COLOR = "#555555";

type PasswordFieldProps = {
  label: string; value: string; onChangeText: (text: string) => void;
  placeholder: string; visible: boolean; onToggleVisible: () => void;
};

const PasswordField = ({ label, value, onChangeText, placeholder, visible, onToggleVisible }: PasswordFieldProps) => (
  <View>
    <Text allowFontScaling={false} style={pwStyles.label}>{label}</Text>
    <View style={pwStyles.row}>
      <TextInput
        allowFontScaling={false}
        style={pwStyles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={PH_COLOR}
        secureTextEntry={!visible}
        autoCapitalize="none"
        autoComplete="off"
        textContentType={IS_IOS ? "oneTimeCode" : "none"}
      />
      <Pressable style={pwStyles.toggle} onPress={onToggleVisible} hitSlop={12}>
        <Text allowFontScaling={false} style={pwStyles.toggleText}>{visible ? "HIDE" : "SHOW"}</Text>
      </Pressable>
    </View>
  </View>
);

const pwStyles = StyleSheet.create({
  label: { fontSize: moderateScale(FONT_SIZES.sm), fontWeight: "500", color: COLORS.text, marginBottom: 6 },
  row: { flexDirection: "row", alignItems: "center", backgroundColor: INPUT_BG, borderRadius: INPUT_RADIUS, paddingVertical: INPUT_PAD_V, paddingLeft: INPUT_PAD_H, paddingRight: 8 },
  input: { flex: 1, fontSize: moderateScale(FONT_SIZES.md), color: COLORS.text, padding: 0, margin: 0 },
  toggle: { paddingHorizontal: 10, paddingVertical: 4 },
  toggleText: { fontSize: moderateScale(10), fontWeight: "600", color: "#888888", letterSpacing: 0.8 },
});

export const RegisterScreen = () => {
  const router = useRouter();
  const { refreshSession } = useAuthContext();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [username, setUsername] = useState("");
  const [homeState, setHomeState] = useState("");
  const [preferredGame, setPreferredGame] = useState("");
  const [favoritePlayer, setFavoritePlayer] = useState("");
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [agreeAge, setAgreeAge] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const { isAvailable, isChecking } = useCheckUsername(username);
  const passwordsMatch = password === confirmPassword;
  const showEmailHint = email.length >= 6 && !email.includes("@");
  const showPasswordHint = password.length > 0 && password.length < 8;
  const showPasswordMismatch = confirmPassword.length > 0 && confirmPassword.length >= password.length && !passwordsMatch;
  const showPasswordMatch = confirmPassword.length > 0 && confirmPassword.length >= password.length && passwordsMatch && password.length >= 8;

  const validateForm = () => {
    setError("");
    if (!email.includes("@")) { setError("Please enter a valid email"); return false; }
    if (password.length < 8) { setError("Password must be at least 8 characters"); return false; }
    if (!passwordsMatch) { setError("Passwords do not match"); return false; }
    if (!firstName.trim()) { setError("Please enter your first name"); return false; }
    if (!lastName.trim()) { setError("Please enter your last name"); return false; }
    if (!isValidUsername(username)) { setError("Username must be 3-20 letters or numbers"); return false; }
    if (containsBadWord(username)) { setError("This username is not allowed"); return false; }
    if (!isAvailable) { setError("This username is already taken"); return false; }
    if (!homeState) { setError("Please select your home state"); return false; }
    if (!agreeTerms || !agreeAge) { setError("Please agree to the terms and confirm your age"); return false; }
    return true;
  };

  const handleRegister = async () => {
    if (!validateForm()) return;
    setLoading(true);
    try {
      const { data: authData, error: signUpError } = await supabase.auth.signUp({ email, password });
      if (signUpError) { setError(signUpError.message); return; }
      if (!authData.user) { setError("Account creation failed"); return; }
      const trimmedFirst = toTitleCase(firstName.trim());
      const trimmedLast = toTitleCase(lastName.trim());
      await profileService.createProfile({ id: authData.user.id, email: authData.user.email!, name: `${trimmedFirst} ${trimmedLast}`, first_name: trimmedFirst, last_name: trimmedLast, user_name: username, home_state: homeState, preferred_game: preferredGame || undefined, favorite_player: favoritePlayer || undefined });

      // Fire-and-forget welcome email — never awaited, never blocks registration
      sendWelcomeEmail(authData.user.email!, trimmedFirst).catch((err) =>
        console.warn("[RegisterScreen] Welcome email failed silently:", err)
      );

      let attempts = 0;
      let profileFound = false;
      while (attempts < 10 && !profileFound) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        try {
          const session = await supabase.auth.getSession();
          if (session.data.session?.user) {
            const profile = await profileService.getProfile(session.data.session.user.id);
            if (profile) { profileFound = true; break; }
          }
        } catch (profileError) { console.log(`Profile check attempt ${attempts + 1} failed:`, profileError); }
        attempts++;
      }
      try { await refreshSession(authData.user.id); } catch (refreshErr) { console.warn("refreshSession after register failed:", refreshErr); }
      await new Promise<void>((resolve) => {
        if (useAuthStore.getState().profile) { resolve(); return; }
        const timeout = setTimeout(resolve, 5000);
        const unsub = useAuthStore.subscribe((state) => { if (state.profile) { clearTimeout(timeout); unsub(); resolve(); } });
      });
      router.replace("/(tabs)");
    } catch (err: any) {
      setError(err.message || "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  const getUsernameHelper = () => {
    if (username.length < 3) return { text: "Username cannot be changed later", color: COLORS.textSecondary };
    if (isChecking) return { text: "Checking availability...", color: COLORS.textSecondary };
    if (isAvailable) return { text: "Username available", color: "#22C55E" };
    return { text: "Username taken", color: "#EF4444" };
  };

  const isFormValid = !!(email && password && confirmPassword && passwordsMatch && password.length >= 8 && firstName.trim() && lastName.trim() && username && username.length >= 3 && homeState && agreeTerms && agreeAge && isAvailable && !isChecking);
  const usernameHelper = getUsernameHelper();

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <Text allowFontScaling={false} style={styles.loadingTitle}>Creating Your Account</Text>
        <Text allowFontScaling={false} style={styles.loadingSubtitle}>Setting up your profile...</Text>
        <Text allowFontScaling={false} style={styles.loadingIcon}>&#9203;</Text>
      </View>
    );
  }

  return (
    <KeyboardAwareScrollView style={styles.container} contentContainerStyle={styles.scrollContent} enableOnAndroid keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" enableResetScrollToCoords={false} extraScrollHeight={20}>
      <TouchableOpacity onPress={() => router.back()} style={styles.back}>
        <Text allowFontScaling={false} style={styles.backText}>Back</Text>
      </TouchableOpacity>
      <Text allowFontScaling={false} style={styles.title}>CREATE ACCOUNT</Text>
      <Text allowFontScaling={false} style={styles.subtitle}>Complete registration in one step</Text>

      <View style={styles.form}>
        <Text allowFontScaling={false} style={[styles.sectionTitle, styles.sectionTitleFirst]}>Account</Text>

        <View style={styles.fieldGroup}>
          <Input label="Email" value={email} onChangeText={setEmail} placeholder="your@email.com" keyboardType="email-address" autoCapitalize="none" autoComplete="email" textContentType="emailAddress" />
          {showEmailHint && <Text allowFontScaling={false} style={[styles.fieldHint, styles.fieldHintError]}>Enter a valid email address</Text>}
        </View>

        <View style={{ marginBottom: PASSWORD_GAP }}>
          <PasswordField label="Password" value={password} onChangeText={setPassword} placeholder="At least 8 characters" visible={showPassword} onToggleVisible={() => setShowPassword((v) => !v)} />
          {showPasswordHint && <Text allowFontScaling={false} style={styles.fieldHint}>Must be at least 8 characters</Text>}
        </View>

        <View style={styles.fieldGroup}>
          <PasswordField label="Confirm Password" value={confirmPassword} onChangeText={setConfirmPassword} placeholder="Re-enter your password" visible={showConfirmPassword} onToggleVisible={() => setShowConfirmPassword((v) => !v)} />
          {showPasswordMismatch && <Text allowFontScaling={false} style={[styles.fieldHint, styles.fieldHintError]}>Passwords do not match</Text>}
          {showPasswordMatch && <Text allowFontScaling={false} style={[styles.fieldHint, styles.fieldHintSuccess]}>Passwords match</Text>}
        </View>

        <Text allowFontScaling={false} style={styles.sectionTitle}>Profile</Text>

        <View style={[styles.fieldGroup, styles.nameRow]}>
          <View style={styles.nameField}>
            <Input label="First Name" value={firstName} onChangeText={setFirstName} placeholder="First" autoCapitalize="words" textContentType={IS_IOS ? "givenName" : undefined} autoComplete="given-name" />
          </View>
          <View style={styles.nameField}>
            <Input label="Last Name" value={lastName} onChangeText={setLastName} placeholder="Last" autoCapitalize="words" textContentType={IS_IOS ? "familyName" : undefined} autoComplete="family-name" />
          </View>
        </View>

        <View style={styles.fieldGroup}>
          <Input label="Username" value={username} onChangeText={(text) => { const clean = text.replace(/[^a-zA-Z0-9]/g, ""); setUsername(clean.charAt(0).toUpperCase() + clean.slice(1)); }} placeholder="Username" autoCapitalize="sentences" textContentType={IS_IOS ? "nickname" : undefined} autoComplete="username-new" />
          {username.length > 0 && <Text allowFontScaling={false} style={[styles.fieldHint, { color: usernameHelper.color }]}>{usernameHelper.text}</Text>}
        </View>

        <View style={styles.fieldGroup}>
          <Dropdown label="Home State" placeholder="Select your state" options={US_STATES} value={homeState} onSelect={setHomeState} />
        </View>

        <View style={styles.fieldGroup}>
          <Text allowFontScaling={false} style={styles.chipLabel}>Preferred Game</Text>
          <View style={styles.chipsRow}>
            {GAME_OPTIONS.map((game) => {
              const selected = preferredGame === game;
              return (
                <Pressable key={game} style={[styles.chip, selected && styles.chipSelected]} onPress={() => { Haptics.selectionAsync(); setPreferredGame(selected ? "" : game); }}>
                  <Text allowFontScaling={false} style={[styles.chipText, selected && styles.chipTextSelected]}>{game}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.fieldGroup}>
          <Input label="Favorite Player" value={favoritePlayer} onChangeText={setFavoritePlayer} placeholder="Your Favorite Player (optional)" autoCapitalize="words" />
        </View>

        <Text allowFontScaling={false} style={styles.sectionTitle}>Terms & Conditions</Text>

        <Pressable style={styles.checkboxRow} onPress={() => setAgreeTerms(!agreeTerms)}>
          <View style={[styles.checkboxBox, agreeTerms && styles.checkboxBoxChecked]}>
            {agreeTerms && <Text allowFontScaling={false} style={styles.checkboxCheck}>✓</Text>}
          </View>
          <Text allowFontScaling={false} style={styles.checkboxText}>
            I agree to the{" "}
            <Text style={styles.policyLink} onPress={() => router.push("/legal/terms")}>Terms of Service</Text>,{" "}
            <Text style={styles.policyLink} onPress={() => router.push("/legal/privacy")}>Privacy Policy</Text>, and{" "}
            <Text style={styles.policyLink} onPress={() => router.push("/legal/terms")}>Content Policy</Text>
          </Text>
        </Pressable>

        <Pressable style={[styles.checkboxRow, styles.checkboxRowLast]} onPress={() => setAgreeAge(!agreeAge)}>
          <View style={[styles.checkboxBox, agreeAge && styles.checkboxBoxChecked]}>
            {agreeAge && <Text allowFontScaling={false} style={styles.checkboxCheck}>✓</Text>}
          </View>
          <Text allowFontScaling={false} style={styles.checkboxText}>I am 18 years or older</Text>
        </Pressable>

        {error ? <Text allowFontScaling={false} style={styles.errorText}>{error}</Text> : null}

        <View style={styles.ctaWrapper}>
          <Button title="Create Account & Complete Setup" onPress={handleRegister} loading={loading} disabled={!isFormValid} fullWidth />
        </View>
      </View>

      <View style={styles.footer}>
        <Text allowFontScaling={false} style={styles.footerText}>Already have an account? </Text>
        <TouchableOpacity onPress={() => router.push("/auth/login")}>
          <Text allowFontScaling={false} style={styles.footerLink}>Log In</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAwareScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  scrollContent: { paddingHorizontal: scale(SPACING.lg), paddingTop: scale(SPACING.md), paddingBottom: scale(SPACING.xl * 2) },
  loadingContainer: { flex: 1, backgroundColor: COLORS.background, justifyContent: "center", alignItems: "center", padding: scale(SPACING.xl) },
  loadingTitle: { fontSize: moderateScale(FONT_SIZES.xl), fontWeight: "700", color: COLORS.text, marginBottom: scale(SPACING.sm), textAlign: "center" },
  loadingSubtitle: { fontSize: moderateScale(FONT_SIZES.md), color: COLORS.textSecondary, marginBottom: scale(SPACING.xl), textAlign: "center" },
  loadingIcon: { fontSize: moderateScale(40), textAlign: "center" },
  back: { marginTop: scale(SPACING.xl), marginBottom: scale(SPACING.lg) },
  backText: { color: COLORS.textSecondary, fontSize: moderateScale(FONT_SIZES.md) },
  title: { fontSize: moderateScale(FONT_SIZES.xxl), fontWeight: "700", color: COLORS.text, marginBottom: 4, letterSpacing: 0.5 },
  subtitle: { fontSize: moderateScale(FONT_SIZES.sm), color: COLORS.textSecondary, marginBottom: scale(SPACING.xl) },
  form: { flex: 1 },
  fieldGroup: { marginBottom: FIELD_GAP },
  sectionTitle: { fontSize: moderateScale(FONT_SIZES.xs), fontWeight: "700", color: COLORS.textSecondary, opacity: 0.55, letterSpacing: 0.7, textTransform: "uppercase", marginTop: SECTION_GAP, marginBottom: 16 },
  sectionTitleFirst: { marginTop: 0 },
  fieldHint: { fontSize: moderateScale(FONT_SIZES.xs), marginTop: 5, marginLeft: 2, fontWeight: "500", color: COLORS.textSecondary },
  fieldHintError: { color: "#EF4444" },
  fieldHintSuccess: { color: "#22C55E" },
  nameRow: { flexDirection: "row", gap: scale(12) },
  nameField: { flex: 1 },
  chipLabel: { fontSize: moderateScale(FONT_SIZES.sm), fontWeight: "500", color: COLORS.textSecondary, marginBottom: 10 },
  chipsRow: { flexDirection: "row", flexWrap: "wrap", columnGap: 8, rowGap: 9, alignItems: "flex-start" },
  chip: { paddingHorizontal: scale(14), paddingVertical: scale(8), borderRadius: scale(20), backgroundColor: "#242424", borderWidth: 1.5, borderColor: "#383838" },
  chipSelected: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  chipText: { fontSize: moderateScale(FONT_SIZES.sm), fontWeight: "500", color: "#888888" },
  chipTextSelected: { color: "#FFFFFF", fontWeight: "700" },
  checkboxRow: { flexDirection: "row", alignItems: "flex-start", marginBottom: 14 },
  checkboxRowLast: { marginBottom: 0 },
  checkboxBox: { width: scale(22), height: scale(22), borderRadius: 4, borderWidth: 2, borderColor: COLORS.textSecondary, marginRight: scale(12), marginTop: 3, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  checkboxBoxChecked: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  checkboxCheck: { color: "#FFFFFF", fontSize: moderateScale(13), fontWeight: "700" },
  checkboxText: { color: COLORS.textSecondary, fontSize: moderateScale(FONT_SIZES.sm), flex: 1, lineHeight: moderateScale(22) },
  policyLink: { color: COLORS.primary, textDecorationLine: "underline", fontWeight: "600" },
  errorText: { color: COLORS.error, fontSize: moderateScale(FONT_SIZES.sm), fontWeight: "500", marginTop: 16, marginBottom: 4 },
  ctaWrapper: { marginTop: scale(20) },
  footer: { flexDirection: "row", justifyContent: "center", paddingTop: scale(SPACING.xl), paddingBottom: scale(SPACING.lg) },
  footerText: { color: COLORS.textSecondary, fontSize: moderateScale(FONT_SIZES.md) },
  footerLink: { color: COLORS.primary, fontSize: moderateScale(FONT_SIZES.md), fontWeight: "600" },
});