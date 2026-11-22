"use client";

import { ArrowRight, Check, Flame } from "lucide-react";
import type { EnergyUnit } from "@/lib/types";
import { formatEnergy } from "@/lib/calculations";
import {
  KCAL_PER_KG_FAT,
  type CalorieBalanceStatsSummary,
  type FatVsWeightInsight,
} from "@/lib/progress-stats";
import { MetricTooltip } from "../MetricTooltip";
import {
  daysBetweenUtc,
  FAT_MILESTONES_KG,
  formatNumCs,
  formatShortDateCs,
  formatSignedNumCs,
  round1,
} from "./chart-utils";

interface BurnedFatHeroChartCardProps {
  stats: CalorieBalanceStatsSummary;
  energyUnit: EnergyUnit;
  weeklyPaceKg: number | null;
  fatVsWeightInsight: FatVsWeightInsight | null;
  activeIndex: number | null;
  onSelectIndex: (idx: number | null) => void;
  onOpenLogTab: () => void;
}

export function BurnedFatHeroChartCard({
  stats,
  energyUnit,
  weeklyPaceKg,
  fatVsWeightInsight,
  activeIndex,
  onSelectIndex,
  onOpenLogTab,
}: BurnedFatHeroChartCardProps) {
  const { points, totalNetKcal, burnedFatKg, burnedFatGrams, loggedDaysCount } = stats;

  if (points.length === 0) {
    return (
      <section className="rounded-3xl border border-emerald-500/25 bg-gradient-to-br from-emerald-500/8 via-white to-teal-500/5 p-5 text-center shadow-sm dark:border-emerald-500/20 dark:from-emerald-950/25 dark:via-slate-900 dark:to-slate-900">
        <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
          <Flame className="h-5 w-5" />
        </span>
        <h3 className="mt-2.5 text-sm font-extrabold text-slate-900 dark:text-white">
          Kumulativní spálený tuk v čase
        </h3>
        <p className="mx-auto mt-1 max-w-md text-xs text-slate-500 dark:text-slate-400">
          {stats.todayExcludedAsIncomplete
            ? "Dnešní den ještě probíhá — jakmile zapíšeš hlavní jídla dne, spočítá se celkový deficit i spálený tuk."
            : `Jakmile zapíšeš celý den jídel, uvidíš tady křivku spáleného tuku (1 kg ≈ ${energyUnit === "kj" ? "32 200 kJ" : "7 700 kcal"}).`}
        </p>
        <button
          type="button"
          onClick={onOpenLogTab}
          className="mt-3.5 inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white shadow-xs transition hover:bg-emerald-700 active:scale-95"
        >
          <span>Zapsat jídla na stránce Zápis</span>
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </section>
    );
  }

  const W = 600;
  const H = 220;
  const pad = { left: 58, right: 18, top: 18, bottom: 28 };
  const PW = W - pad.left - pad.right;
  const PH = H - pad.top - pad.bottom;

  const inspected =
    activeIndex !== null && points[activeIndex]
      ? points[activeIndex]
      : points[points.length - 1];

  const cumFatVals = points.map((p) => p.cumulativeFatKg);
  const cumMinRaw = Math.min(0, ...cumFatVals);
  const cumMaxRaw = Math.max(0.1, ...cumFatVals);
  const cumSpread = Math.max(0.4, cumMaxRaw - cumMinRaw);
  const cumMinY = Math.floor((cumMinRaw - cumSpread * 0.18) * 10) / 10;
  const cumMaxY = Math.ceil((cumMaxRaw + cumSpread * 0.15) * 10) / 10;
  const cumSpanY = Math.max(0.2, cumMaxY - cumMinY);

  const firstDate = points[0].date;
  const lastDate = points[points.length - 1].date;
  const totalDays = Math.max(1, daysBetweenUtc(firstDate, lastDate));

  const getX = (idx: number) => {
    if (points.length === 1) return pad.left + PW / 2;
    const d = daysBetweenUtc(firstDate, points[idx].date);
    return pad.left + (d / totalDays) * PW;
  };
  const getY = (fatKg: number) =>
    pad.top + PH - ((fatKg - cumMinY) / cumSpanY) * PH;

  const zeroY = getY(0);
  const linePath = points
    .map(
      (p, i) =>
        `${i === 0 ? "M" : "L"} ${getX(i).toFixed(1)} ${getY(p.cumulativeFatKg).toFixed(1)}`
    )
    .join(" ");
  const areaPath =
    points.length >= 2
      ? `${linePath} L ${getX(points.length - 1).toFixed(1)} ${zeroY.toFixed(1)} L ${getX(0).toFixed(1)} ${zeroY.toFixed(1)} Z`
      : "";

  const yTicks = [
    round1(cumMinY),
    0,
    round1((cumMinY + cumMaxY) / 2),
  ].filter((v, i, arr) => v >= cumMinY && v <= cumMaxY && arr.indexOf(v) === i);

  // Milestones calculation (positive burned fat in kg when totalNetKcal < 0)
  const burnedPositiveKg = Math.max(0, round1(-burnedFatKg * 10) / 10);
  const nextMilestoneKg =
    FAT_MILESTONES_KG.find((m) => m > burnedPositiveKg) ?? null;
  const remainingToNextMilestoneKg =
    nextMilestoneKg !== null
      ? Math.max(0, Math.round((nextMilestoneKg - burnedPositiveKg) * 100) / 100)
      : null;
  const remainingToNextMilestoneKcal =
    remainingToNextMilestoneKg !== null
      ? Math.round(remainingToNextMilestoneKg * KCAL_PER_KG_FAT)
      : null;

  return (
    <section className="rounded-3xl border border-emerald-500/25 bg-gradient-to-br from-emerald-500/8 via-white to-teal-500/5 p-4 shadow-sm sm:p-5 dark:border-emerald-500/20 dark:from-emerald-950/25 dark:via-slate-900 dark:to-slate-900">
      {/* Header + Inspection Pill */}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
              <Flame className="h-3.5 w-3.5" />
            </span>
            <MetricTooltip
              title="Spálený tuk z celkového deficitu"
              description={`Každých ${energyUnit === "kj" ? "32 200 kJ (7 700 kcal)" : "7 700 kcal (32 200 kJ)"} celkového kalorického deficitu odpovídá přibližně 1 kg čisté tukové tkáně. Počítáno pouze z věrohodně zapsaných dnů, aby neúplné dny nebo rozjedený dnešek výsledek nezkreslovaly.`}
              formula={`${formatEnergy(totalNetKcal, energyUnit, { signed: true })} ÷ ${energyUnit === "kj" ? "32 200 kJ" : "7 700 kcal"} = ${burnedFatKg <= 0 ? "−" : "+"}${formatNumCs(Math.abs(burnedFatKg), 2)} kg tuku`}
              className="text-sm font-extrabold text-slate-900 dark:text-white"
            >
              Spálený tuk v čase
            </MetricTooltip>
          </div>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Kumulativní úbytek tuku z {loggedDaysCount}{" "}
            {loggedDaysCount === 1
              ? "zapsaného dne"
              : loggedDaysCount < 5
                ? "zapsaných dnů"
                : "zapsaných dnů"}{" "}
            (1 kg ≈ {energyUnit === "kj" ? "32 200 kJ" : "7 700 kcal"})
          </p>
        </div>

        <div className="rounded-2xl bg-white/80 px-3 py-1.5 text-right text-xs tabular-nums shadow-2xs ring-1 ring-emerald-500/15 dark:bg-slate-900/80 dark:ring-emerald-500/20">
          <div className="font-bold text-slate-900 dark:text-white">
            Do {formatShortDateCs(inspected.date)}:{" "}
            <span
              className={
                inspected.cumulativeFatKg <= 0
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-amber-600 dark:text-amber-400"
              }
            >
              {inspected.cumulativeFatKg < 0
                ? "−"
                : inspected.cumulativeFatKg > 0
                  ? "+"
                  : ""}
              {formatNumCs(Math.abs(inspected.cumulativeFatKg), 2)} kg tuku
            </span>
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400">
            Celkem{" "}
            {formatEnergy(inspected.cumulativeNetKcal, energyUnit, {
              signed: true,
            })}{" "}
            (ten den{" "}
            {formatEnergy(inspected.netKcal, energyUnit, { signed: true })})
          </div>
        </div>
      </div>

      {/* Integrated Hero KPI Strip */}
      <div className="mt-3.5 grid grid-cols-2 gap-x-4 gap-y-2 border-y border-emerald-500/15 py-3 sm:grid-cols-3 dark:border-emerald-500/15">
        <div className="col-span-2 sm:col-span-1">
          <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
            Celkem spáleno
          </div>
          <div className="mt-0.5 flex items-baseline gap-1.5">
            <span
              className={`text-xl font-extrabold tabular-nums tracking-tight sm:text-2xl ${
                burnedFatKg <= 0
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-amber-600 dark:text-amber-400"
              }`}
            >
              {burnedFatKg < 0 ? "−" : burnedFatKg > 0 ? "+" : ""}
              {formatNumCs(Math.abs(burnedFatKg), 2)} kg
            </span>
            {Math.abs(burnedFatKg) > 0 && Math.abs(burnedFatKg) < 1 && (
              <span className="text-xs font-bold tabular-nums text-slate-500 dark:text-slate-400">
                ({burnedFatGrams < 0 ? "−" : "+"}
                {Math.abs(burnedFatGrams)} g)
              </span>
            )}
          </div>
        </div>

        <div>
          <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
            Celkový deficit
          </div>
          <div className="mt-0.5 text-base font-extrabold tabular-nums text-slate-900 dark:text-white">
            {formatEnergy(totalNetKcal, energyUnit, { signed: true })}
          </div>
        </div>

        <div>
          <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
            Průměrné tempo
          </div>
          <div className="mt-0.5 text-base font-extrabold tabular-nums text-slate-900 dark:text-white">
            {weeklyPaceKg !== null
              ? `${formatSignedNumCs(weeklyPaceKg, "kg")}/týd.`
              : "—"}
          </div>
          {stats.avgNetKcal !== null && (
            <div className="text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
              {formatEnergy(stats.avgNetKcal, energyUnit, { signed: true })}/den
            </div>
          )}
        </div>
      </div>

      {/* SVG Cumulative Fat Curve */}
      <div className="mt-3">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-52 w-full overflow-visible select-none"
          onMouseLeave={() => onSelectIndex(null)}
        >
          <defs>
            <linearGradient id="cumFatFillHero" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10b981" stopOpacity="0.04" />
              <stop offset="100%" stopColor="#10b981" stopOpacity="0.28" />
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
                  className={
                    tick === 0
                      ? "text-slate-300 dark:text-slate-700"
                      : "text-slate-200 dark:text-slate-800"
                  }
                  strokeWidth={tick === 0 ? "1.5" : "1"}
                />
                <text
                  x={pad.left - 8}
                  y={y + 4}
                  textAnchor="end"
                  className="fill-slate-400 text-[10px] font-semibold tabular-nums"
                >
                  {tick < 0
                    ? `−${formatNumCs(Math.abs(tick))} kg`
                    : tick > 0
                      ? `+${formatNumCs(tick)} kg`
                      : "0 kg"}
                </text>
              </g>
            );
          })}

          {areaPath && <path d={areaPath} fill="url(#cumFatFillHero)" />}

          {points.length >= 2 && (
            <path
              d={linePath}
              fill="none"
              stroke="#10b981"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {points.map((p, idx) => {
            const cx = getX(idx);
            const cy = getY(p.cumulativeFatKg);
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
                    className="text-emerald-500/40"
                    strokeWidth="1"
                    strokeDasharray="2 2"
                  />
                )}
                <circle
                  cx={cx}
                  cy={cy}
                  r={isSelected ? 5.5 : points.length > 40 ? 2.5 : 3.5}
                  fill={p.cumulativeFatKg <= 0 ? "#10b981" : "#f59e0b"}
                  stroke="white"
                  strokeWidth={points.length > 40 && !isSelected ? "1" : "2"}
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

      {/* Incomplete-day footnote if relevant */}
      {(stats.todayExcludedAsIncomplete ||
        stats.excludedIncompleteDaysCount > 0) && (
        <div className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
          {stats.todayExcludedAsIncomplete
            ? "Probíhající dnešek se započte po zapsání hlavních jídel."
            : `Vynecháno ${stats.excludedIncompleteDaysCount} neúplných dnů, aby nezkreslovaly deficit.`}
        </div>
      )}

      {/* Fat-Loss Milestones Bar */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-emerald-500/15 pt-3 text-xs">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
            Milníky tuku:
          </span>
          {FAT_MILESTONES_KG.map((m) => {
            const achieved = burnedPositiveKg >= m;
            return (
              <span
                key={m}
                className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-bold tabular-nums ${
                  achieved
                    ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                    : "border-slate-200/80 bg-white/70 text-slate-400 dark:border-slate-800 dark:bg-slate-950/50 dark:text-slate-500"
                }`}
              >
                {achieved && <Check className="h-2.5 w-2.5 stroke-[3]" />}
                −{String(m).replace(".", ",")} kg
              </span>
            );
          })}
        </div>

        {nextMilestoneKg !== null &&
          remainingToNextMilestoneKg !== null &&
          remainingToNextMilestoneKcal !== null && (
            <span className="text-[11px] text-slate-500 dark:text-slate-400">
              Do milníku{" "}
              <strong className="text-slate-700 dark:text-slate-200">
                −{String(nextMilestoneKg).replace(".", ",")} kg
              </strong>{" "}
              zbývá{" "}
              <strong className="text-emerald-600 dark:text-emerald-400">
                {formatNumCs(remainingToNextMilestoneKg, 2)} kg
              </strong>{" "}
              (≈ {formatEnergy(remainingToNextMilestoneKcal, energyUnit)})
            </span>
          )}
      </div>

      {/* Contextual Fat vs. Scale Weight Comparison Insight */}
      {fatVsWeightInsight && (
        <div
          className={`mt-3 flex items-start gap-2.5 rounded-2xl border p-3 text-xs leading-relaxed ${
            fatVsWeightInsight.tone === "emerald"
              ? "border-emerald-500/30 bg-emerald-500/10 text-slate-800 dark:text-slate-200"
              : fatVsWeightInsight.tone === "sky"
                ? "border-sky-500/30 bg-sky-500/10 text-slate-800 dark:text-slate-200"
                : "border-teal-500/30 bg-teal-500/10 text-slate-800 dark:text-slate-200"
          }`}
        >
          <Flame
            className={`mt-0.5 h-4 w-4 shrink-0 ${
              fatVsWeightInsight.tone === "emerald"
                ? "text-emerald-600 dark:text-emerald-400"
                : fatVsWeightInsight.tone === "sky"
                  ? "text-sky-600 dark:text-sky-400"
                  : "text-teal-600 dark:text-teal-400"
            }`}
          />
          <div>
            <strong className="font-bold text-slate-900 dark:text-white">
              {fatVsWeightInsight.title}:{" "}
            </strong>
            <span>{fatVsWeightInsight.body}</span>
          </div>
        </div>
      )}
    </section>
  );
}
