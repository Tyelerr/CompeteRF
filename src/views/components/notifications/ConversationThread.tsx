// src/views/components/notifications/ConversationThread.tsx
// Shared Tournament Review conversation thread — the SINGLE implementation used both inline
// inside the Player Inbox modal and by the standalone conversation-detail route (so the two can
// never drift). It owns: message load/poll, the venue-aware review context header, message
// bubbles (with individual sender names), the keyboard-aware reply bar, the ••• Archive/Unarchive
// menu, archived-state gating, and role-aware recipient-archived reply blocking. Navigation is
// delegated to the parent via onBack (Inbox → list, or route → router.back).

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuthContext } from "../../../providers/AuthProvider";
import {
  conversationService,
  ConversationMessage,
} from "../../../models/services/conversation.service";
import { reviewService } from "../../../models/services/review.service";
import { TournamentReview } from "../../../models/types/review.types";
import { COLORS } from "../../../theme/colors";
import { RADIUS, SPACING } from "../../../theme/spacing";
import { FONT_SIZES } from "../../../theme/typography";

const fmtDate = (d?: string | null) => {
  if (!d) return "";
  const dt = new Date(`${d}T00:00:00`);
  return isNaN(dt.getTime()) ? d : dt.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
};

export interface ConversationThreadProps {
  conversationId: string;
  title?: string;
  isReview: boolean;
  tournamentId?: number | null;
  manager?: string | null;
  onBack: () => void;
  // Rendered INSIDE the Inbox's bounded content area (not a standalone route): drop the
  // full-screen safe-area header padding and the extra bottom padding so it fits the Inbox box.
  embedded?: boolean;
}

