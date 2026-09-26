// src/viewmodels/hooks/use.chip.offline.recovery.ts
// WEB-ONLY app-root entry point to local Chip backups when the cloud profile can't load
// (e.g. browser/computer restarted while the venue internet or Supabase is down). It never
// fakes a session or a role: it only lists backups owned by the Supabase session STORED on
// this browser and opens them in the read-only /chip-recovery viewer. Rules live in
// decideOfflineRecoveryEntry (chip.local-recovery.ts).

import { usePathname, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Platform } from "react-native";
import {
  ChipRecoverySnapshot,
  chipRecoveryPath,
  decideOfflineRecoveryEntry,
  getChipLocalRecovery,
} from "../../models/services/chip.local-recovery";
import { cloudStatusService } from "../../models/services/cloud.status.service";
import { useAuthContext } from "../../providers/AuthProvider";

const PROBE_INTERVAL_MS = 20_000;

export const useChipOfflineRecoveryEntry = () => {
  const { loading, profile, user, refreshProfile } = useAuthContext();
  const router = useRouter();
  const pathname = usePathname();
  const isWeb = Platform.OS === "web";
  // Only when auth settled WITHOUT a profile — a loaded profile means normal navigation works.
  const eligible = isWeb && !loading && !profile;
  const storedUserId = useMemo(
    () => (eligible ? cloudStatusService.getStoredAuthUserId() : null),
    [eligible],
  );
  const [backups, setBackups] = useState<ChipRecoverySnapshot[]>([]);
  const [cloudReachable, setCloudReachable] = useState<boolean | null>(null);

  useEffect(() => {
    if (!eligible || !storedUserId) return;
    const store = getChipLocalRecovery();
    if (!store) return;
    let alive = true;
    let timer: ReturnType<typeof setInterval> | null = null;
    const probe = () =>
      cloudStatusService.probeCloud().then((ok) => {
        if (alive) setCloudReachable(ok);
      });
    store
      .listTournamentBackups(storedUserId)
      .catch(() => [] as ChipRecoverySnapshot[])
      .then((list) => {
        if (!alive) return;
        setBackups(list);
        if (!list.length) return; // nothing to recover → never probe, never show
        void probe();
        timer = setInterval(() => void probe(), PROBE_INTERVAL_MS);
      });
    const onNetChange = () => void probe();
    window.addEventListener("online", onNetChange);
    window.addEventListener("offline", onNetChange);
    return () => {
      alive = false;
      if (timer) clearInterval(timer);
      window.removeEventListener("online", onNetChange);
      window.removeEventListener("offline", onNetChange);
    };
  }, [eligible, storedUserId]);

  // Cloud reachable again with a live session but no profile → re-hydrate the real profile
  // (normal auth; restores Admin navigation). An expired session is refreshed by supabase-js.
  // (refreshProfile isn't memoized upstream — read it through a ref so this fires only when
  // reachability/user change, never on every render.)
  const refreshRef = useRef(refreshProfile);
  useEffect(() => {
    refreshRef.current = refreshProfile;
  });
  const userId = user?.id ?? null;
  useEffect(() => {
    if (eligible && cloudReachable && userId) void refreshRef.current();
  }, [eligible, cloudReachable, userId]);

  const decision = decideOfflineRecoveryEntry({
    isWeb,
    authLoading: loading,
    hasProfile: !!profile,
    storedUserId,
    backups,
    cloudReachable,
  });
  // Hidden where a Chip screen already shows its own recovery prompt/viewer.
  const onRecoveryRoute =
    pathname.startsWith("/chip-recovery") ||
    pathname.startsWith("/admin/manage-tournament/") ||
    pathname.startsWith("/admin/chip-tournament/");
  const open = useCallback((tournamentId: number) => router.push(chipRecoveryPath(tournamentId) as any), [router]);
  return { show: decision.show && !onRecoveryRoute, backups: decision.backups, open };
};
