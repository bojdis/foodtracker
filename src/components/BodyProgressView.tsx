"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  Activity,
  Check,
  Droplets,
  Flame,
  Heart,
  Loader2,
  Plus,
  Ruler,
  Scale,
  Sparkles,
  Target,
  Trash2,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import type {
  BloodPressureCategoryInfo,
  BodyMeasurementRow,
  DailySummaryRow,
  EnergyUnit,
  UserProfileRow,
} from "@/lib/types";
import { getBloodPressureCategory } from "@/lib/types";
import {
  convertFromKcal,
  formatEnergy,
  formatEnergyValue,
} from "@/lib/calculations";
import {
  computeBloodPressureStats,
  computeLoggedCalorieBalanceStats,
  computeWaistStats,
  computeWeightTrendSeries,
  type BloodPressureStatsSummary,
  type BloodPressureTrendPoint,
} from "@/lib/progress-stats";
import { safeFetchJson } from "@/lib/safe-fetch";
import { WaistMeasurementGuide } from "./WaistMeasurementGuide";

type PeriodOption = "7" | "30" | "90" | "all";

interface BodyProgressViewProps {
  profile: UserProfileRow | null;
  energyUnit: EnergyUnit;
  todayDate: string;
  refreshSignal: number;
  onProfileUpdated: (profile: UserProfileRow) => void;
  onMeasurementChanged: () => void;
  onOpenProfileSettings: () => void;
}

const PERIOD_OPTIONS: Array<{ value: PeriodOption; label: string }> = [
  { value: "7", label: "7 dní" },
  { value: "30", label: "30 dní" },
  { value: "90", label: "90 dní" },
  { value: "all", label: "Vše" },
];

function round1(val: number): number {
  return Math.round(val * 10) / 10;
}

function formatNumCs(val: number, decimals = 1): string {
  return val
    .toFixed(decimals)
    .replace(".", ",")
    .replace(/,0$/, "");
}

function formatSignedNumCs(val: number, unit: string): string {
  const absStr = Math.abs(val).toFixed(1).replace(".", ",").replace(/,0$/, "");
  if (val < 0) return `−${absStr} ${unit}`;
  if (val > 0) return `+${absStr} ${unit}`;
  return `0 ${unit}`;
}

function formatShortDateCs(dateStr: string): string {
  const parts = dateStr.split("-");
  if (parts.length !== 3) return dateStr;
  return `${Number(parts[2])}. ${Number(parts[1])}.`;
}

function daysBetweenUtc(startDateStr: string, endDateStr: string): number {
  const [sy, sm, sd] = startDateStr.split("-").map(Number);
  const [ey, em, ed] = endDateStr.split("-").map(Number);
  const t1 = Date.UTC(sy, (sm || 1) - 1, sd || 1);
  const t2 = Date.UTC(ey, (em || 1) - 1, ed || 1);
  return Math.round((t2 - t1) / 86_400_000);
}

const LAST_BP_STORAGE_KEY = "foodtracker_last_bp_v1";

interface StoredBpValues {
  sys: number | null;
  dia: number | null;
  pulse: number | null;
}

function readStoredBp(): StoredBpValues {
  if (typeof window === "undefined") {
    return { sys: null, dia: null, pulse: null };
  }
  try {
    const raw = window.localStorage.getItem(LAST_BP_STORAGE_KEY);
    if (!raw) return { sys: null, dia: null, pulse: null };
    const parsed = JSON.parse(raw) as Partial<StoredBpValues>;
    return {
      sys: typeof parsed.sys === "number" ? parsed.sys : null,
      dia: typeof parsed.dia === "number" ? parsed.dia : null,
      pulse: typeof parsed.pulse === "number" ? parsed.pulse : null,
    };
  } catch {
    return { sys: null, dia: null, pulse: null };
  }
}

function writeStoredBp(values: StoredBpValues): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LAST_BP_STORAGE_KEY, JSON.stringify(values));
  } catch {
    // ignore storage quota errors
  }
}

