// app/(tabs)/notifications.tsx
// ═══════════════════════════════════════════════════════════
// Notification Inbox - Polished message center for users
// ═══════════════════════════════════════════════════════════

import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { supabase } from "../../src/lib/supabase";
import { useAuthContext } from "../../src/providers/AuthProvider";
import { COLORS } from "../../src/theme/colors";
import { RADIUS, SPACING } from "../../src/theme/spacing";
import { FONT_SIZES } from "../../src/theme/typography";

interface InboxMessage {
  id: string;
  message_id: string;
  read_at: string | null;
  created_at: string;
  notification_messages: {
    id: string;
    subject: string;
    body: string;
    message_type: string;
    sender_role: string;
    tournament_id: number | null;
    venue_id: number | null;
    created_at: string;
  };
}

// ── Individual message card with animations ──
const MessageCard = ({
  msg,
  isExpanded,
  onPress,
  onDelete,
  onTournamentPress,
}: {
  msg: InboxMessage;
  isExpanded: boolean;
  onPress: () => void;
  onDelete: () => void;
  onTournamentPress: (id: number) => void;
}) => {
  const notif = msg.notification_messages;
  if (!notif) return null;
  const isUnread = !msg.read_at;

  const getSenderInfo = (
    senderRole: string,
  ): { label: string; color: string; icon: string } => {
    switch (senderRole) {
      case "tournament_director":
        return { label: "Tournament Director", color: "#2ECC71", icon: "🏆" };
      case "bar_owner":
        return { label: "Venue", color: "#E67E22", icon: "🏢" };
      case "super_admin":
      case "compete_admin":
        return { label: "CompeteRF", color: "#3498DB", icon: "📢" };
      default:
        return { label: "Message", color: "#95A5A6", icon: "✉️" };
    }
  };

  const getTimeAgo = (dateString: string): string => {
    const now = new Date();
    const date = new Date(dateString);
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  const sender = getSenderInfo(notif.sender_role);

  return (
    <TouchableOpacity
      style={[styles.card, isUnread && styles.cardUnread]}
      onPress={onPress}
      onLongPress={() => {
        Alert.alert("Delete Message", "Remove this message from your inbox?", [
          { text: "Cancel", style: "cancel" },
          { text: "Delete", style: "destructive", onPress: onDelete },
        ]);
      }}
      activeOpacity={0.7}
    >
      {/* Accent bar for unread */}
      {isUnread && (
        <View style={[styles.accentBar, { backgroundColor: sender.color }]} />
      )}

      <View style={styles.cardContent}>
        {/* Top row: sender + time */}
        <View style={styles.cardTopRow}>
          <View style={styles.senderRow}>
            <View
              style={[styles.senderDot, { backgroundColor: sender.color }]}
            />
            <Text style={styles.senderText}>
              {sender.icon} {sender.label}
            </Text>
          </View>
          <Text style={styles.timeText}>{getTimeAgo(msg.created_at)}</Text>
        </View>

        {/* Subject */}
        <Text
          style={[styles.subjectText, isUnread && styles.subjectTextUnread]}
        >
          {notif.subject}
        </Text>

        {/* Body preview or full */}
        {isExpanded ? (
          <View style={styles.expandedBody}>
            <Text style={styles.bodyText}>{notif.body}</Text>

            {notif.tournament_id && (
              <TouchableOpacity
                style={styles.tournamentLink}
                onPress={() => onTournamentPress(notif.tournament_id!)}
              >
                <Text style={styles.tournamentLinkText}>
                  🏆 View Tournament Details
                </Text>
              </TouchableOpacity>
            )}

            <View style={styles.cardActions}>
              <TouchableOpacity
                style={styles.deleteTextButton}
                onPress={onDelete}
              >
                <Text style={styles.deleteTextButtonLabel}>🗑️ Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <Text style={styles.previewText} numberOfLines={1}>
            {notif.body}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );
};

// ── Main screen ──
export default function NotificationsScreen() {
  const router = useRouter();
  const { user } = useAuthContext();
  const [messages, setMessages] = useState<InboxMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const loadMessages = useCallback(async () => {
    if (!user?.id) return;

    try {
      const { data, error } = await supabase
        .from("notification_message_recipients")
        .select(
          `
          id,
          message_id,
          read_at,
          created_at,
          notification_messages (
            id,
            subject,
            body,
            message_type,
            sender_role,
            tournament_id,
            venue_id,
            created_at
          )
        `,
        )
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) throw error;
      setMessages((data as unknown as InboxMessage[]) || []);
    } catch (err) {
      console.error("Error loading inbox:", err);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadMessages();
    setRefreshing(false);
  }, [loadMessages]);

  const markAsRead = async (recipientId: string) => {
    await supabase
      .from("notification_message_recipients")
      .update({ read_at: new Date().toISOString() })
      .eq("id", recipientId);

    setMessages((prev) =>
      prev.map((m) =>
        m.id === recipientId ? { ...m, read_at: new Date().toISOString() } : m,
      ),
    );
  };

  const markAllAsRead = async () => {
    if (!user?.id) return;
    const unread = messages.filter((m) => !m.read_at);
    if (unread.length === 0) return;

    await supabase
      .from("notification_message_recipients")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .is("read_at", null);

    setMessages((prev) =>
      prev.map((m) => ({
        ...m,
        read_at: m.read_at || new Date().toISOString(),
      })),
    );
  };

  const deleteMessage = async (recipientId: string) => {
    await supabase
      .from("notification_message_recipients")
      .delete()
      .eq("id", recipientId);

    setMessages((prev) => prev.filter((m) => m.id !== recipientId));
    if (expandedId === recipientId) setExpandedId(null);
  };

  const handlePress = (msg: InboxMessage) => {
    if (!msg.read_at) markAsRead(msg.id);
    setExpandedId((prev) => (prev === msg.id ? null : msg.id));
  };

  const handleTournamentPress = (tournamentId: number) => {
    router.push(`/tournament-detail?id=${tournamentId}` as any);
  };

  const unreadCount = messages.filter((m) => !m.read_at).length;

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.loadingText}>Loading messages...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>MESSAGES</Text>
        <View style={styles.headerRight}>
          {unreadCount > 0 && (
            <TouchableOpacity onPress={markAllAsRead}>
              <Text style={styles.markAllReadText}>Mark all read</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Unread count pill */}
      {unreadCount > 0 && (
        <View style={styles.unreadBar}>
          <View style={styles.unreadPill}>
            <Text style={styles.unreadPillText}>
              {unreadCount} unread {unreadCount === 1 ? "message" : "messages"}
            </Text>
          </View>
        </View>
      )}

      <ScrollView
        style={styles.scrollContent}
        contentContainerStyle={
          messages.length === 0 ? styles.emptyContainer : undefined
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={COLORS.primary}
          />
        }
      >
        {messages.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>📬</Text>
            <Text style={styles.emptyTitle}>All caught up!</Text>
            <Text style={styles.emptySubtitle}>
              Messages from tournament directors and venues you follow will show
              up here.
            </Text>
            <View style={styles.emptyDivider} />
            <Text style={styles.emptyHint}>
              💡 Favorite a tournament to start receiving updates
            </Text>
          </View>
        ) : (
          <>
            {/* Group: Today / Earlier */}
            {messages.map((msg) => (
              <MessageCard
                key={msg.id}
                msg={msg}
                isExpanded={expandedId === msg.id}
                onPress={() => handlePress(msg)}
                onDelete={() => deleteMessage(msg.id)}
                onTournamentPress={handleTournamentPress}
              />
            ))}

            {/* Long press hint */}
            <Text style={styles.hintText}>
              Long press a message to delete it
            </Text>
          </>
        )}

        <View style={styles.bottomSpacer} />
      </ScrollView>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════
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
    padding: SPACING.lg,
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
  },
  backButton: {
    width: 80,
  },
  backButtonText: {
    fontSize: FONT_SIZES.md,
    color: COLORS.primary,
    fontWeight: "600",
  },
  headerTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: "700",
    color: COLORS.text,
    letterSpacing: 1,
  },
  headerRight: {
    width: 80,
    alignItems: "flex-end",
  },
  markAllReadText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.primary,
    fontWeight: "600",
  },

  // ── Unread bar ──
  unreadBar: {
    alignItems: "center",
    paddingBottom: SPACING.sm,
  },
  unreadPill: {
    backgroundColor: COLORS.primary + "20",
    borderRadius: 20,
    paddingHorizontal: SPACING.md,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: COLORS.primary + "40",
  },
  unreadPillText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.primary,
    fontWeight: "600",
  },

  // ── Cards ──
  scrollContent: {
    flex: 1,
  },
  emptyContainer: {
    flex: 1,
  },
  card: {
    marginHorizontal: SPACING.md,
    marginTop: SPACING.sm,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: "hidden",
  },
  cardUnread: {
    borderColor: COLORS.primary + "60",
    backgroundColor: COLORS.surface,
  },
  accentBar: {
    height: 3,
    width: "100%",
  },
  cardContent: {
    padding: SPACING.md,
  },
  cardTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  senderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  senderDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  senderText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    fontWeight: "600",
  },
  timeText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
  },
  subjectText: {
    fontSize: FONT_SIZES.md,
    fontWeight: "600",
    color: COLORS.text,
    marginBottom: 4,
  },
  subjectTextUnread: {
    fontWeight: "700",
  },
  previewText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textMuted,
    lineHeight: 18,
  },

  // ── Expanded ──
  expandedBody: {
    marginTop: SPACING.xs,
  },
  bodyText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    lineHeight: 22,
  },
  tournamentLink: {
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    alignItems: "center",
    marginTop: SPACING.md,
  },
  tournamentLinkText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  cardActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: SPACING.md,
    paddingTop: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  deleteTextButton: {
    paddingVertical: 4,
    paddingHorizontal: SPACING.sm,
  },
  deleteTextButtonLabel: {
    fontSize: FONT_SIZES.xs,
    color: "#E74C3C",
    fontWeight: "600",
  },
  hintText: {
    textAlign: "center",
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    marginTop: SPACING.md,
    fontStyle: "italic",
  },

  // ── Empty state ──
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: SPACING.xl,
  },
  emptyIcon: {
    fontSize: 56,
    marginBottom: SPACING.md,
  },
  emptyTitle: {
    fontSize: FONT_SIZES.xl,
    fontWeight: "700",
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },
  emptySubtitle: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    textAlign: "center",
    lineHeight: 20,
  },
  emptyDivider: {
    width: 40,
    height: 2,
    backgroundColor: COLORS.border,
    marginVertical: SPACING.lg,
    borderRadius: 1,
  },
  emptyHint: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textMuted,
    textAlign: "center",
  },

  bottomSpacer: {
    height: SPACING.xl * 2,
  },
});
