// app/account-deletion.tsx
import { Stack } from "expo-router";
import { Linking, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { COLORS } from "@/src/theme/colors";
import { RADIUS, SPACING } from "@/src/theme/spacing";
import { FONT_SIZES } from "@/src/theme/typography";

const isWeb = Platform.OS === "web";

const STEPS = [
  { step: "1", title: "Open the Compete app", body: "Launch the Compete app on your iOS or Android device and make sure you are logged in to the account you want to delete." },
  { step: "2", title: "Go to your Profile", body: "Tap the Profile tab in the bottom navigation bar to open your profile page." },
  { step: "3", title: "Tap Edit Profile", body: "Tap the Edit Profile button on your profile page to open the profile editor." },
  { step: "4", title: "Scroll to Danger Zone", body: "Scroll to the bottom of the Edit Profile screen until you see the Danger Zone section with a red divider." },
  { step: "5", title: "Tap Delete Account", body: "Tap the Delete Account button. A confirmation dialog will appear asking you to confirm your decision." },
  { step: "6", title: "Confirm deletion", body: "Type the confirmation text as prompted and tap the final confirm button. Your account and all associated data will be permanently deleted. This action cannot be undone." },
];

export default function AccountDeletionPage() {
  return (
    <>
      <Stack.Screen options={{ title: "Delete Account", headerShown: false }} />
      <View style={styles.wrapper}>
        {isWeb && (
          <View style={styles.webHeader}>
            <View style={styles.webHeaderInner}>
              <Text style={styles.webHeaderLogo} onPress={() => { if (typeof window !== "undefined") window.location.href = "/"; }}>Compete</Text>
              <View style={styles.webHeaderLinks}>
                <Text style={styles.webHeaderLink} onPress={() => { if (typeof window !== "undefined") window.location.href = "/privacy"; }}>Privacy</Text>
                <Text style={styles.webHeaderLink} onPress={() => { if (typeof window !== "undefined") window.location.href = "/support"; }}>Support</Text>
              </View>
            </View>
          </View>
        )}
        <ScrollView style={styles.scroll} contentContainerStyle={[styles.scrollContent, isWeb && styles.scrollContentWeb]} showsVerticalScrollIndicator={false}>
          <View style={isWeb ? styles.webInner : styles.mobileInner}>
            <Text style={styles.pageTitle}>Delete Your Account</Text>
            <Text style={styles.pageSubtitle}>How to permanently delete your Compete account and all associated data</Text>

            <View style={styles.warningCard}>
              <Text style={styles.warningIcon}>{"\u26A0\uFE0F"}</Text>
              <View style={styles.warningText}>
                <Text style={styles.warningTitle}>This action is permanent</Text>
                <Text style={styles.warningBody}>Deleting your account will permanently remove all your data including your profile, favorites, giveaway entries, and tournament submissions. This cannot be undone.</Text>
              </View>
            </View>

            <Text style={styles.sectionTitle}>Steps to Delete Your Account</Text>
            {STEPS.map((item) => (
              <View key={item.step} style={styles.stepItem}>
                <View style={styles.stepBadge}>
                  <Text style={styles.stepNumber}>{item.step}</Text>
                </View>
                <View style={styles.stepContent}>
                  <Text style={styles.stepTitle}>{item.title}</Text>
                  <Text style={styles.stepBody}>{item.body}</Text>
                </View>
              </View>
            ))}

            <View style={styles.contactCard}>
              <Text style={styles.contactTitle}>Need Help?</Text>
              <Text style={styles.contactBody}>
                If you are unable to access your account or need assistance with account deletion, contact our support team and we will delete your account manually within 30 days.
              </Text>
              <TouchableOpacity style={styles.emailBtn} onPress={() => Linking.openURL("mailto:support@thecompeteapp.com?subject=Account Deletion Request")}>
                <Text style={styles.emailBtnText}>Request deletion by email</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.dataCard}>
              <Text style={styles.dataTitle}>What data gets deleted</Text>
              {[
                "Your profile information (name, photo, date of birth)",
                "Your email address and login credentials",
                "Your saved favorites and search alerts",
                "Your giveaway entries and history",
                "Your tournament submissions and listings",
                "Your support ticket history",
              ].map((item, i) => (
                <View key={i} style={styles.dataItem}>
                  <Text style={styles.dataCheck}>{"\u2713"}</Text>
                  <Text style={styles.dataItemText}>{item}</Text>
                </View>
              ))}
            </View>

            {isWeb && (
              <View style={styles.webFooter}>
                <Text style={styles.webFooterText}>{"\u00A9"} 2026 AZ Tech Guys LLC. All rights reserved.</Text>
                <View style={styles.webFooterLinks}>
                  <Text style={styles.webFooterLink} onPress={() => { if (typeof window !== "undefined") window.location.href = "/privacy"; }}>Privacy Policy</Text>
                  <Text style={styles.webFooterDot}>{"\u00B7"}</Text>
                  <Text style={styles.webFooterLink} onPress={() => { if (typeof window !== "undefined") window.location.href = "/terms"; }}>Terms of Service</Text>
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
  webHeader: { backgroundColor: COLORS.background, borderBottomWidth: 1, borderBottomColor: COLORS.border, alignItems: "center" },
  webHeaderInner: { width: "100%" as any, maxWidth: 860, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 24, paddingVertical: 16 },
  webHeaderLogo: { color: COLORS.primary, fontSize: 20, fontWeight: "700", letterSpacing: 0.5, cursor: "pointer" as any },
  webHeaderLinks: { flexDirection: "row", gap: 24 } as any,
  webHeaderLink: { color: COLORS.textSecondary, fontSize: 14, fontWeight: "500", cursor: "pointer" as any },
  scroll: { flex: 1 },
  scrollContent: { padding: SPACING.lg, paddingBottom: SPACING.xl * 2 },
  scrollContentWeb: { alignItems: "center" },
  webInner: { width: "100%" as any, maxWidth: 860 },
  mobileInner: { flex: 1 },
  pageTitle: { color: COLORS.text, fontSize: 28, fontWeight: "700", marginBottom: SPACING.xs },
  pageSubtitle: { color: COLORS.textSecondary, fontSize: FONT_SIZES.md, marginBottom: SPACING.lg },
  warningCard: { backgroundColor: COLORS.error + "15", borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.error + "40", padding: SPACING.lg, marginBottom: SPACING.xl, flexDirection: "row", alignItems: "flex-start", gap: SPACING.md } as any,
  warningIcon: { fontSize: 24 },
  warningText: { flex: 1 },
  warningTitle: { color: COLORS.error, fontSize: FONT_SIZES.md, fontWeight: "700", marginBottom: SPACING.xs },
  warningBody: { color: COLORS.textSecondary, fontSize: FONT_SIZES.sm, lineHeight: 22 },
  sectionTitle: { color: COLORS.text, fontSize: FONT_SIZES.lg, fontWeight: "700", marginBottom: SPACING.md },
  stepItem: { flexDirection: "row", alignItems: "flex-start", marginBottom: SPACING.md, gap: SPACING.md } as any,
  stepBadge: { width: 32, height: 32, borderRadius: 16, backgroundColor: COLORS.primary, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  stepNumber: { color: COLORS.white, fontSize: FONT_SIZES.sm, fontWeight: "700" },
  stepContent: { flex: 1 },
  stepTitle: { color: COLORS.text, fontSize: FONT_SIZES.md, fontWeight: "600", marginBottom: SPACING.xs },
  stepBody: { color: COLORS.textSecondary, fontSize: FONT_SIZES.sm, lineHeight: 22 },
  contactCard: { backgroundColor: COLORS.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, padding: SPACING.lg, marginTop: SPACING.xl, marginBottom: SPACING.md, alignItems: "center" },
  contactTitle: { color: COLORS.text, fontSize: FONT_SIZES.lg, fontWeight: "700", marginBottom: SPACING.sm, textAlign: "center" as any },
  contactBody: { color: COLORS.textSecondary, fontSize: FONT_SIZES.sm, lineHeight: 22, marginBottom: SPACING.lg, textAlign: "center" as any, maxWidth: 480 },
  emailBtn: { backgroundColor: COLORS.error, borderRadius: RADIUS.md, paddingVertical: SPACING.md, paddingHorizontal: SPACING.xl },
  emailBtnText: { color: COLORS.white, fontSize: FONT_SIZES.md, fontWeight: "700" },
  dataCard: { backgroundColor: COLORS.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, padding: SPACING.lg, marginBottom: SPACING.md },
  dataTitle: { color: COLORS.text, fontSize: FONT_SIZES.md, fontWeight: "700", marginBottom: SPACING.md },
  dataItem: { flexDirection: "row", alignItems: "flex-start", marginBottom: SPACING.sm, gap: SPACING.sm } as any,
  dataCheck: { color: COLORS.success, fontSize: FONT_SIZES.md, fontWeight: "700" },
  dataItemText: { color: COLORS.textSecondary, fontSize: FONT_SIZES.sm, lineHeight: 22, flex: 1 },
  webFooter: { marginTop: SPACING.xl * 2, paddingTop: SPACING.lg, borderTopWidth: 1, borderTopColor: COLORS.border, alignItems: "center", gap: 8 } as any,
  webFooterText: { color: COLORS.textMuted, fontSize: FONT_SIZES.xs },
  webFooterLinks: { flexDirection: "row", alignItems: "center", gap: 8 } as any,
  webFooterLink: { color: COLORS.textSecondary, fontSize: FONT_SIZES.xs, cursor: "pointer" as any },
  webFooterDot: { color: COLORS.border, fontSize: FONT_SIZES.xs },
});