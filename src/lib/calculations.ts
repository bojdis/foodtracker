import type { ActivityLevel, EnergyUnit, Sex, TimeSlot } from "./types";

export const PRAGUE_TIMEZONE = "Europe/Prague";
export const KCAL_TO_KJ = 4.184;

export function normalizeEnergyUnit(raw?: string | null): EnergyUnit {
  return raw === "kcal" ? "kcal" : "kj";
}

export function energyUnitLabel(unit: EnergyUnit): string {
  return unit === "kj" ? "kJ" : "kcal";
}

export function convertFromKcal(kcal: number, unit: EnergyUnit): number {
  if (!Number.isFinite(kcal)) return 0;
  return unit === "kj" ? Math.round(kcal * KCAL_TO_KJ) : Math.round(kcal);
}

export function convertToKcal(value: number, unit: EnergyUnit): number {
  if (!Number.isFinite(value)) return 0;
  return unit === "kj" ? Math.round(value / KCAL_TO_KJ) : Math.round(value);
}

function formatIntegerCs(val: number): string {
  const abs = Math.abs(Math.round(val));
  if (abs < 1000) return String(abs);
  return abs.toString().replace(/\B(?=(\d{3})+(?!\d))/g, "\u00A0");
}

export function formatEnergyValue(
  kcal: number,
  unit: EnergyUnit,
  options?: { signed?: boolean }
): string {
  const converted = convertFromKcal(kcal, unit);
  const absFormatted = formatIntegerCs(converted);
  if (converted < 0) {
    return `−${absFormatted}`;
  }
  if (options?.signed && converted > 0) {
    return `+${absFormatted}`;
  }
  return absFormatted;
}

export function formatEnergy(
  kcal: number,
  unit: EnergyUnit,
  options?: { signed?: boolean }
): string {
  return `${formatEnergyValue(kcal, unit, options)} ${energyUnitLabel(unit)}`;
}

export const ACTIVITY_MULTIPLIERS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.35,
  moderate: 1.5,
  active: 1.7,
};

export const ACTIVITY_LABELS_CS: Record<
  ActivityLevel,
  { label: string; description: string }
> = {
  sedentary: {
    label: "Sedavý režim",
    description:
      "Práce u počítače a minimum chůze během dne (tréninky se zapisují zvlášť).",
  },
  light: {
    label: "Lehký běžný pohyb",
    description:
      "Občasné pochůzky, nákupy a lehký denní pohyb (tréninky se zapisují zvlášť).",
  },
  moderate: {
    label: "Střední denní pohyb",
    description:
      "Práce ve stoje nebo pravidelná chůze po většinu dne (tréninky se zapisují zvlášť).",
  },
  active: {
    label: "Fyzicky náročná práce",
    description:
      "Manuální práce nebo velmi vysoký celodenní výdej mimo cvičení (tréninky se zapisují zvlášť).",
  },
};

export const TIME_SLOT_LABELS_CS: Record<TimeSlot, string> = {
  morning: "Snídaně",
  lunch: "Oběd",
  snack: "Svačina",
  evening: "Večeře",
  anytime: "Kdykoliv",
};

const pragueYearFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: PRAGUE_TIMEZONE,
  year: "numeric",
});

const pragueDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: PRAGUE_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const pragueHourFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: PRAGUE_TIMEZONE,
  hour: "2-digit",
  hourCycle: "h23",
});

function roundToOneDecimal(value: number): number {
  return Math.round((value + Number.EPSILON) * 10) / 10;
}

function getPragueYear(date: Date = new Date()): number {
  const parts = pragueYearFormatter.formatToParts(date);
  const yearPart = parts.find((part) => part.type === "year")?.value;
  return yearPart ? Number.parseInt(yearPart, 10) : date.getUTCFullYear();
}

export function calculateAge(birthYear: number, referenceYear?: number): number {
  const year = referenceYear ?? getPragueYear();
  return Math.max(10, Math.round(year - birthYear));
}

export function calculateBmr(params: {
  sex: Sex;
  weightKg: number;
  heightCm: number;
  birthYear: number;
  currentYear?: number;
}): number {
  const age = calculateAge(params.birthYear, params.currentYear);
  const base = 10 * params.weightKg + 6.25 * params.heightCm - 5 * age;
  const sexOffset = params.sex === "male" ? 5 : -161;
  return Math.round(base + sexOffset);
}

export function calculateBaseExpenditure(
  bmrKcal: number,
  activityLevel: ActivityLevel,
): { multiplier: number; baseExpenditureKcal: number } {
  const multiplier =
    ACTIVITY_MULTIPLIERS[activityLevel] ?? ACTIVITY_MULTIPLIERS.sedentary;
  const baseExpenditureKcal = Math.round(bmrKcal * multiplier);
  return { multiplier, baseExpenditureKcal };
}