export function BodyProgressView({
  profile,
  energyUnit,
  todayDate,
  refreshSignal,
  onProfileUpdated,
  onMeasurementChanged,
  onOpenProfileSettings,
}: BodyProgressViewProps) {
  const [period, setPeriod] = useState<PeriodOption>("90");
  const [measurements, setMeasurements] = useState<BodyMeasurementRow[]>([]);
  const [dailySummaries, setDailySummaries] = useState<DailySummaryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [storedBp, setStoredBp] = useState<StoredBpValues>({
    sys: null,
    dia: null,
    pulse: null,
  });

  useEffect(() => {
    setStoredBp(readStoredBp());
  }, []);

  // Quick measurement form state
  const [measuredDate, setMeasuredDate] = useState<string>(todayDate);
  const [weightInput, setWeightInput] = useState<string>("");
  const [waistInput, setWaistInput] = useState<string>("");
  const [bpSysInput, setBpSysInput] = useState<string>("");
  const [bpDiaInput, setBpDiaInput] = useState<string>("");
  const [pulseInput, setPulseInput] = useState<string>("");
  const [notesInput, setNotesInput] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  // Interactive chart hover/tap indices
  const [activeWeightIdx, setActiveWeightIdx] = useState<number | null>(null);
  const [activeWaistIdx, setActiveWaistIdx] = useState<number | null>(null);
  const [activeBpIdx, setActiveBpIdx] = useState<number | null>(null);
  const [activeCalorieIdx, setActiveCalorieIdx] = useState<number | null>(null);

  const fetchProgressData = useCallback(
    async (selectedPeriod: PeriodOption, silent = false) => {
      if (!silent) {
        setLoading(true);
      }
      setError(null);

      try {
        const res = await safeFetchJson<{
          measurements?: BodyMeasurementRow[];
          dailySummaries?: DailySummaryRow[];
          error?: string;
        }>(`/api/measurements?days=${encodeURIComponent(selectedPeriod)}`, {
          cache: "no-store",
        });

        if (!res.ok || !res.data) {
          setError(res.errorMessage ?? "Nepodařilo se načíst historii progresu.");
          return;
        }

        setMeasurements(res.data.measurements ?? []);
        setDailySummaries(res.data.dailySummaries ?? []);
      } finally {
        if (!silent) {
          setLoading(false);
        }
      }
    },
    []
  );

  useEffect(() => {
    void fetchProgressData(period);
  }, [period, fetchProgressData]);

  useEffect(() => {
    if (refreshSignal > 0) {
      void fetchProgressData(period, true);
    }
  }, [refreshSignal, period, fetchProgressData]);

  const weightStats = useMemo(
    () => computeWeightTrendSeries(measurements),
    [measurements]
  );

  const waistStats = useMemo(
    () => computeWaistStats(measurements, profile?.height_cm),
    [measurements, profile?.height_cm]
  );

  const bpStats = useMemo(
    () => computeBloodPressureStats(measurements),
    [measurements]
  );

  const calorieStats = useMemo(
    () =>
      computeLoggedCalorieBalanceStats(
        dailySummaries,
        profile?.target_deficit_kcal ?? -500
      ),
    [dailySummaries, profile?.target_deficit_kcal]
  );

  const effectiveLastBpSys = bpStats.latestSys ?? storedBp.sys;
  const effectiveLastBpDia = bpStats.latestDia ?? storedBp.dia;
  const effectiveLastPulseBpm = bpStats.latestPulse ?? storedBp.pulse;

  // Pre-fill measurement inputs once data loads
  useEffect(() => {
    const existingForDay = measurements.find(
      (m) => m.measured_date === measuredDate
    );

    const nextWeight =
      existingForDay?.weight_kg ??
      weightStats.latestWeightKg ??
      profile?.weight_kg ??
      null;
    const nextWaist = existingForDay?.waist_cm ?? null;
    const nextSys =
      existingForDay?.blood_pressure_sys ?? effectiveLastBpSys ?? null;
    const nextDia =
      existingForDay?.blood_pressure_dia ?? effectiveLastBpDia ?? null;
    const nextPulse =
      existingForDay?.pulse_bpm ?? effectiveLastPulseBpm ?? null;

    setWeightInput(nextWeight !== null ? String(nextWeight) : "");
    setWaistInput(nextWaist !== null ? String(nextWaist) : "");
    setBpSysInput(nextSys !== null ? String(nextSys) : "");
    setBpDiaInput(nextDia !== null ? String(nextDia) : "");
    setPulseInput(nextPulse !== null ? String(nextPulse) : "");
    setNotesInput(existingForDay?.notes ?? "");
  }, [
    measuredDate,
    measurements,
    weightStats.latestWeightKg,
    profile?.weight_kg,
    effectiveLastBpSys,
    effectiveLastBpDia,
    effectiveLastPulseBpm,
  ]);

  function stepWeight(delta: number) {
    const cur = Number.parseFloat(weightInput.replace(",", "."));
    const base =
      Number.isFinite(cur) && cur >= 35
        ? cur
        : (weightStats.latestWeightKg ?? profile?.weight_kg ?? 95);
    setWeightInput(String(Math.min(260, Math.max(35, round1(base + delta)))));
  }

  function stepWaist(delta: number) {
    const cur = Number.parseFloat(waistInput.replace(",", "."));
    const base =
      Number.isFinite(cur) && cur >= 45
        ? cur
        : (waistStats.latestWaistCm ?? 95);
    setWaistInput(String(Math.min(190, Math.max(45, round1(base + delta)))));
  }

  function stepSys(delta: number) {
    const cur = parseInt(bpSysInput, 10);
    const base =
      Number.isFinite(cur) && cur >= 60 ? cur : (effectiveLastBpSys ?? 120);
    setBpSysInput(String(Math.min(240, Math.max(70, base + delta))));
  }

  function stepDia(delta: number) {
    const cur = parseInt(bpDiaInput, 10);
    const base =
      Number.isFinite(cur) && cur >= 40 ? cur : (effectiveLastBpDia ?? 80);
    setBpDiaInput(String(Math.min(150, Math.max(45, base + delta))));
  }

  function stepPulse(delta: number) {
    const cur = parseInt(pulseInput, 10);
    const base =
      Number.isFinite(cur) && cur >= 35 ? cur : (effectiveLastPulseBpm ?? 70);
    setPulseInput(String(Math.min(200, Math.max(40, base + delta))));
  }

  const liveBpCategory = (() => {
    const sys = parseInt(bpSysInput, 10);
    const dia = parseInt(bpDiaInput, 10);
    if (
      Number.isFinite(sys) &&
      sys >= 60 &&
      sys <= 260 &&
      Number.isFinite(dia) &&
      dia >= 40 &&
      dia <= 160
    ) {
      return getBloodPressureCategory(sys, dia);
    }
    return null;
  })();

  async function handleSaveMeasurement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSavedNotice(null);

    const parsedW = weightInput.trim()
      ? Number.parseFloat(weightInput.replace(",", "."))
      : null;
    const parsedWaist = waistInput.trim()
      ? Number.parseFloat(waistInput.replace(",", "."))
      : null;
    const parsedSys = bpSysInput.trim() ? parseInt(bpSysInput, 10) : null;
    const parsedDia = bpDiaInput.trim() ? parseInt(bpDiaInput, 10) : null;
    const parsedPulse = pulseInput.trim() ? parseInt(pulseInput, 10) : null;

    const validWeight =
      parsedW !== null && Number.isFinite(parsedW) && parsedW >= 35 && parsedW <= 260
        ? round1(parsedW)
        : null;
    const validWaist =
      parsedWaist !== null &&
      Number.isFinite(parsedWaist) &&
      parsedWaist >= 45 &&
      parsedWaist <= 190
        ? round1(parsedWaist)
        : null;

    const validSys =
      parsedSys !== null &&
      Number.isFinite(parsedSys) &&
      parsedSys >= 60 &&
      parsedSys <= 260
        ? parsedSys
        : null;

    const validDia =
      parsedDia !== null &&
      Number.isFinite(parsedDia) &&
      parsedDia >= 40 &&
      parsedDia <= 160
        ? parsedDia
        : null;

    const validPulse =
      parsedPulse !== null &&
      Number.isFinite(parsedPulse) &&
      parsedPulse >= 35 &&
      parsedPulse <= 220
        ? parsedPulse
        : null;

    const hasBp = validSys !== null && validDia !== null;

    if (
      validWeight === null &&
      validWaist === null &&
      !hasBp &&
      validPulse === null
    ) {
      setError(
        "Zadej prosím platnou váhu (35–260 kg), obvod pasu (45–190 cm) nebo krevní tlak (např. 120/80)."
      );
      return;
    }

    setSaving(true);
    try {
      const res = await safeFetchJson<{
        measurement?: BodyMeasurementRow;
        updatedProfile?: UserProfileRow | null;
        error?: string;
      }>("/api/measurements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          measured_date: measuredDate,
          weight_kg: validWeight,
          waist_cm: validWaist,
          blood_pressure_sys: hasBp ? validSys : undefined,
          blood_pressure_dia: hasBp ? validDia : undefined,
          pulse_bpm: validPulse ?? undefined,
          notes: notesInput.trim() || undefined,
        }),
      });

      if (!res.ok || !res.data?.measurement) {
        setError(res.errorMessage ?? "Uložení měření se nezdařilo.");
        return;
      }

      if (res.data.updatedProfile) {
        onProfileUpdated(res.data.updatedProfile);
      }

      const m = res.data.measurement;
      if (m.blood_pressure_sys !== null && m.blood_pressure_dia !== null) {
        const nextStored: StoredBpValues = {
          sys: m.blood_pressure_sys,
          dia: m.blood_pressure_dia,
          pulse: m.pulse_bpm ?? effectiveLastPulseBpm ?? null,
        };
        setStoredBp(nextStored);
        writeStoredBp(nextStored);
      }
      const parts: string[] = [];
      if (m.weight_kg !== null) {
        parts.push(`váha ${formatNumCs(m.weight_kg)} kg`);
      }
      if (m.waist_cm !== null) {
        parts.push(`pas ${formatNumCs(m.waist_cm)} cm`);
      }
      if (m.blood_pressure_sys !== null && m.blood_pressure_dia !== null) {
        parts.push(`tlak ${m.blood_pressure_sys}/${m.blood_pressure_dia}`);
      }
      if (m.pulse_bpm !== null) {
        parts.push(`tep ${m.pulse_bpm} bpm`);
      }
      setSavedNotice(
        `Uloženo (${formatShortDateCs(m.measured_date)}): ${parts.join(" · ")}`
      );

      await fetchProgressData(period, true);
      onMeasurementChanged();
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteMeasurement(id: number) {
    setDeletingId(id);
    setError(null);
    try {
      const res = await safeFetchJson<{ ok?: boolean; error?: string }>(
        `/api/measurements?id=${id}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        setError(res.errorMessage ?? "Smazání záznamu selhalo.");
        return;
      }
      await fetchProgressData(period, true);
      onMeasurementChanged();
    } finally {
      setDeletingId(null);
    }
  }

  const isWeightLossGoal = (profile?.target_deficit_kcal ?? -500) <= 0;
  const targetWeightKg = profile?.target_weight_kg ?? null;
  const healthyWaistThresholdCm =
    profile?.height_cm && profile.height_cm >= 120
      ? round1(profile.height_cm * 0.495)
      : null;

  // Weekly fat-loss pace estimate (7700 kcal ≈ 1 kg adipose tissue)
  const weeklyPaceKg =
    calorieStats.avgNetKcal !== null
      ? round1((calorieStats.avgNetKcal * 7) / 7700)
      : null;

  const sortedHistoryDesc = useMemo(
    () =>
      measurements
        .slice()
        .sort((a, b) => b.measured_date.localeCompare(a.measured_date)),
    [measurements]
  );

  return (
    <div className="space-y-4 pb-10">
      {/* 1. Quick Body Measurement Entry Card */}
      <section className="rounded-3xl border border-slate-200/80 bg-white/95 p-4 shadow-sm sm:p-5 dark:border-slate-800/90 dark:bg-slate-900/90">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
              <Scale className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-sm font-extrabold text-slate-900 sm:text-base dark:text-white">
                Zapsat váhu, pas a krevní tlak
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Ideálně ráno nalačno · stačí vyplnit jen to, co máš změřené
              </p>
            </div>
          </div>

          <input
            type="date"
            value={measuredDate}
            max={todayDate}
            onChange={(e) => setMeasuredDate(e.target.value || todayDate)}
            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
          />
        </div>

        <form onSubmit={handleSaveMeasurement} className="mt-3.5 space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {/* Weight */}
            <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-950/50">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="progress-weight"
                  className="text-xs font-bold text-slate-700 dark:text-slate-200"
                >
                  Váha (kg)
                </label>
                {weightStats.latestWeightKg !== null && (
                  <span className="text-[11px] text-slate-400">
                    poslední: {formatNumCs(weightStats.latestWeightKg)} kg
                  </span>
                )}
              </div>
              <div className="mt-2 flex items-center gap-2">
                <input
                  id="progress-weight"
                  type="text"
                  inputMode="decimal"
                  placeholder="99,4"
                  value={weightInput}
                  onChange={(e) => setWeightInput(e.target.value)}
                  className="w-24 rounded-xl border border-slate-200 bg-white px-3 py-2 text-center text-base font-extrabold tabular-nums text-slate-900 outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                />
                <div className="grid flex-1 grid-cols-4 gap-1">
                  {[-0.5, -0.1, 0.1, 0.5].map((delta) => (
                    <button
                      key={delta}
                      type="button"
                      onClick={() => stepWeight(delta)}
                      className="rounded-xl border border-slate-200 bg-white py-2 text-xs font-bold tabular-nums text-slate-700 transition hover:border-emerald-500/50 hover:bg-emerald-500/10 active:scale-95 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                    >
                      {delta > 0
                        ? `+${String(delta).replace(".", ",")}`
                        : String(delta).replace(".", ",")}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Waist */}
            <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-950/50">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="progress-waist"
                  className="text-xs font-bold text-slate-700 dark:text-slate-200"
                >
                  Obvod pasu v úrovni pupíku (cm)
                </label>
                {waistStats.latestWaistCm !== null && !waistInput && (
                  <button
                    type="button"
                    onClick={() =>
                      setWaistInput(String(waistStats.latestWaistCm))
                    }
                    className="text-[11px] font-semibold text-violet-600 hover:underline dark:text-violet-400"
                  >
                    minule {formatNumCs(waistStats.latestWaistCm)} cm
                  </button>
                )}
              </div>
              <div className="mt-2 flex items-center gap-2">
                <input
                  id="progress-waist"
                  type="text"
                  inputMode="decimal"
                  placeholder={
                    waistStats.latestWaistCm
                      ? `např. ${formatNumCs(waistStats.latestWaistCm)}`
                      : "např. 96"
                  }
                  value={waistInput}
                  onChange={(e) => setWaistInput(e.target.value)}
                  className="w-24 rounded-xl border border-slate-200 bg-white px-3 py-2 text-center text-base font-extrabold tabular-nums text-slate-900 placeholder:text-xs placeholder:font-normal outline-none focus:border-violet-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                />
                <div className="grid flex-1 grid-cols-4 gap-1">
                  {[-1, -0.5, 0.5, 1].map((delta) => (
                    <button
                      key={delta}
                      type="button"
                      onClick={() => stepWaist(delta)}
                      className="rounded-xl border border-slate-200 bg-white py-2 text-xs font-bold tabular-nums text-slate-700 transition hover:border-violet-500/50 hover:bg-violet-500/10 active:scale-95 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                    >
                      {delta > 0
                        ? `+${String(delta).replace(".", ",")}`
                        : String(delta).replace(".", ",")}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Blood Pressure & Pulse Card */}
            <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-3 sm:col-span-2 dark:border-slate-800 dark:bg-slate-950/50">
              <div className="flex flex-wrap items-center justify-between gap-1.5">
                <label className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-200">
                  <Heart className="h-3.5 w-3.5 text-rose-500" />
                  Krevní tlak a tepová frekvence
                  <span className="font-normal text-slate-400">volitelné</span>
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  {effectiveLastBpSys !== null &&
                    effectiveLastBpDia !== null && (
                      <span className="text-[11px] text-slate-400">
                        poslední: {effectiveLastBpSys}/{effectiveLastBpDia} mmHg
                        {effectiveLastPulseBpm !== null
                          ? ` · ${effectiveLastPulseBpm} bpm`
                          : ""}
                      </span>
                    )}
                  {(bpSysInput || bpDiaInput || pulseInput) && (
                    <button
                      type="button"
                      onClick={() => {
                        setBpSysInput("");
                        setBpDiaInput("");
                        setPulseInput("");
                      }}
                      className="text-[11px] font-semibold text-slate-400 hover:text-rose-500"
                    >
                      Vyčistit
                    </button>
                  )}
                  {liveBpCategory && (
                    <span
                      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-bold ${liveBpCategory.badgeClass}`}
                    >
                      <span
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ backgroundColor: liveBpCategory.dotColor }}
                      />
                      {liveBpCategory.label}
                    </span>
                  )}
                </div>
              </div>

              <div className="mt-2.5 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                <div>
                  <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                    Tlak SYS / DIA (mmHg)
                  </span>
                  <div className="mt-1 flex items-center gap-1.5">
                    <input
                      type="number"
                      inputMode="numeric"
                      placeholder={
                        effectiveLastBpSys != null
                          ? String(effectiveLastBpSys)
                          : "120"
                      }
                      value={bpSysInput}
                      onChange={(e) => setBpSysInput(e.target.value)}
                      className="w-16 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-center text-sm font-extrabold tabular-nums text-slate-900 outline-none focus:border-rose-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                    />
                    <span className="text-base font-bold text-slate-400">/</span>
                    <input
                      type="number"
                      inputMode="numeric"
                      placeholder={
                        effectiveLastBpDia != null
                          ? String(effectiveLastBpDia)
                          : "80"
                      }
                      value={bpDiaInput}
                      onChange={(e) => setBpDiaInput(e.target.value)}
                      className="w-16 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-center text-sm font-extrabold tabular-nums text-slate-900 outline-none focus:border-rose-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                    />
                    <div className="flex gap-1">
                      {[-5, 5].map((d) => (
                        <button
                          key={d}
                          type="button"
                          onClick={() => {
                            stepSys(d);
                            stepDia(Math.sign(d) * (Math.abs(d) === 5 ? 3 : 5));
                          }}
                          className="rounded-xl border border-slate-200 bg-white px-2 py-1.5 text-xs font-bold tabular-nums text-slate-700 transition hover:border-rose-500/50 hover:bg-rose-500/10 active:scale-95 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                        >
                          {d > 0 ? `+${d}` : d}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div>
                  <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                    Tepová frekvence (bpm)
                  </span>
                  <div className="mt-1 flex items-center gap-1.5">
                    <input
                      type="number"
                      inputMode="numeric"
                      placeholder={
                        effectiveLastPulseBpm != null
                          ? String(effectiveLastPulseBpm)
                          : "např. 70"
                      }
                      value={pulseInput}
                      onChange={(e) => setPulseInput(e.target.value)}
                      className="w-20 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-center text-sm font-extrabold tabular-nums text-slate-900 outline-none focus:border-rose-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                    />
                    <div className="flex gap-1">
                      {[-5, 5].map((d) => (
                        <button
                          key={d}
                          type="button"
                          onClick={() => stepPulse(d)}
                          className="rounded-xl border border-slate-200 bg-white px-2 py-1.5 text-xs font-bold tabular-nums text-slate-700 transition hover:border-rose-500/50 hover:bg-rose-500/10 active:scale-95 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                        >
                          {d > 0 ? `+${d}` : d}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <WaistMeasurementGuide />

          <div className="flex flex-wrap items-center justify-between gap-2">
            <input
              type="text"
              maxLength={140}
              placeholder="Volitelná poznámka (např. ráno nalačno, po tréninku…)"
              value={notesInput}
              onChange={(e) => setNotesInput(e.target.value)}
              className="min-w-[200px] flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-800 placeholder:text-slate-400 outline-none focus:border-emerald-500 focus:bg-white dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200"
            />
            <button
              type="submit"
              disabled={
                saving ||
                (!weightInput.trim() &&
                  !waistInput.trim() &&
                  (!bpSysInput.trim() || !bpDiaInput.trim()) &&
                  !pulseInput.trim())
              }
              className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 px-4 py-2.5 text-xs font-bold text-white shadow-md shadow-emerald-500/20 transition hover:from-emerald-600 hover:to-teal-700 active:scale-95 disabled:opacity-50"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4 stroke-[2.5]" />
              )}
              Uložit měření
            </button>
          </div>
        </form>

        {savedNotice && (
          <div className="mt-3 flex items-center gap-2 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-2 text-xs font-semibold text-emerald-800 dark:text-emerald-200">
            <Check className="h-4 w-4 text-emerald-500 stroke-[2.5]" />
            <span>{savedNotice}</span>
          </div>
        )}

        {error && (
          <div className="mt-3 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-3.5 py-2 text-xs font-medium text-rose-700 dark:text-rose-200">
            {error}
          </div>
        )}
      </section>

      {/* 2. Period Selector Row */}
      <div className="flex items-center justify-between gap-2 px-1">
        <div className="flex items-center gap-1.5">
          <Sparkles className="h-4 w-4 text-emerald-500" />
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
            Přehled progresu a trendů
          </h2>
          {loading && (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-500" />
          )}
        </div>

        <div className="inline-flex rounded-2xl border border-slate-200/80 bg-white p-1 shadow-xs dark:border-slate-800 dark:bg-slate-900">
          {PERIOD_OPTIONS.map((opt) => {
            const active = period === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setPeriod(opt.value)}
                className={`rounded-xl px-2.5 py-1 text-xs font-bold transition ${
                  active
                    ? "bg-emerald-500 text-white shadow-xs"
                    : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* 3. Water-Fluctuation Anti-Frustration Banner */}
      {weightStats.waterFluctuationUpKg !== null && (
        <div className="flex items-start gap-3 rounded-3xl border border-sky-500/30 bg-gradient-to-r from-sky-500/10 via-emerald-500/10 to-teal-500/10 p-4 text-xs text-slate-800 dark:text-slate-200">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-sky-500/20 text-sky-600 dark:text-sky-300">
            <Droplets className="h-4 w-4" />
          </div>
          <div className="leading-relaxed">
            <strong className="font-bold text-slate-900 dark:text-white">
              Klid — 7denní trend dál klesá!
            </strong>{" "}
            Poslední vážení sice poskočilo o{" "}
            <strong>+{formatNumCs(weightStats.waterFluctuationUpKg)} kg</strong>{" "}
            (běžné kolísání vody, soli nebo glykogenu po jídle či sportu), ale tvůj{" "}
            <strong className="text-emerald-700 dark:text-emerald-300">
              7denní klouzavý průměr (
              {formatNumCs(weightStats.latestMovingAvgKg ?? 0)} kg)
            </strong>{" "}
            jde pořád správným směrem dolů.
          </div>
        </div>
      )}

      {/* 4. Three Motivational KPI Cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {/* Weight KPI */}
        <div className="rounded-3xl border border-slate-200/80 bg-white/95 p-4 shadow-sm dark:border-slate-800/90 dark:bg-slate-900/90">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Váha & trend
            </span>
            {weightStats.deltaFromStartKg !== null &&
              weightStats.points.length >= 2 && (
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums ${
                    (isWeightLossGoal && weightStats.deltaFromStartKg <= 0) ||
                    (!isWeightLossGoal && weightStats.deltaFromStartKg >= 0)
                      ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                      : "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                  }`}
                >
                  {weightStats.deltaFromStartKg <= 0 ? (
                    <TrendingDown className="h-3 w-3" />
                  ) : (
                    <TrendingUp className="h-3 w-3" />
                  )}
                  {formatSignedNumCs(weightStats.deltaFromStartKg, "kg")}
                </span>
              )}
          </div>

          <div className="mt-2 text-2xl font-extrabold tabular-nums tracking-tight text-slate-900 dark:text-white">
            {weightStats.latestWeightKg !== null
              ? `${formatNumCs(weightStats.latestWeightKg)} kg`
              : "—"}
          </div>

          <div className="mt-1.5 space-y-1 text-xs text-slate-500 dark:text-slate-400">
            {weightStats.latestMovingAvgKg !== null && (
              <div>
                7denní průměr:{" "}
                <strong className="font-bold text-emerald-600 dark:text-emerald-400">
                  {formatNumCs(weightStats.latestMovingAvgKg)} kg
                </strong>
              </div>
            )}
            {targetWeightKg !== null && weightStats.latestWeightKg !== null ? (
              <div className="flex items-center gap-1 text-[11px]">
                <Target className="h-3 w-3 text-teal-500" />
                <span>
                  Cíl {formatNumCs(targetWeightKg)} kg (zbývá{" "}
                  <strong>
                    {formatNumCs(
                      Math.max(
                        0,
                        round1(weightStats.latestWeightKg - targetWeightKg)
                      )
                    )}{" "}
                    kg
                  </strong>
                  )
                </span>
              </div>
            ) : (
              <button
                type="button"
                onClick={onOpenProfileSettings}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 hover:underline dark:text-emerald-400"
              >
                <Target className="h-3 w-3" />
                Nastavit cílovou váhu →
              </button>
            )}
          </div>
        </div>

        {/* Waist & WHtR KPI */}
        <div className="rounded-3xl border border-slate-200/80 bg-white/95 p-4 shadow-sm dark:border-slate-800/90 dark:bg-slate-900/90">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Obvod pasu
            </span>
            {waistStats.deltaFromStartCm !== null &&
              waistStats.points.length >= 2 && (
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums ${
                    waistStats.deltaFromStartCm <= 0
                      ? "bg-violet-500/15 text-violet-700 dark:text-violet-300"
                      : "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                  }`}
                >
                  {formatSignedNumCs(waistStats.deltaFromStartCm, "cm")}
                </span>
              )}
          </div>

          <div className="mt-2 text-2xl font-extrabold tabular-nums tracking-tight text-slate-900 dark:text-white">
            {waistStats.latestWaistCm !== null
              ? `${formatNumCs(waistStats.latestWaistCm)} cm`
              : "Zatím nezadáno"}
          </div>

          <div className="mt-1.5 space-y-1 text-xs text-slate-500 dark:text-slate-400">
            {waistStats.whtr !== null ? (
              <>
                <div>
                  Poměr pas / výška:{" "}
                  <strong
                    className={
                      waistStats.whtrZone === "healthy"
                        ? "font-bold text-emerald-600 dark:text-emerald-400"
                        : waistStats.whtrZone === "elevated"
                          ? "font-bold text-amber-600 dark:text-amber-400"
                          : "font-bold text-rose-600 dark:text-rose-400"
                    }
                  >
                    {waistStats.whtr.toFixed(2).replace(".", ",")}
                  </strong>
                </div>
                <div className="text-[11px]">{waistStats.whtrLabelCs}</div>
              </>
            ) : (
              <div className="text-[11px]">
                Změř pas v úrovni pupíku — často klesá i tehdy, když váha drží
                vodu po cvičení!
              </div>
            )}
          </div>
        </div>

        {/* Energy Balance KPI */}
        <div className="rounded-3xl border border-slate-200/80 bg-white/95 p-4 shadow-sm dark:border-slate-800/90 dark:bg-slate-900/90">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Průměrná bilance
            </span>
            {calorieStats.loggedDaysCount > 0 && (
              <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-bold text-emerald-700 dark:text-emerald-300">
                {calorieStats.daysOnTargetCount}/{calorieStats.loggedDaysCount}{" "}
                dnů v cíli
              </span>
            )}
          </div>

          <div className="mt-2 text-2xl font-extrabold tabular-nums tracking-tight text-slate-900 dark:text-white">
            {calorieStats.avgNetKcal !== null
              ? formatEnergy(calorieStats.avgNetKcal, energyUnit, {
                  signed: true,
                })
              : "—"}
          </div>

          <div className="mt-1.5 space-y-1 text-xs text-slate-500 dark:text-slate-400">
            {weeklyPaceKg !== null ? (
              <>
                <div>
                  Odhad tempa:{" "}
                  <strong className="font-bold text-emerald-600 dark:text-emerald-400">
                    ≈ {formatSignedNumCs(weeklyPaceKg, "kg")} / týden
                  </strong>
                </div>
                <div className="text-[11px]">
                  Počítáno jen ze zapsaných dnů ({calorieStats.loggedDaysCount})
                </div>
              </>
            ) : (
              <div className="text-[11px]">
                Jakmile zapíšeš dnešní jídla, ukáže se průměrný denní deficit i
                týdenní tempo.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 5. CHART 1: Weight & 7-Day Moving Average */}
      <WeightTrendChartCard
        points={weightStats.points}
        targetWeightKg={targetWeightKg}
        activeIndex={activeWeightIdx}
        onSelectIndex={setActiveWeightIdx}
      />

      {/* 6. CHART 2: Waist Circumference */}
      <WaistTrendChartCard
        points={waistStats.points}
        healthyThresholdCm={healthyWaistThresholdCm}
        activeIndex={activeWaistIdx}
        onSelectIndex={setActiveWaistIdx}
      />

      {/* 7. Blood Pressure & Heart Health */}
      <BloodPressureChartCard
        stats={bpStats}
        activeIndex={activeBpIdx}
        onSelectIndex={setActiveBpIdx}
      />

      {/* 8. CHART 3: Daily Energy Balance Bars */}
      <EnergyBalanceChartCard
        points={calorieStats.points}
        energyUnit={energyUnit}
        targetDeficitKcal={profile?.target_deficit_kcal ?? -500}
        activeIndex={activeCalorieIdx}
        onSelectIndex={setActiveCalorieIdx}
      />

      {/* 8. Measurement History Table */}
      {sortedHistoryDesc.length > 0 && (
        <section className="rounded-3xl border border-slate-200/80 bg-white/95 p-4 shadow-sm sm:p-5 dark:border-slate-800/90 dark:bg-slate-900/90">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Historie měření ({sortedHistoryDesc.length})
          </h3>

          <div className="mt-3 divide-y divide-slate-200/70 dark:divide-slate-800">
            {sortedHistoryDesc.slice(0, 20).map((row, idx) => {
              const olderRow = sortedHistoryDesc
                .slice(idx + 1)
                .find((r) => r.weight_kg !== null);
              const weightDiff =
                row.weight_kg !== null &&
                olderRow?.weight_kg !== undefined &&
                olderRow.weight_kg !== null
                  ? round1(row.weight_kg - olderRow.weight_kg)
                  : null;

              return (
                <div
                  key={row.id}
                  className="flex items-center justify-between gap-2 py-2.5 text-xs"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-slate-900 dark:text-white">
                        {formatShortDateCs(row.measured_date)}
                      </span>
                      {row.weight_kg !== null && (
                        <span className="rounded-lg bg-emerald-500/10 px-2 py-0.5 font-bold tabular-nums text-emerald-700 dark:text-emerald-300">
                          {formatNumCs(row.weight_kg)} kg
                        </span>
                      )}
                      {weightDiff !== null && weightDiff !== 0 && (
                        <span
                          className={`text-[11px] font-semibold tabular-nums ${
                            weightDiff < 0
                              ? "text-emerald-600 dark:text-emerald-400"
                              : "text-amber-600 dark:text-amber-400"
                          }`}
                        >
                          ({formatSignedNumCs(weightDiff, "kg")})
                        </span>
                      )}
                      {row.waist_cm !== null && (
                        <span className="rounded-lg bg-violet-500/10 px-2 py-0.5 font-bold tabular-nums text-violet-700 dark:text-violet-300">
                          pas {formatNumCs(row.waist_cm)} cm
                        </span>
                      )}
                      {row.blood_pressure_sys !== null &&
                        row.blood_pressure_dia !== null && (
                          <span className="inline-flex items-center gap-1 rounded-lg bg-rose-500/10 px-2 py-0.5 font-bold tabular-nums text-rose-700 dark:text-rose-300">
                            <span
                              className="h-1.5 w-1.5 rounded-full"
                              style={{
                                backgroundColor: getBloodPressureCategory(
                                  row.blood_pressure_sys,
                                  row.blood_pressure_dia
                                ).dotColor,
                              }}
                            />
                            {row.blood_pressure_sys}/{row.blood_pressure_dia}
                            {row.pulse_bpm !== null && (
                              <span className="font-normal opacity-75">
                                · {row.pulse_bpm} bpm
                              </span>
                            )}
                          </span>
                        )}
                    </div>
                    {row.notes && (
                      <p className="mt-0.5 truncate text-[11px] text-slate-500 dark:text-slate-400">
                        {row.notes}
                      </p>
                    )}
                  </div>

                  <button
                    type="button"
                    disabled={deletingId === row.id}
                    onClick={() => handleDeleteMeasurement(row.id)}
                    aria-label="Smazat měření"
                    className="rounded-xl p-1.5 text-slate-400 transition hover:bg-rose-500/10 hover:text-rose-500 disabled:opacity-50"
                  >
                    {deletingId === row.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

/* ============================================================================
 * SVG CHART 1: Weight + 7-Day Moving Average
 * ========================================================================== */
function WeightTrendChartCard({
  points,
  targetWeightKg,
  activeIndex,
  onSelectIndex,
}: {
  points: Array<{ date: string; weightKg: number; movingAvg7d: number }>;
  targetWeightKg: number | null;
  activeIndex: number | null;
  onSelectIndex: (idx: number | null) => void;
}) {
  const W = 600;
  const H = 220;
  const pad = { left: 46, right: 18, top: 18, bottom: 28 };
  const PW = W - pad.left - pad.right;
  const PH = H - pad.top - pad.bottom;

  if (points.length === 0) {
    return (
      <section className="rounded-3xl border border-dashed border-slate-300/80 bg-white/70 p-5 text-center dark:border-slate-800 dark:bg-slate-900/50">
        <Scale className="mx-auto h-6 w-6 text-emerald-500" />
        <h3 className="mt-2 text-sm font-bold text-slate-900 dark:text-white">
          Graf vývoje váhy
        </h3>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Zapiš nahoře první vážení a začne se vykreslovat tvůj 7denní trend.
        </p>
      </section>
    );
  }

  const allVals = points.flatMap((p) => [p.weightKg, p.movingAvg7d]);
  const rawMin = Math.min(...allVals);
  const rawMax = Math.max(...allVals);

  const showTargetLine =
    targetWeightKg !== null &&
    targetWeightKg >= rawMin - 4 &&
    targetWeightKg <= rawMax + 4;

  const domainMinBase = showTargetLine
    ? Math.min(rawMin, targetWeightKg)
    : rawMin;
  const domainMaxBase = showTargetLine
    ? Math.max(rawMax, targetWeightKg)
    : rawMax;

  const spread = Math.max(1.6, domainMaxBase - domainMinBase);
  const minY = Math.floor((domainMinBase - spread * 0.22) * 2) / 2;
  const maxY = Math.ceil((domainMaxBase + spread * 0.22) * 2) / 2;
  const spanY = Math.max(1, maxY - minY);

  const firstDate = points[0].date;
  const lastDate = points[points.length - 1].date;
  const totalDays = Math.max(1, daysBetweenUtc(firstDate, lastDate));

  const getX = (idx: number) => {
    if (points.length === 1) return pad.left + PW / 2;
    const d = daysBetweenUtc(firstDate, points[idx].date);
    return pad.left + (d / totalDays) * PW;
  };

  const getY = (val: number) =>
    pad.top + PH - ((val - minY) / spanY) * PH;

  const rawPolyline = points
    .map((p, i) => `${getX(i).toFixed(1)},${getY(p.weightKg).toFixed(1)}`)
    .join(" ");

  const avgPath = points
    .map(
      (p, i) =>
        `${i === 0 ? "M" : "L"} ${getX(i).toFixed(1)} ${getY(p.movingAvg7d).toFixed(1)}`
    )
    .join(" ");

  const areaPath =
    points.length >= 2
      ? `${avgPath} L ${getX(points.length - 1).toFixed(1)} ${(pad.top + PH).toFixed(1)} L ${getX(0).toFixed(1)} ${(pad.top + PH).toFixed(1)} Z`
      : "";

  const inspected =
    activeIndex !== null && points[activeIndex]
      ? points[activeIndex]
      : points[points.length - 1];

  const yTicks = [minY, round1(minY + spanY / 2), maxY];

  return (
    <section className="rounded-3xl border border-slate-200/80 bg-white/95 p-4 shadow-sm sm:p-5 dark:border-slate-800/90 dark:bg-slate-900/90">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
            Vývoj váhy a 7denní klouzavý průměr
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Tečky = denní vážení · Silná křivka = čistý trend bez výkyvů vody
          </p>
        </div>

        <div className="rounded-2xl bg-emerald-500/10 px-3 py-1.5 text-right text-xs tabular-nums">
          <div className="font-bold text-slate-900 dark:text-white">
            {formatShortDateCs(inspected.date)}:{" "}
            <span className="text-emerald-600 dark:text-emerald-400">
              {formatNumCs(inspected.weightKg)} kg
            </span>
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400">
            7d průměr: {formatNumCs(inspected.movingAvg7d)} kg
          </div>
        </div>
      </div>

      <div className="mt-3">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-52 w-full overflow-visible select-none"
          onMouseLeave={() => onSelectIndex(null)}
        >
          <defs>
            <linearGradient id="weightTrendFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10b981" stopOpacity="0.28" />
              <stop offset="100%" stopColor="#10b981" stopOpacity="0.01" />
            </linearGradient>
          </defs>

          {yTicks.map((tick) => {
            const y = getY(tick);
            return (
              <g key={tick}>
                <line
                  x1={pad.left}
                  y1={y}
                  x2={W - pad.right}
                  y2={y}
                  stroke="currentColor"
                  className="text-slate-200 dark:text-slate-800"
                  strokeWidth="1"
                />
                <text
                  x={pad.left - 8}
                  y={y + 4}
                  textAnchor="end"
                  className="fill-slate-400 text-[11px] font-medium tabular-nums"
                >
                  {formatNumCs(tick)}
                </text>
              </g>
            );
          })}

          {showTargetLine && targetWeightKg !== null && (
            <g>
              <line
                x1={pad.left}
                y1={getY(targetWeightKg)}
                x2={W - pad.right}
                y2={getY(targetWeightKg)}
                stroke="#0d9488"
                strokeWidth="1.5"
                strokeDasharray="5 4"
              />
              <text
                x={W - pad.right}
                y={getY(targetWeightKg) - 5}
                textAnchor="end"
                className="fill-teal-600 text-[10px] font-bold dark:fill-teal-400"
              >
                Cíl {formatNumCs(targetWeightKg)} kg
              </text>
            </g>
          )}

          {areaPath && <path d={areaPath} fill="url(#weightTrendFill)" />}

          {points.length >= 2 && (
            <polyline
              fill="none"
              points={rawPolyline}
              stroke="#94a3b8"
              strokeWidth="1.5"
              strokeDasharray="3 3"
              opacity="0.65"
            />
          )}

          {points.length >= 2 && (
            <path
              d={avgPath}
              fill="none"
              stroke="#10b981"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {points.map((p, idx) => {
            const cx = getX(idx);
            const cyRaw = getY(p.weightKg);
            const cyAvg = getY(p.movingAvg7d);
            const isSelected =
              activeIndex === idx ||
              (activeIndex === null && idx === points.length - 1);

            return (
              <g
                key={p.date}
                className="cursor-pointer"
                onMouseEnter={() => onSelectIndex(idx)}
                onClick={() => onSelectIndex(idx)}
              >
                <circle
                  cx={cx}
                  cy={cyRaw}
                  r={isSelected ? 5 : 3.5}
                  className={
                    isSelected
                      ? "fill-emerald-500 stroke-white dark:stroke-slate-900"
                      : "fill-slate-400/80 stroke-white dark:stroke-slate-900"
                  }
                  strokeWidth="1.5"
                />
                {isSelected && points.length >= 2 && (
                  <circle
                    cx={cx}
                    cy={cyAvg}
                    r={5.5}
                    fill="#10b981"
                    stroke="white"
                    strokeWidth="2"
                  />
                )}
                <circle cx={cx} cy={cyRaw} r={16} fill="transparent" />
              </g>
            );
          })}

          {points.length === 1 ? (
            <text
              x={getX(0)}
              y={H - 6}
              textAnchor="middle"
              className="fill-slate-400 text-[11px] font-medium"
            >
              {formatShortDateCs(points[0].date)} (výchozí bod)
            </text>
          ) : (
            <>
              <text
                x={pad.left}
                y={H - 6}
                textAnchor="start"
                className="fill-slate-400 text-[11px] font-medium"
              >
                {formatShortDateCs(firstDate)}
              </text>
              <text
                x={W - pad.right}
                y={H - 6}
                textAnchor="end"
                className="fill-slate-400 text-[11px] font-medium"
              >
                {formatShortDateCs(lastDate)}
              </text>
            </>
          )}
        </svg>
      </div>

      {points.length === 1 && (
        <p className="mt-1 text-center text-xs text-emerald-700 dark:text-emerald-300">
          Výchozí váha ({formatNumCs(points[0].weightKg)} kg) je zaznamenána.
          Jakmile přidáš další vážení (třeba dnes), vykreslí se křivka směru!
        </p>
      )}
    </section>
  );
}

/* ============================================================================
 * SVG CHART 2: Waist Circumference (cm)
 * ========================================================================== */
function WaistTrendChartCard({
  points,
  healthyThresholdCm,
  activeIndex,
  onSelectIndex,
}: {
  points: Array<{ date: string; waistCm: number }>;
  healthyThresholdCm: number | null;
  activeIndex: number | null;
  onSelectIndex: (idx: number | null) => void;
}) {
  const W = 600;
  const H = 200;
  const pad = { left: 46, right: 18, top: 18, bottom: 28 };
  const PW = W - pad.left - pad.right;
  const PH = H - pad.top - pad.bottom;

  if (points.length === 0) {
    return (
      <section className="rounded-3xl border border-dashed border-slate-300/80 bg-white/70 p-5 text-center dark:border-slate-800 dark:bg-slate-900/50">
        <Ruler className="mx-auto h-6 w-6 text-violet-500" />
        <h3 className="mt-2 text-sm font-bold text-slate-900 dark:text-white">
          Graf obvodu pasu (cm)
        </h3>
        <p className="mt-1 mx-auto max-w-md text-xs text-slate-500 dark:text-slate-400">
          Zapiš si nahoře první měření pasu! Obvod pasu je nejlepší ukazatel
          úbytku tuku kolem břicha
          {healthyThresholdCm
            ? ` (zdravá hranice pro tvou výšku je pod ${formatNumCs(healthyThresholdCm)} cm)`
            : ""}
          .
        </p>
      </section>
    );
  }

  const vals = points.map((p) => p.waistCm);
  const rawMin = Math.min(...vals);
  const rawMax = Math.max(...vals);

  const showHealthyLine =
    healthyThresholdCm !== null &&
    healthyThresholdCm >= rawMin - 5 &&
    healthyThresholdCm <= rawMax + 5;

  const minBase = showHealthyLine
    ? Math.min(rawMin, healthyThresholdCm)
    : rawMin;
  const maxBase = showHealthyLine
    ? Math.max(rawMax, healthyThresholdCm)
    : rawMax;

  const spread = Math.max(2, maxBase - minBase);
  const minY = Math.floor(minBase - spread * 0.25);
  const maxY = Math.ceil(maxBase + spread * 0.25);
  const spanY = Math.max(1, maxY - minY);

  const firstDate = points[0].date;
  const lastDate = points[points.length - 1].date;
  const totalDays = Math.max(1, daysBetweenUtc(firstDate, lastDate));

  const getX = (idx: number) => {
    if (points.length === 1) return pad.left + PW / 2;
    const d = daysBetweenUtc(firstDate, points[idx].date);
    return pad.left + (d / totalDays) * PW;
  };

  const getY = (val: number) =>
    pad.top + PH - ((val - minY) / spanY) * PH;

  const linePath = points
    .map(
      (p, i) =>
        `${i === 0 ? "M" : "L"} ${getX(i).toFixed(1)} ${getY(p.waistCm).toFixed(1)}`
    )
    .join(" ");

  const areaPath =
    points.length >= 2
      ? `${linePath} L ${getX(points.length - 1).toFixed(1)} ${(pad.top + PH).toFixed(1)} L ${getX(0).toFixed(1)} ${(pad.top + PH).toFixed(1)} Z`
      : "";

  const inspected =
    activeIndex !== null && points[activeIndex]
      ? points[activeIndex]
      : points[points.length - 1];

  const yTicks = [minY, round1(minY + spanY / 2), maxY];

  return (
    <section className="rounded-3xl border border-slate-200/80 bg-white/95 p-4 shadow-sm sm:p-5 dark:border-slate-800/90 dark:bg-slate-900/90">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
            Vývoj obvodu pasu (cm)
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Přímý ukazatel úbytku viscerálního tuku
            {healthyThresholdCm !== null
              ? ` · zdravé pásmo pod ${formatNumCs(healthyThresholdCm)} cm`
              : ""}
          </p>
        </div>

        <div className="rounded-2xl bg-violet-500/10 px-3 py-1.5 text-right text-xs tabular-nums">
          <div className="font-bold text-slate-900 dark:text-white">
            {formatShortDateCs(inspected.date)}:{" "}
            <span className="text-violet-600 dark:text-violet-400">
              {formatNumCs(inspected.waistCm)} cm
            </span>
          </div>
        </div>
      </div>

      <div className="mt-3">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-48 w-full overflow-visible select-none"
          onMouseLeave={() => onSelectIndex(null)}
        >
          <defs>
            <linearGradient id="waistTrendFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0.01" />
            </linearGradient>
          </defs>

          {yTicks.map((tick) => {
            const y = getY(tick);
            return (
              <g key={tick}>
                <line
                  x1={pad.left}
                  y1={y}
                  x2={W - pad.right}
                  y2={y}
                  stroke="currentColor"
                  className="text-slate-200 dark:text-slate-800"
                  strokeWidth="1"
                />
                <text
                  x={pad.left - 8}
                  y={y + 4}
                  textAnchor="end"
                  className="fill-slate-400 text-[11px] font-medium tabular-nums"
                >
                  {formatNumCs(tick)}
                </text>
              </g>
            );
          })}

          {showHealthyLine && healthyThresholdCm !== null && (
            <g>
              <line
                x1={pad.left}
                y1={getY(healthyThresholdCm)}
                x2={W - pad.right}
                y2={getY(healthyThresholdCm)}
                stroke="#10b981"
                strokeWidth="1.5"
                strokeDasharray="5 4"
              />
              <text
                x={W - pad.right}
                y={getY(healthyThresholdCm) - 5}
                textAnchor="end"
                className="fill-emerald-600 text-[10px] font-bold dark:fill-emerald-400"
              >
                Zdravý pas {formatNumCs(healthyThresholdCm)} cm
              </text>
            </g>
          )}

          {areaPath && <path d={areaPath} fill="url(#waistTrendFill)" />}

          {points.length >= 2 && (
            <path
              d={linePath}
              fill="none"
              stroke="#8b5cf6"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {points.map((p, idx) => {
            const cx = getX(idx);
            const cy = getY(p.waistCm);
            const isSelected =
              activeIndex === idx ||
              (activeIndex === null && idx === points.length - 1);
            return (
              <g
                key={p.date}
                className="cursor-pointer"
                onMouseEnter={() => onSelectIndex(idx)}
                onClick={() => onSelectIndex(idx)}
              >
                <circle
                  cx={cx}
                  cy={cy}
                  r={isSelected ? 5.5 : 4}
                  fill="#8b5cf6"
                  stroke="white"
                  strokeWidth="2"
                />
                <circle cx={cx} cy={cy} r={16} fill="transparent" />
              </g>
            );
          })}

          {points.length === 1 ? (
            <text
              x={getX(0)}
              y={H - 6}
              textAnchor="middle"
              className="fill-slate-400 text-[11px] font-medium"
            >
              {formatShortDateCs(points[0].date)}
            </text>
          ) : (
            <>
              <text
                x={pad.left}
                y={H - 6}
                textAnchor="start"
                className="fill-slate-400 text-[11px] font-medium"
              >
                {formatShortDateCs(firstDate)}
              </text>
              <text
                x={W - pad.right}
                y={H - 6}
                textAnchor="end"
                className="fill-slate-400 text-[11px] font-medium"
              >
                {formatShortDateCs(lastDate)}
              </text>
            </>
          )}
        </svg>
      </div>
    </section>
  );
}

/* ============================================================================
 * SVG CHART 3: Daily Energy Balance Bars (kJ or kcal)
 * ========================================================================== */
function EnergyBalanceChartCard({
  points,
  energyUnit,
  targetDeficitKcal,
  activeIndex,
  onSelectIndex,
}: {
  points: Array<{
    date: string;
    intakeKcal: number;
    burnedTotalKcal: number;
    netKcal: number;
    onTarget: boolean;
  }>;
  energyUnit: EnergyUnit;
  targetDeficitKcal: number;
  activeIndex: number | null;
  onSelectIndex: (idx: number | null) => void;
}) {
  const W = 600;
  const H = 210;
  const pad = { left: 58, right: 16, top: 18, bottom: 28 };
  const PW = W - pad.left - pad.right;
  const PH = H - pad.top - pad.bottom;

  if (points.length === 0) {
    return (
      <section className="rounded-3xl border border-dashed border-slate-300/80 bg-white/70 p-5 text-center dark:border-slate-800 dark:bg-slate-900/50">
        <Flame className="mx-auto h-6 w-6 text-amber-500" />
        <h3 className="mt-2 text-sm font-bold text-slate-900 dark:text-white">
          Graf denní energetické bilance
        </h3>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Zde uvidíš sloupce denního deficitu nebo přebytku za každý zapsaný den.
        </p>
      </section>
    );
  }

  const recentPoints = points.slice(-30);
  const netValsConverted = recentPoints.map((p) =>
    convertFromKcal(p.netKcal, energyUnit)
  );
  const targetConverted = convertFromKcal(targetDeficitKcal, energyUnit);
  const stepRound = energyUnit === "kj" ? 500 : 100;
  const padAmount = energyUnit === "kj" ? 600 : 150;

  const minVal = Math.min(0, targetConverted, ...netValsConverted);
  const maxVal = Math.max(
    energyUnit === "kj" ? 800 : 200,
    targetConverted,
    ...netValsConverted
  );
  const minY = Math.floor((minVal - padAmount) / stepRound) * stepRound;
  const maxY = Math.ceil((maxVal + padAmount) / stepRound) * stepRound;
  const spanY = Math.max(stepRound * 2, maxY - minY);

  const getY = (valConverted: number) =>
    pad.top + PH - ((valConverted - minY) / spanY) * PH;

  const zeroY = getY(0);
  const targetY = getY(targetConverted);

  const slotWidth = PW / recentPoints.length;
  const barWidth = Math.min(28, Math.max(6, slotWidth * 0.68));

  const inspected =
    activeIndex !== null && recentPoints[activeIndex]
      ? recentPoints[activeIndex]
      : recentPoints[recentPoints.length - 1];

  return (
    <section className="rounded-3xl border border-slate-200/80 bg-white/95 p-4 shadow-sm sm:p-5 dark:border-slate-800/90 dark:bg-slate-900/90">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
            Energetická bilance po dnech (příjem − výdej)
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Zelené sloupce = splněný denní cíl (
            {formatEnergy(targetDeficitKcal, energyUnit, { signed: true })})
          </p>
        </div>

        <div className="rounded-2xl bg-slate-100 px-3 py-1.5 text-right text-xs tabular-nums dark:bg-slate-800">
          <div className="font-bold text-slate-900 dark:text-white">
            {formatShortDateCs(inspected.date)}:{" "}
            <span
              className={
                inspected.onTarget
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-amber-600 dark:text-amber-400"
              }
            >
              {formatEnergy(inspected.netKcal, energyUnit, { signed: true })}
            </span>
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400">
            Příjem {formatEnergyValue(inspected.intakeKcal, energyUnit)} · Výdej{" "}
            {formatEnergyValue(inspected.burnedTotalKcal, energyUnit)}
          </div>
        </div>
      </div>

      <div className="mt-3">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-48 w-full overflow-visible select-none"
          onMouseLeave={() => onSelectIndex(null)}
        >
          {/* Zero Line */}
          <line
            x1={pad.left}
            y1={zeroY}
            x2={W - pad.right}
            y2={zeroY}
            stroke="currentColor"
            className="text-slate-300 dark:text-slate-700"
            strokeWidth="1.5"
          />
          <text
            x={pad.left - 8}
            y={zeroY + 4}
            textAnchor="end"
            className="fill-slate-400 text-[11px] font-semibold tabular-nums"
          >
            0
          </text>

          {/* Target Deficit Line */}
          {targetDeficitKcal !== 0 && (
            <g>
              <line
                x1={pad.left}
                y1={targetY}
                x2={W - pad.right}
                y2={targetY}
                stroke="#10b981"
                strokeWidth="1.25"
                strokeDasharray="4 4"
              />
              <text
                x={pad.left - 8}
                y={targetY + 4}
                textAnchor="end"
                className="fill-emerald-600 text-[10px] font-bold tabular-nums dark:fill-emerald-400"
              >
                {formatEnergyValue(targetDeficitKcal, energyUnit)}
              </text>
            </g>
          )}

          {/* Bars */}
          {recentPoints.map((p, idx) => {
            const x = pad.left + idx * slotWidth + (slotWidth - barWidth) / 2;
            const convertedVal = convertFromKcal(p.netKcal, energyUnit);
            const yVal = getY(convertedVal);
            const top = Math.min(zeroY, yVal);
            const height = Math.max(3, Math.abs(yVal - zeroY));
            const isSelected =
              activeIndex === idx ||
              (activeIndex === null && idx === recentPoints.length - 1);

            return (
              <g
                key={p.date}
                className="cursor-pointer"
                onMouseEnter={() => onSelectIndex(idx)}
                onClick={() => onSelectIndex(idx)}
              >
                <rect
                  x={x}
                  y={top}
                  width={barWidth}
                  height={height}
                  rx={4}
                  fill={p.onTarget ? "#10b981" : "#f59e0b"}
                  opacity={isSelected ? 1 : 0.78}
                />
                <rect
                  x={pad.left + idx * slotWidth}
                  y={pad.top}
                  width={slotWidth}
                  height={PH}
                  fill="transparent"
                />
              </g>
            );
          })}

          <text
            x={pad.left}
            y={H - 6}
            textAnchor="start"
            className="fill-slate-400 text-[11px] font-medium"
          >
            {formatShortDateCs(recentPoints[0].date)}
          </text>
          {recentPoints.length > 1 && (
            <text
              x={W - pad.right}
              y={H - 6}
              textAnchor="end"
              className="fill-slate-400 text-[11px] font-medium"
            >
              {formatShortDateCs(recentPoints[recentPoints.length - 1].date)}
            </text>
          )}
        </svg>
      </div>
    </section>
  );
}

/* ============================================================================
 * SVG CHART: Blood Pressure (SYS/DIA) & Pulse
 * ========================================================================== */
function BloodPressureChartCard({
  stats,
  activeIndex,
  onSelectIndex,
}: {
  stats: BloodPressureStatsSummary;
  activeIndex: number | null;
  onSelectIndex: (idx: number | null) => void;
}) {
  const W = 600;
  const H = 220;
  const pad = { left: 46, right: 18, top: 18, bottom: 28 };
  const PW = W - pad.left - pad.right;
  const PH = H - pad.top - pad.bottom;

  if (stats.points.length === 0) {
    return (
      <section className="rounded-3xl border border-dashed border-slate-300/80 bg-white/70 p-5 text-center dark:border-slate-800 dark:bg-slate-900/50">
        <Heart className="mx-auto h-6 w-6 text-rose-500" />
        <h3 className="mt-2 text-sm font-bold text-slate-900 dark:text-white">
          Krevní tlak a kardiovaskulární zdraví
        </h3>
        <p className="mt-1 mx-auto max-w-md text-xs text-slate-500 dark:text-slate-400">
          Zapiš si své první měření tlaku (např. textem „tlak 125/82 tep 70“, vyfocením tlakoměru 📷 nebo ve formuláři nahoře).
          Pravidelné sledování ukáže, jak úbytek hmotnosti snižuje zátěž na cévy a srdce.
        </p>
        <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5 text-[11px]">
          <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 font-bold text-emerald-800 dark:text-emerald-200">
            &lt; 120/80 Optimální
          </span>
          <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 font-bold text-emerald-700 dark:text-emerald-300">
            120–129 / 80–84 Normální
          </span>
          <span className="rounded-full bg-yellow-500/15 px-2.5 py-0.5 font-bold text-yellow-800 dark:text-yellow-200">
            130–139 / 85–89 Vyšší normální
          </span>
          <span className="rounded-full bg-amber-500/15 px-2.5 py-0.5 font-bold text-amber-800 dark:text-amber-200">
            ≥ 140/90 Hypertenze
          </span>
        </div>
      </section>
    );
  }

  const { points } = stats;
  const sysVals = points.map((p) => p.sys);
  const diaVals = points.map((p) => p.dia);
  const rawMin = Math.min(...diaVals);
  const rawMax = Math.max(...sysVals);

  // Ensure reference ticks 80 and 120 fit cleanly
  const minBase = Math.min(rawMin, 70);
  const maxBase = Math.max(rawMax, 135);
  const spread = Math.max(20, maxBase - minBase);
  const minY = Math.floor(minBase - spread * 0.15);
  const maxY = Math.ceil(maxBase + spread * 0.15);
  const spanY = Math.max(1, maxY - minY);

  const firstDate = points[0].date;
  const lastDate = points[points.length - 1].date;
  const totalDays = Math.max(1, daysBetweenUtc(firstDate, lastDate));

  const getX = (idx: number) => {
    if (points.length === 1) return pad.left + PW / 2;
    const d = daysBetweenUtc(firstDate, points[idx].date);
    return pad.left + (d / totalDays) * PW;
  };

  const getY = (val: number) => pad.top + PH - ((val - minY) / spanY) * PH;

  const sysLinePath = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${getX(i).toFixed(1)} ${getY(p.sys).toFixed(1)}`)
    .join(" ");

  const diaLinePath = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${getX(i).toFixed(1)} ${getY(p.dia).toFixed(1)}`)
    .join(" ");

  const inspected =
    activeIndex !== null && points[activeIndex]
      ? points[activeIndex]
      : points[points.length - 1];

  const inspectedCategory = getBloodPressureCategory(inspected.sys, inspected.dia);

  const yTicks = [
    Math.round(minY / 10) * 10,
    80,
    120,
    140,
    Math.round(maxY / 10) * 10,
  ].filter((v, i, arr) => v >= minY && v <= maxY && arr.indexOf(v) === i);

  return (
    <section className="rounded-3xl border border-slate-200/80 bg-white/95 p-4 shadow-sm sm:p-5 dark:border-slate-800/90 dark:bg-slate-900/90">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-rose-500/15 text-rose-600 dark:text-rose-400">
              <Heart className="h-3.5 w-3.5 fill-rose-500/20" />
            </span>
            <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
              Vývoj krevního tlaku a pulsu
            </h3>
          </div>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Červená = systolický (SYS) · Fialová = diastolický (DIA) · Zelené pásmo = optimální tlak (&lt; 120/80)
          </p>
        </div>

        <div className="rounded-2xl bg-slate-50 px-3 py-1.5 text-right text-xs tabular-nums dark:bg-slate-950/60">
          <div className="flex items-center justify-end gap-1.5 font-bold text-slate-900 dark:text-white">
            <span>{formatShortDateCs(inspected.date)}:</span>
            <span className="text-rose-600 dark:text-rose-400 font-extrabold">
              {inspected.sys}
            </span>
            <span className="text-slate-400">/</span>
            <span className="text-indigo-600 dark:text-indigo-400 font-extrabold">
              {inspected.dia}
            </span>
            <span className="text-[11px] font-normal text-slate-400">mmHg</span>
            {inspected.pulse !== null && (
              <span className="ml-1 text-slate-500 dark:text-slate-400 font-semibold">
                · {inspected.pulse} bpm
              </span>
            )}
          </div>
          <div className="mt-0.5">
            <span
              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${inspectedCategory.badgeClass}`}
            >
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: inspectedCategory.dotColor }}
              />
              {inspectedCategory.label}
            </span>
          </div>
        </div>
      </div>

      {/* KPI stats summary row */}
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-2.5 dark:border-slate-800 dark:bg-slate-950/40">
          <div className="text-[11px] font-medium text-slate-400">Poslední měření</div>
          <div className="mt-0.5 text-sm font-extrabold tabular-nums text-slate-900 dark:text-white">
            {stats.latestSys}/{stats.latestDia} <span className="text-[10px] font-normal text-slate-400">mmHg</span>
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-2.5 dark:border-slate-800 dark:bg-slate-950/40">
          <div className="text-[11px] font-medium text-slate-400">7denní průměr</div>
          <div className="mt-0.5 text-sm font-extrabold tabular-nums text-emerald-600 dark:text-emerald-400">
            {stats.avg7dSys}/{stats.avg7dDia}{" "}
            <span className="text-[10px] font-normal text-slate-400">mmHg</span>
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-2.5 dark:border-slate-800 dark:bg-slate-950/40">
          <div className="text-[11px] font-medium text-slate-400">Tep (průměr 7d)</div>
          <div className="mt-0.5 text-sm font-extrabold tabular-nums text-slate-900 dark:text-white">
            {stats.avg7dPulse !== null ? `${stats.avg7dPulse} bpm` : "—"}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-2.5 dark:border-slate-800 dark:bg-slate-950/40">
          <div className="text-[11px] font-medium text-slate-400">Změna od startu</div>
          <div className="mt-0.5 text-xs font-bold tabular-nums text-slate-800 dark:text-slate-200">
            {stats.deltaFromStartSys !== null ? (
              <span>
                SYS {stats.deltaFromStartSys <= 0 ? "" : "+"}
                {stats.deltaFromStartSys} · DIA{" "}
                {stats.deltaFromStartDia !== null && stats.deltaFromStartDia <= 0
                  ? ""
                  : "+"}
                {stats.deltaFromStartDia}
              </span>
            ) : (
              "—"
            )}
          </div>
        </div>
      </div>

      {/* Weight correlation insight */}
      {stats.weightCorrelationInsight && (
        <div className="mt-3 flex items-start gap-2.5 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-950 dark:text-emerald-200">
          <Sparkles className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400 mt-0.5" />
          <p className="leading-relaxed">{stats.weightCorrelationInsight}</p>
        </div>
      )}

      {/* SVG Chart */}
      <div className="mt-3">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-52 w-full overflow-visible select-none"
          onMouseLeave={() => onSelectIndex(null)}
        >
          {/* Optimal Healthy Shaded Band (< 120 / < 80) */}
          {minY < 120 && (
            <rect
              x={pad.left}
              y={getY(Math.min(120, maxY))}
              width={PW}
              height={Math.max(0, getY(Math.max(80, minY)) - getY(Math.min(120, maxY)))}
              fill="#10b981"
              opacity="0.08"
            />
          )}

          {/* Reference Line for Hypertension SYS = 140 */}
          {maxY >= 140 && minY <= 140 && (
            <g>
              <line
                x1={pad.left}
                y1={getY(140)}
                x2={W - pad.right}
                y2={getY(140)}
                stroke="#f43f5e"
                strokeWidth="1"
                strokeDasharray="4 3"
                opacity="0.6"
              />
              <text
                x={W - pad.right}
                y={getY(140) - 3}
                textAnchor="end"
                className="fill-rose-500 text-[9px] font-bold"
              >
                Hranice hypertenze (140)
              </text>
            </g>
          )}

          {/* Y ticks & grid lines */}
          {yTicks.map((tick) => {
            const y = getY(tick);
            return (
              <g key={tick}>
                <line
                  x1={pad.left}
                  y1={y}
                  x2={W - pad.right}
                  y2={y}
                  stroke="currentColor"
                  className="text-slate-200 dark:text-slate-800"
                  strokeWidth="1"
                />
                <text
                  x={pad.left - 8}
                  y={y + 4}
                  textAnchor="end"
                  className="fill-slate-400 text-[10px] font-medium tabular-nums"
                >
                  {tick}
                </text>
              </g>
            );
          })}

          {/* Diastolic Line (Indigo) */}
          {points.length >= 2 && (
            <path
              d={diaLinePath}
              fill="none"
              stroke="#6366f1"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* Systolic Line (Rose) */}
          {points.length >= 2 && (
            <path
              d={sysLinePath}
              fill="none"
              stroke="#f43f5e"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* Interactive Inspection Columns & Dots */}
          {points.map((p, idx) => {
            const cx = getX(idx);
            const cySys = getY(p.sys);
            const cyDia = getY(p.dia);
            const isSelected =
              activeIndex === idx ||
              (activeIndex === null && idx === points.length - 1);

            return (
              <g
                key={p.date}
                className="cursor-pointer"
                onMouseEnter={() => onSelectIndex(idx)}
                onClick={() => onSelectIndex(idx)}
              >
                {isSelected && (
                  <line
                    x1={cx}
                    y1={pad.top}
                    x2={cx}
                    y2={pad.top + PH}
                    stroke="currentColor"
                    className="text-slate-400/50 dark:text-slate-600/50"
                    strokeWidth="1"
                    strokeDasharray="2 2"
                  />
                )}
                {/* SYS Dot */}
                <circle
                  cx={cx}
                  cy={cySys}
                  r={isSelected ? 5.5 : 4}
                  fill="#f43f5e"
                  stroke="white"
                  strokeWidth="2"
                />
                {/* DIA Dot */}
                <circle
                  cx={cx}
                  cy={cyDia}
                  r={isSelected ? 5.5 : 4}
                  fill="#6366f1"
                  stroke="white"
                  strokeWidth="2"
                />
                {/* Wide invisible click/hover target */}
                <circle cx={cx} cy={(cySys + cyDia) / 2} r={18} fill="transparent" />
              </g>
            );
          })}

          {/* Dates on X axis */}
          {points.length === 1 ? (
            <text
              x={getX(0)}
              y={H - 6}
              textAnchor="middle"
              className="fill-slate-400 text-[11px] font-medium"
            >
              {formatShortDateCs(points[0].date)}
            </text>
          ) : (
            <>
              <text
                x={pad.left}
                y={H - 6}
                textAnchor="start"
                className="fill-slate-400 text-[11px] font-medium"
              >
                {formatShortDateCs(firstDate)}
              </text>
              <text
                x={W - pad.right}
                y={H - 6}
                textAnchor="end"
                className="fill-slate-400 text-[11px] font-medium"
              >
                {formatShortDateCs(lastDate)}
              </text>
            </>
          )}
        </svg>
      </div>

      {/* Legend */}
      <div className="mt-2 flex flex-wrap items-center justify-center gap-4 text-[11px] text-slate-500 dark:text-slate-400">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-rose-500" />
          Systolický (SYS)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-indigo-500" />
          Diastolický (DIA)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-4 rounded-sm bg-emerald-500/20" />
          Optimální pásmo (&lt; 120/80)
        </span>
      </div>
    </section>
  );
}
