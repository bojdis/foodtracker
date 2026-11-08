"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Flame,
  Lock,
  KeyRound,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Sparkles,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [hasValidSession, setHasValidSession] = useState(false);

  useEffect(() => {
    const supabase = createClient();

    async function checkAuth() {
      try {
        const { data } = await supabase.auth.getSession();
        if (data.session) {
          setHasValidSession(true);
          setCheckingSession(false);
          return;
        }
      } catch {
        // silent
      }

      // Listen for auth state change in case hash token is being processed
      const { data: authListener } = supabase.auth.onAuthStateChange(
        (event, session) => {
          if (session || event === "PASSWORD_RECOVERY") {
            setHasValidSession(true);
          }
          setCheckingSession(false);
        }
      );

      // Fallback timeout in case no session exists
      const timer = setTimeout(() => {
        setCheckingSession(false);
      }, 1500);

      return () => {
        authListener.subscription.unsubscribe();
        clearTimeout(timer);
      };
    }

    void checkAuth();
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (password.length < 6) {
      setError("Nové heslo musí mít alespoň 6 znaků.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Hesla se neshodují. Zkontroluj prosím obě pole.");
      return;
    }

    setLoading(true);
    try {
      const supabase = createClient();
      const { error: updateError } = await supabase.auth.updateUser({
        password,
      });

      if (updateError) {
        const msg = updateError.message.toLowerCase();
        if (msg.includes("password should be at least")) {
          setError("Heslo musí mít alespoň 6 znaků.");
        } else if (msg.includes("same password")) {
          setError("Nové heslo musí být jiné než to původní.");
        } else {
          setError(updateError.message);
        }
        return;
      }

      setSuccess(true);
      setTimeout(() => {
        router.push("/");
        router.refresh();
      }, 1800);
    } catch {
      setError("Nepodařilo se změnit heslo. Zkontroluj připojení k internetu.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-10 pt-safe pb-safe">
      <div className="w-full max-w-md">
        <div className="mb-7 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-500/25">
            <Flame className="h-8 w-8" />
          </div>
          <div className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-300">
            <Sparkles className="h-3.5 w-3.5" />
            Zabezpečení účtu
          </div>
          <h1 className="mt-3 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Nastavení nového hesla
          </h1>
          <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400">
            Zadej své nové heslo pro přihlášení do aplikace FoodTracker.
          </p>
        </div>

        <div className="rounded-3xl border border-slate-200/80 bg-white/90 p-6 shadow-xl shadow-slate-900/5 backdrop-blur-xl dark:border-slate-800/80 dark:bg-slate-900/85">
          {checkingSession ? (
            <div className="flex flex-col items-center justify-center py-8 text-center text-sm text-slate-500">
              <Loader2 className="mb-2 h-6 w-6 animate-spin text-emerald-500" />
              <span>Ověřuji bezpečnostní odkaz…</span>
            </div>
          ) : !hasValidSession ? (
            <div className="space-y-4 text-center">
              <div className="flex items-start gap-2.5 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3.5 text-left text-sm text-amber-800 dark:text-amber-200">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                <span>
                  Odkaz pro obnovení hesla je neplatný nebo již vypršel. Požádej
                  prosím o nový odkaz na přihlašovací obrazovce.
                </span>
              </div>
              <Link
                href="/"
                className="inline-flex items-center justify-center rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100"
              >
                Přejít na přihlášení
              </Link>
            </div>
          ) : success ? (
            <div className="space-y-4 py-4 text-center">
              <div className="flex items-start gap-2.5 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-3.5 text-left text-sm text-emerald-800 dark:text-emerald-200">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                <span>
                  Heslo bylo úspěšně změněno! Za okamžik tě přesměrujeme do
                  aplikace…
                </span>
              </div>
              <Link
                href="/"
                className="inline-flex items-center justify-center rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-600 px-5 py-3 text-sm font-semibold text-white shadow-md shadow-emerald-500/25 transition hover:from-emerald-600 hover:to-teal-700"
              >
                Vstoupit do FoodTrackeru
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="flex items-start gap-2.5 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-3.5 text-sm text-rose-700 dark:text-rose-200">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" />
                  <span>{error}</span>
                </div>
              )}

              <div>
                <label
                  htmlFor="new-password"
                  className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400"
                >
                  Nové heslo
                </label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    id="new-password"
                    type="password"
                    autoComplete="new-password"
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Minimálně 6 znaků"
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-4 text-base text-slate-900 outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-700/80 dark:bg-slate-950/60 dark:text-white dark:focus:border-emerald-400"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="confirm-password"
                  className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400"
                >
                  Potvrzení nového hesla
                </label>
                <div className="relative">
                  <KeyRound className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    id="confirm-password"
                    type="password"
                    autoComplete="new-password"
                    required
                    minLength={6}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Zadej heslo znovu"
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-4 text-base text-slate-900 outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-700/80 dark:bg-slate-950/60 dark:text-white dark:focus:border-emerald-400"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-600 px-4 py-3.5 text-sm font-semibold text-white shadow-lg shadow-emerald-500/25 transition hover:from-emerald-600 hover:to-teal-700 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                Uložit nové heslo
              </button>

              <div className="pt-2 text-center">
                <Link
                  href="/"
                  className="text-xs font-semibold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
                >
                  ← Zpět na přihlašovací obrazovku
                </Link>
              </div>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
