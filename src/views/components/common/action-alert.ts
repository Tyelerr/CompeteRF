// src/views/components/common/action-alert.ts
// Alert.alert for ACTION MENUS that may exceed Android's 3-button limit (src/utils/alert-pages.ts).
// iOS / web: one dialog, unchanged. Android: paged dialogs ("More…"), back/outside dismisses.
import { Alert, Platform } from "react-native";
import { AlertButtonLike, paginateAlertButtons } from "../../../utils/alert-pages";

export const showActionAlert = (title: string, message: string | undefined, buttons: AlertButtonLike[]) => {
  if (Platform.OS !== "android") {
    Alert.alert(title, message, buttons);
    return;
  }
  const pages = paginateAlertButtons(buttons);
  const show = (k: number) =>
    Alert.alert(
      title,
      message,
      pages[k].map((b) => (b.text === "More…" && !b.onPress && k < pages.length - 1 ? { text: b.text, onPress: () => show(k + 1) } : b)),
      { cancelable: true },
    );
  show(0);
};
