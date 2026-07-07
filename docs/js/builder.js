// builder.js — interactive in-browser bracket builder. For people who don't have the
// Excel: click winners round by round and get the same picks object the parser produces,
// then the dashboard renders it. Structure/order are derived from data/topology.json so
// the output matches an uploaded workbook exactly.

// ── pure core (unit-testable) ────────────────────────────────────────────────
export function deriveStructure(topology) {
  const r32 = topology.r32.map(m => ({ code: m[0], date: m[1], a: m[2], b: m[3] }));
  const feedToCode = {};
  for (const k in topology.ko_feed) feedToCode[topology.ko_feed[k].join(",")] = k;
  const codeFor = (fa, fb) => feedToCode[fa + "," + fb] || feedToCode[fb + "," + fa];
  const r32codes = r32.map(m => m.code);
  const r16codes = [], qfcodes = [], sfcodes = [];
  for (let j = 0; j < 8; j++) r16codes.push(codeFor(r32codes[2 * j], r32codes[2 * j + 1]));
  for (let j = 0; j < 4; j++) qfcodes.push(codeFor(r16codes[2 * j], r16codes[2 * j + 1]));
  for (let j = 0; j < 2; j++) sfcodes.push(codeFor(qfcodes[2 * j], qfcodes[2 * j + 1]));
  const finalcode = codeFor(sfcodes[0], sfcodes[1]);
  const rounds = [
    { key: "r32", label: "Round of 32", codes: r32codes },
    { key: "r16", label: "Round of 16", codes: r16codes },
    { key: "qf", label: "Quarterfinals", codes: qfcodes },
    { key: "sf", label: "Semifinals", codes: sfcodes },
    { key: "final", label: "The Final", codes: [finalcode] },
  ];
  return { r32, seed: topology.seed || {}, koFeed: topology.ko_feed, rounds,
    r32codes, r16codes, qfcodes, sfcodes, finalcode };
}

// The two teams in a match, given current selections (feeder winners for KO rounds).
export function teamsFor(S, code, sel) {
  const m = S.r32.find(x => x.code === code);
  if (m) return [m.a, m.b];
  const [fa, fb] = S.koFeed[code];
  return [sel[fa] || null, sel[fb] || null];
}

// After a pick changes, drop any downstream selection whose team no longer advances.
export function repair(S, sel) {
  for (let r = 1; r < S.rounds.length; r++) {
    for (const code of S.rounds[r].codes) {
      const [a, b] = teamsFor(S, code, sel);
      if (sel[code] && sel[code] !== a && sel[code] !== b) delete sel[code];
    }
  }
  return sel;
}

export function buildPicks(topology, sel, entrant, tiebreaker) {
  const S = deriveStructure(topology);
  const r32 = S.r32.map(m => [m.code, m.date, m.a, m.b, sel[m.code]]);
  const r16_win = S.r16codes.map(c => sel[c]);
  const qf_win = S.qfcodes.map(c => sel[c]);
  const sf_win = S.sfcodes.map(c => sel[c]);
  const champ = sel[S.finalcode];
  const runner = sf_win.find(t => t && t !== champ) || "";
  const tb = parseInt(String(tiebreaker).replace(/[^\d-]/g, ""), 10);
  return {
    entrant: String(entrant || "").trim(), tiebreaker: isNaN(tb) ? 0 : tb,
    freebie_match: "M73", r32, r16_win, qf_win, sf_win, champ, runner, seed: S.seed,
  };
}

