// src/views/components/common/AccessGate.tsx
// Client-side authorization UI for staff routes (defense in depth — RLS / RPCs stay
// authoritative). AccessDenied = the locked state; AccessChecking = neutral spinner while
// auth / the server check resolves (never flashes "denied" during hydration);
// TournamentManageGuard renders its children ONLY when the server confirms the signed-in user
// manages the tournament (can_manage_tournament), so an unauthorized TD who types another
// tournament's manage URL never mounts that tournament's hooks or controls.

import { useRouter } from "expo-router";
import { ReactNode } from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { COLORS } from "../../../theme/colors";
import { RADIUS, SPACING } from "../../../theme/spacing";
import { FONT_SIZES } from "../../../theme/typography";
import { webMs, webSc } from "../../../utils/scaling";
import { useCanManageTournament } from "../../../viewmodels/hooks/use.can.manage.tournament";

export const AccessChecking = () => (
  <View style={styles.center}>
    <ActivityIndicator color={COLORS.primary} />
  </View>
);

export const AccessDenied = ({
  message = "You don't have access to this page.",
  onRetry,
}: {
  message?: string;
  onRetry?: () => void;
}) => {
  const router = useRouter();
  return (
    <View style={styles.center}>
      <Text allowFontScaling={false} style={styles.emoji}>{"🔒"}</Text>
      <Text allowFontScaling={false} style={styles.title}>Access Denied</Text>
      <Text allowFontScaling={false} style={styles.subtitle}>{message}</Text>
      <View style={styles.row}>
        {onRetry ? (
          <TouchableOpacity style={[styles.btn, styles.btnGhost]} onPress={onRetry} activeOpacity={0.85}>
            <Text allowFontScaling={false} style={styles.btnGhostText}>Try Again</Text>
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity
          style={styles.btn}
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)" as never))}
          activeOpacity={0.85}
        >
          <Text allowFontScaling={false} style={styles.btnText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

export const TournamentManageGuard = ({
  tournamentId,
  children,
}: {
  tournamentId: number;
  children: ReactNode;
}) => {
  const { status, retry } = useCanManageTournament(tournamentId);
  if (status === "checking") return <AccessChecking />;
  if (status === "denied") {
    return (
      <AccessDenied
        message="You don't manage this tournament. Only its director, the venue's owners and directors, and Compete admins can open its management tools."
        onRetry={() => void retry()}
      />
    );
  }
  return <>{children}</>;
};

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: SPACING.xl,
    backgroundColor: COLORS.background,
  },
  emoji: { fontSize: webMs(48), marginBottom: SPACING.md },
  title: { fontSize: webMs(FONT_SIZES.xl), fontWeight: "700", color: COLORS.text, marginBottom: SPACING.sm },
  subtitle: {
    fontSize: webMs(FONT_SIZES.md),
    color: COLORS.textSecondary,
    textAlign: "center",
    maxWidth: webSc(420),
    marginBottom: SPACING.lg,
  },
  row: { flexDirection: "row", gap: SPACING.sm },
  btn: {
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.sm + SPACING.xs,
    paddingHorizontal: SPACING.lg,
  },
  btnText: { color: COLORS.white, fontWeight: "700", fontSize: webMs(FONT_SIZES.md) },
  btnGhost: { backgroundColor: "transparent", borderWidth: 1, borderColor: COLORS.border },
  btnGhostText: { color: COLORS.text, fontWeight: "600", fontSize: webMs(FONT_SIZES.md) },
});
