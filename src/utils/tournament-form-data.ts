// Chip Tournament: rating range to chip count mapping
export interface ChipRange {
  label: string;
  minRating: number;
  maxRating: number;
  chips: number;
}

// -- Default chip ranges for Chip Tournament --------------------------------
export const DEFAULT_CHIP_RANGES: ChipRange[] = [
  { label: "299 & Under", minRating: 0,   maxRating: 299, chips: 8 },
  { label: "300-349",     minRating: 300, maxRating: 349, chips: 7 },
  { label: "350-399",     minRating: 350, maxRating: 399, chips: 6 },
  { label: "400-449",     minRating: 400, maxRating: 449, chips: 5 },
  { label: "450-499",     minRating: 450, maxRating: 499, chips: 4 },
  { label: "500-549",     minRating: 500, maxRating: 549, chips: 3 },
  { label: "550-599",     minRating: 550, maxRating: 599, chips: 2 },
  { label: "600 & Above", minRating: 600, maxRating: 999, chips: 1 },
];

export interface TournamentFormData {
  templateId: number | null;
  name: string;
  gameType: string;
  tournamentFormat: string;
  gameSpot: string;
  race: string;
  description: string;
  maxFargo: string;
  requiredFargoGames: string;
  reportsToFargo: boolean;
  calcutta: boolean;
  openTournament: boolean;
  entryFee: string;
  addedMoney: string;
  tournamentDate: Date | null;
  startTime: string;
  timezone: string;
  isRecurring: boolean;
  venueId: number | null;
  phoneNumber: string;
  tableSize: string;
  equipment: string;
  numberOfTables: string;
  thumbnail: string;
  recurrenceType: string;
  recurrenceDay: string;
  recurrenceWeek: string | undefined;
  seriesEndDate: Date | null;
  chipRanges: ChipRange[];
}

const getUserTimezone = (): string => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "America/New_York";
  }
};

export const initialFormData: TournamentFormData = {
  templateId: null,
  name: "",
  gameType: "",
  tournamentFormat: "",
  gameSpot: "",
  race: "",
  description: "",
  maxFargo: "",
  requiredFargoGames: "",
  reportsToFargo: false,
  calcutta: false,
  openTournament: false,
  entryFee: "",
  addedMoney: "",
  tournamentDate: null,
  startTime: "",
  timezone: getUserTimezone(),
  isRecurring: false,
  venueId: null,
  phoneNumber: "",
  tableSize: "",
  equipment: "",
  numberOfTables: "",
  thumbnail: "",
  recurrenceType: "",
  recurrenceDay: "",
  recurrenceWeek: undefined,
  seriesEndDate: null,
  chipRanges: [],
};

export const GAME_TYPES = [
  { label: "Select The Game Type", value: "" },
  { label: "8 Ball", value: "8-ball" },
  { label: "9 Ball", value: "9-ball" },
  { label: "10 Ball", value: "10-ball" },
  { label: "8 Ball Scotch Doubles", value: "8-ball-scotch-doubles" },
  { label: "9 Ball Scotch Doubles", value: "9-ball-scotch-doubles" },
  { label: "10 Ball Scotch Doubles", value: "10-ball-scotch-doubles" },
  { label: "One Pocket", value: "one-pocket" },
  { label: "Straight Pool", value: "straight-pool" },
  { label: "Banks", value: "banks" },
];

export const TOURNAMENT_FORMATS = [
  { label: "Select The Format", value: "" },
  { label: "Single Elimination", value: "single-elimination" },
  { label: "Double Elimination", value: "double-elimination" },
  { label: "Chip Tournament", value: "chip-tournament" },
  { label: "Round Robin", value: "round-robin" },
  { label: "Swiss", value: "swiss" },
  { label: "Modified Double Elimination", value: "modified-double" },
  { label: "Split Bracket", value: "split-bracket" },
];

export const START_TIMES = [
  { label: "Select Start Time", value: "" },
  { label: "9:00 AM",  value: "09:00" },
  { label: "9:30 AM",  value: "09:30" },
  { label: "10:00 AM", value: "10:00" },
  { label: "10:30 AM", value: "10:30" },
  { label: "11:00 AM", value: "11:00" },
  { label: "11:30 AM", value: "11:30" },
  { label: "12:00 PM", value: "12:00" },
  { label: "12:30 PM", value: "12:30" },
  { label: "1:00 PM",  value: "13:00" },
  { label: "1:30 PM",  value: "13:30" },
  { label: "2:00 PM",  value: "14:00" },
  { label: "2:30 PM",  value: "14:30" },
  { label: "3:00 PM",  value: "15:00" },
  { label: "3:30 PM",  value: "15:30" },
  { label: "4:00 PM",  value: "16:00" },
  { label: "4:30 PM",  value: "16:30" },
  { label: "5:00 PM",  value: "17:00" },
  { label: "5:30 PM",  value: "17:30" },
  { label: "6:00 PM",  value: "18:00" },
  { label: "6:30 PM",  value: "18:30" },
  { label: "7:00 PM",  value: "19:00" },
  { label: "7:30 PM",  value: "19:30" },
  { label: "8:00 PM",  value: "20:00" },
  { label: "8:30 PM",  value: "20:30" },
  { label: "9:00 PM",  value: "21:00" },
  { label: "9:30 PM",  value: "21:30" },
  { label: "10:00 PM", value: "22:00" },
];

