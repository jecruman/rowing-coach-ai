# Metric Trend Implementation Plan

## Overview

Roadmap S-05 (Linear JES-16, PRD FR-011, nice-to-have): the rower can see how one metric changed over their sessions. Adds a read-only `/sessions/trend` page: pick one of the four computed metrics and erg or water, and see the last 20 sessions that have that metric as an inline SVG line, a value list and a first → latest change. No schema change, no model calls.

## Current State Analysis

- All four per-session metrics are already computed by `sessionMetrics()` (`src/lib/services/coaching/metrics.ts:50-61`): pace /500 m, split drift, stroke-rate midpoint, DPS midpoint — each rounded to 0.1, `null` when the inputs are missing. The Analysis card uses the same function (`src/components/sessions/SessionAnalysis.astro`), so trend numbers will match it.
- Session reads go through `SESSION_COLUMNS` / `toRowingSession` (`src/lib/services/sessions/load.ts:9-10, 53-70`) and always order by `rowed_on` desc, then `created_at` desc, served by `sessions_user_rowed_on_idx` (`supabase/migrations/20261008200000_create_sessions_and_suggestions.sql:46`). RLS limits rows to the signed-in user.
- DB constraints: DPS and boat are water-only, watts is erg-only (`sessions_water_only` / `sessions_erg_only`); SPM and DPS ranges are optional; `splits_s` is optional, 1–200 entries.
- `/sessions*` is protected by middleware (`src/middleware.ts:4`). Astro gives a static route (`src/pages/sessions/trend.astro`) priority over the dynamic `src/pages/sessions/[id].astro`.
- No chart library is installed; UI is Astro + Tailwind, dark "cosmic" cards, `max-w-md` phone layout (`src/pages/sessions/index.astro`).
- `scripts/smoke.mjs` already has an anonymous-redirect and a "renders" step for every `/sessions*` page (`scripts/smoke.mjs:77-78, 119-147`).

## Desired End State

