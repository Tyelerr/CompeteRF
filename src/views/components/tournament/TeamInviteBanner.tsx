// src/views/components/tournament/TeamInviteBanner.tsx
// Self-contained "you've been invited to a team" banner + accept/decline modal.
// Drop it into any tournament-detail surface: it renders nothing unless the
// current user has a pending team invite for that tournament. Used on the
// tournament-detail route screen (where team-invite deep links / notifications
// land).

import { useState } from "react";
import { StyleSheet, Text, TouchableOpacity } from "react-native";
import { COLORS } from "../../../theme/colors";
import { RADIUS, SPACING } from "../../../theme/spacing";
import { FONT_SIZES } from "../../../theme/typography";
import { moderateScale, scale } from "../../../utils/scaling";
import { usePendingTeamInvite } from "../../../viewmodels/hooks/use.team.invite";
import { TeamInviteModal } from "./TeamInviteModal";

interface Props {
  tournamentId?: number;
  tournamentName?: string | null;
  playerId?: number;
}

export function TeamInviteBanner({ tournamentId, playerId }: Props) {
  const vm = usePendingTeamInvite(tournamentId, playerId);
  const [open, setOpen] = useState(false);

  if (!vm.invite) return null;
  const p = vm.invite.team?.profiles;
  const captain = p ? p.name || p.user_name : "A player";

  return (
    <>
      <TouchableOpacity style={s.banner} activeOpacity={0.8} onPress={() => setOpen(true)}>
        <Text allowFontScaling={false} style={s.title}>📩 You&apos;ve been invited to a team</Text>
        <Text allowFontScaling={false} style={s.sub}>{captain} invited you — tap to respond</Text>
      </TouchableOpacity>
      <TeamInviteModal
        visible={open}
        invite={vm.invite}
        busy={vm.busy}
        onAccept={vm.accept}
        onDecline={vm.decline}
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
  title: { color: COLORS.primaryLight, fontSize: moderateScale(FONT_SIZES.md), fontWeight: "800" },
  sub: { color: COLORS.textSecondary, fontSize: moderateScale(FONT_SIZES.sm), marginTop: scale(2) },
});
