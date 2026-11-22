"use client";

import { ArrowRight, BarChart3 } from "lucide-react";
import type { EnergyUnit } from "@/lib/types";
import {
  convertFromKcal,
  formatEnergy,
  formatEnergyValue,
} from "@/lib/calculations";
import type { CalorieBalanceStatsSummary } from "@/lib/progress-stats";
import { formatShortDateCs } from "./chart-utils";

interface DailyDeficitBarsChartCardProps {
  stats: CalorieBalanceStatsSummary;
  energyUnit: EnergyUnit;
  targetDeficitKcal: number;
  activeIndex: number | null;
  onSelectIndex: (idx: number | null) => void;
  onOpenLogTab: () => void;
}

export function DailyDeficitBarsChartCard({
  stats,
  energyUnit,
  targetDeficitKcal,
  activeIndex,
  onSelectIndex,
  onOpenLogTab,
}: DailyDeficitBarsChartCardProps) {
  const { points, daysOnTargetCount, loggedDaysCount, avgNetKcal } = stats;

  if (points.length === 0) {
    return (
      <section className="rounded-3xl border border-dashed border-slate-300/80 bg-white/70 p-5 text-center dark:border-slate-800 dark:bg-slate-900/50">
        <BarChart3 className="mx-auto h-6 w-6 text-emerald-500" />
        <h3 className="mt-2 text-sm font-bold text-slate-900 dark:text-white">
          Denní energetická bilance
        </h3>
        <p className="mx-auto mt-1 max-w-md text-xs text-slate-500 dark:text-slate-400">
          Sloupcový přehled, jak se ti každý den daří plnit cílový deficit.
        </p>
        <button
          type="button"
          onClick={onOpenLogTab}
          className="mt-3 inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/35 bg-emerald-500/10 px-3 py-1.5 text-xs font-bold text-emerald-700 transition hover:bg-emerald-500/20 dark:text-emerald-300"
        >
          <span>Zapsat na stránce Zápis</span>
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </section>
    );
  }

  const W = 600;
  const H = 200;
  const pad = { left: 58, right: 16, top: 18, bottom: 28 };
  const PW = W - pad.left - pad.right;
  const PH = H - pad.top - pad.bottom;

  const inspected =
    activeIndex !== null && points[activeIndex]
      ? points[activeIndex]
      : points[points.length - 1];

  const netValsConverted = points.map((p) => convertFromKcal(p.netKcal, energyUnit));
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

  const getDailyY = (valConverted: number) =>
    pad.top + PH - ((valConverted - minY) / spanY) * PH;

  const zeroY = getDailyY(0);
  const targetY = getDailyY(targetConverted);

  const slotWidth = PW / points.length;
  const barWidth = Math.min(28, Math.max(3, slotWidth * 0.68));
  const onTargetPct =
    loggedDaysCount > 0 ? Math.round((daysOnTargetCount / loggedDaysCount) * 100) : 0;

  return (
    <section className="rounded-3xl border border-slate-200/80 bg-white/95 p-4 shadow-sm sm:p-5 dark:border-slate-800/90 dark:bg-slate-900/90">
      {/* Header + Inspection Pill */}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
              <BarChart3 className="h-3.5 w-3.5" />
            </span>
            <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
              Denní energetická bilance (příjem − výdej)
            </h3>
          </div>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Zelené sloupce = splněný denní cíl (
            {formatEnergy(targetDeficitKcal, energyUnit, { signed: true })})
          </p>
        </div>

        <div className="rounded-2xl bg-slate-100 px-3 py-1.5 text-right text-xs tabular-nums dark:bg-slate-800/90">
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
            {inspected.onTarget ? "✓ V cíli" : "Mimo cíl"} · Příjem{" "}
            {formatEnergyValue(inspected.intakeKcal, energyUnit)} · Výdej{" "}
            {formatEnergyValue(inspected.burnedTotalKcal, energyUnit)}
          </div>
        </div>
      </div>

      {/* Integrated Compact KPI Strip */}
      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 border-y border-slate-200/70 py-2.5 sm:grid-cols-3 dark:border-slate-800">
        <div>
          <div className="text-[11px] font-medium text-slate-400">Dnů v cíli</div>
          <div className="mt-0.5 text-sm font-extrabold tabular-nums text-emerald-600 dark:text-emerald-400">
            {daysOnTargetCount}/{loggedDaysCount}{" "}
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              ({onTargetPct} %)
            </span>
          </div>
        </div>
        <div>
          <div className="text-[11px] font-medium text-slate-400">
            Průměrná bilance
          </div>
          <div className="mt-0.5 text-sm font-extrabold tabular-nums text-slate-900 dark:text-white">
            {avgNetKcal !== null
              ? `${formatEnergy(avgNetKcal, energyUnit, { signed: true })}/den`
              : "—"}
          </div>
        </div>
        <div className="col-span-2 sm:col-span-1">
          <div className="text-[11px] font-medium text-slate-400">Denní cíl</div>
          <div className="mt-0.5 text-sm font-extrabold tabular-nums text-slate-900 dark:text-white">
            {formatEnergy(targetDeficitKcal, energyUnit, { signed: true })}/den
          </div>
        </div>
      </div>

      {/* SVG Bars */}
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
          {points.map((p, idx) => {
            const x = pad.left + idx * slotWidth + (slotWidth - barWidth) / 2;
            const convertedVal = convertFromKcal(p.netKcal, energyUnit);
            const yVal = getDailyY(convertedVal);
            const top = Math.min(zeroY, yVal);
            const height = Math.max(3, Math.abs(yVal - zeroY));
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
                  <rect
                    x={pad.left + idx * slotWidth}
                    y={pad.top}
                    width={slotWidth}
                    height={PH}
                    rx={4}
                    fill="currentColor"
                    className="text-slate-400/10 dark:text-slate-500/15"
                  />
                )}
                <rect
                  x={x}
                  y={top}
                  width={barWidth}
                  height={height}
                  rx={Math.min(4, barWidth / 2)}
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
            {formatShortDateCs(points[0].date)}
          </text>
          {points.length > 1 && (
            <text
              x={W - pad.right}
              y={H - 6}
              textAnchor="end"
              className="fill-slate-400 text-[11px] font-medium"
            >
              {formatShortDateCs(points[points.length - 1].date)}
            </text>
          )}
        </svg>
      </div>
    </section>
  );
}
