import { supabase } from "../../lib/supabase";
import { Message, Notification, SavedSearch } from "../types/message.types";
import { notificationDispatcher } from "./notification-dispatcher.service";

export const messageService = {
  async getMessages(userId: number): Promise<Message[]> {
    const { data, error } = await supabase
      .from("message_recipients")
      .select("*, messages(*)")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data?.map((d) => d.messages as unknown as Message) || [];
  },

  async getUnreadCount(userId: number): Promise<number> {
    const { count, error } = await supabase
      .from("message_recipients")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .is("read_at", null);
    if (error) throw error;
    return count || 0;
  },

  async markAsRead(messageId: number, userId: number): Promise<void> {
    const { error } = await supabase
      .from("message_recipients")
      .update({ read_at: new Date().toISOString() })
      .eq("message_id", messageId)
      .eq("user_id", userId);
    if (error) throw error;
  },

  async sendMessage(
    message: Partial<Message>,
    recipientIds: number[],
  ): Promise<Message> {
    const { data, error } = await supabase
      .from("messages")
      .insert({ ...message, recipient_count: recipientIds.length })
      .select()
      .single();
    if (error) throw error;

    const recipients = recipientIds.map((userId) => ({
      message_id: data.id,
      user_id: userId,
    }));

    const { error: recipientError } = await supabase
      .from("message_recipients")
      .insert(recipients);
    if (recipientError) throw recipientError;

    // ══════════════════════════════════════════════════════════
    // 🔔 Phase 5: Send push notifications to message recipients
    // ══════════════════════════════════════════════════════════
    notificationDispatcher
      .send({
        category: "tournament_update",
        recipientIdAutos: recipientIds,
        title: `📣 ${message.subject || "New Message"}`,
        body:
          message.body && message.body.length > 120
            ? message.body.slice(0, 120) + "..."
            : message.body || "You have a new message",
        data: {
          message_id: data.id,
          tournament_id: message.tournament_id || undefined,
          deep_link: "/notifications",
          type: "director_message",
        },
      })
      .catch((err) =>
        console.error("⚠️ Error sending message notifications:", err),
      );

    return data;
  },

  async getSavedSearches(userId: number): Promise<SavedSearch[]> {
    const { data, error } = await supabase
      .from("saved_searches")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data || [];
  },

  async createSavedSearch(search: Partial<SavedSearch>): Promise<SavedSearch> {
    const { data, error } = await supabase
      .from("saved_searches")
      .insert(search)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async updateSavedSearch(
    id: number,
    updates: Partial<SavedSearch>,
  ): Promise<SavedSearch> {
    const { data, error } = await supabase
      .from("saved_searches")
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async deleteSavedSearch(id: number): Promise<void> {
    const { error } = await supabase
      .from("saved_searches")
      .delete()
      .eq("id", id);
    if (error) throw error;
  },

  async getNotifications(userId: number): Promise<Notification[]> {
    const { data, error } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data || [];
  },
};
