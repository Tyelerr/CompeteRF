// app/(tabs)/admin/chip-tournament/[id].tsx
// Thin route wrapper — the Chip Tournament manage flow (Setup / Live / Results). Mounts only
// once the server confirms this user manages the tournament (TournamentManageGuard).

import { useLocalSearchParams } from "expo-router";
import { TournamentManageGuard } from "../../../../src/views/components/common/AccessGate";
import { ChipManageScreen } from "../../../../src/views/screens/admin/chip/chip-manage.screen";

export default function ChipTournamentRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <TournamentManageGuard tournamentId={Number(id)}>
      <ChipManageScreen id={Number(id)} />
    </TournamentManageGuard>
  );
}
