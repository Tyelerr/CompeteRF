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
  const regex = /^[a-zA-Z0-9]+$/;
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
 */
const SAFE_WORDS: string[] = [
  "canal", "analysis", "analyst", "analysts", "analyze", "analyzed",
  "analog", "analogy", "analogous", "banal",
  "assassin", "assault", "assemble", "assembly", "assert", "assertion",
  "assess", "assessment", "asset", "assign", "assignment", "assist",
  "assistant", "associate", "association", "assume", "assumption",
  "assurance", "assure", "bass", "bassist", "bassoon", "bassman",
  "bassmaster", "seabass", "brass", "class", "classic", "classified",
  "classy", "compass", "compassion", "crass", "embassy", "embarrass",
  "glass", "grass", "grasshopper", "grassroots", "harass", "harassment",
  "lass", "lasso", "mass", "massacre", "massage", "massive", "morass",
  "pass", "passage", "passenger", "passion", "passionate", "passive",
  "passport", "sass", "sassy", "trespass", "ambassador", "renaissance",
  "cockpit", "cocktail", "cockatoo", "cockatiel", "peacock", "hancock",
  "hitchcock", "babcock", "woodcock", "shuttlecock", "gamecock", "cockroach",
  "raccoon", "tycoon",
  "scrap", "scrappy", "scrapper", "scrape", "scraper", "skyscraper", "scrapbook",
  "cumulus", "cucumber", "cumberland", "cumulative", "document",
  "documentary", "circumstance", "circumference", "circuit",
  "amsterdam",
  "dickens", "dickerson", "dickinson",
  "drinking", "thinking", "shrinking", "stinking", "winking",
  "blinking", "sinking", "linking", "inking",
  "hello", "shell", "shelling", "seashell", "eggshell", "bombshell",
  "nutshell", "shellfish", "michelle", "rochelle", "hellraiser",
  "homogeneous", "homonym",
  "thorny",
  "japan", "japanese",
  "muffin", "muffins", "muffler",
  "woodpecker",
  "spoon", "harpoon", "teaspoon", "tablespoon",
  "grape", "drape", "raptor", "rapid", "rapport", "wrapper", "trapper",
  "therapist",
  "corkscrew",
  "shiitake",
  "spice", "spicy", "spices",
  "mustard", "custard", "leotard",
  "title", "titled", "titillate", "titanium", "titan", "competition",
  "competitive", "competitor", "petition", "repetition", "appetizer",
  "superstition",
  "vague", "vagrant", "vagabond", "extravagant", "extravagance",
  "swank", "swanky",
  "warehouse", "shore", "lakeshore", "seashore", "offshore",
  "sextant", "sextet", "sexton", "essex", "sussex", "middlesex",
  "pool", "carpool", "poolhall", "poolshark", "billiard", "billiards",
  "snooker", "spotlight", "hotspot",
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

const SORTED_BAD_WORDS = [...BAD_WORDS].sort((a, b) => b.length - a.length);

/**
 * Check if text contains a bad word, with:
 *  1. Leet-speak normalization (a55hole → asshole)
 *  2. Longest-first matching (dumbass caught before ass)
 *  3. Position-aware safe word allowlist (assassin → allowed)
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

        if (safeNorm.length <= badWord.length && safeNorm !== normalized) {
          return false;
        }

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
