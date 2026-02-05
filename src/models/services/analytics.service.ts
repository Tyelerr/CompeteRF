import { supabase } from "../../lib/supabase";

// ─── Event type constants ───────────────────────────────────────────
export const EVENT_TYPES = {
  TOURNAMENT_VIEWED: "tournament_viewed",
  DIRECTIONS_CLICKED: "directions_clicked",
  VENUE_CONTACT_CLICKED: "venue_contact_clicked",
  TOURNAMENT_SHARED: "tournament_shared",
  TOURNAMENT_FAVORITED: "tournament_favorited",
  TOURNAMENT_UNFAVORITED: "tournament_unfavorited",
  SEARCH_PERFORMED: "search_performed",
  FILTERS_CHANGED: "filters_changed",
  GIVEAWAY_VIEWED: "giveaway_viewed",
  PUSH_OPENED: "push_opened",
  ERROR_LOGGED: "error_logged",
  APP_OPENED: "app_opened",
} as const;

export type EventType = (typeof EVENT_TYPES)[keyof typeof EVENT_TYPES];

// ─── Entity types ───────────────────────────────────────────────────
export const ENTITY_TYPES = {
  TOURNAMENT: "tournament",
  VENUE: "venue",
  GIVEAWAY: "giveaway",
  PUSH_NOTIFICATION: "push_notification",
} as const;

export type EntityType = (typeof ENTITY_TYPES)[keyof typeof ENTITY_TYPES];

// ─── Core event interface ───────────────────────────────────────────
interface TrackEventParams {
  eventType: EventType;
  entityType?: EntityType | string;
  entityId?: number;
  metadata?: Record<string, any>;
}

// ─── View stats interface ───────────────────────────────────────────
export interface EventStats {
  total: number;
  today: number;
  thisWeek: number;
  thisMonth: number;
}

