// app/(tabs)/notification-preferences.tsx
import { useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Keyboard,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import * as Haptics from "expo-haptics";
import { OtpInput } from "../../src/views/components/common/otp-input";
import { digitsOnly, formatUsPhoneInput } from "../../src/utils/phone";
import { useAuthContext } from "../../src/providers/AuthProvider";
import { COLORS } from "../../src/theme/colors";
import { RADIUS, SPACING } from "../../src/theme/spacing";
import { FONT_SIZES } from "../../src/theme/typography";
import { moderateScale, scale } from "../../src/utils/scaling";
import { SMS_PREFERENCE_CATEGORIES } from "../../src/models/types/notification.types";
import { useNotificationPreferences } from "../../src/viewmodels/hooks/use.notification.preferences";
import { usePhoneVerification } from "../../src/viewmodels/hooks/use.phone.verification";

const isWeb = Platform.OS === "web";
const wxMs = (v: number) => isWeb ? v : moderateScale(v);
const wxSc = (v: number) => isWeb ? v : scale(v);

// Telnyx Verify profile issues a 5-digit code. Keep the UI in lockstep.
const OTP_LENGTH = 5;

export default function NotificationPreferencesScreen() {
  const router = useRouter();
  const { user, canSubmitTournaments } = useAuthContext();
  const {
    preferences,
    isLoading,
    isSaving,
    error,
    devicePermission,
    categories,
    togglePreference,
    savePreferences,
    openDeviceSettings,
    refresh,
  } = useNotificationPreferences(user?.id);
  const pv = usePhoneVerification();

  const onRefresh = useCallback(async () => {
    await refresh();
    await pv.refresh();
  }, [refresh, pv]);

  // Explicit UI step. Verification is bound to the exact phone number, never to
  // the account: "verified" is ONLY ever reached through a successful verifyCode
  // (or an initial load where the server already considers the canonical number
  // verified). A freshly typed number therefore can never inherit verified state.
  type Step = "phone" | "code" | "verified";
  const [step, setStep] = useState<Step | null>(null);
  const [phoneDigits, setPhoneDigits] = useState("");
  const [code, setCode] = useState("");
  const [verifyFailed, setVerifyFailed] = useState(false);
  const [resendSeconds, setResendSeconds] = useState(0);
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [autoFocusPhone, setAutoFocusPhone] = useState(false);
  const successAnim = useRef(new Animated.Value(0)).current;

  const verified = step === "verified";

  // Initialize the step once the hook has loaded; keep it honest if the server
  // later reports the number is no longer verified. Never auto-promote to
  // "verified" — that transition only happens on a successful verifyCode.
  useEffect(() => {
    if (pv.loading) return;
    if (step === null) {
      setStep(pv.isVerified ? "verified" : "phone");
      return;
    }
    if (step === "verified" && !pv.isVerified) setStep("phone");
  }, [pv.loading, pv.isVerified, step]);

  // Resend countdown (60s) after a code is sent.
  useEffect(() => {
    if (resendSeconds <= 0) return;
    const t = setTimeout(() => setResendSeconds((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendSeconds]);

  // Success-checkmark pop when the verified card appears.
  useEffect(() => {
    if (step !== "verified") return;
    successAnim.setValue(0);
    Animated.spring(successAnim, {
      toValue: 1,
      friction: 5,
      tension: 140,
      useNativeDriver: Platform.OS !== "web",
    }).start();
  }, [step, successAnim]);

  // SMS toggles are gated on the LOCAL verified step, so changing/clearing the
  // number disables them immediately — before the server-side clear lands.
  const smsOn = verified && pv.smsEnabled;
  const smsCategories = SMS_PREFERENCE_CATEGORIES.filter(
    (c) => !c.directorOnly || canSubmitTournaments,
  );

  const successHaptic = () => {
    if (!isWeb) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  };
  const warningHaptic = () => {
    if (!isWeb) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
  };

  const onSendCode = async () => {
    if (phoneDigits.length !== 10 || sending) return;
    setSending(true);
    const res = await pv.sendCode(phoneDigits);
    setSending(false);
    if (res.success) {
      setCode("");
      setVerifyFailed(false);
      setResendSeconds(60);
      setAutoFocusPhone(false);
      setStep("code");
    } else {
      warningHaptic();
      Alert.alert("Couldn't send code", res.error ?? "Please try again.");
    }
  };
  const onVerify = async (submitted?: string) => {
    if (verifying) return;
    setVerifying(true);
    const res = await pv.verifyCode(submitted ?? code);
    setVerifying(false);
    if (res.success) {
      Keyboard.dismiss();
      setCode("");
      setVerifyFailed(false);
      setResendSeconds(0);
      successHaptic();
      setStep("verified");
    } else {
      setVerifyFailed(true);
      warningHaptic();
      Alert.alert("Not verified", res.error ?? "Please try again.");
    }
  };
  // Return to phone entry, wiping every trace of the prior number's flow. Used by
  // the code-step "Change" link (nothing verified yet → no confirm) and, after
  // the confirmation dialog, from the verified card.
  const startChange = () => {
    pv.resetCodeSent();
    setPhoneDigits("");
    setCode("");
    setVerifyFailed(false);
    setResendSeconds(0);
    setAutoFocusPhone(true);
    setStep("phone");
  };
  const onChangeNumber = () => {
    Alert.alert(
      "Change phone number?",
      "Changing your phone number will require verifying the new number before SMS alerts can be used again.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Continue", style: "destructive", onPress: startChange },
      ],
    );
  };
  const onToggleSms = async (value: boolean) => {
    const res = value ? await pv.enableAlerts() : await pv.disableAlerts();
    if (!res.success) {
      warningHaptic();
      Alert.alert("Couldn't update", res.error ?? "Please try again.");
    }
  };
  const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  const onSendTest = async () => {
    const res = await pv.sendTest();
    Alert.alert(
      res.success ? "Test sent" : "Couldn't send",
      res.success ? "Check your phone." : res.error ?? "Please try again.",
    );
  };

  if (isLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text allowFontScaling={false} style={styles.loadingText}>Loading preferences...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.pageWrapper, isWeb && styles.pageWrapperWeb]}>
        <View style={[styles.header, isWeb && styles.headerWeb]}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.push("/(tabs)/profile" as any)}>
            <Text allowFontScaling={false} style={styles.backButtonText}>{"\u2039"} Back</Text>
          </TouchableOpacity>
          <Text allowFontScaling={false} style={styles.headerTitle}>NOTIFICATIONS</Text>
          <View style={styles.backButton} />
        </View>

        <ScrollView
          style={styles.scrollContent}
          refreshControl={
            isWeb ? undefined : (
              <RefreshControl refreshing={false} onRefresh={onRefresh} tintColor={COLORS.primary} />
            )
          }
        >
          {!isWeb && devicePermission !== "granted" && (
            <TouchableOpacity style={styles.permissionBanner} onPress={openDeviceSettings} activeOpacity={0.7}>
              <View style={styles.permissionContent}>
                <Text allowFontScaling={false} style={styles.permissionIcon}>{"\u26A0\uFE0F"}</Text>
                <View style={styles.permissionTextContainer}>
                  <Text allowFontScaling={false} style={styles.permissionTitle}>Notifications are disabled</Text>
                  <Text allowFontScaling={false} style={styles.permissionSubtitle}>Tap here to enable notifications in your device settings</Text>
                </View>
                <Text allowFontScaling={false} style={styles.permissionArrow}>{"\u2192"}</Text>
              </View>
            </TouchableOpacity>
          )}

          {error && (
            <View style={styles.errorBanner}>
              <Text allowFontScaling={false} style={styles.errorText}>{error}</Text>
              <TouchableOpacity onPress={refresh}>
                <Text allowFontScaling={false} style={styles.retryText}>Retry</Text>
              </TouchableOpacity>
            </View>
          )}

          <Text allowFontScaling={false} style={styles.sectionDescription}>
            {"Choose which notifications you'd like to receive. You can change these at any time."}
          </Text>

          <View style={styles.section}>
            <Text allowFontScaling={false} style={styles.sectionTitle}>NOTIFICATION CATEGORIES</Text>
            {categories.map((category, index) => {
              const isEnabled = preferences?.[category.key] ?? true;
              const isLast = index === categories.length - 1;
              return (
                <View key={category.key} style={[styles.preferenceRow, !isLast && styles.preferenceRowBorder]}>
                  <View style={styles.preferenceInfo}>
                    <View style={styles.preferenceHeader}>
                      <Text allowFontScaling={false} style={styles.preferenceIcon}>{category.icon}</Text>
                      <Text allowFontScaling={false} style={styles.preferenceLabel}>{category.label}</Text>
                    </View>
                    <Text allowFontScaling={false} style={styles.preferenceDescription}>{category.description}</Text>
                  </View>
                  <Switch
                    value={isEnabled}
                    onValueChange={(value) => togglePreference(category.key, value)}
                    trackColor={{ false: COLORS.border, true: COLORS.primary + "80" }}
                    thumbColor={isEnabled ? COLORS.primary : COLORS.textMuted}
                    disabled={isSaving}
                  />
                </View>
              );
            })}
          </View>

          <View style={styles.section}>
            <Text allowFontScaling={false} style={styles.sectionTitle}>TEXT MESSAGE ALERTS</Text>

            {/* ── Phone verification: one obvious action per step ─────────── */}
            {step === null ? (
              <View style={styles.verifyBlock}>
                <ActivityIndicator size="small" color={COLORS.primary} />
              </View>
            ) : step === "verified" ? (
              <View style={styles.verifiedCard}>
                <Animated.Text
                  allowFontScaling={false}
                  style={[
                    styles.verifiedCheck,
                    {
                      opacity: successAnim,
                      transform: [
                        { scale: successAnim.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) },
                      ],
                    },
                  ]}
                >
                  ✅
                </Animated.Text>
                <View style={styles.verifiedBody}>
                  <Text allowFontScaling={false} style={styles.verifiedTitle}>Phone Verified</Text>
                  <Text allowFontScaling={false} style={styles.verifiedPhone}>{pv.maskedPhone}</Text>
                  <Text allowFontScaling={false} style={styles.verifiedSub}>
                    {"We'll text you when your matches are ready."}
                  </Text>
                  <TouchableOpacity
                    style={styles.verifiedChangeBtn}
                    onPress={onChangeNumber}
                    disabled={pv.busy}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Text allowFontScaling={false} style={styles.changeLink}>Change Phone Number</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : step === "code" ? (
              <View style={styles.verifyBlock}>
                <Text allowFontScaling={false} style={styles.fieldLabel}>Verification Code</Text>
                <Text allowFontScaling={false} style={styles.fieldHint}>
                  Enter the {OTP_LENGTH}-digit code we texted to {formatUsPhoneInput(phoneDigits) || "your phone"}.
                </Text>
                <OtpInput
                  value={code}
                  onChange={setCode}
                  onComplete={(c) => onVerify(c)}
                  length={OTP_LENGTH}
                  disabled={verifying}
                  autoFocus
                />
                {(verifyFailed || verifying) && (
                  <TouchableOpacity
                    style={[styles.primaryBtn, (verifying || code.length < OTP_LENGTH) && styles.primaryBtnDisabled]}
                    onPress={() => onVerify()}
                    disabled={verifying || code.length < OTP_LENGTH}
                    activeOpacity={0.8}
                  >
                    <Text allowFontScaling={false} style={styles.primaryBtnText}>
                      {verifying ? "Verifying…" : "Verify Code"}
                    </Text>
                  </TouchableOpacity>
                )}
                <View style={styles.resendRow}>
                  {resendSeconds > 0 ? (
                    <Text allowFontScaling={false} style={styles.resendMuted}>Resend code in {mmss(resendSeconds)}</Text>
                  ) : (
                    <TouchableOpacity onPress={onSendCode} disabled={sending} activeOpacity={0.7}>
                      <Text allowFontScaling={false} style={styles.resendActive}>
                        {sending ? "Sending…" : "Resend Code"}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
                <TouchableOpacity
                  style={styles.changeLinkRow}
                  onPress={startChange}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text allowFontScaling={false} style={styles.changeLink}>Change Phone Number</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.verifyBlock}>
                <Text allowFontScaling={false} style={styles.fieldLabel}>Mobile Number</Text>
                <View style={styles.phoneRow}>
                  <View style={styles.countryPrefix}>
                    <Text allowFontScaling={false} style={styles.countryPrefixText}>🇺🇸 +1</Text>
                  </View>
                  <TextInput
                    allowFontScaling={false}
                    style={[styles.phoneInput, styles.phoneInputFlex]}
                    value={formatUsPhoneInput(phoneDigits)}
                    onChangeText={(t) => setPhoneDigits(digitsOnly(t).slice(0, 10))}
                    placeholder="(555) 123-4567"
                    placeholderTextColor={COLORS.textMuted}
                    keyboardType="number-pad"
                    textContentType="telephoneNumber"
                    returnKeyType="done"
                    editable={!sending}
                    autoFocus={autoFocusPhone}
                    onSubmitEditing={onSendCode}
                  />
                </View>
                <TouchableOpacity
                  style={[styles.primaryBtn, (sending || phoneDigits.length !== 10) && styles.primaryBtnDisabled]}
                  onPress={onSendCode}
                  disabled={sending || phoneDigits.length !== 10}
                  activeOpacity={0.8}
                >
                  <Text allowFontScaling={false} style={styles.primaryBtnText}>
                    {sending ? "Sending…" : "Send Verification Code"}
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Master SMS opt-in — requires a verified number; routed through the
                consent RPCs. Verification alone never opts the user in. */}
            <View style={[styles.preferenceRow, styles.preferenceRowBorder]}>
              <View style={styles.preferenceInfo}>
                <View style={styles.preferenceHeader}>
                  <Text allowFontScaling={false} style={styles.preferenceIcon}>{"💬"}</Text>
                  <Text allowFontScaling={false} style={styles.preferenceLabel}>Enable Text Alerts</Text>
                </View>
                <Text allowFontScaling={false} style={styles.preferenceDescription}>
                  {verified
                    ? "Get text alerts for your matches. Reply STOP to opt out."
                    : "Verify your mobile number to enable text alerts."}
                </Text>
              </View>
              <Switch
                value={smsOn}
                onValueChange={onToggleSms}
                trackColor={{ false: COLORS.border, true: COLORS.primary + "80" }}
                thumbColor={smsOn ? COLORS.primary : COLORS.textMuted}
                disabled={pv.busy || !verified}
              />
            </View>

            {/* Carrier-required SMS consent disclosure. Kept always visible (not
                gated on the toggle) so it appears in the opt-in screenshot used for
                toll-free verification. */}
            <View style={styles.smsDisclosure}>
              <Text allowFontScaling={false} style={styles.smsDisclosureText}>
                By enabling SMS notifications, you agree to receive automated text
                messages from Compete about match assignments, tournament reminders,
                and account updates. Message frequency varies. Message &amp; data
                rates may apply. Reply STOP to opt out and HELP for help.
              </Text>
            </View>

            {/* Per-alert SMS toggles (role-gated) */}
            {smsCategories.map((category, index) => {
              const isEnabled = (preferences?.[category.key] ?? false) && smsOn;
              const isLast = index === smsCategories.length - 1;
              return (
                <View key={category.key} style={[styles.preferenceRow, !isLast && styles.preferenceRowBorder]}>
                  <View style={styles.preferenceInfo}>
                    <View style={styles.preferenceHeader}>
                      <Text allowFontScaling={false} style={styles.preferenceIcon}>{category.icon}</Text>
                      <Text allowFontScaling={false} style={[styles.preferenceLabel, !smsOn && styles.preferenceLabelDisabled]}>{category.label}</Text>
                    </View>
                    <Text allowFontScaling={false} style={styles.preferenceDescription}>{category.description}</Text>
                  </View>
                  <Switch
                    value={isEnabled}
                    onValueChange={(value) => savePreferences({ [category.key]: value })}
                    trackColor={{ false: COLORS.border, true: COLORS.primary + "80" }}
                    thumbColor={isEnabled ? COLORS.primary : COLORS.textMuted}
                    disabled={isSaving || !smsOn}
                  />
                </View>
              );
            })}

            <TouchableOpacity
              style={[
                styles.testSmsBtn,
                (!verified || pv.busy) && styles.testSmsBtnDisabled,
              ]}
              onPress={onSendTest}
              disabled={!verified || pv.busy}
              activeOpacity={0.7}
            >
              {pv.busy ? (
                <ActivityIndicator size="small" color={COLORS.primary} />
              ) : (
                <Text allowFontScaling={false} style={styles.testSmsText}>
                  Send Test Text
                </Text>
              )}
            </TouchableOpacity>
          </View>

          <View style={styles.section}>
            <Text allowFontScaling={false} style={styles.sectionTitle}>QUICK ACTIONS</Text>
            <TouchableOpacity style={styles.quickActionRow} onPress={() => categories.forEach((cat) => togglePreference(cat.key, true))} activeOpacity={0.7}>
              <Text allowFontScaling={false} style={styles.quickActionIcon}>{"\u2705"}</Text>
              <Text allowFontScaling={false} style={styles.quickActionText}>Enable all notifications</Text>
            </TouchableOpacity>
            <View style={styles.quickActionDivider} />
            <TouchableOpacity style={styles.quickActionRow} onPress={() => categories.forEach((cat) => togglePreference(cat.key, false))} activeOpacity={0.7}>
              <Text allowFontScaling={false} style={styles.quickActionIcon}>{"\uD83D\uDD07"}</Text>
              <Text allowFontScaling={false} style={[styles.quickActionText, { color: COLORS.error }]}>Disable all notifications</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.footer}>
            <Text allowFontScaling={false} style={styles.footerText}>
              {isWeb
                ? "Manage your in-app notification preferences below."
                : "Even with notifications disabled, you can still view updates in the app. Push notifications require device permissions to be enabled."}
            </Text>
            {!isWeb && devicePermission === "granted" && (
              <TouchableOpacity style={styles.deviceSettingsLink} onPress={openDeviceSettings}>
                <Text allowFontScaling={false} style={styles.deviceSettingsText}>Open Device Settings {"\u2192"}</Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.bottomSpacer} />
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  pageWrapper: { flex: 1 },
  pageWrapperWeb: { maxWidth: 860, width: "100%" as any, alignSelf: "center" as any },
  centerContainer: { flex: 1, backgroundColor: COLORS.background, justifyContent: "center", alignItems: "center" },
  loadingText: { fontSize: wxMs(FONT_SIZES.md), color: COLORS.textSecondary, marginTop: wxSc(SPACING.md) },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: wxSc(SPACING.md),
    paddingTop: wxSc(SPACING.xl + SPACING.lg),
    paddingBottom: wxSc(SPACING.sm),
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
    backgroundColor: COLORS.backgroundCard,
  },
  headerWeb: { paddingTop: wxSc(SPACING.lg) },
  backButton: { width: wxSc(70) },
  backButtonText: { fontSize: wxMs(FONT_SIZES.lg), color: COLORS.primary, fontWeight: "600" },
  headerTitle: { fontSize: wxMs(FONT_SIZES.lg), fontWeight: "700", color: COLORS.text, letterSpacing: 1 },
  permissionBanner: {
    marginHorizontal: wxSc(SPACING.md), marginTop: wxSc(SPACING.md),
    backgroundColor: "#FEF3C7", borderRadius: RADIUS.lg,
    borderWidth: 1, borderColor: "#F59E0B", overflow: "hidden",
  },
  permissionContent: { flexDirection: "row", alignItems: "center", padding: wxSc(SPACING.md), gap: wxSc(SPACING.sm) },
  permissionIcon: { fontSize: wxMs(24) },
  permissionTextContainer: { flex: 1 },
  permissionTitle: { fontSize: wxMs(FONT_SIZES.sm), fontWeight: "700", color: "#92400E" },
  permissionSubtitle: { fontSize: wxMs(FONT_SIZES.xs), color: "#A16207", marginTop: wxSc(2) },
  permissionArrow: { fontSize: wxMs(FONT_SIZES.lg), color: "#A16207" },
  errorBanner: {
    marginHorizontal: wxSc(SPACING.md), marginTop: wxSc(SPACING.md),
    backgroundColor: COLORS.error + "15", borderRadius: RADIUS.md,
    padding: wxSc(SPACING.md), flexDirection: "row",
    justifyContent: "space-between", alignItems: "center",
  },
  errorText: { fontSize: wxMs(FONT_SIZES.sm), color: COLORS.error, flex: 1 },
  retryText: { fontSize: wxMs(FONT_SIZES.sm), color: COLORS.primary, fontWeight: "600" },
  scrollContent: { flex: 1 },
  sectionDescription: {
    fontSize: wxMs(FONT_SIZES.sm), color: COLORS.textSecondary,
    lineHeight: wxMs(FONT_SIZES.sm) * 1.5,
    paddingHorizontal: wxSc(SPACING.md),
    paddingTop: wxSc(SPACING.md),
    paddingBottom: wxSc(SPACING.sm),
  },
  section: {
    marginHorizontal: wxSc(SPACING.md), marginTop: wxSc(SPACING.md),
    backgroundColor: COLORS.surface, borderRadius: RADIUS.lg,
    borderWidth: 1, borderColor: COLORS.border, overflow: "hidden",
  },
  sectionTitle: {
    fontSize: wxMs(FONT_SIZES.xs), fontWeight: "700",
    color: COLORS.textMuted, letterSpacing: 1,
    paddingHorizontal: wxSc(SPACING.md),
    paddingTop: wxSc(SPACING.md),
    paddingBottom: wxSc(SPACING.sm),
  },
  preferenceRow: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: wxSc(SPACING.md),
    paddingVertical: wxSc(SPACING.md),
    gap: wxSc(SPACING.md),
  },
  preferenceRowBorder: { borderBottomWidth: 1, borderBottomColor: COLORS.border },
  preferenceInfo: { flex: 1 },
  preferenceHeader: { flexDirection: "row", alignItems: "center", gap: wxSc(SPACING.sm), marginBottom: wxSc(4) },
  preferenceIcon: { fontSize: wxMs(18) },
  preferenceLabel: { fontSize: wxMs(FONT_SIZES.md), fontWeight: "600", color: COLORS.text },
  preferenceLabelDisabled: { color: COLORS.textMuted },
  smsDisclosure: {
    paddingHorizontal: wxSc(SPACING.md),
    paddingVertical: wxSc(SPACING.sm),
    backgroundColor: COLORS.background,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  smsDisclosureText: {
    fontSize: wxMs(FONT_SIZES.xs),
    color: COLORS.textMuted,
    lineHeight: wxMs(FONT_SIZES.xs) * 1.5,
  },
  testSmsBtn: {
    margin: wxSc(SPACING.md),
    paddingVertical: wxSc(SPACING.sm),
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  testSmsBtnDisabled: { opacity: 0.4 },
  testSmsText: { fontSize: wxMs(FONT_SIZES.sm), fontWeight: "700", color: COLORS.primary },
  phoneInput: {
    marginTop: wxSc(SPACING.xs),
    marginLeft: wxSc(26),
    paddingHorizontal: wxSc(SPACING.sm),
    paddingVertical: wxSc(SPACING.sm),
    backgroundColor: COLORS.background,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    fontSize: wxMs(FONT_SIZES.md),
    color: COLORS.text,
  },
  // ── Verification flow ──
  verifyBlock: {
    paddingHorizontal: wxSc(SPACING.md),
    paddingVertical: wxSc(SPACING.md),
  },
  fieldLabel: {
    fontSize: wxMs(FONT_SIZES.sm),
    fontWeight: "600",
    color: COLORS.text,
    marginBottom: wxSc(SPACING.xs),
  },
  fieldHint: {
    fontSize: wxMs(FONT_SIZES.xs),
    color: COLORS.textSecondary,
    lineHeight: wxMs(FONT_SIZES.xs) * 1.5,
    marginBottom: wxSc(SPACING.xs),
  },
  phoneRow: { flexDirection: "row", alignItems: "center", gap: wxSc(SPACING.sm) },
  countryPrefix: {
    paddingHorizontal: wxSc(SPACING.sm),
    paddingVertical: wxSc(SPACING.sm),
    backgroundColor: COLORS.background,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  countryPrefixText: { fontSize: wxMs(FONT_SIZES.md), fontWeight: "600", color: COLORS.text },
  phoneInputFlex: { flex: 1, marginTop: 0, marginLeft: 0 },
  primaryBtn: {
    marginTop: wxSc(SPACING.md),
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.md,
    paddingVertical: wxSc(SPACING.md),
    alignItems: "center",
    justifyContent: "center",
    minHeight: wxSc(48),
  },
  primaryBtnDisabled: { opacity: 0.4 },
  primaryBtnText: { fontSize: wxMs(FONT_SIZES.md), fontWeight: "700", color: "#fff" },
  resendRow: { alignItems: "center", marginTop: wxSc(SPACING.md) },
  resendMuted: { fontSize: wxMs(FONT_SIZES.sm), color: COLORS.textMuted },
  resendActive: { fontSize: wxMs(FONT_SIZES.sm), fontWeight: "700", color: COLORS.primary },
  // Compact verified card: ✅  Phone Verified / •••• 5766 / sub / Change link.
  verifiedCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: wxSc(SPACING.sm),
    marginHorizontal: wxSc(SPACING.md),
    marginVertical: wxSc(SPACING.sm),
    paddingHorizontal: wxSc(SPACING.md),
    paddingVertical: wxSc(SPACING.sm),
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.success + "14",
    borderWidth: 1,
    borderColor: COLORS.success + "40",
  },
  verifiedCheck: { fontSize: wxMs(FONT_SIZES.lg), marginTop: wxSc(1) },
  verifiedBody: { flex: 1 },
  verifiedTitle: { fontSize: wxMs(FONT_SIZES.sm), fontWeight: "700", color: COLORS.success },
  verifiedPhone: { fontSize: wxMs(FONT_SIZES.md), fontWeight: "700", color: COLORS.text, marginTop: wxSc(1) },
  verifiedSub: { fontSize: wxMs(FONT_SIZES.xs), color: COLORS.textSecondary, marginTop: wxSc(2) },
  changeLink: { fontSize: wxMs(FONT_SIZES.sm), fontWeight: "700", color: COLORS.primary },
  changeLinkRow: { alignItems: "center", marginTop: wxSc(SPACING.md) },
  verifiedChangeBtn: { marginTop: wxSc(SPACING.sm), alignSelf: "flex-start" },
  preferenceDescription: {
    fontSize: wxMs(FONT_SIZES.xs), color: COLORS.textSecondary,
    lineHeight: wxMs(FONT_SIZES.xs) * 1.5,
    paddingLeft: wxSc(26),
  },
  quickActionRow: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: wxSc(SPACING.md),
    paddingVertical: wxSc(SPACING.md),
    gap: wxSc(SPACING.sm),
  },
  quickActionDivider: { height: 1, backgroundColor: COLORS.border, marginHorizontal: wxSc(SPACING.md) },
  quickActionIcon: { fontSize: wxMs(18) },
  quickActionText: { fontSize: wxMs(FONT_SIZES.md), fontWeight: "500", color: COLORS.primary },
  footer: {
    paddingHorizontal: wxSc(SPACING.md),
    paddingTop: wxSc(SPACING.lg),
    paddingBottom: wxSc(SPACING.md),
  },
  footerText: {
    fontSize: wxMs(FONT_SIZES.xs), color: COLORS.textMuted,
    lineHeight: wxMs(FONT_SIZES.xs) * 1.6, textAlign: "center",
  },
  deviceSettingsLink: { alignItems: "center", marginTop: wxSc(SPACING.sm) },
  deviceSettingsText: { fontSize: wxMs(FONT_SIZES.xs), color: COLORS.primary, fontWeight: "600" },
  bottomSpacer: { height: wxSc(SPACING.xl * 2) },
});