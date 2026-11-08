import { describe, expect, it } from "vitest";
import { tryResolvePersonalPresetEntry } from "@/lib/presets";
import { parseEntryFallback } from "@/lib/agents/nutrition-parser";
import {
  convertFromKcal,
  convertToKcal,
  formatEnergy,
} from "@/lib/calculations";

describe("Radek personal meal shortcuts (presets) & kJ conversions", () => {
  it("resolves 'Protein', 'protein + inulin', and 'protein s inulinem' to Radek's shake with inulin (~1160 kJ / 277 kcal, 46 g B, 10 g fiber)", () => {
    for (const phrase of [
      "Protein",
      "shake",
      "protein + inulin",
      "protein s inulinem",
      "Protein + 10 g inulinu",
    ]) {
      const res = tryResolvePersonalPresetEntry(phrase, "anytime");
      expect(res).not.toBeNull();
      expect(res!.canonical_meal_name).toBe("Protein + inulin");
      expect(res!.items).toHaveLength(4);
      const totalKcal = res!.items.reduce((s, i) => s + i.kcal, 0);
      const totalProtein = res!.items.reduce((s, i) => s + i.protein_g, 0);
      const totalFiber = res!.items.reduce((s, i) => s + i.fiber_g, 0);
      expect(totalKcal).toBe(277);
      expect(convertFromKcal(totalKcal, "kj")).toBe(1159);
      expect(totalProtein).toBeCloseTo(46.0, 1);
      expect(totalFiber).toBeCloseTo(10.0, 1);
    }
  });

  it("resolves 'Kafe' to ice latté (101 kcal / ~423 kJ, 5 g B)", () => {
    const res = tryResolvePersonalPresetEntry("kafe", "morning");
    expect(res).not.toBeNull();
    expect(res!.canonical_meal_name).toBe("Kafe (ice latté)");
    expect(res!.items.reduce((s, i) => s + i.kcal, 0)).toBe(101);
    expect(res!.items.reduce((s, i) => s + i.protein_g, 0)).toBeCloseTo(5.0, 1);
  });

  it("resolves 'Müsli' (251 kcal, 11.6 g B, 3 g Vl) and 'Menší porce müsli' (161 kcal, 7.4 g B)", () => {
    const standard = tryResolvePersonalPresetEntry("Müsli", "morning");
    expect(standard).not.toBeNull();
    expect(standard!.canonical_meal_name).toBe("Müsli");
    expect(standard!.items.reduce((s, i) => s + i.kcal, 0)).toBe(251);
    expect(standard!.items.reduce((s, i) => s + i.protein_g, 0)).toBeCloseTo(
      11.6,
      1
    );
    expect(standard!.items.reduce((s, i) => s + i.fiber_g, 0)).toBeCloseTo(
      3.0,
      1
    );

    const smaller = tryResolvePersonalPresetEntry(
      "menší porce müsli",
      "morning"
    );
    expect(smaller).not.toBeNull();
    expect(smaller!.canonical_meal_name).toBe("Menší porce müsli");
    expect(smaller!.items.reduce((s, i) => s + i.kcal, 0)).toBe(161);
    expect(smaller!.items.reduce((s, i) => s + i.protein_g, 0)).toBeCloseTo(
      7.4,
      1
    );
  });

  it("resolves 'Kakao' (150 kcal, 7.5 g B) and 'Toast' (292 kcal, 17.8 g B, 3 g Vl)", () => {
    const kakao = tryResolvePersonalPresetEntry("Kakao", "morning");
    expect(kakao).not.toBeNull();
    expect(kakao!.items.reduce((s, i) => s + i.kcal, 0)).toBe(150);
    expect(kakao!.items.reduce((s, i) => s + i.protein_g, 0)).toBeCloseTo(
      7.5,
      1
    );

    const toast = tryResolvePersonalPresetEntry("Toast", "evening");
    expect(toast).not.toBeNull();
    expect(toast!.items).toHaveLength(4);
    expect(toast!.items.reduce((s, i) => s + i.kcal, 0)).toBe(292);
    expect(toast!.items.reduce((s, i) => s + i.protein_g, 0)).toBeCloseTo(
      17.8,
      1
    );
    expect(toast!.items.reduce((s, i) => s + i.fiber_g, 0)).toBeCloseTo(3.0, 1);
  });

  it("combines multiple personal shortcuts ('toast a kafe') and scales multipliers ('2x toast')", () => {
    const combo = tryResolvePersonalPresetEntry("toast a kafe", "morning");
    expect(combo).not.toBeNull();
    expect(combo!.items).toHaveLength(7);
    expect(combo!.items.reduce((s, i) => s + i.kcal, 0)).toBe(292 + 101);

    const doubleToast = tryResolvePersonalPresetEntry("2x toast", "evening");
    expect(doubleToast).not.toBeNull();
    expect(doubleToast!.items.reduce((s, i) => s + i.kcal, 0)).toBe(584);
  });

  it("passes modified shortcuts ('toast bez šunky') through to AI/fallback and converts explicit kJ in fallback", () => {
    expect(tryResolvePersonalPresetEntry("toast bez šunky", "evening")).toBeNull();

    const mixedFallback = parseEntryFallback({
      rawText: "toast a 30 min běh",
      userWeightKg: 80,
      fallbackTimeSlot: "evening",
    });
    const food = mixedFallback.items.find((i) => i.item_kind === "food");
    const sport = mixedFallback.items.find((i) => i.item_kind === "activity");
    expect(food?.canonical_name).toBe("Toast");
    expect(food?.kcal).toBe(292);
    expect(sport?.canonical_name).toBe("Běh");
    expect(sport?.burned_kcal).toBe(266);

    const customKjFood = parseEntryFallback({
      rawText: "fit tyčinka z etikety 837 kJ",
      userWeightKg: 80,
      fallbackTimeSlot: "snack",
    });
    expect(customKjFood.items[0].kcal).toBe(200);
  });

  it("formats kJ and kcal values accurately with Czech spacing and signs", () => {
    expect(convertFromKcal(500, "kj")).toBe(2092);
    expect(convertToKcal(2092, "kj")).toBe(500);
    expect(formatEnergy(292, "kj", { signed: true })).toBe("+1\u00A0222 kJ");
    expect(formatEnergy(-500, "kj")).toBe("−2\u00A0092 kJ");
    expect(formatEnergy(292, "kcal", { signed: true })).toBe("+292 kcal");
  });
});
