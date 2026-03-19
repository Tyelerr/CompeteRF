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
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
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

const isWeb = Platform.OS === "web";

// ── Helpers ──────────────────────────────────────────────────────────────────
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

// ── Inbox Card ────────────────────────────────────────────────────────────────
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

// ── Sent Card ─────────────────────────────────────────────────────────────────
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

// ═══════════════════════════════════════════════════════════
// MAIN SCREEN
// ═══════════════════════════════════════════════════════════
export default function AdminMessagesScreen() {
  const router = useRouter();
  const { user, profile } = useAuthContext();
  const role = profile?.role || "basic_user";

  const [activeTab, setActiveTab] = useState<"inbox" | "send" | "sent">(
    "inbox",
  );
  const [conversations, setConversations] = useState<ConversationPreview[]>([]);
  const [inboxLoading, setInboxLoading] = useState(true);
  const [inboxRefreshing, setInboxRefreshing] = useState(false);
  const [targetSearch, setTargetSearch] = useState("");
  const [venueDropdownOpen, setVenueDropdownOpen] = useState(false);

  const mc = useMessageCenter();

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
    }, [user?.id, loadInbox, mc.refresh]),
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
  const isBarOwner = role === "bar_owner";

  // ── Bar Owner: render venue + tournament selection ─────────────────────────
  const renderBarOwnerTargetSelection = () => {
    if (mc.isLoading) {
      return (
        <View style={styles.noTargetsBox}>
          <Text style={styles.noTargetsText}>Loading venues...</Text>
        </View>
      );
    }

    if (mc.venues.length === 0) {
      return (
        <View style={styles.noTargetsBox}>
          <Text style={styles.noTargetsText}>
            No venues found. You need to be assigned as an owner to a venue.
          </Text>
        </View>
      );
    }

    // Auto-select on first render if only one venue
    if (mc.venues.length === 1 && mc.selectedVenueId === null) {
      mc.selectVenue(mc.venues[0].id);
    }

    return (
      <>
        {/* Only show venue selector if 2+ venues */}
        {mc.venues.length > 1 && (
          <>
            <Text style={styles.stepLabel}>STEP 1 — SELECT VENUE</Text>
            <View style={styles.venueDropdownOuter}>
              <TouchableOpacity
                style={styles.venueDropdownTrigger}
                onPress={() => setVenueDropdownOpen((v) => !v)}
              >
                <Text style={styles.venueDropdownTriggerText}>
                  {mc.selectedVenueId
                    ? `🏢 ${mc.venues.find((v) => v.id === mc.selectedVenueId)?.name}`
                    : "Select a venue..."}
                </Text>
                <Text style={styles.venueDropdownArrow}>
                  {venueDropdownOpen ? "▲" : "▼"}
                </Text>
              </TouchableOpacity>

              {venueDropdownOpen && (
                <View style={styles.venueDropdownList}>
                  <ScrollView
                    keyboardShouldPersistTaps="handled"
                    nestedScrollEnabled
                    showsVerticalScrollIndicator
                  >
                    {[...mc.venues]
                      .sort((a, b) => a.name.localeCompare(b.name))
                      .map((v) => (
                        <TouchableOpacity
                          key={v.id}
                          style={[
                            styles.venueDropdownRow,
                            mc.selectedVenueId === v.id &&
                              styles.venueDropdownRowActive,
                          ]}
                          onPress={() => {
                            mc.selectVenue(v.id);
                            setVenueDropdownOpen(false);
                            setTargetSearch("");
                          }}
                        >
                          <Text
                            style={[
                              styles.venueDropdownRowText,
                              mc.selectedVenueId === v.id &&
                                styles.venueDropdownRowTextActive,
                            ]}
                            numberOfLines={1}
                          >
                            🏢 {v.name}
                          </Text>
                          <Text style={styles.targetCount}>
                            {v.totalFollowers} followers
                          </Text>
                        </TouchableOpacity>
                      ))}
                  </ScrollView>
                </View>
              )}
            </View>
          </>
        )}

        {/* Step 2: audience — only shown after venue selected */}
        {mc.selectedVenueId !== null && (
          <>
            <Text style={styles.stepLabel}>
              {mc.venues.length === 1
                ? "SELECT AUDIENCE"
                : "STEP 2 — SELECT AUDIENCE"}
            </Text>

            {/* Option A: All venue followers */}
            {(() => {
              const venue = mc.venues.find((v) => v.id === mc.selectedVenueId);
              if (!venue) return null;
              const isSelected =
                mc.form.target_type === "venue" &&
                mc.form.venue_id === venue.id;
              return (
                <TouchableOpacity
                  style={[
                    styles.allVenueChip,
                    isSelected && styles.allVenueChipActive,
                  ]}
                  onPress={() =>
                    mc.selectTarget(
                      "venue",
                      venue.id,
                      `All ${venue.name} followers`,
                    )
                  }
                >
                  <View style={styles.allVenueChipLeft}>
                    <Text
                      style={[
                        styles.allVenueChipText,
                        isSelected && styles.allVenueChipTextActive,
                      ]}
                    >
                      👥 All {venue.name} followers
                    </Text>
                    <Text style={styles.allVenueChipSub}>
                      Everyone who favorited any tournament at this venue
                    </Text>
                  </View>
                  <Text
                    style={[
                      styles.targetCount,
                      isSelected && styles.targetCountActive,
                    ]}
                  >
                    {venue.totalFollowers} people
                  </Text>
                </TouchableOpacity>
              );
            })()}

            {/* Option B: Specific tournament */}
            <Text style={styles.orDivider}>— or specific tournament —</Text>

            {mc.venueTournamentsLoading ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator size="small" color={COLORS.primary} />
                <Text style={styles.loadingText}>Loading tournaments...</Text>
              </View>
            ) : mc.venueTournaments.length === 0 ? (
              <View style={styles.noTargetsBox}>
                <Text style={styles.noTargetsText}>
                  No active tournaments at this venue
                </Text>
              </View>
            ) : (
              <View style={styles.targetSearchOuter}>
                <View style={styles.targetSearchWrap}>
                  <Text style={styles.targetSearchIcon}>🔍</Text>
                  <TextInput
                    style={styles.targetSearchInput}
                    value={targetSearch}
                    onChangeText={setTargetSearch}
                    placeholder="Search by tournament name or ID..."
                    placeholderTextColor={COLORS.textMuted}
                    returnKeyType="search"
                  />
                  {targetSearch.length > 0 && (
                    <TouchableOpacity onPress={() => setTargetSearch("")}>
                      <Text style={styles.targetSearchClear}>✕</Text>
                    </TouchableOpacity>
                  )}
                </View>

                {targetSearch.trim().length > 0 &&
                  (() => {
                    const q = targetSearch.toLowerCase();
                    const filtered = mc.venueTournaments.filter(
                      (t) =>
                        t.name.toLowerCase().includes(q) ||
                        String(t.id).includes(q),
                    );
                    return (
                      <View style={styles.targetDropdown}>
                        {filtered.length === 0 ? (
                          <View style={styles.targetDropdownEmpty}>
                            <Text style={styles.targetNoResults}>
                              No tournaments match your search
                            </Text>
                          </View>
                        ) : (
                          <ScrollView
                            style={styles.targetDropdownScroll}
                            keyboardShouldPersistTaps="handled"
                            nestedScrollEnabled
                            showsVerticalScrollIndicator
                          >
                            {filtered.map((t) => {
                              const isSelected =
                                mc.form.target_type === "tournament" &&
                                mc.form.tournament_id === t.id;
                              return (
                                <TouchableOpacity
                                  key={t.id}
                                  style={[
                                    styles.targetDropdownRow,
                                    isSelected &&
                                      styles.targetDropdownRowActive,
                                  ]}
                                  onPress={() => {
                                    mc.selectTarget("tournament", t.id, t.name);
                                    setTargetSearch("");
                                  }}
                                >
                                  <View style={styles.targetChipLeft}>
                                    <Text
                                      style={[
                                        styles.targetChipText,
                                        isSelected &&
                                          styles.targetChipTextActive,
                                      ]}
                                      numberOfLines={1}
                                    >
                                      🏆 {t.name}
                                    </Text>
                                    <View style={styles.targetChipMeta}>
                                      <Text style={styles.targetChipId}>
                                        ID: {t.id}
                                      </Text>
                                      {t.date && (
                                        <Text style={styles.targetChipDate}>
                                          📅 {t.date}
                                        </Text>
                                      )}
                                    </View>
                                  </View>
                                  <Text
                                    style={[
                                      styles.targetCount,
                                      isSelected && styles.targetCountActive,
                                    ]}
                                  >
                                    {t.followerCount} followers
                                  </Text>
                                </TouchableOpacity>
                              );
                            })}
                          </ScrollView>
                        )}
                      </View>
                    );
                  })()}
              </View>
            )}
          </>
        )}

        {/* Selected target summary */}
        {mc.selectedTargetId !== null && (
          <View style={styles.selectedTargetCard}>
            <View style={styles.selectedTargetLeft}>
              <Text style={styles.selectedTargetLabel}>Selected</Text>
              <Text style={styles.selectedTargetName} numberOfLines={1}>
                {mc.form.target_type === "venue" ? "👥" : "🏆"}{" "}
                {mc.form.target_name}
              </Text>
            </View>
            <View style={styles.selectedTargetRight}>
              <Text style={styles.selectedFollowerCount}>
                {mc.recipientCount} recipients
              </Text>
              <TouchableOpacity
                onPress={() => {
                  mc.selectTarget("tournament", null, "");
                  setTargetSearch("");
                }}
              >
                <Text style={styles.clearSelection}>✕ Clear</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </>
    );
  };

  // ── TD + Admin: render flat search list ───────────────────────────────────
  const renderTDTargetSelection = () => {
    if (mc.isLoading) {
      return (
        <View style={styles.noTargetsBox}>
          <Text style={styles.noTargetsText}>Loading tournaments...</Text>
        </View>
      );
    }

    if (mc.targets.length === 0) {
      return (
        <View style={styles.noTargetsBox}>
          <Text style={styles.noTargetsText}>
            No active tournaments found. Tournaments must have status = active
            to appear here.
          </Text>
        </View>
      );
    }

    return (
      <>
        {/* Selected target card */}
        {mc.selectedTargetId !== null &&
          (() => {
            const selected = mc.targets.find(
              (t) => t.id === mc.selectedTargetId,
            );
            if (!selected) return null;
            return (
              <View style={styles.selectedTargetCard}>
                <View style={styles.selectedTargetLeft}>
                  <Text style={styles.selectedTargetLabel}>Selected</Text>
                  <Text style={styles.selectedTargetName} numberOfLines={1}>
                    {selected.type === "tournament"
                      ? "🏆"
                      : selected.type === "all_users"
                        ? "👥"
                        : "🏢"}{" "}
                    {selected.name}
                  </Text>
                </View>
                <View style={styles.selectedTargetRight}>
                  {selected.favoriteCount !== undefined && (
                    <Text style={styles.selectedFollowerCount}>
                      {selected.favoriteCount} followers
                    </Text>
                  )}
                  <TouchableOpacity
                    onPress={() => {
                      mc.selectTarget("tournament", null, "");
                      setTargetSearch("");
                    }}
                  >
                    <Text style={styles.clearSelection}>✕ Clear</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })()}

        {/* Search with dropdown */}
        <View style={styles.targetSearchOuter}>
          <View style={styles.targetSearchWrap}>
            <Text style={styles.targetSearchIcon}>🔍</Text>
            <TextInput
              style={styles.targetSearchInput}
              value={targetSearch}
              onChangeText={setTargetSearch}
              placeholder="Search by name or ID..."
              placeholderTextColor={COLORS.textMuted}
              returnKeyType="search"
            />
            {targetSearch.length > 0 && (
              <TouchableOpacity onPress={() => setTargetSearch("")}>
                <Text style={styles.targetSearchClear}>✕</Text>
              </TouchableOpacity>
            )}
          </View>

          {targetSearch.trim().length > 0 &&
            (() => {
              const q = targetSearch.toLowerCase();
              const filtered = mc.targets.filter(
                (t) =>
                  t.name.toLowerCase().includes(q) || String(t.id).includes(q),
              );
              return (
                <View style={styles.targetDropdown}>
                  {filtered.length === 0 ? (
                    <View style={styles.targetDropdownEmpty}>
                      <Text style={styles.targetNoResults}>
                        No tournaments match your search
                      </Text>
                    </View>
                  ) : (
                    <ScrollView
                      style={styles.targetDropdownScroll}
                      keyboardShouldPersistTaps="handled"
                      nestedScrollEnabled
                      showsVerticalScrollIndicator
                    >
                      {filtered.map((target) => {
                        const isSelected = mc.selectedTargetId === target.id;
                        return (
                          <TouchableOpacity
                            key={`${target.type}-${target.id}`}
                            style={[
                              styles.targetDropdownRow,
                              isSelected && styles.targetDropdownRowActive,
                            ]}
                            onPress={() => {
                              mc.selectTarget(
                                target.type as
                                  | "tournament"
                                  | "venue"
                                  | "all_users",
                                target.id,
                                target.name,
                              );
                              setTargetSearch("");
                            }}
                          >
                            <View style={styles.targetChipLeft}>
                              <Text
                                style={[
                                  styles.targetChipText,
                                  isSelected && styles.targetChipTextActive,
                                ]}
                                numberOfLines={1}
                              >
                                {target.type === "tournament"
                                  ? "🏆"
                                  : target.type === "all_users"
                                    ? "👥"
                                    : "🏢"}{" "}
                                {target.name}
                              </Text>
                              <View style={styles.targetChipMeta}>
                                <Text style={styles.targetChipId}>
                                  ID: {target.id}
                                </Text>
                                {target.date && (
                                  <Text style={styles.targetChipDate}>
                                    📅 {target.date}
                                  </Text>
                                )}
                              </View>
                            </View>
                            <Text
                              style={[
                                styles.targetCount,
                                isSelected && styles.targetCountActive,
                              ]}
                            >
                              {target.favoriteCount ?? 0} followers
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                  )}
                </View>
              );
            })()}
        </View>
      </>
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      {/* Header */}
      <View style={[styles.header, isWeb && styles.headerWeb]}>
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
            isWeb ? undefined : (
              <RefreshControl
                refreshing={inboxRefreshing}
                onRefresh={onInboxRefresh}
                tintColor={COLORS.primary}
              />
            )
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
        <ScrollView
          style={styles.content}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[
            styles.broadcastScrollContent,
            isWeb && styles.scrollContentWeb,
          ]}
        >
          {mc.rateLimit && (
            <View
              style={[
                styles.rateLimitBar,
                !mc.rateLimit.allowed && styles.rateLimitBarBlocked,
              ]}
            >
              <Text
                style={[
                  styles.rateLimitText,
                  !mc.rateLimit.allowed && styles.rateLimitTextBlocked,
                ]}
              >
                {mc.rateLimit.allowed
                  ? `${mc.rateLimit.daily_remaining} broadcast${mc.rateLimit.daily_remaining !== 1 ? "s" : ""} remaining today`
                  : mc.rateLimit.daily_remaining === 0
                    ? "Daily broadcast limit reached. Resets at midnight."
                    : `Next broadcast available in ${mc.rateLimit.reason?.match(/\d+/)?.[0] ?? "a few"} minutes.`}
              </Text>
            </View>
          )}

          <Text style={styles.fieldLabel}>SEND TO</Text>

          {/* Bar owner gets two-level venue → tournament flow */}
          {isBarOwner
            ? renderBarOwnerTargetSelection()
            : renderTDTargetSelection()}

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
            returnKeyType="next"
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
              (!mc.isFormValid || mc.isSending || !mc.rateLimit?.allowed) &&
                styles.buttonDisabled,
            ]}
            onPress={mc.handleSend}
            disabled={!mc.isFormValid || mc.isSending || !mc.rateLimit?.allowed}
          >
            <Text style={styles.broadcastButtonText}>
              {mc.isSending
                ? "Sending..."
                : !mc.rateLimit?.allowed && mc.rateLimit?.reason
                  ? `Next broadcast available in ${mc.rateLimit.reason.match(/\d+/)?.[0] ?? "a few"} minutes.`
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
            isWeb ? undefined : (
              <RefreshControl
                refreshing={mc.isRefreshing}
                onRefresh={mc.refresh}
                tintColor={COLORS.primary}
              />
            )
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
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  scrollContentWeb: {
    alignItems: "center",
    paddingBottom: SPACING.xl,
  },
  broadcastScrollContent: {
    flexGrow: 1,
  },
  container: {
    ...Platform.select({
      web: {
        maxWidth: 860,
        width: "100%" as any,
        alignSelf: "center" as any,
      },
    }),
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.xl + SPACING.lg,
    paddingBottom: SPACING.sm,
    alignItems: "center",
  },
  headerWeb: { paddingTop: SPACING.lg },
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

  // Stats bar
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

  // Inbox card
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
  userDetailChipEmail: { flex: 1 },
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

  // Sent card
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

  // Broadcast
  rateLimitBar: {
    backgroundColor: COLORS.surface,
    marginHorizontal: SPACING.md,
    borderRadius: RADIUS.md,
    padding: SPACING.sm,
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  rateLimitBarBlocked: {
    backgroundColor: "rgba(229, 57, 53, 0.1)",
    borderColor: "#E53935",
  },
  rateLimitText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    fontWeight: "600",
  },
  rateLimitTextBlocked: { color: "#E53935" },
  fieldLabel: {
    fontSize: FONT_SIZES.xs,
    fontWeight: "700",
    color: COLORS.textSecondary,
    letterSpacing: 1,
    marginTop: SPACING.lg,
    marginBottom: SPACING.sm,
    marginHorizontal: SPACING.md,
  },
  stepLabel: {
    fontSize: FONT_SIZES.xs,
    fontWeight: "700",
    color: COLORS.primary,
    letterSpacing: 1,
    marginTop: SPACING.sm,
    marginBottom: SPACING.sm,
    marginHorizontal: SPACING.md,
  },

  // Venue dropdown (bar owner, 2+ venues)
  venueDropdownOuter: {
    marginHorizontal: SPACING.md,
    marginBottom: SPACING.sm,
    zIndex: 100,
  },
  venueDropdownTrigger: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: SPACING.md,
    height: 48,
  },
  venueDropdownTriggerText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.text,
    fontWeight: "500",
    flex: 1,
  },
  venueDropdownArrow: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    marginLeft: SPACING.sm,
  },
  venueDropdownList: {
    position: "absolute",
    top: 52,
    left: 0,
    right: 0,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.primary + "60",
    overflow: "hidden",
    maxHeight: 5 * 56, // 5 rows × 56px each
    zIndex: 200,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 10,
  },
  venueDropdownRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: SPACING.md,
    height: 56,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  venueDropdownRowActive: {
    backgroundColor: COLORS.primary + "20",
  },
  venueDropdownRowText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.text,
    fontWeight: "500",
    flex: 1,
  },
  venueDropdownRowTextActive: {
    color: COLORS.primary,
    fontWeight: "600",
  },

  // All venue followers option
  allVenueChip: {
    marginHorizontal: SPACING.md,
    marginBottom: SPACING.sm,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  allVenueChipActive: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primary + "15",
  },
  allVenueChipLeft: { flex: 1, marginRight: SPACING.sm },
  allVenueChipText: {
    fontSize: FONT_SIZES.md,
    fontWeight: "600",
    color: COLORS.text,
  },
  allVenueChipTextActive: { color: COLORS.primary },
  allVenueChipSub: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    marginTop: 2,
  },

  orDivider: {
    textAlign: "center",
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    marginVertical: SPACING.sm,
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: SPACING.sm,
    marginHorizontal: SPACING.md,
    padding: SPACING.md,
  },
  loadingText: { fontSize: FONT_SIZES.sm, color: COLORS.textMuted },

  // Shared target styles
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
  targetCount: { fontSize: FONT_SIZES.xs, color: COLORS.textMuted },
  targetCountActive: { color: COLORS.primary },
  targetNoResults: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textMuted,
    textAlign: "center",
    fontStyle: "italic",
  },
  targetChipLeft: { flex: 1, marginRight: SPACING.sm },
  targetChipMeta: { flexDirection: "row", gap: SPACING.sm, marginTop: 3 },
  targetChipId: { fontSize: 11, color: COLORS.textMuted, fontWeight: "600" },
  targetChipDate: { fontSize: 11, color: COLORS.textMuted },
  targetChipText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.text,
    fontWeight: "500",
    flex: 1,
  },
  targetChipTextActive: { color: COLORS.primary, fontWeight: "600" },

  // Selected target summary card
  selectedTargetCard: {
    marginHorizontal: SPACING.md,
    marginTop: SPACING.sm,
    marginBottom: SPACING.sm,
    backgroundColor: COLORS.primary + "15",
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
    borderColor: COLORS.primary,
    padding: SPACING.md,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  selectedTargetLeft: { flex: 1, marginRight: SPACING.sm },
  selectedTargetLabel: {
    fontSize: FONT_SIZES.xs,
    fontWeight: "700",
    color: COLORS.primary,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginBottom: 2,
  },
  selectedTargetName: {
    fontSize: FONT_SIZES.md,
    fontWeight: "600",
    color: COLORS.text,
  },
  selectedTargetRight: { alignItems: "flex-end", gap: 4 },
  selectedFollowerCount: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.primary,
    fontWeight: "600",
  },
  clearSelection: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    fontWeight: "600",
  },

  // Search + dropdown
  targetSearchOuter: {
    marginHorizontal: SPACING.md,
    marginBottom: SPACING.sm,
    zIndex: 100,
  },
  targetSearchWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: SPACING.sm,
    height: 44,
  },
  targetSearchIcon: { fontSize: 14, marginRight: SPACING.xs },
  targetSearchInput: {
    flex: 1,
    fontSize: FONT_SIZES.sm,
    color: COLORS.text,
    height: 44,
  },
  targetSearchClear: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textMuted,
    paddingLeft: SPACING.xs,
  },
  targetDropdown: {
    position: "absolute",
    top: 48,
    left: 0,
    right: 0,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.primary + "60",
    overflow: "hidden",
    zIndex: 200,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 10,
  },
  targetDropdownScroll: { maxHeight: 280 },
  targetDropdownEmpty: { padding: SPACING.md, alignItems: "center" },
  targetDropdownRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  targetDropdownRowActive: { backgroundColor: COLORS.primary + "20" },

  // Inputs
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
