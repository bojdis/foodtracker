import { after, NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  CreateEntryInputSchema,
  type BodyMeasurementRow,
  type DailySummaryRow,
  type EntryType,
  type LogEntryWithItems,
  type UserProfileRow,
} from "@/lib/types";
import { detectTimeSlotForDate, getTodayDateString } from "@/lib/calculations";
import {
  getGeminiKeyStatus,
  parseEntryWithAgent,
} from "@/lib/agents/nutrition-parser";
import { processLogEntryInBackground } from "@/lib/agents/orchestrator";
import { extractBodyMeasurementFromText } from "@/lib/body-parser";
import { upsertBodyMeasurementAndSyncProfile } from "@/lib/measurements-service";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: claimsData, error: authError } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;

  if (authError || !userId) {
    return NextResponse.json(
      { error: "Nepřihlášený uživatel." },
      { status: 401 }
    );
  }

  const date = request.nextUrl.searchParams.get("date") ?? getTodayDateString();
  if (!DATE_RE.test(date)) {
    return NextResponse.json(
      { error: "Neplatný formát data. Očekáváno YYYY-MM-DD." },
      { status: 400 }
    );
  }

  const [
    summaryRes,
    profileRes,
    entriesRes,
    templatesRes,
    activityTemplatesRes,
    dayMeasurementRes,
    recentMeasurementsRes,
  ] = await Promise.all([
    supabase
      .from("daily_summaries")
      .select("*")
      .eq("user_id", userId)
      .eq("log_date", date)
      .maybeSingle(),
    supabase
      .from("user_profiles")
      .select("base_expenditure_kcal")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("log_entries")
      .select("*, entry_items(*)")
      .eq("user_id", userId)
      .eq("log_date", date)
      .order("logged_at", { ascending: false }),
    supabase
      .from("meal_templates")
      .select("*")
      .eq("user_id", userId)
      .eq("is_hidden", false)
      .order("is_quick_check", { ascending: false })
      .order("occurrence_count", { ascending: false })
      .order("last_eaten_at", { ascending: false }),
    supabase
      .from("activity_templates")
      .select("*")
      .eq("user_id", userId)
      .eq("is_hidden", false)
      .order("is_quick_check", { ascending: false })
      .order("occurrence_count", { ascending: false })
      .order("last_done_at", { ascending: false }),
    supabase
      .from("body_measurements")
      .select("*")
      .eq("user_id", userId)
      .eq("measured_date", date)
      .maybeSingle(),
    supabase
      .from("body_measurements")
      .select("*")
      .eq("user_id", userId)
      .order("measured_date", { ascending: false })
      .limit(30),
  ]);

  if (summaryRes.error) {
    return NextResponse.json({ error: summaryRes.error.message }, { status: 500 });
  }
  if (entriesRes.error) {
    return NextResponse.json({ error: entriesRes.error.message }, { status: 500 });
  }
  if (templatesRes.error) {
    return NextResponse.json({ error: templatesRes.error.message }, { status: 500 });
  }

  const baseExpenditureKcal = profileRes.data?.base_expenditure_kcal ?? 0;

  const summary: DailySummaryRow = summaryRes.data ?? {
    id: 0,
    user_id: userId,
    log_date: date,
    intake_kcal: 0,
    protein_g: 0,
    carbs_g: 0,
    fat_g: 0,
    fiber_g: 0,
    base_expenditure_kcal: baseExpenditureKcal,
    burned_activity_kcal: 0,
    burned_total_kcal: baseExpenditureKcal,
    net_kcal: -baseExpenditureKcal,
    entries_count: 0,
    pending_count: 0,
    updated_at: new Date().toISOString(),
  };

  let entries: LogEntryWithItems[] = (entriesRes.data ?? []).map((row) => ({
    ...row,
    entry_items: Array.isArray(row.entry_items) ? row.entry_items : [],
  }));

  // Watchdog: recover orphaned pending/processing entries (> 65s old, e.g. if dev server restarted mid-flight)
  const nowMs = Date.now();
  const STALE_PENDING_MS = 65_000;
  const staleIds = entries
    .filter((e) => {
      if (e.status !== "pending" && e.status !== "processing") return false;
      const refIso = e.processed_at ?? e.logged_at;
      const startedMs = Date.parse(refIso);
      return Number.isFinite(startedMs) && nowMs - startedMs > STALE_PENDING_MS;
    })
    .map((e) => e.id);

  let finalSummary = summary;
  if (staleIds.length > 0) {
    const staleMsg =
      "Zpracování na pozadí vypršelo (pravděpodobně proběhl restart serveru). Klikni na Zkusit znovu.";
    await supabase
      .from("log_entries")
      .update({
        status: "error",
        error_message: staleMsg,
        processed_at: new Date().toISOString(),
      })
      .in("id", staleIds)
      .eq("user_id", userId);

    const { data: recalcSummary } = await supabase.rpc(
      "recalculate_daily_summary",
      { p_log_date: date }
    );
    if (recalcSummary) {
      finalSummary = recalcSummary;
    }
    entries = entries.map((e) =>
      staleIds.includes(e.id)
        ? { ...e, status: "error", error_message: staleMsg }
        : e
    );
  }

  const geminiKeyStatus = getGeminiKeyStatus();

  return NextResponse.json({
    summary: finalSummary,
    entries,
    templates: templatesRes.data ?? [],
    activityTemplates: activityTemplatesRes.data ?? [],
    dayMeasurement: dayMeasurementRes.data ?? null,
    recentMeasurements: recentMeasurementsRes.data ?? [],
    hasGeminiKey: geminiKeyStatus === "valid",
    geminiKeyStatus,
  });
}

