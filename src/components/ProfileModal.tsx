"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  Activity,
  AlertCircle,
  Check,
  Flame,
  KeyRound,
  Loader2,
  Lock,
  LogOut,
  Scale,
  Sparkles,
  Target,
  X,
  Zap,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type {
  ActivityLevel,
  EnergyUnit,
  Sex,
  UserProfileRow,
} from "@/lib/types";
import {
  ACTIVITY_LABELS_CS,
  ACTIVITY_MULTIPLIERS,
  calculateBaseExpenditure,
  calculateBmr,
  calculateMacroTargets,
  convertFromKcal,
  convertToKcal,
  energyUnitLabel,
  formatEnergy,
  formatEnergyValue,
  normalizeEnergyUnit,
} from "@/lib/calculations";
import { safeFetchJson } from "@/lib/safe-fetch";

interface ProfileModalProps {
  isOpen: boolean;
  initialProfile: UserProfileRow | null;
  userEmail?: string;
  onSaved: (profile: UserProfileRow) => void;
  onClose?: () => void;
}

const GOAL_PRESETS: Array<{ label: string; valueKcal: number }> = [
  { label: "Hubnutí", valueKcal: -500 },
  { label: "Mírné hubnutí", valueKcal: -300 },
  { label: "Udržování", valueKcal: 0 },
  { label: "Nabírání", valueKcal: 300 },
];

const ACTIVITY_ORDER: ActivityLevel[] = [
  "sedentary",
  "light",
  "moderate",
  "active",
];

function normalizeSex(raw?: string | null): Sex {
  return raw === "female" ? "female" : "male";
}

function normalizeActivity(raw?: string | null): ActivityLevel {
  if (
    raw === "sedentary" ||
    raw === "light" ||
    raw === "moderate" ||
    raw === "active"
  ) {
    return raw;
  }
  return "sedentary";
}

