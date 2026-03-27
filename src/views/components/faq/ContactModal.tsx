import { useRouter } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { supabase } from "../../../lib/supabase";
import { COLORS } from "../../../theme/colors";
import { RADIUS, SPACING } from "../../../theme/spacing";
import { FONT_SIZES } from "../../../theme/typography";
import { moderateScale, scale } from "../../../utils/scaling";
import { useAuthStore } from "../../../viewmodels/stores/auth.store";
import { SUPPORT_CATEGORIES } from "../../../utils/support-categories";
import { Dropdown } from "../common/dropdown";

const isWeb = Platform.OS === "web";

interface ContactModalProps {
  visible: boolean;
  onClose: () => void;
  user: any;
  profile: any;
}

export function ContactModal({ visible, onClose, user, profile }: ContactModalProps) {
  const router = useRouter();
  const [category, setCategory] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [tournamentSearch, setTournamentSearch] = useState("");
  const [tournamentResults, setTournamentResults] = useState<{ id: number; name: string; venue_name: string }[]>([]);
  const [selectedTournament, setSelectedTournament] = useState<{ id: number; name: string } | null>(null);
  const [showTournamentResults, setShowTournamentResults] = useState(false);

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
        (data || []).map((t: { id: number; name: string; venues: unknown }) => ({
          id: t.id,
          name: t.name,
          venue_name: (t.venues as { venue: string } | null)?.venue || "Unknown Venue",
        })),
      );
    } catch (err) {
      console.error("Tournament search error:", err);
    }
  }, []);

  const getDisplayName = (): string => {
    if (profile?.username) return `@${profile.username}`;
    if (profile?.first_name) return `${profile.first_name} ${profile.last_name || ""}`.trim();
    if (profile?.name) return profile.name;
    if (user?.email) return user.email;
    return "Unknown";
  };

  const resetForm = () => {
    setCategory("");
    setSubject("");
    setMessage("");
    setSelectedTournament(null);
    setTournamentSearch("");
    setTournamentResults([]);
    setShowTournamentResults(false);
  };

  const handleClose = () => { resetForm(); onClose(); };

  const handleSend = async () => {
    if (!category) { Alert.alert("Error", "Please select a category."); return; }
    if (!subject.trim()) { Alert.alert("Error", "Please enter a subject."); return; }
    if (!message.trim()) { Alert.alert("Error", "Please enter a message."); return; }
    if (!user) {
      Alert.alert("Sign In Required", "Sign in or create a free account to send us a message.", [
        { text: "Cancel", style: "cancel" },
        { text: "Sign In / Sign Up", onPress: () => { handleClose(); router.push("/(tabs)/profile" as any); } },
      ]);
      return;
    }
    setSending(true);
    try {
      const liveProfile = useAuthStore.getState().profile;
      let idAuto: number | undefined = liveProfile?.id_auto ?? profile?.id_auto;
      if (!idAuto) {
        const userId = liveProfile?.id ?? user?.id;
        if (userId) {
          const { data: fetchedProfile } = await supabase.from("profiles").select("id_auto").eq("id", userId).maybeSingle();
          idAuto = fetchedProfile?.id_auto;
        }
      }
      if (!idAuto) { Alert.alert("Error", "Could not load your profile. Please try again in a moment."); return; }
      const fullSubject = selectedTournament ? `${subject.trim()} - Tournament: ${selectedTournament.name}` : subject.trim();
      const { error } = await supabase.from("support_tickets").insert({ user_id: idAuto, subject: fullSubject, description: message.trim(), category, status: "open", priority: "normal" });
      if (error) throw error;
      Alert.alert("Message Sent!", "We'll get back to you soon.", [{ text: "OK", onPress: handleClose }]);
    } catch (err: any) {
      Alert.alert("Error", err.message || "Failed to send message.");
    } finally {
      setSending(false);
    }
  };

  if (!visible) return null;

  const innerContent = (
    <>
      <View style={s.header}>
        <View style={{ width: 40 }} />
        <Text allowFontScaling={false} style={s.headerTitle}>SEND US A MESSAGE</Text>
        <TouchableOpacity style={s.closeButton} onPress={handleClose}>
          <Text allowFontScaling={false} style={s.closeButtonText}>&#x2715;</Text>
        </TouchableOpacity>
      </View>
      <View style={s.divider} />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {user ? (
          <View style={s.userInfo}>
            <Text allowFontScaling={false} style={s.userInfoLabel}>Sending as</Text>
            <Text allowFontScaling={false} style={s.userInfoValue}>{getDisplayName()}</Text>
          </View>
        ) : (
          <View style={[s.userInfo, s.userInfoWarningBox]}>
            <Text allowFontScaling={false} style={s.userInfoWarning}>⚠️ You must be logged in to send a message.</Text>
          </View>
        )}
        <View style={s.fieldContainer}>
          <Text allowFontScaling={false} style={s.fieldLabel}>Category <Text style={s.required}>*</Text></Text>
          <Dropdown
            placeholder="Select a Category"
            options={SUPPORT_CATEGORIES.map((c) => ({ label: c.label, value: c.value }))}
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
        </View>
        <View style={s.fieldContainer}>
          <Text allowFontScaling={false} style={s.fieldLabel}>Subject <Text style={s.required}>*</Text></Text>
          <TextInput allowFontScaling={false} style={s.input} value={subject} onChangeText={setSubject} placeholder="Brief description of your issue..." placeholderTextColor={COLORS.textMuted} maxLength={100} />
        </View>
        {(category === "tournament" || category === "tournament_submission") && (
          <View style={s.fieldContainer}>
            <Text allowFontScaling={false} style={s.fieldLabel}>Tournament <Text style={s.optional}>(optional)</Text></Text>
            {!selectedTournament ? (
              <View style={s.searchWrapper}>
                <TextInput allowFontScaling={false} style={s.input} value={tournamentSearch} onChangeText={handleTournamentSearch} placeholder="Search tournaments..." placeholderTextColor={COLORS.textMuted} onFocus={() => { if (tournamentSearch.length >= 1) setShowTournamentResults(true); }} />
                {showTournamentResults && tournamentResults.length > 0 && (
                  <View style={s.autocompleteDropdown}>
                    <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled" style={{ maxHeight: 200 }}>
                      {tournamentResults.map((t) => (
                        <TouchableOpacity key={t.id} style={s.autocompleteItem} onPress={() => { setSelectedTournament({ id: t.id, name: t.name }); setTournamentResults([]); setShowTournamentResults(false); setTournamentSearch(""); }}>
                          <Text allowFontScaling={false} style={s.autocompleteItemName}>🏆 {t.name}</Text>
                          <Text allowFontScaling={false} style={s.autocompleteItemVenue}>{t.venue_name}</Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                )}
              </View>
            ) : (
              <View style={s.selectedBadge}>
                <Text allowFontScaling={false} style={s.selectedBadgeText}>🏆 {selectedTournament.name}</Text>
                <TouchableOpacity onPress={() => setSelectedTournament(null)}>
                  <Text allowFontScaling={false} style={s.removeBadge}>✕</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}
        <View style={s.fieldContainer}>
          <Text allowFontScaling={false} style={s.fieldLabel}>Message <Text style={s.required}>*</Text></Text>
          <TextInput allowFontScaling={false} style={[s.input, s.textArea]} value={message} onChangeText={setMessage} placeholder="Describe your issue or question..." placeholderTextColor={COLORS.textMuted} multiline numberOfLines={5} textAlignVertical="top" maxLength={2000} />
          <Text allowFontScaling={false} style={s.charCount}>{message.length}/2000</Text>
        </View>
      </ScrollView>
      <View style={s.divider} />
      <View style={s.footer}>
        <TouchableOpacity style={[s.sendButton, (!user || !category || !subject.trim() || !message.trim() || sending) && s.buttonDisabled]} onPress={handleSend} disabled={!user || !category || !subject.trim() || !message.trim() || sending}>
          {sending ? <ActivityIndicator size="small" color="#fff" /> : <Text allowFontScaling={false} style={s.sendButtonText}>Send Message</Text>}
        </TouchableOpacity>
      </View>
    </>
  );

  if (isWeb) {
    return (
      <>
        <TouchableOpacity style={s.backdrop} activeOpacity={1} onPress={handleClose} />
        <View style={s.dialogWrap} pointerEvents="box-none">
          <View style={s.dialog}>{innerContent}</View>
        </View>
      </>
    );
  }

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={handleClose}>
      <View style={s.mobileOverlay}>
        <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={handleClose} />
        <View style={s.mobileContainer}>{innerContent}</View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { position: "fixed" as any, top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.75)", zIndex: 2000 },
  dialogWrap: { position: "fixed" as any, top: 0, left: 0, right: 0, bottom: 0, zIndex: 2001, alignItems: "center", justifyContent: "center", padding: scale(SPACING.lg) },
  dialog: { width: 700, maxWidth: "92%" as any, height: "82vh" as any, backgroundColor: COLORS.background, borderRadius: RADIUS.xl, borderWidth: 1, borderColor: COLORS.border, overflow: "hidden" as any, shadowColor: "#000", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.5, shadowRadius: 24, display: "flex" as any, flexDirection: "column" },
  mobileOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.75)", justifyContent: "flex-end", alignItems: "center", paddingHorizontal: scale(SPACING.md), paddingBottom: 110 },
  mobileContainer: { backgroundColor: COLORS.background, borderRadius: RADIUS.xl, width: "100%" as any, maxWidth: 500, height: "85%" as any, overflow: "hidden" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: scale(SPACING.lg), paddingTop: scale(SPACING.lg), paddingBottom: scale(SPACING.md) },
  headerTitle: { color: COLORS.text, fontSize: moderateScale(FONT_SIZES.lg), fontWeight: "700", letterSpacing: 1 },
  closeButton: { width: 40, height: 40, justifyContent: "center", alignItems: "center" },
  closeButtonText: { color: COLORS.text, fontSize: moderateScale(20), fontWeight: "700" },
  divider: { height: 1, backgroundColor: COLORS.border },
  scrollContent: { padding: scale(SPACING.lg), paddingBottom: scale(SPACING.xl) },
  userInfo: { backgroundColor: COLORS.surface, borderRadius: RADIUS.md, padding: scale(SPACING.md), marginBottom: scale(SPACING.lg), borderWidth: 1, borderColor: COLORS.border },
  userInfoWarningBox: { borderColor: COLORS.warning + "60", backgroundColor: COLORS.warning + "10" },
  userInfoLabel: { fontSize: moderateScale(FONT_SIZES.xs), color: COLORS.textMuted, marginBottom: 2, textTransform: "uppercase", letterSpacing: 0.5 },
  userInfoValue: { fontSize: moderateScale(FONT_SIZES.md), color: COLORS.primary, fontWeight: "600" },
  userInfoWarning: { fontSize: moderateScale(FONT_SIZES.sm), color: COLORS.warning, fontWeight: "500" },
  fieldContainer: { marginBottom: scale(SPACING.lg) },
  fieldLabel: { fontSize: moderateScale(FONT_SIZES.sm), color: COLORS.text, fontWeight: "500", marginBottom: scale(SPACING.sm) },
  required: { color: COLORS.error },
  optional: { color: COLORS.textMuted, fontWeight: "400", fontSize: moderateScale(FONT_SIZES.xs) },
  input: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, paddingVertical: scale(SPACING.md), paddingHorizontal: scale(SPACING.md), fontSize: moderateScale(FONT_SIZES.md), color: COLORS.text },
  textArea: { minHeight: 120 },
  charCount: { fontSize: moderateScale(FONT_SIZES.xs), color: COLORS.textMuted, textAlign: "right", marginTop: 4 },
  searchWrapper: { position: "relative", zIndex: 50 },
  autocompleteDropdown: { position: "absolute", top: "100%" as any, left: 0, right: 0, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.primary + "60", marginTop: 2, zIndex: 999, elevation: 20, shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, overflow: "hidden" },
  autocompleteItem: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: scale(SPACING.md), borderBottomWidth: 1, borderBottomColor: COLORS.border },
  autocompleteItemName: { fontSize: moderateScale(FONT_SIZES.md), color: COLORS.text, fontWeight: "500", flex: 1 },
  autocompleteItemVenue: { fontSize: moderateScale(FONT_SIZES.xs), color: COLORS.textMuted, marginLeft: scale(SPACING.sm) },
  selectedBadge: { flexDirection: "row", alignItems: "center", backgroundColor: COLORS.primary + "20", borderRadius: RADIUS.md, paddingHorizontal: scale(SPACING.md), paddingVertical: scale(SPACING.sm), borderWidth: 1, borderColor: COLORS.primary + "40" },
  selectedBadgeText: { fontSize: moderateScale(FONT_SIZES.md), color: COLORS.text, fontWeight: "600", flex: 1 },
  removeBadge: { fontSize: moderateScale(FONT_SIZES.lg), color: COLORS.textMuted, paddingLeft: scale(SPACING.sm) },
  footer: { padding: scale(SPACING.md) },
  sendButton: { paddingVertical: scale(SPACING.md), borderRadius: RADIUS.md, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.primary },
  sendButtonText: { fontSize: moderateScale(FONT_SIZES.md), color: COLORS.white, fontWeight: "600" },
  buttonDisabled: { opacity: 0.5 },
});
