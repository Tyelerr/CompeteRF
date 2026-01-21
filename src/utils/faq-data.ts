export interface FAQItem {
  question: string;
  answer: string;
}

export const FAQ_DATA: FAQItem[] = [
  {
    question: "What is CompeteRF?",
    answer:
      "CompeteRF is a platform for finding billiards tournaments near you. Browse tournaments, save your favorites, and never miss a competition.",
  },
  {
    question: "How do I find tournaments?",
    answer:
      "Go to the Billiards tab to see all available tournaments. Use the search bar and filters to narrow down by location, game type, entry fee, and more.",
  },
  {
    question: "How do I save a tournament?",
    answer:
      "Tap the heart icon on any tournament card to save it to your favorites. You'll need to be logged in to save favorites.",
  },
  {
    question: 'What does "Reports to Fargo" mean?',
    answer:
      "Tournaments that report to Fargo will submit your match results to FargoRate, which tracks player skill levels across the country.",
  },
  {
    question: 'What is an "Open Tournament"?',
    answer:
      "Open tournaments allow players of all skill levels to compete. Non-open tournaments may have skill level restrictions.",
  },
  {
    question: "How do I submit my own tournament?",
    answer:
      "Tournament submission is available for Tournament Directors. Contact us through the form below to learn more about becoming a TD.",
  },
  {
    question: "How do I change my home state?",
    answer:
      "Currently, you set your home state when creating your profile. Contact support if you need to change it.",
  },
  {
    question: "Is the app free to use?",
    answer:
      "Yes! Browsing tournaments and saving favorites is completely free. Some premium features may be added in the future.",
  },
];
