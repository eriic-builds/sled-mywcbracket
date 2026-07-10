// Bracket-map test: the ACTUAL-path view must flow through every round no matter how
// wrong the user's picks are — real occupants (▲) where results exist, labeled
// "Winner MXX" placeholders where they don't, and never a dead blank cell.
// Run: node tests/bracketmap.mjs
import fs from "fs";
import { deriveStructure, teamsFor, buildPicks } from "../docs/js/builder.js";
import { renderDashboard } from "../docs/js/render.js";

const data = (n) => JSON.parse(fs.readFileSync(new URL("../docs/data/" + n, import.meta.url)));
const fixture = (n) => JSON.parse(fs.readFileSync(new URL("./fixtures/" + n, import.meta.url)));
const topo = data("topology.json"), live = fixture("results.frozen.json");
const S = deriveStructure(topo);

let fails = 0, n = 0;
function check(name, cond, detail = "") {
  n++;
  if (cond) { console.log("  ok   " + name); return; }
  fails++; console.log("  DIFF " + name + (detail ? "  " + detail : ""));
}

// Worst case: pick the LOSER of every decided R32 match and ride those losers to the end.
const sel = {};
for (const round of S.rounds) for (const c of round.codes) {
  const [a, b] = teamsFor(S, c, sel);
  if (round.key === "r32" && live.res[c]) { const w = live.res[c][2]; sel[c] = (w === a ? b : a); }
  else sel[c] = a;
}
const allWrong = buildPicks(topo, sel, "AllWrong", 0);
const html = renderDashboard(allWrong, live, topo);
const actual = html.split('class="bracket layout-mirror mode-actual"')[1]
  .split('class="bracket layout-mirror mode-picked"')[0];
const picked = html.split('class="bracket layout-mirror mode-picked"')[1]
  .split('class="bracket layout-sideways mode-actual"')[0];

// 1. no dead blanks anywhere in the actual view
check("actual view has zero blank cells", !(actual.includes("team blank")));

// 2. every decided slot shows its real occupant: each R16-slot actual winner appears as ▲
const r16Winners = S.r16codes.filter(c => live.res[c]).map(c => live.res[c][2]);
const missing = r16Winners.filter(t => !new RegExp('st-actual[^>]*data-team="' + t + '"').test(actual));
check("all decided R16 winners appear as actual (▲) in the QF column", missing.length === 0, missing.join(","));

// 3. every undecided slot whose pick is out shows a labeled placeholder, never nothing
const unresolvedFeeders = [...S.r16codes, ...S.qfcodes, ...S.sfcodes]
  .filter(c => !live.res[c]);
const missingTBD = unresolvedFeeders.filter(c => !actual.includes("Winner " + c));
check("every unresolved feeder shows 'Winner MXX'", missingTBD.length === 0, missingTBD.join(","));

// 4. the picked view is untouched by actual-mode logic (user's path, no placeholders)
check("picked view has no placeholders or blanks", !picked.includes("tbd-actual") && !picked.includes("team blank"));

// 5. a fully-correct bracket shows no ▲ and no placeholders in decided rounds (its own
//    picks ARE the actual path)
{
  const sel2 = {};
  for (const round of S.rounds) for (const c of round.codes) {
    const [a, b] = teamsFor(S, c, sel2);
    sel2[c] = live.res[c] ? live.res[c][2] : a;   // pick every actual winner where known
  }
  const allRight = buildPicks(topo, sel2, "AllRight", 0);
  const html2 = renderDashboard(allRight, live, topo);
  const actual2 = html2.split('class="bracket layout-mirror mode-actual"')[1]
    .split('class="bracket layout-mirror mode-picked"')[0];
  check("all-correct bracket: no ▲ and no blanks", !actual2.includes("st-actual") && !actual2.includes("team blank"));
}

console.log(fails ? `\nFAILED: ${fails}/${n}` : `\nBRACKETMAP OK: the actual path flows through all rounds, worst case included (${n} checks)`);
process.exit(fails ? 1 : 0);
