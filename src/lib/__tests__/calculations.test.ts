import { describe, expect, it } from "vitest";
import {
  ACTIVITY_LABELS_CS,
  ACTIVITY_MULTIPLIERS,
  TIME_SLOT_LABELS_CS,
  calculateActivityBurnedKcal,
  calculateAge,
  calculateBaseExpenditure,
  calculateBmr,
  calculateMacroTargets,
  computeRunningTemplateAverages,
  detectTimeSlotForDate,
  getTodayDateString,
  shiftDateString,
} from "../calculations";

describe("constants and Czech labels", () => {
  it("exports expected activity multipliers and Czech labels", () => {
    expect(ACTIVITY_MULTIPLIERS).toEqual({
      sedentary: 1.2,
      light: 1.35,
      moderate: 1.5,
      active: 1.7,
    });

    for (const key of ["sedentary", "light", "moderate", "active"] as const) {
      expect(ACTIVITY_LABELS_CS[key].label.length).toBeGreaterThan(3);
      expect(ACTIVITY_LABELS_CS[key].description.length).toBeGreaterThan(10);
    }

    expect(TIME_SLOT_LABELS_CS).toEqual({
      morning: "Snídaně",
      lunch: "Oběd",
      snack: "Svačina",
      evening: "Večeře",
      anytime: "Kdykoliv",
    });
  });
});

describe("calculateAge & calculateBmr (Mifflin-St Jeor)", () => {
  it("calculates age with explicit referenceYear and clamps minimum age to 10", () => {
    expect(calculateAge(1994, 2026)).toBe(32);
    expect(calculateAge(2022, 2026)).toBe(10);
    expect(calculateAge(2030, 2026)).toBe(10);
    expect(calculateAge(1990)).toBeGreaterThanOrEqual(35);
  });

  it("calculates male BMR accurately", () => {
    // 10 * 80 + 6.25 * 180 - 5 * 30 + 5 = 800 + 1125 - 150 + 5 = 1780
    expect(
      calculateBmr({
        sex: "male",
        weightKg: 80,
        heightCm: 180,
        birthYear: 1996,
        currentYear: 2026,
      }),
    ).toBe(1780);
  });

  it("calculates female BMR accurately", () => {
    // 10 * 65 + 6.25 * 168 - 5 * 30 - 161 = 650 + 1050 - 150 - 161 = 1389
    expect(
      calculateBmr({
        sex: "female",
        weightKg: 65,
        heightCm: 168,
        birthYear: 1996,
        currentYear: 2026,
      }),
    ).toBe(1389);
  });

  it("rounds fractional Mifflin-St Jeor values cleanly", () => {
    // 10 * 82.5 + 6.25 * 181 - 5 * 35 + 5 = 825 + 1131.25 - 175 + 5 = 1786.25 -> 1786
    expect(
      calculateBmr({
        sex: "male",
        weightKg: 82.5,
        heightCm: 181,
        birthYear: 1991,
        currentYear: 2026,
      }),
    ).toBe(1786);
  });
});

describe("calculateBaseExpenditure", () => {
  it("applies multiplier and rounds for all activity levels", () => {
    expect(calculateBaseExpenditure(1780, "sedentary")).toEqual({
      multiplier: 1.2,
      baseExpenditureKcal: 2136,
    });
    expect(calculateBaseExpenditure(1780, "light")).toEqual({
      multiplier: 1.35,
      baseExpenditureKcal: 2403,
    });
    expect(calculateBaseExpenditure(1780, "moderate")).toEqual({
      multiplier: 1.5,
      baseExpenditureKcal: 2670,
    });
    expect(calculateBaseExpenditure(1780, "active")).toEqual({
      multiplier: 1.7,
      baseExpenditureKcal: 3026,
    });
  });

  it("rounds fractional expenditure results", () => {
    // 1389 * 1.35 = 1875.15 -> 1875
    expect(calculateBaseExpenditure(1389, "light")).toEqual({
      multiplier: 1.35,
      baseExpenditureKcal: 1875,
    });
  });
});

