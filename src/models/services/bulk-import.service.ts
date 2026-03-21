// â”€â”€â”€ Bulk Import Service â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// src/models/services/bulk-import.service.ts

import { supabase } from "../../lib/supabase";
import { tournamentService } from "./tournament.service";
import {
  BulkTournamentRow,
  RowValidationResult,
  VALID_FORMATS,
  VALID_GAME_TYPES,
} from "../types/bulk-import.types";
import { THUMBNAIL_OPTIONS } from "../../utils/tournament-form-data";

// â”€â”€â”€ Image Upload â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * Returns true if the thumbnail value looks like a local image filename
 * (e.g. "rusty-friday-9ball.jpg") rather than a game type slug (e.g. "9-ball").
 */
function isImageFilename(thumbnail: string | null): boolean {
  if (!thumbnail) return false;
  return /\.(jpg|jpeg|png|webp|gif)$/i.test(thumbnail);
}

/**
 * Upload a flyer image to the tournament-images bucket.
 * Accepts a local URI (from DocumentPicker) and returns the public URL.
 */
async function uploadTournamentImage(
  localUri: string,
  filename: string,
): Promise<string> {
  // Read the file as a blob via fetch â€” works on both mobile and web
  const response = await fetch(localUri);
  if (!response.ok) {
    throw new Error(`Failed to read image file: ${filename}`);
  }
  const blob = await response.blob();

  // Detect MIME type from extension
  const ext = filename.split(".").pop()?.toLowerCase() ?? "jpg";
  const mimeMap: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    gif: "image/gif",
  };
  const contentType = mimeMap[ext] ?? "image/jpeg";

  // Upload to Supabase storage under flyers/ subfolder
  const storagePath = `flyers/${filename}`;
  const { error } = await supabase.storage
    .from("tournament-images")
    .upload(storagePath, blob, {
      contentType,
      upsert: true, // overwrite if re-importing same flyer
    });

  if (error) {
    throw new Error(`Image upload failed for "${filename}": ${error.message}`);
  }

  // Return the public URL
  const { data } = supabase.storage
    .from("tournament-images")
    .getPublicUrl(storagePath);

  return data.publicUrl;
}

// â”€â”€â”€ CSV Parsing â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * Parse a CSV string into an array of BulkTournamentRow objects.
 * Handles quoted fields, empty columns, and boolean conversion.
 */
function parseCSV(fileContent: string): BulkTournamentRow[] {
  const lines = fileContent.trim().split(/\r?\n/);
  if (lines.length < 2) return [];

  // Parse header row
  const headers = parseCSVLine(lines[0]).map((h) => h.trim().toLowerCase());

  const rows: BulkTournamentRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue; // skip empty lines

    const values = parseCSVLine(line);
    const row = mapRowToObject(headers, values, i + 1); // i+1 = human-readable row number
    if (row) rows.push(row);
  }

  return rows;
}

/**
 * Parse a single CSV line, handling quoted fields with commas inside.
 */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++; // skip escaped quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  result.push(current.trim());
  return result;
}

/**
 * Map header+values into a BulkTournamentRow object.
 */
function mapRowToObject(
  headers: string[],
  values: string[],
  rowNumber: number,
): BulkTournamentRow | null {
  const get = (field: string): string => {
    const idx = headers.indexOf(field);
    return idx >= 0 && idx < values.length ? values[idx].trim() : "";
  };

  const getNum = (field: string): number | null => {
    const val = get(field);
    if (!val) return null;
    const n = parseFloat(val);
    return isNaN(n) ? null : n;
  };

  const getInt = (field: string): number | null => {
    const val = get(field);
    if (!val) return null;
    const n = parseInt(val, 10);
    return isNaN(n) ? null : n;
  };

  const getBool = (field: string): boolean => {
    const val = get(field).toLowerCase();
    return val === "true" || val === "1" || val === "yes";
  };

  const getJSON = (field: string): any | null => {
    const val = get(field);
    if (!val) return null;
    try {
      return JSON.parse(val);
    } catch {
      return null;
    }
  };

  return {
    rowNumber,
    venue_id: getInt("venue_id") ?? 0,
    director_id: getInt("director_id") ?? 0,
    name: get("name"),
    game_type: get("game_type"),
    tournament_format: get("tournament_format"),
    tournament_date: get("tournament_date"),
    start_time: get("start_time"),
    entry_fee: getNum("entry_fee"),
    added_money: getNum("added_money"),
    game_spot: get("game_spot") || null,
    race: get("race") || null,
    table_size: get("table_size") || null,
    equipment: get("equipment") || null,
    number_of_tables: getInt("number_of_tables"),
    max_fargo: getInt("max_fargo"),
    required_fargo_games: getInt("required_fargo_games"),
    reports_to_fargo: getBool("reports_to_fargo"),
    open_tournament: getBool("open_tournament"),
    calcutta: getBool("calcutta"),
    phone_number: get("phone_number") || null,
    description: get("description") || null,
    timezone: get("timezone") || "America/Phoenix",
    side_pots: getJSON("side_pots"),
    chip_ranges: getJSON("chip_ranges"),
    thumbnail: get("thumbnail") || null,
    recurring_flag: get("recurring_flag") || null,
  };
}

