// src/views/screens/admin/giveaway-console/AdminModal.tsx
// WEB desktop centered record-detail modal for the giveaway admin area (giveaway, participant and
// winner details share it). A fixed overlay rather than an RN <Modal>, so the existing action
// modals (Publish / End / Draw / Redraw / Cancel & Refund, RN Modals portalled above everything)
// still stack on top of it. Esc or a backdrop click closes it. Web-only.
import { Ionicons } from "@expo/vector-icons";
import React, { useEffect } from "react";
import { Platform, Pressable, ScrollView, Text, View } from "react-native";
import { COLORS } from "../../../../theme/colors";
import { consoleSt } from "./giveaway-console.styles";

interface Props {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  /** Right of the title (status pill, etc.). */
  badge?: React.ReactNode;
  onClose: () => void;
  /** Sticky footer (actions). */
  footer?: React.ReactNode;
  width?: number;
  accessibilityLabel: string;
  children: React.ReactNode;
}

export function AdminModal({ title, subtitle, badge, onClose, footer, width = 960, accessibilityLabel, children }: Props) {
  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <View style={consoleSt.modalLayer}>
      <Pressable style={consoleSt.modalBackdrop} onPress={onClose} accessibilityLabel="Close details" />
      <View
        style={[consoleSt.modal, { width }]}
        accessibilityRole={"dialog" as any}
        aria-modal={true as any}
        accessibilityLabel={accessibilityLabel}
      >
        <View style={consoleSt.modalHeader}>
          <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
            {typeof title === "string" ? (
              <Text allowFontScaling={false} style={consoleSt.modalTitle} numberOfLines={2} selectable>{title}</Text>
            ) : (
              title
            )}
            {subtitle ? (
              typeof subtitle === "string" ? (
                <Text allowFontScaling={false} style={consoleSt.modalSubtitle}>{subtitle}</Text>
              ) : (
                subtitle
              )
            ) : null}
          </View>
          {badge}
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close"
            style={({ hovered }: any) => [consoleSt.menuBtn, hovered && consoleSt.menuBtnHover]}
          >
            <Ionicons name="close" size={20} color={COLORS.textSecondary} />
          </Pressable>
        </View>
        <ScrollView style={consoleSt.modalScroll} contentContainerStyle={consoleSt.modalBody}>
          {children}
        </ScrollView>
        {footer ? <View style={consoleSt.modalFooter}>{footer}</View> : null}
      </View>
    </View>
  );
}

/** Key/value row used inside the detail modals. */
export function DetailRow({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <View style={consoleSt.kv}>
      <Text allowFontScaling={false} style={consoleSt.kvKey}>{k}</Text>
      {typeof v === "string" || typeof v === "number" ? (
        <Text allowFontScaling={false} style={consoleSt.kvVal} selectable>{v}</Text>
      ) : (
        <View style={{ flex: 1 }}>{v}</View>
      )}
    </View>
  );
}

export function DetailSection({ title, children, right }: { title: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <View style={consoleSt.section}>
      <View style={consoleSt.sectionHead}>
        <Text allowFontScaling={false} style={consoleSt.sectionTitle}>{title}</Text>
        {right}
      </View>
      {children}
    </View>
  );
}
