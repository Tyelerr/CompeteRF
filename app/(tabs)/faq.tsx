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
import { moderateScale, scale } from "../../src/utils/scaling";
import { FAQ_DATA } from "../../src/utils/faq-data";
import { ContactModal } from "../../src/views/components/faq/ContactModal";
import { PrivacyModal } from "../../src/views/components/faq/PrivacyModal";
import { TermsModal } from "../../src/views/components/faq/TermsModal";

const isWeb = Platform.OS === "web";
const wxMs = (v: number) => isWeb ? v : moderateScale(v);
const wxSc = (v: number) => isWeb ? v : scale(v);

const ICON_CONTACT = "\uD83D\uDCEC";
const ICON_LEGAL   = "\uD83D\uDCC4";
const ICON_APP     = "\uD83D\uDCF1";
const ICON_CHEVRON = "\u203A";

export default function FaqScreen() {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const [showAllQuestions, setShowAllQuestions] = useState(false);
  const [contactVisible, setContactVisible] = useState(false);
  const [termsVisible, setTermsVisible] = useState(false);
  const [privacyVisible, setPrivacyVisible] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);

  useEffect(() => { checkUser(); }, []);

  const checkUser = async () => {
    const { data: { session } } = await supabase.auth.getSession();
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

  const moreLabel = showAllQuestions
    ? "\u2212 Show Less"
    : "+ More Questions (" + (FAQ_DATA.length - 4) + ")";

  return (
    <>
      <View style={styles.container}>
        <ScrollView
          style={styles.scrollView}
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
          <View style={[styles.pageWrapper, isWeb && styles.pageWrapperWeb]}>

            <View style={[styles.header, isWeb && styles.headerWeb]}>
              <Text allowFontScaling={false} style={styles.headerTitle}>FAQ</Text>
              <Text allowFontScaling={false} style={styles.headerSubtitle}>
                Frequently Asked Questions
              </Text>
            </View>

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
                      <Text allowFontScaling={false} style={styles.faqQuestion}>{item.question}</Text>
                      <Text allowFontScaling={false} style={styles.faqIcon}>
                        {expandedIndex === index ? "\u2212" : "+"}
                      </Text>
                    </View>
                    {expandedIndex === index && (
                      <Text allowFontScaling={false} style={styles.faqAnswer}>{item.answer}</Text>
                    )}
                  </TouchableOpacity>
                ),
              )}

              {FAQ_DATA.length > 4 && (
                <TouchableOpacity
                  style={styles.moreQuestionsButton}
                  onPress={() => setShowAllQuestions(!showAllQuestions)}
                >
                  <Text allowFontScaling={false} style={styles.moreQuestionsText}>
                    {moreLabel}
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            <View style={styles.section}>
              <Text allowFontScaling={false} style={styles.sectionTitle}>{ICON_CONTACT} CONTACT US</Text>
              <View style={styles.contactCard}>
                <Text allowFontScaling={false} style={styles.contactText}>
                  {"Can't find what you're looking for? Have feedback or questions?"}
                </Text>
                <TouchableOpacity
                  style={styles.sendButton}
                  onPress={() => setContactVisible(true)}
                >
                  <Text allowFontScaling={false} style={styles.sendButtonText}>Send Us a Message</Text>
                </TouchableOpacity>
                <View style={styles.emailDivider} />
                <Text allowFontScaling={false} style={styles.emailLabel}>Or email us directly:</Text>
                <TouchableOpacity
                  onPress={() => Linking.openURL("mailto:support@thecompeteapp.com")}
                  style={styles.emailLink}
                >
                  <Text allowFontScaling={false} style={styles.contactEmail}>
                    support@thecompeteapp.com
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.section}>
              <Text allowFontScaling={false} style={styles.sectionTitle}>{ICON_LEGAL} LEGAL</Text>
              <View style={styles.legalCard}>
                <TouchableOpacity
                  style={styles.legalRow}
                  onPress={() => setTermsVisible(true)}
                  activeOpacity={0.7}
                >
                  <Text allowFontScaling={false} style={styles.legalRowText}>Terms of Service</Text>
                  <Text allowFontScaling={false} style={styles.legalRowChevron}>{ICON_CHEVRON}</Text>
                </TouchableOpacity>
                <View style={styles.legalDivider} />
                <TouchableOpacity
                  style={styles.legalRow}
                  onPress={() => setPrivacyVisible(true)}
                  activeOpacity={0.7}
                >
                  <Text allowFontScaling={false} style={styles.legalRowText}>Privacy Policy</Text>
                  <Text allowFontScaling={false} style={styles.legalRowChevron}>{ICON_CHEVRON}</Text>
                </TouchableOpacity>
                <View style={styles.legalDivider} />
                <TouchableOpacity
                  style={styles.legalRow}
                  onPress={() => setTermsVisible(true)}
                  activeOpacity={0.7}
                >
                  <Text allowFontScaling={false} style={styles.legalRowText}>
                    Acceptable Use {"&"} Content Policy
                  </Text>
                  <Text allowFontScaling={false} style={styles.legalRowChevron}>{ICON_CHEVRON}</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.section}>
              <Text allowFontScaling={false} style={styles.sectionTitle}>{ICON_APP} APP INFO</Text>
              <View style={styles.infoCard}>
                <Text allowFontScaling={false} style={styles.infoText}>Compete v1.0.4</Text>
                <Text allowFontScaling={false} style={styles.infoText}>{"© 2026 Compete"}</Text>
              </View>
            </View>

            <View style={styles.bottomSpacer} />
          </View>
        </ScrollView>
      </View>

      <ContactModal
        visible={contactVisible}
        onClose={() => setContactVisible(false)}
        user={user}
        profile={profile}
      />
      <TermsModal visible={termsVisible} onClose={() => setTermsVisible(false)} />
      <PrivacyModal visible={privacyVisible} onClose={() => setPrivacyVisible(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  scrollView: { flex: 1 },
  pageWrapper: { flex: 1 },
  pageWrapperWeb: {
    maxWidth: 860,
    width: "100%" as any,
    alignSelf: "center" as any,
  },

  header: {
    padding: wxSc(SPACING.md),
    paddingTop: wxSc(SPACING.xl + SPACING.lg),
    paddingBottom: wxSc(SPACING.sm),
    alignItems: "center",
  },
  headerWeb: { paddingTop: SPACING.lg },
  headerTitle: {
    fontSize: wxMs(FONT_SIZES.xl),
    fontWeight: "700",
    color: COLORS.text,
  },
  headerSubtitle: {
    fontSize: wxMs(FONT_SIZES.sm),
    color: COLORS.textSecondary,
    marginTop: wxSc(SPACING.xs),
  },

  section: { paddingHorizontal: wxSc(SPACING.md), paddingBottom: wxSc(SPACING.md) },
  sectionTitle: {
    fontSize: wxMs(FONT_SIZES.md),
    fontWeight: "600",
    color: COLORS.textSecondary,
    marginBottom: wxSc(SPACING.md),
  },

  faqItem: {
    backgroundColor: COLORS.backgroundCard,
    borderRadius: RADIUS.lg,
    padding: wxSc(SPACING.md),
    marginBottom: wxSc(SPACING.sm),
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  faqHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  faqQuestion: {
    fontSize: wxMs(FONT_SIZES.md),
    fontWeight: "600",
    color: COLORS.text,
    flex: 1,
    paddingRight: wxSc(SPACING.sm),
  },
  faqIcon: {
    fontSize: wxMs(FONT_SIZES.xl),
    color: COLORS.primary,
    fontWeight: "600",
  },
  faqAnswer: {
    fontSize: wxMs(FONT_SIZES.md),
    color: COLORS.textSecondary,
    marginTop: wxSc(SPACING.md),
    lineHeight: wxMs(22),
  },
  moreQuestionsButton: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: wxSc(SPACING.md),
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
    borderStyle: "dashed",
  },
  moreQuestionsText: {
    fontSize: wxMs(FONT_SIZES.md),
    color: COLORS.primary,
    fontWeight: "600",
  },

  contactCard: {
    backgroundColor: COLORS.backgroundCard,
    borderRadius: RADIUS.lg,
    padding: wxSc(SPACING.lg),
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
  },
  contactText: {
    fontSize: wxMs(FONT_SIZES.md),
    color: COLORS.textSecondary,
    marginBottom: wxSc(SPACING.lg),
    textAlign: "center",
    lineHeight: wxMs(22),
  },
  sendButton: {
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.md,
    paddingVertical: wxSc(SPACING.md),
    paddingHorizontal: wxSc(SPACING.xl),
    alignItems: "center",
    width: "100%" as any,
  },
  sendButtonText: {
    color: COLORS.white,
    fontSize: wxMs(FONT_SIZES.md),
    fontWeight: "600",
  },
  emailDivider: {
    height: 1,
    backgroundColor: COLORS.border,
    width: "100%" as any,
    marginTop: wxSc(SPACING.lg),
    marginBottom: wxSc(SPACING.md),
  },
  emailLabel: {
    fontSize: wxMs(FONT_SIZES.sm),
    color: COLORS.textMuted,
    textAlign: "center",
    marginBottom: wxSc(SPACING.xs),
  },
  emailLink: { alignItems: "center" },
  contactEmail: {
    fontSize: wxMs(FONT_SIZES.sm),
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
    paddingVertical: wxSc(SPACING.md),
    paddingHorizontal: wxSc(SPACING.lg),
  },
  legalRowText: {
    fontSize: wxMs(FONT_SIZES.md),
    color: COLORS.text,
    fontWeight: "500",
  },
  legalRowChevron: {
    fontSize: wxMs(22),
    color: COLORS.textSecondary,
    fontWeight: "600",
  },
  legalDivider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginHorizontal: wxSc(SPACING.lg),
  },

  infoCard: {
    backgroundColor: COLORS.backgroundCard,
    borderRadius: RADIUS.lg,
    padding: wxSc(SPACING.lg),
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
    gap: wxSc(SPACING.xs),
  },
  infoText: {
    fontSize: wxMs(FONT_SIZES.sm),
    color: COLORS.textMuted,
  },
  bottomSpacer: { height: wxSc(SPACING.xl) },
});