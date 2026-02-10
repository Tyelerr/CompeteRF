// app/(tabs)/notifications.tsx
// ═══════════════════════════════════════════════════════════
// Unified Message Center - Push notifications + Conversations
// Two tabs: Notifications (broadcasts) and Messages (threads)
// ═══════════════════════════════════════════════════════════

import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
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
import {
  ConversationPreview,
  conversationService,
} from "../../src/models/services/conversation.service";
import { useAuthContext } from "../../src/providers/AuthProvider";
import { COLORS } from "../../src/theme/colors";
import { RADIUS, SPACING } from "../../src/theme/spacing";
import { FONT_SIZES } from "../../src/theme/typography";

// ── Push notification type ──
interface InboxNotification {
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

// ── Time formatting ──
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

// ── Sender info ──
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
      return { label: "Compete", color: "#3498DB", icon: "📢" };
    default:
      return { label: "Message", color: "#95A5A6", icon: "✉️" };
  }
};

const getCategoryLabel = (cat: string | null): string => {
  const map: Record<string, string> = {
    tournament_issues: "Tournament Issues",
    report_problem: "Report a Problem",
    feedback_suggestions: "Feedback",
    account_issues: "Account",
    fargo_rating: "Fargo Rating",
    become_td: "Become a TD",
    tournament_submission: "Submission",
    general: "General",
    other: "Other",
  };
  return cat ? map[cat] || cat : "";
};

