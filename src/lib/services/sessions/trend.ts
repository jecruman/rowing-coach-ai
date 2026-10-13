import { isOrderedBefore, round1, sessionMetrics, type SessionMetrics } from "@/lib/services/coaching/metrics";
import { SessionTypeSchema, type SessionType } from "@/lib/services/coaching/schema";
import type { RowingSession } from "@/types";

/** Most recent sessions shown in one trend. */
export const TREND_SIZE = 20;

export const TREND_METRIC_IDS = ["pace", "dps", "spm", "drift"] as const;
export type TrendMetric = (typeof TREND_METRIC_IDS)[number];

export interface TrendMetricDefinition {
  /** The `sessionMetrics()` value plotted. */
  key: keyof SessionMetrics;
  label: string;
  /** Unit of the value and of the change ("s" for pace: the change is in seconds per 500 m). */
  unit: string;
  /** `sessions` column that must be non-null for the metric to exist; null when every session has it. */
  requiredColumn: "dps_min" | "spm_min" | "splits_s" | null;
  /** Only water sessions have the metric. */
  waterOnly: boolean;
  /** Lower is better (faster), so the chart puts lower values higher. */
  invertAxis: boolean;
}

export const TREND_METRICS: Record<TrendMetric, TrendMetricDefinition> = {
  pace: { key: "pacePer500s", label: "Pace", unit: "s", requiredColumn: null, waterOnly: false, invertAxis: true },
  dps: { key: "dpsMid", label: "DPS", unit: "m", requiredColumn: "dps_min", waterOnly: true, invertAxis: false },
  spm: {
    key: "spmMid",
    label: "Stroke rate",
    unit: "spm",
    requiredColumn: "spm_min",
    waterOnly: false,
    invertAxis: false,
  },
  drift: {
    key: "splitDriftS",
    label: "Split drift",
    unit: "s",
    requiredColumn: "splits_s",
    waterOnly: false,
    invertAxis: false,
  },
};

function isTrendMetric(value: string | null): value is TrendMetric {
  return value !== null && (TREND_METRIC_IDS as readonly string[]).includes(value);
}

export interface TrendQuery {
  metric: TrendMetric;
  type: SessionType;
}

/**
 * The trend to show for `?metric=&type=`. Missing/invalid metric → pace; missing/invalid type → the latest session's
 * type, erg when there is none; a water-only metric forces water.
 */
export function resolveTrendQuery(params: URLSearchParams, latestType: SessionType | null): TrendQuery {
  const rawMetric = params.get("metric");
  const metric: TrendMetric = isTrendMetric(rawMetric) ? rawMetric : "pace";
  const parsedType = SessionTypeSchema.safeParse(params.get("type"));
  const type: SessionType = TREND_METRICS[metric].waterOnly
    ? "water"
    : parsedType.success
      ? parsedType.data
      : (latestType ?? "erg");
  return { metric, type };
}

/** Signed number with one decimal at most: +1.5, −0.3, ±0. */
export function signed(value: number): string {
  if (value === 0) return "±0";
  const text = String(Math.abs(value));
  return value > 0 ? `+${text}` : `−${text}`;
}

export interface TrendPoint {
  sessionId: string;
  rowedOn: string;
  value: number;
  /** The session's stroke-rate midpoint (shown next to DPS); null when not logged. */
  spmMid: number | null;
}

export interface Trend {
  /** Oldest → newest, at most `TREND_SIZE`. */
  points: TrendPoint[];
  /** Latest minus first value, rounded to 0.1; null with fewer than 2 points. */
  change: number | null;
}

/**
 * Chart points for `metric` from sessions of `type` that have it: the `TREND_SIZE` newest in the agreed order
 * (`rowed_on`, then `created_at`), returned oldest → newest. Values come from `sessionMetrics()`.
 */
export function buildTrend(sessions: readonly RowingSession[], metric: TrendMetric, type: SessionType): Trend {
  const { key } = TREND_METRICS[metric];
  const points = sessions
    .filter((session) => session.type === type)
    .sort((a, b) => (isOrderedBefore(a, b) ? -1 : isOrderedBefore(b, a) ? 1 : 0))
    .flatMap((session): TrendPoint[] => {
      const metrics = sessionMetrics(session);
      const value = metrics[key];
      return value === null ? [] : [{ sessionId: session.id, rowedOn: session.rowedOn, value, spmMid: metrics.spmMid }];
    })
    .slice(-TREND_SIZE);

  const change = points.length >= 2 ? round1(points[points.length - 1].value - points[0].value) : null;
  return { points, change };
}

export interface TrendChartOptions {
  width: number;
  height: number;
  /** Space kept free on every side, in the same units as width/height. */
  padding: number;
  /** Put lower values higher (pace: lower is faster). */
  invert: boolean;
}

export interface TrendChartGeometry {
  /** SVG `<polyline points>` value, one `x,y` pair per value in order. */
  points: string;
  /** Smallest and largest value plotted (the y-axis range); 0 when there are no values. */
  yMin: number;
  yMax: number;
}

/**
 * Lays out `values` left → right across the padded area. A flat series (min = max) is drawn at mid-height;
 * a single value sits at the horizontal centre.
 */
export function trendChartGeometry(values: readonly number[], options: TrendChartOptions): TrendChartGeometry {
  if (values.length === 0) return { points: "", yMin: 0, yMax: 0 };
  const { width, height, padding, invert } = options;
  const yMin = Math.min(...values);
  const yMax = Math.max(...values);
  const plotWidth = width - 2 * padding;
  const plotHeight = height - 2 * padding;

  const points = values.map((value, index) => {
    const x = values.length === 1 ? width / 2 : padding + (index * plotWidth) / (values.length - 1);
    let y = height / 2;
    if (yMax > yMin) {
      const share = (value - yMin) / (yMax - yMin);
      y = invert ? padding + share * plotHeight : height - padding - share * plotHeight;
    }
    return `${String(round1(x))},${String(round1(y))}`;
  });
  return { points: points.join(" "), yMin, yMax };
}
