import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8");
const css = read("../docs/css/dashboard.css");
const fontsCss = read("../docs/css/fonts.css");

const easyTheme = css.match(/html\[data-theme="easy"\]\{([^}]*)\}/)?.[1] || "";
assert.match(easyTheme, /color-scheme:dark/);
assert.match(easyTheme, /--bg:#1C1A17/);
assert.match(easyTheme, /--fstack:"OpenDyslexic"/);
assert.match(css, /\.kpi-l\{[^}]*padding-right:26px[^}]*\}/);
assert.match(css, /html\[data-theme="easy"\] \.scrow\.schead\{[^}]*text-transform:none/);

for (const weight of ["400", "700"]) {
  assert.match(fontsCss, new RegExp(`font-family:['"]OpenDyslexic['"];[^}]*font-weight:${weight}`));
  const fontPath = new URL(`../docs/fonts/opendyslexic-${weight}-normal.woff2`, import.meta.url);
  assert.ok(fs.statSync(fontPath).size > 0, `${fontPath.pathname} is empty`);
}

console.log("PRODUCTION REGRESSIONS OK");
