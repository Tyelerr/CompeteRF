// src/utils/name.utils.ts
// ═══════════════════════════════════════════════════════════
// NEW FILE: Name helpers for the first_name/last_name transition
// Use these everywhere you display a user's name.
// Falls back to "name" field if first/last aren't set yet.
// ═══════════════════════════════════════════════════════════

interface NameFields {
  first_name?: string | null;
  last_name?: string | null;
  name?: string | null;
}

/**
 * Returns the full display name.
 * Prefers first_name + last_name, falls back to "name" field.
 */
export function getDisplayName(profile: NameFields | null | undefined): string {
  if (!profile) return "Unknown";

  if (profile.first_name || profile.last_name) {
    return `${profile.first_name || ""} ${profile.last_name || ""}`.trim();
  }

  return profile.name?.trim() || "Unknown";
}

/**
 * Returns just the first name for casual greetings.
 */
export function getFirstName(profile: NameFields | null | undefined): string {
  if (!profile) return "";

  if (profile.first_name) return profile.first_name;

  // Fall back to first word of "name"
  if (profile.name) return profile.name.trim().split(" ")[0];

  return "";
}

/**
 * Returns 1-2 character initials (for avatars).
 */
export function getInitials(profile: NameFields | null | undefined): string {
  if (!profile) return "?";

  if (profile.first_name && profile.last_name) {
    return `${profile.first_name[0]}${profile.last_name[0]}`.toUpperCase();
  }

  if (profile.first_name) {
    return profile.first_name[0].toUpperCase();
  }

  if (profile.name) {
    const parts = profile.name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
    }
    return parts[0][0]?.toUpperCase() || "?";
  }

  return "?";
}

/**
 * Builds the combined "name" field from first + last.
 * Used when saving to keep the legacy "name" column in sync.
 */
export function buildFullName(firstName: string, lastName: string): string {
  return `${firstName.trim()} ${lastName.trim()}`.trim();
}
