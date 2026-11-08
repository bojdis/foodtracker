import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { ProfileInputSchema } from "@/lib/types";
import {
  calculateBaseExpenditure,
  calculateBmr,
  calculateMacroTargets,
  getTodayDateString,
} from "@/lib/calculations";

const SINGLE_OWNER_CONFLICT_MESSAGE =
  "Tento tracker je nastaven v jednouživatelském režimu a už má svého vlastníka.";

const PatchProfileUnitSchema = z.object({
  energy_unit: z.enum(["kj", "kcal"]),
});

export async function GET() {
  const supabase = await createClient();
  const { data: claimsData, error: authError } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;

  if (authError || !userId) {
    return NextResponse.json(
      { error: "Nepřihlášený uživatel." },
      { status: 401 }
    );
  }

  const { data: profile, error } = await supabase
    .from("user_profiles")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ profile: profile ?? null });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: claimsData, error: authError } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;

  if (authError || !userId) {
    return NextResponse.json(
      { error: "Nepřihlášený uživatel." },
      { status: 401 }
    );
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Neplatný formát požadavku (JSON)." },
      { status: 400 }
    );
  }

  const parsed = ProfileInputSchema.safeParse(rawBody);
  if (!parsed.success) {
    const firstIssue =
      parsed.error.issues[0]?.message ?? "Neplatná vstupní data profilu.";
    return NextResponse.json({ error: firstIssue }, { status: 400 });
  }

  const input = parsed.data;
  const bmrKcal = calculateBmr({
    sex: input.sex,
    weightKg: input.weight_kg,
    heightCm: input.height_cm,
    birthYear: input.birth_year,
  });

  const { multiplier, baseExpenditureKcal } = calculateBaseExpenditure(
    bmrKcal,
    input.activity_level
  );

  const macros = calculateMacroTargets({
    weightKg: input.weight_kg,
    baseExpenditureKcal,
    targetDeficitKcal: input.target_deficit_kcal,
  });

  const { data: profile, error: upsertError } = await supabase
    .from("user_profiles")
    .upsert(
      {
        user_id: userId,
        singleton_lock: true,
        display_name: input.display_name,
        sex: input.sex,
        birth_year: input.birth_year,
        height_cm: input.height_cm,
        weight_kg: input.weight_kg,
        target_weight_kg:
          typeof input.target_weight_kg === "number"
            ? Math.round(input.target_weight_kg * 10) / 10
            : null,
        activity_level: input.activity_level,
        energy_unit: input.energy_unit,
        bmr_kcal: bmrKcal,
        activity_multiplier: multiplier,
        base_expenditure_kcal: baseExpenditureKcal,
        target_deficit_kcal: input.target_deficit_kcal,
        protein_target_g: macros.proteinTargetG,
        carbs_target_g: macros.carbsTargetG,
        fat_target_g: macros.fatTargetG,
        fiber_target_g: macros.fiberTargetG,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    )
    .select("*")
    .single();

  if (upsertError) {
    const isSingleOwnerViolation =
      upsertError.code === "23505" ||
      upsertError.code === "42501" ||
      upsertError.message.toLowerCase().includes("singleton_lock");

    if (isSingleOwnerViolation) {
      return NextResponse.json(
        { error: SINGLE_OWNER_CONFLICT_MESSAGE },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { error: upsertError.message },
      { status: 500 }
    );
  }

  await supabase.rpc("recalculate_daily_summary", {
    p_log_date: getTodayDateString(),
  });

  return NextResponse.json({ profile });
}

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const { data: claimsData, error: authError } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;

  if (authError || !userId) {
    return NextResponse.json(
      { error: "Nepřihlášený uživatel." },
      { status: 401 }
    );
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Neplatný formát požadavku (JSON)." },
      { status: 400 }
    );
  }

  const parsed = PatchProfileUnitSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Neplatná jednotka energie." },
      { status: 400 }
    );
  }

  const { data: profile, error } = await supabase
    .from("user_profiles")
    .update({
      energy_unit: parsed.data.energy_unit,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .select("*")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, profile });
}