export async function POST(request: Request) {
  const supabase = await createClient();

  const [
    { data: claimsData, error: authError },
    {
      data: { session },
    },
  ] = await Promise.all([
    supabase.auth.getClaims(),
    supabase.auth.getSession(),
  ]);

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

  const parsed = CreateEntryInputSchema.safeParse(rawBody);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]?.message ?? "Neplatný záznam.";
    return NextResponse.json({ error: firstIssue }, { status: 400 });
  }

  const input = parsed.data;
  const extractedMeasurement = extractBodyMeasurementFromText(input.raw_text);

  let measurementSaved: BodyMeasurementRow | null = null;
  let updatedProfile: UserProfileRow | null = null;

  if (extractedMeasurement) {
    try {
      const syncResult = await upsertBodyMeasurementAndSyncProfile(
        supabase,
        userId,
        {
          measured_date: input.log_date,
          weight_kg: extractedMeasurement.weight_kg,
          waist_cm: extractedMeasurement.waist_cm,
          blood_pressure_sys: extractedMeasurement.blood_pressure_sys,
          blood_pressure_dia: extractedMeasurement.blood_pressure_dia,
          pulse_bpm: extractedMeasurement.pulse_bpm,
        }
      );
      measurementSaved = syncResult.measurement;
      updatedProfile = syncResult.updatedProfile;
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Nepodařilo se uložit měření.";
      return NextResponse.json({ error: msg }, { status: 500 });
    }

    // Pure body measurement (no food/activity left): return immediately without creating an empty log_entry!
    if (extractedMeasurement.remainingText.length < 2) {
      return NextResponse.json(
        {
          entry: null,
          measurementSaved,
          updatedProfile,
        },
        { status: 201 }
      );
    }
  }

  const textForLog = extractedMeasurement
    ? extractedMeasurement.remainingText
    : input.raw_text;
  const timeSlot = input.time_slot ?? detectTimeSlotForDate();

  if (input.image_base64) {
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("weight_kg, bmr_kcal")
      .eq("user_id", userId)
      .maybeSingle();

    const rawWeight = Number(profile?.weight_kg);
    const userWeightKg =
      Number.isFinite(rawWeight) && rawWeight > 0 ? rawWeight : 80;
    const rawBmr = Number(profile?.bmr_kcal);
    const userBmrKcal =
      Number.isFinite(rawBmr) && rawBmr > 0 ? rawBmr : undefined;

    let parsedResult;
    try {
      parsedResult = await parseEntryWithAgent({
        rawText: textForLog || "Fotka štítku nebo zařízení",
        imageBase64: input.image_base64,
        imageMimeType: input.image_mime_type,
        userWeightKg,
        userBmrKcal,
        fallbackTimeSlot: timeSlot,
      });
    } catch (parseErr) {
      const msg =
        parseErr instanceof Error
          ? parseErr.message
          : "Nepodařilo se analyzovat fotku.";
      return NextResponse.json({ error: msg }, { status: 422 });
    }

    if (parsedResult.detected_measurement) {
      const dm = parsedResult.detected_measurement;
      if (
        (dm.blood_pressure_sys != null && dm.blood_pressure_dia != null) ||
        dm.weight_kg != null
      ) {
        try {
          const syncResult = await upsertBodyMeasurementAndSyncProfile(
            supabase,
            userId,
            {
              measured_date: input.log_date,
              weight_kg: dm.weight_kg ?? undefined,
              blood_pressure_sys: dm.blood_pressure_sys ?? undefined,
              blood_pressure_dia: dm.blood_pressure_dia ?? undefined,
              pulse_bpm: dm.pulse_bpm ?? undefined,
            }
          );
          measurementSaved = syncResult.measurement;
          updatedProfile = syncResult.updatedProfile;
        } catch (err) {
          console.warn("Chyba při automatickém uložení měření z fotky:", err);
        }

        if (parsedResult.items.length === 0) {
          return NextResponse.json(
            {
              entry: null,
              measurementSaved,
              updatedProfile,
            },
            { status: 201 }
          );
        }
      }
    }

    const foodItems = parsedResult.items.filter((i) => i.item_kind === "food");
    const activityItems = parsedResult.items.filter((i) => i.item_kind === "activity");
    const entryType: EntryType = activityItems.length > 0 && foodItems.length === 0 ? "activity" : "food";

    const totalIntakeKcal = Math.max(
      0,
      Math.round(foodItems.reduce((sum, i) => sum + i.kcal, 0))
    );
    const totalBurnedKcal = Math.max(
      0,
      Math.round(activityItems.reduce((sum, i) => sum + i.burned_kcal, 0))
    );
    const totalProteinG = Math.round(foodItems.reduce((sum, i) => sum + i.protein_g, 0) * 10) / 10;
    const totalCarbsG = Math.round(foodItems.reduce((sum, i) => sum + i.carbs_g, 0) * 10) / 10;
    const totalFatG = Math.round(foodItems.reduce((sum, i) => sum + i.fat_g, 0) * 10) / 10;
    const totalFiberG = Math.round(foodItems.reduce((sum, i) => sum + i.fiber_g, 0) * 10) / 10;

    const summaryTitle = parsedResult.summary_title || "Záznam z fotky";
    const rawTextToSave = textForLog && textForLog.length > 0
      ? textForLog
      : summaryTitle;

    const { data: inserted, error: insertError } = await supabase
      .from("log_entries")
      .insert({
        user_id: userId,
        log_date: input.log_date,
        time_slot: timeSlot,
        raw_text: rawTextToSave,
        summary_title: summaryTitle,
        ai_notes: parsedResult.ai_notes ?? "Hodnoty vyčteny z fotky výživového štítku",
        entry_type: entryType,
        status: "done",
        processed_at: new Date().toISOString(),
        total_intake_kcal: totalIntakeKcal,
        total_burned_kcal: totalBurnedKcal,
        total_protein_g: totalProteinG,
        total_carbs_g: totalCarbsG,
        total_fat_g: totalFatG,
        total_fiber_g: totalFiberG,
      })
      .select("*")
      .single();

    if (insertError) {
      return NextResponse.json(
        { error: insertError.message },
        { status: 500 }
      );
    }

    const itemsPayload = parsedResult.items.map((item) => ({
      user_id: userId,
      log_entry_id: inserted.id,
      item_kind: item.item_kind,
      item_name: item.item_name,
      canonical_name: item.canonical_name,
      portion_grams: item.portion_grams != null ? Math.round(item.portion_grams) : null,
      duration_minutes: item.duration_minutes != null ? Math.round(item.duration_minutes) : null,
      met_value: item.met_value != null ? Math.round(item.met_value * 10) / 10 : null,
      kcal: Math.max(0, Math.round(item.kcal)),
      burned_kcal: Math.max(0, Math.round(item.burned_kcal)),
      protein_g: Math.round(item.protein_g * 10) / 10,
      carbs_g: Math.round(item.carbs_g * 10) / 10,
      fat_g: Math.round(item.fat_g * 10) / 10,
      fiber_g: Math.round(item.fiber_g * 10) / 10,
      confidence: item.confidence,
    }));

    if (itemsPayload.length > 0) {
      await supabase.from("entry_items").insert(itemsPayload);
    }

    await supabase.rpc("recalculate_daily_summary", {
      p_log_date: input.log_date,
    });

    const entryWithItems: LogEntryWithItems = {
      ...inserted,
      entry_items: itemsPayload.map((item, idx) => ({
        ...item,
        id: idx + 1,
        created_at: new Date().toISOString(),
      })),
    };

    return NextResponse.json(
      {
        entry: entryWithItems,
        measurementSaved,
        updatedProfile,
      },
      { status: 201 }
    );
  }

  const { data: inserted, error: insertError } = await supabase
    .from("log_entries")
    .insert({
      user_id: userId,
      log_date: input.log_date,
      time_slot: timeSlot,
      raw_text: textForLog,
      entry_type: "food",
      status: "pending",
      processed_at: new Date().toISOString(),
    })
    .select("*")
    .single();

  if (insertError) {
    return NextResponse.json(
      { error: insertError.message },
      { status: 500 }
    );
  }

  await supabase.rpc("recalculate_daily_summary", {
    p_log_date: input.log_date,
  });

  if (session?.access_token) {
    const accessToken = session.access_token;
    after(async () => {
      await processLogEntryInBackground({
        entryId: inserted.id,
        accessToken,
      });
    });
  }

  const entryWithItems: LogEntryWithItems = {
    ...inserted,
    entry_items: [],
  };

  return NextResponse.json(
    {
      entry: entryWithItems,
      measurementSaved,
      updatedProfile,
    },
    { status: 201 }
  );
}
