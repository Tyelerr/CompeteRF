import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { supabase } from "../../src/lib/supabase";
import { COLORS } from "../../src/theme/colors";
import { RADIUS, SPACING } from "../../src/theme/spacing";
import { FONT_SIZES } from "../../src/theme/typography";
import { FAQ_DATA } from "../../src/utils/faq-data";
import { SUPPORT_CATEGORIES } from "../../src/utils/support-categories";
import { Button } from "../../src/views/components/common/button";
import { Dropdown } from "../../src/views/components/common/dropdown";
import { KeyboardAwareView } from "../../src/views/components/common/keyboard-aware-view";

export default function FaqScreen() {
  const router = useRouter();
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const [showAllQuestions, setShowAllQuestions] = useState(false);
  const [showContactForm, setShowContactForm] = useState(false);

  // Form state
  const [category, setCategory] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);

  // Tournament search state
  const [tournamentSearch, setTournamentSearch] = useState("");
  const [tournamentResults, setTournamentResults] = useState<
    { id: number; name: string; venue_name: string }[]
  >([]);
  const [selectedTournament, setSelectedTournament] = useState<{
    id: number;
    name: string;
  } | null>(null);
  const [showTournamentResults, setShowTournamentResults] = useState(false);

  useEffect(() => {
    checkUser();
  }, []);

  const checkUser = async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    setUser(session?.user || null);

    if (session?.user) {
      const { data: profileData, error } = await supabase
        .from("profiles")
        .select("id, id_auto, username, first_name, last_name, name")
        .eq("id", session.user.id)
        .maybeSingle();

      if (error) console.log("Profile fetch error:", error);
      setProfile(profileData);
    }
  };

  const toggleExpand = (index: number) => {
    setExpandedIndex(expandedIndex === index ? null : index);
  };

  // ── Tournament search (starts at 1 char) ──
  const handleTournamentSearch = useCallback(async (query: string) => {
    setTournamentSearch(query);
    if (query.length < 1) {
      setTournamentResults([]);
      setShowTournamentResults(false);
      return;
    }
    setShowTournamentResults(true);
    try {
      const { data, error } = await supabase
        .from("tournaments")
        .select("id, name, venues(venue)")
        .ilike("name", `%${query}%`)
        .limit(15);

      if (error) throw error;

      setTournamentResults(
        (data || []).map(
          (t: { id: number; name: string; venues: unknown }) => ({
            id: t.id,
            name: t.name,
            venue_name:
              (t.venues as { venue: string } | null)?.venue || "Unknown Venue",
          }),
        ),
      );
    } catch (err) {
      console.error("Tournament search error:", err);
    }
  }, []);

  const getDisplayName = (): string => {
    if (profile?.username) return `@${profile.username}`;
    if (profile?.first_name)
      return `${profile.first_name} ${profile.last_name || ""}`.trim();
    if (profile?.name) return profile.name;
    if (user?.email) return user.email;
    return "Unknown";
  };

  const handleSendMessage = async () => {
    if (!category) {
      Alert.alert("Error", "Please select a category.");
      return;
    }

    if (!subject.trim()) {
      Alert.alert("Error", "Please enter a subject.");
      return;
    }

    if (!message.trim()) {
      Alert.alert("Error", "Please enter a message.");
      return;
    }

    if (!user) {
      Alert.alert("Login Required", "Please log in to send a message.", [
        { text: "Cancel", style: "cancel" },
        { text: "Log In", onPress: () => router.push("/auth/login") },
      ]);
      return;
    }

    setSending(true);
    try {
      const fullSubject = selectedTournament
        ? `${subject.trim()} - Tournament: ${selectedTournament.name}`
        : subject.trim();

      // support_tickets.user_id is an integer (id_auto), not UUID
      if (!profile?.id_auto) {
        Alert.alert(
          "Error",
          "Could not find your profile. Please try logging out and back in.",
        );
        setSending(false);
        return;
      }

      const { error } = await supabase.from("support_tickets").insert({
        user_id: profile.id_auto,
        subject: fullSubject,
        description: message.trim(),
        category: category,
        status: "open",
        priority: "normal",
      });

      if (error) throw error;

      Alert.alert(
        "Success",
        "Your message has been sent! We'll get back to you soon.",
      );
      resetForm();
    } catch (err: any) {
      console.error("FAQ send error:", err);
      Alert.alert("Error", err.message || "Failed to send message.");
    } finally {
      setSending(false);
    }
  };

  const resetForm = () => {
    setShowContactForm(false);
    setCategory("");
    setSubject("");
    setMessage("");
    setSelectedTournament(null);
    setTournamentSearch("");
    setTournamentResults([]);
    setShowTournamentResults(false);
  };

  return (
    <KeyboardAwareView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>FAQ</Text>
        <Text style={styles.headerSubtitle}>Frequently Asked Questions</Text>
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
                  {expandedIndex === index ? "-" : "+"}
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
                ? "- Show Less"
                : `+ More Questions (${FAQ_DATA.length - 4})`}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Contact Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{"\uD83D\uDCEC"} CONTACT US</Text>

        {!showContactForm ? (
          <View style={styles.contactCard}>
            <Text style={styles.contactText}>
              {
                "Can't find what you're looking for? Have feedback or questions?"
              }
            </Text>
            <Button
              title="Send Us a Message"
              onPress={() => setShowContactForm(true)}
              fullWidth
            />
            <View style={styles.emailDivider} />
            <Text style={styles.emailLabel}>Or email us directly:</Text>
            <TouchableOpacity
              onPress={() =>
                Linking.openURL("mailto:support@thecompeteapp.com")
              }
              style={styles.emailLink}
            >
              <Text style={styles.contactEmail}>support@thecompeteapp.com</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.contactForm}>
            {/* User Info */}
            {user ? (
              <View style={styles.userInfo}>
                <Text style={styles.userInfoLabel}>Sending as:</Text>
                <Text style={styles.userInfoValue}>{getDisplayName()}</Text>
              </View>
            ) : (
              <View style={styles.userInfo}>
                <Text style={styles.userInfoWarning}>
                  Please log in to send a message.
                </Text>
                <Button
                  title="Log In"
                  onPress={() => router.push("/auth/login")}
                  variant="outline"
                />
              </View>
            )}

            {/* Category Dropdown */}
            <Dropdown
              label="Category"
              placeholder="Select a Category"
              options={SUPPORT_CATEGORIES.map((c) => ({
                label: c.label,
                value: c.value,
              }))}
              value={category}
              onSelect={(val: string) => {
                setCategory(val);
                if (val !== "tournament" && val !== "tournament_submission") {
                  setSelectedTournament(null);
                  setTournamentSearch("");
                  setTournamentResults([]);
                  setShowTournamentResults(false);
                }
              }}
            />

            {/* Subject (required) */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>
                Subject <Text style={styles.requiredStar}>*</Text>
              </Text>
              <TextInput
                style={styles.input}
                value={subject}
                onChangeText={setSubject}
                placeholder="Brief description of your issue..."
                placeholderTextColor={COLORS.textMuted}
                maxLength={100}
              />
            </View>

            {/* Tournament Search (only for tournament-related categories) */}
            {(category === "tournament" ||
              category === "tournament_submission") && (
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>
                  Tournament <Text style={styles.optionalText}>(optional)</Text>
                </Text>
                {!selectedTournament ? (
                  <View style={styles.searchWrapper}>
                    <TextInput
                      style={styles.input}
                      value={tournamentSearch}
                      onChangeText={handleTournamentSearch}
                      placeholder="Search tournaments..."
                      placeholderTextColor={COLORS.textMuted}
                      onFocus={() => {
                        if (tournamentSearch.length >= 1)
                          setShowTournamentResults(true);
                      }}
                    />
                    {showTournamentResults && tournamentResults.length > 0 && (
                      <View style={styles.autocompleteDropdown}>
                        <ScrollView
                          nestedScrollEnabled
                          keyboardShouldPersistTaps="handled"
                          style={styles.autocompleteScroll}
                        >
                          {tournamentResults.map((t) => (
                            <TouchableOpacity
                              key={t.id}
                              style={styles.autocompleteItem}
                              onPress={() => {
                                setSelectedTournament({
                                  id: t.id,
                                  name: t.name,
                                });
                                setTournamentResults([]);
                                setShowTournamentResults(false);
                                setTournamentSearch("");
                              }}
                            >
                              <Text style={styles.autocompleteItemName}>
                                {"\uD83C\uDFC6"} {t.name}
                              </Text>
                              <Text style={styles.autocompleteItemRole}>
                                {t.venue_name}
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </ScrollView>
                      </View>
                    )}
                  </View>
                ) : (
                  <View style={styles.selectedBadge}>
                    <Text style={styles.selectedBadgeText}>
                      {"\uD83C\uDFC6"} {selectedTournament.name}
                    </Text>
                    <TouchableOpacity
                      onPress={() => setSelectedTournament(null)}
                    >
                      <Text style={styles.removeBadge}>{"\u2715"}</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            )}

            {/* Message */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>
                Message <Text style={styles.requiredStar}>*</Text>
              </Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={message}
                onChangeText={setMessage}
                placeholder="Describe your issue or question..."
                placeholderTextColor={COLORS.textMuted}
                multiline
                numberOfLines={5}
                textAlignVertical="top"
                maxLength={2000}
              />
              <Text style={styles.charCount}>{message.length}/2000</Text>
            </View>

            {/* Buttons */}
            <View style={styles.formButtons}>
              <Button title="Cancel" onPress={resetForm} variant="outline" />
              <View style={styles.buttonSpacer} />
              <Button
                title="Send Message"
                onPress={handleSendMessage}
                loading={sending}
                disabled={!user}
              />
            </View>
          </View>
        )}
      </View>

      {/* Legal Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{"\uD83D\uDCC4"} LEGAL</Text>
        <View style={styles.legalCard}>
          <TouchableOpacity
            style={styles.legalRow}
            onPress={() => router.push("/legal/terms")}
            activeOpacity={0.7}
          >
            <Text style={styles.legalRowText}>Terms of Service</Text>
            <Text style={styles.legalRowChevron}>{"\u203A"}</Text>
          </TouchableOpacity>

          <View style={styles.legalDivider} />

          <TouchableOpacity
            style={styles.legalRow}
            onPress={() => router.push("/legal/privacy")}
            activeOpacity={0.7}
          >
            <Text style={styles.legalRowText}>Privacy Policy</Text>
            <Text style={styles.legalRowChevron}>{"\u203A"}</Text>
          </TouchableOpacity>

          <View style={styles.legalDivider} />

          <TouchableOpacity
            style={styles.legalRow}
            onPress={() => router.push("/legal/terms")}
            activeOpacity={0.7}
          >
            <Text style={styles.legalRowText}>
              Acceptable Use & Content Policy
            </Text>
            <Text style={styles.legalRowChevron}>{"\u203A"}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* App Info */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{"\uD83D\uDCF1"} APP INFO</Text>
        <View style={styles.infoCard}>
          <Text style={styles.infoText}>CompeteRF v1.0.0</Text>
          <Text style={styles.infoText}>{"\u00A9"} 2026 CompeteRF</Text>
        </View>
      </View>

      <View style={styles.bottomSpacer} />
    </KeyboardAwareView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    padding: SPACING.md,
    paddingTop: SPACING.xl + SPACING.lg,
  },
  headerTitle: {
    fontSize: FONT_SIZES.xl,
    fontWeight: "700",
    color: COLORS.text,
  },
  headerSubtitle: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
  },
  section: {
    padding: SPACING.md,
  },
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
  },
  contactText: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textSecondary,
    marginBottom: SPACING.md,
    textAlign: "center",
  },
  emailDivider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginTop: SPACING.md,
    marginBottom: SPACING.sm,
  },
  emailLabel: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textMuted,
    textAlign: "center",
    marginBottom: SPACING.xs,
  },
  emailLink: {
    marginTop: SPACING.md,
    alignItems: "center",
  },
  contactEmail: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.primary,
    textAlign: "center",
    textDecorationLine: "underline",
  },
  contactForm: {
    backgroundColor: COLORS.backgroundCard,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  userInfo: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  userInfoLabel: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textMuted,
    marginBottom: SPACING.xs,
  },
  userInfoValue: {
    fontSize: FONT_SIZES.md,
    color: COLORS.primary,
    fontWeight: "600",
  },
  userInfoWarning: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.warning,
    marginTop: SPACING.xs,
  },
  inputGroup: {
    marginBottom: SPACING.md,
  },
  inputLabel: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.text,
    marginBottom: SPACING.xs,
    fontWeight: "500",
  },
  requiredStar: {
    color: "#E74C3C",
    fontWeight: "700",
  },
  optionalText: {
    fontWeight: "400",
    color: COLORS.textMuted,
    fontSize: FONT_SIZES.xs,
  },
  input: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    fontSize: FONT_SIZES.md,
    color: COLORS.text,
  },
  inputHint: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    marginTop: SPACING.xs,
  },
  charCount: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    textAlign: "right",
    marginTop: 4,
  },
  textArea: {
    minHeight: 120,
  },

  // ── Tournament search ──
  searchWrapper: {
    position: "relative",
    zIndex: 50,
  },
  autocompleteDropdown: {
    position: "absolute",
    top: "100%",
    left: 0,
    right: 0,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.primary + "60",
    marginTop: 2,
    zIndex: 999,
    elevation: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    overflow: "hidden",
  },
  autocompleteScroll: {
    maxHeight: 200,
  },
  autocompleteItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  autocompleteItemName: {
    fontSize: FONT_SIZES.md,
    color: COLORS.text,
    fontWeight: "500",
    flex: 1,
  },
  autocompleteItemRole: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    marginLeft: SPACING.sm,
  },
  selectedBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.primary + "20",
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.primary + "40",
  },
  selectedBadgeText: {
    fontSize: FONT_SIZES.md,
    color: COLORS.text,
    fontWeight: "600",
    flex: 1,
  },
  removeBadge: {
    fontSize: FONT_SIZES.lg,
    color: COLORS.textMuted,
    paddingLeft: SPACING.sm,
  },

  formButtons: {
    flexDirection: "row",
    marginTop: SPACING.sm,
  },
  buttonSpacer: {
    width: SPACING.md,
  },

  // ── Legal ──
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

  // ── App Info ──
  infoCard: {
    backgroundColor: COLORS.backgroundCard,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
  },
  infoText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textMuted,
    marginBottom: SPACING.xs,
  },
  bottomSpacer: {
    height: SPACING.xl,
  },
});
