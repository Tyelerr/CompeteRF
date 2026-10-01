// src/views/screens/admin/giveaway-console/giveaway-console.parts.tsx
// Small presentational pieces shared by the web Giveaway Management pages and their modals.
import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { COLORS } from "../../../../theme/colors";
import { STATUS_TONE, consoleSt, tint } from "./giveaway-console.styles";

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  active: "Active",
  ended: "Ended",
  awarded: "Awarded",
  archived: "Archived",
  cancelled: "Cancelled",
};

/** Status pill. `status` picks the tone; `label` overrides the text (e.g. referral credit states). */
export function StatusPill({ status, label }: { status: string; label?: string }) {
  const tone = STATUS_TONE[status] ?? COLORS.textMuted;
  return (
    <View style={[consoleSt.pill, { backgroundColor: tint(tone) }]}>
      <View style={[consoleSt.pillDot, { backgroundColor: tone }]} />
      <Text allowFontScaling={false} style={[consoleSt.pillText, { color: tone }]}>
        {label ?? STATUS_LABEL[status] ?? status}
      </Text>
    </View>
  );
}

/** Toolbar dropdown (sort / filter): a ConsoleButton that opens a small popover menu below it. */
export function ConsoleSelect<T extends string | number>({
  label,
  icon,
  value,
  options,
  onChange,
  align = "right",
  menuWidth = 220,
  accessibilityLabel,
}: {
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  align?: "left" | "right";
  menuWidth?: number;
  accessibilityLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <View style={{ zIndex: open ? 50 : 1 }}>
      <ConsoleButton label={label} icon={icon} onPress={() => setOpen((o) => !o)} accessibilityLabel={accessibilityLabel ?? label} />
      {open ? (
        <>
          <Pressable style={consoleSt.menuLayer} onPress={() => setOpen(false)} accessibilityLabel="Close menu" />
          <ScrollView
            style={[consoleSt.menuBox, { top: 40, width: menuWidth, maxHeight: 360, zIndex: 901 }, align === "right" ? { right: 0 } : { left: 0 }]}
            accessibilityRole={"menu" as any}
          >
            {options.map((o) => {
              const selected = o.value === value;
              return (
                <Pressable
                  key={String(o.value)}
                  onPress={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                  accessibilityRole={"menuitem" as any}
                  style={({ hovered }: any) => [consoleSt.menuItem, hovered && consoleSt.menuItemHover]}
                >
                  <Text
                    allowFontScaling={false}
                    numberOfLines={1}
                    style={[consoleSt.menuItemText, selected && { color: COLORS.primaryLight, fontWeight: "700" }]}
                  >
                    {selected ? "✓  " : "    "}
                    {o.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </>
      ) : null}
    </View>
  );
}

/** Small icon-only button for row actions (email / call). Stops the row click. */
export function ConsoleIconButton({
  icon,
  onPress,
  accessibilityLabel,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  accessibilityLabel: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ hovered }: any) => [consoleSt.menuBtn, hovered && consoleSt.menuBtnHover]}
    >
      <Ionicons name={icon} size={16} color={COLORS.textSecondary} />
    </Pressable>
  );
}

interface ConsoleButtonProps {
  label: string;
  onPress?: () => void;
  variant?: "default" | "primary" | "danger";
  icon?: keyof typeof Ionicons.glyphMap;
  disabled?: boolean;
  busy?: boolean;
  tag?: string | null;
  accessibilityLabel?: string;
}

export function ConsoleButton({ label, onPress, variant = "default", icon, disabled, busy, tag, accessibilityLabel }: ConsoleButtonProps) {
  const primary = variant === "primary";
  const danger = variant === "danger";
  const textColor = primary ? COLORS.white : danger ? COLORS.error : COLORS.text;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || busy}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      style={({ hovered }: any) => [
        consoleSt.btn,
        primary && consoleSt.btnPrimary,
        danger && consoleSt.btnDanger,
        hovered && !disabled && (primary ? consoleSt.btnPrimaryHover : consoleSt.btnHover),
        (disabled || busy) && consoleSt.btnDisabled,
      ]}
    >
      {busy ? (
        <ActivityIndicator size="small" color={textColor} />
      ) : icon ? (
        <Ionicons name={icon} size={15} color={textColor} />
      ) : null}
      <Text allowFontScaling={false} style={[consoleSt.btnText, primary && consoleSt.btnTextPrimary, danger && consoleSt.btnTextDanger]}>
        {label}
      </Text>
      {tag ? <Text allowFontScaling={false} style={consoleSt.btnTag}>{tag}</Text> : null}
    </Pressable>
  );
}
