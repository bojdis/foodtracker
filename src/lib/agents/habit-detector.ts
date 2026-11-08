import { GoogleGenAI } from "@google/genai";
import { getGeminiKeyStatus } from "./nutrition-parser";
import type { Json } from "@/lib/database.types";
import type { createBackgroundClient } from "@/lib/supabase/background";
import type {
  ActivityTemplateRow,
  MealTemplateRow,
  ParsedEntryResult,
  ParsedItem,
  TemplateItemSnapshot,
} from "@/lib/types";

const EMBEDDING_MODEL = "gemini-embedding-001";
const EMBEDDING_DIMENSION = 768;
const VECTOR_MATCH_THRESHOLD = 0.87;

const CZECH_STOP_WORDS = new Set([
  "a",
  "i",
  "s",
  "se",
  "na",
  "v",
  "ve",
  "z",
  "ze",
  "do",
  "k",
  "ke",
  "po",
  "pro",
  "bez",
  "u",
  "o",
  "od",
  "nad",
  "pod",
  "mezi",
  "plus",
  "nebo",
  "porce",
  "porci",
  "ks",
  "kus",
  "kusy",
  "kusu",
  "krajic",
  "krajice",
  "g",
  "gr",
  "gram",
  "gramy",
  "gramu",
  "ml",
  "l",
  "litr",
]);

function round1(val: number): number {
  if (!Number.isFinite(val) || val < 0) return 0;
  return Math.round(val * 10) / 10;
}

function stemCzechToken(token: string): string {
  let stem = token;

  const multiCharSuffixes = [
    "ami",
    "emi",
    "ama",
    "ema",
    "ech",
    "ich",
    "ach",
    "eho",
    "emu",
    "ovi",
    "ou",
    "em",
    "ym",
    "im",
    "um",
    "am",
  ];

  for (const suffix of multiCharSuffixes) {
    if (stem.endsWith(suffix) && stem.length - suffix.length >= 3) {
      stem = stem.slice(0, -suffix.length);
      break;
    }
  }

  if (/[aeiouy]$/.test(stem) && stem.length - 1 >= 3) {
    stem = stem.slice(0, -1);
  }

  return stem;
}

/**
 * Normalizes a Czech meal title or item list into an order-invariant,
 * diacritic-insensitive signature (e.g. "ovesná kaše s banánem" and
 * "banán a ovesná kaše" both normalize to "banan kas ovesn").
 */
export function normalizeMealSignature(text: string): string {
  const ascii = text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\d+(?:[.,]\d+)?\s*(?:g|gr|gram\w*|ml|l|ks|kus\w*)\b/g, " ")
    .replace(/[^a-z\s]/g, " ");

  const rawTokens = ascii
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2 && !CZECH_STOP_WORDS.has(t));

  const stemmedTokens = rawTokens
    .map(stemCzechToken)
    .filter((t) => t.length >= 2);

  return Array.from(new Set(stemmedTokens)).sort().join(" ");
}

/**
 * Generates a 768-dimensional semantic embedding using gemini-embedding-001.
 * Returns null if GEMINI_API_KEY is unset or on any API failure.
 */
export async function generateMealEmbedding(
  text: string
): Promise<number[] | null> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  const cleanText = text.trim();
  if (!apiKey || getGeminiKeyStatus(apiKey) !== "valid" || !cleanText) {
    return null;
  }

  try {
    const client = new GoogleGenAI({ apiKey });
    const embRes = await client.models.embedContent({
      model: EMBEDDING_MODEL,
      contents: cleanText,
      config: { outputDimensionality: EMBEDDING_DIMENSION },
    });

    const values = embRes.embeddings?.[0]?.values;
    if (!Array.isArray(values) || values.length !== EMBEDDING_DIMENSION) {
      return null;
    }
    return values;
  } catch {
    return null;
  }
}

