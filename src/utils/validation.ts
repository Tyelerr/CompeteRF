import { BAD_WORDS } from "./badwords";

export const isValidEmail = (email: string): boolean => {
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return regex.test(email);
};

export const isValidPassword = (password: string): boolean => {
  return password.length >= 8;
};

export const isValidUsername = (username: string): boolean => {
  if (username.length < 3) return false;
  if (username.length > 20) return false;
  const regex = /^[a-zA-Z]+$/;
  return regex.test(username);
};

/**
 * Normalize text to catch leet-speak and symbol substitutions.
 * Converts 0→o, 1/!→i, 3→e, 4→a, 5→s, 7→t, 8→b, 9→g
 * then strips all non-letter characters.
 */
export const normalizeText = (input: string): string => {
  return input
    .toLowerCase()
    .replace(/0/g, "o")
    .replace(/1/g, "i")
    .replace(/!/g, "i")
    .replace(/3/g, "e")
    .replace(/4/g, "a")
    .replace(/5/g, "s")
    .replace(/7/g, "t")
    .replace(/8/g, "b")
    .replace(/9/g, "g")
    .replace(/[^a-z]/g, "");
};

/**
 * Legitimate words that contain bad word fragments as substrings.
 *
 * How it works:
 *  - Bad words are checked longest-first, so explicit compound bad words
 *    like "dumbass" are caught before their shorter component "ass".
 *  - A safe word only excuses a bad word if it is strictly longer than
 *    the bad word OR it matches the entire normalized input exactly.
 *  - The safe word must fully cover the position where the bad word
 *    appears in the input (position-aware matching).
 *
 * Add more as needed when users report false positives.
 */
const SAFE_WORDS: string[] = [
  // --- anal ---
  "canal",
  "analysis",
  "analyst",
  "analysts",
  "analyze",
  "analyzed",
  "analog",
  "analogy",
  "analogous",
  "banal",

  // --- ass ---
  "assassin",
  "assault",
  "assemble",
  "assembly",
  "assert",
  "assertion",
  "assess",
  "assessment",
  "asset",
  "assign",
  "assignment",
  "assist",
  "assistant",
  "associate",
  "association",
  "assume",
  "assumption",
  "assurance",
  "assure",
  "bass",
  "bassist",
  "bassoon",
  "bassman",
  "bassmaster",
  "seabass",
  "brass",
  "class",
  "classic",
  "classified",
  "classy",
  "compass",
  "compassion",
  "crass",
  "embassy",
  "embarrass",
  "glass",
  "grass",
  "grasshopper",
  "grassroots",
  "harass",
  "harassment",
  "lass",
  "lasso",
  "mass",
  "massacre",
  "massage",
  "massive",
  "morass",
  "pass",
  "passage",
  "passenger",
  "passion",
  "passionate",
  "passive",
  "passport",
  "sass",
  "sassy",
  "trespass",
  "ambassador",
  "renaissance",

  // --- cock ---
  "cockpit",
  "cocktail",
  "cockatoo",
  "cockatiel",
  "peacock",
  "hancock",
  "hitchcock",
  "babcock",
  "woodcock",
  "shuttlecock",
  "gamecock",
  "cockroach",

  // --- coon ---
  "raccoon",
  "tycoon",

  // --- crap ---
  "scrap",
  "scrappy",
  "scrapper",
  "scrape",
  "scraper",
  "skyscraper",
  "scrapbook",

  // --- cum ---
  "cumulus",
  "cucumber",
  "cumberland",
  "cumulative",
  "document",
  "documentary",
  "circumstance",
  "circumference",
  "circuit",

  // --- damn ---
  "amsterdam",

  // --- dick ---
  "dickens",
  "dickerson",
  "dickinson",

  // --- dink ---
  "drinking",
  "thinking",
  "shrinking",
  "stinking",
  "winking",
  "blinking",
  "sinking",
  "linking",
  "inking",

  // --- hell ---
  "hello",
  "shell",
  "shelling",
  "seashell",
  "eggshell",
  "bombshell",
  "nutshell",
  "shellfish",
  "michelle",
  "rochelle",
  "hellraiser",

  // --- homo ---
  "homogeneous",
  "homonym",

  // --- horny ---
  "thorny",

  // --- jap ---
  "japan",
  "japanese",

  // --- muff ---
  "muffin",
  "muffins",
  "muffler",

  // --- pecker ---
  "woodpecker",

  // --- poon ---
  "spoon",
  "harpoon",
  "teaspoon",
  "tablespoon",

  // --- rape ---
  "grape",
  "drape",
  "raptor",
  "rapid",
  "rapport",
  "wrapper",
  "trapper",

  // --- rapist ---
  "therapist",

  // --- screw ---
  "corkscrew",

  // --- shit ---
  "shiitake",

  // --- spic ---
  "spice",
  "spicy",
  "spices",

  // --- tard ---
  "mustard",
  "custard",
  "leotard",

  // --- tit / tits / titty ---
  "title",
  "titled",
  "titillate",
  "titanium",
  "titan",
  "competition",
  "competitive",
  "competitor",
  "petition",
  "repetition",
  "appetizer",
  "superstition",

  // --- vag ---
  "vague",
  "vagrant",
  "vagabond",
  "extravagant",
  "extravagance",

  // --- wank ---
  "swank",
  "swanky",

  // --- whore ---
  "warehouse",
  "shore",
  "lakeshore",
  "seashore",
  "offshore",

  // --- sex ---
  "sextant",
  "sextet",
  "sexton",
  "essex",
  "sussex",
  "middlesex",

  // --- billiards / pool app relevant ---
  "pool",
  "carpool",
  "poolhall",
  "poolshark",
  "billiard",
  "billiards",
  "snooker",
  "spotlight",
  "hotspot",
];

