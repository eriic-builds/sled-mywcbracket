# PLAN: CI safety net — hermetic tests + gated data pipeline

**Rank: 1 of 5 — do this first.**
Every other plan touches `render.js`, `main.js`, or the sync pipeline. Right now nothing
runs the tests automatically, and the one shared artifact every visitor depends on
(`docs/data/results.json`) is committed by a bot with zero validation. The tournament is
live (QFs start Jul 9); this plan is the seatbelt for everything else.

## Goal

1. Make all four tests runnable with **no files outside this repo** (today `golden.mjs`
   needs `/tmp/py_sections.json` and `parse.mjs` needs another repo's `.xlsx`).
2. Run them in GitHub Actions on every push/PR.
3. Validate `results.json` against the topology **before** the sync bot commits it, so a
   bad feed can never publish a corrupt scoreboard.

## Files to touch

| File | Change |
| --- | --- |
| `tests/golden.mjs` | Read fixture from `tests/fixtures/` instead of `/tmp`; add `--update` mode |
| `tests/fixtures/golden-sections.json` | NEW — committed snapshot of the render output |
| `tests/fixtures/results.frozen.json` | NEW — frozen copy of `results.json` used by the snapshot |
| `tests/parse.mjs` | Skip (exit 0) with a clear message when the private workbook is absent |
| `scripts/validate_results.py` | NEW — stdlib-only schema/consistency validator |
| `.github/workflows/tests.yml` | NEW — run tests + validator on push/PR |
| `.github/workflows/sync-results.yml` | Add a "Validate" step between fetch and commit |
| `package.json` | Add `"scripts": {"test": "..."}` |

Do **not** touch `docs/js/render.js` in this plan.

## Step-by-step

### Step 1 — freeze the golden test's inputs

The current golden test compares JS output against a Python dump. Python parity was
proven once; the ongoing need is *regression* protection for the JS engine. Convert it to
a self-contained snapshot test.

**Critical trap:** the golden test renders using `docs/data/results.json`, which a bot
rewrites up to 3×/day. If the snapshot reads the live file, it breaks on every sync.
The snapshot must use a **frozen copy** of results.json committed under `tests/fixtures/`.

1. `cp docs/data/results.json tests/fixtures/results.frozen.json` (one time; never
   auto-updated by the sync).
2. Rewrite `tests/golden.mjs`:
   - Load `picks` from `docs/data/demo-picks.json`, `topo` from `docs/data/topology.json`,
     but `live` from `tests/fixtures/results.frozen.json`.
   - Build the same `js` object of sections it builds today (keep that code).
   - If `process.argv.includes("--update")`: write
     `tests/fixtures/golden-sections.json` = `JSON.stringify(js, null, 1)` and exit 0
     printing `updated fixture`.
   - Otherwise: read the fixture and diff each key exactly as the current code does
     (keep the first-divergence printout — it is genuinely useful).
3. Run `node tests/golden.mjs --update` once, commit the fixture, then run
   `node tests/golden.mjs` and confirm `GOLDEN OK`.
4. Update the README's golden-test paragraph (it currently tells you to dump
   `/tmp/py_sections.json` from the Python repo).

### Step 2 — make parse.mjs skippable

