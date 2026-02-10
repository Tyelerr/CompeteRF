// app/(tabs)/conversation-detail.tsx
// ═══════════════════════════════════════════════════════════
// Conversation Thread View - Chat-like message thread
// ═══════════════════════════════════════════════════════════

import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
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
import { useAuthContext } from "../../src/providers/AuthProvider";
import {
  conversationService,
  ConversationMessage,
} from "../../src/models/services/conversation.service";
import { COLORS } from "../../src/theme/colors";
import { RADIUS, SPACING } from "../../src/theme/spacing";
import { FONT_SIZES } from "../../src/theme/typography";

export default function ConversationDetailScreen() {
  const router = useRouter();
  const { id, title } = useLocalSearchParams<{ id: string; title?: string }>();
  const { user } = useAuthContext();
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);
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

    // Poll for new messages every 10 seconds
    const interval = setInterval(loadMessages, 10000);
    return () => clearInterval(interval);
  }, [loadMessages]);

  const handleSend = async () => {
    if (!replyText.trim() || !user?.id || !id || sending) return;

    setSending(true);
    const text = replyText.trim();
    setReplyText("");

    try {
      await conversationService.sendReply(id, user.id, text);
      await loadMessages();
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 200);
    } catch (err) {
      console.error("Send reply error:", err);
      setReplyText(text); // Restore on error
    } finally {
      setSending(false);
    }
  };

  const getTimeDisplay = (dateString: string): string => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / 86400000);

    const time = date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });

    if (diffDays === 0) return time;
    if (diffDays === 1) return `Yesterday ${time}`;
    if (diffDays < 7) {
      const day = date.toLocaleDateString("en-US", { weekday: "short" });
      return `${day} ${time}`;
    }
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    }) + ` ${time}`;
  };

  const getRoleColor = (role: string): string => {
    switch (role) {
      case "tournament_director":
        return "#2ECC71";
      case "bar_owner":
        return "#E67E22";
      case "super_admin":
      case "compete_admin":
        return "#3498DB";
      default:
        return "#95A5A6";
    }
  };

  const renderMessage = ({ item }: { item: ConversationMessage }) => {
    const isMe = item.sender_id === user?.id;

    return (
      <View
        style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleThem]}
      >
        {!isMe && (
          <View style={styles.senderInfo}>
            {item.sender_avatar ? (
              <Image
                source={{ uri: item.sender_avatar }}
                style={styles.senderAvatar}
              />
            ) : (
              <View
                style={[
                  styles.senderAvatarPlaceholder,
                  { backgroundColor: getRoleColor(item.sender_role || "") },
                ]}
              >
                <Text style={styles.senderAvatarText}>
                  {(item.sender_name || "?")[0].toUpperCase()}
                </Text>
              </View>
            )}
            <Text
              style={[
                styles.senderName,
                { color: getRoleColor(item.sender_role || "") },
              ]}
            >
              {item.sender_name}
            </Text>
          </View>
        )}
        <View
          style={[
            styles.messageBox,
            isMe ? styles.messageBoxMe : styles.messageBoxThem,
          ]}
        >
          <Text
            style={[
              styles.messageText,
              isMe ? styles.messageTextMe : styles.messageTextThem,
            ]}
          >
            {item.body}
          </Text>
        </View>
        <Text
          style={[styles.timeText, isMe ? styles.timeTextMe : styles.timeTextThem]}
        >
          {getTimeDisplay(item.created_at)}
        </Text>
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
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={0}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {title || "Conversation"}
          </Text>
        </View>
        <View style={styles.backButton} />
      </View>

      {/* Messages */}
      <FlatList
        ref={flatListRef}
        data={messages}
        renderItem={renderMessage}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.messagesList}
        onContentSizeChange={() =>
          flatListRef.current?.scrollToEnd({ animated: false })
        }
      />

      {/* Reply bar */}
      <View style={styles.replyBar}>
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
          style={[
            styles.sendButton,
            (!replyText.trim() || sending) && styles.sendButtonDisabled,
          ]}
          onPress={handleSend}
          disabled={!replyText.trim() || sending}
        >
          <Text style={styles.sendButtonText}>
            {sending ? "..." : "Send"}
          </Text>
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
  centerContainer: {
    flex: 1,
    backgroundColor: COLORS.background,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textSecondary,
  },

  // ── Header ──
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.xl + SPACING.lg,
    paddingBottom: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  backButton: {
    width: 70,
  },
  backButtonText: {
    fontSize: FONT_SIZES.md,
    color: COLORS.primary,
    fontWeight: "600",
  },
  headerCenter: {
    flex: 1,
    alignItems: "center",
  },
  headerTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: "700",
    color: COLORS.text,
  },

  // ── Messages list ──
  messagesList: {
    padding: SPACING.md,
    paddingBottom: SPACING.lg,
  },

  // ── Bubble ──
  bubble: {
    marginBottom: SPACING.md,
  },
  bubbleMe: {
    alignItems: "flex-end",
  },
  bubbleThem: {
    alignItems: "flex-start",
  },
  senderInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 4,
  },
  senderAvatar: {
    width: 20,
    height: 20,
    borderRadius: 10,
  },
  senderAvatarPlaceholder: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  senderAvatarText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  senderName: {
    fontSize: FONT_SIZES.xs,
    fontWeight: "600",
  },
  messageBox: {
    maxWidth: "80%",
    borderRadius: RADIUS.lg,
    padding: SPACING.sm,
    paddingHorizontal: SPACING.md,
  },
  messageBoxMe: {
    backgroundColor: COLORS.primary,
    borderBottomRightRadius: 4,
  },
  messageBoxThem: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderBottomLeftRadius: 4,
  },
  messageText: {
    fontSize: FONT_SIZES.sm,
    lineHeight: 20,
  },
  messageTextMe: {
    color: "#FFFFFF",
  },
  messageTextThem: {
    color: COLORS.text,
  },
  timeText: {
    fontSize: 10,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  timeTextMe: {
    textAlign: "right",
  },
  timeTextThem: {
    textAlign: "left",
  },

  // ── Reply bar ──
  replyBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    padding: SPACING.sm,
    paddingBottom: SPACING.lg,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    backgroundColor: COLORS.background,
    gap: SPACING.sm,
  },
  replyInput: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    fontSize: FONT_SIZES.md,
    color: COLORS.text,
    borderWidth: 1,
    borderColor: COLORS.border,
    maxHeight: 100,
  },
  sendButton: {
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.lg,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    justifyContent: "center",
  },
  sendButtonDisabled: {
    opacity: 0.4,
  },
  sendButtonText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: "700",
    color: "#FFFFFF",
  },
});
