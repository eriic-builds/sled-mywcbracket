import assert from "node:assert/strict";
import fs from "node:fs";

const read = path => fs.readFileSync(new URL(path, import.meta.url), "utf8");
const css = read("../docs/css/dashboard.css");
const index = read("../docs/index.html");
const interact = read("../docs/js/interact.js");
const builder = read("../docs/js/builder.js");
const render = read("../docs/js/render.js");
const matchDetails = read("../docs/js/match-details.js");
const trophy = read("../docs/js/trophy.js");

function check(name, test) {
  try {
    test();
    console.log(`  ok   ${name}`);
  } catch (error) {
    console.error(`  FAIL ${name}`);
    throw error;
  }
}

check("score progress uses a full-width transform fill", () => {
  assert.match(
    css,
    /\.sb-track i\{[^}]*width:100%[^}]*transform-origin:left center[^}]*transition:transform \.35s/,
  );
  assert.doesNotMatch(css, /\.sb-track i\{[^}]*transition:width/);
  assert.match(render, /id="scBar" style="transform:scaleX\(\$\{progress\}\)"/);
  assert.match(interact, /bar\.style\.transform='scaleX\('\+ratio\+'\)'/);
  assert.doesNotMatch(interact, /bar\.style\.width/);
});

check("builder progress uses a full-width transform fill", () => {
  assert.match(
    index,
    /\.bld-prog i\{[^}]*width:100%[^}]*transform-origin:left center[^}]*transition:transform \.2s/,
  );
  assert.match(builder, /class="bld-prog"><i style="transform:scaleX\(\$\{totalPicked\(\) \/ 31\}\)"/);
  assert.doesNotMatch(builder, /class="bld-prog"><i style="width:/);
});

check("team stat card coalesces pointer tracking into translate", () => {
  const tracking = interact.match(
    /\/\/ ---- hover: quick World Cup stat card[\s\S]*?paintFav\(\);apply\(\);recalc\(\);drawConnectors\(\);/,
  )?.[0] || "";
  assert.match(css, /\.statcard\{[^}]*left:0;top:0[^}]*translate:0 0/);
  assert.match(tracking, /cardFrame=nextFrame\(placeCard\)/);
  assert.match(tracking, /card\.style\.translate=/);
  assert.doesNotMatch(tracking, /card\.style\.(?:left|top|transform)=/);
  assert.match(interact, /adapted from wc26-bracket/);
  assert.doesNotMatch(interact, /extracted VERBATIM/);
});

check("static match fact-card positioning remains an intentional exception", () => {
  assert.match(matchDetails, /function positionFactCard\(card\)/);
  assert.match(matchDetails, /factcard\.style\.left/);
  assert.match(matchDetails, /factcard\.style\.top/);
  assert.doesNotMatch(matchDetails, /requestAnimationFrame\([^)]*positionFactCard/);
});

check("runtime CSS names every transitioned property", () => {
  const declarations = [...`${css}\n${index}`.matchAll(/transition\s*:\s*([^;}]+)/g)]
    .map(match => match[1].trim());
  assert.ok(declarations.length > 20, "expected to audit the full runtime transition surface");
  for (const declaration of declarations) {
    for (const item of declaration.split(",")) {
      assert.doesNotMatch(
        item.trim(),
        /^(?:\d*\.)?\d+(?:ms|s)\b/,
        `duration-only transition animates every property: ${declaration}`,
      );
      assert.doesNotMatch(
        item,
        /\b(?:left|right|top|bottom|width|height|margin|padding|max-height)\b/,
        `layout property must not transition: ${declaration}`,
      );
    }
  }
});

check("toggle and live pulses use compositor-eligible properties", () => {
  assert.match(css, /\.toggle input:checked \+ \.tsw::after\{[^}]*transform:translateX\(16px\)/);
  assert.doesNotMatch(css, /\.toggle input:checked \+ \.tsw::after\{[^}]*left:/);
  assert.match(css, /\.pill\.live \.dot::after\{[^}]*animation:pulse/);
  assert.match(css, /@keyframes pulse\{[^}]*opacity:[^}]*transform:scale/);
  assert.doesNotMatch(css, /@keyframes pulse\{[^\n]*box-shadow/);
  assert.match(index, /\.badge \.dot::after\{[^}]*animation:lbadge-pulse/);
  assert.match(index, /@keyframes lbadge-pulse\{[^}]*opacity:[^}]*transform:scale/);
  assert.doesNotMatch(index, /@keyframes lbadge-pulse\{[^\n]*box-shadow/);
});

check("reduced motion includes pulse pseudo-elements", () => {
  assert.match(css, /@media\(prefers-reduced-motion:reduce\)\{\*,\*::before,\*::after\{/);
  assert.match(css, /data-theme="easy"\] \.pill\.live \.dot::after\{animation:none\}/);
  assert.match(css, /data-theme="geocities"\] \.pill\.live \.dot::after\{animation:none\}/);
  assert.match(index, /@media\(prefers-reduced-motion:reduce\)/);
  assert.match(index, /#landing \.badge \.dot::after\{animation:none\}/);
});

check("trophy bounds passive rendering and releases phone WebGL", () => {
  assert.match(trophy, /const AUTO_FRAME_MS = 1000 \/ 30/);
  assert.match(trophy, /now - lastFrame < AUTO_FRAME_MS/);
  assert.match(
    trophy,
    /now - lastFrame < AUTO_FRAME_MS\)[\s\S]*?requestAnimationFrame\(animate\)[\s\S]*?return/,
  );
  assert.match(
    trophy,
    /if \(phone\) \{[\s\S]*?disposeScene\(\)[\s\S]*?classList\.remove\("trophy-ready"\)/,
  );
  assert.match(trophy, /if \(dragging && event\.pointerId === pointerId\)[\s\S]*?renderNow\(\)/);
  for (const lifecycle of [
    "IntersectionObserver",
    "visibilitychange",
    "prefers-reduced-motion: reduce",
    "webglcontextlost",
    "powerPreference: \"low-power\"",
  ]) {
    assert.ok(trophy.includes(lifecycle), `missing trophy lifecycle safeguard: ${lifecycle}`);
  }
});

console.log("\nANIMATION PERFORMANCE GUARDS OK");
