// src/views/components/notifications/NotificationsModal.tsx

import { useRouter } from "expo-router";
import { useCallback, useState } from "react";
import {
  Alert,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { supabase } from "../../../lib/supabase";
import {
  ConversationPreview,
  conversationService,
} from "../../../models/services/conversation.service";
import { COLORS } from "../../../theme/colors";
import { RADIUS, SPACING } from "../../../theme/spacing";
import { FONT_SIZES } from "../../../theme/typography";

const isWeb = Platform.OS === "web";

// -- Types ----------------------------------------------------------------------
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
  broadcastRecipientId?: string;
  pushNotificationId?: number;
}

// -- Helpers --------------------------------------------------------------------
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

const getBroadcastBadge = (senderRole: string) => {
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

const getPushBadge = (category: string | null) => {
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

const getConvoRoleInfo = (role: string | null) => {
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

// -- Notification Card ----------------------------------------------------------
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
      style={[s.card, isUnread && s.cardUnread]}
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
        <View style={[s.accentBar, { backgroundColor: item.badge.color }]} />
      )}
      <View style={s.cardContent}>
        <View style={s.cardTopRow}>
          <View
            style={[s.typeBadge, { backgroundColor: item.badge.color + "20" }]}
          >
            <Text style={s.typeBadgeIcon}>{item.badge.icon}</Text>
            <Text style={[s.typeBadgeText, { color: item.badge.color }]}>
              {item.badge.label}
            </Text>
          </View>
          <Text style={s.timeText}>{getTimeAgo(item.created_at)}</Text>
        </View>
        <Text style={[s.subjectText, isUnread && s.subjectTextUnread]}>
          {item.title}
        </Text>
        {isExpanded ? (
          <View style={s.expandedBody}>
            <Text style={s.bodyText}>{item.body}</Text>
            {item.tournament_id && (
              <TouchableOpacity
                style={s.linkButton}
                onPress={() => onTournamentPress(item.tournament_id!)}
              >
                <Text style={s.linkButtonText}>🏆 View Tournament</Text>
              </TouchableOpacity>
            )}
            {item.deep_link && !item.tournament_id && (
              <TouchableOpacity
                style={s.linkButton}
                onPress={() => onDeepLink(item.deep_link!)}
              >
                <Text style={s.linkButtonText}>View Details ?</Text>
              </TouchableOpacity>
            )}
            <View style={s.cardActions}>
              <TouchableOpacity onPress={onDelete}>
                <Text style={s.deleteLabel}>🗑uFE0F Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <Text style={s.previewText} numberOfLines={1}>
            {item.body}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );
};

// -- Conversation Card ----------------------------------------------------------
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
      style={[s.card, hasUnread && s.cardUnread]}
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
        <View style={[s.accentBar, { backgroundColor: roleInfo.color }]} />
      )}
      <View style={s.cardContent}>
        <View style={s.cardTopRow}>
          <View style={s.senderRow}>
            <View style={[s.senderDot, { backgroundColor: roleInfo.color }]} />
            <Text style={s.senderText}>
              {convo.is_support
                ? "📢 Compete Support"
                : `${roleInfo.icon} ${convo.other_participant_name || "Unknown"}`}
            </Text>
          </View>
          <View style={s.timeRow}>
            {hasUnread && (
              <View style={s.unreadBadge}>
                <Text style={s.unreadBadgeText}>{convo.unread_count}</Text>
              </View>
            )}
            <Text style={s.timeText}>
              {getTimeAgo(convo.last_message_at || convo.updated_at)}
            </Text>
          </View>
        </View>
        <Text style={[s.subjectText, hasUnread && s.subjectTextUnread]}>
          {convo.subject || getCategoryLabel(convo.category) || "Message"}
        </Text>
        {convo.last_message && (
          <Text style={s.previewText} numberOfLines={1}>
            {convo.last_message}
          </Text>
        )}
        {convo.category && (
          <View style={s.categoryBadgeRow}>
            <View style={s.categoryBadge}>
              <Text style={s.categoryBadgeText}>
                {getCategoryLabel(convo.category)}
              </Text>
            </View>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
};

// -- Main Modal -----------------------------------------------------------------
interface NotificationsModalProps {
  visible: boolean;
  onClose: () => void;
  userId: string | undefined;
  userIdAuto: number | undefined;
  /** If provided, "View Tournament" opens a modal instead of navigating */
  onViewTournament?: (id: string) => void;
}

export function NotificationsModal({
  visible,
  onClose,
  userId,
  userIdAuto,
  onViewTournament,
}: NotificationsModalProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"conversations" | "notifications">(
    "conversations",
  );
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [unifiedNotifications, setUnifiedNotifications] = useState<UnifiedNotification[]>([]);
  const [expandedNotifId, setExpandedNotifId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<ConversationPreview[]>([]);
  const [loaded, setLoaded] = useState(false);

  const loadBroadcasts = useCallback(async (): Promise<UnifiedNotification[]> => {
    if (!userId) return [];
    try {
      const { data, error } = await supabase
        .from("notification_message_recipients")
        .select(
          `id, message_id, read_at, created_at,
          notification_messages (id, subject, body, message_type, sender_role, tournament_id, venue_id, created_at)`,
        )
        .eq("user_id", userId)
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
    } catch {
      return [];
    }
  }, [userId]);

  const loadPushNotifications = useCallback(async (): Promise<UnifiedNotification[]> => {
    if (!userIdAuto) return [];
    try {
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", userIdAuto)
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
    } catch {
      return [];
    }
  }, [userIdAuto]);

  const loadConversations = useCallback(async () => {
    if (!userId) return;
    try {
      const convos = await conversationService.getConversations(userId);
      setConversations(convos);
    } catch {}
  }, [userId]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    const [broadcasts, pushNotifs] = await Promise.all([
      loadBroadcasts(),
      loadPushNotifications(),
    ]);
    await loadConversations();
    const merged = [...broadcasts, ...pushNotifs].sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
    setUnifiedNotifications(merged);
    setLoading(false);
    setLoaded(true);
  }, [loadBroadcasts, loadPushNotifications, loadConversations]);

  const handleOpen = useCallback(() => {
    if (!loaded) loadAll();
  }, [loaded, loadAll]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadAll();
    setRefreshing(false);
  }, [loadAll]);

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
    if (userId) {
      await supabase
        .from("notification_message_recipients")
        .update({ read_at: new Date().toISOString() })
        .eq("user_id", userId)
        .is("read_at", null);
    }
    if (userIdAuto) {
      await supabase
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("user_id", userIdAuto)
        .is("read_at", null);
    }
    setUnifiedNotifications((prev) =>
      prev.map((n) => ({
        ...n,
        read_at: n.read_at || new Date().toISOString(),
      })),
    );
  };

  const deleteConversation = async (convoId: string) => {
    if (!userId) return;
    await conversationService.leaveConversation(convoId, userId);
    setConversations((prev) => prev.filter((c) => c.id !== convoId));
  };

  const openConversation = (convo: ConversationPreview) => {
    const title =
      convo.subject ||
      convo.other_participant_name ||
      (convo.is_support ? "Support" : "Conversation");
    onClose();
    router.push(
      `/conversation-detail?id=${convo.id}&title=${encodeURIComponent(title)}` as any,
    );
  };

  const handleTournamentPress = (id: number) => {
    onClose();
    if (onViewTournament) {
      // Small delay so inbox closes before modal opens (avoids nested modal flash)
      setTimeout(() => onViewTournament(id.toString()), 150);
    } else {
      router.push(
        `/(tabs)/tournament-detail?id=${id}&from=/(tabs)/notifications` as any,
      );
    }
  };

  const unreadNotifCount = unifiedNotifications.filter(
    (n) => !n.read_at,
  ).length;
  const unreadConvoCount = conversations.reduce(
    (sum, c) => sum + c.unread_count,
    0,
  );

  if (!visible) return null;

  const innerContent = (
    <>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity style={s.closeButton} onPress={onClose}>
          <Text style={s.closeButtonText}>✕</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>INBOX</Text>
        <View style={{ width: 40 }} />
      </View>
      <View style={s.divider} />

      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          isWeb ? undefined : (
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={COLORS.primary}
            />
          )
        }
      >
        {/* Tabs */}
        <View style={s.tabRow}>
          <TouchableOpacity
            style={[s.tab, activeTab === "conversations" && s.tabActive]}
            onPress={() => setActiveTab("conversations")}
          >
            <Text
              style={[
                s.tabText,
                activeTab === "conversations" && s.tabTextActive,
              ]}
            >
              💬 Conversations
            </Text>
            {unreadConvoCount > 0 && (
              <View style={s.tabBadge}>
                <Text style={s.tabBadgeText}>{unreadConvoCount}</Text>
              </View>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.tab, activeTab === "notifications" && s.tabActive]}
            onPress={() => setActiveTab("notifications")}
          >
            <Text
              style={[
                s.tabText,
                activeTab === "notifications" && s.tabTextActive,
              ]}
            >
              🔔 Notifications
            </Text>
            {unreadNotifCount > 0 && (
              <View style={s.tabBadge}>
                <Text style={s.tabBadgeText}>{unreadNotifCount}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {activeTab === "conversations" && (
          <TouchableOpacity
            style={s.newMessageButton}
            onPress={() => {
              onClose();
              router.push("/compose-message" as any);
            }}
          >
            <Text style={s.newMessageButtonText}>✉️ New Message</Text>
          </TouchableOpacity>
        )}

        {loading ? (
          <View style={s.loadingState}>
            <Text style={s.loadingText}>Loading...</Text>
          </View>
        ) : (
          <>
            {/* -- Notifications Tab -- */}
            {activeTab === "notifications" && (
              <>
                <View style={s.actionRow}>
                  <TouchableOpacity
                    style={s.settingsLink}
                    onPress={() => {
                      onClose();
                      router.push("/(tabs)/notification-preferences" as any);
                    }}
                  >
                    <Text style={s.settingsLinkIcon}>⚙️</Text>
                    <Text style={s.settingsLinkText}>Notification Settings</Text>
                  </TouchableOpacity>
                  {unreadNotifCount > 0 && (
                    <TouchableOpacity onPress={markAllRead}>
                      <Text style={s.markAllText}>Mark all as read</Text>
                    </TouchableOpacity>
                  )}
                </View>

                {unifiedNotifications.length === 0 ? (
                  <View style={s.emptyState}>
                    <Text style={s.emptyIcon}>🔔</Text>
                    <Text style={s.emptyTitle}>No notifications</Text>
                    <Text style={s.emptySubtitle}>
                      Search alerts, tournament updates, and broadcasts will
                      appear here.
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
                        onTournamentPress={handleTournamentPress}
                        onDeepLink={(link) => {
                          onClose();
                          router.push(link as any);
                        }}
                      />
                    ))}
                    <Text style={s.hintText}>Long press to delete</Text>
                  </>
                )}
              </>
            )}

            {/* -- Conversations Tab -- */}
            {activeTab === "conversations" && (
              <>
                {conversations.length === 0 ? (
                  <View style={s.emptyState}>
                    <Text style={s.emptyIcon}>💬</Text>
                    <Text style={s.emptyTitle}>No conversations yet</Text>
                    <Text style={s.emptySubtitle}>
                      Send a message to a tournament director, venue owner, or
                      Compete support.
                    </Text>
                    <TouchableOpacity
                      style={s.emptyComposeButton}
                      onPress={() => {
                        onClose();
                        router.push("/compose-message" as any);
                      }}
                    >
                      <Text style={s.emptyComposeText}>
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
                    <Text style={s.hintText}>Long press to delete</Text>
                  </>
                )}
              </>
            )}
          </>
        )}

        <View style={{ height: SPACING.xl * 2 }} />
      </ScrollView>
    </>
  );

  if (isWeb) {
    return (
      <>
        <TouchableOpacity
          style={s.backdrop}
          activeOpacity={1}
          onPress={onClose}
        />
        <View style={s.dialogWrap} pointerEvents="box-none">
          <View style={s.dialog} onLayout={handleOpen}>
            {innerContent}
          </View>
        </View>
      </>
    );
  }

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onClose}
      onShow={handleOpen}
    >
      <View style={s.mobileOverlay}>
        <View style={s.mobileContainer}>
          {innerContent}
          <TouchableOpacity style={s.externalCloseButton} onPress={onClose}>
            <Text style={s.externalCloseText}>✕ Close</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// -- Styles ---------------------------------------------------------------------
