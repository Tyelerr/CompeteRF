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
import { COLORS } from "../../../../theme/colors";
import { RADIUS, SPACING } from "../../../../theme/spacing";
import { FONT_SIZES } from "../../../../theme/typography";
import { webMs, webSc } from "../../../../utils/scaling";

const CARET = "▾"; // ▾
const isWeb = Platform.OS === "web";

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
      {phases.map((p) => {
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
              isWeb && styles.pillWeb,
              isWeb && selected && styles.pillActiveWeb,
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
              style={[styles.caret, isWeb && styles.caretWeb, selected && styles.onPrimary, p.locked && styles.caretHidden]}
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
              ]}
            >
              {openPhase.pages.map((pg) => {
                const current = pg.key === activePageKey && openPhase.key === selectedKey;
                return (
                  <View key={pg.key}>
                    {pg.divider && <View style={styles.menuDivider} />}
                    <Pressable
                      style={({ pressed }) => [
                        styles.menuItem,
                        current && styles.menuItemActive,
                        pressed && styles.menuItemPressed,
                      ]}
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
                        style={[styles.menuLabel, current && styles.menuLabelActive]}
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
  // Web-only: present the three phases as one segmented control — a rounded track with
  // inset segments, only the active one filled. Native keeps the individual bordered pills.
  rowWeb: {
    alignSelf: "flex-start",
    // Inset the track's LEFT edge to SPACING.md so it lines up with the header title and
    // the dashboard content (which both inset md within the same WEB_MAXW shell). The md
    // must be an outer margin — not inner padding — or the track background would sit
    // flush-left of the title. Internal pad stays 4 so segments hug the track.
    marginHorizontal: SPACING.md,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.lg,
    paddingHorizontal: 4,
    paddingVertical: 4,
    gap: 4,
  },
  pillWeb: {
    flex: 0,
    minWidth: 132,
    backgroundColor: "transparent",
    borderWidth: 0,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.md,
  },
  pillActiveWeb: { backgroundColor: COLORS.primary },
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
  // Web-only: slightly larger caret, vertically centered with the label (lineHeight matches
  // fontSize so the ▾ glyph doesn't sit high/low). Native caret unchanged.
  caretWeb: { fontSize: webMs(FONT_SIZES.md), lineHeight: webMs(FONT_SIZES.md), textAlignVertical: "center" as any },
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
