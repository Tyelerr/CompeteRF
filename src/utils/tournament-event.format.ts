// src/utils/tournament-event.format.ts
// Pure, public-safe presentation of a durable tournament_events row for the
// spectator Recent Activity feed. Renders from the structured (type + payload)
// event only — never exposes actor_id or any admin-only detail. Shared web +
// native (no React). The admin dashboard has its own richer local renderer; this
// is the read-only spectator phrasing shown in the screenshots.

import { TournamentEvent } from "../models/services/tournament-event.service";

export type EventTone = "start" | "win" | "table" | "neutral";

export interface FormattedEvent {
  title: string;
  detail: string | null;
  tone: EventTone;
}

const str = (v: unknown): string | null =>
  typeof v === "string" && v.trim() ? v.trim() : null;

const vsLine = (p: Record<string, unknown>): string | null => {
  const a = str(p.p1Name);
  const b = str(p.p2Name);
  if (a && b) return `${a} vs ${b}`;
  return str(p.label);
};

// Human-readable, spectator-appropriate line for one event. Public payload fields
// only: player names, table label, bracket location, final score.
export const formatTournamentEvent = (e: TournamentEvent): FormattedEvent => {
  const p = (e.payload ?? {}) as Record<string, unknown>;
  const table = str(p.tableLabel);
  const loc = str(p.location);

  switch (e.type) {
    case "tournament_started":
      return { title: "Tournament started", detail: null, tone: "start" };

    case "match_started": {
      const detail = [vsLine(p), table].filter(Boolean).join(" · ") || loc;
      return { title: "Match started", detail, tone: "neutral" };
    }

    case "match_completed": {
      const winner = str(p.winnerName);
      const loser = str(p.loserName) ?? "opponent";
      // Score isn't in the event payload today; fall back to bracket location for
      // context. If a score is ever added it's preferred automatically.
      const score =
        p.winnerScore != null && p.loserScore != null
          ? `${p.winnerScore}–${p.loserScore}`
          : null;
      const tail = score ?? loc;
      const detail = winner
        ? `${winner} defeated ${loser}${tail ? ` · ${tail}` : ""}`
        : [vsLine(p), tail].filter(Boolean).join(" · ") || null;
      return { title: "Match completed", detail, tone: "win" };
    }

    case "table_assigned":
      return {
        title: "Table assigned",
        detail: [table, vsLine(p)].filter(Boolean).join(" · ") || null,
        tone: "table",
      };
    case "table_changed":
      return {
        title: "Table changed",
        detail: [table, vsLine(p)].filter(Boolean).join(" · ") || null,
        tone: "table",
      };
    case "table_unassigned":
      return {
        title: "Table cleared",
        detail: [table, vsLine(p)].filter(Boolean).join(" · ") || null,
        tone: "table",
      };

    case "match_reopened":
      return {
        title: "Match reopened",
        detail: [vsLine(p), table].filter(Boolean).join(" · ") || loc,
        tone: "neutral",
      };
    case "match_timer_adjusted": {
      const prev = str(p.prevElapsed);
      const next = str(p.newElapsed);
      return {
        title: p.reset ? "Match timer reset" : "Match timer adjusted",
        detail: p.reset
          ? vsLine(p)
          : prev && next
            ? `${prev} → ${next}`
            : vsLine(p),
        tone: "neutral",
      };
    }
    case "bracket_redrawn":
      return { title: "Bracket redrawn", detail: null, tone: "neutral" };

    default:
      return { title: e.type, detail: vsLine(p), tone: "neutral" };
  }
};

// "9:09 PM" clock label for an event timestamp (spectator feed).
export const eventClock = (iso: string): string => {
  try {
    return new Date(iso).toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
};