export function calculateMacroTargets(params: {
  weightKg: number;
  baseExpenditureKcal: number;
  targetDeficitKcal: number;
}): {
  targetIntakeKcal: number;
  proteinTargetG: number;
  carbsTargetG: number;
  fatTargetG: number;
  fiberTargetG: number;
} {
  const targetIntakeKcal = Math.max(
    1200,
    Math.round(params.baseExpenditureKcal + params.targetDeficitKcal),
  );
  const proteinTargetG = Math.round(params.weightKg * 1.8);
  const fatTargetG = Math.round(params.weightKg * 0.9);
  const fiberTargetG = 30;
  const carbsTargetG = Math.max(
    50,
    Math.round((targetIntakeKcal - proteinTargetG * 4 - fatTargetG * 9) / 4),
  );

  return {
    targetIntakeKcal,
    proteinTargetG,
    carbsTargetG,
    fatTargetG,
    fiberTargetG,
  };
}

/**
 * Baseline sedentary MET already accounted for across all 24 hours in `base_expenditure_kcal` (BMR × 1.2).
 * Subtracting this yields Net Active Calories (Garmin/Apple Watch "Active Energy") without double-counting rest.
 */
export const BASELINE_REST_MET = 1.2;

export function calculateActivityBurnedKcal(params: {
  metValue: number;
  weightKg: number;
  durationMinutes: number;
  bmrKcal?: number;
}): number {
  if (
    params.metValue <= 0 ||
    params.weightKg <= 0 ||
    params.durationMinutes <= 0
  ) {
    return 0;
  }

  // True 1.0 MET hourly burn: exact BMR / 24h when available, otherwise Mifflin-corrected estimate
  // (avoids the +20–25% linear 1 kcal/kg/h overestimation in heavier individuals)
  const restingKcalPerHour =
    params.bmrKcal && Number.isFinite(params.bmrKcal) && params.bmrKcal > 0
      ? params.bmrKcal / 24
      : (10 * params.weightKg + 950) / 24;

  const netMet = Math.max(0.5, params.metValue - BASELINE_REST_MET);

  return Math.max(
    0,
    Math.round(netMet * restingKcalPerHour * (params.durationMinutes / 60)),
  );
}

export function computeRunningTemplateAverages(
  existing: {
    occurrenceCount: number;
    avgKcal: number;
    avgProteinG: number;
    avgCarbsG: number;
    avgFatG: number;
    avgFiberG: number;
  },
  incoming: {
    kcal: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
    fiberG: number;
  },
): {
  occurrenceCount: number;
  avgKcal: number;
  avgProteinG: number;
  avgCarbsG: number;
  avgFatG: number;
  avgFiberG: number;
  shouldPromoteToQuickCheck: boolean;
} {
  const prevCount = Math.max(0, existing.occurrenceCount);
  const occurrenceCount = prevCount + 1;

  const avgKcal = Math.round(
    (prevCount * existing.avgKcal + incoming.kcal) / occurrenceCount,
  );
  const avgProteinG = roundToOneDecimal(
    (prevCount * existing.avgProteinG + incoming.proteinG) / occurrenceCount,
  );
  const avgCarbsG = roundToOneDecimal(
    (prevCount * existing.avgCarbsG + incoming.carbsG) / occurrenceCount,
  );
  const avgFatG = roundToOneDecimal(
    (prevCount * existing.avgFatG + incoming.fatG) / occurrenceCount,
  );
  const avgFiberG = roundToOneDecimal(
    (prevCount * existing.avgFiberG + incoming.fiberG) / occurrenceCount,
  );

  return {
    occurrenceCount,
    avgKcal,
    avgProteinG,
    avgCarbsG,
    avgFatG,
    avgFiberG,
    shouldPromoteToQuickCheck: occurrenceCount >= 3,
  };
}

export function detectTimeSlotForDate(date: Date = new Date()): TimeSlot {
  const parts = pragueHourFormatter.formatToParts(date);
  const hourPart = parts.find((part) => part.type === "hour")?.value ?? "0";
  const hour = Number.parseInt(hourPart, 10) % 24;

  if (hour >= 5 && hour <= 10) {
    return "morning";
  }
  if (hour >= 11 && hour <= 14) {
    return "lunch";
  }
  if (hour >= 15 && hour <= 17) {
    return "snack";
  }
  if (hour >= 18 && hour <= 22) {
    return "evening";
  }
  return "anytime";
}

export function getTodayDateString(date: Date = new Date()): string {
  const parts = pragueDateFormatter.formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value ?? "1970";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

export function shiftDateString(dateStr: string, deltaDays: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!match) {
    throw new Error(`Invalid date string "${dateStr}". Expected YYYY-MM-DD.`);
  }

  const year = Number.parseInt(match[1], 10);
  const month = Number.parseInt(match[2], 10);
  const day = Number.parseInt(match[3], 10);

  const shifted = new Date(
    Date.UTC(year, month - 1, day + Math.trunc(deltaDays)),
  );

  const outYear = String(shifted.getUTCFullYear()).padStart(4, "0");
  const outMonth = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const outDay = String(shifted.getUTCDate()).padStart(2, "0");

  return `${outYear}-${outMonth}-${outDay}`;
}
