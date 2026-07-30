// src/views/components/tournament/TeamCard.tsx
// The ONE Team Card used by both the mobile roster (mode="display") and the Add
// Team modal (mode="draft"), so the saved card and the editable draft cannot drift.
//
// Extracted behavior-preservingly from chip-manage.screen's mobile card
// (renderPlayerRow / mobile tcard / tsummary / tfooter). It is PRESENTATIONAL: all
// business logic (vm writes, chip calc, verify, approve, check-in, side pots) stays
// in the caller and arrives via props/callbacks. Styles are copied verbatim from the
// screen so display mode looks identical; the desktop table is intentionally left
// untouched and still uses the screen's own renderers.
//
// display: full saved-card behavior — the caller passes the primary action node
//          (Approve/Check In/…), the Actions button, payment/check-in, side pots.
// draft:   pre-persistence editable card — Fargo editable inline, Add Player 2 /
//          Invite slot, static Payment/Check-In, footer = Cancel + (Save as Waiting
//          for Partner | Create Team). Actions that need a persisted row are hidden.

import { ReactNode } from "react";
import { Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { COLORS } from "../../../theme/colors";
import { RADIUS, SPACING } from "../../../theme/spacing";
import { FONT_SIZES } from "../../../theme/typography";
import { webMs, webSc } from "../../../utils/scaling";

const isWeb = Platform.OS === "web";

export interface TeamCardPlayerVM {
  name: string;
  idLabel?: string | null; // e.g. "Player ID #44"
  fargo: number | null;
  verified?: boolean;
  canVerify?: boolean;
  onVerify?: () => void;
  fargoEditable?: boolean; // draft (always) / display edit mode
  onChangeFargo?: (v: string) => void;
  editingRow?: boolean; // display edit mode: name editable + remove
  onChangeName?: (v: string) => void;
  onRemove?: () => void;
  removable?: boolean; // draft: show a "Change" affordance on the row
}

export interface TeamCardSidePotVM {
  name: string;
  label: string;
  entered: boolean;
  onToggle: () => void;
}

export interface TeamCardProps {
  mode: "display" | "draft";
  doubles: boolean;
  label: string; // "Team #1" | "Player #1" | "New Team"
  statusLabel: string;
  statusColor: string;
  chipsPillText: string; // "5 Chips"
  teamName?: string | null;
  onChangeTeamName?: (v: string) => void; // draft: editable team name in the card

  player1: TeamCardPlayerVM;
  player2?: TeamCardPlayerVM | null;
  showAddPartner?: boolean;
  onAddPlayer2?: () => void;
  onInvitePartner?: () => void;

  showTeamFargo?: boolean;
  teamFargo?: number;
  assignedChipsText: string; // "5" or "5 · manual"
  paid: boolean;
  checkedIn: boolean;
  onTogglePaid?: () => void; // display interactive; omit for static (draft)
  sidePots?: TeamCardSidePotVM[];

  // display edit chip override
  showChipOverride?: boolean;
  chipOverrideDefault?: string;
  chipAutoPlaceholder?: string;
  onChipOverrideEnd?: (v: string) => void;

  // footer
  readOnly?: boolean;
  actionsLabel?: string; // "Actions" | "Done"
  onActions?: () => void;
  primary?: ReactNode; // display: the caller's workflow action

  // draft footer
  onCancel?: () => void;
  onSaveWaiting?: () => void;
  onCreateTeam?: () => void;
  saving?: boolean;
}

const PlayerRow = ({ p }: { p: TeamCardPlayerVM }) => (
  <View style={styles.prow}>
    <View style={styles.pavatar}>
      <Text allowFontScaling={false} style={styles.pavatarText}>{(p.name || "?").charAt(0).toUpperCase()}</Text>
    </View>
    <View style={{ flex: 1 }}>
      {p.editingRow ? (
        <View style={styles.peditRow}>
          <TextInput
            allowFontScaling={false}
            style={[styles.peditName, { flex: 1 }]}
            value={p.name}
            onChangeText={p.onChangeName}
            placeholder="Player"
            placeholderTextColor={COLORS.textMuted}
          />
          <View style={styles.peditFargoWrap}>
            <Text allowFontScaling={false} style={styles.phash}>#</Text>
            <TextInput
              allowFontScaling={false}
              style={styles.peditFargo}
              value={p.fargo != null ? String(p.fargo) : ""}
              onChangeText={p.onChangeFargo}
              keyboardType="number-pad"
              placeholder="Fargo"
              placeholderTextColor={COLORS.textMuted}
              maxLength={4}
            />
          </View>
          {p.onRemove && (
            <TouchableOpacity style={styles.premoveBtn} onPress={p.onRemove} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text allowFontScaling={false} style={styles.premoveText}>✕</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <>
          <Text allowFontScaling={false} style={styles.pname}>{p.name || "Player"}</Text>
          {p.fargoEditable ? (
            <View style={styles.pfargoEditRow}>
              <Text allowFontScaling={false} style={styles.pmeta}>{p.idLabel ? `${p.idLabel} · ` : ""}Fargo</Text>
              <View style={styles.peditFargoWrap}>
                <TextInput
                  allowFontScaling={false}
                  style={styles.peditFargo}
                  value={p.fargo != null ? String(p.fargo) : ""}
                  onChangeText={p.onChangeFargo}
                  keyboardType="number-pad"
                  placeholder="Fargo"
                  placeholderTextColor={COLORS.textMuted}
                  maxLength={4}
                />
              </View>
            </View>
          ) : (
            <Text allowFontScaling={false} style={styles.pmeta}>{p.idLabel ? `${p.idLabel} · ` : ""}Fargo {p.fargo ?? "—"}</Text>
          )}
        </>
      )}
    </View>
    {!p.editingRow && (
      <View style={styles.pverifyCol}>
        {p.removable && p.onRemove ? (
          <TouchableOpacity style={styles.pverifyBtn} onPress={p.onRemove} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text allowFontScaling={false} style={styles.pchangeText}>Change</Text>
          </TouchableOpacity>
        ) : p.verified ? (
          <Text allowFontScaling={false} style={styles.pverified}>✓ Verified</Text>
        ) : p.canVerify && p.onVerify ? (
          <TouchableOpacity style={styles.pverifyBtn} onPress={p.onVerify} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text allowFontScaling={false} style={styles.pverifyText}>Verify</Text>
          </TouchableOpacity>
        ) : p.fargo == null ? (
          <Text allowFontScaling={false} style={styles.pneeds}>No Fargo</Text>
        ) : null}
      </View>
    )}
  </View>
);

export const TeamCard = (props: TeamCardProps) => {
  const {
    mode, doubles, label, statusLabel, statusColor, chipsPillText, teamName, onChangeTeamName,
    player1, player2, showAddPartner, onAddPlayer2, onInvitePartner,
    showTeamFargo, teamFargo, assignedChipsText, paid, checkedIn, onTogglePaid, sidePots,
    showChipOverride, chipOverrideDefault, chipAutoPlaceholder, onChipOverrideEnd,
    readOnly, actionsLabel, onActions, primary,
    onCancel, onSaveWaiting, onCreateTeam, saving,
  } = props;
  const isDraft = mode === "draft";

  return (
    <View style={styles.tcard}>
      <View style={styles.tcardHead}>
        <Text allowFontScaling={false} style={styles.tcardNum}>{label}</Text>
        <View style={styles.flexSpacer2} />
        <View style={[styles.tbadge, { borderColor: statusColor, backgroundColor: statusColor + "22" }]}>
          <Text allowFontScaling={false} style={[styles.tbadgeText, { color: statusColor }]}>{statusLabel}</Text>
        </View>
        <View style={styles.tchipPill}><Text allowFontScaling={false} style={styles.tchipText}>{chipsPillText}</Text></View>
      </View>

      {onChangeTeamName ? (
        <TextInput
          allowFontScaling={false}
          style={styles.tcardNameInput}
          value={teamName ?? ""}
          onChangeText={onChangeTeamName}
          placeholder="Team name (optional)"
          placeholderTextColor={COLORS.textMuted}
        />
      ) : teamName ? (
        <Text allowFontScaling={false} style={styles.tcardName} numberOfLines={2}>{teamName}</Text>
      ) : null}

      <PlayerRow p={player1} />
      {doubles &&
        (player2 ? (
          <PlayerRow p={player2} />
        ) : showAddPartner ? (
          <View style={styles.partnerActionsRow}>
            <TouchableOpacity style={styles.partnerBtn} onPress={onAddPlayer2}>
              <Text allowFontScaling={false} style={styles.partnerBtnText}>Add Player 2</Text>
            </TouchableOpacity>
            {onInvitePartner && (
              <TouchableOpacity style={styles.invitePartnerBtn} onPress={onInvitePartner}>
                <Text allowFontScaling={false} style={styles.invitePartnerBtnText}>Invite Partner</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : null)}

      {showChipOverride && (
        <View style={styles.editChipRow}>
          <Text allowFontScaling={false} style={styles.editChipLabel}>Chip count (blank = auto)</Text>
          <TextInput
            allowFontScaling={false}
            style={styles.editChipInput}
            defaultValue={chipOverrideDefault}
            onEndEditing={(ev) => onChipOverrideEnd?.(ev.nativeEvent.text)}
            keyboardType="number-pad"
            placeholder={chipAutoPlaceholder}
            placeholderTextColor={COLORS.textMuted}
            maxLength={3}
          />
        </View>
      )}

      <View style={styles.tsummary}>
        {showTeamFargo && (
          <View style={styles.tsumRow}>
            <Text allowFontScaling={false} style={styles.tsumLabel}>Team Fargo</Text>
            <Text allowFontScaling={false} style={styles.tsumVal}>{teamFargo}</Text>
          </View>
        )}
        <View style={styles.tsumRow}>
          <Text allowFontScaling={false} style={styles.tsumLabel}>Assigned Chips</Text>
          <Text allowFontScaling={false} style={[styles.tsumVal, { color: COLORS.primaryLight }]}>{assignedChipsText}</Text>
        </View>
        {onTogglePaid ? (
          <TouchableOpacity style={styles.tsumRow} onPress={onTogglePaid}>
            <Text allowFontScaling={false} style={styles.tsumLabel}>Payment</Text>
            <Text allowFontScaling={false} style={[styles.tsumVal, { color: paid ? COLORS.success : COLORS.textSecondary }]}>{paid ? "Paid ✓" : "Unpaid"}</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.tsumRow}>
            <Text allowFontScaling={false} style={styles.tsumLabel}>Payment</Text>
            <Text allowFontScaling={false} style={[styles.tsumVal, { color: paid ? COLORS.success : COLORS.textSecondary }]}>{paid ? "Paid ✓" : "Unpaid"}</Text>
          </View>
        )}
        <View style={styles.tsumRow}>
          <Text allowFontScaling={false} style={styles.tsumLabel}>Check In</Text>
          <Text allowFontScaling={false} style={[styles.tsumVal, { color: checkedIn ? COLORS.success : COLORS.textSecondary }]}>{checkedIn ? "Checked In ✓" : "Not Checked In"}</Text>
        </View>
        {sidePots && sidePots.length > 0 && (
          <View style={styles.tpotsBlock}>
            <Text allowFontScaling={false} style={styles.tpotsHead}>Side Pots</Text>
            {sidePots.map((p) => (
              <TouchableOpacity key={p.name} style={styles.potRow} onPress={p.onToggle} activeOpacity={0.7}>
                <View style={[styles.potCheckbox, p.entered && styles.potCheckboxOn]}>{p.entered && <Text allowFontScaling={false} style={styles.potCheckMark}>✓</Text>}</View>
                <Text allowFontScaling={false} style={[styles.potLabel, p.entered && styles.potLabelOn]}>{p.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      <View style={styles.tfooter}>
        {isDraft ? (
          <>
            <TouchableOpacity style={styles.actionsBtn} onPress={onCancel} disabled={saving}>
              <Text allowFontScaling={false} style={styles.actionsBtnText}>Cancel</Text>
            </TouchableOpacity>
            {player2 ? (
              <TouchableOpacity style={styles.tprimary} onPress={onCreateTeam} disabled={saving}>
                <Text allowFontScaling={false} style={styles.tprimaryText}>Create Team</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={styles.tprimary} onPress={onSaveWaiting} disabled={saving}>
                <Text allowFontScaling={false} style={styles.tprimaryText}>Save as Waiting for Partner</Text>
              </TouchableOpacity>
            )}
          </>
        ) : (
          <>
            {!readOnly && onActions && (
              <TouchableOpacity style={styles.actionsBtn} onPress={onActions}>
                <Text allowFontScaling={false} style={styles.actionsBtnText}>{actionsLabel ?? "Actions"}</Text>
              </TouchableOpacity>
            )}
            {primary}
          </>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  tcard: { backgroundColor: COLORS.backgroundCard, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: webSc(SPACING.md), paddingVertical: webSc(SPACING.sm), marginBottom: webSc(SPACING.sm) },
  tcardHead: { flexDirection: "row", alignItems: "center", gap: webSc(SPACING.sm), marginBottom: webSc(SPACING.xs) },
  tcardNum: { color: COLORS.textSecondary, fontSize: webMs(FONT_SIZES.xs), fontWeight: "800" },
  tcardName: { color: COLORS.text, fontSize: webMs(FONT_SIZES.lg), fontWeight: "800", marginTop: 1, marginBottom: webSc(SPACING.xs), lineHeight: webMs(FONT_SIZES.lg + 3) },
  tcardNameInput: { color: COLORS.text, fontSize: webMs(FONT_SIZES.md), fontWeight: "700", borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.sm, paddingHorizontal: webSc(SPACING.sm), paddingVertical: webSc(SPACING.xs), backgroundColor: COLORS.surfaceLight, marginBottom: webSc(SPACING.xs), ...(isWeb ? ({ outlineStyle: "none" } as object) : null) },
  flexSpacer2: { flex: 1 },
  tbadge: { borderRadius: 999, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3 },
  tbadgeText: { fontSize: webMs(FONT_SIZES.xs - 1), fontWeight: "800" },
  tchipPill: { backgroundColor: COLORS.primary + "22", borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  tchipText: { color: COLORS.primaryLight, fontSize: webMs(FONT_SIZES.xs - 1), fontWeight: "800" },

  prow: { flexDirection: "row", alignItems: "center", gap: webSc(SPACING.sm), paddingVertical: 6, borderTopWidth: 1, borderTopColor: COLORS.border },
  pavatar: { width: webSc(30), height: webSc(30), borderRadius: webSc(15), backgroundColor: COLORS.surfaceLight, alignItems: "center", justifyContent: "center" },
  pavatarText: { color: COLORS.textSecondary, fontSize: webMs(FONT_SIZES.sm), fontWeight: "800" },
  pname: { color: COLORS.text, fontSize: webMs(FONT_SIZES.sm), fontWeight: "700" },
  pmeta: { color: COLORS.textMuted, fontSize: webMs(FONT_SIZES.xs), marginTop: 1 },
  pfargoEditRow: { flexDirection: "row", alignItems: "center", gap: webSc(SPACING.sm), marginTop: 2 },
  pverifyCol: { alignItems: "flex-end", justifyContent: "center", minWidth: webSc(70) },
  pverified: { color: COLORS.success, fontSize: webMs(FONT_SIZES.xs), fontWeight: "800", marginTop: 2 },
  pneeds: { color: COLORS.warning, fontSize: webMs(FONT_SIZES.xs), fontWeight: "700", marginTop: 2 },
  pverifyBtn: { paddingVertical: 2, paddingHorizontal: 2 },
  pverifyText: { color: COLORS.warning, fontSize: webMs(FONT_SIZES.xs), fontWeight: "800", textDecorationLine: "underline" },
  pchangeText: { color: COLORS.primary, fontSize: webMs(FONT_SIZES.xs), fontWeight: "700" },
  peditRow: { flexDirection: "row", gap: webSc(SPACING.sm), alignItems: "center" },
  peditName: { color: COLORS.text, fontSize: webMs(FONT_SIZES.sm), fontWeight: "600", borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.sm, paddingHorizontal: 8, paddingVertical: 5, backgroundColor: COLORS.surfaceLight, ...(isWeb ? ({ outlineStyle: "none" } as object) : null) },
  peditFargoWrap: { flexDirection: "row", alignItems: "center", gap: 4, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.sm, paddingHorizontal: 8, backgroundColor: COLORS.surfaceLight, height: webSc(34), minWidth: webSc(88) },
  phash: { color: COLORS.textMuted, fontSize: webMs(FONT_SIZES.sm), fontWeight: "700" },
  peditFargo: { flex: 1, color: COLORS.text, fontSize: webMs(FONT_SIZES.sm), fontWeight: "600", ...(isWeb ? ({ outlineStyle: "none" } as object) : null) },
  premoveBtn: { paddingHorizontal: 4, paddingVertical: 4, alignItems: "center", justifyContent: "center" },
  premoveText: { color: COLORS.error, fontSize: webMs(FONT_SIZES.md), fontWeight: "800" },

  partnerActionsRow: { flexDirection: "row", gap: webSc(SPACING.sm), paddingTop: 6 },
  partnerBtn: { flex: 1, borderWidth: 1, borderStyle: "dashed", borderColor: COLORS.primary, borderRadius: RADIUS.sm, paddingVertical: webSc(SPACING.sm), alignItems: "center" },
  partnerBtnText: { color: COLORS.primary, fontSize: webMs(FONT_SIZES.sm), fontWeight: "600" },
  invitePartnerBtn: { flex: 1, borderWidth: 1, borderColor: COLORS.primary, backgroundColor: COLORS.primary, borderRadius: RADIUS.sm, paddingVertical: webSc(SPACING.sm), alignItems: "center" },
  invitePartnerBtnText: { color: COLORS.white, fontSize: webMs(FONT_SIZES.sm), fontWeight: "700" },

  editChipRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: webSc(SPACING.sm), gap: webSc(SPACING.sm) },
  editChipLabel: { color: COLORS.textSecondary, fontSize: webMs(FONT_SIZES.xs), fontWeight: "700" },
  editChipInput: { width: webSc(96), height: webSc(38), backgroundColor: COLORS.surfaceLight, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.sm, paddingHorizontal: webSc(SPACING.md), color: COLORS.text, fontSize: webMs(FONT_SIZES.sm), fontWeight: "700", textAlign: "center", ...(isWeb ? ({ outlineStyle: "none" } as object) : null) },

  tsummary: { marginTop: webSc(SPACING.sm), backgroundColor: COLORS.surface, borderRadius: RADIUS.md, paddingHorizontal: webSc(SPACING.md), paddingVertical: 2 },
  tsumRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 3 },
  tsumLabel: { color: COLORS.textSecondary, fontSize: webMs(FONT_SIZES.xs), fontWeight: "600" },
  tsumVal: { color: COLORS.text, fontSize: webMs(FONT_SIZES.sm), fontWeight: "800" },

  tpotsBlock: { marginTop: 4, paddingTop: webSc(SPACING.xs), borderTopWidth: 1, borderTopColor: COLORS.border },
  tpotsHead: { color: COLORS.textSecondary, fontSize: webMs(FONT_SIZES.xs), fontWeight: "700", marginBottom: 2 },
  potRow: { flexDirection: "row", alignItems: "center", gap: webSc(SPACING.sm), paddingVertical: webSc(SPACING.xs) },
  potCheckbox: { width: webSc(22), height: webSc(22), borderRadius: RADIUS.sm, borderWidth: 1.5, borderColor: COLORS.border, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.background },
  potCheckboxOn: { backgroundColor: COLORS.success, borderColor: COLORS.success },
  potCheckMark: { color: COLORS.white, fontSize: webMs(FONT_SIZES.sm), fontWeight: "800" },
  potLabel: { fontSize: webMs(FONT_SIZES.sm), color: COLORS.text },
  potLabelOn: { color: COLORS.success, fontWeight: "600" },

  tfooter: { flexDirection: "row", alignItems: "flex-start", gap: webSc(SPACING.sm), marginTop: webSc(SPACING.sm) },
  actionsBtn: { paddingVertical: webSc(SPACING.sm), paddingHorizontal: webSc(SPACING.md), borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.borderLight, alignItems: "center", justifyContent: "center" },
  actionsBtnText: { color: COLORS.textSecondary, fontSize: webMs(FONT_SIZES.sm), fontWeight: "700" },
  tprimary: { flex: 1, backgroundColor: COLORS.success, borderRadius: RADIUS.md, paddingVertical: webSc(SPACING.sm), alignItems: "center" },
  tprimaryText: { color: COLORS.white, fontSize: webMs(FONT_SIZES.sm), fontWeight: "800" },
});
