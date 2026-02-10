// app/(tabs)/admin/messages.tsx
// ═══════════════════════════════════════════════════════════
// Admin Message Center
// Tab 1: Inbox - All conversations (support tickets, DMs)
// Tab 2: Broadcast - Send push notifications
// Tab 3: Sent - Broadcast history with read stats
// ═══════════════════════════════════════════════════════════

import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import {
  ConversationPreview,
  conversationService,
} from "../../../src/models/services/conversation.service";
import { useAuthContext } from "../../../src/providers/AuthProvider";
import { COLORS } from "../../../src/theme/colors";
import { RADIUS, SPACING } from "../../../src/theme/spacing";
import { FONT_SIZES } from "../../../src/theme/typography";
import { useMessageCenter } from "../../../src/viewmodels/hooks/use.message.center";

// ── Helpers ──
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

const getCategoryColor = (cat: string | null): string => {
  const map: Record<string, string> = {
    tournament_issues: "#E67E22",
    report_problem: "#E74C3C",
    feedback_suggestions: "#2ECC71",
    account_issues: "#3498DB",
    fargo_rating: "#9B59B6",
    become_td: "#1ABC9C",
    tournament_submission: "#F39C12",
    general: "#95A5A6",
    other: "#95A5A6",
  };
  return cat ? map[cat] || "#95A5A6" : "#95A5A6";
};