// ─── Service ────────────────────────────────────────────────────────
export const analyticsService = {
  /**
   * Core method: track any event. All typed helpers below call this.
   * Fire-and-forget — never throws, never blocks UI.
   */
  async trackEvent({
    eventType,
    entityType,
    entityId,
    metadata = {},
  }: TrackEventParams): Promise<void> {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const { error } = await supabase.from("app_events").insert({
        event_type: eventType,
        entity_type: entityType || null,
        entity_id: entityId || null,
        user_id: user?.id || null,
        metadata,
      });

      if (error) {
        console.error(`[Analytics] Failed to track ${eventType}:`, error.message);
      }
    } catch (err: any) {
      console.error(`[Analytics] Error tracking ${eventType}:`, err.message);
    }
  },

  // ─── Typed helpers (one per event) ────────────────────────────

  /** User opened a tournament detail screen */
  trackTournamentViewed(
    tournamentId: number,
    metadata?: { source_screen?: string },
  ) {
    return this.trackEvent({
      eventType: EVENT_TYPES.TOURNAMENT_VIEWED,
      entityType: ENTITY_TYPES.TOURNAMENT,
      entityId: tournamentId,
      metadata,
    });
  },

  /** User tapped "Open in Maps" / directions */
  trackDirectionsClicked(
    entityType: EntityType,
    entityId: number,
    metadata?: { venue_name?: string },
  ) {
    return this.trackEvent({
      eventType: EVENT_TYPES.DIRECTIONS_CLICKED,
      entityType,
      entityId,
      metadata,
    });
  },

  /** User tapped a phone number / contact button */
  trackVenueContactClicked(
    entityType: EntityType,
    entityId: number,
    metadata?: { contact_type?: "phone" | "email"; venue_name?: string },
  ) {
    return this.trackEvent({
      eventType: EVENT_TYPES.VENUE_CONTACT_CLICKED,
      entityType,
      entityId,
      metadata,
    });
  },

  /** User shared a tournament */
  trackTournamentShared(
    tournamentId: number,
    metadata?: { share_method?: string },
  ) {
    return this.trackEvent({
      eventType: EVENT_TYPES.TOURNAMENT_SHARED,
      entityType: ENTITY_TYPES.TOURNAMENT,
      entityId: tournamentId,
      metadata,
    });
  },

  /** User favorited a tournament */
  trackTournamentFavorited(tournamentId: number) {
    return this.trackEvent({
      eventType: EVENT_TYPES.TOURNAMENT_FAVORITED,
      entityType: ENTITY_TYPES.TOURNAMENT,
      entityId: tournamentId,
    });
  },

  /** User unfavorited a tournament */
  trackTournamentUnfavorited(tournamentId: number) {
    return this.trackEvent({
      eventType: EVENT_TYPES.TOURNAMENT_UNFAVORITED,
      entityType: ENTITY_TYPES.TOURNAMENT,
      entityId: tournamentId,
    });
  },

  /** User performed a search */
  trackSearchPerformed(metadata: {
    query?: string;
    source_screen?: string;
    results_count?: number;
  }) {
    return this.trackEvent({
      eventType: EVENT_TYPES.SEARCH_PERFORMED,
      metadata,
    });
  },

  /** User changed filters */
  trackFiltersChanged(metadata: {
    filters?: Record<string, any>;
    source_screen?: string;
  }) {
    return this.trackEvent({
      eventType: EVENT_TYPES.FILTERS_CHANGED,
      metadata,
    });
  },

  /** User viewed a giveaway */
  trackGiveawayViewed(giveawayId: number) {
    return this.trackEvent({
      eventType: EVENT_TYPES.GIVEAWAY_VIEWED,
      entityType: ENTITY_TYPES.GIVEAWAY,
      entityId: giveawayId,
    });
  },

  /** User opened app via push notification */
  trackPushOpened(metadata: {
    notification_id?: string;
    notification_type?: string;
  }) {
    return this.trackEvent({
      eventType: EVENT_TYPES.PUSH_OPENED,
      entityType: ENTITY_TYPES.PUSH_NOTIFICATION,
      metadata,
    });
  },

  /** Log a client-side error */
  trackError(metadata: {
    error_message: string;
    error_stack?: string;
    screen?: string;
    component?: string;
  }) {
    return this.trackEvent({
      eventType: EVENT_TYPES.ERROR_LOGGED,
      metadata,
    });
  },

  /** User opened the app */
  trackAppOpened(metadata?: { platform?: string; app_version?: string }) {
    return this.trackEvent({
      eventType: EVENT_TYPES.APP_OPENED,
      metadata,
    });
  },

  // ─── Query helpers (for dashboards) ───────────────────────────

  /**
   * Get counts for a specific event type + entity over time ranges.
   * Works for any event: views, directions clicks, shares, etc.
   */
  async getEventStats(
    eventType: EventType,
    entityType?: EntityType,
    entityId?: number,
  ): Promise<EventStats> {
    const now = new Date();

    const startOfToday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    ).toISOString();

    const startOfWeek = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() - now.getDay(),
    ).toISOString();

    const startOfMonth = new Date(
      now.getFullYear(),
      now.getMonth(),
      1,
    ).toISOString();

    const buildQuery = (since?: string) => {
      let q = supabase
        .from("app_events")
        .select("*", { count: "exact", head: true })
        .eq("event_type", eventType);

      if (entityType) q = q.eq("entity_type", entityType);
      if (entityId) q = q.eq("entity_id", entityId);
      if (since) q = q.gte("created_at", since);

      return q;
    };

    const [total, today, thisWeek, thisMonth] = await Promise.all([
      buildQuery(),
      buildQuery(startOfToday),
      buildQuery(startOfWeek),
      buildQuery(startOfMonth),
    ]);

    return {
      total: total.count || 0,
      today: today.count || 0,
      thisWeek: thisWeek.count || 0,
      thisMonth: thisMonth.count || 0,
    };
  },

  /**
   * Get the most viewed tournaments (or most clicked, etc.) in a time range.
   * Returns sorted array of { entity_id, count }.
   */
  async getTopEntities(
    eventType: EventType,
    entityType: EntityType,
    since?: string,
    limit: number = 10,
  ): Promise<{ entity_id: number; count: number }[]> {
    let query = supabase
      .from("app_events")
      .select("entity_id")
      .eq("event_type", eventType)
      .eq("entity_type", entityType)
      .not("entity_id", "is", null);

    if (since) query = query.gte("created_at", since);

    const { data, error } = await query;

    if (error || !data) {
      console.error("[Analytics] getTopEntities error:", error?.message);
      return [];
    }

    // Count occurrences client-side (Supabase doesn't support GROUP BY in JS client)
    const counts: Record<number, number> = {};
    for (const row of data) {
      if (row.entity_id != null) {
        counts[row.entity_id] = (counts[row.entity_id] || 0) + 1;
      }
    }

    return Object.entries(counts)
      .map(([id, count]) => ({ entity_id: Number(id), count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  },
};