export const TABLE_SIZES = [
  { label: "Select Table Size", value: "" },
  { label: "7 Foot (Bar Box)", value: "7-foot" },
  { label: "8 Foot",           value: "8-foot" },
  { label: "9 Foot (Pro)",     value: "9-foot" },
];

export const EQUIPMENT_OPTIONS = [
  { label: "Select Equipment", value: "" },
  { label: "Diamond",   value: "diamond" },
  { label: "Brunswick", value: "brunswick" },
  { label: "Olhausen",  value: "olhausen" },
  { label: "Valley",    value: "valley" },
  { label: "Dynamo",    value: "dynamo" },
  { label: "Rasson",    value: "rasson" },
  { label: "Other",     value: "other" },
];

export const THUMBNAIL_OPTIONS = [
  { id: "8-ball",        name: "8 Ball",       gameType: "8-ball",        imageUrl: "8-ball.jpeg" },
  { id: "9-ball",        name: "9 Ball",       gameType: "9-ball",        imageUrl: "9-ball.jpeg" },
  { id: "10-ball",       name: "10 Ball",      gameType: "10-ball",       imageUrl: "10-ball.jpeg" },
  { id: "one-pocket",    name: "One Pocket",   gameType: "one-pocket",    imageUrl: "One-Pocket.jpeg" },
  { id: "straight-pool", name: "Straight Pool",gameType: "straight-pool", imageUrl: "Straight-Pool.jpeg" },
  { id: "banks",         name: "Banks",        gameType: "banks",         imageUrl: "Banks.jpeg" },
  { id: "upload-custom", name: "Upload Custom",gameType: null,            imageUrl: null },
];

// ---------------------------------------------------------------------------
// Recurrence options
// NOTE: The DB check constraint on tournament_templates.recurrence_type
//       already allows 'weekly', 'biweekly', and 'monthly'.
// ---------------------------------------------------------------------------
export const RECURRENCE_TYPES = [
  { label: "Weekly (Every Week)",       value: "weekly" },
  { label: "Biweekly (Every 2 Weeks)",  value: "biweekly" },
  { label: "Monthly",                   value: "monthly" },
];

export const DAYS_OF_WEEK = [
  { label: "Monday",    value: "monday" },
  { label: "Tuesday",   value: "tuesday" },
  { label: "Wednesday", value: "wednesday" },
  { label: "Thursday",  value: "thursday" },
  { label: "Friday",    value: "friday" },
  { label: "Saturday",  value: "saturday" },
  { label: "Sunday",    value: "sunday" },
];

export const RECURRENCE_WEEKS = [
  { label: "1st Week",  value: "1" },
  { label: "2nd Week",  value: "2" },
  { label: "3rd Week",  value: "3" },
  { label: "4th Week",  value: "4" },
  { label: "Last Week", value: "last" },
];

// ---------------------------------------------------------------------------
// Recurrence label helpers
// These derive everything from the seed date so directors never have to
// configure a separate "which week" or "which day" field.
// ---------------------------------------------------------------------------

const ORDINALS = ["1st", "2nd", "3rd", "4th", "5th"];

/**
 * Returns the human-readable pattern label for the schedule preview.
 * e.g. "Every Friday", "Every other Friday", "Every 3rd Sunday"
 */
export const getRecurrencePatternLabel = (date: Date, recurrenceType: string): string => {
  const dayName = date.toLocaleDateString("en-US", { weekday: "long" });
  if (recurrenceType === "weekly")   return `Every ${dayName}`;
  if (recurrenceType === "biweekly") return `Every other ${dayName}`;
  if (recurrenceType === "monthly") {
    const nth = Math.ceil(date.getDate() / 7);
    const ord = ORDINALS[Math.min(nth - 1, 4)];
    return `Every ${ord} ${dayName}`;
  }
  return recurrenceType;
};

// ---------------------------------------------------------------------------
// Preview text (used by getRecurrencePreview in the viewmodel)
// ---------------------------------------------------------------------------
const formatTime = (time: string): string => {
  if (!time) return "[time not set]";
  const [hours, minutes] = time.split(":");
  const hour = parseInt(hours);
  const ampm = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${minutes} ${ampm}`;
};

export const getRecurrencePreviewText = (formData: TournamentFormData): string => {
  if (!formData.tournamentDate || !formData.startTime) {
    return "Select date and time first";
  }
  if (!formData.recurrenceType) {
    return "Select a frequency to see preview";
  }

  const timeStr = formatTime(formData.startTime);
  const pattern = getRecurrencePatternLabel(formData.tournamentDate, formData.recurrenceType);
  const dateStr = formData.tournamentDate.toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
  });

  return `\uD83D\uDD04 ${pattern} at ${timeStr}, starting ${dateStr}`;
};