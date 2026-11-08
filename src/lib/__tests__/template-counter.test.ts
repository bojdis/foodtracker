import { describe, expect, it } from "vitest";
import {
  computeActivityTemplateDayMinutes,
  computeMealTemplateDayCounts,
} from "../template-counter";
import type {
  ActivityTemplateRow,
  LogEntryWithItems,
  MealTemplateRow,
} from "../types";

const NOW = "2026-11-07T12:00:00Z";

function makeTemplate(
  overrides: Partial<MealTemplateRow> & { id: number; canonical_name: string }
): MealTemplateRow {
  return {
    user_id: "u-1",
    normalized_items_summary: "",
    typical_time_slot: "anytime",
    occurrence_count: 3,
    is_quick_check: true,
    is_hidden: false,
    avg_portion_grams: null,
    avg_kcal: 200,
    avg_protein_g: 10,
    avg_carbs_g: 20,
    avg_fat_g: 5,
    avg_fiber_g: 2,
    preset_notes: null,
    shortcut_aliases: [],
    template_items: [],
    embedding: null,
    last_eaten_at: NOW,
    created_at: NOW,
    updated_at: NOW,
    ...overrides,
  };
}

const RADEK_TEMPLATES: MealTemplateRow[] = [
  makeTemplate({
    id: 2,
    canonical_name: "Protein + inulin",
    avg_kcal: 277,
    shortcut_aliases: ["protein", "protein + inulin", "shake"],
    template_items: [
      { canonical_name: "Mléko polotučné", kcal: 93 },
      { canonical_name: "AMIX IsoPrime CFM", kcal: 170 },
      { canonical_name: "Amix creatine monohydrate", kcal: 0 },
      { canonical_name: "Inulin", kcal: 14 },
    ],
  }),
  makeTemplate({
    id: 3,
    canonical_name: "Kafe (ice latté)",
    avg_kcal: 102,
    shortcut_aliases: [
      "kafe",
      "latte",
      "latté",
      "ice latte",
      "ice latté",
      "ledové kafe",
      "ledová káva",
      "ledové latté",
      "caffe latte",
      "cafe latte",
    ],
    template_items: [
      { canonical_name: "Espresso", kcal: 2 },
      { canonical_name: "Cukr", kcal: 30 },
      { canonical_name: "Mléko polotučné", kcal: 69 },
    ],
  }),
  makeTemplate({
    id: 4,
    canonical_name: "Müsli",
    avg_kcal: 251,
    shortcut_aliases: ["müsli", "musli", "mysli"],
    template_items: [
      { canonical_name: "Emco Mysli Lehké a křehké – semínka a ořechy", kcal: 171 },
      { canonical_name: "Granko", kcal: 11 },
      { canonical_name: "Mléko polotučné", kcal: 69 },
    ],
  }),
  makeTemplate({
    id: 5,
    canonical_name: "Menší porce müsli",
    avg_kcal: 160,
    shortcut_aliases: ["menší porce müsli", "menší müsli", "mensi musli"],
    template_items: [
      { canonical_name: "Emco Mysli Lehké a křehké – semínka a ořechy", kcal: 107 },
      { canonical_name: "Granko", kcal: 7 },
      { canonical_name: "Mléko polotučné", kcal: 46 },
    ],
  }),
  makeTemplate({
    id: 6,
    canonical_name: "Kakao",
    avg_kcal: 151,
    shortcut_aliases: ["kakao", "granko"],
    template_items: [
      { canonical_name: "Mléko polotučné", kcal: 93 },
      { canonical_name: "Granko", kcal: 57 },
    ],
  }),
  makeTemplate({
    id: 7,
    canonical_name: "Toast",
    avg_kcal: 293,
    shortcut_aliases: ["toast", "toust", "toasty"],
    template_items: [
      { canonical_name: "Toastový celozrnný chléb", kcal: 120 },
      { canonical_name: "Gouda", kcal: 88 },
      { canonical_name: "Šunka", kcal: 43 },
      { canonical_name: "Olivový olej", kcal: 41 },
    ],
  }),
  makeTemplate({
    id: 8,
    canonical_name: "Omeleta, polévka a asijské rizoto",
    is_quick_check: false,
    avg_kcal: 2040,
    shortcut_aliases: [],
    // Realistic populated template_items from habit-detector (previously swallowed entry id=1!)
    template_items: [
      { canonical_name: "Vaječná omeleta", kcal: 283 },
      { canonical_name: "Ledová káva s mlékem a cukrem", kcal: 111 },
      { canonical_name: "Vietnamská káva se slazeným mlékem", kcal: 340 },
    ],
  }),
];

