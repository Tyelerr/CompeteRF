// src/views/components/tournament/TeamInviteModal.tsx
// The invited partner's accept/decline surface. They enter THEIR OWN Fargo and
// accept (locks the team) or decline (frees the slot). Pure UI — state + the
// respond RPC live in use.team.invite.ts. Reached from the tournament detail
// (banner) or a team-invite push/inbox notification's deep link.

import { useState } from "react";
import {
  Keyboard,
  Modal,
  Pressable,
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
import { TeamInvite } from "../../../models/types/team.types";

interface Props {
  visible: boolean;
  invite: TeamInvite | null;
  busy: boolean;
  onAccept: (fargo: number | null) => Promise<void> | void;
  onDecline: () => Promise<void> | void;
  onClose: () => void;
}

const captainName = (invite: TeamInvite | null): string => {
  const p = invite?.team?.profiles;
  return p ? p.name || p.user_name : "A player";
};

export function TeamInviteModal({ visible, invite, busy, onAccept, onDecline, onClose }: Props) {
  const [fargoMode, setFargoMode] = useState<"enter" | "none">("enter");
  const [fargo, setFargo] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleAccept = async () => {
    setError(null);
    const digits = fargo.replace(/\D/g, "");
    const f = fargoMode === "none" || digits === "" ? null : parseInt(digits, 10);
    try {
      await onAccept(f);
      onClose();
    } catch (e: any) {
      setError(e?.message ?? "Couldn't accept the invite. Please try again.");
    }
  };

  const handleDecline = async () => {
    setError(null);
    try {
      await onDecline();
      onClose();
    } catch (e: any) {
      setError(e?.message ?? "Couldn't decline the invite.");
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={s.overlay}>
        <Pressable style={s.backdrop} onPress={() => Keyboard.dismiss()} />
        <Pressable style={s.card} onPress={() => Keyboard.dismiss()}>
          <Text allowFontScaling={false} style={s.title}>TEAM INVITE</Text>
          <Text allowFontScaling={false} style={s.subtitle}>{invite?.tournament?.name}</Text>
          <Text allowFontScaling={false} style={s.body}>
            {captainName(invite)} invited you to be their partner.
          </Text>
          <View style={s.divider} />

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
                value={fargo}
                onChangeText={(v) => setFargo(v.replace(/\D/g, ""))}
                keyboardType="number-pad"
                placeholder="500"
                placeholderTextColor={COLORS.textMuted}
                maxLength={4}
              />
            </View>
          )}
          <Text allowFontScaling={false} style={s.hint}>
            The tournament director confirms your Fargo when they approve the team.
          </Text>

          {error && <Text allowFontScaling={false} style={s.error}>{error}</Text>}

          <View style={s.buttons}>
            <TouchableOpacity style={s.decline} onPress={handleDecline} disabled={busy}>
              <Text allowFontScaling={false} style={s.declineText}>Decline</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.accept} onPress={handleAccept} disabled={busy}>
              <Text allowFontScaling={false} style={s.acceptText}>{busy ? "Working…" : "Accept"}</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity style={s.later} onPress={onClose} disabled={busy}>
            <Text allowFontScaling={false} style={s.laterText}>Decide later</Text>
          </TouchableOpacity>
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
  body: { fontSize: moderateScale(FONT_SIZES.sm), color: COLORS.textSecondary, marginTop: scale(SPACING.xs), lineHeight: moderateScale(18) },
  divider: { height: 1, backgroundColor: COLORS.border, marginVertical: scale(SPACING.sm) },

  label: { fontSize: moderateScale(FONT_SIZES.xs), color: COLORS.textSecondary, fontWeight: "700", letterSpacing: 0.4, marginBottom: scale(SPACING.sm) },
  radioRow: { flexDirection: "row", gap: scale(SPACING.lg), marginBottom: scale(SPACING.sm) },
  radioOpt: { flexDirection: "row", alignItems: "center", gap: scale(SPACING.sm), paddingVertical: scale(SPACING.xs) },
  radioDot: { width: scale(20), height: scale(20), borderRadius: scale(10), borderWidth: 2, borderColor: COLORS.borderLight, alignItems: "center", justifyContent: "center" },
  radioDotOn: { borderColor: COLORS.primaryLight },
  radioInner: { width: scale(10), height: scale(10), borderRadius: scale(5), backgroundColor: COLORS.primaryLight },
  radioLabel: { fontSize: moderateScale(FONT_SIZES.sm), color: COLORS.text, fontWeight: "600" },

  numField: { flexDirection: "row", alignItems: "center", gap: scale(SPACING.xs), width: "55%", height: scale(50), backgroundColor: COLORS.surfaceLight, borderWidth: 1.5, borderColor: COLORS.border, borderRadius: scale(12), paddingHorizontal: scale(SPACING.md) },
  hash: { fontSize: moderateScale(FONT_SIZES.md), fontWeight: "700", color: COLORS.textMuted },
  numInput: { flex: 1, height: "100%", color: COLORS.text, fontSize: moderateScale(FONT_SIZES.md), fontWeight: "600" },
  hint: { fontSize: moderateScale(FONT_SIZES.xs), color: COLORS.textMuted, marginTop: scale(SPACING.sm) },

  error: { fontSize: moderateScale(FONT_SIZES.sm), color: COLORS.error, marginTop: scale(SPACING.md), lineHeight: moderateScale(18) },

  buttons: { flexDirection: "row", gap: scale(SPACING.sm), marginTop: scale(SPACING.lg) },
  decline: { flex: 1, paddingVertical: scale(10), borderRadius: scale(12), alignItems: "center", backgroundColor: COLORS.transparent, borderWidth: 1, borderColor: COLORS.error },
  declineText: { color: COLORS.error, fontSize: moderateScale(FONT_SIZES.sm), fontWeight: "700" },
  accept: { flex: 1, paddingVertical: scale(10), borderRadius: scale(12), alignItems: "center", backgroundColor: COLORS.success, shadowColor: COLORS.success, shadowOpacity: 0.5, shadowRadius: scale(12), shadowOffset: { width: 0, height: 4 }, elevation: 8 },
  acceptText: { color: COLORS.white, fontSize: moderateScale(FONT_SIZES.sm), fontWeight: "700" },
  later: { alignItems: "center", paddingVertical: scale(SPACING.sm), marginTop: scale(SPACING.xs) },
  laterText: { color: COLORS.textMuted, fontSize: moderateScale(FONT_SIZES.sm), fontWeight: "600" },
});
