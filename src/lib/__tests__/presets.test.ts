import { describe, expect, it } from "vitest";
import {
  buildPersonalPresetsSystemSection,
  buildPresetsFromMealTemplates,
  resolveUserMealShortcutEntry,
  tryResolvePersonalPresetEntry,
} from "@/lib/presets";
import { parseEntryFallback } from "@/lib/agents/nutrition-parser";
import {
  convertFromKcal,
  convertToKcal,
  formatEnergy,
} from "@/lib/calculations";
import type { MealTemplateRow } from "@/lib/types";

function makeTemplate(
  overrides: Partial<MealTemplateRow> & { id: number; canonical_name: string }
): MealTemplateRow {
  const now = "2026-11-08T10:00:00.000Z";
  return {
    user_id: "user-a",
    normalized_items_summary: overrides.canonical_name,
    typical_time_slot: "anytime",
    occurrence_count: 3,
    is_quick_check: true,
    is_hidden: false,
    avg_portion_grams: null,
    avg_kcal: 100,
    avg_protein_g: 0,
    avg_carbs_g: 0,
    avg_fat_g: 0,
    avg_fiber_g: 0,
    shortcut_aliases: [],
    preset_notes: null,
    template_items: [],
    embedding: null,
    last_eaten_at: now,
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

const SAMPLE_USER_TEMPLATES: MealTemplateRow[] = [
  makeTemplate({
    id: 1,
    canonical_name: "Protein + inulin",
    typical_time_slot: "snack",
    avg_portion_grams: 258,
    avg_kcal: 277,
    avg_protein_g: 46,
    avg_carbs_g: 10.4,
    avg_fat_g: 3.8,
    avg_fiber_g: 10,
    shortcut_aliases: [
      "protein",
      "protein + inulin",
      "protein s inulinem",
      "protein inulin",
      "protein + 10 g inulinu",
      "protein shake",
      "shake",
    ],
    template_items: [
      {
        item_name: "Mléko polotučné (200 ml)",
        canonical_name: "Mléko polotučné",
        portion_grams: 200,
        kcal: 93,
        protein_g: 6.6,
        carbs_g: 9.6,
        fat_g: 3.0,
        fiber_g: 0.0,
      },
      {
        item_name: "AMIX IsoPrime CFM 1,25 dávky (43,75 g)",
        canonical_name: "AMIX IsoPrime CFM",
        portion_grams: 44,
        kcal: 170,
        protein_g: 39.4,
        carbs_g: 0.8,
        fat_g: 0.8,
        fiber_g: 0.0,
      },
      {
        item_name: "Amix creatine monohydrate (4 g)",
        canonical_name: "Amix creatine monohydrate",
        portion_grams: 4,
        kcal: 0,
        protein_g: 0.0,
        carbs_g: 0.0,
        fat_g: 0.0,
        fiber_g: 0.0,
      },
      {
        item_name: "Inulin (10 g)",
        canonical_name: "Inulin",
        portion_grams: 10,
        kcal: 14,
        protein_g: 0.0,
        carbs_g: 0.0,
        fat_g: 0.0,
        fiber_g: 10.0,
      },
    ],
  }),
  makeTemplate({
    id: 2,
    canonical_name: "Kafe (ice latté)",
    typical_time_slot: "morning",
    avg_portion_grams: 188,
    avg_kcal: 101,
    avg_protein_g: 5,
    avg_carbs_g: 15.1,
    avg_fat_g: 2.3,
    avg_fiber_g: 0,
    shortcut_aliases: ["kafe", "latte", "ice latte", "ledové kafe"],
    template_items: [
      {
        item_name: "Espresso (1 shot)",
        canonical_name: "Espresso",
        portion_grams: 30,
        kcal: 2,
        protein_g: 0,
        carbs_g: 0.4,
        fat_g: 0,
        fiber_g: 0,
      },
      {
        item_name: "Cukr 1,5 lžičky (7,5 g)",
        canonical_name: "Cukr",
        portion_grams: 8,
        kcal: 30,
        protein_g: 0,
        carbs_g: 7.5,
        fat_g: 0,
        fiber_g: 0,
      },
      {
        item_name: "Mléko polotučné (150 ml)",
        canonical_name: "Mléko polotučné",
        portion_grams: 150,
        kcal: 69,
        protein_g: 5.0,
        carbs_g: 7.2,
        fat_g: 2.3,
        fiber_g: 0,
      },
    ],
  }),
  makeTemplate({
    id: 3,
    canonical_name: "Müsli",
    typical_time_slot: "morning",
    avg_portion_grams: 193,
    avg_kcal: 251,
    avg_protein_g: 11.6,
    avg_carbs_g: 30.3,
    avg_fat_g: 8.4,
    avg_fiber_g: 3.0,
    shortcut_aliases: ["müsli", "musli", "mysli"],
  }),
  makeTemplate({
    id: 4,
    canonical_name: "Menší porce müsli",
    typical_time_slot: "morning",
    avg_portion_grams: 127,
    avg_kcal: 161,
    avg_protein_g: 7.4,
    avg_carbs_g: 19.3,
    avg_fat_g: 5.4,
    avg_fiber_g: 1.9,
    shortcut_aliases: ["menší porce müsli", "menší müsli", "malé müsli"],
  }),
  makeTemplate({
    id: 5,
    canonical_name: "Kakao",
    typical_time_slot: "morning",
    avg_portion_grams: 215,
    avg_kcal: 150,
    avg_protein_g: 7.5,
    avg_carbs_g: 21.3,
    avg_fat_g: 3.5,
    avg_fiber_g: 1.0,
    shortcut_aliases: ["kakao", "granko"],
  }),
  makeTemplate({
    id: 6,
    canonical_name: "Toast",
    typical_time_slot: "evening",
    avg_portion_grams: 120,
    avg_kcal: 292,
    avg_protein_g: 17.8,
    avg_carbs_g: 21.2,
    avg_fat_g: 14.3,
    avg_fiber_g: 3.0,
    shortcut_aliases: ["toast", "toust", "toasty", "tousty"],
    template_items: [
      {
        item_name: "Toastový celozrnný chléb 2 plátky (50 g)",
        canonical_name: "Toastový celozrnný chléb",
        portion_grams: 50,
        kcal: 120,
        protein_g: 4.5,
        carbs_g: 20.5,
        fat_g: 1.6,
        fiber_g: 3.0,
      },
      {
        item_name: "Gouda 1 plátek (25 g)",
        canonical_name: "Gouda",
        portion_grams: 25,
        kcal: 88,
        protein_g: 6.3,
        carbs_g: 0.3,
        fat_g: 6.9,
        fiber_g: 0,
      },
      {
        item_name: "Šunka 2 plátky (40 g)",
        canonical_name: "Šunka",
        portion_grams: 40,
        kcal: 43,
        protein_g: 7.0,
        carbs_g: 0.4,
        fat_g: 1.2,
        fiber_g: 0,
      },
      {
        item_name: "Olivový olej 1 lžička (5 ml)",
        canonical_name: "Olivový olej",
        portion_grams: 5,
        kcal: 41,
        protein_g: 0,
        carbs_g: 0,
        fat_g: 4.6,
        fiber_g: 0,
      },
    ],
  }),
];

const SAMPLE_PRESETS = buildPresetsFromMealTemplates(SAMPLE_USER_TEMPLATES);

describe("Per-user meal shortcuts (presets) & kJ conversions", () => {
  it("returns null for new users with no personal templates and emits no prompt section", () => {
    for (const phrase of ["Protein", "kafe", "Toast", "Müsli"]) {
      expect(resolveUserMealShortcutEntry(phrase, "anytime", [])).toBeNull();
    }
    expect(buildPersonalPresetsSystemSection([])).toBe("");
  });

  it("isolates favorite meal shortcuts per user", () => {
    const userBTemplates = [
      makeTemplate({
        id: 99,
        user_id: "user-b",
        canonical_name: "Černé espresso",
        typical_time_slot: "morning",
        avg_portion_grams: 40,
        avg_kcal: 5,
        avg_protein_g: 0.2,
        avg_carbs_g: 0.5,
        avg_fat_g: 0,
        avg_fiber_g: 0,
        shortcut_aliases: ["kafe", "espresso"],
      }),
    ];

    const resA = resolveUserMealShortcutEntry("kafe", "morning", SAMPLE_USER_TEMPLATES);
    const resB = resolveUserMealShortcutEntry("kafe", "morning", userBTemplates);

    expect(resA?.canonical_meal_name).toBe("Kafe (ice latté)");
    expect(resA?.items.reduce((s, i) => s + i.kcal, 0)).toBe(101);

    expect(resB?.canonical_meal_name).toBe("Černé espresso");
    expect(resB?.items.reduce((s, i) => s + i.kcal, 0)).toBe(5);
  });

  it("resolves user's protein + inulin shortcut variants accurately", () => {
    for (const phrase of [
      "Protein",
      "shake",
      "protein + inulin",
      "protein s inulinem",
      "Protein + 10 g inulinu",
    ]) {
      const res = tryResolvePersonalPresetEntry(phrase, "anytime", SAMPLE_PRESETS);
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

  it("resolves 'Kafe', 'Müsli', 'Menší porce müsli', 'Kakao', and 'Toast' from user templates", () => {
    const kafe = tryResolvePersonalPresetEntry("kafe", "morning", SAMPLE_PRESETS);
    expect(kafe).not.toBeNull();
    expect(kafe!.canonical_meal_name).toBe("Kafe (ice latté)");
    expect(kafe!.items.reduce((s, i) => s + i.kcal, 0)).toBe(101);

    const standard = tryResolvePersonalPresetEntry("Müsli", "morning", SAMPLE_PRESETS);
    expect(standard?.canonical_meal_name).toBe("Müsli");
    expect(standard?.items.reduce((s, i) => s + i.kcal, 0)).toBe(251);

    const smaller = tryResolvePersonalPresetEntry("menší porce müsli", "morning", SAMPLE_PRESETS);
    expect(smaller?.canonical_meal_name).toBe("Menší porce müsli");
    expect(smaller?.items.reduce((s, i) => s + i.kcal, 0)).toBe(161);

    const kakao = tryResolvePersonalPresetEntry("Kakao", "morning", SAMPLE_PRESETS);
    expect(kakao?.items.reduce((s, i) => s + i.kcal, 0)).toBe(150);

    const toast = tryResolvePersonalPresetEntry("Toast", "evening", SAMPLE_PRESETS);
    expect(toast?.items).toHaveLength(4);
    expect(toast?.items.reduce((s, i) => s + i.kcal, 0)).toBe(292);
  });

  it("combines multiple personal shortcuts ('toast a kafe') and scales multipliers ('2x toast')", () => {
    const combo = tryResolvePersonalPresetEntry("toast a kafe", "morning", SAMPLE_PRESETS);
    expect(combo).not.toBeNull();
    expect(combo!.items).toHaveLength(7);
    expect(combo!.items.reduce((s, i) => s + i.kcal, 0)).toBe(292 + 101);

    const doubleToast = tryResolvePersonalPresetEntry("2x toast", "evening", SAMPLE_PRESETS);
    expect(doubleToast).not.toBeNull();
    expect(doubleToast!.items.reduce((s, i) => s + i.kcal, 0)).toBe(584);
  });

  it("passes modified shortcuts ('toast bez šunky') through to AI/fallback and converts explicit kJ in fallback", () => {
    expect(
      tryResolvePersonalPresetEntry("toast bez šunky", "evening", SAMPLE_PRESETS)
    ).toBeNull();

    const mixedFallback = parseEntryFallback({
      rawText: "toast a 30 min běh",
      userWeightKg: 80,
      fallbackTimeSlot: "evening",
      userMealTemplates: SAMPLE_USER_TEMPLATES,
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
