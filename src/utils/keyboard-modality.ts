// Web-only focus-visible helper. RN-web's Pressable reports `focused` for both mouse and
// keyboard focus; desktop controls should only draw a focus ring for keyboard navigation.
// Tracks the last input modality at the document level (no-op on native).
import { Platform } from "react-native";

let keyboardModality = false;

if (Platform.OS === "web" && typeof document !== "undefined") {
  document.addEventListener("keydown", () => { keyboardModality = true; }, true);
  document.addEventListener("pointerdown", () => { keyboardModality = false; }, true);
}

export const isKeyboardModality = () => keyboardModality;
