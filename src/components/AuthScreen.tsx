"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  Flame,
  Lock,
  Mail,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

interface AuthScreenProps {
  initialError?: string | null;
}

function translateAuthError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("invalid login credentials")) {
    return "Nesprávný e-mail nebo heslo.";
  }
  if (lower.includes("email not confirmed")) {
    return "E-mail zatím nebyl potvrzen. Zkontroluj prosím doručenou poštu.";
  }
  if (lower.includes("user already registered")) {
    return "Tento e-mail je již zaregistrovaný. Přepni prosím na Přihlášení.";
  }
  if (lower.includes("password should be at least")) {
    return "Heslo musí mít alespoň 6 znaků.";
  }
  if (lower.includes("rate limit")) {
    return "Příliš mnoho pokusů. Zkus to prosím za chvíli.";
  }
  return message;
}

export function AuthScreen({ initialError }: AuthScreenProps) {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [confirmationNotice, setConfirmationNotice] = useState<string | null>(
    null
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setConfirmationNotice(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail || password.length < 6) {
      setError("Zadej platný e-mail a heslo o délce alespoň 6 znaků.");
      return;
    }

    setLoading(true);
    try {
      const supabase = createClient();

      if (mode === "signin") {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: trimmedEmail,
          password,
        });
        if (signInError) {
          setError(translateAuthError(signInError.message));
          return;
        }
        router.refresh();
        return;
      }

      const emailRedirectTo = `${window.location.origin}/auth/confirm`;
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: trimmedEmail,
        password,
        options: {
          emailRedirectTo,
        },
      });

      if (signUpError) {
        setError(translateAuthError(signUpError.message));
        return;
      }

      if (data.session) {
        router.refresh();
        return;
      }

      setConfirmationNotice(
        "Účet byl vytvořen! Zkontroluj prosím svůj e-mail a klikni na potvrzovací odkaz pro dokončení přihlášení."
      );
      setMode("signin");
    } catch {
      setError("Nepodařilo se spojit se serverem. Zkontroluj připojení.");
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
            Soukromý jednouživatelský tracker
          </div>
          <h1 className="mt-3 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            FoodTracker
          </h1>
          <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400">
            Zapiš jídlo i pohyb jednou větou. Kalorie, makra a pravidelné zvyky
            spočítají agenti na pozadí.
          </p>
        </div>

        <div className="rounded-3xl border border-slate-200/80 bg-white/90 p-6 shadow-xl shadow-slate-900/5 backdrop-blur-xl dark:border-slate-800/80 dark:bg-slate-900/85">
          <div className="mb-5 grid grid-cols-2 rounded-2xl bg-slate-100 p-1 dark:bg-slate-800/80">
            <button
              type="button"
              onClick={() => {
                setMode("signin");
                setError(null);
              }}
              className={`rounded-xl py-2.5 text-sm font-semibold transition ${
                mode === "signin"
                  ? "bg-white text-slate-900 shadow-sm dark:bg-slate-950 dark:text-white"
                  : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
              }`}
            >
              Přihlášení
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("signup");
                setError(null);
              }}
              className={`rounded-xl py-2.5 text-sm font-semibold transition ${
                mode === "signup"
                  ? "bg-white text-slate-900 shadow-sm dark:bg-slate-950 dark:text-white"
                  : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
              }`}
            >
              První registrace
            </button>
          </div>

          {confirmationNotice && (
            <div className="mb-4 flex items-start gap-2.5 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-3.5 text-sm text-emerald-800 dark:text-emerald-200">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
              <span>{confirmationNotice}</span>
            </div>
          )}

          {error && (
            <div className="mb-4 flex items-start gap-2.5 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-3.5 text-sm text-rose-700 dark:text-rose-200">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="auth-email"
                className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400"
              >
                E-mail
              </label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  id="auth-email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="radek@example.com"
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-4 text-base text-slate-900 outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-700/80 dark:bg-slate-950/60 dark:text-white dark:focus:border-emerald-400"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="auth-password"
                className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400"
              >
                Heslo
              </label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  id="auth-password"
                  type="password"
                  autoComplete={
                    mode === "signin" ? "current-password" : "new-password"
                  }
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Minimálně 6 znaků"
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
              {mode === "signin" ? "Přihlásit se" : "Vytvořit účet vlastníka"}
            </button>
          </form>

          {mode === "signup" && (
            <p className="mt-4 text-center text-xs leading-relaxed text-slate-500 dark:text-slate-400">
              Aplikace je chráněna databázovým zámkem pro jediného vlastníka. Po
              uložení tvého profilu se přístup uzamkne pouze pro tvůj účet.
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
