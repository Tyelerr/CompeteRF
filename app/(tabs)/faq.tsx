// app/(tabs)/faq.tsx

import { useEffect, useState } from "react";
import {
  Linking,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { supabase } from "../../src/lib/supabase";
import { COLORS } from "../../src/theme/colors";
import { RADIUS, SPACING } from "../../src/theme/spacing";
import { FONT_SIZES } from "../../src/theme/typography";
import { FAQ_DATA } from "../../src/utils/faq-data";
import { ContactModal } from "../../src/views/components/faq/ContactModal";
import { PrivacyModal } from "../../src/views/components/faq/PrivacyModal";
import { TermsModal } from "../../src/views/components/faq/TermsModal";

const isWeb = Platform.OS === "web";

export default function FaqScreen() {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const [showAllQuestions, setShowAllQuestions] = useState(false);
  const [contactVisible, setContactVisible] = useState(false);
  const [termsVisible, setTermsVisible] = useState(false);
  const [privacyVisible, setPrivacyVisible] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);

  useEffect(() => {
    checkUser();
  }, []);

  const checkUser = async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    setUser(session?.user || null);
    if (session?.user) {
      const { data } = await supabase
        .from("profiles")
        .select("id, id_auto, username, first_name, last_name, name")
        .eq("id", session.user.id)
        .maybeSingle();
      setProfile(data);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await checkUser();
    setRefreshing(false);
  };

  const toggleExpand = (index: number) => {
    setExpandedIndex(expandedIndex === index ? null : index);
  };

  return (
    <>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={isWeb ? styles.scrollContentWeb : undefined}
        refreshControl={
          isWeb ? undefined : (
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={COLORS.primary}
            />
          )
        }
        showsVerticalScrollIndicator={false}
      >
        <View style={isWeb ? styles.webInner : styles.mobileInner}>
          {/* Header */}
          <View style={[styles.header, isWeb && styles.headerWeb]}>
            <Text style={styles.headerTitle}>FAQ</Text>
            <Text style={styles.headerSubtitle}>
              Frequently Asked Questions
            </Text>
          </View>

          {/* FAQ List */}
          <View style={styles.section}>
            {FAQ_DATA.slice(0, showAllQuestions ? FAQ_DATA.length : 4).map(
              (item, index) => (
                <TouchableOpacity
                  key={index}
                  style={styles.faqItem}
                  onPress={() => toggleExpand(index)}
                  activeOpacity={0.7}
                >
                  <View style={styles.faqHeader}>
                    <Text style={styles.faqQuestion}>{item.question}</Text>
                    <Text style={styles.faqIcon}>
                      {expandedIndex === index ? "−" : "+"}
                    </Text>
                  </View>
                  {expandedIndex === index && (
                    <Text style={styles.faqAnswer}>{item.answer}</Text>
                  )}
                </TouchableOpacity>
              ),
            )}

            {FAQ_DATA.length > 4 && (
              <TouchableOpacity
                style={styles.moreQuestionsButton}
                onPress={() => setShowAllQuestions(!showAllQuestions)}
              >
                <Text style={styles.moreQuestionsText}>
                  {showAllQuestions
                    ? "− Show Less"
                    : `+ More Questions (${FAQ_DATA.length - 4})`}
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Contact Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>📬 CONTACT US</Text>
            <View style={styles.contactCard}>
              <Text style={styles.contactText}>
                {
                  "Can't find what you're looking for? Have feedback or questions?"
                }
              </Text>
              <TouchableOpacity
                style={styles.sendButton}
                onPress={() => setContactVisible(true)}
              >
                <Text style={styles.sendButtonText}>Send Us a Message</Text>
              </TouchableOpacity>
              <View style={styles.emailDivider} />
              <Text style={styles.emailLabel}>Or email us directly:</Text>
              <TouchableOpacity
                onPress={() =>
                  Linking.openURL("mailto:support@thecompeteapp.com")
                }
                style={styles.emailLink}
              >
                <Text style={styles.contactEmail}>
                  support@thecompeteapp.com
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Legal Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>📄 LEGAL</Text>
            <View style={styles.legalCard}>
              <TouchableOpacity
                style={styles.legalRow}
                onPress={() => setTermsVisible(true)}
                activeOpacity={0.7}
              >
                <Text style={styles.legalRowText}>Terms of Service</Text>
                <Text style={styles.legalRowChevron}>›</Text>
              </TouchableOpacity>
              <View style={styles.legalDivider} />
              <TouchableOpacity
                style={styles.legalRow}
                onPress={() => setPrivacyVisible(true)}
                activeOpacity={0.7}
              >
                <Text style={styles.legalRowText}>Privacy Policy</Text>
                <Text style={styles.legalRowChevron}>›</Text>
              </TouchableOpacity>
              <View style={styles.legalDivider} />
              <TouchableOpacity
                style={styles.legalRow}
                onPress={() => setTermsVisible(true)}
                activeOpacity={0.7}
              >
                <Text style={styles.legalRowText}>
                  Acceptable Use & Content Policy
                </Text>
                <Text style={styles.legalRowChevron}>›</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* App Info */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>📱 APP INFO</Text>
            <View style={styles.infoCard}>
              <Text style={styles.infoText}>Compete v1.0.0</Text>
              <Text style={styles.infoText}>© 2026 Compete</Text>
            </View>
          </View>

          <View style={styles.bottomSpacer} />
        </View>
      </ScrollView>

      <ContactModal
        visible={contactVisible}
        onClose={() => setContactVisible(false)}
        user={user}
        profile={profile}
      />

      <TermsModal
        visible={termsVisible}
        onClose={() => setTermsVisible(false)}
      />

      <PrivacyModal
        visible={privacyVisible}
        onClose={() => setPrivacyVisible(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  scrollView: { flex: 1, backgroundColor: COLORS.background },
  scrollContentWeb: { alignItems: "center", paddingBottom: SPACING.xl },
  webInner: { width: "100%" as any, maxWidth: 860 },
  mobileInner: { flex: 1 },

  header: {
    padding: SPACING.md,
    paddingTop: SPACING.xl + SPACING.lg,
    paddingBottom: SPACING.sm,
  },
  headerWeb: { paddingTop: SPACING.lg },
  headerTitle: {
    fontSize: FONT_SIZES.xl,
    fontWeight: "700",
    color: COLORS.text,
  },
  headerSubtitle: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
  },

  section: { paddingHorizontal: SPACING.md, paddingBottom: SPACING.md },
  sectionTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: "600",
    color: COLORS.textSecondary,
    marginBottom: SPACING.md,
  },

  faqItem: {
    backgroundColor: COLORS.backgroundCard,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  faqHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  faqQuestion: {
    fontSize: FONT_SIZES.md,
    fontWeight: "600",
    color: COLORS.text,
    flex: 1,
    paddingRight: SPACING.sm,
  },
  faqIcon: {
    fontSize: FONT_SIZES.xl,
    color: COLORS.primary,
    fontWeight: "600",
  },
  faqAnswer: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textSecondary,
    marginTop: SPACING.md,
    lineHeight: 22,
  },
  moreQuestionsButton: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
    borderStyle: "dashed",
  },
  moreQuestionsText: {
    fontSize: FONT_SIZES.md,
    color: COLORS.primary,
    fontWeight: "600",
  },

  contactCard: {
    backgroundColor: COLORS.backgroundCard,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
  },
  contactText: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textSecondary,
    marginBottom: SPACING.lg,
    textAlign: "center",
    lineHeight: 22,
  },
  sendButton: {
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.xl,
    alignItems: "center",
    width: "100%" as any,
  },
  sendButtonText: {
    color: "#FFFFFF",
    fontSize: FONT_SIZES.md,
    fontWeight: "600",
  },
  emailDivider: {
    height: 1,
    backgroundColor: COLORS.border,
    width: "100%" as any,
    marginTop: SPACING.lg,
    marginBottom: SPACING.md,
  },
  emailLabel: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textMuted,
    textAlign: "center",
    marginBottom: SPACING.xs,
  },
  emailLink: { alignItems: "center" },
  contactEmail: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.primary,
    textDecorationLine: "underline",
  },

  legalCard: {
    backgroundColor: COLORS.backgroundCard,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: "hidden",
  },
  legalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
  },
  legalRowText: {
    fontSize: FONT_SIZES.md,
    color: COLORS.text,
    fontWeight: "500",
  },
  legalRowChevron: {
    fontSize: 22,
    color: COLORS.textSecondary,
    fontWeight: "600",
  },
  legalDivider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginHorizontal: SPACING.lg,
  },

  infoCard: {
    backgroundColor: COLORS.backgroundCard,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
    gap: SPACING.xs,
  },
  infoText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textMuted,
  },
  bottomSpacer: { height: SPACING.xl },
});
