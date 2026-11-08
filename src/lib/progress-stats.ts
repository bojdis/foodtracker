import type { BodyMeasurementRow, DailySummaryRow } from "./types";
import { shiftDateString } from "./calculations";

export interface WeightTrendPoint {
  date: string;
  weightKg: number;
  movingAvg7d: number;
}

export interface WeightStatsSummary {
  points: WeightTrendPoint[];
  latestDate: string | null;
  latestWeightKg: number | null;
  latestMovingAvgKg: number | null;
  startWeightKg: number | null;
  deltaFromStartKg: number | null;
  delta7dKg: number | null;
  /** Positive single-day water tick-up amount when 7d moving average is still trending down */
  waterFluctuationUpKg: number | null;
}

export type WhtrZone = "healthy" | "elevated" | "high";

export interface WaistTrendPoint {
  date: string;
  waistCm: number;
}

export interface WaistStatsSummary {
  points: WaistTrendPoint[];
  latestDate: string | null;
  latestWaistCm: number | null;
  startWaistCm: number | null;
  deltaFromStartCm: number | null;
  whtr: number | null;
  whtrZone: WhtrZone | null;
  whtrLabelCs: string | null;
}

export interface CalorieBalanceDayPoint {
  date: string;
  intakeKcal: number;
  burnedTotalKcal: number;
  netKcal: number;
  onTarget: boolean;
}

export interface CalorieBalanceStatsSummary {
  points: CalorieBalanceDayPoint[];
  loggedDaysCount: number;
  avgNetKcal: number | null;
  avgIntakeKcal: number | null;
  avgBurnedKcal: number | null;
  daysOnTargetCount: number;
}

function round1(val: number): number {
  return Math.round(val * 10) / 10;
}

function round2(val: number): number {
  return Math.round(val * 100) / 100;
}

/**
 * Computes raw daily weights alongside a true 7-day calendar window moving average,
 * plus motivational direction metrics and water-fluctuation reassurance detection.
 */
export function computeWeightTrendSeries(
  measurements: BodyMeasurementRow[]
): WeightStatsSummary {
  const valid = measurements
    .filter(
      (row): row is BodyMeasurementRow & { weight_kg: number } =>
        typeof row.weight_kg === "number" && Number.isFinite(row.weight_kg)
    )
    .slice()
    .sort((a, b) => a.measured_date.localeCompare(b.measured_date));

  if (valid.length === 0) {
    return {
      points: [],
      latestDate: null,
      latestWeightKg: null,
      latestMovingAvgKg: null,
      startWeightKg: null,
      deltaFromStartKg: null,
      delta7dKg: null,
      waterFluctuationUpKg: null,
    };
  }

  const points: WeightTrendPoint[] = valid.map((row, idx) => {
    const windowStart = shiftDateString(row.measured_date, -6);
    let sum = 0;
    let count = 0;
    for (let j = idx; j >= 0; j--) {
      if (valid[j].measured_date < windowStart) {
        break;
      }
      sum += valid[j].weight_kg;
      count++;
    }
    const movingAvg7d = count > 0 ? round1(sum / count) : round1(row.weight_kg);
    return {
      date: row.measured_date,
      weightKg: round1(row.weight_kg),
      movingAvg7d,
    };
  });

  const first = points[0];
  const latest = points[points.length - 1];
  const deltaFromStartKg =
    points.length >= 2 ? round1(latest.weightKg - first.weightKg) : 0;

  // Find measurement closest to 7 days before latest (at least 3 days earlier if available)
  const sevenDaysAgoTarget = shiftDateString(latest.date, -7);
  let refPoint7d: WeightTrendPoint | null = null;
  for (let i = points.length - 2; i >= 0; i--) {
    if (points[i].date <= sevenDaysAgoTarget) {
      refPoint7d = points[i];
      break;
    }
  }
  if (!refPoint7d && points.length >= 2) {
    refPoint7d = first;
  }

  const delta7dKg = refPoint7d
    ? round1(latest.movingAvg7d - refPoint7d.movingAvg7d)
    : null;

  // Anti-frustration check: latest raw weight ticked up slightly (+0.1 to +1.8 kg) over previous entry,
  // while 7-day moving average is still down vs earlier trend or start weight.
  let waterFluctuationUpKg: number | null = null;
  if (points.length >= 3) {
    const prev = points[points.length - 2];
    const tickUp = round1(latest.weightKg - prev.weightKg);
    const earlierAvg = points[Math.max(0, points.length - 4)].movingAvg7d;
    if (
      tickUp >= 0.1 &&
      tickUp <= 1.8 &&
      (latest.movingAvg7d < earlierAvg || latest.movingAvg7d < first.weightKg)
    ) {
      waterFluctuationUpKg = tickUp;
    }
  }

  return {
    points,
    latestDate: latest.date,
    latestWeightKg: latest.weightKg,
    latestMovingAvgKg: latest.movingAvg7d,
    startWeightKg: first.weightKg,
    deltaFromStartKg,
    delta7dKg,
    waterFluctuationUpKg,
  };
}