export function ConversationThread({ conversationId: id, title, isReview, tournamentId, manager, onBack, embedded = false }: ConversationThreadProps) {
  const insets = useSafeAreaInsets();
  const { user } = useAuthContext();
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);
  const [reviewCtx, setReviewCtx] = useState<TournamentReview | null>(null);
  const [archived, setArchived] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  const loadMessages = useCallback(async () => {
    if (!id || !user?.id) return;
    try {
      const msgs = await conversationService.getMessages(id);
      setMessages(msgs);
      await conversationService.markAsRead(id, user.id);
    } catch (err) {
      console.error("Error loading messages:", err);
    } finally {
      setLoading(false);
    }
  }, [id, user?.id]);

  useEffect(() => {
    loadMessages();
    const interval = setInterval(loadMessages, 10000);
    return () => clearInterval(interval);
  }, [loadMessages]);

  // Review conversations: load the player's own review (context header) + archive state.
  useEffect(() => {
    if (!isReview || !user?.id || !id) return;
    (async () => {
      try {
        if (tournamentId != null) setReviewCtx(await reviewService.getMyReviewForTournament(tournamentId));
        setArchived(await conversationService.isConversationArchived(id, user.id));
      } catch {
        /* non-blocking context load */
      }
    })();
  }, [isReview, tournamentId, id, user?.id]);

  const toggleArchive = () => {
    if (!id || !user?.id) return;
    const next = !archived;
    Alert.alert(
      next ? "Archive conversation?" : "Unarchive conversation?",
      next
        ? "It moves to your Archived conversations and pauses new replies until you reopen it."
        : "It moves back to your active conversations.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: next ? "Archive" : "Unarchive",
          onPress: async () => {
            try {
              await conversationService.setConversationArchived(id, next);
              setArchived(next);
            } catch {
              Alert.alert("Couldn't update", "Please try again.");
            }
          },
        },
      ],
    );
  };

  const handleSend = async () => {
    if (!replyText.trim() || !user?.id || !id || sending) return;
    setSending(true);
    const text = replyText.trim();
    setReplyText("");
    try {
      await conversationService.sendReply(id, user.id, text);
      await loadMessages();
      setTimeout(() => { flatListRef.current?.scrollToEnd({ animated: true }); }, 200);
    } catch (err: any) {
      setReplyText(text); // Restore on error (never lose typed text)
      const msg = String(err?.message || "");
      // The recipient here (for a player's reply) is the venue/management side.
      const blocked = isReview
        ? reviewCtx?.venueName
          ? `${reviewCtx.venueName} has archived this conversation. Replies are currently unavailable.`
          : "The venue has archived this conversation. Replies are currently unavailable."
        : "This conversation has been archived by the recipient. Replies are currently unavailable.";
      Alert.alert("Couldn't send", msg.includes("recipient_archived") ? blocked : "Please try again.");
    } finally {
      setSending(false);
    }
  };

  const getTimeDisplay = (dateString: string): string => {
    const date = new Date(dateString);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / 86400000);
    const time = date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    if (diffDays === 0) return time;
    if (diffDays === 1) return `Yesterday ${time}`;
    if (diffDays < 7) return `${date.toLocaleDateString("en-US", { weekday: "short" })} ${time}`;
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" }) + ` ${time}`;
  };

  const getRoleColor = (role: string): string => {
    switch (role) {
      case "tournament_director": return "#2ECC71";
      case "bar_owner": return "#E67E22";
      case "super_admin":
      case "compete_admin": return "#3498DB";
      default: return "#95A5A6";
    }
  };

  const renderMessage = ({ item }: { item: ConversationMessage }) => {
    const isMe = item.sender_id === user?.id;
    return (
      <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleThem]}>
        {!isMe && (
          <View style={styles.senderInfo}>
            {item.sender_avatar ? (
              <Image source={{ uri: item.sender_avatar }} style={styles.senderAvatar} />
            ) : (
              <View style={[styles.senderAvatarPlaceholder, { backgroundColor: getRoleColor(item.sender_role || "") }]}>
                <Text style={styles.senderAvatarText}>{(item.sender_name || "?")[0].toUpperCase()}</Text>
              </View>
            )}
            <Text style={[styles.senderName, { color: getRoleColor(item.sender_role || "") }]}>{item.sender_name}</Text>
          </View>
        )}
        <View style={[styles.messageBox, isMe ? styles.messageBoxMe : styles.messageBoxThem]}>
          <Text style={[styles.messageText, isMe ? styles.messageTextMe : styles.messageTextThem]}>{item.body}</Text>
        </View>
        <Text style={[styles.timeText, isMe ? styles.timeTextMe : styles.timeTextThem]}>{getTimeDisplay(item.created_at)}</Text>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.loadingText}>Loading conversation...</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={0}>
      {/* Header — embedded uses container-relative padding; standalone adds the top safe area. */}
      <View style={[styles.header, { paddingTop: (embedded ? 0 : insets.top) + SPACING.sm }]}>
        <TouchableOpacity style={styles.backButton} onPress={onBack} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle} numberOfLines={1}>{title || "Conversation"}</Text>
        </View>
        <View style={styles.backButton}>
          {isReview && (
            <TouchableOpacity onPress={toggleArchive} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={styles.headerDots}>•••</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Messages */}
      <FlatList
        ref={flatListRef}
        data={messages}
        renderItem={renderMessage}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.messagesList}
        ListHeaderComponent={
          isReview ? (
            <View style={styles.reviewHeader}>
              <Text allowFontScaling={false} style={styles.reviewHeaderWho}>
                {(reviewCtx?.venueName || manager || "Management")} replied to your review
              </Text>
              <Text allowFontScaling={false} style={styles.reviewHeaderName}>
                {reviewCtx?.tournamentName || title || "Tournament"}
              </Text>
              <Text allowFontScaling={false} style={styles.reviewHeaderMeta}>
                {[reviewCtx?.venueName, fmtDate(reviewCtx?.tournamentDate)].filter(Boolean).join(" · ")}
              </Text>
              {reviewCtx?.rating != null && (
                <Text allowFontScaling={false} style={styles.reviewHeaderStars}>
                  {"★".repeat(reviewCtx.rating)}
                  <Text style={styles.reviewHeaderStarsOff}>{"★".repeat(Math.max(0, 5 - reviewCtx.rating))}</Text>
                </Text>
              )}
              {archived && <Text allowFontScaling={false} style={styles.reviewHeaderArchived}>Archived · replies paused</Text>}
            </View>
          ) : null
        }
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
      />

      {/* Reply bar — hidden while the player has archived this review thread (Unarchive to reply). */}
      {isReview && archived ? (
        <View style={[styles.archivedBar, embedded && styles.barEmbedded]}>
          <Text allowFontScaling={false} style={styles.archivedBarText}>You archived this conversation. Unarchive to reply.</Text>
          <TouchableOpacity onPress={toggleArchive}><Text allowFontScaling={false} style={styles.archivedBarAction}>Unarchive</Text></TouchableOpacity>
        </View>
      ) : (
        <View style={[styles.replyBar, embedded && styles.barEmbedded]}>
          <TextInput
            style={styles.replyInput}
            value={replyText}
            onChangeText={setReplyText}
            placeholder="Type a reply..."
            placeholderTextColor={COLORS.textMuted}
            multiline
            maxLength={2000}
          />
          <TouchableOpacity
            style={[styles.sendButton, (!replyText.trim() || sending) && styles.sendButtonDisabled]}
            onPress={handleSend}
            disabled={!replyText.trim() || sending}
          >
            <Text style={styles.sendButtonText}>{sending ? "..." : "Send"}</Text>
          </TouchableOpacity>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  centerContainer: { flex: 1, backgroundColor: COLORS.background, justifyContent: "center", alignItems: "center" },
  loadingText: { fontSize: FONT_SIZES.md, color: COLORS.textSecondary },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: SPACING.md, paddingBottom: SPACING.sm, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  backButton: { width: 70 },
  backButtonText: { fontSize: FONT_SIZES.md, color: COLORS.primary, fontWeight: "600" },
  headerCenter: { flex: 1, alignItems: "center" },
  headerTitle: { fontSize: FONT_SIZES.md, fontWeight: "700", color: COLORS.text },
  headerDots: { fontSize: FONT_SIZES.md, color: COLORS.textSecondary, fontWeight: "800", textAlign: "right" },
  reviewHeader: { backgroundColor: COLORS.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, padding: SPACING.md, marginBottom: SPACING.md },
  reviewHeaderWho: { fontSize: FONT_SIZES.sm, fontWeight: "700", color: COLORS.text },
  reviewHeaderName: { fontSize: FONT_SIZES.md, fontWeight: "800", color: COLORS.text, marginTop: 2 },
  reviewHeaderMeta: { fontSize: FONT_SIZES.xs, color: COLORS.textSecondary, marginTop: 2 },
  reviewHeaderStars: { fontSize: FONT_SIZES.md, color: "#F5A623", fontWeight: "700", marginTop: 4 },
  reviewHeaderStarsOff: { color: COLORS.border },
  reviewHeaderArchived: { fontSize: FONT_SIZES.xs, color: COLORS.warning, fontWeight: "700", marginTop: 4 },
  messagesList: { padding: SPACING.md, paddingBottom: SPACING.lg },
  bubble: { marginBottom: SPACING.md },
  bubbleMe: { alignItems: "flex-end" },
  bubbleThem: { alignItems: "flex-start" },
  senderInfo: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 },
  senderAvatar: { width: 20, height: 20, borderRadius: 10 },
  senderAvatarPlaceholder: { width: 20, height: 20, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  senderAvatarText: { fontSize: 10, fontWeight: "700", color: "#FFFFFF" },
  senderName: { fontSize: FONT_SIZES.xs, fontWeight: "600" },
  messageBox: { maxWidth: "80%", borderRadius: RADIUS.lg, padding: SPACING.sm, paddingHorizontal: SPACING.md },
  messageBoxMe: { backgroundColor: COLORS.primary, borderBottomRightRadius: 4 },
  messageBoxThem: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderBottomLeftRadius: 4 },
  messageText: { fontSize: FONT_SIZES.sm, lineHeight: 20 },
  messageTextMe: { color: "#FFFFFF" },
  messageTextThem: { color: COLORS.text },
  timeText: { fontSize: 10, color: COLORS.textMuted, marginTop: 2 },
  timeTextMe: { textAlign: "right" },
  timeTextThem: { textAlign: "left" },
  replyBar: { flexDirection: "row", alignItems: "flex-end", padding: SPACING.sm, paddingBottom: SPACING.lg, borderTopWidth: 1, borderTopColor: COLORS.border, backgroundColor: COLORS.background, gap: SPACING.sm },
  archivedBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: SPACING.md, paddingBottom: SPACING.lg, borderTopWidth: 1, borderTopColor: COLORS.border, backgroundColor: COLORS.background, gap: SPACING.sm },
  barEmbedded: { paddingBottom: SPACING.sm },
  archivedBarText: { flex: 1, color: COLORS.textSecondary, fontSize: FONT_SIZES.sm },
  archivedBarAction: { color: COLORS.primary, fontWeight: "700", fontSize: FONT_SIZES.sm },
  replyInput: { flex: 1, backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, fontSize: FONT_SIZES.md, color: COLORS.text, borderWidth: 1, borderColor: COLORS.border, maxHeight: 100 },
  sendButton: { backgroundColor: COLORS.primary, borderRadius: RADIUS.lg, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, justifyContent: "center" },
  sendButtonDisabled: { opacity: 0.4 },
  sendButtonText: { fontSize: FONT_SIZES.sm, fontWeight: "700", color: "#FFFFFF" },
});
