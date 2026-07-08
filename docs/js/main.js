// main.js — glue: load topology + live results, handle upload/demo/import/share-links,
// render, and run the interaction layer after injection. All bracket parsing stays in
// the browser; a bracket only ever leaves it inside a link its owner creates.
import { renderDashboard } from "./render.js";
import { initInteractions } from "./interact.js";
import { savePicks, loadPicks, clearPicks, exportPicks, resetWhatIfsIfChanged,
         stashWhatIfs, restoreWhatIfs } from "./storage.js";
import { parseWorkbook, validateAgainstTopology, ValidationError } from "./parse-excel.js";
import { openBuilder } from "./builder.js";
import { encodeShare, decodeShare } from "./share.js";

const $ = (s) => document.querySelector(s);
let TOPO = null, LIVE = null;
let SHOWN = null;          // the picks currently rendered (needed by "Save as mine")
let IS_SHARED = false;     // viewing someone else's bracket via a share link

async function loadData() {
  const [t, l] = await Promise.all([
    fetch("data/topology.json").then(r => r.json()),
    fetch("data/results.json", { cache: "no-cache" }).then(r => r.json()),
  ]);
  TOPO = t; LIVE = l;
}

function showDashboard(picks, isDemo = false, isShared = false) {
  // Previews (demo/shared) stash the owner's what-if state; the owner's own bracket
  // restores it. Then the per-bracket reset gives previews a clean slate without
  // destroying the real edits (they come back via the stash).
  if (isDemo || isShared) stashWhatIfs(); else restoreWhatIfs();
  resetWhatIfsIfChanged(picks);
  SHOWN = picks; IS_SHARED = isShared;
  const app = $("#app");
  app.innerHTML = renderDashboard(picks, LIVE, TOPO);
  $("#landing").hidden = true;
  app.hidden = false;
  $("#viewerbar").hidden = false;
  $("#dab").hidden = false;
  $("#vb-name").textContent = (picks.entrant || "your bracket") + (isDemo ? " (demo)" : isShared ? " (shared)" : "");
  const savedTag = document.querySelector(".vb-saved");
  if (savedTag) savedTag.hidden = isDemo || isShared;   // only true for the owner's bracket
  // Viewer-bar mode: own bracket -> manage/share buttons; shared -> save/back only.
  const own = !isDemo && !isShared;
  for (const id of ["vb-replace", "vb-export", "vb-clear", "vb-share"])
    { const el = $("#" + id); if (el) el.hidden = !own; }
  $("#vb-saveshared").hidden = !isShared;
  $("#vb-back").hidden = !isShared;
  $("#sharepop").hidden = true;
  initInteractions();                                  // run the verbatim interaction layer
  if (window.__drawConn) setTimeout(window.__drawConn, 90);  // initial connector draw
  window.scrollTo(0, 0);
}

function accept(picks) { savePicks(picks); showDashboard(picks); }   // real bracket -> persist

function showError(problems) {
  const box = $("#errbox");
  box.innerHTML = '<div class="err-h">⚠️ That didn’t look like a valid bracket</div><ul>' +
    problems.map(p => `<li>${String(p).replace(/&/g, "&amp;").replace(/</g, "&lt;")}</li>`).join("") +
    '</ul><div class="err-f">Fix the sheet and try again, or <button id="err-demo" class="linkbtn">view the demo bracket</button>.</div>';
  box.hidden = false;
  $("#err-demo").onclick = onDemo;
}

async function handleFile(file) {
  $("#errbox").hidden = true;
  try {
    const buf = await file.arrayBuffer();
    const picks = validateAgainstTopology(parseWorkbook(buf), TOPO);
    accept(picks);
  } catch (e) {
    showError(e instanceof ValidationError ? e.problems : ["Couldn’t read that file: " + (e.message || e)]);
  }
}

async function onDemo() {
  try {
    const picks = await fetch("data/demo-picks.json").then(r => r.json());
    showDashboard(picks, true);   // preview only — the demo is not saved as "your" bracket
  } catch (e) { showError(["Couldn’t load the demo bracket."]); }
}

function clearHash() { history.replaceState(null, "", location.pathname + location.search); }

function toLanding() {
  restoreWhatIfs();               // drop any preview stash before clearing for real
  clearPicks();
  const app = $("#app"); app.hidden = true; app.innerHTML = "";
  $("#viewerbar").hidden = true; $("#dab").hidden = true;
  $("#errbox").hidden = true;
  $("#landing").hidden = false;
  window.scrollTo(0, 0);
}

