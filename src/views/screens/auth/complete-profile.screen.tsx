import * as Haptics from "expo-haptics";
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
import { moderateScale, scale } from "../../../utils/scaling";
import { containsBadWord, isValidUsername } from "../../../utils/validation";
import { Button } from "../../components/common/button";
import { Dropdown } from "../../components/common/dropdown";
import { Input } from "../../components/common/input";

const SECTION_GAP = 28;
const FIELD_GAP = 18;
const GAME_OPTIONS = ["8-Ball", "9-Ball", "10-Ball", "One Pocket", "Straight Pool", "Banks", "Carom", "Snooker"];

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
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const { isAvailable, isChecking } = useCheckUsername(username);

  const validateForm = () => {
    setError("");
    if (!firstName.trim()) { setError("Please enter your first name"); return false; }
    if (!lastName.trim()) { setError("Please enter your last name"); return false; }
    if (!isValidUsername(username)) { setError("Username must be 3–20 letters or numbers"); return false; }
    if (containsBadWord(username)) { setError("This username is not allowed"); return false; }
    if (!isAvailable) { setError("This username is already taken"); return false; }
    if (!homeState) { setError("Please select your home state"); return false; }
    if (!agreeTerms || !agreeAge) { setError("Please agree to the terms and confirm your age"); return false; }
    return true;
  };

  const handleComplete = async () => {
    if (!validateForm()) return;
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setError("Session expired. Please sign in again."); router.replace("/auth/login"); return; }
      const trimmedFirst = toTitleCase(firstName.trim());
      const trimmedLast = toTitleCase(lastName.trim());
      await profileService.createProfile({ id: user.id, email: user.email!, name: `${trimmedFirst} ${trimmedLast}`, first_name: trimmedFirst, last_name: trimmedLast, user_name: username, home_state: homeState, preferred_game: preferredGame || undefined, favorite_player: favoritePlayer || undefined });
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
        } catch {}
        attempts++;
      }
      router.replace("/(tabs)");
    } catch (err: any) {
      setError(err.message || "Failed to create profile");
    } finally {
      setLoading(false);
    }
  };

  const getUsernameHelper = () => {
    if (username.length < 3) return { text: "Username cannot be changed later", color: COLORS.textSecondary };
    if (isChecking) return { text: "Checking availability...", color: COLORS.textSecondary };
    if (isAvailable) return { text: "✓ Username available", color: "#22C55E" };
    return { text: "✗ Username taken", color: "#EF4444" };
  };

  const isFormValid = !!(firstName.trim() && lastName.trim() && username && username.length >= 3 && homeState && agreeTerms && agreeAge && isAvailable && !isChecking);
  const usernameHelper = getUsernameHelper();

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <Text allowFontScaling={false} style={styles.loadingTitle}>Setting Up Your Profile</Text>
        <Text allowFontScaling={false} style={styles.loadingSubtitle}>Almost there…</Text>
        <Text allowFontScaling={false} style={styles.loadingIcon}>⏳</Text>
      </View>
    );
  }

  return (
    <KeyboardAwareScrollView style={styles.container} contentContainerStyle={styles.scrollContent} enableOnAndroid keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" enableResetScrollToCoords={false} extraScrollHeight={20}>
      <Text allowFontScaling={false} style={styles.title}>COMPLETE YOUR PROFILE</Text>
      <Text allowFontScaling={false} style={styles.subtitle}>Just a few more details to get you started</Text>

      <View style={styles.form}>
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
          <Button title="Complete Setup" onPress={handleComplete} loading={loading} disabled={!isFormValid} fullWidth />
        </View>
      </View>
    </KeyboardAwareScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  scrollContent: { paddingHorizontal: scale(SPACING.lg), paddingTop: scale(SPACING.xl * 2), paddingBottom: scale(SPACING.xl * 2) },
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
});
