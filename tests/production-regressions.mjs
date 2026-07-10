import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8");
const css = read("../docs/css/dashboard.css");
const fontsCss = read("../docs/css/fonts.css");
const index = read("../docs/index.html");
const matchDetailsJs = read("../docs/js/match-details.js");
const normalizedIndex = index.replace(/\s+/g, " ");

const easyTheme = css.match(/html\[data-theme="easy"\]\{([^}]*)\}/)?.[1] || "";
assert.match(easyTheme, /color-scheme:dark/);
assert.match(easyTheme, /--bg:#1C1A17/);
assert.match(easyTheme, /--fstack:"OpenDyslexic"/);
assert.match(css, /\.kpi-l\{[^}]*padding-right:26px[^}]*\}/);
assert.match(css, /html\[data-theme="easy"\] \.scrow\.schead\{[^}]*text-transform:none/);
assert.match(css, /\.side\{[^}]*position:sticky/);
assert.match(css, /\.side\{[^}]*max-height:calc\(100vh - 40px\)[^}]*overflow-y:auto/);
assert.match(css, /\.railfilter\{[^}]*padding:14px 12px/);
assert.match(css, /\.project-disclaimer\{[^}]*background:#141317[^}]*color:#F4F7EE/);
assert.match(css, /\.portrait-credit-social\{[^}]*min-width:24px[^}]*min-height:24px/);
assert.doesNotMatch(css, /\.foot \.credit\{[^}]*opacity:/);
assert.match(css, /\.foot \.credit>span:first-child\{[^}]*opacity:\.6/);
assert.match(index, /Independent fan project\.<\/b> Not affiliated with, endorsed by, or sponsored by/);
assert.match(index, /id="project-disclaimer" class="project-disclaimer"/);
assert.doesNotMatch(index, /id="lhometab"/);
assert.match(index, /id="vb-home"/);
assert.doesNotMatch(matchDetailsJs, /text:\s*"@eriic-builds"/);
assert.doesNotMatch(matchDetailsJs, /text:\s*"in\/ericxlam"/);
assert.match(matchDetailsJs, /label:\s*"eriic-builds on GitHub"/);
assert.match(matchDetailsJs, /label:\s*"Eric Lam on LinkedIn"/);
assert.equal(
  (normalizedIndex.match(/Not affiliated with, endorsed by, or sponsored by FIFA, Microsoft, GitHub/g) || []).length,
  2,
);

for (const weight of ["400", "700"]) {
  assert.match(fontsCss, new RegExp(`font-family:['"]OpenDyslexic['"];[^}]*font-weight:${weight}`));
  const fontPath = new URL(`../docs/fonts/opendyslexic-${weight}-normal.woff2`, import.meta.url);
  assert.ok(fs.statSync(fontPath).size > 0, `${fontPath.pathname} is empty`);
}

console.log("PRODUCTION REGRESSIONS OK");