// ── share-link UI ──────────────────────────────────────────────────────────
function shareURL(alias) {
  const p = loadPicks();
  if (!p) return null;
  const name = String(alias || "").trim() || p.entrant || "";
  return location.origin + location.pathname + "#b=" + encodeShare({ ...p, entrant: name }, TOPO);
}

function wireShare() {
  const pop = $("#sharepop"), nameIn = $("#share-name"), urlIn = $("#share-url"), copy = $("#share-copy");
  $("#vb-share").onclick = () => {
    const p = loadPicks(); if (!p || !TOPO) return;
    pop.hidden = !pop.hidden;
    if (!pop.hidden) {
      nameIn.value = p.entrant || "";
      urlIn.value = shareURL(nameIn.value) || "";
      copy.textContent = "Copy";
      nameIn.focus();
    }
  };
  nameIn.oninput = () => { urlIn.value = shareURL(nameIn.value) || ""; copy.textContent = "Copy"; };
  copy.onclick = async () => {
    const url = shareURL(nameIn.value); if (!url) return;
    urlIn.value = url;
    try { await navigator.clipboard.writeText(url); copy.textContent = "✓ Copied"; }
    catch (e) { urlIn.select(); copy.textContent = "Select + copy"; }  // clipboard denied -> manual
  };
  urlIn.onclick = () => urlIn.select();
}

// Returns "shown" (shared bracket rendered), "failed" (bad link — error is showing,
// stay on the landing so the message isn't covered up), or "none" (no share hash).
function openSharedFromHash() {
  const m = location.hash.match(/^#b=([A-Za-z0-9_-]+)$/);
  if (!m || !TOPO) return "none";
  try {
    const shared = validateAgainstTopology(decodeShare(m[1], TOPO), TOPO);
    showDashboard(shared, false, true);
    return "shown";
  } catch (e) {
    const why = (e instanceof ValidationError) ? e.problems : [e.message || String(e)];
    showError(["That share link couldn’t be opened: " + why.join(" ") +
      " Ask the sender to copy it again — links are safe to resend."]);
    clearHash();
    return "failed";
  }
}

function wire() {
  const fileInput = $("#file");
  $("#build").onclick = () => { if (TOPO) openBuilder(TOPO, accept, () => {}); };  // build -> save+show
  $("#pick").onclick = () => fileInput.click();
  fileInput.onchange = () => { if (fileInput.files[0]) handleFile(fileInput.files[0]); };
  const dz = $("#drop");
  dz.addEventListener("click", () => fileInput.click());
  ["dragover", "dragenter"].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.add("over"); }));
  ["dragleave", "drop"].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.remove("over"); }));
  dz.addEventListener("drop", e => { const f = e.dataTransfer.files && e.dataTransfer.files[0]; if (f) handleFile(f); });
  $("#demo").onclick = onDemo;
  $("#import").onclick = () => $("#importfile").click();
  $("#importfile").onchange = async () => {
    const f = $("#importfile").files[0]; if (!f) return;
    try { accept(validateAgainstTopology(JSON.parse(await f.text()), TOPO)); }
    catch (e) { showError(e instanceof ValidationError ? e.problems : ["That JSON wasn’t a valid bracket: " + (e.message || e)]); }
  };
  $("#vb-replace").onclick = toLanding;
  $("#vb-clear").onclick = toLanding;
  $("#vb-export").onclick = () => { const p = loadPicks(); if (p) exportPicks(p); };
  $("#vb-saveshared").onclick = () => {
    if (!SHOWN || !IS_SHARED) return;
    savePicks(SHOWN); clearHash();
    showDashboard(SHOWN);          // re-show as own (restores + resets what-ifs correctly)
  };
  $("#vb-back").onclick = () => { clearHash(); location.reload(); };
  wireShare();
  const dab = $("#dab"); if (dab) dab.onclick = () => window.scrollTo({ top: 0, behavior: "smooth" });
}

(async function () {
  try { const th = localStorage.getItem("wcb.theme"); if (th) document.documentElement.setAttribute("data-theme", th); } catch (e) {}
  wire();
  try { await loadData(); } catch (e) { console.warn("data load failed", e); }
  const hash = openSharedFromHash();     // a share link wins over the saved bracket
  if (hash === "shown") return;
  if (hash === "failed") return;         // keep the landing + error visible, don't cover it
  const saved = loadPicks();
  if (saved) { try { showDashboard(saved); } catch (e) { console.warn(e); } }
})();
