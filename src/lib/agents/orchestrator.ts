import { createBackgroundClient } from "@/lib/supabase/background";
import type { EntryType, TimeSlot } from "@/lib/types";
import {
  detectAndPromoteRecurringActivity,
  detectAndPromoteRecurringMeal,
} from "./habit-detector";
import { parseEntryWithAgent } from "./nutrition-parser";

const VALID_TIME_SLOTS: readonly TimeSlot[] = [
  "morning",
  "lunch",
  "snack",
  "evening",
  "anytime",
];

function round1(val: number): number {
  if (!Number.isFinite(val) || val < 0) return 0;
  return Math.round(val * 10) / 10;
}

function round2(val: number): number {
  if (!Number.isFinite(val)) return 0.85;
  return Math.round(Math.min(1, Math.max(0, val)) * 100) / 100;
}

function toTimeSlot(value: string | null | undefined): TimeSlot {
  return VALID_TIME_SLOTS.find((s) => s === value) ?? "anytime";
}

export async function processLogEntryInBackground(params: {
  entryId: number;
  accessToken: string;
}): Promise<void> {
  const { entryId, accessToken } = params;
  const supabase = createBackgroundClient(accessToken);

  let logDate: string | null = null;
  let userId: string | null = null;

  try {
    const { data: entry, error: fetchError } = await supabase
      .from("log_entries")
      .select("*")
      .eq("id", entryId)
      .maybeSingle();

    if (fetchError) {
      throw fetchError;
    }
    if (!entry) {
      return;
    }

    logDate = entry.log_date;
    userId = entry.user_id;

    const { data: profile } = await supabase
      .from("user_profiles")
      .select("weight_kg, bmr_kcal")
      .eq("user_id", entry.user_id)
      .maybeSingle();

    const rawWeight = Number(profile?.weight_kg);
    const userWeightKg =
      Number.isFinite(rawWeight) && rawWeight > 0 ? rawWeight : 80;
    const rawBmr = Number(profile?.bmr_kcal);
    const userBmrKcal =
      Number.isFinite(rawBmr) && rawBmr > 0 ? rawBmr : undefined;

    const fallbackTimeSlot = toTimeSlot(entry.time_slot);

    await supabase
      .from("log_entries")
      .update({
        status: "processing",
        processed_at: new Date().toISOString(),
        error_message: null,
      })
      .eq("id", entryId)
      .eq("user_id", entry.user_id);

    const parsed = await parseEntryWithAgent({
      rawText: entry.raw_text,
      userWeightKg,
      userBmrKcal,
      fallbackTimeSlot,
    });

    // Clear any stale entry_items on retry before inserting freshly parsed items
    const { error: deleteItemsError } = await supabase
      .from("entry_items")
      .delete()
      .eq("log_entry_id", entryId)
      .eq("user_id", entry.user_id);

    if (deleteItemsError) {
      throw deleteItemsError;
    }

    const itemsPayload = parsed.items.map((item) => ({
      user_id: entry.user_id,
      log_entry_id: entryId,
      item_kind: item.item_kind,
      item_name: item.item_name,
      canonical_name: item.canonical_name,
      portion_grams:
        item.portion_grams != null ? Math.round(item.portion_grams) : null,
      duration_minutes:
        item.duration_minutes != null ? Math.round(item.duration_minutes) : null,
      met_value: item.met_value != null ? round1(item.met_value) : null,
      kcal: Math.max(0, Math.round(item.kcal)),
      burned_kcal: Math.max(0, Math.round(item.burned_kcal)),
      protein_g: round1(item.protein_g),
      carbs_g: round1(item.carbs_g),
      fat_g: round1(item.fat_g),
      fiber_g: round1(item.fiber_g),
      confidence: round2(item.confidence),
    }));

    const { error: insertItemsError } = await supabase
      .from("entry_items")
      .insert(itemsPayload);

    if (insertItemsError) {
      throw insertItemsError;
    }

    const foodItems = parsed.items.filter((i) => i.item_kind === "food");
    const activityItems = parsed.items.filter((i) => i.item_kind === "activity");

    let entryType: EntryType = "food";
    if (foodItems.length > 0 && activityItems.length > 0) {
      entryType = "mixed";
    } else if (activityItems.length > 0) {
      entryType = "activity";
    }

    const totalIntakeKcal = Math.max(
      0,
      Math.round(foodItems.reduce((sum, i) => sum + i.kcal, 0))
    );
    const totalBurnedKcal = Math.max(
      0,
      Math.round(activityItems.reduce((sum, i) => sum + i.burned_kcal, 0))
    );
    const totalProteinG = round1(
      foodItems.reduce((sum, i) => sum + i.protein_g, 0)
    );
    const totalCarbsG = round1(foodItems.reduce((sum, i) => sum + i.carbs_g, 0));
    const totalFatG = round1(foodItems.reduce((sum, i) => sum + i.fat_g, 0));
    const totalFiberG = round1(foodItems.reduce((sum, i) => sum + i.fiber_g, 0));

    const resolvedTimeSlot: TimeSlot =
      fallbackTimeSlot !== "anytime"
        ? fallbackTimeSlot
        : parsed.typical_time_slot;

    const { error: updateEntryError } = await supabase
      .from("log_entries")
      .update({
        status: "done",
        processed_at: new Date().toISOString(),
        summary_title: parsed.summary_title,
        ai_notes: parsed.ai_notes ?? null,
        entry_type: entryType,
        time_slot: resolvedTimeSlot,
        error_message: null,
        total_intake_kcal: totalIntakeKcal,
        total_burned_kcal: totalBurnedKcal,
        total_protein_g: totalProteinG,
        total_carbs_g: totalCarbsG,
        total_fat_g: totalFatG,
        total_fiber_g: totalFiberG,
      })
      .eq("id", entryId)
      .eq("user_id", entry.user_id);

    if (updateEntryError) {
      throw updateEntryError;
    }

    await supabase.rpc("recalculate_daily_summary", {
      p_log_date: entry.log_date,
    });

    try {
      await detectAndPromoteRecurringMeal({
        supabase,
        userId: entry.user_id,
        entryId,
        parsed,
        foodItems,
      });
    } catch (habitErr) {
      console.error("Recurring meal detection failed:", habitErr);
    }

    if (activityItems.length > 0) {
      try {
        await detectAndPromoteRecurringActivity({
          supabase,
          userId: entry.user_id,
          entryId,
          activityItems,
        });
      } catch (actHabitErr) {
        console.error("Recurring activity detection failed:", actHabitErr);
      }
    }
  } catch (err) {
    const errorMessage =
      err instanceof Error
        ? err.message
        : "Nepodařilo se zpracovat záznam na pozadí.";

    console.error(`Error processing log_entry ${entryId}:`, err);

    const errorUpdate = supabase
      .from("log_entries")
      .update({
        status: "error",
        error_message: errorMessage.slice(0, 500),
        processed_at: new Date().toISOString(),
      })
      .eq("id", entryId);

    if (userId) {
      await errorUpdate.eq("user_id", userId);
    } else {
      await errorUpdate;
    }

    if (logDate) {
      await supabase.rpc("recalculate_daily_summary", {
        p_log_date: logDate,
      });
    }
  }
}