// â”€â”€â”€ Validation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * Validate all parsed rows against required fields and DB constraints.
 * Caches venue/profile lookups to avoid N+1 queries.
 */
async function validateRows(
  rows: BulkTournamentRow[],
): Promise<{ valid: RowValidationResult[]; errors: RowValidationResult[] }> {
  // Cache venue IDs and director IDs from the database
  const venueIds = await fetchAllVenueIds();
  const directorIds = await fetchAllDirectorIds();

  const valid: RowValidationResult[] = [];
  const errors: RowValidationResult[] = [];

  for (const row of rows) {
    const rowErrors: string[] = [];

    // â”€â”€ Required field checks â”€â”€
    if (!row.venue_id || row.venue_id === 0) {
      rowErrors.push("venue_id is required");
    } else if (!venueIds.has(row.venue_id)) {
      rowErrors.push(`venue_id ${row.venue_id} not found in database`);
    }

    if (!row.director_id || row.director_id === 0) {
      rowErrors.push("director_id is required");
    } else if (!directorIds.has(row.director_id)) {
      rowErrors.push(`director_id ${row.director_id} not found in profiles`);
    }

    if (!row.name || !row.name.trim()) {
      rowErrors.push("name is required");
    }

    if (!row.game_type) {
      rowErrors.push("game_type is required");
    } else if (!VALID_GAME_TYPES.includes(row.game_type)) {
      rowErrors.push(
        `game_type "${row.game_type}" is not valid. Must be one of: ${VALID_GAME_TYPES.join(", ")}`,
      );
    }

    if (!row.tournament_format) {
      rowErrors.push("tournament_format is required");
    } else if (!VALID_FORMATS.includes(row.tournament_format)) {
      rowErrors.push(
        `tournament_format "${row.tournament_format}" is not valid. Must be one of: ${VALID_FORMATS.join(", ")}`,
      );
    }

    if (!row.tournament_date) {
      rowErrors.push("tournament_date is required");
    } else if (!/^\d{4}-\d{2}-\d{2}$/.test(row.tournament_date)) {
      rowErrors.push(
        `tournament_date "${row.tournament_date}" must be YYYY-MM-DD format`,
      );
    } else {
      const d = new Date(row.tournament_date + "T00:00:00");
      if (isNaN(d.getTime())) {
        rowErrors.push(
          `tournament_date "${row.tournament_date}" is not a valid date`,
        );
      }
    }

    if (!row.start_time) {
      rowErrors.push("start_time is required");
    } else if (!/^\d{1,2}:\d{2}$/.test(row.start_time)) {
      rowErrors.push(
        `start_time "${row.start_time}" must be HH:MM format (24hr)`,
      );
    }

    // â”€â”€ DB constraint checks â”€â”€
    if (row.open_tournament && row.max_fargo != null) {
      rowErrors.push(
        "Cannot set max_fargo when open_tournament is TRUE (DB constraint: chk_open_vs_fargo)",
      );
    }

    if (row.max_fargo != null && row.max_fargo > 1000) {
      rowErrors.push("max_fargo must be â‰¤ 1000 (DB constraint)");
    }

    // â”€â”€ Result â”€â”€
    if (rowErrors.length === 0) {
      valid.push({ rowNumber: row.rowNumber, isValid: true, errors: [], data: row });
    } else {
      errors.push({ rowNumber: row.rowNumber, isValid: false, errors: rowErrors });
    }
  }

  return { valid, errors };
}

// â”€â”€â”€ Import â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * Import validated rows one at a time via tournamentService.createTournament().
 * If imageFiles is provided, uploads any flyer images before inserting.
 * Reports progress via callback. Skips and logs failures.
 */
