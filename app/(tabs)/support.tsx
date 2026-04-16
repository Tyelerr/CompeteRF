// app/(tabs)/support.tsx
import { Stack } from "expo-router";
import { Linking, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { COLORS } from "@/src/theme/colors";
import { RADIUS, SPACING } from "@/src/theme/spacing";
import { FONT_SIZES } from "@/src/theme/typography";

const isWeb = Platform.OS === "web";

const FAQ_ITEMS = [
  { q: "How do I create an account?", a: "Download the Compete app and tap Sign Up. You can register with your email address or sign in with Apple." },
  { q: "How do I find tournaments near me?", a: "Open the app and browse the home screen. Tournaments are listed by upcoming date. You can filter by game type, entry fee, and distance." },
  { q: "How do I favorite a tournament?", a: "Tap the heart icon on any tournament card to save it to your favorites. You can view all your favorites in your profile." },
  { q: "How do I submit a tournament listing?", a: "You must be a registered Tournament Director or Bar Owner. Go to the Submit tab in the app and fill out the tournament details form." },
  { q: "How do I become a Tournament Director?", a: "Contact the bar or venue owner where you run tournaments and ask them to add you as a director through their venue management settings." },
  { q: "How do I enter a giveaway?", a: "Navigate to the Giveaways section in the app. Tap any active giveaway and follow the entry instructions. Winners are selected randomly." },
  { q: "How do I update my profile?", a: "Go to the Profile tab, tap Edit Profile, and update your name, photo, or other details. Changes are saved immediately." },
  { q: "How do I delete my account?", a: "Go to Profile > Settings > Delete Account. This will permanently remove your account and all associated data. This action cannot be undone." },
  { q: "I found a bug or have a technical issue. What should I do?", a: "Please contact us at support@thecompeteapp.com with a description of the issue, your device type, and any screenshots if available. We aim to respond within 48 hours." },
  { q: "How do I report inappropriate content?", a: "Use the report button on any tournament listing, profile, or content within the app. You can also email us at support@thecompeteapp.com." },
];

export default function SupportPage() {
  return (
    <>
      <Stack.Screen options={{ title: "Support" }} />
      <View style={styles.wrapper}>
        <ScrollView style={styles.scroll} contentContainerStyle={[styles.scrollContent, isWeb && styles.scrollContentWeb]} showsVerticalScrollIndicator={false}>
          <View style={isWeb ? styles.webInner : styles.mobileInner}>
            <Text style={styles.pageTitle}>Support</Text>
            <Text style={styles.pageSubtitle}>How can we help you?</Text>

            <View style={styles.contactCard}>
              <View style={styles.contactIconWrap}>
                <Text style={styles.contactIcon}>{"\uD83D\uDCEC"}</Text>
              </View>
              <Text style={styles.contactTitle}>Contact Us</Text>
              <Text style={styles.contactBody}>
                For account issues, bug reports, or any questions not answered below, reach out to our support team directly. We aim to respond within 48 hours.
              </Text>
              <TouchableOpacity style={styles.emailBtn} onPress={() => Linking.openURL("mailto:support@thecompeteapp.com")}>
                <Text style={styles.emailBtnText}>support@thecompeteapp.com</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.faqTitle}>Frequently Asked Questions</Text>
            {FAQ_ITEMS.map((item, index) => (
              <View key={index} style={styles.faqItem}>
                <Text style={styles.faqQuestion}>{item.q}</Text>
                <Text style={styles.faqAnswer}>{item.a}</Text>
              </View>
            ))}

            {isWeb && (
              <View style={styles.webFooter}>
                <Text style={styles.webFooterText}>{"\u00A9"} 2026 AZ Tech Guys LLC. All rights reserved.</Text>
                <View style={styles.webFooterLinks}>
                  <Text style={styles.webFooterLink} onPress={() => { if (typeof window !== "undefined") window.location.href = "/privacy"; }}>Privacy Policy</Text>
                  <Text style={styles.webFooterDot}>{"\u00B7"}</Text>
                  <Text style={styles.webFooterLink} onPress={() => { if (typeof window !== "undefined") window.location.href = "/terms"; }}>Terms of Service</Text>
                  <Text style={styles.webFooterDot}>{"\u00B7"}</Text>
                  <Text style={styles.webFooterLink} onPress={() => { if (typeof window !== "undefined") window.location.href = "/community-guidelines"; }}>Community Guidelines</Text>
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
  pageSubtitle: { color: COLORS.textSecondary, fontSize: FONT_SIZES.md, marginBottom: SPACING.lg },
  contactCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.primary + "40",
    padding: SPACING.xl,
    marginBottom: SPACING.xl,
    alignItems: "center",
  },
  contactIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.primary + "15",
    borderWidth: 1,
    borderColor: COLORS.primary + "40",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: SPACING.md,
  },
  contactIcon: { fontSize: 24 },
  contactTitle: { color: COLORS.text, fontSize: FONT_SIZES.xl, fontWeight: "700", marginBottom: SPACING.sm, textAlign: "center" as any },
  contactBody: { color: COLORS.textSecondary, fontSize: FONT_SIZES.sm, lineHeight: 22, marginBottom: SPACING.lg, textAlign: "center" as any, maxWidth: 480 },
  emailBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.xl,
  },
  emailBtnText: { color: COLORS.white, fontSize: FONT_SIZES.md, fontWeight: "700" },
  faqTitle: { color: COLORS.text, fontSize: FONT_SIZES.lg, fontWeight: "700", marginBottom: SPACING.md },
  faqItem: { backgroundColor: COLORS.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, padding: SPACING.md, marginBottom: SPACING.sm },
  faqQuestion: { color: COLORS.primary, fontSize: FONT_SIZES.md, fontWeight: "600", marginBottom: SPACING.xs },
  faqAnswer: { color: COLORS.textSecondary, fontSize: FONT_SIZES.sm, lineHeight: 22 },
  webFooter: { marginTop: SPACING.xl * 2, paddingTop: SPACING.lg, borderTopWidth: 1, borderTopColor: COLORS.border, alignItems: "center", gap: 8 } as any,
  webFooterText: { color: COLORS.textMuted, fontSize: FONT_SIZES.xs },
  webFooterLinks: { flexDirection: "row", alignItems: "center", gap: 8 } as any,
  webFooterLink: { color: COLORS.textSecondary, fontSize: FONT_SIZES.xs, cursor: "pointer" as any },
  webFooterDot: { color: COLORS.border, fontSize: FONT_SIZES.xs },
});