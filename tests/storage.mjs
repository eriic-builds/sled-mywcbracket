import assert from "node:assert/strict";

const values = new Map();
globalThis.localStorage = {
  getItem(key) {
    return values.has(key) ? values.get(key) : null;
  },
  setItem(key, value) {
    values.set(key, String(value));
  },
  removeItem(key) {
    values.delete(key);
  },
};

const { stashWhatIfs, restoreWhatIfs } = await import("../docs/js/storage.js");

values.set("wcb.fan.hash", "owner-hash");
values.set("wcb.scores.v3", '{"r32-M73":"won"}');
stashWhatIfs();
assert.deepEqual(
  JSON.parse(values.get("wcb.scores.stash")),
  { h: "owner-hash", s: '{"r32-M73":"won"}' },
);

values.set("wcb.fan.hash", "preview-hash");
values.set("wcb.scores.v3", '{"r32-M73":"lost"}');
stashWhatIfs();
assert.deepEqual(
  JSON.parse(values.get("wcb.scores.stash")),
  { h: "owner-hash", s: '{"r32-M73":"won"}' },
  "a second preview must not overwrite the owner's stash",
);

restoreWhatIfs();
assert.equal(values.get("wcb.fan.hash"), "owner-hash");
assert.equal(values.get("wcb.scores.v3"), '{"r32-M73":"won"}');
assert.equal(values.has("wcb.scores.stash"), false);

values.delete("wcb.fan.hash");
values.delete("wcb.scores.v3");
stashWhatIfs();
assert.equal(values.has("wcb.scores.stash"), false);

console.log("storage preview isolation passed");