const s = StyleSheet.create({
  backdrop: {
    position: "fixed" as any,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.75)",
    zIndex: 2000,
  },
  dialogWrap: {
    position: "fixed" as any,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 2001,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  dialog: {
    width: 700,
    maxWidth: "92%" as any,
    height: "82vh" as any,
    backgroundColor: "#000000",
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: "#2C2C2E",
    overflow: "hidden" as any,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 24,
    display: "flex" as any,
    flexDirection: "column",
  },
  mobileOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.75)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 50,
    paddingBottom: 110,
  },
  externalCloseButton: {
    margin: 12,
    paddingVertical: 14,
    alignItems: "center",
    backgroundColor: "#E74C3C",
    borderRadius: 12,
  },
  externalCloseText: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },
  mobileContainer: {
    backgroundColor: COLORS.background,
    borderRadius: 20,
    width: "100%" as any,
    maxWidth: 500,
    flex: 1,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.md,
  },
  closeButton: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  closeButtonText: { color: COLORS.text, fontSize: 20, fontWeight: "700" },
  headerTitle: {
    color: COLORS.text,
    fontSize: FONT_SIZES.lg,
    fontWeight: "700",
    letterSpacing: 1,
  },
  divider: { height: 1, backgroundColor: "#2C2C2E" },
  scroll: { flex: 1, minHeight: 0 },
  scrollContent: { padding: SPACING.md },
  tabRow: {
    flexDirection: "row",
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: 3,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: SPACING.sm,
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
  tabActive: { backgroundColor: COLORS.primary },
  tabText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: "600",
    color: COLORS.textSecondary,
  },
  tabTextActive: { color: "#fff" },
  tabBadge: {
    backgroundColor: "#E74C3C",
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  tabBadgeText: { fontSize: 10, fontWeight: "700", color: "#fff" },
  newMessageButton: {
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.sm,
    alignItems: "center",
    marginBottom: SPACING.sm,
  },
  newMessageButtonText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: "700",
    color: "#fff",
  },
  actionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: SPACING.sm,
  },
  settingsLink: { flexDirection: "row", alignItems: "center", gap: 6 },
  settingsLinkIcon: { fontSize: 16 },
  settingsLinkText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.primary,
    fontWeight: "600",
  },
  markAllText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.primary,
    fontWeight: "600",
  },
  card: {
    marginTop: SPACING.sm,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: "hidden",
  },
  cardUnread: { borderColor: COLORS.primary + "60" },
  accentBar: { height: 3, width: "100%" },
  cardContent: { padding: SPACING.md },
  cardTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  senderRow: { flexDirection: "row", alignItems: "center", gap: 6, flex: 1 },
  senderDot: { width: 8, height: 8, borderRadius: 4 },
  senderText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    fontWeight: "600",
  },
  typeBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    gap: 4,
  },
  typeBadgeIcon: { fontSize: 12 },
  typeBadgeText: { fontSize: 11, fontWeight: "700" },
  timeRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  timeText: { fontSize: FONT_SIZES.xs, color: COLORS.textMuted },
  unreadBadge: {
    backgroundColor: COLORS.primary,
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  unreadBadgeText: { fontSize: 10, fontWeight: "700", color: "#fff" },
  subjectText: {
    fontSize: FONT_SIZES.md,
    fontWeight: "600",
    color: COLORS.text,
    marginBottom: 4,
  },
  subjectTextUnread: { fontWeight: "700" },
  previewText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textMuted,
    lineHeight: 18,
  },
  categoryBadgeRow: { flexDirection: "row", marginTop: 6 },
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
  expandedBody: { marginTop: SPACING.xs },
  bodyText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    lineHeight: 22,
  },
  linkButton: {
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    alignItems: "center",
    marginTop: SPACING.md,
  },
  linkButtonText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: "700",
    color: "#fff",
  },
  cardActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: SPACING.md,
    paddingTop: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  deleteLabel: {
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
  loadingState: { alignItems: "center", paddingTop: SPACING.xl * 2 },
  loadingText: { fontSize: FONT_SIZES.md, color: COLORS.textSecondary },
  emptyState: {
    alignItems: "center",
    paddingTop: SPACING.xl * 2,
    paddingHorizontal: SPACING.xl,
  },
  emptyIcon: { fontSize: 48, marginBottom: SPACING.md },
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
  emptyComposeText: { fontSize: FONT_SIZES.sm, fontWeight: "700", color: "#fff" },
});
