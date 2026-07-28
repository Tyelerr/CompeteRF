// src/views/components/admin/ActionMenu.tsx
// A compact "Actions" dropdown for manager cards: a single trigger button that
// opens an anchored menu of actions (some destructive), replacing a row of
// inline buttons. Anchored to the trigger via measureInWindow + a Modal so it
// floats above the list on both native and web.

import { useRef, useState } from "react";
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "../../../theme/colors";
import { RADIUS, SPACING } from "../../../theme/spacing";
import { FONT_SIZES } from "../../../theme/typography";
import { webMs, webSc } from "../../../utils/scaling";

export interface ActionMenuItem {
  label: string;
  onPress: () => void;
  destructive?: boolean;
  icon?: string;
  disabled?: boolean;
}

interface ActionMenuProps {
  items: ActionMenuItem[];
  label?: string; // trigger text (default "Manage")
  disabled?: boolean;
  // Compact icon-only ⋯ trigger (desktop table rows) instead of a labeled button.
  compact?: boolean;
}

const MENU_WIDTH = 200;
const MENU_MAX_HEIGHT = 320; // keep in sync with styles.menu maxHeight

export const ActionMenu = ({
  items,
  label = "Manage",
  disabled,
  compact,
}: ActionMenuProps) => {
  const triggerRef = useRef<View>(null);
  const { width: winW, height: winH } = useWindowDimensions();
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState({ x: 0, y: 0, w: 0, h: 0 });

  const visibleItems = items.filter(Boolean);
  if (visibleItems.length === 0) return null;

  const openMenu = () => {
    triggerRef.current?.measureInWindow((x, y, w, h) => {
      setAnchor({ x, y, w, h });
      setOpen(true);
    });
  };

  // Right-align the menu to the trigger; flip above if it would overflow.
  const left = Math.max(
    SPACING.md,
    Math.min(anchor.x + anchor.w - MENU_WIDTH, winW - MENU_WIDTH - SPACING.md),
  );
  // The menu scrolls past MENU_MAX_HEIGHT, so cap the estimate at it — otherwise a
  // long list (e.g. one row per table) reads as taller than it renders and the
  // flip-up math throws the menu off the top of the screen.
  const estHeight = Math.min(
    visibleItems.length * webSc(46) + webSc(8),
    webSc(MENU_MAX_HEIGHT),
  );
  const below = anchor.y + anchor.h + 4;
  const openUp = below + estHeight > winH - webSc(40);
  const top = openUp ? Math.max(webSc(40), anchor.y - estHeight - 4) : below;

  return (
    <>
      <TouchableOpacity
        ref={triggerRef}
        style={[compact ? styles.triggerCompact : styles.trigger, disabled && styles.triggerDisabled]}
        onPress={openMenu}
        disabled={disabled}
        activeOpacity={0.7}
      >
        {compact ? (
          <Ionicons name="ellipsis-horizontal" size={webMs(18)} color={COLORS.textSecondary} />
        ) : (
          <>
            <Text allowFontScaling={false} style={styles.triggerText}>
              {label}
            </Text>
            <Text allowFontScaling={false} style={styles.triggerArrow}>
              {"▾"}
            </Text>
          </>
        )}
      </TouchableOpacity>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable style={styles.overlay} onPress={() => setOpen(false)}>
          <View
            style={[
              styles.menu,
              { position: "absolute", top, left, width: MENU_WIDTH },
            ]}
          >
            <ScrollView bounces={false} keyboardShouldPersistTaps="handled">
              {visibleItems.map((item, i) => (
                <TouchableOpacity
                  key={`${item.label}-${i}`}
                  style={[
                    styles.item,
                    i < visibleItems.length - 1 && styles.itemBorder,
                    item.disabled && styles.itemDisabled,
                  ]}
                  disabled={item.disabled}
                  onPress={() => {
                    setOpen(false);
                    // Defer so the modal closes before the action fires.
                    setTimeout(item.onPress, Platform.OS === "web" ? 0 : 120);
                  }}
                >
                  {item.icon ? (
                    <Text allowFontScaling={false} style={styles.itemIcon}>
                      {item.icon}
                    </Text>
                  ) : null}
                  <Text
                    allowFontScaling={false}
                    style={[
                      styles.itemText,
                      item.destructive && styles.itemTextDestructive,
                    ]}
                  >
                    {item.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  trigger: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.primary + "15",
    borderWidth: 1,
    borderColor: COLORS.primary,
    borderRadius: webSc(RADIUS.sm),
    paddingVertical: webSc(SPACING.sm),
    paddingHorizontal: webSc(SPACING.md),
  },
  triggerCompact: {
    width: webSc(36),
    height: webSc(36),
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: webSc(RADIUS.sm),
  },
  triggerDisabled: { opacity: 0.5 },
  triggerText: {
    fontSize: webMs(FONT_SIZES.sm),
    color: COLORS.primary,
    fontWeight: "700",
  },
  triggerArrow: {
    fontSize: webMs(FONT_SIZES.sm),
    color: COLORS.primary,
    marginLeft: webSc(SPACING.xs),
  },
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)" },
  menu: {
    backgroundColor: COLORS.surface,
    borderRadius: webSc(RADIUS.md),
    borderWidth: 1,
    borderColor: COLORS.border,
    maxHeight: webSc(MENU_MAX_HEIGHT),
    overflow: "hidden",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 12,
      },
      android: { elevation: 8 },
      default: {},
    }),
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: webSc(SPACING.md),
    paddingHorizontal: webSc(SPACING.md),
  },
  itemBorder: { borderBottomWidth: 1, borderBottomColor: COLORS.border },
  itemDisabled: { opacity: 0.4 },
  itemIcon: {
    fontSize: webMs(FONT_SIZES.md),
    marginRight: webSc(SPACING.sm),
    width: webSc(20),
  },
  itemText: { fontSize: webMs(FONT_SIZES.sm), color: COLORS.text, fontWeight: "600" },
  itemTextDestructive: { color: COLORS.error },
});
