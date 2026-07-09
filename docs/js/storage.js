// storage.js — save/load/export/import the parsed bracket, entirely on this device.
// Nothing is ever uploaded. Namespaces the "what-if" score overrides per bracket so
// two different uploads on the same device don't leak edits into each other.
const KEY = "wcb.fan.picks.v1";
const KEY_HASH = "wcb.fan.hash";
const KEY_SCORES = "wcb.scores.v3";   // the interaction layer's manual overrides

function safeGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
let _storageWarned = false;
function safeSet(k, v) {
  try { localStorage.setItem(k, v); }
  catch (e) {   // Safari private mode / quota: tell the app once so it can notify the user
    if (!_storageWarned) { _storageWarned = true; try { window.dispatchEvent(new CustomEvent("wcb:storage-blocked")); } catch (_) {} }
  }
}
function safeDel(k) { try { localStorage.removeItem(k); } catch (e) {} }

export function savePicks(picks) { safeSet(KEY, JSON.stringify(picks)); }
export function loadPicks() {
  const s = safeGet(KEY);
  if (!s) return null;
  try { return JSON.parse(s); } catch (e) { return null; }
}
export function clearPicks() { safeDel(KEY); safeDel(KEY_HASH); safeDel(KEY_SCORES); }

// Small stable hash of the identifying parts of a bracket.
export function hashPicks(picks) {
  const s = JSON.stringify([picks.entrant, picks.r32, picks.r16_win, picks.qf_win, picks.sf_win, picks.champ]);
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = (((h << 5) + h) ^ s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

// Preview renders (demo / shared link) must not destroy the owner's what-if edits:
// stash the real state before the preview, restore it when the owner's bracket
// returns. stash is only written when absent, so back-to-back previews (demo then a
// shared link) can't overwrite the real state with a preview's.
const KEY_STASH = "wcb.scores.stash";
export function stashWhatIfs() {
  if (safeGet(KEY_STASH) != null) return;
  const h = safeGet(KEY_HASH), s = safeGet(KEY_SCORES);
  if (h != null || s != null) safeSet(KEY_STASH, JSON.stringify({ h, s }));
}
export function restoreWhatIfs() {
  const raw = safeGet(KEY_STASH);
  if (!raw) return;
  try {
    const { h, s } = JSON.parse(raw);
    if (h != null) safeSet(KEY_HASH, h); else safeDel(KEY_HASH);
    if (s != null) safeSet(KEY_SCORES, s); else safeDel(KEY_SCORES);
  } catch (e) {}
  safeDel(KEY_STASH);
}

// Clear per-pick what-if overrides when a DIFFERENT bracket is loaded (their IDs like
// "r32-M74" are entrant-relative and would otherwise haunt the next upload).
export function resetWhatIfsIfChanged(picks) {
  const h = hashPicks(picks);
  if (safeGet(KEY_HASH) !== h) { safeDel(KEY_SCORES); safeSet(KEY_HASH, h); }
}

export function exportPicks(picks) {
  const blob = new Blob([JSON.stringify(picks, null, 1)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = String(picks.entrant || "bracket").replace(/[^\w.-]+/g, "_") + "-bracket.json";
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
