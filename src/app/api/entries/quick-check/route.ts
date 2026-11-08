import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/database.types";
import {
  QuickCheckToggleSchema,
  type LogEntryWithItems,
  type TemplateItemSnapshot,
} from "@/lib/types";

function parseTemplateItems(raw: Json): TemplateItemSnapshot[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  const snapshots: TemplateItemSnapshot[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      continue;
    }
    const record = item as Record<string, unknown>;
    const itemName =
      typeof record.item_name === "string" && record.item_name.trim()
        ? record.item_name
        : null;
    if (!itemName) {
      continue;
    }

    const canonicalName =
      typeof record.canonical_name === "string" && record.canonical_name.trim()
        ? record.canonical_name
        : itemName;

    snapshots.push({
      item_name: itemName,
      canonical_name: canonicalName,
      portion_grams:
        typeof record.portion_grams === "number" ? record.portion_grams : null,
      kcal: typeof record.kcal === "number" ? record.kcal : 0,
      protein_g: typeof record.protein_g === "number" ? record.protein_g : 0,
      carbs_g: typeof record.carbs_g === "number" ? record.carbs_g : 0,
      fat_g: typeof record.fat_g === "number" ? record.fat_g : 0,
      fiber_g: typeof record.fiber_g === "number" ? record.fiber_g : 0,
    });
  }

  return snapshots;
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

  const parsed = QuickCheckToggleSchema.safeParse(rawBody);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]?.message ?? "Neplatná data.";
    return NextResponse.json({ error: firstIssue }, { status: 400 });
  }

  const input = parsed.data;

  if (input.checked) {
    const { data: template, error: templateError } = await supabase
      .from("meal_templates")
      .select("*")
      .eq("id", input.template_id)
      .eq("user_id", userId)
      .maybeSingle();

    if (templateError) {
      return NextResponse.json(
        { error: templateError.message },
        { status: 500 }
      );
    }

    if (!template) {
      return NextResponse.json(
        { error: "Šablona jídla nebyla nalezena." },
        { status: 404 }
      );
    }

    const nowIso = new Date().toISOString();

    const { data: insertedEntry, error: insertError } = await supabase
      .from("log_entries")
      .insert({
        user_id: userId,
        log_date: input.log_date,
        logged_at: nowIso,
        processed_at: nowIso,
        status: "done",
        entry_type: "quick_check",
        raw_text: template.canonical_name,
        summary_title: template.canonical_name,
        meal_template_id: template.id,
        time_slot: template.typical_time_slot,
        total_intake_kcal: Math.round(template.avg_kcal),
        total_burned_kcal: 0,
        total_protein_g: template.avg_protein_g,
        total_carbs_g: template.avg_carbs_g,
        total_fat_g: template.avg_fat_g,
        total_fiber_g: template.avg_fiber_g,
        ai_notes: "Zapsáno jedním klikem ze tvých pravidelných jídel (0 AI tokenů).",
      })
      .select("*")
      .single();

    if (insertError) {
      return NextResponse.json(
        { error: insertError.message },
        { status: 500 }
      );
    }

    const templateItems = parseTemplateItems(template.template_items);
    const itemsToInsert =
      templateItems.length > 0
        ? templateItems.map((item) => ({
            user_id: userId,
            log_entry_id: insertedEntry.id,
            item_kind: "food" as const,
            item_name: item.item_name,
            canonical_name: item.canonical_name,
            portion_grams:
              item.portion_grams !== null ? Math.round(item.portion_grams) : null,
            kcal: Math.round(item.kcal),
            burned_kcal: 0,
            protein_g: item.protein_g,
            carbs_g: item.carbs_g,
            fat_g: item.fat_g,
            fiber_g: item.fiber_g,
            confidence: 1,
          }))
        : [
            {
              user_id: userId,
              log_entry_id: insertedEntry.id,
              item_kind: "food" as const,
              item_name: template.canonical_name,
              canonical_name: template.canonical_name,
              portion_grams:
                template.avg_portion_grams !== null
                  ? Math.round(template.avg_portion_grams)
                  : null,
              kcal: Math.round(template.avg_kcal),
              burned_kcal: 0,
              protein_g: template.avg_protein_g,
              carbs_g: template.avg_carbs_g,
              fat_g: template.avg_fat_g,
              fiber_g: template.avg_fiber_g,
              confidence: 1,
            },
          ];

    const { data: insertedItems } = await supabase
      .from("entry_items")
      .insert(itemsToInsert)
      .select("*");

    const nextCount = template.occurrence_count + 1;
    await supabase
      .from("meal_templates")
      .update({
        occurrence_count: nextCount,
        last_eaten_at: nowIso,
        updated_at: nowIso,
      })
      .eq("id", template.id)
      .eq("user_id", userId);

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
      entry_items: insertedItems ?? [],
    };

    return NextResponse.json({
      ok: true,
      entry: entryWithItems,
      summary,
    });
  }

  // checked === false: remove the single most recent matching row (decrement count by 1)
  const { data: matchingEntries, error: fetchError } = await supabase
    .from("log_entries")
    .select("id, entry_type")
    .eq("user_id", userId)
    .eq("log_date", input.log_date)
    .eq("meal_template_id", input.template_id)
    .order("logged_at", { ascending: false });

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  const targetEntry =
    matchingEntries?.find((entry) => entry.entry_type === "quick_check") ??
    matchingEntries?.[0];

  if (targetEntry) {
    const { error: deleteError } = await supabase
      .from("log_entries")
      .delete()
      .eq("id", targetEntry.id)
      .eq("user_id", userId);

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }
  }

  const { data: summary, error: rpcError } = await supabase.rpc(
    "recalculate_daily_summary",
    {
      p_log_date: input.log_date,
    }
  );

  if (rpcError) {
    return NextResponse.json({ error: rpcError.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    removedEntryId: targetEntry?.id ?? null,
    summary,
  });
}
