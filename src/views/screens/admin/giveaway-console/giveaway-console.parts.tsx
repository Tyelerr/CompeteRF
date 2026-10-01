// src/views/screens/admin/giveaway-console/giveaway-console.parts.tsx
// Small presentational pieces shared by the web Giveaway Management console and its drawer.
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
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

export function StatusPill({ status }: { status: string }) {
  const tone = STATUS_TONE[status] ?? COLORS.textMuted;
  return (
    <View style={[consoleSt.pill, { backgroundColor: tint(tone) }]}>
      <View style={[consoleSt.pillDot, { backgroundColor: tone }]} />
      <Text allowFontScaling={false} style={[consoleSt.pillText, { color: tone }]}>
        {STATUS_LABEL[status] ?? status}
      </Text>
    </View>
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
