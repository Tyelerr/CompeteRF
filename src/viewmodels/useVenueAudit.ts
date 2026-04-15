// src/viewmodels/useVenueAudit.ts
//
// REQUIRED SUPABASE MIGRATION (run once on dev + prod):
//   create table if not exists public.venue_audits (
//     id bigserial primary key,
//     venue_id integer references venues(id),
//     owner_id integer references profiles(id_auto),
//     audit_type text not null default ''initial'',
//     website text,
//     has_leagues boolean default false,
//     has_tournaments boolean default false,
//     table_count integer default 0,
//     brands text[] default ''{}'',
//     notes text,
//     completed_at timestamptz default now(),
//     created_at timestamptz default now()
//   );
//   alter table venues add column if not exists website text;
//   alter table venues add column if not exists has_leagues boolean default false;
//   alter table venues add column if not exists has_tournaments boolean default false;

import { useCallback, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuthContext } from "../providers/AuthProvider";

const AUDIT_INTERVAL_DAYS = 180;

export interface VenueTableEntry {
  id: number;
  table_size: string;
  brand: string;
  quantity: number;
  custom_size: string;
}

export interface VenueAuditData {
  venueId: number;
  venueName: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  phone: string;
  website: string;
  hasLeagues: boolean;
  hasTournaments: boolean;
  tables: VenueTableEntry[];
  notes: string;
}

export interface VenueAuditRecord {
  id: number;
  venue_id: number;
  owner_id: number;
  audit_type: string;
  website: string | null;
  has_leagues: boolean;
  has_tournaments: boolean;
  table_count: number;
  brands: string[];
  notes: string | null;
  completed_at: string;
  venue_name: string;
  owner_name: string;
}

