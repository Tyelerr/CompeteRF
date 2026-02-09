import { Tournament } from "../models/types/tournament.types";

// ─── Image URL mapping ──────────────────────────────────────────────────────

const GAME_TYPE_IMAGE_MAP: Record<string, string> = {
  "8-ball": "8-ball.jpeg",
  "9-ball": "9-ball.jpeg",
  "10-ball": "10-ball.jpeg",
  "8-ball-scotch-doubles": "8-ball.jpeg",
  "9-ball-scotch-doubles": "9-ball.jpeg",
  "10-ball-scotch-doubles": "10-ball.jpeg",
  "one-pocket": "One-Pocket.jpeg",
  "straight-pool": "Straight-Pool.jpeg",
  banks: "Banks.jpeg",
};

const TOURNAMENT_IMAGE_BASE_URL =
  "https://fnbzfgmsamegbkeyhngn.supabase.co/storage/v1/object/public/tournament-images";

/**
 * Resolve the display image URL for a tournament.
 * Priority: custom thumbnail → thumbnail game-type lookup → game_type field.
 */
export function getTournamentImageUrl(
  tournament: Tournament,
): string | null {
  if (tournament.thumbnail) {
    if (tournament.thumbnail.startsWith("custom:")) {
      return tournament.thumbnail.replace("custom:", "");
    }
    const imageFile = GAME_TYPE_IMAGE_MAP[tournament.thumbnail];
    if (imageFile) {
      return `${TOURNAMENT_IMAGE_BASE_URL}/${imageFile}`;
    }
  }

  const imageFile = GAME_TYPE_IMAGE_MAP[tournament.game_type];
  if (imageFile) {
    return `${TOURNAMENT_IMAGE_BASE_URL}/${imageFile}`;
  }

  return null;
}

// ─── Geo helpers ─────────────────────────────────────────────────────────────

/**
 * Haversine formula — returns the great-circle distance in **miles**
 * between two latitude/longitude points.
 */
export function getDistanceMiles(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 3958.8; // Earth's radius in miles
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
