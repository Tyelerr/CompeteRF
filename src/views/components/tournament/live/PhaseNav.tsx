// src/views/components/tournament/live/PhaseNav.tsx
// Lifecycle navigation: the Setup / Live / Results phase buttons ARE the nav
// dropdowns. Each phase button opens an anchored menu of that phase's pages, so
// the top-level structure stays three items no matter how many pages a phase
// grows to. Styled as navigation menus (not form selects).

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
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "../../../../theme/colors";
import { RADIUS, SPACING } from "../../../../theme/spacing";
import { FONT_SIZES } from "../../../../theme/typography";
import { webMs, webSc } from "../../../../utils/scaling";

const CARET = "▾"; // ▾
const isWeb = Platform.OS === "web";

// Web-only focus-visible: show the focus ring only for keyboard navigation, not after a
// mouse click (RN-web's Pressable `focused` fires for both). Tracks the last input modality.
let keyboardModality = false;
if (isWeb && typeof document !== "undefined") {
  document.addEventListener("keydown", () => { keyboardModality = true; }, true);
  document.addEventListener("pointerdown", () => { keyboardModality = false; }, true);
}

export interface PhaseNavPage {
  key: string;
  label: string;
  glyph?: string; // leading glyph (e.g. ✓ / ○ / ⚡)
  divider?: boolean; // draw a separator above this item
}

export interface PhaseNavPhase {
  key: string;
  label: string;
  glyph: string; // ✓ done · ● current · ⏺ live · 🔒 locked
  state: "done" | "current" | "live" | "locked";
  locked: boolean;
  pages: PhaseNavPage[];
}

interface PhaseNavProps {
  phases: PhaseNavPhase[];
  selectedKey: string; // the phase whose page is currently shown
  activePageKey: string; // current page (highlighted in the menu)
  onSelectPage: (phaseKey: string, pageKey: string) => void;
  onLockedPress: (phaseKey: string) => void;
}

type Anchor = { x: number; y: number; width: number; height: number };

