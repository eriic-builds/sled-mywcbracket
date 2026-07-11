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
| [Zero-backend social loop](zero-backend-social-loop/BRIEF.md) | Complete | [Results](zero-backend-social-loop/RESULTS.md) | [Open build story](https://eriic-builds.github.io/sled-mywcbracket/dev-reports/zero-backend-social-loop/) |
| [Live tournament readiness](live-tournament-readiness/BRIEF.md) | Complete | [Results](live-tournament-readiness/RESULTS.md) | [Open dashboard](https://eriic-builds.github.io/sled-mywcbracket/dev-reports/live-tournament-readiness/) |
| [Animation performance revision](animation-performance-revision/BRIEF.md) | Complete | [Results](animation-performance-revision/RESULTS.md) | [Open dashboard](https://eriic-builds.github.io/sled-mywcbracket/dev-reports/animation-performance-revision/) |

## Compatibility path

`ANALYSIS.html` redirects the older `JOURNEY.html` link to the rendered zero-backend social
loop report. It is the only compatibility file left at this level. Future brief-driven work
should use the package structure above.
