import { after, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { processLogEntryInBackground } from "@/lib/agents/orchestrator";

interface RouteContext {
  params: Promise<{ id: string }>;
}

function parseEntryId(rawId: string): number | null {
  const num = Number.parseInt(rawId, 10);
  if (!Number.isInteger(num) || num <= 0) {
    return null;
  }
  return num;
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const entryId = parseEntryId(id);
  if (!entryId) {
    return NextResponse.json({ error: "Neplatné ID záznamu." }, { status: 400 });
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

  const { data: existing, error: findError } = await supabase
    .from("log_entries")
    .select("id, log_date")
    .eq("id", entryId)
    .eq("user_id", userId)
    .maybeSingle();

  if (findError) {
    return NextResponse.json({ error: findError.message }, { status: 500 });
  }
  if (!existing) {
    return NextResponse.json(
      { error: "Záznam nebyl nalezen." },
      { status: 404 }
    );
  }

  const { error: deleteError } = await supabase
    .from("log_entries")
    .delete()
    .eq("id", entryId)
    .eq("user_id", userId);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  const { data: summary, error: rpcError } = await supabase.rpc(
    "recalculate_daily_summary",
    {
      p_log_date: existing.log_date,
    }
  );

  if (rpcError) {
    return NextResponse.json({ error: rpcError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, summary });
}

export async function POST(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const entryId = parseEntryId(id);
  if (!entryId) {
    return NextResponse.json({ error: "Neplatné ID záznamu." }, { status: 400 });
  }

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

  const { data: existing, error: findError } = await supabase
    .from("log_entries")
    .select("id, log_date")
    .eq("id", entryId)
    .eq("user_id", userId)
    .maybeSingle();

  if (findError) {
    return NextResponse.json({ error: findError.message }, { status: 500 });
  }
  if (!existing) {
    return NextResponse.json(
      { error: "Záznam nebyl nalezen." },
      { status: 404 }
    );
  }

  const { error: updateError } = await supabase
    .from("log_entries")
    .update({
      status: "pending",
      processed_at: new Date().toISOString(),
      error_message: null,
    })
    .eq("id", entryId)
    .eq("user_id", userId);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  await supabase.rpc("recalculate_daily_summary", {
    p_log_date: existing.log_date,
  });

  if (session?.access_token) {
    const accessToken = session.access_token;
    after(async () => {
      await processLogEntryInBackground({
        entryId,
        accessToken,
      });
    });
  }

  return NextResponse.json({ ok: true });
}
