import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveCanonicalActivityIdentity } from "@/lib/agents/habit-detector";
import { CreateActivityTemplateSchema } from "@/lib/types";

function round1(val: number): number {
  if (!Number.isFinite(val) || val < 0) return 0;
  return Math.round(val * 10) / 10;
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

  const parsed = CreateActivityTemplateSchema.safeParse(rawBody);
  if (!parsed.success) {
    const firstIssue =
      parsed.error.issues[0]?.message ?? "Neplatná data oblíbené aktivity.";
    return NextResponse.json({ error: firstIssue }, { status: 400 });
  }

  const input = parsed.data;
  const canonicalName = input.canonical_name.trim();
  const identity = resolveCanonicalActivityIdentity(canonicalName);

  // If user creates an activity whose canonical identity maps to one of the standard
  // signatures (e.g. "Běh"), check if they already have it; if they create a custom
  // variation with a different name and the signature already exists, disambiguate cleanly.
  const baseSignature = identity.signature;

  const { data: existingWithSig, error: existingErr } = await supabase
    .from("activity_templates")
    .select("*")
    .eq("user_id", userId)
    .eq("normalized_signature", baseSignature)
    .maybeSingle();

  if (existingErr) {
    return NextResponse.json({ error: existingErr.message }, { status: 500 });
  }

  const nowIso = new Date().toISOString();
  const metLight = round1(input.met_light);
  const metMedium = round1(input.met_medium);
  const metHigh = round1(input.met_high);
  const maxMinutes = Math.max(input.max_minutes, input.default_minutes + 30);

  let targetSignature = baseSignature;

  if (existingWithSig) {
    const sameName =
      existingWithSig.canonical_name.toLowerCase() ===
      canonicalName.toLowerCase();

    if (sameName && !existingWithSig.is_hidden) {
      return NextResponse.json(
        { error: `Aktivitu „${existingWithSig.canonical_name}“ už máš.` },
        { status: 409 }
      );
    }

    if (sameName && existingWithSig.is_hidden) {
      const { data: restored, error: restoreErr } = await supabase
        .from("activity_templates")
        .update({
          canonical_name: canonicalName,
          icon_key: input.icon_key,
          is_hidden: false,
          is_quick_check: input.is_quick_check,
          occurrence_count: Math.max(existingWithSig.occurrence_count, 3),
          default_minutes: input.default_minutes,
          max_minutes: maxMinutes,
          default_intensity: input.default_intensity,
          met_light: metLight,
          met_medium: metMedium,
          met_high: metHigh,
          updated_at: nowIso,
        })
        .eq("id", existingWithSig.id)
        .eq("user_id", userId)
        .select("*")
        .single();

      if (restoreErr) {
        return NextResponse.json({ error: restoreErr.message }, { status: 500 });
      }
      return NextResponse.json(
        { ok: true, activityTemplate: restored },
        { status: 201 }
      );
    }

    // Different name mapped to same stem -> generate a distinct signature
    targetSignature = `${baseSignature}_${Date.now().toString(36)}`;
  }

  const { data: inserted, error: insertErr } = await supabase
    .from("activity_templates")
    .insert({
      user_id: userId,
      canonical_name: canonicalName,
      normalized_signature: targetSignature,
      icon_key: input.icon_key,
      occurrence_count: input.is_quick_check ? 3 : 1,
      is_quick_check: input.is_quick_check,
      is_hidden: false,
      default_minutes: input.default_minutes,
      max_minutes: maxMinutes,
      default_intensity: input.default_intensity,
      met_light: metLight,
      met_medium: metMedium,
      met_high: metHigh,
      last_done_at: nowIso,
    })
    .select("*")
    .single();

  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  return NextResponse.json(
    { ok: true, activityTemplate: inserted },
    { status: 201 }
  );
}