describe("calculateMacroTargets", () => {
  it("computes macro targets for a weight-loss calorie deficit", () => {
    const result = calculateMacroTargets({
      weightKg: 80,
      baseExpenditureKcal: 2400,
      targetDeficitKcal: -400,
    });

    expect(result).toEqual({
      targetIntakeKcal: 2000,
      proteinTargetG: 144, // 80 * 1.8 = 144g (576 kcal)
      fatTargetG: 72, // 80 * 0.9 = 72g (648 kcal)
      carbsTargetG: 194, // (2000 - 576 - 648) / 4 = 194g
      fiberTargetG: 30,
    });
  });

  it("computes macro targets for maintenance (0 kcal offset)", () => {
    const result = calculateMacroTargets({
      weightKg: 80,
      baseExpenditureKcal: 2400,
      targetDeficitKcal: 0,
    });

    expect(result).toEqual({
      targetIntakeKcal: 2400,
      proteinTargetG: 144,
      fatTargetG: 72,
      carbsTargetG: 294, // (2400 - 1224) / 4 = 294g
      fiberTargetG: 30,
    });
  });

  it("computes macro targets for muscle-gain surplus (+300 kcal)", () => {
    const result = calculateMacroTargets({
      weightKg: 80,
      baseExpenditureKcal: 2400,
      targetDeficitKcal: 300,
    });

    expect(result).toEqual({
      targetIntakeKcal: 2700,
      proteinTargetG: 144,
      fatTargetG: 72,
      carbsTargetG: 369, // (2700 - 1224) / 4 = 369g
      fiberTargetG: 30,
    });
  });

  it("clamps targetIntakeKcal to >= 1200 and carbsTargetG to >= 50", () => {
    const result = calculateMacroTargets({
      weightKg: 95,
      baseExpenditureKcal: 1800,
      targetDeficitKcal: -900,
    });

    expect(result.targetIntakeKcal).toBe(1200);
    expect(result.proteinTargetG).toBe(171);
    expect(result.fatTargetG).toBe(86);
    expect(result.carbsTargetG).toBe(50);
    expect(result.fiberTargetG).toBe(30);
  });
});

describe("calculateActivityBurnedKcal (Net MET & BMR-corrected resting rate)", () => {
  it("calculates net active calorie burn without double-counting 1.2 MET sedentary baseline", () => {
    // 100 kg user with BMR 1954 kcal/day (81.4167 kcal/h), 120 min MTB (MET 6.5):
    // netMet = 6.5 - 1.2 = 5.3; 5.3 * (1954 / 24) * 2 = 863 kcal (~3 611 kJ, NOT 1 700 kcal / 7 113 kJ!)
    expect(
      calculateActivityBurnedKcal({
        metValue: 6.5,
        weightKg: 100,
        durationMinutes: 120,
        bmrKcal: 1954,
      }),
    ).toBe(863);

    // Without explicit bmrKcal, uses Mifflin-corrected resting rate (10 * weightKg + 950) / 24:
    // 80 kg -> 1750 / 24 = 72.9167 kcal/h; netMet = 9.8 - 1.2 = 8.6; 8.6 * 72.9167 * 0.75 = 470 kcal
    expect(
      calculateActivityBurnedKcal({
        metValue: 9.8,
        weightKg: 80,
        durationMinutes: 45,
      }),
    ).toBe(470);
  });

  it("returns 0 for zero or negative inputs", () => {
    expect(
      calculateActivityBurnedKcal({
        metValue: 0,
        weightKg: 80,
        durationMinutes: 30,
      }),
    ).toBe(0);
    expect(
      calculateActivityBurnedKcal({
        metValue: 6,
        weightKg: 80,
        durationMinutes: -20,
      }),
    ).toBe(0);
    expect(
      calculateActivityBurnedKcal({
        metValue: -4,
        weightKg: 80,
        durationMinutes: -30,
      }),
    ).toBe(0);
  });
});

describe("computeRunningTemplateAverages", () => {
  it("updates running weighted averages and promotes at 3rd occurrence", () => {
    // 1st -> 2nd occurrence: not yet promoted
    const second = computeRunningTemplateAverages(
      {
        occurrenceCount: 1,
        avgKcal: 500,
        avgProteinG: 30,
        avgCarbsG: 50,
        avgFatG: 18,
        avgFiberG: 6,
      },
      {
        kcal: 540,
        proteinG: 35,
        carbsG: 53,
        fatG: 20,
        fiberG: 7,
      },
    );

    expect(second).toEqual({
      occurrenceCount: 2,
      avgKcal: 520,
      avgProteinG: 32.5,
      avgCarbsG: 51.5,
      avgFatG: 19,
      avgFiberG: 6.5,
      shouldPromoteToQuickCheck: false,
    });

    // 2nd -> 3rd occurrence: promotes to quick check (occurrenceCount >= 3)
    const third = computeRunningTemplateAverages(second, {
      kcal: 560,
      proteinG: 33,
      carbsG: 55,
      fatG: 19.5,
      fiberG: 8,
    });

    // Kcal: (2 * 520 + 560) / 3 = 1600 / 3 = 533.33 -> 533
    // Protein: (2 * 32.5 + 33) / 3 = 98 / 3 = 32.666... -> 32.7
    // Carbs: (2 * 51.5 + 55) / 3 = 158 / 3 = 52.666... -> 52.7
    // Fat: (2 * 19 + 19.5) / 3 = 57.5 / 3 = 19.166... -> 19.2
    // Fiber: (2 * 6.5 + 8) / 3 = 21 / 3 = 7
    expect(third).toEqual({
      occurrenceCount: 3,
      avgKcal: 533,
      avgProteinG: 32.7,
      avgCarbsG: 52.7,
      avgFatG: 19.2,
      avgFiberG: 7,
      shouldPromoteToQuickCheck: true,
    });

    // 3rd -> 4th occurrence: stays promoted
    const fourth = computeRunningTemplateAverages(third, {
      kcal: 547,
      proteinG: 34,
      carbsG: 50,
      fatG: 18,
      fiberG: 6,
    });

    expect(fourth.occurrenceCount).toBe(4);
    expect(fourth.shouldPromoteToQuickCheck).toBe(true);
    expect(fourth.avgKcal).toBe(537); // (3 * 533 + 547) / 4 = 2146 / 4 = 536.5 -> 537
  });

  it("handles initial 0 occurrence count cleanly", () => {
    const first = computeRunningTemplateAverages(
      {
        occurrenceCount: 0,
        avgKcal: 0,
        avgProteinG: 0,
        avgCarbsG: 0,
        avgFatG: 0,
        avgFiberG: 0,
      },
      {
        kcal: 412.4,
        proteinG: 28.44,
        carbsG: 41.26,
        fatG: 12.05,
        fiberG: 5.55,
      },
    );

    expect(first).toEqual({
      occurrenceCount: 1,
      avgKcal: 412,
      avgProteinG: 28.4,
      avgCarbsG: 41.3,
      avgFatG: 12.1,
      avgFiberG: 5.6,
      shouldPromoteToQuickCheck: false,
    });
  });
});

