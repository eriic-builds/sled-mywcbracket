# sled-mywcbracket

Pilot fork of `my-wc26-bracket` testing the **zero-backend social layer**: share a
bracket as a URL, add received links to a local leaderboard, compare picks. Production
(my-wc26-bracket) stays untouched; this repo is where we move fast.

## Commands

```bash
cd docs && python3 -m http.server 8000    # dev server (no build step, ever)
npm test                                   # all tests; hermetic, repo-local data only
node tests/golden.mjs --update             # accept an INTENTIONAL render change
python3 scripts/fetch_results.py --dry-run # preview a results sync
```

## Architecture (read before changing anything)

- `docs/` is the deployed site (GitHub Pages). Vanilla ES modules, **no dependencies,
  no build step** — keep it that way.
- `docs/js/render.js` — pure render engine: `(picks, live, topology) → HTML string`.
  Its output is **byte-locked** by `tests/fixtures/golden-sections.json` (rendered
  against the frozen `tests/fixtures/results.frozen.json`, NOT live results.json).
  New UI goes in `main.js` / `index.html` / new modules — not in render.js — unless
  the change is intentional, in which case update the fixture and say so.
- `docs/js/builder.js` — pure core (`deriveStructure`, `teamsFor`, `repair`,
  `buildPicks`) + the click-to-pick overlay. Reuse the pure core; don't duplicate it.
- `docs/js/storage.js` — localStorage keys. `wcb.fan.picks.v1` = the user's own
  bracket; what-if overrides are namespaced per-bracket via `hashPicks`.
- `docs/data/results.json` — rewritten by the sync bot up to 3×/day. Never make a
  test or fixture depend on its live contents.
- `scripts/fetch_results.py` — results sync (FIFA feed + fallback), runs via
  `.github/workflows/sync-results.yml`.
- `scripts/validate_results.py` — schema + sanity gate for `results.json` (stdlib only).
  The sync workflow runs it between fetch and commit, and `tests.yml` runs it on push, so
  a malformed feed never ships. Run it locally after a manual data edit:
  `python3 scripts/validate_results.py`.

## Social-layer rules (the point of this pilot)

- **SPEC.md is the source of truth** for share/compare behavior. Update it when
  behavior changes; consult it before re-deriving intent from code.
- Privacy invariants (non-negotiable): no network writes in social code; a bracket
  leaves the browser only inside a link its owner created; rivals stored locally
  only (`wcb.rivals.v1`); no feature re-shares someone else's bracket.
- Viewing a shared/demo bracket must never mutate the visitor's saved bracket or
  what-if overrides.

Also read TECHNICAL_TASTE_COUNCIL.md for build philosophy and decision-making judgment before making non-trivial changes.
