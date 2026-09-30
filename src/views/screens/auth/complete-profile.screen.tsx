import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-aware-scroll-view";
import { useCheckUsername } from "../../../../hooks/use-profile";
import { supabase } from "../../../lib/supabase";
import { authService } from "../../../models/services/auth.service";
import { profileService } from "../../../models/services/profile.service";
import { useAuthContext } from "../../../providers/AuthProvider";
import { sendWelcomeEmail } from "../../../services/email/sendWelcomeEmail";
import { COLORS } from "../../../theme/colors";
import { RADIUS, SPACING } from "../../../theme/spacing";
import { FONT_SIZES } from "../../../theme/typography";
import { US_STATES } from "../../../utils/constants";
import { MIN_PASSWORD_LENGTH, newPasswordError, postAuthErrorMessage } from "../../../utils/auth-routing";
import { readSignupMetadata } from "../../../utils/email-confirmation";
import { toTitleCase } from "../../../utils/helpers";
import { moderateScale, scale } from "../../../utils/scaling";
import { containsBadWord, isValidUsername } from "../../../utils/validation";
import { Button } from "../../components/common/button";
import { Dropdown } from "../../components/common/dropdown";
import { Input } from "../../components/common/input";
import { ReferralCodeField } from "../../components/referral/ReferralCodeField";
import { useReferralCodeField } from "../../../viewmodels/hooks/use.referral.code.field";
import { usePostAuthNavigation } from "../../../viewmodels/hooks/use.post.auth.navigation";
import { useHydrated } from "../../../viewmodels/hooks/use.hydrated";

const IS_WEB = Platform.OS === "web";
const WEB_FORM_MAX_WIDTH = 800;
// Desktop/tablet web gets the centered card; phone-width web and native keep the original layout.
const WIDE_WEB_MIN_WIDTH = 768;
const SECTION_GAP = 28;
const FIELD_GAP = 18;
const GAME_OPTIONS = ["8-Ball", "9-Ball", "10-Ball", "One Pocket", "Straight Pool", "Banks", "Carom", "Snooker"];

// Supabase updateUser failure -> what the user should do next.
const passwordSaveError = (code: string | null, message: string | null): string => {
  if (code === "weak_password") return message || "Please choose a stronger password.";
  if (code === "reauthentication_needed") return "For your security, please sign in again, then finish setting up your profile.";
  return "We couldn't save your password. Please try again.";
};

