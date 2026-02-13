// app/(tabs)/notifications.tsx
// ═══════════════════════════════════════════════════════════
// Unified Inbox - Conversations + Notifications
// Notifications tab merges broadcast messages + push notifications
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

// ── Broadcast notification type (notification_messages table) ──
interface BroadcastNotification {
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

// ── Push notification type (notifications table) ──
interface PushNotification {
  id: number;
  user_id: number;
  title: string;
  body: string;
  category: string | null;
  data: Record<string, any> | null;
  read_at: string | null;
  status: string;
  created_at: string;
}

// ── Unified notification item for display ──
interface UnifiedNotification {
  id: string;
  source: "broadcast" | "push";
  title: string;
  body: string;
  read_at: string | null;
  created_at: string;
  badge: { label: string; color: string; icon: string };
  tournament_id: number | null;
  deep_link: string | null;
  // For marking read / deleting
  broadcastRecipientId?: string;
  pushNotificationId?: number;
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

// ── Badge info by source ──
const getBroadcastBadge = (
  senderRole: string,
): { label: string; color: string; icon: string } => {
  switch (senderRole) {
    case "tournament_director":
      return { label: "Broadcast", color: "#2ECC71", icon: "📣" };
    case "bar_owner":
      return { label: "Broadcast", color: "#E67E22", icon: "📣" };
    case "super_admin":
    case "compete_admin":
      return { label: "Broadcast", color: "#3498DB", icon: "📣" };
    default:
      return { label: "Broadcast", color: "#95A5A6", icon: "📣" };
  }
};

const getPushBadge = (
  category: string | null,
): { label: string; color: string; icon: string } => {
  switch (category) {
    case "search_alert_match":
      return { label: "Search Alert", color: "#9B59B6", icon: "🔔" };
    case "tournament_update":
      return { label: "Tournament", color: "#2ECC71", icon: "🏆" };
    case "giveaway_update":
      return { label: "Giveaway", color: "#E67E22", icon: "🎁" };
    case "venue_promotion":
      return { label: "Venue", color: "#E67E22", icon: "🏢" };
    case "app_announcement":
      return { label: "Announcement", color: "#3498DB", icon: "📢" };
    case "admin_alert":
      return { label: "Admin", color: "#E74C3C", icon: "🚩" };
    default:
      return { label: "Notification", color: "#3498DB", icon: "🔔" };
  }
};

// ── Conversation helpers ──
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

const getConvoRoleInfo = (
  role: string | null,
): { color: string; icon: string } => {
  switch (role) {
    case "tournament_director":
      return { color: "#2ECC71", icon: "🏆" };
    case "bar_owner":
      return { color: "#E67E22", icon: "🏢" };
    case "super_admin":
    case "compete_admin":
      return { color: "#3498DB", icon: "📢" };
    default:
      return { color: "#95A5A6", icon: "💬" };
  }
};

// ═══════════════════════════════════════════════════════════
// Unified Notification Card
// ═══════════════════════════════════════════════════════════
const NotificationCard = ({
  item,
  isExpanded,
  onPress,
  onDelete,
  onTournamentPress,
  onDeepLink,
}: {
  item: UnifiedNotification;
  isExpanded: boolean;
  onPress: () => void;
  onDelete: () => void;
  onTournamentPress: (id: number) => void;
  onDeepLink: (link: string) => void;
}) => {
  const isUnread = !item.read_at;

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
        <View
          style={[styles.accentBar, { backgroundColor: item.badge.color }]}
        />
      )}
      <View style={styles.cardContent}>
        <View style={styles.cardTopRow}>
          <View style={styles.senderRow}>
            <View
              style={[
                styles.typeBadge,
                { backgroundColor: item.badge.color + "20" },
              ]}
            >
              <Text style={styles.typeBadgeIcon}>{item.badge.icon}</Text>
              <Text style={[styles.typeBadgeText, { color: item.badge.color }]}>
                {item.badge.label}
              </Text>
            </View>
          </View>
          <Text style={styles.timeText}>{getTimeAgo(item.created_at)}</Text>
        </View>
        <Text
          style={[styles.subjectText, isUnread && styles.subjectTextUnread]}
        >
          {item.title}
        </Text>
        {isExpanded ? (
          <View style={styles.expandedBody}>
            <Text style={styles.bodyText}>{item.body}</Text>
            {item.tournament_id && (
              <TouchableOpacity
                style={styles.tournamentLink}
                onPress={() => onTournamentPress(item.tournament_id!)}
              >
                <Text style={styles.tournamentLinkText}>
                  🏆 View Tournament
                </Text>
              </TouchableOpacity>
            )}
            {item.deep_link && !item.tournament_id && (
              <TouchableOpacity
                style={styles.tournamentLink}
                onPress={() => onDeepLink(item.deep_link!)}
              >
                <Text style={styles.tournamentLinkText}>View Details →</Text>
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
            {item.body}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );
};

// ═══════════════════════════════════════════════════════════
// Conversation Card
// ═══════════════════════════════════════════════════════════
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
    ? getConvoRoleInfo(convo.other_participant_role)
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

// ═══════════════════════════════════════════════════════════
// MAIN SCREEN
// ═══════════════════════════════════════════════════════════
export default function NotificationsScreen() {
  const router = useRouter();
  const { user, profile } = useAuthContext();

  const [activeTab, setActiveTab] = useState<"conversations" | "notifications">(
    "conversations",
  );
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Notifications state (unified)
  const [unifiedNotifications, setUnifiedNotifications] = useState<
    UnifiedNotification[]
  >([]);
  const [expandedNotifId, setExpandedNotifId] = useState<string | null>(null);

  // Conversations state
  const [conversations, setConversations] = useState<ConversationPreview[]>([]);

  // ── Load broadcast notifications ──
  const loadBroadcasts = useCallback(async (): Promise<
    UnifiedNotification[]
  > => {
    if (!user?.id) return [];
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

      return ((data as unknown as BroadcastNotification[]) || []).map((msg) => {
        const notif = msg.notification_messages;
        return {
          id: `broadcast-${msg.id}`,
          source: "broadcast" as const,
          title: notif?.subject || "Message",
          body: notif?.body || "",
          read_at: msg.read_at,
          created_at: msg.created_at,
          badge: getBroadcastBadge(notif?.sender_role || ""),
          tournament_id: notif?.tournament_id || null,
          deep_link: null,
          broadcastRecipientId: msg.id,
        };
      });
    } catch (err) {
      console.error("Error loading broadcasts:", err);
      return [];
    }
  }, [user?.id]);

  // ── Load push notifications ──
  const loadPushNotifications = useCallback(async (): Promise<
    UnifiedNotification[]
  > => {
    if (!profile?.id_auto) return [];
    try {
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", profile.id_auto)
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) throw error;

      return ((data as PushNotification[]) || []).map((notif) => ({
        id: `push-${notif.id}`,
        source: "push" as const,
        title: notif.title,
        body: notif.body,
        read_at: notif.read_at,
        created_at: notif.created_at,
        badge: getPushBadge(notif.category),
        tournament_id: (notif.data?.tournament_id as number) || null,
        deep_link: (notif.data?.deep_link as string) || null,
        pushNotificationId: notif.id,
      }));
    } catch (err) {
      console.error("Error loading push notifications:", err);
      return [];
    }
  }, [profile?.id_auto]);

  // ── Load conversations ──
  const loadConversations = useCallback(async () => {
    if (!user?.id) return;
    try {
      const convos = await conversationService.getConversations(user.id);
      setConversations(convos);
    } catch (err) {
      console.error("Error loading conversations:", err);
    }
  }, [user?.id]);

  // ── Load all ──
  const loadAll = useCallback(async () => {
    setLoading(true);
    const [broadcasts, pushNotifs] = await Promise.all([
      loadBroadcasts(),
      loadPushNotifications(),
    ]);
    await loadConversations();

    // Merge and sort by date (newest first)
    const merged = [...broadcasts, ...pushNotifs].sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );

    setUnifiedNotifications(merged);
    setLoading(false);
  }, [loadBroadcasts, loadPushNotifications, loadConversations]);

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
  const markNotifAsRead = async (item: UnifiedNotification) => {
    if (item.source === "broadcast" && item.broadcastRecipientId) {
      await supabase
        .from("notification_message_recipients")
        .update({ read_at: new Date().toISOString() })
        .eq("id", item.broadcastRecipientId);
    } else if (item.source === "push" && item.pushNotificationId) {
      await supabase
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("id", item.pushNotificationId);
    }
    setUnifiedNotifications((prev) =>
      prev.map((n) =>
        n.id === item.id ? { ...n, read_at: new Date().toISOString() } : n,
      ),
    );
  };

