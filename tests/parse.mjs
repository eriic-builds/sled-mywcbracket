// Parser test: parse the real SLED workbook and assert it yields the demo picks
// (which are Eric's actual bracket). Proves the Excel path end-to-end, headless.
// Run: node tests/parse.mjs
import fs from "fs";
import vm from "vm";
// Load the browser UMD SheetJS the way a browser would (it sets a global XLSX).
const sheetjs = fs.readFileSync(new URL("../docs/js/vendor/xlsx.full.min.js", import.meta.url), "utf8");
const ctx = { console };
ctx.window = ctx; ctx.self = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(sheetjs, ctx);
globalThis.XLSX = ctx.XLSX || ctx.window.XLSX;
if (!globalThis.XLSX || !globalThis.XLSX.read) { console.error("SheetJS failed to load in the test harness"); process.exit(2); }

const { parseWorkbook, validateAgainstTopology } = await import("../docs/js/parse-excel.js");

// The real workbook is private (it carries a colleague's name) and lives outside the
// repo. Skip cleanly when it isn't present (e.g. in CI) — exit 0, not a failure.
const XLSX_PATH = process.env.WCB_WORKBOOK || "/Users/ericlam/Projects/wc26-bracket/input/bracket-picks.xlsx";
if (!fs.existsSync(XLSX_PATH)) {
  console.log("SKIP parse.mjs: private workbook not present (set WCB_WORKBOOK to run)");
  process.exit(0);
}
const demo = JSON.parse(fs.readFileSync(new URL("../docs/data/demo-picks.json", import.meta.url)));
const topo = JSON.parse(fs.readFileSync(new URL("../docs/data/topology.json", import.meta.url)));

const bytes = new Uint8Array(fs.readFileSync(XLSX_PATH));
let picks = parseWorkbook(bytes);
picks = validateAgainstTopology(picks, topo);

const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
let fails = 0;
function check(name, got, want) {
  if (eq(got, want)) { console.log("  ok   " + name); return; }
  fails++;
  console.log("  DIFF " + name);
  console.log("    parsed:", JSON.stringify(got));
  console.log("    demo:  ", JSON.stringify(want));
}
check("entrant", picks.entrant, demo.entrant);
check("tiebreaker", picks.tiebreaker, demo.tiebreaker);
check("freebie_match", picks.freebie_match, demo.freebie_match);
check("r32", picks.r32, demo.r32);
check("r16_win", picks.r16_win, demo.r16_win);
check("qf_win", picks.qf_win, demo.qf_win);
check("sf_win", picks.sf_win, demo.sf_win);
check("champ", picks.champ, demo.champ);
check("runner", picks.runner, demo.runner);
// seed: every team the demo knows must be parsed with the same seed
let seedBad = 0;
for (const t in demo.seed) if (picks.seed[t] !== demo.seed[t]) { seedBad++; if (seedBad <= 3) console.log(`    seed diff ${t}: parsed=${picks.seed[t]} demo=${demo.seed[t]}`); }
if (seedBad) { fails++; console.log("  DIFF seed (" + seedBad + " teams)"); } else console.log("  ok   seed (32 teams)");

console.log(fails ? `\nFAILED: ${fails} field(s) differ` : "\nPARSE OK: the real workbook reproduces the demo bracket exactly");
process.exit(fails ? 1 : 0);
