#My World Cup Bracket — Bring Your Own Bracket, now social

[![Sync World Cup results](https://github.com/eriic-builds/sled-mywcbracket/actions/workflows/sync-results.yml/badge.svg)](https://github.com/eriic-builds/sled-mywcbracket/actions/workflows/sync-results.yml)
[![Deploy GitHub Pages](https://github.com/eriic-builds/sled-mywcbracket/actions/workflows/deploy-pages.yml/badge.svg)](https://github.com/eriic-builds/sled-mywcbracket/actions/workflows/deploy-pages.yml)
[![Tests](https://github.com/eriic-builds/sled-mywcbracket/actions/workflows/tests.yml/badge.svg)](https://github.com/eriic-builds/sled-mywcbracket/actions/workflows/tests.yml)

> The **social edition** of [my-wc26-bracket](https://github.com/eriic-builds/my-wc26-bracket)
> (started as a pilot, now the main): share your bracket as a link, add colleagues'
> links to a local leaderboard, compare picks — still 100% client-side, still free.
> See `dev-docs/zero-backend-social-loop/BRIEF.md` for the social-loop spec and
> `dev-docs/zero-backend-social-loop/plans/` for its preserved build plans.

> Upload your own filled-in **SLED World Cup 2026** bracket Excel and get your personal,
> live-scored dashboard — bracket map, KPIs, scorecard, round-by-round results (with kickoff
> times in PT/CT/ET and host city), themes — all
> rendered **in your browser**. Your picks travel only in links **you** choose to send.

**Live site:** https://eriic-builds.github.io/sled-mywcbracket/

**Development briefs:** [organized brief packages](dev-docs/) ·
[interactive report previews](https://eriic-builds.github.io/sled-mywcbracket/dev-reports/)

This is a client-side fork of [**wc26-bracket**](https://github.com/eriic-builds/wc26-bracket)
(which renders one person's dashboard in Python at build time). Here the same render engine runs
as JavaScript, so *anyone* can drop in their bracket and see their own board.

---

## How to use it

1. Open the site and **drop your bracket Excel** (`.xlsx`) on the page, **build a bracket** by
   tapping winners, or click **See a demo first**.
2. It parses your **"My Bracket"** tab entirely in your browser (SheetJS), validates it, and
   renders your dashboard scored against live results.
3. Your bracket is saved in `localStorage`, so it reopens instantly next time. The top bar has
   **🏠 Home** (back to the start page — never deletes anything), **Back up my pool** (downloads
   your bracket and leaderboard as private JSON), and **Clear** (the one destructive button).
   The landing shows **Open my dashboard** whenever a bracket is saved on the device.
4. The **bracket map** has two views: *My picks* (your path) and *Actual path* — the latter reads
   every slot from real results, so the true tournament flows through all rounds even where your
   picks busted; not-yet-played slots show a "Winner M97"-style placeholder.

## The social loop (what this pilot adds)

1. **🔗 Share link** — your whole bracket travels inside the URL (~140 characters: 31 picks +
   your display name + tiebreaker). Edit the **"share as"** name first if you'd rather appear as
   initials or a nickname. Send it to whoever you choose — chat, email, carrier pigeon.
2. **Opening a link** shows the sender's full live-scored dashboard, view-only. Your own saved
   bracket and what-if edits are never touched.
3. **➕ Add to my leaderboard** puts their bracket on *your* board — stored in your browser only.
4. **🏆 Leaderboard** ranks everyone you've added — up to 20 brackets — by confirmed points, then
   attainable, with a per-rival **diff** of the games still to play, sorted by points at stake.
   Rename or remove anyone anytime (local only).

**Where does everything live?**

| Thing | Where it lives |
|---|---|
| Your bracket | Your browser's storage — on your device, not ours |
| Brackets you've added | Your browser's storage — same deal |
| A share link | Entirely inside the URL you send — nothing is written anywhere when you generate it |
| A pool backup | A private JSON file downloaded only when you choose **Back up my pool** |
| Live match results | A JSON file on GitHub, updated 3× a day plus half-hour match-window runs |

When you hit "Share link", your 31 picks + display name get packed into the URL itself (the part after `#`). The recipient's browser unpacks it directly — no round-trip to any server, no account, no database row created. If they click "Add to my leaderboard", it saves to *their* browser. **Back up my pool** downloads your bracket and that local leaderboard; importing it uses the backup's bracket and adds only leaderboard entries that are missing. Because the file contains picks people shared with you, keep it private.

**Can I revoke a link I already sent?** No — a link *is* the data, like an email attachment,
so nothing exists to revoke against (and even server-based revocation can't reach saved copies
or screenshots). Prevention beats revocation: use the **"share as"** field to share under
initials or an alias, and the link never contained your name in the first place. Recipients can
always remove your bracket from their board with one ✕.

See `dev-docs/zero-backend-social-loop/BRIEF.md` for the wire format, behavioral
invariants, and the distinction between a private local pool backup and a whole-pool sharing
feature.

## How it works

```
your bracket.xlsx ──(browser, SheetJS)──► parse-excel.js ──┐
click-to-pick builder ───────────────────► builder.js ─────┤
                                                           ├─► render.js ──► your dashboard (DOM)
docs/data/topology.json  (fixed bracket) ──────────────────┤     + interact.js (themes, search, connectors)
docs/data/results.json   (live, synced)  ──────────────────┘     + main.js (uploads, share, leaderboard)

share link   ⇄  share.js    (packs/unpacks your picks in the URL — no network)
leaderboard  ⇄  compare.js  (ranks + diffs brackets you've added — localStorage only)
pool backup  ⇄  storage.js  (versioned private JSON; import merges missing rivals)
```

- **`docs/js/render.js`** — the render engine. `computeState(picks, live, topology)` builds the
  scored state, then pure section builders (`buildBracket`, `buildScorecard`, `buildRoundResultsPanel`,
  …) each return an HTML string, and `renderDashboard()` assembles them. A **golden test** byte-locks
  every section builder's output against a frozen snapshot; byte-parity with the original Python
  generator was proven once at porting time and is now guarded against regressions.
- **`docs/js/parse-excel.js`** — workbook → picks object, with validation (reject with specific
  messages, never render garbage). Verified to reproduce the demo bracket from the real workbook.
- **`docs/js/builder.js`** — the pure pick core (`deriveStructure`, `teamsFor`, `repair`,
  `buildPicks`) plus the click-to-pick overlay, so you can build a bracket by tapping winners
  without a spreadsheet. The same core encodes and decodes share links.
- **`docs/js/share.js` / `docs/js/compare.js`** — the social layer. `share.js` encodes/decodes a
  whole bracket into the URL hash; `compare.js` keeps the local leaderboard (rank + per-rival diff).
  Neither touches the network — a bracket only leaves the browser inside a link you send.
- **`docs/js/main.js`** — wires the page together: uploads and build flow, the viewer bar, the share
  popover, the leaderboard overlay, and the collapsible "filter by team" rail.
- **`docs/js/interact.js`** — the interaction layer (themes, favorites, team search, connector
  drawing, hover stat cards, scrollspy), run *after* the dashboard is injected via `initInteractions()`.
- **`docs/js/storage.js`** — save / load / export / import; namespaces what-if score overrides per
  bracket so two uploads on one device don't leak into each other.
- **`scripts/fetch_results.py`** — the same sync engine as the source repo, trimmed to write
  `docs/data/results.json` (no HTML to rebuild). Runs 3×/day via `.github/workflows/sync-results.yml`.

## Data files

| File | What it is |
| --- | --- |
| `docs/data/topology.json` | The fixed bracket: `r32` fixtures, `ko_feed`, seeds, and the static knockout schedule (`r16_fix`, `ko_when` kickoff times, `ko_city` host cities). Same for everyone. |
| `docs/data/results.json` | Live results the sync writes: `res`, `ko_fix`, `auto_hl`, `refreshed`. |
| `docs/data/demo-picks.json` | A sample bracket (Eric's) used by **Try the demo**. |

## Develop & test

No build step. Serve `docs/` and open it:

```bash
cd docs && python3 -m http.server 8000   # then open http://localhost:8000/

# Tests (Node ≥ 18):
npm test                # scoring, builder, share, compare, bracketmap, golden snapshot, parse
                        # (parse skips without the private workbook)
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
