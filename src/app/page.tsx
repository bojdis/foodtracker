import { createClient } from "@/lib/supabase/server";
import { AuthScreen } from "@/components/AuthScreen";
import { TrackerApp } from "@/components/TrackerApp";

interface HomePageProps {
  searchParams?: Promise<{ authError?: string }>;
}

export default async function HomePage({ searchParams }: HomePageProps) {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const claims = claimsData?.claims;

  if (!claims?.sub) {
    const resolvedParams = searchParams ? await searchParams : undefined;
    return <AuthScreen initialError={resolvedParams?.authError ?? null} />;
  }

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("*")
    .eq("user_id", claims.sub)
    .maybeSingle();

  return (
    <TrackerApp
      userId={claims.sub}
      userEmail={claims.email}
      initialProfile={profile ?? null}
    />
  );
}
