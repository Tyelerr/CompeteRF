import { supabase } from '../../lib/supabase';
import { NotificationPreferences } from '../types/notification.types';
import { notificationService } from './notification.service';

export type NotificationCategory =
  | 'tournament_update'
  | 'search_alert_match'
  | 'giveaway_update'
  | 'venue_promotion'
  | 'app_announcement'
  | 'admin_alert';

type PreferenceKey = keyof Pick<NotificationPreferences, 'tournament_updates' | 'venue_promotions' | 'app_announcements' | 'search_alert_matches' | 'giveaway_updates'>;

const CATEGORY_TO_PREFERENCE: Record<NotificationCategory, PreferenceKey | null> = {
  tournament_update: 'tournament_updates',
  search_alert_match: 'search_alert_matches',
  giveaway_update: 'giveaway_updates',
  venue_promotion: 'venue_promotions',
  app_announcement: 'app_announcements',
  admin_alert: null,
};

export interface SendNotificationRequest {
  category: NotificationCategory;
  recipientIdAutos: number[];
  title: string;
  body: string;
  data?: Record<string, unknown>;
  saveToHistory?: boolean;
}

export interface SendNotificationResult {
  eligibleCount: number;
  sentCount: number;
  filteredCount: number;
  failedTokens: string[];
}

const EMPTY_RESULT: SendNotificationResult = {
  eligibleCount: 0,
  sentCount: 0,
  filteredCount: 0,
  failedTokens: [],
};