export async function detectAndPromoteRecurringMeal(params: {
  supabase: ReturnType<typeof createBackgroundClient>;
  userId: string;
  entryId: number;
  parsed: ParsedEntryResult;
  foodItems: ParsedItem[];
}): Promise<{
  templateId: number | null;
  promotedToQuickCheck: boolean;
  occurrenceCount: number;
}> {
  const { supabase, userId, entryId, parsed, foodItems } = params;

  if (foodItems.length === 0) {
    return {
      templateId: null,
      promotedToQuickCheck: false,
      occurrenceCount: 0,
    };
  }

  const totalKcal = Math.max(
    0,
    Math.round(foodItems.reduce((sum, i) => sum + i.kcal, 0))
  );

  // Guard: Do not promote whole-day multi-meal diary dumps (e.g. 9 items / 2 040 kcal across breakfast + lunch + drinks)
  // into a single "recurring meal" template.
  if (foodItems.length > 6 || totalKcal > 1450) {
    return {
      templateId: null,
      promotedToQuickCheck: false,
      occurrenceCount: 0,
    };
  }
  const totalProtein = round1(foodItems.reduce((sum, i) => sum + i.protein_g, 0));
  const totalCarbs = round1(foodItems.reduce((sum, i) => sum + i.carbs_g, 0));
  const totalFat = round1(foodItems.reduce((sum, i) => sum + i.fat_g, 0));
  const totalFiber = round1(foodItems.reduce((sum, i) => sum + i.fiber_g, 0));

  const itemsWithPortions = foodItems.filter(
    (i) => typeof i.portion_grams === "number" && i.portion_grams > 0
  );
  const totalPortionGrams =
    itemsWithPortions.length > 0
      ? Math.round(
          itemsWithPortions.reduce((sum, i) => sum + (i.portion_grams ?? 0), 0)
        )
      : null;

  const canonicalName =
    parsed.canonical_meal_name?.trim() ||
    parsed.summary_title.trim() ||
    foodItems.map((i) => i.canonical_name).join(" + ");

  const normalizedItemsSummary = foodItems
    .map((i) => i.canonical_name.trim())
    .filter(Boolean)
    .sort()
    .join(", ");

  const templateItems: TemplateItemSnapshot[] = foodItems.map((item) => ({
    item_name: item.item_name,
    canonical_name: item.canonical_name,
    portion_grams:
      item.portion_grams != null ? Math.round(item.portion_grams) : null,
    kcal: Math.max(0, Math.round(item.kcal)),
    protein_g: round1(item.protein_g),
    carbs_g: round1(item.carbs_g),
    fat_g: round1(item.fat_g),
    fiber_g: round1(item.fiber_g),
  }));

  const embeddingText = `${canonicalName} | ${normalizedItemsSummary}`;
  const embedding = await generateMealEmbedding(embeddingText);
  const serializedEmbedding = embedding ? JSON.stringify(embedding) : null;

  let matchedRow: MealTemplateRow | null = null;

  // 1. Try semantic vector similarity match first when embedding is available
  if (serializedEmbedding) {
    const { data: vectorMatches } = await supabase.rpc("match_meal_templates", {
      query_embedding: serializedEmbedding,
      match_threshold: VECTOR_MATCH_THRESHOLD,
      match_count: 3,
    });

    if (vectorMatches && vectorMatches.length > 0) {
      const bestMatchId = vectorMatches[0].id;
      const { data: fullRow } = await supabase
        .from("meal_templates")
        .select("*")
        .eq("id", bestMatchId)
        .eq("user_id", userId)
        .maybeSingle();

      if (fullRow && !fullRow.is_hidden) {
        matchedRow = fullRow;
      }
    }
  }

  // 2. Fallback to normalized Czech signature matching across user's visible templates
  if (!matchedRow) {
    const { data: existingTemplates } = await supabase
      .from("meal_templates")
      .select("*")
      .eq("user_id", userId)
      .order("occurrence_count", { ascending: false });

    const visibleTemplates = (existingTemplates ?? []).filter(
      (tpl) => !tpl.is_hidden
    );

    if (visibleTemplates.length > 0) {
      const targetCanonicalSig = normalizeMealSignature(canonicalName);
      const targetItemsSig = normalizeMealSignature(normalizedItemsSummary);
      const targetAscii = canonicalName
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim();

      // Pass 1: Exact alias or canonical name signature match (prevents same-ingredient portion collisions like Müsli vs Menší porce müsli)
      matchedRow =
        visibleTemplates.find((tpl) => {
          const aliases = Array.isArray(tpl.shortcut_aliases)
            ? tpl.shortcut_aliases
            : [];
          const aliasMatch = aliases.some((alias) => {
            const aliasAscii = alias
              .normalize("NFD")
              .replace(/[\u0300-\u036f]/g, "")
              .toLowerCase()
              .trim();
            return (
              aliasAscii === targetAscii ||
              normalizeMealSignature(alias) === targetCanonicalSig
            );
          });
          if (aliasMatch) return true;

          const tplCanonicalSig = normalizeMealSignature(tpl.canonical_name);
          return (
            targetCanonicalSig.length > 0 &&
            tplCanonicalSig === targetCanonicalSig
          );
        }) ?? null;

      // Pass 2: Normalized ingredient-list signature match (within ±30% kcal so different portion presets stay distinct)
      if (!matchedRow && targetItemsSig.length > 0) {
        matchedRow =
          visibleTemplates.find((tpl) => {
            const tplItemsSig = normalizeMealSignature(
              tpl.normalized_items_summary
            );
            if (tplItemsSig !== targetItemsSig) return false;
            if (tpl.avg_kcal > 0 && totalKcal > 0) {
              const ratio = totalKcal / tpl.avg_kcal;
              return ratio >= 0.7 && ratio <= 1.35;
            }
            return true;
          }) ?? null;
      }
    }
  }

  const nowIso = new Date().toISOString();

  if (matchedRow) {
    const prevCount = Math.max(1, matchedRow.occurrence_count);
    const newOccurrenceCount = prevCount + 1;
    const wasQuickCheck = matchedRow.is_quick_check;
    const isQuickCheck = wasQuickCheck || newOccurrenceCount >= 3;
    const isLockedPersonalPreset =
      Array.isArray(matchedRow.shortcut_aliases) &&
      matchedRow.shortcut_aliases.length > 0;

    if (isLockedPersonalPreset) {
      const { error: updatePresetError } = await supabase
        .from("meal_templates")
        .update({
          occurrence_count: newOccurrenceCount,
          is_quick_check: isQuickCheck,
          ...(serializedEmbedding && !matchedRow.embedding
            ? { embedding: serializedEmbedding }
            : {}),
          last_eaten_at: nowIso,
          updated_at: nowIso,
        })
        .eq("id", matchedRow.id)
        .eq("user_id", userId);

      if (updatePresetError) {
        throw updatePresetError;
      }

      await supabase
        .from("log_entries")
        .update({ meal_template_id: matchedRow.id })
        .eq("id", entryId)
        .eq("user_id", userId);

      return {
        templateId: matchedRow.id,
        promotedToQuickCheck: !wasQuickCheck && isQuickCheck,
        occurrenceCount: newOccurrenceCount,
      };
    }

    const avgKcal = Math.max(
      0,
      Math.round((Number(matchedRow.avg_kcal) * prevCount + totalKcal) / newOccurrenceCount)
    );
    const avgProtein = round1(
      (Number(matchedRow.avg_protein_g) * prevCount + totalProtein) /
        newOccurrenceCount
    );
    const avgCarbs = round1(
      (Number(matchedRow.avg_carbs_g) * prevCount + totalCarbs) /
        newOccurrenceCount
    );
    const avgFat = round1(
      (Number(matchedRow.avg_fat_g) * prevCount + totalFat) / newOccurrenceCount
    );
    const avgFiber = round1(
      (Number(matchedRow.avg_fiber_g) * prevCount + totalFiber) /
        newOccurrenceCount
    );

    let avgPortionGrams: number | null = matchedRow.avg_portion_grams;
    if (totalPortionGrams != null && matchedRow.avg_portion_grams != null) {
      avgPortionGrams = Math.round(
        (matchedRow.avg_portion_grams * prevCount + totalPortionGrams) /
          newOccurrenceCount
      );
    } else if (totalPortionGrams != null) {
      avgPortionGrams = totalPortionGrams;
    }

    const updatedTimeSlot =
      matchedRow.typical_time_slot === "anytime" &&
      parsed.typical_time_slot !== "anytime"
        ? parsed.typical_time_slot
        : matchedRow.typical_time_slot;

    const { error: updateTplError } = await supabase
      .from("meal_templates")
      .update({
        occurrence_count: newOccurrenceCount,
        is_quick_check: isQuickCheck,
        avg_kcal: avgKcal,
        avg_protein_g: avgProtein,
        avg_carbs_g: avgCarbs,
        avg_fat_g: avgFat,
        avg_fiber_g: avgFiber,
        avg_portion_grams: avgPortionGrams,
        typical_time_slot: updatedTimeSlot,
        template_items: templateItems as unknown as Json,
        ...(serializedEmbedding && !matchedRow.embedding
          ? { embedding: serializedEmbedding }
          : {}),
        last_eaten_at: nowIso,
        updated_at: nowIso,
      })
      .eq("id", matchedRow.id)
      .eq("user_id", userId);

    if (updateTplError) {
      throw updateTplError;
    }

    await supabase
      .from("log_entries")
      .update({ meal_template_id: matchedRow.id })
      .eq("id", entryId)
      .eq("user_id", userId);

    return {
      templateId: matchedRow.id,
      promotedToQuickCheck: !wasQuickCheck && isQuickCheck,
      occurrenceCount: newOccurrenceCount,
    };
  }

  // Do not create combined spam templates for multi-preset combinations (e.g. "Toast + Kafe")
  if (parsed.ai_notes?.startsWith("Složeno z osobních zkratek:")) {
    return {
      templateId: null,
      promotedToQuickCheck: false,
      occurrenceCount: 0,
    };
  }

  // Insert brand new meal template (occurrence_count = 1, is_quick_check = false)
  const { data: insertedTemplate, error: insertTplError } = await supabase
    .from("meal_templates")
    .insert({
      user_id: userId,
      canonical_name: canonicalName,
      normalized_items_summary: normalizedItemsSummary,
      typical_time_slot: parsed.typical_time_slot,
      occurrence_count: 1,
      is_quick_check: false,
      avg_portion_grams: totalPortionGrams,
      avg_kcal: totalKcal,
      avg_protein_g: totalProtein,
      avg_carbs_g: totalCarbs,
      avg_fat_g: totalFat,
      avg_fiber_g: totalFiber,
      template_items: templateItems as unknown as Json,
      embedding: serializedEmbedding,
      last_eaten_at: nowIso,
    })
    .select("id")
    .single();

  if (insertTplError || !insertedTemplate) {
    throw insertTplError ?? new Error("Nepodařilo se uložit šablonu jídla.");
  }

  await supabase
    .from("log_entries")
    .update({ meal_template_id: insertedTemplate.id })
    .eq("id", entryId)
    .eq("user_id", userId);

  return {
    templateId: insertedTemplate.id,
    promotedToQuickCheck: false,
    occurrenceCount: 1,
  };
}

