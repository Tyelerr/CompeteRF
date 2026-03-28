// src/viewmodels/hooks/use.message.center.ts
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

interface MessageTarget {
  id: number | string;
  name: string;
  type: "tournament" | "venue" | "all_users";
  favoriteCount?: number;
  date?: string;
}

export interface BarOwnerVenue {
  id: number;
  name: string;
  totalFollowers: number;
}

export interface VenueTournament {
  id: number;
  name: string;
  date?: string;
  followerCount: number;
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
  selectTarget: (type: TargetType, id: number | string | null, name: string) => void;
  venues: BarOwnerVenue[];
  selectedVenueId: number | null;
  selectVenue: (venueId: number | null) => void;
  venueTournaments: VenueTournament[];
  venueTournamentsLoading: boolean;
  recipientCount: number;
  rateLimit: RateLimitStatus | null;
  handleSend: () => Promise<void>;
  sentMessages: MessageStats[];
  refresh: () => Promise<void>;
}

export function useMessageCenter(): UseMessageCenterReturn {
  const { user, profile } = useAuthContext();
  const userId = user?.id;
  const userIdAuto = profile?.id_auto as number | undefined;
  const role = (profile?.role || "basic_user") as SenderRole;

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [activeTab, setActiveTab] = useState<"send" | "sent">("send");
  const [form, setForm] = useState<ComposeMessageForm>(INITIAL_COMPOSE_FORM);

  const [targets, setTargets] = useState<MessageTarget[]>([]);
  const [selectedTargetId, setSelectedTargetId] = useState<number | string | null>(null);

  const [venues, setVenues] = useState<BarOwnerVenue[]>([]);
  const [selectedVenueId, setSelectedVenueId] = useState<number | null>(null);
  const [venueTournaments, setVenueTournaments] = useState<VenueTournament[]>([]);
  const [venueTournamentsLoading, setVenueTournamentsLoading] = useState(false);

  const [recipientCount, setRecipientCount] = useState(0);
  const [rateLimit, setRateLimit] = useState<RateLimitStatus | null>(null);
  const [sentMessages, setSentMessages] = useState<MessageStats[]>([]);

  // ── Load Targets (TD + admin) ─────────────────────────────────────────────
  const loadTargets = useCallback(async () => {
    if (!userId || !userIdAuto) return;
    try {
      const loadedTargets: MessageTarget[] = [];

      if (role === "super_admin" || role === "compete_admin") {
        const { count } = await supabase
          .from("profiles")
          .select("id", { count: "exact", head: true });
        loadedTargets.push({
          id: "all_users",
          name: "All Users",
          type: "all_users",
          favoriteCount: count || 0,
        });
      } else if (role === "tournament_director") {
        // Single query for all tournaments
        const { data: tournaments } = await supabase
          .from("tournaments")
          .select("id, name, tournament_date")
          .eq("director_id", userIdAuto)
          .in("status", ["active"]);

        if (tournaments && tournaments.length > 0) {
          const tournamentIds = tournaments.map((t) => t.id);

          // Single query for all favorite counts at once
          const { data: favData } = await supabase
            .from("favorites")
            .select("tournament_id")
            .in("tournament_id", tournamentIds);

          // Count per tournament in JS
          const countMap: Record<number, number> = {};
          for (const f of favData || []) {
            countMap[f.tournament_id] = (countMap[f.tournament_id] || 0) + 1;
          }

          for (const t of tournaments) {
            const formattedDate = t.tournament_date
              ? new Date(t.tournament_date + "T00:00:00").toLocaleDateString(
                  "en-US",
                  { weekday: "short", month: "short", day: "numeric" },
                )
              : undefined;
            loadedTargets.push({
              id: t.id,
              name: t.name,
              type: "tournament",
              favoriteCount: countMap[t.id] || 0,
              date: formattedDate,
            });
          }
        }
      }

      setTargets(loadedTargets);

      if (
        (role === "super_admin" || role === "compete_admin") &&
        loadedTargets.length === 1
      ) {
        selectTarget("all_users", "all_users", "All Users");
      }
    } catch (err) {
      console.error("Error loading targets:", err);
    }
  }, [userId, userIdAuto, role]);

  // ── Load Venues (bar owner) — BATCHED ────────────────────────────────────
  const loadVenues = useCallback(async () => {
    if (!userId || role !== "bar_owner") return;
    try {
      // Step 1: get all venue IDs for this owner
      const { data: venueLinks } = await supabase
        .from("venue_owners")
        .select("venue_id, venues(id, venue)")
        .eq("owner_id", userIdAuto);

      if (!venueLinks || venueLinks.length === 0) return;

      const venueInfos = venueLinks
        .map((vl) => vl.venues as unknown as { id: number; venue: string } | null)
        .filter(Boolean) as { id: number; venue: string }[];

      if (venueInfos.length === 0) return;

      const venueIds = venueInfos.map((v) => v.id);

      // Step 2: single query — get all favorites for tournaments at these venues
      const { data: favData } = await supabase
        .from("favorites")
        .select("user_id, tournaments!inner(venue_id)")
        .in("tournaments.venue_id", venueIds);

      // Step 3: compute unique users per venue in JS
      const venueUserMap: Record<number, Set<number>> = {};
      for (const f of favData || []) {
        const venueId = (f.tournaments as unknown as { venue_id: number })?.venue_id;
        if (!venueId) continue;
        if (!venueUserMap[venueId]) venueUserMap[venueId] = new Set();
        venueUserMap[venueId].add(f.user_id);
      }

      const loadedVenues: BarOwnerVenue[] = venueInfos.map((v) => ({
        id: v.id,
        name: v.venue,
        totalFollowers: venueUserMap[v.id]?.size || 0,
      }));

      setVenues(loadedVenues);
    } catch (err) {
      console.error("Error loading venues:", err);
    }
  }, [userId, userIdAuto, role]);

  // ── Select Venue → loads tournaments BATCHED ──────────────────────────────
  const selectVenue = useCallback(async (venueId: number | null) => {
    if (venueId === null) {
      setSelectedVenueId(null);
      setVenueTournaments([]);
      setSelectedTargetId(null);
      setRecipientCount(0);
      setForm(INITIAL_COMPOSE_FORM);
      return;
    }

    setSelectedVenueId(venueId);
    setSelectedTargetId(null);
    setRecipientCount(0);
    setVenueTournamentsLoading(true);

    try {
      // Step 1: all active tournaments for this venue
      const { data: tournaments } = await supabase
        .from("tournaments")
        .select("id, name, tournament_date")
        .eq("venue_id", venueId)
        .in("status", ["active"]);

      if (!tournaments || tournaments.length === 0) {
        setVenueTournaments([]);
        return;
      }

      const tournamentIds = tournaments.map((t) => t.id);

      // Step 2: single query for all favorites at once
      const { data: favData } = await supabase
        .from("favorites")
        .select("tournament_id")
        .in("tournament_id", tournamentIds);

      // Step 3: count per tournament in JS
      const countMap: Record<number, number> = {};
      for (const f of favData || []) {
        countMap[f.tournament_id] = (countMap[f.tournament_id] || 0) + 1;
      }

      const loaded: VenueTournament[] = tournaments.map((t) => ({
        id: t.id,
        name: t.name,
        date: t.tournament_date
          ? new Date(t.tournament_date + "T00:00:00").toLocaleDateString(
              "en-US",
              { weekday: "short", month: "short", day: "numeric" },
            )
          : undefined,
        followerCount: countMap[t.id] || 0,
      }));

      setVenueTournaments(loaded);
    } catch (err) {
      console.error("Error loading venue tournaments:", err);
    } finally {
      setVenueTournamentsLoading(false);
    }
  }, []);

  // ── Load Rate Limit ───────────────────────────────────────────────────────
  const loadRateLimit = useCallback(async () => {
    if (!userId) return;
    try {
      const status = await rateLimitService.checkRateLimit(userId, role);
      setRateLimit(status);
    } catch (err) {
      console.error("Error loading rate limit:", err);
    }
  }, [userId, role]);

  // ── Load Sent Messages — BATCHED ─────────────────────────────────────────
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
      if (!data || data.length === 0) { setSentMessages([]); return; }

      const messageIds = data.map((m) => m.id);

      // Single query for all read counts at once
      const { data: readData } = await supabase
        .from("notification_message_recipients")
        .select("message_id")
        .in("message_id", messageIds)
        .not("read_at", "is", null);

      // Count per message in JS
      const readMap: Record<number, number> = {};
      for (const r of readData || []) {
        readMap[r.message_id] = (readMap[r.message_id] || 0) + 1;
      }

      const stats: MessageStats[] = data.map((msg) => {
        const readCount = readMap[msg.id] || 0;
        return {
          message_id: msg.id,
          subject: msg.subject,
          body: msg.body,
          message_type: msg.message_type,
          sent_at: msg.created_at,
          recipient_count: msg.recipient_count || 0,
          read_count: readCount,
          read_rate:
            msg.recipient_count > 0
              ? Math.round((readCount / msg.recipient_count) * 100)
              : 0,
          tournament_id: msg.tournament_id,
          venue_id: msg.venue_id,
        };
      });

      setSentMessages(stats);
    } catch (err) {
      console.error("Error loading sent messages:", err);
    }
  }, [userId]);

  // ── Load All ──────────────────────────────────────────────────────────────
  const loadAll = useCallback(async () => {
    setIsLoading(true);
    try {
      await Promise.all([
        loadTargets(),
        loadVenues(),
        loadRateLimit(),
        loadSentMessages(),
      ]);
    } finally {
      setIsLoading(false);
    }
  }, [loadTargets, loadVenues, loadRateLimit, loadSentMessages]);

  useEffect(() => {
    if (userId) loadAll();
  }, [userId, loadAll]);

  // ── Recipient Count ───────────────────────────────────────────────────────
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
            data?.map((f: { user_id: number }) => f.user_id) || [],
          );
          setRecipientCount(unique.size);
        } else if (type === "all_users") {
          const { count } = await supabase
            .from("profiles")
            .select("id", { count: "exact", head: true });
          setRecipientCount(count || 0);
        } else {
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

  // ── Resolve Recipients ────────────────────────────────────────────────────
  async function resolveRecipients(
    targetType: TargetType,
    tournamentId: number | null,
    venueId: number | null,
  ): Promise<string[]> {
    try {
      let idAutos: number[] = [];

      if (targetType === "tournament" && tournamentId) {
        const { data } = await supabase
          .from("favorites")
          .select("user_id")
          .eq("tournament_id", tournamentId);
        idAutos = data?.map((f: { user_id: number }) => f.user_id) || [];
      } else if (targetType === "venue" && venueId) {
        const { data } = await supabase
          .from("favorites")
          .select("user_id, tournaments!inner(venue_id)")
          .eq("tournaments.venue_id", venueId);
        const unique = new Set(
          data?.map((f: { user_id: number }) => f.user_id) || [],
        );
        idAutos = Array.from(unique);
      } else if (targetType === "all_users") {
        const { data } = await supabase.from("profiles").select("id, id_auto");
        if (!data) return [];
        const allUuids = data.map((p: { id: string }) => p.id);
        const { data: optedOut } = await supabase
          .from("notification_preferences")
          .select("user_id")
          .in("user_id", allUuids)
          .eq("app_announcements", false);
        const optedOutSet = new Set(
          optedOut?.map((p: { user_id: string }) => p.user_id) || [],
        );
        return allUuids.filter(
          (uuid: string) => uuid !== userId && !optedOutSet.has(uuid),
        );
      }

      if (idAutos.length === 0) return [];

      const { data: profileRows } = await supabase
        .from("profiles")
        .select("id, id_auto")
        .in("id_auto", idAutos);

      if (!profileRows) return [];

      const allUuids = profileRows.map((p: { id: string }) => p.id);
      const preferenceKey =
        targetType === "tournament" ? "tournament_updates" : "venue_promotions";

      const { data: optedOut } = await supabase
        .from("notification_preferences")
        .select("user_id")
        .in("user_id", allUuids)
        .eq(preferenceKey, false);

      const optedOutSet = new Set(
        optedOut?.map((p: { user_id: string }) => p.user_id) || [],
      );

      return allUuids.filter(
        (uuid: string) => uuid !== userId && !optedOutSet.has(uuid),
      );
    } catch (err) {
      console.error("Error resolving recipients:", err);
      return [];
    }
  }

  // ── Send Message ──────────────────────────────────────────────────────────
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

              const recipientUuids = await resolveRecipients(
                form.target_type,
                form.tournament_id,
                form.venue_id,
              );

              if (recipientUuids.length > 0) {
                const recipients = recipientUuids.map((uid: string) => ({
                  message_id: message.id,
                  user_id: uid,
                }));

                const { error: recError } = await supabase
                  .from("notification_message_recipients")
                  .insert(recipients);

                if (recError) throw recError;

                const tokens =
                  await notificationService.getTokensForUsers(recipientUuids);
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

                  const usersWithTokens = new Set(tokens.map((t) => t.user_id));
                  for (const uid of usersWithTokens) {
                    await supabase
                      .from("notification_message_recipients")
                      .update({ push_sent: true })
                      .eq("message_id", message.id)
                      .eq("user_id", uid);
                  }
                }
              }

              await rateLimitService.incrementCount(userId);

              Alert.alert(
                "Message Sent!",
                `Your message was sent to ${recipientUuids.length} ${recipientUuids.length === 1 ? "person" : "people"}.`,
              );

              setForm(INITIAL_COMPOSE_FORM);
              setSelectedTargetId(null);
              setSelectedVenueId(null);
              setVenueTournaments([]);
              setRecipientCount(0);

              await loadRateLimit();
              await loadSentMessages();
            } catch (err) {
              console.error("Send message error:", err);
              Alert.alert("Error", "Failed to send message. Please try again.");
            } finally {
              setIsSending(false);
            }
          },
        },
      ],
    );
  }

  // ── Refresh ───────────────────────────────────────────────────────────────
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
    venues,
    selectedVenueId,
    selectVenue,
    venueTournaments,
    venueTournamentsLoading,
    recipientCount,
    rateLimit,
    handleSend,
    sentMessages,
    refresh,
  };
}