// ══════════════════════════════════════════════════════════
// Notification Card (broadcast messages)
// ══════════════════════════════════════════════════════════
const NotificationCard = ({
  msg,
  isExpanded,
  onPress,
  onDelete,
  onTournamentPress,
}: {
  msg: InboxNotification;
  isExpanded: boolean;
  onPress: () => void;
  onDelete: () => void;
  onTournamentPress: (id: number) => void;
}) => {
  const notif = msg.notification_messages;
  if (!notif) return null;
  const isUnread = !msg.read_at;
  const sender = getSenderInfo(notif.sender_role);

  return (
    <TouchableOpacity
      style={[styles.card, isUnread && styles.cardUnread]}
      onPress={onPress}
      onLongPress={() =>
        Alert.alert("Delete", "Remove this notification?", [
          { text: "Cancel", style: "cancel" },
          { text: "Delete", style: "destructive", onPress: onDelete },
        ])
      }
      activeOpacity={0.7}
    >
      {isUnread && (
        <View style={[styles.accentBar, { backgroundColor: sender.color }]} />
      )}
      <View style={styles.cardContent}>
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
        <Text
          style={[styles.subjectText, isUnread && styles.subjectTextUnread]}
        >
          {notif.subject}
        </Text>
        {isExpanded ? (
          <View style={styles.expandedBody}>
            <Text style={styles.bodyText}>{notif.body}</Text>
            {notif.tournament_id && (
              <TouchableOpacity
                style={styles.tournamentLink}
                onPress={() => onTournamentPress(notif.tournament_id!)}
              >
                <Text style={styles.tournamentLinkText}>
                  🏆 View Tournament
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

// ══════════════════════════════════════════════════════════
// Conversation Card (DM threads)
// ══════════════════════════════════════════════════════════
const ConversationCard = ({
  convo,
  onPress,
  onDelete,
}: {
  convo: ConversationPreview;
  onPress: () => void;
  onDelete: () => void;
}) => {
  const hasUnread = convo.unread_count > 0;
  const roleInfo = convo.other_participant_role
    ? getSenderInfo(convo.other_participant_role)
    : { color: "#95A5A6", icon: "💬" };

  return (
    <TouchableOpacity
      style={[styles.card, hasUnread && styles.cardUnread]}
      onPress={onPress}
      onLongPress={() =>
        Alert.alert("Delete", "Remove this conversation?", [
          { text: "Cancel", style: "cancel" },
          { text: "Delete", style: "destructive", onPress: onDelete },
        ])
      }
      activeOpacity={0.7}
    >
      {hasUnread && (
        <View style={[styles.accentBar, { backgroundColor: roleInfo.color }]} />
      )}
      <View style={styles.cardContent}>
        <View style={styles.cardTopRow}>
          <View style={styles.senderRow}>
            <View
              style={[styles.senderDot, { backgroundColor: roleInfo.color }]}
            />
            <Text style={styles.senderText}>
              {convo.is_support
                ? "📢 Compete Support"
                : `${roleInfo.icon} ${convo.other_participant_name || "Unknown"}`}
            </Text>
          </View>
          <View style={styles.timeRow}>
            {hasUnread && (
              <View style={styles.unreadCountBadge}>
                <Text style={styles.unreadCountText}>{convo.unread_count}</Text>
              </View>
            )}
            <Text style={styles.timeText}>
              {getTimeAgo(convo.last_message_at || convo.updated_at)}
            </Text>
          </View>
        </View>

        <Text
          style={[styles.subjectText, hasUnread && styles.subjectTextUnread]}
        >
          {convo.subject || getCategoryLabel(convo.category) || "Message"}
        </Text>

        {convo.last_message && (
          <Text style={styles.previewText} numberOfLines={1}>
            {convo.last_message}
          </Text>
        )}

        {convo.category && (
          <View style={styles.categoryBadgeRow}>
            <View style={styles.categoryBadge}>
              <Text style={styles.categoryBadgeText}>
                {getCategoryLabel(convo.category)}
              </Text>
            </View>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
};

// ══════════════════════════════════════════════════════════
// MAIN SCREEN
// ══════════════════════════════════════════════════════════
export default function NotificationsScreen() {
  const router = useRouter();
  const { user } = useAuthContext();

  const [activeTab, setActiveTab] = useState<"notifications" | "messages">(
    "messages",
  );
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Notifications state
  const [notifications, setNotifications] = useState<InboxNotification[]>([]);
  const [expandedNotifId, setExpandedNotifId] = useState<string | null>(null);

  // Conversations state
  const [conversations, setConversations] = useState<ConversationPreview[]>([]);

  // ── Load data ──
  const loadNotifications = useCallback(async () => {
    if (!user?.id) return;
    try {
      const { data, error } = await supabase
        .from("notification_message_recipients")
        .select(
          `id, message_id, read_at, created_at,
          notification_messages (id, subject, body, message_type, sender_role, tournament_id, venue_id, created_at)`,
        )
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) throw error;
      setNotifications((data as unknown as InboxNotification[]) || []);
    } catch (err) {
      console.error("Error loading notifications:", err);
    }
  }, [user?.id]);

  const loadConversations = useCallback(async () => {
    if (!user?.id) return;
    try {
      const convos = await conversationService.getConversations(user.id);
      setConversations(convos);
    } catch (err) {
      console.error("Error loading conversations:", err);
    }
  }, [user?.id]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    await Promise.all([loadNotifications(), loadConversations()]);
    setLoading(false);
  }, [loadNotifications, loadConversations]);

  // Refresh on screen focus
  useFocusEffect(
    useCallback(() => {
      if (user?.id) loadAll();
    }, [user?.id, loadAll]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadAll();
    setRefreshing(false);
  }, [loadAll]);

  // ── Notification actions ──
  const markNotifAsRead = async (recipientId: string) => {
    await supabase
      .from("notification_message_recipients")
      .update({ read_at: new Date().toISOString() })
      .eq("id", recipientId);
    setNotifications((prev) =>
      prev.map((m) =>
        m.id === recipientId ? { ...m, read_at: new Date().toISOString() } : m,
      ),
    );
  };

  const deleteNotification = async (recipientId: string) => {
    await supabase
      .from("notification_message_recipients")
      .delete()
      .eq("id", recipientId);
    setNotifications((prev) => prev.filter((m) => m.id !== recipientId));
    if (expandedNotifId === recipientId) setExpandedNotifId(null);
  };

  const markAllNotifsRead = async () => {
    if (!user?.id) return;
    await supabase
      .from("notification_message_recipients")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .is("read_at", null);
    setNotifications((prev) =>
      prev.map((m) => ({
        ...m,
        read_at: m.read_at || new Date().toISOString(),
      })),
    );
  };

  // ── Conversation actions ──
  const deleteConversation = async (convoId: string) => {
    if (!user?.id) return;
    await conversationService.leaveConversation(convoId, user.id);
    setConversations((prev) => prev.filter((c) => c.id !== convoId));
  };

  const openConversation = (convo: ConversationPreview) => {
    const title =
      convo.subject ||
      convo.other_participant_name ||
      (convo.is_support ? "Support" : "Conversation");
    router.push(
      `/conversation-detail?id=${convo.id}&title=${encodeURIComponent(title)}` as any,
    );
  };

  // ── Counts ──
  const unreadNotifCount = notifications.filter((n) => !n.read_at).length;
  const unreadConvoCount = conversations.reduce(
    (sum, c) => sum + c.unread_count,
    0,
  );
  const totalUnread = unreadNotifCount + unreadConvoCount;

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
        <View style={styles.backButton} />
      </View>

      {/* Tabs */}
      <View style={styles.tabRow}>
        <TouchableOpacity
          style={[styles.tab, activeTab === "messages" && styles.tabActive]}
          onPress={() => setActiveTab("messages")}
        >
          <Text
            style={[
              styles.tabText,
              activeTab === "messages" && styles.tabTextActive,
            ]}
          >
            💬 Conversations
          </Text>
          {unreadConvoCount > 0 && (
            <View style={styles.tabBadge}>
              <Text style={styles.tabBadgeText}>{unreadConvoCount}</Text>
            </View>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.tab,
            activeTab === "notifications" && styles.tabActive,
          ]}
          onPress={() => setActiveTab("notifications")}
        >
          <Text
            style={[
              styles.tabText,
              activeTab === "notifications" && styles.tabTextActive,
            ]}
          >
            🔔 Notifications
          </Text>
          {unreadNotifCount > 0 && (
            <View style={styles.tabBadge}>
              <Text style={styles.tabBadgeText}>{unreadNotifCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* New Message Button */}
      <TouchableOpacity
        style={styles.newMessageButton}
        onPress={() => router.push("/compose-message" as any)}
      >
        <Text style={styles.newMessageButtonText}>✉️ New Message</Text>
      </TouchableOpacity>

      <ScrollView
        style={styles.scrollContent}
        contentContainerStyle={
          (activeTab === "notifications"
            ? notifications.length
            : conversations.length) === 0
            ? styles.emptyContainer
            : undefined
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={COLORS.primary}
          />
        }
      >
        {/* ═══ NOTIFICATIONS TAB ═══ */}
        {activeTab === "notifications" && (
          <>
            {unreadNotifCount > 0 && (
              <View style={styles.actionBar}>
                <TouchableOpacity onPress={markAllNotifsRead}>
                  <Text style={styles.actionBarText}>Mark all as read</Text>
                </TouchableOpacity>
              </View>
            )}

            {notifications.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyIcon}>🔔</Text>
                <Text style={styles.emptyTitle}>No notifications</Text>
                <Text style={styles.emptySubtitle}>
                  Broadcasts from tournament directors and venues you follow
                  will appear here.
                </Text>
              </View>
            ) : (
              <>
                {notifications.map((msg) => (
                  <NotificationCard
                    key={msg.id}
                    msg={msg}
                    isExpanded={expandedNotifId === msg.id}
                    onPress={() => {
                      if (!msg.read_at) markNotifAsRead(msg.id);
                      setExpandedNotifId((prev) =>
                        prev === msg.id ? null : msg.id,
                      );
                    }}
                    onDelete={() => deleteNotification(msg.id)}
                    onTournamentPress={(id) =>
                      router.push(`/(tabs)/tournament-detail?id=${id}&from=/(tabs)/notifications` as any)
                    }
                  />
                ))}
                <Text style={styles.hintText}>Long press to delete</Text>
              </>
            )}
          </>
        )}

        {/* ═══ MESSAGES TAB ═══ */}
        {activeTab === "messages" && (
          <>
            {conversations.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyIcon}>💬</Text>
                <Text style={styles.emptyTitle}>No conversations yet</Text>
                <Text style={styles.emptySubtitle}>
                  Send a message to a tournament director, venue owner, or
                  Compete support.
                </Text>
                <TouchableOpacity
                  style={styles.emptyComposeButton}
                  onPress={() => router.push("/compose-message" as any)}
                >
                  <Text style={styles.emptyComposeText}>
                    ✏️ Start a Conversation
                  </Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                {conversations.map((convo) => (
                  <ConversationCard
                    key={convo.id}
                    convo={convo}
                    onPress={() => openConversation(convo)}
                    onDelete={() => deleteConversation(convo.id)}
                  />
                ))}
                <Text style={styles.hintText}>Long press to delete</Text>
              </>
            )}
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
    width: 70,
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
  // ── New Message Button ──
  newMessageButton: {
    marginHorizontal: SPACING.md,
    marginTop: SPACING.sm,
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.sm,
    alignItems: "center",
  },
  newMessageButtonText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: "700",
    color: "#FFFFFF",
  },

  // ── Tabs ──
  tabRow: {
    flexDirection: "row",
    marginHorizontal: SPACING.md,
    marginTop: SPACING.xs,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: 3,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.md - 2,
    gap: 4,
  },
  tabActive: {
    backgroundColor: COLORS.primary,
  },
  tabText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: "600",
    color: COLORS.textSecondary,
  },
  tabTextActive: {
    color: "#FFFFFF",
  },
  tabBadge: {
    backgroundColor: "#E74C3C",
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  tabBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#FFFFFF",
  },

  // ── Action bar ──
  actionBar: {
    flexDirection: "row",
    justifyContent: "flex-end",
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
  },
  actionBarText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.primary,
    fontWeight: "600",
  },

  // ── Cards ──
  scrollContent: {
    flex: 1,
    marginTop: SPACING.sm,
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
    flex: 1,
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
  timeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  timeText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
  },
  unreadCountBadge: {
    backgroundColor: COLORS.primary,
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  unreadCountText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#FFFFFF",
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
  categoryBadgeRow: {
    flexDirection: "row",
    marginTop: 6,
  },
  categoryBadge: {
    backgroundColor: COLORS.primary + "15",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  categoryBadgeText: {
    fontSize: 10,
    color: COLORS.primary,
    fontWeight: "600",
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

  // ── Empty ──
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
  emptyComposeButton: {
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    marginTop: SPACING.lg,
  },
  emptyComposeText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: "700",
    color: "#FFFFFF",
  },

  bottomSpacer: {
    height: SPACING.xl * 2,
  },
});
