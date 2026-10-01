// src/views/screens/admin/giveaway-console/GiveawayDetailModal.tsx
// WEB desktop read-only giveaway detail — a centered modal opened by clicking a row in the
// Giveaway Management table. Actions reuse the console's existing flows (primary action →
// Publish / End / Draw / View Winner / Restore; Participants and Edit routes). No new reads.
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Image, Text, View } from "react-native";
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
import { AdminModal, DetailRow, DetailSection } from "./AdminModal";
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

export function GiveawayDetailModal({ giveaway: g, uniqueEntrants, canManage, onClose, onPrimary, onMenu }: Props) {
  const primary = getPrimaryAction(g);
  const menu = getMenuActions(g);
  const canEdit = menu.some((a) => a.kind === "edit");
  const ends = getEndsLabel(g);
  const ratio = capacityRatio(g);
  const entries = g.entry_count ?? 0;
  const isWallet = g.entry_mode === "wallet";

  const footer = (
    <>
      <View style={{ flex: 1 }} />
      {g.status !== "draft" ? (
        <ConsoleButton label="View Participants" icon="people-outline" onPress={() => onMenu("participants", g)} />
      ) : null}
      {canManage && canEdit ? <ConsoleButton label="Edit" icon="create-outline" onPress={() => onMenu("edit", g)} /> : null}
      {primary && (canManage || primary.kind === "view_winner") ? (
        <ConsoleButton
          label={primary.label}
          variant={primary.kind === "end" ? "danger" : primary.kind === "view_winner" || primary.kind === "restore" ? "default" : "primary"}
          disabled={primary.disabled}
          onPress={() => onPrimary(primary.kind, g)}
        />
      ) : null}
      <ConsoleButton label="Close" onPress={onClose} />
    </>
  );

  return (
    <AdminModal
      title={g.name}
      subtitle={`#${g.id} · ${ENTRY_METHOD_LABEL[g.entry_mode] ?? g.entry_mode}`}
      badge={<StatusPill status={g.status} />}
      onClose={onClose}
      footer={footer}
      accessibilityLabel={`Giveaway ${g.name}`}
    >
      <View style={consoleSt.modalColumns}>
        <View style={consoleSt.modalColLeft}>
          {g.image_url ? (
            <Image source={{ uri: g.image_url }} style={consoleSt.modalImage} resizeMode="contain" />
          ) : (
            <View style={[consoleSt.modalImage, consoleSt.modalImageEmpty]}>
              <Ionicons name="gift-outline" size={40} color={COLORS.textMuted} />
            </View>
          )}
          <DetailSection title="Prize & entries">
            <DetailRow k="Prize value" v={formatMoney(g.prize_value)} />
            <DetailRow
              k="Entry method"
              v={`${ENTRY_METHOD_LABEL[g.entry_mode] ?? g.entry_mode}${isWallet && g.per_user_max ? ` · max ${g.per_user_max} per user` : ""}`}
            />
            <DetailRow
              k="Entries"
              v={
                <View>
                  <Text allowFontScaling={false} style={consoleSt.kvVal}>
                    {entries.toLocaleString()}
                    {g.max_entries ? ` / ${g.max_entries.toLocaleString()}` : ""}
                  </Text>
                  {ratio != null ? (
                    <View style={[consoleSt.bar, { width: "100%" }]}>
                      <View style={[consoleSt.barFill, ratio >= 1 && consoleSt.barFull, { width: `${ratio * 100}%` }]} />
                    </View>
                  ) : null}
                </View>
              }
            />
            <DetailRow k="Unique participants" v={uniqueEntrants == null ? "—" : uniqueEntrants.toLocaleString()} />
            <DetailRow k="Minimum age" v={`${g.min_age ?? 18}+`} />
          </DetailSection>
        </View>

        <View style={consoleSt.modalColRight}>
          <DetailSection title="Timeline">
            <DetailRow k="Created" v={formatConsoleDate(g.created_at)} />
            <DetailRow k="Published" v={g.published_at ? formatConsoleDate(g.published_at) : "Not published"} />
            <DetailRow k="Ends" v={ends.secondary && !ends.secondary.startsWith("Ended") ? `${ends.primary} (${ends.secondary})` : ends.primary} />
            {g.ended_at ? <DetailRow k="Ended" v={formatConsoleDate(g.ended_at)} /> : null}
            {g.archived_at ? <DetailRow k="Archived" v={formatConsoleDate(g.archived_at)} /> : null}
            {g.cancelled_at ? (
              <DetailRow k="Cancelled" v={`${formatConsoleDate(g.cancelled_at)}${g.cancel_reason ? ` · ${g.cancel_reason}` : ""}`} />
            ) : null}
          </DetailSection>

          {g.winner_id ? (
            <DetailSection
              title="Winner"
              right={
                g.status === "awarded" ? (
                  <ConsoleButton label="Winner details" icon="trophy-outline" onPress={() => onPrimary("view_winner", g)} />
                ) : null
              }
            >
              <DetailRow k="Name" v={g.winner_name || `Profile #${g.winner_id}`} />
              {g.winner_email ? <DetailRow k="Email" v={g.winner_email} /> : null}
              <DetailRow k="Drawn" v={formatConsoleDate(g.winner_drawn_at)} />
            </DetailSection>
          ) : null}

          <DetailSection title="Description">
            <Text allowFontScaling={false} style={consoleSt.prose} selectable>
              {g.description || "No description."}
            </Text>
          </DetailSection>

          <DetailSection title="Rules">
            <Text allowFontScaling={false} style={consoleSt.prose} selectable>
              {g.rules_text || "Uses Compete's standard Official Rules (no custom rules text)."}
            </Text>
          </DetailSection>
        </View>
      </View>
    </AdminModal>
  );
}
