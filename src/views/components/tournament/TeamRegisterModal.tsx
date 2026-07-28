// src/views/components/tournament/TeamRegisterModal.tsx
// Register Team flow for team-format (Scotch Doubles) tournaments. The captain
// sets their OWN Fargo and creates the team, then invites a partner by SHARING a
// link — Messages (pre-filled) or the OS share sheet (copy + any social app).
// No typed username/email/phone. Whoever opens the link claims the open slot
// (join_team_by_token). Once a team exists the modal shows status + controls.

import { useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
  Linking,
  Modal,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { COLORS } from "../../../theme/colors";
import { SPACING } from "../../../theme/spacing";
import { FONT_SIZES } from "../../../theme/typography";
import { moderateScale, scale } from "../../../utils/scaling";
import { useTeamRegistration } from "../../../viewmodels/hooks/use.team.registration";
import { Tournament } from "../../../models/types/tournament.types";

interface Props {
  visible: boolean;
  tournament: Tournament | null;
  playerId?: number;
  onClose: () => void;
}

const STATUS_META: Record<string, { label: string; color: string }> = {
  waiting: { label: "Waiting for Teammate", color: COLORS.warning },
  invited: { label: "Invite Sent", color: COLORS.info },
  unverified: { label: "Unverified Teammate", color: COLORS.warning },
  registered: { label: "Registered", color: COLORS.success },
};

export function TeamRegisterModal({ visible, tournament, playerId, onClose }: Props) {
  const vm = useTeamRegistration(tournament?.id, playerId);

  const [fargoMode, setFargoMode] = useState<"enter" | "none">("enter");
  const [captainFargo, setCaptainFargo] = useState("");
  const [error, setError] = useState<string | null>(null);

  const num = (s: string) => {
    const d = s.replace(/\D/g, "");
    return d === "" ? null : parseInt(d, 10);
  };

  const handleClose = () => {
    setError(null);
    onClose();
  };

  const handleRegister = async () => {
    setError(null);
    const cFargo = fargoMode === "none" ? null : num(captainFargo);
    try {
      await vm.registerTeam(cFargo, null);
    } catch (e: any) {
      setError(e?.message ?? "Couldn't register the team. Please try again.");
    }
  };

  // Shareable HTTPS invite link (Universal/App Link) carrying the team's token.
  const inviteLink =
    tournament && vm.team?.invite_token
      ? `https://www.thecompeteapp.com/join/${tournament.id}?invite=${vm.team.invite_token}`
      : "";
  const inviteMessage = `🎱 Join my team for ${tournament?.name} on Compete!\n\nTap below to join:\n${inviteLink}`;

  const handleTextInvite = async () => {
    if (!inviteLink) return;
    // Open Messages with the invite pre-filled (no recipient).
    const sep = Platform.OS === "ios" ? "&" : "?";
    try {
      await Linking.openURL(`sms:${sep}body=${encodeURIComponent(inviteMessage)}`);
    } catch {
      /* no SMS app / user cancelled */
    }
  };

  const handleShareLink = async () => {
    if (!inviteLink) return;
    try {
      await Share.share({ message: inviteMessage });
    } catch {
      /* dismissed */
    }
  };

  const handleCancelTeam = async () => {
    try {
      await vm.cancelTeam();
      handleClose();
    } catch (e: any) {
      setError(e?.message ?? "Couldn't cancel the team.");
    }
  };

  const showForm = vm.state === "none";
  const statusMeta = STATUS_META[vm.state];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <View style={s.overlay}>
        <Pressable style={s.backdrop} onPress={() => Keyboard.dismiss()} />
        <Pressable style={s.card} onPress={() => Keyboard.dismiss()}>
          <Text allowFontScaling={false} style={s.title}>REGISTER TEAM</Text>
          <Text allowFontScaling={false} style={s.subtitle}>{tournament?.name}</Text>
          <View style={s.divider} />

          {vm.loading ? (
            <ActivityIndicator color={COLORS.primary} style={{ marginVertical: scale(SPACING.lg) }} />
          ) : showForm ? (
            <>
              <Text allowFontScaling={false} style={s.label}>Your Fargo</Text>
              <View style={s.radioRow}>
                <TouchableOpacity style={s.radioOpt} activeOpacity={0.7} onPress={() => setFargoMode("enter")}>
                  <View style={[s.radioDot, fargoMode === "enter" && s.radioDotOn]}>
                    {fargoMode === "enter" && <View style={s.radioInner} />}
                  </View>
                  <Text allowFontScaling={false} style={s.radioLabel}>Enter Fargo</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={s.radioOpt}
                  activeOpacity={0.7}
                  onPress={() => {
                    setFargoMode("none");
                    Keyboard.dismiss();
                  }}
                >
                  <View style={[s.radioDot, fargoMode === "none" && s.radioDotOn]}>
                    {fargoMode === "none" && <View style={s.radioInner} />}
                  </View>
                  <Text allowFontScaling={false} style={s.radioLabel}>No Fargo</Text>
                </TouchableOpacity>
              </View>
              {fargoMode === "enter" && (
                <View style={s.numField}>
                  <Text allowFontScaling={false} style={s.hash}>#</Text>
                  <TextInput
                    allowFontScaling={false}
                    style={s.numInput}
                    value={captainFargo}
                    onChangeText={(v) => setCaptainFargo(v.replace(/\D/g, ""))}
                    keyboardType="number-pad"
                    placeholder="500"
                    placeholderTextColor={COLORS.textMuted}
                    maxLength={4}
                  />
                </View>
              )}
              <Text allowFontScaling={false} style={s.hint}>
                You&apos;ll get an invite link to send your teammate after you register.
              </Text>

              {error && <Text allowFontScaling={false} style={s.error}>{error}</Text>}

              <View style={s.buttons}>
                <TouchableOpacity style={s.cancel} onPress={handleClose} disabled={vm.busy}>
                  <Text allowFontScaling={false} style={s.cancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.confirm} onPress={handleRegister} disabled={vm.busy}>
                  <Text allowFontScaling={false} style={s.confirmText}>
                    {vm.busy ? "Registering…" : "Register Team"}
                  </Text>
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <>
              {statusMeta && (
                <View style={[s.statusBanner, { backgroundColor: statusMeta.color + "22", borderColor: statusMeta.color }]}>
                  <Text allowFontScaling={false} style={[s.statusBannerText, { color: statusMeta.color }]}>
                    {statusMeta.label}
                  </Text>
                </View>
              )}

              <View style={s.memberRow}>
                <Text allowFontScaling={false} style={s.memberName}>{vm.captainName}</Text>
                <Text allowFontScaling={false} style={s.memberRole}>Teammate</Text>
              </View>
              <View style={s.memberRow}>
                <Text allowFontScaling={false} style={s.memberName}>
                  {vm.partner ? vm.partnerName : "No teammate yet"}
                </Text>
                {vm.partner && (
                  <Text allowFontScaling={false} style={[s.memberRole, { color: statusMeta?.color }]}>
                    {vm.state === "registered" ? "Confirmed" : "Pending"}
                  </Text>
                )}
              </View>

              {/* Share the invite while the partner slot is open */}
              {!vm.partner && (
                <>
                  <Text allowFontScaling={false} style={[s.label, s.shareLabel]}>Invite your teammate</Text>
                  <TouchableOpacity style={s.sharePrimary} onPress={handleTextInvite} disabled={!inviteLink}>
                    <Text allowFontScaling={false} style={s.sharePrimaryText}>💬 Text the invite</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={s.shareSecondary} onPress={handleShareLink} disabled={!inviteLink}>
                    <Text allowFontScaling={false} style={s.shareSecondaryText}>🔗 Share / copy link</Text>
                  </TouchableOpacity>
                </>
              )}

              {error && <Text allowFontScaling={false} style={s.error}>{error}</Text>}

              <View style={s.stackButtons}>
                <TouchableOpacity style={s.dangerBtn} onPress={handleCancelTeam} disabled={vm.busy}>
                  <Text allowFontScaling={false} style={s.dangerBtnText}>
                    {vm.busy ? "Working…" : "Cancel Team Registration"}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.cancel} onPress={handleClose} disabled={vm.busy}>
                  <Text allowFontScaling={false} style={s.cancelText}>Close</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </Pressable>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, justifyContent: "center", alignItems: "center", padding: scale(SPACING.lg) },
  backdrop: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.7)" },
  card: {
    width: "100%",
    maxWidth: 460,
    backgroundColor: COLORS.backgroundCard,
    borderRadius: scale(22),
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    paddingHorizontal: scale(SPACING.md),
    paddingVertical: scale(SPACING.md),
    shadowColor: "#000000",
    shadowOpacity: 0.55,
    shadowRadius: scale(24),
    shadowOffset: { width: 0, height: 12 },
    elevation: 16,
  },
  title: { fontSize: moderateScale(FONT_SIZES.xs), fontWeight: "700", letterSpacing: 1, color: COLORS.textSecondary },
  subtitle: { fontSize: moderateScale(FONT_SIZES.xl), fontWeight: "800", color: COLORS.primaryLight, lineHeight: moderateScale(26), marginTop: scale(SPACING.xs) },
  divider: { height: 1, backgroundColor: COLORS.border, marginVertical: scale(SPACING.sm) },

  label: { fontSize: moderateScale(FONT_SIZES.xs), color: COLORS.textSecondary, fontWeight: "700", letterSpacing: 0.4, marginBottom: scale(SPACING.sm) },
  shareLabel: { marginTop: scale(SPACING.md) },

  radioRow: { flexDirection: "row", gap: scale(SPACING.lg), marginBottom: scale(SPACING.sm) },
  radioOpt: { flexDirection: "row", alignItems: "center", gap: scale(SPACING.sm), paddingVertical: scale(SPACING.xs) },
  radioDot: { width: scale(20), height: scale(20), borderRadius: scale(10), borderWidth: 2, borderColor: COLORS.borderLight, alignItems: "center", justifyContent: "center" },
  radioDotOn: { borderColor: COLORS.primaryLight },
  radioInner: { width: scale(10), height: scale(10), borderRadius: scale(5), backgroundColor: COLORS.primaryLight },
  radioLabel: { fontSize: moderateScale(FONT_SIZES.sm), color: COLORS.text, fontWeight: "600" },

  numField: { flexDirection: "row", alignItems: "center", gap: scale(SPACING.xs), width: "60%", height: scale(50), backgroundColor: COLORS.surfaceLight, borderWidth: 1.5, borderColor: COLORS.border, borderRadius: scale(12), paddingHorizontal: scale(SPACING.md) },
  hash: { fontSize: moderateScale(FONT_SIZES.md), fontWeight: "700", color: COLORS.textMuted },
  numInput: { flex: 1, height: "100%", color: COLORS.text, fontSize: moderateScale(FONT_SIZES.md), fontWeight: "600" },
  hint: { fontSize: moderateScale(FONT_SIZES.xs), color: COLORS.textMuted, marginTop: scale(SPACING.sm) },

  error: { fontSize: moderateScale(FONT_SIZES.sm), color: COLORS.error, marginTop: scale(SPACING.md), lineHeight: moderateScale(18) },

  buttons: { flexDirection: "row", gap: scale(SPACING.sm), marginTop: scale(SPACING.lg) },
  cancel: { flex: 1, paddingVertical: scale(9), borderRadius: scale(12), alignItems: "center", backgroundColor: COLORS.transparent, borderWidth: 1, borderColor: COLORS.borderLight },
  cancelText: { color: COLORS.textSecondary, fontSize: moderateScale(FONT_SIZES.sm), fontWeight: "600" },
  confirm: { flex: 1, paddingVertical: scale(9), borderRadius: scale(12), alignItems: "center", backgroundColor: COLORS.primary, shadowColor: COLORS.primary, shadowOpacity: 0.5, shadowRadius: scale(12), shadowOffset: { width: 0, height: 4 }, elevation: 8 },
  confirmText: { color: COLORS.white, fontSize: moderateScale(FONT_SIZES.sm), fontWeight: "700" },

  statusBanner: { borderWidth: 1, borderRadius: scale(12), paddingVertical: scale(SPACING.sm), paddingHorizontal: scale(SPACING.md), alignItems: "center", marginBottom: scale(SPACING.md) },
  statusBannerText: { fontSize: moderateScale(FONT_SIZES.sm), fontWeight: "800", letterSpacing: 0.4 },
  memberRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: scale(SPACING.sm), borderBottomWidth: 1, borderBottomColor: COLORS.border },
  memberName: { fontSize: moderateScale(FONT_SIZES.md), color: COLORS.text, fontWeight: "700", flex: 1 },
  memberRole: { fontSize: moderateScale(FONT_SIZES.xs), color: COLORS.textSecondary, fontWeight: "700" },

  sharePrimary: { backgroundColor: COLORS.primary, borderRadius: scale(12), paddingVertical: scale(SPACING.md), alignItems: "center", shadowColor: COLORS.primary, shadowOpacity: 0.5, shadowRadius: scale(12), shadowOffset: { width: 0, height: 4 }, elevation: 8 },
  sharePrimaryText: { color: COLORS.white, fontSize: moderateScale(FONT_SIZES.md), fontWeight: "700" },
  shareSecondary: { borderWidth: 1, borderColor: COLORS.borderLight, borderRadius: scale(12), paddingVertical: scale(SPACING.md), alignItems: "center", marginTop: scale(SPACING.sm) },
  shareSecondaryText: { color: COLORS.text, fontSize: moderateScale(FONT_SIZES.md), fontWeight: "600" },

  stackButtons: { marginTop: scale(SPACING.lg), gap: scale(SPACING.sm) },
  dangerBtn: { paddingVertical: scale(11), borderRadius: scale(12), alignItems: "center", backgroundColor: COLORS.transparent, borderWidth: 1, borderColor: COLORS.error },
  dangerBtnText: { color: COLORS.error, fontSize: moderateScale(FONT_SIZES.sm), fontWeight: "700" },
});
