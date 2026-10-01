// src/views/screens/admin/giveaway-console/GiveawayDetailDrawer.tsx
// WEB desktop read-only giveaway detail, as a right-side drawer over the console. Actions reuse
// the console's existing flows (primary action → Publish / End / Draw / View Winner / Restore
// modals; Edit and Participants routes). No new backend reads beyond what the list loaded.
import { Ionicons } from "@expo/vector-icons";
import React, { useEffect } from "react";
import { Image, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { COLORS } from "../../../../theme/colors";
import {
  ENTRY_METHOD_LABEL,
  MenuActionKind,
  PrimaryActionKind,
  capacityRatio,
  formatConsoleDate,
  formatMoney,
  getEndsLabel,
  getMenuActions,
  getPrimaryAction,
} from "../../../../utils/giveaway-console";
import { AdminGiveaway } from "../../../../viewmodels/useAdminGiveaways";
import { ConsoleButton, StatusPill } from "./giveaway-console.parts";
import { consoleSt } from "./giveaway-console.styles";

interface Props {
  giveaway: AdminGiveaway;
  uniqueEntrants: number | null;
  canManage: boolean;
  onClose: () => void;
  onPrimary: (kind: PrimaryActionKind, g: AdminGiveaway) => void;
  onMenu: (kind: MenuActionKind, g: AdminGiveaway) => void;
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={consoleSt.section}>
      <Text allowFontScaling={false} style={consoleSt.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

export function GiveawayDetailDrawer({ giveaway: g, uniqueEntrants, canManage, onClose, onPrimary, onMenu }: Props) {
  // Esc closes (web only — the drawer is web-only).
  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const primary = getPrimaryAction(g);
  const menu = getMenuActions(g);
  const canEdit = menu.some((a) => a.kind === "edit");
  const ends = getEndsLabel(g);
  const ratio = capacityRatio(g);
  const entries = g.entry_count ?? 0;
  const isWallet = g.entry_mode === "wallet";

  return (
    <View style={consoleSt.drawerLayer}>
      <Pressable style={consoleSt.drawerBackdrop} onPress={onClose} accessibilityLabel="Close details" />
      <View style={consoleSt.drawer} accessibilityRole={"dialog" as any} accessibilityLabel={`Giveaway ${g.name}`}>
        <View style={consoleSt.drawerHeader}>
          <Text allowFontScaling={false} style={consoleSt.drawerHeaderTitle}>Giveaway details</Text>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close"
            style={({ hovered }: any) => [consoleSt.menuBtn, hovered && consoleSt.menuBtnHover]}
          >
            <Ionicons name="close" size={20} color={COLORS.textSecondary} />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={consoleSt.drawerBody}>
          {g.image_url ? (
            <Image source={{ uri: g.image_url }} style={consoleSt.drawerImage} resizeMode="contain" />
          ) : null}

          <View style={{ gap: 6 }}>
            <Text allowFontScaling={false} style={consoleSt.drawerName} selectable>{g.name}</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <StatusPill status={g.status} />
              <Text allowFontScaling={false} style={consoleSt.drawerId}>#{g.id}</Text>
            </View>
          </View>

          {canManage ? (
            <View style={consoleSt.drawerActions}>
              {primary ? (
                <ConsoleButton
                  label={primary.label}
                  variant={primary.kind === "end" ? "danger" : "primary"}
                  disabled={primary.disabled}
                  onPress={() => onPrimary(primary.kind, g)}
                />
              ) : null}
              {g.status !== "draft" ? (
                <ConsoleButton label="View Entries" icon="people-outline" onPress={() => onMenu("participants", g)} />
              ) : null}
              {canEdit ? <ConsoleButton label="Edit" icon="create-outline" onPress={() => onMenu("edit", g)} /> : null}
            </View>
          ) : null}

          <Section title="Prize & entries">
            <Row k="Prize value" v={formatMoney(g.prize_value)} />
            <Row k="Entry method" v={`${ENTRY_METHOD_LABEL[g.entry_mode] ?? g.entry_mode}${isWallet && g.per_user_max ? ` · max ${g.per_user_max} per user` : ""}`} />
            <Row
              k="Entries"
              v={
                <View>
                  <Text allowFontScaling={false} style={consoleSt.kvVal}>
                    {entries.toLocaleString()}
                    {g.max_entries ? ` / ${g.max_entries.toLocaleString()}` : ""}
                  </Text>
                  {ratio != null ? (
                    <View style={[consoleSt.bar, { width: 180 }]}>
                      <View style={[consoleSt.barFill, ratio >= 1 && consoleSt.barFull, { width: `${ratio * 100}%` }]} />
                    </View>
                  ) : null}
                </View>
              }
            />
            <Row k="Unique entrants" v={uniqueEntrants == null ? "—" : uniqueEntrants.toLocaleString()} />
            <Row k="Minimum age" v={`${g.min_age ?? 18}+`} />
          </Section>

          <Section title="Timeline">
            <Row k="Created" v={formatConsoleDate(g.created_at)} />
            <Row k="Published" v={g.published_at ? formatConsoleDate(g.published_at) : "Not published"} />
            <Row k="Ends" v={ends.secondary && !ends.secondary.startsWith("Ended") ? `${ends.primary} (${ends.secondary})` : ends.primary} />
            {g.ended_at ? <Row k="Ended" v={formatConsoleDate(g.ended_at)} /> : null}
            {g.archived_at ? <Row k="Archived" v={formatConsoleDate(g.archived_at)} /> : null}
            {g.cancelled_at ? <Row k="Cancelled" v={`${formatConsoleDate(g.cancelled_at)}${g.cancel_reason ? ` · ${g.cancel_reason}` : ""}`} /> : null}
          </Section>

          {g.winner_id ? (
            <Section title="Winner">
              <Row k="Name" v={g.winner_name || `Profile #${g.winner_id}`} />
              {g.winner_email ? <Row k="Email" v={g.winner_email} /> : null}
              <Row k="Drawn" v={formatConsoleDate(g.winner_drawn_at)} />
              {g.status === "awarded" ? (
                <View style={[consoleSt.kv, { paddingBottom: 12 }]}>
                  <ConsoleButton label="Winner details & redraw" icon="trophy-outline" onPress={() => onPrimary("view_winner", g)} />
                </View>
              ) : null}
            </Section>
          ) : null}

          {g.description ? (
            <Section title="Description">
              <Text allowFontScaling={false} style={consoleSt.prose} selectable>{g.description}</Text>
            </Section>
          ) : null}

          {g.rules_text ? (
            <Section title="Additional rules">
              <Text allowFontScaling={false} style={consoleSt.prose} selectable>{g.rules_text}</Text>
            </Section>
          ) : null}
        </ScrollView>
      </View>
    </View>
  );
}
