// src/models/services/conversation.service.ts
// ═══════════════════════════════════════════════════════════
// Conversation / Direct Messaging service
// Handles creating threads, sending replies, searching recipients
// ═══════════════════════════════════════════════════════════

import { supabase } from "../../lib/supabase";

export interface ConversationPreview {
  id: string;
  subject: string | null;
  category: string | null;
  tournament_id: number | null;
  is_support: boolean;
  created_by: string;
  updated_at: string;
  last_message: string | null;
  last_message_at: string | null;
  last_sender_id: string | null;
  other_participant_name: string | null;
  other_participant_role: string | null;
  other_participant_email: string | null;
  other_participant_id_auto: number | null;
  unread_count: number;
}

export interface ConversationMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: string;
  sender_name?: string;
  sender_role?: string;
  sender_avatar?: string | null;
}

export interface RecipientOption {
  id: string;
  name: string;
  role: string;
  avatar_url: string | null;
}

export const conversationService = {
  // ── Create a new conversation (via server-side function) ──
  async createConversation(params: {
    createdBy: string;
    recipientId: string | null; // null for support
    subject?: string;
    category?: string;
    tournamentId?: number;
    isSupport?: boolean;
    firstMessage: string;
  }): Promise<string> {
    const { data, error } = await supabase.rpc(
      "create_conversation_with_participants",
      {
        p_created_by: params.createdBy,
        p_subject: params.subject || null,
        p_category: params.category || "general",
        p_tournament_id: params.tournamentId || null,
        p_is_support: params.isSupport || false,
        p_recipient_id: params.recipientId || null,
        p_first_message: params.firstMessage,
      },
    );

    if (error) {
      console.error("create_conversation_with_participants error:", error);
      throw error;
    }

    console.log("Conversation created via RPC:", data);
    return data as string;
  },

  // ── Get conversations for a user ──
  async getConversations(userId: string): Promise<ConversationPreview[]> {
    // Get all conversation IDs the user participates in
    const { data: participations, error: partError } = await supabase
      .from("conversation_participants")
      .select("conversation_id, last_read_at")
      .eq("user_id", userId);

    if (partError) throw partError;
    if (!participations || participations.length === 0) return [];

    const convoIds = participations.map(
      (p: { conversation_id: string }) => p.conversation_id,
    );
    const readMap = new Map(
      participations.map(
        (p: { conversation_id: string; last_read_at: string | null }) => [
          p.conversation_id,
          p.last_read_at,
        ],
      ),
    );

    // Get conversations
    const { data: convos, error: convoError } = await supabase
      .from("conversations")
      .select("*")
      .in("id", convoIds)
      .order("updated_at", { ascending: false });

    if (convoError) throw convoError;

    const previews: ConversationPreview[] = [];

    for (const convo of convos || []) {
      // Get last message
      const { data: lastMsg } = await supabase
        .from("conversation_messages")
        .select("body, created_at, sender_id")
        .eq("conversation_id", convo.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      // Get other participant (for non-support, show the other person;
      // for support convos where current user is admin, show the creator)
      let otherName: string | null = null;
      let otherRole: string | null = null;
      let otherEmail: string | null = null;
      let otherIdAuto: number | null = null;

      if (convo.is_support) {
        if (convo.created_by !== userId) {
          const { data: creatorProfile } = await supabase
            .from("profiles")
            .select("name, role, email, id_auto")
            .eq("id", convo.created_by)
            .maybeSingle();
          if (creatorProfile) {
            otherName = creatorProfile.name;
            otherRole = creatorProfile.role;
            otherEmail = creatorProfile.email || null;
            otherIdAuto = creatorProfile.id_auto || null;
          }
        }
      } else {
        const { data: otherParticipants } = await supabase
          .from("conversation_participants")
          .select("user_id")
          .eq("conversation_id", convo.id)
          .neq("user_id", userId)
          .limit(1);

        if (otherParticipants && otherParticipants.length > 0) {
          const { data: otherProfile } = await supabase
            .from("profiles")
            .select("name, role, email, id_auto")
            .eq("id", otherParticipants[0].user_id)
            .maybeSingle();

          if (otherProfile) {
            otherName = otherProfile.name;
            otherRole = otherProfile.role;
            otherEmail = otherProfile.email || null;
            otherIdAuto = otherProfile.id_auto || null;
          }
        }
      }

      // Count unread
      const lastReadAt = readMap.get(convo.id);
      let unreadCount = 0;
      if (lastReadAt) {
        const { count } = await supabase
          .from("conversation_messages")
          .select("id", { count: "exact", head: true })
          .eq("conversation_id", convo.id)
          .neq("sender_id", userId)
          .gt("created_at", lastReadAt);
        unreadCount = count || 0;
      } else {
        const { count } = await supabase
          .from("conversation_messages")
          .select("id", { count: "exact", head: true })
          .eq("conversation_id", convo.id)
          .neq("sender_id", userId);
        unreadCount = count || 0;
      }

      previews.push({
        id: convo.id,
        subject: convo.subject,
        category: convo.category,
        tournament_id: convo.tournament_id,
        is_support: convo.is_support,
        created_by: convo.created_by,
        updated_at: convo.updated_at,
        last_message: lastMsg?.body || null,
        last_message_at: lastMsg?.created_at || convo.created_at,
        last_sender_id: lastMsg?.sender_id || null,
        other_participant_name: convo.is_support
          ? otherName || "Compete Support"
          : otherName,
        other_participant_role: convo.is_support
          ? "support"
          : otherRole,
        other_participant_email: otherEmail,
        other_participant_id_auto: otherIdAuto,
        unread_count: unreadCount,
      });
    }

    return previews;
  },

  // ── Get messages in a conversation ──
  async getMessages(conversationId: string): Promise<ConversationMessage[]> {
    const { data: messages, error } = await supabase
      .from("conversation_messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });

    if (error) throw error;

    // Enrich with sender info
    const enriched: ConversationMessage[] = [];
    const profileCache = new Map<
      string,
      { name: string; role: string; avatar_url: string | null }
    >();

    for (const msg of messages || []) {
      if (!profileCache.has(msg.sender_id)) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("name, role, avatar_url")
          .eq("id", msg.sender_id)
          .maybeSingle();

        if (profile) {
          profileCache.set(msg.sender_id, profile);
        }
      }

      const sender = profileCache.get(msg.sender_id);

      // For admin replies in support threads, show "Compete Support" not their name
      const isAdmin =
        sender?.role === "compete_admin" || sender?.role === "super_admin";

      enriched.push({
        ...msg,
        sender_name: isAdmin ? "Compete Support" : sender?.name || "Unknown",
        sender_role: sender?.role || "basic_user",
        sender_avatar: isAdmin ? null : sender?.avatar_url || null,
      });
    }

    return enriched;
  },

  // ── Send a reply ──
  async sendReply(
    conversationId: string,
    senderId: string,
    body: string,
  ): Promise<void> {
    const { error } = await supabase.from("conversation_messages").insert({
      conversation_id: conversationId,
      sender_id: senderId,
      body,
    });

    if (error) throw error;

    // Update sender last_read_at
    await supabase
      .from("conversation_participants")
      .update({ last_read_at: new Date().toISOString() })
      .eq("conversation_id", conversationId)
      .eq("user_id", senderId);
  },

  // ── Mark conversation as read ──
  async markAsRead(conversationId: string, userId: string): Promise<void> {
    await supabase
      .from("conversation_participants")
      .update({ last_read_at: new Date().toISOString() })
      .eq("conversation_id", conversationId)
      .eq("user_id", userId);
  },

  // ── Search for recipients (only TDs and bar owners) ──
  async searchRecipients(
    query: string,
    roles?: string[],
  ): Promise<RecipientOption[]> {
    const allowedRoles = roles || ["tournament_director", "bar_owner"];

    const { data, error } = await supabase
      .from("profiles")
      .select("id, name, role, avatar_url")
      .ilike("name", `%${query}%`)
      .in("role", allowedRoles)
      .limit(20);

    if (error) throw error;
    return data || [];
  },

  // ── Search tournaments ──
  async searchTournaments(
    query: string,
  ): Promise<{ id: number; name: string; venue_name: string }[]> {
    const { data, error } = await supabase
      .from("tournaments")
      .select("id, name, venues(venue)")
      .ilike("name", `%${query}%`)
      .limit(15);

    if (error) throw error;

    return (data || []).map(
      (t: { id: number; name: string; venues: unknown }) => ({
        id: t.id,
        name: t.name,
        venue_name:
          (t.venues as { venue: string } | null)?.venue || "Unknown Venue",
      }),
    );
  },

  // ── Delete a conversation for a user ──
  async leaveConversation(
    conversationId: string,
    userId: string,
  ): Promise<void> {
    await supabase
      .from("conversation_participants")
      .delete()
      .eq("conversation_id", conversationId)
      .eq("user_id", userId);
  },
};
