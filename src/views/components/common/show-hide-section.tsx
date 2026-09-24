// src/views/components/common/show-hide-section.tsx
// Controlled accordion section in the Profile tournament-hub style: a bordered header row with
// the title on the left and "SHOW ⌄" / "HIDE ⌃" on the right; the whole row toggles. Content
// renders directly underneath while expanded. Presentation only — the parent owns the state.
// (Same look as the Collapsible in ChipTournamentHubView; no LayoutAnimation, which is flaky
// under the New Architecture — just the chevron spin + a conditional render.)

import { ReactNode, useEffect, useState } from "react";
import { Animated, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "../../../theme/colors";
import { RADIUS, SPACING } from "../../../theme/spacing";
import { FONT_SIZES } from "../../../theme/typography";
import { moderateScale, scale } from "../../../utils/scaling";

const isWeb = Platform.OS === "web";
const shMs = (v: number) => (isWeb ? v : moderateScale(v));
const shSc = (v: number) => (isWeb ? v : scale(v));

interface Props {
  title: string;
  expanded: boolean;
  onToggle: () => void;
  /** Optional one-line teaser under the title (e.g. "$3,871 collected"). */
  summary?: string;
  children: ReactNode;
}

export function ShowHideSection({ title, expanded, onToggle, summary, children }: Props) {
  // One Animated.Value for the life of the component (lazy initial state, not a ref read in render).
  const [rot] = useState(() => new Animated.Value(expanded ? 1 : 0));

  useEffect(() => {
    Animated.timing(rot, {
      toValue: expanded ? 1 : 0,
      duration: 180,
      useNativeDriver: !isWeb,
    }).start();
  }, [expanded, rot]);

  const spin = rot.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "180deg"] });

  return (
    <View style={st.section}>
      <Pressable
        style={({ pressed }) => [st.head, pressed && st.headPressed]}
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={`${expanded ? "Collapse" : "Expand"} ${title}`}
      >
        <View style={st.titleBlock}>
          <Text allowFontScaling={false} style={st.title} numberOfLines={1}>
            {title}
          </Text>
          {summary ? (
            <Text allowFontScaling={false} style={st.summary} numberOfLines={1}>
              {summary}
            </Text>
          ) : null}
        </View>
        <View style={st.right}>
          <Text allowFontScaling={false} style={st.label}>
            {expanded ? "Hide" : "Show"}
          </Text>
          <View style={st.chevronBox}>
            <Animated.View style={{ transform: [{ rotate: spin }] }}>
              <Ionicons name="chevron-down" size={shMs(18)} color={COLORS.primarySoft} />
            </Animated.View>
          </View>
        </View>
      </Pressable>
      {expanded ? <View>{children}</View> : null}
    </View>
  );
}

const st = StyleSheet.create({
  // The header is inset like the screen's cards; content brings its own horizontal inset.
  section: { marginTop: SPACING.md },
  head: {
    marginHorizontal: SPACING.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingLeft: shSc(SPACING.md),
    paddingRight: shSc(SPACING.xs),
    paddingVertical: shSc(SPACING.xs),
    borderRadius: shSc(RADIUS.md),
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  headPressed: { backgroundColor: COLORS.primary + "1A", borderColor: COLORS.primary + "55" },
  titleBlock: { flex: 1, minWidth: 0, paddingRight: shSc(SPACING.sm) },
  title: {
    color: COLORS.sectionHeader,
    fontSize: shMs(FONT_SIZES.xs),
    fontWeight: "800",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  summary: { color: COLORS.textSecondary, fontSize: shMs(FONT_SIZES.xs), marginTop: 2 },
  right: { flexDirection: "row", alignItems: "center", gap: shSc(SPACING.xs) },
  label: {
    color: COLORS.primarySoft,
    fontSize: shMs(FONT_SIZES.xs),
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  chevronBox: { width: shSc(44), height: shSc(44), alignItems: "center", justifyContent: "center" },
});
