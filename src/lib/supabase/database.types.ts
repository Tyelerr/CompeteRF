export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      alert_matches: {
        Row: {
          alert_id: number
          created_at: string | null
          id: number
          notified_at: string | null
          tournament_id: number
        }
        Insert: {
          alert_id: number
          created_at?: string | null
          id?: number
          notified_at?: string | null
          tournament_id: number
        }
        Update: {
          alert_id?: number
          created_at?: string | null
          id?: number
          notified_at?: string | null
          tournament_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "alert_matches_alert_id_fkey"
            columns: ["alert_id"]
            isOneToOne: false
            referencedRelation: "search_alerts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alert_matches_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      app_events: {
        Row: {
          created_at: string
          entity_id: number | null
          entity_type: string | null
          event_type: string
          id: number
          metadata: Json | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          entity_id?: number | null
          entity_type?: string | null
          event_type: string
          id?: number
          metadata?: Json | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          entity_id?: number | null
          entity_type?: string | null
          event_type?: string
          id?: number
          metadata?: Json | null
          user_id?: string | null
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          action: string
          created_at: string | null
          details: Json | null
          entity_id: number | null
          entity_type: string
          id: number
          user_id: number | null
          user_role: string | null
        }
        Insert: {
          action: string
          created_at?: string | null
          details?: Json | null
          entity_id?: number | null
          entity_type: string
          id?: number
          user_id?: number | null
          user_role?: string | null
        }
        Update: {
          action?: string
          created_at?: string | null
          details?: Json | null
          entity_id?: number | null
          entity_type?: string
          id?: number
          user_id?: number | null
          user_role?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id_auto"]
          },
        ]
      }
      bad_words: {
        Row: {
          created_at: string | null
          id: number
          word: string
        }
        Insert: {
          created_at?: string | null
          id?: number
          word: string
        }
        Update: {
          created_at?: string | null
          id?: number
          word?: string
        }
        Relationships: []
      }
      bar_requests: {
        Row: {
          address: string | null
          admin_notes: string | null
          city: string | null
          created_at: string | null
          google_place_id: string | null
          id: number
          latitude: number | null
          longitude: number | null
          phone: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          state: string | null
          status: string
          submitted_by: string | null
          submitter_notes: string | null
          updated_at: string | null
          venue_name: string
          zip_code: string | null
        }
        Insert: {
          address?: string | null
          admin_notes?: string | null
          city?: string | null
          created_at?: string | null
          google_place_id?: string | null
          id?: number
          latitude?: number | null
          longitude?: number | null
          phone?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          state?: string | null
          status?: string
          submitted_by?: string | null
          submitter_notes?: string | null
          updated_at?: string | null
          venue_name: string
          zip_code?: string | null
        }
        Update: {
          address?: string | null
          admin_notes?: string | null
          city?: string | null
          created_at?: string | null
          google_place_id?: string | null
          id?: number
          latitude?: number | null
          longitude?: number | null
          phone?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          state?: string | null
          status?: string
          submitted_by?: string | null
          submitter_notes?: string | null
          updated_at?: string | null
          venue_name?: string
          zip_code?: string | null
        }
        Relationships: []
      }
      billing_plans: {
        Row: {
          created_at: string | null
          description: string | null
          features: Json | null
          id: string
          is_active: boolean | null
          name: string
          price_monthly: number | null
          price_yearly: number | null
          stripe_price_id_monthly: string | null
          stripe_price_id_yearly: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          features?: Json | null
          id?: string
          is_active?: boolean | null
          name: string
          price_monthly?: number | null
          price_yearly?: number | null
          stripe_price_id_monthly?: string | null
          stripe_price_id_yearly?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          features?: Json | null
          id?: string
          is_active?: boolean | null
          name?: string
          price_monthly?: number | null
          price_yearly?: number | null
          stripe_price_id_monthly?: string | null
          stripe_price_id_yearly?: string | null
        }
        Relationships: []
      }
      chip_config: {
        Row: {
          auto_eliminate: boolean
          buy_backs_allowed: boolean
          finished_at: string | null
          format: string
          performance_tracking: boolean
          played_round_ids: Json
          queue: Json
          reshuffle_count: number
          reshuffle_pending: boolean
          reshuffle_table_count: number | null
          restore_points: Json
          round_remaining: Json
          shuffle_mode: boolean
          shuffle_ready: boolean
          shuffle_round: boolean
          started_at: string | null
          stream_enabled: boolean
          tiers: Json
          tournament_id: number
          updated_at: string
          winner_entry_id: string | null
          winner_stays: boolean
        }
        Insert: {
          auto_eliminate?: boolean
          buy_backs_allowed?: boolean
          finished_at?: string | null
          format?: string
          performance_tracking?: boolean
          played_round_ids?: Json
          queue?: Json
          reshuffle_count?: number
          reshuffle_pending?: boolean
          reshuffle_table_count?: number | null
          restore_points?: Json
          round_remaining?: Json
          shuffle_mode?: boolean
          shuffle_ready?: boolean
          shuffle_round?: boolean
          started_at?: string | null
          stream_enabled?: boolean
          tiers?: Json
          tournament_id: number
          updated_at?: string
          winner_entry_id?: string | null
          winner_stays?: boolean
        }
        Update: {
          auto_eliminate?: boolean
          buy_backs_allowed?: boolean
          finished_at?: string | null
          format?: string
          performance_tracking?: boolean
          played_round_ids?: Json
          queue?: Json
          reshuffle_count?: number
          reshuffle_pending?: boolean
          reshuffle_table_count?: number | null
          restore_points?: Json
          round_remaining?: Json
          shuffle_mode?: boolean
          shuffle_ready?: boolean
          shuffle_round?: boolean
          started_at?: string | null
          stream_enabled?: boolean
          tiers?: Json
          tournament_id?: number
          updated_at?: string
          winner_entry_id?: string | null
          winner_stays?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "chip_config_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: true
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      chip_entries: {
        Row: {
          best_streak: number
          checked_in: boolean
          chips: number
          created_at: string
          eliminated_at: string | null
          eliminations: number
          id: string
          losses: number
          p1_fargo: number | null
          p1_name: string
          p1_phone: string | null
          p1_profile_id: number | null
          p2_fargo: number | null
          p2_name: string | null
          p2_profile_id: number | null
          paid: boolean
          start_chips: number
          status: string
          streak: number
          table_id: string | null
          team_fargo: number | null
          tournament_id: number
          wins: number
        }
        Insert: {
          best_streak?: number
          checked_in?: boolean
          chips?: number
          created_at?: string
          eliminated_at?: string | null
          eliminations?: number
          id: string
          losses?: number
          p1_fargo?: number | null
          p1_name?: string
          p1_phone?: string | null
          p1_profile_id?: number | null
          p2_fargo?: number | null
          p2_name?: string | null
          p2_profile_id?: number | null
          paid?: boolean
          start_chips?: number
          status?: string
          streak?: number
          table_id?: string | null
          team_fargo?: number | null
          tournament_id: number
          wins?: number
        }
        Update: {
          best_streak?: number
          checked_in?: boolean
          chips?: number
          created_at?: string
          eliminated_at?: string | null
          eliminations?: number
          id?: string
          losses?: number
          p1_fargo?: number | null
          p1_name?: string
          p1_phone?: string | null
          p1_profile_id?: number | null
          p2_fargo?: number | null
          p2_name?: string | null
          p2_profile_id?: number | null
          paid?: boolean
          start_chips?: number
          status?: string
          streak?: number
          table_id?: string | null
          team_fargo?: number | null
          tournament_id?: number
          wins?: number
        }
        Relationships: [
          {
            foreignKeyName: "chip_entries_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      chip_events: {
        Row: {
          actor_id: number | null
          created_at: string
          id: string
          payload: Json | null
          superseded: boolean
          text: string
          tournament_id: number
          tx_id: string | null
          type: string
        }
        Insert: {
          actor_id?: number | null
          created_at?: string
          id: string
          payload?: Json | null
          superseded?: boolean
          text?: string
          tournament_id: number
          tx_id?: string | null
          type: string
        }
        Update: {
          actor_id?: number | null
          created_at?: string
          id?: string
          payload?: Json | null
          superseded?: boolean
          text?: string
          tournament_id?: number
          tx_id?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "chip_events_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      chip_matches: {
        Row: {
          a_id: string
          b_id: string
          ended_at: string | null
          id: string
          loser_id: string | null
          started_at: string
          status: string
          table_id: string
          tournament_id: number
          winner_id: string | null
        }
        Insert: {
          a_id: string
          b_id: string
          ended_at?: string | null
          id: string
          loser_id?: string | null
          started_at?: string
          status?: string
          table_id: string
          tournament_id: number
          winner_id?: string | null
        }
        Update: {
          a_id?: string
          b_id?: string
          ended_at?: string | null
          id?: string
          loser_id?: string | null
          started_at?: string
          status?: string
          table_id?: string
          tournament_id?: number
          winner_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chip_matches_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      chip_results: {
        Row: {
          created_at: string
          entry_id: string
          id: number
          p1_profile_id: number | null
          p2_profile_id: number | null
          place: number
          team_name: string | null
          tournament_id: number
        }
        Insert: {
          created_at?: string
          entry_id: string
          id?: never
          p1_profile_id?: number | null
          p2_profile_id?: number | null
          place: number
          team_name?: string | null
          tournament_id: number
        }
        Update: {
          created_at?: string
          entry_id?: string
          id?: never
          p1_profile_id?: number | null
          p2_profile_id?: number | null
          place?: number
          team_name?: string | null
          tournament_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "chip_results_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      chip_tables: {
        Row: {
          closing: boolean
          holder_id: string | null
          id: string
          inactive: boolean
          is_stream: boolean
          label: string
          last_loser_id: string | null
          locked: boolean
          match_id: string | null
          pending_challenger_id: string | null
          sort: number
          status: string
          stream_url: string | null
          tournament_id: number
        }
        Insert: {
          closing?: boolean
          holder_id?: string | null
          id: string
          inactive?: boolean
          is_stream?: boolean
          label?: string
          last_loser_id?: string | null
          locked?: boolean
          match_id?: string | null
          pending_challenger_id?: string | null
          sort?: number
          status?: string
          stream_url?: string | null
          tournament_id: number
        }
        Update: {
          closing?: boolean
          holder_id?: string | null
          id?: string
          inactive?: boolean
          is_stream?: boolean
          label?: string
          last_loser_id?: string | null
          locked?: boolean
          match_id?: string | null
          pending_challenger_id?: string | null
          sort?: number
          status?: string
          stream_url?: string | null
          tournament_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "chip_tables_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_messages: {
        Row: {
          body: string
          conversation_id: string
          created_at: string
          id: string
          sender_id: string
        }
        Insert: {
          body: string
          conversation_id: string
          created_at?: string
          id?: string
          sender_id: string
        }
        Update: {
          body?: string
          conversation_id?: string
          created_at?: string
          id?: string
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_participants: {
        Row: {
          conversation_id: string
          created_at: string
          id: string
          last_read_at: string | null
          user_id: string
        }
        Insert: {
          conversation_id: string
          created_at?: string
          id?: string
          last_read_at?: string | null
          user_id: string
        }
        Update: {
          conversation_id?: string
          created_at?: string
          id?: string
          last_read_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_participants_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_participants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          category: string | null
          created_at: string
          created_by: string
          id: string
          is_support: boolean
          subject: string | null
          tournament_id: number | null
          updated_at: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          created_by: string
          id?: string
          is_support?: boolean
          subject?: string | null
          tournament_id?: number | null
          updated_at?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          created_by?: string
          id?: string
          is_support?: boolean
          subject?: string | null
          tournament_id?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      faqs: {
        Row: {
          answer: string
          answer_es: string | null
          category: string | null
          created_at: string | null
          created_by: number | null
          display_order: number | null
          id: number
          is_published: boolean | null
          question: string
          question_es: string | null
          updated_at: string | null
          updated_by: number | null
        }
        Insert: {
          answer: string
          answer_es?: string | null
          category?: string | null
          created_at?: string | null
          created_by?: number | null
          display_order?: number | null
          id?: number
          is_published?: boolean | null
          question: string
          question_es?: string | null
          updated_at?: string | null
          updated_by?: number | null
        }
        Update: {
          answer?: string
          answer_es?: string | null
          category?: string | null
          created_at?: string | null
          created_by?: number | null
          display_order?: number | null
          id?: number
          is_published?: boolean | null
          question?: string
          question_es?: string | null
          updated_at?: string | null
          updated_by?: number | null
        }
        Relationships: []
      }
      favorites: {
        Row: {
          created_at: string | null
          favorite_type: string
          id: number
          template_id: number | null
          tournament_id: number | null
          user_id: number
        }
        Insert: {
          created_at?: string | null
          favorite_type: string
          id?: number
          template_id?: number | null
          tournament_id?: number | null
          user_id: number
        }
        Update: {
          created_at?: string | null
          favorite_type?: string
          id?: number
          template_id?: number | null
          tournament_id?: number | null
          user_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "favorites_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "tournament_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "favorites_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "favorites_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id_auto"]
          },
        ]
      }
      featured_bars: {
        Row: {
          address: string | null
          created_at: string | null
          description: string | null
          featured_priority: number | null
          featured_until: string | null
          google_place_id: string | null
          highlights: string[] | null
          hours_of_operation: string | null
          id: number
          is_active: boolean | null
          latitude: number | null
          location: string | null
          longitude: number | null
          name: string
          phone: string | null
          photo_url: string | null
          special_features: string | null
          updated_at: string | null
          venue_id: number | null
        }
        Insert: {
          address?: string | null
          created_at?: string | null
          description?: string | null
          featured_priority?: number | null
          featured_until?: string | null
          google_place_id?: string | null
          highlights?: string[] | null
          hours_of_operation?: string | null
          id?: number
          is_active?: boolean | null
          latitude?: number | null
          location?: string | null
          longitude?: number | null
          name: string
          phone?: string | null
          photo_url?: string | null
          special_features?: string | null
          updated_at?: string | null
          venue_id?: number | null
        }
        Update: {
          address?: string | null
          created_at?: string | null
          description?: string | null
          featured_priority?: number | null
          featured_until?: string | null
          google_place_id?: string | null
          highlights?: string[] | null
          hours_of_operation?: string | null
          id?: number
          is_active?: boolean | null
          latitude?: number | null
          location?: string | null
          longitude?: number | null
          name?: string
          phone?: string | null
          photo_url?: string | null
          special_features?: string | null
          updated_at?: string | null
          venue_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "featured_bars_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      featured_players: {
        Row: {
          achievements: string[] | null
          bio: string | null
          created_at: string | null
          fargo_rating: number | null
          featured_priority: number | null
          featured_until: string | null
          id: number
          is_active: boolean | null
          location: string | null
          name: string
          nickname: string | null
          photo_url: string | null
          preferred_game: string | null
          updated_at: string | null
          user_id: number | null
          years_playing: number | null
        }
        Insert: {
          achievements?: string[] | null
          bio?: string | null
          created_at?: string | null
          fargo_rating?: number | null
          featured_priority?: number | null
          featured_until?: string | null
          id?: number
          is_active?: boolean | null
          location?: string | null
          name: string
          nickname?: string | null
          photo_url?: string | null
          preferred_game?: string | null
          updated_at?: string | null
          user_id?: number | null
          years_playing?: number | null
        }
        Update: {
          achievements?: string[] | null
          bio?: string | null
          created_at?: string | null
          fargo_rating?: number | null
          featured_priority?: number | null
          featured_until?: string | null
          id?: number
          is_active?: boolean | null
          location?: string | null
          name?: string
          nickname?: string | null
          photo_url?: string | null
          preferred_game?: string | null
          updated_at?: string | null
          user_id?: number | null
          years_playing?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "featured_players_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id_auto"]
          },
        ]
      }
      giveaway_draws: {
        Row: {
          draw_number: number
          drawn_at: string | null
          drawn_by: number
          giveaway_id: number
          id: number
          invalidated: boolean | null
          invalidated_at: string | null
          invalidated_by: number | null
          invalidation_reason: string | null
          winner_id: number
        }
        Insert: {
          draw_number: number
          drawn_at?: string | null
          drawn_by: number
          giveaway_id: number
          id?: number
          invalidated?: boolean | null
          invalidated_at?: string | null
          invalidated_by?: number | null
          invalidation_reason?: string | null
          winner_id: number
        }
        Update: {
          draw_number?: number
          drawn_at?: string | null
          drawn_by?: number
          giveaway_id?: number
          id?: number
          invalidated?: boolean | null
          invalidated_at?: string | null
          invalidated_by?: number | null
          invalidation_reason?: string | null
          winner_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "giveaway_draws_drawn_by_fkey"
            columns: ["drawn_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id_auto"]
          },
          {
            foreignKeyName: "giveaway_draws_giveaway_id_fkey"
            columns: ["giveaway_id"]
            isOneToOne: false
            referencedRelation: "giveaways"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "giveaway_draws_invalidated_by_fkey"
            columns: ["invalidated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id_auto"]
          },
          {
            foreignKeyName: "giveaway_draws_winner_id_fkey"
            columns: ["winner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id_auto"]
          },
        ]
      }
      giveaway_entries: {
        Row: {
          agreed_to_privacy: boolean
          agreed_to_rules: boolean
          birthday: string
          confirmed_age: boolean
          created_at: string | null
          email: string
          giveaway_id: number
          id: number
          name_as_on_id: string
          opted_in_promotions: boolean | null
          phone: string
          user_id: number
        }
        Insert: {
          agreed_to_privacy?: boolean
          agreed_to_rules?: boolean
          birthday: string
          confirmed_age?: boolean
          created_at?: string | null
          email: string
          giveaway_id: number
          id?: number
          name_as_on_id: string
          opted_in_promotions?: boolean | null
          phone: string
          user_id: number
        }
        Update: {
          agreed_to_privacy?: boolean
          agreed_to_rules?: boolean
          birthday?: string
          confirmed_age?: boolean
          created_at?: string | null
          email?: string
          giveaway_id?: number
          id?: number
          name_as_on_id?: string
          opted_in_promotions?: boolean | null
          phone?: string
          user_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "giveaway_entries_giveaway_id_fkey"
            columns: ["giveaway_id"]
            isOneToOne: false
            referencedRelation: "giveaways"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "giveaway_entries_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id_auto"]
          },
        ]
      }
      giveaway_winner_history: {
        Row: {
          created_at: string | null
          disqualified_at: string | null
          disqualified_by: number | null
          disqualified_reason: string | null
          drawn_at: string
          drawn_by: number
          entry_id: number
          giveaway_id: number
          id: number
          status: string
          user_id: number
        }
        Insert: {
          created_at?: string | null
          disqualified_at?: string | null
          disqualified_by?: number | null
          disqualified_reason?: string | null
          drawn_at?: string
          drawn_by: number
          entry_id: number
          giveaway_id: number
          id?: number
          status?: string
          user_id: number
        }
        Update: {
          created_at?: string | null
          disqualified_at?: string | null
          disqualified_by?: number | null
          disqualified_reason?: string | null
          drawn_at?: string
          drawn_by?: number
          entry_id?: number
          giveaway_id?: number
          id?: number
          status?: string
          user_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "giveaway_winner_history_disqualified_by_fkey"
            columns: ["disqualified_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id_auto"]
          },
          {
            foreignKeyName: "giveaway_winner_history_drawn_by_fkey"
            columns: ["drawn_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id_auto"]
          },
          {
            foreignKeyName: "giveaway_winner_history_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "giveaway_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "giveaway_winner_history_giveaway_id_fkey"
            columns: ["giveaway_id"]
            isOneToOne: false
            referencedRelation: "giveaways"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "giveaway_winner_history_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id_auto"]
          },
        ]
      }
      giveaways: {
        Row: {
          archived_at: string | null
          created_at: string | null
          created_by: number
          description: string | null
          description_es: string | null
          end_date: string | null
          end_type: string | null
          ended_at: string | null
          id: number
          image_url: string | null
          max_entries: number | null
          min_age: number | null
          name: string
          prize_value: number | null
          rules_text: string | null
          status: string | null
          updated_at: string | null
          winner_drawn_at: string | null
          winner_drawn_by: number | null
          winner_id: number | null
        }
        Insert: {
          archived_at?: string | null
          created_at?: string | null
          created_by: number
          description?: string | null
          description_es?: string | null
          end_date?: string | null
          end_type?: string | null
          ended_at?: string | null
          id?: number
          image_url?: string | null
          max_entries?: number | null
          min_age?: number | null
          name: string
          prize_value?: number | null
          rules_text?: string | null
          status?: string | null
          updated_at?: string | null
          winner_drawn_at?: string | null
          winner_drawn_by?: number | null
          winner_id?: number | null
        }
        Update: {
          archived_at?: string | null
          created_at?: string | null
          created_by?: number
          description?: string | null
          description_es?: string | null
          end_date?: string | null
          end_type?: string | null
          ended_at?: string | null
          id?: number
          image_url?: string | null
          max_entries?: number | null
          min_age?: number | null
          name?: string
          prize_value?: number | null
          rules_text?: string | null
          status?: string | null
          updated_at?: string | null
          winner_drawn_at?: string | null
          winner_drawn_by?: number | null
          winner_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "giveaways_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id_auto"]
          },
          {
            foreignKeyName: "giveaways_winner_drawn_by_fkey"
            columns: ["winner_drawn_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id_auto"]
          },
          {
            foreignKeyName: "giveaways_winner_id_fkey"
            columns: ["winner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id_auto"]
          },
        ]
      }
      image_scan_logs: {
        Row: {
          confidence_scores: Json | null
          created_at: string | null
          file_name: string
          id: number
          image_url: string
          is_appropriate: boolean
          user_id: string | null
          violations: string[] | null
        }
        Insert: {
          confidence_scores?: Json | null
          created_at?: string | null
          file_name: string
          id?: number
          image_url: string
          is_appropriate: boolean
          user_id?: string | null
          violations?: string[] | null
        }
        Update: {
          confidence_scores?: Json | null
          created_at?: string | null
          file_name?: string
          id?: number
          image_url?: string
          is_appropriate?: boolean
          user_id?: string | null
          violations?: string[] | null
        }
        Relationships: []
      }
      invoices: {
        Row: {
          amount: number
          created_at: string | null
          currency: string | null
          hosted_invoice_url: string | null
          id: string
          invoice_date: string | null
          provider_invoice_id: string | null
          receipt_url: string | null
          status: string
          subscription_id: string | null
          venue_id: number
        }
        Insert: {
          amount: number
          created_at?: string | null
          currency?: string | null
          hosted_invoice_url?: string | null
          id?: string
          invoice_date?: string | null
          provider_invoice_id?: string | null
          receipt_url?: string | null
          status: string
          subscription_id?: string | null
          venue_id: number
        }
        Update: {
          amount?: number
          created_at?: string | null
          currency?: string | null
          hosted_invoice_url?: string | null
          id?: string
          invoice_date?: string | null
          provider_invoice_id?: string | null
          receipt_url?: string | null
          status?: string
          subscription_id?: string | null
          venue_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoices_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "venue_subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      message_rate_limits: {
        Row: {
          id: string
          last_message_at: string | null
          last_reset_date: string
          messages_this_week: number
          messages_today: number
          sender_id: string
          sender_role: string
        }
        Insert: {
          id?: string
          last_message_at?: string | null
          last_reset_date?: string
          messages_this_week?: number
          messages_today?: number
          sender_id: string
          sender_role: string
        }
        Update: {
          id?: string
          last_message_at?: string | null
          last_reset_date?: string
          messages_this_week?: number
          messages_today?: number
          sender_id?: string
          sender_role?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_rate_limits_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      message_recipients: {
        Row: {
          created_at: string | null
          id: number
          message_id: number
          push_sent: boolean
          read_at: string | null
          user_id: number
        }
        Insert: {
          created_at?: string | null
          id?: number
          message_id: number
          push_sent?: boolean
          read_at?: string | null
          user_id: number
        }
        Update: {
          created_at?: string | null
          id?: number
          message_id?: number
          push_sent?: boolean
          read_at?: string | null
          user_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "message_recipients_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_recipients_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id_auto"]
          },
        ]
      }
      messages: {
        Row: {
          body: string
          body_es: string | null
          created_at: string | null
          id: number
          message_type: string
          recipient_count: number | null
          sender_id: number
          sender_role: string
          subject: string
          target_filter: Json | null
          target_type: string | null
          template_id: number | null
          tournament_id: number | null
          venue_id: number | null
        }
        Insert: {
          body: string
          body_es?: string | null
          created_at?: string | null
          id?: number
          message_type: string
          recipient_count?: number | null
          sender_id: number
          sender_role: string
          subject: string
          target_filter?: Json | null
          target_type?: string | null
          template_id?: number | null
          tournament_id?: number | null
          venue_id?: number | null
        }
        Update: {
          body?: string
          body_es?: string | null
          created_at?: string | null
          id?: number
          message_type?: string
          recipient_count?: number | null
          sender_id?: number
          sender_role?: string
          subject?: string
          target_filter?: Json | null
          target_type?: string | null
          template_id?: number | null
          tournament_id?: number | null
          venue_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id_auto"]
          },
          {
            foreignKeyName: "messages_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "tournament_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      news_articles: {
        Row: {
          fetched_at: string | null
          id: number
          image_url: string | null
          published_at: string
          source: string
          source_url: string
          summary: string | null
          title: string
          url: string
        }
        Insert: {
          fetched_at?: string | null
          id?: number
          image_url?: string | null
          published_at: string
          source: string
          source_url: string
          summary?: string | null
          title: string
          url: string
        }
        Update: {
          fetched_at?: string | null
          id?: number
          image_url?: string | null
          published_at?: string
          source?: string
          source_url?: string
          summary?: string | null
          title?: string
          url?: string
        }
        Relationships: []
      }
      notification_message_recipients: {
        Row: {
          created_at: string
          id: string
          message_id: string
          push_sent: boolean
          read_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message_id: string
          push_sent?: boolean
          read_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          message_id?: string
          push_sent?: boolean
          read_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_message_recipients_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "notification_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_message_recipients_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_messages: {
        Row: {
          body: string
          created_at: string
          id: string
          message_type: string
          recipient_count: number | null
          sender_id: string
          sender_role: string
          subject: string
          target_type: string | null
          tournament_id: number | null
          venue_id: number | null
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          message_type?: string
          recipient_count?: number | null
          sender_id: string
          sender_role: string
          subject: string
          target_type?: string | null
          tournament_id?: number | null
          venue_id?: number | null
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          message_type?: string
          recipient_count?: number | null
          sender_id?: string
          sender_role?: string
          subject?: string
          target_type?: string | null
          tournament_id?: number | null
          venue_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "notification_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_messages_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_messages_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          app_announcements: boolean
          created_at: string
          giveaway_updates: boolean
          id: string
          quiet_hours_end: string | null
          quiet_hours_start: string | null
          search_alert_matches: boolean
          sms_consent_at: string | null
          sms_consent_source: string | null
          sms_consent_version: string | null
          sms_enabled: boolean
          sms_match_alerts: boolean
          sms_opted_out_at: string | null
          sms_phone: string | null
          sms_tournament_reminders: boolean
          sms_weekly_report: boolean
          tournament_updates: boolean
          updated_at: string
          user_id: string
          venue_promotions: boolean
        }
        Insert: {
          app_announcements?: boolean
          created_at?: string
          giveaway_updates?: boolean
          id?: string
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          search_alert_matches?: boolean
          sms_consent_at?: string | null
          sms_consent_source?: string | null
          sms_consent_version?: string | null
          sms_enabled?: boolean
          sms_match_alerts?: boolean
          sms_opted_out_at?: string | null
          sms_phone?: string | null
          sms_tournament_reminders?: boolean
          sms_weekly_report?: boolean
          tournament_updates?: boolean
          updated_at?: string
          user_id: string
          venue_promotions?: boolean
        }
        Update: {
          app_announcements?: boolean
          created_at?: string
          giveaway_updates?: boolean
          id?: string
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          search_alert_matches?: boolean
          sms_consent_at?: string | null
          sms_consent_source?: string | null
          sms_consent_version?: string | null
          sms_enabled?: boolean
          sms_match_alerts?: boolean
          sms_opted_out_at?: string | null
          sms_phone?: string | null
          sms_tournament_reminders?: boolean
          sms_weekly_report?: boolean
          tournament_updates?: boolean
          updated_at?: string
          user_id?: string
          venue_promotions?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "notification_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string
          category: string | null
          created_at: string | null
          data: Json | null
          error_message: string | null
          id: number
          read_at: string | null
          scheduled_for: string | null
          sent_at: string | null
          status: string | null
          title: string
          user_id: number
        }
        Insert: {
          body: string
          category?: string | null
          created_at?: string | null
          data?: Json | null
          error_message?: string | null
          id?: number
          read_at?: string | null
          scheduled_for?: string | null
          sent_at?: string | null
          status?: string | null
          title: string
          user_id: number
        }
        Update: {
          body?: string
          category?: string | null
          created_at?: string | null
          data?: Json | null
          error_message?: string | null
          id?: number
          read_at?: string | null
          scheduled_for?: string | null
          sent_at?: string | null
          status?: string | null
          title?: string
          user_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id_auto"]
          },
        ]
      }
      payment_methods: {
        Row: {
          brand: string | null
          created_at: string | null
          exp_month: number | null
          exp_year: number | null
          id: string
          is_default: boolean | null
          last4: string | null
          provider_payment_method_id: string
          venue_id: number
        }
        Insert: {
          brand?: string | null
          created_at?: string | null
          exp_month?: number | null
          exp_year?: number | null
          id?: string
          is_default?: boolean | null
          last4?: string | null
          provider_payment_method_id: string
          venue_id: number
        }
        Update: {
          brand?: string | null
          created_at?: string | null
          exp_month?: number | null
          exp_year?: number | null
          id?: string
          is_default?: boolean | null
          last4?: string | null
          provider_payment_method_id?: string
          venue_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "payment_methods_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          deleted_at: string | null
          deleted_by: number | null
          email: string
          fargo: number | null
          fargo_last_verified_at: string | null
          fargo_status: string
          fargo_verified_by: number | null
          favorite_player: string | null
          first_name: string | null
          has_completed_onboarding: boolean | null
          home_city: string | null
          home_state: string
          id: string
          id_auto: number
          is_disabled: boolean
          language_preference: string | null
          last_active_at: string | null
          last_login_at: string | null
          last_name: string | null
          name: string
          notify_app_updates: boolean | null
          notify_cancellations: boolean | null
          notify_favorite_updates: boolean | null
          notify_giveaway_winners: boolean | null
          notify_new_giveaways: boolean | null
          notify_promotions: boolean | null
          notify_saved_search_matches: boolean | null
          notify_tournament_reminders: boolean | null
          onboarding_step: number | null
          phone_number: string | null
          phone_verification_method: string | null
          phone_verification_provider: string | null
          phone_verified_at: string | null
          preferred_game: string | null
          role: string
          status: string | null
          total_winnings: number | null
          updated_at: string | null
          user_name: string
          zip_code: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          deleted_at?: string | null
          deleted_by?: number | null
          email: string
          fargo?: number | null
          fargo_last_verified_at?: string | null
          fargo_status?: string
          fargo_verified_by?: number | null
          favorite_player?: string | null
          first_name?: string | null
          has_completed_onboarding?: boolean | null
          home_city?: string | null
          home_state: string
          id: string
          id_auto?: never
          is_disabled?: boolean
          language_preference?: string | null
          last_active_at?: string | null
          last_login_at?: string | null
          last_name?: string | null
          name: string
          notify_app_updates?: boolean | null
          notify_cancellations?: boolean | null
          notify_favorite_updates?: boolean | null
          notify_giveaway_winners?: boolean | null
          notify_new_giveaways?: boolean | null
          notify_promotions?: boolean | null
          notify_saved_search_matches?: boolean | null
          notify_tournament_reminders?: boolean | null
          onboarding_step?: number | null
          phone_number?: string | null
          phone_verification_method?: string | null
          phone_verification_provider?: string | null
          phone_verified_at?: string | null
          preferred_game?: string | null
          role?: string
          status?: string | null
          total_winnings?: number | null
          updated_at?: string | null
          user_name: string
          zip_code?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          deleted_at?: string | null
          deleted_by?: number | null
          email?: string
          fargo?: number | null
          fargo_last_verified_at?: string | null
          fargo_status?: string
          fargo_verified_by?: number | null
          favorite_player?: string | null
          first_name?: string | null
          has_completed_onboarding?: boolean | null
          home_city?: string | null
          home_state?: string
          id?: string
          id_auto?: never
          is_disabled?: boolean
          language_preference?: string | null
          last_active_at?: string | null
          last_login_at?: string | null
          last_name?: string | null
          name?: string
          notify_app_updates?: boolean | null
          notify_cancellations?: boolean | null
          notify_favorite_updates?: boolean | null
          notify_giveaway_winners?: boolean | null
          notify_new_giveaways?: boolean | null
          notify_promotions?: boolean | null
          notify_saved_search_matches?: boolean | null
          notify_tournament_reminders?: boolean | null
          onboarding_step?: number | null
          phone_number?: string | null
          phone_verification_method?: string | null
          phone_verification_provider?: string | null
          phone_verified_at?: string | null
          preferred_game?: string | null
          role?: string
          status?: string | null
          total_winnings?: number | null
          updated_at?: string | null
          user_name?: string
          zip_code?: string | null
        }
        Relationships: []
      }
      push_tokens: {
        Row: {
          created_at: string
          device_type: string | null
          id: string
          is_active: boolean
          token: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          device_type?: string | null
          id?: string
          is_active?: boolean
          token: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          device_type?: string | null
          id?: string
          is_active?: boolean
          token?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      reassignment_logs: {
        Row: {
          entity_id: number
          entity_name: string | null
          entity_type: string
          id: number
          new_user_id: number
          new_user_name: string | null
          previous_user_id: number
          previous_user_name: string | null
          reason: string
          reassigned_at: string
          reassigned_by: number
          reassigned_by_name: string | null
        }
        Insert: {
          entity_id: number
          entity_name?: string | null
          entity_type: string
          id?: number
          new_user_id: number
          new_user_name?: string | null
          previous_user_id: number
          previous_user_name?: string | null
          reason: string
          reassigned_at?: string
          reassigned_by: number
          reassigned_by_name?: string | null
        }
        Update: {
          entity_id?: number
          entity_name?: string | null
          entity_type?: string
          id?: number
          new_user_id?: number
          new_user_name?: string | null
          previous_user_id?: number
          previous_user_name?: string | null
          reason?: string
          reassigned_at?: string
          reassigned_by?: number
          reassigned_by_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reassignment_logs_new_user_fkey"
            columns: ["new_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id_auto"]
          },
          {
            foreignKeyName: "reassignment_logs_previous_user_fkey"
            columns: ["previous_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id_auto"]
          },
          {
            foreignKeyName: "reassignment_logs_reassigned_by_fkey"
            columns: ["reassigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id_auto"]
          },
        ]
      }
      reports: {
        Row: {
          content_id: string
          content_type: string
          created_at: string
          details: string | null
          id: string
          reason: string
          reporter_id: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
        }
        Insert: {
          content_id: string
          content_type: string
          created_at?: string
          details?: string | null
          id?: string
          reason: string
          reporter_id: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
        }
        Update: {
          content_id?: string
          content_type?: string
          created_at?: string
          details?: string | null
          id?: string
          reason?: string
          reporter_id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_searches: {
        Row: {
          alert_enabled: boolean | null
          alert_frequency: string | null
          created_at: string | null
          filters: Json
          id: number
          last_applied_at: string | null
          name: string
          updated_at: string | null
          user_id: number
        }
        Insert: {
          alert_enabled?: boolean | null
          alert_frequency?: string | null
          created_at?: string | null
          filters: Json
          id?: number
          last_applied_at?: string | null
          name: string
          updated_at?: string | null
          user_id: number
        }
        Update: {
          alert_enabled?: boolean | null
          alert_frequency?: string | null
          created_at?: string | null
          filters?: Json
          id?: number
          last_applied_at?: string | null
          name?: string
          updated_at?: string | null
          user_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "saved_searches_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id_auto"]
          },
        ]
      }
      search_alerts: {
        Row: {
          created_at: string | null
          description: string | null
          filter_criteria: Json
          id: number
          is_active: boolean
          last_match_date: string | null
          match_count: number
          name: string
          updated_at: string | null
          user_id: number
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          filter_criteria: Json
          id?: number
          is_active?: boolean
          last_match_date?: string | null
          match_count?: number
          name: string
          updated_at?: string | null
          user_id: number
        }
        Update: {
          created_at?: string | null
          description?: string | null
          filter_criteria?: Json
          id?: number
          is_active?: boolean
          last_match_date?: string | null
          match_count?: number
          name?: string
          updated_at?: string | null
          user_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "search_alerts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id_auto"]
          },
        ]
      }
      sms_consent_events: {
        Row: {
          action: string
          consent_source: string | null
          consent_version: string | null
          created_at: string
          id: number
          metadata: Json
          phone_number: string | null
          user_id: string
        }
        Insert: {
          action: string
          consent_source?: string | null
          consent_version?: string | null
          created_at?: string
          id?: never
          metadata?: Json
          phone_number?: string | null
          user_id: string
        }
        Update: {
          action?: string
          consent_source?: string | null
          consent_version?: string | null
          created_at?: string
          id?: never
          metadata?: Json
          phone_number?: string | null
          user_id?: string
        }
        Relationships: []
      }
      sms_messages: {
        Row: {
          accepted_at: string | null
          created_at: string
          delivered_at: string | null
          error_code: string | null
          error_detail: string | null
          id: number
          last_status_at: string | null
          match_id: string | null
          message_type: string
          provider: string | null
          provider_message_id: string | null
          retry_count: number | null
          status: string | null
          telnyx_message_id: string | null
          to_e164: string
          tournament_id: number | null
          user_id: string | null
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          delivered_at?: string | null
          error_code?: string | null
          error_detail?: string | null
          id?: never
          last_status_at?: string | null
          match_id?: string | null
          message_type: string
          provider?: string | null
          provider_message_id?: string | null
          retry_count?: number | null
          status?: string | null
          telnyx_message_id?: string | null
          to_e164: string
          tournament_id?: number | null
          user_id?: string | null
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          delivered_at?: string | null
          error_code?: string | null
          error_detail?: string | null
          id?: never
          last_status_at?: string | null
          match_id?: string | null
          message_type?: string
          provider?: string | null
          provider_message_id?: string | null
          retry_count?: number | null
          status?: string | null
          telnyx_message_id?: string | null
          to_e164?: string
          tournament_id?: number | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sms_messages_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      support_tickets: {
        Row: {
          assigned_to: number | null
          category: string | null
          created_at: string | null
          description: string
          id: number
          priority: string | null
          resolution_notes: string | null
          resolved_at: string | null
          resolved_by: number | null
          status: string | null
          subject: string
          updated_at: string | null
          user_id: number
        }
        Insert: {
          assigned_to?: number | null
          category?: string | null
          created_at?: string | null
          description: string
          id?: number
          priority?: string | null
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: number | null
          status?: string | null
          subject: string
          updated_at?: string | null
          user_id: number
        }
        Update: {
          assigned_to?: number | null
          category?: string | null
          created_at?: string | null
          description?: string
          id?: number
          priority?: string | null
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: number | null
          status?: string | null
          subject?: string
          updated_at?: string | null
          user_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "support_tickets_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id_auto"]
          },
          {
            foreignKeyName: "support_tickets_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id_auto"]
          },
          {
            foreignKeyName: "support_tickets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id_auto"]
          },
        ]
      }
      tournament_analytics: {
        Row: {
          created_at: string | null
          event_type: string
          id: number
          metadata: Json | null
          tournament_id: number | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          event_type: string
          id?: never
          metadata?: Json | null
          tournament_id?: number | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          event_type?: string
          id?: never
          metadata?: Json | null
          tournament_id?: number | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tournament_analytics_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      tournament_players: {
        Row: {
          checked_in_at: string | null
          created_at: string
          fargo_at_registration: number | null
          fargo_rating: number | null
          guest_name: string | null
          id: number
          is_starter_rating: boolean
          paid_entry: boolean
          paid_side_pots: Json
          player_id: number | null
          queue_position: number | null
          race_override: number | null
          registered_at: string
          seed: number | null
          status: string
          tournament_id: number
          updated_at: string
        }
        Insert: {
          checked_in_at?: string | null
          created_at?: string
          fargo_at_registration?: number | null
          fargo_rating?: number | null
          guest_name?: string | null
          id?: never
          is_starter_rating?: boolean
          paid_entry?: boolean
          paid_side_pots?: Json
          player_id?: number | null
          queue_position?: number | null
          race_override?: number | null
          registered_at?: string
          seed?: number | null
          status?: string
          tournament_id: number
          updated_at?: string
        }
        Update: {
          checked_in_at?: string | null
          created_at?: string
          fargo_at_registration?: number | null
          fargo_rating?: number | null
          guest_name?: string | null
          id?: never
          is_starter_rating?: boolean
          paid_entry?: boolean
          paid_side_pots?: Json
          player_id?: number | null
          queue_position?: number | null
          race_override?: number | null
          registered_at?: string
          seed?: number | null
          status?: string
          tournament_id?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tournament_players_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id_auto"]
          },
          {
            foreignKeyName: "tournament_players_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      tournament_settings_templates: {
        Row: {
          created_at: string
          id: number
          name: string
          settings: Json
          updated_at: string
          user_id: number
        }
        Insert: {
          created_at?: string
          id?: never
          name: string
          settings?: Json
          updated_at?: string
          user_id: number
        }
        Update: {
          created_at?: string
          id?: never
          name?: string
          settings?: Json
          updated_at?: string
          user_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "tournament_settings_templates_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id_auto"]
          },
        ]
      }
      tournament_tables: {
        Row: {
          created_at: string
          id: number
          is_streaming: boolean
          label: string | null
          match_id: number | null
          status: string
          stream_link: string | null
          table_number: number
          tournament_id: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: never
          is_streaming?: boolean
          label?: string | null
          match_id?: number | null
          status?: string
          stream_link?: string | null
          table_number: number
          tournament_id: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: never
          is_streaming?: boolean
          label?: string | null
          match_id?: number | null
          status?: string
          stream_link?: string | null
          table_number?: number
          tournament_id?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tournament_tables_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      tournament_team_members: {
        Row: {
          created_at: string
          fargo_at_registration: number | null
          id: number
          invite_method: string | null
          invite_status: string
          invite_value: string | null
          is_verified: boolean
          player_id: number | null
          role: string
          suggested_fargo: number | null
          team_id: number
          temp_name: string | null
          tournament_id: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          fargo_at_registration?: number | null
          id?: never
          invite_method?: string | null
          invite_status?: string
          invite_value?: string | null
          is_verified?: boolean
          player_id?: number | null
          role?: string
          suggested_fargo?: number | null
          team_id: number
          temp_name?: string | null
          tournament_id: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          fargo_at_registration?: number | null
          id?: never
          invite_method?: string | null
          invite_status?: string
          invite_value?: string | null
          is_verified?: boolean
          player_id?: number | null
          role?: string
          suggested_fargo?: number | null
          team_id?: number
          temp_name?: string | null
          tournament_id?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tournament_team_members_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id_auto"]
          },
          {
            foreignKeyName: "tournament_team_members_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "tournament_teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_team_members_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      tournament_teams: {
        Row: {
          approved: boolean
          captain_id: number
          checked_in: boolean
          chip_override: number | null
          created_at: string
          id: number
          invite_token: string
          locked: boolean
          name: string | null
          paid: boolean
          paid_side_pots: string[]
          status: string
          team_size: number
          tournament_id: number
          updated_at: string
        }
        Insert: {
          approved?: boolean
          captain_id: number
          checked_in?: boolean
          chip_override?: number | null
          created_at?: string
          id?: never
          invite_token?: string
          locked?: boolean
          name?: string | null
          paid?: boolean
          paid_side_pots?: string[]
          status?: string
          team_size?: number
          tournament_id: number
          updated_at?: string
        }
        Update: {
          approved?: boolean
          captain_id?: number
          checked_in?: boolean
          chip_override?: number | null
          created_at?: string
          id?: never
          invite_token?: string
          locked?: boolean
          name?: string | null
          paid?: boolean
          paid_side_pots?: string[]
          status?: string
          team_size?: number
          tournament_id?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tournament_teams_captain_id_fkey"
            columns: ["captain_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id_auto"]
          },
          {
            foreignKeyName: "tournament_teams_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      tournament_templates: {
        Row: {
          added_money: number | null
          archived_at: string | null
          archived_by: number | null
          calcutta: boolean
          chip_ranges: Json | null
          created_at: string | null
          description: string | null
          description_es: string | null
          director_id: number
          entry_fee: number | null
          equipment: string | null
          game_spot: string | null
          game_type: string
          horizon_days: number | null
          id: number
          max_fargo: number | null
          name: string
          number_of_tables: number | null
          open_tournament: boolean | null
          phone_number: string | null
          race: string | null
          recurrence_day: string
          recurrence_type: string
          recurrence_week: number | null
          reports_to_fargo: boolean | null
          required_fargo_games: number | null
          series_end_date: string | null
          series_start_date: string
          side_pots: Json | null
          start_time: string
          status: string | null
          table_size: string | null
          thumbnail: string | null
          tournament_format: string
          updated_at: string | null
          venue_id: number
        }
        Insert: {
          added_money?: number | null
          archived_at?: string | null
          archived_by?: number | null
          calcutta?: boolean
          chip_ranges?: Json | null
          created_at?: string | null
          description?: string | null
          description_es?: string | null
          director_id: number
          entry_fee?: number | null
          equipment?: string | null
          game_spot?: string | null
          game_type: string
          horizon_days?: number | null
          id?: number
          max_fargo?: number | null
          name: string
          number_of_tables?: number | null
          open_tournament?: boolean | null
          phone_number?: string | null
          race?: string | null
          recurrence_day: string
          recurrence_type: string
          recurrence_week?: number | null
          reports_to_fargo?: boolean | null
          required_fargo_games?: number | null
          series_end_date?: string | null
          series_start_date: string
          side_pots?: Json | null
          start_time: string
          status?: string | null
          table_size?: string | null
          thumbnail?: string | null
          tournament_format: string
          updated_at?: string | null
          venue_id: number
        }
        Update: {
          added_money?: number | null
          archived_at?: string | null
          archived_by?: number | null
          calcutta?: boolean
          chip_ranges?: Json | null
          created_at?: string | null
          description?: string | null
          description_es?: string | null
          director_id?: number
          entry_fee?: number | null
          equipment?: string | null
          game_spot?: string | null
          game_type?: string
          horizon_days?: number | null
          id?: number
          max_fargo?: number | null
          name?: string
          number_of_tables?: number | null
          open_tournament?: boolean | null
          phone_number?: string | null
          race?: string | null
          recurrence_day?: string
          recurrence_type?: string
          recurrence_week?: number | null
          reports_to_fargo?: boolean | null
          required_fargo_games?: number | null
          series_end_date?: string | null
          series_start_date?: string
          side_pots?: Json | null
          start_time?: string
          status?: string | null
          table_size?: string | null
          thumbnail?: string | null
          tournament_format?: string
          updated_at?: string | null
          venue_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "tournament_templates_archived_by_fkey"
            columns: ["archived_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id_auto"]
          },
          {
            foreignKeyName: "tournament_templates_director_id_fkey"
            columns: ["director_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id_auto"]
          },
          {
            foreignKeyName: "tournament_templates_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      tournament_templates_user: {
        Row: {
          added_money: number | null
          calcutta: boolean
          chip_ranges: Json | null
          created_at: string | null
          description: string | null
          entry_fee: number | null
          equipment: string | null
          game_spot: string | null
          game_type: string | null
          id: number
          max_fargo: number | null
          name: string
          number_of_tables: number | null
          open_tournament: boolean | null
          race: string | null
          reports_to_fargo: boolean | null
          required_fargo_games: number | null
          side_pots: Json | null
          table_size: string | null
          thumbnail: string | null
          tournament_format: string | null
          updated_at: string | null
          user_id: number
        }
        Insert: {
          added_money?: number | null
          calcutta?: boolean
          chip_ranges?: Json | null
          created_at?: string | null
          description?: string | null
          entry_fee?: number | null
          equipment?: string | null
          game_spot?: string | null
          game_type?: string | null
          id?: number
          max_fargo?: number | null
          name: string
          number_of_tables?: number | null
          open_tournament?: boolean | null
          race?: string | null
          reports_to_fargo?: boolean | null
          required_fargo_games?: number | null
          side_pots?: Json | null
          table_size?: string | null
          thumbnail?: string | null
          tournament_format?: string | null
          updated_at?: string | null
          user_id: number
        }
        Update: {
          added_money?: number | null
          calcutta?: boolean
          chip_ranges?: Json | null
          created_at?: string | null
          description?: string | null
          entry_fee?: number | null
          equipment?: string | null
          game_spot?: string | null
          game_type?: string | null
          id?: number
          max_fargo?: number | null
          name?: string
          number_of_tables?: number | null
          open_tournament?: boolean | null
          race?: string | null
          reports_to_fargo?: boolean | null
          required_fargo_games?: number | null
          side_pots?: Json | null
          table_size?: string | null
          thumbnail?: string | null
          tournament_format?: string | null
          updated_at?: string | null
          user_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "tournament_templates_user_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id_auto"]
          },
        ]
      }
      tournaments: {
        Row: {
          added_money: number | null
          archived_at: string | null
          archived_by: number | null
          bracket_source: string
          calcutta: boolean
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: number | null
          chip_ranges: Json | null
          completed_at: string | null
          contact_name: string | null
          created_at: string | null
          current_round: number
          description: string | null
          description_es: string | null
          director_id: number
          entry_fee: number | null
          equipment: string | null
          external_bracket_url: string | null
          game_spot: string | null
          game_type: string
          id: number
          is_draft: boolean
          is_hidden: boolean
          is_paused: boolean
          is_recurring: boolean | null
          live_settings: Json
          live_state: string
          max_fargo: number | null
          name: string
          number_of_tables: number | null
          online_registration_cap_pct: number
          open_tournament: boolean | null
          parent_template_id: number | null
          paused_at: string | null
          payout_config: Json | null
          phone_number: string | null
          player_cap: number | null
          preregistration_enabled: boolean
          race: string | null
          recurrence_type: string | null
          registration_closes_at: string | null
          registration_opens_at: string | null
          reports_to_fargo: boolean | null
          required_fargo_games: number | null
          side_pots: Json | null
          start_time: string
          status: string | null
          table_size: string | null
          template_id: number | null
          thumbnail: string | null
          timezone: string | null
          tournament_date: string
          tournament_format: string
          updated_at: string | null
          venue_id: number
        }
        Insert: {
          added_money?: number | null
          archived_at?: string | null
          archived_by?: number | null
          bracket_source?: string
          calcutta?: boolean
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: number | null
          chip_ranges?: Json | null
          completed_at?: string | null
          contact_name?: string | null
          created_at?: string | null
          current_round?: number
          description?: string | null
          description_es?: string | null
          director_id: number
          entry_fee?: number | null
          equipment?: string | null
          external_bracket_url?: string | null
          game_spot?: string | null
          game_type: string
          id?: number
          is_draft?: boolean
          is_hidden?: boolean
          is_paused?: boolean
          is_recurring?: boolean | null
          live_settings?: Json
          live_state?: string
          max_fargo?: number | null
          name: string
          number_of_tables?: number | null
          online_registration_cap_pct?: number
          open_tournament?: boolean | null
          parent_template_id?: number | null
          paused_at?: string | null
          payout_config?: Json | null
          phone_number?: string | null
          player_cap?: number | null
          preregistration_enabled?: boolean
          race?: string | null
          recurrence_type?: string | null
          registration_closes_at?: string | null
          registration_opens_at?: string | null
          reports_to_fargo?: boolean | null
          required_fargo_games?: number | null
          side_pots?: Json | null
          start_time: string
          status?: string | null
          table_size?: string | null
          template_id?: number | null
          thumbnail?: string | null
          timezone?: string | null
          tournament_date: string
          tournament_format: string
          updated_at?: string | null
          venue_id: number
        }
        Update: {
          added_money?: number | null
          archived_at?: string | null
          archived_by?: number | null
          bracket_source?: string
          calcutta?: boolean
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: number | null
          chip_ranges?: Json | null
          completed_at?: string | null
          contact_name?: string | null
          created_at?: string | null
          current_round?: number
          description?: string | null
          description_es?: string | null
          director_id?: number
          entry_fee?: number | null
          equipment?: string | null
          external_bracket_url?: string | null
          game_spot?: string | null
          game_type?: string
          id?: number
          is_draft?: boolean
          is_hidden?: boolean
          is_paused?: boolean
          is_recurring?: boolean | null
          live_settings?: Json
          live_state?: string
          max_fargo?: number | null
          name?: string
          number_of_tables?: number | null
          online_registration_cap_pct?: number
          open_tournament?: boolean | null
          parent_template_id?: number | null
          paused_at?: string | null
          payout_config?: Json | null
          phone_number?: string | null
          player_cap?: number | null
          preregistration_enabled?: boolean
          race?: string | null
          recurrence_type?: string | null
          registration_closes_at?: string | null
          registration_opens_at?: string | null
          reports_to_fargo?: boolean | null
          required_fargo_games?: number | null
          side_pots?: Json | null
          start_time?: string
          status?: string | null
          table_size?: string | null
          template_id?: number | null
          thumbnail?: string | null
          timezone?: string | null
          tournament_date?: string
          tournament_format?: string
          updated_at?: string | null
          venue_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "tournaments_archived_by_fkey"
            columns: ["archived_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id_auto"]
          },
          {
            foreignKeyName: "tournaments_cancelled_by_fkey"
            columns: ["cancelled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id_auto"]
          },
          {
            foreignKeyName: "tournaments_director_id_fkey"
            columns: ["director_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id_auto"]
          },
          {
            foreignKeyName: "tournaments_parent_template_id_fkey"
            columns: ["parent_template_id"]
            isOneToOne: false
            referencedRelation: "tournament_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournaments_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "tournament_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournaments_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_audits: {
        Row: {
          audit_type: string
          brands: string[] | null
          completed_at: string | null
          created_at: string | null
          has_leagues: boolean | null
          has_tournaments: boolean | null
          id: number
          notes: string | null
          owner_id: number | null
          table_count: number | null
          venue_id: number | null
          website: string | null
        }
        Insert: {
          audit_type?: string
          brands?: string[] | null
          completed_at?: string | null
          created_at?: string | null
          has_leagues?: boolean | null
          has_tournaments?: boolean | null
          id?: number
          notes?: string | null
          owner_id?: number | null
          table_count?: number | null
          venue_id?: number | null
          website?: string | null
        }
        Update: {
          audit_type?: string
          brands?: string[] | null
          completed_at?: string | null
          created_at?: string | null
          has_leagues?: boolean | null
          has_tournaments?: boolean | null
          id?: number
          notes?: string | null
          owner_id?: number | null
          table_count?: number | null
          venue_id?: number | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "venue_audits_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id_auto"]
          },
          {
            foreignKeyName: "venue_audits_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_directors: {
        Row: {
          archived_at: string | null
          archived_by: number | null
          assigned_at: string | null
          assigned_by: number | null
          director_id: number
          id: number
          venue_id: number
        }
        Insert: {
          archived_at?: string | null
          archived_by?: number | null
          assigned_at?: string | null
          assigned_by?: number | null
          director_id: number
          id?: number
          venue_id: number
        }
        Update: {
          archived_at?: string | null
          archived_by?: number | null
          assigned_at?: string | null
          assigned_by?: number | null
          director_id?: number
          id?: number
          venue_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "venue_directors_archived_by_fkey"
            columns: ["archived_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id_auto"]
          },
          {
            foreignKeyName: "venue_directors_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id_auto"]
          },
          {
            foreignKeyName: "venue_directors_director_id_fkey"
            columns: ["director_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id_auto"]
          },
          {
            foreignKeyName: "venue_directors_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_owners: {
        Row: {
          archived_at: string | null
          archived_by: number | null
          assigned_at: string | null
          assigned_by: number | null
          id: number
          is_primary: boolean | null
          owner_id: number
          venue_id: number
        }
        Insert: {
          archived_at?: string | null
          archived_by?: number | null
          assigned_at?: string | null
          assigned_by?: number | null
          id?: number
          is_primary?: boolean | null
          owner_id: number
          venue_id: number
        }
        Update: {
          archived_at?: string | null
          archived_by?: number | null
          assigned_at?: string | null
          assigned_by?: number | null
          id?: number
          is_primary?: boolean | null
          owner_id?: number
          venue_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "venue_owners_archived_by_fkey"
            columns: ["archived_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id_auto"]
          },
          {
            foreignKeyName: "venue_owners_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id_auto"]
          },
          {
            foreignKeyName: "venue_owners_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id_auto"]
          },
          {
            foreignKeyName: "venue_owners_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_staging: {
        Row: {
          "Additional notes": string | null
          address: string | null
          city: string | null
          created_at: string | null
          flyer_url: string | null
          google_place_id: string | null
          id: number
          latitude: number | null
          longitude: number | null
          notes: string | null
          num_tables: number | null
          phone: string | null
          state: string | null
          status: string
          table_brands: string | null
          table_sizes: string | null
          updated_at: string | null
          venue: string | null
          website: string | null
          zip_code: string | null
        }
        Insert: {
          "Additional notes"?: string | null
          address?: string | null
          city?: string | null
          created_at?: string | null
          flyer_url?: string | null
          google_place_id?: string | null
          id?: number
          latitude?: number | null
          longitude?: number | null
          notes?: string | null
          num_tables?: number | null
          phone?: string | null
          state?: string | null
          status?: string
          table_brands?: string | null
          table_sizes?: string | null
          updated_at?: string | null
          venue?: string | null
          website?: string | null
          zip_code?: string | null
        }
        Update: {
          "Additional notes"?: string | null
          address?: string | null
          city?: string | null
          created_at?: string | null
          flyer_url?: string | null
          google_place_id?: string | null
          id?: number
          latitude?: number | null
          longitude?: number | null
          notes?: string | null
          num_tables?: number | null
          phone?: string | null
          state?: string | null
          status?: string
          table_brands?: string | null
          table_sizes?: string | null
          updated_at?: string | null
          venue?: string | null
          website?: string | null
          zip_code?: string | null
        }
        Relationships: []
      }
      venue_subscriptions: {
        Row: {
          cancel_at_period_end: boolean | null
          created_at: string | null
          current_period_end: string | null
          current_period_start: string | null
          founding_note: string | null
          free_until: string | null
          id: string
          plan_id: string | null
          provider_customer_id: string | null
          provider_subscription_id: string | null
          status: string
          trial_end: string | null
          trial_start: string | null
          updated_at: string | null
          venue_id: number
        }
        Insert: {
          cancel_at_period_end?: boolean | null
          created_at?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          founding_note?: string | null
          free_until?: string | null
          id?: string
          plan_id?: string | null
          provider_customer_id?: string | null
          provider_subscription_id?: string | null
          status?: string
          trial_end?: string | null
          trial_start?: string | null
          updated_at?: string | null
          venue_id: number
        }
        Update: {
          cancel_at_period_end?: boolean | null
          created_at?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          founding_note?: string | null
          free_until?: string | null
          id?: string
          plan_id?: string | null
          provider_customer_id?: string | null
          provider_subscription_id?: string | null
          status?: string
          trial_end?: string | null
          trial_start?: string | null
          updated_at?: string | null
          venue_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "venue_subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "billing_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_subscriptions_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_tables: {
        Row: {
          brand: string | null
          created_at: string | null
          custom_size: string | null
          id: number
          quantity: number | null
          table_size: string
          venue_id: number | null
        }
        Insert: {
          brand?: string | null
          created_at?: string | null
          custom_size?: string | null
          id?: number
          quantity?: number | null
          table_size: string
          venue_id?: number | null
        }
        Update: {
          brand?: string | null
          created_at?: string | null
          custom_size?: string | null
          id?: number
          quantity?: number | null
          table_size?: string
          venue_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "venue_tables_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venues: {
        Row: {
          address: string
          archive_reason: string | null
          archived_at: string | null
          archived_by: number | null
          city: string
          created_at: string | null
          featured_priority: number | null
          featured_until: string | null
          google_place_id: string | null
          has_leagues: boolean | null
          has_tournaments: boolean | null
          id: number
          last_audited_at: string | null
          last_verified: string | null
          latitude: number | null
          longitude: number | null
          phone: string | null
          photo_url: string | null
          state: string
          status: string | null
          tables: Json | null
          updated_at: string | null
          venue: string
          website: string | null
          zip_code: string
        }
        Insert: {
          address: string
          archive_reason?: string | null
          archived_at?: string | null
          archived_by?: number | null
          city: string
          created_at?: string | null
          featured_priority?: number | null
          featured_until?: string | null
          google_place_id?: string | null
          has_leagues?: boolean | null
          has_tournaments?: boolean | null
          id?: number
          last_audited_at?: string | null
          last_verified?: string | null
          latitude?: number | null
          longitude?: number | null
          phone?: string | null
          photo_url?: string | null
          state: string
          status?: string | null
          tables?: Json | null
          updated_at?: string | null
          venue: string
          website?: string | null
          zip_code: string
        }
        Update: {
          address?: string
          archive_reason?: string | null
          archived_at?: string | null
          archived_by?: number | null
          city?: string
          created_at?: string | null
          featured_priority?: number | null
          featured_until?: string | null
          google_place_id?: string | null
          has_leagues?: boolean | null
          has_tournaments?: boolean | null
          id?: number
          last_audited_at?: string | null
          last_verified?: string | null
          latitude?: number | null
          longitude?: number | null
          phone?: string | null
          photo_url?: string | null
          state?: string
          status?: string | null
          tables?: Json | null
          updated_at?: string | null
          venue?: string
          website?: string | null
          zip_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "venues_archived_by_fkey"
            columns: ["archived_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id_auto"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      _recompute_team_status: {
        Args: { p_team_id: number }
        Returns: undefined
      }
      _team_caller: { Args: never; Returns: number }
      approve_registration_with_fargo: {
        Args: { p_fargo: number; p_registration_id: number }
        Returns: undefined
      }
      bar_tournament_engagement: {
        Args: { p_tournament_ids: number[] }
        Returns: {
          favorites_count: number
          tournament_id: number
          views_count: number
        }[]
      }
      cancel_team: { Args: { p_team_id: number }; Returns: undefined }
      cancel_team_partner: { Args: { p_team_id: number }; Returns: undefined }
      cleanup_old_alert_matches: {
        Args: { days_to_keep?: number }
        Returns: number
      }
      confirm_team_member_fargo: {
        Args: { p_fargo: number; p_member_id: number }
        Returns: undefined
      }
      create_conversation_with_participants: {
        Args: {
          p_category?: string
          p_created_by: string
          p_first_message?: string
          p_is_support?: boolean
          p_recipient_id?: string
          p_subject?: string
          p_tournament_id?: number
        }
        Returns: string
      }
      create_team: {
        Args: { p_captain_fargo: number; p_tournament_id: number }
        Returns: number
      }
      delete_user_account: { Args: never; Returns: undefined }
      disable_sms_alerts: { Args: never; Returns: undefined }
      enable_sms_alerts: {
        Args: { p_source: string; p_version: string }
        Returns: undefined
      }
      generate_recurring_tournaments: {
        Args: never
        Returns: {
          dates_inserted: number
          template_id: number
        }[]
      }
      get_admin_id_autos: {
        Args: never
        Returns: {
          id_auto: number
        }[]
      }
      get_admin_push_tokens: {
        Args: never
        Returns: {
          token: string
        }[]
      }
      get_auth_session: { Args: never; Returns: Json }
      get_avatar_url: { Args: { user_id: string }; Returns: string }
      get_team_invite_by_token: {
        Args: { p_token: string }
        Returns: {
          captain_fargo: number
          captain_name: string
          is_valid: boolean
          reason: string
          team_id: number
          team_status: string
          tournament_id: number
          tournament_name: string
        }[]
      }
      get_tournament_team_roster: {
        Args: { p_tid: number }
        Returns: {
          fargo_verified: boolean
          invite_status: string
          member_fargo: number
          member_id: number
          member_name: string
          player_id: number
          role: string
          team_approved: boolean
          team_checked_in: boolean
          team_chip_override: number
          team_id: number
          team_locked: boolean
          team_name: string
          team_paid: boolean
          team_paid_side_pots: string[]
          team_size: number
          team_status: string
        }[]
      }
      get_user_last_sign_in: { Args: { user_id: string }; Returns: string }
      hide_tournament_and_resolve_report: {
        Args: {
          p_admin_id: string
          p_report_id: string
          p_tournament_id: number
        }
        Returns: undefined
      }
      invite_team_partner: {
        Args: { p_method: string; p_team_id: number; p_value: string }
        Returns: number
      }
      is_chip_manager: { Args: { p_tid: number }; Returns: boolean }
      is_venue_owner: { Args: { p_venue_id: number }; Returns: boolean }
      join_team_by_token: {
        Args: { p_fargo: number; p_token: string }
        Returns: number
      }
      respond_to_team_invite: {
        Args: { p_accept: boolean; p_fargo: number; p_team_id: number }
        Returns: undefined
      }
      set_sms_phone: { Args: { p_phone: string }; Returns: undefined }
      set_team_approved: {
        Args: { p_approved: boolean; p_team_id: number }
        Returns: undefined
      }
      set_team_checked_in: {
        Args: { p_checked_in: boolean; p_team_id: number }
        Returns: undefined
      }
      set_team_chips: {
        Args: { p_chips: number; p_team_id: number }
        Returns: undefined
      }
      set_team_paid: {
        Args: { p_paid: boolean; p_team_id: number }
        Returns: undefined
      }
      set_team_side_pots: {
        Args: { p_pots: string[]; p_team_id: number }
        Returns: undefined
      }
      submit_match_state: {
        Args: { p_match_id: string; p_patch: Json; p_tournament_id: number }
        Returns: Json
      }
      td_add_team_member: {
        Args: { p_fargo: number; p_player_id: number; p_team_id: number }
        Returns: undefined
      }
      td_create_team: {
        Args: {
          p_captain_player_id: number
          p_fargo: number
          p_tournament_id: number
        }
        Returns: number
      }
      td_remove_team_member: {
        Args: { p_member_id: number }
        Returns: undefined
      }
      unlock_team: { Args: { p_team_id: number }; Returns: undefined }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
