import { Dimensions, Platform } from "react-native";
const BASE_WIDTH = 390;  // iPhone 14 logical width
const BASE_HEIGHT = 844; // iPhone 14 logical height
const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");
/**
 * Scales a size proportionally to screen width.
 * Use for horizontal spacing, padding, margins, icon sizes.
 */
export const scale = (size: number): number =>
  Math.round((size * SCREEN_WIDTH) / BASE_WIDTH);
/**
 * Scales a size proportionally to screen height.
 * Use for vertical spacing when height-sensitivity matters.
 */
export const verticalScale = (size: number): number =>
  Math.round((size * SCREEN_HEIGHT) / BASE_HEIGHT);
/**
 * Scales with a dampening factor so changes are subtle.
 * Use for font sizes — avoids text growing/shrinking too aggressively.
 * factor=0.5 means halfway between no scaling and full scaling.
 */
export const moderateScale = (size: number, factor = 0.5): number =>
  Math.round(size + (scale(size) - size) * factor);
/**
 * Platform-aware scale: returns raw value on web, scaled value on native.
 * IMPORTANT: Never name local aliases 'sc' or 'ms' — those names collide
 * with Metro bundler's minified internals on Hermes and cause infinite recursion.
 */
export const webSc = (v: number): number =>
  Platform.OS === "web" ? v : scale(v);
/**
 * Platform-aware moderateScale: returns raw value on web, scaled value on native.
 */
export const webMs = (v: number): number =>
  Platform.OS === "web" ? v : moderateScale(v);