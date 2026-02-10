// app/(tabs)/compose-message.tsx
// ═══════════════════════════════════════════════════════════
// Compose Message - Send to TD, Bar Owner, or Compete Support
// Support messages go to ALL compete_admin users (shared inbox)
// ═══════════════════════════════════════════════════════════

import { useRouter } from "expo-router";
import { useCallback, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import {
  conversationService,
  RecipientOption,
} from "../../src/models/services/conversation.service";
import { useAuthContext } from "../../src/providers/AuthProvider";
import { COLORS } from "../../src/theme/colors";
import { RADIUS, SPACING } from "../../src/theme/spacing";
import { FONT_SIZES } from "../../src/theme/typography";

const RECIPIENT_TYPES = [
  { value: "tournament_director", label: "Tournament Director", icon: "🏆" },
  { value: "bar_owner", label: "Bar Owner", icon: "🏢" },
  { value: "support", label: "Compete Support", icon: "📢" },
];

const CATEGORIES = [
  { value: "tournament_issues", label: "Tournament Issues" },
  { value: "report_problem", label: "Report a Problem" },
  { value: "feedback_suggestions", label: "Feedback / Suggestions" },
  { value: "account_issues", label: "Account Issues" },
  { value: "fargo_rating", label: "Fargo Rating Questions" },
  { value: "become_td", label: "Become a Tournament Director" },
  { value: "tournament_submission", label: "Tournament Submission" },
  { value: "general", label: "General" },
  { value: "other", label: "Other" },
];

export default function ComposeMessageScreen() {
  const router = useRouter();
  const { user } = useAuthContext();

  // ── Form state ──
  const [recipientType, setRecipientType] = useState<string | null>(null);
  const [showRecipientDropdown, setShowRecipientDropdown] = useState(false);

  const [selectedRecipient, setSelectedRecipient] =
    useState<RecipientOption | null>(null);
  const [recipientSearch, setRecipientSearch] = useState("");
  const [recipientResults, setRecipientResults] = useState<RecipientOption[]>(
    [],
  );
  const [isSearchingRecipient, setIsSearchingRecipient] = useState(false);
  const [showRecipientResults, setShowRecipientResults] = useState(false);

  const [category, setCategory] = useState<string | null>(null);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);

  const [tournamentSearch, setTournamentSearch] = useState("");
  const [tournamentResults, setTournamentResults] = useState<
    { id: number; name: string; venue_name: string }[]
  >([]);
  const [selectedTournament, setSelectedTournament] = useState<{
    id: number;
    name: string;
  } | null>(null);
  const [showTournamentResults, setShowTournamentResults] = useState(false);

  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [isSending, setIsSending] = useState(false);

  // ── Close all dropdowns ──
  const closeAllDropdowns = () => {
    setShowRecipientDropdown(false);
    setShowCategoryPicker(false);
    setShowRecipientResults(false);
    setShowTournamentResults(false);
  };

  // ── Search recipients (starts at 1 char, only TDs and bar owners) ──
  const handleRecipientSearch = useCallback(
    async (query: string) => {
      setRecipientSearch(query);
      if (query.length < 1) {
        setRecipientResults([]);
        setShowRecipientResults(false);
        return;
      }
      setIsSearchingRecipient(true);
      setShowRecipientResults(true);
      try {
        // Only search the selected role type
        const roleFilter =
          recipientType === "tournament_director"
            ? ["tournament_director"]
            : ["bar_owner"];

        const results = await conversationService.searchRecipients(
          query,
          roleFilter,
        );
        setRecipientResults(
          results.filter((r: RecipientOption) => r.id !== user?.id),
        );
      } catch (err) {
        console.error("Search error:", err);
      } finally {
        setIsSearchingRecipient(false);
      }
    },
    [user?.id, recipientType],
  );

  // ── Search tournaments (starts at 1 char) ──
  const handleTournamentSearch = useCallback(async (query: string) => {
    setTournamentSearch(query);
    if (query.length < 1) {
      setTournamentResults([]);
      setShowTournamentResults(false);
      return;
    }
    setShowTournamentResults(true);
    try {
      const results = await conversationService.searchTournaments(query);
      setTournamentResults(results);
    } catch (err) {
      console.error("Tournament search error:", err);
    }
  }, []);

  // ── Validation ──
  const isFormValid =
    message.trim().length > 0 &&
    recipientType !== null &&
    (recipientType === "support" || selectedRecipient !== null);

  // ── Send ──
  const handleSend = async () => {
    if (!user?.id || !isFormValid) return;

    setIsSending(true);
    try {
      const convoId = await conversationService.createConversation({
        createdBy: user.id,
        recipientId: recipientType === "support" ? null : selectedRecipient!.id,
        subject: subject.trim() || undefined,
        category: category || "general",
        tournamentId: selectedTournament?.id,
        isSupport: recipientType === "support",
        firstMessage: message.trim(),
      });

      console.log("Conversation created:", convoId);

      // Clear form
      setRecipientType(null);
      setSelectedRecipient(null);
      setRecipientSearch("");
      setCategory(null);
      setSelectedTournament(null);
      setTournamentSearch("");
      setSubject("");
      setMessage("");

      Alert.alert("Message Sent!", "Your message has been delivered.", [
        { text: "OK", onPress: () => router.back() },
      ]);
    } catch (err) {
      console.error("Send error:", err);
      Alert.alert("Error", "Failed to send message. Please try again.");
    } finally {
      setIsSending(false);
    }
  };

  const getRoleLabel = (role: string): string => {
    switch (role) {
      case "tournament_director":
        return "TD";
      case "bar_owner":
        return "Venue Owner";
      default:
        return "";
    }
  };

  const selectedRecipientTypeLabel = RECIPIENT_TYPES.find(
    (r) => r.value === recipientType,
  );

  // Does this recipient type need a person search?
  const needsPersonSearch =
    recipientType === "tournament_director" || recipientType === "bar_owner";

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>New Message</Text>
      </View>

      <ScrollView
        style={styles.form}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.formContent}
      >
        {/* ═══ TO - Dropdown ═══ */}
        <Text style={styles.sectionLabel}>TO</Text>
        <TouchableOpacity
          style={styles.dropdownButton}
          onPress={() => {
            closeAllDropdowns();
            setShowRecipientDropdown(!showRecipientDropdown);
          }}
        >
          <Text
            style={[
              styles.dropdownButtonText,
              !recipientType && styles.dropdownPlaceholder,
            ]}
          >
            {selectedRecipientTypeLabel
              ? `${selectedRecipientTypeLabel.icon} ${selectedRecipientTypeLabel.label}`
              : "Select recipient type"}
          </Text>
          <Text style={styles.dropdownArrow}>
            {showRecipientDropdown ? "▲" : "▼"}
          </Text>
        </TouchableOpacity>

        {showRecipientDropdown && (
          <View style={styles.dropdown}>
            {RECIPIENT_TYPES.map((rt) => (
              <TouchableOpacity
                key={rt.value}
                style={[
                  styles.dropdownOption,
                  recipientType === rt.value && styles.dropdownOptionActive,
                ]}
                onPress={() => {
                  setRecipientType(rt.value);
                  setShowRecipientDropdown(false);
                  // Reset person selection when switching types
                  setSelectedRecipient(null);
                  setRecipientSearch("");
                  setRecipientResults([]);
                }}
              >
                <Text
                  style={[
                    styles.dropdownOptionText,
                    recipientType === rt.value &&
                      styles.dropdownOptionTextActive,
                  ]}
                >
                  {rt.icon} {rt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Person search (only for TD or Bar Owner) */}
        {needsPersonSearch && !selectedRecipient && (
          <View style={styles.searchFieldWrapper}>
            <TextInput
              style={styles.searchInput}
              value={recipientSearch}
              onChangeText={handleRecipientSearch}
              placeholder={`Search ${recipientType === "tournament_director" ? "tournament directors" : "bar owners"} by name...`}
              placeholderTextColor={COLORS.textMuted}
              onFocus={() => {
                closeAllDropdowns();
                if (recipientSearch.length >= 1) setShowRecipientResults(true);
              }}
            />
            {showRecipientResults && recipientResults.length > 0 && (
              <View style={styles.autocompleteDropdown}>
                <ScrollView
                  nestedScrollEnabled
                  keyboardShouldPersistTaps="handled"
                  style={styles.autocompleteScroll}
                >
                  {recipientResults.map((r) => (
                    <TouchableOpacity
                      key={r.id}
                      style={styles.autocompleteItem}
                      onPress={() => {
                        setSelectedRecipient(r);
                        setRecipientResults([]);
                        setShowRecipientResults(false);
                        setRecipientSearch("");
                      }}
                    >
                      <Text style={styles.autocompleteItemName}>{r.name}</Text>
                      <Text style={styles.autocompleteItemRole}>
                        {getRoleLabel(r.role)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}
            {recipientSearch.length >= 1 &&
              recipientResults.length === 0 &&
              !isSearchingRecipient && (
                <Text style={styles.noResults}>No results found</Text>
              )}
          </View>
        )}

        {/* Selected recipient badge */}
        {needsPersonSearch && selectedRecipient && (
          <View style={styles.selectedBadge}>
            <Text style={styles.selectedBadgeText}>
              {selectedRecipient.name}
            </Text>
            <TouchableOpacity
              onPress={() => {
                setSelectedRecipient(null);
                setRecipientSearch("");
              }}
            >
              <Text style={styles.removeBadge}>✕</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Support note (no usernames, goes to all admins) */}
        {recipientType === "support" && (
          <View style={styles.supportNote}>
            <Text style={styles.supportNoteText}>
              Your message will be sent to the Compete support team
            </Text>
          </View>
        )}

        {/* ═══ CATEGORY ═══ */}
        <Text style={styles.sectionLabel}>CATEGORY</Text>
        <TouchableOpacity
          style={styles.dropdownButton}
          onPress={() => {
            closeAllDropdowns();
            setShowCategoryPicker(!showCategoryPicker);
          }}
        >
          <Text
            style={[
              styles.dropdownButtonText,
              !category && styles.dropdownPlaceholder,
            ]}
          >
            {category
              ? CATEGORIES.find((c) => c.value === category)?.label
              : "Select a category"}
          </Text>
          <Text style={styles.dropdownArrow}>
            {showCategoryPicker ? "▲" : "▼"}
          </Text>
        </TouchableOpacity>

        {showCategoryPicker && (
          <View style={styles.dropdown}>
            <ScrollView
              nestedScrollEnabled
              keyboardShouldPersistTaps="handled"
              style={styles.dropdownScroll}
            >
              {CATEGORIES.map((cat) => (
                <TouchableOpacity
                  key={cat.value}
                  style={[
                    styles.dropdownOption,
                    category === cat.value && styles.dropdownOptionActive,
                  ]}
                  onPress={() => {
                    setCategory(cat.value);
                    setShowCategoryPicker(false);
                  }}
                >
                  <Text
                    style={[
                      styles.dropdownOptionText,
                      category === cat.value && styles.dropdownOptionTextActive,
                    ]}
                  >
                    {cat.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* ═══ TOURNAMENT (optional) ═══ */}
        <Text style={styles.sectionLabel}>
          TOURNAMENT <Text style={styles.optionalText}>(optional)</Text>
        </Text>
        {!selectedTournament ? (
          <View style={styles.searchFieldWrapper}>
            <TextInput
              style={styles.searchInput}
              value={tournamentSearch}
              onChangeText={handleTournamentSearch}
              placeholder="Search tournaments..."
              placeholderTextColor={COLORS.textMuted}
              onFocus={() => {
                closeAllDropdowns();
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
                        setSelectedTournament({ id: t.id, name: t.name });
                        setTournamentResults([]);
                        setShowTournamentResults(false);
                        setTournamentSearch("");
                      }}
                    >
                      <Text style={styles.autocompleteItemName}>
                        🏆 {t.name}
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
              🏆 {selectedTournament.name}
            </Text>
            <TouchableOpacity onPress={() => setSelectedTournament(null)}>
              <Text style={styles.removeBadge}>✕</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ═══ SUBJECT (optional) ═══ */}
        <Text style={styles.sectionLabel}>
          SUBJECT <Text style={styles.optionalText}>(optional)</Text>
        </Text>
        <TextInput
          style={styles.input}
          value={subject}
          onChangeText={setSubject}
          placeholder="Brief subject line..."
          placeholderTextColor={COLORS.textMuted}
          maxLength={100}
          onFocus={closeAllDropdowns}
        />

        {/* ═══ MESSAGE ═══ */}
        <Text style={styles.sectionLabel}>MESSAGE</Text>
        <TextInput
          style={[styles.input, styles.messageInput]}
          value={message}
          onChangeText={setMessage}
          placeholder="Type your message..."
          placeholderTextColor={COLORS.textMuted}
          multiline
          numberOfLines={6}
          textAlignVertical="top"
          maxLength={2000}
          onFocus={closeAllDropdowns}
        />
        <Text style={styles.charCount}>{message.length}/2000</Text>

        {/* Spacer for bottom buttons */}
        <View style={styles.formBottomSpacer} />
      </ScrollView>

      {/* ═══ Fixed Bottom Buttons ═══ */}
      <View style={styles.bottomBar}>
        <TouchableOpacity
          style={[
            styles.bottomButton,
            styles.sendButton,
            (!isFormValid || isSending) && styles.buttonDisabled,
          ]}
          onPress={handleSend}
          disabled={!isFormValid || isSending}
        >
          <Text style={styles.sendButtonText}>
            {isSending ? "Sending..." : "Send Message"}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.bottomButton, styles.cancelButton]}
          onPress={() => router.back()}
        >
          <Text style={styles.cancelButtonText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },

  // ── Header ──
  header: {
    alignItems: "center",
    paddingTop: SPACING.xl + SPACING.lg,
    paddingBottom: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: "700",
    color: COLORS.text,
  },

  // ── Form ──
  form: {
    flex: 1,
  },
  formContent: {
    padding: SPACING.md,
  },
  sectionLabel: {
    fontSize: FONT_SIZES.xs,
    fontWeight: "700",
    color: COLORS.textSecondary,
    letterSpacing: 1,
    marginTop: SPACING.lg,
    marginBottom: SPACING.sm,
  },
  optionalText: {
    fontWeight: "400",
    color: COLORS.textMuted,
    letterSpacing: 0,
    fontSize: FONT_SIZES.xs,
  },

  // ── Dropdowns ──
  dropdownButton: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  dropdownButtonText: {
    fontSize: FONT_SIZES.md,
    color: COLORS.text,
  },
  dropdownPlaceholder: {
    color: COLORS.textMuted,
  },
  dropdownArrow: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textMuted,
  },
  dropdown: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginTop: 4,
    zIndex: 100,
    elevation: 10,
    overflow: "hidden",
  },
  dropdownScroll: {
    maxHeight: 280,
  },
  dropdownOption: {
    padding: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  dropdownOptionActive: {
    backgroundColor: COLORS.primary + "20",
  },
  dropdownOptionText: {
    fontSize: FONT_SIZES.md,
    color: COLORS.text,
  },
  dropdownOptionTextActive: {
    color: COLORS.primary,
    fontWeight: "600",
  },

  // ── Search / Autocomplete ──
  searchFieldWrapper: {
    position: "relative",
    zIndex: 50,
  },
  searchInput: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    fontSize: FONT_SIZES.md,
    color: COLORS.text,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginTop: SPACING.sm,
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
    maxHeight: 220,
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
  noResults: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textMuted,
    textAlign: "center",
    marginTop: SPACING.md,
  },

  // ── Selected badge ──
  selectedBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.primary + "20",
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    marginTop: SPACING.sm,
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
  supportNote: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginTop: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  supportNoteText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    textAlign: "center",
  },

  // ── Inputs ──
  input: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    fontSize: FONT_SIZES.md,
    color: COLORS.text,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  messageInput: {
    minHeight: 140,
  },
  charCount: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    textAlign: "right",
    marginTop: 4,
  },
  formBottomSpacer: {
    height: 120,
  },

  // ── Fixed bottom buttons ──
  bottomBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    padding: SPACING.md,
    paddingBottom: SPACING.xl,
    backgroundColor: COLORS.background,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    gap: SPACING.sm,
  },
  bottomButton: {
    flex: 1,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.md,
    alignItems: "center",
    justifyContent: "center",
  },
  sendButton: {
    backgroundColor: COLORS.primary,
  },
  sendButtonText: {
    fontSize: FONT_SIZES.md,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  cancelButton: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cancelButtonText: {
    fontSize: FONT_SIZES.md,
    fontWeight: "600",
    color: COLORS.textSecondary,
  },
  buttonDisabled: {
    opacity: 0.4,
  },
});