- `/sessions/trend` shows, for the chosen metric and session type, the up to 20 most recent sessions of that type that have the metric, plotted oldest → newest as an inline SVG line chart, followed by a list of `date · value` rows (DPS rows also show that session's stroke rate) and a summary "first → latest: <signed change>".
- Metric pickers (Pace, DPS, Stroke rate, Split drift) and type pickers (Erg, Water) are plain links that rewrite `?metric=&type=`. DPS is offered only for water; `metric=dps` with `type=erg` resolves to water. Missing or invalid params fall back to metric `pace` and the type of the rower's latest session (erg when they have none).
- Fewer than 2 points: no chart, a message "Log at least 2 <type> sessions with <metric> to see a trend." (any single point is still listed). Read failure: the shared `ServerError`.
- Dashboard and the session list link to the trend page.

Verify via unit tests, `npm run smoke` and the manual steps below.

### Key Discoveries:

- `sessionMetrics()` is the single source of metric values — reuse it, do not re-derive (`metrics.ts:50`).
- `formatTime` and `pacePer500` live in `src/lib/services/profile/rules.ts:33, 46`; `signed()` formatting (`+1.5`, `−0.3`, `±0`) exists locally in `SessionAnalysis.astro:24-28` — the trend page needs the same format.
- Test fixtures `water()` / `erg()` in `src/lib/services/coaching/metrics.test.ts:9-31` show the expected `RowingSession` shape for tests.
- CI runs `npm run lint`, `npm test`, `npx astro check`, `npm run build` (`.github/workflows/ci.yml:20-23`).

## What We're NOT Doing

- Watts (or any metric not in `sessionMetrics()`) as a trend metric.
- Mixing erg and water in one trend, or showing them side by side.
- An SPM-band filter for DPS; the rate is shown per point instead.
- More than 20 sessions, date-range pickers, paging through older trend data.
- Smoothing, rolling averages, regression lines or "better/worse" verdicts.
- A chart library, client-side JS, tooltips, zoom.
- Any migration, model call, or change to the analysis/suggestion flow.

## Implementation Approach

Keep all logic in a pure, unit-tested module next to the session loaders; the page only parses params, calls the loader and renders. The loader reads a bounded window (filter by type and by the metric's not-null column, newest first, limit 20); the pure module turns sessions into oldest → newest points via `sessionMetrics()` and drops points whose metric is still `null` (e.g. split drift with a single split). The chart is server-rendered SVG from a pure geometry function, so it needs no JS and is testable without a DOM. The implementer should load the `dataviz` skill before writing the chart markup and colours.

## Critical Implementation Details

- **Pace axis is inverted.** For pace a lower number is faster, so the geometry maps lower values higher on the chart and the axis is labelled "faster ↑"; all other metrics plot higher values higher. The list and change summary still show the raw signed change.
- **Flat series.** When every point has the same value (min = max), the geometry must not divide by zero — draw the line at mid-height.
- **Split drift may yield fewer than 20 points.** The query can only require `splits_s is not null`; sessions with a single split have `splitDriftS = null` and are dropped after the read. Accepted — do not over-fetch to compensate.

## Phase 1: Trend data

### Overview

The pure trend module and the bounded loader, fully unit-tested.

### Changes Required:

#### 1. Trend module

**File**: `src/lib/services/sessions/trend.ts` (new)

**Intent**: Define the trend metrics and turn a list of sessions into chart-ready points, a change summary and chart geometry, with no I/O.

**Contract**:
- `TREND_METRICS` — `pace | dps | spm | drift`, each mapped to its `SessionMetrics` key, display label, unit and the DB column that must be non-null (`null` for pace, `dps_min`, `spm_min`, `splits_s`); `dps` is water-only.
- `resolveTrendQuery(params: URLSearchParams, latestType: SessionType | null) → { metric, type }` — invalid/missing metric → `pace`; invalid/missing type → `latestType ?? "erg"`; `metric=dps` forces `type="water"`.
- `buildTrend(sessions: readonly RowingSession[], metric) → { points: { sessionId, rowedOn, value, spmMid }[]; change: number | null }` — keeps only sessions of one type with a non-null metric value, ordered oldest → newest by the agreed order (`isOrderedBefore`), at most 20; `change` = latest − first rounded with `round1`, `null` with fewer than 2 points.
- `trendChartGeometry(values: number[], { width, height, padding, invert }) → { points: string; yMin; yMax }` — SVG polyline `points` string; flat series drawn at mid-height; `invert` puts lower values higher.

#### 2. Trend loader

**File**: `src/lib/services/sessions/load.ts`

**Intent**: Read the window of sessions a trend needs in one bounded query, following the existing loader pattern (`SESSION_COLUMNS`, `toSessions`, `logReadError`, `loadFailed`).

**Contract**: `loadTrendSessions(supabase, type: SessionType, metric: TrendMetric, limit = TREND_SIZE) → { sessions: RowingSession[]; loadFailed: boolean }` — `.eq("session_type", type)`, `.not(<column>, "is", null)` when the metric has a required column, ordered `rowed_on` desc then `created_at` desc, `.limit(limit)`. `TREND_SIZE = 20` exported from `trend.ts`.

#### 3. Unit tests

**File**: `src/lib/services/sessions/trend.test.ts` (new)

**Intent**: Pin the decisions in tests.

**Contract**: cover — `resolveTrendQuery` defaults, invalid values, `dps`+`erg` → water, no latest session → erg; `buildTrend` order oldest → newest including same-date tiebreak by `created_at`, drops `null` values (single-split drift, missing SPM), ignores other-type sessions, caps at 20 newest, `change` sign and `null` below 2 points, `spmMid` carried on DPS points; `trendChartGeometry` flat series, inversion for pace, two-point endpoints at the padding edges.

### Success Criteria:

#### Automated Verification:

- Unit tests pass, including the new trend tests: `npm test`
- Lint passes (ignoring CRLF "Delete ␍" noise): `npm run lint`
- Type check passes: `npx astro check`

**Implementation Note**: After completing this phase and all automated verification passes, continue to Phase 2 (no manual checks in this phase).

---

## Phase 2: Trend page and navigation

### Overview

The `/sessions/trend` page, links into it, and smoke coverage.

### Changes Required:

#### 1. Trend page

**File**: `src/pages/sessions/trend.astro` (new)

**Intent**: Render the trend for the requested metric and type, following the layout of `src/pages/sessions/index.astro` (Layout, Topbar, gradient heading, cards, `ServerError`).

**Contract**:
- Reads the latest session (`loadLatestSession`) only when `type` is missing/invalid, then `resolveTrendQuery`, then `loadTrendSessions` + `buildTrend`.
- Picker rows: metric links (DPS hidden when type is erg) and type links; the active choice is visually marked and has `aria-current="true"`.
- ≥ 2 points: inline `<svg role="img" aria-label="<metric> trend, <first> to <latest>">` with the polyline from `trendChartGeometry`, y-axis min/max labels (pace formatted with `formatTime`, "faster ↑" for pace), first and latest dates under the x-axis; then the summary "first → latest: <signed change> <unit>".
- List of points newest first: `date · value` (pace via `formatTime` + " /500 m", others with unit), DPS rows add `· <spm> spm` when known; each row links to `/sessions/<id>`.
- < 2 points: the "Log at least 2 …" message; load failure: `ServerError` "Could not load your sessions — please try again."

#### 2. Shared signed formatting

**File**: `src/lib/services/sessions/trend.ts` and `src/components/sessions/SessionAnalysis.astro`

**Intent**: Move the `signed()` helper into the trend module (exported) so the analysis card and the trend page format changes identically. (Superseded by the review addendum below: it lives in `src/lib/services/profile/rules.ts`.)

**Contract**: `signed(value: number): string` — `+1.5`, `−0.3`, `±0`; `SessionAnalysis.astro` imports it instead of defining its own. Covered by a unit test.

#### 3. Navigation

**Files**: `src/pages/dashboard.astro`, `src/pages/sessions/index.astro`

**Intent**: Make the trend page reachable.

**Contract**: a "Trends" link under "All sessions" on the dashboard; a "See trends" link on the session list page (next to the paging nav / above "Log a session").

#### 4. Smoke

**File**: `scripts/smoke.mjs`

**Intent**: Cover the new page like the other `/sessions*` pages.

**Contract**: anonymous `GET /sessions/trend` → 302 to `/auth/signin`; signed-in `GET /sessions/trend?metric=dps&type=erg` → 200.

> **Review addendum (2026-10-13, `reviews/impl-review-round1.md`, `reviews/impl-review.md`):** accepted additions beyond this phase — two faint guide lines and a dot on the latest point in the SVG (dataviz mark rules), and an "All sessions" link at the bottom of the trend page. Triage also moved `signed()` and its test to `src/lib/services/profile/rules.ts` / `rules.test.ts` (F3), made the drift empty state read "with 2 or more splits" (F2), and made the signed-in smoke step assert no load error and the active Water picker (F1). Implementation adaptations recorded here: `buildTrend` takes the session type explicitly — `buildTrend(sessions, metric, type)` — and the Erg link while DPS is selected switches the metric to pace (DPS is water-only, so `dps` + `erg` would only resolve back to water).

### Success Criteria:

#### Automated Verification:

- Type check and build pass: `npx astro check && npm run build`
- Lint passes (ignoring CRLF "Delete ␍" noise): `npm run lint`
- Unit tests pass: `npm test`
- Smoke passes against a local server, including the new trend steps: `npm run smoke`

#### Manual Verification:

- On a phone-width browser with ≥ 2 erg sessions, `/sessions/trend` shows the pace line (faster up), the list newest first and the first → latest change, and the numbers match each session's Analysis card
- Switching to Water + DPS shows DPS points with each session's stroke rate in the list; the DPS picker is hidden while Erg is selected
- A metric/type with 0 or 1 matching sessions shows the "Log at least 2 …" message and no chart
- Dashboard "Trends" and session list "See trends" links open the page

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful.

---

## Testing Strategy

### Unit Tests:

- `resolveTrendQuery`, `buildTrend`, `trendChartGeometry` in `src/lib/services/sessions/trend.test.ts`, using `water()` / `erg()`-style fixtures; `signed` in `src/lib/services/profile/rules.test.ts`.
- Key edges: same-date ordering, single-split drift, missing SPM/DPS, 21+ sessions, flat series, pace inversion.

### Integration Tests:

- `npm run smoke`: anonymous redirect and signed-in render of `/sessions/trend`.

### Manual Testing Steps:

1. Log 3 erg sessions with different paces; open `/sessions/trend` from the dashboard — pace line, faster up, change summary correct.
2. Switch to Water + DPS with water sessions at different rates — SPM shown per row.
3. Pick Split drift for a type with only single-split sessions — "Log at least 2 …" message.
4. Open `/sessions/trend?metric=dps&type=erg` — shows water DPS.

## Performance Considerations

One bounded read (≤ 20 rows) served by `sessions_user_rowed_on_idx` plus at most one latest-session read; no client JS.

## Migration Notes

None — no schema change.

## References

- Roadmap item: `context/foundation/roadmap.md` (S-05)
- PRD: `context/foundation/prd.md` FR-011
- Metrics: `src/lib/services/coaching/metrics.ts:50`
- Loader pattern: `src/lib/services/sessions/load.ts:136-162`
- Page pattern: `src/pages/sessions/index.astro`
- Similar plan: `context/archive/2026-10-11-session-history/plan.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Trend data

#### Automated

- [x] 1.1 Unit tests pass, including the new trend tests: `npm test` — fb733fd
- [x] 1.2 Lint passes (ignoring CRLF "Delete ␍" noise): `npm run lint` — fb733fd
- [x] 1.3 Type check passes: `npx astro check` — fb733fd

### Phase 2: Trend page and navigation

#### Automated

- [x] 2.1 Type check and build pass: `npx astro check && npm run build` — 4635361
- [x] 2.2 Lint passes (ignoring CRLF "Delete ␍" noise): `npm run lint` — 4635361
- [x] 2.3 Unit tests pass: `npm test` — 4635361
- [x] 2.4 Smoke passes against a local server, including the new trend steps: `npm run smoke` — 4635361

#### Manual

- [x] 2.5 On a phone-width browser with ≥ 2 erg sessions, `/sessions/trend` shows the pace line (faster up), the list newest first and the first → latest change, and the numbers match each session's Analysis card — 4635361
- [x] 2.6 Switching to Water + DPS shows DPS points with each session's stroke rate in the list; the DPS picker is hidden while Erg is selected — 4635361
- [x] 2.7 A metric/type with 0 or 1 matching sessions shows the "Log at least 2 …" message and no chart — 4635361
- [x] 2.8 Dashboard "Trends" and session list "See trends" links open the page — 4635361
