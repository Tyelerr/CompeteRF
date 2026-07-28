// app/join/[id].tsx
// Landing route for the shareable HTTPS invite link:
//   https://www.thecompeteapp.com/join/<tournamentId>?invite=<token>
// This is the Universal Link (iOS) / App Link (Android) target.
//
//  • Native (app open): the OS routed the link into the app — forward into the
//    tournament, where the invited player sees their pending invite.
//  • Mobile web (iPhone/Android browser): the invite must NEVER be completed in
//    a mobile browser. Immediately try to open the native app; if it isn't
//    installed, bounce to the App Store / Google Play. No usable web fallback.
//  • Desktop web: show the informational landing page (tournament + invite info).
//
// competerf:// is used only as an internal fallback here — never in an SMS.

import { useCallback, useEffect, useState } from "react";
import { Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Linking from "expo-linking";
import { COLORS } from "../../src/theme/colors";
import { SPACING } from "../../src/theme/spacing";
import { FONT_SIZES } from "../../src/theme/typography";
import { moderateScale, scale } from "../../src/utils/scaling";
import { teamService } from "../../src/models/services/team.service";
import { tournamentService } from "../../src/models/services/tournament.service";
import { TeamInviteInfo } from "../../src/models/types/team.types";
import { useTeamJoin } from "../../src/viewmodels/hooks/use.team.join";
import { TeamJoinModal } from "../../src/views/components/tournament/TeamJoinModal";

// Native deep link → a floating invite modal over a dim backdrop (not the full
// tournament page). After joining / dismissing, drop into the tournament.
function NativeJoin({ id, token }: { id?: string; token?: string }) {
  const router = useRouter();
  const vm = useTeamJoin(token);
  const leave = useCallback(() => {
    router.replace((id ? `/tournament-detail?id=${id}` : "/") as any);
  }, [id, router]);

  useEffect(() => {
    if (!token) leave();
    else if (vm.info && !vm.info.is_valid) leave();
  }, [token, vm.info, leave]);

  return (
    <View style={js.nativePage}>
      <TeamJoinModal
        visible={!!vm.info?.is_valid && !vm.joined}
        info={vm.info}
        chipChart={vm.chipChart}
        busy={vm.busy}
        onJoin={vm.join}
        onClose={leave}
      />
    </View>
  );
}

const js = StyleSheet.create({
  nativePage: { flex: 1, backgroundColor: COLORS.background },
});

const APP_STORE_URL = "https://apps.apple.com/us/app/compete-tournaments/id6759150538";
const PLAY_STORE_URL =
  "https://play.google.com/store/apps/details?id=com.thecompeteapp.competerf";

const uaFlags = () => {
  if (typeof navigator === "undefined") return { isIOS: false, isAndroid: false, isMobile: false };
  const ua = navigator.userAgent || "";
  const isIOS = /iPhone|iPad|iPod/i.test(ua);
  const isAndroid = /Android/i.test(ua);
  return { isIOS, isAndroid, isMobile: isIOS || isAndroid };
};

export default function JoinInviteScreen() {
  const params = useLocalSearchParams<{ id?: string; invite?: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const token = Array.isArray(params.invite) ? params.invite[0] : params.invite;

  const { isIOS, isMobile } = uaFlags();
  const storeUrl = isIOS ? APP_STORE_URL : PLAY_STORE_URL;

  const [info, setInfo] = useState<TeamInviteInfo | null>(null);
  const [name, setName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Preserve the invite so it survives an install/login round-trip.
  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;
    try {
      if (token) window.localStorage.setItem("pendingTeamInvite", JSON.stringify({ id, token }));
    } catch {
      /* private mode / storage disabled */
    }
  }, [id, token]);

  // Mobile web: try to open the app, then bounce to the store. The invite is
  // never completed in the browser.
  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;
    if (!isMobile) return;

    const appUrl = `competerf://tournament-detail?id=${id}`;
    const t = setTimeout(() => {
      window.location.href = storeUrl;
    }, 1500);
    // If the app opened, the page is backgrounded — cancel the store redirect.
    const onHide = () => {
      if (document.visibilityState === "hidden") clearTimeout(t);
    };
    document.addEventListener("visibilitychange", onHide);
    try {
      window.location.href = appUrl;
    } catch {
      /* scheme not handled — the store timeout still fires */
    }
    return () => {
      clearTimeout(t);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, [id, isMobile, storeUrl]);

  // Desktop web only: fetch invite info for the informational page.
  useEffect(() => {
    if (Platform.OS !== "web" || isMobile) return;
    let alive = true;
    (async () => {
      try {
        if (token) {
          const res = await teamService.getInviteByToken(token);
          if (alive) setInfo(res);
        } else if (id) {
          const t = await tournamentService.getTournament(Number(id));
          if (alive) setName(t?.name ?? null);
        }
      } catch {
        /* fall back to generic copy */
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [id, token, isMobile]);

  // Native: show the floating invite modal directly (not the full tournament page).
  if (Platform.OS !== "web") {
    return <NativeJoin id={id} token={token} />;
  }

  // Mobile web: a minimal "opening the app" splash — NOT the invite page.
  if (isMobile) {
    return (
      <View style={s.page}>
        <View style={s.card}>
          <Text allowFontScaling={false} style={s.brand}>🎱 COMPETE</Text>
          <Text allowFontScaling={false} style={s.heading}>Opening the Compete app…</Text>
          <Text allowFontScaling={false} style={s.body}>
            Team invites are handled in the Compete app. If it doesn&apos;t open automatically, install
            it below and reopen this link.
          </Text>
          <TouchableOpacity style={s.primaryBtn} onPress={() => Linking.openURL(storeUrl)}>
            <Text allowFontScaling={false} style={s.primaryText}>
              {isIOS ? "Get Compete on the App Store" : "Get Compete on Google Play"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Desktop web: informational landing page.
  const tournamentName = info?.tournament_name ?? name ?? "a tournament";
  const invalidReason = info && !info.is_valid ? info.reason : null;

  return (
    <View style={s.page}>
      <View style={s.card}>
        <Text allowFontScaling={false} style={s.brand}>🎱 COMPETE</Text>
        <Text allowFontScaling={false} style={s.heading}>You&apos;re invited to join a team</Text>
        <Text allowFontScaling={false} style={s.tournament}>{tournamentName}</Text>
        {info?.captain_name ? (
          <Text allowFontScaling={false} style={s.sub}>{info.captain_name} invited you to be their partner.</Text>
        ) : null}

        {loading ? (
          <Text allowFontScaling={false} style={s.sub}>Loading invite…</Text>
        ) : invalidReason ? (
          <View style={s.notice}>
            <Text allowFontScaling={false} style={s.noticeText}>{invalidReason}</Text>
          </View>
        ) : (
          <>
            <Text allowFontScaling={false} style={s.body}>
              Open Compete on your phone to accept the invite and set your Fargo. Scan the link on your
              iPhone or Android device to get started.
            </Text>
            <View style={s.stores}>
              <TouchableOpacity style={s.storeBtn} onPress={() => Linking.openURL(APP_STORE_URL)}>
                <Text allowFontScaling={false} style={s.storeText}>Download on the App Store</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.storeBtn} onPress={() => Linking.openURL(PLAY_STORE_URL)}>
                <Text allowFontScaling={false} style={s.storeText}>Get it on Google Play</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: COLORS.background, alignItems: "center", justifyContent: "center", padding: scale(SPACING.lg) },
  card: {
    width: "100%",
    maxWidth: 460,
    backgroundColor: COLORS.backgroundCard,
    borderRadius: scale(22),
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    padding: scale(SPACING.lg),
  },
  brand: { color: COLORS.primaryLight, fontSize: moderateScale(FONT_SIZES.sm), fontWeight: "800", letterSpacing: 2 },
  heading: { color: COLORS.text, fontSize: moderateScale(FONT_SIZES.lg), fontWeight: "800", marginTop: scale(SPACING.md) },
  tournament: { color: COLORS.primaryLight, fontSize: moderateScale(FONT_SIZES.xxl), fontWeight: "800", marginTop: scale(SPACING.xs) },
  sub: { color: COLORS.textSecondary, fontSize: moderateScale(FONT_SIZES.sm), marginTop: scale(SPACING.sm) },
  body: { color: COLORS.textSecondary, fontSize: moderateScale(FONT_SIZES.md), lineHeight: moderateScale(22), marginTop: scale(SPACING.md) },
  notice: { backgroundColor: COLORS.warning + "22", borderColor: COLORS.warning, borderWidth: 1, borderRadius: scale(12), padding: scale(SPACING.md), marginTop: scale(SPACING.md) },
  noticeText: { color: COLORS.warning, fontSize: moderateScale(FONT_SIZES.md), fontWeight: "700" },
  primaryBtn: { backgroundColor: COLORS.primary, borderRadius: scale(12), paddingVertical: scale(SPACING.md), alignItems: "center", marginTop: scale(SPACING.lg) },
  primaryText: { color: COLORS.white, fontSize: moderateScale(FONT_SIZES.md), fontWeight: "700" },
  stores: { flexDirection: "row", gap: scale(SPACING.sm), marginTop: scale(SPACING.md) },
  storeBtn: { flex: 1, borderWidth: 1, borderColor: COLORS.borderLight, borderRadius: scale(12), paddingVertical: scale(SPACING.md), alignItems: "center" },
  storeText: { color: COLORS.text, fontSize: moderateScale(FONT_SIZES.sm), fontWeight: "600", textAlign: "center" },
});
