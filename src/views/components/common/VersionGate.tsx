// src/views/components/common/VersionGate.tsx
// Native "Update required" screen (minimum-version gate). Rendered once at the root; shows
// nothing unless app_config says this build is below the platform minimum. Full-screen and
// non-dismissible (the Android back button is swallowed while it shows); Update opens the
// platform store, Check Again re-reads the config (so raising and then LOWERING the minimum
// releases users without a new build). Web never renders it.

import { useEffect } from "react";
import { ActivityIndicator, BackHandler, Image, Linking, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { COLORS } from "../../../theme/colors";
import { RADIUS, SPACING } from "../../../theme/spacing";
import { FONT_SIZES } from "../../../theme/typography";
import { webMs, webSc } from "../../../utils/scaling";
import { useVersionGate } from "../../../viewmodels/hooks/use.version.gate";

export const VersionGate = () => {
  const { result, checking, recheck } = useVersionGate();
  const blocked = result.status === "update_required";

  useEffect(() => {
    if (!blocked) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => true);
    return () => sub.remove();
  }, [blocked]);

  if (result.status !== "update_required") return null;
  const { message, storeUrl } = result;

  return (
    <View style={styles.overlay} accessibilityViewIsModal>
      <Image source={require("../../../../assets/images/icon.png")} style={styles.logo} resizeMode="contain" />
      <Text allowFontScaling={false} style={styles.title}>Update required</Text>
      <Text allowFontScaling={false} style={styles.message}>{message}</Text>
      {storeUrl ? (
        <TouchableOpacity style={styles.primary} onPress={() => void Linking.openURL(storeUrl)} activeOpacity={0.85}>
          <Text allowFontScaling={false} style={styles.primaryText}>Update</Text>
        </TouchableOpacity>
      ) : null}
      <TouchableOpacity style={styles.secondary} onPress={() => void recheck()} disabled={checking} activeOpacity={0.7}>
        {checking ? (
          <ActivityIndicator color={COLORS.textSecondary} />
        ) : (
          <Text allowFontScaling={false} style={styles.secondaryText}>Check again</Text>
        )}
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 998,
    elevation: 998,
    backgroundColor: COLORS.background,
    alignItems: "center",
    justifyContent: "center",
    padding: SPACING.xl,
  },
  logo: { width: webSc(96), height: webSc(96), marginBottom: SPACING.lg },
  title: { fontSize: webMs(FONT_SIZES.xxl), fontWeight: "800", color: COLORS.text, marginBottom: SPACING.sm },
  message: {
    fontSize: webMs(FONT_SIZES.md),
    color: COLORS.textSecondary,
    textAlign: "center",
    maxWidth: webSc(360),
    marginBottom: SPACING.xl,
  },
  primary: {
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.md,
    alignItems: "center",
    alignSelf: "stretch",
    maxWidth: webSc(360),
    width: "100%",
  },
  primaryText: { color: COLORS.white, fontWeight: "700", fontSize: webMs(FONT_SIZES.lg) },
  secondary: { marginTop: SPACING.md, paddingVertical: SPACING.sm, paddingHorizontal: SPACING.lg, minHeight: webSc(40), justifyContent: "center" },
  secondaryText: { color: COLORS.textSecondary, fontWeight: "600", fontSize: webMs(FONT_SIZES.md) },
});