export const CompleteProfileScreen = () => {
  const router = useRouter();
  const params = useLocalSearchParams<{ firstName?: string; lastName?: string }>();
  const [firstName, setFirstName] = useState(params.firstName || "");
  const [lastName, setLastName] = useState(params.lastName || "");
  const [username, setUsername] = useState("");
  const [homeState, setHomeState] = useState("");
  const [preferredGame, setPreferredGame] = useState("");
  const [favoritePlayer, setFavoritePlayer] = useState("");
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [agreeAge, setAgreeAge] = useState(false);
  const referral = useReferralCodeField();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  // Set once the profile row is inserted, so a retry after a failed account load only
  // re-runs the shared post-auth step (never a second insert).
  const [profileCreated, setProfileCreated] = useState(false);
  // Rule: social-created account (Apple / Google) + no Compete profile (this screen is only
  // reached without one) → create a Compete password, added to the SAME Supabase user.
  // Email + password signups skip it. null while checking.
  const [socialSignupWithoutProfile, setSocialSignupWithoutProfile] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordAdded, setPasswordAdded] = useState(false);
  const needsPasswordStep = socialSignupWithoutProfile === true && !passwordAdded;
  const { completeSignIn } = usePostAuthNavigation();
  const { signOut } = useAuthContext();

  const { isAvailable, isChecking } = useCheckUsername(username);
  // Hydration-safe: the static HTML is the original (non-card) layout; wide web switches after.
  const hydrated = useHydrated();
  const { width: windowWidth } = useWindowDimensions();
  const wideWeb = IS_WEB && hydrated && windowWidth >= WIDE_WEB_MIN_WIDTH;

  // Email signups that confirmed later (Supabase "Confirm email" ON), possibly on another device:
  // pre-fill what the Register form collected (auth metadata compete_signup). Pre-fill only —
  // the username still goes through the normal availability check (useCheckUsername + validateForm)
  // and the insert's unique constraint; it was never reserved.
  const { adopt: adoptReferral } = referral;
  useEffect(() => {
    let active = true;
    authService
      .getUser()
      .then((user) => {
        const meta = active ? readSignupMetadata(user?.user_metadata) : null;
        if (!meta) return;
        if (meta.first_name) setFirstName((cur) => cur || meta.first_name!);
        if (meta.last_name) setLastName((cur) => cur || meta.last_name!);
        if (meta.username_candidate) setUsername((cur) => cur || meta.username_candidate!);
        // Choice fields only take values the form actually offers (metadata is user-editable).
        const state = meta.home_state;
        if (state && US_STATES.some((s) => s.value === state)) setHomeState((cur) => cur || state);
        const game = meta.preferred_game;
        if (game && GAME_OPTIONS.includes(game)) setPreferredGame((cur) => cur || game);
        if (meta.favorite_player) setFavoritePlayer((cur) => cur || meta.favorite_player!);
        adoptReferral(meta.referral);
      })
      .catch(() => { /* no metadata → the form simply starts empty */ });
    return () => { active = false; };
  }, [adoptReferral]);

  // If the account can't be read, stay "unknown" (submit disabled) and offer a retry — never
  // guess "social": for an email + password user that would REPLACE their existing password.
  const [accountCheckFailed, setAccountCheckFailed] = useState(false);
  const [accountCheckRun, setAccountCheckRun] = useState(0);
  useEffect(() => {
    let active = true;
    authService
      .currentAccountIsSocialSignup()
      .then((isSocial) => { if (active) setSocialSignupWithoutProfile(isSocial); })
      .catch(() => {
        if (!active) return;
        setSocialSignupWithoutProfile(null);
        setAccountCheckFailed(true);
      });
    return () => { active = false; };
  }, [accountCheckRun]);

  const validateForm = () => {
    setError("");
    if (!firstName.trim()) { setError("Please enter your first name"); return false; }
    if (!lastName.trim()) { setError("Please enter your last name"); return false; }
    if (!isValidUsername(username)) { setError("Username must be 3-20 letters or numbers"); return false; }
    if (containsBadWord(username)) { setError("This username is not allowed"); return false; }
    if (!isAvailable) { setError("This username is already taken"); return false; }
    if (needsPasswordStep) {
      const passwordError = newPasswordError(password, confirmPassword);
      if (passwordError) { setError(passwordError); return false; }
    }
    if (!homeState) { setError("Please select your home state"); return false; }
    if (!agreeTerms || !agreeAge) { setError("Please agree to the terms and confirm your age"); return false; }
    return true;
  };

  const handleComplete = async () => {
    if (!profileCreated && !validateForm()) return;
    setError("");
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setError("Session expired. Please sign in again."); router.replace("/auth/login"); return; }
      // 1) Password FIRST, on the same Supabase user. If it fails nothing else was written, so the
      //    user fixes it and resubmits; and every profile created here is guaranteed a password
      //    (once the profile exists, a later retry could no longer detect the missing password).
      if (needsPasswordStep) {
        // Re-confirm right before writing: a password is only ever ADDED for a social-created
        // account, never set over an email + password user's existing one.
        if (!(await authService.currentAccountIsSocialSignup())) {
          setSocialSignupWithoutProfile(false);
          setPassword("");
          setConfirmPassword("");
          return;
        }
        const res = await authService.addPasswordToCurrentAccount(password);
        // same_password: already set by an earlier attempt of this same flow -> fine.
        if (res.error && res.code !== "same_password") { setError(passwordSaveError(res.code, res.error)); return; }
        setPasswordAdded(true);
        setPassword("");
        setConfirmPassword("");
      }
      // 2) Profile row.
      if (!profileCreated) {
        // Hand any referral code to the pending store; it is claimed server-side once the
        // profile exists (usePendingReferralClaim). Optional — never blocks signup.
        await referral.commit();
        const trimmedFirst = toTitleCase(firstName.trim());
        const trimmedLast = toTitleCase(lastName.trim());
        await profileService.createProfile({ id: user.id, email: user.email!, name: `${trimmedFirst} ${trimmedLast}`, first_name: trimmedFirst, last_name: trimmedLast, user_name: username, home_state: homeState, preferred_game: preferredGame || undefined, favorite_player: favoritePlayer || undefined });
        setProfileCreated(true);

        // Fire-and-forget welcome email — never awaited, never blocks profile completion
        sendWelcomeEmail(user.email!, trimmedFirst).catch((err) =>
          console.warn("[CompleteProfileScreen] Welcome email failed silently:", err)
        );
      }

      // 3) Shared post-auth step, forced so it reloads the row just inserted: ready → app.
      const status = await completeSignIn(user.id, { force: true });
      const message = postAuthErrorMessage(status);
      if (message) setError(message);
    } catch (err: any) {
      setError(err.message || "Failed to create profile");
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

  const passwordReady = socialSignupWithoutProfile === false || passwordAdded || (socialSignupWithoutProfile === true && password.length >= MIN_PASSWORD_LENGTH && password === confirmPassword);
  const isFormValid = !!(firstName.trim() && lastName.trim() && username && username.length >= 3 && homeState && agreeTerms && agreeAge && isAvailable && !isChecking && passwordReady);
  const showPasswordMismatch = confirmPassword.length > 0 && confirmPassword.length >= password.length && password !== confirmPassword;
  const usernameHelper = getUsernameHelper();

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <Text allowFontScaling={false} style={styles.loadingTitle}>Setting Up Your Profile</Text>
        <Text allowFontScaling={false} style={styles.loadingSubtitle}>Almost there...</Text>
        <Text allowFontScaling={false} style={styles.loadingIcon}>&#9203;</Text>
      </View>
    );
  }

  return (
    <KeyboardAwareScrollView style={styles.container} contentContainerStyle={[styles.scrollContent, wideWeb && styles.scrollContentWeb]} enableOnAndroid keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" enableResetScrollToCoords={false} extraScrollHeight={20}>
      {/* Desktop/tablet web: one centered column (max 800px) with the form in a card like Login /
          Create Account. Phone-width web and native keep their full-width layout unchanged. */}
      <View style={wideWeb ? styles.webColumn : styles.nativeColumn}>
      <Text allowFontScaling={false} style={styles.title}>COMPLETE YOUR PROFILE</Text>
      <Text allowFontScaling={false} style={styles.subtitle}>Just a few more details to get you started</Text>

      <View style={[styles.form, wideWeb && styles.formCardWeb]}>
        <Text allowFontScaling={false} style={[styles.sectionTitle, styles.sectionTitleFirst]}>Profile Information</Text>

        <View style={[styles.fieldGroup, styles.nameRow]}>
          <View style={styles.nameField}>
            <Input label="First Name" value={firstName} onChangeText={setFirstName} placeholder="First" autoCapitalize="words" />
          </View>
          <View style={styles.nameField}>
            <Input label="Last Name" value={lastName} onChangeText={setLastName} placeholder="Last" autoCapitalize="words" />
          </View>
        </View>

        <View style={styles.fieldGroup}>
          <Input label="Username" value={username} onChangeText={(text) => { const clean = text.replace(/[^a-zA-Z0-9]/g, ""); setUsername(clean.charAt(0).toUpperCase() + clean.slice(1)); }} placeholder="Username" autoCapitalize="sentences" />
          {username.length > 0 && <Text allowFontScaling={false} style={[styles.fieldHint, { color: usernameHelper.color }]}>{usernameHelper.text}</Text>}
        </View>

        {needsPasswordStep && (
          <>
            <Text allowFontScaling={false} style={styles.sectionTitle}>Compete Password</Text>
            <Text allowFontScaling={false} style={styles.sectionNote}>Lets you also sign in with your username and password.</Text>
            <View style={styles.fieldGroup}>
              <Input label="Password" value={password} onChangeText={setPassword} placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`} secureTextEntry showPasswordToggle autoCapitalize="none" autoComplete="new-password" textContentType="newPassword" />
              {password.length > 0 && password.length < MIN_PASSWORD_LENGTH && <Text allowFontScaling={false} style={styles.fieldHint}>Must be at least {MIN_PASSWORD_LENGTH} characters</Text>}
            </View>
            <View style={styles.fieldGroup}>
              <Input label="Confirm Password" value={confirmPassword} onChangeText={setConfirmPassword} placeholder="Re-enter your password" secureTextEntry showPasswordToggle autoCapitalize="none" autoComplete="new-password" textContentType="newPassword" />
              {showPasswordMismatch && <Text allowFontScaling={false} style={[styles.fieldHint, styles.fieldHintError]}>Passwords do not match</Text>}
            </View>
          </>
        )}

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

        <View style={styles.fieldGroup}>
          <ReferralCodeField code={referral.code} onChangeCode={referral.setCode} check={referral.check} inviter={referral.inviter} onPaste={referral.paste} pasteNote={referral.pasteNote} />
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
        {accountCheckFailed ? (
          <Pressable onPress={() => { setAccountCheckFailed(false); setAccountCheckRun((n) => n + 1); }}>
            <Text allowFontScaling={false} style={styles.errorText}>
              {"We couldn't load your account. Check your connection and tap here to try again."}
            </Text>
          </Pressable>
        ) : null}

        <View style={styles.ctaWrapper}>
          <Button title={profileCreated ? "Try Again" : "Complete Setup"} onPress={handleComplete} loading={loading} disabled={!profileCreated && (socialSignupWithoutProfile === null || !isFormValid)} fullWidth />
        </View>

        {/* Signed in with the wrong provider account? Leave without creating a profile. */}
        {!profileCreated && (
          <Pressable style={styles.switchAccount} onPress={async () => { await signOut(); router.replace("/(tabs)"); }}>
            <Text allowFontScaling={false} style={styles.switchAccountText}>Use a different account</Text>
          </Pressable>
        )}
      </View>
      </View>
    </KeyboardAwareScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  scrollContent: { paddingHorizontal: scale(SPACING.lg), paddingTop: scale(SPACING.xl * 2), paddingBottom: scale(SPACING.xl * 2) },
  // Wide web only: fixed (unscaled) spacing, centered 800px column, form as a card (Login style).
  scrollContentWeb: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.xl, paddingBottom: SPACING.xl * 2 },
  webColumn: { width: "100%", maxWidth: WEB_FORM_MAX_WIDTH, alignSelf: "center" },
  nativeColumn: { flex: 1 },
  formCardWeb: {
    backgroundColor: COLORS.backgroundCard,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.xl,
  },
  loadingContainer: { flex: 1, backgroundColor: COLORS.background, justifyContent: "center", alignItems: "center", padding: scale(SPACING.xl) },
  loadingTitle: { fontSize: moderateScale(FONT_SIZES.xl), fontWeight: "700", color: COLORS.text, marginBottom: scale(SPACING.sm), textAlign: "center" },
  loadingSubtitle: { fontSize: moderateScale(FONT_SIZES.md), color: COLORS.textSecondary, marginBottom: scale(SPACING.xl), textAlign: "center" },
  loadingIcon: { fontSize: moderateScale(40), textAlign: "center" },
  title: { fontSize: moderateScale(FONT_SIZES.xxl), fontWeight: "700", color: COLORS.text, marginBottom: 4, letterSpacing: 0.5 },
  subtitle: { fontSize: moderateScale(FONT_SIZES.sm), color: COLORS.textSecondary, marginBottom: scale(SPACING.xl) },
  form: { flex: 1 },
  fieldGroup: { marginBottom: FIELD_GAP },
  sectionTitle: { fontSize: moderateScale(FONT_SIZES.xs), fontWeight: "700", color: COLORS.textSecondary, opacity: 0.55, letterSpacing: 0.7, textTransform: "uppercase", marginTop: SECTION_GAP, marginBottom: 16 },
  sectionTitleFirst: { marginTop: 0 },
  fieldHint: { fontSize: moderateScale(FONT_SIZES.xs), marginTop: 5, marginLeft: 2, fontWeight: "500", color: COLORS.textSecondary },
  fieldHintError: { color: COLORS.error },
  sectionNote: { fontSize: moderateScale(FONT_SIZES.xs), color: COLORS.textSecondary, marginTop: -8, marginBottom: 12 },
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
  switchAccount: { alignSelf: "center", marginTop: scale(SPACING.lg), padding: scale(SPACING.sm) },
  switchAccountText: { color: COLORS.textSecondary, fontSize: moderateScale(FONT_SIZES.sm), textDecorationLine: "underline" },
});