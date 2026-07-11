# Animation performance revision brief

## Goal
Revise the first-party browser animations in `sled-mywcbracket` so visual motion avoids
repeated layout work, the two WebGL scenes have bounded runtime cost, and the static site
stays responsive on lower-end mobile hardware.

Performance direction:
- Prefer `transform` and `opacity` for visual motion.
- Do not animate layout properties such as `left`, `top`, `width`, or `height`.
- Keep JavaScript loops only where CSS cannot express the required behavior.

## Architecture contract
The app remains:
- Static and zero-backend.
- Hosted as files on GitHub Pages.
- Vanilla HTML, CSS, and ES modules.
- No build step.
- No new dependency.
- No server session or network write.

The app is not fully stateless. It intentionally remembers brackets, rivals, preferences,
and the landing Motion setting in browser `localStorage`. This revision adds no storage key
and no new persisted state.

## Technical correction
`transform` and `opacity` are compositor-eligible. They often avoid Layout and Paint work,
but they do not guarantee GPU execution or a separate browser thread. JavaScript that
calculates and writes a transform still runs on the main thread.

The correct standard is:
1. Avoid animation-time layout.
2. Keep paint work bounded.
3. Pause work when it is invisible or settled.
4. Verify the result in Chrome and Edge performance traces.

Do not add `will-change` everywhere. Extra compositor layers consume memory and can make a
lower-end device slower.

## Ranked plan set

| Rank | Plan | Why it has leverage |
| --- | --- | --- |
| 1 | [`PLAN-01-baseline-and-safety-rails.md`](plans/PLAN-01-baseline-and-safety-rails.md) | Prevents blind optimization and gives every later model a measurable target. |
| 2 | [`PLAN-02-ballpit-runtime-budget.md`](plans/PLAN-02-ballpit-runtime-budget.md) | The landing ball pit is the largest continuous animation cost and currently performs DOM layout writes inside its frame loop. |
| 3 | [`PLAN-03-dom-motion-hot-paths.md`](plans/PLAN-03-dom-motion-hot-paths.md) | Removes repeated layout from pointer tracking and converts the two dynamic progress bars away from width animation. |
| 4 | [`PLAN-04-css-compositor-primitives.md`](plans/PLAN-04-css-compositor-primitives.md) | Fixes the toggle knob, repainting pulse rings, and risky `transition: all` shorthands across the UI. |
| 5 | [`PLAN-05-trophy-frame-budget.md`](plans/PLAN-05-trophy-frame-budget.md) | Cuts passive WebGL rendering and releases its scene when the responsive static fallback takes over. |
| 6 | [`PLAN-06-integrated-performance-gate.md`](plans/PLAN-06-integrated-performance-gate.md) | Proves the combined changes preserve behavior and improve the measured browser workload. |

## Which plan to do first
Start with [`PLAN-01-baseline-and-safety-rails.md`](plans/PLAN-01-baseline-and-safety-rails.md).

Do not start with a mass CSS replacement. Russinovich's council voice leads here: measure
the current browser behavior first. The baseline makes later decisions reviewable and stops
a weaker model from declaring success because the code "looks optimized."

## Execution order and dependencies
Run the plans in rank order. Do not run them in parallel.

```text
01 baseline
   |
02 ball pit
   |
03 DOM motion
   |
04 CSS primitives
   |
05 trophy
   |
06 integrated gate and local review
```

Plans 02 through 05 are technically separable after Plan 01, but several touch
`docs/index.html`, `docs/css/dashboard.css`, and shared regression tests. Sequential work is
safer and easier to review.

## Safety rules for every plan
- Read `dev-docs/CLAUDE.md` and `dev-docs/TECHNICAL_TASTE_COUNCIL.md` before editing.
- Inspect `git status` before and after. `JOURNEY.html` is an unrelated existing change.
  Never stage, restore, or edit it.
- Touch only the files named by the active plan.
- Use the smallest targeted test first, then run the full `npm test` suite.
- Keep `docs/js/vendor/three.module.min.js` and `docs/js/vendor/xlsx.full.min.js` untouched.
- Do not change `render.js` without reviewing and regenerating the byte-locked golden
  fixture exactly as Plan 03 describes.
- Serve `docs/` locally and inspect the real browser result.
- Stop at the local review gate. Do not commit, push, or deploy without explicit approval.

## Council architecture call
- **Russinovich:** baseline and trace first. Runtime cost must be visible.
- **Karpathy:** use small CSS and vanilla JavaScript changes, not a framework or worker
  rewrite.
- **Naval:** preserve the approved soccer-ball hero and trophy because users value them.
  Bound their cost instead of deleting them.
- **Sean Grove:** these six plans are the execution spec. A model should follow the active
  plan instead of re-deriving intent from code.
- **Willison / Hamel:** source changes are drafts until tests and browser traces verify them.
- **Yegge:** one plan at a time, with a reviewable handoff after each.
- **Litt:** keep the implementation legible to the owner. Avoid clever animation helpers.
- **Hanselman:** name frame budgets, sleep states, and failures so the next person can find
  and understand them.
- **Context Engineering:** load only the active plan and its named files during execution.

## Planning artifacts
- Open the [live interactive report](https://eriic-builds.github.io/sled-mywcbracket/dev-reports/animation-performance-revision/)
  or serve `docs/` and visit `/dev-reports/animation-performance-revision/` locally.
- The report source is `docs/dev-reports/animation-performance-revision/index.html`.
- Each `plans/PLAN-*.md` file is self-contained for a less capable execution model.
- Plan 01 creates `BASELINE.md`.
- Plan 06 creates `RESULTS.md` and updates the interactive guide with measured outcomes.
