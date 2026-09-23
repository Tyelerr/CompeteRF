// src/utils/player-dm-link.ts
// "Message Player" hand-off: the manager opens the EXISTING compose-message screen with the
// player already selected, so they never have to search (the composer's own recipient search is
// deliberately still limited to TDs / bar owners). Nothing is created until they press Send —
// this only builds the link. Pure.
export interface PlayerDmLinkInput {
  profileId: string | null | undefined; // the player's profile uuid (null for a guest)
  playerName: string;
  tournamentId: number;
  tournamentName: string;
  tableLabel?: string | null;
}

/** The compose-message URL, or null when the player has no account to message. */
export const buildPlayerDmLink = (input: PlayerDmLinkInput): string | null => {
  if (!input.profileId) return null;
  const q = new URLSearchParams({
    toId: input.profileId,
    toName: input.playerName,
    context: [input.tournamentName, input.tableLabel].filter(Boolean).join(" — "),
    tournamentId: String(input.tournamentId),
    tournamentName: input.tournamentName,
  });
  return `/compose-message?${q.toString()}`;
};
