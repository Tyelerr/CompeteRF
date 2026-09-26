// src/views/screens/chip-recovery/chip-recovery.screen.tsx
// WEB-ONLY offline disaster-recovery viewer for a Chip tournament's LOCAL backup
// (route /chip-recovery/[id], deliberately outside /admin). Reached from the app-root
// "Local tournament backup available" card when the cloud/profile can't load.
//   • Shows only this browser's backup, READ-ONLY (useChipTournament recoveryOnly: no cloud
//     call on open, every mutation refused, the save queue paused).
//   • Grants nothing: no Admin navigation, no role, no Supabase access beyond the user's own
//     (possibly expired) session.
//   • When the cloud is usable again (Retry / auth recovers → consistent, or the TD picks
//     "Use Cloud Version") it hands over to the normal Admin manage screen.

import { Redirect, useRouter } from "expo-router";
import { Platform } from "react-native";
import { useAuthContext } from "../../../providers/AuthProvider";
import { ChipManageScreen } from "../admin/chip/chip-manage.screen";

export const ChipRecoveryScreen = ({ id }: { id: number }) => {
  const router = useRouter();
  const { profile, refreshProfile } = useAuthContext();
  if (Platform.OS !== "web" || !Number.isFinite(id)) return <Redirect href="/" />;
  return (
    <ChipManageScreen
      id={id}
      recoveryOnly
      // Auth recovering (profile loads) re-runs the cloud check via the screen's reload signal
      // (the VM routes any reload while viewing a backup to the pause→load→compare check).
      reloadSignal={profile ? 1 : 0}
      onCloudRecovered={() => {
        void refreshProfile().finally(() =>
          router.replace(`/(tabs)/admin/manage-tournament/${id}` as any),
        );
      }}
    />
  );
};