describe("Prague date & time-slot helpers", () => {
  it("maps Europe/Prague hours to expected TimeSlot buckets (winter CET UTC+1)", () => {
    // 2026-01-15 is CET (UTC+1)
    expect(detectTimeSlotForDate(new Date("2026-01-14T23:15:00Z"))).toBe(
      "anytime",
    ); // 00:15 Prague
    expect(detectTimeSlotForDate(new Date("2026-01-15T03:59:00Z"))).toBe(
      "anytime",
    ); // 04:59 Prague
    expect(detectTimeSlotForDate(new Date("2026-01-15T04:00:00Z"))).toBe(
      "morning",
    ); // 05:00 Prague
    expect(detectTimeSlotForDate(new Date("2026-01-15T09:59:00Z"))).toBe(
      "morning",
    ); // 10:59 Prague
    expect(detectTimeSlotForDate(new Date("2026-01-15T10:00:00Z"))).toBe(
      "lunch",
    ); // 11:00 Prague
    expect(detectTimeSlotForDate(new Date("2026-01-15T13:30:00Z"))).toBe(
      "lunch",
    ); // 14:30 Prague
    expect(detectTimeSlotForDate(new Date("2026-01-15T14:00:00Z"))).toBe(
      "snack",
    ); // 15:00 Prague
    expect(detectTimeSlotForDate(new Date("2026-01-15T16:45:00Z"))).toBe(
      "snack",
    ); // 17:45 Prague
    expect(detectTimeSlotForDate(new Date("2026-01-15T17:00:00Z"))).toBe(
      "evening",
    ); // 18:00 Prague
    expect(detectTimeSlotForDate(new Date("2026-01-15T21:59:00Z"))).toBe(
      "evening",
    ); // 22:59 Prague
    expect(detectTimeSlotForDate(new Date("2026-01-15T22:00:00Z"))).toBe(
      "anytime",
    ); // 23:00 Prague
  });

  it("accounts for CEST daylight saving time (UTC+2) in summer", () => {
    // 2026-07-15 is CEST (UTC+2): 09:15 UTC = 11:15 Prague -> lunch
    expect(detectTimeSlotForDate(new Date("2026-07-15T09:15:00Z"))).toBe(
      "lunch",
    );
  });

  it("formats YYYY-MM-DD in Europe/Prague timezone including midnight crossover", () => {
    // 22:30 UTC in July is 00:30 next day in Prague (UTC+2)
    expect(getTodayDateString(new Date("2026-07-15T22:30:00Z"))).toBe(
      "2026-07-16",
    );
    // 22:30 UTC in January is 23:30 same day in Prague (UTC+1)
    expect(getTodayDateString(new Date("2026-01-15T22:30:00Z"))).toBe(
      "2026-01-15",
    );
    expect(getTodayDateString()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("shifts YYYY-MM-DD strings accurately across month, leap-year, year, and DST boundaries", () => {
    expect(shiftDateString("2026-11-07", 0)).toBe("2026-11-07");
    expect(shiftDateString("2026-11-07", -1)).toBe("2026-11-06");
    expect(shiftDateString("2026-11-07", 1)).toBe("2026-11-08");
    expect(shiftDateString("2024-02-28", 1)).toBe("2024-02-29"); // leap year
    expect(shiftDateString("2025-02-28", 1)).toBe("2025-03-01"); // non-leap year
    expect(shiftDateString("2026-01-01", -1)).toBe("2025-12-31");
    expect(shiftDateString("2026-12-31", 1)).toBe("2027-01-01");
    expect(shiftDateString("2026-03-29", 1)).toBe("2026-03-30"); // Europe DST spring forward

    expect(() => shiftDateString("07-11-2026", 1)).toThrow(/Invalid date string/);
  });
});