function makeEntry(
  overrides: Partial<LogEntryWithItems> & { id: number; raw_text: string }
): LogEntryWithItems {
  return {
    user_id: "u-1",
    log_date: "2026-11-07",
    logged_at: NOW,
    processed_at: NOW,
    status: "done",
    entry_type: "food",
    summary_title: overrides.raw_text,
    ai_notes: null,
    error_message: null,
    meal_template_id: null,
    activity_template_id: null,
    time_slot: "anytime",
    total_intake_kcal: 0,
    total_burned_kcal: 0,
    total_protein_g: 0,
    total_carbs_g: 0,
    total_fat_g: 0,
    total_fiber_g: 0,
    entry_items: [],
    ...overrides,
  };
}

describe("computeMealTemplateDayCounts", () => {
  it("detects Ice latte inside Radek's multi-meal text log without false-matching Vietnamská káva", () => {
    const entry1 = makeEntry({
      id: 1,
      raw_text:
        "Dneska zatím omeleta ze 3 vajec, plátek chleba se šunkou. Ice latte 150 ml mléka, 2 lžičky cukru. Vietnamská káva (80ml salko plus kafe).",
      meal_template_id: 8,
      entry_items: [
        {
          id: 101,
          user_id: "u-1",
          log_entry_id: 1,
          item_kind: "food",
          item_name: "Omeleta ze 3 vajec na tuku",
          canonical_name: "Vaječná omeleta",
          portion_grams: 180,
          duration_minutes: null,
          met_value: null,
          kcal: 283,
          burned_kcal: 0,
          protein_g: 21,
          carbs_g: 2,
          fat_g: 21,
          fiber_g: 0,
          confidence: 0.9,
          created_at: NOW,
        },
        {
          id: 102,
          user_id: "u-1",
          log_entry_id: 1,
          item_kind: "food",
          item_name: "Ice latte (150 ml mléka, 2 lžičky cukru)",
          canonical_name: "Ledová káva s mlékem a cukrem",
          portion_grams: 200,
          duration_minutes: null,
          met_value: null,
          kcal: 111,
          burned_kcal: 0,
          protein_g: 5,
          carbs_g: 17,
          fat_g: 2.3,
          fiber_g: 0,
          confidence: 0.95,
          created_at: NOW,
        },
        {
          id: 103,
          user_id: "u-1",
          log_entry_id: 1,
          item_kind: "food",
          item_name: "Vietnamská káva se Salkem (80 ml)",
          canonical_name: "Vietnamská káva se slazeným mlékem",
          portion_grams: 200,
          duration_minutes: null,
          met_value: null,
          kcal: 340,
          burned_kcal: 0,
          protein_g: 7,
          carbs_g: 56,
          fat_g: 9,
          fiber_g: 0,
          confidence: 0.9,
          created_at: NOW,
        },
      ],
    });

    const counts = computeMealTemplateDayCounts(RADEK_TEMPLATES, [entry1]);
    expect(counts.get(3)).toEqual({ totalCount: 1, removableCount: 0 });
    expect(counts.get(7)).toEqual({ totalCount: 0, removableCount: 0 });
  });

  it("counts both expanded presets in 'toast a kafe' and distinguishes Menší porce müsli from Müsli & Kakao", () => {
    const toastAndKafe = makeEntry({
      id: 10,
      raw_text: "toast a kafe",
      summary_title: "Toast + Kafe (ice latté)",
      entry_items: [
        { id: 1, user_id: "u-1", log_entry_id: 10, item_kind: "food", item_name: "Toastový celozrnný chléb", canonical_name: "Toastový celozrnný chléb", portion_grams: 50, duration_minutes: null, met_value: null, kcal: 120, burned_kcal: 0, protein_g: 4.5, carbs_g: 21, fat_g: 1.5, fiber_g: 3, confidence: 1, created_at: NOW },
        { id: 2, user_id: "u-1", log_entry_id: 10, item_kind: "food", item_name: "Gouda", canonical_name: "Gouda", portion_grams: 25, duration_minutes: null, met_value: null, kcal: 88, burned_kcal: 0, protein_g: 6.3, carbs_g: 0.5, fat_g: 6.9, fiber_g: 0, confidence: 1, created_at: NOW },
        { id: 3, user_id: "u-1", log_entry_id: 10, item_kind: "food", item_name: "Šunka", canonical_name: "Šunka", portion_grams: 40, duration_minutes: null, met_value: null, kcal: 43, burned_kcal: 0, protein_g: 7, carbs_g: 0.8, fat_g: 1.2, fiber_g: 0, confidence: 1, created_at: NOW },
        { id: 4, user_id: "u-1", log_entry_id: 10, item_kind: "food", item_name: "Olivový olej", canonical_name: "Olivový olej", portion_grams: 5, duration_minutes: null, met_value: null, kcal: 41, burned_kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 4.6, fiber_g: 0, confidence: 1, created_at: NOW },
        { id: 5, user_id: "u-1", log_entry_id: 10, item_kind: "food", item_name: "Espresso", canonical_name: "Espresso", portion_grams: 30, duration_minutes: null, met_value: null, kcal: 2, burned_kcal: 0, protein_g: 0, carbs_g: 0.4, fat_g: 0, fiber_g: 0, confidence: 1, created_at: NOW },
        { id: 6, user_id: "u-1", log_entry_id: 10, item_kind: "food", item_name: "Cukr", canonical_name: "Cukr", portion_grams: 7.5, duration_minutes: null, met_value: null, kcal: 30, burned_kcal: 0, protein_g: 0, carbs_g: 7.5, fat_g: 0, fiber_g: 0, confidence: 1, created_at: NOW },
        { id: 7, user_id: "u-1", log_entry_id: 10, item_kind: "food", item_name: "Mléko polotučné", canonical_name: "Mléko polotučné", portion_grams: 150, duration_minutes: null, met_value: null, kcal: 69, burned_kcal: 0, protein_g: 5, carbs_g: 7.2, fat_g: 2.3, fiber_g: 0, confidence: 1, created_at: NOW },
      ],
    });

    const smallMusli = makeEntry({
      id: 11,
      raw_text: "menší müsli",
      summary_title: "Menší porce müsli",
      entry_items: [
        { id: 8, user_id: "u-1", log_entry_id: 11, item_kind: "food", item_name: "Emco Mysli (25 g)", canonical_name: "Emco Mysli Lehké a křehké – semínka a ořechy", portion_grams: 25, duration_minutes: null, met_value: null, kcal: 107, burned_kcal: 0, protein_g: 4, carbs_g: 14, fat_g: 4, fiber_g: 2, confidence: 1, created_at: NOW },
        { id: 9, user_id: "u-1", log_entry_id: 11, item_kind: "food", item_name: "Granko", canonical_name: "Granko", portion_grams: 2, duration_minutes: null, met_value: null, kcal: 7, burned_kcal: 0, protein_g: 0.1, carbs_g: 1.5, fat_g: 0.1, fiber_g: 0, confidence: 1, created_at: NOW },
        { id: 10, user_id: "u-1", log_entry_id: 11, item_kind: "food", item_name: "Mléko polotučné", canonical_name: "Mléko polotučné", portion_grams: 100, duration_minutes: null, met_value: null, kcal: 46, burned_kcal: 0, protein_g: 3.3, carbs_g: 4.8, fat_g: 1.5, fiber_g: 0, confidence: 1, created_at: NOW },
      ],
    });

    const counts = computeMealTemplateDayCounts(RADEK_TEMPLATES, [
      toastAndKafe,
      smallMusli,
    ]);
    expect(counts.get(7)?.totalCount).toBe(1); // Toast
    expect(counts.get(3)?.totalCount).toBe(1); // Kafe
    expect(counts.get(5)?.totalCount).toBe(1); // Menší porce müsli
    expect(counts.get(4)?.totalCount).toBe(0); // Full Müsli NOT falsely counted
    expect(counts.get(6)?.totalCount).toBe(0); // Kakao NOT falsely counted from Granko + Mléko
  });

  it("updates counts immediately (0 ms) for pending text entries and multipliers like '2 kafe'", () => {
    const pendingEntry = makeEntry({
      id: 20,
      status: "pending",
      raw_text: "2 kafe a protein",
      entry_items: [],
    });
    const quickKafe = makeEntry({
      id: 21,
      status: "done",
      entry_type: "quick_check",
      raw_text: "Kafe (ice latté)",
      meal_template_id: 3,
      entry_items: [],
    });

    const counts = computeMealTemplateDayCounts(RADEK_TEMPLATES, [
      pendingEntry,
      quickKafe,
    ]);
    expect(counts.get(3)).toEqual({ totalCount: 3, removableCount: 1 });
    expect(counts.get(2)).toEqual({ totalCount: 1, removableCount: 0 });
  });
});

