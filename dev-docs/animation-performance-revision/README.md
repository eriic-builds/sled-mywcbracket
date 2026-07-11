# Animation performance revision

Status: complete

This folder keeps the original brief, its six execution plans, the measured starting point,
and the final result together.

## Read in order

1. [Brief](BRIEF.md)
2. [Measured baseline](BASELINE.md)
3. [Execution plans](plans/)
4. [Final results](RESULTS.md)
5. [Interactive report](https://eriic-builds.github.io/sled-mywcbracket/dev-reports/animation-performance-revision/)

The interactive report source lives at
[`docs/dev-reports/animation-performance-revision/index.html`](../../docs/dev-reports/animation-performance-revision/index.html).
Keeping it under `docs/` lets the existing GitHub Pages workflow render the dashboard.

## Package structure

```text
animation-performance-revision/
├── BRIEF.md
├── BASELINE.md
├── plans/
│   ├── PLAN-01-baseline-and-safety-rails.md
│   ├── PLAN-02-ballpit-runtime-budget.md
│   ├── PLAN-03-dom-motion-hot-paths.md
│   ├── PLAN-04-css-compositor-primitives.md
│   ├── PLAN-05-trophy-frame-budget.md
│   └── PLAN-06-integrated-performance-gate.md
├── RESULTS.md
└── README.md
```
