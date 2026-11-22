"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  History,
  Loader2,
  Sparkles,
  Trash2,
} from "lucide-react";
import type {
  BodyMeasurementRow,
  DailySummaryRow,
  EnergyUnit,
  UserProfileRow,
} from "@/lib/types";
import { getBloodPressureCategory } from "@/lib/types";
import {
  computeBloodPressureStats,
  computeFatVsWeightComparisonInsight,
  computeLoggedCalorieBalanceStats,
  computeWaistStats,
  computeWeightTrendSeries,
} from "@/lib/progress-stats";
import { safeFetchJson } from "@/lib/safe-fetch";
import { BurnedFatHeroChartCard } from "./progress/BurnedFatHeroChartCard";
import { EnergyIntakeVsBurnChartCard } from "./progress/EnergyIntakeVsBurnChartCard";
import { DailyDeficitBarsChartCard } from "./progress/DailyDeficitBarsChartCard";
import { WeightTrendChartCard } from "./progress/WeightTrendChartCard";
import { WaistTrendChartCard } from "./progress/WaistTrendChartCard";
import { BloodPressureChartCard } from "./progress/BloodPressureChartCard";
import {
  formatNumCs,
  formatShortDateCs,
  formatSignedNumCs,
  round1,
} from "./progress/chart-utils";

type PeriodOption = "7" | "30" | "90" | "all";

interface BodyProgressViewProps {
  profile: UserProfileRow | null;
  energyUnit: EnergyUnit;
  todayDate: string;
  refreshSignal: number;
  onMeasurementChanged: () => void;
  onOpenProfileSettings: () => void;
  onOpenLogTab: () => void;
}

const PERIOD_OPTIONS: Array<{ value: PeriodOption; label: string }> = [
  { value: "7", label: "7 dní" },
  { value: "30", label: "30 dní" },
  { value: "90", label: "90 dní" },
  { value: "all", label: "Vše" },
];

