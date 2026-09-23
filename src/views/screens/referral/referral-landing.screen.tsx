// src/views/screens/referral/referral-landing.screen.tsx
// Landing page for thecompeteapp.com/r/<CODE>. Always shows a page first (no automatic
// App Store bounce): who invited them, the code (for manual entry after installing the app,
// since deferred deep linking isn't available), and Create Account / Log In / Get the App.

import { useRouter } from "expo-router";
import React from "react";
import { ActivityIndicator, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { APP_STORE_URL, PLAY_STORE_URL } from "../../../models/constants/app-stores";
import { COLORS } from "../../../theme/colors";
import { RADIUS, SPACING } from "../../../theme/spacing";
import { FONT_SIZES } from "../../../theme/typography";
import { webMs, webSc } from "../../../utils/scaling";
import { useReferralLanding } from "../../../viewmodels/useReferralLanding";
import { Button } from "../../components/common/button";

const isWeb = Platform.OS === "web";

const platformFlags = () => {
  if (!isWeb || typeof navigator === "undefined") return { isIOS: Platform.OS === "ios", isAndroid: Platform.OS === "android" };
  const ua = navigator.userAgent || "";
  return { isIOS: /iPhone|iPad|iPod/i.test(ua), isAndroid: /Android/i.test(ua) };
};

export function ReferralLandingScreen({ code: rawCode }: { code?: string }) {
  const router = useRouter();
  const vm = useReferralLanding(rawCode);
  const { isIOS, isAndroid } = platformFlags();
  const isPhoneBrowser = isWeb && (isIOS || isAndroid);

  const goHome = () => router.replace("/(tabs)" as any);
  const openStore = (url: string) => Linking.openURL(url).catch(() => {});

  let body: React.ReactNode;

  if (vm.state === "loading" || vm.state === "claiming") {
    body = <ActivityIndicator color={COLORS.primary} style={st.spinner} />;
  } else if (vm.state === "invalid") {
    body = (
      <>
        <Text allowFontScaling={false} style={st.title}>Invite not found</Text>
        <Text allowFontScaling={false} style={st.body}>{"This invite link isn't valid anymore. You can still explore Compete."}</Text>
        <View style={st.actions}>
          <Button title="Explore Compete" onPress={goHome} fullWidth />
        </View>
      </>
    );
  } else if (vm.state === "guest") {
    body = (
      <>
        <Text allowFontScaling={false} style={st.eyebrow}>{"YOU'RE INVITED"}</Text>
        <Text allowFontScaling={false} style={st.title}>Join Compete</Text>
        {vm.inviter ? (
          <Text allowFontScaling={false} style={st.inviter}>Invited by {vm.inviter}</Text>
        ) : null}
        <Text allowFontScaling={false} style={st.body}>Find pool tournaments near you and play in them.</Text>

        <View style={st.codeBox}>
          <Text allowFontScaling={false} style={st.codeLabel}>REFERRAL CODE</Text>
          <Text allowFontScaling={false} style={st.codeText} selectable>{vm.code}</Text>
          <Text allowFontScaling={false} style={st.codeHint}>Signing up in the app? Enter this code when you create your account.</Text>
        </View>

        <View style={st.actions}>
          <Button title="Create Account" onPress={() => router.push("/auth/register" as any)} fullWidth />
          <Button title="Log In" variant="outline" onPress={() => router.push("/auth/login" as any)} fullWidth />
          {isWeb && isPhoneBrowser ? (
            <Button title="Get the App" variant="secondary" onPress={() => openStore(isIOS ? APP_STORE_URL : PLAY_STORE_URL)} fullWidth />
          ) : null}
        </View>

        {isWeb && !isPhoneBrowser ? (
          <View style={st.storeRow}>
            <Text allowFontScaling={false} style={st.storeLead}>Get the app:</Text>
            <Pressable onPress={() => openStore(APP_STORE_URL)}>
              <Text allowFontScaling={false} style={st.storeLink}>App Store</Text>
            </Pressable>
            <Text allowFontScaling={false} style={st.storeLead}>·</Text>
            <Pressable onPress={() => openStore(PLAY_STORE_URL)}>
              <Text allowFontScaling={false} style={st.storeLink}>Google Play</Text>
            </Pressable>
          </View>
        ) : null}
      </>
    );
  } else {
    body = (
      <>
        <Text allowFontScaling={false} style={st.title}>{vm.state === "claimed" ? "Welcome!" : "Invite link"}</Text>
        {vm.message ? <Text allowFontScaling={false} style={st.body}>{vm.message}</Text> : null}
        <View style={st.actions}>
          <Button title="Continue" onPress={goHome} fullWidth />
        </View>
      </>
    );
  }

  return (
    <ScrollView style={st.page} contentContainerStyle={st.pageContent}>
      <View style={st.card}>
        <Text allowFontScaling={false} style={st.brand}>{"🎱"}  Compete</Text>
        {body}
      </View>
    </ScrollView>
  );
}

const st = StyleSheet.create({
  page: { flex: 1, backgroundColor: COLORS.background },
  pageContent: { flexGrow: 1, alignItems: "center", justifyContent: "center", padding: webSc(SPACING.md) },
  card: {
    width: "100%",
    maxWidth: 440,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: webSc(SPACING.lg),
  },
  brand: { fontSize: webMs(FONT_SIZES.md), fontWeight: "700", color: COLORS.textSecondary, textAlign: "center", marginBottom: webSc(SPACING.md) },
  spinner: { marginVertical: webSc(SPACING.xl) },
  eyebrow: { fontSize: webMs(FONT_SIZES.xs), fontWeight: "700", color: COLORS.secondary, letterSpacing: 1.2, textAlign: "center" },
  title: { fontSize: webMs(FONT_SIZES.xxl), fontWeight: "800", color: COLORS.text, textAlign: "center", marginTop: webSc(SPACING.xs) },
  inviter: { fontSize: webMs(FONT_SIZES.md), fontWeight: "600", color: COLORS.primaryLight, textAlign: "center", marginTop: webSc(SPACING.xs) },
  body: { fontSize: webMs(FONT_SIZES.sm), color: COLORS.textSecondary, textAlign: "center", marginTop: webSc(SPACING.sm) },
  codeBox: {
    marginTop: webSc(SPACING.md),
    alignItems: "center",
    backgroundColor: COLORS.primary + "14",
    borderColor: COLORS.primary + "55",
    borderWidth: 1,
    borderRadius: RADIUS.md,
    paddingVertical: webSc(SPACING.sm + SPACING.xs),
    paddingHorizontal: webSc(SPACING.md),
  },
  codeLabel: { fontSize: webMs(FONT_SIZES.xs - 2), fontWeight: "700", color: COLORS.textSecondary, letterSpacing: 1 },
  codeText: { fontSize: webMs(FONT_SIZES.xxl), fontWeight: "800", color: COLORS.text, letterSpacing: 2, marginTop: 2 },
  codeHint: { fontSize: webMs(FONT_SIZES.xs), color: COLORS.textSecondary, textAlign: "center", marginTop: webSc(SPACING.xs) },
  actions: { marginTop: webSc(SPACING.md), gap: webSc(SPACING.sm) },
  storeRow: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: webSc(SPACING.xs + 2), marginTop: webSc(SPACING.md) },
  storeLead: { fontSize: webMs(FONT_SIZES.xs), color: COLORS.textMuted },
  storeLink: { fontSize: webMs(FONT_SIZES.xs), fontWeight: "600", color: COLORS.primaryLight },
});
