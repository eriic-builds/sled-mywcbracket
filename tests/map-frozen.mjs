import fs from "fs";
import * as render from "../docs/js/render.js";

const load = (path) => JSON.parse(fs.readFileSync(new URL(path, import.meta.url), "utf8"));
const picks = load("../docs/data/demo-picks.json");
const topology = load("../docs/data/topology.json");
const results = load("./fixtures/results.frozen.json");
const fixtureUrl = new URL("./fixtures/map-sections.frozen.json", import.meta.url);
const D = render.computeState(picks, results, topology);
const current = {
  bracket_actual: render.buildBracket(D, "actual"),
  bracket_picked: render.buildBracket(D, "picked"),
  sideways_actual: render.buildSidewaysBracket(D, "actual"),
  sideways_picked: render.buildSidewaysBracket(D, "picked"),
  legend: render.buildLegend(),
};

if (process.argv.includes("--update")) {
  fs.writeFileSync(fixtureUrl, JSON.stringify(current, null, 2) + "\n");
  console.log("UPDATED map-sections.frozen.json");
  console.log("WARNING: review the fixture diff before accepting this map contract.");
  process.exit(0);
}

if (!fs.existsSync(fixtureUrl)) {
  console.error("MISSING map-sections.frozen.json; run node tests/map-frozen.mjs --update and review it.");
  process.exit(1);
}

const frozen = load("./fixtures/map-sections.frozen.json");
let fails = 0;

for (const key of Object.keys(current)) {
  if (frozen[key] === current[key]) {
    console.log("  ok   " + key);
    continue;
  }
  fails++;
  const expected = frozen[key] || "";
  const actual = current[key] || "";
  let index = 0;
  while (index < expected.length && index < actual.length && expected[index] === actual[index]) index++;
  console.log(`  DIFF ${key} at char ${index}`);
  console.log("    frozen: ..." + JSON.stringify(expected.slice(Math.max(0, index - 30), index + 60)));
  console.log("    actual: ..." + JSON.stringify(actual.slice(Math.max(0, index - 30), index + 60)));
}

for (const key of Object.keys(frozen)) {
  if (Object.hasOwn(current, key)) continue;
  fails++;
  console.log("  DIFF unexpected frozen section " + key);
}

console.log(fails ? `\nFAILED: ${fails} map section(s) differ` : "\nMAP FROZEN OK: both layouts, both views, and the legend are byte-locked");
process.exit(fails ? 1 : 0);
