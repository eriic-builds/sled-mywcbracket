# Development briefs

New multi-plan work is grouped by brief instead of adding more loose plan files to this
directory.

Each completed brief package follows this shape:

```text
brief-name/
├── BRIEF.md
├── BASELINE.md        optional measured starting point
├── plans/
│   ├── PLAN-01-*.md
│   └── PLAN-02-*.md
├── RESULTS.md
└── README.md
```

Interactive HTML reports live under `docs/dev-reports/` so GitHub Pages renders them as web
pages instead of GitHub showing the HTML source.

## Brief packages

| Brief | Status | Final report | Interactive preview |
| --- | --- | --- | --- |
| [Animation performance revision](animation-performance-revision/BRIEF.md) | Complete | [Results](animation-performance-revision/RESULTS.md) | [Open dashboard](https://eriic-builds.github.io/sled-mywcbracket/dev-reports/animation-performance-revision/) |

## Existing reference documents

The loose `SPEC.md`, `PLAN-*.md`, and `ANALYSIS.html` files predate this convention. They
remain in place so existing links do not break. Future brief-driven work should use the
package structure above.
