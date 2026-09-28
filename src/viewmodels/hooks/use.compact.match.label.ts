// src/viewmodels/hooks/use.compact.match.label.ts
// Presentation switch for the tournament-wide Chip Match # (utils/chip-match-numbers):
// web always shows the full "Match 17"; native uses the compact "M17" only on phone-width
// layouts where "Match 17" would crowd the row (portrait phones). Native tablets and
// landscape phones have the room for the full label. Numbering itself is shared.

import { Platform, useWindowDimensions } from "react-native";

const COMPACT_MAX_WIDTH = 600;

export const useCompactMatchLabel = (): boolean => {
  const { width } = useWindowDimensions();
  return Platform.OS !== "web" && width < COMPACT_MAX_WIDTH;
};