// ── interactive UI ───────────────────────────────────────────────────────────
const DRAFT = "wcb.fan.draft.v1";
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function openBuilder(topology, onDone, onCancel, resume = true) {
  const S = deriveStructure(topology);
  let sel = {}, step = 0, entrant = "", tiebreaker = "";
  if (resume) {
    try {
      const d = JSON.parse(localStorage.getItem(DRAFT) || "null");
      if (d) { sel = d.sel || {}; step = d.step || 0; entrant = d.entrant || ""; tiebreaker = d.tiebreaker || ""; repair(S, sel); }
    } catch (e) {}
  }
  const saveDraft = () => { try { localStorage.setItem(DRAFT, JSON.stringify({ sel, step, entrant, tiebreaker })); } catch (e) {} };
  const clearDraft = () => { try { localStorage.removeItem(DRAFT); } catch (e) {} };

  const host = document.getElementById("builder");
  host.hidden = false;
  const seedTag = (t) => S.seed[t] ? `<span class="seed">${esc(S.seed[t])}</span>` : "";
  const roundDone = (r) => S.rounds[r].codes.every(c => sel[c]);
  const totalPicked = () => S.rounds.reduce((n, r) => n + r.codes.filter(c => sel[c]).length, 0);

  function matchCard(code) {
    const [a, b] = teamsFor(S, code, sel);
    const w = sel[code];
    const teamBtn = (t, feeder) => {
      if (!t) return `<div class="bld-team tbd">Winner of ${esc(feeder)}</div>`;
      const on = w === t ? " picked" : (w ? " dim" : "");
      return `<button class="bld-team${on}" data-code="${esc(code)}" data-team="${esc(t)}">${seedTag(t)}<span class="tname">${esc(t)}</span><span class="bld-check">\u2713</span></button>`;
    };
    const fa = S.r32.find(x => x.code === code) ? null : S.koFeed[code];
    return `<div class="bld-match"><div class="bld-mc">${esc(code)}</div>` +
      teamBtn(a, fa ? fa[0] : "") + `<div class="bld-vs">vs</div>` + teamBtn(b, fa ? fa[1] : "") + `</div>`;
  }

  function render() {
    const r = S.rounds[step], isFinal = step === S.rounds.length - 1;
    const steps = S.rounds.map((rr, i) =>
      `<span class="bld-dot${i === step ? " on" : ""}${roundDone(i) ? " ok" : ""}" data-step="${i}" title="${esc(rr.label)}">${["32", "16", "QF", "SF", "F"][i]}</span>`).join("<span class=\"bld-sep\"></span>");
    const picked = r.codes.filter(c => sel[c]).length;
    const grid = `<div class="bld-grid">${r.codes.map(matchCard).join("")}</div>`;
    const finishPanel = isFinal ? `
      <div class="bld-finish">
        <div class="bld-fh">${sel[S.finalcode] ? "\u{1F3C6} Champion: <b>" + esc(sel[S.finalcode]) + "</b>" : "Pick your champion above"}</div>
        <label class="bld-field"><span>Your name</span><input id="bld-name" type="text" maxlength="40" placeholder="e.g. Alex" value="${esc(entrant)}"></label>
        <label class="bld-field"><span>Tiebreaker <small>(total goals in the Final)</small></span><input id="bld-tb" type="number" min="0" max="20" placeholder="e.g. 3" value="${esc(tiebreaker)}"></label>
      </div>` : "";
    host.querySelector(".bld-inner").innerHTML = `
      <div class="bld-head">
        <div><div class="bld-title">Build your bracket</div><div class="bld-sub">Tap the winner of each match \u2014 no spreadsheet needed.</div></div>
        <button class="bld-x" id="bld-cancel" title="Close">\u2715</button>
      </div>
      <div class="bld-steps">${steps}</div>
      <div class="bld-roundhead"><b>${esc(r.label)}</b> <span>${picked}/${r.codes.length} picked</span></div>
      <div class="bld-body">${grid}${finishPanel}</div>
      <div class="bld-foot">
        <button class="bld-btn ghost" id="bld-back"${step === 0 ? " disabled" : ""}>\u2190 Back</button>
        <div class="bld-prog"><i style="width:${Math.round(totalPicked() / 31 * 100)}%"></i></div>
        ${isFinal
          ? `<button class="bld-btn go" id="bld-done">See my dashboard \u2192</button>`
          : `<button class="bld-btn go" id="bld-next"${roundDone(step) ? "" : " disabled"}>Next \u2192</button>`}
      </div>`;
    wire();
  }

  function wire() {
    host.querySelectorAll(".bld-team[data-team]").forEach(btn => btn.addEventListener("click", () => {
      sel[btn.dataset.code] = btn.dataset.team; repair(S, sel); saveDraft(); render();
    }));
    host.querySelectorAll(".bld-dot").forEach(d => d.addEventListener("click", () => { step = +d.dataset.step; render(); }));
    const back = host.querySelector("#bld-back"); if (back) back.onclick = () => { step = Math.max(0, step - 1); render(); };
    const next = host.querySelector("#bld-next"); if (next) next.onclick = () => { if (roundDone(step)) { step++; saveDraft(); render(); } };
    const cancel = host.querySelector("#bld-cancel"); if (cancel) cancel.onclick = () => { close(); if (onCancel) onCancel(); };
    const name = host.querySelector("#bld-name"); if (name) name.oninput = () => { entrant = name.value; saveDraft(); };
    const tb = host.querySelector("#bld-tb"); if (tb) tb.oninput = () => { tiebreaker = tb.value; saveDraft(); };
    const done = host.querySelector("#bld-done"); if (done) done.onclick = finish;
  }

  function finish() {
    const problems = [];
    if (totalPicked() < 31) problems.push("Pick a winner in every match first.");
    if (!String(entrant).trim()) problems.push("Add your name.");
    if (problems.length) { alert(problems.join("\n")); return; }
    const picks = buildPicks(topology, sel, entrant, tiebreaker);
    clearDraft(); close();
    onDone(picks);
  }
  function close() { host.hidden = true; host.querySelector(".bld-inner").innerHTML = ""; }

  render();
}
