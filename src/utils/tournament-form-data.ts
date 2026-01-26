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
  openTournament: boolean;
  entryFee: string;
  addedMoney: string;
  tournamentDate: string;
  startTime: string;
  timezone: string;
  isRecurring: boolean;
  venueId: number | null;
  phoneNumber: string;
  tableSize: string;
  equipment: string;
  numberOfTables: string;
  thumbnail: string;
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
  openTournament: false,
  entryFee: "",
  addedMoney: "",
  tournamentDate: "",
  startTime: "",
  timezone: getUserTimezone(),
  isRecurring: false,
  venueId: null,
  phoneNumber: "",
  tableSize: "",
  equipment: "",
  numberOfTables: "",
  thumbnail: "",
};

export const GAME_TYPES = [
  { label: "Select The Game Type", value: "" },
  { label: "8-Ball", value: "8-ball" },
  { label: "9-Ball", value: "9-ball" },
  { label: "10-Ball", value: "10-ball" },
  { label: "One Pocket", value: "one-pocket" },
  { label: "Straight Pool", value: "straight-pool" },
  { label: "Banks", value: "banks" },
];

export const TOURNAMENT_FORMATS = [
  { label: "Select The Format", value: "" },
  { label: "Single Elimination", value: "single-elimination" },
  { label: "Double Elimination", value: "double-elimination" },
  { label: "Round Robin", value: "round-robin" },
  { label: "Swiss", value: "swiss" },
  { label: "Modified Double Elimination", value: "modified-double" },
];

export const START_TIMES = [
  { label: "Select Start Time", value: "" },
  { label: "9:00 AM", value: "09:00" },
  { label: "9:30 AM", value: "09:30" },
  { label: "10:00 AM", value: "10:00" },
  { label: "10:30 AM", value: "10:30" },
  { label: "11:00 AM", value: "11:00" },
  { label: "11:30 AM", value: "11:30" },
  { label: "12:00 PM", value: "12:00" },
  { label: "12:30 PM", value: "12:30" },
  { label: "1:00 PM", value: "13:00" },
  { label: "1:30 PM", value: "13:30" },
  { label: "2:00 PM", value: "14:00" },
  { label: "2:30 PM", value: "14:30" },
  { label: "3:00 PM", value: "15:00" },
  { label: "3:30 PM", value: "15:30" },
  { label: "4:00 PM", value: "16:00" },
  { label: "4:30 PM", value: "16:30" },
  { label: "5:00 PM", value: "17:00" },
  { label: "5:30 PM", value: "17:30" },
  { label: "6:00 PM", value: "18:00" },
  { label: "6:30 PM", value: "18:30" },
  { label: "7:00 PM", value: "19:00" },
  { label: "7:30 PM", value: "19:30" },
  { label: "8:00 PM", value: "20:00" },
  { label: "8:30 PM", value: "20:30" },
  { label: "9:00 PM", value: "21:00" },
  { label: "9:30 PM", value: "21:30" },
  { label: "10:00 PM", value: "22:00" },
];

export const TABLE_SIZES = [
  { label: "Select Table Size", value: "" },
  { label: "7 Foot (Bar Box)", value: "7-foot" },
  { label: "8 Foot", value: "8-foot" },
  { label: "9 Foot (Pro)", value: "9-foot" },
];

export const EQUIPMENT_OPTIONS = [
  { label: "Select Equipment", value: "" },
  { label: "Diamond", value: "diamond" },
  { label: "Brunswick", value: "brunswick" },
  { label: "Olhausen", value: "olhausen" },
  { label: "Valley", value: "valley" },
  { label: "Dynamo", value: "dynamo" },
  { label: "Rasson", value: "rasson" },
  { label: "Other", value: "other" },
];

export const THUMBNAIL_OPTIONS = [
  {
    id: "8-ball",
    name: "8-Ball",
    gameType: "8-ball",
    imageUrl: "8-ball.jpeg",
  },
  {
    id: "9-ball",
    name: "9-Ball",
    gameType: "9-ball",
    imageUrl: "9-ball.jpeg",
  },
  {
    id: "10-ball",
    name: "10-Ball",
    gameType: "10-ball",
    imageUrl: "10-ball.jpeg",
  },
  {
    id: "one-pocket",
    name: "One Pocket",
    gameType: "one-pocket",
    imageUrl: null, // You'll need to upload this image
  },
  {
    id: "straight-pool",
    name: "Straight Pool",
    gameType: "straight-pool",
    imageUrl: null, // You'll need to upload this image
  },
  {
    id: "banks",
    name: "Banks",
    gameType: "banks",
    imageUrl: null, // You'll need to upload this image
  },
  {
    id: "upload-custom",
    name: "Upload Custom",
    gameType: null,
    imageUrl: null,
  },
];