  const deleteNotification = async (item: UnifiedNotification) => {
    if (item.source === "broadcast" && item.broadcastRecipientId) {
      await supabase
        .from("notification_message_recipients")
        .delete()
        .eq("id", item.broadcastRecipientId);
    } else if (item.source === "push" && item.pushNotificationId) {
      await supabase
        .from("notifications")
        .delete()
        .eq("id", item.pushNotificationId);
    }
    setUnifiedNotifications((prev) => prev.filter((n) => n.id !== item.id));
    if (expandedNotifId === item.id) setExpandedNotifId(null);
  };

  const markAllRead = async () => {
    // Mark broadcast notifications read
    if (user?.id) {
      await supabase
        .from("notification_message_recipients")
        .update({ read_at: new Date().toISOString() })
        .eq("user_id", user.id)
        .is("read_at", null);
    }

    // Mark push notifications read
    if (profile?.id_auto) {
      await supabase
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("user_id", profile.id_auto)
        .is("read_at", null);
    }

    setUnifiedNotifications((prev) =>
      prev.map((n) => ({
        ...n,
        read_at: n.read_at || new Date().toISOString(),
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
  const unreadNotifCount = unifiedNotifications.filter(
    (n) => !n.read_at,
  ).length;
  const unreadConvoCount = conversations.reduce(
    (sum, c) => sum + c.unread_count,
    0,
  );

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.headerSide}
          onPress={() => router.back()}
        >
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>INBOX</Text>
        <View style={styles.headerSide} />
      </View>

      {/* Tabs */}
      <View style={styles.tabRow}>
        <TouchableOpacity
          style={[
            styles.tab,
            activeTab === "conversations" && styles.tabActive,
          ]}
          onPress={() => setActiveTab("conversations")}
        >
          <Text
            style={[
              styles.tabText,
              activeTab === "conversations" && styles.tabTextActive,
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

      {/* New Message Button — only on Conversations tab */}
      {activeTab === "conversations" && (
        <TouchableOpacity
          style={styles.newMessageButton}
          onPress={() => router.push("/compose-message" as any)}
        >
          <Text style={styles.newMessageButtonText}>✉️ New Message</Text>
        </TouchableOpacity>
      )}

      <ScrollView
        style={styles.scrollContent}
        contentContainerStyle={
          (activeTab === "notifications"
            ? unifiedNotifications.length
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
            {/* Settings + Mark all read row */}
            <View style={styles.notifActionRow}>
              <TouchableOpacity
                style={styles.settingsLink}
                onPress={() =>
                  router.push("/(tabs)/notification-preferences" as any)
                }
              >
                <Text style={styles.settingsLinkIcon}>⚙️</Text>
                <Text style={styles.settingsLinkText}>
                  Notification Settings
                </Text>
              </TouchableOpacity>
              {unreadNotifCount > 0 && (
                <TouchableOpacity onPress={markAllRead}>
                  <Text style={styles.actionBarText}>Mark all as read</Text>
                </TouchableOpacity>
              )}
            </View>

            {unifiedNotifications.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyIcon}>🔔</Text>
                <Text style={styles.emptyTitle}>No notifications</Text>
                <Text style={styles.emptySubtitle}>
                  Search alert matches, tournament updates, giveaway news, and
                  broadcasts will appear here.
                </Text>
              </View>
            ) : (
              <>
                {unifiedNotifications.map((item) => (
                  <NotificationCard
                    key={item.id}
                    item={item}
                    isExpanded={expandedNotifId === item.id}
                    onPress={() => {
                      if (!item.read_at) markNotifAsRead(item);
                      setExpandedNotifId((prev) =>
                        prev === item.id ? null : item.id,
                      );
                    }}
                    onDelete={() => deleteNotification(item)}
                    onTournamentPress={(id) =>
                      router.push(
                        `/(tabs)/tournament-detail?id=${id}&from=/(tabs)/notifications` as any,
                      )
                    }
                    onDeepLink={(link) => router.push(link as any)}
                  />
                ))}
                <Text style={styles.hintText}>Long press to delete</Text>
              </>
            )}
          </>
        )}

        {/* ═══ CONVERSATIONS TAB ═══ */}
        {activeTab === "conversations" && (
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
  headerSide: {
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
  notifActionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  settingsLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  settingsLinkIcon: {
    fontSize: 16,
  },
  settingsLinkText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.primary,
    fontWeight: "600",
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
    marginTop: SPACING.md,
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

  // ── Type Badge (Broadcast / Search Alert / Giveaway etc.) ──
  typeBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    gap: 4,
  },
  typeBadgeIcon: {
    fontSize: 12,
  },
  typeBadgeText: {
    fontSize: 11,
    fontWeight: "700",
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