`tests/parse.mjs` line 17 hardcodes `/Users/ericlam/Projects/wc26-bracket/input/bracket-picks.xlsx`
(the real workbook contains a colleague's name — it should NOT be committed).

- Read the path from `process.env.WCB_WORKBOOK` with the current absolute path as the
  default.
- Before parsing: `if (!fs.existsSync(XLSX_PATH)) { console.log("SKIP parse.mjs: private workbook not present (set WCB_WORKBOOK to run)"); process.exit(0); }`
- Exit **0**, not 1 — CI must stay green without the workbook.

### Step 3 — package.json test script

```json
{
  "type": "module",
  "scripts": {
    "test": "node tests/scoring.mjs && node tests/builder.mjs && node tests/golden.mjs && node tests/parse.mjs"
  }
}
```

Order matters: put the always-run tests first so a SKIP at the end is obvious in logs.

### Step 4 — scripts/validate_results.py

Stdlib only (`json`, `sys`, `os`). Loads `docs/data/topology.json` and
`docs/data/results.json` (or a path passed as `sys.argv[1]`). Checks, collecting ALL
violations before exiting:

1. Top-level keys: `refreshed` (non-empty str), `res` (dict), `ko_fix` (dict),
   `auto_hl` (list). Extra keys are allowed (forward-compat — plan 2 adds one).
2. Known codes = the 16 R32 codes from `topology.r32` ∪ keys of `topology.ko_feed`.
   Every key of `res` and `ko_fix` must be a known code. **This catches M103** (the
   third-place playoff): it is deliberately absent from `ko_feed`, and the render engine
   would misbehave on it; the feed does carry it, so an unknown-code guard is load-bearing,
   not theoretical.
3. Each `res[code]` is `[int>=0, int>=0, str winner, str note]` (JSON list, len 4).
4. For each R32 code in `res`: winner must be one of that fixture's two teams from
   `topology.r32`.
5. For each KO code in `res`: let `fa, fb = ko_feed[code]`. Both feeders must
   themselves be in `res` (a KO result without decided feeders is corrupt), and winner
   must be `res[fa][2]` or `res[fb][2]`.
6. Each `ko_fix[code]`: code NOT in `res`, value is a list of 4 non-empty strings.
7. Each `auto_hl` entry: list of exactly 5 strings.
8. Exit 1 with one line per violation; exit 0 printing `results.json OK (<n> results)`.

### Step 5 — wire the validator into the sync workflow

In `.github/workflows/sync-results.yml`, between the "Fetch results" step and the
"Commit and push" step, add:

```yaml
      - name: Validate results.json before publishing
        run: python scripts/validate_results.py
```

If it fails, the job fails **before committing**, and the existing
"Open an issue if the sync failed" step (`if: failure()`) fires automatically — you get
paged, visitors keep the last good data. No other change needed in that file.

### Step 6 — .github/workflows/tests.yml

```yaml
name: Tests
on:
  push:
    branches: [main]
  pull_request:
  workflow_dispatch: {}
permissions:
  contents: read
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v4
        with:
          node-version: "22"
      - run: npm test
      - uses: actions/setup-python@v6
        with:
          python-version: "3.12"
      - run: python scripts/validate_results.py
```

No `npm install` — there are no dependencies; do not add a lockfile step.

## Edge cases a weaker model would miss

- **The snapshot must not read live `results.json`** (rewritten 3×/day by the bot) —
  freeze inputs in `tests/fixtures/results.frozen.json` or CI turns red on every sync.
- **`scoring.mjs` intentionally keeps using live results.json.** Its reference scorer is
  computed from the same live data, so it is churn-proof, and running it against fresh
  data is a feature (it re-verifies every new synced result). Don't "fix" it.
- **`scoring.mjs` is randomized** (3000 random brackets, `Math.random`). That's fine —
  the invariants it checks must hold for *every* bracket. Do not seed it; a flake here
  means a real bug.
- **parse.mjs must SKIP with exit 0, not fail**, when the workbook is missing — the
  workbook is private and will never exist in CI.
- **`--update` discipline:** regenerating `golden-sections.json` is how you *accept* a
  render change. Any PR that touches `render.js` should show a fixture diff; a fixture
  diff with no render.js change is a red flag.
- **Validator must allow unknown top-level keys** in results.json — plan 2
  (match-day-freshness) adds `refreshed_iso`. Strict top-level key rejection would make
  the two plans conflict.
- **KO winner check needs both feeders decided** (rule 5). The sync's `match_all` only
  resolves a KO match when both feeder winners are known, so a violation here means real
  corruption, not an in-progress state.

## Acceptance criteria

1. Fresh clone + `npm test` passes with only Node ≥ 20 installed; output contains
   `SCORING OK`, `BUILDER OK`, `GOLDEN OK`, and `SKIP parse.mjs`.
2. `rm /tmp/py_sections.json` (if present) — `npm test` still passes.
3. `python scripts/validate_results.py` prints `results.json OK (23 results)` (count
   matches current data).
4. Corrupt a copy: change `res.M74[2]` to `"Narnia"` → validator exits 1 naming M74.
   Add key `"M103": [1,0,"France",""]` → validator exits 1 naming M103.
5. Push to a branch → the `Tests` workflow runs and is green.
6. `sync-results.yml` diff shows exactly one new step, placed before "Commit and push".
7. Edit `render.js` (add a space to a template) → `node tests/golden.mjs` FAILS showing
   the divergence; revert → passes.
