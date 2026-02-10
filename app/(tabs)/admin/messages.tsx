// app/(tabs)/admin/messages.tsx
// ═══════════════════════════════════════════════════════════
// Message Center - Role-aware messaging screen
// TD sees their tournaments, Bar Owner sees their venues,
// Admins see broadcast options
// ═══════════════════════════════════════════════════════════

import { useState } from "react";
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useAuthContext } from "../../../src/providers/AuthProvider";
import { COLORS } from "../../../src/theme/colors";
import { SPACING } from "../../../src/theme/spacing";
import { FONT_SIZES } from "../../../src/theme/typography";
import { useMessageCenter } from "../../../src/viewmodels/hooks/use.message.center";

export default function MessagesScreen() {
  const { profile } = useAuthContext();
  const vm = useMessageCenter();

  if (vm.isLoading) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.loadingText}>Loading messages...</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl
          refreshing={vm.isRefreshing}
          onRefresh={vm.refresh}
          tintColor={COLORS.primary}
        />
      }
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>MESSAGES</Text>
        <Text style={styles.headerSubtitle}>
          {profile?.role === "tournament_director"
            ? "Send updates to players who favorited your tournaments"
            : profile?.role === "bar_owner"
              ? "Send messages to players who follow your venues"
              : "Broadcast messages to app users"}
        </Text>
      </View>

      {/* Rate Limit Status */}
      {vm.rateLimit && (
        <View style={styles.rateLimitBar}>
          <Text style={styles.rateLimitText}>
            📨 {vm.rateLimit.daily_remaining} messages remaining today
          </Text>
          {!vm.rateLimit.allowed && (
            <Text style={styles.rateLimitWarning}>
              {vm.rateLimit.reason}
            </Text>
          )}
        </View>
      )}

      {/* Tabs: Send / Sent */}
      <View style={styles.tabRow}>
        <TouchableOpacity
          style={[styles.tab, vm.activeTab === "send" && styles.tabActive]}
          onPress={() => vm.setActiveTab("send")}
        >
          <Text
            style={[
              styles.tabText,
              vm.activeTab === "send" && styles.tabTextActive,
            ]}
          >
            Send New
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, vm.activeTab === "sent" && styles.tabActive]}
          onPress={() => vm.setActiveTab("sent")}
        >
          <Text
            style={[
              styles.tabText,
              vm.activeTab === "sent" && styles.tabTextActive,
            ]}
          >
            Sent ({vm.sentMessages.length})
          </Text>
        </TouchableOpacity>
      </View>

      {/* SEND TAB */}
      {vm.activeTab === "send" && (
        <View style={styles.sendSection}>
          {/* Target Picker */}
          <Text style={styles.fieldLabel}>Send to</Text>
          {vm.targets.length === 0 &&
          profile?.role !== "super_admin" &&
          profile?.role !== "compete_admin" ? (
            <View style={styles.emptyTargets}>
              <Text style={styles.emptyTargetsText}>
                {profile?.role === "tournament_director"
                  ? "You don't have any active tournaments yet. Create a tournament first."
                  : profile?.role === "bar_owner"
                    ? "You don't have any venues yet. Create a venue first."
                    : "No targets available."}
              </Text>
            </View>
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.targetScroll}
            >
              {/* Admin: All Users / By State options */}
              {(profile?.role === "super_admin" ||
                profile?.role === "compete_admin") && (
                <>
                  <TouchableOpacity
                    style={[
                      styles.targetChip,
                      vm.form.target_type === "all_users" &&
                        styles.targetChipActive,
                    ]}
                    onPress={() =>
                      vm.selectTarget("all_users", null, "All Users")
                    }
                  >
                    <Text
                      style={[
                        styles.targetChipText,
                        vm.form.target_type === "all_users" &&
                          styles.targetChipTextActive,
                      ]}
                    >
                      📢 All Users
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.targetChip,
                      vm.form.target_type === "state" &&
                        styles.targetChipActive,
                    ]}
                    onPress={() =>
                      vm.selectTarget("state", null, "By State")
                    }
                  >
                    <Text
                      style={[
                        styles.targetChipText,
                        vm.form.target_type === "state" &&
                          styles.targetChipTextActive,
                      ]}
                    >
                      📍 By State
                    </Text>
                  </TouchableOpacity>
                </>
              )}

              {/* Tournament / Venue targets */}
              {vm.targets.map((target) => (
                <TouchableOpacity
                  key={target.id}
                  style={[
                    styles.targetChip,
                    vm.selectedTargetId === target.id &&
                      styles.targetChipActive,
                  ]}
                  onPress={() =>
                    vm.selectTarget(
                      target.type as "tournament" | "venue",
                      target.id,
                      target.name,
                    )
                  }
                >
                  <Text
                    style={[
                      styles.targetChipText,
                      vm.selectedTargetId === target.id &&
                        styles.targetChipTextActive,
                    ]}
                  >
                    {target.type === "tournament" ? "🏆" : "🏢"}{" "}
                    {target.name}
                  </Text>
                  {target.favoriteCount !== undefined && (
                    <Text
                      style={[
                        styles.targetChipCount,
                        vm.selectedTargetId === target.id &&
                          styles.targetChipTextActive,
                      ]}
                    >
                      {target.favoriteCount} followers
                    </Text>
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}

          {/* Recipient Count */}
          {vm.recipientCount > 0 && (
            <View style={styles.recipientBadge}>
              <Text style={styles.recipientText}>
                This message will reach {vm.recipientCount}{" "}
                {vm.recipientCount === 1 ? "person" : "people"}
              </Text>
            </View>
          )}

          {/* Subject */}
          <Text style={styles.fieldLabel}>Subject</Text>
          <TextInput
            style={styles.input}
            value={vm.form.subject}
            onChangeText={vm.updateSubject}
            placeholder="e.g. Tournament Update"
            placeholderTextColor={COLORS.textMuted}
            maxLength={100}
          />
          <Text style={styles.charCount}>{vm.form.subject.length}/100</Text>

          {/* Body */}
          <Text style={styles.fieldLabel}>Message</Text>
          <TextInput
            style={[styles.input, styles.bodyInput]}
            value={vm.form.body}
            onChangeText={vm.updateBody}
            placeholder="Type your message..."
            placeholderTextColor={COLORS.textMuted}
            multiline
            numberOfLines={5}
            textAlignVertical="top"
            maxLength={500}
          />
          <Text style={styles.charCount}>{vm.form.body.length}/500</Text>

          {/* Send Button */}
          <TouchableOpacity
            style={[
              styles.sendButton,
              (!vm.isFormValid ||
                !vm.rateLimit?.allowed ||
                vm.isSending) &&
                styles.sendButtonDisabled,
            ]}
            onPress={vm.handleSend}
            disabled={
              !vm.isFormValid || !vm.rateLimit?.allowed || vm.isSending
            }
          >
            <Text style={styles.sendButtonText}>
              {vm.isSending
                ? "Sending..."
                : `Send to ${vm.recipientCount} ${vm.recipientCount === 1 ? "person" : "people"}`}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* SENT TAB */}
      {vm.activeTab === "sent" && (
        <View style={styles.sentSection}>
          {vm.sentMessages.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyEmoji}>📭</Text>
              <Text style={styles.emptyTitle}>No messages sent yet</Text>
              <Text style={styles.emptySubtitle}>
                Switch to the Send tab to compose your first message
              </Text>
            </View>
          ) : (
            vm.sentMessages.map((msg) => (
              <View key={msg.message_id} style={styles.sentCard}>
                <View style={styles.sentCardHeader}>
                  <Text style={styles.sentCardSubject}>{msg.subject}</Text>
                  <Text style={styles.sentCardDate}>
                    {new Date(msg.sent_at).toLocaleDateString()}
                  </Text>
                </View>
                <Text style={styles.sentCardBody} numberOfLines={2}>
                  {msg.body}
                </Text>
                <View style={styles.sentCardStats}>
                  <Text style={styles.sentCardStat}>
                    📨 {msg.recipient_count} sent
                  </Text>
                  <Text style={styles.sentCardStat}>
                    👁 {msg.read_count} read
                  </Text>
                  <Text style={styles.sentCardStat}>
                    📊 {msg.read_rate}% open rate
                  </Text>
                </View>
              </View>
            ))
          )}
        </View>
      )}

      <View style={styles.bottomSpacer} />
    </ScrollView>
  );
}