/**
 * Normalizes a Czech sport/activity name into a canonical signature + icon key
 * so variations like "Horské kolo 2 hodiny", "Jízda na kole", "kolo" map to "kol",
 * "Plavání v bazénu" maps to "bazen", "Lezení na stěně" / "Bouldering" maps to "lezen", etc.
 */
export function resolveCanonicalActivityIdentity(rawName: string): {
  signature: string;
  canonicalName: string;
  iconKey: string;
  maxMinutes: number;
} {
  const ascii = rawName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\d+(?:[.,]\d+)?\s*(?:min\w*|hod\w*|h\b|m\b|km\b)/g, " ")
    .replace(/[^a-z\s]/g, " ")
    .trim();

  if (/\b(?:kol\w*|mtb|cyklist\w*|rotoped\w*)\b/.test(ascii)) {
    return {
      signature: "kol",
      canonicalName: "Kolo",
      iconKey: "bike",
      maxMinutes: 240,
    };
  }
  if (/\b(?:lezen\w*|boulder\w*|sten[aeu]\w*|skal\w*)\b/.test(ascii)) {
    return {
      signature: "lezen",
      canonicalName: "Lezení",
      iconKey: "climb",
      maxMinutes: 180,
    };
  }
  if (/\b(?:posilov\w*|fitk\w*|silov\w*)\b/.test(ascii)) {
    return {
      signature: "posilovn",
      canonicalName: "Posilovna",
      iconKey: "gym",
      maxMinutes: 150,
    };
  }
  if (/\b(?:plav\w*|bazen\w*)\b/.test(ascii)) {
    return {
      signature: "bazen",
      canonicalName: "Bazén",
      iconKey: "swim",
      maxMinutes: 150,
    };
  }
  if (/\b(?:chuz\w*|prochaz\w*|turist\w*)\b/.test(ascii)) {
    return {
      signature: "chuz",
      canonicalName: "Chůze",
      iconKey: "walk",
      maxMinutes: 240,
    };
  }
  if (/\b(?:beh\b|behan\w*|jogging\w*)\b/.test(ascii)) {
    return {
      signature: "beh",
      canonicalName: "Běh",
      iconKey: "run",
      maxMinutes: 150,
    };
  }

  const sig = normalizeMealSignature(rawName) || "aktivit";
  const cleanedLabel =
    rawName
      .replace(/\(?\d+\s*(?:min\w*|hod\w*|h\b|m\b).*?\)?/gi, "")
      .trim() || rawName.trim();
  const capitalized =
    cleanedLabel.charAt(0).toUpperCase() + cleanedLabel.slice(1);

  return {
    signature: sig,
    canonicalName: capitalized.slice(0, 48),
    iconKey: "activity",
    maxMinutes: 180,
  };
}

