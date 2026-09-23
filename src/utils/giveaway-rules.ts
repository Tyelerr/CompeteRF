// src/utils/giveaway-rules.ts
// Official-rules text is shared by both entry methods except one sentence. Single Free Entry
// keeps the existing one-entry-per-person wording; Giveaway Entries describes what the product
// actually does. This only swaps that sentence — the rules as a whole still need separate review
// before the first wallet giveaway launches.

import { GiveawayEntryMode } from "../models/types/giveaway.types";

export interface RulesSection {
  heading: string;
  body: string;
}

const ONE_ENTRY =
  /Limit one \(1\) entry per person per giveaway\.( Multiple entries, duplicate accounts, or fraudulent information will result in disqualification\.)?/;

const WALLET_ENTRY =
  "Multiple entries are allowed up to this giveaway's per-user limit. Each entry counts as one chance in the drawing.";

export function rulesForEntryMode(sections: RulesSection[], mode: GiveawayEntryMode | null | undefined): RulesSection[] {
  if (mode !== "wallet") return sections;
  return sections.map((s) => ({
    ...s,
    body: s.body.replace(ONE_ENTRY, (_m, disqualification?: string) =>
      disqualification
        ? `${WALLET_ENTRY} Duplicate accounts or fraudulent information will result in disqualification.`
        : WALLET_ENTRY,
    ),
  }));
}
