import assert from "node:assert/strict";
import fs from "node:fs";

import {
  POOL_BACKUP_FORMAT,
  POOL_BACKUP_VERSION,
  PoolBackupError,
  createPoolBackup,
  isPoolBackup,
  savePicks,
  validatePoolBackup,
} from "../docs/js/storage.js";
import { RIVALS_CAP, mergeRivals, saveRivals } from "../docs/js/compare.js";
import { validateAgainstTopology } from "../docs/js/parse-excel.js";

const data = (name) => JSON.parse(fs.readFileSync(new URL("../docs/data/" + name, import.meta.url)));
const clone = (value) => JSON.parse(JSON.stringify(value));
const topology = data("topology.json");
const demo = data("demo-picks.json");
const named = (name) => ({ ...clone(demo), entrant: name });
const validate = (picks) => validateAgainstTopology(picks, topology);

const owner = named("Owner");
const jeff = named("Jeff");
const sam = named("Sam");
const localJeff = { picks: jeff, alias: "Local Jeff", added: "2026-07-01T00:00:00.000Z" };
const backupSam = { picks: sam, alias: "Backup Sam", added: "2026-07-02T00:00:00.000Z" };

const backup = createPoolBackup(owner, [localJeff, backupSam]);
assert.deepEqual(Object.keys(backup), ["format", "version", "bracket", "leaderboard"]);
assert.equal(backup.format, POOL_BACKUP_FORMAT);
assert.equal(backup.version, POOL_BACKUP_VERSION);
assert.deepEqual(backup.bracket, owner);
assert.deepEqual(backup.leaderboard, [localJeff, backupSam]);
assert.equal(isPoolBackup(backup), true);
assert.equal(isPoolBackup(owner), false, "legacy bracket JSON must remain distinguishable");
assert.deepEqual(validate(owner), owner, "legacy bracket JSON remains valid");

const longAlias = "  " + "A".repeat(45) + "  ";
const normalized = validatePoolBackup(
  createPoolBackup(owner, [{ picks: jeff, alias: longAlias, added: localJeff.added }]),
  validate,
);
assert.equal(normalized.leaderboard[0].alias, "A".repeat(40));
assert.equal(normalized.leaderboard[0].added, localJeff.added);

assert.throws(
  () => validatePoolBackup({ ...backup, version: 99 }, validate),
  (error) => error instanceof PoolBackupError && /supports version 1/.test(error.message),
);
assert.throws(
  () => validatePoolBackup({ ...backup, leaderboard: {} }, validate),
  (error) => error instanceof PoolBackupError && /invalid leaderboard/.test(error.message),
);
assert.throws(
  () => validatePoolBackup(createPoolBackup(owner, [{ picks: { ...jeff, champ: "Atlantis" } }]), validate),
  (error) => error instanceof PoolBackupError && /Leaderboard entry 1/.test(error.message),
);
assert.throws(
  () => validatePoolBackup(createPoolBackup({ ...owner, r32: owner.r32.slice(0, 1) }, []), validate),
  (error) => error instanceof PoolBackupError && /Your bracket: Round-of-32 matches: expected 16/.test(error.message),
);
assert.throws(
  () => validatePoolBackup(createPoolBackup(owner, [{ picks: jeff, alias: 42 }]), validate),
  (error) => error instanceof PoolBackupError && /invalid local alias/.test(error.message),
);

const merged = mergeRivals(
  [localJeff],
  [
    { picks: clone(jeff), alias: "Backup Jeff" },
    backupSam,
    { ...backupSam, picks: clone(sam) },
    { picks: owner },
  ],
  owner,
);
assert.equal(merged.added, 1);
assert.equal(merged.duplicates, 2);
assert.equal(merged.own, 1);
assert.equal(merged.overCap, 0);
assert.equal(merged.rivals.length, 2);
assert.equal(merged.rivals[0], localJeff, "existing duplicate wins with its local metadata");
assert.equal(merged.rivals[1], backupSam, "new backup entry keeps its metadata and order");

const full = Array.from({ length: RIVALS_CAP }, (_, i) => ({ picks: named(`Existing ${i}`) }));
const capped = mergeRivals(full, [{ picks: named("New 1") }, { picks: named("New 2") }], owner);
assert.equal(capped.rivals.length, RIVALS_CAP);
assert.equal(capped.added, 0);
assert.equal(capped.overCap, 2);

const previousStorage = globalThis.localStorage;
globalThis.localStorage = {
  getItem() { return null; },
  setItem() { throw new Error("blocked"); },
  removeItem() {},
};
assert.equal(saveRivals([]), false);
assert.equal(savePicks(owner), false);
if (previousStorage === undefined) delete globalThis.localStorage;
else globalThis.localStorage = previousStorage;

const mainJs = fs.readFileSync(new URL("../docs/js/main.js", import.meta.url), "utf8");
const storageJs = fs.readFileSync(new URL("../docs/js/storage.js", import.meta.url), "utf8");
const compareJs = fs.readFileSync(new URL("../docs/js/compare.js", import.meta.url), "utf8");
const saveLeaderboardAt = mainJs.indexOf("if (!saveRivals(merged.rivals))");
const saveBracketAt = mainJs.indexOf("if (!savePicks(bracket))");
assert.ok(saveLeaderboardAt >= 0 && saveLeaderboardAt < saveBracketAt, "leaderboard must save before the owner bracket");
assert.match(mainJs, /const rolledBack = saveRivals\(previousRivals\)/);
assert.match(mainJs, /const p = SHOWN; if \(!p\) return;/);
assert.doesNotMatch(storageJs, /\bfetch\s*\(/);
assert.doesNotMatch(compareJs, /\bfetch\s*\(/);

console.log("POOL BACKUP OK");
