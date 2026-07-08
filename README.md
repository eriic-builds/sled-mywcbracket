# sled-mywcbracket — Bring Your Own Bracket, now social

[![Sync World Cup results](https://github.com/eriic-builds/sled-mywcbracket/actions/workflows/sync-results.yml/badge.svg)](https://github.com/eriic-builds/sled-mywcbracket/actions/workflows/sync-results.yml)
[![Deploy GitHub Pages](https://github.com/eriic-builds/sled-mywcbracket/actions/workflows/deploy-pages.yml/badge.svg)](https://github.com/eriic-builds/sled-mywcbracket/actions/workflows/deploy-pages.yml)
[![Tests](https://github.com/eriic-builds/sled-mywcbracket/actions/workflows/tests.yml/badge.svg)](https://github.com/eriic-builds/sled-mywcbracket/actions/workflows/tests.yml)

> The **social edition** of [my-wc26-bracket](https://github.com/eriic-builds/my-wc26-bracket)
> (started as a pilot, now the main): share your bracket as a link, add colleagues'
> links to a local leaderboard, compare picks — still 100% client-side, still free.
> See `SPEC.md` for the social-loop spec and `PLAN-*.md` for the build plans.

> Upload your own filled-in **SLED World Cup 2026** bracket Excel and get your personal,
> live-scored dashboard — bracket map, KPIs, scorecard, round-by-round results, themes — all
> rendered **in your browser**. Your picks travel only in links **you** choose to send.

**Live site:** https://eriic-builds.github.io/sled-mywcbracket/

This is a client-side fork of [**wc26-bracket**](https://github.com/eriic-builds/wc26-bracket)
(which renders one person's dashboard in Python at build time). Here the same render engine runs
as JavaScript, so *anyone* can drop in their bracket and see their own board.

---

## How to use it

1. Open the site and **drop your bracket Excel** (`.xlsx`) on the page, **build a bracket** by
   tapping winners, or click **See a demo first**.
2. It parses your **"My Bracket"** tab entirely in your browser (SheetJS), validates it, and
   renders your dashboard scored against live results.
3. Your bracket is saved in `localStorage`, so it reopens instantly next time. **Save a copy**,
   **Open a saved backup**, **New bracket**, and **Clear** are in the top bar.

## The social loop (what this pilot adds)

1. **🔗 Share link** — your whole bracket travels inside the URL (~140 characters: 31 picks +
   your display name + tiebreaker). Edit the **"share as"** name first if you'd rather appear as
   initials or a nickname. Send it to whoever you choose — chat, email, carrier pigeon.
2. **Opening a link** shows the sender's full live-scored dashboard, view-only. Your own saved
   bracket and what-if edits are never touched.
3. **➕ Add to my leaderboard** puts their bracket on *your* board — stored in your browser only.
4. **🏆 Leaderboard** ranks everyone you've added (confirmed points, then attainable), with a
   per-rival **diff** of the games still to play, sorted by points at stake. Rename or remove
   anyone anytime (local only).

There is no server and no pool registry — see `SPEC.md` for the wire format, the behavioral
invariants, and the deliberate decisions (e.g. no "re-share someone else's bracket" feature).

**Privacy:** the only network requests are same-origin fetches of `docs/data/*.json` (the shared
live results + tournament topology) and the static assets. Your workbook never leaves the browser;
your picks leave it only inside a share link **you** create. The bracket rides in the URL
*fragment* (`#b=…`), which browsers never send to any server — not even GitHub's logs see it.

## How it works

```
your bracket.xlsx ──(browser, SheetJS)──► parse-excel.js ──┐
                                                           ├─► render.js ──► your dashboard (DOM)
docs/data/topology.json  (fixed bracket) ──────────────────┤        + interact.js (themes, search…)
docs/data/results.json   (live, synced)  ──────────────────┘
```

- **`docs/js/render.js`** — the render engine, ported 1:1 from the Python generator. A pure
  function `renderDashboard(picks, live, topology)` → HTML string. A **golden test** proves it is
  byte-identical to the Python original for the demo bracket.
- **`docs/js/parse-excel.js`** — workbook → picks object, with validation (reject with specific
  messages, never render garbage). Verified to reproduce the demo bracket from the real workbook.
- **`docs/js/interact.js`** — the interaction layer (themes, favorites, team search, connector
  drawing, hover stat cards, scrollspy), extracted verbatim and run *after* the dashboard is
  injected via `initInteractions()`.
- **`docs/js/storage.js`** — save / load / export / import; namespaces what-if score overrides per
  bracket so two uploads on one device don't leak into each other.
- **`scripts/fetch_results.py`** — the same sync engine as the source repo, trimmed to write
  `docs/data/results.json` (no HTML to rebuild). Runs 3×/day via `.github/workflows/sync-results.yml`.

## Data files

| File | What it is |
| --- | --- |
| `docs/data/topology.json` | The fixed bracket: `r32` fixtures, `ko_feed`, seeds, kickoff-time tables. Same for everyone. |
| `docs/data/results.json` | Live results the sync writes: `res`, `ko_fix`, `auto_hl`, `refreshed`. |
| `docs/data/demo-picks.json` | A sample bracket (Eric's) used by **Try the demo**. |

## Develop & test

No build step. Serve `docs/` and open it:

```bash
cd docs && python3 -m http.server 8000   # then open http://localhost:8000/

# Tests (Node ≥ 18):
npm test                # scoring + builder + golden snapshot + parse (parse skips without the private workbook)
node tests/golden.mjs --update   # accept an INTENTIONAL render change (review the fixture diff)

# Sync results locally:
python3 scripts/fetch_results.py --dry-run    # preview, writes nothing
python3 scripts/fetch_results.py              # writes docs/data/results.json
```

The golden test is a self-contained snapshot: it renders the demo bracket against
**frozen** inputs (`tests/fixtures/results.frozen.json`) and compares byte-for-byte with
`tests/fixtures/golden-sections.json`. Python byte-parity was proven once at porting
time; the snapshot now guards regressions without any outside-the-repo files.

## Deploy (GitHub Pages)

`.github/workflows/deploy-pages.yml` uploads `docs/` to Pages. In **Settings → Pages**, set
**Source → GitHub Actions**. `docs/.nojekyll` is kept as a fallback.

## Credits & scope

A fan project, not affiliated with FIFA, GitHub, or Microsoft. Match results from FIFA's public
records. Built on the reusable World Cup Bracket Dashboard engine. The host/credit lines in
`render.js` (e.g. "Thank you to Rob") are the one place to edit for your own group.
