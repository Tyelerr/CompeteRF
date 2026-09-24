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
  archived?: boolean; // this participant has archived the conversation
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
      .select("conversation_id, last_read_at, archived_at")
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
    // Per-participant archive state (this user's own archived_at for each conversation).
    const archivedMap = new Map(
      participations.map((p: { conversation_id: string; archived_at?: string | null }) => [
        p.conversation_id,
        p.archived_at ?? null,
      ]),
    );

    // Get conversations
    const { data: convos, error: convoError } = await supabase
      .from("conversations")
      .select("*")
      .in("id", convoIds)
      .order("updated_at", { ascending: false });

    if (convoError) throw convoError;

    type OtherParticipant = {
      name: string | null;
      role: string | null;
      email: string | null;
      idAuto: number | null;
    };
    const profileToOther = (p: any): OtherParticipant => ({
      name: p.name,
      role: p.role,
      email: p.email || null,
      idAuto: p.id_auto || null,
    });
    const noOther: OtherParticipant = { name: null, role: null, email: null, idAuto: null };

    // Conversations are independent, and so are the three lookups inside each one — run them
    // all concurrently (was a serial loop of 3–4 round trips per conversation). Promise.all
    // keeps the updated_at order from the query above.
    const previews: ConversationPreview[] = await Promise.all(
      (convos || []).map(async (convo: any) => {
        // Last message
        const lastMsgPromise = supabase
          .from("conversation_messages")
          .select("body, created_at, sender_id")
          .eq("conversation_id", convo.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle()
          .then(({ data }) => data);

        // Other participant (for non-support, show the other person;
        // for support convos where current user is admin, show the creator)
        const otherPromise = (async (): Promise<OtherParticipant> => {
          if (convo.is_support) {
            if (convo.created_by === userId) return noOther;
            const { data: creatorProfile } = await supabase
              .from("profiles")
              .select("name, role, email, id_auto")
              .eq("id", convo.created_by)
              .maybeSingle();
            return creatorProfile ? profileToOther(creatorProfile) : noOther;
          }
          const { data: otherParticipants } = await supabase
            .from("conversation_participants")
            .select("user_id")
            .eq("conversation_id", convo.id)
            .neq("user_id", userId)
            .limit(1);
          if (!otherParticipants || otherParticipants.length === 0) return noOther;
          const { data: otherProfile } = await supabase
            .from("profiles")
            .select("name, role, email, id_auto")
            .eq("id", otherParticipants[0].user_id)
            .maybeSingle();
          return otherProfile ? profileToOther(otherProfile) : noOther;
        })();

        // Count unread
        const lastReadAt = readMap.get(convo.id);
        let unreadQuery = supabase
          .from("conversation_messages")
          .select("id", { count: "exact", head: true })
          .eq("conversation_id", convo.id)
          .neq("sender_id", userId);
        if (lastReadAt) unreadQuery = unreadQuery.gt("created_at", lastReadAt);
        const unreadPromise = unreadQuery.then(({ count }) => count || 0);

        const [lastMsg, other, unreadCount] = await Promise.all([
          lastMsgPromise,
          otherPromise,
          unreadPromise,
        ]);

        return {
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
            ? other.name || "Compete Support"
            : other.name,
          other_participant_role: convo.is_support
            ? "support"
            : other.role,
          other_participant_email: other.email,
          other_participant_id_auto: other.idAuto,
          unread_count: unreadCount,
          archived: archivedMap.get(convo.id) != null,
        };
      }),
    );

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
  // Archive / unarchive THIS participant's view of a conversation (per-user). Blocks the other
  // participant from replying while archived (review conversations); does not delete anything.
  async setConversationArchived(
    conversationId: string,
    archived: boolean,
  ): Promise<void> {
    const { error } = await supabase.rpc("set_conversation_archived", {
      p_conversation_id: conversationId,
      p_archived: archived,
    });
    if (error) throw error;
  },

  // Whether THIS user has archived a single conversation (for the conversation screen's state).
  async isConversationArchived(conversationId: string, userId: string): Promise<boolean> {
    const { data } = await supabase
      .from("conversation_participants")
      .select("archived_at")
      .eq("conversation_id", conversationId)
      .eq("user_id", userId)
      .maybeSingle();
    return (data as { archived_at?: string | null } | null)?.archived_at != null;
  },

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
