// src/views/components/home/HomeMatchReadyCard.tsx
// Compact "MATCH READY" card at the top of Home while the player has a table assigned. Same
// actions and same state as Profile's YOU PLAY NEXT card and the notification modal — all three
// render from usePlayerMatchActions, so no match/race/check-in logic is duplicated here.
import { useState } from "react";
import { Alert, Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";
import { COLORS } from "../../../theme/colors";
import { RADIUS, SPACING } from "../../../theme/spacing";
import { FONT_SIZES } from "../../../theme/typography";
import { moderateScale, scale } from "../../../utils/scaling";
import { MatchIssueReason } from "../../../models/types/match-checkin.types";
import { useAuthStore } from "../../../viewmodels/stores/auth.store";
import { usePlayerMatchActions } from "../../../viewmodels/hooks/use.player.match.actions";
import { ActionMenu } from "../admin/ActionMenu";
import { MatchCheckInModal } from "../profile/MatchCheckInModal";

const isWeb = Platform.OS === "web";
const wxMs = (v: number) => (isWeb ? v : moderateScale(v));
const wxSc = (v: number) => (isWeb ? v : scale(v));

export const HomeMatchReadyCard = () => {
  const router = useRouter();
  const profile = useAuthStore((s) => s.profile);
  const actions = usePlayerMatchActions(profile?.id_auto ?? undefined);
  const [open, setOpen] = useState(false);

  // Only while there is a real table assignment to act on.
  if (!actions.context || !actions.isAssigned) return null;
  const c = actions.context;

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <View style={styles.dot} />
        <Text allowFontScaling={false} style={styles.kicker}>
          {c.isPlaying ? "MATCH IN PROGRESS" : "MATCH READY"}
        </Text>
        <Text allowFontScaling={false} style={styles.tourney} numberOfLines={1}>
          {c.tournamentName}
        </Text>
      </View>
      {!!c.tableLabel && (
        <Text allowFontScaling={false} style={styles.table} numberOfLines={1}>
          {c.tableLabel}
        </Text>
      )}
      <Text allowFontScaling={false} style={styles.meta} numberOfLines={1}>
        {c.opponentName ? `vs ${c.opponentName}` : c.roundLabel}
      </Text>
      <Text allowFontScaling={false} style={styles.meta} numberOfLines={2}>
        {c.raceText}
      </Text>

      <View style={styles.row}>
        <TouchableOpacity
          style={[styles.primary, (actions.busy || actions.checkedIn) && styles.disabled]}
          disabled={actions.busy || actions.checkedIn}
          onPress={() =>
            actions.checkIn().catch((e: Error) => Alert.alert("Check In", `Could not check in (${e.message}).`))
          }
          activeOpacity={0.85}
        >
          <Text allowFontScaling={false} style={styles.primaryText}>
            {actions.checkedIn ? "✓ Checked In" : "Check In"}
          </Text>
        </TouchableOpacity>
        <ActionMenu
          label="Options"
          triggerStyle={styles.optionsTrigger}
          triggerTextStyle={styles.optionsText}
          items={[
            { label: "Contact TD", onPress: () => setOpen(true) },
            {
              label: "View Bracket",
              // Same spectator route Profile's View Bracket uses, focused on this match.
              onPress: () =>
                router.push(
                  `/live-tournament/${c.tournamentId}?tab=matches&view=bracket&fk=${Date.now()}&from=home&focus=${c.matchId}` as never,
                ),
            },
          ]}
        />
      </View>

      <MatchCheckInModal
        visible={open}
        context={actions.context}
        checkedIn={actions.checkedIn}
        issueReason={actions.issueReason as MatchIssueReason | null}
        busy={actions.busy}
        onCheckIn={() =>
          actions.checkIn().catch((e: Error) => Alert.alert("Check In", `Could not check in (${e.message}).`))
        }
        onContactTd={(reason, message) =>
          actions
            .contactTd(reason, message)
            .catch((e: Error) => Alert.alert("Contact TD", `Could not send (${e.message}).`))
        }
        onClose={() => setOpen(false)}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    marginHorizontal: wxSc(SPACING.md),
    marginTop: wxSc(SPACING.sm),
    padding: wxSc(SPACING.md),
    borderRadius: wxSc(RADIUS.lg),
    borderWidth: 1,
    borderColor: COLORS.primary + "55",
    backgroundColor: COLORS.backgroundCard,
    gap: wxSc(2),
  },
  head: { flexDirection: "row", alignItems: "center", gap: wxSc(SPACING.xs) },
  dot: { width: wxSc(8), height: wxSc(8), borderRadius: wxSc(4), backgroundColor: COLORS.success },
  kicker: { fontSize: wxMs(FONT_SIZES.xs), fontWeight: "800", color: COLORS.primaryLight, letterSpacing: 0.5 },
  tourney: { flex: 1, textAlign: "right", fontSize: wxMs(FONT_SIZES.xs), color: COLORS.textSecondary, fontWeight: "700" },
  table: { fontSize: wxMs(FONT_SIZES.md), fontWeight: "800", color: COLORS.text },
  meta: { fontSize: wxMs(FONT_SIZES.xs), color: COLORS.textSecondary },
  row: { flexDirection: "row", alignItems: "center", gap: wxSc(SPACING.sm), marginTop: wxSc(SPACING.sm) },
  primary: {
    flex: 1,
    backgroundColor: COLORS.primary,
    borderRadius: wxSc(RADIUS.sm),
    paddingVertical: wxSc(SPACING.sm),
    alignItems: "center",
  },
  primaryText: { color: COLORS.white, fontSize: wxMs(FONT_SIZES.xs), fontWeight: "800" },
  disabled: { opacity: 0.5 },
  optionsTrigger: { height: wxSc(36), paddingHorizontal: wxSc(SPACING.md), borderRadius: wxSc(RADIUS.sm) },
  optionsText: { fontSize: wxMs(FONT_SIZES.xs), fontWeight: "800" },
});
