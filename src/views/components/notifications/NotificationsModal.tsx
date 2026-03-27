import { useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Alert, KeyboardAvoidingView, Modal, Platform, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { supabase } from "../../../lib/supabase";
import { ConversationPreview, RecipientOption, conversationService } from "../../../models/services/conversation.service";
import { COLORS } from "../../../theme/colors";
import { RADIUS, SPACING } from "../../../theme/spacing";
import { FONT_SIZES } from "../../../theme/typography";
import { moderateScale, scale } from "../../../utils/scaling";

const isWeb = Platform.OS === "web";

interface BroadcastNotification {
  id: string; message_id: string; read_at: string | null; created_at: string;
  notification_messages: { id: string; subject: string; body: string; message_type: string; sender_role: string; tournament_id: number | null; venue_id: number | null; created_at: string };
}
interface PushNotification {
  id: number; user_id: number; title: string; body: string; category: string | null;
  data: Record<string, any> | null; read_at: string | null; status: string; created_at: string;
}
interface UnifiedNotification {
  id: string; source: "broadcast" | "push"; title: string; body: string; read_at: string | null;
  created_at: string; badge: { label: string; color: string; icon: string }; tournament_id: number | null;
  deep_link: string | null; broadcastRecipientId?: string; pushNotificationId?: number;
}

const getTimeAgo = (dateString: string): string => {
  const now = new Date(); const date = new Date(dateString); const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000); const diffHours = Math.floor(diffMs / 3600000); const diffDays = Math.floor(diffMs / 86400000);
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

const getBroadcastBadge = (senderRole: string) => {
  switch (senderRole) {
    case "tournament_director": return { label: "Broadcast", color: "#2ECC71", icon: "📣" };
    case "bar_owner": return { label: "Broadcast", color: "#E67E22", icon: "📣" };
    case "super_admin": case "compete_admin": return { label: "Broadcast", color: "#3498DB", icon: "📣" };
    default: return { label: "Broadcast", color: "#95A5A6", icon: "📣" };
  }
};

const getPushBadge = (category: string | null) => {
  switch (category) {
    case "search_alert_match": return { label: "Search Alert", color: "#9B59B6", icon: "🔔" };
    case "tournament_update": return { label: "Tournament", color: "#2ECC71", icon: "🏆" };
    case "giveaway_update": return { label: "Giveaway", color: "#E67E22", icon: "🎁" };
    case "venue_promotion": return { label: "Venue", color: "#E67E22", icon: "🏢" };
    case "app_announcement": return { label: "Announcement", color: "#3498DB", icon: "📢" };
    case "admin_alert": return { label: "Admin", color: "#E74C3C", icon: "🚩" };
    default: return { label: "Notification", color: "#3498DB", icon: "🔔" };
  }
};

const getCategoryLabel = (cat: string | null): string => {
  const map: Record<string, string> = { tournament_issues: "Tournament Issues", report_problem: "Report a Problem", feedback_suggestions: "Feedback", account_issues: "Account", fargo_rating: "Fargo Rating", become_td: "Become a TD", tournament_submission: "Submission", general: "General", other: "Other" };
  return cat ? map[cat] || cat : "";
};

const getConvoRoleInfo = (role: string | null) => {
  switch (role) {
    case "tournament_director": return { color: "#2ECC71", icon: "🏆" };
    case "bar_owner": return { color: "#E67E22", icon: "🏢" };
    case "super_admin": case "compete_admin": return { color: "#3498DB", icon: "📢" };
    default: return { color: "#95A5A6", icon: "💬" };
  }
};

const RECIPIENT_TYPES = [
  { value: "tournament_director", label: "Tournament Director", icon: "🏆" },
  { value: "bar_owner", label: "Bar Owner", icon: "🏢" },
  { value: "support", label: "Compete Support", icon: "📢" },
];

const COMPOSE_CATEGORIES = [
  { value: "tournament_issues", label: "Tournament Issues" }, { value: "report_problem", label: "Report a Problem" },
  { value: "feedback_suggestions", label: "Feedback / Suggestions" }, { value: "account_issues", label: "Account Issues" },
  { value: "fargo_rating", label: "Fargo Rating Questions" }, { value: "become_td", label: "Become a Tournament Director" },
  { value: "tournament_submission", label: "Tournament Submission" }, { value: "general", label: "General" }, { value: "other", label: "Other" },
];

const ComposeView = ({ userId, onBack, onSent }: { userId: string; onBack: () => void; onSent: () => void }) => {
  const [recipientType, setRecipientType] = useState<string | null>(null);
  const [showRecipientDropdown, setShowRecipientDropdown] = useState(false);
  const [selectedRecipient, setSelectedRecipient] = useState<RecipientOption | null>(null);
  const [recipientSearch, setRecipientSearch] = useState("");
  const [recipientResults, setRecipientResults] = useState<RecipientOption[]>([]);
  const [isSearchingRecipient, setIsSearchingRecipient] = useState(false);
  const [showRecipientResults, setShowRecipientResults] = useState(false);
  const [category, setCategory] = useState<string | null>(null);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [tournamentSearch, setTournamentSearch] = useState("");
  const [tournamentResults, setTournamentResults] = useState<{ id: number; name: string; venue_name: string }[]>([]);
  const [selectedTournament, setSelectedTournament] = useState<{ id: number; name: string } | null>(null);
  const [showTournamentResults, setShowTournamentResults] = useState(false);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [isSending, setIsSending] = useState(false);

  const closeAllDropdowns = () => { setShowRecipientDropdown(false); setShowCategoryPicker(false); setShowRecipientResults(false); setShowTournamentResults(false); };

  const handleRecipientSearch = useCallback(async (query: string) => {
    setRecipientSearch(query);
    if (query.length < 1) { setRecipientResults([]); setShowRecipientResults(false); return; }
    setIsSearchingRecipient(true); setShowRecipientResults(true);
    try {
      const roleFilter = recipientType === "tournament_director" ? ["tournament_director"] : ["bar_owner"];
      const results = await conversationService.searchRecipients(query, roleFilter);
      setRecipientResults(results.filter((r: RecipientOption) => r.id !== userId));
    } catch (err) { console.error("Search error:", err); }
    finally { setIsSearchingRecipient(false); }
  }, [userId, recipientType]);

  const handleTournamentSearch = useCallback(async (query: string) => {
    setTournamentSearch(query);
    if (query.length < 1) { setTournamentResults([]); setShowTournamentResults(false); return; }
    setShowTournamentResults(true);
    try { const results = await conversationService.searchTournaments(query); setTournamentResults(results); }
    catch (err) { console.error("Tournament search error:", err); }
  }, []);

  const isFormValid = message.trim().length > 0 && recipientType !== null && (recipientType === "support" || selectedRecipient !== null);

  const handleSend = async () => {
    if (!isFormValid) return;
    setIsSending(true);
    try {
      await conversationService.createConversation({ createdBy: userId, recipientId: recipientType === "support" ? null : selectedRecipient!.id, subject: subject.trim() || undefined, category: category || "general", tournamentId: selectedTournament?.id, isSupport: recipientType === "support", firstMessage: message.trim() });
      Alert.alert("Message Sent!", "Your message has been delivered.", [{ text: "OK", onPress: onSent }]);
    } catch (err) { console.error("Send error:", err); Alert.alert("Error", "Failed to send message. Please try again."); }
    finally { setIsSending(false); }
  };

  const needsPersonSearch = recipientType === "tournament_director" || recipientType === "bar_owner";
  const selectedRecipientTypeLabel = RECIPIENT_TYPES.find((r) => r.value === recipientType);
  const getRoleLabel = (role: string) => { if (role === "tournament_director") return "TD"; if (role === "bar_owner") return "Venue Owner"; return ""; };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={cs.header}>
        <TouchableOpacity style={cs.backButton} onPress={onBack}><Text allowFontScaling={false} style={cs.backButtonText}>← Back</Text></TouchableOpacity>
        <Text allowFontScaling={false} style={cs.headerTitle}>New Message</Text>
        <View style={{ width: 64 }} />
      </View>
      <View style={s.divider} />
      <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled" contentContainerStyle={cs.formContent}>
        <Text allowFontScaling={false} style={cs.sectionLabel}>TO</Text>
        <TouchableOpacity style={cs.dropdownButton} onPress={() => { closeAllDropdowns(); setShowRecipientDropdown(!showRecipientDropdown); }}>
          <Text allowFontScaling={false} style={[cs.dropdownButtonText, !recipientType && cs.placeholder]}>{selectedRecipientTypeLabel ? `${selectedRecipientTypeLabel.icon} ${selectedRecipientTypeLabel.label}` : "Select recipient type"}</Text>
          <Text allowFontScaling={false} style={cs.dropdownArrow}>{showRecipientDropdown ? "▲" : "▼"}</Text>
        </TouchableOpacity>
        {showRecipientDropdown && (
          <View style={cs.dropdown}>
            {RECIPIENT_TYPES.map((rt) => (
              <TouchableOpacity key={rt.value} style={[cs.dropdownOption, recipientType === rt.value && cs.dropdownOptionActive]} onPress={() => { setRecipientType(rt.value); setShowRecipientDropdown(false); setSelectedRecipient(null); setRecipientSearch(""); setRecipientResults([]); }}>
                <Text allowFontScaling={false} style={[cs.dropdownOptionText, recipientType === rt.value && cs.dropdownOptionTextActive]}>{rt.icon} {rt.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
        {needsPersonSearch && !selectedRecipient && (
          <View style={cs.searchWrapper}>
            <TextInput allowFontScaling={false} style={cs.searchInput} value={recipientSearch} onChangeText={handleRecipientSearch} placeholder={`Search ${recipientType === "tournament_director" ? "tournament directors" : "bar owners"}...`} placeholderTextColor={COLORS.textMuted} onFocus={() => { closeAllDropdowns(); if (recipientSearch.length >= 1) setShowRecipientResults(true); }} />
            {showRecipientResults && recipientResults.length > 0 && (
              <View style={cs.autocompleteDropdown}>
                <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled" style={{ maxHeight: 180 }}>
                  {recipientResults.map((r) => (
                    <TouchableOpacity key={r.id} style={cs.autocompleteItem} onPress={() => { setSelectedRecipient(r); setRecipientResults([]); setShowRecipientResults(false); setRecipientSearch(""); }}>
                      <Text allowFontScaling={false} style={cs.autocompleteItemName}>{r.name}</Text>
                      <Text allowFontScaling={false} style={cs.autocompleteItemRole}>{getRoleLabel(r.role)}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}
            {recipientSearch.length >= 1 && recipientResults.length === 0 && !isSearchingRecipient && <Text allowFontScaling={false} style={cs.noResults}>No results found</Text>}
          </View>
        )}
        {needsPersonSearch && selectedRecipient && (
          <View style={cs.selectedBadge}>
            <Text allowFontScaling={false} style={cs.selectedBadgeText}>{selectedRecipient.name}</Text>
            <TouchableOpacity onPress={() => { setSelectedRecipient(null); setRecipientSearch(""); }}><Text allowFontScaling={false} style={cs.removeBadge}>✕</Text></TouchableOpacity>
          </View>
        )}
        {recipientType === "support" && <View style={cs.supportNote}><Text allowFontScaling={false} style={cs.supportNoteText}>Your message will be sent to the Compete support team</Text></View>}

        <Text allowFontScaling={false} style={cs.sectionLabel}>CATEGORY</Text>
        <TouchableOpacity style={cs.dropdownButton} onPress={() => { closeAllDropdowns(); setShowCategoryPicker(!showCategoryPicker); }}>
          <Text allowFontScaling={false} style={[cs.dropdownButtonText, !category && cs.placeholder]}>{category ? COMPOSE_CATEGORIES.find((c) => c.value === category)?.label : "Select a category"}</Text>
          <Text allowFontScaling={false} style={cs.dropdownArrow}>{showCategoryPicker ? "▲" : "▼"}</Text>
        </TouchableOpacity>
        {showCategoryPicker && (
          <View style={cs.dropdown}>
            <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled" style={{ maxHeight: 240 }}>
              {COMPOSE_CATEGORIES.map((cat) => (
                <TouchableOpacity key={cat.value} style={[cs.dropdownOption, category === cat.value && cs.dropdownOptionActive]} onPress={() => { setCategory(cat.value); setShowCategoryPicker(false); }}>
                  <Text allowFontScaling={false} style={[cs.dropdownOptionText, category === cat.value && cs.dropdownOptionTextActive]}>{cat.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        <Text allowFontScaling={false} style={cs.sectionLabel}>TOURNAMENT <Text style={cs.optionalText}>(optional)</Text></Text>
        {!selectedTournament ? (
          <View style={cs.searchWrapper}>
            <TextInput allowFontScaling={false} style={cs.searchInput} value={tournamentSearch} onChangeText={handleTournamentSearch} placeholder="Search tournaments..." placeholderTextColor={COLORS.textMuted} onFocus={() => { closeAllDropdowns(); if (tournamentSearch.length >= 1) setShowTournamentResults(true); }} />
            {showTournamentResults && tournamentResults.length > 0 && (
              <View style={cs.autocompleteDropdown}>
                <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled" style={{ maxHeight: 180 }}>
                  {tournamentResults.map((t) => (
                    <TouchableOpacity key={t.id} style={cs.autocompleteItem} onPress={() => { setSelectedTournament({ id: t.id, name: t.name }); setTournamentResults([]); setShowTournamentResults(false); setTournamentSearch(""); }}>
                      <Text allowFontScaling={false} style={cs.autocompleteItemName}>🏆 {t.name}</Text>
                      <Text allowFontScaling={false} style={cs.autocompleteItemRole}>{t.venue_name}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}
          </View>
        ) : (
          <View style={cs.selectedBadge}>
            <Text allowFontScaling={false} style={cs.selectedBadgeText}>🏆 {selectedTournament.name}</Text>
            <TouchableOpacity onPress={() => setSelectedTournament(null)}><Text allowFontScaling={false} style={cs.removeBadge}>✕</Text></TouchableOpacity>
          </View>
        )}

        <Text allowFontScaling={false} style={cs.sectionLabel}>SUBJECT <Text style={cs.optionalText}>(optional)</Text></Text>
        <TextInput allowFontScaling={false} style={cs.input} value={subject} onChangeText={setSubject} placeholder="Brief subject line..." placeholderTextColor={COLORS.textMuted} maxLength={100} onFocus={closeAllDropdowns} />

        <Text allowFontScaling={false} style={cs.sectionLabel}>MESSAGE</Text>
        <TextInput allowFontScaling={false} style={[cs.input, cs.messageInput]} value={message} onChangeText={setMessage} placeholder="Type your message..." placeholderTextColor={COLORS.textMuted} multiline numberOfLines={6} textAlignVertical="top" maxLength={2000} onFocus={closeAllDropdowns} />
        <Text allowFontScaling={false} style={cs.charCount}>{message.length}/2000</Text>
        <View style={{ height: 120 }} />
      </ScrollView>

      <View style={cs.bottomBar}>
        <TouchableOpacity style={[cs.bottomButton, cs.sendButton, (!isFormValid || isSending) && cs.buttonDisabled]} onPress={handleSend} disabled={!isFormValid || isSending}>
          <Text allowFontScaling={false} style={cs.sendButtonText}>{isSending ? "Sending..." : "Send Message"}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[cs.bottomButton, cs.cancelButton]} onPress={onBack}>
          <Text allowFontScaling={false} style={cs.cancelButtonText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
};

const NotificationCard = ({ item, isExpanded, onPress, onDelete, onTournamentPress, onDeepLink }: { item: UnifiedNotification; isExpanded: boolean; onPress: () => void; onDelete: () => void; onTournamentPress: (id: number) => void; onDeepLink: (link: string) => void }) => {
  const isUnread = !item.read_at;
  return (
    <TouchableOpacity style={[s.card, isUnread && s.cardUnread]} onPress={onPress} onLongPress={() => Alert.alert("Delete", "Remove this notification?", [{ text: "Cancel", style: "cancel" }, { text: "Delete", style: "destructive", onPress: onDelete }])} activeOpacity={0.7}>
      {isUnread && <View style={[s.accentBar, { backgroundColor: item.badge.color }]} />}
      <View style={s.cardContent}>
        <View style={s.cardTopRow}>
          <View style={[s.typeBadge, { backgroundColor: item.badge.color + "20" }]}>
            <Text allowFontScaling={false} style={s.typeBadgeIcon}>{item.badge.icon}</Text>
            <Text allowFontScaling={false} style={[s.typeBadgeText, { color: item.badge.color }]}>{item.badge.label}</Text>
          </View>
          <Text allowFontScaling={false} style={s.timeText}>{getTimeAgo(item.created_at)}</Text>
        </View>
        <Text allowFontScaling={false} style={[s.subjectText, isUnread && s.subjectTextUnread]}>{item.title}</Text>
        {isExpanded ? (
          <View style={s.expandedBody}>
            <Text allowFontScaling={false} style={s.bodyText}>{item.body}</Text>
            {item.tournament_id && <TouchableOpacity style={s.linkButton} onPress={() => onTournamentPress(item.tournament_id!)}><Text allowFontScaling={false} style={s.linkButtonText}>🏆 View Tournament</Text></TouchableOpacity>}
            {item.deep_link && !item.tournament_id && <TouchableOpacity style={s.linkButton} onPress={() => onDeepLink(item.deep_link!)}><Text allowFontScaling={false} style={s.linkButtonText}>View Details →</Text></TouchableOpacity>}
            <View style={s.cardActions}><TouchableOpacity onPress={onDelete}><Text allowFontScaling={false} style={s.deleteLabel}>🗑️ Delete</Text></TouchableOpacity></View>
          </View>
        ) : (
          <Text allowFontScaling={false} style={s.previewText} numberOfLines={1}>{item.body}</Text>
        )}
      </View>
    </TouchableOpacity>
  );
};

const ConversationCard = ({ convo, onPress, onDelete }: { convo: ConversationPreview; onPress: () => void; onDelete: () => void }) => {
  const hasUnread = convo.unread_count > 0;
  const roleInfo = convo.other_participant_role ? getConvoRoleInfo(convo.other_participant_role) : { color: "#95A5A6", icon: "💬" };
  return (
    <TouchableOpacity style={[s.card, hasUnread && s.cardUnread]} onPress={onPress} onLongPress={() => Alert.alert("Delete", "Remove this conversation?", [{ text: "Cancel", style: "cancel" }, { text: "Delete", style: "destructive", onPress: onDelete }])} activeOpacity={0.7}>
      {hasUnread && <View style={[s.accentBar, { backgroundColor: roleInfo.color }]} />}
      <View style={s.cardContent}>
        <View style={s.cardTopRow}>
          <View style={s.senderRow}>
            <View style={[s.senderDot, { backgroundColor: roleInfo.color }]} />
            <Text allowFontScaling={false} style={s.senderText}>{convo.is_support ? "📢 Compete Support" : `${roleInfo.icon} ${convo.other_participant_name || "Unknown"}`}</Text>
          </View>
          <View style={s.timeRow}>
            {hasUnread && <View style={s.unreadBadge}><Text allowFontScaling={false} style={s.unreadBadgeText}>{convo.unread_count}</Text></View>}
            <Text allowFontScaling={false} style={s.timeText}>{getTimeAgo(convo.last_message_at || convo.updated_at)}</Text>
          </View>
        </View>
        <Text allowFontScaling={false} style={[s.subjectText, hasUnread && s.subjectTextUnread]}>{convo.subject || getCategoryLabel(convo.category) || "Message"}</Text>
        {convo.last_message && <Text allowFontScaling={false} style={s.previewText} numberOfLines={1}>{convo.last_message}</Text>}
        {convo.category && <View style={s.categoryBadgeRow}><View style={s.categoryBadge}><Text allowFontScaling={false} style={s.categoryBadgeText}>{getCategoryLabel(convo.category)}</Text></View></View>}
      </View>
    </TouchableOpacity>
  );
};

interface NotificationsModalProps {
  visible: boolean; onClose: () => void; userId: string | undefined;
  userIdAuto: number | undefined; onViewTournament?: (id: string) => void;
}

export function NotificationsModal({ visible, onClose, userId, userIdAuto, onViewTournament }: NotificationsModalProps) {
  const router = useRouter();
  const [showCompose, setShowCompose] = useState(false);
  const [activeTab, setActiveTab] = useState<"conversations" | "notifications">("conversations");
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [unifiedNotifications, setUnifiedNotifications] = useState<UnifiedNotification[]>([]);
  const [expandedNotifId, setExpandedNotifId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<ConversationPreview[]>([]);
  const [loaded, setLoaded] = useState(false);

  const loadBroadcasts = useCallback(async (): Promise<UnifiedNotification[]> => {
    if (!userId) return [];
    try {
      const { data, error } = await supabase.from("notification_message_recipients").select(`id, message_id, read_at, created_at, notification_messages (id, subject, body, message_type, sender_role, tournament_id, venue_id, created_at)`).eq("user_id", userId).order("created_at", { ascending: false }).limit(50);
      if (error) throw error;
      return ((data as unknown as BroadcastNotification[]) || []).map((msg) => {
        const notif = msg.notification_messages;
        return { id: `broadcast-${msg.id}`, source: "broadcast" as const, title: notif?.subject || "Message", body: notif?.body || "", read_at: msg.read_at, created_at: msg.created_at, badge: getBroadcastBadge(notif?.sender_role || ""), tournament_id: notif?.tournament_id || null, deep_link: null, broadcastRecipientId: msg.id };
      });
    } catch { return []; }
  }, [userId]);

  const loadPushNotifications = useCallback(async (): Promise<UnifiedNotification[]> => {
    if (!userIdAuto) return [];
    try {
      const { data, error } = await supabase.from("notifications").select("*").eq("user_id", userIdAuto).order("created_at", { ascending: false }).limit(50);
      if (error) throw error;
      return ((data as PushNotification[]) || []).map((notif) => ({ id: `push-${notif.id}`, source: "push" as const, title: notif.title, body: notif.body, read_at: notif.read_at, created_at: notif.created_at, badge: getPushBadge(notif.category), tournament_id: (notif.data?.tournament_id as number) || null, deep_link: (notif.data?.deep_link as string) || null, pushNotificationId: notif.id }));
    } catch { return []; }
  }, [userIdAuto]);

  const loadConversations = useCallback(async () => {
    if (!userId) return;
    try { const convos = await conversationService.getConversations(userId); setConversations(convos); } catch {}
  }, [userId]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    const [broadcasts, pushNotifs] = await Promise.all([loadBroadcasts(), loadPushNotifications()]);
    await loadConversations();
    const merged = [...broadcasts, ...pushNotifs].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    setUnifiedNotifications(merged); setLoading(false); setLoaded(true);
  }, [loadBroadcasts, loadPushNotifications, loadConversations]);

  const handleOpen = useCallback(() => { if (!loaded) loadAll(); }, [loaded, loadAll]);
  const onRefresh = useCallback(async () => { setRefreshing(true); await loadAll(); setRefreshing(false); }, [loadAll]);

  const markNotifAsRead = async (item: UnifiedNotification) => {
    if (item.source === "broadcast" && item.broadcastRecipientId) await supabase.from("notification_message_recipients").update({ read_at: new Date().toISOString() }).eq("id", item.broadcastRecipientId);
    else if (item.source === "push" && item.pushNotificationId) await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", item.pushNotificationId);
    setUnifiedNotifications((prev) => prev.map((n) => n.id === item.id ? { ...n, read_at: new Date().toISOString() } : n));
  };

  const deleteNotification = async (item: UnifiedNotification) => {
    if (item.source === "broadcast" && item.broadcastRecipientId) await supabase.from("notification_message_recipients").delete().eq("id", item.broadcastRecipientId);
    else if (item.source === "push" && item.pushNotificationId) await supabase.from("notifications").delete().eq("id", item.pushNotificationId);
    setUnifiedNotifications((prev) => prev.filter((n) => n.id !== item.id));
    if (expandedNotifId === item.id) setExpandedNotifId(null);
  };

  const markAllRead = async () => {
    if (userId) await supabase.from("notification_message_recipients").update({ read_at: new Date().toISOString() }).eq("user_id", userId).is("read_at", null);
    if (userIdAuto) await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", userIdAuto).is("read_at", null);
    setUnifiedNotifications((prev) => prev.map((n) => ({ ...n, read_at: n.read_at || new Date().toISOString() })));
  };

  const deleteConversation = async (convoId: string) => {
    if (!userId) return;
    await conversationService.leaveConversation(convoId, userId);
    setConversations((prev) => prev.filter((c) => c.id !== convoId));
  };

  const openConversation = (convo: ConversationPreview) => {
    const title = convo.subject || convo.other_participant_name || (convo.is_support ? "Support" : "Conversation");
    onClose();
    router.push(`/conversation-detail?id=${convo.id}&title=${encodeURIComponent(title)}` as any);
  };

  const handleTournamentPress = (id: number) => {
    onClose();
    if (onViewTournament) { setTimeout(() => onViewTournament(id.toString()), 150); }
    else { router.push(`/(tabs)/tournament-detail?id=${id}&from=/(tabs)/notifications` as any); }
  };

  const handleComposeSent = useCallback(async () => { setShowCompose(false); await loadConversations(); }, [loadConversations]);

  const unreadNotifCount = unifiedNotifications.filter((n) => !n.read_at).length;
  const unreadConvoCount = conversations.reduce((sum, c) => sum + c.unread_count, 0);

  if (!visible) return null;

  const inboxContent = showCompose && userId ? (
    <ComposeView userId={userId} onBack={() => setShowCompose(false)} onSent={handleComposeSent} />
  ) : (
    <>
      <View style={s.header}>
        <TouchableOpacity style={s.closeButton} onPress={onClose}><Text allowFontScaling={false} style={s.closeButtonText}>✕</Text></TouchableOpacity>
        <Text allowFontScaling={false} style={s.headerTitle}>INBOX</Text>
        <View style={{ width: 40 }} />
      </View>
      <View style={s.divider} />
      <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}
        refreshControl={isWeb ? undefined : <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}>
        <View style={s.tabRow}>
          <TouchableOpacity style={[s.tab, activeTab === "conversations" && s.tabActive]} onPress={() => setActiveTab("conversations")}>
            <Text allowFontScaling={false} style={[s.tabText, activeTab === "conversations" && s.tabTextActive]}>💬 Conversations</Text>
            {unreadConvoCount > 0 && <View style={s.tabBadge}><Text allowFontScaling={false} style={s.tabBadgeText}>{unreadConvoCount}</Text></View>}
          </TouchableOpacity>
          <TouchableOpacity style={[s.tab, activeTab === "notifications" && s.tabActive]} onPress={() => setActiveTab("notifications")}>
            <Text allowFontScaling={false} style={[s.tabText, activeTab === "notifications" && s.tabTextActive]}>🔔 Notifications</Text>
            {unreadNotifCount > 0 && <View style={s.tabBadge}><Text allowFontScaling={false} style={s.tabBadgeText}>{unreadNotifCount}</Text></View>}
          </TouchableOpacity>
        </View>

        {activeTab === "conversations" && (
          <TouchableOpacity style={s.newMessageButton} onPress={() => setShowCompose(true)}>
            <Text allowFontScaling={false} style={s.newMessageButtonText}>✉️ New Message</Text>
          </TouchableOpacity>
        )}

        {loading ? (
          <View style={s.loadingState}><Text allowFontScaling={false} style={s.loadingText}>Loading...</Text></View>
        ) : (
          <>
            {activeTab === "notifications" && (
              <>
                <View style={s.actionRow}>
                  <TouchableOpacity style={s.settingsLink} onPress={() => { onClose(); router.push("/(tabs)/notification-preferences" as any); }}>
                    <Text allowFontScaling={false} style={s.settingsLinkIcon}>⚙️</Text>
                    <Text allowFontScaling={false} style={s.settingsLinkText}>Notification Settings</Text>
                  </TouchableOpacity>
                  {unreadNotifCount > 0 && <TouchableOpacity onPress={markAllRead}><Text allowFontScaling={false} style={s.markAllText}>Mark all as read</Text></TouchableOpacity>}
                </View>
                {unifiedNotifications.length === 0 ? (
                  <View style={s.emptyState}>
                    <Text allowFontScaling={false} style={s.emptyIcon}>🔔</Text>
                    <Text allowFontScaling={false} style={s.emptyTitle}>No notifications</Text>
                    <Text allowFontScaling={false} style={s.emptySubtitle}>Search alerts, tournament updates, and broadcasts will appear here.</Text>
                  </View>
                ) : (
                  <>
                    {unifiedNotifications.map((item) => (
                      <NotificationCard key={item.id} item={item} isExpanded={expandedNotifId === item.id}
                        onPress={() => { if (!item.read_at) markNotifAsRead(item); setExpandedNotifId((prev) => prev === item.id ? null : item.id); }}
                        onDelete={() => deleteNotification(item)} onTournamentPress={handleTournamentPress}
                        onDeepLink={(link) => { onClose(); router.push(link as any); }} />
                    ))}
                    <Text allowFontScaling={false} style={s.hintText}>Long press to delete</Text>
                  </>
                )}
              </>
            )}
            {activeTab === "conversations" && (
              <>
                {conversations.length === 0 ? (
                  <View style={s.emptyState}>
                    <Text allowFontScaling={false} style={s.emptyIcon}>💬</Text>
                    <Text allowFontScaling={false} style={s.emptyTitle}>No conversations yet</Text>
                    <Text allowFontScaling={false} style={s.emptySubtitle}>Send a message to a tournament director, venue owner, or Compete support.</Text>
                    <TouchableOpacity style={s.emptyComposeButton} onPress={() => setShowCompose(true)}>
                      <Text allowFontScaling={false} style={s.emptyComposeText}>✏️ Start a Conversation</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <>
                    {conversations.map((convo) => (
                      <ConversationCard key={convo.id} convo={convo} onPress={() => openConversation(convo)} onDelete={() => deleteConversation(convo.id)} />
                    ))}
                    <Text allowFontScaling={false} style={s.hintText}>Long press to delete</Text>
                  </>
                )}
              </>
            )}
          </>
        )}
        <View style={{ height: scale(SPACING.xl * 2) }} />
      </ScrollView>
    </>
  );

  if (isWeb) {
    return (
      <>
        <TouchableOpacity style={s.backdrop} activeOpacity={1} onPress={onClose} />
        <View style={s.dialogWrap} pointerEvents="box-none">
          <View style={s.dialog} onLayout={handleOpen}>{inboxContent}</View>
        </View>
      </>
    );
  }

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose} onShow={handleOpen}>
      <View style={s.mobileOverlay}>
        <View style={s.mobileContainer}>
          {inboxContent}
          {!showCompose && (
            <TouchableOpacity style={s.externalCloseButton} onPress={onClose}>
              <Text allowFontScaling={false} style={s.externalCloseText}>✕ Close</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { position: "fixed" as any, top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.75)", zIndex: 2000 },
  dialogWrap: { position: "fixed" as any, top: 0, left: 0, right: 0, bottom: 0, zIndex: 2001, alignItems: "center", justifyContent: "center", padding: 24 },
  dialog: { width: 700, maxWidth: "92%" as any, height: "82vh" as any, backgroundColor: "#000000", borderRadius: RADIUS.xl, borderWidth: 1, borderColor: "#2C2C2E", overflow: "hidden" as any, shadowColor: "#000", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.5, shadowRadius: 24, display: "flex" as any, flexDirection: "column" },
  mobileOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.75)", justifyContent: "center", alignItems: "center", paddingHorizontal: 20, paddingTop: 50, paddingBottom: 110 },
  externalCloseButton: { margin: 12, paddingVertical: scale(14), alignItems: "center", backgroundColor: "#E74C3C", borderRadius: scale(12) },
  externalCloseText: { color: "#FFFFFF", fontSize: moderateScale(16), fontWeight: "700" },
  mobileContainer: { backgroundColor: COLORS.background, borderRadius: scale(20), width: "100%" as any, maxWidth: 500, flex: 1, overflow: "hidden" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: scale(SPACING.lg), paddingTop: scale(SPACING.lg), paddingBottom: scale(SPACING.md) },
  closeButton: { width: 40, height: 40, justifyContent: "center", alignItems: "center" },
  closeButtonText: { color: COLORS.text, fontSize: moderateScale(20), fontWeight: "700" },
  headerTitle: { color: COLORS.text, fontSize: moderateScale(FONT_SIZES.lg), fontWeight: "700", letterSpacing: 1 },
  divider: { height: 1, backgroundColor: "#2C2C2E" },
  scroll: { flex: 1, minHeight: 0 },
  scrollContent: { padding: scale(SPACING.md) },
  tabRow: { flexDirection: "row", backgroundColor: COLORS.surface, borderRadius: RADIUS.md, padding: 3, borderWidth: 1, borderColor: COLORS.border, marginBottom: scale(SPACING.sm) },
  tab: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: scale(SPACING.sm), borderRadius: RADIUS.md - 2, gap: 4 },
  tabActive: { backgroundColor: COLORS.primary },
  tabText: { fontSize: moderateScale(FONT_SIZES.sm), fontWeight: "600", color: COLORS.textSecondary },
  tabTextActive: { color: "#fff" },
  tabBadge: { backgroundColor: "#E74C3C", borderRadius: 10, minWidth: 18, height: 18, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 },
  tabBadgeText: { fontSize: moderateScale(10), fontWeight: "700", color: "#fff" },
  newMessageButton: { backgroundColor: COLORS.primary, borderRadius: RADIUS.md, paddingVertical: scale(SPACING.sm), alignItems: "center", marginBottom: scale(SPACING.sm) },
  newMessageButtonText: { fontSize: moderateScale(FONT_SIZES.sm), fontWeight: "700", color: "#fff" },
  actionRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: scale(SPACING.sm) },
  settingsLink: { flexDirection: "row", alignItems: "center", gap: 6 },
  settingsLinkIcon: { fontSize: moderateScale(16) },
  settingsLinkText: { fontSize: moderateScale(FONT_SIZES.sm), color: COLORS.primary, fontWeight: "600" },
  markAllText: { fontSize: moderateScale(FONT_SIZES.xs), color: COLORS.primary, fontWeight: "600" },
  card: { marginTop: scale(SPACING.sm), backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.border, overflow: "hidden" },
  cardUnread: { borderColor: COLORS.primary + "60" },
  accentBar: { height: 3, width: "100%" },
  cardContent: { padding: scale(SPACING.md) },
  cardTopRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  senderRow: { flexDirection: "row", alignItems: "center", gap: 6, flex: 1 },
  senderDot: { width: 8, height: 8, borderRadius: 4 },
  senderText: { fontSize: moderateScale(FONT_SIZES.xs), color: COLORS.textSecondary, fontWeight: "600" },
  typeBadge: { flexDirection: "row", alignItems: "center", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, gap: 4 },
  typeBadgeIcon: { fontSize: moderateScale(12) },
  typeBadgeText: { fontSize: moderateScale(11), fontWeight: "700" },
  timeRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  timeText: { fontSize: moderateScale(FONT_SIZES.xs), color: COLORS.textMuted },
  unreadBadge: { backgroundColor: COLORS.primary, borderRadius: 10, minWidth: 18, height: 18, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 },
  unreadBadgeText: { fontSize: moderateScale(10), fontWeight: "700", color: "#fff" },
  subjectText: { fontSize: moderateScale(FONT_SIZES.md), fontWeight: "600", color: COLORS.text, marginBottom: 4 },
  subjectTextUnread: { fontWeight: "700" },
  previewText: { fontSize: moderateScale(FONT_SIZES.sm), color: COLORS.textMuted, lineHeight: moderateScale(18) },
  categoryBadgeRow: { flexDirection: "row", marginTop: 6 },
  categoryBadge: { backgroundColor: COLORS.primary + "15", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 },
  categoryBadgeText: { fontSize: moderateScale(10), color: COLORS.primary, fontWeight: "600" },
  expandedBody: { marginTop: scale(SPACING.xs) },
  bodyText: { fontSize: moderateScale(FONT_SIZES.sm), color: COLORS.textSecondary, lineHeight: moderateScale(22) },
  linkButton: { backgroundColor: COLORS.primary, borderRadius: RADIUS.md, paddingVertical: scale(SPACING.sm), paddingHorizontal: scale(SPACING.md), alignItems: "center", marginTop: scale(SPACING.md) },
  linkButtonText: { fontSize: moderateScale(FONT_SIZES.sm), fontWeight: "700", color: "#fff" },
  cardActions: { flexDirection: "row", justifyContent: "flex-end", marginTop: scale(SPACING.md), paddingTop: scale(SPACING.sm), borderTopWidth: 1, borderTopColor: COLORS.border },
  deleteLabel: { fontSize: moderateScale(FONT_SIZES.xs), color: "#E74C3C", fontWeight: "600" },
  hintText: { textAlign: "center", fontSize: moderateScale(FONT_SIZES.xs), color: COLORS.textMuted, marginTop: scale(SPACING.md), fontStyle: "italic" },
  loadingState: { alignItems: "center", paddingTop: scale(SPACING.xl * 2) },
  loadingText: { fontSize: moderateScale(FONT_SIZES.md), color: COLORS.textSecondary },
  emptyState: { alignItems: "center", paddingTop: scale(SPACING.xl * 2), paddingHorizontal: scale(SPACING.xl) },
  emptyIcon: { fontSize: moderateScale(48), marginBottom: scale(SPACING.md) },
  emptyTitle: { fontSize: moderateScale(FONT_SIZES.xl), fontWeight: "700", color: COLORS.text, marginBottom: scale(SPACING.xs) },
  emptySubtitle: { fontSize: moderateScale(FONT_SIZES.sm), color: COLORS.textSecondary, textAlign: "center", lineHeight: moderateScale(20) },
  emptyComposeButton: { backgroundColor: COLORS.primary, borderRadius: RADIUS.md, paddingVertical: scale(SPACING.sm), paddingHorizontal: scale(SPACING.lg), marginTop: scale(SPACING.lg) },
  emptyComposeText: { fontSize: moderateScale(FONT_SIZES.sm), fontWeight: "700", color: "#fff" },
});

const cs = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: scale(SPACING.lg), paddingTop: scale(SPACING.lg), paddingBottom: scale(SPACING.md) },
  backButton: { paddingVertical: 6, paddingHorizontal: 4 },
  backButtonText: { color: COLORS.primary, fontSize: moderateScale(FONT_SIZES.sm), fontWeight: "600" },
  headerTitle: { color: COLORS.text, fontSize: moderateScale(FONT_SIZES.lg), fontWeight: "700" },
  formContent: { padding: scale(SPACING.md) },
  sectionLabel: { fontSize: moderateScale(FONT_SIZES.xs), fontWeight: "700", color: COLORS.textSecondary, letterSpacing: 1, marginTop: scale(SPACING.lg), marginBottom: scale(SPACING.sm) },
  optionalText: { fontWeight: "400", color: COLORS.textMuted, letterSpacing: 0, fontSize: moderateScale(FONT_SIZES.xs) },
  dropdownButton: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: COLORS.surface, borderRadius: RADIUS.md, padding: scale(SPACING.md), borderWidth: 1, borderColor: COLORS.border },
  dropdownButtonText: { fontSize: moderateScale(FONT_SIZES.md), color: COLORS.text },
  placeholder: { color: COLORS.textMuted },
  dropdownArrow: { fontSize: moderateScale(FONT_SIZES.sm), color: COLORS.textMuted },
  dropdown: { backgroundColor: COLORS.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, marginTop: 4, zIndex: 100, overflow: "hidden" },
  dropdownOption: { padding: scale(SPACING.md), borderBottomWidth: 1, borderBottomColor: COLORS.border },
  dropdownOptionActive: { backgroundColor: COLORS.primary + "20" },
  dropdownOptionText: { fontSize: moderateScale(FONT_SIZES.md), color: COLORS.text },
  dropdownOptionTextActive: { color: COLORS.primary, fontWeight: "600" },
  searchWrapper: { position: "relative", zIndex: 50 },
  searchInput: { backgroundColor: COLORS.surface, borderRadius: RADIUS.md, padding: scale(SPACING.md), fontSize: moderateScale(FONT_SIZES.md), color: COLORS.text, borderWidth: 1, borderColor: COLORS.border, marginTop: scale(SPACING.sm) },
  autocompleteDropdown: { position: "absolute", top: "100%", left: 0, right: 0, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.primary + "60", marginTop: 2, zIndex: 999, overflow: "hidden" },
  autocompleteItem: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: scale(SPACING.md), borderBottomWidth: 1, borderBottomColor: COLORS.border },
  autocompleteItemName: { fontSize: moderateScale(FONT_SIZES.md), color: COLORS.text, fontWeight: "500", flex: 1 },
  autocompleteItemRole: { fontSize: moderateScale(FONT_SIZES.xs), color: COLORS.textMuted, marginLeft: scale(SPACING.sm) },
  noResults: { fontSize: moderateScale(FONT_SIZES.sm), color: COLORS.textMuted, textAlign: "center", marginTop: scale(SPACING.md) },
  selectedBadge: { flexDirection: "row", alignItems: "center", backgroundColor: COLORS.primary + "20", borderRadius: RADIUS.md, paddingHorizontal: scale(SPACING.md), paddingVertical: scale(SPACING.sm), marginTop: scale(SPACING.sm), borderWidth: 1, borderColor: COLORS.primary + "40" },
  selectedBadgeText: { fontSize: moderateScale(FONT_SIZES.md), color: COLORS.text, fontWeight: "600", flex: 1 },
  removeBadge: { fontSize: moderateScale(FONT_SIZES.lg), color: COLORS.textMuted, paddingLeft: scale(SPACING.sm) },
  supportNote: { backgroundColor: COLORS.surface, borderRadius: RADIUS.md, padding: scale(SPACING.md), marginTop: scale(SPACING.sm), borderWidth: 1, borderColor: COLORS.border },
  supportNoteText: { fontSize: moderateScale(FONT_SIZES.sm), color: COLORS.textSecondary, textAlign: "center" },
  input: { backgroundColor: COLORS.surface, borderRadius: RADIUS.md, padding: scale(SPACING.md), fontSize: moderateScale(FONT_SIZES.md), color: COLORS.text, borderWidth: 1, borderColor: COLORS.border },
  messageInput: { minHeight: 140 },
  charCount: { fontSize: moderateScale(FONT_SIZES.xs), color: COLORS.textMuted, textAlign: "right", marginTop: 4 },
  bottomBar: { flexDirection: "row", padding: scale(SPACING.md), paddingBottom: scale(SPACING.lg), backgroundColor: COLORS.background, borderTopWidth: 1, borderTopColor: COLORS.border, gap: scale(SPACING.sm) },
  bottomButton: { flex: 1, paddingVertical: scale(SPACING.md), borderRadius: RADIUS.md, alignItems: "center", justifyContent: "center" },
  sendButton: { backgroundColor: COLORS.primary },
  sendButtonText: { fontSize: moderateScale(FONT_SIZES.md), fontWeight: "700", color: "#FFFFFF" },
  cancelButton: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  cancelButtonText: { fontSize: moderateScale(FONT_SIZES.md), fontWeight: "600", color: COLORS.textSecondary },
  buttonDisabled: { opacity: 0.4 },
});