export const PhaseNav = ({
  phases,
  selectedKey,
  activePageKey,
  onSelectPage,
  onLockedPress,
}: PhaseNavProps) => {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const refs = useRef<Record<string, View | null>>({});

  const open = (phase: PhaseNavPhase) => {
    if (phase.locked) {
      onLockedPress(phase.key);
      return;
    }
    const node = refs.current[phase.key];
    if (!node) {
      setAnchor(null);
      setOpenKey(phase.key);
      return;
    }
    node.measureInWindow((x, y, width, height) => {
      setAnchor({ x, y, width, height });
      setOpenKey(phase.key);
    });
  };

  const openPhase = phases.find((p) => p.key === openKey) ?? null;

  const glyphColor = (state: PhaseNavPhase["state"], selected: boolean) => {
    if (selected) return styles.onPrimary;
    if (state === "done") return styles.glyphDone;
    if (state === "live") return styles.glyphLive;
    if (state === "locked") return styles.glyphLocked;
    return styles.glyphCurrent;
  };

  return (
    <View style={[styles.row, isWeb && styles.rowWeb]}>
      {isWeb && phases.map((p, i) => {
        // Web/desktop: a segmented navigation control. The whole segment is the dropdown
        // trigger; no status glyphs; a real chevron (hidden while the phase is locked).
        const selected = p.key === selectedKey;
        const prevSelected = i > 0 && phases[i - 1].key === selectedKey;
        return (
          <View key={p.key} style={styles.segmentWrap}>
            {i > 0 && (
              <View style={[styles.segDivider, (selected || prevSelected) && styles.segDividerHidden]} />
            )}
            <Pressable
              ref={(r) => {
                refs.current[p.key] = r as unknown as View | null;
              }}
              accessibilityRole="button"
              accessibilityLabel={`${p.label} menu`}
              accessibilityState={{ selected, disabled: p.locked, expanded: openKey === p.key }}
              onPress={() => open(p)}
              style={(state) => {
                const { hovered, focused, pressed } = state as typeof state & { hovered?: boolean; focused?: boolean };
                return [
                  styles.segment,
                  !selected && !p.locked && hovered && styles.segmentHover,
                  !selected && !p.locked && pressed && styles.segmentPressed,
                  selected && styles.segmentActive,
                  selected && hovered && styles.segmentActiveHover,
                  p.locked && styles.segmentLocked,
                  focused && keyboardModality && styles.segmentFocus,
                ];
              }}
            >
              <Text
                allowFontScaling={false}
                style={[styles.segLabel, selected && styles.onPrimary]}
                numberOfLines={1}
              >
                {p.label}
              </Text>
              {!p.locked && (
                <Ionicons
                  name="chevron-down"
                  size={18}
                  color={selected ? COLORS.white : COLORS.textSecondary}
                  style={styles.segChevron}
                />
              )}
            </Pressable>
          </View>
        );
      })}
      {!isWeb && phases.map((p) => {
        const selected = p.key === selectedKey;
        return (
          <TouchableOpacity
            key={p.key}
            ref={(r) => {
              refs.current[p.key] = r;
            }}
            style={[
              styles.pill,
              selected && styles.pillActive,
              p.locked && styles.pillLocked,
            ]}
            activeOpacity={0.85}
            onPress={() => open(p)}
          >
            <Text allowFontScaling={false} style={[styles.glyph, glyphColor(p.state, selected)]}>
              {p.glyph}
            </Text>
            <Text
              allowFontScaling={false}
              style={[styles.label, selected && styles.onPrimary]}
              numberOfLines={1}
            >
              {p.label}
            </Text>
            <Text
              allowFontScaling={false}
              style={[styles.caret, selected && styles.onPrimary, p.locked && styles.caretHidden]}
            >
              {CARET}
            </Text>
          </TouchableOpacity>
        );
      })}

      <Modal
        transparent
        visible={!!openKey}
        animationType="fade"
        onRequestClose={() => setOpenKey(null)}
      >
        <Pressable style={styles.backdrop} onPress={() => setOpenKey(null)}>
          {openPhase && anchor && (
            <View
              style={[
                styles.menu,
                {
                  top: anchor.y + anchor.height + webSc(4),
                  left: anchor.x,
                  minWidth: Math.max(anchor.width, webSc(190)),
                },
                isWeb && styles.menuWeb,
                isWeb && { minWidth: Math.max(anchor.width, 220) },
              ]}
            >
              {openPhase.pages.map((pg) => {
                const current = pg.key === activePageKey && openPhase.key === selectedKey;
                return (
                  <View key={pg.key}>
                    {pg.divider && <View style={styles.menuDivider} />}
                    <Pressable
                      style={(state) => {
                        const { pressed, hovered, focused } = state as typeof state & { hovered?: boolean; focused?: boolean };
                        return [
                          styles.menuItem,
                          isWeb && styles.menuItemWeb,
                          isWeb && !current && hovered && styles.menuItemHoverWeb,
                          current && styles.menuItemActive,
                          isWeb && current && styles.menuItemActiveWeb,
                          pressed && styles.menuItemPressed,
                          isWeb && focused && keyboardModality && styles.menuItemFocusWeb,
                        ];
                      }}
                      onPress={() => {
                        setOpenKey(null);
                        onSelectPage(openPhase.key, pg.key);
                      }}
                    >
                      {!!pg.glyph && (
                        <Text allowFontScaling={false} style={styles.menuGlyph}>
                          {pg.glyph}
                        </Text>
                      )}
                      <Text
                        allowFontScaling={false}
                        style={[styles.menuLabel, isWeb && styles.menuLabelWeb, current && styles.menuLabelActive]}
                        numberOfLines={1}
                      >
                        {pg.label}
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
  row: {
    flexDirection: "row",
    gap: webSc(SPACING.xs),
    paddingHorizontal: webSc(SPACING.md),
    // Web: tighter vertical padding so the dashboard starts higher; native unchanged.
    paddingTop: Platform.OS === "web" ? SPACING.xs : webSc(SPACING.sm),
    paddingBottom: Platform.OS === "web" ? SPACING.xs : webSc(SPACING.sm),
    // Match the black page body on web; keep the subtle surface bar on mobile.
    backgroundColor: Platform.OS === "web" ? COLORS.background : COLORS.surface,
  },
  // Web-only: a desktop segmented navigation control — a dark rectangular track with
  // three equal segments, subtle dividers, and the active segment filled Compete blue.
  // Native keeps the individual bordered pills below (styles.pill etc.).
  rowWeb: {
    // Stretch to the content column but cap the width so it reads as a control, not a
    // full-width bar. Left edge insets SPACING.md (outer margin) so the track lines up
    // with the header title and the dashboard content in the same WEB_MAXW shell.
    alignSelf: "stretch",
    maxWidth: 540,
    marginHorizontal: SPACING.md,
    marginVertical: SPACING.xs,
    height: 46,
    alignItems: "stretch",
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 3,
    paddingTop: 3,
    paddingBottom: 3,
    gap: 0,
  },
  segmentWrap: { flex: 1, flexDirection: "row", alignItems: "center", minWidth: 0 },
  segDivider: { width: 1, height: 20, backgroundColor: COLORS.border },
  segDividerHidden: { backgroundColor: "transparent" },
  segment: {
    flex: 1,
    alignSelf: "stretch",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderRadius: 7,
    cursor: "pointer",
    transitionProperty: "background-color, box-shadow",
    transitionDuration: "120ms",
  } as any,
  segmentHover: { backgroundColor: COLORS.backgroundCard },
  segmentPressed: { backgroundColor: COLORS.background },
  segmentActive: { backgroundColor: COLORS.primary },
  segmentActiveHover: { backgroundColor: COLORS.primaryDark },
  segmentLocked: { opacity: 0.45, cursor: "not-allowed" } as any,
  segmentFocus: {
    outlineStyle: "none",
    boxShadow: `0 0 0 2px ${COLORS.primaryLight}`,
  } as any,
  segLabel: {
    fontSize: FONT_SIZES.lg - 1,
    fontWeight: "700",
    color: COLORS.text,
    letterSpacing: 0.2,
  },
  segChevron: { marginTop: 1 },
  pill: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: webSc(SPACING.xs),
    paddingVertical: webSc(SPACING.sm),
    paddingHorizontal: webSc(SPACING.sm),
    borderRadius: webSc(RADIUS.md),
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  pillActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  pillLocked: { opacity: 0.55 },
  glyph: { fontSize: webMs(FONT_SIZES.xs), fontWeight: "900" },
  glyphDone: { color: COLORS.success },
  glyphLive: { color: COLORS.error },
  glyphLocked: { color: COLORS.textMuted },
  glyphCurrent: { color: COLORS.primary },
  onPrimary: { color: COLORS.white },
  label: { fontSize: webMs(FONT_SIZES.sm), fontWeight: "800", color: COLORS.text },
  caret: { fontSize: webMs(FONT_SIZES.xs), color: COLORS.textMuted, fontWeight: "900" },
  caretHidden: { opacity: 0 },

  backdrop: {
    flex: 1,
    backgroundColor: Platform.OS === "web" ? "transparent" : "rgba(0,0,0,0.15)",
  },
  menu: {
    position: "absolute",
    backgroundColor: COLORS.surface,
    borderRadius: webSc(RADIUS.md),
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: webSc(SPACING.xs),
    maxWidth: webSc(280),
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 12,
  },
  // Web-only dropdown polish: squarer card, comfortable 42px rows, hover + focus states.
  menuWeb: {
    borderRadius: 10,
    paddingVertical: SPACING.xs + 2,
    maxWidth: 300,
    backgroundColor: COLORS.backgroundCard,
    borderColor: COLORS.borderLight,
  },
  menuItemWeb: {
    minHeight: 42,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md - 2,
    marginHorizontal: SPACING.xs + 2,
    borderRadius: 6,
    cursor: "pointer",
  } as any,
  menuItemHoverWeb: { backgroundColor: COLORS.surface },
  menuItemActiveWeb: { backgroundColor: COLORS.primary + "26" },
  menuItemFocusWeb: { outlineStyle: "none", boxShadow: `inset 0 0 0 2px ${COLORS.primaryLight}` } as any,
  menuLabelWeb: { fontSize: FONT_SIZES.md + 1 },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: webSc(SPACING.sm),
    paddingVertical: webSc(SPACING.md),
    paddingHorizontal: webSc(SPACING.md),
  },
  menuItemActive: { backgroundColor: COLORS.primary + "22" },
  menuItemPressed: { backgroundColor: COLORS.background },
  menuGlyph: {
    fontSize: webMs(FONT_SIZES.sm),
    fontWeight: "900",
    color: COLORS.textSecondary,
    width: webSc(16),
    textAlign: "center",
  },
  menuLabel: { fontSize: webMs(FONT_SIZES.md), fontWeight: "600", color: COLORS.text, flex: 1 },
  menuLabelActive: { color: COLORS.primary, fontWeight: "800" },
  menuDivider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: webSc(SPACING.xs),
    marginHorizontal: webSc(SPACING.sm),
  },
});
