// src/views/components/tournament/TeamJoinModal.tsx
// Floating "join this team" invite modal. Shows WHO invited you (captain + their
// Fargo) so you know whose team you're joining, then lets you set your OWN Fargo
// and claim the open partner slot. Pure UI — validation + join_team_by_token live
// in use.team.join.ts. Used by the /join deep link (floating over a dim backdrop)
// and the tournament-detail join banner.

import { useRef, useState } from "react";
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
import { TeamInviteInfo } from "../../../models/types/team.types";
import { ChipChartRange, chipsForRating } from "../../../utils/chip-chart";
import { ConfettiBurst, ConfettiBurstRef } from "../common/ConfettiBurst";

interface Props {
  visible: boolean;
  info: TeamInviteInfo | null;
  chipChart: ChipChartRange[];
  busy: boolean;
  onJoin: (fargo: number | null) => Promise<void> | void;
  onClose: () => void;
}

export function TeamJoinModal({ visible, info, chipChart, busy, onJoin, onClose }: Props) {
  const [fargoMode, setFargoMode] = useState<"enter" | "none">("enter");
  const [fargo, setFargo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [celebrating, setCelebrating] = useState(false);
  const confettiRef = useRef<ConfettiBurstRef>(null);

  const handleJoin = async () => {
    setError(null);
    const digits = fargo.replace(/\D/g, "");
    const f = fargoMode === "none" || digits === "" ? null : parseInt(digits, 10);
    try {
      await onJoin(f);
      // Celebrate, then close after the burst plays.
      setCelebrating(true);
      confettiRef.current?.fire();
      setTimeout(() => onClose(), 1700);
    } catch (e: any) {
      setError(e?.message ?? "Couldn't join the team. Please try again.");
    }
  };

  const captain = info?.captain_name ?? "A player";
  const teammateMeta =
    info?.captain_fargo != null ? `Teammate · Fargo ${info.captain_fargo}` : "Teammate · No Fargo yet";

  // Live team Fargo + chips as the invited player types.
  const enteredDigits = fargo.replace(/\D/g, "");
  const enteredFargo = fargoMode === "enter" && enteredDigits !== "" ? parseInt(enteredDigits, 10) : null;
  const inviterFargo = info?.captain_fargo ?? null;
  const canCompute = fargoMode === "enter" && enteredFargo != null && inviterFargo != null;
  const teamFargo = canCompute ? (inviterFargo as number) + (enteredFargo as number) : null;
  const hasChart = chipChart.length > 0;
  const chips = canCompute && hasChart ? chipsForRating(chipChart, teamFargo) : null;
  const joinDisabled = busy || (fargoMode === "enter" && enteredFargo == null);
  // No Fargo (or the inviter has no Fargo) → the TD determines rating + chips.
  const showTdNote = fargoMode === "none" || (fargoMode === "enter" && enteredFargo != null && inviterFargo == null);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={s.overlay}>
        <Pressable style={s.backdrop} onPress={() => Keyboard.dismiss()} />
        <Pressable style={s.card} onPress={() => Keyboard.dismiss()}>
          <Text allowFontScaling={false} style={s.title}>TEAM INVITE</Text>
          <Text allowFontScaling={false} style={s.subtitle}>{info?.tournament_name}</Text>

          <View style={s.captainRow}>
            <View style={s.avatar}>
              <Text allowFontScaling={false} style={s.avatarText}>
                {captain.charAt(0).toUpperCase()}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text allowFontScaling={false} style={s.captainName}>{captain}</Text>
              <Text allowFontScaling={false} style={s.captainMeta}>{teammateMeta}</Text>
            </View>
          </View>
          <Text allowFontScaling={false} style={s.body}>invited you to be their teammate.</Text>

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
          {canCompute && (
            <View style={s.summary}>
              <Text allowFontScaling={false} style={s.summaryLabel}>TEAM FARGO</Text>
              <Text allowFontScaling={false} style={s.summaryValue}>
                <Text style={s.summaryMuted}>{inviterFargo} + {enteredFargo} = </Text>
                <Text style={s.summaryBlue}>{teamFargo}</Text>
              </Text>
              {hasChart && (
                <>
                  <Text allowFontScaling={false} style={[s.summaryLabel, s.summaryLabelSpaced]}>TEAM CHIPS</Text>
                  <Text allowFontScaling={false} style={s.summaryBlue}>
                    {chips != null ? `${chips} Chip${chips !== 1 ? "s" : ""}` : "Chips require TD review."}
                  </Text>
                </>
              )}
            </View>
          )}

          {showTdNote ? (
            <Text allowFontScaling={false} style={s.tdNote}>
              Team rating and chips will be determined by the tournament director.
            </Text>
          ) : (
            <Text allowFontScaling={false} style={s.hint}>
              The tournament director confirms your Fargo when they approve the team.
            </Text>
          )}

          {error && <Text allowFontScaling={false} style={s.error}>{error}</Text>}

          <View style={s.buttons}>
            <TouchableOpacity style={s.cancel} onPress={onClose} disabled={busy || celebrating}>
              <Text allowFontScaling={false} style={s.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.join, (joinDisabled || celebrating) && s.joinOff]}
              onPress={handleJoin}
              disabled={joinDisabled || celebrating}
            >
              <Text allowFontScaling={false} style={s.joinText}>
                {celebrating ? "You're in! 🎉" : busy ? "Joining…" : "Join Team"}
              </Text>
            </TouchableOpacity>
          </View>
        </Pressable>
        <ConfettiBurst ref={confettiRef} />
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

  captainRow: { flexDirection: "row", alignItems: "center", gap: scale(SPACING.sm), marginTop: scale(SPACING.md) },
  avatar: { width: scale(40), height: scale(40), borderRadius: scale(20), backgroundColor: COLORS.primary + "33", alignItems: "center", justifyContent: "center" },
  avatarText: { color: COLORS.primaryLight, fontSize: moderateScale(FONT_SIZES.lg), fontWeight: "800" },
  captainName: { color: COLORS.text, fontSize: moderateScale(FONT_SIZES.md), fontWeight: "700" },
  captainMeta: { color: COLORS.textSecondary, fontSize: moderateScale(FONT_SIZES.xs), fontWeight: "600", marginTop: scale(1) },
  body: { fontSize: moderateScale(FONT_SIZES.sm), color: COLORS.textSecondary, marginTop: scale(SPACING.sm) },

  divider: { height: 1, backgroundColor: COLORS.border, marginVertical: scale(SPACING.md) },

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
  tdNote: { fontSize: moderateScale(FONT_SIZES.sm), color: COLORS.textSecondary, marginTop: scale(SPACING.sm), lineHeight: moderateScale(18) },
  summary: { backgroundColor: COLORS.surface, borderRadius: scale(12), borderWidth: 1, borderColor: COLORS.border, paddingVertical: scale(SPACING.sm), paddingHorizontal: scale(SPACING.md), marginTop: scale(SPACING.md) },
  summaryLabel: { fontSize: moderateScale(FONT_SIZES.xs), color: COLORS.textMuted, fontWeight: "700", letterSpacing: 1 },
  summaryLabelSpaced: { marginTop: scale(SPACING.sm) },
  summaryValue: { fontSize: moderateScale(FONT_SIZES.lg), fontWeight: "800", marginTop: scale(2) },
  summaryMuted: { color: COLORS.textSecondary, fontWeight: "700" },
  summaryBlue: { color: COLORS.primaryLight, fontSize: moderateScale(FONT_SIZES.lg), fontWeight: "800", marginTop: scale(2) },
  error: { fontSize: moderateScale(FONT_SIZES.sm), color: COLORS.error, marginTop: scale(SPACING.md), lineHeight: moderateScale(18) },

  buttons: { flexDirection: "row", gap: scale(SPACING.sm), marginTop: scale(SPACING.lg) },
  cancel: { flex: 1, paddingVertical: scale(10), borderRadius: scale(12), alignItems: "center", backgroundColor: COLORS.transparent, borderWidth: 1, borderColor: COLORS.borderLight },
  cancelText: { color: COLORS.textSecondary, fontSize: moderateScale(FONT_SIZES.sm), fontWeight: "600" },
  join: { flex: 1, paddingVertical: scale(10), borderRadius: scale(12), alignItems: "center", backgroundColor: COLORS.success, shadowColor: COLORS.success, shadowOpacity: 0.5, shadowRadius: scale(12), shadowOffset: { width: 0, height: 4 }, elevation: 8 },
  joinOff: { opacity: 0.45 },
  joinText: { color: COLORS.white, fontSize: moderateScale(FONT_SIZES.sm), fontWeight: "700" },
});