export function ProfileModal({
  isOpen,
  initialProfile,
  userEmail,
  onSaved,
  onClose,
}: ProfileModalProps) {
  const router = useRouter();
  const isOnboarding = initialProfile === null;

  const [displayName, setDisplayName] = useState(
    initialProfile?.display_name ?? "Radek"
  );
  const [sex, setSex] = useState<Sex>(normalizeSex(initialProfile?.sex));
  const [energyUnit, setEnergyUnit] = useState<EnergyUnit>(
    normalizeEnergyUnit(initialProfile?.energy_unit)
  );
  const [birthYear, setBirthYear] = useState<string>(
    String(initialProfile?.birth_year ?? 1977)
  );
  const [heightCm, setHeightCm] = useState<string>(
    String(initialProfile?.height_cm ?? 191)
  );
  const [weightKg, setWeightKg] = useState<string>(
    String(initialProfile?.weight_kg ?? 100)
  );
  const [targetWeightKg, setTargetWeightKg] = useState<string>(
    initialProfile?.target_weight_kg != null
      ? String(initialProfile.target_weight_kg)
      : ""
  );
  const [activityLevel, setActivityLevel] = useState<ActivityLevel>(
    normalizeActivity(initialProfile?.activity_level)
  );
  const [targetDeficitKcal, setTargetDeficitKcal] = useState<number>(
    initialProfile?.target_deficit_kcal ?? -500
  );
  const [customGoalMode, setCustomGoalMode] = useState<boolean>(() => {
    const val = initialProfile?.target_deficit_kcal ?? -500;
    return !GOAL_PRESETS.some((p) => p.valueKcal === val);
  });

  const [saving, setSaving] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // In-app password change
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);
  const [savingPassword, setSavingPassword] = useState(false);

  async function handlePasswordChange(e: FormEvent) {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(null);

    if (newPassword.length < 6) {
      setPasswordError("Heslo musí mít alespoň 6 znaků.");
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setPasswordError("Hesla se neshodují.");
      return;
    }

    setSavingPassword(true);
    try {
      const supabase = createClient();
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });
      if (updateError) {
        setPasswordError(updateError.message);
        return;
      }
      setPasswordSuccess("Heslo bylo úspěšně změněno!");
      setNewPassword("");
      setConfirmNewPassword("");
      setTimeout(() => setPasswordSuccess(null), 3000);
    } catch {
      setPasswordError("Nepodařilo se změnit heslo.");
    } finally {
      setSavingPassword(false);
    }
  }

  useEffect(() => {
    if (!initialProfile) return;
    setDisplayName(initialProfile.display_name);
    setSex(normalizeSex(initialProfile.sex));
    setEnergyUnit(normalizeEnergyUnit(initialProfile.energy_unit));
    setBirthYear(String(initialProfile.birth_year));
    setHeightCm(String(initialProfile.height_cm));
    setWeightKg(String(initialProfile.weight_kg));
    setTargetWeightKg(
      initialProfile.target_weight_kg != null
        ? String(initialProfile.target_weight_kg)
        : ""
    );
    setActivityLevel(normalizeActivity(initialProfile.activity_level));
    setTargetDeficitKcal(initialProfile.target_deficit_kcal);
    setCustomGoalMode(
      !GOAL_PRESETS.some((p) => p.valueKcal === initialProfile.target_deficit_kcal)
    );
  }, [initialProfile]);

  const preview = useMemo(() => {
    const parsedYear = Number.parseInt(birthYear, 10);
    const parsedHeight = Number.parseInt(heightCm, 10);
    const parsedWeight = Number.parseFloat(weightKg.replace(",", "."));

    const safeYear =
      Number.isFinite(parsedYear) && parsedYear >= 1925 && parsedYear <= 2020
        ? parsedYear
        : 1990;
    const safeHeight =
      Number.isFinite(parsedHeight) && parsedHeight >= 120 && parsedHeight <= 240
        ? parsedHeight
        : 180;
    const safeWeight =
      Number.isFinite(parsedWeight) && parsedWeight >= 35 && parsedWeight <= 260
        ? parsedWeight
        : 80;
    const safeDeficit = Number.isFinite(targetDeficitKcal)
      ? Math.max(-1500, Math.min(1500, Math.round(targetDeficitKcal)))
      : 0;

    const bmrKcal = calculateBmr({
      sex,
      weightKg: safeWeight,
      heightCm: safeHeight,
      birthYear: safeYear,
    });
    const { multiplier, baseExpenditureKcal } = calculateBaseExpenditure(
      bmrKcal,
      activityLevel
    );
    const macros = calculateMacroTargets({
      weightKg: safeWeight,
      baseExpenditureKcal,
      targetDeficitKcal: safeDeficit,
    });

    const parsedTargetW = targetWeightKg.trim()
      ? Number.parseFloat(targetWeightKg.replace(",", "."))
      : null;
    const validTargetWeight =
      parsedTargetW !== null &&
      Number.isFinite(parsedTargetW) &&
      parsedTargetW >= 35 &&
      parsedTargetW <= 260
        ? parsedTargetW
        : null;

    // 1 kg body fat ≈ 7 700 kcal (32 200 kJ)
    const weeklyKgDelta = (safeDeficit * 7) / 7700;
    const monthlyKgDelta = (safeDeficit * 30.4) / 7700;

    let estimatedWeeksToTarget: number | null = null;
    if (
      validTargetWeight !== null &&
      Math.abs(validTargetWeight - safeWeight) >= 0.3
    ) {
      const diffKg = validTargetWeight - safeWeight;
      if ((diffKg < 0 && weeklyKgDelta < -0.05) || (diffKg > 0 && weeklyKgDelta > 0.05)) {
        estimatedWeeksToTarget = Math.max(1, Math.round(Math.abs(diffKg / weeklyKgDelta)));
      }
    }

    return {
      safeWeight,
      safeDeficit,
      validTargetWeight,
      weeklyKgDelta,
      monthlyKgDelta,
      estimatedWeeksToTarget,
      bmrKcal,
      multiplier,
      baseExpenditureKcal,
      ...macros,
    };
  }, [
    sex,
    birthYear,
    heightCm,
    weightKg,
    targetWeightKg,
    activityLevel,
    targetDeficitKcal,
  ]);

  if (!isOpen) {
    return null;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSaving(true);

    try {
      const parsedTargetWeight = targetWeightKg.trim()
        ? Number.parseFloat(targetWeightKg.replace(",", "."))
        : null;

      const res = await safeFetchJson<{
        profile?: UserProfileRow;
        error?: string;
      }>("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          display_name: displayName.trim() || "Radek",
          sex,
          energy_unit: energyUnit,
          birth_year: Number.parseInt(birthYear, 10),
          height_cm: Number.parseInt(heightCm, 10),
          weight_kg: Number.parseFloat(weightKg.replace(",", ".")),
          target_weight_kg:
            parsedTargetWeight !== null && Number.isFinite(parsedTargetWeight)
              ? parsedTargetWeight
              : null,
          activity_level: activityLevel,
          target_deficit_kcal: Math.round(targetDeficitKcal),
        }),
      });

      if (!res.ok || !res.data?.profile) {
        setError(res.errorMessage ?? "Nepodařilo se uložit profil.");
        return;
      }

      onSaved(res.data.profile);
      onClose?.();
    } finally {
      setSaving(false);
    }
  }

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await fetch("/auth/signout", {
        method: "POST",
        headers: { Accept: "application/json" },
      });
      router.refresh();
    } finally {
      setSigningOut(false);
    }
  }

  const unitStr = energyUnitLabel(energyUnit);
  const customGoalDisplayValue = convertFromKcal(targetDeficitKcal, energyUnit);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/70 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="flex max-h-[94dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border border-slate-200/80 bg-white shadow-2xl sm:rounded-3xl dark:border-slate-800 dark:bg-slate-900">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200/80 px-5 py-4 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
              <Scale className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                {isOnboarding
                  ? "Nastavení tvého profilu a BMR"
                  : "Osobní profil, jednotky a cíle"}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {isOnboarding
                  ? "Jednorázové nastavení pro přesný výpočet výdeje a maker"
                  : "Mifflin-St Jeor rovnice + automatický přepočet cílů"}
              </p>
            </div>
          </div>

          {!isOnboarding && onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Zavřít nastavení"
              className="rounded-xl p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>

        {/* Form Body */}
        <form
          onSubmit={handleSubmit}
          className="flex-1 space-y-5 overflow-y-auto px-5 py-4 pb-safe"
        >
          {error && (
            <div className="flex items-start gap-2.5 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-3.5 text-sm text-rose-700 dark:text-rose-200">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" />
              <span>{error}</span>
            </div>
          )}

          {/* Preferred Energy Unit (kJ vs kcal) */}
          <div>
            <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              <Zap className="h-3.5 w-3.5 text-emerald-500" />
              Preferovaná jednotka energie
            </div>
            <div className="grid grid-cols-2 gap-1.5 rounded-2xl bg-slate-100 p-1 dark:bg-slate-800/80">
              <button
                type="button"
                onClick={() => setEnergyUnit("kj")}
                className={`rounded-xl py-2 text-sm font-bold transition ${
                  energyUnit === "kj"
                    ? "bg-emerald-500 text-white shadow-sm"
                    : "text-slate-600 dark:text-slate-300"
                }`}
              >
                kJ (kilojouly)
              </button>
              <button
                type="button"
                onClick={() => setEnergyUnit("kcal")}
                className={`rounded-xl py-2 text-sm font-bold transition ${
                  energyUnit === "kcal"
                    ? "bg-emerald-500 text-white shadow-sm"
                    : "text-slate-600 dark:text-slate-300"
                }`}
              >
                kcal (kalorie)
              </button>
            </div>
          </div>

          {/* Name & Sex */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label
                htmlFor="profile-name"
                className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400"
              >
                Jméno
              </label>
              <input
                id="profile-name"
                type="text"
                required
                maxLength={60}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-base font-medium text-slate-900 outline-none transition focus:border-emerald-500 focus:bg-white dark:border-slate-700/80 dark:bg-slate-950/60 dark:text-white"
              />
            </div>

            <div>
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Pohlaví
              </span>
              <div className="grid grid-cols-2 gap-1.5 rounded-2xl bg-slate-100 p-1 dark:bg-slate-800/80">
                <button
                  type="button"
                  onClick={() => setSex("male")}
                  className={`rounded-xl py-2 text-sm font-semibold transition ${
                    sex === "male"
                      ? "bg-white text-slate-900 shadow-sm dark:bg-slate-950 dark:text-white"
                      : "text-slate-600 dark:text-slate-400"
                  }`}
                >
                  Muž
                </button>
                <button
                  type="button"
                  onClick={() => setSex("female")}
                  className={`rounded-xl py-2 text-sm font-semibold transition ${
                    sex === "female"
                      ? "bg-white text-slate-900 shadow-sm dark:bg-slate-950 dark:text-white"
                      : "text-slate-600 dark:text-slate-400"
                  }`}
                >
                  Žena
                </button>
              </div>
            </div>
          </div>

          {/* Birth Year, Height, Weight, Target Weight */}
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <div>
              <label
                htmlFor="profile-birth-year"
                className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400"
              >
                Rok nar.
              </label>
              <input
                id="profile-birth-year"
                type="number"
                inputMode="numeric"
                min={1925}
                max={2020}
                required
                value={birthYear}
                onChange={(e) => setBirthYear(e.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-base font-semibold text-slate-900 outline-none focus:border-emerald-500 focus:bg-white dark:border-slate-700/80 dark:bg-slate-950/60 dark:text-white"
              />
            </div>

            <div>
              <label
                htmlFor="profile-height"
                className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400"
              >
                Výška (cm)
              </label>
              <input
                id="profile-height"
                type="number"
                inputMode="numeric"
                min={120}
                max={240}
                required
                value={heightCm}
                onChange={(e) => setHeightCm(e.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-base font-semibold text-slate-900 outline-none focus:border-emerald-500 focus:bg-white dark:border-slate-700/80 dark:bg-slate-950/60 dark:text-white"
              />
            </div>

            <div>
              <label
                htmlFor="profile-weight"
                className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400"
              >
                Váha (kg)
              </label>
              <input
                id="profile-weight"
                type="number"
                inputMode="decimal"
                step="0.1"
                min={35}
                max={260}
                required
                value={weightKg}
                onChange={(e) => setWeightKg(e.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-base font-semibold text-slate-900 outline-none focus:border-emerald-500 focus:bg-white dark:border-slate-700/80 dark:bg-slate-950/60 dark:text-white"
              />
            </div>

            <div>
              <label
                htmlFor="profile-target-weight"
                className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400"
              >
                Cíl váhy (kg)
              </label>
              <input
                id="profile-target-weight"
                type="number"
                inputMode="decimal"
                step="0.5"
                min={35}
                max={260}
                placeholder="např. 90"
                value={targetWeightKg}
                onChange={(e) => setTargetWeightKg(e.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-base font-semibold text-slate-900 placeholder:font-normal placeholder:text-slate-400 outline-none focus:border-emerald-500 focus:bg-white dark:border-slate-700/80 dark:bg-slate-950/60 dark:text-white"
              />
            </div>
          </div>

          {/* Daily Baseline Activity */}
          <div>
            <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              <Activity className="h-3.5 w-3.5 text-amber-500" />
              Běžný denní pohyb (mimo sport)
            </div>
            <div className="space-y-2">
              {ACTIVITY_ORDER.map((level) => {
                const info = ACTIVITY_LABELS_CS[level];
                const mult = ACTIVITY_MULTIPLIERS[level];
                const selected = activityLevel === level;
                return (
                  <button
                    key={level}
                    type="button"
                    onClick={() => setActivityLevel(level)}
                    className={`flex w-full items-start justify-between gap-3 rounded-2xl border p-3 text-left transition ${
                      selected
                        ? "border-emerald-500 bg-emerald-500/10 dark:border-emerald-400/80 dark:bg-emerald-500/10"
                        : "border-slate-200 bg-slate-50/70 hover:border-slate-300 dark:border-slate-800 dark:bg-slate-950/40 dark:hover:border-slate-700"
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-slate-900 dark:text-white">
                          {info.label}
                        </span>
                        <span className="rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[11px] font-semibold text-amber-700 dark:text-amber-300">
                          ×{mult}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">
                        {info.description}
                      </p>
                    </div>
                    <div
                      className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                        selected
                          ? "border-emerald-500 bg-emerald-500 text-white"
                          : "border-slate-300 dark:border-slate-600"
                      }`}
                    >
                      {selected && <Check className="h-3 w-3 stroke-[3]" />}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Daily Goal */}
          <div>
            <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              <Target className="h-3.5 w-3.5 text-emerald-500" />
              Denní energetický cíl
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {GOAL_PRESETS.map((preset) => {
                const active =
                  !customGoalMode && targetDeficitKcal === preset.valueKcal;
                return (
                  <button
                    key={preset.valueKcal}
                    type="button"
                    onClick={() => {
                      setCustomGoalMode(false);
                      setTargetDeficitKcal(preset.valueKcal);
                    }}
                    className={`rounded-2xl border px-2.5 py-2 text-center transition ${
                      active
                        ? "border-emerald-500 bg-emerald-500/15 text-emerald-900 dark:border-emerald-400 dark:text-emerald-200"
                        : "border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-300"
                    }`}
                  >
                    <div className="text-xs font-semibold">{preset.label}</div>
                    <div className="text-[11px] tabular-nums opacity-80">
                      {preset.valueKcal === 0
                        ? `0 ${unitStr}`
                        : `${formatEnergyValue(preset.valueKcal, energyUnit, { signed: true })} ${unitStr}`}
                    </div>
                  </button>
                );
              })}

              <button
                type="button"
                onClick={() => setCustomGoalMode(true)}
                className={`rounded-2xl border px-2.5 py-2 text-center transition ${
                  customGoalMode
                    ? "border-emerald-500 bg-emerald-500/15 text-emerald-900 dark:border-emerald-400 dark:text-emerald-200"
                    : "border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-300"
                }`}
              >
                <div className="text-xs font-semibold">Vlastní</div>
                <div className="text-[11px] opacity-80">{unitStr}/den</div>
              </button>
            </div>

            {customGoalMode && (
              <div className="mt-2.5 flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 dark:border-slate-800 dark:bg-slate-950/50">
                <label
                  htmlFor="custom-deficit"
                  className="text-xs font-medium text-slate-600 dark:text-slate-300"
                >
                  Úprava oproti výdeji v {unitStr} (záporné = deficit):
                </label>
                <input
                  id="custom-deficit"
                  type="number"
                  step={energyUnit === "kj" ? 200 : 50}
                  min={energyUnit === "kj" ? -6300 : -1500}
                  max={energyUnit === "kj" ? 6300 : 1500}
                  value={customGoalDisplayValue}
                  onChange={(e) => {
                    const rawVal = Number(e.target.value) || 0;
                    setTargetDeficitKcal(convertToKcal(rawVal, energyUnit));
                  }}
                  className="w-28 shrink-0 rounded-xl border border-slate-300 bg-white px-2.5 py-1.5 text-right text-sm font-bold tabular-nums text-slate-900 outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                />
              </div>
            )}

            {/* Goal Rationale Box */}
            <div className="mt-2.5 rounded-2xl border border-slate-200/80 bg-slate-50/90 p-3 text-xs leading-relaxed text-slate-600 dark:border-slate-800 dark:bg-slate-950/50 dark:text-slate-300">
              <strong className="font-semibold text-slate-900 dark:text-white">
                Zdůvodnění zvoleného cíle:{" "}
              </strong>
              {preview.safeDeficit === 0 ? (
                <span>
                  Při nulovém deficitu je tvůj cílový příjem roven celkovému
                  dennímu výdeji — tělesná váha zůstává dlouhodobě stabilní.
                </span>
              ) : (
                <span>
                  1 kg tělesného tuku obsahuje přibližně{" "}
                  <strong>
                    {energyUnit === "kj" ? "32 200 kJ" : "7 700 kcal"}
                  </strong>
                  . Denní úprava{" "}
                  <strong>
                    {formatEnergyValue(preview.safeDeficit, energyUnit, {
                      signed: true,
                    })}{" "}
                    {unitStr}
                  </strong>{" "}
                  odpovídá tempu přibližně{" "}
                  <strong className="text-emerald-700 dark:text-emerald-300">
                    {preview.weeklyKgDelta < 0 ? "−" : "+"}
                    {Math.abs(preview.weeklyKgDelta)
                      .toFixed(2)
                      .replace(".", ",")}{" "}
                    kg / týden
                  </strong>{" "}
                  (~
                  {Math.abs(preview.monthlyKgDelta)
                    .toFixed(1)
                    .replace(".", ",")}{" "}
                  kg za měsíc), což je fyziologicky udržitelné tempo bez ztráty
                  svalové hmoty.
                    {preview.estimatedWeeksToTarget !== null &&
                      preview.validTargetWeight !== null && (
                        <span>
                          {" "}
                          Při tomto tempu dosáhneš cílové váhy{" "}
                          <strong>{preview.validTargetWeight} kg</strong> zhruba za{" "}
                          <strong>{preview.estimatedWeeksToTarget} týdnů</strong>.
                        </span>
                      )}
                  </span>
                )}
              <div className="mt-2 border-t border-slate-200/70 pt-2 text-[11.5px] text-slate-500 dark:border-slate-800 dark:text-slate-400">
                <strong className="text-slate-800 dark:text-slate-200">
                  Jak se chová cíl ve dny se sportem:
                </strong>{" "}
                Tvůj <strong>Cíl ({formatEnergy(preview.targetIntakeKcal, energyUnit)})</strong>{" "}
                zůstává každý den pevný (aby tě trénink nesváděl dojídat večer
                sladkosti bez hladu). V tréninkový den se navíc odemkne{" "}
                <strong>Dnešní strop (+50 % spálené energie ze sportu)</strong>{" "}
                jako regenerační rezerva pouze pro případ reálného hladu — druhá
                polovina sportu jde vždy jako čistý bonus do hubnutí a kryje
                přirozený útlum klidového pohybu po zátěži.
              </div>
            </div>
          </div>

          {/* Live Deterministic Preview */}
          <div className="rounded-2xl border border-emerald-500/25 bg-gradient-to-br from-emerald-500/10 via-teal-500/5 to-amber-500/10 p-4">
            <div className="mb-2.5 flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                <Sparkles className="h-3.5 w-3.5" />
                Živý náhled výpočtu ({unitStr})
              </span>
              <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                Mifflin-St Jeor
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl bg-white/80 p-2.5 dark:bg-slate-950/60">
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  1. Klidové BMR
                </div>
                <div className="mt-0.5 text-base font-bold tabular-nums text-slate-900 dark:text-white">
                  {formatEnergyValue(preview.bmrKcal, energyUnit)}
                  <span className="ml-1 text-[11px] font-normal text-slate-500">
                    {unitStr}
                  </span>
                </div>
                <div className="mt-0.5 text-[10px] text-slate-400">
                  24h v klidu
                </div>
              </div>

              <div className="rounded-xl bg-white/80 p-2.5 dark:bg-slate-950/60">
                <div className="flex items-center justify-center gap-1 text-[11px] text-amber-600 dark:text-amber-400">
                  <Flame className="h-3 w-3" />
                  2. Zákl. výdej
                </div>
                <div className="mt-0.5 text-base font-bold tabular-nums text-amber-600 dark:text-amber-400">
                  {formatEnergyValue(preview.baseExpenditureKcal, energyUnit)}
                  <span className="ml-1 text-[11px] font-normal opacity-80">
                    {unitStr}
                  </span>
                </div>
                <div className="mt-0.5 text-[10px] text-slate-400">
                  BMR × {String(preview.multiplier).replace(".", ",")}
                </div>
              </div>

              <div className="rounded-xl bg-white/80 p-2.5 dark:bg-slate-950/60">
                <div className="text-[11px] text-emerald-600 dark:text-emerald-400">
                  3. Cílový příjem
                </div>
                <div className="mt-0.5 text-base font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                  {formatEnergyValue(preview.targetIntakeKcal, energyUnit)}
                  <span className="ml-1 text-[11px] font-normal opacity-80">
                    {unitStr}
                  </span>
                </div>
                <div className="mt-0.5 text-[10px] text-slate-400">
                  Výdej{" "}
                  {formatEnergyValue(preview.safeDeficit, energyUnit, {
                    signed: true,
                  })}
                </div>
              </div>
            </div>

            <div className="mt-2.5 grid grid-cols-4 gap-1.5 rounded-xl bg-white/70 px-3 py-2 text-center text-xs dark:bg-slate-950/50">
              <div>
                <span className="block text-[10px] uppercase text-slate-500">
                  Bílkoviny
                </span>
                <span className="font-bold text-slate-900 dark:text-white">
                  {preview.proteinTargetG} g
                </span>
                <span className="block text-[10px] text-slate-400">
                  1,8 g/kg
                </span>
              </div>
              <div>
                <span className="block text-[10px] uppercase text-slate-500">
                  Sacharidy
                </span>
                <span className="font-bold text-slate-900 dark:text-white">
                  {preview.carbsTargetG} g
                </span>
                <span className="block text-[10px] text-slate-400">
                  zbytek kJ
                </span>
              </div>
              <div>
                <span className="block text-[10px] uppercase text-slate-500">
                  Tuky
                </span>
                <span className="font-bold text-slate-900 dark:text-white">
                  {preview.fatTargetG} g
                </span>
                <span className="block text-[10px] text-slate-400">
                  0,9 g/kg
                </span>
              </div>
              <div>
                <span className="block text-[10px] uppercase text-slate-500">
                  Vláknina
                </span>
                <span className="font-bold text-slate-900 dark:text-white">
                  {preview.fiberTargetG} g
                </span>
                <span className="block text-[10px] text-slate-400">
                  sytost
                </span>
              </div>
            </div>
          </div>

          {/* Collapsible Change Password */}
          {!isOnboarding && (
            <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-3.5 dark:border-slate-800 dark:bg-slate-950/40">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
                  <KeyRound className="h-3.5 w-3.5 text-emerald-500" />
                  <span>Změna přihlašovacího hesla</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowPasswordChange((prev) => !prev);
                    setPasswordError(null);
                    setPasswordSuccess(null);
                  }}
                  className="text-xs font-semibold text-emerald-600 hover:underline dark:text-emerald-400"
                >
                  {showPasswordChange ? "Zavřít" : "Změnit heslo"}
                </button>
              </div>

              {showPasswordChange && (
                <div className="mt-3 space-y-3 pt-2">
                  {passwordSuccess && (
                    <div className="flex items-center gap-2 rounded-xl bg-emerald-500/10 p-2.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                      <Check className="h-4 w-4 shrink-0 text-emerald-500" />
                      <span>{passwordSuccess}</span>
                    </div>
                  )}
                  {passwordError && (
                    <div className="flex items-center gap-2 rounded-xl bg-rose-500/10 p-2.5 text-xs font-semibold text-rose-700 dark:text-rose-300">
                      <AlertCircle className="h-4 w-4 shrink-0 text-rose-500" />
                      <span>{passwordError}</span>
                    </div>
                  )}
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <input
                      type="password"
                      placeholder="Nové heslo (min. 6 znaků)"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                    />
                    <input
                      type="password"
                      placeholder="Potvrzení hesla"
                      value={confirmNewPassword}
                      onChange={(e) => setConfirmNewPassword(e.target.value)}
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                    />
                  </div>
                  <div className="flex justify-end">
                    <button
                      type="button"
                      disabled={savingPassword || !newPassword}
                      onClick={handlePasswordChange}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
                    >
                      {savingPassword && (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      )}
                      Uložit nové heslo
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          <button
            type="submit"
            disabled={saving}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-600 px-4 py-3.5 text-sm font-semibold text-white shadow-lg shadow-emerald-500/25 transition hover:from-emerald-600 hover:to-teal-700 active:scale-[0.99] disabled:opacity-60"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {isOnboarding ? "Uložit profil a spustit deník" : "Uložit změny"}
          </button>

          <div className="flex items-center justify-between border-t border-slate-200/70 pt-3 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
            <span className="truncate">{userEmail ?? "Přihlášený vlastník"}</span>
            <button
              type="button"
              disabled={signingOut}
              onClick={handleSignOut}
              className="inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 font-medium text-rose-600 transition hover:bg-rose-500/10 dark:text-rose-400"
            >
              {signingOut ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <LogOut className="h-3.5 w-3.5" />
              )}
              Odhlásit se
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
