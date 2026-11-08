import { describe, expect, it } from "vitest";
import {
  extractBodyMeasurementFromText,
  tryParseBodyMeasurementText,
} from "../body-parser";
import {
  computeLoggedCalorieBalanceStats,
  computeWaistStats,
  computeWeightTrendSeries,
} from "../progress-stats";
import type { BodyMeasurementRow, DailySummaryRow } from "../types";

function makeMeasurement(
  id: number,
  measured_date: string,
  weight_kg: number | null,
  waist_cm: number | null = null
): BodyMeasurementRow {
  return {
    id,
    user_id: "user-1",
    measured_date,
    weight_kg,
    waist_cm,
    notes: null,
    created_at: `${measured_date}T07:00:00Z`,
    updated_at: `${measured_date}T07:00:00Z`,
  };
}

function makeDailySummary(
  log_date: string,
  intake_kcal: number,
  burned_total_kcal: number,
  entries_count: number
): DailySummaryRow {
  return {
    id: 1,
    user_id: "user-1",
    log_date,
    intake_kcal,
    protein_g: 150,
    carbs_g: 180,
    fat_g: 60,
    fiber_g: 30,
    base_expenditure_kcal: 2300,
    burned_activity_kcal: Math.max(0, burned_total_kcal - 2300),
    burned_total_kcal,
    net_kcal: intake_kcal - burned_total_kcal,
    entries_count,
    pending_count: 0,
    updated_at: `${log_date}T20:00:00Z`,
  };
}

describe("extractBodyMeasurementFromText & tryParseBodyMeasurementText", () => {
  it("parses pure Czech weight and waist inputs with comma decimals", () => {
    expect(extractBodyMeasurementFromText("váha 99,4 kg, pas 96 cm")).toEqual({
      weight_kg: 99.4,
      waist_cm: 96,
      remainingText: "",
    });
    expect(tryParseBodyMeasurementText("váha 99,4 kg, pas 96 cm")).toEqual({
      weight_kg: 99.4,
      waist_cm: 96,
    });
  });

  it("parses standalone kg weight and waist-only inputs", () => {
    expect(extractBodyMeasurementFromText("dnes 98,8 kg")).toEqual({
      weight_kg: 98.8,
      waist_cm: null,
      remainingText: "",
    });
    expect(extractBodyMeasurementFromText("obvod pasu 95,5 cm")).toEqual({
      weight_kg: null,
      waist_cm: 95.5,
      remainingText: "",
    });
  });

  it("extracts measurements from mixed breakfast/sport entries while keeping food text intact", () => {
    expect(
      extractBodyMeasurementFromText("váha 99,2 kg, toast a kafe")
    ).toEqual({
      weight_kg: 99.2,
      waist_cm: null,
      remainingText: "toast a kafe",
    });
    expect(
      tryParseBodyMeasurementText("váha 99,2 kg, toast a kafe")
    ).toBeNull();

    expect(
      extractBodyMeasurementFromText("ráno váha 99.1 kg a pak 40 min běh")
    ).toEqual({
      weight_kg: 99.1,
      waist_cm: null,
      remainingText: "40 min běh",
    });
  });

  it("never misinterprets food weights, pasta, or gym weights as body measurements", () => {
    expect(extractBodyMeasurementFromText("kuřecí prsa 200 g a rýže 150 g")).toBeNull();
    expect(extractBodyMeasurementFromText("váha 180 g kuřecího masa")).toBeNull();
    expect(extractBodyMeasurementFromText("pasta carbonara 300 g")).toBeNull();
    expect(extractBodyMeasurementFromText("dřepy s váhou 80 kg")).toBeNull();
  });
});

describe("progress-stats calculations", () => {
  it("computes 7-day calendar moving average and detects water fluctuation reassurance", () => {
    const rows = [
      makeMeasurement(1, "2026-11-01", 100.0),
      makeMeasurement(2, "2026-11-03", 99.4),
      makeMeasurement(3, "2026-11-05", 98.9),
      // Slight single-day water bounce (+0.3 kg), while 7d moving avg is still well below 100.0
      makeMeasurement(4, "2026-11-07", 99.2),
    ];

    const res = computeWeightTrendSeries(rows);
    expect(res.latestWeightKg).toBe(99.2);
    expect(res.latestMovingAvgKg).toBe(99.4); // (100 + 99.4 + 98.9 + 99.2) / 4 = 99.375 -> 99.4
    expect(res.deltaFromStartKg).toBe(-0.8);
    expect(res.waterFluctuationUpKg).toBe(0.3);
  });

  it("computes waist delta and WHtR health ratio", () => {
    const rows = [
      makeMeasurement(1, "2026-11-01", 100.0, 98.0),
      makeMeasurement(2, "2026-11-07", 99.0, 94.0),
    ];

    const stats = computeWaistStats(rows, 191);
    expect(stats.latestWaistCm).toBe(94);
    expect(stats.deltaFromStartCm).toBe(-4);
    expect(stats.whtr).toBe(0.49); // 94 / 191 = 0.492 -> 0.49
    expect(stats.whtrZone).toBe("healthy");
  });

  it("excludes empty unlogged days when computing average daily calorie balance", () => {
    const summaries = [
      // Empty day (0 entries, 0 intake, -2300 net) MUST be ignored!
      makeDailySummary("2026-11-05", 0, 2300, 0),
      makeDailySummary("2026-11-06", 1850, 2350, 4), // -500
      makeDailySummary("2026-11-07", 1900, 2300, 3), // -400
    ];

    const stats = computeLoggedCalorieBalanceStats(summaries, -500);
    expect(stats.loggedDaysCount).toBe(2);
    expect(stats.avgNetKcal).toBe(-450);
    expect(stats.daysOnTargetCount).toBe(2);
  });
});