describe("computeActivityTemplateDayMinutes", () => {
  const SPORTS: ActivityTemplateRow[] = [
    {
      id: 1,
      user_id: "u-1",
      canonical_name: "Kolo",
      normalized_signature: "kol",
      icon_key: "bike",
      occurrence_count: 3,
      is_quick_check: true,
      is_hidden: false,
      default_minutes: 90,
      max_minutes: 240,
      default_intensity: "medium",
      met_light: 5,
      met_medium: 6.5,
      met_high: 8.2,
      last_done_at: NOW,
      created_at: NOW,
      updated_at: NOW,
    },
    {
      id: 2,
      user_id: "u-1",
      canonical_name: "Lezení",
      normalized_signature: "lezen",
      icon_key: "climb",
      occurrence_count: 3,
      is_quick_check: true,
      is_hidden: false,
      default_minutes: 75,
      max_minutes: 180,
      default_intensity: "medium",
      met_light: 4.2,
      met_medium: 5.6,
      met_high: 7.0,
      last_done_at: NOW,
      created_at: NOW,
      updated_at: NOW,
    },
  ];

  it("sums sport minutes from both pending and done text entries", () => {
    const pendingClimb = makeEntry({
      id: 30,
      status: "pending",
      raw_text: "90 min lezení na stěně",
      entry_items: [],
    });
    const doneBike = makeEntry({
      id: 31,
      status: "done",
      entry_type: "activity",
      raw_text: "dneska 2 hodiny horské kolo",
      entry_items: [
        {
          id: 201,
          user_id: "u-1",
          log_entry_id: 31,
          item_kind: "activity",
          item_name: "Horské kolo 2 hodiny",
          canonical_name: "Jízda na horském kole",
          portion_grams: null,
          duration_minutes: 120,
          met_value: 6.5,
          kcal: 0,
          burned_kcal: 863,
          protein_g: 0,
          carbs_g: 0,
          fat_g: 0,
          fiber_g: 0,
          confidence: 0.95,
          created_at: NOW,
        },
      ],
    });

    const mins = computeActivityTemplateDayMinutes(SPORTS, [
      pendingClimb,
      doneBike,
    ]);
    expect(mins.get(2)).toBe(90);
    expect(mins.get(1)).toBe(120);
  });
});
