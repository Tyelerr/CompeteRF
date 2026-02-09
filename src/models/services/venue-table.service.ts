import { supabase } from "../../lib/supabase";

export interface VenueTableRecord {
  id: number;
  venue_id: number;
  table_size: string;
  brand: string | null;
  quantity: number;
  custom_size: string | null;
  created_at: string;
}

class VenueTableService {
  /**
   * Fetch all tables configured for a venue.
   */
  async getTablesForVenue(venueId: number): Promise<VenueTableRecord[]> {
    const { data, error } = await supabase
      .from("venue_tables")
      .select("*")
      .eq("venue_id", venueId)
      .order("table_size", { ascending: true });

    if (error) throw error;
    return data || [];
  }

  /**
   * Get unique table sizes for a venue as dropdown options.
   * Returns `{ label, value }` pairs ready for a Dropdown component.
   */
  async getTableSizeOptions(
    venueId: number,
  ): Promise<{ label: string; value: string }[]> {
    const tables = await this.getTablesForVenue(venueId);

    if (tables.length === 0) return [];

    // Build unique size options with brand + quantity info in the label
    const sizeMap = new Map<string, string[]>();

    for (const table of tables) {
      const size = table.custom_size || table.table_size;
      const details: string[] = [];
      if (table.brand) details.push(table.brand);
      if (table.quantity > 1) details.push(`×${table.quantity}`);

      const existing = sizeMap.get(size) || [];
      if (details.length > 0) {
        existing.push(details.join(" "));
      }
      sizeMap.set(size, existing);
    }

    return Array.from(sizeMap.entries()).map(([size, details]) => {
      const detailStr = details.length > 0 ? ` (${details.join(", ")})` : "";
      return {
        label: `${formatTableSize(size)}${detailStr}`,
        value: size,
      };
    });
  }
}

/** Convert stored value like "7ft" to display label like "7 Foot" */
function formatTableSize(size: string): string {
  const sizeLabels: Record<string, string> = {
    "7ft": "7 Foot (Bar Box)",
    "8ft": "8 Foot",
    "9ft": "9 Foot (Pro)",
  };
  return sizeLabels[size] || size;
}

export const venueTableService = new VenueTableService();
