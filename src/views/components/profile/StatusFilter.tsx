// src/views/components/profile/StatusFilter.tsx
// A compact, pill-styled tournament status filter for the profile (replaces the
// form-select dropdown). Trigger = a soft rounded pill with a colored status dot,
// label, and a secondary count; tapping opens an anchored filter menu (colored
// dots, current option highlighted) — feels like a filter, not a settings input.

import { useRef, useState } from "react";
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { COLORS } from "../../../theme/colors";
import { RADIUS, SPACING } from "../../../theme/spacing";
import { FONT_SIZES } from "../../../theme/typography";
import { moderateScale, scale } from "../../../utils/scaling";

const isWeb = Platform.OS === "web";
const wxMs = (v: number) => (isWeb ? v : moderateScale(v));
const wxSc = (v: number) => (isWeb ? v : scale(v));

const CARET = "▾";

export interface StatusFilterOption {
  key: string;
  label: string;
  count: number;
  color: string;
}

interface StatusFilterProps {
  options: StatusFilterOption[];
  value: string;
  onChange: (key: string) => void;
}

export const StatusFilter = ({ options, value, onChange }: StatusFilterProps) => {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<{ x: number; y: number; w: number; h: number } | null>(
    null,
  );
  const ref = useRef<View>(null);
  const current = options.find((o) => o.key === value) ?? options[0];

  const openMenu = () => {
    const node = ref.current;
    if (!node) {
      setOpen(true);
      return;
    }
    node.measureInWindow((x, y, w, h) => {
      setAnchor({ x, y, w, h });
      setOpen(true);
    });
  };

  if (!current) return null;

  return (
    <View>
      <TouchableOpacity
        ref={ref}
        style={styles.trigger}
        activeOpacity={0.8}
        onPress={openMenu}
      >
        <View style={[styles.dot, { backgroundColor: current.color }]} />
        <Text allowFontScaling={false} style={styles.triggerLabel} numberOfLines={1}>
          {current.label}
        </Text>
        <Text allowFontScaling={false} style={styles.triggerCount}>
          {current.count}
        </Text>
        <Text allowFontScaling={false} style={styles.caret}>
          {CARET}
        </Text>
      </TouchableOpacity>

      <Modal transparent visible={open} animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          {anchor && (
            <View
              style={[
                styles.menu,
                { top: anchor.y + anchor.h + wxSc(6), left: anchor.x, width: Math.max(anchor.w, wxSc(180)) },
              ]}
            >
              {options.map((o, i) => {
                const active = o.key === value;
                return (
                  <View key={o.key}>
                    {i > 0 && <View style={styles.menuDivider} />}
                    <Pressable
                      style={({ pressed }) => [
                        styles.item,
                        active && { backgroundColor: o.color + "1A" },
                        pressed && styles.itemPressed,
                      ]}
                      onPress={() => {
                        setOpen(false);
                        onChange(o.key);
                      }}
                    >
                      <View style={[styles.dot, { backgroundColor: o.color }]} />
                      <Text
                        allowFontScaling={false}
                        style={[styles.itemLabel, active && { color: o.color }]}
                        numberOfLines={1}
                      >
                        {o.label}
                      </Text>
                      <Text allowFontScaling={false} style={styles.itemCount}>
                        {o.count}
                      </Text>
                    </Pressable>
                  </View>
                );
              })}
            </View>
          )}
        </Pressable>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  trigger: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: wxSc(SPACING.sm),
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.full,
    paddingHorizontal: wxSc(SPACING.md),
    paddingVertical: wxSc(SPACING.sm),
  },
  dot: { width: wxSc(8), height: wxSc(8), borderRadius: wxSc(4) },
  triggerLabel: { fontSize: wxMs(FONT_SIZES.sm), fontWeight: "800", color: COLORS.text },
  triggerCount: {
    fontSize: wxMs(FONT_SIZES.xs),
    fontWeight: "700",
    color: COLORS.textMuted,
    fontVariant: ["tabular-nums"],
  },
  caret: { fontSize: wxMs(FONT_SIZES.xs), color: COLORS.textMuted, fontWeight: "900", marginLeft: wxSc(2) },

  backdrop: { flex: 1, backgroundColor: Platform.OS === "web" ? "transparent" : "rgba(0,0,0,0.12)" },
  menu: {
    position: "absolute",
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: wxSc(SPACING.xs),
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 12,
  },
  menuDivider: { height: 1, backgroundColor: COLORS.border, marginHorizontal: wxSc(SPACING.sm) },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: wxSc(SPACING.sm),
    paddingVertical: wxSc(SPACING.sm),
    paddingHorizontal: wxSc(SPACING.md),
  },
  itemPressed: { backgroundColor: COLORS.background },
  itemLabel: { flex: 1, fontSize: wxMs(FONT_SIZES.md), fontWeight: "600", color: COLORS.text },
  itemCount: {
    fontSize: wxMs(FONT_SIZES.sm),
    fontWeight: "700",
    color: COLORS.textMuted,
    fontVariant: ["tabular-nums"],
  },
});
