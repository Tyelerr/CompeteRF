// src/viewmodels/hooks/use.message.center.ts
// ═══════════════════════════════════════════════════════════
// Message Center ViewModel
// Powers the messages screen for TD, Bar Owner, and Admin roles.
// Uses notification_messages / notification_message_recipients tables
// (separate from existing support ticket messages table)
// ViewModel layer: React hooks + service calls. No JSX. No Supabase.
// ═══════════════════════════════════════════════════════════

import { useCallback, useEffect, useState } from "react";
import { Alert } from "react-native";
import { supabase } from "../../lib/supabase";
import { notificationService } from "../../models/services/notification.service";
import { rateLimitService } from "../../models/services/rate-limit.service";
import {
  ComposeMessageForm,
  INITIAL_COMPOSE_FORM,
  MessageStats,
  RateLimitStatus,
  SenderRole,
  TargetType,
} from "../../models/types/notification.types";
import { useAuthContext } from "../../providers/AuthProvider";

// —— Types ——

interface MessageTarget {
  id: number | string;
  name: string;
  type: "tournament" | "venue";
  favoriteCount?: number;
}

interface UseMessageCenterReturn {
  isLoading: boolean;
  isRefreshing: boolean;
  isSending: boolean;
  activeTab: "send" | "sent";
  setActiveTab: (tab: "send" | "sent") => void;
  form: ComposeMessageForm;
  updateSubject: (subject: string) => void;
  updateBody: (body: string) => void;
  isFormValid: boolean;
  targets: MessageTarget[];
  selectedTargetId: number | string | null;
  selectTarget: (
    type: TargetType,
    id: number | string | null,
    name: string,
  ) => void;
  recipientCount: number;
  rateLimit: RateLimitStatus | null;
  handleSend: () => Promise<void>;
  sentMessages: MessageStats[];
  refresh: () => Promise<void>;
}