// ============================================
// STYLES
// ============================================
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
  header: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.xl + SPACING.lg,
    paddingBottom: SPACING.md,
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
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
    textAlign: "center",
  },
  rateLimitBar: {
    backgroundColor: COLORS.surface,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    alignItems: "center",
  },
  rateLimitText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
  },
  rateLimitWarning: {
    fontSize: FONT_SIZES.xs,
    color: "#E74C3C",
    marginTop: 4,
  },
  tabRow: {
    flexDirection: "row",
    padding: SPACING.md,
    gap: SPACING.sm,
  },
  tab: {
    flex: 1,
    paddingVertical: SPACING.sm,
    borderRadius: 8,
    backgroundColor: COLORS.surface,
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  tabActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  tabText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: "600",
    color: COLORS.textSecondary,
  },
  tabTextActive: {
    color: "#FFFFFF",
  },
  sendSection: {
    padding: SPACING.md,
  },
  fieldLabel: {
    fontSize: FONT_SIZES.sm,
    fontWeight: "600",
    color: COLORS.text,
    marginBottom: SPACING.xs,
    marginTop: SPACING.md,
  },
  targetScroll: {
    flexGrow: 0,
    marginBottom: SPACING.sm,
  },
  targetChip: {
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    marginRight: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
  },
  targetChipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  targetChipText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: "600",
    color: COLORS.text,
  },
  targetChipTextActive: {
    color: "#FFFFFF",
  },
  targetChipCount: {
    fontSize: 10,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  emptyTargets: {
    backgroundColor: COLORS.surface,
    borderRadius: 8,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  emptyTargetsText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    textAlign: "center",
  },
  recipientBadge: {
    backgroundColor: "#1B4F72",
    borderRadius: 8,
    padding: SPACING.sm,
    marginTop: SPACING.sm,
    alignItems: "center",
  },
  recipientText: {
    fontSize: FONT_SIZES.sm,
    color: "#FFFFFF",
    fontWeight: "600",
  },
  input: {
    backgroundColor: COLORS.surface,
    borderRadius: 8,
    padding: SPACING.md,
    fontSize: FONT_SIZES.md,
    color: COLORS.text,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  bodyInput: {
    minHeight: 120,
  },
  charCount: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    textAlign: "right",
    marginTop: 4,
  },
  sendButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    padding: SPACING.md,
    alignItems: "center",
    marginTop: SPACING.lg,
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
  sendButtonText: {
    fontSize: FONT_SIZES.md,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  sentSection: {
    padding: SPACING.md,
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: SPACING.xl,
  },
  emptyEmoji: {
    fontSize: 48,
    marginBottom: SPACING.md,
  },
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
  sentCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  sentCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: SPACING.xs,
  },
  sentCardSubject: {
    fontSize: FONT_SIZES.md,
    fontWeight: "700",
    color: COLORS.text,
    flex: 1,
  },
  sentCardDate: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
  },
  sentCardBody: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    marginBottom: SPACING.sm,
  },
  sentCardStats: {
    flexDirection: "row",
    gap: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: SPACING.sm,
  },
  sentCardStat: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
  },
  bottomSpacer: {
    height: SPACING.xl * 2,
  },
});
