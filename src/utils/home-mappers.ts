import { FeaturedBar, FeaturedPlayer } from "../models/types/home.types";

// =============================================================
// Home Screen Mappers
// Convert raw Supabase responses â†’ clean domain types.
// If the DB schema changes, update these â€” not the ViewModel.
// =============================================================

/**
 * Maps a raw Supabase featured_players row to FeaturedPlayer.
 */
export function mapToFeaturedPlayer(raw: any): FeaturedPlayer {
  return {
    id: raw.id,
    name: raw.name || raw.profiles?.name,
    user_name: raw.profiles?.user_name,
    label_about_the_person: raw.nickname,
    description: raw.bio,
    home_city: raw.location?.split(",")[0]?.trim(),
    home_state: raw.location?.split(",")[1]?.trim(),
    profile_image_url: raw.photo_url,
    fargo_rating: raw.fargo_rating,
    preferred_game: raw.preferred_game,
    years_playing: raw.years_playing,
    achievements: raw.achievements,
  };
}

/**
 * Maps a raw Supabase featured_bars row to FeaturedBar.
 */
export function mapToFeaturedBar(raw: any): FeaturedBar {
  const barLocation =
    raw.location ||
    (raw.venues ? `${raw.venues.city}, ${raw.venues.state}` : "");

  return {
    id: raw.id,
    name: raw.name || raw.venues?.venue,
    description: raw.description,
    city: barLocation.split(",")[0]?.trim(),
    state: barLocation.split(",")[1]?.trim(),
    address: raw.address || raw.venues?.address,
    phone: raw.phone,
    website: undefined,
    hours_of_operation: raw.hours_of_operation,
    photo_url: raw.photo_url,
    highlights: raw.highlights,
  };
}

