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
import { openCompare, addRival, loadRivals } from "./compare.js";
import { hashPicks } from "./storage.js";

const $ = (s) => document.querySelector(s);
let TOPO = null, LIVE = null;
let SHOWN = null;          // the picks currently rendered (needed by "Save as mine")
let IS_SHARED = false;     // viewing someone else's bracket via a share link
const HINT_KEY = "wcb.hint.compare.v1";   // dismissal flag for the compare-with-friends nudge

function hintDismissed() { try { return localStorage.getItem(HINT_KEY) === "1"; } catch (e) { return false; } }
// The nudge is the point of this fork, but only makes sense on your OWN saved bracket
// (you can't share a demo/shared preview) and only until you've dismissed it once.
function updateShareHint(own) { const h = $("#sharehint"); if (h) h.hidden = !(own && !hintDismissed()); }

// "Filter by team" is a collapsible panel (collapsed by default to avoid overload);
// remember the user's choice so it stays open/closed across renders.
const FILTER_KEY = "wcb.filter.open";
function wireRailFilter() {
  const rf = $("#railFilter"), btn = $("#rfToggle"); if (!rf || !btn) return;
  const set = (o) => { rf.classList.toggle("open", o); btn.setAttribute("aria-expanded", o ? "true" : "false");
    try { localStorage.setItem(FILTER_KEY, o ? "1" : "0"); } catch (e) {} };
  let open = false; try { open = localStorage.getItem(FILTER_KEY) === "1"; } catch (e) {}
  set(open);
  btn.onclick = () => set(!rf.classList.contains("open"));
}

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
  for (const id of ["vb-export", "vb-clear", "vb-share", "vb-compare"])
    { const el = $("#" + id); if (el) el.hidden = !own; }
  // 🏠 Home stays visible in every mode — the escape hatch, and it never deletes anything.
  $("#vb-saveshared").hidden = !isShared;
  $("#vb-back").hidden = !isShared;
  $("#vb-addrival").hidden = !isShared;
  const nRivals = loadRivals().length;
  $("#vb-compare").textContent = "🏆 Leaderboard" + (nRivals ? ` (${nRivals + 1})` : "");
  $("#sharepop").hidden = true;
  updateShareHint(own);                                // compare-with-friends nudge (own bracket only)
  initInteractions();                                  // run the verbatim interaction layer
  wireRailFilter();                                    // collapsible "Filter by team" panel
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

function showLanding() {
  const app = $("#app"); app.hidden = true; app.innerHTML = "";
  $("#viewerbar").hidden = true; $("#dab").hidden = true;
  const sh = $("#sharehint"); if (sh) sh.hidden = true;
  $("#errbox").hidden = true;
  $("#landing").hidden = false;
  refreshLanding();
  window.scrollTo(0, 0);
}

// 🏠 Home — back to the start page. Never deletes anything: the saved bracket and
// what-if edits stay; a preview (demo/shared) just restores the stashed state first.
function goHome() {
  restoreWhatIfs();
  clearHash();
  showLanding();
}

