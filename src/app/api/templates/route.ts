import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/database.types";
import { generateMealEmbedding } from "@/lib/agents/habit-detector";
import { CreateMealTemplateSchema, type TemplateItemSnapshot } from "@/lib/types";

function round1(val: number): number {
  if (!Number.isFinite(val) || val < 0) return 0;
  return Math.round(val * 10) / 10;
}

function normalizeAliases(raw: string[]): string[] {
  const seen = new Set<string>();
  const clean: string[] = [];
  for (const item of raw) {
    const trimmed = item.trim();
    const key = trimmed.toLowerCase();
    if (trimmed.length >= 2 && !seen.has(key)) {
      seen.add(key);
      clean.push(trimmed);
    }
  }
  return clean;
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

  const parsed = CreateMealTemplateSchema.safeParse(rawBody);
  if (!parsed.success) {
    const firstIssue =
      parsed.error.issues[0]?.message ?? "Neplatná data oblíbeného jídla.";
    return NextResponse.json({ error: firstIssue }, { status: 400 });
  }

  const input = parsed.data;
  const canonicalName = input.canonical_name.trim();
  const shortcutAliases = normalizeAliases(input.shortcut_aliases);
  const kcal = Math.max(0, Math.round(input.avg_kcal));
  const proteinG = round1(input.avg_protein_g);
  const carbsG = round1(input.avg_carbs_g);
  const fatG = round1(input.avg_fat_g);
  const fiberG = round1(input.avg_fiber_g);
  const portionGrams = input.avg_portion_grams ?? null;

  const itemLabel =
    portionGrams !== null
      ? `${canonicalName} (${portionGrams} g)`
      : canonicalName;

  const templateItems: TemplateItemSnapshot[] = [
    {
      item_name: itemLabel,
      canonical_name: canonicalName,
      portion_grams: portionGrams,
      kcal,
      protein_g: proteinG,
      carbs_g: carbsG,
      fat_g: fatG,
      fiber_g: fiberG,
    },
  ];

  // Check for existing template with the same case-insensitive name for this user
  const { data: existingList, error: existingErr } = await supabase
    .from("meal_templates")
    .select("*")
    .eq("user_id", userId)
    .ilike("canonical_name", canonicalName)
    .limit(5);

  if (existingErr) {
    return NextResponse.json({ error: existingErr.message }, { status: 500 });
  }

  const exactExisting = (existingList ?? []).find(
    (t) => t.canonical_name.toLowerCase() === canonicalName.toLowerCase()
  );

  const nowIso = new Date().toISOString();

  if (exactExisting && !exactExisting.is_hidden) {
    return NextResponse.json(
      { error: `Oblíbené jídlo „${exactExisting.canonical_name}“ už máš.` },
      { status: 409 }
    );
  }

  const embedding = await generateMealEmbedding(canonicalName);
  const serializedEmbedding = embedding ? JSON.stringify(embedding) : null;

  if (exactExisting && exactExisting.is_hidden) {
    const { data: restored, error: restoreErr } = await supabase
      .from("meal_templates")
      .update({
        canonical_name: canonicalName,
        normalized_items_summary: canonicalName,
        typical_time_slot: input.typical_time_slot,
        is_hidden: false,
        is_quick_check: input.is_quick_check,
        occurrence_count: Math.max(exactExisting.occurrence_count, 3),
        avg_portion_grams: portionGrams,
        avg_kcal: kcal,
        avg_protein_g: proteinG,
        avg_carbs_g: carbsG,
        avg_fat_g: fatG,
        avg_fiber_g: fiberG,
        shortcut_aliases: shortcutAliases,
        preset_notes: input.preset_notes?.trim() || null,
        template_items: templateItems as unknown as Json,
        ...(serializedEmbedding ? { embedding: serializedEmbedding } : {}),
        updated_at: nowIso,
      })
      .eq("id", exactExisting.id)
      .eq("user_id", userId)
      .select("*")
      .single();

    if (restoreErr) {
      return NextResponse.json({ error: restoreErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, template: restored }, { status: 201 });
  }

  const { data: inserted, error: insertErr } = await supabase
    .from("meal_templates")
    .insert({
      user_id: userId,
      canonical_name: canonicalName,
      normalized_items_summary: canonicalName,
      typical_time_slot: input.typical_time_slot,
      occurrence_count: input.is_quick_check ? 3 : 1,
      is_quick_check: input.is_quick_check,
      is_hidden: false,
      avg_portion_grams: portionGrams,
      avg_kcal: kcal,
      avg_protein_g: proteinG,
      avg_carbs_g: carbsG,
      avg_fat_g: fatG,
      avg_fiber_g: fiberG,
      shortcut_aliases: shortcutAliases,
      preset_notes: input.preset_notes?.trim() || null,
      template_items: templateItems as unknown as Json,
      embedding: serializedEmbedding,
      last_eaten_at: nowIso,
    })
    .select("*")
    .single();

  if (insertErr) {
    if (insertErr.code === "23505") {
      return NextResponse.json(
        { error: `Oblíbené jídlo „${canonicalName}“ už máš.` },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, template: inserted }, { status: 201 });
}
