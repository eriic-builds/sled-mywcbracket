import assert from "node:assert/strict";
import {
  buildFactModel,
  buildPortraitUrl,
  formatAttendance,
  portraitAvailability,
  portraitFrameSpec,
  shouldScheduleMatchHintReminder,
} from "../docs/js/match-details.js";

const m97 = {
  source: { provider: "FIFA", matchId: "400021536" },
  state: "complete",
  home: "France",
  away: "Morocco",
  score: { home: 2, away: 0, note: "" },
  round: "Quarterfinal",
  venue: { stadium: "Boston Stadium", city: "Boston" },
  attendance: 63811,
  referee: "Facundo Tello",
  goals: [
    { team: "France", player: "Mbappe", minute: "60'", kind: "goal" },
    { team: "France", player: "Dembele", minute: "66'", kind: "goal" },
  ],
  cards: [
    { team: "Morocco", player: "Diop", minute: "63'", card: "yellow" },
  ],
};

assert.equal(formatAttendance(63811), "63,811");
assert.equal(formatAttendance(null), "");
assert.equal(shouldScheduleMatchHintReminder(4999, false), true);
assert.equal(shouldScheduleMatchHintReminder(5000, false), false);
assert.equal(shouldScheduleMatchHintReminder(1000, true), false);

const compact = buildFactModel(m97);
assert.equal(compact.title, "France 2–0 Morocco");
assert.deepEqual(compact.meta, ["Quarterfinal"]);
assert.deepEqual(compact.sections, [
  { label: "Goals", items: ["Mbappe 60' · France", "Dembele 66' · France"] },
  { label: "Cards", items: ["Diop 63' (yellow) · Morocco"] },
  { label: "Venue", items: ["Boston Stadium · Boston"] },
  { label: "Attendance", items: ["63,811"] },
  { label: "Referee", items: ["Facundo Tello"] },
  { label: "Source", items: ["FIFA"] },
]);

const partial = buildFactModel({
  source: { provider: "FIFA", matchId: "400021000" },
  state: "partial",
  home: "Alpha",
  away: "Beta",
  score: { home: 1, away: 1, note: "4–3 pens" },
  round: "Round of 32",
});
assert.equal(partial.state, "Limited match facts");
assert.deepEqual(partial.meta, ["Round of 32", "4–3 pens"]);
assert.deepEqual(partial.sections, [{ label: "Source", items: ["FIFA"] }]);

const fallback = buildFactModel({
  source: { provider: "football-data.org", matchId: "987654" },
  state: "partial",
  home: "Spain",
  away: "Belgium",
  score: { home: 1, away: 1, note: "5\u20134 pens" },
  round: "Quarterfinal",
});
assert.deepEqual(
  fallback.sections,
  [{ label: "Source", items: ["football-data.org"] }],
);

const long = {
  ...m97,
  goals: Array.from({ length: 6 }, (_, index) => ({
    team: "France",
    player: `Player ${index + 1}`,
    minute: `${index + 1}'`,
    kind: "goal",
  })),
};
const compactLong = buildFactModel(long);
assert.deepEqual(compactLong.sections[0].items, [
  "Player 1 1' · France",
  "Player 2 2' · France",
  "Player 3 3' · France",
  "+3 more — open details",
]);
const fullLong = buildFactModel(long, { compact: false });
assert.equal(fullLong.sections[0].items.length, 6);

const hostile = "<img src=x onerror=alert(1)>";
const hostileModel = buildFactModel({
  ...m97,
  home: hostile,
  goals: [{ team: hostile, player: hostile, minute: "1'", kind: "goal" }],
});
assert.equal(hostileModel.title, `${hostile} 2–0 Morocco`);
assert.equal(hostileModel.sections[0].items[0], `${hostile} 1' · ${hostile}`);
assert.equal(buildFactModel(null), null);

const portraitDocument = {
  version: 1,
  permission: "approved-for-production",
  host: "https://wc26.bogachev.fr",
  matches: {
    M97: {
      slug: "fra-mor",
      externalId: "1998582",
      date: "2026-07-09",
      stage: "Quarter-final",
      teams: ["France", "Morocco"],
      score: [2, 0],
    },
  },
};
const portraitRecord = {
  ...m97,
  kickoff: "2026-07-09T20:00:00Z",
};
const available = portraitAvailability("M97", portraitRecord, portraitDocument);
assert.equal(available.status, "available");
assert.equal(available.url, "https://wc26.bogachev.fr/m/fra-mor/");
assert.deepEqual(portraitFrameSpec(available), {
  src: "https://wc26.bogachev.fr/m/fra-mor/",
  title: "France vs Morocco data portrait by Alexander Bogachev",
  referrerPolicy: "no-referrer",
  sandbox: "allow-scripts allow-same-origin",
});

const pendingPermission = structuredClone(portraitDocument);
pendingPermission.permission = "pending-author-approval";
assert.deepEqual(
  portraitAvailability("M97", portraitRecord, pendingPermission),
  { status: "permission", reason: "portrait author approval is pending" },
);
assert.equal(buildPortraitUrl("swi-col"), "https://wc26.bogachev.fr/m/swi-col/");
assert.throws(() => buildPortraitUrl("sui-col/path"), /Invalid portrait slug/);
assert.throws(() => buildPortraitUrl("https://example.com"), /Invalid portrait slug/);

const wrongScore = structuredClone(portraitDocument);
wrongScore.matches.M97.score = [3, 0];
assert.equal(
  portraitAvailability("M97", portraitRecord, wrongScore).status,
  "mismatch",
);
const wrongHost = structuredClone(portraitDocument);
wrongHost.host = "https://example.com";
assert.equal(
  portraitAvailability("M97", portraitRecord, wrongHost).status,
  "missing",
);
assert.equal(
  portraitAvailability("M98", portraitRecord, portraitDocument).status,
  "missing",
);

const swissRecord = {
  state: "complete",
  home: "Switzerland",
  away: "Colombia",
  score: { home: 0, away: 0, note: "4–3 pens" },
  round: "Round of 16",
  kickoff: "2026-07-07T20:00:00Z",
};
const swissDocument = {
  ...portraitDocument,
  matches: {
    M96: {
      slug: "swi-col",
      externalId: "1998572",
      date: "2026-07-07",
      stage: "Round of 16",
      teams: ["Switzerland", "Colombia"],
      score: [0, 0],
    },
  },
};
assert.equal(
  portraitAvailability("M96", swissRecord, swissDocument).url,
  "https://wc26.bogachev.fr/m/swi-col/",
);

console.log("match-details formatters passed");
