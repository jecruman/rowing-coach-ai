# Metric Trend — Plan Brief

> Full plan: `context/changes/metric-trend/plan.md`

## What & Why

Roadmap S-05 / PRD FR-011 (nice-to-have): the rower sees how one metric — e.g. pace /500 m or DPS — changed over their sessions. Today each session's Analysis card compares only against the last 3 same-type sessions; there is no longer view of progress, which is exactly what the long AI-chat workflow lost.

## Starting Point

All four per-session metrics are already computed by `sessionMetrics()` (pace, split drift, stroke-rate midpoint, DPS midpoint), and session reads follow one agreed order with a supporting index. There is no chart library and no trend view.

## Desired End State

A read-only `/sessions/trend` page, reachable from the dashboard and the session list: pick a metric and erg or water, and see the last 20 matching sessions as an inline SVG line (pace drawn faster-up), a value list (DPS rows show stroke rate) and a first → latest change. With fewer than 2 data points the page explains what to log instead of drawing a chart.

## Key Decisions Made

| Decision         | Choice                                      | Why (1 sentence)                                                                 |
| ---------------- | ------------------------------------------- | -------------------------------------------------------------------------------- |
| Metrics          | All 4 from `sessionMetrics()`               | Zero new math and numbers match the Analysis card.                               |
| Erg / water      | One type at a time, default = latest type   | Mirrors the same-type baseline; avoids mixing noisy water pace with erg.         |
| Window           | Last 20 sessions of the type with the metric | One bounded query, readable on a phone.                                          |
| "DPS at an SPM"  | Show each point's SPM, no filter            | Rate changes stay visible without a filter that often empties the trend.         |
| Display          | Server-rendered SVG line + list, no JS      | Trend at a glance, no new dependency, testable pure geometry.                    |
| DPS on erg       | Resolves to water; DPS hidden for erg       | DPS is water-only by DB constraint.                                              |
| Pace axis        | Inverted, labelled "faster ↑"               | Lower pace is better; up should read as improvement.                             |

## Scope

**In scope:**
- Pure trend module (query parsing, points, change, chart geometry, shared `signed()`), bounded loader, unit tests
- `/sessions/trend` page with pickers, chart, list, empty/error states
- Dashboard and session-list links; smoke steps

**Out of scope:**
- Watts or other new metrics; mixed erg+water view; SPM-band filter
- More than 20 sessions, date ranges, smoothing or verdicts
- Chart library, client JS, migrations, model calls

## Architecture / Approach

Page → `resolveTrendQuery` (params + latest session type) → `loadTrendSessions` (type + metric not-null filter, newest first, limit 20) → `buildTrend` (via `sessionMetrics()`, oldest → newest, drops nulls) → `trendChartGeometry` → inline SVG + list. All logic is pure and lives in `src/lib/services/sessions/trend.ts`.

## Phases at a Glance

| Phase                          | What it delivers                                   | Key risk                                           |
| ------------------------------ | -------------------------------------------------- | -------------------------------------------------- |
| 1. Trend data                  | Trend module + loader, unit-tested                 | Ordering/null handling diverging from the Analysis |
| 2. Trend page and navigation   | `/sessions/trend`, links, smoke steps              | Chart readability on a phone screen                |

**Prerequisites:** S-02 shipped (sessions exist); no migration, no secrets.
**Estimated effort:** ~1 session across 2 phases.

## Open Risks & Assumptions

- Water data is noisy; the trend shows it raw by design (no smoothing).
- Split drift may show fewer than 20 points, since single-split sessions are dropped after the read.
- Useful only after several sessions of one type; the empty state covers early use.

## Success Criteria (Summary)

- From the dashboard, the rower opens Trends and sees their erg pace over recent sessions, faster up, with values matching each session's Analysis card.
- Water DPS shows each session's stroke rate, so a rate change isn't mistaken for a technique change.
- With too little data, the page says what to log rather than drawing a misleading chart.
