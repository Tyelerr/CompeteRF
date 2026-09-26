// app/chip-recovery/[id].tsx
// Thin route wrapper — WEB-ONLY read-only viewer for a Chip tournament's local backup
// (offline disaster recovery). Outside /admin on purpose; see chip-recovery.screen.tsx.

import { useLocalSearchParams } from "expo-router";
import { ChipRecoveryScreen } from "../../src/views/screens/chip-recovery/chip-recovery.screen";

export default function ChipRecoveryRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ChipRecoveryScreen id={Number(id)} />;
}
