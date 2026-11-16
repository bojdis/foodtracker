import type {
  BloodPressureCategoryInfo,
  BodyMeasurementRow,
  DailySummaryRow,
} from "./types";
import { getBloodPressureCategory } from "./types";
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

export const KCAL_PER_KG_FAT = 7700;

export interface CalorieBalanceDayPoint {
  date: string;
  intakeKcal: number;
  burnedTotalKcal: number;
  netKcal: number;
  onTarget: boolean;
  cumulativeNetKcal: number;
  cumulativeFatKg: number;
}

export interface CalorieBalanceStatsSummary {
  points: CalorieBalanceDayPoint[];
  loggedDaysCount: number;
  excludedIncompleteDaysCount: number;
  todayExcludedAsIncomplete: boolean;
  totalNetKcal: number;
  totalIntakeKcal: number;
  totalBurnedKcal: number;
  /** Cumulative fat change equivalent in kg (negative = burned fat, 1 kg ≈ 7 700 kcal / 32 200 kJ) */
  burnedFatKg: number;
  /** Cumulative fat change equivalent in grams (negative = burned fat in g) */
  burnedFatGrams: number;
  avgNetKcal: number | null;
  avgIntakeKcal: number | null;
  avgBurnedKcal: number | null;
  daysOnTargetCount: number;
}

export interface FatVsWeightInsight {
  title: string;
  body: string;
  tone: "emerald" | "sky" | "teal";
}

export interface BloodPressureTrendPoint {
  date: string;
  sys: number;
  dia: number;
  pulse: number | null;
  movingAvgSys7d: number;
  movingAvgDia7d: number;
}

export interface BloodPressureStatsSummary {
  points: BloodPressureTrendPoint[];
  latestDate: string | null;
  latestSys: number | null;
  latestDia: number | null;
  latestPulse: number | null;
  latestCategory: BloodPressureCategoryInfo | null;
  avg7dSys: number | null;
  avg7dDia: number | null;
  avg7dPulse: number | null;
  avg7dCategory: BloodPressureCategoryInfo | null;
  startSys: number | null;
  startDia: number | null;
  deltaFromStartSys: number | null;
  deltaFromStartDia: number | null;
  weightCorrelationInsight: string | null;
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
 * Computes daily and cumulative caloric balance + burned fat equivalent (1 kg ≈ 7 700 kcal / 32 200 kJ)
 * strictly across days with credible logged intake so unlogged days, "1-coffee" partial days,
 * or an unfinished morning today never artificially inflate total deficit or burned fat.
 */
export function computeLoggedCalorieBalanceStats(
  dailySummaries: DailySummaryRow[],
  targetDeficitKcal: number,
  options?: {
    todayDate?: string;
    minCredibleIntakeKcal?: number;
  }
): CalorieBalanceStatsSummary {
  const nonEmpty = dailySummaries
    .filter((row) => row.entries_count > 0 && row.intake_kcal > 0)
    .slice()
    .sort((a, b) => a.log_date.localeCompare(b.log_date));

  if (nonEmpty.length === 0) {
    return {
      points: [],
      loggedDaysCount: 0,
      excludedIncompleteDaysCount: 0,
      todayExcludedAsIncomplete: false,
      totalNetKcal: 0,
      totalIntakeKcal: 0,
      totalBurnedKcal: 0,
      burnedFatKg: 0,
      burnedFatGrams: 0,
      avgNetKcal: null,
      avgIntakeKcal: null,
      avgBurnedKcal: null,
      daysOnTargetCount: 0,
    };
  }

  let excludedIncompleteDaysCount = 0;
  let todayExcludedAsIncomplete = false;

  const credibleRows = nonEmpty.filter((row) => {
    const intake = Math.round(row.intake_kcal);
    const baseExp = Math.round(row.base_expenditure_kcal || 2000);
    const baseTarget = Math.max(1200, baseExp + targetDeficitKcal);

    const isToday =
      options?.todayDate !== undefined && row.log_date === options.todayDate;

    const minThreshold =
      options?.minCredibleIntakeKcal ??
      (isToday
        ? Math.max(950, Math.round(baseTarget * 0.55))
        : Math.min(800, Math.max(550, Math.round(baseTarget * 0.45))));

    if (intake < minThreshold) {
      excludedIncompleteDaysCount++;
      if (isToday) {
        todayExcludedAsIncomplete = true;
      }
      return false;
    }
    return true;
  });

  if (credibleRows.length === 0) {
    return {
      points: [],
      loggedDaysCount: 0,
      excludedIncompleteDaysCount,
      todayExcludedAsIncomplete,
      totalNetKcal: 0,
      totalIntakeKcal: 0,
      totalBurnedKcal: 0,
      burnedFatKg: 0,
      burnedFatGrams: 0,
      avgNetKcal: null,
      avgIntakeKcal: null,
      avgBurnedKcal: null,
      daysOnTargetCount: 0,
    };
  }

  let runningNetKcal = 0;

  const points: CalorieBalanceDayPoint[] = credibleRows.map((row) => {
    const intakeKcal = Math.round(row.intake_kcal);
    const burnedTotalKcal = Math.round(row.burned_total_kcal);
    const netKcal = Math.round(row.net_kcal ?? intakeKcal - burnedTotalKcal);
    runningNetKcal += netKcal;

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
      cumulativeNetKcal: runningNetKcal,
      cumulativeFatKg: round2(runningNetKcal / KCAL_PER_KG_FAT),
    };
  });

