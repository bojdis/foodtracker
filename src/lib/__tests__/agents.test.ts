import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  computeActivityBurnedKcal,
  FALLBACK_AI_NOTE,
  getGeminiKeyStatus,
  INVALID_GEMINI_KEY_NOTE,
  parseEntryFallback,
  parseEntryWithAgent,
} from "@/lib/agents/nutrition-parser";
import {
  detectAndPromoteRecurringActivity,
  detectAndPromoteRecurringMeal,
  normalizeMealSignature,
  resolveCanonicalActivityIdentity,
} from "@/lib/agents/habit-detector";
import { processLogEntryInBackground } from "@/lib/agents/orchestrator";
import * as backgroundModule from "@/lib/supabase/background";
import type { createBackgroundClient } from "@/lib/supabase/background";
import {
  CreateEntryInputSchema,
  type ActivityTemplateRow,
  type MealTemplateRow,
} from "@/lib/types";

describe("nutrition-parser fallback & MET calculations", () => {
  const originalApiKey = process.env.GEMINI_API_KEY;

  beforeEach(() => {
    delete process.env.GEMINI_API_KEY;
  });

  afterEach(() => {
    if (originalApiKey === undefined) {
      delete process.env.GEMINI_API_KEY;
    } else {
      process.env.GEMINI_API_KEY = originalApiKey;
    }
  });

  it("parses mixed Czech food + activity entry '2 rohlíky se šunkou a 40 min běh'", () => {
    const result = parseEntryFallback({
      rawText: "2 rohlíky se šunkou a 40 min běh",
      userWeightKg: 80,
      fallbackTimeSlot: "anytime",
    });

    expect(result.ai_notes).toBe(FALLBACK_AI_NOTE);
    expect(result.typical_time_slot).toBe("morning");

    const foodItems = result.items.filter((i) => i.item_kind === "food");
    const activityItems = result.items.filter((i) => i.item_kind === "activity");

    expect(foodItems).toHaveLength(2);
    expect(activityItems).toHaveLength(1);

    const rohlik = foodItems.find((i) => i.canonical_name.includes("Rohlík"));
    const sunka = foodItems.find((i) => i.canonical_name.includes("Šunka"));
    expect(rohlik).toBeDefined();
    expect(rohlik?.portion_grams).toBe(86); // 2 * 43g
    expect(rohlik?.kcal).toBe(260); // 2 * 130 kcal
    expect(sunka).toBeDefined();
    expect(sunka?.portion_grams).toBe(50);

    const beh = activityItems[0];
    expect(beh.canonical_name).toBe("Běh");
    expect(beh.duration_minutes).toBe(40);
    expect(beh.met_value).toBe(8.5);
    // Net MET (8.5 - 1.2 = 7.3) * ((10*80 + 950)/24 = 72.9167) * (40 / 60) = 355 kcal
    expect(beh.burned_kcal).toBe(355);
    expect(beh.kcal).toBe(0);

    // Canonical meal name should only contain food, not activity
    expect(result.canonical_meal_name).toContain("Rohlík");
    expect(result.canonical_meal_name).toContain("Šunka");
    expect(result.canonical_meal_name).not.toContain("Běh");
  });

  it("parses 'ovesná kaše s banánem' and Czech idioms like 'svíčková se šesti'", () => {
    const porridge = parseEntryFallback({
      rawText: "ovesná kaše s banánem",
      userWeightKg: 75,
      fallbackTimeSlot: "anytime",
    });

    expect(porridge.items).toHaveLength(2);
    expect(porridge.items.map((i) => i.canonical_name)).toEqual([
      "Ovesná kaše",
      "Banán",
    ]);
    expect(porridge.items.reduce((acc, i) => acc + i.kcal, 0)).toBeGreaterThan(350);

    const svickova = parseEntryFallback({
      rawText: "svíčková se šesti a pivo",
      userWeightKg: 85,
      fallbackTimeSlot: "lunch",
    });
    expect(svickova.items).toHaveLength(2);
    // Must treat 'se šesti' as 1 standard portion (450g, 780 kcal), NOT 6x!
    expect(svickova.items[0].portion_grams).toBe(450);
    expect(svickova.items[0].kcal).toBe(780);
    expect(svickova.items[1].canonical_name).toContain("Pivo");

    const omeleta3 = parseEntryFallback({
      rawText: "omeleta ze 3 vajec",
      userWeightKg: 85,
      fallbackTimeSlot: "morning",
    });
    expect(omeleta3.items).toHaveLength(1);
    expect(omeleta3.items[0].canonical_name).toBe("Vaječná omeleta");
    expect(omeleta3.items[0].portion_grams).toBe(175);
    expect(omeleta3.items[0].kcal).toBe(271);
    expect(omeleta3.items[0].protein_g).toBeGreaterThan(19);
    expect(omeleta3.items[0].carbs_g).toBeLessThan(3);
    expect(omeleta3.items[0].fat_g).toBeGreaterThan(18);

    const omeleta2 = parseEntryFallback({
      rawText: "vaječná omeleta ze 2 vajec",
      userWeightKg: 85,
      fallbackTimeSlot: "morning",
    });
    expect(omeleta2.items).toHaveLength(1);
    expect(omeleta2.items[0].canonical_name).toBe("Vaječná omeleta");
    expect(omeleta2.items[0].portion_grams).toBe(120);
    expect(omeleta2.items[0].kcal).toBe(189);
  });

  it("scales burned_kcal deterministically with userWeightKg, duration, and realistic MTB MET", () => {
    const lightRunner = parseEntryFallback({
      rawText: "40 min běh",
      userWeightKg: 60,
      fallbackTimeSlot: "anytime",
    });
    const heavyRunner = parseEntryFallback({
      rawText: "40 min běh",
      userWeightKg: 90,
      fallbackTimeSlot: "anytime",
    });

    expect(lightRunner.items[0].burned_kcal).toBe(314);
    expect(heavyRunner.items[0].burned_kcal).toBe(375);
    expect(lightRunner.items[0].burned_kcal).toBeLessThan(
      heavyRunner.items[0].burned_kcal
    );

    const mtb = parseEntryFallback({
      rawText: "dneska 2 hodiny horské kolo",
      userWeightKg: 100,
      userBmrKcal: 1954,
      fallbackTimeSlot: "anytime",
    });
    expect(mtb.items[0].canonical_name).toBe("Horské kolo");
    expect(mtb.items[0].met_value).toBe(6.5);
    expect(mtb.items[0].burned_kcal).toBe(863); // 3 611 kJ (instead of inflated 1 700 kcal / 7 113 kJ)

    const climbing = parseEntryFallback({
      rawText: "90 min lezení na stěně",
      userWeightKg: 100,
      userBmrKcal: 1954,
      fallbackTimeSlot: "evening",
    });
    expect(climbing.items[0].canonical_name).toBe("Lezení");
    expect(climbing.items[0].duration_minutes).toBe(90);
    expect(climbing.items[0].met_value).toBe(5.6);
    // Net MET (5.6 - 1.2 = 4.4) * (1954 / 24) * 1.5h = 537 kcal (~2 247 kJ)
    expect(climbing.items[0].burned_kcal).toBe(537);
  });

  it("uses local fallback gracefully in parseEntryWithAgent when GEMINI_API_KEY is blank", async () => {
    process.env.GEMINI_API_KEY = "   ";
    const res = await parseEntryWithAgent({
      rawText: "tvaroh s jablkem",
      userWeightKg: 82,
      fallbackTimeSlot: "snack",
    });

    expect(res.ai_notes).toBe(FALLBACK_AI_NOTE);
    expect(res.items).toHaveLength(2);
  });

  it("detects UUID GEMINI_API_KEY as invalid_format and falls back instead of throwing 400", async () => {
    process.env.GEMINI_API_KEY = "cad22800-1111-2222-3333-444455556666";
    expect(getGeminiKeyStatus()).toBe("invalid_format");

    const res = await parseEntryWithAgent({
      rawText:
        "Dneska zatím omeleta ze 3 vajec, plátek chleba se šunkou. Ice latte 150 ml mléka, 2 lžičky cukru. Talíř hrachové polévky s plátkem chleba. Porce asijského rizota s kuřecím masem. Vietnamská káva (80ml salko plus kafe). Hořká horká čokoláda 100ml.",
      userWeightKg: 100,
      fallbackTimeSlot: "evening",
    });

    expect(res.ai_notes).toBe(INVALID_GEMINI_KEY_NOTE);
    expect(res.items.length).toBeGreaterThanOrEqual(8);
    const totalKcal = res.items.reduce((sum, i) => sum + i.kcal, 0);
    expect(totalKcal).toBeGreaterThan(1500);
    expect(totalKcal).toBeLessThan(2600);
  });

  it("throws clear error for unknown food in fallback mode instead of fabricating fake calories", () => {
    expect(() =>
      parseEntryFallback({
        rawText: "lososový tatarák s avokádovou pěnou",
        userWeightKg: 80,
        fallbackTimeSlot: "evening",
      })
    ).toThrowError(/Jídlo nebylo rozpoznáno v lokálním offline slovníku/);
  });

  it("parses explicit calories for unknown food in fallback mode without fabricating macros", () => {
    const res = parseEntryFallback({
      rawText: "exotický raw snack 210 kcal",
      userWeightKg: 80,
      fallbackTimeSlot: "snack",
    });

    expect(res.items).toHaveLength(1);
    expect(res.items[0].kcal).toBe(210);
    expect(res.items[0].protein_g).toBe(0);
    expect(res.items[0].carbs_g).toBe(0);
  });

  it("throws clear error when image is supplied but GEMINI_API_KEY is missing", async () => {
    delete process.env.GEMINI_API_KEY;
    await expect(
      parseEntryWithAgent({
        rawText: "",
        imageBase64: "dGVzdC1pbWFnZQ==",
        imageMimeType: "image/jpeg",
        userWeightKg: 80,
        fallbackTimeSlot: "lunch",
      })
    ).rejects.toThrowError(/Pro analýzu fotek výživových štítků.*je vyžadován platný GEMINI_API_KEY/);
  });

  it("validates CreateEntryInputSchema with image and empty raw_text", () => {
    const validWithImage = CreateEntryInputSchema.safeParse({
      raw_text: "",
      image_base64: "data:image/jpeg;base64,123456789012345678901234567890123456789012345678901234567890",
      image_mime_type: "image/jpeg",
      log_date: "2026-11-08",
    });
    expect(validWithImage.success).toBe(true);

    const invalidEmpty = CreateEntryInputSchema.safeParse({
      raw_text: "",
      log_date: "2026-11-08",
    });
    expect(invalidEmpty.success).toBe(false);
  });
});

