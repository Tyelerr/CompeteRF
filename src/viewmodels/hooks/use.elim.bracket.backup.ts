// src/viewmodels/hooks/use.elim.bracket.backup.ts
// Actions → "Download Latest Bracket" (Single + Double Elimination): an on-demand, printable PDF
// of the bracket's current state as a manual disaster-recovery backup.
//
//   • Online: re-reads the tournament + tables from the cloud at the moment of the tap (the newest
//     revision, even if this screen is behind) through the normal permission model.
//   • Offline: only the validated local recovery copy (use.elim.offline) — labelled "OFFLINE
//     BACKUP · Last synced …" — never called "latest". No local copy → disabled with a reason.
//   • READ / EXPORT ONLY: no tournament write, no revision bump, no restore point, no audit row,
//     no activity, nothing uploaded or stored server-side. Generated client-side (src/utils/
//     elim-bracket-pdf.ts) and handed to the platform's save / share (src/utils/save-pdf-file).

import { useCallback, useState } from "react";
import { tournamentService } from "../../models/services/tournament.service";
import { tournamentTableService } from "../../models/services/tournament-table.service";
import { registrationService } from "../../models/services/registration.service";
import { elimLocalRecoveryService } from "../../models/services/elim-local-recovery.service";
import { Tournament } from "../../models/types/tournament.types";
import { GeneratedBracket, MatchLiveState } from "../../models/types/tournament-settings.types";
import { TournamentTable } from "../../models/types/tournament-table.types";
import { raceConfigFromLiveSettings } from "../../utils/bracket.utils";
import { ConnectionRequiredError, toConnectionAwareError } from "../../utils/connection-required";
import {
  BRACKET_BACKUP_NO_BRACKET,
  BRACKET_BACKUP_NO_LOCAL,
  BracketBackupMode,
  bracketBackupAvailability,
  buildElimBracketPdf,
} from "../../utils/elim-bracket-pdf";
import { buildLiveMatches } from "../../utils/match.utils";
import { savePdfFile, SavePdfResult } from "../../utils/save-pdf-file";
import { liveEngineFor } from "../../utils/tournament-formats";
import {
  BackupRegistration,
  buildBackupPayouts,
  buildBackupRoster,
  compactRegistrations,
} from "../../utils/elim-bracket-summary";
import { useAuthStore } from "../stores/auth.store";
import type { ElimOfflineStatus } from "./use.elim.offline";

type Source = {
  tournament: Tournament;
  tables: TournamentTable[];
  registrations: BackupRegistration[] | null; // null = not available (older offline copy)
  mode: BracketBackupMode;
  syncedAt: Date | null;
};

export function useElimBracketBackup(
  tournamentId: number | null | undefined,
  conn: { offline: boolean; status: ElimOfflineStatus; local: { revision: number; savedAt: string } | null },
) {
  const ownerId = useAuthStore((s) => s.profile?.id ?? null);
  const [busy, setBusy] = useState(false);
  const availability = bracketBackupAvailability(conn);

  const readLocal = useCallback(async (): Promise<Source | null> => {
    if (!tournamentId || !ownerId) return null;
    const rec = await elimLocalRecoveryService.read(tournamentId, ownerId);
    if (!rec) return null;
    return {
      tournament: rec.tournament as unknown as Tournament,
      tables: (rec.tables ?? []) as TournamentTable[],
      registrations: rec.registrations ?? null,
      mode: "offline",
      syncedAt: new Date(rec.savedAt),
    };
  }, [tournamentId, ownerId]);

  const download = useCallback(async (): Promise<SavePdfResult> => {
    if (!tournamentId) return { ok: false, message: BRACKET_BACKUP_NO_BRACKET };
    if (availability.kind === "unavailable") return { ok: false, message: BRACKET_BACKUP_NO_LOCAL };
    setBusy(true);
    try {
      let src: Source | null = null;
      if (availability.kind === "latest") {
        try {
          const [t, tables, regs] = await Promise.all([
            tournamentService.getTournament(tournamentId),
            tournamentTableService.getTables(tournamentId).catch(() => [] as TournamentTable[]),
            registrationService.getRegistrations(tournamentId).catch(() => null),
          ]);
          if (t) src = { tournament: t, tables, registrations: regs ? compactRegistrations(regs) : null, mode: "latest", syncedAt: null };
        } catch (e) {
          // The connection dropped since the button was shown → the last synced copy, labelled so.
          if (!(toConnectionAwareError(e) instanceof ConnectionRequiredError)) throw e;
          src = await readLocal();
          if (!src) return { ok: false, message: BRACKET_BACKUP_NO_LOCAL };
        }
      } else {
        src = await readLocal();
        if (!src) return { ok: false, message: BRACKET_BACKUP_NO_LOCAL };
      }
      if (!src) return { ok: false, message: "Couldn't load this tournament. Please try again." };

      const t = src.tournament;
      const engine = liveEngineFor(t.tournament_format);
      const bracket = (t.live_settings?.bracket ?? null) as GeneratedBracket | null;
      if ((engine !== "single" && engine !== "double") || !bracket?.graph || !bracket.seeds) {
        return { ok: false, message: BRACKET_BACKUP_NO_BRACKET };
      }
      const matches = buildLiveMatches(
        bracket,
        (t.live_settings?.matchState ?? {}) as Record<string, MatchLiveState>,
        src.tables,
        t.game_type ?? "",
        raceConfigFromLiveSettings(t.live_settings),
      );
      const pdf = buildElimBracketPdf({
        tournamentName: t.name ?? "Tournament",
        doubleElim: engine === "double",
        tournamentDate: t.tournament_date ?? null,
        players: bracket.players ?? bracket.seeds.filter(Boolean).length,
        revision: t.live_revision ?? null,
        graph: bracket.graph,
        matches,
        mode: src.mode,
        generatedAt: new Date(),
        lastSyncedAt: src.syncedAt,
        bracketSize: bracket.bracketSize ?? bracket.seeds.length,
        sidePotNames: (t.side_pots ?? []).map((p) => (p.name ?? "").trim()).filter(Boolean),
        payouts: buildBackupPayouts(t, src.registrations ?? [], matches),
        roster: src.registrations ? buildBackupRoster(src.registrations, matches, bracket) : null,
      });
      return await savePdfFile(pdf.bytes, pdf.fileName);
    } catch (e) {
      if (toConnectionAwareError(e) instanceof ConnectionRequiredError)
        return { ok: false, message: "The connection dropped while loading the bracket. Try again." };
      return { ok: false, message: e instanceof Error && e.message ? e.message : "Couldn't create the bracket PDF." };
    } finally {
      setBusy(false);
    }
  }, [tournamentId, availability.kind, readLocal]);

  return { availability, busy, download };
}
