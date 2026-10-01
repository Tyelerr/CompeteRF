// src/views/screens/legal/giveaway-rules.screen.tsx
// Public Official Giveaway Rules page (/legal/giveaway-rules) — the same single source the in-app
// giveaway modals render, in its general form (every entry method and end condition). Linked from
// the Refer Friends and Giveaway Entries cards; ?section=<id> scrolls to that section
// (e.g. ?section=referrals, ?section=entries).

import { Stack, useRouter } from "expo-router";
import Head from "expo-router/head";
import React, { useCallback, useRef } from "react";
import { Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import {
  GIVEAWAY_RULES_LAST_UPDATED,
  GIVEAWAY_RULES_TITLE,
  GiveawayRulesSectionId,
} from "../../../models/constants/giveaway-rules";
import { COLORS } from "../../../theme/colors";
import { SPACING } from "../../../theme/spacing";
import { FONT_SIZES } from "../../../theme/typography";
import { webMs, webSc } from "../../../utils/scaling";
import { GiveawayRulesContent } from "../../components/giveaway/GiveawayRulesContent";

const isWeb = Platform.OS === "web";
const PAGE_MAX_WIDTH = 860;

export function GiveawayRulesScreen({ section }: { section?: string }) {
  const router = useRouter();
  const scrollRef = useRef<ScrollView>(null);
  const contentTop = useRef(0);
  const scrolled = useRef(false);

  const handleSectionLayout = useCallback(
    (id: GiveawayRulesSectionId, y: number) => {
      if (scrolled.current || id !== section) return;
      scrolled.current = true;
      // Children report layout before their parent: wait for contentTop, then scroll. The content
      // container's top padding (not added here) leaves breathing room above the heading.
      setTimeout(() => scrollRef.current?.scrollTo({ y: Math.max(0, contentTop.current + y), animated: false }), 50);
    },
    [section],
  );

  return (
    <>
      <Stack.Screen options={{ title: "Giveaway Rules" }} />
      {isWeb ? (
        <Head>
          <title>{`${GIVEAWAY_RULES_TITLE} | Compete`}</title>
          <meta name="description" content="Official rules for giveaways in the Compete app, including Giveaway Entries and referral rewards." />
        </Head>
      ) : null}
      <ScrollView
        ref={scrollRef}
        style={st.scroll}
        contentContainerStyle={[st.scrollContent, isWeb && st.scrollContentWeb]}
        showsVerticalScrollIndicator={false}
      >
        <View style={isWeb ? st.webInner : undefined}>
          <Text allowFontScaling={false} style={st.title}>{GIVEAWAY_RULES_TITLE}</Text>
          <Text allowFontScaling={false} style={st.updated}>Last updated: {GIVEAWAY_RULES_LAST_UPDATED}</Text>
          <Text allowFontScaling={false} style={st.note}>
            Each giveaway listing in the Compete app shows its entry method, entry limit, and how it ends. Any
            additional rules for a specific giveaway are shown with that giveaway.
          </Text>
          <View onLayout={(e) => { contentTop.current = e.nativeEvent.layout.y; }}>
            <GiveawayRulesContent giveaway={null} onSectionLayout={section ? handleSectionLayout : undefined} />
          </View>
          <View style={st.footer}>
            <Text allowFontScaling={false} style={st.footerLink} onPress={() => router.push("/legal/terms")}>Terms of Service</Text>
            <Text allowFontScaling={false} style={st.footerDot}>{"·"}</Text>
            <Text allowFontScaling={false} style={st.footerLink} onPress={() => router.push("/legal/privacy")}>Privacy Policy</Text>
          </View>
        </View>
      </ScrollView>
    </>
  );
}

const st = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: COLORS.background },
  scrollContent: { padding: webSc(SPACING.lg), paddingBottom: webSc(SPACING.xl) * 2 },
  scrollContentWeb: { alignItems: "center" },
  webInner: { width: "100%" as any, maxWidth: PAGE_MAX_WIDTH },
  title: { color: COLORS.text, fontSize: webMs(FONT_SIZES.xxl), fontWeight: "700", marginBottom: webSc(SPACING.xs) },
  updated: { color: COLORS.textMuted, fontSize: webMs(FONT_SIZES.xs), marginBottom: webSc(SPACING.md) },
  note: { color: COLORS.textSecondary, fontSize: webMs(FONT_SIZES.sm), lineHeight: webMs(FONT_SIZES.sm) + 8, marginBottom: webSc(SPACING.lg) },
  footer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: webSc(SPACING.sm),
    marginTop: webSc(SPACING.lg),
    paddingTop: webSc(SPACING.lg),
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  footerLink: { color: COLORS.primary, fontSize: webMs(FONT_SIZES.xs) },
  footerDot: { color: COLORS.textMuted, fontSize: webMs(FONT_SIZES.xs) },
});
