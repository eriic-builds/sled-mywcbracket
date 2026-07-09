// flags.js — maps a bracket team name to a bundled SVG flag (docs/flags/<code>.svg)
// and renders it as an <img>. Bundled SVGs render identically on every OS/browser
// (including Windows, where emoji flags show as 2-letter codes). Flag artwork is
// from lipis/flag-icons (MIT) — see docs/flags/ATTRIBUTION.txt.

// Team name (as used in this bracket) -> flag file code (lowercase ISO 3166-1
// alpha-2; England uses the gb-eng subdivision flag). A few common name variants
// are included so alternate spellings from other feeds still resolve.
export const FLAG_CODE = {
  "Algeria": "dz", "Argentina": "ar", "Australia": "au", "Austria": "at",
  "Belgium": "be", "Bosnia & Herz.": "ba", "Brazil": "br", "Canada": "ca",
  "Cape Verde": "cv", "Colombia": "co", "Croatia": "hr", "DR Congo": "cd",
  "Ecuador": "ec", "Egypt": "eg", "England": "gb-eng", "France": "fr",
  "Germany": "de", "Ghana": "gh", "Ivory Coast": "ci", "Japan": "jp",
  "Mexico": "mx", "Morocco": "ma", "Netherlands": "nl", "Norway": "no",
  "Paraguay": "py", "Portugal": "pt", "Senegal": "sn", "South Africa": "za",
  "Spain": "es", "Sweden": "se", "Switzerland": "ch", "United States": "us",
  // name variants
  "USA": "us", "United States of America": "us",
  "Bosnia and Herzegovina": "ba", "Bosnia & Herzegovina": "ba",
  "Cote d'Ivoire": "ci", "C\u00f4te d'Ivoire": "ci",
  "Democratic Republic of the Congo": "cd", "Cabo Verde": "cv",
};

const _esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
  .replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// The file code for a team name, or null if we don't have a flag for it.
export function flagCode(name) {
  return FLAG_CODE[name] || null;
}

// An <img> tag for the team's flag, or "" if unknown. src is repo-root relative
// (matches how index.html references js/… and flags/…).
export function flagImg(name, cls = "bld-flag") {
  const code = FLAG_CODE[name];
  if (!code) return "";
  return `<img class="${_esc(cls)}" src="flags/${code}.svg" alt="${_esc(name)} flag" ` +
    `width="22" height="16" loading="lazy" decoding="async">`;
}