describe("habit-detector signature normalization & promotion", () => {
  it("normalizes Czech meal signatures invariantly to word order, diacritics, and case endings", () => {
    const sig1 = normalizeMealSignature("ovesná kaše s banánem");
    const sig2 = normalizeMealSignature("banán a ovesná kaše");
    const sig3 = normalizeMealSignature("Ovesna kase + banan!");

    expect(sig1).toBe("banan kas ovesn");
    expect(sig2).toBe(sig1);
    expect(sig3).toBe(sig1);

    const breadSig1 = normalizeMealSignature("2 rohlíky se šunkou");
    const breadSig2 = normalizeMealSignature("Šunka a rohlík");
    expect(breadSig1).toBe(breadSig2);
  });

  it("promotes a recurring meal to is_quick_check on its 3rd occurrence in fallback mode", async () => {
    delete process.env.GEMINI_API_KEY;

    const storedTemplates: MealTemplateRow[] = [];
    const linkedEntries = new Map<number, number>();
    let nextId = 1;

    const mockSupabase = {
      rpc: vi.fn().mockResolvedValue({ data: [], error: null }),
      from: vi.fn((table: string) => {
        if (table === "meal_templates") {
          return {
            select: () => ({
              eq: () => ({
                order: async () => ({ data: [...storedTemplates], error: null }),
                maybeSingle: async () => ({ data: null, error: null }),
              }),
            }),
            insert: (payload: Record<string, unknown>) => ({
              select: () => ({
                single: async () => {
                  const row: MealTemplateRow = {
                    id: nextId++,
                    user_id: String(payload.user_id),
                    canonical_name: String(payload.canonical_name),
                    normalized_items_summary: String(
                      payload.normalized_items_summary ?? ""
                    ),
                    typical_time_slot: String(
                      payload.typical_time_slot ?? "anytime"
                    ),
                    occurrence_count: Number(payload.occurrence_count ?? 1),
                    is_quick_check: Boolean(payload.is_quick_check),
                    is_hidden: false,
                    avg_portion_grams:
                      (payload.avg_portion_grams as number | null) ?? null,
                    avg_kcal: Number(payload.avg_kcal ?? 0),
                    avg_protein_g: Number(payload.avg_protein_g ?? 0),
                    avg_carbs_g: Number(payload.avg_carbs_g ?? 0),
                    avg_fat_g: Number(payload.avg_fat_g ?? 0),
                    avg_fiber_g: Number(payload.avg_fiber_g ?? 0),
                    preset_notes: null,
                    shortcut_aliases: [],
                    template_items: (payload.template_items ?? []) as MealTemplateRow["template_items"],
                    embedding: (payload.embedding as string | null) ?? null,
                    last_eaten_at: String(payload.last_eaten_at),
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                  };
                  storedTemplates.push(row);
                  return { data: { id: row.id }, error: null };
                },
              }),
            }),
            update: (patch: Partial<MealTemplateRow>) => ({
              eq: (_col1: string, idVal: number) => ({
                eq: async () => {
                  const idx = storedTemplates.findIndex((t) => t.id === idVal);
                  if (idx >= 0) {
                    storedTemplates[idx] = { ...storedTemplates[idx], ...patch };
                  }
                  return { error: null };
                },
              }),
            }),
          };
        }
        if (table === "log_entries") {
          return {
            update: (patch: { meal_template_id: number }) => ({
              eq: (_col1: string, entryIdVal: number) => ({
                eq: async () => {
                  linkedEntries.set(entryIdVal, patch.meal_template_id);
                  return { error: null };
                },
              }),
            }),
          };
        }
        throw new Error(`Unexpected table ${table}`);
      }),
    } as unknown as ReturnType<typeof createBackgroundClient>;

    const parsed1 = parseEntryFallback({
      rawText: "ovesná kaše s banánem",
      userWeightKg: 80,
      fallbackTimeSlot: "morning",
    });
    const parsed2 = parseEntryFallback({
      rawText: "banán a ovesná kaše",
      userWeightKg: 80,
      fallbackTimeSlot: "morning",
    });

    const r1 = await detectAndPromoteRecurringMeal({
      supabase: mockSupabase,
      userId: "user-1",
      entryId: 101,
      parsed: parsed1,
      foodItems: parsed1.items,
    });
    expect(r1).toEqual({
      templateId: 1,
      promotedToQuickCheck: false,
      occurrenceCount: 1,
    });

    const r2 = await detectAndPromoteRecurringMeal({
      supabase: mockSupabase,
      userId: "user-1",
      entryId: 102,
      parsed: parsed2,
      foodItems: parsed2.items,
    });
    expect(r2).toEqual({
      templateId: 1,
      promotedToQuickCheck: false,
      occurrenceCount: 2,
    });

    const r3 = await detectAndPromoteRecurringMeal({
      supabase: mockSupabase,
      userId: "user-1",
      entryId: 103,
      parsed: parsed1,
      foodItems: parsed1.items,
    });
    expect(r3).toEqual({
      templateId: 1,
      promotedToQuickCheck: true,
      occurrenceCount: 3,
    });
    expect(storedTemplates[0].is_quick_check).toBe(true);
    expect(linkedEntries.get(103)).toBe(1);
  });

  it("skips meal template creation for pure sport entries", async () => {
    const mockSupabase = {
      rpc: vi.fn(),
      from: vi.fn(),
    } as unknown as ReturnType<typeof createBackgroundClient>;

    const sportParsed = parseEntryFallback({
      rawText: "45 min plavání",
      userWeightKg: 80,
      fallbackTimeSlot: "anytime",
    });
    const foodItems = sportParsed.items.filter((i) => i.item_kind === "food");

    const res = await detectAndPromoteRecurringMeal({
      supabase: mockSupabase,
      userId: "user-1",
      entryId: 200,
      parsed: sportParsed,
      foodItems,
    });

    expect(res).toEqual({
      templateId: null,
      promotedToQuickCheck: false,
      occurrenceCount: 0,
    });
    expect(mockSupabase.from).not.toHaveBeenCalled();
  });

  it("maps Czech sport variations to canonical identities and promotes recurring activities on 3rd log", async () => {
    expect(resolveCanonicalActivityIdentity("Horské kolo 2 hodiny").signature).toBe("kol");
    expect(resolveCanonicalActivityIdentity("Lezení na stěně").canonicalName).toBe("Lezení");
    expect(resolveCanonicalActivityIdentity("Plavání v bazénu").canonicalName).toBe("Bazén");
    expect(resolveCanonicalActivityIdentity("Posilovna fullbody").canonicalName).toBe("Posilovna");
    expect(resolveCanonicalActivityIdentity("Rychlá chůze").canonicalName).toBe("Chůze");
    expect(resolveCanonicalActivityIdentity("Badminton 60 min").canonicalName).toBe("Badminton");

    const storedActivities: ActivityTemplateRow[] = [];
    const linkedActivityEntries = new Map<number, number>();
    let nextActId = 10;

    const mockSupabase = {
      from: vi.fn((table: string) => {
        if (table === "activity_templates") {
          return {
            select: () => ({
              eq: () => ({
                eq: (_col: string, sig: string) => ({
                  maybeSingle: async () => ({
                    data:
                      storedActivities.find(
                        (a) => a.normalized_signature === sig
                      ) ?? null,
                    error: null,
                  }),
                }),
              }),
            }),
            insert: (payload: Record<string, unknown>) => ({
              select: () => ({
                single: async () => {
                  const now = new Date().toISOString();
                  const row: ActivityTemplateRow = {
                    id: nextActId++,
                    user_id: String(payload.user_id),
                    canonical_name: String(payload.canonical_name),
                    normalized_signature: String(payload.normalized_signature),
                    icon_key: String(payload.icon_key ?? "activity"),
                    occurrence_count: Number(payload.occurrence_count ?? 1),
                    is_quick_check: Boolean(payload.is_quick_check),
                    is_hidden: false,
                    default_minutes: Number(payload.default_minutes ?? 60),
                    max_minutes: Number(payload.max_minutes ?? 180),
                    default_intensity: String(
                      payload.default_intensity ?? "medium"
                    ),
                    met_light: Number(payload.met_light ?? 4),
                    met_medium: Number(payload.met_medium ?? 5),
                    met_high: Number(payload.met_high ?? 6.5),
                    last_done_at: now,
                    created_at: now,
                    updated_at: now,
                  };
                  storedActivities.push(row);
                  return { data: { id: row.id }, error: null };
                },
              }),
            }),
            update: (patch: Partial<ActivityTemplateRow>) => ({
              eq: (_col1: string, idVal: number) => ({
                eq: async () => {
                  const idx = storedActivities.findIndex((a) => a.id === idVal);
                  if (idx >= 0) {
                    storedActivities[idx] = {
                      ...storedActivities[idx],
                      ...patch,
                    };
                  }
                  return { error: null };
                },
              }),
            }),
          };
        }
        if (table === "log_entries") {
          return {
            update: (patch: { activity_template_id: number }) => ({
              eq: (_col1: string, entryIdVal: number) => ({
                eq: async () => {
                  linkedActivityEntries.set(
                    entryIdVal,
                    patch.activity_template_id
                  );
                  return { error: null };
                },
              }),
            }),
          };
        }
        throw new Error(`Unexpected table ${table}`);
      }),
    } as unknown as ReturnType<typeof createBackgroundClient>;

    const badminton60 = [
      {
        item_kind: "activity" as const,
        item_name: "Badminton (60 min)",
        canonical_name: "Badminton",
        portion_grams: null,
        duration_minutes: 60,
        met_value: 5.5,
        kcal: 0,
        burned_kcal: 350,
        protein_g: 0,
        carbs_g: 0,
        fat_g: 0,
        fiber_g: 0,
        confidence: 0.9,
      },
    ];
    const badminton80 = [
      {
        ...badminton60[0],
        duration_minutes: 80,
      },
    ];

    const a1 = await detectAndPromoteRecurringActivity({
      supabase: mockSupabase,
      userId: "user-1",
      entryId: 301,
      activityItems: badminton60,
    });
    expect(a1).toEqual({
      activityTemplateId: 10,
      promotedToQuickCheck: false,
      occurrenceCount: 1,
    });

    const a2 = await detectAndPromoteRecurringActivity({
      supabase: mockSupabase,
      userId: "user-1",
      entryId: 302,
      activityItems: badminton80,
    });
    expect(a2).toEqual({
      activityTemplateId: 10,
      promotedToQuickCheck: false,
      occurrenceCount: 2,
    });
    expect(storedActivities[0].default_minutes).toBe(70);

    const a3 = await detectAndPromoteRecurringActivity({
      supabase: mockSupabase,
      userId: "user-1",
      entryId: 303,
      activityItems: badminton80,
    });
    expect(a3).toEqual({
      activityTemplateId: 10,
      promotedToQuickCheck: true,
      occurrenceCount: 3,
    });
    expect(storedActivities[0].is_quick_check).toBe(true);
    expect(storedActivities[0].default_minutes).toBe(75);
    expect(linkedActivityEntries.get(303)).toBe(10);
  });
});

