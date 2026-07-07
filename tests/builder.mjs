// Builder test: reconstruct the demo's selections, run buildPicks, and assert it
// reproduces demo-picks.json exactly and renders to the identical dashboard.
// Run: node tests/builder.mjs
import fs from "fs";
import { deriveStructure, buildPicks, teamsFor, repair } from "../docs/js/builder.js";
import { renderDashboard } from "../docs/js/render.js";

const L = (n) => JSON.parse(fs.readFileSync(new URL("../docs/data/" + n, import.meta.url)));
const topo = L("topology.json"), demo = L("demo-picks.json"), live = L("results.json");

const S = deriveStructure(topo);
const sel = {};
demo.r32.forEach(m => { sel[m[0]] = m[4]; });
S.r16codes.forEach((c, j) => { sel[c] = demo.r16_win[j]; });
S.qfcodes.forEach((c, j) => { sel[c] = demo.qf_win[j]; });
S.sfcodes.forEach((c, j) => { sel[c] = demo.sf_win[j]; });
sel[S.finalcode] = demo.champ;

const picks = buildPicks(topo, sel, demo.entrant, demo.tiebreaker);
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
let fails = 0;
for (const k of ["entrant", "tiebreaker", "freebie_match", "r32", "r16_win", "qf_win", "sf_win", "champ", "runner"]) {
  if (eq(picks[k], demo[k])) console.log("  ok   " + k);
  else { fails++; console.log("  DIFF " + k + "\n    got: " + JSON.stringify(picks[k]) + "\n    demo:" + JSON.stringify(demo[k])); }
}

// repair() must drop a downstream pick when the upstream winner it depended on changes
const sel2 = { ...sel };
const r16c = S.r16codes[0];                        // an R16 match with a chosen winner
const winner = sel[r16c];
const feederOfWinner = S.koFeed[r16c].find(f => sel[f] === winner);  // the match that produced it
const [ta, tb] = teamsFor(S, feederOfWinner, sel2);
sel2[feederOfWinner] = sel2[feederOfWinner] === ta ? tb : ta;        // flip that feeder's winner
repair(S, sel2);
console.log("  " + (sel2[r16c] === undefined
  ? "ok   repair cleared the now-invalid downstream pick"
  : "DIFF repair did not clear (" + sel2[r16c] + ")"));
if (sel2[r16c] !== undefined) fails++;

// strongest: the builder's picks render to the identical dashboard as the demo
const same = renderDashboard(picks, live, topo) === renderDashboard(demo, live, topo);
console.log("  " + (same ? "ok   renders identically to the demo bracket" : "DIFF render output differs"));
if (!same) fails++;

console.log(fails ? `\nFAILED: ${fails}` : "\nBUILDER OK: produces the correct picks + identical dashboard");
process.exit(fails ? 1 : 0);