function roundTo5Min(minutes: number): number {
  return Math.min(600, Math.max(10, Math.round(minutes / 5) * 5));
}

export async function detectAndPromoteRecurringActivity(params: {
  supabase: ReturnType<typeof createBackgroundClient>;
  userId: string;
  entryId: number;
  activityItems: ParsedItem[];
}): Promise<{
  activityTemplateId: number | null;
  promotedToQuickCheck: boolean;
  occurrenceCount: number;
}> {
  const { supabase, userId, entryId, activityItems } = params;
  if (activityItems.length === 0) {
    return {
      activityTemplateId: null,
      promotedToQuickCheck: false,
      occurrenceCount: 0,
    };
  }

  const primary = activityItems[0];
  const identity = resolveCanonicalActivityIdentity(
    primary.canonical_name || primary.item_name
  );
  const loggedMinutes = roundTo5Min(primary.duration_minutes ?? 60);
  const baseMet =
    primary.met_value && primary.met_value > 0 ? round1(primary.met_value) : 5.0;

  const { data: existing } = await supabase
    .from("activity_templates")
    .select("*")
    .eq("user_id", userId)
    .eq("normalized_signature", identity.signature)
    .maybeSingle();

  const nowIso = new Date().toISOString();

  if (existing) {
    const typedExisting = existing as ActivityTemplateRow;
    const prevCount = Math.max(1, typedExisting.occurrence_count);
    const nextCount = prevCount + 1;
    const wasQuickCheck = typedExisting.is_quick_check;
    const isQuickCheck = wasQuickCheck || nextCount >= 3;

    // Smoothly adapt default_minutes towards recent habit (rounded to 5 min)
    const blendedMinutes = roundTo5Min(
      typedExisting.default_minutes * 0.5 + loggedMinutes * 0.5
    );

    await supabase
      .from("activity_templates")
      .update({
        occurrence_count: nextCount,
        is_quick_check: isQuickCheck,
        default_minutes: blendedMinutes,
        max_minutes: Math.max(typedExisting.max_minutes, loggedMinutes + 30),
        last_done_at: nowIso,
        updated_at: nowIso,
      })
      .eq("id", typedExisting.id)
      .eq("user_id", userId);

    await supabase
      .from("log_entries")
      .update({ activity_template_id: typedExisting.id })
      .eq("id", entryId)
      .eq("user_id", userId);

    return {
      activityTemplateId: typedExisting.id,
      promotedToQuickCheck: !wasQuickCheck && isQuickCheck,
      occurrenceCount: nextCount,
    };
  }

  const metLight = Math.max(2.0, round1(baseMet * 0.78));
  const metMedium = Math.max(2.5, baseMet);
  const metHigh = Math.max(3.2, round1(baseMet * 1.25));

  const { data: inserted, error: insertErr } = await supabase
    .from("activity_templates")
    .insert({
      user_id: userId,
      canonical_name: identity.canonicalName,
      normalized_signature: identity.signature,
      icon_key: identity.iconKey,
      occurrence_count: 1,
      is_quick_check: false,
      default_minutes: loggedMinutes,
      max_minutes: Math.max(identity.maxMinutes, loggedMinutes + 30),
      default_intensity: "medium",
      met_light: metLight,
      met_medium: metMedium,
      met_high: metHigh,
      last_done_at: nowIso,
    })
    .select("id")
    .single();

  if (insertErr || !inserted) {
    throw insertErr ?? new Error("Nepodařilo se uložit šablonu aktivity.");
  }

  await supabase
    .from("log_entries")
    .update({ activity_template_id: inserted.id })
    .eq("id", entryId)
    .eq("user_id", userId);

  return {
    activityTemplateId: inserted.id,
    promotedToQuickCheck: false,
    occurrenceCount: 1,
  };
}
