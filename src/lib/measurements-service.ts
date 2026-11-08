import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import type {
  ActivityLevel,
  BodyMeasurementInput,
  BodyMeasurementRow,
  Sex,
  UserProfileRow,
} from "./types";
import {
  calculateBaseExpenditure,
  calculateBmr,
  calculateMacroTargets,
  getTodayDateString,
} from "./calculations";

function normalizeSex(raw: string | undefined): Sex {
  return raw === "female" ? "female" : "male";
}

function normalizeActivityLevel(raw: string | undefined): ActivityLevel {
  if (
    raw === "sedentary" ||
    raw === "light" ||
    raw === "moderate" ||
    raw === "active"
  ) {
    return raw;
  }
  return "sedentary";
}

/**
 * Upserts a daily body measurement (non-destructively merging weight_kg and waist_cm on the same date)
 * and, when the latest recorded weight changes, automatically updates user_profiles.weight_kg,
 * BMR, daily expenditure, and macro targets.
 */
export async function upsertBodyMeasurementAndSyncProfile(
  supabase: SupabaseClient<Database>,
  userId: string,
  input: BodyMeasurementInput
): Promise<{
  measurement: BodyMeasurementRow;
  updatedProfile: UserProfileRow | null;
}> {
  const { data: existingRow } = await supabase
    .from("body_measurements")
    .select("*")
    .eq("user_id", userId)
    .eq("measured_date", input.measured_date)
    .maybeSingle();

  const mergedWeight =
    input.weight_kg !== undefined && input.weight_kg !== null
      ? input.weight_kg
      : (existingRow?.weight_kg ?? null);
  const mergedWaist =
    input.waist_cm !== undefined && input.waist_cm !== null
      ? input.waist_cm
      : (existingRow?.waist_cm ?? null);
  const mergedSys =
    input.blood_pressure_sys !== undefined && input.blood_pressure_sys !== null
      ? input.blood_pressure_sys
      : (existingRow?.blood_pressure_sys ?? null);
  const mergedDia =
    input.blood_pressure_dia !== undefined && input.blood_pressure_dia !== null
      ? input.blood_pressure_dia
      : (existingRow?.blood_pressure_dia ?? null);
  const mergedPulse =
    input.pulse_bpm !== undefined && input.pulse_bpm !== null
      ? input.pulse_bpm
      : (existingRow?.pulse_bpm ?? null);
  const mergedNotes =
    input.notes !== undefined ? input.notes : (existingRow?.notes ?? null);

  const nowIso = new Date().toISOString();

  const { data: savedMeasurement, error: upsertError } = await supabase
    .from("body_measurements")
    .upsert(
      {
        user_id: userId,
        measured_date: input.measured_date,
        weight_kg:
          mergedWeight !== null ? Math.round(mergedWeight * 10) / 10 : null,
        waist_cm:
          mergedWaist !== null ? Math.round(mergedWaist * 10) / 10 : null,
        blood_pressure_sys: mergedSys,
        blood_pressure_dia: mergedDia,
        pulse_bpm: mergedPulse,
        notes: mergedNotes,
        updated_at: nowIso,
      },
      { onConflict: "user_id,measured_date" }
    )
    .select("*")
    .single();

  if (upsertError || !savedMeasurement) {
    throw new Error(upsertError?.message ?? "Nepodařilo se uložit měření těla.");
  }

  let updatedProfile: UserProfileRow | null = null;
  if (typeof savedMeasurement.weight_kg === "number") {
    const { data: latestWeightRow } = await supabase
      .from("body_measurements")
      .select("measured_date, weight_kg")
      .eq("user_id", userId)
      .not("weight_kg", "is", null)
      .order("measured_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (
      latestWeightRow &&
      latestWeightRow.measured_date === savedMeasurement.measured_date &&
      typeof latestWeightRow.weight_kg === "number"
    ) {
      const { data: currentProfile } = await supabase
        .from("user_profiles")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();

      if (currentProfile) {
        const newWeight = Math.round(latestWeightRow.weight_kg * 10) / 10;
        const sex = normalizeSex(currentProfile.sex);
        const activityLevel = normalizeActivityLevel(
          currentProfile.activity_level
        );
        const bmrKcal = calculateBmr({
          sex,
          weightKg: newWeight,
          heightCm: currentProfile.height_cm,
          birthYear: currentProfile.birth_year,
        });
        const { multiplier, baseExpenditureKcal } = calculateBaseExpenditure(
          bmrKcal,
          activityLevel
        );
        const macros = calculateMacroTargets({
          weightKg: newWeight,
          baseExpenditureKcal,
          targetDeficitKcal: currentProfile.target_deficit_kcal,
        });

        const { data: profileRes } = await supabase
          .from("user_profiles")
          .update({
            weight_kg: newWeight,
            bmr_kcal: bmrKcal,
            activity_multiplier: multiplier,
            base_expenditure_kcal: baseExpenditureKcal,
            protein_target_g: macros.proteinTargetG,
            carbs_target_g: macros.carbsTargetG,
            fat_target_g: macros.fatTargetG,
            fiber_target_g: macros.fiberTargetG,
            updated_at: nowIso,
          })
          .eq("user_id", userId)
          .select("*")
          .single();

        updatedProfile = profileRes ?? null;

        await supabase.rpc("recalculate_daily_summary", {
          p_log_date: getTodayDateString(),
        });
      }
    }
  }

  return {
    measurement: savedMeasurement,
    updatedProfile,
  };
}