  const sumNet = runningNetKcal;
  const sumIntake = points.reduce((acc, p) => acc + p.intakeKcal, 0);
  const sumBurned = points.reduce((acc, p) => acc + p.burnedTotalKcal, 0);
  const daysOnTargetCount = points.filter((p) => p.onTarget).length;
  const burnedFatKg = round2(sumNet / KCAL_PER_KG_FAT);
  const burnedFatGrams = Math.round((sumNet / KCAL_PER_KG_FAT) * 1000);

  return {
    points,
    loggedDaysCount: points.length,
    excludedIncompleteDaysCount,
    todayExcludedAsIncomplete,
    totalNetKcal: sumNet,
    totalIntakeKcal: sumIntake,
    totalBurnedKcal: sumBurned,
    burnedFatKg,
    burnedFatGrams,
    avgNetKcal: Math.round(sumNet / points.length),
    avgIntakeKcal: Math.round(sumIntake / points.length),
    avgBurnedKcal: Math.round(sumBurned / points.length),
    daysOnTargetCount,
  };
}

function formatKgCs(val: number, decimals = 2): string {
  return Math.abs(val)
    .toFixed(decimals)
    .replace(/0$/, "")
    .replace(/\.$/, "")
    .replace(".", ",");
}

/**
 * Compares cumulative fat burned from caloric deficit against actual scale weight change
 * to explain water retention ("whoosh effect"), glycogen depletion, or close alignment.
 */
export function computeFatVsWeightComparisonInsight(params: {
  burnedFatKg: number;
  loggedDaysCount: number;
  weightDeltaKg: number | null;
  weightPointsCount: number;
}): FatVsWeightInsight | null {
  const { burnedFatKg, loggedDaysCount, weightDeltaKg, weightPointsCount } =
    params;

  if (
    loggedDaysCount < 2 ||
    weightDeltaKg === null ||
    weightPointsCount < 2 ||
    burnedFatKg >= -0.08
  ) {
    return null;
  }

  const diffKg = round2(weightDeltaKg - burnedFatKg);
  const fatStr = `${formatKgCs(burnedFatKg, 2)} kg`;
  const weightSign = weightDeltaKg < 0 ? "−" : weightDeltaKg > 0 ? "+" : "";
  const weightStr = `${weightSign}${formatKgCs(weightDeltaKg, 1)} kg`;

  // Case C: Close alignment within ±0.4 kg
  if (Math.abs(diffKg) <= 0.4) {
    return {
      tone: "emerald",
      title: "Přesná shoda spáleného tuku a váhy",
      body: `Vypočtený úbytek čistého tuku z tvého deficitu (−${fatStr}) téměř přesně odpovídá změně na váze (${weightStr}). Tvůj odhad denního výdeje i zapisování jídel sedí na jedničku.`,
    };
  }

  // Case A: Scale dropped less than fat burned (water retention masking fat loss)
  if (diffKg > 0.4) {
    const waterHeldStr = `${formatKgCs(diffKg, 1)} kg`;
    return {
      tone: "sky",
      title: "Tuk mizí rychleji, než zatím ukazuje váha",
      body: `Podle kalorického deficitu už tělo spálilo přibližně ${fatStr} čistého tuku, zatímco váha ukazuje ${weightStr}. Rozdíl (~${waterHeldStr}) tvoří jen dočasně zadržená voda (ve svalech po tréninku, ze soli nebo trávení) — jakmile tělo vodu uvolní, váha skokově dožene tvůj deficit.`,
    };
  }

  // Case B: Scale dropped more than fat burned (initial glycogen + bound water release)
  const waterReleasedStr = `${formatKgCs(Math.abs(diffKg), 1)} kg`;
  return {
    tone: "teal",
    title: "Čistý spálený tuk + odplavení přebytečné vody",
    body: `Váha klesla o ${weightStr}, z toho přibližně −${fatStr} tvoří trvale spálený tuk z kalorického deficitu a ~${waterReleasedStr} uvolněný glykogen a navázaná voda. Až se odvodnění ustálí, tempo na váze plynule přejde na čisté spalování tuku.`,
  };
}

/**
 * Computes systolic/diastolic blood pressure trends, 7-day moving averages,
 * latest clinical ESC classification, and correlation with weight loss.
 */