export function useMessageCenter(): UseMessageCenterReturn {
  const { user, profile } = useAuthContext();
  const userId = user?.id;
  const role = (profile?.role || "basic_user") as SenderRole;

  // —— State ——
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [activeTab, setActiveTab] = useState<"send" | "sent">("send");
  const [form, setForm] = useState<ComposeMessageForm>(INITIAL_COMPOSE_FORM);
  const [targets, setTargets] = useState<MessageTarget[]>([]);
  const [selectedTargetId, setSelectedTargetId] = useState<number | string | null>(null);
  const [recipientCount, setRecipientCount] = useState(0);
  const [rateLimit, setRateLimit] = useState<RateLimitStatus | null>(null);
  const [sentMessages, setSentMessages] = useState<MessageStats[]>([]);

  // —— Load Targets (tournaments/venues the user can message) ——
  const loadTargets = useCallback(async () => {
    if (!userId) return;

    try {
      const loadedTargets: MessageTarget[] = [];

      if (role === "super_admin") {
        // Super admin can message all users
        const { count } = await supabase
          .from("profiles")
          .select("id", { count: "exact", head: true });

        loadedTargets.push({
          id: "all_users",
          name: "All Users",
          type: "venue",
          favoriteCount: count || 0,
        });
      } else if (role === "tournament_director") {
        const { data: tournaments } = await supabase
          .from("tournaments")
          .select("id, name")
          .eq("director_id", userId)
          .in("status", ["active"]);

        if (tournaments) {
          for (const t of tournaments) {
            const { count } = await supabase
              .from("favorites")
              .select("id", { count: "exact", head: true })
              .eq("tournament_id", t.id);

            loadedTargets.push({
              id: t.id,
              name: t.name,
              type: "tournament",
              favoriteCount: count || 0,
            });
          }
        }
      } else if (role === "bar_owner") {
        const { data: venueLinks } = await supabase
          .from("venue_owners")
          .select("venue_id, venues(id, venue)")
          .eq("owner_id", userId);

        if (venueLinks) {
          for (const vl of venueLinks) {
            const venue = vl.venues as unknown as {
              id: number;
              venue: string;
            } | null;
            if (!venue) continue;

            const { data: favData } = await supabase
              .from("favorites")
              .select("user_id, tournaments!inner(venue_id)")
              .eq("tournaments.venue_id", venue.id);

            const uniqueUsers = new Set(
              favData?.map(
                (f: { user_id: string; tournaments: unknown }) => f.user_id,
              ) || [],
            );

            loadedTargets.push({
              id: venue.id,
              name: venue.venue,
              type: "venue",
              favoriteCount: uniqueUsers.size,
            });
          }
        }
      }

      setTargets(loadedTargets);

      // Auto-select for super admin since there's only one option
      if (role === "super_admin" && loadedTargets.length === 1) {
        selectTarget("all_users", "all_users", "All Users");
      }
    } catch (err) {
      console.error("Error loading targets:", err);
    }
  }, [userId, role]);

  // —— Load Rate Limit ——
  const loadRateLimit = useCallback(async () => {
    if (!userId) return;
    try {
      const status = await rateLimitService.checkRateLimit(userId, role);
      setRateLimit(status);
    } catch (err) {
      console.error("Error loading rate limit:", err);
    }
  }, [userId, role]);

  // —— Load Sent Messages ——
  const loadSentMessages = useCallback(async () => {
    if (!userId) return;
    try {
      const { data, error } = await supabase
        .from("notification_messages")
        .select("*")
        .eq("sender_id", userId)
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) throw error;

      const stats: MessageStats[] = [];
      for (const msg of data || []) {
        const { count: readCount } = await supabase
          .from("notification_message_recipients")
          .select("id", { count: "exact", head: true })
          .eq("message_id", msg.id)
          .not("read_at", "is", null);

        stats.push({
          message_id: msg.id,
          subject: msg.subject,
          body: msg.body,
          message_type: msg.message_type,
          sent_at: msg.created_at,
          recipient_count: msg.recipient_count || 0,
          read_count: readCount || 0,
          read_rate:
            msg.recipient_count > 0
              ? Math.round(((readCount || 0) / msg.recipient_count) * 100)
              : 0,
          tournament_id: msg.tournament_id,
          venue_id: msg.venue_id,
        });
      }

      setSentMessages(stats);
    } catch (err) {
      console.error("Error loading sent messages:", err);
    }
  }, [userId]);

  // —— Load All ——
  const loadAll = useCallback(async () => {
    setIsLoading(true);
    try {
      await Promise.all([loadTargets(), loadRateLimit(), loadSentMessages()]);
    } finally {
      setIsLoading(false);
    }
  }, [loadTargets, loadRateLimit, loadSentMessages]);

  useEffect(() => {
    if (userId) {
      loadAll();
    }
  }, [userId, loadAll]);

  // —— Select Target ——
  const updateRecipientCount = useCallback(
    async (type: TargetType, id: number | string | null) => {
      try {
        if (type === "tournament" && id) {
          const { count } = await supabase
            .from("favorites")
            .select("id", { count: "exact", head: true })
            .eq("tournament_id", id);
          setRecipientCount(count || 0);
        } else if (type === "venue" && id) {
          const { data } = await supabase
            .from("favorites")
            .select("user_id, tournaments!inner(venue_id)")
            .eq("tournaments.venue_id", id);
          const unique = new Set(
            data?.map(
              (f: { user_id: string; tournaments: unknown }) => f.user_id,
            ) || [],
          );
          setRecipientCount(unique.size);
        } else if (type === "all_users") {
          const { count } = await supabase
            .from("profiles")
            .select("id", { count: "exact", head: true });
          setRecipientCount(count || 0);
        } else if (type === "state") {
          setRecipientCount(0);
        }
      } catch (err) {
        console.error("Error getting recipient count:", err);
        setRecipientCount(0);
      }
    },
    [],
  );

  function selectTarget(
    type: TargetType,
    id: number | string | null,
    name: string,
  ) {
    setSelectedTargetId(id);
    setForm((prev) => ({
      ...prev,
      target_type: type,
      tournament_id: type === "tournament" ? (id as number) : null,
      venue_id: type === "venue" ? (id as number) : null,
      target_name: name,
    }));
    updateRecipientCount(type, id);
  }

  // —— Form Updates ——
  function updateSubject(subject: string) {
    setForm((prev) => ({ ...prev, subject }));
  }

  function updateBody(body: string) {
    setForm((prev) => ({ ...prev, body }));
  }

  const isFormValid =
    form.subject.trim().length > 0 &&
    form.body.trim().length > 0 &&
    (selectedTargetId !== null ||
      form.target_type === "all_users" ||
      form.target_type === "state") &&
    recipientCount > 0;

  // —— Resolve Recipients ——
  async function resolveRecipients(
    targetType: TargetType,
    tournamentId: number | null,
    venueId: number | null,
  ): Promise<string[]> {
    try {
      let userIds: string[] = [];

      if (targetType === "tournament" && tournamentId) {
        const { data } = await supabase
          .from("favorites")
          .select("user_id")
          .eq("tournament_id", tournamentId);
        userIds = data?.map((f: { user_id: string }) => f.user_id) || [];
      } else if (targetType === "venue" && venueId) {
        const { data } = await supabase
          .from("favorites")
          .select("user_id, tournaments!inner(venue_id)")
          .eq("tournaments.venue_id", venueId);
        const unique = new Set(
          data?.map(
            (f: { user_id: string; tournaments: unknown }) => f.user_id,
          ) || [],
        );
        userIds = Array.from(unique);
      } else if (targetType === "all_users") {
        const { data } = await supabase.from("profiles").select("id");
        userIds = data?.map((p: { id: string }) => p.id) || [];
      }

      if (userIds.length === 0) return [];

      // Filter out users who opted out
      const preferenceKey =
        targetType === "tournament"
          ? "tournament_updates"
          : targetType === "venue"
            ? "venue_promotions"
            : "app_announcements";

      const { data: optedOut } = await supabase
        .from("notification_preferences")
        .select("user_id")
        .in("user_id", userIds)
        .eq(preferenceKey, false);

      const optedOutSet = new Set(
        optedOut?.map((p: { user_id: string }) => p.user_id) || [],
      );

      // Exclude sender and opted-out users
      return userIds.filter(
        (uid) => uid !== userId && !optedOutSet.has(uid),
      );
    } catch (err) {
      console.error("Error resolving recipients:", err);
      return [];
    }
  }

  // —— Send Message ——
  async function handleSend(): Promise<void> {
    if (!userId || !isFormValid || !rateLimit?.allowed) return;

    Alert.alert(
      "Send Message",
      `Send this message to ${recipientCount} ${recipientCount === 1 ? "person" : "people"}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Send",
          style: "default",
          onPress: async () => {
            setIsSending(true);
            try {
              // 1. Create notification message
              const { data: message, error: msgError } = await supabase
                .from("notification_messages")
                .insert({
                  sender_id: userId,
                  sender_role: role,
                  subject: form.subject.trim(),
                  body: form.body.trim(),
                  message_type: form.message_type,
                  target_type: form.target_type,
                  tournament_id: form.tournament_id,
                  venue_id: form.venue_id,
                  recipient_count: recipientCount,
                })
                .select()
                .single();

              if (msgError) throw msgError;

              // 2. Resolve recipients
              const recipientIds = await resolveRecipients(
                form.target_type,
                form.tournament_id,
                form.venue_id,
              );

              // 3. Create notification_message_recipients rows
              if (recipientIds.length > 0) {
                const recipients = recipientIds.map((uid: string) => ({
                  message_id: message.id,
                  user_id: uid,
                }));

                const { error: recError } = await supabase
                  .from("notification_message_recipients")
                  .insert(recipients);

                if (recError) throw recError;

                // 4. Send push notifications
                const tokens =
                  await notificationService.getTokensForUsers(recipientIds);
                const tokenStrings = tokens.map((t) => t.token);

                if (tokenStrings.length > 0) {
                  await notificationService.sendPushBatch(
                    tokenStrings,
                    form.subject.trim(),
                    form.body.trim(),
                    {
                      message_id: message.id,
                      tournament_id: form.tournament_id,
                      venue_id: form.venue_id,
                      deep_link: form.tournament_id
                        ? `/tournament-detail?id=${form.tournament_id}`
                        : null,
                    },
                  );

                  // Mark push_sent on recipients with tokens
                  const usersWithTokens = new Set(
                    tokens.map((t) => t.user_id),
                  );
                  for (const uid of usersWithTokens) {
                    await supabase
                      .from("notification_message_recipients")
                      .update({ push_sent: true })
                      .eq("message_id", message.id)
                      .eq("user_id", uid);
                  }
                }
              }

              // 5. Increment rate limit
              await rateLimitService.incrementCount(userId);

              // 6. Success
              Alert.alert(
                "Message Sent!",
                `Your message was sent to ${recipientIds.length} ${recipientIds.length === 1 ? "person" : "people"}.`,
              );

              // Reset form
              setForm(INITIAL_COMPOSE_FORM);
              setSelectedTargetId(null);
              setRecipientCount(0);

              // Refresh data
              await loadRateLimit();
              await loadSentMessages();
            } catch (err) {
              console.error("Send message error:", err);
              Alert.alert(
                "Error",
                "Failed to send message. Please try again.",
              );
            } finally {
              setIsSending(false);
            }
          },
        },
      ],
    );
  }

  // —— Refresh ——
  const refresh = useCallback(async () => {
    setIsRefreshing(true);
    await loadAll();
    setIsRefreshing(false);
  }, [loadAll]);

  return {
    isLoading,
    isRefreshing,
    isSending,
    activeTab,
    setActiveTab,
    form,
    updateSubject,
    updateBody,
    isFormValid,
    targets,
    selectedTargetId,
    selectTarget,
    recipientCount,
    rateLimit,
    handleSend,
    sentMessages,
    refresh,
  };
}