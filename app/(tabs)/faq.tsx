import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  Alert,
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
  const [category, setCategory] = useState("");
  const [tournamentId, setTournamentId] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
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
      const { data: profileData } = await supabase
        .from("profiles")
        .select("id_auto, username, first_name, last_name")
        .eq("id", session.user.id)
        .single();

      setProfile(profileData);
    }
  };

  const toggleExpand = (index: number) => {
    setExpandedIndex(expandedIndex === index ? null : index);
  };

  const selectedCategory = SUPPORT_CATEGORIES.find((c) => c.value === category);
  const showTournamentId = selectedCategory?.requiresTournamentId;

  const handleSendMessage = async () => {
    if (!category) {
      Alert.alert("Error", "Please select a category.");
      return;
    }

    if (!message.trim()) {
      Alert.alert("Error", "Please enter a message.");
      return;
    }

    if (showTournamentId && !tournamentId.trim()) {
      Alert.alert("Error", "Please enter the Tournament ID.");
      return;
    }

    if (!user) {
      Alert.alert("Login Required", "Please log in to send a message.", [
        { text: "Cancel", style: "cancel" },
        { text: "Log In", onPress: () => router.push("/auth/login") },
      ]);
      return;
    }

    if (!profile) {
      Alert.alert("Error", "Please complete your profile first.");
      return;
    }

    setSending(true);
    try {
      // Build subject from category
      const categoryLabel =
        SUPPORT_CATEGORIES.find((c) => c.value === category)?.label ||
        "General";
      const subject = showTournamentId
        ? `${categoryLabel} - Tournament #${tournamentId}`
        : categoryLabel;

      const { error } = await supabase.from("support_tickets").insert({
        user_id: profile.id_auto,
        subject: subject,
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
      setCategory("");
      setTournamentId("");
      setMessage("");
      setShowContactForm(false);
    } catch (err: any) {
      Alert.alert("Error", err.message || "Failed to send message.");
    } finally {
      setSending(false);
    }
  };

  const resetForm = () => {
    setShowContactForm(false);
    setCategory("");
    setTournamentId("");
    setMessage("");
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
        <Text style={styles.sectionTitle}>📬 CONTACT US</Text>

        {!showContactForm ? (
          <View style={styles.contactCard}>
            <Text style={styles.contactText}>
              Can't find what you're looking for? Have feedback or questions?
            </Text>
            <Button
              title="Send Us a Message"
              onPress={() => setShowContactForm(true)}
              fullWidth
            />
          </View>
        ) : (
          <View style={styles.contactForm}>
            {/* User Info */}
            {profile ? (
              <View style={styles.userInfo}>
                <Text style={styles.userInfoLabel}>Sending as:</Text>
                <Text style={styles.userInfoValue}>
                  @{profile.username} ({profile.first_name} {profile.last_name})
                </Text>
              </View>
            ) : user ? (
              <View style={styles.userInfo}>
                <Text style={styles.userInfoLabel}>Sending as:</Text>
                <Text style={styles.userInfoValue}>{user.email}</Text>
                <Text style={styles.userInfoWarning}>
                  Please complete your profile for better support.
                </Text>
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
              onSelect={setCategory}
            />

            {/* Tournament ID (conditional) */}
            {showTournamentId && (
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Tournament ID</Text>
                <TextInput
                  style={styles.input}
                  value={tournamentId}
                  onChangeText={setTournamentId}
                  placeholder="Enter the tournament ID"
                  placeholderTextColor={COLORS.textMuted}
                  keyboardType="numeric"
                />
                <Text style={styles.inputHint}>
                  You can find this on the tournament detail page
                </Text>
              </View>
            )}

            {/* Message */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Message</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={message}
                onChangeText={setMessage}
                placeholder="Describe your issue or question..."
                placeholderTextColor={COLORS.textMuted}
                multiline
                numberOfLines={5}
                textAlignVertical="top"
              />
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

      {/* App Info */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>📱 APP INFO</Text>
        <View style={styles.infoCard}>
          <Text style={styles.infoText}>CompeteRF v1.0.0</Text>
          <Text style={styles.infoText}>© 2026 CompeteRF</Text>
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
  textArea: {
    minHeight: 120,
  },
  formButtons: {
    flexDirection: "row",
    marginTop: SPACING.sm,
  },
  buttonSpacer: {
    width: SPACING.md,
  },
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