export function computeBloodPressureStats(
  measurements: BodyMeasurementRow[]
): BloodPressureStatsSummary {
  const valid = measurements
    .filter(
      (
        row
      ): row is BodyMeasurementRow & {
        blood_pressure_sys: number;
        blood_pressure_dia: number;
      } =>
        typeof row.blood_pressure_sys === "number" &&
        Number.isFinite(row.blood_pressure_sys) &&
        typeof row.blood_pressure_dia === "number" &&
        Number.isFinite(row.blood_pressure_dia)
    )
    .slice()
    .sort((a, b) => a.measured_date.localeCompare(b.measured_date));

  if (valid.length === 0) {
    return {
      points: [],
      latestDate: null,
      latestSys: null,
      latestDia: null,
      latestPulse: null,
      latestCategory: null,
      avg7dSys: null,
      avg7dDia: null,
      avg7dPulse: null,
      avg7dCategory: null,
      startSys: null,
      startDia: null,
      deltaFromStartSys: null,
      deltaFromStartDia: null,
      weightCorrelationInsight: null,
    };
  }

  const points: BloodPressureTrendPoint[] = valid.map((row, idx) => {
    const windowStart = shiftDateString(row.measured_date, -6);
    let sumSys = 0;
    let sumDia = 0;
    let count = 0;
    for (let j = idx; j >= 0; j--) {
      if (valid[j].measured_date < windowStart) break;
      sumSys += valid[j].blood_pressure_sys;
      sumDia += valid[j].blood_pressure_dia;
      count++;
    }
    return {
      date: row.measured_date,
      sys: row.blood_pressure_sys,
      dia: row.blood_pressure_dia,
      pulse: row.pulse_bpm ?? null,
      movingAvgSys7d: round1(sumSys / count),
      movingAvgDia7d: round1(sumDia / count),
    };
  });

  const latest = valid[valid.length - 1];
  const first = valid[0];

  const latestCategory = getBloodPressureCategory(
    latest.blood_pressure_sys,
    latest.blood_pressure_dia
  );

  // Recent 7-day window average for top summary
  const last7dStart = shiftDateString(latest.measured_date, -6);
  const recent7dRows = valid.filter((r) => r.measured_date >= last7dStart);
  const avg7dSys = Math.round(
    recent7dRows.reduce((acc, r) => acc + r.blood_pressure_sys, 0) /
      recent7dRows.length
  );
  const avg7dDia = Math.round(
    recent7dRows.reduce((acc, r) => acc + r.blood_pressure_dia, 0) /
      recent7dRows.length
  );
  const rowsWithPulse = recent7dRows.filter(
    (r) => typeof r.pulse_bpm === "number" && r.pulse_bpm > 0
  );
  const avg7dPulse =
    rowsWithPulse.length > 0
      ? Math.round(
          rowsWithPulse.reduce((acc, r) => acc + (r.pulse_bpm ?? 0), 0) /
            rowsWithPulse.length
        )
      : null;

  const avg7dCategory = getBloodPressureCategory(avg7dSys, avg7dDia);

  const deltaFromStartSys = latest.blood_pressure_sys - first.blood_pressure_sys;
  const deltaFromStartDia = latest.blood_pressure_dia - first.blood_pressure_dia;

  // Weight correlation insight
  let weightCorrelationInsight: string | null = null;
  const weightRows = measurements
    .filter(
      (r): r is BodyMeasurementRow & { weight_kg: number } =>
        typeof r.weight_kg === "number" && Number.isFinite(r.weight_kg)
    )
    .sort((a, b) => a.measured_date.localeCompare(b.measured_date));

  if (weightRows.length >= 2 && valid.length >= 2) {
    const startW = weightRows[0].weight_kg;
    const latestW = weightRows[weightRows.length - 1].weight_kg;
    const weightLostKg = round1(startW - latestW);

    if (weightLostKg > 0.5 && deltaFromStartSys < 0) {
      weightCorrelationInsight = `Při poklesu hmotnosti o ${weightLostKg} kg klesl systolický tlak o ${Math.abs(deltaFromStartSys)} mmHg. Každý shozený kilogram znatelně ulehčuje práci srdci a cévám.`;
    } else if (latestCategory.category === "optimal") {
      weightCorrelationInsight =
        "Tvůj krevní tlak je v optimálním pásmu (< 120/80 mmHg). Výborná kardiovaskulární kondice!";
    }
  } else if (latestCategory.category === "optimal") {
    weightCorrelationInsight =
      "Tvůj krevní tlak je v optimálním pásmu (< 120/80 mmHg). Výborná kardiovaskulární kondice!";
  }

  return {
    points,
    latestDate: latest.measured_date,
    latestSys: latest.blood_pressure_sys,
    latestDia: latest.blood_pressure_dia,
    latestPulse: latest.pulse_bpm ?? null,
    latestCategory,
    avg7dSys,
    avg7dDia,
    avg7dPulse,
    avg7dCategory,
    startSys: first.blood_pressure_sys,
    startDia: first.blood_pressure_dia,
    deltaFromStartSys,
    deltaFromStartDia,
    weightCorrelationInsight,
  };
}
