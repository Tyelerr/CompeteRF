// =============================================================
// Home Screen Domain Types
// =============================================================

export interface RSSItem {
  title: string;
  description: string;
  link: string;
  pubDate: string;
  author?: string;
}

export interface FeaturedPlayer {
  id: number;
  name?: string;
  user_name?: string;
  label_about_the_person?: string;
  description?: string;
  home_city?: string;
  home_state?: string;
  profile_image_url?: string;
  avatar_url?: string;
  preferred_game?: string;
  fargo_rating?: number;
  favorite_player?: string;
  achievements?: string[];
}

export interface FeaturedBar {
  id: number;
  name?: string;
  description?: string;
  city?: string;
  state?: string;
  address?: string;
  phone?: string;
  website?: string;
  hours_of_operation?: string;
  photo_url?: string;
  highlights?: string[];
}

export type HomeTabType = "latest" | "featured" | "bars";