describe("orchestrator background processing", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.GEMINI_API_KEY;
  });

  it("marks log_entries as error and still calls recalculate_daily_summary on failure", async () => {
    const updates: Record<string, unknown>[] = [];
    const rpcCalls: Array<{ fn: string; args: unknown }> = [];

    const mockSupabase = {
      rpc: vi.fn(async (fn: string, args: unknown) => {
        rpcCalls.push({ fn, args });
        return { data: null, error: null };
      }),
      from: vi.fn((table: string) => {
        if (table === "log_entries") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: {
                    id: 55,
                    user_id: "u-1",
                    log_date: "2026-11-06",
                    raw_text: "2 rohlíky se šunkou",
                    time_slot: "morning",
                  },
                  error: null,
                }),
              }),
            }),
            update: (patch: Record<string, unknown>) => {
              updates.push(patch);
              return {
                eq: () => ({
                  eq: async () => ({ error: null }),
                }),
              };
            },
          };
        }
        if (table === "user_profiles") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: { weight_kg: 82 },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === "entry_items") {
          return {
            delete: () => ({
              eq: () => ({
                eq: async () => ({
                  error: new Error("Simulated DB insert/delete error"),
                }),
              }),
            }),
          };
        }
        throw new Error(`Unexpected table ${table}`);
      }),
    } as unknown as ReturnType<typeof createBackgroundClient>;

    vi.spyOn(backgroundModule, "createBackgroundClient").mockReturnValue(
      mockSupabase
    );

    await processLogEntryInBackground({
      entryId: 55,
      accessToken: "fake-jwt",
    });

    expect(updates.some((u) => u.status === "processing")).toBe(true);
    const errorUpdate = updates.find((u) => u.status === "error");
    expect(errorUpdate).toBeDefined();
    expect(String(errorUpdate?.error_message)).toContain(
      "Simulated DB insert/delete error"
    );
    expect(rpcCalls).toEqual([
      {
        fn: "recalculate_daily_summary",
        args: { p_log_date: "2026-11-06" },
      },
    ]);
  });
});

