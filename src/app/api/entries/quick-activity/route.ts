import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  calculateActivityBurnedKcal,
  detectTimeSlotForDate,
} from "@/lib/calculations";
import {
  QuickActivityLogSchema,
  type ActivityIntensity,
  type LogEntryWithItems,
} from "@/lib/types";

const INTENSITY_LABELS_CS: Record<ActivityIntensity, string> = {
  light: "lehká intenzita",
  medium: "střední intenzita",
  high: "ostrá intenzita",
};

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

  const parsed = QuickActivityLogSchema.safeParse(rawBody);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]?.message ?? "Neplatná data aktivity.";
    return NextResponse.json({ error: firstIssue }, { status: 400 });
  }

  const input = parsed.data;

  const [tplRes, profileRes] = await Promise.all([
    supabase
      .from("activity_templates")
      .select("*")
      .eq("id", input.activity_template_id)
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("user_profiles")
      .select("weight_kg, bmr_kcal")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  if (tplRes.error) {
    return NextResponse.json({ error: tplRes.error.message }, { status: 500 });
  }
  const template = tplRes.data;
  if (!template) {
    return NextResponse.json(
      { error: "Šablona aktivity nebyla nalezena." },
      { status: 404 }
    );
  }

  const weightKg = Number(profileRes.data?.weight_kg) || 85;
  const bmrKcal = Number(profileRes.data?.bmr_kcal) || undefined;

  const selectedMet =
    input.intensity === "light"
      ? Number(template.met_light)
      : input.intensity === "high"
        ? Number(template.met_high)
        : Number(template.met_medium);

  const burnedKcal = calculateActivityBurnedKcal({
    metValue: selectedMet,
    weightKg,
    durationMinutes: input.duration_minutes,
    bmrKcal,
  });

  const intensityLabel = INTENSITY_LABELS_CS[input.intensity];
  const summaryTitle = `${template.canonical_name} (${input.duration_minutes} min · ${intensityLabel})`;
  const nowIso = new Date().toISOString();
  const timeSlot = detectTimeSlotForDate();

  const { data: insertedEntry, error: insertError } = await supabase
    .from("log_entries")
    .insert({
      user_id: userId,
      log_date: input.log_date,
      logged_at: nowIso,
      processed_at: nowIso,
      status: "done",
      entry_type: "activity",
      raw_text: summaryTitle,
      summary_title: summaryTitle,
      activity_template_id: template.id,
      time_slot: timeSlot,
      total_intake_kcal: 0,
      total_burned_kcal: burnedKcal,
      total_protein_g: 0,
      total_carbs_g: 0,
      total_fat_g: 0,
      total_fiber_g: 0,
      ai_notes: `Zapsáno z rychlých aktivit (${intensityLabel}, MET ${String(selectedMet).replace(".", ",")}; čistý aktivní výdej nad klidový režim, 0 AI tokenů).`,
    })
    .select("*")
    .single();

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  const { data: insertedItem } = await supabase
    .from("entry_items")
    .insert({
      user_id: userId,
      log_entry_id: insertedEntry.id,
      item_kind: "activity",
      item_name: summaryTitle,
      canonical_name: template.canonical_name,
      portion_grams: null,
      duration_minutes: input.duration_minutes,
      met_value: selectedMet,
      kcal: 0,
      burned_kcal: burnedKcal,
      protein_g: 0,
      carbs_g: 0,
      fat_g: 0,
      fiber_g: 0,
      confidence: 1,
    })
    .select("*")
    .single();

  // Remember user's chosen duration & intensity for next time!
  const { data: updatedTemplate } = await supabase
    .from("activity_templates")
    .update({
      occurrence_count: template.occurrence_count + 1,
      default_minutes: input.duration_minutes,
      default_intensity: input.intensity,
      max_minutes: Math.max(template.max_minutes, input.duration_minutes + 30),
      last_done_at: nowIso,
      updated_at: nowIso,
    })
    .eq("id", template.id)
    .eq("user_id", userId)
    .select("*")
    .maybeSingle();

  const { data: summary, error: rpcError } = await supabase.rpc(
    "recalculate_daily_summary",
    {
      p_log_date: input.log_date,
    }
  );

  if (rpcError) {
    return NextResponse.json({ error: rpcError.message }, { status: 500 });
  }

  const entryWithItems: LogEntryWithItems = {
    ...insertedEntry,
    entry_items: insertedItem ? [insertedItem] : [],
  };

  return NextResponse.json({
    ok: true,
    entry: entryWithItems,
    summary,
    updatedTemplate: updatedTemplate ?? null,
  });
}
