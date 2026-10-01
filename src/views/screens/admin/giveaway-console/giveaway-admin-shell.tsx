// src/views/screens/admin/giveaway-console/giveaway-admin-shell.tsx
// WEB desktop Giveaway Management section chrome, shared by every giveaway admin page
// (Giveaways, Participants, Winners, Entry Wallet, New / Edit Giveaway) so they read as one
// admin area: same back link, title row, section nav, 1240px column and spacing.
import { useRouter } from "expo-router";
import React from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { consoleSt } from "./giveaway-console.styles";

export type GiveawayAdminSection = "giveaways" | "participants" | "winners" | "wallet";

const SECTIONS: { key: GiveawayAdminSection; label: string; route: string }[] = [
  { key: "giveaways", label: "Giveaways", route: "/(tabs)/admin/giveaway-management" },
  { key: "participants", label: "Participants", route: "/(tabs)/admin/giveaway-participants" },
  { key: "winners", label: "Winners", route: "/(tabs)/admin/giveaway-past-winners" },
  { key: "wallet", label: "Entry Wallet", route: "/(tabs)/admin/giveaway-grant-entries" },
];

export const GIVEAWAY_MANAGEMENT_ROUTE = "/(tabs)/admin/giveaway-management";

/** Section-to-section navigation: navigate (re-uses a screen already in the stack, no pile-up). */
export function useGiveawayAdminNav() {
  const router = useRouter();
  return {
    go: (route: string) => router.navigate(route as any),
    back: (fallback = GIVEAWAY_MANAGEMENT_ROUTE) =>
      router.canGoBack() ? router.back() : router.replace(fallback as any),
  };
}

interface HeaderProps {
  title: string;
  subtitle?: string | null;
  /** Section tab to highlight; omit on form pages. */
  section?: GiveawayAdminSection;
  backLabel: string;
  onBack: () => void;
  /** Right side of the title row (e.g. + New Giveaway). */
  actions?: React.ReactNode;
}

export function GiveawayAdminHeader({ title, subtitle, section, backLabel, onBack, actions }: HeaderProps) {
  const nav = useGiveawayAdminNav();
  return (
    <View>
      <Pressable onPress={onBack} style={consoleSt.backLink} accessibilityRole="link">
        <Text allowFontScaling={false} style={consoleSt.backText}>‹ {backLabel}</Text>
      </Pressable>
      <View style={[consoleSt.headerRow, section ? { marginBottom: 14 } : null]}>
        <View style={{ flex: 1, minWidth: 260 }}>
          <Text allowFontScaling={false} style={consoleSt.title} accessibilityRole="header">{title}</Text>
          {subtitle ? <Text allowFontScaling={false} style={consoleSt.subtitle}>{subtitle}</Text> : null}
        </View>
        {actions ? <View style={consoleSt.headerActions}>{actions}</View> : null}
      </View>
      {section ? (
        <View style={consoleSt.sectionNav} accessibilityRole={"tablist" as any}>
          {SECTIONS.map((s) => {
            const active = s.key === section;
            return (
              <Pressable
                key={s.key}
                onPress={() => (active ? undefined : nav.go(s.route))}
                accessibilityRole={"tab" as any}
                accessibilityState={{ selected: active }}
                style={({ hovered }: any) => [consoleSt.sectionNavItem, hovered && !active && consoleSt.sectionNavItemHover]}
              >
                <Text allowFontScaling={false} style={[consoleSt.sectionNavText, active && consoleSt.sectionNavTextActive]}>
                  {s.label}
                </Text>
                {active ? <View style={consoleSt.sectionNavBar} /> : null}
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

/** Page frame: full-height scroll, centered WEB_MAXW column. */
export function GiveawayAdminPage({ children, footer }: { children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <View style={consoleSt.page}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={consoleSt.scroll} keyboardShouldPersistTaps="handled">
        <View style={consoleSt.inner}>{children}</View>
      </ScrollView>
      {footer}
    </View>
  );
}
