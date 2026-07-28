// src/views/components/tournament/TeamJoinBanner.tsx
// Self-contained "join this team" banner for the tournament-detail screen when
// opened with an ?invite=<token> param. Renders nothing without a valid token;
// shows a friendly notice if the invite is invalid / full / ended; otherwise a
// tappable banner that opens the shared TeamJoinModal.

import { useState } from "react";
import { StyleSheet, Text, TouchableOpacity } from "react-native";
import { COLORS } from "../../../theme/colors";
import { RADIUS, SPACING } from "../../../theme/spacing";
import { FONT_SIZES } from "../../../theme/typography";
import { moderateScale, scale } from "../../../utils/scaling";
import { useTeamJoin } from "../../../viewmodels/hooks/use.team.join";
import { TeamJoinModal } from "./TeamJoinModal";

export function TeamJoinBanner({ token }: { token?: string }) {
  const vm = useTeamJoin(token);
  const [open, setOpen] = useState(false);

  if (!token || !vm.info) return null;

  if (vm.joined || vm.info.team_status === "registered") {
    return (
      <Text allowFontScaling={false} style={[s.banner, s.bannerOk, s.okText]}>✓ You&apos;re on the team!</Text>
    );
  }

  if (!vm.info.is_valid) {
    return (
      <Text allowFontScaling={false} style={[s.banner, s.bannerWarn, s.warnText]}>{vm.info.reason}</Text>
    );
  }

  return (
    <>
      <TouchableOpacity style={s.banner} activeOpacity={0.8} onPress={() => setOpen(true)}>
        <Text allowFontScaling={false} style={s.title}>🤝 Join {vm.info.captain_name}&apos;s team</Text>
        <Text allowFontScaling={false} style={s.sub}>{vm.info.tournament_name} — tap to join</Text>
      </TouchableOpacity>
      <TeamJoinModal
        visible={open}
        info={vm.info}
        chipChart={vm.chipChart}
        busy={vm.busy}
        onJoin={vm.join}
        onClose={() => setOpen(false)}
      />
    </>
  );
}

const s = StyleSheet.create({
  banner: {
    backgroundColor: COLORS.primary + "1F",
    borderWidth: 1,
    borderColor: COLORS.primary,
    borderRadius: scale(RADIUS.md),
    paddingVertical: scale(SPACING.md),
    paddingHorizontal: scale(SPACING.md),
    marginBottom: scale(SPACING.md),
  },
  bannerOk: { backgroundColor: COLORS.success + "1F", borderColor: COLORS.success },
  bannerWarn: { backgroundColor: COLORS.warning + "1F", borderColor: COLORS.warning },
  title: { color: COLORS.primaryLight, fontSize: moderateScale(FONT_SIZES.md), fontWeight: "800" },
  sub: { color: COLORS.textSecondary, fontSize: moderateScale(FONT_SIZES.sm), marginTop: scale(2) },
  okText: { color: COLORS.success, fontSize: moderateScale(FONT_SIZES.md), fontWeight: "800" },
  warnText: { color: COLORS.warning, fontSize: moderateScale(FONT_SIZES.sm), fontWeight: "700" },
});
