import { createClient as createSupabaseJsClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

/**
 * Creates a stateless Supabase client authenticated with the user's JWT access token.
 * Safe to use inside Next.js `after()` background callbacks after HTTP headers/cookies are sent.
 */
export function createBackgroundClient(accessToken: string) {
  return createSupabaseJsClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    }
  );
}
