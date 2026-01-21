export interface SupportCategory {
  label: string;
  value: string;
  requiresTournamentId?: boolean;
}

export const SUPPORT_CATEGORIES: SupportCategory[] = [
  { label: "Select a Category", value: "" },
  { label: "Account Issues", value: "account" },
  {
    label: "Tournament Issues",
    value: "tournament",
    requiresTournamentId: true,
  },
  { label: "Tournament Submission", value: "tournament_submission" },
  { label: "Report a Problem", value: "bug_report" },
  { label: "Fargo Rating Questions", value: "fargo" },
  { label: "Become a Tournament Director", value: "become_td" },
  { label: "Feedback / Suggestions", value: "feedback" },
  { label: "Billing / Payments", value: "billing" },
  { label: "Other", value: "other" },
];
