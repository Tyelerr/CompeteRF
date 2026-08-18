// src/utils/team.invite.ts
// Shared helpers for the Scotch-Doubles partner-invite link + message, used by
// both the player-facing TeamRegisterModal and the TD chip-manage "Invite Partner"
// flow so the wording and link format stay in one place.

// Public Universal/App Link that carries the team's invite token. Opening it
// routes to app/join/[id].tsx (native → TeamJoinModal; web → app-store bounce).
export function teamInviteLink(tournamentId: number | string, token: string): string {
  return `https://www.thecompeteapp.com/join/${tournamentId}?invite=${token}`;
}

// The share/SMS body. Includes the inviting player's name, the tournament name,
// a clear call to action, and the deep link.
export function teamInviteMessage(
  inviterName: string | null | undefined,
  tournamentName: string | null | undefined,
  link: string,
): string {
  const who = (inviterName ?? "").trim() || "A teammate";
  const what = (tournamentName ?? "").trim() || "a tournament";
  return `${who} invited you to join their team for ${what} on Compete. Tap here to accept: ${link}`;
}
