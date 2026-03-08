export type GameType =
  | "8-ball"
  | "8-ball-scotch-doubles"
  | "9-ball"
  | "9-ball-scotch-doubles"
  | "10-ball"
  | "10-ball-scotch-doubles"
  | "bank-pool"
  | "one-pocket"
  | "straight-pool"
  | "other";

export type TournamentFormat =
  | "single-elim"
  | "double-elim"
  | "round-robin"
  | "swiss"
  | "modified-single"
  | "chip-tournament"
  | "split-bracket"
  | "other";

export type TableSize = "7ft" | "8ft" | "9ft";

export type UserRole =
  | "basic_user"
  | "tournament_director"
  | "bar_owner"
  | "compete_admin"
  | "super_admin";

export type UserStatus = "active" | "suspended" | "banned";

export type TournamentStatus =
  | "active"
  | "cancelled"
  | "completed"
  | "archived";

export type VenueStatus = "active" | "inactive" | "archived";

export type GiveawayStatus = "active" | "ended" | "awarded" | "archived";

export type MessageType = "general" | "important" | "cancellation" | "system";

export type RecurrenceType = "weekly" | "biweekly" | "monthly";

export type Language = "en" | "es";

export interface SidePot {
  name: string;
  amount: number;
}

export interface TableInfo {
  brand: string;
  size: TableSize;
  count: number;
}

// Chip Tournament: rating range → chip count mapping
export interface ChipRange {
  minRating: number;
  maxRating: number;
  chips: number;
}
