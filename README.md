# My World Cup Bracket

[![Sync World Cup results](https://github.com/eriic-builds/sled-mywcbracket/actions/workflows/sync-results.yml/badge.svg)](https://github.com/eriic-builds/sled-mywcbracket/actions/workflows/sync-results.yml)
[![Deploy GitHub Pages](https://github.com/eriic-builds/sled-mywcbracket/actions/workflows/deploy-pages.yml/badge.svg)](https://github.com/eriic-builds/sled-mywcbracket/actions/workflows/deploy-pages.yml)
[![Tests](https://github.com/eriic-builds/sled-mywcbracket/actions/workflows/tests.yml/badge.svg)](https://github.com/eriic-builds/sled-mywcbracket/actions/workflows/tests.yml)

A no-build, zero-backend World Cup bracket dashboard. Build or import your picks, follow live
results, compare brackets through private links, and keep your pool in your own browser.

[Open the live site](https://eriic-builds.github.io/sled-mywcbracket/) ·
[Read the project history](dev-docs/PROJECT-HISTORY.md) ·
[Explore the interactive history](https://eriic-builds.github.io/sled-mywcbracket/dev-reports/project-history/) ·
[Open interactive development reports](https://eriic-builds.github.io/sled-mywcbracket/dev-reports/)

This project started as a client-side port of
[`wc26-bracket`](https://github.com/eriic-builds/wc26-bracket). It grew into the main social
edition while preserving static GitHub Pages hosting, browser-local ownership, vanilla
modules, and no frontend build step.

## What you can do

| Area | Current experience |
| --- | --- |
| Create a bracket | Pick winners round by round or import the SLED `.xlsx` file entirely in the browser. |
| Follow the tournament | See confirmed, settled, attainable, and maximum points against bot-synced live results. |
| Explore the bracket | Switch between Actual path and My picks in mirrored or Sideways layouts. Filter by team, inspect all 31 match cards, and expand the desktop table without map scrollbars. |
| Open match stories | View scorers, cards, venue, attendance, referee, decider notes, and credited data portraits for completed games. |
| Compare with friends | Send one bracket in a `#b=` URL fragment. A recipient chooses whether to add it to a local leaderboard and pick-difference view. |
| Protect your pool | Download a private backup of your bracket and locally saved rivals. Import merges missing rivals without creating a shared server pool. |
| Change the presentation | Use dark, light, Easy with OpenDyslexic, and Fun themes including Sticker Book. |
| Control motion | Interact with the soccer-ball landing hero, disable it with Motion Off, and rely on reduced-motion and static WebGL fallbacks. |

## Architecture promises

- **Static:** GitHub Pages serves the files in `docs/`.
- **No build step:** the browser runs the checked-in HTML, CSS, JSON, and ES modules.
- **Zero backend:** there is no account database, pool registry, API server, or server
  session.
- **Browser-owned state:** brackets, rivals, themes, favorites, and what-if values stay in
  `localStorage`.
- **Consent-based sharing:** a bracket leaves the browser only inside a link the owner
  chooses to send or a private backup the owner downloads.
- **Validated public data:** GitHub Actions writes public match JSON only after result and
  detail validators pass.
- **Bounded optional media:** credited external match portraits load after user intent, not
  during the initial page load.
- **Vendored runtime libraries:** SheetJS and Three.js are checked into `docs/js/vendor/`.
  There is no package install or CDN dependency.

The app is zero-backend, not fully stateless. Browser-local persistence is intentional.

## How the product works

```text
SLED workbook ----> parse-excel.js --\
round picker -----> builder.js -------+--> render.js --> dashboard
topology.json ------------------------+
results.json -------------------------+
match-details.json --> match-details.js

share link <-----> share.js      URL fragment, no network write
leaderboard <----> compare.js    localStorage only
pool backup <----> storage.js    private JSON download and merge

scheduled feeds --> fetch_results.py --> validators --> committed JSON --> GitHub Pages
```

### Browser runtime

| File | Responsibility |
| --- | --- |
| `docs/js/render.js` | Computes scored state and renders dashboard sections. Core output is byte-locked by golden fixtures. |
| `docs/js/bracket-tree.js` | Derives the shared 31-node, 30-edge tournament model for both bracket layouts. |
| `docs/js/parse-excel.js` | Parses and validates the private workbook in the browser. |
| `docs/js/builder.js` | Runs the round-by-round pick builder and shared bracket topology helpers. |
| `docs/js/main.js` | Orchestrates landing, loading, preview modes, social controls, local backup, freshness warnings, and feature lifecycle. |
| `docs/js/interact.js` | Runs themes, navigation, team filtering, map layout, fit-screen behavior, and stat interactions. |
| `docs/js/share.js` | Encodes and decodes one versioned bracket in a URL fragment. |
| `docs/js/compare.js` | Stores local rivals and computes standings and undecided-pick differences. |
| `docs/js/storage.js` | Owns local persistence, preview isolation, and private pool backup import and export. |
| `docs/js/match-details.js` | Shows quick facts, accessible match dialogs, and intent-gated portraits. |
| `docs/js/trophy.js` | Owns the desktop WebGL trophy and responsive static fallback. |
| `docs/js/landing-ballpit.js` | Owns landing-ball physics, pointer and touch input, Motion control, sleep, wake, and WebGL lifecycle. |

### Public data

| File | Purpose |
| --- | --- |
| `docs/data/topology.json` | Fixed bracket structure, seeds, feeder graph, schedule, and host cities. |
| `docs/data/results.json` | Canonical public scores, winners, highlights, and refresh time. |
| `docs/data/match-details.json` | Generated facts and source coverage for completed matches. |
| `docs/data/match-portraits.json` | Reviewed match-to-portrait mappings and credit metadata. |
| `docs/data/demo-picks.json` | Sample picks used by the demo flow and deterministic fixtures. |

## Privacy and ownership

| Data | Location |
| --- | --- |
| Your bracket | Your browser |
| Brackets you add | Your browser |
| What-if scores | Your browser, namespaced per bracket |
| Theme and Motion settings | Your browser |
| One share link | Inside the URL fragment you send |
| Pool backup | A private file downloaded on your action |
| Public tournament results | Static JSON in this repository |
| Match portraits | External credited source, requested after interaction |

The URL fragment never reaches GitHub Pages in an HTTP request. A share link still contains
a copy of the bracket, so it cannot be revoked after another person saves it. Use the
editable share alias when you do not want a real name in the payload.

The social behavior and deliberate omissions live in
[`dev-docs/zero-backend-social-loop/BRIEF.md`](dev-docs/zero-backend-social-loop/BRIEF.md).

## How this repository is built

Multi-plan work follows a spec-first process:

```text
Goal / Context / Source / Expectations
                  |
                  v
            reviewed brief
                  |
                  v
      ranked, self-contained plans
                  |
                  v
       bounded implementation commits
                  |
                  v
 tests + validators + browser evidence
                  |
                  v
 results document + Pages report
```

The [Technical Taste Council](dev-docs/TECHNICAL_TASTE_COUNCIL.md) is used as an
architecture review lens. It protects simple solutions, inspectability, privacy, measurable
verification, and the no-build contract.

### Brief packages

| Workstream | Source | Result | Interactive report |
| --- | --- | --- | --- |
| [Zero-backend social loop](dev-docs/zero-backend-social-loop/README.md) | Original spec and preserved plans | Share links and local comparison | [Open](https://eriic-builds.github.io/sled-mywcbracket/dev-reports/zero-backend-social-loop/) |
| [Live tournament readiness](dev-docs/live-tournament-readiness/README.md) | Six committed plans and reconstructed brief | Freshness, validation, flags, access, and voice | [Open](https://eriic-builds.github.io/sled-mywcbracket/dev-reports/live-tournament-readiness/) |
| [Production match experience](dev-docs/production-match-experience/README.md) | Shipped report and reconstructed brief | Two bracket layouts, facts, portraits, and trophy | [Open](https://eriic-builds.github.io/sled-mywcbracket/dev-reports/production-match-experience/) |
| [Animation performance revision](dev-docs/animation-performance-revision/README.md) | Original brief, baseline, and six plans | Lower Layout, Paint, RAF, and WebGL work | [Open](https://eriic-builds.github.io/sled-mywcbracket/dev-reports/animation-performance-revision/) |

The [project history](dev-docs/PROJECT-HISTORY.md) maps smaller milestones that did not need
formal brief packages, including typography, themes, scoring clarity, pool backup, and the
first soccer-ball hero delivery.

## Repository map

```text
.github/workflows/   tests, score sync, Pages deploy
dev-docs/            briefs, plans, results, history, engineering guidance
docs/                complete deployed site
  css/               fonts, themes, dashboard and bracket styles
  data/              fixed and generated public JSON
  dev-reports/       Pages-rendered build reports
  flags/             bundled country SVGs
  fonts/             self-hosted typefaces and licenses
  js/                browser runtime and vendored libraries
  reports/           compatibility redirects for old report routes
scripts/             result fetch, detail generation, validators
tests/               JavaScript and Python fixtures, snapshots, and guards
```

## Develop and verify

Use Node 22 and Python 3.12 to match GitHub Actions. No `npm install` is required.

```bash
# Serve the deployed files
python3 -m http.server 8000 --directory docs

# Run all 16 JavaScript modules
npm test

# Validate committed generated data
python3 scripts/validate_results.py
python3 scripts/validate_match_details.py

# Run Python pipeline fixtures
python3 tests/match_details.py

# Preview a live-data sync without writing files
python3 scripts/fetch_results.py --dry-run

# Accept an intentional render change
node tests/golden.mjs --update
```

Review every golden fixture diff. A passing regenerated snapshot proves consistency with the
new output, not correctness of the change.

### Main safety rails

- `tests/fixtures/golden-sections.json` locks 15 render sections against frozen input.
- `tests/fixtures/map-sections.frozen.json` locks both layouts, both modes, and the legend.
- `tests/scoring.mjs` compares scoring against an independent implementation across 3,001
  brackets.
- `tests/landing-ballpit.mjs` checks physics, topology, lifecycle, local assets, and sleep.
- `tests/animation-performance.mjs` guards transform, transition, frame, and WebGL rules.
- Python fixtures cover FIFA parsing, fallback details, penalty identity, portrait mappings,
  and malformed data.

## Automation and deployment

- `tests.yml` runs the JavaScript suite and both generated-data validators on pushes and pull
  requests.
- `sync-results.yml` runs three baseline times per day and every 30 minutes inside the
  knockout match window. It validates results, details, and portraits before committing.
- `deploy-pages.yml` publishes `docs/` on relevant pushes or explicit workflow dispatch.
- Bot data commits dispatch Pages directly because GitHub blocks workflow recursion from the
  built-in token.

## Why `dev-docs/CLAUDE.md` stays

[`dev-docs/CLAUDE.md`](dev-docs/CLAUDE.md) is tracked repository guidance, not a personal
local settings file. It records commands, architecture boundaries, byte-locked files,
privacy rules, and documentation conventions that future coding agents need.

It contains no credentials or private machine data. Keeping it in the repository makes
those safety rules portable across sessions. Secrets, tokens, private workbook contents,
and machine-specific paths must never be added to it.

## Credits and scope

This is a fan project. It is not affiliated with FIFA, GitHub, or Microsoft. Public match
records come from FIFA with a fallback result source. Portrait credits appear in the
application. Bundled third-party assets and libraries keep their license files beside the
shipped files.
