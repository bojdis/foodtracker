import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/database.types";

const PatchActivityTemplateSchema = z
  .object({
    is_quick_check: z.boolean().optional(),
    is_hidden: z.boolean().optional(),
    canonical_name: z.string().trim().min(1).max(48).optional(),
    icon_key: z
      .enum(["bike", "climb", "gym", "swim", "walk", "run", "activity"])
      .optional(),
    default_minutes: z.coerce.number().int().min(10).max(360).optional(),
    default_intensity: z.enum(["light", "medium", "high"]).optional(),
    met_light: z.coerce.number().min(1.5).max(18).optional(),
    met_medium: z.coerce.number().min(1.5).max(18).optional(),
    met_high: z.coerce.number().min(1.5).max(18).optional(),
  })
  .refine(
    (val) =>
      val.is_quick_check !== undefined ||
      val.is_hidden !== undefined ||
      val.canonical_name !== undefined ||
      val.icon_key !== undefined ||
      val.default_minutes !== undefined ||
      val.default_intensity !== undefined ||
      val.met_light !== undefined ||
      val.met_medium !== undefined ||
      val.met_high !== undefined,
    { message: "Chybí pole k úpravě šablony aktivity." }
  );

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const templateId = Number.parseInt(id, 10);
  if (!Number.isInteger(templateId) || templateId <= 0) {
    return NextResponse.json(
      { error: "Neplatné ID šablony aktivity." },
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

  const parsed = PatchActivityTemplateSchema.safeParse(rawBody);
  if (!parsed.success) {
    const firstIssue =
      parsed.error.issues[0]?.message ?? "Neplatná data pro úpravu aktivity.";
    return NextResponse.json({ error: firstIssue }, { status: 400 });
  }

  const updatePayload: Database["public"]["Tables"]["activity_templates"]["Update"] =
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
  if (parsed.data.icon_key !== undefined) {
    updatePayload.icon_key = parsed.data.icon_key;
  }
  if (parsed.data.default_minutes !== undefined) {
    updatePayload.default_minutes = parsed.data.default_minutes;
  }
  if (parsed.data.default_intensity !== undefined) {
    updatePayload.default_intensity = parsed.data.default_intensity;
  }
  if (parsed.data.met_light !== undefined) {
    updatePayload.met_light = Math.round(parsed.data.met_light * 10) / 10;
  }
  if (parsed.data.met_medium !== undefined) {
    updatePayload.met_medium = Math.round(parsed.data.met_medium * 10) / 10;
  }
  if (parsed.data.met_high !== undefined) {
    updatePayload.met_high = Math.round(parsed.data.met_high * 10) / 10;
  }

  const { data: activityTemplate, error: updateError } = await supabase
    .from("activity_templates")
    .update(updatePayload)
    .eq("id", templateId)
    .eq("user_id", userId)
    .select("*")
    .maybeSingle();

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }
  if (!activityTemplate) {
    return NextResponse.json(
      { error: "Šablona aktivity nebyla nalezena." },
      { status: 404 }
    );
  }

  return NextResponse.json({ ok: true, activityTemplate });
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const templateId = Number.parseInt(id, 10);
  if (!Number.isInteger(templateId) || templateId <= 0) {
    return NextResponse.json(
      { error: "Neplatné ID šablony aktivity." },
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
    .from("activity_templates")
    .delete()
    .eq("id", templateId)
    .eq("user_id", userId);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