export const useVenueAudit = () => {
  const { profile } = useAuthContext();
  const [needsAudit, setNeedsAudit] = useState(false);
  const [auditVenues, setAuditVenues] = useState<VenueAuditData[]>([]);
  const [auditRecords, setAuditRecords] = useState<VenueAuditRecord[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);

  const checkAuditNeeded = useCallback(async () => {
    if (!profile?.id_auto) return;
    try {
      const { data: venueOwners } = await supabase
        .from("venue_owners")
        .select("venue_id, venues(id, venue, address, city, state, zip_code, phone)")
        .eq("owner_id", profile.id_auto)
        .is("archived_at", null);

      if (!venueOwners || venueOwners.length === 0) return;

      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - AUDIT_INTERVAL_DAYS);
      const venuesNeedingAudit: VenueAuditData[] = [];

      for (const vo of venueOwners) {
        const venue = (vo as any).venues;
        if (!venue) continue;

        const { data: lastAudit } = await supabase
          .from("venue_audits")
          .select("completed_at")
          .eq("venue_id", venue.id)
          .eq("owner_id", profile.id_auto)
          .order("completed_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        const isOverdue = !lastAudit || new Date(lastAudit.completed_at) < cutoff;
        if (!isOverdue) continue;

        let website = "";
        let hasLeagues = false;
        let hasTournaments = false;
        try {
          const { data: extVenue } = await supabase
            .from("venues")
            .select("website, has_leagues, has_tournaments")
            .eq("id", venue.id)
            .maybeSingle();
          if (extVenue) {
            website = extVenue.website || "";
            hasLeagues = extVenue.has_leagues ?? false;
            hasTournaments = extVenue.has_tournaments ?? false;
          }
        } catch {
          // columns not yet added
        }

        const { data: tableRows } = await supabase
          .from("venue_tables")
          .select("id, table_size, brand, quantity, custom_size")
          .eq("venue_id", venue.id)
          .order("created_at", { ascending: true });

        const tables: VenueTableEntry[] = (tableRows ?? []).map((t: any) => ({
          id: t.id,
          table_size: t.table_size || "9ft",
          brand: t.brand || "",
          quantity: Number(t.quantity) || 1,
          custom_size: t.custom_size || "",
        }));

        venuesNeedingAudit.push({
          venueId: venue.id,
          venueName: venue.venue || "",
          address: venue.address || "",
          city: venue.city || "",
          state: venue.state || "",
          zipCode: venue.zip_code || "",
          phone: venue.phone || "",
          website,
          hasLeagues,
          hasTournaments,
          tables,
          notes: "",
        });
      }

      if (venuesNeedingAudit.length > 0) {
        setAuditVenues(venuesNeedingAudit);
        setNeedsAudit(true);
      }
    } catch (err) {
      console.error("Audit check error:", err);
    }
  }, [profile?.id_auto]);

  const submitAudit = useCallback(
    async (data: VenueAuditData[]): Promise<boolean> => {
      if (!profile?.id_auto) return false;
      try {
        for (const d of data) {
          // ── Sync venue_tables ──────────────────────────────────────────────
          const { data: existingRows } = await supabase
            .from("venue_tables")
            .select("id")
            .eq("venue_id", d.venueId);

          const existingIds = new Set((existingRows || []).map((r: any) => r.id));
          const submittedIds = new Set(d.tables.filter((t) => t.id !== 0).map((t) => t.id));
          const toDelete = [...existingIds].filter((id) => !submittedIds.has(id));

          if (toDelete.length > 0) {
            await supabase.from("venue_tables").delete().in("id", toDelete);
          }

          for (const table of d.tables) {
            const payload = {
              venue_id: d.venueId,
              table_size: table.table_size,
              brand: table.brand || null,
              quantity: table.quantity,
              custom_size: table.table_size === "custom" ? table.custom_size || null : null,
            };
            if (table.id === 0) {
              await supabase.from("venue_tables").insert(payload);
            } else {
              await supabase.from("venue_tables").update(payload).eq("id", table.id);
            }
          }

          // ── Derive summary ─────────────────────────────────────────────────
          const tableCount = d.tables.reduce((sum, t) => sum + t.quantity, 0);
          const brands = [...new Set(d.tables.map((t) => t.brand).filter(Boolean))];

          // ── Record the audit ───────────────────────────────────────────────
          const { data: existing } = await supabase
            .from("venue_audits")
            .select("id")
            .eq("venue_id", d.venueId)
            .limit(1)
            .maybeSingle();

          await supabase.from("venue_audits").insert({
            venue_id: d.venueId,
            owner_id: profile.id_auto,
            audit_type: existing ? "periodic" : "initial",
            website: d.website || null,
            has_leagues: d.hasLeagues,
            has_tournaments: d.hasTournaments,
            table_count: tableCount,
            brands,
            notes: d.notes || null,
            completed_at: new Date().toISOString(),
          });

          // ── Update venue record ────────────────────────────────────────────
          await supabase
            .from("venues")
            .update({
              venue: d.venueName,
              address: d.address,
              city: d.city,
              state: d.state,
              zip_code: d.zipCode,
              ...(d.phone ? { phone: d.phone } : {}),
              ...(d.website ? { website: d.website } : {}),
              has_leagues: d.hasLeagues,
              has_tournaments: d.hasTournaments,
            })
            .eq("id", d.venueId);
        }

        setNeedsAudit(false);
        setAuditVenues([]);
        return true;
      } catch (err) {
        console.error("Audit submit error:", err);
        return false;
      }
    },
    [profile?.id_auto],
  );

  const loadAuditRecords = useCallback(async () => {
    setAuditLoading(true);
    try {
      const { data } = await supabase
        .from("venue_audits")
        .select("*")
        .order("completed_at", { ascending: false })
        .limit(200);

      if (!data) { setAuditRecords([]); return; }

      const venueIds = [...new Set(data.map((r: any) => r.venue_id))];
      const ownerIds = [...new Set(data.map((r: any) => r.owner_id))];

      const [{ data: venues }, { data: owners }] = await Promise.all([
        supabase.from("venues").select("id, venue").in("id", venueIds),
        supabase.from("profiles").select("id_auto, name").in("id_auto", ownerIds),
      ]);

      const venueMap: Record<number, string> = {};
      (venues || []).forEach((v: any) => { venueMap[v.id] = v.venue; });
      const ownerMap: Record<number, string> = {};
      (owners || []).forEach((o: any) => { ownerMap[o.id_auto] = o.name; });

      setAuditRecords(
        data.map((r: any) => ({
          ...r,
          venue_name: venueMap[r.venue_id] || "Unknown",
          owner_name: ownerMap[r.owner_id] || "Unknown",
        })),
      );
    } catch (err) {
      console.error("Load audit records error:", err);
    } finally {
      setAuditLoading(false);
    }
  }, []);

  return {
    needsAudit,
    auditVenues,
    auditRecords,
    auditLoading,
    checkAuditNeeded,
    submitAudit,
    loadAuditRecords,
  };
};