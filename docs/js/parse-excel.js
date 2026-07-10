// parse-excel.js — read a "My Bracket" workbook 100% in the browser (SheetJS).
// The file is read locally via FileReader; nothing is uploaded anywhere.
// Layout is the verified SLED 2026 bracket (see the fork's README / build spec).

export class ValidationError extends Error {
  constructor(problems) { super(problems.join(" ")); this.name = "ValidationError"; this.problems = problems; }
}

const NAME_RE = /^(.*?)\s{2,}\((.+)\)\s*$/;   // "Germany  (1E)"
function parseTeam(raw) {
  if (raw == null) return { name: "", seed: "" };
  const s = String(raw).trim();
  const m = s.match(NAME_RE);
  if (m) return { name: m[1].trim(), seed: m[2].trim() };
  const i = s.lastIndexOf("(");           // fallback: split on last "("
  if (i > 0) return { name: s.slice(0, i).trim(), seed: s.slice(i + 1).replace(/\)\s*$/, "").trim() };
  return { name: s, seed: "" };
}
function cell(ws, addr) {
  const c = ws[addr];
  if (c == null) return null;
  return c.w != null ? c.w : c.v;   // prefer the formatted text
}
const txt = (ws, addr) => { const v = cell(ws, addr); return v == null ? "" : String(v).trim(); };

export function parseWorkbook(arrayBuffer) {
  if (typeof XLSX === "undefined") throw new ValidationError(["The spreadsheet reader (SheetJS) failed to load."]);
  const wb = XLSX.read(arrayBuffer, { type: "array" });
  const ws = wb.Sheets["My Bracket"];
  if (!ws) throw new ValidationError(['Sheet "My Bracket" not found — is this the SLED World Cup 2026 bracket workbook?']);

  const problems = [];
  const r32 = [], seed = {};
  let freebie_match = "M73";
  // 16 match blocks of 4 rows; first block at row 4 (rows 4, 8, …, 64).
  for (let k = 0; k < 16; k++) {
    const r = 4 + k * 4;
    const araw = cell(ws, "A" + r);
    const aTxt = araw == null ? "" : String(araw);
    if (/FREEBIE|\u2605/i.test(aTxt)) { const m = aTxt.match(/M\d+/); if (m) freebie_match = m[0]; }
    // code = the leading M-number; date = the remainder (on a newline or a "·"),
    // minus any FREEBIE/star marker. Works whether the cell is one line or multiline.
    const cleaned = aTxt.replace(/\u2605|FREEBIE/gi, " ");
    const cm = cleaned.match(/M\d+/);
    const code = cm ? cm[0] : cleaned.trim();
    let rest = cm ? cleaned.slice(cleaned.indexOf(cm[0]) + cm[0].length) : "";
    rest = rest.replace(/^[\s\u00b7\u2013\u2014\-]+/, "");
    const date = rest.split(/\r?\n/)[0].trim();
    const A = parseTeam(cell(ws, "B" + r));
    const B = parseTeam(cell(ws, "B" + (r + 2)));
    const pick = txt(ws, "C" + r);
    if (!/^M\d+$/.test(code)) problems.push(`Block ${k + 1} (row ${r}): match code "${code}" isn't like M74.`);
    if (!A.name || !B.name) problems.push(`Block ${k + 1} (row ${r}): a team name is missing.`);
    if (pick && A.name && B.name && pick !== A.name && pick !== B.name)
      problems.push(`Block ${k + 1} (${code}): your pick "${pick}" isn't one of ${A.name} / ${B.name}.`);
    if (A.name) seed[A.name] = A.seed;
    if (B.name) seed[B.name] = B.seed;
    r32.push([code, date, A.name, B.name, pick]);
  }

  const colAt = (letter, rows) => rows.map(rr => txt(ws, letter + rr));
  const r16_win = colAt("D", [4, 12, 20, 28, 36, 44, 52, 60]);
  const qf_win = colAt("E", [4, 20, 36, 52]);
  const sf_win = colAt("F", [4, 36]);
  const champ = txt(ws, "G4");
  const runner = sf_win.find(t => t && t !== champ) || "";
  const entrant = txt(ws, "C69");
  let tiebreaker = cell(ws, "C70");
  tiebreaker = (tiebreaker == null || tiebreaker === "") ? 0 : parseInt(String(tiebreaker).replace(/[^\d-]/g, ""), 10);
  if (isNaN(tiebreaker)) tiebreaker = 0;

  // counts
  if (!entrant) problems.push("Entrant name (cell C69) is empty.");
  if (r16_win.filter(Boolean).length !== 8) problems.push(`Expected 8 Round-of-16 winners (column D); found ${r16_win.filter(Boolean).length}.`);
  if (qf_win.filter(Boolean).length !== 4) problems.push(`Expected 4 Quarterfinal winners (column E); found ${qf_win.filter(Boolean).length}.`);
  if (sf_win.filter(Boolean).length !== 2) problems.push(`Expected 2 finalists (column F); found ${sf_win.filter(Boolean).length}.`);
  if (!champ) problems.push("Champion (cell G4) is empty.");
  // tree consistency (bracket order pairs consecutive sheet blocks)
  const r32picks = r32.map(m => m[4]);
  for (let j = 0; j < 8; j++) { const o = [r32picks[2 * j], r32picks[2 * j + 1]]; if (r16_win[j] && !o.includes(r16_win[j])) problems.push(`R16 winner "${r16_win[j]}" isn't one of your R32 picks ${o.join(" / ")}.`); }
  for (let j = 0; j < 4; j++) { const o = [r16_win[2 * j], r16_win[2 * j + 1]]; if (qf_win[j] && !o.includes(qf_win[j])) problems.push(`QF winner "${qf_win[j]}" isn't one of ${o.join(" / ")}.`); }
  for (let j = 0; j < 2; j++) { const o = [qf_win[2 * j], qf_win[2 * j + 1]]; if (sf_win[j] && !o.includes(sf_win[j])) problems.push(`SF winner "${sf_win[j]}" isn't one of ${o.join(" / ")}.`); }
  if (champ && !sf_win.includes(champ)) problems.push(`Champion "${champ}" isn't one of your finalists ${sf_win.join(" / ")}.`);

  if (problems.length) throw new ValidationError(problems);
  return { entrant, tiebreaker, freebie_match, r32, r16_win, qf_win, sf_win, champ, runner, seed };
}

