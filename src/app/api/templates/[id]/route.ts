import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { Database, Json } from "@/lib/database.types";
import type { TemplateItemSnapshot } from "@/lib/types";

const PatchTemplateSchema = z
  .object({
    is_quick_check: z.boolean().optional(),
    is_hidden: z.boolean().optional(),
    canonical_name: z.string().trim().min(1).max(80).optional(),
    typical_time_slot: z
      .enum(["morning", "lunch", "snack", "evening", "anytime"])
      .optional(),
    avg_portion_grams: z.coerce
      .number()
      .int()
      .min(1)
      .max(5000)
      .nullable()
      .optional(),
    avg_kcal: z.coerce.number().int().min(0).max(10000).optional(),
    avg_protein_g: z.coerce.number().min(0).max(500).optional(),
    avg_carbs_g: z.coerce.number().min(0).max(1000).optional(),
    avg_fat_g: z.coerce.number().min(0).max(500).optional(),
    avg_fiber_g: z.coerce.number().min(0).max(200).optional(),
    shortcut_aliases: z
      .array(z.string().trim().min(2).max(60))
      .max(15)
      .optional(),
    preset_notes: z.string().trim().max(240).nullable().optional(),
  })
  .refine(
    (val) =>
      val.is_quick_check !== undefined ||
      val.is_hidden !== undefined ||
      val.canonical_name !== undefined ||
      val.typical_time_slot !== undefined ||
      val.avg_portion_grams !== undefined ||
      val.avg_kcal !== undefined ||
      val.avg_protein_g !== undefined ||
      val.avg_carbs_g !== undefined ||
      val.avg_fat_g !== undefined ||
      val.avg_fiber_g !== undefined ||
      val.shortcut_aliases !== undefined ||
      val.preset_notes !== undefined,
    { message: "Chybí pole k úpravě šablony." }
  );

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const templateId = Number.parseInt(id, 10);
  if (!Number.isInteger(templateId) || templateId <= 0) {
    return NextResponse.json(
      { error: "Neplatné ID šablony." },
      { status: 400 }
    );
  }

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

  const parsed = PatchTemplateSchema.safeParse(rawBody);
  if (!parsed.success) {
    const firstIssue =
      parsed.error.issues[0]?.message ?? "Neplatná data pro úpravu šablony.";
    return NextResponse.json({ error: firstIssue }, { status: 400 });
  }

  const updatePayload: Database["public"]["Tables"]["meal_templates"]["Update"] =
    {
      updated_at: new Date().toISOString(),
    };

  if (parsed.data.is_quick_check !== undefined) {
    updatePayload.is_quick_check = parsed.data.is_quick_check;
  }
  if (parsed.data.is_hidden !== undefined) {
    updatePayload.is_hidden = parsed.data.is_hidden;
  }
  if (parsed.data.canonical_name !== undefined) {
    updatePayload.canonical_name = parsed.data.canonical_name;
  }
  if (parsed.data.typical_time_slot !== undefined) {
    updatePayload.typical_time_slot = parsed.data.typical_time_slot;
  }
  if (parsed.data.avg_portion_grams !== undefined) {
    updatePayload.avg_portion_grams = parsed.data.avg_portion_grams;
  }
  if (parsed.data.avg_kcal !== undefined) {
    updatePayload.avg_kcal = Math.round(parsed.data.avg_kcal);
  }
  if (parsed.data.avg_protein_g !== undefined) {
    updatePayload.avg_protein_g = Math.round(parsed.data.avg_protein_g * 10) / 10;
  }
  if (parsed.data.avg_carbs_g !== undefined) {
    updatePayload.avg_carbs_g = Math.round(parsed.data.avg_carbs_g * 10) / 10;
  }
  if (parsed.data.avg_fat_g !== undefined) {
    updatePayload.avg_fat_g = Math.round(parsed.data.avg_fat_g * 10) / 10;
  }
  if (parsed.data.avg_fiber_g !== undefined) {
    updatePayload.avg_fiber_g = Math.round(parsed.data.avg_fiber_g * 10) / 10;
  }
  if (parsed.data.shortcut_aliases !== undefined) {
    const seen = new Set<string>();
    const cleanAliases: string[] = [];
    for (const a of parsed.data.shortcut_aliases) {
      const trimmed = a.trim();
      const lower = trimmed.toLowerCase();
      if (trimmed.length >= 2 && !seen.has(lower)) {
        seen.add(lower);
        cleanAliases.push(trimmed);
      }
    }
    updatePayload.shortcut_aliases = cleanAliases;
  }
  if (parsed.data.preset_notes !== undefined) {
    updatePayload.preset_notes = parsed.data.preset_notes?.trim() || null;
  }

  // If nutrition values were edited, keep single-item snapshot in sync for 1-tap logging
  const nutritionEdited =
    parsed.data.avg_kcal !== undefined ||
    parsed.data.avg_protein_g !== undefined ||
    parsed.data.avg_carbs_g !== undefined ||
    parsed.data.avg_fat_g !== undefined ||
    parsed.data.avg_fiber_g !== undefined ||
    parsed.data.avg_portion_grams !== undefined;

  if (nutritionEdited) {
    const { data: existingTpl } = await supabase
      .from("meal_templates")
      .select("*")
      .eq("id", templateId)
      .eq("user_id", userId)
      .maybeSingle();

    if (!existingTpl) {
      return NextResponse.json(
        { error: "Šablona jídla nebyla nalezena." },
        { status: 404 }
      );
    }

    const name = updatePayload.canonical_name ?? existingTpl.canonical_name;
    const portion =
      updatePayload.avg_portion_grams !== undefined
        ? updatePayload.avg_portion_grams
        : existingTpl.avg_portion_grams;
    const snapshot: TemplateItemSnapshot[] = [
      {
        item_name: portion !== null ? `${name} (${portion} g)` : name,
        canonical_name: name,
        portion_grams: portion,
        kcal: updatePayload.avg_kcal ?? existingTpl.avg_kcal,
        protein_g:
          updatePayload.avg_protein_g ?? Number(existingTpl.avg_protein_g),
        carbs_g: updatePayload.avg_carbs_g ?? Number(existingTpl.avg_carbs_g),
        fat_g: updatePayload.avg_fat_g ?? Number(existingTpl.avg_fat_g),
        fiber_g: updatePayload.avg_fiber_g ?? Number(existingTpl.avg_fiber_g),
      },
    ];
    updatePayload.template_items = snapshot as unknown as Json;
  }

  const { data: template, error: updateError } = await supabase
    .from("meal_templates")
    .update(updatePayload)
    .eq("id", templateId)
    .eq("user_id", userId)
    .select("*")
    .maybeSingle();

  if (updateError) {
    if (updateError.code === "23505") {
      return NextResponse.json(
        { error: "Oblíbené jídlo s tímto názvem už máš." },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }
  if (!template) {
    return NextResponse.json(
      { error: "Šablona jídla nebyla nalezena." },
      { status: 404 }
    );
  }

  return NextResponse.json({ ok: true, template });
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const templateId = Number.parseInt(id, 10);
  if (!Number.isInteger(templateId) || templateId <= 0) {
    return NextResponse.json(
      { error: "Neplatné ID šablony." },
      { status: 400 }
    );
  }

  const supabase = await createClient();
  const { data: claimsData, error: authError } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;

  if (authError || !userId) {
    return NextResponse.json(
      { error: "Nepřihlášený uživatel." },
      { status: 401 }
    );
  }

  const { error: deleteError } = await supabase
    .from("meal_templates")
    .delete()
    .eq("id", templateId)
    .eq("user_id", userId);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
