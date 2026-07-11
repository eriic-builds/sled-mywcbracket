import assert from "node:assert/strict";
import fs from "node:fs";
import {
  createBallPhysics,
  createSoccerBallTopology,
  resetBallDrop,
  resizeBallPhysics,
  setBallpitTarget,
  stepBallPhysics,
} from "../docs/js/landing-ballpit.js";

const bounds = { x: 6, y: 5 };

function check(name, test) {
  try {
    test();
    console.log(`  ok   ${name}`);
  } catch (error) {
    console.error(`  FAIL ${name}`);
    throw error;
  }
}

check("control ball pushes an overlapping ball", () => {
  const state = createBallPhysics(2, bounds, 1);
  state.radius[0] = 0.75;
  state.radius[1] = 0.5;
  state.position.set([0, 0, 0.4, 0]);
  state.velocity.fill(0);
  setBallpitTarget(state, bounds, 0, 0);

  stepBallPhysics(state, bounds, 1 / 60);

  assert.ok(state.position[2] > 0.4, "the dynamic ball should be separated away from the control ball");
  assert.ok(state.velocity[2] > 0, "the dynamic ball should receive an outward impulse");
});

check("resizing and wall collisions keep balls in bounds", () => {
  const state = createBallPhysics(3, bounds, 2);
  const narrow = { x: 2.6, y: 3.2 };
  state.position.set([0, 0, 100, 100, -100, -100]);
  state.velocity.set([0, 0, 4, 4, -4, -4]);

  resizeBallPhysics(state, narrow, 3);
  stepBallPhysics(state, narrow, 1 / 60);

  for (let i = 0; i < state.count; i++) {
    const offset = i * 2;
    assert.ok(state.position[offset] >= -narrow.x + state.radius[i] - 1e-5);
    assert.ok(state.position[offset] <= narrow.x - state.radius[i] + 1e-5);
    assert.ok(state.position[offset + 1] >= -narrow.y + state.radius[i] - 1e-5);
    assert.ok(state.position[offset + 1] <= narrow.y - state.radius[i] + 1e-5);
  }
});

check("long deterministic run stays finite and bounded", () => {
  const state = createBallPhysics(24, bounds, 3);
  for (let frame = 0; frame < 1200; frame++) {
    if (frame % 40 === 0) {
      const x = Math.sin(frame * 0.031) * (bounds.x - state.radius[0]);
      const y = Math.cos(frame * 0.023) * (bounds.y - state.radius[0]);
      setBallpitTarget(state, bounds, x, y);
    }
    stepBallPhysics(state, bounds, frame % 90 === 0 ? 0.2 : 1 / 60);
  }

  for (let i = 0; i < state.count; i++) {
    const offset = i * 2;
    assert.ok(Number.isFinite(state.position[offset]));
    assert.ok(Number.isFinite(state.position[offset + 1]));
    assert.ok(Number.isFinite(state.velocity[offset]));
    assert.ok(Number.isFinite(state.velocity[offset + 1]));
    assert.ok(state.position[offset] >= -bounds.x + state.radius[i] - 1e-5);
    assert.ok(state.position[offset] <= bounds.x - state.radius[i] + 1e-5);
    assert.ok(state.position[offset + 1] >= -bounds.y + state.radius[i] - 1e-5);
    assert.ok(state.position[offset + 1] <= bounds.y - state.radius[i] + 1e-5);
  }
});

check("motion restart resets every ball near the top with downward velocity", () => {
  const state = createBallPhysics(24, bounds, 4);
  for (let i = 0; i < 90; i++) stepBallPhysics(state, bounds, 1 / 60);
  resetBallDrop(state, bounds, 5);

  for (let i = 0; i < state.count; i++) {
    const offset = i * 2;
    assert.ok(state.position[offset] >= -bounds.x + state.radius[i]);
    assert.ok(state.position[offset] <= bounds.x - state.radius[i]);
    assert.ok(state.position[offset + 1] > bounds.y - state.radius[i] - 2);
    assert.ok(state.velocity[offset + 1] < 0);
  }
});

check("soccer shell has the classic truncated-icosahedron topology", () => {
  const topology = createSoccerBallTopology();
  assert.equal(topology.vertices.length, 60);
  assert.equal(topology.pentagons.length, 12);
  assert.equal(topology.hexagons.length, 20);
  assert.equal(topology.edges.length, 90);
  assert.deepEqual([...new Set(topology.pentagons.map(face => face.length))], [5]);
  assert.deepEqual([...new Set(topology.hexagons.map(face => face.length))], [6]);
});

const read = path => fs.readFileSync(new URL(path, import.meta.url), "utf8");
const index = read("../docs/index.html");
const main = read("../docs/js/main.js");
const compare = read("../docs/js/compare.js");
const moduleSource = read("../docs/js/landing-ballpit.js");

check("landing mounts a decorative non-blocking canvas", () => {
  assert.match(index, /class="hero-bg" data-landing-ballpit aria-hidden="true"/);
  assert.match(index, /id="balltoggle"[^>]*aria-pressed="true"/);
  assert.match(index, /id="balltoggle-label">Motion on/);
  assert.match(index, /\.landing-ballpit-canvas\{[^}]*pointer-events:none/);
  assert.match(index, /\.hero-frame\{[^}]*touch-action:pan-y/);
  assert.match(index, /\.landing-ballpit-touch\{[^}]*touch-action:none/);
  assert.match(index, /@media\(pointer:coarse\)\{#landing \.landing-ballpit-touch\{pointer-events:auto/);
});

check("main lazy-loads and pauses the landing ballpit", () => {
  assert.match(main, /wcb\.landing\.ballpit\.v1/);
  assert.match(main, /import\("\.\/landing-ballpit\.js"\)/);
  assert.match(main, /LANDING_BALLPIT\.setEnabled\(LANDING_BALLPIT_ENABLED, true\)/);
  assert.match(main, /setLandingBallpitActive\(false\)/);
  assert.match(main, /setLandingBallpitActive\(true\)/);
  assert.match(main, /onClose: \(\) => \{ if \(!\$\("#landing"\)\.hidden\) setLandingBallpitActive\(true\)/);
  assert.match(compare, /if \(onClose\) onClose\(\)/);
});

check("renderer uses local instancing and resilient lifecycle paths", () => {
  assert.match(moduleSource, /from "\.\/vendor\/three\.module\.min\.js"/);
  assert.match(moduleSource, /new THREE\.InstancedMesh/);
  assert.match(moduleSource, /createSoccerBallGeometries/);
  assert.match(moduleSource, /new THREE\.CanvasTexture/);
  assert.match(moduleSource, /prefers-reduced-motion: reduce/);
  assert.match(moduleSource, /IntersectionObserver/);
  assert.match(moduleSource, /visibilitychange/);
  assert.match(moduleSource, /webglcontextlost/);
  assert.match(moduleSource, /powerPreference: "low-power"/);
});

check("curated ball flags use bundled SVG assets", () => {
  for (const code of ["us", "ca", "mx", "ar", "br", "gb-eng", "fr", "jp"]) {
    const flag = new URL(`../docs/flags/${code}.svg`, import.meta.url);
    assert.ok(fs.statSync(flag).size > 0, `${flag.pathname} is missing or empty`);
  }
});

console.log("\nLANDING BALLPIT OK");
