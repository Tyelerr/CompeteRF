// src/views/components/giveaway/GiveawayRulesContent.tsx
// Renders the Official Giveaway Rules from the single source (buildOfficialRules) followed by the
// giveaway's own rules_text as "Additional Rules". Used by the giveaway detail modal, the entry
// modal and the public /legal/giveaway-rules page — web, iOS and Android all render this.
// Referral Rewards amounts come live from get_public_referral_terms (usePublicReferralTerms).

import React from "react";
import { LayoutChangeEvent, StyleSheet, Text, View } from "react-native";
import { GiveawayRulesSectionId } from "../../../models/constants/giveaway-rules";
import { COLORS } from "../../../theme/colors";
import { SPACING } from "../../../theme/spacing";
import { FONT_SIZES, LINE_HEIGHTS } from "../../../theme/typography";
import { buildOfficialRules, GiveawayRulesSubject, rulesShowReferralTerms } from "../../../utils/giveaway-rules";
import { webMs, webSc } from "../../../utils/scaling";
import { usePublicReferralTerms } from "../../../viewmodels/hooks/use.public.referral.terms";

interface Props {
  /** null = the public page (all entry methods and end conditions). */
  giveaway: GiveawayRulesSubject | null;
  customRulesText?: string | null;
  /** Reports each section's y offset (deep-linking on the public page). */
  onSectionLayout?: (id: GiveawayRulesSectionId, y: number) => void;
}

export function GiveawayRulesContent({ giveaway, customRulesText, onSectionLayout }: Props) {
  // Live Earning Rules for the Referral Rewards section (fetched only when that section is shown).
  const { terms } = usePublicReferralTerms(rulesShowReferralTerms(giveaway));
  const sections = buildOfficialRules(giveaway, terms);
  const extra = customRulesText?.trim();
  return (
    <View>
      {sections.map((section) => (
        <View
          key={section.id}
          nativeID={`rules-${section.id}`}
          style={st.section}
          onLayout={onSectionLayout ? (e: LayoutChangeEvent) => onSectionLayout(section.id, e.nativeEvent.layout.y) : undefined}
        >
          {section.heading ? <Text allowFontScaling={false} style={st.heading}>{section.heading}</Text> : null}
          <Text allowFontScaling={false} style={st.body}>{section.body}</Text>
        </View>
      ))}
      {extra ? (
        <View style={st.customSection}>
          <Text allowFontScaling={false} style={st.customHeading}>Additional Rules</Text>
          <Text allowFontScaling={false} style={st.body}>{extra}</Text>
        </View>
      ) : null}
    </View>
  );
}

const st = StyleSheet.create({
  section: { marginBottom: webSc(SPACING.lg) },
  heading: { color: COLORS.primary, fontSize: webMs(FONT_SIZES.md), fontWeight: "600", marginBottom: webSc(SPACING.sm) },
  body: { color: COLORS.textSecondary, fontSize: webMs(FONT_SIZES.sm), lineHeight: webMs(LINE_HEIGHTS.md) - 2 },
  customSection: {
    marginTop: webSc(SPACING.sm),
    marginBottom: webSc(SPACING.lg),
    paddingTop: webSc(SPACING.md),
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  customHeading: { color: COLORS.warning, fontSize: webMs(FONT_SIZES.md), fontWeight: "600", marginBottom: webSc(SPACING.sm) },
});