export function BodyProgressView({
  profile,
  energyUnit,
  todayDate,
  refreshSignal,
  onMeasurementChanged,
  onOpenProfileSettings,
  onOpenLogTab,
}: BodyProgressViewProps) {
  const [period, setPeriod] = useState<PeriodOption>("30");
  const [measurements, setMeasurements] = useState<BodyMeasurementRow[]>([]);
  const [dailySummaries, setDailySummaries] = useState<DailySummaryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  // Interactive chart hover/tap indices
  const [activeFatIdx, setActiveFatIdx] = useState<number | null>(null);
  const [activeIntakeBurnIdx, setActiveIntakeBurnIdx] = useState<number | null>(
    null
  );
  const [activeDailyIdx, setActiveDailyIdx] = useState<number | null>(null);
  const [activeWeightIdx, setActiveWeightIdx] = useState<number | null>(null);
  const [activeWaistIdx, setActiveWaistIdx] = useState<number | null>(null);
  const [activeBpIdx, setActiveBpIdx] = useState<number | null>(null);

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
    setActiveFatIdx(null);
    setActiveIntakeBurnIdx(null);
    setActiveDailyIdx(null);
    setActiveWeightIdx(null);
    setActiveWaistIdx(null);
    setActiveBpIdx(null);
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
        profile?.target_deficit_kcal ?? -500,
        { todayDate }
      ),
    [dailySummaries, profile?.target_deficit_kcal, todayDate]
  );

  const fatVsWeightInsight = useMemo(
    () =>
      computeFatVsWeightComparisonInsight({
        burnedFatKg: calorieStats.burnedFatKg,
        loggedDaysCount: calorieStats.loggedDaysCount,
        weightDeltaKg: weightStats.deltaFromStartKg,
        weightPointsCount: weightStats.points.length,
      }),
    [
      calorieStats.burnedFatKg,
      calorieStats.loggedDaysCount,
      weightStats.deltaFromStartKg,
      weightStats.points.length,
    ]
  );

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
      {/* 1. Top Period Selector Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <div className="flex items-center gap-1.5">
          <Sparkles className="h-4 w-4 text-emerald-500" />
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
            Přehled progresu
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

      {error && (
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-3.5 py-2.5 text-xs font-medium text-rose-700 dark:text-rose-200">
          {error}
        </div>
      )}

      {/* 2. HERO CHART: Cumulative Burned Fat Over Time */}
      <BurnedFatHeroChartCard
        stats={calorieStats}
        energyUnit={energyUnit}
        weeklyPaceKg={weeklyPaceKg}
        fatVsWeightInsight={fatVsWeightInsight}
        activeIndex={activeFatIdx}
        onSelectIndex={setActiveFatIdx}
        onOpenLogTab={onOpenLogTab}
      />

      {/* 3. NEW CHART: Energy Intake vs. Expenditure Line Chart */}
      <EnergyIntakeVsBurnChartCard
        stats={calorieStats}
        energyUnit={energyUnit}
        activeIndex={activeIntakeBurnIdx}
        onSelectIndex={setActiveIntakeBurnIdx}
        onOpenLogTab={onOpenLogTab}
      />

      {/* 4. STANDALONE CHART: Daily Energy Balance Bars */}
      <DailyDeficitBarsChartCard
        stats={calorieStats}
        energyUnit={energyUnit}
        targetDeficitKcal={profile?.target_deficit_kcal ?? -500}
        activeIndex={activeDailyIdx}
        onSelectIndex={setActiveDailyIdx}
        onOpenLogTab={onOpenLogTab}
      />

      {/* 5. Weight & 7-Day Moving Average */}
      <WeightTrendChartCard
        stats={weightStats}
        isWeightLossGoal={isWeightLossGoal}
        targetWeightKg={targetWeightKg}
        activeIndex={activeWeightIdx}
        onSelectIndex={setActiveWeightIdx}
        onOpenProfileSettings={onOpenProfileSettings}
        onOpenLogTab={onOpenLogTab}
      />

      {/* 6. Waist Circumference */}
      <WaistTrendChartCard
        stats={waistStats}
        healthyThresholdCm={healthyWaistThresholdCm}
        activeIndex={activeWaistIdx}
        onSelectIndex={setActiveWaistIdx}
        onOpenLogTab={onOpenLogTab}
      />

      {/* 7. Blood Pressure & Pulse */}
      <BloodPressureChartCard
        stats={bpStats}
        activeIndex={activeBpIdx}
        onSelectIndex={setActiveBpIdx}
        onOpenLogTab={onOpenLogTab}
      />

      {/* 8. Collapsible Measurement History Accordion (for review & deleting mistakes) */}
      {sortedHistoryDesc.length > 0 && (
        <section className="rounded-3xl border border-slate-200/80 bg-white/95 shadow-sm dark:border-slate-800/90 dark:bg-slate-900/90">
          <button
            type="button"
            onClick={() => setHistoryOpen((prev) => !prev)}
            aria-expanded={historyOpen}
            className="flex w-full items-center justify-between gap-2 px-4 py-3.5 text-left transition hover:bg-slate-50/70 sm:px-5 dark:hover:bg-slate-800/40 rounded-3xl"
          >
            <div className="flex items-center gap-2">
              <History className="h-4 w-4 text-slate-400" />
              <span className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                Historie měření ({sortedHistoryDesc.length})
              </span>
            </div>
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
              <span>{historyOpen ? "Skrýt" : "Zobrazit / smazat"}</span>
              {historyOpen ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </span>
          </button>

          {historyOpen && (
            <div className="border-t border-slate-200/70 px-4 pb-4 pt-1 sm:px-5 dark:border-slate-800">
              <div className="divide-y divide-slate-200/70 dark:divide-slate-800">
                {sortedHistoryDesc.slice(0, 30).map((row, idx) => {
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
            </div>
          )}
        </section>
      )}
    </div>
  );
}