async function importTournaments(
  validRows: RowValidationResult[],
  onProgress: (current: number, total: number) => void,
  imageFiles?: Map<string, string>, // filename â†’ local URI
): Promise<{ imported: number; failed: { rowNumber: number; error: string }[] }> {
  let imported = 0;
  const failed: { rowNumber: number; error: string }[] = [];
  const total = validRows.length;

  for (let i = 0; i < validRows.length; i++) {
    const row = validRows[i].data!;
    onProgress(i + 1, total);

    try {
      // Upload flyer image if thumbnail is a local filename and we have the file
      let resolvedThumbnail: string | null = row.thumbnail ?? null;
      if (
        isImageFilename(row.thumbnail ?? null) &&
        imageFiles &&
        row.thumbnail &&
        imageFiles.has(row.thumbnail as string)
      ) {
        const localUri = imageFiles.get(row.thumbnail)!;
        console.log(`ðŸ“¸ Uploading flyer image: ${row.thumbnail}`);
        resolvedThumbnail = await uploadTournamentImage(localUri, row.thumbnail as string);
        console.log(`âœ… Image uploaded: ${resolvedThumbnail}`);
      }

      const payload = buildPayload({ ...row, thumbnail: resolvedThumbnail });
      await tournamentService.createTournament(payload);
      imported++;
    } catch (err: any) {
      console.error(`âŒ Bulk import row ${row.rowNumber} failed:`, err);
      failed.push({
        rowNumber: row.rowNumber,
        error: err.message || "Unknown database error",
      });
    }
  }

  return { imported, failed };
}

// â”€â”€â”€ Payload Builder â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * Convert a BulkTournamentRow into the shape tournamentService.createTournament() expects.
 * If thumbnail is still a slug (not a URL), auto-assign from game type.
 */
function buildPayload(row: BulkTournamentRow): Record<string, any> {
  // If thumbnail is a full URL (uploaded image) use it directly.
  // If it's a slug or empty, fall back to auto-assign from game type.
  let thumbnail = row.thumbnail || null;
  if (!thumbnail || !thumbnail.startsWith("http")) {
    if (row.game_type) {
      const match = THUMBNAIL_OPTIONS?.find(
        (opt: any) =>
          opt.gameType === row.game_type ||
          (opt.gameType && row.game_type?.toLowerCase().includes(opt.gameType)),
      );
      if (match) {
        thumbnail = match.id;
      }
    }
  }

  return {
    venue_id: row.venue_id,
    director_id: row.director_id,
    name: row.name.trim(),
    game_type: row.game_type,
    tournament_format: row.tournament_format,
    tournament_date: row.tournament_date,
    start_time: row.start_time,
    timezone: row.timezone || "America/Phoenix",
    entry_fee: row.entry_fee ?? null,
    added_money: row.added_money ?? null,
    game_spot: row.game_spot || null,
    race: row.race || null,
    table_size: row.table_size || null,
    equipment: row.equipment || null,
    number_of_tables: row.number_of_tables ?? null,
    max_fargo: row.max_fargo ?? null,
    required_fargo_games: row.required_fargo_games ?? null,
    reports_to_fargo: row.reports_to_fargo ?? false,
    open_tournament: row.open_tournament ?? false,
    calcutta: row.calcutta ?? false,
    phone_number: row.phone_number || null,
    description: row.description || null,
    side_pots: row.side_pots || null,
    chip_ranges: row.chip_ranges || null,
    thumbnail,
    is_recurring: false, // Bulk import never creates recurring â€” use recurring_flag to track
    status: "active",
  };
}

// â”€â”€â”€ Database Lookups (cached) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function fetchAllVenueIds(): Promise<Set<number>> {
  const { data, error } = await supabase.from("venues").select("id");

  if (error) {
    console.error("Error fetching venues for validation:", error);
    return new Set();
  }

  return new Set((data || []).map((v: any) => v.id));
}

async function fetchAllDirectorIds(): Promise<Set<number>> {
  const { data, error } = await supabase.from("profiles").select("id_auto");

  if (error) {
    console.error("Error fetching profiles for validation:", error);
    return new Set();
  }

  return new Set((data || []).map((p: any) => p.id_auto));
}

// â”€â”€â”€ Export â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export const bulkImportService = {
  parseCSV,
  validateRows,
  importTournaments,
};