/**
 * Find all start indices of `needle` in `haystack`.
 */
function allIndexesOf(haystack: string, needle: string): number[] {
  const indices: number[] = [];
  let i = haystack.indexOf(needle);
  while (i !== -1) {
    indices.push(i);
    i = haystack.indexOf(needle, i + 1);
  }
  return indices;
}

// Sort bad words longest-first so compound bad words like "dumbass"
// are checked before their shorter component "ass".
const SORTED_BAD_WORDS = [...BAD_WORDS].sort((a, b) => b.length - a.length);

/**
 * Check if text contains a bad word, with:
 *  1. Leet-speak normalization (a55hole → asshole)
 *  2. Longest-first matching (dumbass caught before ass)
 *  3. Position-aware safe word allowlist (assassin → allowed)
 *
 * A safe word excuses a bad word match only if:
 *  - It is strictly longer than the bad word, OR
 *  - It matches the entire normalized input exactly (e.g. username "bass")
 * AND it fully covers the position where the bad word appears.
 */
export const containsBadWord = (text: string): boolean => {
  const normalized = normalizeText(text);

  for (const badWord of SORTED_BAD_WORDS) {
    const badPositions = allIndexesOf(normalized, badWord);
    if (badPositions.length === 0) continue;

    for (const badStart of badPositions) {
      const badEnd = badStart + badWord.length;

      const coveredBySafe = SAFE_WORDS.some((safeWord) => {
        const safeNorm = normalizeText(safeWord);
        if (!safeNorm.includes(badWord)) return false;

        // Safe word must be strictly longer than the bad word,
        // OR match the entire input exactly (e.g. username "bass")
        if (safeNorm.length <= badWord.length && safeNorm !== normalized) {
          return false;
        }

        // Check if any occurrence of the safe word in the input
        // fully covers this occurrence of the bad word
        const safePositions = allIndexesOf(normalized, safeNorm);
        return safePositions.some((safeStart) => {
          const safeEnd = safeStart + safeNorm.length;
          return safeStart <= badStart && safeEnd >= badEnd;
        });
      });

      if (!coveredBySafe) return true;
    }
  }

  return false;
};

export const isValidZipCode = (zip: string): boolean => {
  const regex = /^\d{5}$/;
  return regex.test(zip);
};

export const isValidPhone = (phone: string): boolean => {
  const cleaned = phone.replace(/\D/g, "");
  return cleaned.length === 10;
};

export const isValidAge = (birthday: string, minAge: number): boolean => {
  const birth = new Date(birthday);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (
    monthDiff < 0 ||
    (monthDiff === 0 && today.getDate() < birth.getDate())
  ) {
    age--;
  }
  return age >= minAge;
};

export const isValidFargo = (fargo: number): boolean => {
  return fargo >= 0 && fargo <= 1000;
};