// ── Inbox Card ──
const InboxCard = ({
  convo,
  onPress,
}: {
  convo: ConversationPreview;
  onPress: () => void;
}) => {
  const hasUnread = convo.unread_count > 0;
  const catColor = getCategoryColor(convo.category);

  return (
    <TouchableOpacity
      style={[styles.inboxCard, hasUnread && styles.inboxCardUnread]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      {hasUnread && (
        <View style={[styles.accentBar, { backgroundColor: catColor }]} />
      )}
      <View style={styles.inboxCardContent}>
        <View style={styles.inboxTopRow}>
          <View style={styles.inboxFromRow}>
            {convo.is_support && (
              <View style={styles.supportTag}>
                <Text style={styles.supportTagText}>SUPPORT</Text>
              </View>
            )}
            <Text style={styles.inboxFromText} numberOfLines={1}>
              {convo.other_participant_name || "Unknown User"}
            </Text>
          </View>
          <View style={styles.inboxTimeRow}>
            {hasUnread && (
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadBadgeText}>{convo.unread_count}</Text>
              </View>
            )}
            <Text style={styles.inboxTimeText}>
              {getTimeAgo(convo.last_message_at || convo.updated_at)}
            </Text>
          </View>
        </View>
        <Text
          style={[styles.inboxSubject, hasUnread && styles.inboxSubjectUnread]}
          numberOfLines={1}
        >
          {convo.subject || getCategoryLabel(convo.category) || "No subject"}
        </Text>
        {convo.last_message && (
          <Text style={styles.inboxPreview} numberOfLines={1}>
            {convo.last_message}
          </Text>
        )}
        <View style={styles.badgeRow}>
          {convo.category && (
            <View
              style={[
                styles.categoryBadge,
                {
                  backgroundColor: catColor + "20",
                  borderColor: catColor + "40",
                },
              ]}
            >
              <Text style={[styles.categoryBadgeText, { color: catColor }]}>
                {getCategoryLabel(convo.category)}
              </Text>
            </View>
          )}
          {convo.tournament_id && (
            <View style={styles.tournamentBadge}>
              <Text style={styles.tournamentBadgeText}>
                🏆 #{convo.tournament_id}
              </Text>
            </View>
          )}
        </View>

        {/* Extra user info for admins */}
        {(convo.other_participant_email || convo.other_participant_id_auto) && (
          <View style={styles.userDetailRow}>
            {convo.other_participant_id_auto && (
              <View style={styles.userDetailChip}>
                <Text style={styles.userDetailLabel}>User ID</Text>
                <Text style={styles.userDetailValue}>
                  #{convo.other_participant_id_auto}
                </Text>
              </View>
            )}
            {convo.other_participant_email && (
              <View style={[styles.userDetailChip, styles.userDetailChipEmail]}>
                <Text style={styles.userDetailLabel}>Email</Text>
                <Text style={styles.userDetailValue} numberOfLines={1}>
                  {convo.other_participant_email}
                </Text>
              </View>
            )}
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
};

// ── Sent Card ──
const SentCard = ({
  msg,
}: {
  msg: {
    message_id: number;
    subject: string;
    body: string;
    sent_at: string;
    recipient_count: number;
    read_count: number;
    read_rate: number;
  };
}) => (
  <View style={styles.sentCard}>
    <View style={styles.sentTopRow}>
      <Text style={styles.sentSubject} numberOfLines={1}>
        {msg.subject}
      </Text>
      <Text style={styles.sentTime}>{getTimeAgo(msg.sent_at)}</Text>
    </View>
    <Text style={styles.sentPreview} numberOfLines={1}>
      {msg.body}
    </Text>
    <View style={styles.sentStatsRow}>
      <Text style={styles.sentStat}>📬 {msg.recipient_count} sent</Text>
      <Text style={styles.sentStat}>
        👁️ {msg.read_count} read ({msg.read_rate}%)
      </Text>
    </View>
  </View>
);

// ══════════════════════════════════════════════════════════
// MAIN SCREEN
// ══════════════════════════════════════════════════════════
export default function AdminMessagesScreen() {
  const router = useRouter();
  const { user } = useAuthContext();

  const [activeTab, setActiveTab] = useState<"inbox" | "send" | "sent">(
    "inbox",
  );

  // Inbox state
  const [conversations, setConversations] = useState<ConversationPreview[]>([]);
  const [inboxLoading, setInboxLoading] = useState(true);
  const [inboxRefreshing, setInboxRefreshing] = useState(false);

  // Broadcast state
  const mc = useMessageCenter();

  // Load inbox
  const loadInbox = useCallback(async () => {
    if (!user?.id) return;
    try {
      const convos = await conversationService.getConversations(user.id);
      setConversations(convos);
    } catch (err) {
      console.error("Error loading admin inbox:", err);
    } finally {
      setInboxLoading(false);
    }
  }, [user?.id]);

  useFocusEffect(
    useCallback(() => {
      if (user?.id) {
        loadInbox();
        mc.refresh();
      }
    }, [user?.id]),
  );

  const onInboxRefresh = useCallback(async () => {
    setInboxRefreshing(true);
    await loadInbox();
    setInboxRefreshing(false);
  }, [loadInbox]);

  const openConversation = (convo: ConversationPreview) => {
    const title =
      convo.subject ||
      convo.other_participant_name ||
      (convo.is_support ? "Support Ticket" : "Conversation");
    router.push(
      `/conversation-detail?id=${convo.id}&title=${encodeURIComponent(title)}` as any,
    );
  };

  const totalUnread = conversations.reduce((sum, c) => sum + c.unread_count, 0);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>MESSAGE CENTER</Text>
        <Text style={styles.headerSubtitle}>
          Manage conversations and broadcasts
        </Text>
      </View>

      {/* Tabs */}
      <View style={styles.tabRow}>
        <TouchableOpacity
          style={[styles.tab, activeTab === "inbox" && styles.tabActive]}
          onPress={() => setActiveTab("inbox")}
        >
          <Text
            style={[
              styles.tabText,
              activeTab === "inbox" && styles.tabTextActive,
            ]}
          >
            📥 Inbox
          </Text>
          {totalUnread > 0 && (
            <View style={styles.tabBadge}>
              <Text style={styles.tabBadgeText}>{totalUnread}</Text>
            </View>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === "send" && styles.tabActive]}
          onPress={() => setActiveTab("send")}
        >
          <Text
            style={[
              styles.tabText,
              activeTab === "send" && styles.tabTextActive,
            ]}
          >
            📢 Broadcast
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === "sent" && styles.tabActive]}
          onPress={() => setActiveTab("sent")}
        >
          <Text
            style={[
              styles.tabText,
              activeTab === "sent" && styles.tabTextActive,
            ]}
          >
            📨 Sent
          </Text>
        </TouchableOpacity>
      </View>

      {/* ═══ INBOX TAB ═══ */}
      {activeTab === "inbox" && (
        <ScrollView
          style={styles.content}
          refreshControl={
            <RefreshControl
              refreshing={inboxRefreshing}
              onRefresh={onInboxRefresh}
              tintColor={COLORS.primary}
            />
          }
        >
          {inboxLoading ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptySubtitle}>Loading...</Text>
            </View>
          ) : conversations.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>📥</Text>
              <Text style={styles.emptyTitle}>No conversations</Text>
              <Text style={styles.emptySubtitle}>
                Support tickets and direct messages will appear here
              </Text>
            </View>
          ) : (
            <>
              <View style={styles.statsBar}>
                <View style={styles.statItem}>
                  <Text style={styles.statNumber}>{conversations.length}</Text>
                  <Text style={styles.statLabel}>Total</Text>
                </View>
                <View style={styles.statItem}>
                  <Text style={[styles.statNumber, { color: "#E74C3C" }]}>
                    {totalUnread}
                  </Text>
                  <Text style={styles.statLabel}>Unread</Text>
                </View>
                <View style={styles.statItem}>
                  <Text style={[styles.statNumber, { color: "#3498DB" }]}>
                    {conversations.filter((c) => c.is_support).length}
                  </Text>
                  <Text style={styles.statLabel}>Support</Text>
                </View>
              </View>
              {conversations.map((convo) => (
                <InboxCard
                  key={convo.id}
                  convo={convo}
                  onPress={() => openConversation(convo)}
                />
              ))}
            </>
          )}
          <View style={styles.bottomSpacer} />
        </ScrollView>
      )}

      {/* ═══ BROADCAST TAB ═══ */}
      {activeTab === "send" && (
        <ScrollView style={styles.content} keyboardShouldPersistTaps="handled">
          {mc.rateLimit && (
            <View style={styles.rateLimitBar}>
              <Text style={styles.rateLimitText}>
                {mc.rateLimit.daily_remaining} broadcasts remaining today
              </Text>
            </View>
          )}

          <Text style={styles.fieldLabel}>SEND TO</Text>
          {mc.targets.length === 0 ? (
            <View style={styles.noTargetsBox}>
              <Text style={styles.noTargetsText}>
                No tournaments or venues to message. You need active tournaments
                with followers.
              </Text>
            </View>
          ) : (
            <View style={styles.targetList}>
              {mc.targets.map((target) => (
                <TouchableOpacity
                  key={`${target.type}-${target.id}`}
                  style={[
                    styles.targetChip,
                    mc.selectedTargetId === target.id &&
                      styles.targetChipActive,
                  ]}
                  onPress={() =>
                    mc.selectTarget(
                      target.type as "tournament" | "venue",
                      target.id,
                      target.name,
                    )
                  }
                >
                  <Text
                    style={[
                      styles.targetChipText,
                      mc.selectedTargetId === target.id &&
                        styles.targetChipTextActive,
                    ]}
                    numberOfLines={1}
                  >
                    {target.type === "tournament" ? "🏆" : "🏢"} {target.name}
                  </Text>
                  {target.favoriteCount !== undefined &&
                    target.favoriteCount > 0 && (
                      <Text style={styles.targetCount}>
                        {target.favoriteCount} followers
                      </Text>
                    )}
                </TouchableOpacity>
              ))}
            </View>
          )}

          {mc.recipientCount > 0 && (
            <Text style={styles.recipientCountText}>
              Will reach {mc.recipientCount}{" "}
              {mc.recipientCount === 1 ? "person" : "people"}
            </Text>
          )}

          <Text style={styles.fieldLabel}>SUBJECT</Text>
          <TextInput
            style={styles.input}
            value={mc.form.subject}
            onChangeText={mc.updateSubject}
            placeholder="Message subject..."
            placeholderTextColor={COLORS.textMuted}
            maxLength={100}
          />

          <Text style={styles.fieldLabel}>MESSAGE</Text>
          <TextInput
            style={[styles.input, styles.messageInput]}
            value={mc.form.body}
            onChangeText={mc.updateBody}
            placeholder="Type your broadcast message..."
            placeholderTextColor={COLORS.textMuted}
            multiline
            numberOfLines={6}
            textAlignVertical="top"
            maxLength={2000}
          />

          <TouchableOpacity
            style={[
              styles.broadcastButton,
              (!mc.isFormValid || mc.isSending) && styles.buttonDisabled,
            ]}
            onPress={mc.handleSend}
            disabled={!mc.isFormValid || mc.isSending}
          >
            <Text style={styles.broadcastButtonText}>
              {mc.isSending
                ? "Sending..."
                : `📢 Send Broadcast to ${mc.recipientCount} people`}
            </Text>
          </TouchableOpacity>

          <View style={styles.bottomSpacer} />
        </ScrollView>
      )}

      {/* ═══ SENT TAB ═══ */}
      {activeTab === "sent" && (
        <ScrollView
          style={styles.content}
          refreshControl={
            <RefreshControl
              refreshing={mc.isRefreshing}
              onRefresh={mc.refresh}
              tintColor={COLORS.primary}
            />
          }
        >
          {mc.sentMessages.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>📨</Text>
              <Text style={styles.emptyTitle}>No broadcasts sent</Text>
              <Text style={styles.emptySubtitle}>
                Broadcast messages you send will appear here with read stats
              </Text>
            </View>
          ) : (
            mc.sentMessages.map((msg) => (
              <SentCard key={String(msg.message_id)} msg={msg} />
            ))
          )}
          <View style={styles.bottomSpacer} />
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.xl + SPACING.lg,
    paddingBottom: SPACING.sm,
    alignItems: "center",
  },
  headerTitle: {
    fontSize: FONT_SIZES.xl,
    fontWeight: "700",
    color: COLORS.text,
    letterSpacing: 1,
  },
  headerSubtitle: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
  },
  tabRow: {
    flexDirection: "row",
    marginHorizontal: SPACING.md,
    marginTop: SPACING.sm,
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
  tabActive: { backgroundColor: COLORS.primary },
  tabText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: "600",
    color: COLORS.textSecondary,
  },
  tabTextActive: { color: "#FFFFFF" },
  tabBadge: {
    backgroundColor: "#E74C3C",
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  tabBadgeText: { fontSize: 10, fontWeight: "700", color: "#FFFFFF" },
  content: { flex: 1, marginTop: SPACING.sm },
  statsBar: {
    flexDirection: "row",
    marginHorizontal: SPACING.md,
    marginBottom: SPACING.sm,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  statItem: { flex: 1, alignItems: "center" },
  statNumber: {
    fontSize: FONT_SIZES.xl,
    fontWeight: "700",
    color: COLORS.text,
  },
  statLabel: { fontSize: FONT_SIZES.xs, color: COLORS.textMuted, marginTop: 2 },
  inboxCard: {
    marginHorizontal: SPACING.md,
    marginTop: SPACING.sm,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: "hidden",
  },
  inboxCardUnread: { borderColor: COLORS.primary + "60" },
  accentBar: { height: 3, width: "100%" },
  inboxCardContent: { padding: SPACING.md },
  inboxTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  inboxFromRow: { flexDirection: "row", alignItems: "center", gap: 6, flex: 1 },
  supportTag: {
    backgroundColor: "#3498DB20",
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  supportTagText: {
    fontSize: 9,
    fontWeight: "700",
    color: "#3498DB",
    letterSpacing: 0.5,
  },
  inboxFromText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    fontWeight: "600",
    flex: 1,
  },
  inboxTimeRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  inboxTimeText: { fontSize: FONT_SIZES.xs, color: COLORS.textMuted },
  unreadBadge: {
    backgroundColor: COLORS.primary,
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  unreadBadgeText: { fontSize: 10, fontWeight: "700", color: "#FFFFFF" },
  inboxSubject: {
    fontSize: FONT_SIZES.md,
    fontWeight: "600",
    color: COLORS.text,
    marginBottom: 2,
  },
  inboxSubjectUnread: { fontWeight: "700" },
  inboxPreview: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textMuted,
    lineHeight: 18,
    marginBottom: 6,
  },
  badgeRow: { flexDirection: "row", gap: 6 },
  categoryBadge: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderWidth: 1,
  },
  categoryBadgeText: { fontSize: 10, fontWeight: "600" },
  tournamentBadge: {
    backgroundColor: COLORS.primary + "15",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  tournamentBadgeText: {
    fontSize: 10,
    color: COLORS.primary,
    fontWeight: "600",
  },
  userDetailRow: {
    flexDirection: "row",
    gap: SPACING.sm,
    marginTop: SPACING.sm,
    paddingTop: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  userDetailChip: {
    backgroundColor: COLORS.background,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  userDetailChipEmail: {
    flex: 1,
  },
  userDetailLabel: {
    fontSize: 9,
    fontWeight: "700",
    color: COLORS.textMuted,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginBottom: 1,
  },
  userDetailValue: {
    fontSize: FONT_SIZES.xs,
    fontWeight: "600",
    color: COLORS.textSecondary,
  },
  sentCard: {
    marginHorizontal: SPACING.md,
    marginTop: SPACING.sm,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  sentTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  sentSubject: {
    fontSize: FONT_SIZES.md,
    fontWeight: "600",
    color: COLORS.text,
    flex: 1,
  },
  sentTime: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    marginLeft: SPACING.sm,
  },
  sentPreview: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textMuted,
    marginBottom: SPACING.sm,
  },
  sentStatsRow: {
    flexDirection: "row",
    gap: SPACING.md,
    paddingTop: SPACING.xs,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  sentStat: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    fontWeight: "500",
  },
  rateLimitBar: {
    backgroundColor: COLORS.surface,
    marginHorizontal: SPACING.md,
    borderRadius: RADIUS.md,
    padding: SPACING.sm,
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  rateLimitText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    fontWeight: "600",
  },
  fieldLabel: {
    fontSize: FONT_SIZES.xs,
    fontWeight: "700",
    color: COLORS.textSecondary,
    letterSpacing: 1,
    marginTop: SPACING.lg,
    marginBottom: SPACING.sm,
    marginHorizontal: SPACING.md,
  },
  targetList: { marginHorizontal: SPACING.md, gap: SPACING.xs },
  targetChip: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  targetChipActive: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primary + "15",
  },
  targetChipText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.text,
    fontWeight: "500",
    flex: 1,
  },
  targetChipTextActive: { color: COLORS.primary, fontWeight: "600" },
  targetCount: { fontSize: FONT_SIZES.xs, color: COLORS.textMuted },
  noTargetsBox: {
    marginHorizontal: SPACING.md,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  noTargetsText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textMuted,
    textAlign: "center",
  },
  recipientCountText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.primary,
    fontWeight: "600",
    marginHorizontal: SPACING.md,
    marginTop: SPACING.xs,
  },
  input: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    fontSize: FONT_SIZES.md,
    color: COLORS.text,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginHorizontal: SPACING.md,
  },
  messageInput: { minHeight: 120 },
  broadcastButton: {
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    alignItems: "center",
    marginHorizontal: SPACING.md,
    marginTop: SPACING.lg,
  },
  broadcastButtonText: {
    fontSize: FONT_SIZES.md,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  buttonDisabled: { opacity: 0.4 },
  emptyState: {
    alignItems: "center",
    paddingVertical: SPACING.xl * 2,
    paddingHorizontal: SPACING.xl,
  },
  emptyIcon: { fontSize: 48, marginBottom: SPACING.md },
  emptyTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: "700",
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },
  emptySubtitle: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    textAlign: "center",
  },
  bottomSpacer: { height: SPACING.xl * 2 },
});
