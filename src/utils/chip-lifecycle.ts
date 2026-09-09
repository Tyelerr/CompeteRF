// src/utils/chip-lifecycle.ts
// ONE place that turns a unified chip roster entry (ChipEntry — the deduped union of
// chip_entries + tournament_players + tournament_teams built in chipService.load) into
// its visible lifecycle status. The chip Players tab, Review & Start, AND the Prize Pool
// player/side-pot counts all call this, so they can never disagree about who is Ready.
//
// This is deliberately the chip-format translation layer on top of the format-agnostic
// deriveLifecycle() in registration-lifecycle.ts: it knows chip's sources (TD-owned
// entry vs projected self-registration vs team) and chip's hard blocker (a missing Fargo
// can't be assigned starting chips). It does NOT know about the Fargo-cap override — that
// is a separate gate layered at Review & Start, and an over-cap Ready entry is still
// "ready" here (the same as the roster counters), so counts stay consistent.

import { ChipEntry } from "../models/types/chip.types";
import {
  LifecyclePhase,
  LifecycleStatus,
  deriveLifecycle,
  paymentSatisfied,
} from "./registration-lifecycle";

export interface ChipLifecycleContext {
  phase: LifecyclePhase;
  doubles: boolean;
  entryFeeRequired: boolean;
}

// A doubles entry has a partner once a second player is present (a team member row, a
// name, or a linked profile). Singles always "have a partner" (the concept doesn't apply),
// so they are never held in the Waiting-for-Partner state.
export const chipHasPartner = (e: ChipEntry): boolean =>
  !e.isTeam ||
  e.p2MemberId != null ||
  (!!e.p2Name && e.p2Name !== "") ||
  e.p2ProfileId != null;

// Chip's format hard blocker: a rating is required to assign starting chips, so a missing
// Fargo blocks Ready. Doubles needs both members rated.
export const chipHardBlocker = (e: ChipEntry, doubles: boolean): boolean =>
  doubles ? e.p1Fargo == null || e.p2Fargo == null : e.p1Fargo == null;

// Canonical visible lifecycle status for a chip roster entry.
export const chipEntryLifecycle = (
  e: ChipEntry,
  ctx: ChipLifecycleContext,
): LifecycleStatus =>
  deriveLifecycle({
    phase: ctx.phase,
    // Exception state only exists on a self-registration source (a TD-owned entry is
    // hard-removed, never left as a cancelled row).
    exception: e.fromRegistration
      ? e.regStatus === "no_show"
        ? "no_show"
        : e.regStatus === "cancelled"
          ? "removed"
          : null
      : null,
    waiting: ctx.doubles && !chipHasPartner(e),
    // Processed = the TD has intentionally handled this entry (vs an untouched self-signup):
    // any team and any TD-added single are processed; a self-registration is processed once
    // approved / checked in.
    processed: e.isTeam
      ? true
      : e.fromRegistration
        ? e.regStatus === "approved" || e.regStatus === "checked_in"
        : true,
    paymentSatisfied: paymentSatisfied(!!e.paid, ctx.entryFeeRequired),
    hardBlocker: chipHardBlocker(e, ctx.doubles),
    checkedIn: !!e.checkedIn,
  });

// The prize-pool entrant set: entries that are Ready (paid/eligible AND explicitly marked
// Ready by the TD). Registered-but-not-Ready, Pre-Registered, Waiting, No-Show and Removed
// are all excluded — the pool reflects only players actually entering the live field. An
// over-cap Ready entry with an approved override is Ready and counts; the Review & Start
// gate is what stops an over-cap entry WITHOUT an override, before the field goes live.
export const chipReadyEntries = (
  entries: ChipEntry[],
  ctx: ChipLifecycleContext,
): ChipEntry[] => entries.filter((e) => chipEntryLifecycle(e, ctx) === "ready");

// The active roster: every entry still in the tournament — Pre-Registered, Registered,
// Waiting and Ready all count; only the exception states (No-Show, Removed/cancelled) drop
// out. Used for SIDE-POT counts: a side-pot buy-in is money already collected, so it counts
// as soon as the player has entered that pot, even if they are not Ready yet (e.g. a
// Registered, entry-paid, side-pot-paid player still missing a Fargo). Distinct from
// chipReadyEntries, which gates the main entry pool on Ready.
export const chipActiveEntries = (
  entries: ChipEntry[],
  ctx: ChipLifecycleContext,
): ChipEntry[] =>
  entries.filter((e) => {
    const st = chipEntryLifecycle(e, ctx);
    return st !== "no_show" && st !== "removed";
  });
