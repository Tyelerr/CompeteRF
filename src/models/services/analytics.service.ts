import { supabase } from "../../lib/supabase";

// ——— Event type constants ———————————————————————————————————
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

// ——— Entity types ———————————————————————————————————————————
export const ENTITY_TYPES = {
  TOURNAMENT: "tournament",
  VENUE: "venue",
  GIVEAWAY: "giveaway",
  PUSH_NOTIFICATION: "push_notification",
} as const;

export type EntityType = (typeof ENTITY_TYPES)[keyof typeof ENTITY_TYPES];

// ——— Core event interface ———————————————————————————————————
interface TrackEventParams {
  eventType: EventType;
  entityType?: EntityType | string;
  entityId?: number;
  metadata?: Record<string, any>;
}

// ——— View stats interface ———————————————————————————————————
export interface EventStats {
  total: number;
  today: number;
  thisWeek: number;
  thisMonth: number;
}

// One row per (tournament, event type) from get_tournament_event_counts.
export interface TournamentEventCount {
  entity_id: number;
  event_type: string;
  event_count: number;
}

export type TopEntityCount = { entity_id: number; count: number };

// Period boundaries used by every EventStats block (local midnight / week start / month start).
function getStatsBoundaries(): { today: string; week: string; month: string } {
  const now = new Date();
  return {
    today: new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString(),
    week: new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() - now.getDay(),
    ).toISOString(),
    month: new Date(now.getFullYear(), now.getMonth(), 1).toISOString(),
  };
}

function sumByType(rows: TournamentEventCount[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const row of rows) {
    totals[row.event_type] = (totals[row.event_type] || 0) + Number(row.event_count);
  }
  return totals;
}

// ——— Service ————————————————————————————————————————————————
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
      // log_app_event derives the user from the session server-side (no client-supplied user id)
      // and only accepts known event shapes; it returns false for anything it rejects.
      const { error } = await supabase.rpc("log_app_event", {
        p_event_type: eventType,
        p_entity_type: entityType || null,
        p_entity_id: entityId || null,
        p_metadata: metadata ?? {},
      });

      if (error) {
        // Use console.warn to avoid red LogBox screen in dev
        console.warn(`[Analytics] Failed to track ${eventType}:`, error.message);
      }
    } catch (err: any) {
      // Silently swallow — analytics should never disrupt the user
      if (__DEV__) {
        console.warn(`[Analytics] Error tracking ${eventType}:`, err.message);
      }
    }
  },

  // ——— Typed helpers (one per event) ————————————————————————

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

  // ——— Query helpers (for dashboards) ———————————————————————

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
      console.warn("[Analytics] getTopEntities error:", error?.message);
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

  // ——— Tournament-scoped aggregates (directors / bar owners) ————————
  // Directors and bar owners cannot read app_events rows; these go through
  // get_tournament_event_counts, which returns counts only and silently ignores
  // any tournament the caller doesn't direct or own the venue of.

  /** Per-(tournament, event type) counts, optionally windowed by created_at. */
  async getTournamentEventCounts(
    tournamentIds: number[],
    eventTypes: string[],
    since?: string | null,
  ): Promise<TournamentEventCount[]> {
    if (tournamentIds.length === 0 || eventTypes.length === 0) return [];
    const { data, error } = await supabase.rpc("get_tournament_event_counts", {
      p_tournament_ids: tournamentIds,
      p_event_types: eventTypes,
      p_since: since ?? null,
    });
    if (error) {
      console.warn("[Analytics] getTournamentEventCounts error:", error.message);
      return [];
    }
    return (data ?? []) as TournamentEventCount[];
  },

  /** Total count of one event type across the given tournaments. */
  async countTournamentEvents(
    eventType: string,
    tournamentIds: number[],
    since?: string | null,
  ): Promise<number> {
    const rows = await this.getTournamentEventCounts(tournamentIds, [eventType], since);
    return sumByType(rows)[eventType] || 0;
  },

  /** Total counts per event type across the given tournaments. */
  async countTournamentEventsByType(
    eventTypes: string[],
    tournamentIds: number[],
    since?: string | null,
  ): Promise<Record<string, number>> {
    const rows = await this.getTournamentEventCounts(tournamentIds, eventTypes, since);
    return sumByType(rows);
  },

  /** Total / today / this week / this month per event type (4 calls, all types at once). */
  async getScopedEventStats(
    eventTypes: string[],
    tournamentIds: number[],
  ): Promise<Record<string, EventStats>> {
    const bounds = getStatsBoundaries();
    const [total, today, thisWeek, thisMonth] = await Promise.all([
      this.countTournamentEventsByType(eventTypes, tournamentIds),
      this.countTournamentEventsByType(eventTypes, tournamentIds, bounds.today),
      this.countTournamentEventsByType(eventTypes, tournamentIds, bounds.week),
      this.countTournamentEventsByType(eventTypes, tournamentIds, bounds.month),
    ]);
    const result: Record<string, EventStats> = {};
    for (const type of eventTypes) {
      result[type] = {
        total: total[type] || 0,
        today: today[type] || 0,
        thisWeek: thisWeek[type] || 0,
        thisMonth: thisMonth[type] || 0,
      };
    }
    return result;
  },

  /** Most-counted tournaments for one event type, among the given tournaments. */
  async getScopedTopEntities(
    eventType: string,
    tournamentIds: number[],
    since?: string,
    limit: number = 10,
  ): Promise<TopEntityCount[]> {
    const rows = await this.getTournamentEventCounts(tournamentIds, [eventType], since);
    return rows
      .map((row) => ({ entity_id: row.entity_id, count: Number(row.event_count) }))
      .sort((a, b) => b.count - a.count || a.entity_id - b.entity_id)
      .slice(0, limit);
  },
};
