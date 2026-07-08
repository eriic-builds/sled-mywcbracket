// Golden test: the render engine's output is frozen as a repo-owned snapshot.
// (Python byte-parity was proven once at porting time; this now guards regressions.)
//
//   node tests/golden.mjs            compare against tests/fixtures/golden-sections.json
//   node tests/golden.mjs --update   regenerate the snapshot (do this ONLY to accept an
//                                    intentional render change; review the fixture diff)
//
// The snapshot's inputs are frozen too: it renders with tests/fixtures/results.frozen.json,
// NOT the live docs/data/results.json — a bot rewrites the live file several times a day,
// which would break a snapshot that read it.
import fs from "fs";
import * as R from "../docs/js/render.js";

const D0 = new URL("../docs/data/", import.meta.url);
const FX = new URL("./fixtures/", import.meta.url);
const load = (u, n) => JSON.parse(fs.readFileSync(new URL(n, u)));
const picks = load(D0, "demo-picks.json"), topo = load(D0, "topology.json");
const live = load(FX, "results.frozen.json");
const FIXTURE = new URL("golden-sections.json", FX);

const D = R.computeState(picks, live, topo);
const KO = [["Round of 16", "r16", [89,90,91,92,93,94,95,96].map(n => "M" + n)],
  ["Quarterfinals", "qf", [97,98,99,100].map(n => "M" + n)],
  ["Semifinals", "sf", ["M101", "M102"]], ["Final", "final", ["M104"]]];

const js = {
  bracket_actual: R.buildBracket(D, "actual"), bracket_picked: R.buildBracket(D, "picked"),
  scorecard: R.buildScorecard(D), scorebar: R.buildScorebar(D), kpis: R.buildKpis(D),
  finalfour: R.buildFinalfour(D), story: R.buildStory(D), stages: R.buildStages(D),
  results_panel: R.buildResultsPanel(D), highlights: R.buildHighlights(D), legend: R.buildLegend(),
};
for (const [label, short, codes] of KO) js["round_" + short] = R.buildRoundResultsPanel(D, label, short, codes);

if (process.argv.includes("--update")) {
  fs.writeFileSync(FIXTURE, JSON.stringify(js, null, 1) + "\n");
  console.log("updated fixture: tests/fixtures/golden-sections.json (" + Object.keys(js).length + " sections)");
  process.exit(0);
}

const snap = JSON.parse(fs.readFileSync(FIXTURE, "utf-8"));
let fails = 0;
for (const k of Object.keys(snap)) {
  if (snap[k] === js[k]) { console.log("  ok   " + k); continue; }
  fails++;
  // find first divergence
  const a = snap[k], b = js[k] || "";
  let i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i++;
  console.log("  DIFF " + k + " at char " + i);
  console.log("    fixture: ..." + JSON.stringify(a.slice(Math.max(0, i - 30), i + 60)));
  console.log("    current: ..." + JSON.stringify(b.slice(Math.max(0, i - 30), i + 60)));
}
console.log(fails ? `\nFAILED: ${fails} section(s) differ (intentional change? rerun with --update and review the fixture diff)` : `\nGOLDEN OK: all ${Object.keys(snap).length} sections match the snapshot`);
process.exit(fails ? 1 : 0);
