import { forwardRef } from "react";
import { Platform, ScrollView, ScrollViewProps } from "react-native";

/**
 * Native keyboard-aware scroll container for the tournament setup flow.
 *
 * Replaces react-native-keyboard-aware-scroll-view, whose JS keyboard listeners
 * re-run scroll math on focus, on keyboard-hide, and on every content-size change
 * (i.e. every keystroke in a numeric field). Under the New Architecture that math
 * is unreliable and produces the reported bugs: the page jumps to the top, stays
 * shifted up after dismissal, and resets its scroll position while editing.
 *
 * How this avoids all of that WITHOUT any JS scrolling:
 *  • iOS  — `automaticallyAdjustKeyboardInsets` lets UIKit inset the scroll view
 *           for the keyboard and keep the focused input visible, then restore the
 *           inset exactly on dismiss. Scroll position is preserved and re-renders
 *           never move the view.
 *  • Android — the activity uses windowSoftInputMode="adjustResize", so the window
 *           resizes and a plain ScrollView already avoids the keyboard.
 *
 * Defaults (each overridable via props): controls stay tappable and taps on empty
 * space dismiss the keyboard (`keyboardShouldPersistTaps="handled"`), and dragging
 * the list dismisses the keyboard (`keyboardDismissMode="on-drag"`).
 */
export const KeyboardAwareScroll = forwardRef<ScrollView, ScrollViewProps>(
  ({ children, ...props }, ref) => (
    <ScrollView
      ref={ref}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
      showsVerticalScrollIndicator={false}
      {...props}
    >
      {children}
    </ScrollView>
  ),
);

KeyboardAwareScroll.displayName = "KeyboardAwareScroll";
