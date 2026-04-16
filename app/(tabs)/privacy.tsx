// app/(tabs)/privacy.tsx
import { PRIVACY_POLICY } from "@/src/models/constants/legal-text";
import { Stack } from "expo-router";
import { Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { COLORS } from "@/src/theme/colors";
import { SPACING } from "@/src/theme/spacing";
import { FONT_SIZES } from "@/src/theme/typography";

const isWeb = Platform.OS === "web";
type LegalSection = { heading: string; body: string };

export default function PrivacyPage() {
  return (
    <>
      <Stack.Screen options={{ title: "Privacy Policy" }} />
      <View style={styles.wrapper}>
        <ScrollView style={styles.scroll} contentContainerStyle={[styles.scrollContent, isWeb && styles.scrollContentWeb]} showsVerticalScrollIndicator={false}>
          <View style={isWeb ? styles.webInner : styles.mobileInner}>
            <Text style={styles.pageTitle}>Privacy Policy</Text>
            <Text style={styles.lastUpdated}>Effective Date: {PRIVACY_POLICY.lastUpdated}</Text>
            <Text style={styles.preamble}>{PRIVACY_POLICY.preamble}</Text>
            {PRIVACY_POLICY.sections.map((section: LegalSection, index: number) => (
              <View key={index} style={styles.section}>
                <Text style={styles.heading}>{section.heading}</Text>
                <Text style={styles.body}>{section.body}</Text>
              </View>
            ))}
            {isWeb && (
              <View style={styles.webFooter}>
                <Text style={styles.webFooterText}>{"\u00A9"} 2026 AZ Tech Guys LLC. All rights reserved.</Text>
                <View style={styles.webFooterLinks}>
                  <Text style={styles.webFooterLink} onPress={() => { if (typeof window !== "undefined") window.location.href = "/terms"; }}>Terms of Service</Text>
                  <Text style={styles.webFooterDot}>{"\u00B7"}</Text>
                  <Text style={styles.webFooterLink} onPress={() => { if (typeof window !== "undefined") window.location.href = "/community-guidelines"; }}>Community Guidelines</Text>
                  <Text style={styles.webFooterDot}>{"\u00B7"}</Text>
                  <Text style={styles.webFooterLink} onPress={() => { if (typeof window !== "undefined") window.location.href = "/support"; }}>Support</Text>
                </View>
              </View>
            )}
          </View>
        </ScrollView>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  wrapper: { flex: 1, backgroundColor: COLORS.background },
  scroll: { flex: 1 },
  scrollContent: { padding: SPACING.lg, paddingBottom: SPACING.xl * 2 },
  scrollContentWeb: { alignItems: "center" },
  webInner: { width: "100%" as any, maxWidth: 860 },
  mobileInner: { flex: 1 },
  pageTitle: { color: COLORS.text, fontSize: 28, fontWeight: "700", marginBottom: SPACING.xs },
  lastUpdated: { color: COLORS.textMuted, fontSize: FONT_SIZES.xs, marginBottom: SPACING.md },
  preamble: { color: COLORS.textSecondary, fontSize: FONT_SIZES.sm, lineHeight: 22, marginBottom: SPACING.lg },
  section: { marginBottom: SPACING.lg },
  heading: { color: COLORS.primary, fontSize: FONT_SIZES.md, fontWeight: "600", marginBottom: SPACING.xs },
  body: { color: COLORS.textSecondary, fontSize: FONT_SIZES.sm, lineHeight: 22 },
  webFooter: { marginTop: SPACING.xl * 2, paddingTop: SPACING.lg, borderTopWidth: 1, borderTopColor: COLORS.border, alignItems: "center", gap: 8 } as any,
  webFooterText: { color: COLORS.textMuted, fontSize: FONT_SIZES.xs },
  webFooterLinks: { flexDirection: "row", alignItems: "center", gap: 8 } as any,
  webFooterLink: { color: COLORS.textSecondary, fontSize: FONT_SIZES.xs, cursor: "pointer" as any },
  webFooterDot: { color: COLORS.border, fontSize: FONT_SIZES.xs },
});