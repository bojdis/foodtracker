import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const PatchActivityTemplateSchema = z
  .object({
    is_quick_check: z.boolean().optional(),
    is_hidden: z.boolean().optional(),
  })
  .refine(
    (val) => val.is_quick_check !== undefined || val.is_hidden !== undefined,
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

  const updatePayload: {
    is_quick_check?: boolean;
    is_hidden?: boolean;
    updated_at: string;
  } = {
    updated_at: new Date().toISOString(),
  };

  if (parsed.data.is_quick_check !== undefined) {
    updatePayload.is_quick_check = parsed.data.is_quick_check;
  }
  if (parsed.data.is_hidden !== undefined) {
    updatePayload.is_hidden = parsed.data.is_hidden;
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