/**
 * Computes waist circumference trend and Waist-to-Height Ratio (WHtR) health zone.
 */
export function computeWaistStats(
  measurements: BodyMeasurementRow[],
  heightCm: number | null | undefined
): WaistStatsSummary {
  const valid = measurements
    .filter(
      (row): row is BodyMeasurementRow & { waist_cm: number } =>
        typeof row.waist_cm === "number" && Number.isFinite(row.waist_cm)
    )
    .slice()
    .sort((a, b) => a.measured_date.localeCompare(b.measured_date));

  if (valid.length === 0) {
    return {
      points: [],
      latestDate: null,
      latestWaistCm: null,
      startWaistCm: null,
      deltaFromStartCm: null,
      whtr: null,
      whtrZone: null,
      whtrLabelCs: null,
    };
  }

  const points: WaistTrendPoint[] = valid.map((row) => ({
    date: row.measured_date,
    waistCm: round1(row.waist_cm),
  }));

  const first = points[0];
  const latest = points[points.length - 1];
  const deltaFromStartCm =
    points.length >= 2 ? round1(latest.waistCm - first.waistCm) : 0;

  let whtr: number | null = null;
  let whtrZone: WhtrZone | null = null;
  let whtrLabelCs: string | null = null;

  if (typeof heightCm === "number" && heightCm >= 120) {
    whtr = round2(latest.waistCm / heightCm);
    if (whtr < 0.5) {
      whtrZone = "healthy";
      whtrLabelCs = "Zdravé pásmo (< 0,50)";
    } else if (whtr < 0.6) {
      whtrZone = "elevated";
      whtrLabelCs = "Cesta ke zdravému pasu (0,50–0,59)";
    } else {
      whtrZone = "high";
      whtrLabelCs = "Zvýšená zátěž (≥ 0,60)";
    }
  }

  return {
    points,
    latestDate: latest.date,
    latestWaistCm: latest.waistCm,
    startWaistCm: first.waistCm,
    deltaFromStartCm,
    whtr,
    whtrZone,
    whtrLabelCs,
  };
}

/**
 * Computes daily caloric balance strictly across days with actual logged entries (entries_count > 0
 * and non-zero intake) so unlogged days never distort the user's average deficit.
 */
export function computeLoggedCalorieBalanceStats(
  dailySummaries: DailySummaryRow[],
  targetDeficitKcal: number
): CalorieBalanceStatsSummary {
  const logged = dailySummaries
    .filter((row) => row.entries_count > 0 && row.intake_kcal > 0)
    .slice()
    .sort((a, b) => a.log_date.localeCompare(b.log_date));

  if (logged.length === 0) {
    return {
      points: [],
      loggedDaysCount: 0,
      avgNetKcal: null,
      avgIntakeKcal: null,
      avgBurnedKcal: null,
      daysOnTargetCount: 0,
    };
  }

  const points: CalorieBalanceDayPoint[] = logged.map((row) => {
    const intakeKcal = Math.round(row.intake_kcal);
    const burnedTotalKcal = Math.round(row.burned_total_kcal);
    const netKcal = Math.round(row.net_kcal ?? intakeKcal - burnedTotalKcal);

    // Tolerance +150 kcal for deficit/maintenance goals, -150 kcal for surplus goals
    const onTarget =
      targetDeficitKcal <= 0
        ? netKcal <= targetDeficitKcal + 150
        : netKcal >= targetDeficitKcal - 150;

    return {
      date: row.log_date,
      intakeKcal,
      burnedTotalKcal,
      netKcal,
      onTarget,
    };
  });

  const sumNet = points.reduce((acc, p) => acc + p.netKcal, 0);
  const sumIntake = points.reduce((acc, p) => acc + p.intakeKcal, 0);
  const sumBurned = points.reduce((acc, p) => acc + p.burnedTotalKcal, 0);
  const daysOnTargetCount = points.filter((p) => p.onTarget).length;

  return {
    points,
    loggedDaysCount: points.length,
    avgNetKcal: Math.round(sumNet / points.length),
    avgIntakeKcal: Math.round(sumIntake / points.length),
    avgBurnedKcal: Math.round(sumBurned / points.length),
    daysOnTargetCount,
  };
}
