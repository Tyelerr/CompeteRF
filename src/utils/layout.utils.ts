import { SPACING } from "../theme/spacing";

// ── Mobile two-column card layout ────────────────────────────────────────────
//
// The FlatList contentContainerStyle uses padding: SPACING.sm on mobile.
// Each card carries margin: SPACING.xs on all sides.
// For 2 columns this means horizontal space consumed is:
//
//   listPad×2  +  (cardMargin×2)×2columns  +  cardWidth×2  =  screenWidth
//
// Solving for cardWidth gives the formula below.

const MOBILE_NUM_COLUMNS = 2;
const LIST_HORIZONTAL_PADDING = SPACING.sm;   // matches styles.list padding in billiards.styles.ts
const CARD_MARGIN = SPACING.xs;               // matches card `margin` in billiards-tournament-card
const MIN_CARD_WIDTH = 140;                   // never collapse below a readable size
const IMAGE_HEIGHT_RATIO = 0.58;             // image height as a fraction of card width

export interface CardLayout {
  cardWidth: number;
  imageHeight: number;
}

export function computeMobileCardLayout(screenWidth: number): CardLayout {
  const totalListPadding = LIST_HORIZONTAL_PADDING * 2;
  const totalCardMargins = CARD_MARGIN * 2 * MOBILE_NUM_COLUMNS;
  const available = screenWidth - totalListPadding - totalCardMargins;
  const cardWidth = Math.max(Math.floor(available / MOBILE_NUM_COLUMNS), MIN_CARD_WIDTH);
  const imageHeight = Math.round(cardWidth * IMAGE_HEIGHT_RATIO);
  return { cardWidth, imageHeight };
}