// Clear — the explicitly destructive one (its button says what it removes).
function toLanding() {
  restoreWhatIfs();               // drop any preview stash before clearing for real
  clearPicks();
  showLanding();
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
  const share = $("#vb-share");
  const closePop = () => { pop.hidden = true; };
  share.onclick = () => {
    const p = loadPicks(); if (!p || !TOPO) return;
    pop.hidden = !pop.hidden;
    if (!pop.hidden) {
      nameIn.value = p.entrant || "";
      urlIn.value = shareURL(nameIn.value) || "";
      copy.textContent = "Copy";
      nameIn.focus();
    }
  };
  $("#share-close").onclick = closePop;
  // Close on Escape or a click anywhere outside the popover (the Share button toggles it itself).
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !pop.hidden) closePop(); });
  document.addEventListener("click", (e) => {
    if (pop.hidden) return;
    if (pop.contains(e.target) || share.contains(e.target)) return;
    closePop();
  });
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
// Turn a pasted share link (or bare payload) into a rival on the local leaderboard.
function addRivalFromLink(text) {
  try {
    const m = String(text).match(/#b=([A-Za-z0-9_-]+)/) || String(text).trim().match(/^([A-Za-z0-9_-]{24,})$/);
    if (!m) return { ok: false, reason: "That doesn’t look like a share link — it should contain #b=…" };
    const picks = validateAgainstTopology(decodeShare(m[1], TOPO), TOPO);
    const mine = loadPicks();
    if (mine && hashPicks(mine) === hashPicks(picks)) return { ok: false, reason: "That’s your own bracket 🙂" };
    return addRival(picks);
  } catch (e) {
    const why = e instanceof ValidationError ? e.problems.join(" ") : (e.message || String(e));
    return { ok: false, reason: "Couldn’t add that bracket: " + why };
  }
}

async function addDemoRival() {
  try {
    const picks = validateAgainstTopology(await fetch("data/demo-picks.json").then(r => r.json()), TOPO);
    const mine = loadPicks();
    if (mine && hashPicks(mine) === hashPicks(picks)) return { ok: false, reason: "The demo *is* your bracket 🙂" };
    return addRival(picks);
  } catch (e) { return { ok: false, reason: "Couldn’t load the demo bracket." }; }
}

function openLeaderboard() {
  if (TOPO && LIVE) openCompare(TOPO, LIVE, { onAddLink: addRivalFromLink, onAddDemo: addDemoRival });
}

// Landing theme switcher (light/dark). Persists to the same key the dashboard
// uses (wcb.theme) so the choice carries straight into the dashboard, and reads
// data-theme back so it stays in sync when you return Home after changing themes.
function setLandingTheme(t) {
  document.documentElement.setAttribute("data-theme", t);
  try { localStorage.setItem("wcb.theme", t); } catch (e) {}
  syncLandingThemeButtons();
}
function syncLandingThemeButtons() {
  const t = document.documentElement.getAttribute("data-theme");
  document.querySelectorAll("[data-theme-btn]").forEach(b => {
    const on = b.getAttribute("data-theme-btn") === t;
    b.classList.toggle("on", on);
    b.setAttribute("aria-pressed", on ? "true" : "false");
  });
}

// Landing cards that depend on stored state: "Open my dashboard" when a bracket is
// saved (you can only reach the landing with one via 🏠 Home), "Your pool" when
// rivals exist.
function refreshLanding() {
  const mine = loadPicks();
  const row = $("#minerow");
  if (row) {
    row.hidden = !mine;
    const nm = $("#openmine-name");
    if (nm && mine) nm.textContent = (mine.entrant || "Your") + "’s bracket";
  }
  const card = $("#poolcard");
  if (!card) return;
  const n = loadRivals().length;
  card.hidden = n === 0;
  const c = $("#poolcount"); if (c) c.textContent = n;
  syncLandingThemeButtons();   // keep the landing light/dark switcher in sync
}

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
  // Landing nav: brand → back-to-top, and the light/dark theme switcher.
  const lhome = $("#lhome");
  if (lhome) lhome.onclick = () => window.scrollTo({ top: 0, behavior: "smooth" });
  document.querySelectorAll("[data-theme-btn]").forEach(b =>
    b.addEventListener("click", () => setLandingTheme(b.getAttribute("data-theme-btn"))));
  $("#importfile").onchange = async () => {
    const f = $("#importfile").files[0]; if (!f) return;
    try { accept(validateAgainstTopology(JSON.parse(await f.text()), TOPO)); }
    catch (e) { showError(e instanceof ValidationError ? e.problems : ["That JSON wasn’t a valid bracket: " + (e.message || e)]); }
  };
  $("#vb-home").onclick = goHome;
  $("#vb-clear").onclick = toLanding;
  const om = $("#openmine"); if (om) om.onclick = () => { const p = loadPicks(); if (p) showDashboard(p); };
  $("#vb-export").onclick = () => { const p = loadPicks(); if (p) exportPicks(p); };
  $("#vb-saveshared").onclick = () => {
    if (!SHOWN || !IS_SHARED) return;
    savePicks(SHOWN); clearHash();
    showDashboard(SHOWN);          // re-show as own (restores + resets what-ifs correctly)
  };
  $("#vb-back").onclick = () => { clearHash(); location.reload(); };
  $("#vb-compare").onclick = openLeaderboard;
  const po = $("#poolopen"); if (po) po.onclick = openLeaderboard;
  $("#vb-addrival").onclick = () => {
    if (!SHOWN || !IS_SHARED) return;
    const res = addRival(SHOWN);
    if (!res.ok) { alert(res.reason); return; }
    openLeaderboard();                 // straight to the standings — the payoff moment
  };
  wireShare();
  $("#sh-share").onclick = (e) => { e.stopPropagation(); $("#vb-share").click(); };   // open the share popover
  $("#sh-board").onclick = openLeaderboard;
  $("#sh-dismiss").onclick = () => { try { localStorage.setItem(HINT_KEY, "1"); } catch (e) {} $("#sharehint").hidden = true; };
  const dab = $("#dab"); if (dab) dab.onclick = () => window.scrollTo({ top: 0, behavior: "smooth" });
}

(async function () {
  try { const th = localStorage.getItem("wcb.theme") || "dark"; document.documentElement.setAttribute("data-theme", th); localStorage.setItem("wcb.theme", th); } catch (e) { document.documentElement.setAttribute("data-theme", "dark"); }
  wire();
  try { await loadData(); } catch (e) { console.warn("data load failed", e); }
  refreshLanding();
  const hash = openSharedFromHash();     // a share link wins over the saved bracket
  if (hash === "shown") return;
  if (hash === "failed") return;         // keep the landing + error visible, don't cover it
  const saved = loadPicks();
  if (saved) { try { showDashboard(saved); } catch (e) { console.warn(e); } }
})();
