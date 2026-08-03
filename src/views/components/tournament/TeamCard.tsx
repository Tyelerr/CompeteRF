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

import { ComponentRef, ReactNode, useRef, useState } from "react";
import { Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { COLORS } from "../../../theme/colors";
import { RADIUS, SPACING } from "../../../theme/spacing";
import { FONT_SIZES } from "../../../theme/typography";
import { webMs, webSc } from "../../../utils/scaling";

const isWeb = Platform.OS === "web";

// Screen-space rect of the Actions button, so the caller can anchor a popover to it.
export interface ActionsAnchor {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TeamCardPlayerVM {
  name: string;
  idLabel?: string | null; // e.g. "Player ID #44"
  fargo: number | null;
  verified?: boolean;
  canVerify?: boolean;
  onVerify?: () => void;
  fargoEditable?: boolean; // draft (always) / display edit mode
  onChangeFargo?: (v: string) => void;
  onCommitFargo?: () => void; // fired when the inline Fargo edit is committed (blur/done)
  editingRow?: boolean; // display edit mode: name editable + remove
  onChangeName?: (v: string) => void;
  onRemove?: () => void;
  removable?: boolean; // draft: show a "Change" affordance on the row
  onEdit?: () => void; // display: show an "Edit" affordance (attached PENDING members)
  pendingAccount?: boolean; // subtle tertiary: this player has no Compete account yet
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
  // When set (draft-as-modal), the card renders its own title + X header so it can
  // BE the modal surface (no outer sheet).
  title?: string;
  onClose?: () => void;
  label: string; // "Team #1" | "New Team" (Singles hides the "Player #1" label)
  statusLabel: string;
  statusColor: string;
  chipsPillText?: string; // deprecated: chips now live only in the Assigned Chips row
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
  onToggleCheckIn?: () => void; // display interactive; omit for static / not-yet-approved
  sidePots?: TeamCardSidePotVM[];

  // display edit chip override
  showChipOverride?: boolean;
  chipOverrideDefault?: string;
  chipAutoPlaceholder?: string;
  onChipOverrideEnd?: (v: string) => void;

  // footer
  readOnly?: boolean;
  actionsLabel?: string; // "Actions" | "Done"
  // Receives the button's screen rect so the caller can anchor a popover to it.
  onActions?: (anchor: ActionsAnchor) => void;
  primary?: ReactNode; // display: the caller's workflow action (fills its slot; no flex)
  warning?: string; // full-width row under both footer buttons when the action is blocked

  // draft footer
  onCancel?: () => void;
  onSaveWaiting?: () => void;
  onCreateTeam?: () => void;
  saving?: boolean;
}

const PlayerRow = ({
  p,
  statusPill,
  first,
}: {
  p: TeamCardPlayerVM;
  // Singles: the tournament status pill sits on the player's right (no team header).
  statusPill?: { label: string; color: string } | null;
  first?: boolean; // drop the top divider when this is the first element in the card
}) => {
  const [editingFargo, setEditingFargo] = useState(false);
  const avatar = (
    <View style={styles.pavatar}>
      <Text allowFontScaling={false} style={styles.pavatarText}>{(p.name || "?").charAt(0).toUpperCase()}</Text>
    </View>
  );

  // Display edit mode (Actions → editing a saved row): stacked so nothing is cramped.
  // Row 1: avatar + name + remove. Row 2: a compact Fargo field (3–4 digits).
  if (p.editingRow) {
    return (
      <View style={[styles.peditContainer, first && styles.prowFirst]}>
        <View style={styles.peditTopRow}>
          {avatar}
          <TextInput
            allowFontScaling={false}
            style={[styles.peditName, { flex: 1 }]}
            value={p.name}
            onChangeText={p.onChangeName}
            placeholder="Player"
            placeholderTextColor={COLORS.textMuted}
          />
          {p.onRemove && (
            <TouchableOpacity style={styles.premoveBtn} onPress={p.onRemove} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text allowFontScaling={false} style={styles.premoveText}>✕</Text>
            </TouchableOpacity>
          )}
        </View>
        <View style={styles.peditFargoRow}>
          <View style={styles.peditFargoWrap}>
            <Text allowFontScaling={false} style={styles.phash}>#</Text>
            <TextInput
              allowFontScaling={false}
              style={styles.peditFargo}
              value={p.fargo != null ? String(p.fargo) : ""}
              onChangeText={p.onChangeFargo}
              onEndEditing={() => p.onCommitFargo?.()}
              keyboardType="number-pad"
              placeholder="Fargo"
              placeholderTextColor={COLORS.textMuted}
              maxLength={4}
            />
          </View>
        </View>
      </View>
    );
  }

  // Editable draft row: name (+ id) on the left, a compact Fargo pill that expands
  // to an input on tap, and a Change action — all on one line.
  if (p.fargoEditable) {
    return (
      <View style={styles.prow}>
        {avatar}
        <View style={styles.pinfo}>
          <Text allowFontScaling={false} style={styles.pname} numberOfLines={1}>{p.name || "Player"}</Text>
          {p.idLabel ? <Text allowFontScaling={false} style={styles.pmeta} numberOfLines={1}>{p.idLabel}</Text> : null}
        </View>
        {editingFargo ? (
          <TextInput
            allowFontScaling={false}
            style={styles.fargoInput}
            value={p.fargo != null ? String(p.fargo) : ""}
            onChangeText={p.onChangeFargo}
            keyboardType="number-pad"
            autoFocus
            maxLength={4}
            placeholder="Fargo"
            placeholderTextColor={COLORS.textMuted}
            onBlur={() => setEditingFargo(false)}
            onSubmitEditing={() => setEditingFargo(false)}
            returnKeyType="done"
          />
        ) : (
          <TouchableOpacity style={styles.fargoPill} onPress={() => setEditingFargo(true)} activeOpacity={0.7}>
            <Text allowFontScaling={false} style={styles.fargoPillText}>
              {p.fargo != null ? `Fargo ${p.fargo}` : "Set Fargo"}
            </Text>
          </TouchableOpacity>
        )}
        {p.removable && p.onRemove && (
          <TouchableOpacity style={styles.pchangeBtn} onPress={p.onRemove} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text allowFontScaling={false} style={styles.pchangeText}>Change</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  // Saved display row — sports-roster style: identity on the left, a compact status
  // stack on the right (tournament status pill for Singles, then Fargo status).
  const metaLine =
    (p.idLabel ?? "") + (p.idLabel && p.fargo != null ? " · " : "") + (p.fargo != null ? `Fargo ${p.fargo}` : "");
  return (
    <View style={[styles.prow, first && styles.prowFirst]}>
      {avatar}
      <View style={styles.pinfo}>
        <Text allowFontScaling={false} style={styles.pnameDisplay} numberOfLines={1}>{p.name || "Player"}</Text>
        {metaLine ? (
          <Text allowFontScaling={false} style={styles.pmeta} numberOfLines={1}>{metaLine}</Text>
        ) : null}
        {p.pendingAccount ? (
          <Text allowFontScaling={false} style={styles.pAccountPending} numberOfLines={1}>Pending account</Text>
        ) : null}
      </View>
      <View style={styles.pstatusCol}>
        {statusPill ? (
          <View style={[styles.pstatusPill, { borderColor: statusPill.color, backgroundColor: statusPill.color + "22" }]}>
            <Text allowFontScaling={false} style={[styles.pstatusPillText, { color: statusPill.color }]}>{statusPill.label}</Text>
          </View>
        ) : null}
        {p.verified ? (
          <Text allowFontScaling={false} style={styles.pfargoVerified}>✓ Verified</Text>
        ) : p.canVerify && p.onVerify ? (
          <TouchableOpacity onPress={p.onVerify} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text allowFontScaling={false} style={styles.pfargoNeeds}>{p.fargo == null ? "No Fargo" : "Needs Verification"}</Text>
          </TouchableOpacity>
        ) : p.fargo == null ? (
          <Text allowFontScaling={false} style={styles.pfargoNeeds}>No Fargo</Text>
        ) : null}
        {p.onEdit ? (
          <TouchableOpacity onPress={p.onEdit} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text allowFontScaling={false} style={styles.pEditLink}>Edit</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
};

export const TeamCard = (props: TeamCardProps) => {
  const {
    mode, doubles, title, onClose, label, statusLabel, statusColor, teamName, onChangeTeamName,
    player1, player2, showAddPartner, onAddPlayer2, onInvitePartner,
    showTeamFargo, teamFargo, assignedChipsText, paid, checkedIn, onTogglePaid, onToggleCheckIn, sidePots,
    showChipOverride, chipOverrideDefault, chipAutoPlaceholder, onChipOverrideEnd,
    readOnly, actionsLabel, onActions, primary, warning,
    onCancel, onSaveWaiting, onCreateTeam, saving,
  } = props;
  const isDraft = mode === "draft";
  // Singles display puts the tournament status on the player's right (no team header).
  // Doubles + draft keep a compact team header carrying the team status.
  const singlesDisplay = !doubles && !isDraft;
  const showTeamHeader = doubles || isDraft;
  // Ref to the Actions button so we can hand the caller its on-screen rect for a popover.
  const actionsRef = useRef<ComponentRef<typeof TouchableOpacity>>(null);
  const openActions = () => {
    const node = actionsRef.current;
    if (node?.measureInWindow) {
      node.measureInWindow((x, y, width, height) => onActions?.({ x, y, width, height }));
    } else {
      onActions?.({ x: 0, y: 0, width: 0, height: 0 });
    }
  };

  return (
    <View style={styles.tcard}>
      {title ? (
        <View style={styles.cardTitleRow}>
          <Text allowFontScaling={false} style={styles.cardTitle}>{title}</Text>
          {onClose && (
            <TouchableOpacity style={styles.cardCloseBtn} onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Text allowFontScaling={false} style={styles.cardClose}>✕</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : null}
      {/* Doubles/draft keep a compact team header (Team #N + team status). Singles has
          NO header — the status pill rides on the player's identity row instead, so the
          top has no awkward empty space and chips are shown only in the summary. */}
      {showTeamHeader ? (
        <View style={styles.tcardHead}>
          {doubles ? <Text allowFontScaling={false} style={styles.tcardNum}>{label}</Text> : null}
          <View style={styles.flexSpacer2} />
          <View style={[styles.tbadge, { borderColor: statusColor, backgroundColor: statusColor + "22" }]}>
            <Text allowFontScaling={false} style={[styles.tbadgeText, { color: statusColor }]}>{statusLabel}</Text>
          </View>
        </View>
      ) : null}

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

      <PlayerRow
        p={player1}
        first={singlesDisplay}
        statusPill={singlesDisplay ? { label: statusLabel, color: statusColor } : undefined}
      />
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
        <View style={styles.tsumRow}>
          <Text allowFontScaling={false} style={styles.tsumLabel}>Payment</Text>
          {onTogglePaid ? (
            <TouchableOpacity
              style={[styles.sumPill, paid && styles.sumPillOn]}
              onPress={onTogglePaid}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text allowFontScaling={false} style={[styles.sumPillText, paid && styles.sumPillTextOn]}>{paid ? "Paid ✓" : "Unpaid"}</Text>
            </TouchableOpacity>
          ) : (
            <View style={[styles.sumPill, paid && styles.sumPillOn]}>
              <Text allowFontScaling={false} style={[styles.sumPillText, paid && styles.sumPillTextOn]}>{paid ? "Paid ✓" : "Unpaid"}</Text>
            </View>
          )}
        </View>
        <View style={styles.tsumRow}>
          <Text allowFontScaling={false} style={styles.tsumLabel}>Check In</Text>
          {onToggleCheckIn ? (
            <TouchableOpacity
              style={[styles.sumPill, checkedIn && styles.sumPillOn]}
              onPress={onToggleCheckIn}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text allowFontScaling={false} style={[styles.sumPillText, checkedIn && styles.sumPillTextOn]}>{checkedIn ? "Checked In ✓" : "Not Checked In"}</Text>
            </TouchableOpacity>
          ) : (
            <View style={[styles.sumPill, checkedIn && styles.sumPillOn]}>
              <Text allowFontScaling={false} style={[styles.sumPillText, checkedIn && styles.sumPillTextOn]}>{checkedIn ? "Checked In ✓" : "Not Checked In"}</Text>
            </View>
          )}
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

      {isDraft ? (
        <View style={styles.tfooter}>
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
        </View>
      ) : (
        <>
          {/* Deterministic footer: TWO identical slots (flexGrow:1 / flexBasis:0). Each
              button just fills its slot (width:100%, no flex on the button). The slots —
              never the buttons — decide width, so Actions and the primary are exactly
              equal. The warning is its OWN full-width row below both, not attached to
              the primary column. */}
          <View style={styles.footerRow}>
            {!readOnly && onActions ? (
              <View style={styles.footerSlot}>
                <TouchableOpacity ref={actionsRef} style={[styles.actionsBtn, styles.footerButton]} onPress={openActions}>
                  <Text allowFontScaling={false} style={styles.actionsBtnText}>{actionsLabel ?? "Actions"}</Text>
                </TouchableOpacity>
              </View>
            ) : null}
            <View style={styles.footerSlot}>{primary}</View>
          </View>
          {warning ? <Text allowFontScaling={false} style={styles.footerWarning}>{warning}</Text> : null}
        </>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  tcard: { backgroundColor: COLORS.backgroundCard, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: webSc(SPACING.md), paddingVertical: webSc(SPACING.md), marginBottom: webSc(SPACING.sm) },
  cardTitleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: webSc(SPACING.sm) },
  cardTitle: { color: COLORS.text, fontSize: webMs(FONT_SIZES.xl), fontWeight: "800" },
  cardCloseBtn: { paddingVertical: webSc(SPACING.xs), paddingLeft: webSc(SPACING.md), alignItems: "center", justifyContent: "center" },
  cardClose: { color: COLORS.textSecondary, fontSize: webMs(FONT_SIZES.xl), fontWeight: "700" },
  tcardHead: { flexDirection: "row", alignItems: "center", gap: webSc(SPACING.sm), marginBottom: webSc(SPACING.xs) },
  tcardNum: { color: COLORS.textSecondary, fontSize: webMs(FONT_SIZES.xs), fontWeight: "800" },
  tcardName: { color: COLORS.text, fontSize: webMs(FONT_SIZES.lg), fontWeight: "800", marginTop: 1, marginBottom: webSc(SPACING.xs), lineHeight: webMs(FONT_SIZES.lg + 3) },
  tcardNameInput: { color: COLORS.text, fontSize: webMs(FONT_SIZES.md), fontWeight: "700", borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.sm, paddingHorizontal: webSc(SPACING.sm), paddingVertical: webSc(SPACING.xs), backgroundColor: COLORS.surfaceLight, marginBottom: webSc(SPACING.xs), ...(isWeb ? ({ outlineStyle: "none" } as object) : null) },
  flexSpacer2: { flex: 1 },
  tbadge: { borderRadius: 999, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3 },
  tbadgeText: { fontSize: webMs(FONT_SIZES.xs - 1), fontWeight: "800" },

  prow: { flexDirection: "row", alignItems: "center", gap: webSc(SPACING.sm), paddingVertical: webSc(SPACING.sm), borderTopWidth: 1, borderTopColor: COLORS.border },
  prowFirst: { borderTopWidth: 0 }, // first element in the card → no divider above it
  pavatar: { width: webSc(44), height: webSc(44), borderRadius: webSc(22), backgroundColor: COLORS.surfaceLight, alignItems: "center", justifyContent: "center" },
  pavatarText: { color: COLORS.textSecondary, fontSize: webMs(FONT_SIZES.lg), fontWeight: "800" },
  pname: { color: COLORS.text, fontSize: webMs(FONT_SIZES.sm), fontWeight: "700" },
  pnameDisplay: { color: COLORS.text, fontSize: webMs(FONT_SIZES.lg), fontWeight: "800" }, // identity is the focus
  pmeta: { color: COLORS.textMuted, fontSize: webMs(FONT_SIZES.sm), marginTop: webSc(SPACING.xs) },
  pAccountPending: { color: COLORS.textMuted, fontSize: webMs(FONT_SIZES.xs), fontStyle: "italic", marginTop: 1 },
  pchangeText: { color: COLORS.primary, fontSize: webMs(FONT_SIZES.xs), fontWeight: "700" },
  pchangeBtn: { paddingHorizontal: 2, paddingVertical: 2 },
  pinfo: { flex: 1, minWidth: 0 },
  // Right-side status stack: compact tournament pill on top, Fargo status CENTERED
  // beneath it (one grouped block), nudged slightly lower to balance the identity.
  pstatusCol: { alignItems: "center", justifyContent: "center", gap: 3, marginLeft: webSc(SPACING.sm), marginTop: webSc(SPACING.xs) },
  pstatusPill: { borderRadius: 999, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 3 },
  pstatusPillText: { fontSize: webMs(FONT_SIZES.xs), fontWeight: "800" },
  pfargoVerified: { color: COLORS.success, fontSize: webMs(FONT_SIZES.xs), fontWeight: "800" },
  pfargoNeeds: { color: COLORS.warning, fontSize: webMs(FONT_SIZES.xs), fontWeight: "800" },
  pEditLink: { color: COLORS.primary, fontSize: webMs(FONT_SIZES.xs), fontWeight: "700", marginTop: 1 },
  // Compact Fargo pill (normal state) → expands to fargoInput on tap.
  fargoPill: { backgroundColor: COLORS.surfaceLight, borderRadius: RADIUS.full, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: webSc(SPACING.sm), paddingVertical: 5 },
  fargoPillText: { color: COLORS.text, fontSize: webMs(FONT_SIZES.sm), fontWeight: "700" },
  fargoInput: { minWidth: webSc(70), backgroundColor: COLORS.surfaceLight, borderWidth: 1, borderColor: COLORS.primary, borderRadius: RADIUS.sm, paddingHorizontal: webSc(SPACING.sm), paddingVertical: 4, color: COLORS.text, fontSize: webMs(FONT_SIZES.sm), fontWeight: "700", textAlign: "center", ...(isWeb ? ({ outlineStyle: "none" } as object) : null) },
  // Stacked edit layout (Option B): name row, then a compact Fargo row indented
  // under the name so the field never gets squeezed against the remove button.
  peditContainer: { borderTopWidth: 1, borderTopColor: COLORS.border, paddingVertical: webSc(SPACING.sm), gap: webSc(SPACING.sm) },
  peditTopRow: { flexDirection: "row", alignItems: "center", gap: webSc(SPACING.sm) },
  peditFargoRow: { flexDirection: "row", alignItems: "center", marginLeft: webSc(44 + SPACING.sm) },
  peditName: { color: COLORS.text, fontSize: webMs(FONT_SIZES.sm), fontWeight: "600", borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.sm, paddingHorizontal: 8, paddingVertical: 7, backgroundColor: COLORS.surfaceLight, ...(isWeb ? ({ outlineStyle: "none" } as object) : null) },
  peditFargoWrap: { flexDirection: "row", alignItems: "center", gap: 4, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.sm, paddingHorizontal: 10, backgroundColor: COLORS.surfaceLight, height: webSc(36), minWidth: webSc(110) },
  phash: { color: COLORS.textMuted, fontSize: webMs(FONT_SIZES.sm), fontWeight: "700" },
  peditFargo: { flex: 1, color: COLORS.text, fontSize: webMs(FONT_SIZES.sm), fontWeight: "600", ...(isWeb ? ({ outlineStyle: "none" } as object) : null) },
  premoveBtn: { width: webSc(34), height: webSc(34), borderRadius: webSc(17), alignItems: "center", justifyContent: "center" },
  premoveText: { color: COLORS.error, fontSize: webMs(FONT_SIZES.md), fontWeight: "800" },

  partnerActionsRow: { flexDirection: "row", gap: webSc(SPACING.sm), paddingTop: 6 },
  partnerBtn: { flex: 1, borderWidth: 1, borderStyle: "dashed", borderColor: COLORS.primary, borderRadius: RADIUS.sm, paddingVertical: webSc(SPACING.sm), alignItems: "center" },
  partnerBtnText: { color: COLORS.primary, fontSize: webMs(FONT_SIZES.sm), fontWeight: "600" },
  invitePartnerBtn: { flex: 1, borderWidth: 1, borderColor: COLORS.primary, backgroundColor: COLORS.primary, borderRadius: RADIUS.sm, paddingVertical: webSc(SPACING.sm), alignItems: "center" },
  invitePartnerBtnText: { color: COLORS.white, fontSize: webMs(FONT_SIZES.sm), fontWeight: "700" },

  editChipRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: webSc(SPACING.sm), gap: webSc(SPACING.sm) },
  editChipLabel: { color: COLORS.textSecondary, fontSize: webMs(FONT_SIZES.xs), fontWeight: "700" },
  editChipInput: { width: webSc(96), height: webSc(38), backgroundColor: COLORS.surfaceLight, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.sm, paddingHorizontal: webSc(SPACING.md), color: COLORS.text, fontSize: webMs(FONT_SIZES.sm), fontWeight: "700", textAlign: "center", ...(isWeb ? ({ outlineStyle: "none" } as object) : null) },

  // Flat summary: no nested card — subtle top dividers between rows instead.
  tsummary: { marginTop: webSc(SPACING.sm) },
  tsumRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: webSc(SPACING.sm), borderTopWidth: 1, borderTopColor: COLORS.border },
  tsumLabel: { color: COLORS.textSecondary, fontSize: webMs(FONT_SIZES.sm), fontWeight: "600" },
  tsumVal: { color: COLORS.text, fontSize: webMs(FONT_SIZES.sm), fontWeight: "800" },
  // Compact interactive Payment / Check-In pills — sized to content, not stretched.
  sumPill: { borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surfaceLight, borderRadius: RADIUS.full, paddingHorizontal: webSc(SPACING.md), paddingVertical: 6, alignItems: "center" },
  sumPillOn: { borderColor: COLORS.success, backgroundColor: COLORS.success + "22" },
  sumPillText: { color: COLORS.textSecondary, fontSize: webMs(FONT_SIZES.sm), fontWeight: "800" },
  sumPillTextOn: { color: COLORS.success },

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
  // Deterministic display footer: identical slots decide width; buttons just fill them.
  footerRow: { flexDirection: "row", width: "100%", gap: webSc(SPACING.sm), marginTop: webSc(SPACING.sm) },
  footerSlot: { flexGrow: 1, flexBasis: 0, flexShrink: 1 },
  footerButton: { width: "100%", minHeight: webSc(46), borderRadius: RADIUS.md, alignItems: "center", justifyContent: "center" },
  footerWarning: { color: COLORS.warning, fontSize: webMs(FONT_SIZES.xs), fontWeight: "600", textAlign: "center", marginTop: webSc(SPACING.sm) },
  // Balanced with the primary label: larger size, weight just a touch lighter than the
  // primary's 800. Hierarchy still comes from color (gray secondary vs green primary),
  // not text size. (Text style only — footer sizing/layout untouched.)
  actionsBtnText: { color: COLORS.textSecondary, fontSize: webMs(FONT_SIZES.md), fontWeight: "700" },
  tprimary: { flex: 1, backgroundColor: COLORS.success, borderRadius: RADIUS.md, paddingVertical: webSc(SPACING.sm), alignItems: "center" },
  tprimaryText: { color: COLORS.white, fontSize: webMs(FONT_SIZES.sm), fontWeight: "800" },
});