export const notificationDispatcher = {
  async send(request: SendNotificationRequest): Promise<SendNotificationResult> {
    const { category, recipientIdAutos, title, body, data = {}, saveToHistory = true } = request;
    const result: SendNotificationResult = { ...EMPTY_RESULT };
    try {
      if (recipientIdAutos.length === 0) return result;
      const { data: profiles, error: profileError } = await supabase
        .from('profiles').select('id, id_auto').in('id_auto', recipientIdAutos);
      if (profileError || !profiles || profiles.length === 0) {
        console.error('[Dispatcher] Profile lookup error:', profileError);
        return result;
      }
      const idAutoToUuid = new Map<number, string>();
      profiles.forEach((p: { id: string; id_auto: number }) => idAutoToUuid.set(p.id_auto, p.id));
      const allUuids = profiles.map((p: { id: string }) => p.id);
      const preferenceKey = CATEGORY_TO_PREFERENCE[category];
      let eligibleUuids: string[] = allUuids;
      if (preferenceKey) {
        const { data: prefs, error: prefError } = await supabase
          .from('notification_preferences').select('user_id, ' + preferenceKey).in('user_id', allUuids);
        if (prefError) {
          console.error('[Dispatcher] Preference check error:', prefError);
        } else if (prefs && prefs.length > 0) {
          const optedOut = new Set(prefs.filter((p: any) => p[preferenceKey] === false).map((p: any) => p.user_id));
          eligibleUuids = allUuids.filter((uuid: string) => !optedOut.has(uuid));
          result.filteredCount = allUuids.length - eligibleUuids.length;
        }
      }
      result.eligibleCount = eligibleUuids.length;
      if (eligibleUuids.length === 0) return result;
      if (saveToHistory) {
        const eligibleIdAutos = recipientIdAutos.filter((idAuto) => {
          const uuid = idAutoToUuid.get(idAuto);
          return uuid && eligibleUuids.includes(uuid);
        });
        if (eligibleIdAutos.length > 0) {
          const rows = eligibleIdAutos.map((idAuto) => ({
            user_id: idAuto, title, body, category, data, status: 'sent', sent_at: new Date().toISOString(),
          }));
          const CHUNK = 500;
          for (let i = 0; i < rows.length; i += CHUNK) {
            const { error: insertError } = await supabase.from('notifications').insert(rows.slice(i, i + CHUNK));
            if (insertError) console.error('[Dispatcher] History insert error:', insertError);
          }
        }
      }
      const tokens = await notificationService.getTokensForUsers(eligibleUuids);
      if (tokens.length === 0) return result;
      const pushResult = await notificationService.sendPushBatch(
        tokens.map((t) => t.token), title, body, data as Record<string, unknown>
      );
      result.sentCount = pushResult.sent;
      result.failedTokens = pushResult.failed;
      return result;
    } catch (error) {
      console.error('[Dispatcher] Error:', error);
      return result;
    }
  },

  async sendToUuids(category: NotificationCategory, recipientUuids: string[], title: string, body: string, data?: Record<string, unknown>): Promise<SendNotificationResult> {
    if (recipientUuids.length === 0) return { ...EMPTY_RESULT };
    const { data: profiles, error } = await supabase.from('profiles').select('id_auto').in('id', recipientUuids);
    if (error || !profiles) { console.error('[Dispatcher] UUID lookup error:', error); return { ...EMPTY_RESULT }; }
    return this.send({ category, recipientIdAutos: profiles.map((p: { id_auto: number }) => p.id_auto), title, body, data });
  },

  /**
   * Send to compete_admin and super_admin only.
   * Uses SECURITY DEFINER RPC to bypass RLS.
   * Required SQL in Supabase:
   *   CREATE OR REPLACE FUNCTION get_admin_id_autos()
   *   RETURNS TABLE(id_auto integer) LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
   *     SELECT id_auto FROM profiles
   *     WHERE role IN ('compete_admin', 'super_admin')
   *       AND (is_disabled IS NULL OR is_disabled = false)
   *       AND deleted_at IS NULL;
   *   $$;
   */
  async sendToAdmins(title: string, body: string, data?: Record<string, unknown>): Promise<SendNotificationResult> {
    const { data: adminRows, error: adminError } = await supabase.rpc('get_admin_id_autos');
    if (adminError) { console.error('[Dispatcher] Admin RPC error:', adminError); return { ...EMPTY_RESULT }; }
    if (!adminRows || adminRows.length === 0) { console.log('[Dispatcher] No admin users found'); return { ...EMPTY_RESULT }; }
    const adminIdAutos = (adminRows as { id_auto: number }[]).map((r) => r.id_auto);

    const historyRows = adminIdAutos.map((idAuto) => ({
      user_id: idAuto, title, body, category: 'admin_alert', data: data || {}, status: 'sent', sent_at: new Date().toISOString(),
    }));
    const { error: insertError } = await supabase.from('notifications').insert(historyRows);
    if (insertError) console.error('[Dispatcher] History insert error:', insertError);

    const { data: tokenRows, error: tokenError } = await supabase.rpc('get_admin_push_tokens');
    if (tokenError) { console.error('[Dispatcher] Token RPC error:', tokenError); return { eligibleCount: adminIdAutos.length, sentCount: 0, filteredCount: 0, failedTokens: [] }; }
    if (!tokenRows || tokenRows.length === 0) return { eligibleCount: adminIdAutos.length, sentCount: 0, filteredCount: 0, failedTokens: [] };

    const tokens = (tokenRows as { token: string }[]).map((r) => r.token);
    const pushResult = await notificationService.sendPushBatch(tokens, title, body, data as Record<string, unknown>);
    return { eligibleCount: adminIdAutos.length, sentCount: pushResult.sent, filteredCount: 0, failedTokens: pushResult.failed };
  },

  async sendToTournamentFavorites(tournamentId: number, excludeIdAuto: number | null, title: string, body: string, data?: Record<string, unknown>): Promise<SendNotificationResult> {
    const { data: favorites, error } = await supabase.from('favorites').select('user_id').eq('tournament_id', tournamentId);
    if (error || !favorites || favorites.length === 0) return { ...EMPTY_RESULT };
    let userIdAutos = favorites.map((f: { user_id: number }) => f.user_id);
    if (excludeIdAuto) userIdAutos = userIdAutos.filter((id: number) => id !== excludeIdAuto);
    if (userIdAutos.length === 0) return { ...EMPTY_RESULT };
    return this.send({ category: 'tournament_update', recipientIdAutos: userIdAutos, title, body, data: { tournament_id: tournamentId, ...data } });
  },

  async sendToAllUsers(category: NotificationCategory, title: string, body: string, data?: Record<string, unknown>): Promise<SendNotificationResult> {
    const { data: users, error } = await supabase.from('profiles').select('id_auto').eq('is_disabled', false);
    if (error || !users) { console.error('[Dispatcher] All users lookup error:', error); return { ...EMPTY_RESULT }; }
    return this.send({ category, recipientIdAutos: users.map((u: { id_auto: number }) => u.id_auto), title, body, data });
  },
};