// Validate the uploaded fixtures against the tournament topology (same competition?).
export function validateAgainstTopology(picks, topology) {
  const problems = [];
  if (!picks || typeof picks !== "object")
    throw new ValidationError(["The bracket JSON must be an object."]);
  const rounds = [
    ["r32", 16, "Round-of-32 matches"],
    ["r16_win", 8, "Round-of-16 winners"],
    ["qf_win", 4, "Quarterfinal winners"],
    ["sf_win", 2, "Finalists"],
  ];
  for (const [key, count, label] of rounds) {
    if (!Array.isArray(picks[key])) problems.push(`${label} are missing.`);
    else if (picks[key].length !== count) problems.push(`${label}: expected ${count}, found ${picks[key].length}.`);
  }
  if (Array.isArray(picks.r32)) {
    picks.r32.forEach((match, i) => {
      if (!Array.isArray(match) || match.length < 5)
        problems.push(`Round-of-32 match ${i + 1} is incomplete.`);
    });
  }
  if (problems.length) throw new ValidationError(problems);

  const topByCode = {};
  for (const [code, date, a, b] of topology.r32) topByCode[code] = [a, b];
  const teamSet = new Set();
  for (const c in topByCode) { teamSet.add(topByCode[c][0]); teamSet.add(topByCode[c][1]); }
  for (let i = 0; i < picks.r32.length; i++) {
    const [code, date, a, b, pick] = picks.r32[i];
    const expectedCode = topology.r32[i] && topology.r32[i][0];
    if (code !== expectedCode) problems.push(`Round-of-32 slot ${i + 1}: expected ${expectedCode}, found ${code || "no match code"}.`);
    const t = topByCode[code];
    if (!t) { problems.push(`Match ${code} isn't in the 2026 bracket — is this a different competition's sheet?`); continue; }
    const got = new Set([a, b]);
    if (!(got.has(t[0]) && got.has(t[1])))
      problems.push(`Match ${code}: teams ${a}/${b} don't match the official ${t[0]}/${t[1]}.`);
    if (!pick) problems.push(`Match ${code}: your winner is missing.`);
    else if (!t.includes(pick)) problems.push(`Match ${code}: winner "${pick}" isn't one of ${t.join(" / ")}.`);
  }
  if (picks.r16_win.filter(Boolean).length !== 8) problems.push("Expected 8 Round-of-16 winners.");
  if (picks.qf_win.filter(Boolean).length !== 4) problems.push("Expected 4 Quarterfinal winners.");
  if (picks.sf_win.filter(Boolean).length !== 2) problems.push("Expected 2 finalists.");
  if (!picks.champ) problems.push("Champion is missing.");
  const r32picks = picks.r32.map(m => m[4]);
  for (let j = 0; j < 8; j++) {
    const options = [r32picks[2 * j], r32picks[2 * j + 1]];
    if (picks.r16_win[j] && !options.includes(picks.r16_win[j]))
      problems.push(`R16 winner "${picks.r16_win[j]}" isn't one of ${options.join(" / ")}.`);
  }
  for (let j = 0; j < 4; j++) {
    const options = [picks.r16_win[2 * j], picks.r16_win[2 * j + 1]];
    if (picks.qf_win[j] && !options.includes(picks.qf_win[j]))
      problems.push(`QF winner "${picks.qf_win[j]}" isn't one of ${options.join(" / ")}.`);
  }
  for (let j = 0; j < 2; j++) {
    const options = [picks.qf_win[2 * j], picks.qf_win[2 * j + 1]];
    if (picks.sf_win[j] && !options.includes(picks.sf_win[j]))
      problems.push(`SF winner "${picks.sf_win[j]}" isn't one of ${options.join(" / ")}.`);
  }
  if (picks.champ && !picks.sf_win.includes(picks.champ))
    problems.push(`Champion "${picks.champ}" isn't one of your finalists ${picks.sf_win.join(" / ")}.`);
  const allPicks = [...picks.r32.map(m => m[4]), ...picks.r16_win, ...picks.qf_win, ...picks.sf_win, picks.champ].filter(Boolean);
  for (const p of allPicks) if (!teamSet.has(p)) problems.push(`Pick "${p}" isn't a team in the 2026 bracket.`);
  if (problems.length) throw new ValidationError(problems);
  return picks;
}
