import fs from "fs";
import { deriveBracketTree } from "../docs/js/bracket-tree.js";

const topology = JSON.parse(fs.readFileSync(new URL("../docs/data/topology.json", import.meta.url)));
const tree = deriveBracketTree(topology);
let fails = 0;

function check(name, pass, detail = "") {
  if (pass) {
    console.log("  ok   " + name);
    return;
  }
  fails++;
  console.log("  DIFF " + name + (detail ? "\n    " + detail : ""));
}

function same(actual, expected) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

check("31 nodes", tree.nodes.length === 31, `got ${tree.nodes.length}`);
check("30 edges", tree.edges.length === 30, `got ${tree.edges.length}`);
check("9 columns", tree.columns.length === 9, `got ${tree.columns.length}`);
check("all node codes are unique", new Set(tree.nodes.map((node) => node.code)).size === 31);

const root = tree.nodes.find((node) => node.parent === null);
check(
  "root is center Final M104",
  root?.code === "M104" && root.side === "C" && root.col === 5 && root.round === "final",
  `got ${JSON.stringify(root)}`,
);

const finalFeeders = tree.edges
  .filter((edge) => edge.to === "M104")
  .sort((a, b) => a.feederIndex - b.feederIndex)
  .map((edge) => edge.from);
check("M101 and M102 feed M104", same(finalFeeders, ["M101", "M102"]), `got ${JSON.stringify(finalFeeders)}`);

const expectedColumns = [
  ["M74", "M77", "M73", "M75", "M83", "M84", "M81", "M82"],
  ["M89", "M90", "M93", "M94"],
  ["M97", "M98"],
  ["M101"],
  ["M104"],
  ["M102"],
  ["M99", "M100"],
  ["M91", "M92", "M95", "M96"],
  ["M76", "M78", "M79", "M80", "M86", "M88", "M85", "M87"],
];

expectedColumns.forEach((codes, index) => {
  check(
    `column ${index + 1} order`,
    same(tree.columns[index]?.codes, codes),
    `got ${JSON.stringify(tree.columns[index]?.codes)}`,
  );
});

check(
  "every edge agrees with the child parent",
  tree.edges.every((edge) => tree.byCode[edge.from]?.parent === edge.to),
);
check(
  "column sizes are 8/4/2/1/1/1/2/4/8",
  same(tree.columns.map((column) => column.codes.length), [8, 4, 2, 1, 1, 1, 2, 4, 8]),
  `got ${JSON.stringify(tree.columns.map((column) => column.codes.length))}`,
);
check(
  "M103 is excluded",
  !tree.byCode.M103 && !tree.edges.some((edge) => edge.from === "M103" || edge.to === "M103"),
);

const corrupted = JSON.parse(JSON.stringify(topology));
delete corrupted.ko_feed.M89;
let corruptionError = null;
try {
  deriveBracketTree(corrupted);
} catch (error) {
  corruptionError = error;
}
check(
  "missing feeder definition throws",
  corruptionError instanceof Error && corruptionError.message.includes("M89"),
  `got ${corruptionError?.message || "no error"}`,
);

console.log(fails ? `\nFAILED: ${fails}` : "\nBRACKET TREE OK: 31 nodes, 30 feeder edges, and stable mirrored ordering");
process.exit(fails ? 1 : 0);
