const ROUND_BY_DEPTH = ["final", "sf", "qf", "r16", "r32"];

const COLUMN_SPECS = [
  { col: 1, side: "L", round: "r32" },
  { col: 2, side: "L", round: "r16" },
  { col: 3, side: "L", round: "qf" },
  { col: 4, side: "L", round: "sf" },
  { col: 5, side: "C", round: "final" },
  { col: 6, side: "R", round: "sf" },
  { col: 7, side: "R", round: "qf" },
  { col: 8, side: "R", round: "r16" },
  { col: 9, side: "R", round: "r32" },
];

export function deriveBracketTree(topology) {
  const koFeed = topology?.ko_feed;
  if (!koFeed || typeof koFeed !== "object" || Array.isArray(koFeed)) {
    throw new Error("Invalid ko_feed: expected an object");
  }

  const parentCodes = Object.keys(koFeed);
  const feederCodes = new Set();

  for (const code of parentCodes) {
    const feeders = koFeed[code];
    if (!Array.isArray(feeders) || feeders.length !== 2) {
      throw new Error(`Invalid ${code}: expected exactly two feeders`);
    }
    for (const feeder of feeders) {
      if (typeof feeder !== "string" || feeder.length === 0) {
        throw new Error(`Invalid ${code}: feeder codes must be non-empty strings`);
      }
      feederCodes.add(feeder);
    }
  }

  const roots = parentCodes.filter((code) => !feederCodes.has(code));
  if (roots.length !== 1) {
    throw new Error(`Invalid ko_feed root: expected one root, found ${roots.length} (${roots.join(", ") || "none"})`);
  }

  const root = roots[0];
  const drafts = new Map();
  const encounterOrder = [];
  const edges = [];
  const visiting = new Set();

  function visit(code, depth, side, parent) {
    if (visiting.has(code)) {
      throw new Error(`Invalid ${code}: cycle detected`);
    }
    if (drafts.has(code)) {
      throw new Error(`Invalid ${code}: duplicate node or multiple parents`);
    }
    if (depth < 0 || depth >= ROUND_BY_DEPTH.length) {
      throw new Error(`Invalid ${code}: unsupported depth ${depth}`);
    }

    const feeders = Object.hasOwn(koFeed, code) ? koFeed[code] : null;
    if (depth < 4 && feeders === null) {
      throw new Error(`Invalid ${code}: expected two feeders at depth ${depth}`);
    }
    if (depth === 4 && feeders !== null) {
      throw new Error(`Invalid ${code}: r32 nodes cannot have feeders`);
    }

    visiting.add(code);
    drafts.set(code, {
      code,
      round: ROUND_BY_DEPTH[depth],
      side,
      parent,
      feeders: feeders ? [...feeders] : null,
    });
    encounterOrder.push(code);

    if (feeders) {
      feeders.forEach((feeder, feederIndex) => {
        const childSide = depth === 0 ? (feederIndex === 0 ? "L" : "R") : side;
        visit(feeder, depth + 1, childSide, code);
        edges.push({ from: feeder, to: code, feederIndex, side: childSide });
      });
    }

    visiting.delete(code);
  }

  visit(root, 0, "C", null);

  for (const code of parentCodes) {
    if (!drafts.has(code)) {
      throw new Error(`Invalid ${code}: orphaned ko_feed entry`);
    }
  }
  if (drafts.size !== 31) {
    throw new Error(`Invalid ${root}: expected 31 unique nodes, found ${drafts.size}`);
  }
  if (edges.length !== 30) {
    throw new Error(`Invalid ${root}: expected 30 feeder edges, found ${edges.length}`);
  }

  const columns = COLUMN_SPECS.map(({ col, side, round }) => ({
    col,
    side,
    round,
    codes: encounterOrder.filter((code) => {
      const node = drafts.get(code);
      return node.side === side && node.round === round;
    }),
  }));

  const nodes = [];
  const byCode = {};

  for (const column of columns) {
    column.codes.forEach((code, slot) => {
      const node = { ...drafts.get(code), col: column.col, slot };
      nodes.push(node);
      byCode[code] = node;
    });
  }

  if (nodes.length !== drafts.size) {
    const missing = encounterOrder.find((code) => !byCode[code]);
    throw new Error(`Invalid ${missing || root}: node does not map to a bracket column`);
  }

  return { nodes, edges, byCode, columns };
}
