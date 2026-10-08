import { pacePer500 } from "@/lib/services/profile/rules";
import type { RowingSession } from "@/types";

/** How many previous same-type sessions form the baseline ("vs your last N"). */
export const BASELINE_SIZE = 3;

/** PRD thresholds (absolute, MVP). */
const DPS_HUGE_IMPROVEMENT_M = 0.5;
const DPS_CLEAR_DROP_M = -0.3;
const PACE_GOOD_IMPROVEMENT_S = -5;

/** Rounds to 0.1; every metric, baseline and delta is rounded so threshold checks never see float noise (−0.29999). */
export function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** Per-session metrics, each rounded to 0.1. */
export interface SessionMetrics {
  /** Average pace in seconds per 500 m (time ÷ distance × 500). */
  pacePer500s: number;
  /** Last split minus first split in s/500 m (+ = slowing); null with fewer than 2 splits. */
  splitDriftS: number | null;
  /** Stroke-rate range midpoint; null when not logged. */
  spmMid: number | null;
  /** Distance-per-stroke range midpoint in metres; null when not logged. */
  dpsMid: number | null;
}

export type MetricDeltas = { [K in keyof SessionMetrics]: number | null };

export type AnalysisLabel =
  "dpsHugeImprovement" | "dpsClearDrop" | "paceGoodImprovement" | "techniqueLimitingEfficiency";

export interface SessionAnalysis {
  /** Number of previous same-type sessions in the baseline (0–3). */
  baselineCount: number;
  metrics: SessionMetrics;
  /** Average of each metric over the baseline sessions that have it; null when none do. */
  baseline: MetricDeltas;
  /** Metric minus baseline; null when either side is missing. */
  deltas: MetricDeltas;
  labels: AnalysisLabel[];
}

function midpoint(range: { min: number; max: number } | null): number | null {
  return range === null ? null : round1((range.min + range.max) / 2);
}

export function sessionMetrics(session: RowingSession): SessionMetrics {
  const splits = session.splitsS;
  const first = splits?.[0];
  const last = splits?.[splits.length - 1];
  return {
    pacePer500s: round1(pacePer500(session.distanceM, session.durationS)),
    splitDriftS:
      splits && splits.length >= 2 && first !== undefined && last !== undefined ? round1(last - first) : null,
    spmMid: midpoint(session.spm),
    dpsMid: midpoint(session.dps),
  };
}

/** Whether `a` comes strictly before `b` in the agreed order (`rowed_on`, then `created_at`). */
export function isOrderedBefore(a: RowingSession, b: RowingSession): boolean {
  if (a.rowedOn !== b.rowedOn) return a.rowedOn < b.rowedOn;
  return a.createdAt < b.createdAt;
}

/** Newest first, the agreed "latest" order. */
function newestFirst(a: RowingSession, b: RowingSession): number {
  if (isOrderedBefore(a, b)) return 1;
  if (isOrderedBefore(b, a)) return -1;
  return 0;
}

/**
 * Sessions strictly before `session` (any type), newest first, without duplicates. Anything ordered at or after
 * `session` — including `session` itself — is dropped, so a session's results never change when later ones are logged.
 */
export function previousSessions(session: RowingSession, history: readonly RowingSession[]): RowingSession[] {
  const seen = new Set<string>([session.id]);
  const previous: RowingSession[] = [];
  for (const candidate of history) {
    if (seen.has(candidate.id) || !isOrderedBefore(candidate, session)) continue;
    seen.add(candidate.id);
    previous.push(candidate);
  }
  return previous.sort(newestFirst);
}

function average(values: number[]): number | null {
  return values.length === 0 ? null : round1(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function delta(value: number | null, baseline: number | null): number | null {
  return value === null || baseline === null ? null : round1(value - baseline);
}

/**
 * Metrics of `session` against the average of up to 3 previous same-type sessions, with the PRD labels.
 * `history` may contain any sessions (any type, the session itself, later ones); only strictly earlier ones count.
 */
export function analyseSession(session: RowingSession, history: readonly RowingSession[]): SessionAnalysis {
  const metrics = sessionMetrics(session);
  const baselineMetrics = previousSessions(session, history)
    .filter((previous) => previous.type === session.type)
    .slice(0, BASELINE_SIZE)
    .map(sessionMetrics);

  const baselineOf = (key: keyof SessionMetrics) =>
    average(baselineMetrics.map((m) => m[key]).filter((value): value is number => value !== null));
  const baseline: MetricDeltas = {
    pacePer500s: baselineOf("pacePer500s"),
    splitDriftS: baselineOf("splitDriftS"),
    spmMid: baselineOf("spmMid"),
    dpsMid: baselineOf("dpsMid"),
  };
  const deltas: MetricDeltas = {
    pacePer500s: delta(metrics.pacePer500s, baseline.pacePer500s),
    splitDriftS: delta(metrics.splitDriftS, baseline.splitDriftS),
    spmMid: delta(metrics.spmMid, baseline.spmMid),
    dpsMid: delta(metrics.dpsMid, baseline.dpsMid),
  };

  const labels: AnalysisLabel[] = [];
  const dpsClearDrop = deltas.dpsMid !== null && deltas.dpsMid <= DPS_CLEAR_DROP_M;
  if (deltas.dpsMid !== null && deltas.dpsMid >= DPS_HUGE_IMPROVEMENT_M) labels.push("dpsHugeImprovement");
  if (dpsClearDrop) labels.push("dpsClearDrop");
  if (deltas.pacePer500s !== null && deltas.pacePer500s <= PACE_GOOD_IMPROVEMENT_S) labels.push("paceGoodImprovement");
  if (dpsClearDrop && deltas.pacePer500s !== null && deltas.pacePer500s < 0) {
    labels.push("techniqueLimitingEfficiency");
  }

  return { baselineCount: baselineMetrics.length, metrics, baseline, deltas, labels };
}
