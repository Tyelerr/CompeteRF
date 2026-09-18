// src/utils/registration-status.ts
// The ONE shared rule for "is this tournament registration an ACTIVE participant".
// Used wherever live tournament participation is derived so Web / iOS / Android agree —
// never a per-platform filter.
//
//   Active   : preregistered | queued | approved | checked_in  (in-flight or confirmed)
//   Inactive : cancelled | no_show                              (withdrawn / did not show)
//
// This mirrors the long-standing chip load rule (tournament_players excluded when
// cancelled/no_show); centralizing it means chip_entries, imported registrations, and any
// future surface all agree on who counts as a participant.

import { RegistrationStatus } from "../models/types/common.types";

export const INACTIVE_REGISTRATION_STATUSES: readonly RegistrationStatus[] = [
  "cancelled",
  "no_show",
];

export const isActiveRegistrationStatus = (status?: string | null): boolean =>
  !!status && !INACTIVE_REGISTRATION_STATUSES.includes(status as RegistrationStatus);
