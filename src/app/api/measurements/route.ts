import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { BodyMeasurementInputSchema } from "@/lib/types";
import { getTodayDateString, shiftDateString } from "@/lib/calculations";
import { upsertBodyMeasurementAndSyncProfile } from "@/lib/measurements-service";

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

  const daysParam = request.nextUrl.searchParams.get("days") ?? "90";
  const isAll = daysParam === "all" || daysParam === "0";
  const rawDays = Number(daysParam);
  const days = Number.isFinite(rawDays)
    ? Math.min(730, Math.max(7, Math.round(rawDays)))
    : 90;

  const today = getTodayDateString();
  const fromDate = isAll ? null : shiftDateString(today, -(days - 1));

  let measurementsQuery = supabase
    .from("body_measurements")
    .select("*")
    .eq("user_id", userId)
    .order("measured_date", { ascending: true });

  let summariesQuery = supabase
    .from("daily_summaries")
    .select("*")
    .eq("user_id", userId)
    .order("log_date", { ascending: true });

  if (fromDate) {
    measurementsQuery = measurementsQuery.gte("measured_date", fromDate);
    summariesQuery = summariesQuery.gte("log_date", fromDate);
  }

  const [measurementsRes, summariesRes] = await Promise.all([
    measurementsQuery,
    summariesQuery,
  ]);

  if (measurementsRes.error) {
    return NextResponse.json(
      { error: measurementsRes.error.message },
      { status: 500 }
    );
  }
  if (summariesRes.error) {
    return NextResponse.json(
      { error: summariesRes.error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    measurements: measurementsRes.data ?? [],
    dailySummaries: summariesRes.data ?? [],
  });
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

  const parsed = BodyMeasurementInputSchema.safeParse(rawBody);
  if (!parsed.success) {
    const firstIssue =
      parsed.error.issues[0]?.message ?? "Neplatné hodnoty měření.";
    return NextResponse.json({ error: firstIssue }, { status: 400 });
  }

  try {
    const { measurement, updatedProfile } =
      await upsertBodyMeasurementAndSyncProfile(supabase, userId, parsed.data);

    return NextResponse.json({
      measurement,
      updatedProfile,
    });
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : "Nepodařilo se uložit měření.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const supabase = await createClient();
  const { data: claimsData, error: authError } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;

  if (authError || !userId) {
    return NextResponse.json(
      { error: "Nepřihlášený uživatel." },
      { status: 401 }
    );
  }

  const id = Number(request.nextUrl.searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json(
      { error: "Neplatné ID měření." },
      { status: 400 }
    );
  }

  const { error } = await supabase
    .from("body_measurements")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
