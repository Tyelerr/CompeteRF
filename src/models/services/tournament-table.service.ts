// src/models/services/tournament-table.service.ts
// Data access for tournament_tables. Pattern mirrors registration.service.ts:
// object literal, async methods, throw on error, .maybeSingle() for optional
// reads, .select().single() after mutations to catch silent RLS failures.
//
// RLS: public SELECT; INSERT/UPDATE/DELETE restricted to the parent
// tournament's TD (director_id) + super_admin/compete_admin.

import { supabase } from "../../lib/supabase";
import {
  TournamentTable,
  TournamentTableInsert,
  TournamentTableUpdate,
} from "../types/tournament-table.types";
import { TableStatus } from "../types/common.types";

export const tournamentTableService = {
  // ---- Reads -------------------------------------------------------------

  // All tables for a tournament (Overview metrics + Tables tab).
  async getTables(tournamentId: number): Promise<TournamentTable[]> {
    const { data, error } = await supabase
      .from("tournament_tables")
      .select("*")
      .eq("tournament_id", tournamentId)
      .order("table_number", { ascending: true });
    if (error) throw error;
    return (data || []) as unknown as TournamentTable[];
  },

  // One table by id (optional record -> maybeSingle).
  async getTable(id: number): Promise<TournamentTable | null> {
    const { data, error } = await supabase
      .from("tournament_tables")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return data as unknown as TournamentTable | null;
  },

  // ---- TD-only mutations -------------------------------------------------

  async createTable(table: TournamentTableInsert): Promise<TournamentTable> {
    const { data, error } = await supabase
      .from("tournament_tables")
      .insert(table)
      .select()
      .single();
    if (error) throw error;
    return data as unknown as TournamentTable;
  },

  async updateTable(
    id: number,
    updates: TournamentTableUpdate,
  ): Promise<TournamentTable> {
    const { data, error } = await supabase
      .from("tournament_tables")
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    if (!data)
      throw new Error(
        "Table update failed - no rows modified (possible RLS block).",
      );
    return data as unknown as TournamentTable;
  },

  async setStatus(id: number, status: TableStatus): Promise<TournamentTable> {
    return tournamentTableService.updateTable(id, { status });
  },

  async deleteTable(id: number): Promise<void> {
    const { error } = await supabase
      .from("tournament_tables")
      .delete()
      .eq("id", id);
    if (error) throw error;
  },
};
