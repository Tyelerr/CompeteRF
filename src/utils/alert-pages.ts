// src/utils/alert-pages.ts
// Android's native Alert renders at most 3 buttons and silently DROPS the rest (and an
// un-cancelable dialog without a Cancel can't be dismissed). Menus with more actions are split
// into pages: up to 2 actions + "More…", the last page ending with Cancel. iOS / web show every
// button and never page. Pure — the platform wrapper is views/components/common/action-alert.ts.

export interface AlertButtonLike {
  text: string;
  style?: "default" | "cancel" | "destructive";
  onPress?: () => void;
}

export const ANDROID_ALERT_MAX_BUTTONS = 3;

// Pages to show in order; "More…" on page k opens page k+1 (the wrapper wires that).
export const paginateAlertButtons = (buttons: AlertButtonLike[], max = ANDROID_ALERT_MAX_BUTTONS): AlertButtonLike[][] => {
  if (buttons.length <= max) return [buttons];
  const cancel = buttons.find((b) => b.style === "cancel") ?? { text: "Cancel", style: "cancel" as const };
  const actions = buttons.filter((b) => b.style !== "cancel");
  const pages: AlertButtonLike[][] = [];
  let i = 0;
  while (actions.length - i > max - 1) {
    pages.push([...actions.slice(i, i + max - 1), { text: "More…" }]);
    i += max - 1;
  }
  pages.push([...actions.slice(i), cancel]);
  return pages;
};
