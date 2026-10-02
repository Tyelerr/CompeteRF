# Scotch Doubles in Elimination — architecture proposal

Status: **proposal, not implemented** (2026-10 hardening pass). Until it ships, a Scotch Doubles
*elimination* draw is refused with an explanation when app-registered teams exist
(`scotchElimDrawBlock`, `src/utils/bracket.utils.ts`), instead of silently drawing without them.
Prod check (2026-10-02): the only two scotch elimination events (ids 72, 654) have never been
run (0 teams, 0 registrations), so no live event is affected.

## Why it doesn't work today

| Layer | Singles elimination | Scotch Doubles registration |
|---|---|---|
| Registration | `tournament_players` row per player | `tournament_teams` (+ `tournament_team_members`): captain + partner, own `checked_in` / `paid` / `approved`, member Fargo |
| Ready / draw input | `hub.registrations` (`tournament_players`, status `checked_in`) → `DrawPlayer { registrationId, name, fargo }` | **never read** — teams are invisible to the draw |
| Bracket identity | `seeds[].registrationId` = `tournament_players.id` | — |
| Player scoring / start | `submit_match_state`, `match_player_start` authorize via `tournament_players` (`player_id` / `player_uuid` ∈ match p1/p2) | partner and captain both unauthorized |
| Eliminations | `sync_tournament_eliminations` writes `tournament_players.eliminated_at` | — |
| Notifications | `_shared/notify.ts` resolves recipients from `tournament_players` | team members never notified |
| Player hub | `use.player.live.match.ts` finds "my match" by `registrationIdOf(entry)` | — |
| Standings / payouts | `computeStandings` keys by `r{registrationId}`, displays `name` | — |

Chip already handles teams (entries `team_<id>`, roster RPC, `chip.team-identity.ts`), so the
model exists — elimination simply never adopted it.

## Recommended design: an "entrant" id that can be a team

Keep the bracket engine untouched (it only needs a stable numeric id per seat + a display name
+ a rating). Introduce a team entrant namespace instead of a new table:

1. **Draw input** (`app/(tabs)/admin/manage-tournament/[id].tsx` `readyPlayers`): for
   `game_type` containing `scotch-doubles`, build `DrawPlayer`s from READY teams
   (`tournament_teams.checked_in && status = 'registered'`, not cancelled):
   `registrationId = -team.id` (negative = team; singles ids are positive, no collision),
   `name = "Captain & Partner"` (`chip.team-identity` naming), `fargo = combined team Fargo`
   (same rule chip uses, incl. `fargo_cap_override`). Add `entrantKind: "team"` to
   `DrawPlayer` / `GeneratedBracket.seeds` (types in `tournament-settings.types.ts`) so the
   value is self-describing.
2. **Server authorization** — one shared SQL helper `_elim_entrant_is_me(tid, entrant_id)`:
   positive → today's `tournament_players` check; negative → caller is an accepted member of
   `tournament_team_members` where `team_id = -entrant_id`. Use it in `submit_match_state`
   (20260929) and `match_player_start` / `match_check_in` (20260927/29). `_elim_resolve`
   needs no change (it compares ids only).
3. **Eliminations**: `sync_tournament_eliminations` — negative ids set a new
   `tournament_teams.eliminated_at` (additive column) instead of `tournament_players`.
4. **Notifications** (`_shared/notify.ts`, bundled into notify-match-assigned AND
   auto-assign-run): negative id → notify every accepted member's profile; dedupe key stays
   per recipient (`match_assignment_notifications` unique index already per recipient).
5. **Player hub / profile** (`use.player.live.match.ts`, `get_my_live_tournament` RPC):
   resolve "my entrant" as my registration id OR `-teamId` of my accepted team.
6. **Readiness / counts** (`buildReadinessSummary` path in `[id].tsx`, spectator players list
   `useTournamentSpectator.ts`): count teams, not individuals, for scotch elimination.
7. **Standings / payouts**: no change — keyed by entrant id, display name is the team name.
   `elimPlayersRemaining` (seeds − eliminated) already counts entrants.

Migrations: one additive (`tournament_teams.eliminated_at`, `_elim_entrant_is_me`, updated
`submit_match_state` / `match_player_start` / `match_check_in` / `sync_tournament_eliminations`).
No data backfill (no scotch elimination event has ever been drawn).

## Tests to add with it
4 / 8 / odd team counts with byes; withdrawal; no-show before draw (team not ready → not drawn);
both members can score/start, a non-member cannot; elimination marks the team; standings show
the team once; payouts by team; profile hub finds the match for either member; web and native
read the same seeds (no platform branch involved).
